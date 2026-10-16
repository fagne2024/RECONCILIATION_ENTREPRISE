# RAPPORT — Audit technique `reconciliation-app` (2026-10-16)

> Lecture seule. Aucune modification du code applicatif. Preuves dans `AUDIT/2026-10-16/00`–`06`.
> Remplace le rapport du **2026-10-08** comme photographie de **l’état actuel** (auth réactivée + multi-tenant). Les fichiers `AUDIT/07`–`18` restent des plans d’implémentation, pas cet audit.
> Priorités : 🔴 critique · 🟠 important · 🟡 amélioration · ⚪ suggestion.

---

## 1. Résumé

L’application **n’est plus « entièrement ouverte »**. Un JWT est exigé sur `/api/**` (`SecurityConfig.java:77-96`), `SqlController` a disparu, Flyway est branché, un tenant Hibernate isole 44 entités. C’est un socle défendable.

Elle **n’est pas prête pour une prod hostile**. Un utilisateur légitime (ou un JWT volé, 24 h, `localStorage`) peut encore : s’auto-attribuer des droits (`/api/profils/{id}/droits` exclu de l’intercepteur), usurper `admin` via `X-Username`, poser du HTML XSS dans les guides (permissions non mappées = fail-open), désactiver la 2FA sans TOTP, et lancer des réconciliations/uploads 3 Go **en parallèle** (verrou inopérant). Un ADMIN entreprise peut **supprimer un module du catalogue global**. Le matching compare des **chaînes** (`"1000"` ≠ `"1 000"` / `"1000.00"`), pas des montants.

**Comptage** (lu dans le code, 2026-10-16) : 55 controllers, ~520–577 mappings selon le décompte des annotations de classe, 25 `@PreAuthorize`, 56 entités, 44 `@TenantId`, ~800 `println`, 24 fichiers de test Java. Baseline : `mvn -B -DskipTests package` **SUCCESS**. `mvn test` complet **non exécuté** (MySQL `reco_test`).

| Niveau | Nb (ce rapport) |
|---|---|
| 🔴 Critique | 8 |
| 🟠 Important | 22 |
| 🟡 Amélioration | 12 |
| ⚪ Suggestion | regroupées |

**Zones à surveiller** : intercepteur, IDOR pays, matching texte, verrous reco, catalogue modules global, profil `dev`.

---

## 2. Constats

### [SEC-01] Intercepteur fail-open + chemins API non mappés — 🔴 Critique — Confiance Haute — **Exploitable aujourd’hui**

`PermissionInterceptor.java:195-198,261-267` ; `PermissionCheckService.java:419-427` ; `mapApiPathToModule` `:534-584`.

Sans username, ou si la vérif lève, ou si le module n’est pas dans la table de correspondance → **accès accordé**. Guides, SOP, configuration d’écriture, test, renommage, conversion, règles de calcul, etc. n’apparaissent pas dans la map.

**Scénario** : JWT USER → `PUT /api/guide-documents/update` avec HTML.  
**Impact** : lecture/écriture hors modèle de droits ; XSS (SEC-03).  
**Cause** : « mode permissif pour ne pas bloquer ».  
**Correction** : fail-closed ; allow-list explicite ; test : chemin inconnu → 403.  
**Effort** S/M — **Régression** : écrans dont l’API n’est pas mappée (guides, config) cassent jusqu’au mapping.

### [SEC-02] Escalade de privilèges `/api/profils/{id}/droits` — 🔴 Critique — Confiance Haute — **Aujourd’hui**

`PermissionInterceptor.java:97-99` (regex **avant** SuperAdmin/tenant) ; `ProfilController.java:156-186`.

**Scénario** : USER authentifié `POST /api/profils/{sonProfilId}/droits?moduleId=&permissionId=` (ou `/batch`).  
**Impact** : auto-promotion dans l’entreprise (droits module). Tenant Hibernate empêche le cross-entreprise, pas l’escalade interne.  
**Correction** : retirer l’exclusion ; exiger ADMIN + `@PreAuthorize` ; ne pas exclure les POST.  
**Effort** S — **Régression** : écran profil si le front charge les droits via ce GET sans permission « Profil ».

### [SEC-03] XSS stocké (guides/SOP) + CSP `unsafe-inline/eval` — 🔴 Critique — Confiance Haute — **Aujourd’hui**

