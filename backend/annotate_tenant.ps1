$ErrorActionPreference = 'Stop'
$dir = 'src\main\java\com\reconciliation\entity'

# Entites metier portant entreprise_id (V3). UserEntity traitee separement.
$targets = @(
  'AgencySummaryEntity.java',
  'AgencyThresholdEntity.java',
  'AutoProcessingModel.java',
  'BoPartenaireControleInterneCommentEntity.java',
  'BoPartenaireControleInterneEntity.java',
  'CalculationRuleEntity.java',
  'ColumnProcessingRule.java',
  'CommissionEntity.java',
  'CompteEntity.java',
  'CompteRegroupementEntity.java',
  'CompteSoldeBoEntity.java',
  'CompteSoldeClotureEntity.java',
  'EcartBoSummaryEntity.java',
  'EcartSoldeEntity.java',
  'FluxEntity.java',
  'FraisTransactionEntity.java',
  'GuideDocumentEntity.java',
  'GuideNodeEntity.java',
  'ImpactOPEntity.java',
  'NavigationLabelAuditEntity.java',
  'OperationBancaireEntity.java',
  'OperationEntity.java',
  'OPPARTEntity.java',
  'PaysEntity.java',
  'ProfilEntity.java',
  'ProfilPaysEntity.java',
  'ProfilPermissionEntity.java',
  'RecoJ1BlockingCommentEntity.java',
  'ReconciliationJob.java',
  'ReconciliationLock.java',
  'ReconciliationOkEntity.java',
  'ReconciliationStatusEntity.java',
  'RedevanceAgenceParamEntity.java',
  'ReleveBancaireEntity.java',
  'ReleveManualEntity.java',
  'Result8RecAuditEntity.java',
  'Result8RecEntity.java',
  'SopDocumentEntity.java',
  'SopNodeEntity.java',
  'SuiviEcartEntity.java',
  'TrxSfEntity.java',
  'UserLogEntity.java'
)

$block = @(
  '',
  '    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */',
  '    @org.hibernate.annotations.TenantId',
  '    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)',
  '    @com.fasterxml.jackson.annotation.JsonIgnore',
  '    private Long entrepriseId;'
) -join "`r`n"

$done = @()
$skipped = @()
foreach ($f in $targets) {
  $path = Join-Path $dir $f
  $content = Get-Content -Raw -LiteralPath $path
  if ($content -match 'entrepriseId') { $skipped += "$f (deja present)"; continue }
  if ($content -notmatch 'private Long id;') { $skipped += "$f (pas de 'private Long id;')"; continue }
  # Inserer juste apres la PREMIERE occurrence de 'private Long id;'
  $pattern = '(\r?\n[ \t]*private Long id;)'
  $newContent = [System.Text.RegularExpressions.Regex]::Replace($content, $pattern, { param($m) $m.Value + "`r`n" + $block }, 1)
  if ($newContent -eq $content) { $skipped += "$f (regex no match)"; continue }
  Set-Content -LiteralPath $path -Value $newContent -NoNewline
  $done += $f
}

"=== ANNOTEES ($($done.Count)) ==="
$done
"=== IGNOREES ($($skipped.Count)) ==="
$skipped
