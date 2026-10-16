package com.reconciliation.controller;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.service.TwoFactorAuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

/**
 * Contrôleur pour la gestion de l'authentification à deux facteurs (2FA)
 *
 * L'identité provient TOUJOURS du contexte Spring Security (token JWT), jamais
 * d'un champ "username" du corps de requête. Règles d'accès :
 *   - setup / enable / disable / status : l'utilisateur connecté sur son propre compte,
 *     ou un ADMIN sur n'importe quel compte ;
 *   - activate / reset (actions d'administration) : ADMIN uniquement.
 */
@RestController
@RequestMapping("/api/auth/2fa")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class TwoFactorAuthController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TwoFactorAuthService twoFactorAuthService;

    /**
     * Génère une nouvelle clé secrète et un QR code pour activer le 2FA
     * POST /api/auth/2fa/setup
     */
    @PostMapping("/setup")
    public ResponseEntity<?> setup2FA(@RequestBody Map<String, String> payload) {
        ResponseEntity<?> forbidden = checkTargetAccess(payload);
        if (forbidden != null) {
            return forbidden;
        }

        String username = resolveTargetUsername(payload);
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        UserEntity user = userOpt.get();

        // Générer une nouvelle clé secrète
        String secret = twoFactorAuthService.generateSecretKey();
        user.setSecret2FA(secret);
        // Ne pas activer le 2FA tant que l'utilisateur n'a pas validé avec un code
        user.setEnabled2FA(false);
        userRepository.save(user);

        // Générer le QR code
        String qrCodeBase64 = twoFactorAuthService.generateQRCodeBase64(username, secret);
        String otpAuthUrl = twoFactorAuthService.generateOtpAuthUrl(username, secret);

        Map<String, Object> response = Map.of(
            "secret", secret,
            "qrCode", qrCodeBase64,
            "otpAuthUrl", otpAuthUrl,
            "message", "Scannez le QR code avec Google Authenticator et validez avec un code"
        );

        return ResponseEntity.ok(response);
    }

    /**
     * Active le 2FA après validation d'un code
     * POST /api/auth/2fa/enable
     */
    @PostMapping("/enable")
    public ResponseEntity<?> enable2FA(@RequestBody Map<String, String> payload) {
        ResponseEntity<?> forbidden = checkTargetAccess(payload);
        if (forbidden != null) {
            return forbidden;
        }

        String username = resolveTargetUsername(payload);
        String code = payload.get("code");

        if (code == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Code requis"));
        }

        try {
            int totpCode = Integer.parseInt(code);

            Optional<UserEntity> userOpt = userRepository.findByUsername(username);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            UserEntity user = userOpt.get();

            if (user.getSecret2FA() == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Clé secrète non générée. Utilisez /setup d'abord"));
            }

            // Valider le code
            if (!twoFactorAuthService.validateCode(user.getSecret2FA(), totpCode)) {
                return ResponseEntity.status(401).body(Map.of("error", "Code invalide"));
            }

            // Activer le 2FA
            user.setEnabled2FA(true);
            userRepository.save(user);

            return ResponseEntity.ok(Map.of(
                "message", "Authentification à deux facteurs activée avec succès",
                "enabled", true
            ));
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Code doit être un nombre à 6 chiffres"));
        }
    }

    /**
     * Active le 2FA directement sans validation de code (administrateurs)
     * POST /api/auth/2fa/activate
     */
    @PostMapping("/activate")
    public ResponseEntity<?> activate2FA(@RequestBody Map<String, String> payload) {
        if (!isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Accès réservé aux administrateurs"));
        }
        ResponseEntity<?> forbidden = checkTargetAccess(payload);
        if (forbidden != null) {
            return forbidden;
        }

        String username = payload.get("username");
        if (username == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Nom d'utilisateur requis"));
        }

        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        UserEntity user = userOpt.get();

        boolean usingExistingSecret = false;
        if (user.getSecret2FA() != null && !user.getSecret2FA().isEmpty()) {
            usingExistingSecret = true;
        } else {
            user.setSecret2FA(twoFactorAuthService.generateSecretKey());
        }

        user.setEnabled2FA(true);
        if (!usingExistingSecret) {
            user.setQrCodeScanned(false);
        }
        userRepository.save(user);

        // Le QR code est renvoyé pour l'enrôlement ; la clé secrète et son URL otpauth ne le sont pas.
        String qrCodeBase64 = twoFactorAuthService.generateQRCodeBase64(username, user.getSecret2FA());

        String message = usingExistingSecret
            ? "Authentification à deux facteurs réactivée avec succès. Vous pouvez utiliser le même compte Google Authenticator que précédemment."
            : "Authentification à deux facteurs activée avec succès. L'utilisateur devra scanner le QR code à la prochaine connexion.";

        return ResponseEntity.ok(Map.of(
            "message", message,
            "enabled", true,
            "qrCode", qrCodeBase64,
            "usingExistingSecret", usingExistingSecret
        ));
    }

    /**
     * Désactive le 2FA d'un utilisateur (soi-même, ou n'importe quel compte pour un ADMIN)
     * POST /api/auth/2fa/disable
     */
    @PostMapping("/disable")
    public ResponseEntity<?> disable2FA(@RequestBody Map<String, String> payload) {
        ResponseEntity<?> forbidden = checkTargetAccess(payload);
        if (forbidden != null) {
            return forbidden;
        }

        String username = resolveTargetUsername(payload);
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        UserEntity user = userOpt.get();
        String actor = authenticatedUsername();
        boolean self = actor != null && actor.equals(username);
        if (self) {
            String code = payload != null ? payload.get("code") : null;
            if (code == null || user.getSecret2FA() == null || user.getSecret2FA().isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Code TOTP requis pour désactiver votre 2FA"));
            }
            try {
                if (!twoFactorAuthService.validateCode(user.getSecret2FA(), Integer.parseInt(code))) {
                    return ResponseEntity.status(401).body(Map.of("error", "Code invalide"));
                }
            } catch (NumberFormatException e) {
                return ResponseEntity.badRequest().body(Map.of("error", "Code doit être un nombre à 6 chiffres"));
            }
        } else if (!isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Accès réservé aux administrateurs"));
        }

        user.setEnabled2FA(false);
        // La clé secrète et le flag de scan sont conservés pour permettre une réactivation
        // avec le même compte Google Authenticator.
        userRepository.save(user);

        return ResponseEntity.ok(Map.of(
            "message", "Authentification à deux facteurs désactivée. La clé secrète est conservée pour permettre une réactivation avec le même compte Google Authenticator.",
            "enabled", false
        ));
    }

    /**
     * Vérifie si le 2FA est activé pour un utilisateur
     * GET /api/auth/2fa/status
     */
    @GetMapping("/status")
    public ResponseEntity<?> get2FAStatus(@RequestParam(required = false) String username) {
        ResponseEntity<?> forbidden = checkRequestParamAccess(username);
        if (forbidden != null) {
            return forbidden;
        }

        String target = username != null ? username : authenticatedUsername();
        Optional<UserEntity> userOpt = userRepository.findByUsername(target);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        UserEntity user = userOpt.get();
        boolean enabled = user.getEnabled2FA() != null && user.getEnabled2FA();
        boolean hasSecret = user.getSecret2FA() != null && !user.getSecret2FA().isEmpty();

        return ResponseEntity.ok(Map.of(
            "enabled", enabled,
            "hasSecret", hasSecret
        ));
    }

    /**
     * Réinitialise le 2FA d'un utilisateur (génère une nouvelle clé secrète mais garde le 2FA actif)
     * POST /api/auth/2fa/reset
     */
    @PostMapping("/reset")
    public ResponseEntity<?> reset2FA(@RequestBody Map<String, String> payload) {
        if (!isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Accès réservé aux administrateurs"));
        }
        ResponseEntity<?> forbidden = checkTargetAccess(payload);
        if (forbidden != null) {
            return forbidden;
        }

        String username = payload.get("username");
        if (username == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Nom d'utilisateur requis"));
        }

        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        UserEntity user = userOpt.get();

        // Générer une nouvelle clé secrète
        String newSecret = twoFactorAuthService.generateSecretKey();
        user.setSecret2FA(newSecret);
        user.setEnabled2FA(true);
        user.setQrCodeScanned(false);

        userRepository.save(user);

        // QR code renvoyé pour le nouveau scan ; la clé secrète n'est pas renvoyée.
        String qrCodeBase64 = twoFactorAuthService.generateQRCodeBase64(username, newSecret);

        return ResponseEntity.ok(Map.of(
            "message", "Authentification à deux facteurs réinitialisée avec succès. Une nouvelle clé secrète a été générée. L'utilisateur devra scanner le nouveau QR code lors de sa prochaine connexion.",
            "enabled", true,
            "qrCode", qrCodeBase64
        ));
    }

    // ---------- Contrôle d'accès ----------

    private String authenticatedUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            Object principal = authentication.getPrincipal();
            if (principal instanceof UserDetails userDetails) {
                String username = userDetails.getUsername();
                if (username != null && !username.isBlank()) {
                    return username;
                }
            } else if (principal instanceof String username
                    && username != null && !username.isBlank()
                    && !"anonymousUser".equalsIgnoreCase(username)) {
                return username;
            }
        }
        return null;
    }

    private boolean isAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(auth -> "ROLE_ADMIN".equals(auth.getAuthority()));
    }

    /**
     * En cas d'accès interdit, retourne la réponse 403 ; sinon null.
     */
    private ResponseEntity<?> checkTargetAccess(Map<String, String> payload) {
        String target = payload != null ? payload.get("username") : null;
        return enforceSelfOrSameTenantAdmin(target);
    }

    private ResponseEntity<?> checkRequestParamAccess(String username) {
        return enforceSelfOrSameTenantAdmin(username);
    }

    private ResponseEntity<?> enforceSelfOrSameTenantAdmin(String targetUsername) {
        String actor = authenticatedUsername();
        if (targetUsername == null || targetUsername.isBlank() || targetUsername.equals(actor)) {
            return null;
        }
        if (!isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Vous ne pouvez gérer que votre propre authentification à deux facteurs"));
        }
        Optional<UserEntity> actorOpt = actor != null ? userRepository.findByUsername(actor) : Optional.empty();
        Optional<UserEntity> targetOpt = userRepository.findByUsername(targetUsername);
        if (actorOpt.isEmpty() || targetOpt.isEmpty()) {
            return ResponseEntity.status(403).body(Map.of("error", "Accès refusé"));
        }
        Long actorTenant = actorOpt.get().getEntrepriseId();
        Long targetTenant = targetOpt.get().getEntrepriseId();
        if (actorTenant == null || !actorTenant.equals(targetTenant)) {
            return ResponseEntity.status(403).body(Map.of("error", "Accès refusé hors de votre entreprise"));
        }
        return null;
    }

    private String resolveTargetUsername(Map<String, String> payload) {
        String username = payload != null ? payload.get("username") : null;
        if (username == null || username.isBlank()) {
            return authenticatedUsername();
        }
        return username;
    }
}