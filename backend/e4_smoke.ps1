# =====================================================================
# Etape 4 - smoke test runtime (clone top20_e1_data, port 8080).
# Ne modifie PAS le code : uniquement des appels HTTP + lecture MySQL.
# =====================================================================
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:8080'
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Wait-Health {
    for ($i = 0; $i -lt 120; $i++) {
        $code = & curl.exe -s -o NUL -w "%{http_code}" "$base/health"
        if ($code -eq '200') { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# $onlyStatus : vrai -> ne renvoie que le code HTTP ; sinon -> le corps.
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

Write-Output "== V5 tables =="
& $mysql -uroot --batch --execute="SELECT table_name FROM information_schema.tables WHERE table_schema='top20_e1_data' AND table_name IN ('activation_token','platform_audit_log'); SELECT version, success FROM top20_e1_data.flyway_schema_history WHERE version='5';"

Write-Output "== 1) /api/platform sans jeton => 401 =="
Write-Output ("unauth_platform=" + (Status 'GET' "$base/api/platform/entreprises" $null $null))

Write-Output "== 2) /api/users/activate public, jeton invalide => 400 =="
Write-Output ("public_activate=" + (Status 'POST' "$base/api/users/activate" $null '{"token":"deadbeef","newPassword":"Nouveau@1234"}'))

Write-Output "== 3) login SUPER_ADMIN =="
$login = Body 'POST' "$base/api/auth/login" $null ('{"username":"superadmin","password":"' + $env:SMOKE_PASSWORD + '"}')
$token = ($login | ConvertFrom-Json).token
if (-not $token) { Write-Output "LOGIN_FAILED: $login"; exit 3 }
Write-Output "superadmin_token_ok=$($token.Length -gt 20)"

Write-Output "== 4) liste entreprises (SUPER_ADMIN) => 200 =="
Write-Output ("list=" + (Status 'GET' "$base/api/platform/entreprises" $token $null))

Write-Output "== 5) creation entreprise SMOKE4 (atomique, email best-effort) =="
$create = Body 'POST' "$base/api/platform/entreprises" $token '{"code":"SMOKE4","nom":"Smoke Test 4","adminUsername":"smoke4_admin","adminEmail":"smoke4_admin@example.com"}'
Write-Output $create
$created = $create | ConvertFrom-Json
$id = $created.id
Write-Output "created_id=$id activationEmailSent=$($created.activationEmailSent)"

Write-Output "== 6) detail entreprise => 200 =="
Write-Output (Body 'GET' "$base/api/platform/entreprises/$id" $token $null)

Write-Output "== 7) activation du compte puis login ADMIN =="
$actToken = (& $mysql -uroot --batch --skip-column-names --execute="SELECT token FROM top20_e1_data.activation_token WHERE username='smoke4_admin' AND used=0 ORDER BY id DESC LIMIT 1;").Trim()
Write-Output "activation_token_len=$($actToken.Length)"
$activateBody = '{"token":"' + $actToken + '","newPassword":"Admin@12345"}'
Write-Output ("activate=" + (Status 'POST' "$base/api/users/activate" $null $activateBody))

$adminLogin = Body 'POST' "$base/api/auth/login" $null '{"username":"smoke4_admin","password":"Admin@12345"}'
$adminToken = ($adminLogin | ConvertFrom-Json).token
Write-Output "admin_login_token_ok=$($adminToken.Length -gt 20)"

Write-Output "== 8) ADMIN d'entreprise interdit sur la plateforme => 403 =="
Write-Output ("admin_platform_forbidden=" + (Status 'GET' "$base/api/platform/entreprises" $adminToken $null))

Write-Output "== 9) suspension : l'admin ne peut plus se connecter => 403 =="
Write-Output ("suspend=" + (Status 'POST' "$base/api/platform/entreprises/$id/suspend" $token $null))
Write-Output ("suspended_login=" + (Status 'POST' "$base/api/auth/login" $null '{"username":"smoke4_admin","password":"Admin@12345"}'))

Write-Output "== 10) reactivation =="
Write-Output ("reactivate=" + (Status 'POST' "$base/api/platform/entreprises/$id/reactivate" $token $null))

Write-Output "== 11) renvoi de lien d'activation =="
Write-Output (Body 'POST' "$base/api/platform/entreprises/$id/resend-activation" $token $null)

Write-Output "== 12) journal d'audit =="
Write-Output (Body 'GET' "$base/api/platform/audit-logs?limit=20" $token $null)

Write-Output "== 13) controle en base : profil/droits/modules =="
& $mysql -uroot --batch --execute="SELECT (SELECT COUNT(*) FROM top20_e1_data.profil WHERE entreprise_id=$id AND nom='ADMINISTRATEUR') AS profil_admin, (SELECT COUNT(*) FROM top20_e1_data.profil_permission WHERE entreprise_id=$id) AS droits, (SELECT COUNT(*) FROM top20_e1_data.entreprise_module WHERE entreprise_id=$id) AS modules, (SELECT COUNT(*) FROM top20_e1_data.module_permission) AS droits_attendus;"

Write-Output "SMOKE_DONE"
