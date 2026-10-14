# Etape 2 — Auth, roles, SUPER_ADMIN (multi-entreprises)

> Date : 2026-10-12. Depot : `C:\Users\YamarNDAO\Downloads\reconciliation-app`.
> Statut : **implemente, compile, teste (unitaire + runtime) ; en attente de validation.**
> Base applicative reelle `top20` : voir l'incident en §7 (defaut d'isolation des tests, corrige).

---

## 1. Objectif de l'etape

Poser l'authentification/auorisation multi-entreprises cote backend :

1. Role **SUPER_ADMIN** (compte plateforme, `entreprise_id = NULL`, aucun acces metier — decision 9).
2. Claims JWT `role` et `entrepriseId` ; login **inchange** `{ username, password }` (decision 2 revisee).
3. Controle du **statut de l'entreprise a chaque requete** : la suspension revoque immediatement les jetons deja emis.
4. Initialisation idempotente du **premier SUPER_ADMIN via variables d'environnement**.
5. Endpoint de changement de mot de passe : lever l'obligation `password_change_required`.

---

## 2. Fichiers crees / modifies

### Crees
| Fichier | Role |
|---|---|
| `backend/src/main/resources/db/migration/V4__user_entreprise_id_nullable.sql` | `user.entreprise_id` devient `NULL DEFAULT 1` (NULL = compte plateforme). |
| `backend/src/main/java/com/reconciliation/config/SuperAdminInitializer.java` | Creation idempotente du SUPER_ADMIN depuis l'environnement. |
| `backend/src/test/java/com/reconciliation/security/SuperAdminRoleUtilTest.java` | Tests du role SUPER_ADMIN. |
| `backend/src/test/java/com/reconciliation/service/JwtServiceClaimsTest.java` | Aller-retour des claims `role`/`entrepriseId`. |

### Modifies
| Fichier | Changement |
|---|---|
| `entity/UserEntity.java` | Ajout `entrepriseId` (`@Column("entreprise_id")`, defaut `1L`, `@JsonIgnore`) : jamais fourni par le client, jamais expose. |
| `util/AdminRoleUtil.java` | `isSuperAdmin(user)` (`entrepriseId == null`) + `resolveRole(user)` (SUPER_ADMIN > ADMIN > USER). |
| `service/CustomUserDetailsService.java` | Autorite `ROLE_SUPER_ADMIN` pour les comptes sans entreprise (sinon ADMIN/USER inchange). |
| `service/JwtService.java` | Constantes `CLAIM_ROLE`/`CLAIM_ENTREPRISE_ID` + `extractRole`/`extractEntrepriseId`. |
| `controller/AuthController.java` | Refus au login si entreprise suspendue ; claims `role`+`entrepriseId` ; reponses `role`/`entrepriseId`/`mustChangePassword` ; portee pays vide pour SUPER_ADMIN. |
| `filter/JwtAuthenticationFilter.java` | Verification du statut entreprise a chaque requete (claim `entrepriseId`) -> 403 immediat. |
| `controller/UserController.java` | `/me/password` et `/reset-password` (jeton) levent `password_change_required`. |
| `interceptor/PermissionInterceptor.java` | Garde-fou decision 9 : SUPER_ADMIN refuse (403) sur tout `/api/**` hors perimetre plateforme. |
| `repository/UserRepository.java` | `findFirstByEntrepriseIdIsNull()`. |
| `resources/application.properties` | Config `app.super-admin.*` (`SUPER_ADMIN_USERNAME/PASSWORD/EMAIL`). |
| `src/test/resources/application-test.properties` | Voir §7 : base de test locale dediee (sans Docker). |
| `src/test/java/.../SecurityPolicyTest.java` | Mock `EntrepriseRepository` injecte dans le filtre. |
| `src/test/java/.../PermissionGenerator*Test.java` | `@ActiveProfiles("test")` ajoute (isolation). |

---

## 3. Comportements implementes (faits verifies)

- **Login inchange** : `POST /api/auth/login {username, password}`. Reponse enrichie : `role`, `entrepriseId` (absent si SUPER_ADMIN), `mustChangePassword`.
- **Claims** : JWT porte `role` (`SUPER_ADMIN|ADMIN|USER`) et `entrepriseId` (present seulement pour les comptes entreprise).
- **Suspension** : a chaque requete authentifiee, le filtre lit `entrepriseId` et verifie `entreprise.statut == ACTIVE` ; sinon **403** immediat, y compris pour un jeton emis AVANT la suspension.
- **SUPER_ADMIN** : compte `entreprise_id = NULL`, autorite `ROLE_SUPER_ADMIN` ; **aucun acces metier** (garde-fou `PermissionInterceptor`, en plus des `@PreAuthorize("hasRole('ADMIN')")` existants). Perimetre autorise : `logout`, `me`, `me/password`, log-activity.
- **Initialisation SUPER_ADMIN** : idempotente, uniquement si `SUPER_ADMIN_PASSWORD` est defini ; ne remplace jamais un compte existant ; mot de passe BCrypt en base ; **jamais journalise**.

---

## 4. Tests unitaires

`mvn test` -> **59/59**, BUILD SUCCESS (les 6 tests existants + `SuperAdminRoleUtilTest` 3 + `JwtServiceClaimsTest` 2).

---

## 5. Validation runtime (base clone `top20_e1_data`, jetable)

