# Audit design — ReconciliApp (Phase 1)

> Date : 16/10/2026 · Branche inspectée : `main` (commit `6b8fbe7`) · Périmètre : `frontend/`
>
> Ce document repose **uniquement sur l'analyse du code source** et sur des commandes exécutées localement (build, tests, comptages, calcul de contrastes). **Aucun écran n'a été inspecté visuellement** : l'application n'a pas été lancée dans un navigateur (backend, base MySQL et identifiants non mobilisés pendant cet audit). Toute affirmation sur le rendu réel est donc une déduction depuis le code et doit être confirmée manuellement.

---

## 1. Résumé exécutif

1. **Le projet n'est pas en Angular 20 mais en Angular 14.2.0** (`@angular/core` 14.2.0, Material/CDK 14.2.7, TypeScript 4.8.4, vérifié dans `node_modules`). Les signals et le nouveau control flow (`@if`, `@for`) **n'existent pas** dans cette version : 0 occurrence de `signal(` et de `@if (`, 2 695 occurrences de `*ngIf` / `*ngFor`. Le design system doit être conçu pour Angular 14. Une montée de version est un projet distinct qui nécessite une décision (voir §17).
2. **Il n'y a pas de bibliothèque UI dominante.** Angular Material est installé mais n'est utilisé que pour les listes déroulantes (`mat-select` + `ngx-mat-select-search`), quelques champs et quelques boutons. Tables, pagination, onglets, menus, cases à cocher, modales et notifications sont **faits main** (HTML natif + SCSS par composant).
3. **Un design system de fait existe déjà, mais il est copié-collé.** Une palette chaude (fond crème `#F2F0EB`, marine `#1A2535`, Sora + Instrument Serif) est définie sous forme de variables `--rd-*` **dans 39 fichiers de composants**, en **8 variantes différentes** (de 9 à 29 variables). D'autres pages ont leurs propres variables (`--bg`, `--navy`, `--ink`…) avec des valeurs proches mais différentes. Une 3ᵉ palette chaude apparaît dans `reconciliation-launcher` et dans `docs/*-reference.html`. La palette cible de la mission (`#F2EEE4`, `#1D5C63`…) est une 4ᵉ variante.
4. **Les valeurs en dur sont massives** : 798 couleurs hexadécimales distinctes, 105 tailles de police distinctes, 53 rayons distincts, 414 ombres distinctes, 35 niveaux de `z-index` distincts (de `1` à `2147483002`), 219 `!important`, 38 `::ng-deep`.
5. **Les feuilles globales contiennent des règles à fort risque** : `.ng-star-inserted { position: relative; z-index: 1; }` (s'applique à presque tous les éléments rendus par `*ngIf`/`*ngFor`), `[class*="-container"] { overflow-y: auto !important; }`, un script dans `index.html` qui force `overflow-y: auto` sur **tous** les éléments. Elles conditionnent la mise en page de toutes les pages et sont un **obstacle P0** à toute harmonisation.
6. **Deux écrans critiques ont leur template et leurs styles inline dans le TypeScript** : `reconciliation-report.component.ts` (577 Ko) et `reconciliation-results.component.ts` (418 Ko). Toute migration visuelle de ces écrans implique de modifier des fichiers `.ts` qui contiennent aussi la logique métier.
7. **Les dialogues sont construits manuellement dans le DOM** par `ModernPopupComponent` (méthodes statiques, `document.createElement`, CSS injecté sous forme de chaînes) et appelés via `PopupService` (≈ 811 appels dans 40 fichiers). Il n'y a ni piégeage du focus, ni `role="dialog"` dans ce chemin, et deux styles visuels concurrents coexistent dans le même fichier.
8. **Accessibilité et responsive sont faibles côté code** : 16 `:focus-visible` contre 140 `outline: none|0`, 2 `prefers-reduced-motion`, 1 seule région `aria-live`, 182 éléments non interactifs (`div`, `span`, `tr`, `li`…) portant un `(click)`, barre latérale fixe de 350 px sans aucun point de rupture.
9. **Un `ThemeService` existe déjà** et réécrit des variables CSS (`--theme-*`, `--primary-color`…) à partir des couleurs du logo de chaque entreprise (persistance `localStorage` + API `/api/configuration/theme`). Le nouveau système de thèmes devra composer avec ce mécanisme de marque blanche.
10. **État de référence** : `npm run build` réussit (exit 0, 4 min 20 s) avec 33 avertissements préexistants ; `jest` : 6 suites passées, 72 tests réussis, 2 ignorés. Aucun test ne couvre un composant de page.

**Recommandation principale** : ne pas créer une bibliothèque parallèle, mais **promouvoir le système `--rd-*` existant en tokens globaux** (avec alias de compatibilité), puis supprimer page par page les blocs de variables locaux. Cette approche est purement CSS, donc progressive et à faible risque fonctionnel.

---

## 2. État du dépôt et méthode

### 2.1. État Git constaté (avant toute intervention)

| Élément | Constat |
|---|---|
| Racine | `C:/Users/TOUCH_FINANCE/OneDrive - Intouchgroup/Bureau/reconciliation-app` |
| Branche courante | `main` (seule branche locale, aucune branche distante listée) |
| Historique | 1 commit : `6b8fbe7 Initial commit : application de reconciliation (backend Spring Boot + frontend Angular 14)` |
| Branche `refonte-design` | N'existe pas |
| `git status` | **110 entrées** dont **45 dans `frontend/`** : fichiers modifiés (M) et supprimés (D), plus des fichiers non suivis côté backend |
| Fichiers frontend modifiés par l'utilisateur | `angular.json` (ajout `cli.cache.enabled: false`), `auto-processing-models.component.{css,html,ts}`, `ecart-bo-summary.component.{html,scss,ts}`, `file-upload.component.ts`, `platform-modules.component.{html,scss,ts}`, `login.component.{html,ts}`, `dashboard-reconciliation.service.ts`, `file-watcher.service.ts`, `bilingual-column.util.ts`, `assets/i18n/en.json`, `assets/i18n/fr.json` |
| Fichiers frontend supprimés par l'utilisateur (non commités) | dont `proxy.conf.js`, `environments/environment.prod.ts`, `auto-processing-models.component.scss`, `column-selection.component.scss`, `reconciliation-results.component.scss`, `profil.component.module-selection.scss`, `services/reconciliation/*`, `suivi-ecart.*`, scripts `fix-*.ps1`, `Dockerfile`, `nginx.conf`… |
| Ignorés pertinents | `node_modules/`, `dist/`, `.angular/` (racine `.gitignore`) |

Aucune référence `templateUrl` / `styleUrls` ne pointe vers un fichier supprimé (vérifié par script) : les suppressions préexistantes ne cassent pas le build.

### 2.2. Ce qui a été fait pendant cet audit

- Lecture des configurations (`package.json`, `package-lock.json` présent, `angular.json`, `tsconfig*.json`, `proxy.conf.json`, `jest.config.js`), des styles globaux, du shell applicatif, du routage, des modules partagés, de `ThemeService`, `PopupService`, `ModernPopupComponent`, `SidebarComponent` et d'échantillons de pages.
- Comptages automatisés (PowerShell `Select-String`) sur `frontend/src/app` : `.ts`, `.html`, `.scss`, `.css`.
- Calcul des contrastes WCAG avec un script Node écrit dans `%TEMP%` (hors dépôt, aucune dépendance).
- `npm run build` (configuration production, sortie dans `dist/`, ignoré par Git) et `npx jest --ci`.
- **Non réalisé** : lancement de `ng serve`, navigation dans l'application, captures, audit au lecteur d'écran, tests clavier réels.

Les comptages par expression régulière sont des **ordres de grandeur** : ils peuvent inclure du code commenté ou manquer des attributs répartis sur plusieurs lignes.

---

## 3. Architecture UI détectée

| Aspect | Constat vérifié | Source |
|---|---|---|
| Framework | Angular **14.2.0**, CLI 14.2.0, builder `@angular-devkit/build-angular:browser` (webpack) | `package.json`, `node_modules/@angular/core/package.json` |
| Node | v20.20.2 | `node -v` |
| TypeScript | 4.8.4, `strict: false`, `strictTemplates: false` | `tsconfig.json` |
| Bootstrap | `AppModule` (NgModule) avec 37 composants déclarés + **108 composants `standalone: true`** chargés via `loadComponent` | `app.module.ts`, `app-routing.module.ts` |
| Modules partagés | `SharedUiModule` (ré-exporte Material + `ProgressPopupComponent`), `SharedModule` (ré-exporte Material + 3 standalone). Aucun composant de présentation générique | `src/app/shared/` |
| Control flow | `*ngIf` / `*ngFor` uniquement (2 695 occurrences) | — |
| Détection de changement | Au moins `reconciliation-results` en `OnPush` | `reconciliation-results.component.ts:56` |
| Encapsulation | Émulée par défaut (0 `ViewEncapsulation.` explicite) ; contournée par 38 `::ng-deep` | — |
| Styles | SCSS par composant (`inlineStyleLanguage` par défaut), 1 fichier `.css` (`auto-processing-models`), styles globaux `src/styles.scss` + partiel `src/app/styles/_dashboard-filters.scss` | `angular.json` |
| Thème Material | Thème précompilé `indigo-pink.css` (aucun thème Sass personnalisé) | `angular.json` → `styles` |
| Thème applicatif | `ThemeService` : couleurs dérivées du logo de l'entreprise → variables CSS sur `:root`, persistées en `localStorage` (`app_theme`) et via `/api/configuration/theme` | `services/theme.service.ts` |
| Mode sombre | **Aucun mécanisme global.** Seul `reconciliation-launcher` réagit à `prefers-color-scheme: dark` (variables locales). 0 `data-theme` | `reconciliation-launcher.component.scss:43` |
| i18n | `@ngx-translate/core` 14, FR (défaut) + EN, `LOCALE_ID` suit la langue, sélecteur FR/EN dans la sidebar et sur la page de connexion | `app.module.ts`, `assets/i18n/*.json` |
| Icônes | Font Awesome **6.0.0-beta3** via CDN (1 679 `<i class="fa…">` dans 62 fichiers) + Material Icons via CDN (`<mat-icon>` dans 3 fichiers) + emojis (≈ 780 occurrences dans 61 fichiers) | `src/index.html` |
| Polices | Google Fonts via CDN : Roboto (chargé **2 fois** : `index.html` et `@import` dans `styles.scss`), **Sora et Instrument Serif déjà chargés**, Plus Jakarta Sans chargé mais **jamais utilisé** | `src/index.html`, `src/styles.scss` |
| Graphiques | Chart.js 3.9.1 + ng2-charts 4.0.0 (`baseChart` dans 5 fichiers), couleurs définies en dur dans le TS | `dashboard`, `stats-report*`, `reconciliation-global-preview`, `redevance-loterie`, `predictions`, `etat-reconciliations` |
| Proxy dev | `proxy.conf.json` : `/api` → **`http://localhost:8080`** (et non HTTPS 8090 comme indiqué dans la mission) ; `npm start` lance `ng serve --ssl` avec des certificats sous `C:/Certs/...` | `proxy.conf.json`, `package.json` |
| Tests | Jest 28 + `jest-preset-angular` (6 specs : 1 composant `language-switcher`, 2 services, 3 utilitaires). Karma configuré mais sans spec dédiée. **Aucun test e2e, aucun outil de capture visuelle** | `jest.config.js` |
| Lint / format | **Aucun** (pas d'ESLint, Prettier ni Stylelint) | racine `frontend/` |
| Budgets | `initial` warning 6 Mo / erreur 12 Mo ; `anyComponentStyle` warning 50 Ko / erreur 150 Ko | `angular.json` |

### Conventions à préserver

- NgModule racine + composants standalone en lazy loading (ne pas convertir massivement).
- `*ngIf` / `*ngFor` (seul control flow disponible en v14).
- Libellés via clés `translate` (FR/EN) : aucun texte en dur ne doit être introduit, chaque nouveau libellé doit avoir sa clé dans `fr.json` **et** `en.json`.
- Notifications et confirmations via `PopupService` (Promise).
- Variables `--theme-*` pilotées par `ThemeService` (marque par entreprise).

---

## 4. Bibliothèques : installées vs réellement utilisées

| Bibliothèque | Version installée | Utilisation réelle constatée |
|---|---|---|
| `@angular/material` | 14.2.7 | `mat-form-field` (182 occ. / 16 fichiers), `mat-select` (271 / 18), `mat-option` (305 / 14), `matInput` (21 / 8), `mat-datepicker` (8 / 1 : `dashboard-reconciliation`), `mat-icon` (74 / 3 : `login`, `two-factor-auth`, `agency-summary`), `mat-raised-button` (8 / 4), `mat-icon-button` (4 / 2), `matTooltip` (10 / 5), `mat-spinner` (8 / 2), `mat-card` (8 / 1), `mat-expansion-panel` (4 / 1), `mat-autocomplete` (4 / 1) |
| Modules Material importés mais **non utilisés** dans les templates | — | `MatTable`, `MatPaginator`, `MatCheckbox`, `MatSlideToggle`, `MatTabs`, `MatMenu`, `MatDialog`, `MatProgressBar`, `MatCard` (hors `two-factor-auth`) — 0 occurrence de `mat-table`, `mat-paginator`, `matSort`, `mat-checkbox`, `mat-tab-group`, `mat-menu`, `MatDialog`, `MatSnackBar` |
| `@angular/cdk` | 14.2.7 | `DragDrop` (`cdkDrag`, 7 occ. / 2 fichiers). Overlay utilisé indirectement par `mat-select`. `A11yModule` / `FocusTrap` **non utilisés** |
| `ngx-mat-select-search` | 4.2.1 | 102 occ. / 17 fichiers (recherche dans les `mat-select`) |
| `chart.js` / `ng2-charts` / `chartjs-plugin-datalabels` | 3.9.1 / 4.0.0 / 2.2.0 | 5 composants |
| Font Awesome (CDN, hors npm) | 6.0.0-beta3 | Système d'icônes dominant ; 5 règles CSS référencent encore `'Font Awesome 5 Free'` (risque d'icônes manquantes à vérifier visuellement) |
| `html2canvas`, `jspdf`, `exceljs`, `xlsx`, `papaparse`, `file-saver` | — | Exports / imports (hors périmètre visuel, **à ne pas toucher**) |
| Bootstrap / Tailwind / PrimeNG | non installés | Mais de nombreuses classes et couleurs « façon Bootstrap » écrites à la main (`.btn-primary`, `.badge-success`, `#007bff`, `#6c757d`, `#28a745`, `#dc3545`…) |

**Conséquence** : le CDK (déjà installé, compatible Angular 14) fournit `FocusTrap`, `LiveAnnouncer` et `Overlay`, ce qui permet de couvrir les besoins d'accessibilité des dialogues **sans nouvelle dépendance**.

---

## 5. Familles de styles coexistantes

Classement obtenu en lisant les blocs de variables de chaque composant :

| Famille | Description | Composants (dossier `src/app/components/…`) |
|---|---|---|
| **rd26** (référence de fait) | 26 variables `--rd-*` identiques : `--rd-bg #F2F0EB`, `--rd-surface #FAFAF8`, `--rd-border #E4E0D8`, `--rd-navy #1A2535`, `--rd-text1/2/3`, vert/ambre/bleu/rouge en 3 nuances, `--rd-r 18px`, `--rd-r-sm 11px`, 2 ombres | `banque`, `commission`, `comptabilite`, `dashboard`, `ecart-bo-summary`, `ecart-bo-table`, `ecart-partner-table`, `ecart-solde`, `frais`, `impact-op`, `matches-table`, `operations`, `predictions/predictions-new`, `ranking`, `reconciliation-report` (inline), `reconciliation-results` (inline), `redevance-loterie`, `service-balance`, `service-references`, `stats`, `trx-sf` |
| rd12 | Sous-ensemble de 12 variables | `modules`, `permissions`, `platform-audit`, `platform-comptes`, `platform-entreprises`, `platform-modules`, `sop-operation`, `two-factor-auth` |
| rd19 | 19 variables | `configuration-renommer`, `profil`, `profil-detail` |
| rd variantes uniques | 9, 13, 15, 17 (×2), 20, 24, 29 variables | `controle-interne-bo-partenaire` (9), `auto-processing-models` (13 + variables `--agg-*`), `stats-report-graph` (15), `stats-report` / `rapport-reconciliation-bo-partenaire` (17), `service-references-dashboard-panel` (20), `comptes` (24), `oppart-list` (29) |
| Variables locales non `rd` | `--bg`, `--navy`, `--text1`, `--ink`… valeurs proches mais différentes (ex. `--surface #fdfcfa` au lieu de `#FAFAF8`, `--green #2a6644` au lieu de `#2E6B47`) | `aide`, `user-log`, `users`, `configuration-calcul`, `configuration-top-users`, `etat-reconciliations`, `reconciliation-launcher` (palette `#F3F0E9` / `#14213D` + mode sombre) |
| Sora sans variables | Polices Sora/Instrument Serif mais couleurs en dur | `traitement` |
| **Legacy** (« Bootstrap fait main », Roboto, bleu `#2196f3`/`#667eea`) | Aucune variable de design | `sidebar`, `app` (shell), `login`, `reset-password`, `file-upload`, `reconciliation`, `certification-solde` (marine `#1a2332`), `column-selection` (inline), `report-dashboard` (inline), `dashboard-reconciliation`, `reconciliation-global-preview`, `ecart-bo`, `ecart-partenaire`, `comptes/ecart-solde-tab`, `comptes/impact-op-tab`, `excel-analysis`, `guide-utilisation`, `sop-reconciliation-trx`, `niveaux-validation-reco`, `configuration-logo`, `predictions` (ancien), `user-profile`, `users/user-2fa-dialog`, `modern-popup`, `progress-indicator`, `traitement-job-banner`, `shared/*`, `stats/agency-summary` |

**Palettes « chaudes » concurrentes** :

| Rôle | rd26 | Variables locales (`aide`, `user-log`) | `reconciliation-launcher` + `docs/*-reference.html` | Cible mission |
|---|---|---|---|---|
| Fond | `#F2F0EB` | `#f2f0eb` | `#F3F0E9` | `#F2EEE4` |
| Surface | `#FAFAF8` | `#fdfcfa` | `#FFFFFF` | `#FBF9F4` |
| Bordure | `#E4E0D8` | `#e6e1d8` | `#E3DDCF` / `#E6E0D2` | `#E0DACB` |
| Texte principal | `#1A1714` | `#1c1916` | `#16233B` | `#1F2A2E` |
| Texte atténué | `#5C5650` / `#9B9489` | `#5a5349` / `#9c9388` | `#5E6878` / `#6A7383` | `#6B7377` |
| Accent / navigation | `#1A2535` (marine) | `#1a2535` | `#14213D` / `#2D6BE0` | `#1D5C63` (pétrole) |

---

## 6. Inventaire des pages, layouts et composants

Légende — **Type** : M = déclaré dans `AppModule`, S = standalone ; **Tpl** : fichier ou inline (dans le `.ts`) ; **Hex** / **!imp** : nombre de couleurs hexadécimales et de `!important` dans les styles du composant ; **Ko** : poids total TS + HTML + styles ; **Topnav** : réimplémente le bandeau `.topnav` « ReconciliApp ». Tous les chemins sont relatifs à `frontend/src/app/`. Les risques sont estimés à partir de la taille du template et de son couplage avec le TS.

### 6.1. Shell et layouts

| Composant | Chemin | Rôle | Famille | Constats | Priorité | Risque |
|---|---|---|---|---|---|---|
| AppComponent | `app.component.*` | Shell : sidebar + `<main>` + bandeaux globaux | legacy | `margin-left: 350px` et `width: calc(100% - 350px)` en dur, couplés à la sidebar ; bouton bascule visible au **survol uniquement** (`opacity: 0`) | P1 | Moyen |
| SidebarComponent | `components/sidebar/` | Navigation latérale, langue, profil, déconnexion | legacy (`--theme-sidebar-*`) | Largeur fixe 350 px, 0 `@media` ; `<a href="#">` pour ouvrir les groupes sans `aria-expanded` ; profil cliquable sur une `div` ; flèches `▼` en texte | P1 | Moyen |
| Styles globaux | `../styles.scss`, `styles/_dashboard-filters.scss` | Reset, `.btn`, overlays, filtres | legacy | Règles globales dangereuses (§10) ; `.btn` avec `darken(#2196F3)` | **P0** | Élevé |
| `index.html` | `../index.html` | Polices, icônes, scripts | — | Script forçant `overflow-y:auto` sur tous les éléments après 2 s ; 4 feuilles Google Fonts dont 2 inutiles | P0 | Moyen |
| ProgressIndicator | `components/progress-indicator/` | Indicateur global (inline) | legacy | — | P3 | Faible |
| TraitementJobBanner | `components/traitement-job-banner/` | Bandeau de traitement en arrière-plan | legacy | — | P3 | Faible |

### 6.2. Écrans de réconciliation et résultats (module « Résultats » / « Réconciliation »)

| Page | Route | Chemin | Type / Tpl | Famille | Hex | !imp | Ko | Topnav | Priorité | Risque |
|---|---|---|---|---|---|---|---|---|---|---|
| Lanceur de réconciliation | `/reconciliation-launcher` | `components/reconciliation-launcher/` | S / fichier | locale + sombre | 62 | 1 | 55 | oui | P2 | Faible |
| Upload (manuel / assisté / certification) | `/upload`, `/upload-assisted`, `/certification-solde/upload` | `components/file-upload/` | M / fichier | legacy | 289 | 12 | 522 | — | P2 | **Élevé** (TS 386 Ko, **modifié par l'utilisateur**) |
| Sélection de colonnes | `/column-selection` | `components/column-selection/` | S / inline | legacy | 68 | 0 | 58 | — | P2 | Moyen |
| Réconciliation (legacy) | `/reconciliation` | `components/reconciliation/` | M / fichier | legacy | 123 | 0 | 101 | — | P2 | Moyen |
| **Résultats** (synthèse, onglets) | `/results` | `components/reconciliation-results/` | S / **inline 418 Ko** | rd26 | 252 | 22 | 418 | oui | P2 | **Élevé** |
| **Correspondances (rapprochées)** | `/matches` | `components/matches-table/` | S / fichier | rd26 | 119 | 0 | 74 | oui | P2 | Faible |
| **Écarts BO (absents du relevé / partenaire)** | `/ecart-bo` | `components/ecart-bo-table/` | S / fichier | rd26 | 129 | 0 | 83 | oui | P2 | Faible |
| **Écarts partenaire (absents du BO)** | `/ecart-partner` | `components/ecart-partner-table/` | S / fichier | rd26 | 203 | 0 | 108 | oui | P2 | Moyen |
| Synthèse écarts BO | `/ecart-bo-summary` | `components/ecart-bo-summary/` | S / fichier | rd26 | 133 | 9 | 152 | oui | P2 | Moyen (**modifié par l'utilisateur**) |
| **Rapport de réconciliation** (écarts de montant, statuts de traitement) | `/reconciliation-report` | `components/reconciliation-report/` | S / **inline 577 Ko** | rd26 | 330 | 17 | 577 | oui | P2 | **Très élevé** |
| Rapport BO/partenaire | `/rapport-reconciliation-bo-partenaire` | `components/rapport-reconciliation-bo-partenaire/` | M / fichier | rd17 | 113 | 6 | 121 | oui | P2 | Moyen |
| Contrôle interne BO/partenaire | `/controle-interne-bo-partenaire` | `components/controle-interne-bo-partenaire/` | M / fichier | rd9 | 76 | 0 | 118 | oui | P2 | Moyen |
| État des réconciliations | `/etat-reconciliations` | `components/etat-reconciliations/` | S / fichier | locale | 80 | 0 | 173 | — | P2 | Moyen |
| Dashboard réconciliation | `/reconciliation-dashboard` | `components/dashboard-reconciliation/` | M / fichier | legacy | 99 | 0 | 55 | — | P2 | Moyen |
| Aperçu global | `/reconciliation-global-preview` | `components/reconciliation-global-preview/` | M / fichier | legacy | 45 | 0 | 38 | — | P2 | Faible |
| Certification de solde | `/certification-solde` | `components/certification-solde/` | S / fichier | legacy | 270 | 15 | 186 | oui | P2 | Élevé |
| Report dashboard | `/report-dashboard` | `components/report-dashboard/` | M / inline 76 Ko | legacy | 29 | 0 | 76 | — | P2 | Moyen |
| Écart BO / Écart partenaire (onglets internes) | — (déclarés dans `AppModule`) | `components/ecart-bo/`, `components/ecart-partenaire/` | M / fichier | legacy | 66 / 68 | 0 | 42 / 56 | — | P2 | Moyen (usage exact à confirmer) |
| PartnerMatchesTable, Soldes | — | `components/partner-matches-table/`, `components/soldes/` | M | vides (≈ 0 Ko) | — | — | — | — | P3 | Nul (coquilles vides) |

### 6.3. Autres pages métier

| Page | Route | Chemin | Famille | Hex | !imp | Ko | Priorité | Risque |
|---|---|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | `components/dashboard/` | rd26 + mat-select + charts | 305 | 7 | 340 | P2 | Élevé |
| Comptes (+ onglets écart solde / impact OP) | `/comptes` | `components/comptes/` | rd24 + legacy | 226 (+188) | **50** | 505 | P2 | **Élevé** (style 112 Ko > budget) |
| Opérations | `/operations` | `components/operations/` | rd26 (+15 var.) | 249 | 8 | 359 | P2 | Élevé (style 69 Ko > budget) |
| Traitement | `/traitement` | `components/traitement/` | Sora sans variables | 496 | 6 | 431 | P2 | Élevé (style 68 Ko > budget) |
| Banque | `/banque` | `components/banque/` | rd26 | 466 | 22 | 302 | P2 | Élevé (style 56 Ko > budget) |
| Modèles de traitement auto | `/auto-processing-models` | `components/auto-processing-models/` | rd13 (`.css`) | 345 | 36 | 377 | P2 | Élevé (**modifié par l'utilisateur**) |
| Frais, Commission, Comptabilité | `/frais`, `/commission`, `/comptabilite` | `components/frais|commission|comptabilite/` | rd26 | 173 / 23 / 24 | 0 | 124 / 6 / 5 | P2 | Faible à moyen |
| Écart solde, Impact OP, OPPART, TRX SF | `/ecart-solde`, `/impact-op`, `/oppart`, `/trx-sf` | `components/ecart-solde|impact-op|oppart-list|trx-sf/` | rd26 / rd29 | 113–157 | 0–2 | 76–136 | P2 | Moyen |
| Service balance, Service references | `/service-balance`, `/service-references` | `components/service-balance/`, `components/service-references/` | rd26 / rd20 | 46–101 | 0–3 | 55–85 | P2 | Moyen |
| Redevance loterie | `/redevance-loterie` | `components/redevance-loterie/` | rd26 (modèle du topnav) | 29 | 3 | 54 | P2 | Faible |
| Statistiques, rapports | `/stats`, `/stats-report`, `/stats-report-graph`, `/agency-summary` | `components/stats*/` | rd26 / rd17 / rd15 / legacy | 25–105 | 0–6 | 2–125 | P2 | Moyen |
| Classements | `/ranking` | `components/ranking/` | rd26 | 75 | 0 | 55 | P2 | Faible |
| Prédictions (nouveau / ancien) | `/predictions`, `/predictions-old` | `components/predictions/` | rd26 / legacy | 208 / 49 | 2 / 0 | 120 / 27 | P3 | Faible |
| Analyse Excel | (déclaré, route non trouvée) | `components/excel-analysis/` | legacy | 44 | 0 | 25 | P3 | Faible |

### 6.4. Administration, configuration, aide, authentification

| Page | Route | Chemin | Famille | Priorité | Risque |
|---|---|---|---|---|---|
| Connexion | `/login` | `login/` | legacy + Material (12 `!important`) | P1 (première impression) | Moyen (**modifié par l'utilisateur**, logique 2FA) |
| Réinitialisation mot de passe | `/reset-password` | `reset-password/` | legacy | P3 | Faible |
| 2FA | `/two-factor-auth` | `components/two-factor-auth/` | rd12 + Material (seule page Material « complète ») | P3 | Faible |
| Utilisateurs, dialogue 2FA | `/users` | `components/users/` | locale / legacy | P3 | Faible |
| Profils, détail profil, modules, permissions | `/profils`, `/profils/:id`, `/modules`, `/permissions` | `components/profil|profil-detail|modules|permissions/` | rd19 / rd12 | P3 | Moyen (règles de droits dans les templates) |
| Configuration (logo, calcul, renommer, top users, niveaux de validation) | `/configuration/*` | `components/configuration-*/`, `components/niveaux-validation-reco/` | legacy / locale / rd19 | P3 | Faible à moyen |
| Plateforme (entreprises, modules, audit, comptes) | `/platform/*` | `components/platform-*/` | rd12 (sans topnav) | P3 | Faible (`platform-modules` **modifié par l'utilisateur**) |
| Journal utilisateurs, profil utilisateur | `/log-utilisateur`, `/user-profile` | `components/user-log/`, `components/user-profile/` | locale / legacy | P3 | Faible |
| Aide, SOP, guide | `/aide`, `/sop-operation`, `/sop-reconciliation-trx`, `/guide-utilisation` | `components/aide|sop-*|guide-utilisation/` | locale / rd12 / legacy | P3 | Faible |

### 6.5. Composants partagés existants

| Composant | Chemin | Rôle | Réutilisable ? |
|---|---|---|---|
| `ModernPopupComponent` + `PopupService` | `components/modern-popup/`, `services/popup.service.ts` | Info, succès, avertissement, erreur, confirmation, saisie texte/date/sélection/autocomplétion, choix multiples, liste sélectionnable | **Oui, à harmoniser** (c'est le mécanisme de notification et de dialogue de toute l'application) |
| `ProgressPopupComponent` | `components/shared/progress-popup.*` | Popup de progression | Oui, à harmoniser |
| `AutocompleteInputComponent` | `components/shared/autocomplete-input.*` | Champ autocomplété | Oui |
| `LanguageSwitcherComponent` | `components/shared/language-switcher.component.ts` | Sélecteur FR/EN (styles dans `styles.scss` `.i18n-switch`) | Oui, déjà testé (spec) |
| `Result8rec` audit (dialog + pipe) | `shared/result8rec-audit-*` | Audit de résultats | À examiner en phase 3 |
| Filtres partagés | `styles/_dashboard-filters.scss` | `.filters-container`, `.filter-group`, `select.filter-select`, `mat-form-field.filter-select` | Oui (base de la barre de filtres) |

**Aucun composant partagé** n'existe pour : bouton, en-tête de page / topnav, carte KPI, badge, tableau, pagination, onglets, état vide / chargement / erreur, menu déroulant, tiroir.

---

## 7. Inventaire par catégorie

### 7.1. Actions et contrôles

| Catégorie | État constaté | Variantes |
|---|---|---|
| Boutons | 1 538 `<button>` dans 78 fichiers ; 1 244 classes `*-btn` / `.btn` / `.nav-btn` dans 63 fichiers ; Material dans 4 fichiers | `.btn` global (bleu `#2196F3`, rayon 4 px, 1 rem) ; `.nav-btn` répété dans ~30 composants avec 4 variantes de padding (`7px 16px`, `7px 14px`, `8px 16px`, `6px 14px`), 3 tailles de police (`13px`, `0.9rem`, `11.5px`), rayon `8px` ou `var(--rd-r-sm)` (11 px) ; boutons ad hoc (`.matches-button`, `.ecart-bo-button`, `.save-button`, `.export-button`, `.report-button`…) |
| Boutons icône seule | ≈ 33 boutons FA sans texte ni `aria-label` (estimation, motif sur une ligne) ; boutons `‹ ›` avec `title` seulement | Fermeture de popup `×` |
| Type de bouton | ≈ 950 `<button>` sans attribut `type` sur la même ligne (estimation haute) | Risque de soumission involontaire dans les `<form>` ; **ne pas modifier sans analyse** (comportement de soumission) |
| Champs texte / nombre / montant | 683 `<input>` dans 67 fichiers, 21 `matInput` | Bordures `#ddd`, `#ccc`, `#e0e0e0`, `var(--rd-border)` ; aucun composant de montant (montants affichés avec `number:'1.0-0'` et 684 usages de formatage numérique) |
| Recherche | `.search-input` local dans les pages de résultats, `ngx-mat-select-search` dans les listes | 2 approches |
| Sélecteurs | 257 `<select>` natifs (43 fichiers) **et** 271 `mat-select` (18 fichiers) | Deux systèmes concurrents, parfois sur la même page (`_dashboard-filters.scss` stylise les deux) |
| Cases à cocher | 170 `type="checkbox"` natifs (41 fichiers), 0 `mat-checkbox` ; faux `role="checkbox"` sur un `span` dans `reconciliation-results` | Coche dessinée `✓` |
| Interrupteurs | 0 `mat-slide-toggle` ; interrupteurs CSS maison possibles (à confirmer page par page) | — |
| Dates et périodes | 85 `type="date"` natifs (24 fichiers) ; `mat-datepicker` dans `dashboard-reconciliation` seulement ; `PopupService.showDateInput` | 3 approches |
| Upload / dépôt | 41 `type="file"` (19 fichiers) ; `.upload-area` global ; zone de dépôt dans `file-upload` | Styles différents par page |

### 7.2. Navigation et structure

| Catégorie | État constaté |
|---|---|
| Navigation latérale | `SidebarComponent` : fixe, 350 px, marine `--theme-sidebar-bg` (`#2c3e50` par défaut), actif `#3498db` |
| Bandeau de page (`.topnav`) | **Réimplémenté dans 37 pages** (marque « ReconciliApp » + chemin + actions). Hauteur `52px` (32 pages) ou `50px` (`aide`, `user-log`) ou non définie (`certification-solde`, `reconciliation-launcher`, `users`) ; fond `var(--rd-navy)`, `var(--navy)`, `var(--nav)`, `#1A2535` ou `#1a2332` |
| En-têtes de page | 190 occurrences `page-header*` / `ph-*` dans 41 fichiers ; motif « eyebrow + titre serif avec `<em>` + bande KPI » dans les pages rd ; **double en-tête** dans `ecart-bo-table` (topnav + `page-header-ecart` + `header-section` avec `h2` et boutons Retour / Synthèse répétés) |
| Onglets | Boutons maison (`.tab-buttons`, `.magic-service-tab`) ; `role="tab"` utilisé dans 1 seul groupe (`reconciliation-results`), sans `role="tabpanel"` ni navigation aux flèches |
| Sélecteur CM / GA / GN | **Pas de sélecteur d'environnement dédié.** CM, GA et GN sont des codes pays parmi une liste plus large (`CI`, `SN`, `BF`, `ML`…), choisis via `mat-select` ou `<select>` dans chaque page (`selectedPays` & co : 379 occurrences / 37 fichiers), avec drapeaux emoji (`dashboard`, `dashboard-reconciliation`, `profil`) |
| Menus déroulants | Maison (`.export-menu-dropdown` dans les pages d'écarts) ; 0 `mat-menu` |
| Menus contextuels, breadcrumbs | Non trouvés (le `.nav-path` du topnav fait office de fil d'Ariane à un niveau) |

### 7.3. Données et visualisation

| Catégorie | État constaté |
|---|---|
| Tableaux | 103 `<table>` natifs dans 41 fichiers ; 0 `mat-table`. 69 règles `overflow-x: auto|scroll` ; 224 règles `th`/`thead` ; `tabular-nums` seulement 32 fois |
| Tri / sélection | Sélection par cases à cocher natives ; tri maison (non uniformisé) |
| Pagination | **174 implémentations** `.pagination*` dans 36 fichiers ; motif « Précédent / Page x / y / Suivant » ; pas de choix de taille de page standard |
| Cartes KPI | 393 occurrences `kpi` / `stat-card` / `hk-strip` dans 34 fichiers ; dans `reconciliation-results`, **deux rendus KPI successifs** des mêmes chiffres (bande `hero-kpi-strip` + grille `stat-card` avec emojis) |
| Graphiques | Chart.js dans 6 composants, palettes en dur dans le TS (`dashboard.component.ts` : 23 couleurs, `etat-reconciliations` : 22, `stats-report` : 20…) |
| Badges de statut | Pas de badge commun. Familles de classes : `.status-badge`, `.statut-badge`, `.status-pill`, `.status-dot`, `.badge-success|info|warning|secondary|primary`, `.statut-traite|en-attente|erreur`, `.status-en-cours-*`, `.STATUT_OK`… |
| Statuts de réconciliation | Le code ne manipule pas les 5 statuts de la mission sous forme de badges ; il travaille avec des **catégories** : `matches` (rapproché), `boOnly` (écart BO), `partnerOnly` (écart partenaire), `mismatches` (écart de montant, dans `reconciliation-report`), doublons (`duplicatesRemoved` à l'import, colonnes de doublons dans les rapports). Les couleurs associées varient d'une page à l'autre (vert `#28a745` / `#4caf50` / `#2E6B47` / `#27ae60`…). La correspondance exacte « statut mission ↔ catégorie code » est **à confirmer** (§17) |
| Types d'opérations | Appro (380 occ.), Compense (828), Nivellement (185). **« Crossborder » n'apparaît que comme `referenceType` `CROSS_BORDER`** (avec `STANDARD` et `NIVELLEMENT`) dans `ecart-partenaire`, `ecart-partner-table`, `impact-op`, `reconciliation-results`, `models/operation.model.ts`. Aucun badge de type commun |
| Statuts de traitement | Seconde famille (OK / NOK / En cours / Traité / En attente / Erreur…) dans `reconciliation-report`, `etat-reconciliations`, `ecart-solde`, `comptes` — non mentionnée par la mission, mais à tokeniser au même titre |
| Bannières d'anomalie | Bannières ad hoc (`traitement-job-banner`, alertes `#fff3cd` / `#856404` façon Bootstrap : 56 et 43 occurrences) |

### 7.4. Feedback et overlays

| Catégorie | État constaté |
|---|---|
| Dialogues | `ModernPopupComponent` (DOM manuel) + **252 classes `modal*` dans 20 fichiers** (modales locales) + 1 `<dialog>` natif ; 13 `role="dialog"` / 12 `aria-modal` dans 7 fichiers ; **0 piégeage du focus** ; Échap géré dans `ModernPopup` (14 occurrences) |
| Deux styles dans `ModernPopup` | `showPopup` : palette rd (`#FAFAF8`, dégradé `#1A2535 → #2E6B47 → #5A9E74`, Sora, `z-index: 10000`) ; `showTextInput` / `showDateInput` / `showSelectInput` / `showAutocompleteInput` : style legacy (`#fff`, `#007bff`, rayon 12 px, `z-index: 9999`) |
| Confirmations | `PopupService.showConfirm` (Promise) ; ≈ 12 `confirm(` et 7 `alert(` natifs subsistent dans 10 et 5 fichiers |
| Toasts / notifications | **Pas de toast** : les succès et erreurs passent par des popups modales (811 appels `popupService.show*` dans 40 fichiers). 12 occurrences de classes `toast` / `notification` dans 4 fichiers (locales) |
| Tooltips | Attribut `title` (267 occ. / 39 fichiers) et `matTooltip` (10 / 5) — informations parfois accessibles uniquement au survol |
| Tiroirs / panneaux latéraux | 2 occurrences dans 1 fichier ; pas de modèle commun |
| Chargement | 245 occurrences spinner / `fa-spin` / `mat-spinner` dans 47 fichiers ; `⏳` emoji dans `ecart-bo-table` ; overlays de progression locaux ; **0 squelette** |
| États vides | 74 occurrences `empty*` / `no-results` / `no-data` dans 36 fichiers, sans modèle commun |
| États d'erreur | Principalement via `popupService.showError` ; pas de bloc d'erreur en page standardisé |

---

## 8. Écrans de réconciliation — analyse détaillée

| Écran | Observations (code) |
|---|---|
| Résultats (`reconciliation-results`) | Topnav + en-tête titre serif + bande KPI, puis panneau « services magiques » (onglets `role="tab"`, fausse case à cocher `span role="checkbox"` cliquable sans clavier), overlay de progression avec emojis (📊 ⏱️ 🚀 📈), grille `stat-card` qui **répète** les KPI de la bande, boutons d'onglets avec emojis (✅ ⚠️ 📊 📈), tableaux natifs, pagination maison. 22 `!important`, 252 couleurs |
| Correspondances (`matches-table`) | Même gabarit rd26 que les écarts : bon **pilote** (74 Ko, fichier séparé, non modifié par l'utilisateur) |
| Écarts BO / partenaire (`ecart-bo-table`, `ecart-partner-table`) | Topnav + en-tête + **second en-tête** (`header-section` avec bouton Retour, `h2`, compteur et bouton Synthèse en double) ; menu « Export et options » maison (flèches `▲▼` en texte, pas de gestion clavier) ; chargement `⏳` ; actions d'enregistrement vers écart de solde dans le menu |
| Rapport de réconciliation (`reconciliation-report`) | Fichier de 577 Ko (template + styles inline). Contient une **erreur de syntaxe CSS** signalée par le build : `.status-en-cours..... {` (ligne 1452 du CSS inline extrait) et de l'imbrication `&` non compilée (CSS inline non-SCSS) — préexistant |
| Rapport / contrôle BO-partenaire | Familles rd17 / rd9 : sous-ensembles du système rd26, valeurs identiques mais variables manquantes → fallback en dur |
| Lanceur | Seul écran avec palette sombre et `:focus-visible` systématique (8 règles) : **bonne référence d'accessibilité** à réutiliser |
| Upload | Écran legacy le plus lourd (TS 386 Ko), couleurs Material/Bootstrap, 12 `!important`, en cours de modification par l'utilisateur |
| Environnements CM / GA / GN | Aucune différence de style par pays n'a été trouvée dans le code ; les incohérences sont **entre pages**, pas entre environnements. Les drapeaux emoji (rendu dépendant du système, Windows n'affiche pas les drapeaux régionaux) servent de repère visuel dans 3 composants — **à vérifier visuellement** |

---

## 9. Tableau des incohérences

| # | Catégorie | État constaté | Variantes / incohérences | Fichiers concernés | Impact | Priorité | Action proposée |
|---|---|---|---|---|---|---|---|
| I1 | Règles globales | `.ng-star-inserted { position: relative; z-index: 1 }`, `[class*="-container"] { overflow-y: auto !important }`, `form, .form-group { overflow-y: auto }`, `.processing-overlay` 100 % `!important` | Crée des contextes d'empilement et des barres de défilement sur des éléments arbitraires | `src/styles.scss` l.72-191 ; `src/index.html` l.11-53 | Toutes les pages ; overlays et sticky potentiellement cassés | **P0** | Ne pas toucher avant d'avoir un protocole de vérification visuelle ; neutralisation ciblée et testée en fin de phase 4 |
| I2 | Templates inline géants | Template + styles dans le `.ts` | 577 Ko et 418 Ko | `reconciliation-report.component.ts`, `reconciliation-results.component.ts` (+ `report-dashboard`, `column-selection`) | Toute retouche visuelle touche un fichier TS métier | **P0** | Décision : autoriser l'édition des seules chaînes `template`/`styles`, ou extraire vers `templateUrl`/`styleUrls` (refactor neutre, diff important) |
| I3 | Dialogues | DOM manuel + CSS en chaîne dans le TS | 2 styles, 2 `z-index`, pas de focus trap ni `role="dialog"` | `modern-popup.component.ts` (+ 20 fichiers avec modales locales) | Toute l'application ; accessibilité | **P0** (TS) / P1 | Harmoniser via CSS global + CDK `FocusTrap` ; nécessite une autorisation TS |
| I4 | Modifications en cours | Fichiers frontend modifiés non commités | 45 entrées | voir §2.1 | Mélange de changements à la migration | **P0** | Décision : commit / stash par l'utilisateur, ou exclusion de ces fichiers |
| I5 | Version Angular | 14.2.0 au lieu de 20 | Pas de signals / control flow | `package.json` | Conventions de la mission inapplicables | **P0** | Rester en v14 pour la refonte (recommandé) |
| I6 | Palette / tokens | Blocs `--rd-*` copiés | 8 variantes rd + 7 palettes locales + 4ᵉ palette cible | 39 fichiers rd (§5) + `aide`, `user-log`, `users`, `configuration-calcul`, `configuration-top-users`, `etat-reconciliations`, `reconciliation-launcher` | Visuel global | P1 | Tokens globaux + alias `--rd-*` sur `:root`, puis suppression des blocs locaux page par page |
| I7 | Couleurs en dur | 798 hex distincts, 7 453 hex dans les styles, 1 519 `rgba()` | `#fff` / `#ffffff` / `white` ; `#1976d2`, `#2196f3`, `#007bff`, `#3498db`, `#667eea` (5 bleus « primaires ») ; `#28a745`, `#4caf50`, `#27ae60`, `#2e7d32`, `#2E6B47` (5 verts « succès ») ; `#dc3545`, `#e74c3c`, `#f44336`, `#8B2635` (rouges) | Tous les composants ; top : `traitement` 496, `banque` 466, `auto-processing-models` 345, `reconciliation-report` 330, `dashboard` 305 | Incohérence forte | P1 | Mapping vers tokens sémantiques |
| I8 | Typographie | 105 tailles distinctes ; familles : Sora (87), Instrument Serif (110), Roboto (shell, login), `-apple-system` (`app.component.scss`), Segoe UI, 6 piles monospace | `14px` (417), `12px` (326), `13px` (297), `0.9rem` (265)… demi-pixels `12.5px`, `11.5px`, `13.5px` | `styles.scss`, `app.component.scss` (contradiction sur `body`), tous composants | Hiérarchie floue | P1 | Échelle de 7-8 tailles, 2 familles + 1 mono |
| I9 | Rayons | 53 valeurs | `8px` (471), `6px` (372), `4px` (317), `12px` (228), `10px`, `11px` (`--rd-r-sm`), `18px` (`--rd-r`), `999px`, `50%`… | Tous | Visuel | P1 | 4 rayons + `full` |
| I10 | Ombres | 414 valeurs distinctes | `0 2px 4px rgba(0,0,0,.1)`, `0 1px 3px rgba(0,0,0,.1)`, `--rd-shadow`, `0 10px 30px rgba(0,0,0,.3)`… | Tous | Visuel | P1 | 3 niveaux d'élévation |
| I11 | `z-index` | 35 valeurs | `1`→`2147483002`, `9999` (21×), `10000`, `11000 !important` (`.cdk-overlay-container`), `9999999` | `styles.scss`, `modern-popup`, `app.component.scss`, pages | Superpositions imprévisibles | P1 | Échelle de 6 niveaux ; overlay CDK au-dessus des modales |
| I12 | Transitions | `all 0.3s ease` (238×), `all 0.2s` (≈ 220×) | Animations sur `all`, 2 `prefers-reduced-motion` seulement | Tous | Performance, accessibilité | P1 | 2-3 durées + désactivation globale en mouvement réduit |
| I13 | Boutons | `.btn` global + `.nav-btn` ×30 + classes ad hoc + Material ×4 | 4 paddings, 3 tailles de police, 2 rayons | §7.1 | Visuel, accessibilité | P1 | Classes globales `.ds-btn` (variantes/tailles) appliquées sans changer les `(click)`, `type`, `[disabled]` |
| I14 | Topnav / en-tête | 37 réimplémentations | 50/52 px, 5 fonds | §7.2 | Visuel, maintenance | P1 | Styles globaux `.topnav` (même HTML) puis composant `app-page-header` optionnel |
| I15 | Sélecteurs | `<select>` natifs + `mat-select` | 2 systèmes | 43 + 18 fichiers | Cohérence | P1 | Thème Material personnalisé + style natif aligné ; pas de remplacement de composant |
| I16 | Tableaux | 103 tables natives stylées localement | Tailles d'en-tête, zébrage, alignement des montants, `tabular-nums` rare | 41 fichiers | Lisibilité financière | P1/P2 | Classe globale `.ds-table` + conteneur de défilement |
| I17 | Pagination | 174 occurrences / 36 fichiers | Libellés et dispositions variés | 36 fichiers | Cohérence | P1/P2 | Composant de présentation (entrées/sorties) branché sur les méthodes existantes (`prevPage()`…) |
| I18 | KPI | 393 occurrences | Bandes, cartes, emojis, doublons de rendu | 34 fichiers | Lisibilité | P2 | Composant `kpi` + règles typographiques chiffres |
| I19 | Badges / statuts | ≥ 10 familles de classes | Couleurs différentes pour le même statut selon la page | `reconciliation-report`, `etat-reconciliations`, `ecart-solde`, `comptes`, `users`, `platform-*`… | Compréhension | P1 | Tokens métier + `.ds-badge--{statut}` avec libellé obligatoire |
| I20 | Icônes | FA 6 beta (CDN), Material Icons (CDN, 3 fichiers), emojis (≈ 780) | Mélange ; `'Font Awesome 5 Free'` référencé 5 fois | `index.html`, 61 fichiers à emojis | Cohérence ; rendu Windows | P2 | Décision : FA seul pour l'UI, emojis retirés des boutons/KPI |
| I21 | Polices | 4 feuilles Google Fonts dont Roboto ×2 et Plus Jakarta Sans inutilisée | — | `index.html`, `styles.scss` | Performance | P3 | Nettoyage après décision (§17) |
| I22 | Thème Material | Prébâti `indigo-pink` | Rose/indigo sur `mat-select`, `mat-form-field` | `angular.json` | Incohérence couleur des champs | P1 | Thème Sass personnalisé branché sur les tokens (modification de config, à autoriser) |
| I23 | `ThemeService` | Couleurs dérivées du logo appliquées à `--theme-*`, `--primary-color`, `--secondary-color`, `--light-color` | Écrase la palette par entreprise | `theme.service.ts`, `sidebar`, `app.component.scss`, 461 usages `var(--theme-*)` | Conflit avec la palette cible | **P0** (décision) | Définir le périmètre de la marque (§17) |
| I24 | Mode sombre | Inexistant (sauf `reconciliation-launcher`) | — | — | Fonctionnalité à créer | P1 | Phase 2, exposition progressive |
| I25 | `!important` / `::ng-deep` | 219 / 38 | Concentrés dans `comptes` (50), `auto-processing-models` (36), `banque` (22), `reconciliation-results` (22) ; `::ng-deep` dans `redevance-loterie` (10), `comptes` (8) | voir colonnes | Surcharges fragiles | P2 | Résorber à la migration de chaque page |
| I26 | Styles inline HTML | 174 `style="…"`, 82 `[style.x]`/`[ngStyle]` | `comptes` 53, `banque` 34, `traitement` 24 | idem | Contourne les tokens | P2 | Remplacer les statiques ; garder les dynamiques (largeur de barre de progression…) |
| I27 | Budgets de style | 4 composants > 50 Ko | `comptes` 112 Ko, `operations` 69, `traitement` 68, `banque` 56 | idem | Avertissements build | P3 | Diminuera mécaniquement avec la centralisation |
| I28 | Erreur CSS préexistante | `.status-en-cours..... {`, imbrication `&` non compilée | — | `reconciliation-report.component.ts` (CSS inline) | Règles ignorées par le navigateur | P2 | Corriger lors de la migration de la page (avec autorisation TS) |
| I29 | Breakpoints | 25 points de rupture différents | `768px` (81×), `1200`, `1100`, `900`, `480`, `640`, `1400`, `1024`, `960`, `600`, `700`, `992`, `820`, `560`, `520`, `500`… | Tous | Responsive incohérent | P1 | 4 points de rupture standard (mixins SCSS ; les variables CSS ne fonctionnent pas dans `@media`) |

---

## 10. Exemples concrets de valeurs en dur

### 10.1. Valeurs de design à transformer en tokens

| Fichier | Valeur | Remarque |
|---|---|---|
| `src/styles.scss` l.6-32 | `--primary-color: #2196F3`, `--success-color: #4CAF50`, `--theme-primary: #667eea`, `--theme-sidebar-bg: #2c3e50`… | Premier niveau de variables, legacy et non sémantique |
| `src/styles.scss` l.217, 226 | `darken(#2196F3, 10%)`, `darken(#FFC107, 10%)` | Fonction Sass sur une couleur en dur, ignore `ThemeService` |
| `src/styles.scss` l.253-301 | `.i18n-switch` : `rgba(255,255,255,.22)`, `rgba(33,150,243,.08)`, `#2196f3` | Variante claire/sombre gérée à la main |
| `components/ecart-bo-table/ecart-bo-table.component.scss` l.3-28 | Bloc `:host` de 26 variables `--rd-*` | Identique dans 21 fichiers |
| `components/user-log/user-log.component.scss` | `--surface: #fdfcfa`, `--text1: #1c1916`, `--green: #2a6644` | Quasi-doublons des valeurs rd |
| `components/reconciliation-launcher/reconciliation-launcher.component.scss` | `--bg: #F3F0E9`, `--nav: #14213D`, `--manual: #1E9A5A`, `--assist: #2D7FD3`, `--magic: #6757E0` + bloc sombre | Palette indépendante |
| `components/modern-popup/modern-popup.component.ts` l.171-329 et l.447-463 | `#FAFAF8`, dégradés `#243044 → #1A2535`, `#5A9E74 → #2E6B47` / `#fff`, `#007bff`, `#0056b3`, `#f5f5f5`, `#999` | Deux styles dans le même fichier, en chaînes TS |
| `components/sidebar/sidebar.component.scss` l.3, 68, 112 | `#ecf0f1`, `#bdc3c7`, `white` | Textes de navigation |
| `src/app/styles/_dashboard-filters.scss` l.32-40 | `border: 1px solid #ddd`, `border-color: #2196f3` au focus après `outline: none` | Focus non conforme |
| `components/certification-solde/*.scss` | Topnav `#1a2332` | Marine différent de `#1A2535` |
| `components/dashboard/dashboard.component.ts` | 23 couleurs de graphiques en dur | Palette de données à tokeniser (lecture des variables CSS au rendu ou constantes partagées : **TS → autorisation**) |

### 10.2. Valeurs structurelles pouvant rester locales

- Largeurs de colonnes de tableaux spécifiques (`min-width: 350px` dans `dashboard-reconciliation.component.scss:568` pour 3 métriques).
- Hauteurs de zones de graphiques, `max-height` de listes déroulantes, grilles propres à une page.
- `position: sticky; top: 0` des en-têtes de tableaux (mécanique), `overflow` des conteneurs de défilement.
- `calc()` dépendant du contenu.

### 10.3. Valeurs dynamiques (à conserver)

- `[style.width.%]="progressPercentage"` / `loadProgress` (barres de progression) dans `reconciliation-results`, `ecart-bo-table`, etc.
- `[ngStyle]="logoStyle" / "logoAlign" / "logoPadding"` dans `sidebar.component.html` (paramétrage du logo par entreprise).
- Couleurs calculées par `ThemeService.deriveTheme()`.

### 10.4. Exceptions à justifier

- `.cdk-overlay-container { z-index: 11000 !important }` (`styles.scss:240`) : nécessaire tant que des modales locales utilisent `2000` à `10000` ; à remplacer par l'échelle de `z-index`.
- Les `z-index: 2147483000+` (valeur maximale 32 bits) : à identifier et justifier individuellement en phase 4.

---

## 11. Doublons et conflits CSS

1. **`body` défini trois fois** avec des polices différentes : `styles.scss` l.47 (`'Roboto'`, `line-height 1.6`), `styles.scss` l.236 (`Roboto, "Helvetica Neue"`), `app.component.scss` l.1 (`-apple-system, …`, sans effet réel car encapsulé dans le composant). `* { box-sizing }` déclaré deux fois.
2. **`html, body { height }` / `overflow-y`** redéfinis 3 fois dont une sous hack Chrome `@media screen and (-webkit-min-device-pixel-ratio:0)` avec `!important`, plus le script JS de `index.html`.
3. **Sélecteur `[class*="-container"]`** : touche toute classe contenant « -container » (`.filters-container`, `.table-container`, `.ecart-bo-table-container`…), avec `!important` sous Chrome.
4. **`.ng-star-inserted`** : classe ajoutée par Angular aux éléments insérés par les directives structurelles ; la règle globale `position: relative; z-index: 1` modifie donc la mise en page en fonction de détails d'implémentation d'Angular.
5. **`.topnav`, `.nav-btn`, `.nav-brand`, `.ph-eyebrow`, `.hero-kpi-strip`** : définis à l'identique ou presque dans ~30 fichiers.
6. **`.btn` global vs `.nav-btn` / `.btn-*` locaux** : variantes concurrentes ; `.btn-primary` global bleu `#2196F3` vs boutons marine des pages rd.
7. **`--primary-color`** : défini en `:root` (`#2196F3`) puis réécrit par `ThemeService` avec la couleur de marque (`#667eea` par défaut) ; les composants qui l'utilisent changent de couleur selon l'entreprise, les autres non.
8. **`ModernPopup`** : deux feuilles de style injectées (`.modern-popup` défini avec deux apparences différentes selon la méthode appelée).
9. **Filtres** : `select.filter-select` et `mat-form-field.filter-select` partagent une classe pour deux composants très différents ; `.mat-form-field-subscript-wrapper { display: none }` masque aussi les messages d'erreur Material.

Établir quels styles sont **morts** nécessite une vérification visuelle et des recherches de références classe par classe : ce sera fait page par page en phase 4, pas de manière globale.

---

## 12. Audit initial d'accessibilité (code uniquement)

### 12.1. Contrastes calculés (WCAG 2.x, formule de luminance relative)

Mesurés avec un script Node sur les couples réellement présents. **Ces chiffres ne remplacent pas un contrôle sur le rendu** (opacités, dégradés, superpositions non pris en compte).

**Existant**

| Couple | Ratio | Verdict texte courant (4,5) |
|---|---|---|
| `--rd-text1 #1A1714` / `--rd-surface #FAFAF8` | 17,08 | OK |
| `--rd-text2 #5C5650` / `--rd-bg #F2F0EB` | 6,35 | OK |
| `--rd-text3 #9B9489` / `--rd-surface #FAFAF8` | **2,87** | **Échec** (même en grand texte < 3) |
| `--rd-text3 #9B9489` / `--rd-bg #F2F0EB` | **2,64** | **Échec** |
| `--rd-green-m #5A9E74` / surface | 3,05 | Échec texte ; OK graphique |
| `--rd-amber-m #D4915A` / surface | **2,51** | **Échec** |
| `--rd-amber #A85F1E` / `--rd-amber-l #FBF0E4` (badge) | 4,32 | **Échec** texte courant |
| `--rd-green` / `--rd-green-l` ; `--rd-red` / `--rd-red-l` | 5,64 ; 7,47 | OK |
| `--rd-border #E4E0D8` / surface (limite de champ) | **1,26** | **Échec** 3:1 composant |
| blanc / `#667eea` (thème par défaut) | 3,66 | Échec texte courant |
| blanc / `#2196F3` (`.btn-primary`) | **3,12** | **Échec** |
| blanc / `#4CAF50` (succès) | **2,78** | **Échec** |
| blanc / `#FF9800` (avertissement) | **2,16** | **Échec** |
| `#999` / blanc (popups legacy) | **2,85** | **Échec** |
| `#ECF0F1` / `#3498DB` (sidebar, élément actif) | **2,75** | **Échec** |
| `#BDC3C7` / `#2C3E50` (sous-menu) | 6,17 | OK |

**Palette cible fournie par la mission**

| Couple | Ratio | Verdict |
|---|---|---|
| Texte `#1F2A2E` / fond `#F2EEE4` ; / surface `#FBF9F4` | 12,68 ; 13,97 | OK |
| Atténué `#6B7377` / fond `#F2EEE4` | **4,17** | **Échec texte courant** → foncer (ex. vers `#5F676B`, à recalculer) |
| Atténué `#6B7377` / surface `#FBF9F4` | 4,59 | OK de justesse |
| Accent `#1D5C63` / surface ; blanc / accent | 7,22 ; 7,60 | OK |
| Bordure `#E0DACB` / surface ; / fond | **1,33 ; 1,20** | Décoratif seulement ; **une bordure de contrôle doit atteindre 3:1** → token distinct `--color-border-strong` |
| Succès `#3F7D58` / surface | 4,66 | OK de justesse |
| Avertissement `#9A6A14` / surface ; / fond | **4,49 ; 4,08** | **Échec** → foncer légèrement |
| Erreur `#A5453A`, Info `#3E5C8A`, Doublon `#6A4C8C` / surface | 5,68 ; 6,43 ; 6,60 | OK |
| Sombre : texte / fond ; / surface | 14,19 ; 12,71 | OK |
| Sombre : atténué `#9AA3A6` / surface `#1E2527` | 6,05 | OK |
| Sombre : accent `#6FB7BE` / surface ; fond / accent | 6,81 ; 7,61 | OK |
| Sombre : bordure `#2C3639` / surface | **1,26** | Même remarque que le thème clair |
| Sombre : couleurs sémantiques **claires** réutilisées sur surface sombre | **2,24 à 3,30** | **Échec** → variantes éclaircies obligatoires en thème sombre |

### 12.2. Autres constats

| Point | Constat | Nature |
|---|---|---|
| Focus visible | 140 `outline: none|0` contre 16 `:focus-visible` (dont 8 dans `reconciliation-launcher`) | Défaut probable (à confirmer navigateur) |
| Navigation clavier | 182 `(click)` sur `div`/`span`/`tr`/`td`/`li`/`i` (ex. carte utilisateur de la sidebar, case `role="checkbox"` des services magiques) ; 5 `(keydown)` seulement ; 10 `tabindex` | Défaut observé dans le code |
| Liens-boutons | `<a href="#" (click)="…; $event.preventDefault()">` dans la sidebar (groupes, déconnexion) | Sémantique incorrecte, `aria-expanded` absent sur les groupes |
| Libellés | 872 `<label>` mais seulement 119 `for=` ; recherches avec `placeholder` seul (`ecart-bo-table`) | Associations incomplètes (à mesurer page par page) |
| Boutons icône seule | ≈ 33 sans `aria-label` ; `×` de fermeture avec `aria-label` dans `ModernPopup` (bien) | Défaut observé |
| ARIA | 61 `aria-label` ; 13 `role="dialog"` ; 1 région `aria-live`/`role="alert"`/`role="status"` | Annonces d'erreurs et de chargement absentes |
| Dialogues | Pas de piégeage du focus, pas de restitution du focus au déclencheur (à confirmer), Échap géré dans `ModernPopup` | Défaut probable |
| Statuts | Libellés textuels souvent présents, mais pastilles `.status-dot` et emojis (✅ ⚠️) utilisés comme seuls repères dans certaines cartes | À vérifier page par page |
| Mouvement | 2 `prefers-reduced-motion` ; `fa-spin` et transitions `all` partout | Défaut observé |
| Tooltips | `title` (267) : non accessible au clavier ni au tactile | Défaut observé |
| Langue | `<html lang="fr">` dans `index.html`, synchronisé avec la langue choisie par `I18nService` (commentaire l.25 de `i18n.service.ts`) | Correct dans le code ; à confirmer au rendu |

**Aucun audit WCAG complet n'a été réalisé** : lecteur d'écran, ordre de tabulation réel, zoom 200 % / 400 %, contraste sur rendu et cibles tactiles restent **à vérifier** dans un navigateur.

---

## 13. Évaluation du responsive (code uniquement)

| Point | Constat |
|---|---|
| Shell | Sidebar `position: fixed; width: 350px` sans `@media` ; `<main>` en `margin-left: 350px; width: calc(100% - 350px)`. **À 360 px de large, il resterait 10 px pour le contenu** tant que la sidebar est affichée. Le bouton de masquage n'apparaît qu'au survol (`.app-container:hover`), donc difficilement accessible au tactile |
| Points de rupture | 25 valeurs différentes ; `768px` dominant (81 occurrences) |
| Tableaux | 69 conteneurs `overflow-x`, mais la règle globale `[class*="-container"] { overflow-y: auto }` crée des défilements verticaux imbriqués ; risque de défilement horizontal global quand un tableau n'a pas de conteneur |
| Topnav | Hauteur fixe, actions en ligne ; comportement sous 768 px à vérifier |
| Modales | `ModernPopup` : `width: 92%; max-width: 420px` (correct) ; modales locales non analysées individuellement |
| Viewport | `<meta name="viewport" content="width=device-width, initial-scale=1">` présent |

**Aucune vérification à 360 / 768 / 1440 / 1920 px n'a été faite** : tout reste à contrôler en phase 4.

---

## 14. Risques et dépendances

| Risque | Gravité | Détail | Atténuation |
|---|---|---|---|
| R1 — Règles globales (I1) | Élevée | Toucher `.ng-star-inserted` ou `[class*="-container"]` peut casser le défilement ou les superpositions de toutes les pages | Les laisser en place jusqu'à la fin ; neutraliser une règle à la fois, avec vérification visuelle sur un échantillon de pages |
| R2 — Fichiers TS géants (I2) | Élevée | Éditer 577 Ko / 418 Ko de TS mêlant template et logique | Modifications limitées aux chaînes `template`/`styles`, diff relu ; ou extraction préalable autorisée |
| R3 — `ModernPopup` (I3) | Moyenne | Changement de DOM ou de focus pouvant altérer la résolution des Promises (`showConfirm` → `boolean`) | Ne pas toucher aux méthodes ni aux résolutions ; harmonisation CSS d'abord ; focus trap ajouté sans changer la signature |
| R4 — Travail non commité (I4) | Élevée | Mélange avec mes commits, conflits sur `fr.json`/`en.json` et pages modifiées | Décision préalable (§17) |
| R5 — `ThemeService` (I23) | Moyenne | La marque par entreprise peut produire des couleurs illisibles sur la palette crème, ou être ignorée | Définir précisément quelles variables la marque peut piloter |
| R6 — Absence de tests UI | Élevée | 0 test de composant de page, 0 e2e, 0 capture | Vérification manuelle obligatoire ; scénarios listés par page |
| R7 — Lancement de l'app | Moyenne | Nécessite backend (proxy `http://localhost:8080`), MySQL, certificats `C:/Certs/...` pour `npm start`, comptes utilisateurs | `npm run start-http` + backend local ; identifiants à fournir |
| R8 — Budgets | Faible | Bundle initial déjà à 6,52 Mo (> 6 Mo) ; ajouter des styles globaux augmente `styles.css` (79 Ko aujourd'hui) | Les styles globaux remplacent des copies locales : gain net attendu |
| R9 — i18n | Moyenne | Tout nouveau libellé (ex. « Réinitialiser les filtres ») doit exister en FR et EN | Ajout systématique dans les deux fichiers |
| R10 — Thème sombre partiel | Moyenne | Activer le sombre avant la migration complète rendrait les pages non migrées illisibles (couleurs claires en dur) | Ne pas exposer le choix utilisateur avant que les pages concernées soient migrées (§17) |
| R11 — Specificité | Moyenne | 219 `!important` et 38 `::ng-deep` peuvent empêcher les styles globaux de s'appliquer | Les retirer à la migration de chaque page |

Dépendances techniques : Angular 14 / Material 14 (API de thème `mat.define-light-theme` disponible) ; CDK 14 (`A11yModule`, `FocusTrap`, `LiveAnnouncer`) ; Sass via le builder Angular ; Font Awesome par CDN.

---

## 15. Composants à réutiliser et à harmoniser

### À réutiliser tels quels (ou presque)

- `PopupService` (API publique inchangée) — c'est le point d'entrée des notifications, confirmations et saisies.
- `ThemeService` (mécanisme existant de variables CSS et de persistance) — à étendre plutôt qu'à dupliquer.
- `LanguageSwitcherComponent` + `.i18n-switch`.
- `mat-select` + `ngx-mat-select-search` (à thématiser, pas à remplacer).
- Angular CDK `A11yModule` (déjà installé, non utilisé) pour le focus des dialogues.
- `_dashboard-filters.scss` comme base de la barre de filtres.
- Les bonnes pratiques de `reconciliation-launcher` (`:focus-visible`, palette sombre).
- Le gabarit rd26 des pages de résultats (topnav, en-tête serif, bande KPI) comme référence visuelle.

### À harmoniser

- `ModernPopupComponent` (deux styles → un ; accessibilité).
- `ProgressPopupComponent`, `ProgressIndicatorComponent`, `TraitementJobBannerComponent`.
- `SidebarComponent` + shell `AppComponent` (largeur, responsive, sémantique des liens).
- Topnav, en-têtes, bandes KPI, cartes KPI, boutons, tableaux, pagination, onglets, menus d'export, états vides / chargement / erreur, badges.

### À créer (phase 3, après validation)

Dans `src/app/shared/ui/` (dossier `shared/` existant), composants **standalone** (pris en charge par Angular 14) et classes CSS globales :

- Classes globales (fonctionnent sans toucher au TS) : boutons, champs, tableaux, badges, conteneurs de défilement, topnav, en-têtes.
- Composants de présentation (entrées / sorties uniquement) : en-tête de page, carte KPI, badge de statut et de type, pagination, état vide / chargement / erreur, barre de filtres (projection de contenu), onglets.

---

## 16. Plan de migration priorisé (proposition)

L'ordre de la mission est conservé, avec deux ajustements justifiés par l'audit : (a) une **étape 0 de préparation** pour traiter les décisions P0, (b) les règles globales dangereuses ne sont neutralisées qu'**à la fin**, une fois les pages migrées et vérifiables.

| Étape | Périmètre | Fichiers connus | Dépendances | Risques | Validations | Critères de réussite |
|---|---|---|---|---|---|---|
| **0. Préparation** | Décisions §17 ; état Git propre pour la branche `refonte-design` | — | Utilisateur | R4 | `git status` | Branche créée sans perte de travail ; décisions consignées |
| **1. Tokens et thème** (phase 2) | `src/styles/tokens.scss` (ou `.css`) : couleurs sémantiques claires/sombres, typographie, espacements 4 px, rayons, ombres, `z-index`, durées, focus, tokens statuts et types ; **alias `--rd-*` → tokens** sur `:root` ; mixins de points de rupture ; `[data-theme]` + `prefers-color-scheme` ; thème Material personnalisé ; mouvement réduit global | `src/styles.scss`, nouveau fichier de tokens, `angular.json` (styles, si autorisé), `index.html` (script anti-flash de thème si autorisé), `theme.service.ts` (si autorisé) | Décisions D2, D3, D4, D5, D6 | R5, R10 | `npm run build` ; `jest` ; contrastes recalculés et documentés ; vérification visuelle d'un échantillon (si app lançable) | Aucune page modifiée visuellement de manière non voulue (les blocs `:host` locaux restent prioritaires) ; tokens chargés ; thème sombre basculable sur une page témoin |
| **2. Composants fondamentaux** (phase 3) | Boutons, champs, sélecteurs (thème Material + natif), cases, dates, upload | `src/app/shared/ui/`, styles globaux | Étape 1 | R11 | Build ; tests ; clavier sur page de démonstration interne | API documentée ; aucun binding modifié |
| **3. Feedback et overlays** (phase 3) | `ModernPopup` (un style, `role="dialog"`, `aria-modal`, focus trap CDK, retour du focus), progression, bandeau, états vide / chargement / erreur, région `aria-live` | `modern-popup.component.ts` (**TS**), `progress-popup`, `progress-indicator`, `traitement-job-banner` | Étape 1, D7 | R3 | Build ; tests ; scénarios confirm/annuler/Échap manuels | Promises inchangées ; focus piégé et restitué |
| **4. Tableaux, filtres, pagination, KPI, badges, en-têtes** (phase 3) | `.ds-table`, conteneur de défilement, pagination, barre de filtres, KPI, badges statut/type, topnav global | `shared/ui/`, `_dashboard-filters.scss` | Étapes 1-3 | R11 | Build ; tests | Composants sans logique métier ; événements re-émis vers les méthodes existantes |
| **5. Écrans de réconciliation** (phase 4) | Ordre proposé : `matches-table` (pilote) → `ecart-bo-table` → `ecart-partner-table` → `ecart-bo-summary`* → `rapport-reconciliation-bo-partenaire` → `controle-interne-bo-partenaire` → `reconciliation-results` (inline, D8) → `reconciliation-report` (inline, D8) → `etat-reconciliations` → `dashboard-reconciliation` → `reconciliation-global-preview` → `reconciliation-launcher` → `file-upload`* → `column-selection` → `certification-solde` | voir §6.2 | Étapes 1-4, D8, D10 | R2, R6 | Par page : build, jest, diff des bindings (`(click)`, `[(ngModel)]`, `*ngIf`, `*ngFor`) comparé avant/après, vérification visuelle clair/sombre/360 px si possible | Un commit par page ; aucun appel API, route, condition ou événement modifié |
| **6. Autres pages** (phase 4) | Shell + sidebar (responsive), puis pages rd26 restantes (même gabarit, faible coût), puis legacy et administration | §6.1, §6.3, §6.4 | Étape 5 | R1, R6 | Idem | Idem |
| **7. Documentation et démonstration** (phase 5) | `docs/design-system.md` ; route `/design-system` enregistrée seulement si `isDevMode()` (API Angular 14), sans guard modifié | `app-routing.module.ts` (**TS**, autorisation), nouveau composant | Étapes 1-6, D12 | Exposition en production | `npm run build` (prod) et vérification que la route est absente | Page indisponible en build de production |
| **8. Nettoyage final** | Neutralisation une par une des règles globales (I1), script `index.html`, polices inutiles, styles morts vérifiés | `styles.scss`, `index.html` | Étape 6 | R1 | Vérification visuelle sur toutes les pages migrées | Aucune régression de défilement ou de superposition constatée |

\* Fichiers actuellement modifiés par l'utilisateur : traités seulement après décision D10.

Le **pilote `matches-table`** remplace « Comparaison BO/partenaire » en tête de liste : même gabarit que les écrans d'écarts, taille modérée, fichiers séparés, aucune modification utilisateur en cours. Il permet de valider le protocole avant de toucher aux écrans plus lourds.

---

## 17. Points nécessitant une décision

| # | Décision | Options | Recommandation |
|---|---|---|---|
| D1 | **Version Angular** (14.2 et non 20) | a) Refonte en Angular 14 ; b) montée de version préalable (projet séparé, hors mission) | **a** : rester en Angular 14, `*ngIf`/`*ngFor`, composants standalone (supportés) |
| D2 | **Palette de référence** | a) Palette de la mission (`#F2EEE4`, accent pétrole `#1D5C63`) avec corrections de contraste ; b) conserver les valeurs rd26 actuelles en les centralisant ; c) palette de `reconciliation-launcher`/`docs/*-reference.html` | a, avec alias `--rd-*` pointant vers les nouveaux tokens (changement de teinte visible mais global et cohérent). Le marine `--rd-navy` des topnavs doit être explicitement remplacé ou conservé |
| D3 | **Marque par entreprise (`ThemeService`)** | a) La marque pilote uniquement la sidebar et le logo ; b) la marque pilote aussi l'accent ; c) désactiver la dérivation de couleurs | a : préserve la personnalisation existante sans dégrader les contrastes des pages |
| D4 | **Exposition du thème sombre** | a) Mécanisme livré en phase 2, sélecteur visible seulement après migration des pages ; b) visible immédiatement | a (sinon pages non migrées illisibles) |
| D5 | **Polices** | a) Conserver Google Fonts CDN (Sora et Instrument Serif déjà chargés) et retirer Roboto en double et Plus Jakarta Sans ; b) auto-héberger les fichiers dans `assets/` (pas de dépendance npm, mais fichiers à télécharger) | a, sauf contrainte réseau interne. **La politique réseau des postes cibles est à confirmer** |
| D6 | **Thème Angular Material** | a) Remplacer `indigo-pink.css` par un thème Sass personnalisé (modification de `angular.json`) ; b) surcharges CSS uniquement | a |
| D7 | **Modifications TS autorisées pour `ModernPopupComponent`** | a) Autoriser l'édition des chaînes CSS et l'ajout de `role`, `aria-modal`, focus trap, sans toucher aux signatures ni aux Promises ; b) CSS global uniquement (fragile) | a |
| D8 | **Templates inline géants** | a) Autoriser l'édition des seules chaînes `template:` et `styles:` ; b) extraire d'abord vers `.html` / `.scss` (refactor neutre, commit dédié) ; c) exclure ces écrans | b : diff de migration lisible, risque concentré dans un commit mécanique vérifiable |
| D9 | **Emojis dans l'interface** | a) Remplacer par Font Awesome dans les boutons, KPI et onglets (texte inchangé) ; b) conserver | a |
| D10 | **Travail non commité (45 fichiers frontend)** | a) Vous committez ou mettez de côté vos changements avant la création de `refonte-design` ; b) je crée la branche avec l'arbre actuel et j'exclus vos fichiers de mes commits (je ne migre pas ces fichiers tant qu'ils restent modifiés) | a |
| D11 | **Topnav répété dans 37 pages** | a) Harmoniser via CSS global puis composant `app-page-header` (même contenu) ; b) supprimer le topnav au profit d'un en-tête unique du shell (changement structurel) | a |
| D12 | **Page `/design-system`** | a) Route ajoutée uniquement si `isDevMode()` (aucun guard modifié ; le build par défaut est en production) ; b) application ou projet séparé | a. À noter : `environment.prod.ts` est supprimé dans votre copie de travail ; ce mécanisme n'en dépend pas |
| D13 | **Correspondance des statuts** | Confirmer : Rapproché = `matches` ; Absent du relevé = `boOnly` (écarts BO) ; Absent du BO = `partnerOnly` (écarts partenaire) ; Écart de montant = `mismatches` (rapport) ; Doublon = détection des doublons (import / rapports) | À valider par vous : le code ne permet pas de trancher pour « Doublon » |
| D14 | **Statuts de traitement** (OK / NOK / En cours / Traité / En attente / Erreur) | Les inclure dans les tokens métier visuels ? | Oui, ils apparaissent dans les mêmes tableaux |
| D15 | **Types d'opérations** | « Crossborder » n'existe que comme `referenceType` `CROSS_BORDER` ; l'application connaît d'autres types d'opérations | Confirmer la liste à tokeniser |
| D16 | **Vérifications visuelles** | a) Vous fournissez un environnement lançable (backend sur 8080, base, compte de test) et j'utilise le navigateur intégré ; b) vérifications manuelles de votre côté selon une liste fournie | a si possible ; sinon chaque phase indiquera explicitement les contrôles non réalisés |
| D17 | **Proxy** | La mission mentionne HTTPS 8090, `proxy.conf.json` cible `http://localhost:8080` | Aucune modification ; à confirmer pour le lancement local |

