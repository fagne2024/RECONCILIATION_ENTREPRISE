# Etape 3 — Isolation multi-entreprises (`@TenantId`) 

> Date : 2026-10-12. Depot : `C:\Users\YamarNDAO\Downloads\reconciliation-app`.
> Statut : **implemente, compile, teste (unitaire + runtime A/B) ; en attente de validation.**
> Base de validation : clone jetable `top20_e1_data`. Base reelle `top20` non utilisee par les tests (cf. AUDIT/11 §7).

---

## 1. Objectif de l'etape

Rendre chaque ligne metier appartenant a une entreprise invisible/inaccessible pour les autres,
au niveau **persistance**, sans dependre du bon vouloir du code applicatif :

1. `TenantContext` (contexte entreprise par requete) + resolveur Hibernate.
2. Hibernate `@TenantId` sur toutes les entites metier (filtrage automatique des requetes).
3. Garde anti-IDOR sur le chargement par identifiant (`EntityManager.find`), que `@TenantId` ne filtre **pas**.
4. Fermer les voies de contournement : **requetes natives**, **traitements asynchrones/planifies**, **caches memoire**, **`user`** (entite volontairement globale), **login** (hors contexte).
5. Prouver l'isolation A/B (entreprise 1 ne voit pas l'entreprise 2) et le **fail-closed**.

---

## 2. Fichiers crees

| Fichier | Role |
|---|---|
| `tenant/TenantContext.java` | Contexte entreprise `ThreadLocal` ; sentinel `NO_TENANT = -1L` ; `HISTORIQUE_ENTREPRISE_ID = 1L` ; `set/get/isSet/clear/runAs/callAs`. |
| `tenant/TenantIdentifierResolver.java` | `CurrentTenantIdentifierResolver<Long>` : renvoie l'entreprise courante, **jamais `null`** (sentinel `-1` si aucune). |
| `config/TenantHibernateConfig.java` | Enregistre `MultiTenancySettings.MULTI_TENANT_IDENTIFIER_RESOLVER` (Hibernate 6.5.3). |
| `tenant/TenantAccessException.java` | Exception d'acces inter-entreprise. |
| `tenant/TenantGuardEntityListener.java` | Garde `@PostLoad` (reflexion) : refuse le chargement d'une entite dont `entrepriseId` != contexte. |
| `config/TenantExceptionHandler.java` | `@RestControllerAdvice` : `TenantAccessException` -> **404**. |
| `src/test/java/.../tenant/TenantIsolationPilotTest.java` | Preuves : lecture filtrée, insertion auto-renseignee, fail-closed, anti-IDOR `findById`. |

Fichiers de travail (non versionnes, dans `backend/`) : `annotate_tenant.ps1`, `add_listeners.ps1`, `e3_isolation_test.ps1`, journaux `e3_*.log`.

---

## 3. Fichiers modifies (points cles)

