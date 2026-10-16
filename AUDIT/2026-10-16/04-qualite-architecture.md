# 04 — Qualité, architecture, code mort (2026-10-16)

## Points positifs
- `GlobalExceptionHandler` toujours présent.
- Ticket 2FA / reset token atomiques (`consumeIfValid`).
- Isolation tenant Hibernate + tests `TenantIsolationPilotTest`.
- File watcher : sanitize nom de fichier.
- `.gitignore` **n’est plus vide** (node_modules, target, secrets, logs).
- Flyway réel, `ddl-auto=validate`.

## God classes (bénéfice : testabilité / incidents)
- `CsvReconciliationService` ~1571 lignes, `OperationService` très volumineux, `ReconciliationController` ~1970 lignes, `PermissionCheckService` ~900 lignes, composants Angular (ex. `reconciliation-report.component.ts` 8000+ lignes avec `innerHTML`).
- Logique d’autorisation **dupliquée** : interceptor + `PermissionCheckService` + leftovers `extractModuleNameFromPath` **morts** dans `PermissionInterceptor.java:416-490` (méthodes privées non appelées dans `preHandle` — **Probablement inutilisé**).

## Code mort / résiduel

| Élément | Classe | Commentaire |
|---|---|---|
| `POST /api/reconciliation/start` | Confirmé inutilisé comme job | Implémentation commentée |
| `POST /api/file-watcher/start` et `/stop` | Usage cosmétique | ne démarre pas un watcher réel (`:208-230`, `:263`) |
| `TestController` `/api/test/ping` | Confirmé vivant | à retirer de prod |
| `extractModuleNameFromPath` interceptor | Probablement inutilisé | grep : définition seule |
| Prisma / `backend/src/*.ts` | git status : beaucoup **deleted** working tree | ne pas « supprimer » sans commit ; Usage dynamique possible tant que non mergé |
| Package `service/reconciliation/*` | Absent de src/main | Confirmé retiré |

Ne **pas** supprimer : `SpecialRatio` dans `CsvReconciliationService` (moteur actif). `AbstractIntegrationTest` : défini, peu/pas étendu (tests platform/tenant utilisent `@SpringBootTest` + profil `test`).

## Dépendances
- Angular **14.2 EOL**, `xlsx` ^0.18.5 (CVE connues historiquement — `npm audit` à lancer en CI).
- POI 5.2.3.
- mysql-connector 8.0.33.
- Pas d’Actuator.
- `commons-csv` : vérifier imports (ancien constat 0 usage — **à re-grep** avant suppression).
- Frontend `start` : chemins Windows `C:/Certs/...` hardcodés (`package.json:6`).

## Nommage / CORS
Toujours 2 politiques : `GlobalCorsConfig` + dizaines de `@CrossOrigin` (listes divergentes, IP publique). Magic strings de modules (`"Réconciliation"`, `"admin"`).
