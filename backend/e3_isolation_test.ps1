$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8080'
# Mot de passe des comptes de test (a definir avant execution) :
#   $env:SMOKE_PASSWORD = '<mot de passe local>'

function Login($u, $p) {
  $body = @{ username = $u; password = $p } | ConvertTo-Json
  return Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body $body -ContentType 'application/json'
}

function StatusOf($uri, $headers) {
  try {
    return (Invoke-WebRequest -Uri $uri -Headers $headers -UseBasicParsing -TimeoutSec 15).StatusCode
  } catch {
    return $_.Exception.Response.StatusCode.value__
  }
}

"---- LOGIN admin (ENT1) ----"
$admin = Login 'admin' $env:SMOKE_PASSWORD
"role=$($admin.role) entrepriseId=$($admin.entrepriseId) profil=$($admin.profil) nb_droits=$(@($admin.droits).Count) pays.isGlobal=$($admin.pays.isGlobal) pays.codes=$(@($admin.pays.codes) -join ',')"
$h = @{ Authorization = "Bearer $($admin.token)" }

"---- LOGIN superadmin (plateforme, entreprise NULL) ----"
try {
  $sa = Login 'superadmin' $env:SMOKE_PASSWORD
  "role=$($sa.role) entrepriseId=$($sa.entrepriseId) nb_droits=$(@($sa.droits).Count) pays.isGlobal=$($sa.pays.isGlobal)"
  $hs = @{ Authorization = "Bearer $($sa.token)" }
  "CASE  SA GET /api/users/me  -> HTTP $(StatusOf \"$base/api/users/me\" $hs)   [attendu 200]"
  "CASE  SA GET /api/comptes   -> HTTP $(StatusOf \"$base/api/comptes\" $hs)   [attendu 403]"
  "CASE  SA GET /api/users     -> HTTP $(StatusOf \"$base/api/users\" $hs)   [attendu 403]"
} catch {
  "superadmin login: HTTP $($_.Exception.Response.StatusCode.value__)"
}

"---- ServiceReference (entites @TenantId) ----"
$all = @(Invoke-RestMethod -Uri "$base/api/service-references" -Headers $h -Method Get)
$codes = $all | ForEach-Object { $_.codeReco }
"GET /api/service-references  ->  $($codes.Count) lignes ; contient ENT2 ? $($codes -contains 'RECO-ENT2-ISO')"
"CASE  GET /api/service-references/2006  (ENT1)          -> HTTP $(StatusOf \"$base/api/service-references/2006\" $h)   [attendu 200]"
"CASE  GET /api/service-references/2974  (ENT2)          -> HTTP $(StatusOf \"$base/api/service-references/2974\" $h)   [attendu 404]"
"CASE  GET /api/service-references/code-reco/RECO-ENT2-ISO -> HTTP $(StatusOf \"$base/api/service-references/code-reco/RECO-ENT2-ISO\" $h)   [attendu 404]"

"---- Utilisateurs (UserEntity non @TenantId : scope applicatif) ----"
$users = @(Invoke-RestMethod -Uri "$base/api/users" -Headers $h -Method Get)
$names = $users | ForEach-Object { $_.username }
"GET /api/users  ->  $($names.Count) utilisateurs ; contient ent2user (ENT2) ? $($names -contains 'ent2user')"
"CASE  GET /api/users/1  (admin ENT1)    -> HTTP $(StatusOf \"$base/api/users/1\" $h)   [attendu 200]"
"CASE  GET /api/users/9  (ent2user ENT2) -> HTTP $(StatusOf \"$base/api/users/9\" $h)   [attendu 404]"

"---- Divers ----"
"CASE  GET /api/comptes    -> HTTP $(StatusOf \"$base/api/comptes\" $h)   [attendu 200]"
"CASE  GET /api/users/me   -> HTTP $(StatusOf \"$base/api/users/me\" $h)   [attendu 200]"
