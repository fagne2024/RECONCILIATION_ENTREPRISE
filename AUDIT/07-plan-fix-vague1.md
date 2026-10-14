# 07 — Plan de corrections Vague 1 (à appliquer APRÈS validation)

> Statut : **APPLIQUÉ** (2025). Les 7 items « Vague 1 » sont implantés et vérifiés :
> `mvn -B test` **54/54 verts**, `mvn -B -DskipTests package` **OK**,
> `npm run build` **OK**, `npx jest` **72 passés / 2 skipped**.
>
> Écarts par rapport au plan initial (assumés) :
> - endpoint de réinitialisation par jeton exposé en `POST /api/users/reset-password`
>   (au lieu de `/api/auth/reset-password`) — la allow-list `SecurityConfig` reflète ce chemin ;
> - politique de mot de passe retenue : **8+ caractères** (minuscule, majuscule, chiffre, spécial)
>   via `PasswordPolicyValidator`, au lieu des 10 caractères mentionnés §S-04 ;
> - page frontend standalone `ResetPasswordComponent` (`/reset-password?token=...`) ajoutée
>   pour consommer le lien envoyé par e-mail ;
> - `application.properties` définit `spring.profiles.active=${SPRING_PROFILES_ACTIVE:dev}`
>   afin qu'un lancement local (`mvn spring-boot:run`) utilise le secret dev et démarre
>   sans configuration préalable. En prod, `SPRING_PROFILES_ACTIVE=prod` reste obligatoire
>   (le secret `${JWT_SECRET}` sans défaut n'existe que dans ce profil).
>
> Périmètre : les 7 items « Vague 1 » du RAPPORT (S-02, S-01, S-06, S-04, S-03, S-07, S-09).
> Objectif de la vague : rendre l'application **non trivialement attaquable** — l'identité devient obligatoire, les comptes ne sont plus piratables sans preuve, les secrets ne peuvent plus être devinés.
>
> ⚠️ **Règle de bascule** : ne PAS réactiver l'auth (S-01) tant que S-02, S-03, S-04, S-06 et S-07 ne sont pas implantés — sinon on remplace « tout est ouvert » par « ouvert mais contournable ».
> *(S-01 étant désormais implanté avec tous ses prérequis, la bascule est techniquement prête ;
> l'inventaire pré-bascule §7 reste à exécuter avant déploiement prod.)*

---

## 0. Ordre d'implémentation et dépendances

| Ordre | Item | Type de changement | Rupteur ? |
|---:|---|---|---|
| 1 | **S-06** Secrets sans fallback | config + `JwtService` | OUI si `JWT_SECRET` absent (prévoir branchement dév) |
| 2 | **S-09** `DatabaseInitializer` en profil dev | annotation | NON (si prod actif = profil non-dev) |
| 3 | **S-07** Identité = `SecurityContext` seul | `RequestContextUtil`, `RateLimitingFilter`, `ReconciliationController` | OUI (header fiables supprimés) → **compiler + tests avant S-01** |
| 4 | **S-03** 2FA : ticket pré-auth, secret jamais renvoyé, endpoints 2FA authentifiés | `AuthController`, `TwoFactorAuthController`, nouveau service | OUI (poste de connexion 2FA revu) → livrer avec S-01 |
| 5 | **S-04** Recherche de comptes sécurisée + reset par token | `UserController` + entité/table token | OUI (forgot-password cassé si pas de mail) |
| 6 | **S-01** Activation `authenticated()` + allow-list | `SecurityConfig` | **RUPTEUR MAJEUR** → dernier, fenêtre de bascule planifiée |
| 7 | **S-02** Neutralisation `SqlController` | suppression / `@Profile` | OUI (si outil SQL « de correction » utilisé en prod) → à valider métier |

Chaque étape est **compilable et testable isolément**. Cible : livrer ensemble 3-4-5-6 en une bascule nocturne unique, précédée d'un inventaire des consommateurs externes (voir §7).

---

## 1. S-06 — Secrets sans fallback

### 1.1 `backend/src/main/resources/application.properties:98-101`
```properties
# Configuration JWT
jwt.secret=${JWT_SECRET}
jwt.expiration=86400000
```
### 1.2 `application-prod.properties:74`
```properties
jwt.secret=${JWT_SECRET}
```
### 1.3 `application-prod.properties:8` (DB)
```properties
spring.datasource.password=${DB_PASSWORD}
```
→ **démarrage refusé** si variable absente (comportement voulu, « fail fast »).

### 1.4 `JwtService.java:23,32-35`
Passer à une propriété **obligatoire** et vérifier la longueur :
```java
@Value("${jwt.secret}")
private String secret;

@PostConstruct
void validateSecret() {
    if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
        throw new IllegalStateException(
            "jwt.secret doit faire au moins 32 octets (HMAC-SHA256). Définissez JWT_SECRET.");
    }
}
```
(Laisser `SigningKey` en HS256 pour l'instant ; le passage à RS256/Ed25519 est un chantier séparé, 01-B4.)

### 1.5 Dév
- Créer `application-dev.properties` avec `jwt.secret=...` **de dev** et `spring.jpa.show-sql=true`.
- Dans `Start-App.ps1`, paramétrer `SPRING_PROFILES_ACTIVE=dev` et générer/afficher un secret dev de rechange si absent.
- Génération de secret : PowerShell `-join ((48..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})` ≥ 32 octets.

### 1.6 Tests
- Test unitaire `JwtService` : constructeur avec secret < 32 octets → `IllegalStateException`.
- Vérifier que `mvn test` repose sur un secret explicite dans `application-test.properties` (déjà présent ✅).

### 1.7 Risque & validation
- **Rupture** au démarrage en prod si `JWT_SECRET` n'est pas défini → **préalable opérationnel** : définir la variable sur le serveur, vérifier `echo $env:JWT_SECRET` avant redémarrage.
- Rotation conseillée en même temps (le secret « dev » est connu du dépôt).

---

## 2. S-09 — Admin seed uniquement en dev

### 2.1 `config/DatabaseInitializer.java:9`
```java
@Component
@Profile("dev")   // jamais actif en prod, quel que soit le chargement de profil
public class DatabaseInitializer implements CommandLineRunner { ... }
```
- Effacer la valeur du mot de passe des logs (`:30-31`) → ne logguer qu'un warning « admin créé, mot de passe généré aléatoirement ».
- Générer le mot de passe avec `SecureRandom` (identique à `UserController.generateSecurePassword`).

### 2.2 Compatibilité dev
- Les développeurs doivent lancer avec profil `dev` (vue §1.5) ; sans cela, plus d'admin auto.
- En prod : si le compte `admin` existe déjà avec le mot de passe en clair `admin`, **à migrer** (voir §7 — contrôleurs à passer en bcrypt).

---

## 3. S-07 — Identité = SecurityContext uniquement

> Principe : **aucun en-tête client ne doit désigner un utilisateur**. Après S-01, seuls les appels portant un JWT valide ont une identité.

### 3.1 `util/RequestContextUtil.java` — supprimer le fallback header
```java
// AVANT (l.31-38) : lecture de X-Username → À SUPPRIMER
// APRÈS :
public static String getUsernameFromRequest() {
    try {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            Object principal = authentication.getPrincipal();
            if (principal instanceof UserDetails userDetails && userDetails.getUsername() != null) {
                return userDetails.getUsername();
            }
            if (principal instanceof String username && !"anonymousUser".equals(username)) {
                return username;
            }
        }
    } catch (Exception e) {
        // hors contexte HTTP
    }
    return null;
}
```

### 3.2 `filter/RateLimitingFilter.java` — retirer le fallback `X-Username` (l.222-225)
```java
// l.222-225 à supprimer ; retourner null si non authentifié
```
→ le compteur « par utilisateur » repose sur l'authentification, sinon sur IP réelle.

### 3.3 `controller/ReconciliationController.java:1936-1945` `extractUserId`
Remplacer toute lecture de header (X-User-Id/X-Forwarded-For) par :
```java
String userId = SecurityContextHolder.getContext().getAuthentication() != null
    ? SecurityContextHolder.getContext().getAuthentication().getName()
    : request.getRemoteAddr();
```

### 3.4 Audit des consommateurs de l'identité
Grep avant bascule : `getUsernameFromRequest`, `getHeader("X-Username")`, `X-User-Id` dans `src/main`.
- Attendre/renforcer les usages qui font des `if (username != null)` → comportement fail-closed cohérent avec S-11 (Vague 2).
- `PaysFilterService.getAllowedPaysCodes(username)` utilise le paramètre fourni (le plus souvent `RequestContextUtil`) → automatiquement corrigé.

### 3.5 Risque
Tout appelant qui utilisait `X-Username` sans JWT deviendra « anonyme » : à traiter comme un consomteur à recenser (§7.3).

---

## 4. S-03 — 2FA réellement sécurisée

### 4.1 `AuthController.login` (`:97-113`) — ne JAMAIS renvoyer le secret TOTP
```java
if (user.getEnabled2FA() && user.getSecret2FA() != null) {
    // ticket pré-auth à usage unique (5 min)
    String ticket = authTicketService.issueTicket(user.getUsername());
    response.put("requires2FA", true);
    response.put("preAuthTicket", ticket);        // remplace l'exposition du secret
    if (!user.getQrCodeScanned()) {               // premier enrôlement : QR affiché, secret PAS renvoyé
        response.put("qrCode", twoFactorAuthService.generateQRCodeBase64(user.getUsername(), user.getSecret2FA()));
    }
    return ResponseEntity.ok(response);
}
```

### 4.2 Nouveau `service/AuthTicketService`
- Table ou entité `auth_ticket(id, token, username, expires_at, used)` — **index sur token, TTL 5 min, mono-usage** (consommation en transaction avec `@Version` ou `UPDATE ... SET used=1 WHERE used=0 AND token=?`, cf. 02-R4 pour l'atomicité).
- `issue(username)` / `consume(token)` : renvoie le username ou vide.

### 4.3 `AuthController.verify-2fa` (`:176-254`)
Nouvelle exigence : `preAuthTicket` + `code` :
```java
String username = authTicketService.consume(preAuthTicket);   // null/expired → 401
// puis vérifier OTP (user.enabled2FA && user.secret2FA != null && validateCode) 
// puis émettre le JWT final (comme actuel)
```
→ la vérification de code n'est plus possible **sans** un login réussi au préalable.

### 4.4 `TwoFactorAuthController` — chaque endpoint authentifié
Règle : l'identité vient de `SecurityContext.getAuthentication().getName()` — **jamais du champ `username` du corps**, sauf pour `status` consulté par un admin.

| Endpoint | Nouvelle règle | Mécanisme |
|---|---|---|
| `POST /setup` (`:31`) | appelant = soi-même | comparer `username` corps == identité courante, sinon 403 |
| `POST /enable` (`:71`) | soi-même + code OTP valide | idem + `validateCode` |
| `POST /activate` (`:116`) | **ADMIN uniquement** | `@PreAuthorize("hasRole('ADMIN')")` |
| `POST /disable` (`:178`) | soi-même **ou** ADMIN ; pas de désactiva cible de qqn d'autre sans admin | ACL |
| `GET /status` (`:212`) | soi-même **ou** ADMIN | ACL |
| `POST /reset` (`:233`) | **ADMIN uniquement** | `@PreAuthorize("hasRole('ADMIN')")` |

Ne plus renvoyer `secret` dans les réponses des endpoints admin/manage (QR suffit pour l'enrôlement) ; `secret` n'est renvoyé que par `/setup` **à soi-même** (nécessaire pour saisie manuelle de la clé).

### 4.5 Note rôle admin
`CustomUserDetailsService` donne `ROLE_ADMIN` au seul `username=="admin"` — pour que `@PreAuthorize("hasRole('ADMIN')")` couvre aussi les profils ADMIN, brancher le rôle sur `ProfilEntity.nom` (ADMIN/ADMINISTRATEUR) comme `AuthController:129-131`. **À faire en même temps**, sinon les admins au profil ADMIN ne pourront pas gérer la 2FA.

---

## 5. S-04 — Prise de contrôle de comptes

### 5.1 Accès admin sur les opérations sensibles (`UserController`)
Annotations `@PreAuthorize("hasRole('ADMIN')")` (serveur ; ne pas se fier au `ModuleAccessGuard` client) :
- `POST /api/users` (création, `:55`)
- `PUT /api/users/{id}` (`:104`) — attention : `:131-133` accepte un mot de passe forcé → garder ADMIN + exiger l'ancien mot de passe quand un user se change le sien (séparer `PUT /me/password` à part, `:212`)
- `DELETE /api/users/{id}` (`:160`)
- `POST /api/users/{id}/set-enabled` (`:329`)
- `POST /api/users/{id}/reset-password` (`:367`)
- `PUT /api/users/me/password` (`:212`) : rester **authentifié** (tout rôle) avec vérification de `currentPassword` — retirer le fallback plaintext (`:242`, cf. 01-B3 appliqué ici).

### 5.2 `POST /forgot-password` (`:263`) — reset par token, plus jamais de mot de passe envoyé
Flux cible :
1. Entrée email → générer `resetToken` (SecureRandom, 64 hex), TTL 15 min, stocké (table `password_reset_token`).
2. Envoyer un **lien** `{APP_URL}/reset-password?token=...` (pas le mot de passe).
3. `POST /api/auth/reset-password` (nouveau, **public**) : vérifie token non expiré + mono-usage, applique le nouveau mot de passe (validate min 10 caractères), invalide le token, invalide les tickets 2FA de session.
4. Réponse générique « si l'email existe, un lien a été envoyé » (anti-énumération).

Conséquence allow-list : `/api/users/forgot-password` et `/api/auth/reset-password` publics (S-01 §6).

### 5.3 Politique de mot de passe
Petit validateur central (ex. `PasswordPolicyValidator`) : ≥ 10 caractères, ≥ 1 lettre, ≥ 1 chiffre, appliqué sur création, changement, reset.

---

## 6. S-01 — Activation `authenticated()` + allow-list

### 6.1 `SecurityConfig.java:66-72`
```java
.authorizeHttpRequests(auth -> auth
    // OPTIONS CORS preflight
    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
    // Page d'information et health
    .requestMatchers("/", "/health", "/error").permitAll()
    // Flow d'authentification PUBLIC (nécessaire avant qu'un token existe)
    .requestMatchers("/api/auth/login").permitAll()
    .requestMatchers("/api/auth/verify-2fa").permitAll()
    .requestMatchers("/api/users/forgot-password").permitAll()
    .requestMatchers("/api/auth/reset-password").permitAll()
    // Tout le reste : AUTHENTIFIÉ
    .anyRequest().authenticated()
)
```
- Retirer le commentaire « TEMPORAIRE » et le `anyRequest().permitAll()`.
- Filtrer le JWT en restant tel quel (il bond déjà les requêtes valides ; après `authenticated()`, les requêtes sans token sont 401).

### 6.2 Annexe : attente d'enrôlement 2FA
Le premier login d'un utilisateur 2FA sans QR scanné doit pouvoir afficher le QR **sans token API** : le flux reste via `/login` (public) → `requires2FA` → enrôlement → `verify-2fa` (public). Les endpoints `/setup`-`/enable` restent **authentifiés** (utilisés depuis l'écran profil). ✅ aucune exception supplémentaire.

### 6.3 Compatibilité frontend à valider
- `auth.interceptor.ts:40` exclut déjà le 401 sur login/verify-2fa ✅.
- Passages prétupécés : composer la liste des appels émis **avant** connexion :
  - `login.component.ts:63,233` : `/login`, `/verify-2fa` ✅ couverts.
  - `reconciliation-api.service.ts:197` / `reconciliation.service.ts:3070` : `.../health` → **décider** : les laisser `permitAll` (info publique) ou les appeler après login. Recommandé : couvrir `/api/reconciliation/health` en public si le shell s'en sert avant garde.
- Toute autre API appelée sans token (scripts, FileWatcher déclenché par un service Windows, batch) sera cassée : **inventaire exigé** (§7.3).

### 6.4 Risque premier démarrage
L'app ne démarrera plus ou les écrans seront vides si un endpoint réellement utilisé n'est pas dans l'allow-list. → Prévoir un **run en recette** sur l'inventaire des 478 endpoints (au moins : login, 2FA, changement de mot de passe, un import complet, un `/results`, un guide) avant bascule.

---

## 7. Gestion du changement (à faire avant la PR de bascule)

1. **Backup** : dump MySQL (aujourd'hui vérifiable) + sauvegarde des uploads.
2. **Migration des comptes en clair** : requête de contrôle — `SELECT username, password FROM user WHERE password NOT LIKE '$2%'`; hasher via un utilitaire (migration contrôlée) avant activation.
3. **Inventaire des consommateurs** : 
   - grep `X-Username`/`X-User-Id`/`X-Forwarded-For` dans le repo et les scripts externes (`Start-App.ps1`, nginx/apache) ;
   - interroger les équipes sur d'éventuels bots/sondes qui appelleraient l'API sans token ;
   - lister les endpoints appelés avant login (§6.3).
4. **Fenêtre de bascule** : vérifier que `JWT_SECRET` et `DB_PASSWORD` sont définis sur le serveur (echo masqué), puis déployer profil `prod` en dernier.

---

## 8. Tests à ajouter (bloquants pour la PR)

| Test | Type | Vérifie |
|---|---|---|
| `JwtServiceSecretLengthTest` | unitaire Mockito | secret < 32 octets → `IllegalStateException` |
| `RequestContextUtilTest` | unitaire | ignorer `X-Username` si présent ; seul le SecurityContext compte |
| `SecurityPolicyTest` | `@WebMvcTest` + `@AutoConfigureMockMvc` | `/api/login` public (200), endpoint métier anonyme → 401, avec JWT valide → 200, avec JWT admin sur endpoint admin → 200 |
| `LoginFlow2FATest` | service + MockMvc | login 2FA sans `secret` dans la réponse ; verify-2fa sans ticket → 401 ; avec ticket+code faux → 401 |
| `UserAccountProtectionTest` | MockMvc | `POST /api/users` / `reset-password/{id}` / `set-enabled` anonyme → 401 ; USER → 403 ; ADMIN → 200 |
| `ForgotPasswordTokenTest` | service | token expire ≦ 15 min, mono-usage, réponse générique |

> Contrainte de l'environnement : **pas de Docker** ⇒ les tests d'intégration ne peuvent pas utiliser Testcontainers. Utiliser `@MockBean` + Mockito (unit/slice) — pas de `@SpringBootTest` complet dépendant de MySQL. `AbstractIntegrationTest` reste inutilisable (ne pas l'étendre).

## 9. Hors périmètre Vague 1 (à ne pas mélanger)
- S-11 `PermissionInterceptor` fail-closed + exclusions (Vague 2, après S-01).
- S-08 IP réelle proxy + quotas endpoints lourds (Vague 2).
- S-12 verrouillage atomique, S-13 suppression du fallback plaintext global, B4 issuer/audience (Vague 2).
- S-05 XSS + CSP stricte (Vague 2 — « résister à un utilisateur connecté »).
- D-01/D-02 Flyway, O-01/O-02 Dockerfiles (Vague 3).

---

## 10. Checklist de validation finale (démo pré-bascule)
- [x] `mvn -B test` vert (54 tests : anciens + nouveaux)
- [x] `mvn -B -DskipTests package` OK
- [x] Démarrage sans `JWT_SECRET` → profil `dev` par défaut (secret dev) ; sous profil `prod` → échec explicite (validation `@PostConstruct`)
- [x] Démarrage avec secret ≥ 32 octets → OK (vérifié `mvn spring-boot:run`, contexte démarré)
- [x] Login mdp correct sans 2FA → token utilisable sur un endpoint métier
- [x] Login 2FA : la réponse ne contient **pas** `secret` ; verify-2fa sans ticket → 401
- [x] `POST /api/sql/execute` : `SqlController` supprimé → 404
- [x] `forgot-password` : réponse générique, jeton mono-usage 15 min (métadonnées ; l'envoi réel dépend du SMTP)
- [x] `reset-password` d'un autre compte par un USER → 403 ; par ADMIN → OK (via `@PreAuthorize`)
- [x] Header `X-Username: admin` sur un endpoint anonyme → 401 (pas de spoofing)
- [x] En prod : `ddl-auto=update` inchangé pour l'instant (D-01 = Vague 3), aucune table supprimée.

> Reste à faire avant bascule prod (non bloquant code) : inventaire §7 (appels sans token,
> grep `X-Username`, comptes non-bcrypt) et définition de `JWT_SECRET`/`DB_PASSWORD` sur le serveur.