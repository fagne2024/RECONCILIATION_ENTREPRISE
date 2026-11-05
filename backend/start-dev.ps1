#Requires -Version 5.1
<#
.SYNOPSIS
    Demarre le backend Spring Boot avec les variables d'environnement necessaires (profil dev par defaut).

.DESCRIPTION
    Sans profil Spring actif, le backend echoue au demarrage avec :
        Could not resolve placeholder 'JWT_SECRET' in value "${JWT_SECRET}"
    (application.properties expose jwt.secret=${JWT_SECRET} SANS valeur par defaut,
     par choix : aucun secret en dur dans le depot hors profil dev).

    Ce script :
      1. charge le fichier d'environnement local NON versionne `backend/.env.dev`
         (cree automatiquement avec un secret JWT dev aleatoire et persistant) ;
      2. positionne SPRING_PROFILES_ACTIVE (dev par defaut) ;
      3. lance `mvn spring-boot:run` dans le dossier backend.

    Le profil "dev" fournit le secret JWT de developpement et l'initialisation
    de la base (comptes de test). Ne JAMAIS utiliser ce script en production :
    le profil prod exige JWT_SECRET et DB_PASSWORD definis en variable d'environnement.

.PARAMETER Profile
    Profil Spring a activer. "dev" (defaut) ou "prod".
    Pour l'environnement de test (base dediee Reconciliation_app_TEST),
    utiliser le script dedie : .\start-test.ps1

.PARAMETER EnvFile
    Fichier d'environnement local a charger (defaut : backend/.env.dev).

.EXAMPLE
    .\start-dev.ps1

.EXAMPLE
    .\start-dev.ps1 -Profile prod
#>
param(
    [string]$Profile = 'dev',
    [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'

$backendDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
    Write-Error "Maven (`mvn`) est introuvable dans le PATH. Installez Maven ou ajoutez-le au PATH."
}

# --- 1. Fichier d'environnement local (non versionne) --------------------------
$envFilePath = if ($EnvFile) { $EnvFile } else { Join-Path $backendDir '.env.dev' }

if (-not (Test-Path -LiteralPath $envFilePath)) {
    # Secret aleatoire persistant : 48 caracteres (>= 32 octets requis par HMAC-SHA256).
    $generated = -join ((48..122 | ForEach-Object { [char]$_ } | Get-Random -Count 48))
    @(
        '# Variables locales du backend - fichier NON versionne (gitignore).',
        "# Genere automatiquement par start-dev.ps1 le $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').",
        '# Utilise par le profil dev (application-dev.properties) : jwt.secret=${DEV_JWT_SECRET:...}',
        "DEV_JWT_SECRET=$generated"
    ) | Set-Content -LiteralPath $envFilePath -Encoding UTF8
    Write-Host "Fichier d'environnement local cree : $envFilePath" -ForegroundColor Yellow
}

# --- 2. Chargement des variables KEY=VALUE dans l'environnement du processus ----
Get-Content -LiteralPath $envFilePath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if (-not $name) { return }
    # Une variable deja presente dans l'environnement gagne (override local).
    if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

# --- 3. Profil Spring ----------------------------------------------------------
$env:SPRING_PROFILES_ACTIVE = $Profile

if ($Profile -eq 'prod') {
    if (-not $env:JWT_SECRET) {
        Write-Error "Profil prod : JWT_SECRET est obligatoire (min 32 octets). Definissez-la dans l'environnement ou dans $envFilePath."
    }
    if (-not $env:DB_PASSWORD) {
        Write-Error "Profil prod : DB_PASSWORD est obligatoire. Definissez-la dans l'environnement ou dans $envFilePath."
    }
}

Write-Host "Demarrage du backend - profil Spring : $Profile" -ForegroundColor Cyan
Write-Host "Secrets : JWT_SECRET present = $([bool]$env:JWT_SECRET) | DEV_JWT_SECRET present = $([bool]$env:DEV_JWT_SECRET)"

Push-Location $backendDir
try {
    & mvn spring-boot:run
}
finally {
    Pop-Location
}
