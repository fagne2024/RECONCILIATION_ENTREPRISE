# =====================================================================
# Etape 8 - Marque (theme + logo) propre a chaque entreprise.
# Smoke runtime sur clone top20_e1_data (port 8080).
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
function Status([string]$method, [string]$url, [string]$token, [string]$body) { return Call $method $url $token $body $true }
function Body([string]$method, [string]$url, [string]$token, [string]$body) { return Call $method $url $token $body $false }

Write-Output "====================================================================="
Write-Output "ETAPE 8 - MARQUE PAR ENTREPRISE (theme + logo)"
Write-Output "====================================================================="

if (-not (Wait-Health)) { Write-Output "HEALTH_TIMEOUT"; exit 2 }
Write-Output "health=200"

# -----------------------------------------------------------------------
# 1. Anonyme (page de connexion) : sans code -> aucune marque (defaut)
# -----------------------------------------------------------------------
Write-Output "== 1) Anonyme sans code -> defaut =="
Write-Output ("anon_theme_sans_code=" + (Body 'GET' "$base/api/configuration/theme" $null $null))
Write-Output ("anon_logo_sans_code=" + (Body 'GET' "$base/api/configuration/logo" $null $null))

# -----------------------------------------------------------------------
# 2. SUPER_ADMIN login
# -----------------------------------------------------------------------
Write-Output "== 2) SUPER_ADMIN login =="
$login = Body 'POST' "$base/api/auth/login" $null ('{"username":"superadmin","password":"' + $env:SMOKE_PASSWORD + '"}')
$token = ($login | ConvertFrom-Json).token
if (-not $token) { Write-Output "LOGIN_FAILED: $login"; exit 3 }
Write-Output "superadmin_token_ok=$($token.Length -gt 20)"

# -----------------------------------------------------------------------
# 3. Creation entreprise E8BRAND + admin, activation, login
# -----------------------------------------------------------------------
Write-Output "== 3) Creation entreprise E8BRAND + activation + login ADMIN =="
$create = Body 'POST' "$base/api/platform/entreprises" $token '{"code":"E8BRAND","nom":"Etape 8 Branding","adminUsername":"e8_admin","adminEmail":"e8_admin@example.com"}'
$created = $create | ConvertFrom-Json
$eid = $created.id
if (-not $eid) { Write-Output "CREATE_FAILED: $create"; exit 4 }
Write-Output "created_id=$eid"

$actToken = (& $mysql -uroot --batch --skip-column-names --execute="SELECT token FROM $db.activation_token WHERE username='e8_admin' AND used=0 ORDER BY id DESC LIMIT 1;").Trim()
$activateBody = '{"token":"' + $actToken + '","newPassword":"Admin@12345"}'
Write-Output ("activate=" + (Status 'POST' "$base/api/users/activate" $null $activateBody))

$adminLogin = Body 'POST' "$base/api/auth/login" $null '{"username":"e8_admin","password":"Admin@12345"}'
$adminObj = $adminLogin | ConvertFrom-Json
$adminToken = $adminObj.token
Write-Output "admin_login_token_ok=$($adminToken.Length -gt 20) entrepriseId=$($adminObj.entrepriseId) role=$($adminObj.role)"

# -----------------------------------------------------------------------
# 4. ADMIN E8BRAND ecrit SON theme + SON logo (200 attendu)
# -----------------------------------------------------------------------
Write-Output "== 4) ADMIN E8BRAND -> POST theme + logo =="
$themeBody = '{"theme":{"primary":"#112233","primaryDark":"#101010","accent":"#445566","info":"#778899","infoDark":"#666666","sidebarBg":"#222222","sidebarHover":"#333333","sidebarActive":"#112233","contentBg":"#F0F0F0"}}'
Write-Output ("post_theme=" + (Status 'POST' "$base/api/configuration/theme" $adminToken $themeBody))

$logoPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
$logoBody = '{"logo":"' + $logoPixel + '","settings":{"size":90,"align":"center","offsetY":0,"paddingTop":0,"paddingRight":0,"paddingBottom":20,"paddingLeft":0}}'
Write-Output ("post_logo=" + (Status 'POST' "$base/api/configuration/logo" $adminToken $logoBody))

