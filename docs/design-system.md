# Système de design ReconciliApp

Date : 16/10/2026. Conforme au code livré sur `refonte-design` (Angular 14.2).

La page `/design-system` est déclarée dans `design-system.routes.ts` (serveur
de développement). En configuration **production**, `angular.json` remplace
ce fichier par `design-system.routes.prod.ts` (tableau vide) : ni la route
ni le chunk ne sont émis. (`isDevMode()` seul ne suffit pas : le bundler
conserve l’`import()` dynamique.)

Contrastes des paires de tokens : `docs/tokens-contraste.md`.

## Tokens

Source unique : `frontend/src/styles/_tokens.scss`.

- Thème clair sur `:root`, sombre sur `:root[data-theme='dark']`.
- Choix persistant via `ThemeService.setThemeMode` (`light` | `dark` | `system`).
- La marque entreprise (logo, couleurs sidebar) ne pilote **pas** `--color-accent`.
- Alias `--rd-*` : pages dont le bloc `:host { --rd-*: #… }` a été retiré.

Palette mission (clair) : fond `#F2EEE4`, accent `#1D5C63`. Les contrôles
utilisent `--color-border-strong` (≥ 3:1). `--color-border` est décoratif.

## Classes `ds-*`

Définies dans `frontend/src/styles/_components.scss`. Elles ne s’appliquent
qu’aux éléments qui portent explicitement la classe.

| Classe | Usage |
|---|---|
| `ds-btn`, `--primary`, `--secondary`, `--ghost`, `--danger`, `--sm`, `--lg` | Boutons |
| `ds-input`, `ds-select`, `ds-textarea`, `ds-checkbox`, `ds-radio` | Champs natifs |
| `ds-filter-bar`, `ds-field`, `ds-label` | Barre de filtres |
| `ds-table`, `ds-table-scroll` | Tableaux |
| `ds-badge`, `--matched`, `--type-appro`, `--tone-success`… | Pastilles |
| `ds-num` | Nombres tabulaires |
| `ds-kpi-strip` | Bande KPI claire (ne pas poser sur un hero marine) |
| `ds-topnav` | Barre supérieure (optionnelle ; les topnav dupliqués sont conservés) |

`mat-select` / `mat-form-field` : ne pas ajouter `ds-select` (conflit de chrome).

## Composants standalone (`src/app/shared/ui/`)

Entrées / sorties uniquement. Réexport : `DS_UI`.

| Sélecteur | Rôle |
|---|---|
| `ds-page-header` | Titre, surtitre, actions projetées (`dsPageHeaderActions`) |
| `ds-kpi-card` | Valeur + libellé ; `tone`, `loading` |
| `ds-status-badge` | Statut déjà calculé par la page (`matched`, `boOnly` visuel = `missing-statement`, etc.) |
| `ds-type-badge` | Type d’opération visuel |
| `ds-pagination` | `(pageChange)` / `(pageSizeChange)` → méthodes existantes (`goToPage`) |
| `ds-tabs` | `(activeIdChange)` ; panneaux dans la page |
| `ds-state` | Vide / chargement / erreur |

NgModule : `SharedUiModule` est exporté par `AppModule`. Standalone : importer
`DsPaginationComponent` (ou `DS_UI`) dans `imports`.

## Règles de migration (rappel)

- Bindings, `*ngIf` / `*ngFor`, appels API, routes et gardes inchangés.
- Pagination : `ds-pagination` seulement s’il existe un saut de page
  (`goToPage`). Sinon prev/next + `ds-btn`.
- Fichiers inline (`template:` / `styles:`) : édition des chaînes seulement.

## Écrans migrés (phase 4, étape 5)

`matches-table`, `ecart-bo-table`, `ecart-partner-table`, `ecart-bo-summary`,
`rapport-reconciliation-bo-partenaire`, `controle-interne-bo-partenaire`,
`reconciliation-results`, `reconciliation-report`, `etat-reconciliations`,
`dashboard-reconciliation`, `reconciliation-global-preview`,
`reconciliation-launcher`, `file-upload`, `column-selection`,
`certification-solde`.

Hors périmètre immédiat (étape 6 de l’audit) : shell/sidebar restant, pages
rd26 hors réconciliation, administration.

## Vérifications non faites ici

Contrôle visuel 1440 / 768 / 360 px et clair/sombre dans un navigateur :
pas d’outil navigateur disponible sur cette session. Le serveur de dev
(`localhost:4300`) compile ; le build production est le critère de la page
démo (route absente).
