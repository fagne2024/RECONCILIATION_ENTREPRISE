# ReconciliApp — Passage Multi-entreprises (Multi-Tenant)

> **Document de plan** — Phase 0 (audit, lecture seule) + plan d'implementation valide.
> Date : 2026-10-12. Depot : `C:\Users\YamarNDAO\Downloads\reconciliation-app`.
> Statut : **diagnostic presente ; decisions d'architecture validees par le porteur ; aucune modification de code effectuee.**
> Emplacement : dossier de plan OpenCode (`~/.opencode/plan`). Une copie dans `AUDIT/08-phase0-multitenant.md` pourra etre creee lors du passage en agent d'execution.

---

## 0. Decisions d'architecture validees

| # | Sujet | Decision validee |
|---|---|---|
| 1 | Relation entreprise / pays | Les pays (`pays`, `profil_pays`) et la colonne `pays` des entites metier deviennent **propres a chaque entreprise** (referentiel par tenant). |
| 2 | Unicite des identifiants | **Revision du 2026-10-12** : `username` et `email` restent **globalement uniques** (retour a la premiere proposition). **Le login reste inchange** : `{ username, password }`, sans selection d'entreprise. |
| 3 | Profils | `profil` devient **propre a chaque entreprise** -> contrainte `(entreprise_id, nom)`. |
| 4 | Nom de l'ecran SUPER_ADMIN | **« Administration plateforme »** (evite la collision avec l'ecran `Configuration` d'entreprise existant). |
| 5 | Remise initiale du mot de passe ADMIN | Option **(a)** : **lien d'activation a usage unique par email** (jamais de mot de passe en clair renvoye par l'API). |
| 6 | Entreprise historique | **Oui** : l'entreprise historique est **creee par migration** et les **donnees existantes sont migrees** (rattachees a cette entreprise). On ne cree **pas** de nouvel administrateur : l'admin existant est conserve et rattache. |
| 7 | Module `MAGIC_RECONCILIATION` | **Ne pas prendre en compte** : la fonctionnalite existe deja sous un autre nom. Retire du catalogue. |
| 8 | Prealable Flyway (P1) | **Oui** : etape de *baseline* Flyway **avant** l'etape 1. |
| 9 | Perimetre SUPER_ADMIN | **Oui** : aucun acces aux donnees metier en v1 (aucune vue transversale). |
| 10 | Port / proxy | **Oui** : le backend reste sur `8080`, derriere nginx/Apache. (Lequel des deux est actif reste a confirmer.) |

---

## 1. Architecture actuelle

```
Navigateur (SPA Angular 14.2 - TypeScript 4.8)
  |  HTTPS (via proxy)
  v
nginx.conf / apache.conf  -- TLS, reverse-proxy (proxy_pass -> localhost:8443)
  |
  v
Spring Boot 3.2.3 (Java 17, Maven)  -- server.port=8080 (nginx/apache -> 8443)
  |  JDBC MySQL (mysql-connector 8.0.33), base `top20`
  v
MySQL local : allowMultiQueries=true, useSSL=false, createDatabaseIfNotExist=true
```

- Backend : `backend/` - packages `config, controller, dto, entity, exception, filter, interceptor, json, mapper, model, repository, service, service.reconciliation, util`.
- Projet Node/TypeScript/Prisma **orphelin** dans `backend/src/{app.ts,server.ts,controllers,models,routes,services}` (dette, non utilise).
- Frontend : `frontend/` - Angular 14, `proxy.conf.js/json`.
- Racine projet : `Start-App.ps1`, `nginx.conf`, `apache.conf`, `AUDIT/`, `docs/`, dump `top20_*.sql|zip` (66 Mo, non tracke).
- Le role git racine est `C:\Users\YamarNDAO` (le home), pas le dossier du projet.

**Volumetrie mesuree** : 49 controllers, **492 mappings**, 49 entites `@Entity`, 15 fichiers de test backend ; ~73 composants/services et 60 routes frontend.

---

## 2. Authentification et autorisation (etat actuel)