`SecurityConfig.java:129-130` ; `GuideDocumentController.java:127-132` ; `bypassSecurityTrustHtml` (`guide-utilisation.component.ts:559`). Token `localStorage` (`app-state.service.ts:461`).

**Scénario** : SEC-01 ou droit documents → script → vol `auth_token` / `userRights`.  
**Correction** : sanitizer HTML à l’écriture ; ne plus `bypassSecurityTrustHtml` sur du contenu utilisateur ; CSP stricte (nonce).  
**Effort** M — **Régression** : mise en forme riche des SOP.

### [MET-01] `POST /api/reconciliation/start` ne lance rien — 🔴 Critique (métier) — Confiance Haute — **Aujourd’hui**

`ReconciliationController.java:638-644` : `reconcileAsync` commenté, `jobId` renvoyé quand même.

**Scénario** : l’UI appelle `/start` puis poll `/progress` → « En attente » / job absent.  
**Impact** : opérateurs croient qu’une reco tourne ; décisions sur du vide.  
**Correction** : implémenter l’async **ou** retirer l’endpoint et le parcours UI.  
**Effort** S (retrait) / L (vrai async).

### [OPS-01] Health proxy vs réalité — 🔴 Critique (prod) — Confiance Haute — **Aujourd’hui**

Pas d’Actuator. `HomeController.java:37-42` `/health` public sans DB. Config nginx historique vers `/actuator/health` → 404.

**Impact** : load balancer vert alors que MySQL down, ou l’inverse.  
**Correction** : Actuator `health` (DB) réseau interne only.  
**Effort** S.

### [DAT-01] Bascule Flyway `baseline-on-migrate` sur base réelle — 🔴 Critique (ops) — Confiance Moyenne — **Aujourd’hui si mal joué**

`application.properties:32-37` + `application-prod.properties:19-24`.

**Scénario** : prod dont le schéma ≠ V1 checksum → l’app **refuse de démarrer**.  
**Impact** : indisponibilité au déploiement.  
**Correction** : inventaire schéma réel, baseline documenté, jamais modifier V1.  
**Effort** M. **Non vérifié** : checksums de la prod réelle.

### [MET-08] Verrou de réconciliation inopérant (clé unique à chaque appel) — 🔴 Critique — Confiance Haute — **Aujourd’hui**

`ReconciliationController.java:316,427-445` : `lockKey = "reconcile_" + userId + "_" + System.currentTimeMillis()`. Collision **impossible**. Si le verrou échoue quand même, le code **continue** (`:441-445`, 429 commenté).

**Scénario** : double-clic / chunks parallèles → N matching en mémoire (3 Go × N).  
**Impact** : DoS CPU/RAM de l’instance.  
**Correction** : clé stable `tenant:user` (ou globale) ; 429 si déjà pris.  
**Effort** S — **Régression** : reco volontairement parallèles par le même user.

### [IDOR-06] `DELETE /api/profils/modules/{id}` — catalogue **global** — 🔴 Critique — Confiance Haute — **Aujourd’hui**

`ProfilController.java:96-100` ; `ModuleEntity` sans `@TenantId`. Mappé module « Profil » (`PermissionCheckService.java:570`).

**Scénario** : ADMIN entreprise A supprime un module → **toutes** les entreprises perdent le référentiel.  
**Correction** : CRUD modules **SUPER_ADMIN** uniquement (`@PreAuthorize`).  
**Effort** S — **Régression** : écrans admin entreprise qui créent des modules locaux (à confirmer métier).

---

### [SEC-04] `X-Username` encore honoré — 🟠 Important — Haute — **Aujourd’hui**

`PermissionInterceptor.java:392-408` + bypass `"admin".equals(username)` (`PermissionCheckService.java:373-375`).

**Scénario** : JWT USER + header `X-Username: admin` → toutes les permissions module.  
**Correction** : supprimer fallbacks header/query/session ; ne plus special-case le login `admin`.  
**Effort** S — **Régression** : scripts internes qui envoient encore le header.

### [SEC-05] Headers `X-Permission-Module` / `X-Permission-Action` — 🟠 Important — Haute — **Aujourd’hui**

