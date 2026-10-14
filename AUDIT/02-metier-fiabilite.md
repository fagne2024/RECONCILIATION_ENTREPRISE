# 02 — Fiabilité métier et moteur de réconciliation

> Conventions : au moins 3 implémentations de réconciliation coexistent. Ce document
> établit laquelle est réellement utilisée, où sont les trous de fiabilité.

---

## 1. Confusion : 3 moteurs de réconciliation coexistent

| Moteur | Fichier | Utilisé en production ? | Preuve |
|---|---|---|---|
| **A. Historique** | `CsvReconciliationService.java` (93,6 KB, 1571 lignes) | ✅ OUI | injecté dans `ReconciliationController.java:59` et `MagicReconciliationService.java:22` |
| **B. « Orchestrateur »** | `service/reconciliation/ReconciliationOrchestrator.java` (19 KB) | ❌ NON | **aucun injecteur** dans `src/main` (grep : uniquement ses propres dépendances + tests) |
| **C. Spécial ratios** | `service/reconciliation/SpecialRatioReconciliationService.java` (32,6 KB) | ❌ NON | uniquement référencé par `ReconciliationOrchestrator.java:25` (lui-même mort) + `SpecialRatioReconciliationServiceTest.java` |

**Constats :**
- L'implémentation **B**, moderne (batch, index partenaire, classifieur, publisher), est **100 % morte en production** : `ReconciliationOrchestrator` n'est référencé nulle part, `BatchProcessor`/`PartnerIndexBuilder`/`MatchClassifier`/`ReconciliationMemoryManager`/`ReconciliationProgressPublisher` uniquement par l'orchestrateur.
- Le ratio TRXBO/OPPART (1:2) est **dupliqué** parallèlement dans `CsvReconciliationService.reconcileWithSpecialRatio` (l.466) ET `SpecialRatioReconciliationService` — deux implémentations à faire évoluer en phase, sans test commun.
- `ConfigurableReconciliationService.java` sert de registre de logique partagé (dont `SPECIAL_RATIO` : `:45-46,665`).
- **Risque** : toute « modernisation » du moteur (echange B↔A) toucherait par inadvertance du code jamais exercé.

---

## 2. Problèmes de fiabilité du moteur actif (A)

### 🔴 R1 — Two nom provoquant un faux-job : `/api/reconciliation/start` ne lance RIEN
**Confiance ✅ — Aujourd'hui**

- `ReconciliationController.java:626-636` : génère un `jobId` aléatoire, **la ligne « lancer en asynchrone » est commentée**, renvoie le jobId au client.
- Le frontend qui pollera `/progress?sessionId=...` obtiendra **404 « Job non trouvé »** (`:697-708`).
- Endpoint donc inutile mais arpenté par le frontend → fausse réassurance de l'utilisateur (« réconciliation démarrée »).

### 🔴 R2 — Résultats déversés dans une colonne `resultJson` + fichiers jamais nettoyés
**Confiance ✅ — Aujourd'hui (croissance lente, rupture à incidence)**

- `ReconciliationJobService.completeJob` (`:116`) sérialise tout le `ReconciliationResponse` (matches + boOnly + partnerOnly + mismatches) dans `resultJson`.
- `/results` le re-désérialise **en totalité en mémoire** à chaque appel (`ReconciliationController.java:770`), de même `/progress` (`:686-700`).
- **Nettoyage absent** : `cleanupOldJobs` (`ReconciliationJobService.java:360-374`) **n'a aucun appelant** (⚠ elle marque FAILED mais **ne supprime ni les lignes ni le contenu de `resultJson`**, pas de `@Scheduled`). Les 2 seuls `@Scheduled` du projet sont `BackendHeartbeat.java:27` et `ReconciliationLockService.java:192`.
- Fichiers uploadés dans `uploads/reconciliation/` (`ReconciliationJobService.java:50,343-355`) : **jamais supprimés**, noms à base de `prefix = jobId` (`:69-70`), `Files.copy` **sans `REPLACE_EXISTING`** (`:352`) → un job collision vue exception `FileAlreadyExistsException` en cas de rerun.
- **Impact** : croissance illimitée de la base + du disque ; latence de chaque appel `/results` croît avec le nombre de jobs.

### 🟠 R3 — Progression en mémoire non bornée, perdue au redémarrage, incohérente selon l'instance
**Confiance ✅ — Aujourd'hui**

- `ReconciliationProgressService.java:10-13` : `ConcurrentHashMap` **sans TTL, sans taille max** (`progressMap.put` à chaque tick) → fuite mémoire si sessions oubliées.
- `CsvReconciliationService.java:64` : doublon `progressMap` de poussière (instance singleton).
- Hors **`live-progress/{sessionId}`** (SSE), il n'y a **aucune persistance** : restart → progression fantôme à « En attente » (`:17`).

### 🟠 R4 — Verrouillage de job contournable et source de faux 429
**Confiance ✅ — Aujourd'hui**

- `ReconciliationController.extractUserId` (`:1936-1945`) : identité prise depuis **`X-User-Id` (spoofable)** puis IP dérivée de `X-Forwarded-For` (spoofable) → il suffit de varier l'en-tête pour obtenir un verrou `LOCK_TYPE_JOB` distinct → **parallélisme illimité de réconciliations lourdes** (crash d'OOM possible).
- À l'inverse : `execute-magic` renvoie **429 « une réconciliation est déjà en cours »** (`:608-617`) si le verrou est posé, avec `durationMinutes = 60` (`:604`) → des sessions légitimes peuvent être bloquées 30-60 min après un crash (`DEFAULT_LOCK_DURATION_MINUTES = 30`, `ReconciliationLockService.java:37`).
- `releaseLockByJobId` (`ReconciliationLockService.java:237`) **sans appelant** → les verrous ne sont libérés que par expiration (`@Scheduled` 5 min, `:192`).

