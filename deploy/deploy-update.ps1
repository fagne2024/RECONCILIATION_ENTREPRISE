# Script de mise à jour du dossier deploy (jar backend + frontend)
# Usage : .\deploy\deploy-update.ps1 [-BuildFrontend]

param(
    [switch]$BuildFrontend
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$JarName = 'csv-reconciliation-1.0.0.jar'

Write-Host "========== DEPLoiement : mise a jour jar + frontend =========="

# 1. Build backend
Write-Host "`n[1/3] Build backend (mvn -B -DskipTests package)..."
Push-Location (Join-Path $Root 'backend')
try {
    mvn -B -DskipTests package
} finally {
    Pop-Location
}

if (-not (Test-Path (Join-Path $Root "backend\target\$JarName"))) {
    throw "Build backend echoue : jar introuvable (backend\target\$JarName)"
}

# 2. Copie du jar vers deploy
Write-Host "`n[2/3] Copie du jar vers deploy\..."
Copy-Item -Path (Join-Path $Root "backend\target\$JarName") -Destination (Join-Path $Root "deploy\$JarName") -Force

# 3. Sync frontend
if ($BuildFrontend) {
    Write-Host "`n[3/3] Build frontend (npm run build)..."
    Push-Location (Join-Path $Root 'frontend')
    try {
        npm run build
    } finally {
        Pop-Location
    }
}

Write-Host "`n[3/3] Synchronisation deploy\frontend depuis frontend\dist\csv-reconciliation..."
robocopy (Join-Path $Root 'frontend\dist\csv-reconciliation') (Join-Path $Root 'deploy\frontend') /MIR /FFT /R:3 /W:1 /NFL /NDL /NJH /NJS | Out-Null

Write-Host "`n========== DEPLoiement mis a jour avec succes =========="
Write-Host "Jar deploy:    deploy\$JarName"
Write-Host "Frontend deploy: deploy\frontend\ (build actuel de frontend\dist\csv-reconciliation)"
Write-Host ""
Write-Host "Prochaine etape : redemarrer le service backend puis vider le cache navigateur."