`PermissionInterceptor.java:83-84` ; `PermissionCheckService.java:287-303,501-503` ; `auth.interceptor.ts:36-43`.

**Scénario** : appeler `/api/operations` avec un module où l’on a `consulter`.  
**Correction** : ignorer les overrides client ; résoudre uniquement depuis le chemin (sous-menus côté serveur).  
**Effort** M — **Régression** : sous-menus qui dépendent du header (le front le pose déjà).

### [SEC-06] 2FA : QR/secret, disable sans TOTP, admin cross-tenant — 🟠 Important — Haute — **Aujourd’hui**

`AuthController.java:134-137` ; `TwoFactorAuthController.java:66-67,180-197,132-134`. Ticket atomique ✅.

**Correction** : disable = TOTP ou recovery ; ne pas renvoyer `secret` (QR scanné en local) ; admin 2FA borné au tenant.  
**Effort** M.

### [SEC-07] `secret2FA` dans les JSON user — 🟠 Important — Haute — **Aujourd’hui**

`UserEntity.java:27-28,84` sans `@JsonIgnore` ; `UserController.java:72,82,248` nullent seulement `password`.

**Scénario** : ADMIN `GET /api/users` → secrets TOTP de l’entreprise.  
**Correction** : `@JsonIgnore` password + secret2FA ; DTO.  
**Effort** S.

### [SEC-08] Fallback mot de passe clair + seed dev non bcrypt — 🟠 Important — Haute — **Aujourd’hui (dev / comptes hérités)**

`AuthController.java:104-108` ; `DatabaseInitializer.java:35`.

**Correction** : bcrypt only ; hasher le seed ; job de migration `password NOT LIKE '$2%'`.  
**Effort** S.

### [SEC-09] JWT 24 h, pas de révocation, lock ignoré après émission — 🟠 Important — Haute — **Aujourd’hui**

`jwt.expiration=86400000` ; logout cosmétique ; `CustomUserDetailsService.java:41-46` pas `accountLocked`. Tenant depuis le **claim**.

**Correction** : TTL court + refresh, ou version de mot de passe/lock dans validation ; relire `entreprise_id` en base.  
**Effort** M.

### [SEC-10] Rate-limit spoofable + reco/upload exemptés + multipart 3 Go — 🟠 Important — Haute — **Aujourd’hui**

`RateLimitingFilter.java:175-184,228-244` ; `application.properties:65-68`.

**Correction** : IP du proxy de confiance ; quota reco ; plafond fichier métier (ex. 50–100 Mo) sauf exception.  
**Effort** M.

### [SEC-11] Profil `dev` par défaut + secret JWT dans le dépôt — 🟠 Important — Haute — **Aujourd’hui si oubli ops**

`application.properties:116` ; `application-dev.properties:4` (valeur `dev-…`, 4 premiers caractères).

**Correction** : pas de profil par défaut ; fail-fast hors `dev`/`prod` explicite ; secret dev hors git.  
**Effort** S.

### [IDOR-01] GET opération `{id}` sans filtre pays — 🟠 Important — Haute — **Aujourd’hui (même entreprise)**

`OperationController.java:100-105` ; `OperationService.java:103-106`. Compte `{id}` filtre le pays (`CompteService.java:109-121`) ✅. Tenant Hibernate bloque l’autre **entreprise**.

**Scénario** : USER pays SN devine l’id d’une opération CM.  
**Correction** : même `canAccessPays` que les listes.  
**Effort** S. **Régression** : écrans qui chargent une OP hors scope (ne devrait pas).

### [IDOR-02] Flux par agence sans filtre pays — 🟠 Important — Haute — **Aujourd’hui (même tenant)**

`FluxController.java:23-28`.

**Correction** : rattacher agence→pays et `PaysFilterService`.  
**Effort** M.

### [IDOR-03] Mark-OK : clé globale, pas d’acteur, bulk non borné — 🟠 Important — Haute — **Aujourd’hui**

`ReconciliationController.java:97-178` ; `ReconciliationOkEntity.java:8-23`.

**Scénario** : marquer OK une clé d’un autre job/agence ; collision unique inter-entreprises ; course `exists`/`save`.  
**Correction** : unique `(entreprise_id, key)` ; lier job ; plafond bulk ; `@Transactional` ; audit.  
**Effort** M.

