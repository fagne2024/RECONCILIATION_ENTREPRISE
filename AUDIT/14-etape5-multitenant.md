# Etape 5 — Modules par entreprise + `@RequiresModule` + 403 backend

> Date : 2026-10-12. Depot : `C:\Users\YamarNDAO\Downloads\reconciliation-app`.
> Statut : **implemente, compile, teste (unitaires/integration + smoke runtime) ; en attente de validation.**
> Bases : tests sur `reco_test` (profil `test`), smoke sur le clone jetable `top20_e1_data`. Base reelle `top20` non utilisee.

---

## 1. Objectif de l'etape

Rendre l'**activation des modules par entreprise** effective et **contraignante cote backend** :

1. Un module doit etre **actif pour l'entreprise** de l'utilisateur connecte (table `entreprise_module`) ;
   sinon tout endpoint du module renvoie **403** — le masquage frontend ne suffit pas.
2. **API d'administration** des modules (catalogue + activation par entreprise), reservee au SUPER_ADMIN.
3. Annotation declarative **`@RequiresModule("Nom")`** + moteur d'application.
4. **Journalisation** des changements d'activation.
5. Reponses **403 verifiees** en integration et en runtime.

---

## 2. Decision structurante (validee par le porteur)

**Identifiant de module = `module.nom` existant** (option recommandee retenue).

- La table reelle `module` comporte **39 lignes** clees par `nom` (noms francais, accents, sous-menus `Parent · Sous-menu`).
- Le plan §8 proposait un catalogue de **14 codes ASCII** (`DASHBOARD`, `RECONCILIATION`, ...) **qui n'existe pas en base** et omet de nombreux modules reels (`TSOP`, `Impact OP`, `TRX SF`, `Charge`, `OPPART`, `NiveauValidationReco`, `Securite`, `Module`, `Permission`, `Configuration`).
- Adopter ces codes aurait cree une **seconde nomenclature** et casse la navigation/les profils existants.
- Le moteur de permissions (`PermissionCheckService`) resout deja *chemin HTTP -> `module.nom`* : conserver `nom` garantit **une seule source de verite**.

Consequence : **aucune migration** n'est necessaire pour l'etape 5.

---

## 3. Regles d'activation appliquees

| Situation | Comportement |
|---|---|
| Module actif pour l'entreprise | Acces poursuivi (sous reserve de la permission du profil). |
| Module **inactif** | **403** immediat, quel que soit le profil. |
| **Sous-menu** inactif mais parent actif | Acces autorise (**heritage du parent**, ex. `Résultats · ...` herite de `Résultats`). |
| Module **inconnu** du catalogue | Non bloquant (rien a activer) — evite tout blocage sur un libelle non mappe. |
| **SUPER_ADMIN** (aucune entreprise) | Non soumis au filtre module (perimetre plateforme gere ailleurs). |
| Chemin `/api/**` non mappe a un module | Non filtre (comportement inchange). |

Granularite retenue : **ligne `module`** (les sous-menus sont des lignes distinctes et heritent de leur parent).

---

## 4. Application (defense en profondeur)

L'application se fait dans **`PermissionInterceptor`** (deja en charge des permissions), en deux volets :

1. **Automatique** : le module est resolu depuis le chemin HTTP via le meme moteur que les permissions
   (`resolveModuleForApiPath`). Couvre **tous** les endpoints metier existants sans les annoter.
2. **Explicite** : si le handler porte **`@RequiresModule("Nom")`** (methode, sinon classe), ce module **prime**.

> Note : le plan mentionnait un « aspect ». Sans dependance `aspectjweaver` dans le `pom.xml`, l'enforcement
> est realise par `HandlerInterceptor` (natif Spring MVC, acces au `HandlerMethod`), **sans nouvelle dependance**.
> Une injection de `spring-boot-starter-aop` n'a pas ete jugee necessaire.

---

## 5. Fichiers