**Flux de connexion** (`controller/AuthController.java`) :
1. `POST /api/auth/login` - charge `user` par `username`, gere le verrouillage (`LoginLockService`), refuse si `enabled=false` (403), verifie BCrypt (fallback legacy plaintext).
2. Si 2FA active : renvoie `preAuthTicket`, pas de token.
3. Sinon emet un JWT HS256 (`service/JwtService.java`) et renvoie `username`, `profil`, `droits[]`, `pays`.
4. `POST /api/auth/verify-2fa` - consomme le ticket (usage unique), valide le TOTP, emet le JWT.

**JWT** (`JwtService.java`) : claims `username` + `role` (`ADMIN`/`USER`). Expiration 24 h. Pas d'`issuer`/`audience`, pas de revocation. Secret obligatoire (echec au demarrage si absent).

**Validation par requete** (`filter/JwtAuthenticationFilter.java`) : recharge l'utilisateur a chaque requete (`loadUserByUsername`), verifie `isEnabled()`. Ne verifie pas (encore) le statut d'entreprise.

**Autorites** (`service/CustomUserDetailsService.java`) : `ROLE_ADMIN` si `AdminRoleUtil.isAdminUser`, sinon `ROLE_USER`.

**Autorisation** :
- `config/SecurityConfig.java` : `authenticated()` par defaut + allow-list (login, verify-2fa, forgot/reset-password, check-admin, logo/theme/navigation-labels). *(Vague 1 de securite deja appliquee.)*
- `interceptor/PermissionInterceptor.java` (enregistre `WebConfig.java`) : mappe chemin HTTP -> module/permission via `PermissionCheckService` (910 lignes) ; renvoie **403** sinon. **Fail-open** sur exception et module/permission non mappes.
- `@PreAuthorize("hasRole('ADMIN')")` : **seulement 7 fois**, dans `controller/UserController.java`.

**Frontend** : `auth.interceptor.ts` (Bearer) ; etat dans `services/app-state.service.ts` (`localStorage` : `auth_token`, `username`, `userRights`) ; guards `auth.guard.ts`, `admin.guard.ts`, `module-access.guard.ts` ; menu `components/sidebar/` + `NavigationVisibilityService` + catalogue `constants/app-navigation-catalog.ts`.

---

## 3. Entites et donnees a rattacher

**Plateforme / transverse (portee globale)** : `module`, `permission`, `module_permission`.
**A trancher** : `user_log`, `navigation_label_audit`, `auth_ticket`, `password_reset_token`.

**Referentiel pays** (decision 1 -> **par entreprise**) : `pays`, `profil_pays`.

**Donnees metier (-> `entreprise_id`)** :
- avec colonne `pays` existante : `compte`, `operation`, `operation_bancaire`, `ecart_solde`, `ecart_bo_summary`, `trx_sf`, `oppart`, `suivi_ecart`, `service_reference` ;
- sans `pays` : `frais_transaction`, `commission_transaction`, `flux`, `releve_bancaire`, `releve_manual`, `compte_solde_bo`, `compte_solde_cloture`, `compte_regroupement`, `impact_op`, `redevance_agence_param`, `agency_threshold`, `agency_summary`, `result8rec`, `result8rec_audit`, `reconciliation_status`, `reconciliation_ok_keys`, `reconciliation_jobs`, `reconciliation_locks`, `auto_processing_models`, `calculation_rule`, `column_processing_rules`, `bo_partenaire_controle_interne(_comment)`, `reco_j1_blocking_comment`, `guide_document`, `guide_node`, `sop_document`, `sop_node`.

**Par entreprise (decisions 2 et 3)** : `user` -> `(entreprise_id, username)` / `(entreprise_id, email)` ; `profil` -> `(entreprise_id, nom)`.

> Les noms de table sont ceux des `@Table(name=...)`. Le schema MySQL reel peut differer (`ddl-auto=update`) - a confirmer via le baseline Flyway.

---

## 4. Organisation fonctionnelle (frontend <-> backend <-> donnees)