### [IDOR-04] TenantGuard inerte si contexte null — 🟠 Important — Haute — **Aujourd’hui (SUPER_ADMIN + chemins exclus)**

`TenantGuardEntityListener.java:23-30` ; exclusions interceptor en premier.

**Scénario** : SUPER_ADMIN + `/api/profils/1/droits` (exclu) → `findById` sans filtre.  
**Correction** : si contexte null et entité tenantée → refuser ; traiter SuperAdmin **avant** exclusions.  
**Effort** S.

### [MET-02] Progression / résultats en mémoire et JSON monolithique — 🟠 Important — Haute — **Aujourd’hui**

`ReconciliationProgressService.java:10` ; jobs `resultJson`. Perte restart, 2 instances, OOM.

**Correction** : TTL + persistance ; pagination déjà côté results à généraliser.  
**Effort** L.

### [MET-03] Reco synchrone thread HTTP, pool ≤ 2 — 🟠 Important — Haute — **Aujourd’hui**

`CsvReconciliationService.java:63-69` ; 0 `@Async`.

**Correction** : file + worker ; ne plus shutdown le pool global.  
**Effort** L.

### [MET-04] Montants en `Double` — 🟠 Important — Haute — **Aujourd’hui**

`OperationEntity.java:33-40` ; `PredictionService.java:147-156`.

**Impact** : soldes/écarts non exacts.  
**Correction** : `BigDecimal` scale 2–4, `compareTo`, migration colonnes DECIMAL.  
**Effort** L — **Régression métier forte** (accord obligatoire).

### [MET-05] Imports sans transaction — 🟠 Important — Haute — **Aujourd’hui**

`OperationImportService` : 0 `@Transactional`.

**Impact** : import partiel silencieux.  
**Effort** M.

### [MET-06] « Prédiction » = heuristiques en mémoire — 🟠 Important — Moyenne — **Aujourd’hui**

`PredictionService.java:122+`.

**Correction** : renommer l’UI ; ne plus charger toute la période.  
**Effort** M.

### [QUAL-01] Angular 14 EOL + `xlsx` 0.18.5 — 🟠 Important — Haute — —

CVE non patchées. Plan LTS.  
**Effort** L.

### [OPS-02] Aucune CI, pas de lint, tests reco/IDOR absents — 🟠 Important — Haute — —

24 tests, pas le moteur. SpringBootTest → MySQL local.  
**Effort** M (CI minimale).

### [DAT-02] `show-sql=true` en prod + `useSSL=false` + `allowMultiQueries` — 🟠 Important — Haute — **Aujourd’hui**

`application-prod.properties:6,14-15`.

**Effort** S.

### [MET-09] Matching = égalité de chaînes ; clés vides ; tolérance morte — 🟠 Important (exactitude) — Haute — **Aujourd’hui**

`CsvReconciliationService.java:1098-1112` : `Objects.equals` sur `String`. Liste de colonnes vide → match **sur la clé seule**. `buildCompositeKey` `:823-828` accepte `""`. Trim seulement en debug (`:542-552`), pas dans le matching. Tolérance modèle non lue à la comparaison.

**Scénario** : `1000` vs `1 000` / `1000.0` / `1 000,00` → mismatch ou faux match sur clé vide.  
**Correction** : parseur montant `BigDecimal` + trim ; rejeter clés blank ; brancher la tolérance.  
**Effort** M — **Régression métier** (résultats reco changent) : accord obligatoire.

### [IDOR-05] BOLA pays : listes opérations + PUT compte — 🟠 Important — Haute — **Aujourd’hui (même entreprise)**

`OperationController.java:191-194` `GET /pays/{pays}` **sans** username. `CompteController.java:101-103` PUT appelle `getCompteById(id)` **sans** username alors que le GET le passe (`:31-36`).

**Scénario** : USER SN lit `GET /api/operations/pays/CI` ; ou `PUT /api/comptes/{idCI}`.  
**Correction** : même `canAccessPays` que les GET.  
**Effort** S.

### [MET-10] Recalcul solde de clôture **menteur** — 🟠 Important — Haute — **Aujourd’hui**

`OperationController.java:599-613` : appel réel **commenté**, réponse `"success": true` / « recalculé avec succès ».

