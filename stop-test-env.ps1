#Requires -Version 5.1
<#
.SYNOPSIS
    Arrete l'environnement de TEST : backend (8086) et frontend (4201).

.DESCRIPTION
    Termine les processus qui ecoutent sur les ports de test, avec leurs
    processus enfants. L'environnement de developpement (8085 / 4200) n'est
    jamais touche.

.PARAMETER NoBackend
    Laisser le backend de test demarre.

.PARAMETER NoFrontend
    Laisser le frontend de test demarre.

.EXAMPLE
    .\stop-test-env.ps1
#>
param(
    [switch]$NoBackend,
    [switch]$NoFrontend
)

$ErrorActionPreference = 'Stop'

function Stop-PortOwner([int]$Port, [string]$Name) {
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) {
        Write-Host "$Name : rien n'ecoute sur le port $Port."
        return
    }
    foreach ($processId in $owners) {
        if ($processId -le 4) { continue }  # processus systeme
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $label = if ($proc) { $proc.ProcessName } else { 'inconnu' }
        # /T : arbre de processus (mvn -> java, npm -> node)
        & taskkill.exe /PID $processId /T /F | Out-Null
        Write-Host "$Name arrete (port $Port, PID $processId, $label)." -ForegroundColor Green
    }
}

Write-Host '=== Arret de l''environnement de TEST ===' -ForegroundColor Cyan
if (-not $NoFrontend) { Stop-PortOwner 4201 'Frontend de test' }
if (-not $NoBackend)  { Stop-PortOwner 8086 'Backend de test' }
