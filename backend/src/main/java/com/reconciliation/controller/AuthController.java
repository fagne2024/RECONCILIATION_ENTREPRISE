package com.reconciliation.controller;

import com.reconciliation.repository.UserRepository;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.entity.ProfilEntity;
import com.reconciliation.entity.ProfilPermissionEntity;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.repository.ProfilPermissionRepository;
import com.reconciliation.service.JwtService;
import com.reconciliation.service.LoginLockService;
import com.reconciliation.service.PaysFilterService;
import com.reconciliation.service.TwoFactorAuthService;
import com.reconciliation.service.AuthTicketService;
import com.reconciliation.util.AdminRoleUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.reconciliation.service.AuthCookieService;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.HashMap;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.entity.PermissionEntity;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class AuthController {
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private ProfilPermissionRepository profilPermissionRepository;
    @Autowired
    private ModuleRepository moduleRepository;
    @Autowired
    private PermissionRepository permissionRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private TwoFactorAuthService twoFactorAuthService;
    @Autowired
    private LoginLockService loginLockService;
    @Autowired
    private PaysFilterService paysFilterService;
    @Autowired
    private AuthTicketService authTicketService;
    @Autowired
    private EntrepriseRepository entrepriseRepository;

    @Autowired
    private AuthCookieService authCookieService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> payload,
                                   HttpServletRequest request,
                                   HttpServletResponse response) {
        String username = payload.get("username");
        String password = payload.get("password");
        if (username == null || password == null) {
            return ResponseEntity.badRequest().body("Champs manquants");
        }

        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "Identifiant ou mot de passe incorrect"));
        }

        UserEntity user = userOpt.get();

        // Etablir le contexte entreprise des l'identification : les lectures
        // filtrees par @TenantId (profil, droits, pays) doivent viser l'entreprise
        // de l'utilisateur authentifie. Contexte systematiquement nettoye ensuite.
        Long loginTenant = user.getEntrepriseId();
        if (loginTenant != null) {
            com.reconciliation.tenant.TenantContext.set(loginTenant);
        }
        try {
            return finishLogin(user, password, request, response);
        } finally {
            com.reconciliation.tenant.TenantContext.clear();
        }
    }

    private ResponseEntity<?> finishLogin(UserEntity user, String password,
                                          HttpServletRequest request, HttpServletResponse httpResponse) {
        Optional<ResponseEntity<?>> lockedResponse = loginLockService.buildLockedResponse(user);
        if (lockedResponse.isPresent()) {
            return lockedResponse.get();
        }

        if (!user.getEnabled()) {
            return ResponseEntity.status(403).body(Map.of("error", "Ce compte utilisateur est désactivé. Contactez un administrateur."));
        }

        // Refuser la connexion si l'entreprise est suspendue (decision : aucun acces).
        Optional<ResponseEntity<?>> entrepriseResponse = buildEntrepriseSuspendedResponse(user);
        if (entrepriseResponse.isPresent()) {
            return entrepriseResponse.get();
        }

        String storedPassword = user.getPassword();
        boolean passwordMatches = false;
        if (storedPassword != null && (storedPassword.startsWith("$2a$")
                || storedPassword.startsWith("$2b$")
                || storedPassword.startsWith("$2y$"))) {
            String hash = storedPassword.startsWith("$2y$")
                ? "$2a$" + storedPassword.substring(4)
                : storedPassword;
            passwordMatches = passwordEncoder.matches(password, hash);
        }

        if (!passwordMatches) {
            Map<String, Object> failure = loginLockService.recordFailedAttempt(user);
            if (Boolean.TRUE.equals(failure.get("locked"))) {
                return ResponseEntity.status(423).body(failure);
            }
            return ResponseEntity.status(401).body(failure);
        }

        loginLockService.resetFailedAttempts(user);

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("username", user.getUsername());

        if (user.getEnabled2FA() && user.getSecret2FA() != null) {
            body.put("requires2FA", true);
            body.put("message", "Code d'authentification à deux facteurs requis");
            // Ticket pré-auth : nécessaire pour valider le code TOTP, usage unique, 5 min.
            // La clé secrète et son URL otpauth ne sont PAS renvoyées ici.
            body.put("preAuthTicket", authTicketService.issueTicket(user.getUsername()));

            if (!user.getQrCodeScanned()) {
                String qrCodeBase64 = twoFactorAuthService.generateQRCodeBase64(user.getUsername(), user.getSecret2FA());
                body.put("qrCode", qrCodeBase64);
                body.put("showQRCode", true);
            } else {
                body.put("showQRCode", false);
            }

            return ResponseEntity.ok().body(body);
        }

        // Authentification complète (mot de passe, sans 2FA) : horodater la connexion.
        markSuccessfulLogin(user);

        Map<String, Object> extraClaims = buildRoleClaims(user);
        String token = jwtService.generateToken(user.getUsername(), extraClaims);
        authCookieService.addTokenCookie(request, httpResponse, token);

        body.put("authenticated", true);
        body.put("requires2FA", false);
        putScopeFields(body, user);

        ProfilEntity profil = user.getProfil();
        String profilNom = profil != null ? profil.getNom() : null;

        if (AdminRoleUtil.isAdminUser(user)) {
            List<ModuleEntity> modules = moduleRepository.findAll();
            List<PermissionEntity> permissions = permissionRepository.findAll();
            List<Map<String, String>> droits = new java.util.ArrayList<>();
            for (ModuleEntity m : modules) {
                for (PermissionEntity p : permissions) {
                    droits.add(Map.of("module", m.getNom(), "permission", p.getNom()));
                }
            }
            body.put("profil", profilNom != null ? profilNom : "ADMIN");
            body.put("droits", droits);
        } else {
            List<ProfilPermissionEntity> droits = profil != null ? profilPermissionRepository.findAll().stream()
                .filter(pp -> pp.getProfil().getId().equals(profil.getId()))
                .toList() : List.of();
            body.put("profil", profilNom);
            body.put("droits", droits.stream().map(pp -> Map.of(
                "module", pp.getModule().getNom(),
                "permission", pp.getPermission().getNom()
            )).toList());
        }
        putPaysScope(body, user);
        return ResponseEntity.ok().body(body);
    }

    private void putPaysScope(Map<String, Object> response, UserEntity user) {
        // Le SUPER_ADMIN (compte plateforme) n'a aucune portee pays metier.
        if (AdminRoleUtil.isSuperAdmin(user)) {
            Map<String, Object> pays = new HashMap<>();
            pays.put("isGlobal", false);
            pays.put("codes", List.of());
            pays.put("names", List.of());
            response.put("pays", pays);
            return;
        }
        String username = user.getUsername();
        List<String> codes = paysFilterService.getAllowedPaysCodes(username);
        Map<String, Object> pays = new HashMap<>();
        if (codes == null) {
            pays.put("isGlobal", true);
            pays.put("codes", null);
            pays.put("names", null);
        } else {
            pays.put("isGlobal", false);
            pays.put("codes", codes);
            pays.put("names", paysFilterService.getAllowedPaysNames(username));
        }
        response.put("pays", pays);
    }

    /**
     * Expose le role, l'entreprise (nulle pour SUPER_ADMIN) et le drapeau
     * de changement de mot de passe obligatoire dans la reponse de connexion.
     */
    private void putScopeFields(Map<String, Object> response, UserEntity user) {
        response.put("role", AdminRoleUtil.resolveRole(user));
        if (user.getEntrepriseId() != null) {
            response.put("entrepriseId", user.getEntrepriseId());
        }
        response.put("mustChangePassword", user.getPasswordChangeRequired());
    }

    /**
     * Si l'utilisateur appartient a une entreprise suspendue, renvoie une reponse
     * 403. Un SUPER_ADMIN (entreprise_id = null) n'est jamais concerne.
     */
    private Optional<ResponseEntity<?>> buildEntrepriseSuspendedResponse(UserEntity user) {
        Long entrepriseId = user.getEntrepriseId();
        if (entrepriseId == null) {
            return Optional.empty();
        }
        EntrepriseEntity entreprise = entrepriseRepository.findById(entrepriseId).orElse(null);
        if (entreprise == null || entreprise.getStatut() != EntrepriseStatut.ACTIVE) {
            return Optional.of(ResponseEntity.status(403)
                .body(Map.of("error", "Accès refusé : entreprise suspendue ou archivée. Contactez l'administrateur de la plateforme.")));
        }
        return Optional.empty();
    }

    /**
     * Valide le code 2FA (après obtention d'un ticket pré-auth au login) et retourne le token JWT
     */
    @PostMapping("/verify-2fa")
    public ResponseEntity<?> verify2FA(@RequestBody Map<String, String> payload,
                                       HttpServletRequest request,
                                       HttpServletResponse httpResponse) {
        String username = payload.get("username");
        String code = payload.get("code");
        String preAuthTicket = payload.get("preAuthTicket");

        if (username == null || code == null || preAuthTicket == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Nom d'utilisateur, code et ticket d'authentification requis"));
        }

        // Le ticket est obligatoire : il prouve que le mot de passe vient d'être confirmé.
        // Consommé atomiquement (usage unique) avant toute autre vérification.
        java.util.Optional<String> ticketUsername = authTicketService.consumeTicket(preAuthTicket);
        if (ticketUsername.isEmpty() || !ticketUsername.get().equals(username)) {
            return ResponseEntity.status(401).body(Map.of("error", "Code invalide ou 2FA non activé"));
        }

        try {
            int totpCode = Integer.parseInt(code);

            Optional<UserEntity> userOpt = userRepository.findByUsername(username);
            if (userOpt.isEmpty() || !userOpt.get().getEnabled()) {
                return ResponseEntity.status(401).body(Map.of("error", "Code invalide ou 2FA non activé"));
            }

            UserEntity user = userOpt.get();
            // Contexte entreprise pour les lectures filtrees par @TenantId (droits, pays).
            Long verifyTenant = user.getEntrepriseId();
            if (verifyTenant != null) {
                com.reconciliation.tenant.TenantContext.set(verifyTenant);
            }
            Optional<ResponseEntity<?>> lockedResponse = loginLockService.buildLockedResponse(user);
            if (lockedResponse.isPresent()) {
                return lockedResponse.get();
            }

            // Refuser si l'entreprise est suspendue (aucun acces).
            Optional<ResponseEntity<?>> entrepriseResponse = buildEntrepriseSuspendedResponse(user);
            if (entrepriseResponse.isPresent()) {
                return entrepriseResponse.get();
            }

            if (!user.getEnabled2FA() || user.getSecret2FA() == null
                    || !twoFactorAuthService.validateCode(user.getSecret2FA(), totpCode)) {
                Map<String, Object> failure = loginLockService.recordFailedAttempt(user);
                if (Boolean.TRUE.equals(failure.get("locked"))) {
                    return ResponseEntity.status(423).body(failure);
                }
                return ResponseEntity.status(401).body(failure);
            }

            loginLockService.resetFailedAttempts(user);
            if (!user.getQrCodeScanned()) {
                user.setQrCodeScanned(true);
                userRepository.save(user);
            }

            // Authentification complète (mot de passe + 2FA) : horodater la connexion.
            markSuccessfulLogin(user);

            Map<String, Object> extraClaims = buildRoleClaims(user);
            String token = jwtService.generateToken(user.getUsername(), extraClaims);
            authCookieService.addTokenCookie(request, httpResponse, token);

            Map<String, Object> response = new java.util.HashMap<>();
            response.put("username", user.getUsername());
            response.put("authenticated", true);
            putScopeFields(response, user);

            if (AdminRoleUtil.isAdminUser(user)) {
                List<ModuleEntity> modules = moduleRepository.findAll();
                List<PermissionEntity> permissions = permissionRepository.findAll();
                List<Map<String, String>> droits = new java.util.ArrayList<>();
                for (ModuleEntity m : modules) {
                    for (PermissionEntity p : permissions) {
                        droits.add(Map.of("module", m.getNom(), "permission", p.getNom()));
                    }
                }
                ProfilEntity profil = user.getProfil();
                response.put("profil", profil != null ? profil.getNom() : "ADMIN");
                response.put("droits", droits);
            } else {
                ProfilEntity profil = user.getProfil();
                List<ProfilPermissionEntity> droits = profil != null ? profilPermissionRepository.findAll().stream()
                    .filter(pp -> pp.getProfil().getId().equals(profil.getId()))
                    .toList() : List.of();
                response.put("profil", profil != null ? profil.getNom() : null);
                response.put("droits", droits.stream().map(pp -> Map.of(
                    "module", pp.getModule().getNom(),
                    "permission", pp.getPermission().getNom()
                )).toList());
            }
            putPaysScope(response, user);
            return ResponseEntity.ok().body(response);
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Code doit être un nombre à 6 chiffres"));
        } finally {
            com.reconciliation.tenant.TenantContext.clear();
        }
    }

    /**
     * Horodate la dernière connexion réussie sur le compte. Appelé une seule
     * fois par authentification complète : fin du login mot de passe (sans 2FA)
     * ou validation du code 2FA.
     */
    private void markSuccessfulLogin(UserEntity user) {
        user.setLastLogin(java.time.LocalDateTime.now());
        userRepository.save(user);
    }

    private Map<String, Object> buildRoleClaims(UserEntity user) {
        Map<String, Object> claims = new java.util.HashMap<>();
        // Role unique : SUPER_ADMIN (plateforme) > ADMIN > USER.
        claims.put(JwtService.CLAIM_ROLE, AdminRoleUtil.resolveRole(user));
        // Portee entreprise : absente pour le SUPER_ADMIN (entreprise_id = null).
        if (user.getEntrepriseId() != null) {
            claims.put(JwtService.CLAIM_ENTREPRISE_ID, user.getEntrepriseId());
        }
        return claims;
    }

    /**
     * Resout l'entreprise associee a un identifiant, AVANT authentification.
     *
     * <p>Utilise par la page de connexion pour mettre a jour le logo, le theme et
     * le nom affiche des la saisie de l'identifiant (previsualisation de la
     * marque). Endpoint volontairement minimal : ne renvoie QUE le code et le nom
     * d'entreprise, jamais le profil ni une quelconque donnee du compte.</p>
     *
     * <p>Renvoie {@code entrepriseCode = null} et {@code entrepriseNom = null}
     * pour un identifiant inconnu, un compte SUPER_ADMIN (aucune entreprise) ou
     * un identifiant vide : le frontend reprend alors les couleurs/logo/nom par
     * defaut.</p>
     */
    @GetMapping("/entreprise")
    public ResponseEntity<Map<String, Object>> resolveEntreprise(
            @RequestParam(name = "username", required = false) String username) {
        Map<String, Object> response = new HashMap<>();
        String code = null;
        if (username != null && !username.isBlank()) {
            Optional<EntrepriseEntity> entreprise = userRepository.findByUsername(username.trim())
                .map(UserEntity::getEntrepriseId)
                .flatMap(entrepriseRepository::findById);
            code = entreprise.map(EntrepriseEntity::getCode).orElse(null);
        }
        response.put("entrepriseCode", code);
        response.put("entrepriseNom", null);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request, HttpServletResponse httpResponse) {
        authCookieService.clear(request, httpResponse);
        return ResponseEntity.ok().body(Map.of("message", "Déconnecté"));
    }
} 