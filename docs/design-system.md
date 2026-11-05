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
- Logo + « Appliquer le design » : `ThemeService` surcharge `--color-accent`,
  `--color-nav-bg`, `--color-bg` (clair) et `--color-info`. Sans design
  entreprise, la palette mission s’applique. `reset` / suppression du logo
  retire les surcharges.
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

## Écrans migrés (phase 4, étape 6)

Shell : `--sidebar-width: 350px` ; bascule toujours visible (`type="button"`) ;
overlay sous 768 px. La sidebar conserve `--theme-sidebar-*` (marque
entreprise) ; le chrome applicatif utilise `--color-accent`.

Pages rd26 et métier : `ranking`, `redevance-loterie`, `frais`, `commission`,
`comptabilite`, `banque`, `dashboard`, `operations`, `stats`, `stats-report`,
`stats-report-graph`, `ecart-solde`, `impact-op`, `trx-sf`, `service-balance`,
`service-references`, `predictions-new`, `comptes`, `oppart-list`.

Administration et profil : `profil`, `profil-detail`, `modules`, `permissions`,
`two-factor-auth`, `sop-operation`, `configuration-renommer`,
`platform-modules`, `platform-comptes`, `platform-entreprises`,
`platform-audit`, `users`, `configuration-top-users`, `configuration-calcul`,
`aide`, `user-log`, `configuration-logo`.

Auth : `login` (accent `--color-accent`, pas `--theme-primary` /
`--theme-info`), `reset-password`. Fond QR `#FFFFFF` (lisibilité du scan).

Les couleurs d’identité de catégorie (icônes menu, `--agents` /
`--responsables` / `--validateurs` sur `configuration-top-users`) sont
conservées.

## Nettoyage final (étape 8)

- I1 : `html`/`body` `overflow-y: auto` une seule fois ; plus de
  `.ng-star-inserted`, `[class*="-container"]`, script Chrome d’overflow
  dans `index.html`, ni `enableMouseScroll()` sur `*`. Overlay CDK :
  `z-index: var(--z-overlay)`.
- Polices (D5) : CDN Google Fonts **Sora** + **Instrument Serif** conservé.
  Plus Jakarta Sans et le double chargement Roboto sont absents. Roboto
  reste uniquement en repli de `--font-ui`.
- `.i18n-switch--login` : plus de bleu Material `rgba(33,150,243)` ;
  tokens `--color-nav-text*` (le sélecteur repose sur le chrome teal).
- `.btn` global conservé en compatibilité (classes historiques encore
  présentes à côté de `ds-btn`).

## Pages restantes (leftover)

Migrées vers les tokens globaux (bloc `--rd-*` local retiré, `ds-*` sur
les contrôles natifs, `type="button"` conservé ou ajouté, Material
`mat-*` non recouvert) : `auto-processing-models`, `traitement`,
`sop-reconciliation-trx`, `niveaux-validation-reco`, `predictions`,
`reconciliation`, `user-2fa-dialog`.

Les topnav marine restent sur `--rd-navy` / `--color-nav-bg`. Les
couleurs d’identité d’agrégation (`--agg-mode`, `--agg-bo`) sont
conservées. Un design entreprise actif teinte aussi les topnavs
(`--rd-navy` → `--color-nav-bg`) et le chrome de connexion.

## I11 — z-index

Les superpositions dures (`9999`, `10000`, `11000`, `99999`, `9999999`,
`2147483002`, ainsi que `100` / `1000` / `1500` / `2000` / `3000`)
utilisent l’échelle `--z-sticky` … `--z-overlay`. Les petits `z-index`
(1–22) de stacking interne (barres de progression, calques) restent
relatifs.

## I12 — mouvement

`prefers-reduced-motion` est dans `_base.scss`. Les `transition: all` et
les durées `0.15s` / `0.2s` / `0.3s ease` des feuilles de style
utilisent `--duration-*` et `--ease-standard`.

## D9 — icônes

Les emoji des boutons, KPI et onglets sont remplacés par Font Awesome.
Les clés i18n qui contiennent un emoji (`TRT.💡…`) sont inchangées.
Les `console.log` ne sont pas concernés.

## Vérifications non faites ici

Contrôle visuel 1440 / 768 / 360 px et clair/sombre dans un navigateur :
à faire au regard. Le serveur de dev (`localhost:4200`) compile ; le
build production est le critère de la page démo (route absente).