### 🟠 R5 — Exécution bloquante du thread HTTP sur les gros flux
**Confiance ✅ — Aujourd'hui**

- 0 `@Async` dans le projet ; `reconcile` (`ReconciliationController.java:422`) exécute tout le matching **synchroniquement dans la requête**.
- Pool interne `CsvReconciliationService.java:63-65` : `newFixedThreadPool(min(2, CPU))` → au plus 2 réconciliations parallèles → les autres requêtes **bloquent**, d'autant que le endpoint est **exempté du rate limiting** (cf. 01-A8, `RateLimitingFilter.java:175-184`).
- La fermeture du pool est déclenchée par `releaseWorkingSets` quelconque (`CsvReconciliationService.java:1198-1205`) → **si le pool est fermé, TOUTE réconciliation suivante échoue** avec « ExecutorService non disponible » (`:207-209`). Or cette méthode n'est appelée que dans certains chemins → risque d'état irréversible dans l'instance.

### 🟡 R6 — Incohérences de logs (masquent les vraies métriques)
**Confiance ✅**

- « Performance: **Infinity** enregistrements/seconde » observé dans les logs de test (`AUDIT/baseline-backend-test.log`) quand `elapsedMs == 0` — calcul en `records / elapsedMs/1000` sans garde → métriques absurdes dans les logs de prod.
- « Taux de correspondance: **100,00 %** » avec **0 matches trouvés** (test : 1 BO vs 2 partenaire) → la formule du taux ne tient pas compte du dénominateur réel.
- Branche contradictoire dans `CsvReconciliationService.java:176-180` : « SPECIAL_RATIO détectée mais IGNORÉE ... standard 1-1 » vs `:188-192` « Utilisation ... SPECIAL_RATIO » — ambigüité des règles TRXBO/OPPART selon le contexte d'appel (`determineReconciliationLogic` vs `detectTRXBOOPPARTContent`).

### 🟡 R7 — Modèle de « prédiction » = statistiques descriptives, pas de ML
**Confiance ✅ — Aujourd'hui**

- `PredictionService.java:122` charge **toute la période** (`findByDateOperationBetween`) en mémoire avant filtrage.
- Pas de modèle : moyennes (`:154,181,201-207`), régression linéaire simple `tendanceIntercept/tendanceSlope` (`:225`), seuils de déclenchement par type (`:278-381`) — **« prédiction » = extrapolation d'heuristiques**, sans intervalle de confiance ni évaluation.
- Risque métier : prise de décision basée sur des chiffres présentés comme prédictifs.

---

## 3. Code de réconciliation mort ou non exercé

| Classe / élément | Statut | Preuve |
|---|---|---|
| `ReconciliationOrchestrator` (+ dependants) | **Confirmé inutilisé en prod** | aucun injecteur dans `src/main` |
| `SpecialRatioReconciliationService` | Probablement inutilisé (via orchestrateur mort) | seul usage = test (`SpecialRatioReconciliationServiceTest.java:27`) |
| `DataNormalizationService` (`service/DataNormalizationService.java`) | **Confirmé inutilisé** | aucun import/source |
| `ReconciliationProgressService.createJob/clearProgress` | Usage partiel (createJob oui ; clearProgress non) | grep |
| `ReconciliationJobService.cleanupOldJobs` | **Inutilisé** (et incomplet) | `:361`, aucun appelant |
| `ReconciliationLockService.releaseLockByJobId` | **Inutilisé** | `:237`, aucun appelant |
| `commons-csv` (dépendance) | **Confirmé inutilisé** | 0 import (`org.apache.commons.csv`) |
| `CsvReconciliationService.setProgress/removeProgress` | Usage interne partiel | `:1130-1139` |

> Règle : ne jamais supprimer sans confirmation métier pour `SpecialRatioReconciliationService` (sémantique ratio), les autres sont prêts à retirer.

---

## 4. Recommandations par ordre d'effet

1. **Trancher un seul moteur** : garder `CsvReconciliationService` (seul exercé), archiver `service/reconciliation/*` en attente de tests de parité, ou détruire A au profit de B en engageant l'effort de test.
2. **Asynchrone réellement** : exécuter la réconciliation hors thread HTTP (queue durable), rendre `/start` efficace, supprimer le fallback `/reconcile` synchrone pour les gros fichiers.
3. **Nettoyage** : `@Scheduled` d'expiration qui **purgent** lignes + `resultJson` + fichiers uploadés ; ajouter `REPLACE_EXISTING`.
4. **Verrous** : clé = compte authentifié (jamais `X-User-Id`/`XFF`), `releaseLockByJobId` branché, ou abandon au profit d'une file.
5. **Progressions** : persistance DB au lieu de maps, purge TTL.
6. **Garde-fous calculs** : `elapsedMs==0 → 1`, taux = matches / (BO+partner), et clarifier la branche SPECIAL_RATIO.
7. **Honneté produit** : renommer la « prédiction » en « estimation/statistiques ».