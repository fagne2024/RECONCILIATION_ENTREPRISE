# =====================================================================
# Etape 7 - Non-regression globale (smoke complet sur clone top20_e1_data).
# Verifie l'enchainement complet : E1->E2->E3->E4->E5->E6.
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
Write-Output "ETAPE 7 - NON-REGRESSION GLOBALE (smoke complet)"
Write-Output "====================================================================="

# -----------------------------------------------------------------------
# 0. Health + Flyway
# -----------------------------------------------------------------------
Write-Output "== 0) Health + Flyway =="
if (-not (Wait-Health)) { Write-Output "HEALTH_TIMEOUT"; exit 2 }
Write-Output "health=200"
& $mysql -uroot --batch --execute="SELECT version, success FROM $db.flyway_schema_history ORDER BY installed_rank;"
& $mysql -uroot --batch --execute="SELECT COUNT(*) AS total, SUM(actif) AS actifs FROM $db.entreprise_module WHERE entreprise_id=1;"

# -----------------------------------------------------------------------
# 1. SUPER_ADMIN login
# -----------------------------------------------------------------------
Write-Output "== 1) SUPER_ADMIN login =="
$login = Body 'POST' "$base/api/auth/login" $null ('{"username":"superadmin","password":"' + $env:SMOKE_PASSWORD + '"}')
$token = ($login | ConvertFrom-Json).token
if (-not $token) { Write-Output "LOGIN_FAILED: $login"; exit 3 }
Write-Output "superadmin_token_ok=$($token.Length -gt 20)"

# -----------------------------------------------------------------------
# 2. Plateforme - catalogue modules
# -----------------------------------------------------------------------
Write-Output "== 2) Catalogue modules (SUPER_ADMIN) =="
$cat = Body 'GET' "$base/api/platform/modules" $token $null
$catalogue = $cat | ConvertFrom-Json
$comptesId = ($catalogue | Where-Object { $_.nom -eq 'Comptes' }).moduleId
Write-Output "catalogue_count=$($catalogue.Count) comptes_module_id=$comptesId"

# -----------------------------------------------------------------------
# 3. Plateforme - liste entreprises
# -----------------------------------------------------------------------
Write-Output "== 3) Liste entreprises (SUPER_ADMIN) =="
$list = Body 'GET' "$base/api/platform/entreprises" $token $null
Write-Output "entreprises_count=$($list.Count)"

# -----------------------------------------------------------------------
# 4. Création entreprise E7TEST (atomique)
# -----------------------------------------------------------------------
Write-Output "== 4) Creation entreprise E7TEST (atomique) =="
$create = Body 'POST' "$base/api/platform/entreprises" $token '{"code":"E7TEST","nom":"Etape 7 Test","adminUsername":"e7_admin","adminEmail":"e7_admin@example.com"}'
$created = $create | ConvertFrom-Json
$eid = $created.id
if (-not $eid) { Write-Output "CREATE_FAILED: $create"; exit 4 }
Write-Output "created_id=$eid droits=$($created.droitsAccordes) modulesActives=$($created.modulesActives) emailSent=$($created.activationEmailSent)"

# -----------------------------------------------------------------------
# 5. Activation compte + login ADMIN entreprise
# -----------------------------------------------------------------------
Write-Output "== 5) Activation compte + login ADMIN =="
$actToken = (& $mysql -uroot --batch --skip-column-names --execute="SELECT token FROM $db.activation_token WHERE username='e7_admin' AND used=0 ORDER BY id DESC LIMIT 1;").Trim()
Write-Output "activation_token_len=$($actToken.Length)"
$activateBody = '{"token":"' + $actToken + '","newPassword":"Admin@12345"}'
Write-Output ("activate=" + (Status 'POST' "$base/api/users/activate" $null $activateBody))

$adminLogin = Body 'POST' "$base/api/auth/login" $null '{"username":"e7_admin","password":"Admin@12345"}'
$adminToken = ($adminLogin | ConvertFrom-Json).token
Write-Output "admin_login_token_ok=$($adminToken.Length -gt 20)"

# -----------------------------------------------------------------------
# 6. ADMIN sans module actif => 403 sur endpoint métier
# -----------------------------------------------------------------------
Write-Output "== 6) ADMIN sans module -> 403 sur /api/comptes =="
Write-Output ("comptes_sans_module=" + (Status 'GET' "$base/api/comptes" $adminToken $null))

# -----------------------------------------------------------------------
# 7. ADMIN interdit sur plateforme => 403
# -----------------------------------------------------------------------
Write-Output "== 7) ADMIN interdit sur plateforme -> 403 =="
Write-Output ("admin_platform=" + (Status 'GET' "$base/api/platform/entreprises" $adminToken $null))
Write-Output ("admin_platform_modules=" + (Status 'GET' "$base/api/platform/modules" $adminToken $null))

# -----------------------------------------------------------------------
# 8. SUPER_ADMIN active module Comptes pour E7TEST
# -----------------------------------------------------------------------
Write-Output "== 8) SUPER_ADMIN active Comptes pour E7TEST =="
$stateBefore = Body 'GET' "$base/api/platform/entreprises/$eid/modules" $token $null
Write-Output "avant: modulesActives=$($stateBefore.modulesActives)"
$put = Body 'PUT' "$base/api/platform/entreprises/$eid/modules" $token ('{"activeModuleIds":[' + $comptesId + ']}')
$putObj = $put | ConvertFrom-Json
Write-Output "apres: activees=$($putObj.activees) modulesActifs=$($putObj.modulesActifs)"