**Correction** : implémenter ou renvoyer 501 / retirer l’endpoint.  
**Effort** S. (La suppression d’opération **sans** toucher le solde `OperationService.java:709-714` est **documentée comme spec** — ne pas « corriger » sans accord métier.)

### [DAT-07] `DatabaseMigration` parallèle à Flyway — 🟠 Important — Haute — **Aujourd’hui**

`DatabaseMigration.java:8-16` : `CommandLineRunner` **sans** `@Profile`, `ALTER TABLE` au boot. Concurrence avec `ddl-auto=validate`.

**Correction** : supprimer ou convertir en `V13__…` Flyway.  
**Effort** S.

### [SEC-16] `GET /api/auth/entreprise?username=` public — 🟠 Important — Haute — **Aujourd’hui (sans auth)**

`AuthController.java:376-391` ; `SecurityConfig.java:84`. Username existant → `entrepriseCode` / `entrepriseNom` ; inconnu → null.

**Scénario** : énumération de comptes + rattachement d’entreprise.  
**Correction** : réponse uniforme ; rate-limit ; ne pas exposer le nom.  
**Effort** S.

### [SEC-17] Libellés de navigation globaux en mémoire — 🟠 Important — Haute — **Aujourd’hui**

`ConfigurationController.java:55-77` : `POST /navigation-labels` écrit une `ConcurrentHashMap` **process-wide**, chemin **non mappé** → fail-open (SEC-01). GET est public (`SecurityConfig.java:89-92`).

**Scénario** : n’importe quel JWT (ou, en lecture, anonyme) ; POST authentifié change l’UI de **toutes** les entreprises jusqu’au restart.  
**Correction** : scoper tenant + ADMIN ; mapper le chemin.  
**Effort** S.

### [FE-01] `environment.production` toujours `false` — 🟠 Important — Haute — —

`environment.ts:31-33` ; pas de `fileReplacements` prod dans `angular.json`. `enableProdMode()` jamais. Logs debug possibles en prod. Source maps prod **off** ✅.

**Effort** S.

---

### 🟡 (regroupés)

- SEC-12 CORS / IP `172.214.108.8` / `@CrossOrigin` multiples ; `allowedHeaders: *`.
- SEC-13 `check-admin` public ; `remainingAttempts` ; lock DoS 5 essais.
- SEC-14 Token + **résultats de reco** en localStorage. Logout cosmétique.
- SEC-15 `TestController` ping.
- SEC-18 CDN pdf.js/mammoth sans CSP (`guide-utilisation.component.ts`).
- MET-07 Métriques Infinity / taux 100 % (si elapsed 0).
- MET-11 `/reconcile-streaming` charge `getBytes()` (pas du streaming).
- MET-12 Magic `completeJob` sans ligne `ReconciliationJob` → `/results` 404.
- DAT-03 open-in-view défaut true (Hypothèse).
- DAT-08 `result_json` type MySQL `TEXT` ~64 Ko (Hypothèse taille colonne — à confirmer schéma V1).
- QUAL-02 ~800 println.
- QUAL-03 `/file-watcher/start` cosmétique.
- FE-02 double lancement magic (bouton non disabled).
- X-06 i18n partiel.
- O-04 pas de `mvnw`.

---

## 3. Code inutilisé

| Élément | Niveau |
|---|---|
| Corps async de `/reconciliation/start` | Confirmé mort (ligne commentée, endpoint vivant) |
| `extractModuleNameFromPath` dans l’interceptor | Probablement inutilisé |
| `/file-watcher/start|stop` (messages seuls) | Confirmé cosmétique |
| Package orchestrateur `service/reconciliation/*` | Absent — Confirmé retiré |
| Prisma/TS sous `backend/` | Indéterminable / working tree deleted — **ne pas supprimer au-delà du git status** |

## 4. Sécurité / perf / tests / dette (vue synthétique)

- **Sécurité** : auth OK en surface ; autorisation module **percée** (fail-open, headers, exclusion profils). XSS + localStorage. 2FA contournable après vol de session.
- **Perf** : reco HTTP bloquante, 3 Go, maps non bornées, imports N+1, prédictions full-scan.
- **Tests** : filet auth/tenant partiel ; **zéro** test IDOR pays / mark-ok / matching.
- **Dette** : Angular 14, god classes, Double, CORS dupliqué.