---

## 18. Critères de réussite par phase

| Phase | Critères de sortie | Validations prévues |
|---|---|---|
| 1 — Audit | Seul `docs/audit-design.md` créé ; aucun autre fichier suivi modifié | `git status` / `git diff --stat` comparés à l'état initial |
| 2 — Tokens et thème | Tokens centralisés ; alias `--rd-*` ; clair/sombre via `data-theme` et `prefers-color-scheme`, choix persistant ; overlays CDK et `ModernPopup` héritent du thème ; contrastes ≥ 4,5 / 3 documentés pour tous les couples | `npm run build` sans nouvel avertissement ; `npx jest` (72 réussis, 2 ignorés attendus) ; tableau de contrastes recalculé ; contrôle visuel si D16 |
| 3 — Composants partagés | Composants standalone sans logique métier, entrées/sorties documentées, focus visible, noms accessibles, dialogues avec focus trap | Build ; jest ; tests unitaires de présentation pour les nouveaux composants (Jest déjà en place, sans nouvelle dépendance) ; clavier sur page interne |
| 4 — Migration | Pour chaque page : bindings, événements, appels API, conditions et routes identiques (diff contrôlé) ; styles locaux supprimés seulement après vérification des références | Build ; jest ; diff ciblé ; contrôle 1440 / 768 / 360 px et clair/sombre si D16 ; liste des scénarios manuels restants |
| 5 — Documentation | `docs/design-system.md` conforme au code livré ; `/design-system` absente du build de production ; rapport final | Build production + vérification de la table des routes |

