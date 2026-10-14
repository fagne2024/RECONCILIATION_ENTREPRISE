export interface ModuleActionDetail {
  action: string;
  httpMethod: string;
  path: string;
  controller?: string;
  method?: string;
}

export interface ActionCategoryGroup {
  key: string;
  label: string;
  icon: string;
  actions: ModuleActionDetail[];
}

const ACTION_LABELS: Record<string, string> = {
  consulter: 'Consulter',
  creer: 'Créer',
  modifier: 'Modifier',
  supprimer: 'Supprimer',
  exporter: 'Exporter',
  importer: 'Importer',
  synchroniser: 'Synchroniser',
  valider: 'Valider',
  lancer_reconciliation: 'Lancer une réconciliation',
  executer_reconciliation_magique: 'Exécuter la réconciliation magique',
  consulter_resultats_reconciliation: 'Consulter les résultats de réconciliation',
  consulter_cles_ok: 'Consulter les clés OK',
  consulter_statuts_reconciliation: 'Consulter les statuts de réconciliation',
  enregistrer_statut_reconciliation: 'Enregistrer le statut de réconciliation',
  synchroniser_soldes: 'Synchroniser les soldes',
  recalculer_solde_cloture: 'Recalculer le solde de clôture',
  corriger_frais: 'Corriger les frais',
  verifier_traitement_operation: 'Vérifier le traitement d’opération',
  calculer_impact_solde: 'Calculer l’impact sur le solde',
  module_associe: 'Module associé'
};

const CATEGORY_RULES: Array<{ key: string; label: string; icon: string; match: (action: string) => boolean }> = [
  {
    key: 'read',
    label: 'Consultation',
    icon: 'fa-eye',
    match: action => action === 'consulter' || action.startsWith('consulter_') || action.startsWith('lire_')
  },
  {
    key: 'create',
    label: 'Création',
    icon: 'fa-plus-circle',
    match: action => action === 'creer' || action.startsWith('creer_')
  },
  {
    key: 'update',
    label: 'Modification',
    icon: 'fa-edit',
    match: action =>
      action === 'modifier'
      || action.startsWith('modifier_')
      || action.startsWith('enregistrer_')
      || action.startsWith('marquer_')
      || action.startsWith('mettre_a_jour')
  },
  {
    key: 'delete',
    label: 'Suppression',
    icon: 'fa-trash-alt',
    match: action => action === 'supprimer' || action.startsWith('supprimer_')
  },
  {
    key: 'reconciliation',
    label: 'Réconciliation',
    icon: 'fa-sync-alt',
    match: action =>
      action.includes('reconciliation')
      || action.startsWith('lancer_')
      || action.startsWith('executer_')
      || action.startsWith('synchroniser_')
  },
  {
    key: 'control',
    label: 'Contrôle & validation',
    icon: 'fa-clipboard-check',
    match: action =>
      action.startsWith('verifier_')
      || action.startsWith('valider_')
      || action.startsWith('corriger_')
      || action.startsWith('calculer_')
      || action.startsWith('recalculer_')
  },
  {
    key: 'transfer',
    label: 'Import / export',
    icon: 'fa-file-export',
    match: action => action.startsWith('exporter_') || action.startsWith('importer_') || action === 'exporter' || action === 'importer'
  }
];

export function normalizeActionName(name?: string | null): string {
  if (!name) {
    return '';
  }
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function deduplicateModuleActions(actions: ModuleActionDetail[]): ModuleActionDetail[] {
  const seen = new Set<string>();
  const result: ModuleActionDetail[] = [];
  for (const action of actions || []) {
    const key = normalizeActionName(action.action);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      ...action,
      action: key
    });
  }
  return result.sort((a, b) => getActionLabel(a.action).localeCompare(getActionLabel(b.action), 'fr'));
}

export function getActionLabel(action: string): string {
  const normalized = normalizeActionName(action);
  if (!normalized) {
    return '';
  }
  if (ACTION_LABELS[normalized]) {
    return ACTION_LABELS[normalized];
  }

  return normalized
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getHttpMethodClass(httpMethod: string): string {
  const method = (httpMethod || '').trim().toLowerCase();
  if (!method) {
    return '';
  }
  return `method-${method}`;
}

export function matchesActionSearch(action: ModuleActionDetail, search: string): boolean {
  const query = (search || '').trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystacks = [
    action.action,
    getActionLabel(action.action),
    action.httpMethod,
    action.path,
    action.controller,
    action.method
  ];

  return haystacks.some(value => (value || '').toLowerCase().includes(query));
}

function resolveCategoryKey(actionName: string): string {
  const normalized = normalizeActionName(actionName);
  const rule = CATEGORY_RULES.find(category => category.match(normalized));
  return rule?.key || 'other';
}

export function groupActionsByCategory(actions: ModuleActionDetail[]): ActionCategoryGroup[] {
  const buckets = new Map<string, ActionCategoryGroup>();

  for (const action of actions || []) {
    const key = resolveCategoryKey(action.action);
    if (!buckets.has(key)) {
      const rule = CATEGORY_RULES.find(category => category.key === key);
      buckets.set(key, {
        key,
        label: rule?.label || 'Autres',
        icon: rule?.icon || 'fa-cog',
        actions: []
      });
    }
    buckets.get(key)!.actions.push(action);
  }

  const orderedKeys = [...CATEGORY_RULES.map(rule => rule.key), 'other'];
  return orderedKeys
    .filter(key => buckets.has(key))
    .map(key => buckets.get(key)!);
}