### Crees
| Fichier | Role |
|---|---|
| `annotation/RequiresModule.java` | Annotation `@RequiresModule(String value)` (TYPE + METHOD). |
| `service/EntrepriseModuleService.java` | Lecture/verification (`isModuleActive`, `activeModuleIds`), catalogue, mise a jour (`setActiveModules`), heritage sous-menu, audit. |
| `controller/PlatformModuleController.java` | API plateforme : catalogue + activation par entreprise. |
| `controller/CurrentModuleController.java` | `GET /api/modules/active` : modules actifs de l'entreprise de l'utilisateur. |
| `dto/UpdateEntrepriseModulesRequest.java` | Corps `{ "activeModuleIds": [ ... ] }`. |

### Modifies
| Fichier | Modification |
|---|---|
| `interceptor/PermissionInterceptor.java` | + `EntrepriseModuleService` ; enforcement module (annotation + chemin) ; helper `writeForbidden` ; `resolveDeclaredModule`. |
| `repository/EntrepriseModuleRepository.java` | + `findByEntrepriseIdAndActifTrue`. |
| `controller/CompteController.java` | `@RequiresModule("Comptes")` (demonstration, classe). |
| `util/DatabaseMigration.java` | Commentaire : le rattrapage du catalogue pour l'entreprise 1 reste **compatible** avec la desactivation explicite (la requete ne cree une ligne que si aucune n'existe). Aucun changement fonctionnel. |

### Tests crees
| Fichier | Tests |
|---|---|
| `test/.../security/ModuleGuardInterceptorTest.java` | 4 |
| `test/.../platform/EnterpriseModuleManagementTest.java` | 7 |

---

## 6. Endpoints

Tous sous `/api/platform/**` (SUPER_ADMIN ; double protection Spring Security + `@PreAuthorize`) :

| Methode | Chemin | Description |
|---|---|---|
| GET | `/api/platform/modules` | Catalogue global (`moduleId`, `nom`, `parent`, `visible`). |
| GET | `/api/platform/entreprises/{id}/modules` | Etat d'activation de chaque module (`actif`), + `modulesActives`. |
| PUT | `/api/platform/entreprises/{id}/modules` | Remplace l'ensemble des modules actifs (`activeModuleIds`). Idempotent. |

