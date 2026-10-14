#Requires -Version 5.1
<#
.SYNOPSIS
    Démarre le backend Spring Boot et le frontend Angular dans deux fenêtres séparées.

.DESCRIPTION
    Lance `mvn spring-boot:run` dans `backend` et `npm start` ou `npm run start-http` dans `frontend`.
    Par défaut le frontend utilise HTTP (sans certificats). Utilisez -Ssl pour le mode HTTPS du package.json.

.PARAMETER Ssl
    Lance le frontend avec `npm start` (Angular en HTTPS avec les certificats sous Certs/).

.PARAMETER ProjectRoot
    Chemin absolu du dossier reconciliation-app (celui qui contient backend et frontend).
    Si omis : le script teste le dossier du script, puis la variable RECONCILIATION_APP_ROOT,
    puis C:\reconciliation\reconciliation-app s'il existe.

.EXAMPLE
    .\Start-App.ps1

.EXAMPLE
    .\Start-App.ps1 -Ssl

.EXAMPLE
    .\Start-App.ps1 -ProjectRoot 'D:\mes-projets\reconciliation-app'
#>
param(
    [switch]$Ssl,
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

function Test-AppProjectRoot([string]$Path) {
    if (-not $Path) { return $false }
    $b = Join-Path $Path 'backend'
    $f = Join-Path $Path 'frontend'
    return (Test-Path -LiteralPath $b -PathType Container) -and (Test-Path -LiteralPath $f -PathType Container)
}

if ($ProjectRoot) {
    if (-not (Test-AppProjectRoot $ProjectRoot)) {
        Write-Error "ProjectRoot invalide (dossiers backend et frontend requis) : $ProjectRoot"
    }
    $root = (Get-Item -LiteralPath $ProjectRoot).FullName
}
else {
    $candidates = [System.Collections.Generic.List[string]]::new()
    [void]$candidates.Add($PSScriptRoot)
    if ($env:RECONCILIATION_APP_ROOT) { [void]$candidates.Add($env:RECONCILIATION_APP_ROOT) }
    [void]$candidates.Add('C:\reconciliation\reconciliation-app')

    $root = $null
    $seen = @{}
    foreach ($c in $candidates) {
        if (-not $c -or $seen.ContainsKey($c)) { continue }
        $seen[$c] = $true
        if (Test-AppProjectRoot $c) {
            $root = (Get-Item -LiteralPath $c).FullName
            break
        }
    }
    if (-not $root) {
        Write-Error @"
Impossible de trouver le dossier du projet (backend/frontend).
  - Placez Start-App.ps1 dans reconciliation-app, ou
  - Définissez une fois : setx RECONCILIATION_APP_ROOT "C:\chemin\vers\reconciliation-app"
    puis rouvrez PowerShell, ou
  - Lancez : .\Start-App.ps1 -ProjectRoot 'C:\chemin\vers\reconciliation-app'
"@
    }
}
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

foreach ($dir in @($backendDir, $frontendDir)) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
        Write-Error "Dossier introuvable : $dir"
    }
}

if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
    Write-Error "Maven (`mvn`) est introuvable dans le PATH. Installez Maven ou ajoutez-le au PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm est introuvable dans le PATH. Installez Node.js ou ajoutez-le au PATH."
}

$nodeModules = Join-Path $frontendDir 'node_modules'
if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    Write-Warning "node_modules absent dans frontend. Exécutez d'abord : cd frontend ; npm install"
}

$npmCmd = if ($Ssl) { 'npm start' } else { 'npm run start-http' }

Write-Host "Démarrage du backend (Maven)..." -ForegroundColor Cyan
Start-Process -FilePath powershell.exe -WorkingDirectory $backendDir -ArgumentList @(
    '-NoExit',
    '-NoProfile',
    '-Command',
    ('$Host.UI.RawUI.WindowTitle = ''Reconciliation - Backend''; ' +
     'if (-not $env:JWT_SECRET) { $env:JWT_SECRET = ''dev-secret-0123456789abcdefghijklmnopqrstuvwxyz-dev-only-48chars'' }; ' +
     '$env:SPRING_PROFILES_ACTIVE = ''dev''; ' +
     'mvn spring-boot:run')
)

Start-Sleep -Seconds 2

Write-Host "Démarrage du frontend ($npmCmd)..." -ForegroundColor Cyan
Start-Process -FilePath powershell.exe -WorkingDirectory $frontendDir -ArgumentList @(
    '-NoExit',
    '-NoProfile',
    '-Command',
    ('$Host.UI.RawUI.WindowTitle = ''Reconciliation - Frontend''; ' + $npmCmd)
)

Write-Host "Deux fenêtres PowerShell ont été ouvertes (backend puis frontend). Fermez-les pour arrêter les serveurs." -ForegroundColor Green
