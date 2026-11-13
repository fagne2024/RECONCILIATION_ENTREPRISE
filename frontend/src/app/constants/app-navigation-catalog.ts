/**
 * Catalogue des menus / sous-menus de l'application (aligné sur la sidebar).
 * moduleName = module API métier ; accessModuleName = droits navigation par sous-menu.
 */
export const NAV_SUBMENU_ACCESS_SEPARATOR = ' · ';

export interface AppNavigationSubmenu {
  key: string;
  label: string;
  /** Clé de traduction (i18n) pour l'affichage dans la sidebar. Le `label` reste utilisé pour les droits d'accès. */
  labelKey?: string;
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
  /** Visibilité du sous-menu. Si false, le sous-menu est masqué même si le module parent est visible. */
  visible?: boolean;
  /** Réservé aux administrateurs (le sous-menu reste masqué pour les autres profils). */
  adminOnly?: boolean;
  /** Réservé aux SUPER_ADMIN de la plateforme (masqué pour les admins d'entreprise). */
  superAdminOnly?: boolean;
  /** Sous-menu de 3e niveau (ex: Configuration > Modèles de Traitement). */
  children?: AppNavigationSubmenu[];
}

export interface AppNavigationGroup {
  key: string;
  label: string;
  /** Clé de traduction (i18n) pour l'affichage dans la sidebar. Le `label` reste utilisé pour les droits d'accès. */
  labelKey?: string;
  icon?: string;
  /** Menu sans sous-menu : module et route directs. */
  moduleName?: string;
  route?: string;
  children?: AppNavigationSubmenu[];
  adminOnly?: boolean;
  /** Réservé aux SUPER_ADMIN de la plateforme (masqué pour les admins d'entreprise). */
  superAdminOnly?: boolean;
  /** Visibilité du groupe/module. Si false, tout le groupe est masqué (y compris les enfants). */
  visible?: boolean;
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
    labelKey: 'NAV.dashboard',
    icon: 'fa-tachometer-alt',
    moduleName: 'Dashboard',
    route: '/dashboard'
  },
  {
    key: 'traitement',
    label: 'Traitement',
    labelKey: 'NAV.traitement',
    icon: 'fa-tools',
    moduleName: 'Traitement',
    route: '/traitement'
  },
  {
    key: 'reconciliation',
    label: 'Réconciliation',
    labelKey: 'NAV.reconciliation',
    icon: 'fa-file-upload',
    children: [
      {
        key: 'reco-launcher',
        label: 'Lanceur',
        labelKey: 'NAV.reconciliationLauncher',
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
        labelKey: 'NAV.reconciliationManual',
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
        labelKey: 'NAV.reconciliationAssisted',
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
        labelKey: 'NAV.certificationSolde',
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
          '/api/certification-solde-resultats',
          '/api/auto-processing'
        ],
        icon: 'fa-balance-scale'
      }
    ]
  },
  {
    key: 'resultats',
    label: 'Résultats',
    labelKey: 'NAV.results',
    icon: 'fa-poll',
    children: [
      {
        key: 'res-overview',
        label: "Vue d'ensemble", labelKey: 'NAV.resultsOverview',
        route: '/results',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/results', '/api/result8rec', '/api/report-dashboard'],
        actionPathPrefixes: ['/api/results', '/api/result8rec', '/api/report-dashboard', '/api/reconciliation/results/summary'],
        icon: 'fa-poll'
      },
      {
        key: 'res-etat-reconciliations',
        label: 'État des réconciliations',
        labelKey: 'NAV.etatReconciliations',
        route: '/etat-reconciliations',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/result8rec'],
        icon: 'fa-clipboard-list'
      },
      {
        key: 'res-matches',
        label: 'Correspondances',
        labelKey: 'NAV.matches',
        route: '/matches',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation/results/matches', '/api/reconciliation/mark-ok', '/api/result8rec'],
        icon: 'fa-check-double'
      },
      {
        key: 'res-ecart-bo',
        label: 'Écarts BO',
        labelKey: 'NAV.ecartBo',
        route: '/ecart-bo',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation/results/bo-only', '/api/reconciliation/status', '/api/result8rec'],
        icon: 'fa-exclamation-circle'
      },
      {
        key: 'res-ecart-part',
        label: 'Écarts Partenaire',
        labelKey: 'NAV.ecartPartner',
        route: '/ecart-partner',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation/results/partner-only', '/api/result8rec'],
        icon: 'fa-exclamation-triangle'
      },
      {
        key: 'res-ecart-summary',
        label: 'Suivi des écarts J-1 & J+1',
        labelKey: 'NAV.ecartTracking',
        route: '/ecart-bo-summary',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/ecart-bo-summary'],
        actionPathPrefixes: ['/api/ecart-bo-summary'],
        icon: 'fa-list-alt'
      },
      {
        key: 'res-report',
        label: 'Rapport réconciliation',
        labelKey: 'NAV.rapportReconciliation',
        route: '/reconciliation-report',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/reconciliation-report', '/api/result8rec'],
        actionPathPrefixes: ['/api/reconciliation-report', '/api/result8rec'],
        icon: 'fa-file-alt'
      },
      {
        key: 'res-bo-part',
        label: 'Rapport BO vs Partenaire',
        labelKey: 'NAV.rapportBoPartenaire',
        route: '/rapport-reconciliation-bo-partenaire',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/result8rec'],
        actionPathPrefixes: ['/api/result8rec'],
        icon: 'fa-file-contract'
      },
      {
        key: 'res-controle-interne',
        label: 'Contrôle interne BO vs Partenaire',
        labelKey: 'NAV.controleInterne',
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
      },
      {
        key: 'res-suivi-trx-a-annuler',
        label: 'Suivi TRX à annuler',
        labelKey: 'NAV.suiviTrxAnnuler',
        route: '/suivi-trx-a-annuler',
        moduleName: 'Résultats',
        apiPathPrefixes: ['/api/suivi-trx-a-annuler'],
        actionPathPrefixes: ['/api/suivi-trx-a-annuler'],
        icon: 'fa-ban'
      }
    ]
  },
  {
    key: 'statistiques',
    label: 'Statistiques',
    labelKey: 'NAV.statistics',
    icon: 'fa-chart-bar',
    children: [
      {
        key: 'stats-main',
        label: 'Statistiques',
        labelKey: 'NAV.statistics',
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
        labelKey: 'NAV.statisticsReport',
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
        labelKey: 'NAV.statisticsGraphs',
        route: '/stats-report-graph',
        moduleName: 'Statistiques',
        apiPathPrefixes: ['/api/statistics'],
        actionPathPrefixes: ['/api/statistics/detailed-metrics', '/api/statistics/dashboard-metrics'],
        icon: 'fa-chart-line'
      }
    ]
  },
  {
    key: 'classements',
    label: 'Classements',
    labelKey: 'NAV.ranking',
    icon: 'fa-trophy',
    moduleName: 'Classements',
    route: '/ranking'
  },
  {
    key: 'comptes',
    label: 'Comptes',
    labelKey: 'NAV.accounts',
    icon: 'fa-wallet',
    children: [
      {
        key: 'comptes-main',
        label: 'Comptes',
        labelKey: 'NAV.accounts',
        route: '/comptes',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/comptes', '/api/flux', '/api/supply'],
        icon: 'fa-wallet'
      },
      {
        key: 'comptes-redevance',
        label: 'Redevance loterie',
        labelKey: 'NAV.lotteryFee',
        route: '/redevance-loterie',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/redevance'],
        icon: 'fa-ticket-alt'
      },
      {
        key: 'comptes-balance',
        label: 'Équilibre des services',
        labelKey: 'NAV.serviceBalance',
        route: '/service-balance',
        moduleName: 'Comptes',
        apiPathPrefixes: ['/api/service-balance'],
        icon: 'fa-balance-scale'
      },
      {
        key: 'comptes-predictions',
        label: 'Prédictions',
        labelKey: 'NAV.predictions',
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
    labelKey: 'NAV.operations',
    icon: 'fa-exchange-alt',
    moduleName: 'Opérations',
    route: '/operations'
  },
  {
    key: 'frais-commissions',
    label: 'Frais & Commissions',
    labelKey: 'NAV.feesCommission',
    icon: 'fa-money-bill-wave',
    children: [
      { key: 'frais', label: 'Frais', labelKey: 'NAV.fees', route: '/frais', moduleName: 'Frais', icon: 'fa-money-bill-wave' },
      { key: 'commission', label: 'Commission', labelKey: 'NAV.commission', route: '/commission', moduleName: 'Commission', icon: 'fa-hand-holding-usd' },
      { key: 'charge', label: 'Charge', labelKey: 'NAV.charge', route: '/charge', moduleName: 'Charge', icon: 'fa-file-invoice-dollar' }
    ]
  },
  {
    key: 'suivi-ecarts',
    label: 'Suivi des écarts',
    labelKey: 'NAV.suiviEcarts',
    icon: 'fa-chart-line',
    children: [
      {
        key: 'suivi-tsop',
        label: 'Écart de solde',
        labelKey: 'NAV.ecartSolde',
        route: '/ecart-solde',
        moduleName: 'TSOP',
        apiPathPrefixes: ['/api/ecart-solde'],
        actionPathPrefixes: ['/api/ecart-solde'],
        icon: 'fa-exclamation-triangle'
      },
      { key: 'suivi-impact', label: 'Écart régularisé', labelKey: 'NAV.ecartRegularise', route: '/impact-op', moduleName: 'Impact OP', icon: 'fa-chart-line' },
      { key: 'suivi-oppart', label: 'OPPART', labelKey: 'NAV.oppart', route: '/oppart', moduleName: 'OPPART', apiPathPrefixes: ['/api/oppart'], actionPathPrefixes: ['/api/oppart'], icon: 'fa-list-alt' },
      { key: 'suivi-trx-sf', label: 'TRX SF', labelKey: 'NAV.trxSf', route: '/trx-sf', moduleName: 'TRX SF', icon: 'fa-exchange-alt' }
    ]
  },
  {
    key: 'banque',
    label: 'BANQUE',
    labelKey: 'NAV.bank',
    icon: 'fa-university',
    children: [
      {
        key: 'banque-main',
        label: 'Banque',
        labelKey: 'NAV.bank',
        route: '/banque',
        moduleName: 'BANQUE',
        // Droit unique BANQUE conservé malgré deux sous-menus (pas de droits granulaires à réattribuer).
        accessModuleName: 'BANQUE',
        apiPathPrefixes: ['/api/banque', '/api/releve-bancaire', '/api/operations-bancaires'],
        icon: 'fa-university'
      },
      {
        key: 'banque-etat-reconciliation',
        label: 'État de réconciliation bancaire',
        labelKey: 'NAV.etatReconciliationBancaire',
        route: '/etat-reconciliation-bancaire',
        moduleName: 'BANQUE',
        accessModuleName: 'BANQUE',
        apiPathPrefixes: ['/api/releve-bancaire'],
        icon: 'fa-clipboard-list'
      }
    ]
  },
  {
    key: 'comptabilite',
    label: 'Comptabilité',
    labelKey: 'NAV.accounting',
    icon: 'fa-book',
    moduleName: 'Comptabilité',
    route: '/comptabilite'
  },
  {
    key: 'aide',
    label: 'NAV.aide',
    icon: 'fa-question-circle',
    children: [
      { key: 'aide-main', label: 'Aide', labelKey: 'NAV.help', route: '/aide', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/aide'], icon: 'fa-question-circle' },
      { key: 'aide-guide', label: 'Guide utilisation', labelKey: 'NAV.guide', route: '/guide-utilisation', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/guide-nodes', '/api/guide-documents'], icon: 'fa-book-open' },
      { key: 'aide-sop-op', label: 'SOP Opérations', labelKey: 'NAV.sopOperations', route: '/sop-operation', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/sop-nodes', '/api/sop-documents'], icon: 'fa-tasks' },
      { key: 'aide-sop-reco', label: 'SOP Réconciliation TRX', labelKey: 'NAV.sopReconciliation', route: '/sop-reconciliation-trx', moduleName: 'AIDE', apiPathPrefixes: ['/api/aide'], actionPathPrefixes: ['/api/sop-nodes', '/api/sop-documents'], icon: 'fa-file-invoice' }
    ]
  },
  {
    key: 'parametre',
    label: 'Paramètre',
    labelKey: 'NAV.settings',
    icon: 'fa-cog',
    adminOnly: true,
    children: [
      { key: 'param-users', label: 'Utilisateur', labelKey: 'NAV.users', route: '/users', moduleName: 'Utilisateur', icon: 'fa-user' },
      { key: 'param-profils', label: 'Profil', labelKey: 'NAV.profiles', route: '/profils', moduleName: 'Profil', icon: 'fa-id-badge' },
      { key: 'param-modules', label: 'Module', labelKey: 'NAV.modules', route: '/modules', moduleName: 'Module', icon: 'fa-cube' },
      { key: 'param-permissions', label: 'Permission', labelKey: 'NAV.permissions', route: '/permissions', moduleName: 'Permission', icon: 'fa-key' },
      { key: 'param-logs', label: 'Log utilisateur', labelKey: 'NAV.userLog', route: '/log-utilisateur', moduleName: 'Log utilisateur', icon: 'fa-history' },
      { key: 'param-2fa', label: 'Sécurité (2FA)', labelKey: 'NAV.security2fa', route: '/two-factor-auth', moduleName: 'Sécurité', adminOnly: true, icon: 'fa-shield-alt' }
    ]
  },
  {
    key: 'configuration',
    label: 'NAV.configuration',
    icon: 'fa-sliders-h',
    moduleName: 'Configuration',
    // Pas adminOnly au niveau du groupe : « Niveaux de validation » est attribuable
    // à un profil ; les autres sous-menus restent réservés aux administrateurs.
    children: [
      { key: 'param-modeles', label: 'NAV.models', route: '/auto-processing-models', moduleName: 'Modèles', apiPathPrefixes: ['/api/auto-processing-models'], icon: 'fa-cogs', adminOnly: true },
      { key: 'param-niveaux-validation-reco', label: 'NAV.niveauValidationReco', route: '/configuration/niveaux-validation-reco', moduleName: 'NiveauValidationReco', icon: 'fa-list-ol' },
      { key: 'param-renommer', label: 'Renommer', labelKey: 'NAV.rename', route: '/configuration/renommer', moduleName: 'Configuration', apiPathPrefixes: ['/api/configuration/rename'], icon: 'fa-edit', adminOnly: true },
      { key: 'param-calcul', label: 'Calcul', labelKey: 'NAV.calcul', route: '/configuration/calcul', moduleName: 'Configuration', apiPathPrefixes: ['/api/configuration/calcul'], icon: 'fa-calculator', adminOnly: true },
      { key: 'param-normalisation-modele', label: 'Normalisation modèle', labelKey: 'NAV.modelNormalization', route: '/configuration/normalisation-modele', moduleName: 'Configuration', apiPathPrefixes: ['/api/configuration/normalisation'], icon: 'fa-random', adminOnly: true },
      { key: 'param-top-users', label: 'Top utilisateurs', labelKey: 'NAV.topUsers', route: '/configuration/top-users', moduleName: 'Configuration', apiPathPrefixes: ['/api/configuration/top-users'], icon: 'fa-star', adminOnly: true },
      { key: 'param-logo', label: 'Logo', labelKey: 'NAV.logo', route: '/configuration/logo', moduleName: 'Configuration', apiPathPrefixes: ['/api/configuration/logo'], icon: 'fa-image', adminOnly: true }
    ]
  },
  {
    key: 'administration-plateforme',
    label: 'Administration plateforme',
    labelKey: 'NAV.platformAdmin',
    icon: 'fa-server',
    adminOnly: true,
    superAdminOnly: true,
    children: [
      { key: 'admin-entreprises', label: 'Entreprises', labelKey: 'NAV.companies', route: '/platform/entreprises', moduleName: 'Entreprise', icon: 'fa-building', superAdminOnly: true },
      { key: 'admin-modules', label: 'Modules par entreprise', labelKey: 'NAV.modulesPerCompany', route: '/platform/modules', moduleName: 'Module', icon: 'fa-cubes', superAdminOnly: true },
      { key: 'admin-comptes', label: 'Comptes', labelKey: 'NAV.accounts', route: '/platform/comptes', moduleName: 'Compte', icon: 'fa-users', superAdminOnly: true },
      { key: 'admin-audit', label: 'Journal d\'audit', labelKey: 'NAV.auditLog', route: '/platform/audit', moduleName: 'Log utilisateur', icon: 'fa-history', superAdminOnly: true }
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
        // Sous-menus de 3e niveau
        for (const nested of submenu.children || []) {
          const nestedContext = buildNavigationAccessContext(group, nested);
          if (nestedContext) {
            contexts.push(nestedContext);
          }
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