| Fichier | Changement |
|---|---|
| **44 entites** (`entity/*`, + `model/Statistics`) | `@org.hibernate.annotations.TenantId` sur le champ `entrepriseId` + `@Column(name="entreprise_id", nullable=false)` + `@JsonIgnore` ; `@EntityListeners(TenantGuardEntityListener.class)`. |
| `filter/JwtAuthenticationFilter.java` | `clear()` au debut + `finally` ; `set(entrepriseId)` (claim) **avant** `loadUserByUsername` ; suspension inchangee (403). |
| `interceptor/PermissionInterceptor.java` | Garde **fail-closed** : requete authentifiee hors perimetre plateforme **sans** contexte entreprise -> 403. |
| `repository/TrxSfRepository.java` | Requetes **natives** : ajout explicite `entreprise_id = :tenantId` (somme frais x4, count transaction, `findDuplicates`, `removeDuplicates`). |
| `service/TrxSfService.java` | Passage de `TenantContext.get()` aux methodes natives. |
| `service/MagicReconciliationService.java` | Traitement async : capture du tenant + `TenantContext.callAs(...)` dans le pool. |
| `service/ModelWatchFolderService.java` | Thread de surveillance : import rattache a l'entreprise historique (`runAs`). |
| `service/ReconciliationLockService.java` | Tache planifiee : nettoyage **par entreprise** (iteration + `TransactionTemplate`). |
| `service/ReconciliationJobService.java` | Cache resultats pagination **scope par entreprise** (cle `tenant:sessionId`). |
| `service/ReconciliationProgressService.java` | Progression **scope par entreprise** (cle `tenant:sessionId`). |
| `controller/ReconciliationController.java` | Callback async de fin de reconciliation : restauration du tenant (sinon `releaseLock`, filtré par entreprise, ne trouvait plus le verrou). |
| `service/ColumnProcessingRuleService.java` | Cache regles **scope par entreprise** (cle `tenant:modelId`). |
| `controller/UserController.java` | `user` non `@TenantId` : liste/lecture/maj/suppression/reset filtres par appartenance ; creation force `entrepriseId = contexte`. |
| `service/UserProfilService.java` | Association profils/utilisateurs limitee a l'entreprise courante. |
| `controller/AuthController.java` | `login` et `verify-2fa` : etablissent le contexte entreprise des l'utilisateur identifie (droits/pays/caches), nettoye en `finally`. |
| `model/Statistics.java` | **Entite oubliee** par le script (package `model`, pas `entity`) : annotee `@TenantId` + garde. |

> Aucune migration Flyway nouvelle : la colonne `entreprise_id` (y compris sur `statistics`) a ete ajoutee en **V3** (etape 1).

---

## 4. Comportements implementes (faits verifies)

- **Filtrage automatique** : toute requete JPQL/Criteria sur une entite `@TenantId` est restreinte a l'entreprise du contexte.
- **Ecriture** : `entreprise_id` est renseigne automatiquement par Hibernate au `persist` (jamais fourni par le client ; `@JsonIgnore`).
- **Anti-IDOR** : `GET /api/.../{id}` d'une ligne d'une autre entreprise -> **404** (garde `@PostLoad`), pas 200.
- **Fail-closed** : sans contexte, le resolveur renvoie `-1` -> aucune ligne metier visible ; les endpoints authentifies hors contexte sont refuses (403).
- **Requetes natives** : securisees par condition explicite (Hibernate ne les filtre pas).
- **Async / planifie** : le tenant est propage (pool, thread, tache) — plus d'ecriture sous le sentinel `-1`.
- **Caches memoire** : cles des caches derives de la base prefixes par l'entreprise (pas de fuite via un identifiant de session devine).
- **Verrous de reconciliation** : acquis et liberes dans le contexte de l'entreprise ; la liberation differee (callback asynchrone) restaure le tenant (sinon le verrou restait orphelin).

---

## 5. Tests

### 5.1 Unitaires / integration

`mvn test` -> **61/61**, BUILD SUCCESS, dont :
- `TenantIsolationPilotTest` (2 tests) : lecture filtered par entreprise ; insert auto-renseigne ; **sans contexte = aucune ligne** ; **`findById` hors entreprise = `TenantAccessException`**.

### 5.2 Validation runtime (clone `top20_e1_data`, profil `dev`)

Donnees de test injectees dans le clone (fixtures) :
- `entreprise` id=2 (`code=ENT2`) ;
- `service_reference` id=**2974** (`entreprise_id=2`, `code_reco=RECO-ENT2-ISO`) ;
- `user` id=9 `ent2user` (`entreprise_id=2`).

Connexion `admin` (entreprise 1) — role=ADMIN, entrepriseId=1, `profil=ADMIN`, `droits=6240`, `pays.isGlobal=true`.

