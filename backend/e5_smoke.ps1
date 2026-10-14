# =====================================================================
# Etape 5 - smoke test runtime (clone top20_e1_data, port 8080).
# Verifie de bout en bout l'activation des modules PAR entreprise (403).
# Ne modifie PAS le code : uniquement des appels HTTP + lecture MySQL.
# =====================================================================
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:8080'
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$db = 'top20_e1_data'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Wait-Health {
    for ($i = 0; $i -lt 120; $i++) {
        $code = & curl.exe -s -o NUL -w "%{http_code}" "$base/health"
        if ($code -eq '200') { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Call([string]$method, [string]$url, [string]$token, [string]$body, [bool]$onlyStatus) {
    if ($onlyStatus) {
        $curlArgs = @('-s', '-o', 'NUL', '-w', '%{http_code}', '-X', $method, $url)
    } else {
        $curlArgs = @('-s', '-X', $method, $url)
    }
    if ($token) { $curlArgs += @('-H', "Authorization: Bearer $token") }
    $tmp = $null
    if ($body) {
        $tmp = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tmp, $body, $utf8)
        $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$tmp")
    }
    $res = & curl.exe @curlArgs
    if ($tmp) { Remove-Item $tmp -ErrorAction SilentlyContinue }
    return $res
}

function Status([string]$method, [string]$url, [string]$token, [string]$body) {
    return Call $method $url $token $body $true
}
function Body([string]$method, [string]$url, [string]$token, [string]$body) {
    return Call $method $url $token $body $false
}

Write-Output "== health =="
if (-not (Wait-Health)) { Write-Output "HEALTH_TIMEOUT"; exit 2 }
Write-Output "health=200"

Write-Output "== 1) login SUPER_ADMIN =="
$login = Body 'POST' "$base/api/auth/login" $null ('{"username":"superadmin","password":"' + $env:SMOKE_PASSWORD + '"}')
$token = ($login | ConvertFrom-Json).token
if (-not $token) { Write-Output "LOGIN_FAILED: $login"; exit 3 }
Write-Output "superadmin_token_ok=$($token.Length -gt 20)"

Write-Output "== 2) catalogue modules (SUPER_ADMIN) => 200 =="
$cat = Body 'GET' "$base/api/platform/modules" $token $null
$catalogue = $cat | ConvertFrom-Json
$comptesId = ($catalogue | Where-Object { $_.nom -eq 'Comptes' }).moduleId
Write-Output "catalogue_count=$($catalogue.Count) comptes_module_id=$comptesId"

Write-Output "== 3) creation entreprise SMOKE5 (0 module par defaut) =="
$create = Body 'POST' "$base/api/platform/entreprises" $token '{"code":"SMOKE5","nom":"Smoke Test 5","adminUsername":"smoke5_admin","adminEmail":"smoke5_admin@example.com"}'
$created = $create | ConvertFrom-Json
$id = $created.id
if (-not $id) { Write-Output "CREATE_FAILED: $create"; exit 4 }
Write-Output "created_id=$id droits=$($created.droitsAccordes)"

Write-Output "== 4) activation du compte puis login ADMIN =="
$actToken = (& $mysql -uroot --batch --skip-column-names --execute="SELECT token FROM $db.activation_token WHERE username='smoke5_admin' AND used=0 ORDER BY id DESC LIMIT 1;").Trim()
Write-Output "activation_token_len=$($actToken.Length)"
$activateBody = '{"token":"' + $actToken + '","newPassword":"Admin@12345"}'
Write-Output ("activate=" + (Status 'POST' "$base/api/users/activate" $null $activateBody))

$adminLogin = Body 'POST' "$base/api/auth/login" $null '{"username":"smoke5_admin","password":"Admin@12345"}'
$adminToken = ($adminLogin | ConvertFrom-Json).token
Write-Output "admin_login_token_ok=$($adminToken.Length -gt 20)"

Write-Output "== 5) ADMIN : aucun module actif => endpoint metier 403 =="
Write-Output ("comptes_sans_module=" + (Status 'GET' "$base/api/comptes" $adminToken $null))

Write-Output "== 6) ADMIN interdit sur la plateforme => 403 =="
Write-Output ("admin_platform_modules=" + (Status 'GET' "$base/api/platform/modules" $adminToken $null))
Write-Output ("admin_platform_put=" + (Status 'PUT' "$base/api/platform/entreprises/$id/modules" $adminToken ('{"activeModuleIds":[' + $comptesId + ']}')))

Write-Output "== 7) etat des modules de l'entreprise (SUPER_ADMIN) => modulesActives=0 =="
$state = Body 'GET' "$base/api/platform/entreprises/$id/modules" $token $null
$stateObj = $state | ConvertFrom-Json
Write-Output "modulesActives=$($stateObj.modulesActives)"

Write-Output "== 8) activation du module Comptes (SUPER_ADMIN) => 200 =="
$put = Body 'PUT' "$base/api/platform/entreprises/$id/modules" $token ('{"activeModuleIds":[' + $comptesId + ']}')
$putObj = $put | ConvertFrom-Json
Write-Output "activees=$($putObj.activees) desactivees=$($putObj.desactivees) modulesActifs=$($putObj.modulesActifs)"

Write-Output "== 9) ADMIN : module Comptes actif => endpoint metier 200 =="
Write-Output ("comptes_avec_module=" + (Status 'GET' "$base/api/comptes" $adminToken $null))

Write-Output "== 10) modules actifs vus par l'ADMIN (/api/modules/active) =="
Write-Output (Body 'GET' "$base/api/modules/active" $adminToken $null)

Write-Output "== 11) desactivation de tous les modules => retour 403 =="
Write-Output ("put_vide=" + (Status 'PUT' "$base/api/platform/entreprises/$id/modules" $token '{"activeModuleIds":[]}'))
Write-Output ("comptes_apres_desactivation=" + (Status 'GET' "$base/api/comptes" $adminToken $null))

Write-Output "== 12) journal d'audit (doit contenir ENTREPRISE_MODULES_MODIFIES) =="
& $mysql -uroot --batch --execute="SELECT action, target_type, target_id, details FROM $db.platform_audit_log WHERE target_id='$id' ORDER BY id;"

Write-Output "== 13) controle en base : lignes entreprise_module conservees (actif=0) =="
& $mysql -uroot --batch --execute="SELECT COUNT(*) AS lignes, SUM(actif) AS actifs FROM $db.entreprise_module WHERE entreprise_id=$id;"

Write-Output "== 14) nettoyage du tenant de smoke =="
& $mysql -uroot --execute="SET FOREIGN_KEY_CHECKS=0; DELETE FROM $db.activation_token WHERE entreprise_id=$id; DELETE FROM $db.entreprise_module WHERE entreprise_id=$id; DELETE FROM $db.profil_permission WHERE entreprise_id=$id; DELETE FROM $db.`user` WHERE entreprise_id=$id; DELETE FROM $db.profil WHERE entreprise_id=$id; DELETE FROM $db.platform_audit_log WHERE target_type='ENTREPRISE' AND target_id='$id'; DELETE FROM $db.entreprise WHERE id=$id; SET FOREIGN_KEY_CHECKS=1;"
& $mysql -uroot --batch --execute="SELECT (SELECT COUNT(*) FROM $db.entreprise WHERE id=$id) AS entreprise_restante, (SELECT COUNT(*) FROM $db.entreprise) AS entreprises;"

Write-Output "SMOKE_DONE"
