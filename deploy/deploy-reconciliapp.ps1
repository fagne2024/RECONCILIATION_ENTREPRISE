#Requires -RunAsAdministrator
<#
  Déploiement de ReconciliApp sur Windows Server
  - Backend : jar Spring Boot en service Windows (NSSM)
  - Frontend : site IIS + relais /api vers le port 8080

  Avant de lancer : installer JDK 17, MySQL 8, IIS (+ URL Rewrite + ARR) et copier nssm.exe.
  Lancer ensuite dans PowerShell (administrateur) :
      .\deploy-reconciliapp.ps1 -PublicUrl "http://172.172.193.32"
#>
param(
    [string]$JarPath      = "C:\reconciliation\backend\csv-reconciliation-1_0_0.jar",
    [string]$FrontendZip  = "C:\reconciliation\frontend.zip",
    [string]$SitePath     = "C:\inetpub\reconciliation",
    [string]$SiteName     = "ReconciliApp",
    [string]$ServiceName  = "ReconciliApp",
    [string]$NssmExe      = "C:\tools\nssm.exe",
    [string]$PublicUrl    = "http://172.172.193.32",
    [string]$DbUser       = "reconciliation",
    [string]$Xms          = "2g",
    [string]$Xmx          = "8g",
    [int]$BackendPort     = 8080
)

$ErrorActionPreference = "Stop"
function Etape($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }

# ---------- 1. Vérifications ----------
Etape "Vérification des prérequis"

$java = (Get-Command java.exe -ErrorAction SilentlyContinue).Source
if (-not $java) { throw "Java introuvable. Installez un JDK 17 puis rouvrez PowerShell." }
$ver = (& $java -version 2>&1 | Select-Object -First 1)
Write-Host "Java : $ver"
if ($ver -notmatch '"(17|18|19|2\d)') { throw "Java 17 ou plus est requis." }

if (-not (Test-Path $JarPath))     { throw "Jar introuvable : $JarPath" }
if (-not (Test-Path $FrontendZip)) { throw "frontend.zip introuvable : $FrontendZip" }
if (-not (Test-Path $NssmExe))     { throw "nssm.exe introuvable : $NssmExe" }
if (-not (Test-Path "$env:windir\System32\inetsrv\rewrite.dll")) {
    throw "Le module IIS URL Rewrite n'est pas installé."
}
if (-not (Test-Path "$env:ProgramFiles\IIS\Application Request Routing")) {
    throw "Le module IIS Application Request Routing (ARR) n'est pas installé."
}
if (-not (Get-Service MySQL* -ErrorAction SilentlyContinue)) {
    Write-Warning "Aucun service MySQL local détecté. Continuez seulement si la base est sur une autre machine."
}

# Le module PowerShell d'IIS (WebAdministration) doit être présent
if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
    throw "Module WebAdministration absent : activez la fonctionnalité IIS 'Outils de script et de gestion IIS'."
}

# Ports déjà utilisés ? (Burp Suite, par exemple, écoute par défaut sur 8080)
foreach ($port in 80, $BackendPort) {
    $occupe = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($occupe) {
        $pid_ = ($occupe | Select-Object -First 1).OwningProcess
        $nom  = (Get-Process -Id $pid_ -ErrorAction SilentlyContinue).ProcessName
        if ($port -eq 80 -and $nom -eq "System") {
            Write-Warning "Le port 80 est utilisé par IIS/HTTP.sys (normal si 'Default Web Site' tourne : il sera arrêté)."
        } else {
            throw "Le port $port est déjà utilisé par '$nom' (PID $pid_). Libérez-le ou relancez avec -BackendPort <autre port>."
        }
    }
}

# ---------- 2. Secrets (saisis ici, jamais écrits dans ce fichier) ----------
Etape "Saisie des mots de passe"
function LireSecret($invite) {
    $s = Read-Host $invite -AsSecureString
    return [System.Net.NetworkCredential]::new("", $s).Password
}
$dbPwd    = LireSecret "Mot de passe MySQL de l'utilisateur '$DbUser'"
$adminPwd = LireSecret "Mot de passe du compte administrateur initial (utilisateur 'superadmin')"

$octets = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
$jwtSecret = [Convert]::ToBase64String($octets)

