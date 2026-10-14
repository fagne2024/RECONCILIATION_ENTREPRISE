# Etape 4 — API entreprises (administration plateforme)

> Date : 2026-10-12. Depot : `C:\Users\YamarNDAO\Downloads\reconciliation-app`.
> Statut : **implemente, compile, teste (unitaires/integration + smoke runtime) ; en attente de validation.**
> Bases : tests sur `reco_test` (profil `test`), smoke sur le clone jetable `top20_e1_data`. Base reelle `top20` non utilisee.

---

## 1. Objectif de l'etape

Donner au SUPER_ADMIN une API de gestion des entreprises (tenants), entierement
sous `/api/platform/**`, avec :

1. **Creation atomique** entreprise + compte `ADMINISTRATEUR` (une seule transaction : aucune entreprise orpheline en cas d'echec).
2. **Lien d'activation a usage unique** (72 h) : aucun mot de passe ne circule ; l'administrateur choisit le sien.
3. **CRUD logique** : liste, detail, renommage, **suspension / reactivation** (jamais de suppression physique).
4. **Journal d'audit** des actions plateforme (`platform_audit_log`).
5. Provisioning par entreprise : profil `ADMINISTRATEUR` + **tous les droits** (copie de `module_permission`), **aucun pays**, **aucun module actif**.

---

## 2. Migration (V5)

`backend/src/main/resources/db/migration/V5__platform_admin_tables.sql` — deux tables **globales** (aucune isolation `@TenantId`), appliquee par Flyway :

| Table | Role |
|---|---|
| `activation_token` | Jeton d'activation a usage unique (`token`, `username`, `entreprise_id`, `used`, `created_at`, `expires_at`) ; FK vers `entreprise`. |
| `platform_audit_log` | Journal du SUPER_ADMIN (`actor_username`, `action`, `target_type`, `target_id`, `details`, `created_at`). **Aucun secret** (ni mot de passe, ni jeton). |

---

## 3. Fichiers crees

| Fichier | Role |
|---|---|
| `db/migration/V5__platform_admin_tables.sql` | Tables `activation_token` + `platform_audit_log`. |
| `entity/ActivationTokenEntity.java` | Entite du jeton d'activation. |
| `entity/PlatformAuditLogEntity.java` | Entite du journal d'audit. |
| `repository/ActivationTokenRepository.java` | `findByToken`, `consumeIfValid` (UPDATE atomique), purge. |
| `repository/PlatformAuditLogRepository.java` | `findAllByOrderByCreatedAtDesc(Pageable)`. |
| `dto/CreateEntrepriseRequest.java` | `code`, `nom`, `adminUsername`, `adminEmail`. |
| `exception/DuplicateResourceException.java` | Conflit (doublon) -> **409**. |
| `service/ActivationTokenService.java` | Emission / consommation du jeton (TTL **72 h**). |
| `service/AccountActivationService.java` | Activation : consomme le jeton + **UPDATE natif** du mot de passe. |
| `service/PlatformAuditService.java` | `record(...)` (dans la transaction de l'action) + `recent(limit)`. |
| `service/PlatformEntrepriseService.java` | Create (atomique) / list / detail / rename / suspend / reactivate / renewActivation. |
| `controller/PlatformEntrepriseController.java` | `/api/platform/entreprises/**`. |
| `controller/PlatformAuditController.java` | `/api/platform/audit-logs`. |
| `src/test/java/.../platform/PlatformEntrepriseProvisioningTest.java` | 6 tests (provisioning, doublon, atomicite, suspension, activation, renvoi). |

Fichier de travail non versionne : `backend/e4_smoke.ps1`.

---

## 4. Fichiers modifies

| Fichier | Changement |
|---|---|
| `entity/ProfilEntity.java` | `nom` : `unique=true` (global) -> `@UniqueConstraint("uk_profil_tenant", {"entreprise_id","nom"})`. **Aligne `create-drop` de test sur V3** (sinon 2 entreprises ne pouvaient pas avoir `ADMINISTRATEUR`). |
| `entity/PaysEntity.java` | Idem : `code` -> `uk_pays_tenant (entreprise_id, code)`. |
| `repository/UserRepository.java` | Ajout `List<UserEntity> findByEntrepriseId(Long)`. |
| `service/EmailService.java` | `getActivationUrl(token)` + `sendActivationEmail(...)`. |
| `config/SecurityConfig.java` | `POST /api/users/activate` **public** ; `/api/platform/**` = `hasRole('SUPER_ADMIN')`. |
| `interceptor/PermissionInterceptor.java` | `EXCLUDED_PATHS += /api/users/activate` ; `SUPER_ADMIN_ALLOWED_PATHS += /api/platform` ; retour immediat pour le perimetre plateforme autorise. |
| `controller/UserController.java` | Endpoint public `POST /api/users/activate` (jeton + nouveau mot de passe). |
| `exception/GlobalExceptionHandler.java` | `DuplicateResourceException` -> **409** ; `IllegalStateException` -> **409**. |
| `src/test/java/.../security/SecurityPolicyTest.java` | +1 test : `/api/users/activate` public ; `/api/platform/**` non public. |

---

## 5. Endpoints de l'etape

| Methode | Chemin | Acces | Role |
|---|---|---|---|
| `GET` | `/api/platform/entreprises` | SUPER_ADMIN | Liste (avec `modulesActives`). |
| `GET` | `/api/platform/entreprises/{id}` | SUPER_ADMIN | Detail + comptes de l'entreprise. |
| `POST` | `/api/platform/entreprises` | SUPER_ADMIN | **Creation atomique** + envoi du lien (best-effort). |
| `PUT` | `/api/platform/entreprises/{id}` | SUPER_ADMIN | Renommage. |
| `POST` | `/api/platform/entreprises/{id}/suspend` | SUPER_ADMIN | Suspension (jetons deja emis rejetes). |
| `POST` | `/api/platform/entreprises/{id}/reactivate` | SUPER_ADMIN | Reactivation. |
| `POST` | `/api/platform/entreprises/{id}/resend-activation` | SUPER_ADMIN | Nouveau lien d'activation. |
| `GET` | `/api/platform/audit-logs?limit=` | SUPER_ADMIN | Journal d'audit. |
| `POST` | `/api/users/activate` | **public** | Activation du compte (jeton + mot de passe). |

---

## 6. Comportements implementes (faits verifies)

- **Atomicite** : entreprise, profil `ADMINISTRATEUR`, copie des droits, compte admin, jeton et trace d'audit sont ecrits dans **une seule transaction**. Un echec annule tout (test dedie + smoke).
- **Aucun mot de passe transmis** : le compte est cree avec un mot de passe aleatoire inutilisable ; le vrai mot de passe est choisi via le lien (jeton a usage unique, 72 h).
- **Aucun module par defaut** (decision etape 4) : `modulesActives = 0` ; l'activation des modules relevera de l'etape 5.
- **Tous les droits** : `droitsAccordes = COUNT(module_permission)` (copie integrale dans `profil_permission` du profil `ADMINISTRATEUR`).
- **Aucun pays** provisionne.
- **Suspension backend** : le filtre JWT rejette des la requete suivante les jetons deja emis (login et acces metier -> 403) ; reactivation immediate.
- **Cloisonnement plateforme** : un `ADMIN` d'entreprise -> **403** sur `/api/platform/**` (jamais 200).
- **Audit** : chaque action ecrit une ligne dans `platform_audit_log`, **sans secret**.
- **Email best-effort** : hors transaction ; si l'envoi echoue (dev sans SMTP), la creation reussit et `activationEmailSent=false` (lien renvoyable).

---

## 7. Tests

### 7.1 Unitaires / integration — `mvn test`

**68/68, BUILD SUCCESS** (etait 61/61 a l'etape 3 ; +6 plateforme, +1 securite).

`PlatformEntrepriseProvisioningTest` (profil `test`, base `reco_test`, `create-drop`) :
1. Creation : entreprise + profil `ADMINISTRATEUR` + droits = catalogue + admin (`passwordChangeRequired=true`) + 0 module + jeton.
2. Code en doublon -> `DuplicateResourceException`.
3. **Atomicite** : echec force de l'audit -> aucune entreprise, aucun compte, aucun jeton persiste.
4. Suspension puis reactivation.
5. Activation : mot de passe BCrypt, obligation levee, **jeton a usage unique** (2e tentative refusee).
6. Renvoi d'activation : nouveau jeton different.

`SecurityPolicyTest` : `/api/users/activate` public ; `/api/platform/entreprises` sans jeton -> 401.

### 7.2 Smoke runtime (clone `top20_e1_data`, profil `dev`, jar `target/csv-reconciliation-1.0.0.jar`)

| # | Scenario | Attendu | Obtenu |
|---|---|---|---|
| 0 | Flyway V5 | applied | `activation_token`, `platform_audit_log`, version 5 `success=1` |
| 1 | `GET /api/platform/entreprises` sans jeton | 401 | **401** |
| 2 | `POST /api/users/activate` jeton invalide | 400 | **400** |
| 3 | login `superadmin` | token | **token ok** |
| 4 | `GET /api/platform/entreprises` (SUPER_ADMIN) | 200 | **200** |
| 5 | `POST /api/platform/entreprises` (`SMOKE4`) | 201, droits=359, modules=0 | **droits=359, modules=0, email=false** |
| 6 | `GET .../{id}` detail | 200 + compte `ADMINISTRATEUR` | **200** (user `smoke4_admin`, profil `ADMINISTRATEUR`) |
| 7 | activation via jeton en base puis login admin | 200 / token | **200 / token ok** |
| 8 | ADMIN d'entreprise sur `/api/platform` | 403 | **403** |
| 9 | suspension puis login de l'admin | 200 / 403 | **200 / 403** |
| 10 | reactivation | 200 | **200** |
| 11 | renvoi d'activation | nouveau jeton | **ok** (`activationEmailSent=false`) |
| 12 | `GET /api/platform/audit-logs` | 4 entrees | **CREEE / SUSPENDUE / REACTIVEE / ACTIVATION_RENVOYEE** |
| 13 | Controle base | profil=1, droits=359, modules=0 | **1 / 359 / 0** (droits attendus = 359) |

**Nettoyage** : le tenant de smoke a ete supprime en SQL direct ; le clone est revenu a son etat de base (`INTOUCH`, `ENT2`). Le mot de passe `superadmin` du clone a ete reinitialise a `<mot de passe de test>` pour le test (mot de passe d'origine inconnu, non restaurable).

---

## 8. Points d'attention / constats

1. **`@TenantId` + association EAGER** : `user.profil` (profil `@TenantId`) est invisible via JPA dans un contexte plateforme (tenant sentinel `-1`). Les vues plateforme et le renvoi de lien passent donc par des **jointures natives** (`user JOIN profil`). L'activation ecrit le mot de passe en **SQL natif** (un `save()` JPA remettrait `profil_id` a `null`).
2. **Inserts tenant-scoped en SQL natif** dans `PlatformEntrepriseService` (`profil`, `profil_permission`, `user`) : la session d'un SUPER_ADMIN a le tenant `-1`, un INSERT JPA echouerait sur la FK `entreprise_id`.
3. **Mappings `unique=true` residuels** : seuls `ProfilEntity.nom` et `PaysEntity.code` ont ete realignes (necessaires ici). D'autres entites gardent un `unique=true` global alors que V3 a renomme la contrainte en `(entreprise_id, ...)` (`compte`, `service_reference`, `auto_processing_models`, `releve_bancaire`, `sop_node`, `guide_node`, `redevance_agence_param`, `reconciliation_*`...). Sans impact sur le runtime (Hibernate `validate` ne verifie pas les UNIQUE) ni sur les tests actuels, mais **a realigner** avant tout test multi-tenant sur ces tables.
4. **Aucun module par defaut** : une entreprise creee sera **inutilisable** une fois la garde modules (etape 5) en place, jusqu'a l'activation des modules par le SUPER_ADMIN. C'est le comportement retenu (decision : activation explicite).
5. **Aucune suppression physique** : seules suspension/reactivation. Le nettoyage du smoke s'est fait en SQL direct hors API.
6. **Email non configure en dev** : envoi best-effort, jamais bloquant ; le jeton reste lisible en base pour les tests.

---

## 9. Decisions d'execution (a valider)

1. Table dediee **`activation_token`** (independante de `password_reset_token` : 72 h vs 15 min, finalite differente).
2. Table **`platform_audit_log`** globale + endpoint de consultation SUPER_ADMIN.
3. **Aucun module par defaut** (deroge au §8 du plan « tous modules metier actives »).
4. Provisioning : profil **`ADMINISTRATEUR`** (tous droits), **aucun pays**, **aucun module**.
5. API plateforme sous **`/api/platform/**`**, `POST /api/users/activate` **public**.
6. **Aucun secret dans les reponses** : le jeton d'activation n'est jamais renvoye au client (`resend-activation` disponible).

---

## 10. Reste a faire

- **Etape 5** : API modules par entreprise (`entreprise_module`) + `@RequiresModule` + **403 backend** ; rendre l'entreprise exploitable apres activation des modules.
- **Etape 6** : Frontend « Administration plateforme » (ecran listant les entreprises, formulaires de creation/suspension, lien d'activation, journal d'audit, page d'activation).
- **Etape 7** : non-regression complete (parcours metier d'une 2e entreprise provisionnee).
- **Dette** : realigner les `unique=true` residuels sur les contraintes `(entreprise_id, ...)` de V3 (§8.3).