| Domaine (route Angular) | Guard | API principale | Module |
|---|---|---|---|
| `/reconciliation-launcher`, `/reconciliation`, `/upload*` | AuthGuard+ModuleAccess | `/api/reconciliation*`, `/api/results` | Reconciliation |
| `/results`, `/matches`, `/ecart-bo*`, `/controle-interne*`, `/report-dashboard` | idem | `/api/result8rec`, `/api/ecart-bo-summary`, `/api/bo-partenaire-controle-interne` | Resultats |
| `/dashboard`, `/stats*`, `/agency-summary` | idem | `/api/statistics`, `/api/stats`, `/api/agency-summary` | Dashboard/Statistiques |
| `/comptes`, `/operation*`, `/frais`, `/commission`, `/banque`, `/comptabilite` | idem | `/api/operations`, `/api/comptes`, `/api/frais*`, `/api/commission`, `/api/releve-bancaire` | Operations/Comptes/Frais/BANQUE |
| `/users`, `/profils`, `/permissions`, `/modules`, `/log-utilisateur` | **AdminGuard** | `/api/users`, `/api/profils` | Utilisateur/Profil |
| `/configuration/*` (logo, theme, niveaux validation, renommage) | **AdminGuard** | `/api/configuration/*` | Configuration (entreprise) |
| `/ranking*`, `/trx-sf`, `/impact-op`, `/oppart`, `/service-balance`, `/auto-processing-models`, `/aide`, `/sop*`, `/guide-utilisation` | AuthGuard(+ModuleAccess) | APIs dediees | modules dedies |

---

## 5. Mecanisme de migration actuel

- **Aucun mecanisme versionne operationnel** : Flyway non present dans `pom.xml`, aucune config `spring.flyway.*` ; `spring.jpa.hibernate.ddl-auto=update` en dev **et** prod.
- 66 fichiers `db/migration/V*.sql` **jamais executes par l'application**. Invalides ou en doublon : collisions `V4`, `V5`, `V6`, `V20`x3, `V23`x2, `V47`x2, `V53`x2, `V9999__*`, `VXX__*` (nom non conforme) ; `V3` en syntaxe PostgreSQL (`SERIAL`, `ON CONFLICT`) sur MySQL.
- Consequence : etablir un **baseline** Flyway a partir du schema reel plutot que rejouer V1 -> V61.

---

## 6. Risques et incompatibilites

| # | Risque | Impact |
|---|---|---|
| R1 | `ddl-auto=update` + Flyway non branche | Schema non reproductible, divergence prod |
| R2 | Versions Flyway dupliquees/invalides | Baseline impossible sans nettoyage |
| R3 | Detection admin par `username="admin"`/profil | Melange SUPER_ADMIN / ADMIN entreprise |
| R4 | `PermissionInterceptor` fail-open | Desactivation de module contournable |
| R5 | `isAdmin()` frontend = autorite locale | Faux sentiment de securite |
| R6 | Unicite globale `username`/`email`/`profil.nom` | **Resolu par decisions 2 & 3** (unicite par entreprise) |
| R7 | Mecanisme `pays` existant | Deux axes de cloisonnement a hierarchiser (entreprise > pays) |
| R8 | 7 `@Query(nativeQuery=true)` + `ProfilService.createNativeQuery` | Echappent aux filtres ORM -> fuite possible |
| R9 | Jobs/progressions en memoire, `FileWatcher`, `@Scheduled` | Contexte tenant a propager |
| R10 | Theme/logo/navigation en fichiers `config/` (singleton) | A rendre par entreprise |
| R11 | Collision « Configuration » | **Resolu par decision 4** (« Administration plateforme ») |
| R12 | Dump 66 Mo + secrets/proxy en clair | Hygiene / deploiement |
| R13 | JWT sans `entrepriseId`, sans revocation | Controle du statut entreprise au refus |
| R14 | `@ManyToOne` vers `compte`/`profil` | Fuites via relations si parent seul filtre |

---

## 7. Architecture multi-tenant cible

**Strategie : base MySQL unique partagee + colonne discriminante `entreprise_id`.**

**Isolation ORM (Hibernate 6.4 via Spring Boot 3.2.3) - Option retenue :**
`@TenantId` Hibernate 6 sur les entites metier + `CurrentTenantIdentifierResolver` alimente par un **`TenantContext`** (ThreadLocal) rempli dans `JwtAuthenticationFilter` a partir d'un claim JWT **verifie** `entrepriseId`.

