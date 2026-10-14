# Checklist — Spring Boot Code Review

## 1. Architecture & Structure

- [ ] Respect de la séparation en couches : `Controller → Service → Repository`
- [ ] Pas de logique métier dans les Controllers
- [ ] Pas d'accès direct au Repository depuis le Controller
- [ ] DTOs utilisés pour les échanges API (pas d'exposition directe des entités JPA)
- [ ] Interfaces définies pour les Services (facilite les tests et le découplage)

## 2. Sécurité

- [ ] Endpoints protégés avec Spring Security (`@PreAuthorize`, `@Secured`, ou config SecurityFilterChain)
- [ ] Validation des inputs : `@Valid`, `@NotNull`, `@Size`, etc. sur les DTOs
- [ ] Pas de SQL natif avec concaténation de chaînes (risque d'injection SQL) → utiliser JPQL ou requêtes paramétrées
- [ ] Pas de secrets dans le code (passwords, API keys) → utiliser `application.properties` + variables d'env
- [ ] CORS configuré de façon restrictive (pas de `*` en production)
- [ ] Protection CSRF active si application web (ou désactivée explicitement pour API REST stateless)
- [ ] Mots de passe hashés avec BCrypt ou Argon2 (`PasswordEncoder`)
- [ ] Tokens JWT validés (expiration, signature, claims)

## 3. Gestion des erreurs

- [ ] `@ControllerAdvice` / `@RestControllerAdvice` pour la gestion globale des exceptions
- [ ] Exceptions métier personnalisées (`UserNotFoundException`, `InsufficientFundsException`, etc.)
- [ ] Codes HTTP appropriés retournés (200, 201, 400, 401, 403, 404, 500)
- [ ] Messages d'erreur génériques côté client (ne pas exposer la stack trace en production)
- [ ] `Optional` utilisé correctement (pas de `.get()` sans vérification)

## 4. Performance & JPA

- [ ] Pas de problème **N+1** : utiliser `@EntityGraph`, `JOIN FETCH`, ou `FetchType.LAZY`
- [ ] Pagination pour les listes (`Pageable`, `Page<T>`)
- [ ] Index sur les colonnes utilisées dans les requêtes fréquentes
- [ ] Transactions délimitées correctement (`@Transactional` sur le Service, pas sur le Controller)
- [ ] `@Transactional(readOnly = true)` pour les opérations de lecture
- [ ] Cache configuré si données stables (`@Cacheable`, Redis, etc.)
- [ ] Connexions DB libérées correctement (HikariCP bien configuré)

## 5. Qualité du code

- [ ] Injection par constructeur (pas `@Autowired` sur les champs)
- [ ] Classes `final` pour les services si pas d'héritage
- [ ] Utilisation de `Lombok` cohérente (`@RequiredArgsConstructor`, `@Builder`, etc.)
- [ ] Pas de `null` retourné — préférer `Optional` ou lever une exception
- [ ] Constantes dans des classes dédiées ou des enums
- [ ] Méthodes courtes et à responsabilité unique (< 30 lignes idéalement)

## 6. Tests

- [ ] Tests unitaires avec Mockito (`@ExtendWith(MockitoExtension.class)`)
- [ ] Tests d'intégration avec `@SpringBootTest` ou `@WebMvcTest`
- [ ] Tests des cas d'erreur (pas seulement le happy path)
- [ ] Base de données H2 ou Testcontainers pour les tests d'intégration
- [ ] Couverture des règles métier critiques

## 7. Configuration & Déploiement

- [ ] Profils Spring utilisés (`@Profile("dev")`, `application-prod.yml`)
- [ ] Actuator configuré et endpoints sensibles sécurisés
- [ ] Logs structurés (pas de `System.out.println`)
- [ ] Niveau de log approprié (`DEBUG` pas en production)
- [ ] Flyway ou Liquibase pour la gestion des migrations de schéma

## Exemples de problèmes courants

### ❌ Mauvais : logique dans le Controller
```java
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) {
    User user = userRepository.findById(id).get(); // N+1 possible, get() dangereux
    if (user.getRole().equals("ADMIN")) { // logique métier ici
        return user; // expose l'entité directement
    }
    throw new RuntimeException("Forbidden"); // mauvaise exception
}
```

### ✅ Bon
```java
@GetMapping("/users/{id}")
public ResponseEntity<UserDTO> getUser(@PathVariable Long id) {
    return ResponseEntity.ok(userService.findById(id));
}

// Dans UserService :
@Transactional(readOnly = true)
public UserDTO findById(Long id) {
    User user = userRepository.findById(id)
        .orElseThrow(() -> new UserNotFoundException(id));
    return userMapper.toDTO(user);
}
```