| Scenario | Attendu | Obtenu |
|---|---|---|
| `GET /api/service-references` (liste, ent1) | 964 lignes, **sans** ENT2 | 964 / sans RECO-ENT2-ISO |
| `GET /api/service-references/2006` (ligne ent1) | 200 | 200 |
| `GET /api/service-references/2974` (ligne ent2) | **404** | 404 |
| `GET /api/service-references/code-reco/RECO-ENT2-ISO` | 404 | 404 |
| `GET /api/users` (ent1) | 6 users, **sans** ent2user | 6 / sans ent2user |
| `GET /api/users/1` (admin ent1) | 200 | 200 |
| `GET /api/users/9` (ent2user) | **404** | 404 |
| `GET /api/comptes` (ent1) | 200 | 200 |
| `GET /api/users/me` | 200 | 200 |
| `GET /api/statistics/by-date=2026-10-01` (ent1) | AG-E1 seulement | AG-E1 |
| `GET /api/statistics/by-filters` (ent1, oct.) | AG-E1, AG-E1B | AG-E1, AG-E1B |
| `POST /api/statistics/save` (ent1) | nouvelle ligne `entreprise_id=1` | id=4, `entreprise_id=1` |
| `GET /api/users/me` (superadmin) | 200 | 200 |
| `GET /api/comptes` (superadmin) | 403 (aucun acces metier) | 403 |
| `GET /api/users` (superadmin) | 403 | 403 |
| login `ent2user` (entreprise 2) | token entrepriseId=2 | role=USER, entrepriseId=2 |
| `GET /api/service-references` (ent2user) | acces refuse (aucun droit ent2) | 403 |

Les lignes `statistics` de test ont ete supprimees en fin de validation (table remise a 0).

---

## 6. Points d'attention / constats

1. **`findById` non filtre par `@TenantId`** — constate et corrige par la garde `@PostLoad` (sinon IDOR). Toute entite `@TenantId` doit porter `@EntityListeners(TenantGuardEntityListener.class)` (44/44 OK).
2. **Entite `statistics` oubliee** par le script d'annotation (package `model/Statistics`, pas `entity/`) : detectee par comptage (`@Entity` vs `@TenantId`) et corrigee. **Total = 52 entites : 44 metier + 8 globales.**
3. **Login hors contexte** — `login`/`verify-2fa` ne portent pas de JWT : le contexte entreprise est etabli des l'identification de l'utilisateur, sinon `droits`/`pays` (tables par entreprise) seraient vides pour les comptes non-ADMIN.
4. **`ent2user` -> 403** partout : l'entreprise 2 n'a **ni profil ni permissions**. C'est **fail-closed** (aucune fuite), mais fonctionnellement l'entreprise 2 ne peut rien faire tant que le **provisioning** (profil + permissions + pays de la nouvelle entreprise) n'existe pas — a traiter a l'etape 4/5 (creation atomique entreprise+ADMIN).
5. **`ConfigurationController`** (logo/theme/libelles de navigation) utilise un cache memoire **global** et des fichiers : non isole par entreprise (limite fonctionnelle, pas une fuite de donnees metier). A reprendre avec l'ecran « Administration plateforme ».

---

## 7. Decisions d'execution (a valider)

1. **`UserEntity` non `@TenantId`** : le login reste global par `username` ; le rattachement utilisateur est assure par le code (lecture/creation/maj). Alternative : colonne `entreprise_id` + contrainte composite, a arbitrer.
2. **Resolver = sentinel `-1`** (jamais `null`) : impose par Hibernate 6.5.3 qui exige un identifiant de tenant non nul ; les enregistrements techniques de demarrage sont rattaches a l'entreprise historique (`1`).
3. **Garde `@PostLoad` -> 404** : choix de l'exception + mapping 404 (et non 403) pour ne pas reveler l'existence d'une ressource d'une autre entreprise.
4. **Caches memoire** prefixes par entreprise (resultats de reconciliation, regles de colonnes) ; le cache de configuration d'affichage reste global (limite connue, §6.5).
5. **Import dossier `models`** et **nettoyage des verrous planifie** : rattaches a l'entreprise historique / boucle toutes entreprises (v1) ; a affiner quand plusieurs entreprises actives existeront.

---

## 8. Reste a faire (non commence)

- **Etape 4** : API entreprises (CRUD logique, suspension, **creation atomique entreprise+ADMIN**, lien d'activation) + **provisioning** (profil/permissions/pays par entreprise).
- **Etape 5** : API modules + `@RequiresModule` + **403** cote backend.
- **Etape 6** : Frontend « Administration plateforme ».
- **Etape 7** : non-regression complete (dont parcours metier d'une 2e entreprise provisionnee).