**Garde-fous obligatoires (defense en profondeur) :**
1. `TenantContext` + `CurrentTenantIdentifierResolver` + filtre servlet.
2. Interdiction stricte de tout `entrepriseId` venant du client (body/param/header) - perimetre = contexte serveur uniquement.
3. Traitement des chemins de contournement : requetes natives, repositories personnalises, acces `EntityManager`/JDBC, exports/telechargements, taches planifiees/async, recherches globales, statistiques, endpoints « detail par id », cache applicatif, fichiers/pieces jointes.
4. Aspect/controle explicite d'appartenance pour toute ecriture et tout acces par identifiant.
5. **Fail-closed** : pas de contexte tenant => **403** sur les endpoints metier, sauf allow-list plateforme.

**Hierarchie des cloisonnements** : **entreprise (nouveau, socle)** > **pays (existant, a l'interieur de l'entreprise)**.

**SUPER_ADMIN** : `entreprise_id = null`, aucun acces metier en v1 (decision 9).

---

## 8. Catalogue de modules (valide, `MAGIC_RECONCILIATION` retire)

| Code | Portee | Contenu reel |
|---|---|---|
| `DASHBOARD` | metier | Tableaux de bord, statistiques, agency-summary |
| `RECONCILIATION` | metier | Lanceur, reconciliation, upload |
| `RESULTS` | metier | Resultats, ecarts, controle interne, rapport |
| `TRANSACTIONS` | metier | Operations, operations bancaires |
| `ACCOUNTS` | metier | Comptes, service-balance, redevance, flux |
| `FEES` | metier | Frais, commission |
| `BANK` | metier | Banque, releves bancaires |
| `ACCOUNTING` | metier | Comptabilite |
| `RANKINGS` | metier | Classements |
| `STATISTICS` | metier | Statistiques |
| `MODELS` | metier | Modeles de traitement, preprocessing |
| `USER_MANAGEMENT` | metier | Utilisateurs, profils, permissions, log utilisateur |
| `BUSINESS_SETTINGS` | metier | Configuration entreprise (logo, theme, niveaux validation, renommage) |
| `AIDE` | metier | Aide, SOP, guide |
| *(plateforme)* | **platform** | « Administration plateforme » - jamais activable pour une entreprise |

**Politique par defaut a la creation d'une entreprise** : tous les modules metier **actives** (a confirmer), afin que l'entreprise historique conserve son comportement actuel.

---

## 9. Plan d'implementation (etapes ; validation requise apres chacune)

### Prealable P1 - Baseline migrations (decision 8 : oui)
1. Ajouter Flyway au `pom.xml` + configuration.
2. Generer une baseline a partir du schema MySQL reel.
3. Nettoyer/corriger les migrations invalides ; passer `ddl-auto=validate`.
4. **Livrable : schema reproductible.** Validation avant etape 1.

### Etape 1 - Schema, migrations, entites
Entites `Entreprise`, `EntrepriseModule` (catalogue `module` reutilise/etendu). Ajout `entreprise_id` (nullable -> backfill -> `NOT NULL`) sur les tables metier **y compris `user`, `profil`, `pays`, `profil_pays`**. Contraintes d'unicite `(entreprise_id, username)`, `(entreprise_id, email)`, `(entreprise_id, nom)` pour profils, `(entreprise_id, code)` pour pays. Index. Creation de l'entreprise historique + rattachement des donnees. **Validation avant etape 2.**

### Etape 2 - Auth, roles, SUPER_ADMIN
- **Login modifie (decision 2)** : le payload porte l'entreprise (`entrepriseCode`) + `username` + `password` ; resolution de l'utilisateur dans cette entreprise. Le SUPER_ADMIN se connecte avec un scope plateforme explicite.
- Claim JWT `entrepriseId` (nul pour SUPER_ADMIN) + `role` incluant `SUPER_ADMIN`.
- `AdminRoleUtil`/`CustomUserDetailsService` etendus (`ROLE_SUPER_ADMIN`, `ROLE_ADMIN` par entreprise).
- **Controle du statut entreprise a chaque requete** dans `JwtAuthenticationFilter` -> refuse les jetons si l'entreprise est `SUSPENDUE`.
- `mustChangePassword`.
- Initialisation SUPER_ADMIN idempotente via variables d'environnement.
- **Tests des acces avant suite.**