Endpoint metier (tout utilisateur authentifie de l'entreprise) :

| Methode | Chemin | Description |
|---|---|---|
| GET | `/api/modules/active` | Noms des modules actifs de l'entreprise (`modules`). SUPER_ADMIN -> liste vide. |

Semantique de `PUT` : **remplacement complet** de l'ensemble actif ; une liste vide desactive tout.
Les lignes ne sont **jamais supprimees** : un module retire passe a `actif = false`
(preserve l'historique et evite toute reactivation automatique).

---

## 7. Tests automatises

`mvn test` : **79 / 79, BUILD SUCCESS** (68 avant l'etape ; **+11**).

Nouveaux tests :

**ModuleGuardInterceptorTest** (unitaire, permissions simulees — le refus provient bien du module) :
1. module desactive -> `preHandle` = `false` + **403** ;
2. module actif + permission accordee -> requete poursuit ;
3. `@RequiresModule` prime sur le module resolu depuis le chemin ;
4. SUPER_ADMIN (sans contexte entreprise) non filtre.

**EnterpriseModuleManagementTest** (integration, profil `test`) :
1. module inactif par defaut puis actif apres activation ciblee ;
2. sous-menu inactif herite du parent ;
3. module inconnu non bloquant ;
4. mise a jour **journalisee** (`platform_audit_log`, action `ENTREPRISE_MODULES_MODIFIES`) ;
5. desactivation -> ligne **conservee** (`actif=false`), pas de suppression ;
6. **ADMIN d'entreprise** -> `AccessDeniedException` (403) sur la mise a jour des modules ;
7. **SUPER_ADMIN** -> mise a jour acceptee.

---

## 8. Smoke runtime (clone `top20_e1_data`)

Scenario complet execute sur un tenant jetable `SMOKE5` (cree puis supprime) :

| # | Controle | Resultat |
|---|---|---|
| 1 | Catalogue SUPER_ADMIN | `catalogue_count=39`, `Comptes` = module id **7** |
| 2 | Creation entreprise (0 module) | `created_id=4`, droits=**359**, 0 module |
| 3 | Activation du compte + login ADMIN | OK |
| 4 | Endpoint metier **sans module** (`GET /api/comptes`) | **403** |
| 5 | ADMIN sur la plateforme (GET + PUT modules) | **403** / **403** |
| 6 | Etat modules (SUPER_ADMIN) avant | `modulesActives=0` |
| 7 | Activation module `Comptes` (SUPER_ADMIN) | `activees=1` |
| 8 | Endpoint metier **avec module** | **200** |
| 9 | `GET /api/modules/active` (ADMIN) | `["Comptes"]` |
| 10 | Desactivation de tous les modules | PUT 200 ; endpoint metier **403** |
| 11 | Audit | `ENTREPRISE_CREEE` ; `ENTREPRISE_MODULES_MODIFIES` x2 (`activees=1` puis `desactivees=1`) |
| 12 | Lignes `entreprise_module` apres desactivation | **1 ligne, 0 actif** (conservee) |
| 13 | Nettoyage tenant SMOKE5 | `entreprises=2` (INTOUCH + ENT2) |

Apres arret de l'application : port 8080 libre, clone **restaure** (`INTOUCH` + `ENT2`, INTOUCH = **39/39** modules actifs).
Flyway : 6 migrations validees, schema en version **5**, « up to date ».

---

## 9. Anomalie observee (pre-existante, hors perimetre)

Les requetes du **SUPER_ADMIN** declenchent une erreur `user_log` :

```
Cannot add or update a child row: a foreign key constraint fails
(`user_log`, CONSTRAINT `fk_user_log_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise`(`id`))
```

**Cause** : `UserLogEntity.entrepriseId` est annote `@TenantId`. Pour un SUPER_ADMIN, le tenant vaut le
sentinel `-1` (`TenantContext.NO_TENANT`), valeur absente de `entreprise` -> FK violee.
**Portee** : `UserLogService` capture l'erreur (aucune incidence sur la reponse HTTP ; le 200 est bien renvoye).
**Origine** : introduction de `@TenantId` a l'etape 3 ; **non lie** a l'etape 5 (l'etape 4 la declenchait deja).
**Piste (dette)** : ignorer le journal `user_log` pour les chemins `/api/platform/**`, ou rendre
`entreprise_id` nullable pour les actions plateforme. A traiter si l'on souhaite journaliser ces actions.

---

## 10. Dette / points ouverts

1. **`unique=true` residuels** (dette differee depuis l'etape 4, non bloquante) : toujours a realigner sur
   les contraintes `(entreprise_id, ...)` de V3.
2. **Cache d'activation** : non implemente (une requete `entreprise_module` par requete API). Acceptable en v1 ;
   a ajouter avec invalidation fiable si besoin de performance.
3. **`@RequiresModule` applique** sur `CompteController` uniquement (demonstration) ; la couverture de tous les
   endpoints metier est assuree par la resolution automatique depuis le chemin.
4. **Sous-menu vs parent** : l'activation se fait sur les lignes `module` ; l'ecran plateforme (etape 6) devra
   presenter les sous-menus rattaches a leur parent.

---

## 11. Statut

Etape 5 **terminee** : catalogue + associations entreprise-module, endpoints de gestion, `@RequiresModule`,
enforcement 403 backend, audit, tests (79/79) et smoke runtime concluant. **En attente de validation** avant
l'etape 6 (frontend « Administration plateforme »).

### Reste a venir
- **Etape 6** : frontend — menu dynamique (masquage par module actif, invalidation de cache fiable), ecran
  « Administration plateforme ».
- **Etape 7** : non-regression globale.
