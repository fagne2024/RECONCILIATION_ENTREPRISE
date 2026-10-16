# 06 — Outils (2026-10-16)

## Environnement d’audit
Windows, Java 17 attendu par `pom.xml`, Maven global (pas de `mvnw`). Node : Angular 14 non supporté officiellement par Node 24.

## Baseline exécutée ici

| Commande | Résultat |
|---|---|
| `mvn -B -DskipTests package` (backend) | **BUILD SUCCESS** (2026-10-16, ~16 s, jar `csv-reconciliation-1.0.0.jar`) |
| `mvn test` complet | **Non lancé** : plusieurs `@SpringBootTest` + `application-test.properties` ouvrent MySQL `localhost/reco_test`. Règle audit : pas de connexion à une base locale ambiguë. |
| `ng lint` | Historiquement « Cannot find lint target » — non relancé (pas d’install). |
| `ng build` / `jest` | Non relancés (durée / pas d’install npm). |
| `npm audit` | Non lancé (réseau registre ; à faire en CI). |
| OWASP Dependency-Check, gitleaks, SpotBugs, knip/ts-prune | **Absents** du projet. |

## Outils utiles absents
1. CI (`mvn test` unitaires + jest + `npm audit --audit-level=high`).
2. Wrapper Maven.
3. Lint Angular (`ng lint`).
4. Scan secrets (gitleaks) — le secret JWT **dev** est dans `application-dev.properties`.
5. Actuator + healthcheck DB.
6. Testcontainers **ou** H2 pour les tests d’intégration (aujourd’hui MySQL `reco_test`).

## Comparaison octobre 2026
- Build backend : toujours vert.
- Dockerfiles cassés Java 11 : **fichiers absents** maintenant (plus un bloqueur docker, plus de chemin conteneur documenté).
- `.gitignore` corrigé.
- Tests Java : 8 → 24 fichiers.
- Flyway : maintenant dans le `pom.xml`.
