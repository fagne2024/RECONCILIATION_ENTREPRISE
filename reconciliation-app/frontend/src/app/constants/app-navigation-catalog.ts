/**
 * Catalogue des menus / sous-menus de l'application (aligné sur la sidebar).
 * moduleName = module API métier ; accessModuleName = droits navigation par sous-menu.
 */
export const NAV_SUBMENU_ACCESS_SEPARATOR = ' · ';

export interface AppNavigationSubmenu {
  key: string;
  label: string;
  route: string;
  /** Module métier pour les appels API (X-Permission-Module). */
  moduleName: string;
  /** Module de droits navigation. Si absent, dérivé automatiquement pour les menus partagés. */
  accessModuleName?: string;
  /** Préfixes d'API pour le contrôle d'accès à l'exécution. */
  apiPathPrefixes?: string[];
  /** Préfixes d'API pour les actions attribuables (liste propre au sous-menu). */
  actionPathPrefixes?: string[];
  icon?: string;
}

export interface AppNavigationGroup {
  key: string;
  label: string;
  icon?: string;
  /** Menu sans sous-menu : module et route directs. */
  moduleName?: string;
  route?: string;
  children?: AppNavigationSubmenu[];
  adminOnly?: boolean;
}

export interface NavigationAccessContext {
  group: AppNavigationGroup;
  submenu?: AppNavigationSubmenu;
  accessModuleName: string;
  apiModuleName: string;
  apiPathPrefixes: string[];
  actionPathPrefixes: string[];
  route: string;
  label: string;
  key: string;
  usesGranularAccess: boolean;
}