# -----------------------------------------------------------------------
# 5. Lecture authentifiee (ADMIN) : sa propre marque
# -----------------------------------------------------------------------
Write-Output "== 5) ADMIN lit sa marque (jeton) =="
$authTheme = Body 'GET' "$base/api/configuration/theme" $adminToken $null
Write-Output "auth_theme=$authTheme"
$authLogo = Body 'GET' "$base/api/configuration/logo" $adminToken $null
Write-Output ("auth_logo_has_pixel=" + ($authLogo -like '*iVBORw0KGgo*') + " settings_size=" + (($authLogo | ConvertFrom-Json).settings.size))

# -----------------------------------------------------------------------
# 6. Lecture ANONYME par code (page de connexion) E8BRAND
# -----------------------------------------------------------------------
Write-Output "== 6) Anonyme ?entreprise=E8BRAND (minuscules, insensible casse) =="
$anonTheme = Body 'GET' "$base/api/configuration/theme?entreprise=e8brand" $null $null
Write-Output "anon_theme_e8brand=$anonTheme"
$anonLogo = Body 'GET' "$base/api/configuration/logo?entreprise=E8BRAND" $null $null
Write-Output ("anon_logo_e8brand_has_pixel=" + ($anonLogo -like '*iVBORw0KGgo*'))

# -----------------------------------------------------------------------
# 7. Isolation : INTOUCH (id=1) n'a AUCUNE marque
# -----------------------------------------------------------------------
Write-Output "== 7) Isolation : INTOUCH sans marque =="
Write-Output ("into_theme=" + (Body 'GET' "$base/api/configuration/theme?entreprise=INTOUCH" $null $null))
Write-Output ("into_logo=" + (Body 'GET' "$base/api/configuration/logo?entreprise=INTOUCH" $null $null))
Write-Output ("inconnu_theme=" + (Body 'GET' "$base/api/configuration/theme?entreprise=ZZZINCONNU" $null $null))

# -----------------------------------------------------------------------
# 8. SUPER_ADMIN non impacte : lit le defaut + ecriture refusee (403)
# -----------------------------------------------------------------------
Write-Output "== 8) SUPER_ADMIN -> defaut + POST 403 =="
Write-Output ("super_theme=" + (Body 'GET' "$base/api/configuration/theme" $token $null))
Write-Output ("super_logo=" + (Body 'GET' "$base/api/configuration/logo" $token $null))
Write-Output ("super_post_theme=" + (Status 'POST' "$base/api/configuration/theme" $token $themeBody))
Write-Output ("super_post_logo=" + (Status 'POST' "$base/api/configuration/logo" $token $logoBody))

# -----------------------------------------------------------------------
# 9. Controle base
# -----------------------------------------------------------------------
Write-Output "== 9) Controle base entreprise_branding =="
& $mysql -uroot --batch --execute="SELECT entreprise_id, LEFT(theme_json,40) AS theme, LEFT(logo_data,30) AS logo, LEFT(logo_settings_json,20) AS settings FROM $db.entreprise_branding;"

# -----------------------------------------------------------------------
# 10. Nettoyage
# -----------------------------------------------------------------------
Write-Output "== 10) Nettoyage E8BRAND =="
$cleanupSql = @'
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM __DB__.entreprise_branding WHERE entreprise_id=__EID__;
DELETE FROM __DB__.activation_token WHERE entreprise_id=__EID__;
DELETE FROM __DB__.entreprise_module WHERE entreprise_id=__EID__;
DELETE FROM __DB__.profil_permission WHERE entreprise_id=__EID__;
DELETE FROM __DB__.`user` WHERE entreprise_id=__EID__;
DELETE FROM __DB__.profil WHERE entreprise_id=__EID__;
DELETE FROM __DB__.platform_audit_log WHERE target_type='ENTREPRISE' AND target_id='__EID__';
DELETE FROM __DB__.entreprise WHERE id=__EID__;
SET FOREIGN_KEY_CHECKS=1;
'@
$cleanupSql = $cleanupSql.Replace('__DB__', $db).Replace('__EID__', [string]$eid)
$tmpSql = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpSql, $cleanupSql, $utf8)
& cmd.exe /c ('"' + $mysql + '" -uroot < "' + $tmpSql + '"')
Remove-Item $tmpSql -ErrorAction SilentlyContinue
& $mysql -uroot --batch --execute="SELECT (SELECT COUNT(*) FROM $db.entreprise_branding) AS lignes_branding, (SELECT COUNT(*) FROM $db.entreprise) AS entreprises;"

Write-Output "====================================================================="
Write-Output "SMOKE_E8_OK"
Write-Output "====================================================================="