### Etape 3 - Isolation multi-tenant
`TenantContext` + `@TenantId` + resolveur + filtre. Traitement des chemins particuliers (natif, exports, detail par id, taches planifiees, cache, fichiers). Tests d'isolation A/B (lecture et ecriture). **Validation.**

### Etape 4 - API entreprises
CRUD logique + suspension/reactivation + **creation atomique entreprise+ADMIN** (`@Transactional`), remise initiale par **lien d'activation a usage unique** (decision 5). Audit. Tests d'atomicite. **Validation.**

### Etape 5 - API modules et securite backend
Catalogue + associations entreprise-module, endpoints de gestion, `@RequiresModule("CODE")` + aspect, audits, reponses **403** verifiees. **Validation.**

### Etape 6 - Frontend Angular 14
Ecran **« Administration plateforme »** (onglets Entreprises / Modules), `superAdminGuard`, `moduleGuard`, menu dynamique (masquage par module actif, avec invalidation de cache fiable), etats chargement/erreur FR, design system existant. **Validation.**

### Etape 7 - Tests et non-regression
Tests backend/frontend, scenarios suspension/isolation/modules, bilan final. **Validation.**

---

## 10. Tests obligatoires (extrait)

- **Entreprises** : creation entreprise+ADMIN ; echec ADMIN => rollback entreprise ; code duplique rejete ; suspension/reactivation ; connexion refusee si entreprise suspendue ; rejet des jetons deja emis.
- **Autorisation** : SUPER_ADMIN autorise sur « Administration plateforme » ; ADMIN refuse (403) ; ADMIN ne peut pas creer/promouvoir un SUPER_ADMIN ; ADMIN ne peut pas gerer un utilisateur d'une autre entreprise ; non authentifie -> 401.
- **Isolation** : deux entreprises avec donnees propres ; A ne peut ni lire, ni modifier, ni acceder au detail par identifiant des donnees de B ; contournement par filtres/recherches/exports/natif teste.
- **Modules** : active -> acces ; desactive -> 403 ; ADMIN ne peut pas modifier les activations ; SUPER_ADMIN oui.
- **Migration** : base historique migree, integrite conservee, rattachement a l'entreprise par defaut, tous les modules metier actives pour elle, contraintes/index verifies.

---

## 11. Livrables attendus

- Liste complete des fichiers crees/modifies ; schema final ; migrations ordonnees ; catalogue definitif des modules.
- Variables d'environnement ; procedure securisee du premier SUPER_ADMIN.
- Commandes PowerShell (sauvegarde, migration, lancement, tests) ; commandes build Angular / demarrage Spring Boot.
- Resultats de tests **reellement executes** ; procedure de restauration ; precautions de deploiement ; travaux restants.

---

## 12. Points a reconfirmer / suivi

### Resolus le 2026-10-12
1. ~~Decision 6~~ -> **tranche** : entreprise historique creee par migration + donnees existantes migrees, sans nouvel administrateur.
2. ~~Login multi-entreprise (decision 2)~~ -> **tranche** : retour a l'unicite **globale** ; login inchange (`{ username, password }`). Le `forgot-password` par email reste donc non ambigu. Le SUPER_ADMIN se connecte sur un scope plateforme (role dedie), sans entreprise.

### Restant a trancher (non bloquants)
3. **Portee de rattachement** de `user_log`, `navigation_label_audit`, `auth_ticket`, `password_reset_token` (globaux ou par entreprise).
4. **Politique par defaut des modules** a la creation d'une entreprise (tout active ?).
5. **Proxy actif** : nginx **ou** Apache (les deux configs coexistent).
6. **Repository git** : la racine est le home Windows - strategie de commit/branche a definir.

---

## 13. Journal d'implementation

| Etape | Statut | Date | Livrable |
|---|---|---|---|
| P1 - Baseline Flyway | **Termine (valide)** | 2026-10-12 | `AUDIT/09-p1-flyway-baseline.md` |
| 1.1 - Correctifs latents (user.password_change_required, module.visible) | **Termine (valide)** | 2026-10-12 | `AUDIT/09-p1-flyway-baseline.md` (§6) |
| 1 - Schema, migrations, entites | A faire | - | - |
| 2 - Auth, roles, SUPER_ADMIN | A faire | - | - |
