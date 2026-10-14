$ErrorActionPreference = 'Stop'
$dir = 'src\main\java\com\reconciliation\entity'
$files = Get-ChildItem $dir -Filter *.java | Where-Object {
  (Get-Content -Raw -LiteralPath $_.FullName) -match '@org\.hibernate\.annotations\.TenantId'
}
$done = @(); $skipped = @()
foreach ($f in $files) {
  $content = Get-Content -Raw -LiteralPath $f.FullName
  if ($content -match 'EntityListeners') { $skipped += "$($f.Name) (deja present)"; continue }
  $pattern = '(?m)^@Entity\r?$'
  if ($content -notmatch $pattern) { $skipped += "$($f.Name) (pas de ligne @Entity isolee)"; continue }
  $replacement = "@Entity`r`n@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)"
  $new = [System.Text.RegularExpressions.Regex]::Replace($content, $pattern, $replacement, 1)
  Set-Content -LiteralPath $f.FullName -Value $new -NoNewline
  $done += $f.Name
}
"=== EntityListeners ajoutes ($($done.Count)) ==="
$done
"=== ignores ($($skipped.Count)) ==="
$skipped
