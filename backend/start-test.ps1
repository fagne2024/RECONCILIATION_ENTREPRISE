#Requires -Version 5.1
<#
.SYNOPSIS
    Demarre le backend Spring Boot avec le profil "test" (base de donnees TEST).

.DESCRIPTION
    Lance l'application sur une base MySQL DEDIEE aux tests (par defaut
    Reconciliation_app_TEST), sans jamais toucher a la base de developpement /
    production (Reconciliation_app).

    Ce script :
      1. charge le fichier d'environnement local NON versionne `backend/.env.test`
         (cree automatiquement avec un secret JWT aleatoire et persistant) ;
      2. verifie que l'URL de base de donnees ne pointe pas vers la base
         Reconciliation_app ;
      3. active le profil Spring "test" et lance `mvn spring-boot:run`.

    Configuration par defaut :
      - Backend  : http://localhost:8086
      - Base     : jdbc:mysql://localhost:3306/Reconciliation_app_TEST
      - Frontend : http://localhost:4201  (cd frontend ; npm run start:test)

.PARAMETER EnvFile
    Fichier d'environnement local a charger (defaut : backend/.env.test).

.PARAMETER SkipDatabaseCheck
    Ne pas verifier le nom de la base cible (deconseille).

.EXAMPLE
    .\start-test.ps1

.EXAMPLE
    .\start-test.ps1 -EnvFile .\env\reco-test.env
#>
param(
    [string]$EnvFile = '',
    [switch]$SkipDatabaseCheck
)

$ErrorActionPreference = 'Stop'

$backendDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
    Write-Error "Maven (`mvn`) est introuvable dans le PATH. Installez Maven ou ajoutez-le au PATH."
}

# --- 1. Fichier d'environnement local (non versionne) --------------------------
$envFilePath = if ($EnvFile) { $EnvFile } else { Join-Path $backendDir '.env.test' }

if (-not (Test-Path -LiteralPath $envFilePath)) {
    # Secret aleatoire persistant : 48 caracteres (>= 32 octets requis par HMAC-SHA256).
    $generated = -join ((48..122 | ForEach-Object { [char]$_ } | Get-Random -Count 48))
    @(
        '# Variables locales du backend - profil TEST - fichier NON versionne (gitignore).',
        "# Genere automatiquement par start-test.ps1 le $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').",
        '# Base de donnees DEDIEE aux tests : ne jamais mettre la base de production ici.',
        'TEST_DB_URL=jdbc:mysql://localhost:3306/Reconciliation_app_TEST?createDatabaseIfNotExist=true&allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC&allowMultiQueries=true&useUnicode=true&characterEncoding=UTF-8',
        'TEST_DB_USERNAME=root',
        'TEST_DB_PASSWORD=',
        '# Si TEST_DB_USERNAME / TEST_DB_PASSWORD sont vides, le script reprend',
        '# DB_USERNAME / DB_PASSWORD de backend/.env.dev (meme instance MySQL locale).',
        '# Secret JWT du profil test (genere automatiquement).',
        "TEST_JWT_SECRET=$generated",
        '# Port HTTP du backend de test (dev = 8085, prod = 8080).',
        'TEST_SERVER_PORT=8086'
    ) | Set-Content -LiteralPath $envFilePath -Encoding UTF8
    Write-Host "Fichier d'environnement de test cree : $envFilePath" -ForegroundColor Yellow
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

# --- 3. Identifiants MySQL + garde-fou : la base cible doit etre une base TEST --

# Repli local : si .env.test ne fournit pas les identifiants MySQL, on reprend
# ceux de backend/.env.dev (meme instance MySQL locale). Les variables
# TEST_DB_* restent prioritaires.
$devEnvFilePath = Join-Path $backendDir '.env.dev'
if (Test-Path -LiteralPath $devEnvFilePath) {
    $devSettings = @{}
    Get-Content -LiteralPath $devEnvFilePath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $devSettings[$line.Substring(0, $idx).Trim()] = $line.Substring($idx + 1).Trim()
    }
    if (-not $env:TEST_DB_USERNAME -and $devSettings['DB_USERNAME']) {
        $env:TEST_DB_USERNAME = $devSettings['DB_USERNAME']
    }
    if (-not $env:TEST_DB_PASSWORD -and $devSettings['DB_PASSWORD']) {
        $env:TEST_DB_PASSWORD = $devSettings['DB_PASSWORD']
        Write-Host "Identifiants MySQL repris depuis backend/.env.dev (TEST_DB_PASSWORD vide)." -ForegroundColor DarkGray
    }
}

$defaultDbUrl = 'jdbc:mysql://localhost:3306/Reconciliation_app_TEST?createDatabaseIfNotExist=true&allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC&allowMultiQueries=true&useUnicode=true&characterEncoding=UTF-8'
$dbUrl = if ($env:TEST_DB_URL) { $env:TEST_DB_URL } else { $defaultDbUrl }
$dbName = ''

if ($dbUrl -match 'jdbc:mysql://[^/]+/([^?;/]+)') {
    $dbName = $Matches[1]
}

if (-not $SkipDatabaseCheck) {
    if (-not $dbName) {
        Write-Warning "Impossible d'extraire le nom de la base depuis TEST_DB_URL : $dbUrl"
    }
    elseif ($dbName -ieq 'Reconciliation_app') {
        Write-Error "Securite : TEST_DB_URL pointe vers la base '$dbName' (dev/production). Utilisez une base dediee, par exemple Reconciliation_app_TEST."
    }
    elseif ($dbName -notmatch '(?i)test') {
        Write-Warning "Le nom de la base cible '$dbName' ne contient pas 'test'. Verifiez qu'il s'agit bien d'une base de test."
    }
}

# --- 4. Profil Spring ----------------------------------------------------------
$env:SPRING_PROFILES_ACTIVE = 'test'

if (-not $env:TEST_JWT_SECRET) {
    Write-Error "Profil test : TEST_JWT_SECRET est obligatoire. Definissez-le dans $envFilePath ou dans l'environnement."
}

# Journal dedie pour ne pas ecraser celui du dev si les deux tournent en parallele.
if (-not $env:LOG_FILE) {
    $env:LOG_FILE = 'logs/reconciliapp-test'
}

Write-Host "Demarrage du backend - profil Spring : test" -ForegroundColor Cyan
Write-Host "Port backend    : $($env:TEST_SERVER_PORT)" -ForegroundColor Cyan
Write-Host "Base de donnees : $dbName" -ForegroundColor Cyan

Push-Location $backendDir
try {
    & mvn spring-boot:run
}
finally {
    Pop-Location
}