export const APP_NAVIGATION_CATALOG: AppNavigationGroup[] = [
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    icon: 'fa-tachometer-alt',
    moduleName: 'Dashboard',
    route: '/dashboard'
  },
  {
    key: 'traitement',
    label: 'Traitement',
    icon: 'fa-tools',
    moduleName: 'Traitement',
    route: '/traitement'
  },
  {
    key: 'reconciliation',
    label: 'Réconciliation',
    icon: 'fa-file-upload',
    children: [
      {
        key: 'reco-launcher',
        label: 'Lanceur',
        route: '/reconciliation-launcher',
        moduleName: 'Réconciliation',
        apiPathPrefixes: ['/api/reconciliation-launcher', '/api/reconciliation', '/api/auto-processing'],
        actionPathPrefixes: [
          '/api/reconciliation/analyze-keys',
          '/api/reconciliation/execute-magic',
          '/api/reconciliation/start',
          '/api/reconciliation/progress',
          '/api/auto-processing/models',
          '/api/auto-processing/process-data',
          '/api/auto-processing/process-single-row'
        ],
        icon: 'fa-play-circle'
      },
      {
        key: 'reco-manual',
        label: 'Mode Manuel',
        route: '/upload',
        moduleName: 'Réconciliation',
        apiPathPrefixes: ['/api/reconciliation'],
        actionPathPrefixes: [
          '/api/reconciliation/upload',
          '/api/reconciliation/reconcile',
          '/api/reconciliation/start',
          '/api/reconciliation/progress',
          '/api/reconciliation/save-summary',
          '/api/reconciliation/results'
        ],
        icon: 'fa-upload'
      },
      {
        key: 'reco-assisted',
        label: 'Mode assisté',
        route: '/upload-assisted',
        moduleName: 'Réconciliation',
        apiPathPrefixes: ['/api/reconciliation', '/api/auto-processing'],
        actionPathPrefixes: [
          '/api/reconciliation/upload',
          '/api/reconciliation/reconcile',
          '/api/reconciliation/start',
          '/api/reconciliation/progress',
          '/api/reconciliation/save-summary',
          '/api/auto-processing'
        ],
        icon: 'fa-magic'
      },
      {
        key: 'reco-certif',
        label: 'Certification de solde',
        route: '/certification-solde',
        moduleName: 'Réconciliation',
        apiPathPrefixes: ['/api/reconciliation', '/api/auto-processing'],
        actionPathPrefixes: [
          '/api/reconciliation/upload',
          '/api/reconciliation/reconcile',
          '/api/reconciliation/start',
          '/api/reconciliation/progress',
          '/api/compte-solde-bo',
          '/api/compte-solde-cloture',
          '/api/auto-processing'
        ],
        icon: 'fa-balance-scale'
      }
    ]
  },
  {
    key: 'resultats',
    label: 'Résultats',
    icon: 'fa-poll',
    children: [
      {
        key: 'res-overview',
        label: "Vue d'ensemble",
        route: '/results',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/results', '/api/result8rec', '/api/report-dashboard'],
        actionPathPrefixes: ['/api/results', '/api/result8rec', '/api/report-dashboard', '/api/reconciliation/results/summary'],
        icon: 'fa-poll'
      },
      {
        key: 'res-etat-reconciliations',
        label: 'État des réconciliations',
        route: '/etat-reconciliations',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/result8rec'],
        icon: 'fa-clipboard-list'
      },
      {
        key: 'res-matches',
        label: 'Correspondances',
        route: '/matches',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation/results/matches', '/api/reconciliation/mark-ok', '/api/result8rec'],
        icon: 'fa-check-double'
      },
      {
        key: 'res-ecart-bo',
        label: 'Écarts BO',
        route: '/ecart-bo',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation/results/bo-only', '/api/reconciliation/status', '/api/result8rec'],
        icon: 'fa-exclamation-circle'
      },
      {
        key: 'res-ecart-part',
        label: 'Écarts Partenaire',
        route: '/ecart-partner',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation/results/partner-only', '/api/result8rec'],
        icon: 'fa-exclamation-triangle'
      },
      {
        key: 'res-ecart-summary',
        label: 'Suivi des écarts J-1 & J+1',
        route: '/ecart-bo-summary',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/ecart-bo-summary'],
        actionPathPrefixes: ['/api/ecart-bo-summary'],
        icon: 'fa-list-alt'
      },
      {
        key: 'res-report',
        label: 'Rapport réconciliation',
        route: '/reconciliation-report',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation-report', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation-report', '/api/result8rec'],
        icon: 'fa-file-alt'
      },
      {
        key: 'res-bo-part',
        label: 'Rapport BO vs Partenaire',
        route: '/rapport-reconciliation-bo-partenaire',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/result8rec'],
        actionPathPrefixes: ['/api/result8rec'],
        icon: 'fa-file-contract'
      },
      {
        key: 'res-controle-interne',
        label: 'Contrôle interne BO vs Partenaire',
        route: '/controle-interne-bo-partenaire',
        moduleName: 'Résultats',
        apiPathPrefixes: [
          '/api/bo-partenaire-controle-interne',
          '/api/result8rec',
          '/api/ecart-bo-summary',
          '/api/reconciliation-report'
        ],
        actionPathPrefixes: [
          '/api/bo-partenaire-controle-interne',
          '/api/result8rec',
          '/api/ecart-bo-summary',
          '/api/reconciliation-report'
        ],
        icon: 'fa-clipboard-check'
      }
    ]
  },
  {
    key: 'statistiques',
    label: 'Statistiques',
    icon: 'fa-chart-bar',
    children: [
      {
        key: 'stats-main',
        label: 'Statistiques',
        route: '/stats',
        moduleName: 'Statistiques',
        apiPathPrefixes: ['/api/stats', '/api/statistics'],
        actionPathPrefixes: [
          '/api/statistics/by-date',
          '/api/statistics/by-filters',
          '/api/statistics/filter-options',
          '/api/statistics/save'
        ],
        icon: 'fa-chart-bar'
      },
      {
        key: 'stats-report',
        label: 'Rapport statistiques',
        route: '/stats-report',
        moduleName: 'Statistiques',
        apiPathPrefixes: ['/api/stats', '/api/statistics'],
        actionPathPrefixes: [
          '/api/statistics/detailed-metrics',
          '/api/statistics/dashboard-metrics',
          '/api/statistics/transaction-created-stats'
        ],
        icon: 'fa-file-chart-line'
      },
      {
        key: 'stats-graph',
        label: 'Graphiques',
        route: '/stats-report-graph',
        moduleName: 'Statistiques',
        apiPathPrefixes: ['/api/statistics'],
        actionPathPrefixes: ['/api/statistics/detailed-metrics', '/api/statistics/dashboard-metrics'],
        icon: 'fa-chart-line'
      },
      {
        key: 'stats-agency',
        label: 'Résumé agences',
        route: '/agency-summary',
        moduleName: 'Statistiques',
        apiPathPrefixes: ['/api/statistics', '/api/agency-summary'],
        actionPathPrefixes: ['/api/agency-summary'],
        icon: 'fa-building'
      }
    ]
  },
  {
    key: 'classements',
    label: 'Classements',
    icon: 'fa-trophy',
    moduleName: 'Classements',
    route: '/ranking'
  },
  {
    key: 'comptes',
    label: 'Comptes',
    icon: 'fa-wallet',
    children: [
      {
        key: 'comptes-main',
        label: 'Comptes',
        route: '/comptes',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/comptes', '/api/flux', '/api/supply'],
        icon: 'fa-wallet'
      },
      {
        key: 'comptes-redevance',
        label: 'Redevance loterie',
        route: '/redevance-loterie',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/redevance'],
        icon: 'fa-ticket-alt'
      },
      {
        key: 'comptes-balance',
        label: 'Service balance',
        route: '/service-balance',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/service-balance'],
        icon: 'fa-balance-scale'
      },
      {
        key: 'comptes-predictions',
        label: 'Prédictions',
        route: '/predictions',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/predictions'],
        icon: 'fa-brain'
      }
    ]
  },
  {
    key: 'operations',
    label: 'Opérations',
    icon: 'fa-exchange-alt',
    moduleName: 'Opérations',
    route: '/operations'
  },
  {
    key: 'frais-commissions',
    label: 'Frais & Commissions',
    icon: 'fa-money-bill-wave',
    children: [
      { key: 'frais', label: 'Frais', route: '/frais', moduleName: 'Frais', icon: 'fa-money-bill-wave' },
      { key: 'commission', label: 'Commission', route: '/commission', moduleName: 'Commission', icon: 'fa-hand-holding-usd' },
      { key: 'charge', label: 'Charge', route: '/charge', moduleName: 'Charge', icon: 'fa-file-invoice-dollar' }
    ]
  },
  {
    key: 'suivi-ecarts',
    label: 'Suivi des écarts',
    icon: 'fa-chart-line',
    children: [
      {
        key: 'suivi-overview',
        label: "Vue d'ensemble",
        route: '/suivi-des-ecarts',
        moduleName: 'TSOP',
        apiPathPrefixes: ['/api/suivi-ecart'],
        actionPathPrefixes: ['/api/suivi-ecart'],
        icon: 'fa-clipboard-list'
      },
      {
        key: 'suivi-tsop',
        label: 'Écart de solde',
        route: '/ecart-solde',
        moduleName: 'TSOP',
        apiPathPrefixes: ['/api/ecart-solde'],
        actionPathPrefixes: ['/api/ecart-solde'],
        icon: 'fa-exclamation-triangle'
      },
      { key: 'suivi-impact', label: 'Écart régularisé', route: '/impact-op', moduleName: 'Impact OP', icon: 'fa-chart-line' },
      { key: 'suivi-trx-sf', label: 'TRX SF', route: '/trx-sf', moduleName: 'TRX SF', icon: 'fa-exchange-alt' }
    ]
  },
  {
    key: 'banque',
    label: 'BANQUE',
    icon: 'fa-university',
    children: [
      {
        key: 'banque-main',
        label: 'Banque',
        route: '/banque',
        moduleName: 'BANQUE',
        apiPathPrefixes: ['/api/banque', '/api/releve-bancaire'],
        icon: 'fa-university'
      },
      {
        key: 'banque-dashboard',
        label: 'Dashboard banque',
        route: '/banque-dashboard',
        moduleName: 'BANQUE',
        apiPathPrefixes: ['/api/banque-dashboard', '/api/releve-bancaire'],
        actionPathPrefixes: ['/api/banque-dashboard', '/api/releve-bancaire/list'],
        icon: 'fa-chart-bar'
      }
    ]
  },
  {
    key: 'comptabilite',
    label: 'Comptabilité',
    icon: 'fa-book',
    moduleName: 'Comptabilité',
    route: '/comptabilite'
  },
  {
    key: 'modeles',
    label: 'Modèles de Traitement',
    icon: 'fa-cogs',
    moduleName: 'Modèles',
    route: '/auto-processing-models'
  },
  {
    key: 'aide',
    label: 'AIDE',
    icon: 'fa-question-circle',
    children: [
      { key: 'aide-main', label: 'Aide', route: '/aide', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/aide'], icon: 'fa-question-circle' },
      { key: 'aide-guide', label: 'Guide utilisation', route: '/guide-utilisation', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/guide-nodes', '/api/guide-documents'], icon: 'fa-book-open' },
      { key: 'aide-sop-op', label: 'SOP Opérations', route: '/sop-operation', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/sop-nodes', '/api/sop-documents'], icon: 'fa-tasks' },
      { key: 'aide-sop-reco', label: 'SOP Réconciliation TRX', route: '/sop-reconciliation-trx', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/sop-nodes', '/api/sop-documents'], icon: 'fa-file-invoice' }
    ]
  },
  {
    key: 'parametre',
    label: 'Paramètre',
    icon: 'fa-cog',
    adminOnly: true,
    children: [
      { key: 'param-users', label: 'Utilisateur', route: '/users', moduleName: 'Utilisateur', icon: 'fa-user' },
      { key: 'param-profils', label: 'Profil', route: '/profils', moduleName: 'Profil', icon: 'fa-id-badge' },
      { key: 'param-modules', label: 'Module', route: '/modules', moduleName: 'Module', icon: 'fa-cube' },
      { key: 'param-permissions', label: 'Permission', route: '/permissions', moduleName: 'Permission', icon: 'fa-key' },
      { key: 'param-logs', label: 'Log utilisateur', route: '/log-utilisateur', moduleName: 'Log utilisateur', icon: 'fa-history' }
    ]
  }
];

function countSiblingsWithSameModule(group: AppNavigationGroup, submenu: AppNavigationSubmenu): number {
  return (group.children || []).filter(child => child.moduleName === submenu.moduleName).length;
}

function inferApiPathPrefixes(route: string, moduleName: string): string[] {
  const normalizedRoute = route.replace(/\/+$/, '') || '/';
  if (normalizedRoute.startsWith('/api/')) {
    return [normalizedRoute];
  }
  const apiRoute = `/api${normalizedRoute}`;
  return [apiRoute];
}

/** Indique si le groupe utilise des droits distincts par sous-menu. */
export function groupUsesGranularSubmenuAccess(group: AppNavigationGroup): boolean {
  if (!group.children?.length) {
    return false;
  }
  const moduleCounts = new Map<string, number>();
  for (const child of group.children) {
    moduleCounts.set(child.moduleName, (moduleCounts.get(child.moduleName) || 0) + 1);
  }
  return [...moduleCounts.values()].some(count => count > 1);
}

export function resolveSubmenuAccessModuleName(group: AppNavigationGroup, submenu: AppNavigationSubmenu): string {
  if (submenu.accessModuleName?.trim()) {
    return submenu.accessModuleName.trim();
  }
  if (countSiblingsWithSameModule(group, submenu) <= 1) {
    return submenu.moduleName;
  }
  return `${submenu.moduleName}${NAV_SUBMENU_ACCESS_SEPARATOR}${submenu.label}`;
}

export function resolveSubmenuApiPathPrefixes(submenu: AppNavigationSubmenu): string[] {
  if (submenu.apiPathPrefixes?.length) {
    return [...submenu.apiPathPrefixes];
  }
  return inferApiPathPrefixes(submenu.route, submenu.moduleName);
}

export function resolveSubmenuActionPathPrefixes(submenu: AppNavigationSubmenu): string[] {
  if (submenu.actionPathPrefixes?.length) {
    return [...submenu.actionPathPrefixes];
  }
  return resolveSubmenuApiPathPrefixes(submenu);
}

export function buildNavigationAccessContext(
  group: AppNavigationGroup,
  submenu?: AppNavigationSubmenu
): NavigationAccessContext | null {
  if (submenu) {
    const accessModuleName = resolveSubmenuAccessModuleName(group, submenu);
    return {
      group,
      submenu,
      accessModuleName,
      apiModuleName: submenu.moduleName,
      apiPathPrefixes: resolveSubmenuApiPathPrefixes(submenu),
      actionPathPrefixes: resolveSubmenuActionPathPrefixes(submenu),
      route: submenu.route,
      label: submenu.label,
      key: submenu.key,
      usesGranularAccess: accessModuleName !== submenu.moduleName
    };
  }

  if (!group.moduleName || !group.route) {
    return null;
  }

  return {
    group,
    accessModuleName: group.moduleName,
    apiModuleName: group.moduleName,
    apiPathPrefixes: inferApiPathPrefixes(group.route, group.moduleName),
    actionPathPrefixes: inferApiPathPrefixes(group.route, group.moduleName),
    route: group.route,
    label: group.label,
    key: group.key,
    usesGranularAccess: false
  };
}

export function getAllNavigationAccessContexts(): NavigationAccessContext[] {
  const contexts: NavigationAccessContext[] = [];
  for (const group of APP_NAVIGATION_CATALOG) {
    if (group.children?.length) {
      for (const submenu of group.children) {
        const context = buildNavigationAccessContext(group, submenu);
        if (context) {
          contexts.push(context);
        }
      }
      continue;
    }
    const context = buildNavigationAccessContext(group);
    if (context) {
      contexts.push(context);
    }
  }
  return contexts;
}

export function findNavigationAccessContextByRoute(route: string): NavigationAccessContext | undefined {
  const normalized = route.split('?')[0].replace(/\/+$/, '') || '/';
  return getAllNavigationAccessContexts().find(context => {
    const contextRoute = context.route.replace(/\/+$/, '') || '/';
    return normalized === contextRoute || normalized.startsWith(`${contextRoute}/`);
  });
}

export function findNavigationAccessContextByAccessModuleName(
  accessModuleName: string
): NavigationAccessContext | undefined {
  const normalized = accessModuleName.trim().toLowerCase();
  return getAllNavigationAccessContexts().find(
    context => context.accessModuleName.trim().toLowerCase() === normalized
  );
}

export function findNavigationAccessContextByModuleName(
  moduleName: string
): NavigationAccessContext | undefined {
  const normalized = moduleName.trim().toLowerCase();
  return getAllNavigationAccessContexts().find(context =>
    context.accessModuleName.trim().toLowerCase() === normalized
    || context.apiModuleName.trim().toLowerCase() === normalized
  );
}

/** Modules distincts référencés dans le catalogue (API + navigation). */
export function getNavigationCatalogModuleNames(): string[] {
  const names = new Set<string>();
  for (const context of getAllNavigationAccessContexts()) {
    names.add(context.apiModuleName);
    names.add(context.accessModuleName);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
}
