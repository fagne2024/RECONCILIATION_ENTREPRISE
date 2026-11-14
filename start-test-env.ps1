#Requires -Version 5.1
<#
.SYNOPSIS
    Demarre l'environnement de TEST complet : backend (8086) + frontend (4201).

.DESCRIPTION
    Ouvre deux fenetres PowerShell :
      - backend  : backend\start-test.ps1   (profil Spring "test", base Reconciliation_app_TEST, port 8086)
      - frontend : npm run start:test       (Angular sur le port 4201, proxy /api -> 8086)
    puis attend que les deux ports repondent et ouvre le navigateur.

    Un service deja demarre (port occupe) n'est pas relance.
    Arret : .\stop-test-env.ps1

.PARAMETER NoBackend
    Ne pas demarrer le backend de test.

.PARAMETER NoFrontend
    Ne pas demarrer le frontend de test.

.PARAMETER NoBrowser
    Ne pas ouvrir le navigateur a la fin.

.PARAMETER TimeoutSeconds
    Delai maximal d'attente du demarrage (defaut : 300 s).

.EXAMPLE
    .\start-test-env.ps1

.EXAMPLE
    .\start-test-env.ps1 -NoFrontend
#>
param(
    [switch]$NoBackend,
    [switch]$NoFrontend,
    [switch]$NoBrowser,
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'

$rootDir     = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$backendDir  = Join-Path $rootDir 'backend'
$frontendDir = Join-Path $rootDir 'frontend'

$backendPort  = 8086
$frontendPort = 4201
$frontendUrl  = "http://localhost:$frontendPort"

function Test-PortListening([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-ServiceWindow([string]$Title, [string]$WorkingDir, [string]$Command) {
    # Fenetre dediee : les journaux restent visibles, la fermer arrete le service.
    $script = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$WorkingDir'; $Command"
    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $script) `
        -WorkingDirectory $WorkingDir | Out-Null
}

function Wait-Port([int]$Port, [string]$Name) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    Write-Host "Attente de $Name (port $Port)..." -NoNewline
    while (-not (Test-PortListening $Port)) {
        if ((Get-Date) -gt $deadline) {
            Write-Host ' delai depasse.' -ForegroundColor Red
            Write-Warning "$Name n'a pas demarre en $TimeoutSeconds s : consultez sa fenetre."
            return $false
        }
        Start-Sleep -Seconds 3
        Write-Host '.' -NoNewline
    }
    Write-Host ' OK' -ForegroundColor Green
    return $true
}

Write-Host '=== Environnement de TEST ReconciliApp ===' -ForegroundColor Cyan

# --- Backend --------------------------------------------------------------------
$waitBackend = $false
if (-not $NoBackend) {
    if (Test-PortListening $backendPort) {
        Write-Host "Backend de test deja demarre sur le port $backendPort." -ForegroundColor Yellow
    } else {
        if (-not (Test-Path -LiteralPath (Join-Path $backendDir 'start-test.ps1'))) {
            Write-Error "Script introuvable : backend\start-test.ps1"
        }
        Write-Host "Demarrage du backend de test (port $backendPort)..."
        Start-ServiceWindow 'ReconciliApp TEST - backend 8086' $backendDir '.\start-test.ps1'
        $waitBackend = $true
    }
}

# --- Frontend -------------------------------------------------------------------
$waitFrontend = $false
if (-not $NoFrontend) {
    if (Test-PortListening $frontendPort) {
        Write-Host "Frontend de test deja demarre sur le port $frontendPort." -ForegroundColor Yellow
    } else {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Error "npm est introuvable dans le PATH (Node.js requis pour le frontend)."
        }
        if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules'))) {
            Write-Host 'node_modules absent : installation des dependances (npm install)...'
            Push-Location $frontendDir
            try { npm install } finally { Pop-Location }
        }
        Write-Host "Demarrage du frontend de test (port $frontendPort)..."
        Start-ServiceWindow 'ReconciliApp TEST - frontend 4201' $frontendDir 'npm run start:test'
        $waitFrontend = $true
    }
}

# --- Attente et ouverture -------------------------------------------------------
$ready = $true
if ($waitBackend)  { $ready = (Wait-Port $backendPort 'backend de test') -and $ready }
if ($waitFrontend) { $ready = (Wait-Port $frontendPort 'frontend de test') -and $ready }

if ($ready) {
    Write-Host ''
    Write-Host "Environnement de test pret : $frontendUrl" -ForegroundColor Green
    Write-Host "  Backend : http://localhost:$backendPort  (base Reconciliation_app_TEST)"
    Write-Host '  Arret   : .\stop-test-env.ps1'
    if (-not $NoBrowser -and -not $NoFrontend) {
        Start-Process $frontendUrl
    }
}