## 5. Non vérifié

| Point | Pourquoi |
|---|---|
| EXPLAIN / index prod | pas de MySQL `top20` |
| Checksums Flyway prod | pas de connexion |
| `npm audit` / jest / ng build | pas d’install ; build Angular long |
| Injection formules exports | non parcouru fichier par fichier |
| Cache Caffeine cross-tenant | clés non lues en détail |
| Quel proxy (nginx vs Apache) est vivant | deux configs |
| Comptes prod encore en clair | inventaire SQL §7 |
| Streaming réellement streaming | **Confirmé non-streaming** (`getBytes` / listes) |
| Zip bomb POI | non reproduite (interdit) |

## 6. Plan d’action

**Ne rien merger sans validation.** Ordre gravité × exploitabilité :

### Quick wins (S, 1–2 jours)
1. SEC-02 retirer exclusion `/profils/{id}/droits` + `@PreAuthorize("hasRole('ADMIN')")`.
2. IDOR-06 `@PreAuthorize("hasRole('SUPER_ADMIN')")` sur CRUD `/api/profils/modules`.
3. MET-08 clé de verrou stable + 429 (ne plus concaténer `currentTimeMillis`).
4. SEC-04 supprimer `X-Username` / query / session dans l’interceptor.
5. SEC-07 `@JsonIgnore` secret2FA + password.
6. SEC-01 fail-closed + mapper guides/SOP/config **ou** 403 par défaut.
7. IDOR-01 / IDOR-05 filtre pays sur GET `{id}`, `GET /pays/{pays}`, PUT comptes.
8. MET-01 retirer `/start` ; MET-10 ne plus mentir sur le recalcul.
9. DAT-02 `show-sql=false` ; SEC-13/16 `check-admin` et `/auth/entreprise` durcis.
10. DAT-07 désactiver `DatabaseMigration` (passer en Flyway).

### Vague suivante (M)
11. SEC-05 ignorer `X-Permission-*` client.
12. SEC-06 disable 2FA + TOTP ; admin 2FA tenant-bound.
13. IDOR-03/04 mark-ok + TenantGuard fail-closed.
14. SEC-10 quotas upload/reco ; IP réelle.
15. MET-05 `@Transactional` imports ; MET-09 parseur montants (accord métier).
16. Tests : anonymous 401, autre tenant 404, USER droits 403, X-Username ignoré, GET `/operations/pays/CI` → vide.

### Plus tard (L, accord métier)
15. MET-04 BigDecimal.
16. MET-02/03 jobs durables.
17. QUAL-01 Angular LTS.
18. Actuator + CI.

---

## 7. Questions « production »

| Question | Réponse |
|---|---|
| Qu’est-ce qui casse en prod ? | Mauvais profil (`dev`) ; Flyway checksum ; `/start` ; health 404 ; OOM reco 3 Go ; pool reco shutdown. |
| Conditions idéales seulement ? | 1 instance, 1 utilisateur, fichiers petits, pays = tout le tenant, JWT encore valide. |
| Attaquant ? | Compte USER suffit (SEC-01/02/03/04). Sans compte : surfaces publiques limitées (login, reset, check-admin, health). |
| Deux users même action ? | mark-ok course ; lock reco 429 ; soldes `Double` sans `@Version`. |
| Deux instances ? | Progress divergente ; locks DB OK-ish ; `@Scheduled` heartbeat/locks en double. |
| API externe down ? | SMTP reset → lien non reçu (réponse générique). Pas de Feign critique vu. |
| BDD lente ? | Reco + imports + open-in-view + show-sql. |
| Requête ×10 ? | Reco/upload non rate-limités. |
| Données ×100 ? | `Double` + maps + resultJson + prédiction full scan. |
| HTTP modifié à la main ? | Headers permission/username ; mark-ok keys ; GET `{id}` pays. |
| Session expirée au mauvais moment ? | 401 → logout front ; job HTTP déjà lancé continue **sans** contexte (thread) — Hypothèse. |
| Déploiement / rollback ? | Front/back non versionnés ensemble ; Flyway avance, jar recule = `validate` casse. |

---

**Arrêt ici.** Aucune correction appliquée. Dis-moi quels IDs valider ; une branche et un commit par correctif ensuite.