# ---------- 3. Frontend ----------
Etape "Installation du frontend dans $SitePath"
$tmp = Join-Path $env:TEMP "reconciliapp-front"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $FrontendZip -DestinationPath $tmp -Force
$src = Join-Path $tmp "frontend"
if (-not (Test-Path (Join-Path $src "index.html"))) { $src = $tmp }
New-Item -ItemType Directory -Path $SitePath -Force | Out-Null
Copy-Item -Path (Join-Path $src "*") -Destination $SitePath -Recurse -Force

$webConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:__PORT__/api/{R:1}" />
        </rule>
        <rule name="Angular" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="314572800" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
'@
$webConfig = $webConfig.Replace('__PORT__', "$BackendPort")
Set-Content -Path (Join-Path $SitePath "web.config") -Value $webConfig -Encoding UTF8

# ---------- 4. IIS ----------
Etape "Configuration d'IIS"
Import-Module WebAdministration

# Active le relais (proxy) ARR avec un délai de 30 minutes pour les gros traitements
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value $true
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'timeout' -Value ([TimeSpan]::FromMinutes(30))

# Le site par défaut occupe le port 80 : on l'arrête pour libérer la place
$defaut = Get-Website -Name "Default Web Site" -ErrorAction SilentlyContinue
if ($defaut -and $defaut.State -eq "Started") {
    Write-Warning "Arrêt de 'Default Web Site' pour libérer le port 80."
    Stop-Website -Name "Default Web Site"
}

if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) { Remove-Website -Name $SiteName }
New-Website -Name $SiteName -PhysicalPath $SitePath -Port 80 -Force | Out-Null
Start-Website -Name $SiteName

# ---------- 5. Backend en service Windows ----------
Etape "Création du service $ServiceName"
$dossierBackend = Split-Path $JarPath
$logs = "C:\reconciliation\logs"
$tmpUp = "C:\reconciliation\tmp"
New-Item -ItemType Directory -Path $logs, $tmpUp -Force | Out-Null

if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
    & $NssmExe stop $ServiceName confirm | Out-Null
    & $NssmExe remove $ServiceName confirm | Out-Null
}

& $NssmExe install $ServiceName $java | Out-Null
& $NssmExe set $ServiceName AppDirectory $dossierBackend | Out-Null
& $NssmExe set $ServiceName AppParameters "-Xms$Xms -Xmx$Xmx -jar `"$JarPath`"" | Out-Null
& $NssmExe set $ServiceName AppEnvironmentExtra `
    "SPRING_PROFILES_ACTIVE=prod" `
    "SERVER_PORT=$BackendPort" `
    "DB_USERNAME=$DbUser" `
    "DB_PASSWORD=$dbPwd" `
    "JWT_SECRET=$jwtSecret" `
    "SUPER_ADMIN_USERNAME=superadmin" `
    "SUPER_ADMIN_PASSWORD=$adminPwd" `
    "APP_URL=$PublicUrl" `
    "APP_ALLOWED_ORIGINS=$PublicUrl" `
    "SPRING_SERVLET_MULTIPART_LOCATION=$tmpUp" | Out-Null
& $NssmExe set $ServiceName AppStdout "$logs\out.log" | Out-Null
& $NssmExe set $ServiceName AppStderr "$logs\err.log" | Out-Null
& $NssmExe set $ServiceName AppRotateFiles 1 | Out-Null
& $NssmExe set $ServiceName AppRotateBytes 52428800 | Out-Null
& $NssmExe set $ServiceName Start SERVICE_AUTO_START | Out-Null

# ---------- 6. Pare-feu ----------
Etape "Pare-feu"
if (-not (Get-NetFirewallRule -DisplayName "ReconciliApp HTTP" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "ReconciliApp HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
}
# Le port du backend et 3306 (MySQL) restent fermés vers l'extérieur.

# ---------- 7. Démarrage et test ----------
Etape "Démarrage du backend (le premier lancement peut durer 1 à 2 minutes)"
Start-Service $ServiceName

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 5
    try {
        Invoke-WebRequest -Uri "http://localhost:$BackendPort/" -UseBasicParsing -TimeoutSec 5 | Out-Null
        $ok = $true; break
    } catch {
        # Une réponse HTTP (401, 404...) prouve que le backend tourne
        if ($_.Exception.Response) { $ok = $true; break }
    }
}

if ($ok) {
    Write-Host "`nBackend démarré." -ForegroundColor Green
    Write-Host "Ouvrez : $PublicUrl"
    Write-Host "Compte initial : superadmin (mot de passe saisi plus haut)"
} else {
    Write-Warning "Le backend ne répond pas. Consultez $logs\err.log et $logs\out.log"
}