Application demarree (profil `dev`, mot de passe vide) avec `SUPER_ADMIN_USERNAME=superadmin`, `SUPER_ADMIN_PASSWORD=<mot de passe de test jetable>`.

Migration : `Current version ...: 3` -> `Successfully applied 1 migration ... now at version v4`.
`SuperAdminInitializer - Compte SUPER_ADMIN 'superadmin' initialise (entreprise_id NULL, changement de mot de passe requis).`

Resultats observes (tous conformes) :

| Scenario | Attendu | Obtenu |
|---|---|---|
| login `admin` (entreprise 1) | 200, role=ADMIN, entrepriseId=1 | 200 / ADMIN / 1 |
| login `superadmin` | 200, role=SUPER_ADMIN, pas d'entrepriseId, mustChangePassword=true | 200 / SUPER_ADMIN / vide / true |
| `GET /api/users/me` (admin) | 200 | 200 |
| `GET /api/users/me` (super) | 200 | 200 |
| `GET /api/users` (admin) | 200 | 200 |
| `GET /api/users` (super) | 403 | 403 |
| `GET /api/comptes` (super) | 403 (aucun acces metier) | 403 |
| **jeton admin emis AVANT suspension**, apres `statut=SUSPENDUE` | 403 | 403 |
| login `admin` entreprise suspendue | 403 | 403 |
| login `superadmin` entreprise suspendue | 200 (compte plateforme) | 200 |
| login `admin` apres reactivation | 200 | 200 |

Base clone remise `ACTIVE` en fin de test.

---

## 6. Decisions d'execution (a valider)

1. **`user.entreprise_id` nullable** (V4) : necessaire pour porter le SUPER_ADMIN (NULL). Le `DEFAULT 1` est conserve pour les comptes entreprise tant que l'isolation `@TenantId` n'est pas en place (etape 3).
2. **`UserEntity.entrepriseId` mappe des maintenant** (defaut `1L`) + `@JsonIgnore` : indispensable au login/claims et empeche toute injection via le corps JSON. Sera converti en `@TenantId` a l'etape 3.
3. **Perimetre SUPER_ADMIN v1** : `logout`, `me`, `me/password`, log-activity ; tout le reste `/api/**` -> 403.
4. **SUPER_ADMIN initial = mot de passe BCrypt fourni par l'environnement**, `password_change_required = true` (changement impose a la 1re connexion). La remise ADMIN par lien d'activation reste pour l'etape 4.
5. **Code 403** (et non 401) pour entreprise suspendue, au login comme par le filtre.

---

## 7. INCIDENT — `top20` (base reelle) a ete migree par `mvn test` (corrige)

**Constat.** `top20.flyway_schema_history` contient desormais V1->V4 :
- V2 `create entreprise` : 2026-10-12 11:42:26
- V3 `add entreprise id` : 2026-10-12 11:42:39
- V4 `user entreprise id nullable` : 2026-10-12 12:14:30

**Cause racine.** Deux tests `@SpringBootTest` (`PermissionGeneratorAllSubmenusTest`, `PermissionGeneratorControleInterneTest`) n'activaient pas le profil `test`. Ils chargeaient donc la datasource de l'application (`top20`) avec **Flyway actif**, appliquant les migrations sur la base reelle a chaque `mvn test`. Le profil `test` existant utilisait Testcontainers (`jdbc:tc:mysql:8.0`), or **Docker est indisponible** ici : la config etait donc inoperante et le repli silencieux se faisait sur la base applicative.

**Impact mesure.**
- Schema `top20` : migrations **additives** appliquees (table `entreprise`, colonnes `entreprise_id`, index/FK, 23 UNIQUE renommees, `user.entreprise_id` nullable). Aucune donnee supprimee.
- Donnees : `module` 39, `permission` 160, `module_permission` 359, `profil` 4, `user` 6 — **identiques** au clone `top20_e1_data` ; aucun `superadmin` cree dans `top20`.
- Autrement dit : `top20` est structurellement au niveau attendu, **donnees preservees**.

**Correction apportee.**
- `@ActiveProfiles("test")` ajoute aux deux tests.
- `src/test/resources/application-test.properties` pointe desormais sur une base **MySQL locale dediee et jetable** `reco_test` (`createDatabaseIfNotExist=true`, `ddl-auto=create-drop`, `flyway.enabled=false`), sans Docker.
- Verification : apres correction, `installed_rank` max de `top20` reste **4** (derniere installation 12:14:30) — plus aucune migration ni ecriture de test sur `top20`.

**A valider / a decider par le porteur.**
- Conserver `top20` telle quelle (deja migree, donnees intactes) **ou** la restaurer depuis une sauvegarde anterieure au 2026-10-12 11:42.
- Choix de la cible des tests : base locale dediee (actuel, fonctionne ici) **ou** retour a Testcontainers (necessite Docker en CI).

---

## 8. Reste a faire (etapes suivantes, non commence)

- Etape 3 : isolation `@TenantId` + `TenantContext` + resolveur + filtre ; conversion des 49 entites ; tests d'isolation A/B.
- Etape 4 : API entreprises (CRUD logique, suspension, creation atomique entreprise+ADMIN, lien d'activation).
- Etape 5 : API modules + `@RequiresModule` + 403.
- Etape 6 : Frontend « Administration plateforme ».
- Etape 7 : non-regression.
