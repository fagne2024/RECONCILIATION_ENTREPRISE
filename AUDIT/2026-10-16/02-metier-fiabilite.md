# 02 — Métier et fiabilité (2026-10-16)

## 1. Moteur de réconciliation

**Moteur actif** : `CsvReconciliationService` injecté dans `ReconciliationController`. Le package `service/reconciliation/*` (orchestrateur, BatchProcessor…) **n’existe plus** dans `src/main` (code mort d’octobre retiré). `SpecialRatio` vit encore **dans** `CsvReconciliationService` + `ConfigurableReconciliationService`.

### Exactitude
- Matching cœur : `Objects.equals` sur **String** (`CsvReconciliationService.java:1098-1112`) — pas de `BigDecimal`, pas de locale, **tolérance modèle non appliquée**. Colonnes comparables vides = match sur clé seule.
- `buildCompositeKey` (`:823-828`) : `null` rejeté, **`""` accepté**.
- Normalisation `trim` dans `normalizeRecord` (`:1220-1232`) mais le matching 1-1 utilise `record.get` brut ; logs debug signalent le trim (`:542-552`) sans l’imposer.
- Pas de `toLowerCase` systématique → **sensible à la casse**. Zéros de tête non normalisés.
- Montants persistés : `OperationEntity.montant/soldeAvant/soldeApres` = **`Double`** (`OperationEntity.java:33-40`). Prédictions : `mapToDouble` (`PredictionService.java:147-156`).
- Dates : `LocalDateTime` sans zone ; JDBC `serverTimezone=UTC` alors que les marchés sont Afrique de l’Ouest/centrale. Bornes de période : à valider métier (Hypothèse fuseaux).
- Pool interne `newFixedThreadPool(min(2, CPU))` (`CsvReconciliationService.java:63-69`). `releaseWorkingSets` peut `shutdown` le pool (`:1210-1217`) → instance ensuite inutilisable.

### Streaming
`/reconcile-streaming` : à traiter comme **non streaming bout-en-bout**. Les résultats jobs sont sérialisés en `resultJson` et relus en bloc (constat d’octobre toujours dans `ReconciliationJobService` / `/results`). Confiance Moyenne sur le nommage « streaming ».

### Déterminisme
Parallélisme 2 threads + `HashMap` de normalisation : ordre des collisions de clés non garanti. Pas de test de parité sur un jeu figé.

## 2. Jobs / progression

| Sujet | Preuve | Impact |
|---|---|---|
| `/start` cosmétique | `ReconciliationController.java:638-644` ligne async **commentée** | UX menteuse, job fantôme |
| Progression RAM | `ReconciliationProgressService.java:10-13` `ConcurrentHashMap` sans TTL/max | fuite ; perdu au restart ; 1 JVM |
| Clé tenant | `:30-33` préfixe `entrepriseId:sessionId` | plus d’IDOR **inter**-entreprises sur le progress ✅ ; **intra** tenant, `sessionId`/UUID encore devinable |
| Verrou | `lockKey = "reconcile_" + userId + "_" + currentTimeMillis()` (`:427`) ; échec **non bloquant** (`:441-445`) | **jamais** d’exclusion mutuelle ; double-clic = N jobs |
| 0 `@Async` | grep | matching sur thread HTTP Tomcat |
| Rate-limit | exemptions reconcile/upload | DoS CPU/RAM/disque |
| Nettoyage jobs | `cleanupOldJobs` sans `@Scheduled` appelant (à reconfirmer grep) | croissance `resultJson` |

Deux instances : locks DB (`ReconciliationLockService` `@Scheduled` 5 min) peuvent se partager ; **progress maps non**. Double clic `execute-magic` : 429 si lock tenu 30–60 min après crash.

## 3. Mark-OK / opérations / soldes

- `markOk` / bulk (`ReconciliationController.java:97-178`) : pas de `@Transactional` sur le bulk, pas de plafond de taille, pas d’acteur, pas de jobId. `exists` puis `save` → course. `ReconciliationOkEntity` : `key_value` **unique global** (`:8-9, :23`) + `@TenantId` → collision entre entreprises sur la même clé.
- Pas de machine d’états : unmark toujours possible.
- `GET /ok-keys` : `findAll` des clés du tenant (filtre Hibernate) — volume non plafonné.
- Opération `{id}` : `operationRepository.findById` **sans** `PaysFilterService` (`OperationService.java:103-106`) alors que la liste filtre le pays. Compte `{id}` filtre le pays (`CompteService.java:109-121`) ✅.
- Flux : `FluxController.java:23-28` par `agence` + dates, **sans** username/pays. Isolation = tenant seulement.
- Import : `OperationImportService` **aucune** `@Transactional` → lignes 1..N-1 commitées si échec.

## 4. Prédictions / reporting

`PredictionService.java:122` : `findByDateOperationBetween` **toute la période en mémoire**, puis filtres Java. Régression linéaire / moyennes (`:147+`). Ce n’est **pas** un modèle évalué. Risque métier si l’UI présente ça comme prévision fiable.

`StatisticsService` utilise `PaysFilterService` (pays). Agrégats cross-agences dans le même tenant selon le rôle (admin = tous les pays si `getAllowedPaysCodes` null).

## 5. Concurrence / transactions

- Login lock : read-modify-write sans `@Version` (`LoginLockService.java:49-55`).
- Bulk mark-ok idempotent « if not exists » en Java, pas contrainte tenant-aware.
- `open-in-view` : **non désactivé** → défaut Spring Boot `true` (Hypothèse : sessions Hibernate ouvertes pendant le rendu JSON).
- Exceptions checked : beaucoup de `catch (Exception)` qui avalent et renvoient 400/500 avec `e.getMessage()`.