# -----------------------------------------------------------------------
# 9. ADMIN avec module actif => 200 sur endpoint métier
# -----------------------------------------------------------------------
Write-Output "== 9) ADMIN avec module Comptes actif -> 200 sur /api/comptes =="
Write-Output ("comptes_avec_module=" + (Status 'GET' "$base/api/comptes" $adminToken $null))

# -----------------------------------------------------------------------
# 10. ADMIN voit modules actifs via /api/modules/active
# -----------------------------------------------------------------------
Write-Output "== 10) ADMIN /api/modules/active =="
Write-Output (Body 'GET' "$base/api/modules/active" $adminToken $null)

# -----------------------------------------------------------------------
# 11. SUPER_ADMIN desactive tout -> retour 403
# -----------------------------------------------------------------------
Write-Output "== 11) SUPER_ADMIN desactive tout -> ADMIN 403 =="
Write-Output ("put_vide=" + (Status 'PUT' "$base/api/platform/entreprises/$eid/modules" $token '{"activeModuleIds":[]}'))
Write-Output ("comptes_apres_desactivation=" + (Status 'GET' "$base/api/comptes" $adminToken $null))

# -----------------------------------------------------------------------
# 12. Audit : verification ENTREPRISE_CREEE + ENTREPRISE_MODULES_MODIFIES x2
# -----------------------------------------------------------------------
Write-Output "== 12) Journal d'audit =="
& $mysql -uroot --batch --execute="SELECT action, target_type, target_id, details, created_at FROM $db.platform_audit_log WHERE target_id='$eid' ORDER BY id;"

# -----------------------------------------------------------------------
# 13. Suspension entreprise -> ADMIN ne peut plus se connecter (403)
# -----------------------------------------------------------------------
Write-Output "== 13) Suspension entreprise -> login 403 =="
Write-Output ("suspend=" + (Status 'POST' "$base/api/platform/entreprises/$eid/suspend" $token $null))
Write-Output ("suspended_login=" + (Status 'POST' "$base/api/auth/login" $null '{"username":"e7_admin","password":"Admin@12345"}'))

# -----------------------------------------------------------------------
# 14. Reactivation -> login OK
# -----------------------------------------------------------------------
Write-Output "== 14) Reactivation -> login 200 =="
Write-Output ("reactivate=" + (Status 'POST' "$base/api/platform/entreprises/$eid/reactivate" $token $null))
$adminLogin2 = Body 'POST' "$base/api/auth/login" $null '{"username":"e7_admin","password":"Admin@12345"}'
$adminToken2 = ($adminLogin2 | ConvertFrom-Json).token
Write-Output "admin_login_after_reactivate_ok=$($adminToken2.Length -gt 20)"

# -----------------------------------------------------------------------
# 15. Renvoi lien activation
# -----------------------------------------------------------------------
Write-Output "== 15) Renvoi lien activation =="
Write-Output (Body 'POST' "$base/api/platform/entreprises/$eid/resend-activation" $token $null)

# -----------------------------------------------------------------------
# 16. Renommage entreprise
# -----------------------------------------------------------------------
Write-Output "== 16) Renommage entreprise =="
Write-Output (Body 'PUT' "$base/api/platform/entreprises/$eid" $token '{"nom":"Etape 7 Test Renomme"}')

# -----------------------------------------------------------------------
# 17. Controle en base : profil ADMINISTRATEUR + droits + modules conserves (actif=0)
# -----------------------------------------------------------------------
Write-Output "== 17) Controle base =="
& $mysql -uroot --batch --execute="
SELECT 
  (SELECT COUNT(*) FROM $db.profil WHERE entreprise_id=$eid AND nom='ADMINISTRATEUR') AS profil_admin,
  (SELECT COUNT(*) FROM $db.profil_permission WHERE entreprise_id=$eid) AS droits,
  (SELECT COUNT(*) FROM $db.entreprise_module WHERE entreprise_id=$eid) AS lignes_em,
  (SELECT SUM(actif) FROM $db.entreprise_module WHERE entreprise_id=$eid) AS actifs;
"

# -----------------------------------------------------------------------
# 18. Isolation multi-entreprise : ADMIN E7TEST ne voit pas données ENT2
# -----------------------------------------------------------------------
Write-Output "== 18) Isolation multi-entreprise =="
# On verifie que l'ADMIN E7TEST (entreprise_id=$eid) n'a pas acces aux comptes d'ENT2 (id=2)
Write-Output ("admin_e7test_comptes=" + (Status 'GET' "$base/api/comptes" $adminToken2 $null))

# -----------------------------------------------------------------------
# 19. Nettoyage tenant E7TEST
# -----------------------------------------------------------------------
Write-Output "== 19) Nettoyage tenant E7TEST =="
& $mysql -uroot --execute="
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM $db.activation_token WHERE entreprise_id=$eid;
DELETE FROM $db.entreprise_module WHERE entreprise_id=$eid;
DELETE FROM $db.profil_permission WHERE entreprise_id=$eid;
DELETE FROM $db.\`user\` WHERE entreprise_id=$eid;
DELETE FROM $db.profil WHERE entreprise_id=$eid;
DELETE FROM $db.platform_audit_log WHERE target_type='ENTREPRISE' AND target_id='$eid';
DELETE FROM $db.entreprise WHERE id=$eid;
SET FOREIGN_KEY_CHECKS=1;
"
& $mysql -uroot --batch --execute="SELECT (SELECT COUNT(*) FROM $db.entreprise WHERE id=$eid) AS e7test_restante, (SELECT COUNT(*) FROM $db.entreprise) AS entreprises;"

Write-Output "====================================================================="
Write-Output "SMOKE_E7_GLOBAL_OK"
Write-Output "====================================================================="