---

## 19. Résultats des commandes de référence (état initial, avant toute modification)

| Commande | Résultat |
|---|---|
| `npm run build` (production) | **Réussi** (exit 0) en 4 min 20 s. `main` 6,41 Mo, `styles` 78,92 Ko, total initial 6,52 Mo. **33 avertissements préexistants** : budget initial dépassé de 536 Ko ; budget de style dépassé pour `banque` (55,7 Ko), `comptes` (112 Ko), `operations` (68,6 Ko), `traitement` (68,5 Ko) ; 11 avertissements CSS dans les styles inline de `reconciliation-report` (`.status-en-cours.....`, imbrication `&` non supportée) ; 17 avertissements CommonJS (`canvg`, `jszip`) |
| `npx jest --ci` | **Réussi** : 6 suites, 74 tests (72 réussis, 2 ignorés), 26 s |
| Lint | **Non exécuté** : aucun outil configuré |
| Tests e2e / visuels | **Non exécutés** : aucun outil installé |
| `ng serve` / navigateur | **Non exécuté** |
| Contrastes | **Calculés** par script (formule WCAG) sur les valeurs du code et de la palette cible ; **non vérifiés sur rendu** |

Ces résultats serviront de référence : tout avertissement supplémentaire en phase 2+ sera attribuable aux modifications de la refonte.
