package com.reconciliation.controller;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.entity.ProfilEntity;
import com.reconciliation.repository.ProfilRepository;
import com.reconciliation.service.JwtService;
import com.reconciliation.service.EmailService;
import com.reconciliation.service.PasswordResetTokenService;
import com.reconciliation.service.AccountActivationService;
import com.reconciliation.util.PasswordPolicyValidator;
import com.reconciliation.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.security.SecureRandom;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class UserController {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private ProfilRepository profilRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private EmailService emailService;
    @Autowired
    private PasswordResetTokenService passwordResetTokenService;
    @Autowired
    private AccountActivationService accountActivationService;

    /** Taille maximale acceptee pour une photo de profil (octets). */
    private static final long MAX_PHOTO_BYTES = 2L * 1024 * 1024;

    /** Data URL d'image autorisee : PNG, JPG/JPEG, GIF ou WEBP en base64. */
    private static final Pattern PHOTO_DATA_URL =
        Pattern.compile("^data:image/(png|jpe?g|gif|webp);base64,(.+)$", Pattern.DOTALL);

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<UserEntity>> getAllUsers() {
        // Isolation : un ADMIN ne voit que les utilisateurs de son entreprise.
        // Le filtrage DOIT se faire en SQL (findByEntrepriseId), pas en mémoire
        // après findAll(). UserEntity n'est pas @TenantId, mais son profil est
        // chargé en EAGER et ProfilEntity est protégé par
        // TenantGuardEntityListener : charger les utilisateurs des autres
        // entreprises hydrate leurs profils, ce qui déclenche
        // TenantAccessException → 404 pour TOUS les utilisateurs.
        Long tenant = TenantContext.get();
        if (tenant == null) {
            return ResponseEntity.ok(List.of());
        }
        List<UserEntity> users = userRepository.findByEntrepriseId(tenant);
        // Ne pas renvoyer les mots de passe dans la réponse
        users.forEach(user -> user.setPassword(null));
        return ResponseEntity.ok(users);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserEntity> getUserById(@PathVariable Long id) {
        Optional<UserEntity> user = userRepository.findById(id);
        if (user.isPresent() && isSameTenant(user.get())) {
            // Ne pas renvoyer le mot de passe dans la réponse
            user.get().setPassword(null);
            return ResponseEntity.ok(user.get());
        }
        return ResponseEntity.notFound().build();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> createUser(@RequestBody UserEntity user) {
        try {
            // Vérifier si l'username existe déjà
            if (userRepository.findByUsername(user.getUsername()).isPresent()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Ce nom d'utilisateur existe déjà"));
            }
            
            // Vérifier que l'email est fourni
            if (user.getEmail() == null || user.getEmail().trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "L'adresse email est requise"));
            }
            
            // Vérifier si l'email existe déjà
            if (userRepository.findByEmail(user.getEmail().trim()).isPresent()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cette adresse email est déjà utilisée"));
            }
            
            // Générer un mot de passe automatiquement
            String generatedPassword = generateSecurePassword();
            String hashedPassword = passwordEncoder.encode(generatedPassword);
            user.setPassword(hashedPassword);

            // Isolation : l'utilisateur cree appartient TOUJOURS a l'entreprise
            // de l'admin connecte, jamais a celle fournie par le client.
            user.setEntrepriseId(TenantContext.get());
            
            // Associer le profil si fourni
            if (user.getProfil() != null && user.getProfil().getId() != null) {
                ProfilEntity profil = profilRepository.findById(user.getProfil().getId()).orElse(null);
                user.setProfil(profil);
            }
            
            // Sauvegarder l'utilisateur
            UserEntity savedUser = userRepository.save(user);
            
            // Envoyer le mot de passe par email
            try {
                emailService.sendPasswordEmail(user.getEmail(), user.getUsername(), generatedPassword);
            } catch (Exception e) {
                // Si l'envoi d'email échoue, on supprime l'utilisateur créé et on retourne une erreur
                userRepository.deleteById(savedUser.getId());
                return ResponseEntity.status(500).body(Map.of("error", "Erreur lors de l'envoi de l'email. L'utilisateur n'a pas été créé : " + e.getMessage()));
            }
            
            // Ne pas renvoyer le mot de passe hashé dans la réponse
            savedUser.setPassword(null);
            return ResponseEntity.ok(savedUser);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Erreur lors de la création de l'utilisateur : " + e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateUser(@PathVariable Long id, @RequestBody UserEntity user) {
        try {
            Optional<UserEntity> existingUserOpt = userRepository.findById(id);
            if (existingUserOpt.isEmpty() || !isSameTenant(existingUserOpt.get())) {
                return ResponseEntity.notFound().build();
            }
            
            UserEntity existingUser = existingUserOpt.get();
            user.setId(id);
            // Multi-entreprises : le rattachement n'est JAMAIS pilote par le client.
            // On conserve l'entreprise existante.
            user.setEntrepriseId(existingUser.getEntrepriseId());
            
            // Vérifier si l'username a changé et si le nouveau username existe déjà
            if (!existingUser.getUsername().equals(user.getUsername()) && 
                userRepository.findByUsername(user.getUsername()).isPresent()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Ce nom d'utilisateur existe déjà"));
            }
            
            // Vérifier si l'email a changé et si le nouveau email existe déjà
            if (user.getEmail() != null && !user.getEmail().trim().isEmpty()) {
                String newEmail = user.getEmail().trim();
                Optional<UserEntity> userWithEmail = userRepository.findByEmail(newEmail);
                if (userWithEmail.isPresent() && !userWithEmail.get().getId().equals(id)) {
                    return ResponseEntity.badRequest().body(Map.of("error", "Cette adresse email est déjà utilisée"));
                }
            }
            
            // Si un nouveau mot de passe est fourni, le hasher
            if (user.getPassword() != null && !user.getPassword().isEmpty()) {
                if (!PasswordPolicyValidator.isValid(user.getPassword())) {
                    return ResponseEntity.badRequest().body(Map.of("error", PasswordPolicyValidator.reason(user.getPassword())));
                }
                String hashedPassword = passwordEncoder.encode(user.getPassword());
                user.setPassword(hashedPassword);
            } else {
                // Conserver l'ancien mot de passe si aucun nouveau n'est fourni
                user.setPassword(existingUser.getPassword());
            }
            
            // Associer le profil si fourni
            if (user.getProfil() != null && user.getProfil().getId() != null) {
                ProfilEntity profil = profilRepository.findById(user.getProfil().getId()).orElse(null);
                user.setProfil(profil);
            }
            
            // Conserver l'état du compte et les champs 2FA
            user.setEnabled(existingUser.getEnabled());
            user.setEnabled2FA(existingUser.getEnabled2FA());
            user.setSecret2FA(existingUser.getSecret2FA());
            user.setQrCodeScanned(existingUser.getQrCodeScanned());
            // La dernière connexion n'est jamais pilotée par le client : on la conserve.
            user.setLastLogin(existingUser.getLastLogin());
            
            UserEntity updatedUser = userRepository.save(user);
            // Ne pas renvoyer le mot de passe hashé dans la réponse
            updatedUser.setPassword(null);
            return ResponseEntity.ok(updatedUser);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Erreur lors de la mise à jour de l'utilisateur : " + e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Boolean> deleteUser(@PathVariable Long id) {
        try {
            Optional<UserEntity> user = userRepository.findById(id);
            if (user.isPresent() && isSameTenant(user.get())) {
                // Empêcher la suppression de l'utilisateur admin par défaut
                if ("admin".equals(user.get().getUsername())) {
                    return ResponseEntity.badRequest().body(false);
                }
                userRepository.deleteById(id);
                return ResponseEntity.ok(true);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(false);
        }
    }

    @GetMapping("/check-admin")
    public ResponseEntity<Boolean> checkAdminExists() {
        Optional<UserEntity> adminUser = userRepository.findByUsername("admin");
        return ResponseEntity.ok(adminUser.isPresent());
    }

    /**
     * Récupère les informations de l'utilisateur connecté
     */
    @GetMapping("/me")
    public ResponseEntity<UserEntity> getCurrentUser(HttpServletRequest request) {
        try {
            String username = extractUsernameFromRequest(request);
            if (username == null) {
                return ResponseEntity.status(401).build();
            }
            
            Optional<UserEntity> user = userRepository.findByUsername(username);
            if (user.isPresent()) {
                UserEntity userEntity = user.get();
                // Ne pas renvoyer le mot de passe
                userEntity.setPassword(null);
                return ResponseEntity.ok(userEntity);
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }

    /**
     * Retourne la photo de profil de l'utilisateur connecté (data URL ou null).
     * Endpoint dédié : la photo n'est jamais incluse dans /me ni dans la liste
     * des utilisateurs (voir {@code UserEntity.photo}, @JsonIgnore).
     */
    @GetMapping("/me/photo")
    public ResponseEntity<?> getMyPhoto(HttpServletRequest request) {
        String username = extractUsernameFromRequest(request);
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Non authentifié"));
        }
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> response = new HashMap<>();
        response.put("photo", userOpt.get().getPhoto());
        return ResponseEntity.ok(response);
    }

    /**
     * Enregistre / remplace la photo de profil de l'utilisateur connecté.
     * Le corps contient une data URL ({"photo": "data:image/png;base64,..."}).
     * Validation : type d'image autorisé et taille ≤ 2 Mo.
     */
    @PostMapping("/me/photo")
    public ResponseEntity<?> uploadMyPhoto(@RequestBody Map<String, String> requestBody, HttpServletRequest request) {
        String username = extractUsernameFromRequest(request);
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Non authentifié"));
        }

        String dataUrl = requestBody.get("photo");
        String validationError = validatePhotoDataUrl(dataUrl);
        if (validationError != null) {
            return ResponseEntity.badRequest().body(Map.of("error", validationError));
        }

        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        UserEntity user = userOpt.get();
        user.setPhoto(dataUrl);
        userRepository.save(user);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Photo de profil mise à jour");
        response.put("photo", dataUrl);
        return ResponseEntity.ok(response);
    }

    /**
     * Supprime la photo de profil de l'utilisateur connecté.
     */
    @DeleteMapping("/me/photo")
    public ResponseEntity<?> deleteMyPhoto(HttpServletRequest request) {
        String username = extractUsernameFromRequest(request);
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Non authentifié"));
        }
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        UserEntity user = userOpt.get();
        user.setPhoto(null);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Photo de profil supprimée"));
    }

    /**
     * Retourne les photos de profil (data URL) des utilisateurs demandés,
     * limitées à l'entreprise de l'appelant (isolation multi-entreprise).
     *
     * <p>Utilisé par le « Top 3 des utilisateurs » de l'État des réconciliations.
     * Sans paramètre {@code usernames}, seul le périmètre demandé est renvoyé :
     * pour éviter des charges utiles lourdes, l'appelant doit préciser les
     * usernames concernés.</p>
     */
    @GetMapping("/photos")
    public ResponseEntity<Map<String, String>> getPhotos(
            @RequestParam(name = "usernames", required = false) List<String> usernames) {
        Long tenant = TenantContext.get();
        if (tenant == null) {
            return ResponseEntity.ok(Map.of());
        }
        java.util.Set<String> wanted = null;
        if (usernames != null && !usernames.isEmpty()) {
            wanted = new java.util.HashSet<>();
            for (String u : usernames) {
                if (u != null) {
                    String trimmed = u.trim();
                    if (!trimmed.isEmpty()) {
                        wanted.add(trimmed);
                    }
                }
            }
            if (wanted.isEmpty()) {
                return ResponseEntity.ok(Map.of());
            }
        }
        Map<String, String> photos = new HashMap<>();
        for (UserEntity user : userRepository.findByEntrepriseId(tenant)) {
            if (user.getUsername() == null) {
                continue;
            }
            if (wanted != null && !wanted.contains(user.getUsername())) {
                continue;
            }
            // On renvoie aussi les entrées sans photo (null) pour que le frontend
            // puisse retomber proprement sur les initiales.
            photos.put(user.getUsername(), user.getPhoto());
        }
        return ResponseEntity.ok(photos);
    }

    /**
     * Valide une data URL d'image. Retourne un message d'erreur lisible, ou
     * {@code null} si la valeur est valide.
     */
    private String validatePhotoDataUrl(String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) {
            return "Aucune image fournie";
        }
        Matcher matcher = PHOTO_DATA_URL.matcher(dataUrl);
        if (!matcher.matches()) {
            return "Format d'image non supporté (PNG, JPG, GIF ou WEBP attendu)";
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(matcher.group(2));
        } catch (IllegalArgumentException e) {
            return "Image corrompue ou mal encodée";
        }
        if (decoded.length > MAX_PHOTO_BYTES) {
            return "L'image ne doit pas dépasser 2 Mo";
        }
        return null;
    }

    /**
     * Change le mot de passe de l'utilisateur connecté
     */
    @PutMapping("/me/password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> requestBody, HttpServletRequest request) {
        try {
            String username = extractUsernameFromRequest(request);
            if (username == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Non authentifié"));
            }
            
            String currentPassword = requestBody.get("currentPassword");
            String newPassword = requestBody.get("newPassword");
            
            if (currentPassword == null || newPassword == null || newPassword.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Le mot de passe actuel et le nouveau mot de passe sont requis"));
            }
            
            if (!PasswordPolicyValidator.isValid(newPassword)) {
                return ResponseEntity.badRequest().body(Map.of("error", PasswordPolicyValidator.reason(newPassword)));
            }
            
            Optional<UserEntity> userOpt = userRepository.findByUsername(username);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            UserEntity user = userOpt.get();
            
            // Vérifier le mot de passe actuel
            String storedPassword = user.getPassword();
            boolean passwordMatches = false;
            if (storedPassword != null && (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$"))) {
                // Mot de passe hashé avec BCrypt
                passwordMatches = passwordEncoder.matches(currentPassword, storedPassword);
            } else {
                // Mot de passe en clair (ancien format)
                passwordMatches = currentPassword.equals(storedPassword);
            }
            
            if (!passwordMatches) {
                return ResponseEntity.status(401).body(Map.of("error", "Mot de passe actuel incorrect"));
            }
            
            // Hasher et sauvegarder le nouveau mot de passe
            String hashedPassword = passwordEncoder.encode(newPassword);
            user.setPassword(hashedPassword);
            // Le changement volontaire du mot de passe lève l'obligation.
            user.setPasswordChangeRequired(false);
            userRepository.save(user);
            
            return ResponseEntity.ok(Map.of("message", "Mot de passe modifié avec succès"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Erreur lors de la modification du mot de passe"));
        }
    }

    /**
     * Mot de passe oublié : émet un jeton à usage unique (15 min) et l'envoie par email.
     * Aucun nouveau mot de passe n'est généré ni envoyé : l'utilisateur choisit
     * lui-même son nouveau mot de passe via le lien reçu.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "L'adresse email est requise"));
        }

        String emailTrimmed = email.trim();
        Optional<UserEntity> userOpt = userRepository.findByEmail(emailTrimmed);
        if (userOpt.isEmpty()) {
            // Message standard : on ne révèle pas si l'email est connu (anti-énumération).
            return ResponseEntity.ok(Map.of("message", "Si cette adresse email est associée à un compte, un lien de réinitialisation sera envoyé par email."));
        }

        UserEntity user = userOpt.get();
        if (user.getEmail() == null || user.getEmail().trim().isEmpty()) {
            return ResponseEntity.ok(Map.of("message", "Si cette adresse email est associée à un compte, un lien de réinitialisation sera envoyé par email."));
        }

        try {
            String token = passwordResetTokenService.issueToken(user.getUsername());
            emailService.sendPasswordResetLinkEmail(user.getEmail(), user.getUsername(), emailService.getResetUrl(token));
            return ResponseEntity.ok(Map.of("message", "Si cette adresse email est associée à un compte, un lien de réinitialisation sera envoyé par email."));
        } catch (Exception e) {
            System.err.println("❌ [FORGOT-PASSWORD] Erreur envoi email réinitialisation: " + e.getMessage());
            // Ne jamais révéler l'état du compte ni l'erreur exacte
            return ResponseEntity.ok(Map.of("message", "Si cette adresse email est associée à un compte, un lien de réinitialisation sera envoyé par email."));
        }
    }

    /**
     * Réinitialise le mot de passe à partir d'un jeton reçu par email (public).
     * Le jeton est à usage unique et expire après 15 minutes.
     */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPasswordWithToken(@RequestBody Map<String, String> request) {
        String token = request.get("token");
        String newPassword = request.get("newPassword");

        if (token == null || newPassword == null || newPassword.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Jeton et nouveau mot de passe requis"));
        }
        if (!PasswordPolicyValidator.isValid(newPassword)) {
            return ResponseEntity.badRequest().body(Map.of("error", PasswordPolicyValidator.reason(newPassword)));
        }

        java.util.Optional<String> tokenUsername = passwordResetTokenService.consumeToken(token);
        if (tokenUsername.isEmpty()) {
            return ResponseEntity.status(400).body(Map.of("error", "Lien de réinitialisation invalide, déjà utilisé ou expiré. Veuillez refaire une demande."));
        }

        Optional<UserEntity> userOpt = userRepository.findByUsername(tokenUsername.get());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(400).body(Map.of("error", "Lien de réinitialisation invalide, déjà utilisé ou expiré. Veuillez refaire une demande."));
        }

        UserEntity user = userOpt.get();
        user.setPassword(passwordEncoder.encode(newPassword));
        // L'utilisateur a choisi lui-même son mot de passe : obligation levée.
        user.setPasswordChangeRequired(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Mot de passe réinitialisé avec succès. Vous pouvez vous connecter."));
    }

    /**
     * Active un compte entreprise depuis le lien reçu par email (endpoint public).
     * Le jeton est à usage unique et expire après 72 heures. L'utilisateur choisit
     * lui-même son mot de passe : aucun mot de passe ne circule par email.
     */
    @PostMapping("/activate")
    public ResponseEntity<?> activateAccount(@RequestBody Map<String, String> request) {
        String token = request.get("token");
        String newPassword = request.get("newPassword");

        if (token == null || token.trim().isEmpty() || newPassword == null || newPassword.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Jeton et mot de passe requis"));
        }
        if (!PasswordPolicyValidator.isValid(newPassword)) {
            return ResponseEntity.badRequest().body(Map.of("error", PasswordPolicyValidator.reason(newPassword)));
        }

        AccountActivationService.ActivationOutcome outcome =
            accountActivationService.activate(token.trim(), newPassword);
        if (!outcome.success()) {
            return ResponseEntity.status(400).body(Map.of("error", outcome.message()));
        }
        return ResponseEntity.ok(Map.of("message", outcome.message()));
    }

    /**
     * Active ou désactive un compte utilisateur
     */
    @PostMapping("/{id}/set-enabled")    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> setUserEnabled(@PathVariable Long id, @RequestBody Map<String, Boolean> payload) {
        try {
            Boolean enabled = payload.get("enabled");
            if (enabled == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Le champ 'enabled' est requis"));
            }

            Optional<UserEntity> userOpt = userRepository.findById(id);
            if (userOpt.isEmpty() || !isSameTenant(userOpt.get())) {
                return ResponseEntity.notFound().build();
            }

            UserEntity user = userOpt.get();
            if ("admin".equals(user.getUsername()) && !enabled) {
                return ResponseEntity.badRequest().body(Map.of("error", "Impossible de désactiver le compte administrateur"));
            }

            user.setEnabled(enabled);
            UserEntity updatedUser = userRepository.save(user);
            updatedUser.setPassword(null);

            String message = enabled
                ? "Utilisateur activé avec succès"
                : "Utilisateur désactivé avec succès";

            return ResponseEntity.ok(Map.of(
                "message", message,
                "user", updatedUser
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Erreur lors de la modification du statut : " + e.getMessage()));
        }
    }

    /**
     * Réinitialise le mot de passe d'un utilisateur et l'envoie par email
     */
    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> resetPassword(@PathVariable Long id) {
        try {
            Optional<UserEntity> userOpt = userRepository.findById(id);
            if (userOpt.isEmpty() || !isSameTenant(userOpt.get())) {
                return ResponseEntity.notFound().build();
            }
            
            UserEntity user = userOpt.get();
            
            // Vérifier que l'utilisateur a une adresse email
            if (user.getEmail() == null || user.getEmail().trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cet utilisateur n'a pas d'adresse email configurée"));
            }
            
            // Générer un nouveau mot de passe
            String newPassword = generateSecurePassword();
            String hashedPassword = passwordEncoder.encode(newPassword);
            user.setPassword(hashedPassword);
            userRepository.save(user);
            
            // Envoyer le nouveau mot de passe par email
            try {
                emailService.sendPasswordResetEmail(user.getEmail(), user.getUsername(), newPassword);
            } catch (Exception e) {
                return ResponseEntity.status(500).body(Map.of("error", "Le mot de passe a été réinitialisé mais l'email n'a pas pu être envoyé : " + e.getMessage()));
            }
            
            return ResponseEntity.ok(Map.of("message", "Mot de passe réinitialisé et envoyé par email avec succès"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Erreur lors de la réinitialisation du mot de passe : " + e.getMessage()));
        }
    }

    /**
     * Génère un mot de passe sécurisé aléatoire
     */
    private String generateSecurePassword() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
        SecureRandom random = new SecureRandom();
        StringBuilder password = new StringBuilder(12);
        
        for (int i = 0; i < 12; i++) {
            password.append(chars.charAt(random.nextInt(chars.length())));
        }
        
        return password.toString();
    }

    /**
     * Extrait le username depuis le token JWT dans la requête
     */
    private String extractUsernameFromRequest(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                String token = authHeader.substring(7);
                return jwtService.extractUsername(token);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Isolation : l'utilisateur cible appartient-il a l'entreprise courante ?
     * <p>{@code UserEntity} n'est pas annote {@code @TenantId} (le login est
     * global par username), le controle d'appartenance est donc assure ici.</p>
     */
    private boolean isSameTenant(UserEntity user) {
        Long tenant = TenantContext.get();
        return user != null && tenant != null && tenant.equals(user.getEntrepriseId());
    }
} 