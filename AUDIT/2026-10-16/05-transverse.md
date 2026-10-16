# 05 — Transverse (2026-10-16)

## Tests

| Ensemble | Constat |
|---|---|
| 24 fichiers Java test | Mieux qu’octobre (8), **toujours hors cœur métier** |
| Sécurité | `SecurityPolicyTest` (WebMvcTest probe), JWT secret, tickets, password policy, RequestContextUtil, ModuleGuard |
| Tenant | `TenantIsolationPilotTest` (`@SpringBootTest` + MySQL `reco_test`) |
| Plateforme | provisioning / modules SUPER_ADMIN |
| **Absent** | IDOR pays, mark-ok concurrent, moteur 1-1/1-N/N-N, XSS documents, fail-closed interceptor, `X-Username`, brute TOTP |
| Frontend | Jest (historique 72 tests) + Karma configuré ; double chaîne |
| `application-test.properties:9` | MySQL `reco_test` create-drop — **pas H2**. Docker/Testcontainers commenté comme indisponible |

Qualité : plusieurs tests de générateurs de permissions (toujours verts si registre cohérent). Peu d’assertions d’autorisation négative sur les 577 endpoints.

## Observabilité
- Pas d’Actuator/Micrometer. `/health` applicatif léger (`HomeController.java:37-42`) **public** — pas de check DB.
- Heartbeat fichier 30 s.
- 796 `System.out.println`, 79 `printStackTrace`.
- Pas d’ID de corrélation dans `GlobalExceptionHandler`.
- Mark-OK / soldes : pas d’audit « qui / quand / avant-après » (logs utilisateur génériques via interceptor si permission mappée).

## Config / secrets
- Prod : `JWT_SECRET` et `DB_PASSWORD` obligatoires.
- Oubli `SPRING_PROFILES_ACTIVE=prod` → profil **dev** + secret du dépôt + admin seed.
- CORS prod inclut encore une IP publique (`application-prod.properties:90`).
- `server.ssl.key-password=reconciliation` commenté dans `application.properties:13` (exemple, pas actif).

## CI/CD
Aucune pipeline. Pas de Docker. Rollback = manuel. Frontend `ng build` et backend jar **non liés** par un numéro de version unique.

## Frontend / UX
- Guards `auth.guard.ts` : token + `userRights` localStorage — **cosmétiques** (le serveur décide ; `userRights` falsifiable localement pour l’UI seulement).
- `super-admin.guard` / `admin.guard` / `module-access.guard` : idem.
- 401 → logout + redirect login (`auth.interceptor.ts:55-69`) ✅ pas de boucle si déjà `/login`.
- 403 → popup permission.
- `/start` réconciliation : faux départ.
- `innerHTML` / `bypassSecurityTrustHtml` : guides, SOP, popups, dashboard overlays, tooltips comptes.
- Gros tableaux : OnPush/trackBy à auditer écran par écran (dette). Bundle historiquement > budget 6 MB.
- Double-clic reconcilier : pas de désactivation systématique constatée (Hypothèse UX).

## Documentation
README / variables d’env : `JWT_SECRET`, `DB_PASSWORD`, `SUPER_ADMIN_PASSWORD` documentés dans les properties. Deux proxys. Inventaire §7 (appels sans token, comptes non bcrypt) **toujours d’actualité opérationnelle**.
