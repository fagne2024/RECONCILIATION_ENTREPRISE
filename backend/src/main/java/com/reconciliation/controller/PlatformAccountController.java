package com.reconciliation.controller;

import com.reconciliation.service.EmailService;
import com.reconciliation.service.PlatformAccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Administration des comptes des entreprises — reservee au SUPER_ADMIN.
 *
 * <p>Routes protegees par Spring Security ({@code /api/platform/**} =
 * {@code ROLE_SUPER_ADMIN}) et {@link PreAuthorize}. Les messages sont renvoyes
 * dans le champ {@code message} ; les erreurs metier (doublons, dernier admin…)
 * sont traduites par {@code GlobalExceptionHandler} (409 / 400) en
 * {@code {error, message}}.</p>
 */
@RestController
@RequestMapping("/api/platform/accounts")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class PlatformAccountController {

    private static final Logger log = LoggerFactory.getLogger(PlatformAccountController.class);

    private final PlatformAccountService service;
    private final EmailService emailService;

    public PlatformAccountController(PlatformAccountService service, EmailService emailService) {
        this.service = service;
        this.emailService = emailService;
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<PlatformAccountService.AccountRow>> list() {
        return ResponseEntity.ok(service.list());
    }

    /**
     * Cree un compte rattache a une entreprise (profil administrateur), avec
     * mot de passe temporaire et obligation de changement a la premiere
     * connexion. L'envoi email est best-effort : le mot de passe temporaire
     * est renvoye une seule fois dans la reponse pour permettre sa
     * transmission a l'utilisateur quand l'email n'a pas pu etre envoye.
     */
    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        String username = body == null ? null : asString(body.get("username"));
        String email = body == null ? null : asString(body.get("email"));
        Long entrepriseId = body == null ? null : asLong(body.get("entrepriseId"));

        PlatformAccountService.ResetOutcome outcome =
            service.create(username, email, entrepriseId, actorOf(authentication));
        boolean emailSent = sendPasswordEmail(outcome.email(), outcome.username(), outcome.newPassword());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", emailSent
            ? "Compte cree avec succes. Le mot de passe temporaire a ete envoye par email."
            : "Compte cree avec succes. L'email n'a pas pu etre envoye : notez le mot de passe temporaire ci-dessous.");
        result.put("emailSent", emailSent);
        result.put("temporaryPassword", outcome.newPassword());
        return ResponseEntity.ok(result);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> update(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        String username = body == null ? null : asString(body.get("username"));
        String email = body == null ? null : asString(body.get("email"));
        Boolean enabled = body == null ? null : asBoolean(body.get("enabled"));
        service.update(id, username, email, enabled, actorOf(authentication));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "Compte modifie avec succes.");
        return ResponseEntity.ok(result);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long id, Authentication authentication) {
        service.delete(id, actorOf(authentication));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "Compte supprime.");
        return ResponseEntity.ok(result);
    }

    /**
     * Reinitialise le mot de passe a usage unique, puis envoie l'email
     * (best-effort, hors transaction). Le mot de passe en clair n'est jamais
     * renvoye au client.
     */
    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> resetPassword(@PathVariable Long id, Authentication authentication) {
        PlatformAccountService.ResetOutcome outcome = service.resetPassword(id, actorOf(authentication));

        boolean emailSent = sendPasswordEmail(outcome.email(), outcome.username(), outcome.newPassword());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", emailSent
            ? "Mot de passe reinitialise et envoye par email a l'utilisateur."
            : "Mot de passe reinitialise mais l'email n'a pas pu etre envoye.");
        result.put("emailSent", emailSent);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/reset-2fa")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> reset2FA(@PathVariable Long id, Authentication authentication) {
        service.reset2FA(id, actorOf(authentication));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message",
            "Authentification a deux facteurs reinitialisee (desactivee). "
                + "L'utilisateur devra la reactiver a sa prochaine connexion.");
        return ResponseEntity.ok(result);
    }

    // ------------------------------------------------------------------

    private boolean sendPasswordEmail(String email, String username, String newPassword) {
        try {
            emailService.sendPasswordResetEmail(email, username, newPassword);
            return true;
        } catch (Exception e) {
            log.warn("Envoi du nouveau mot de passe impossible pour '{}' : {}", username, e.getMessage());
            return false;
        }
    }

    private static String actorOf(Authentication authentication) {
        return authentication != null && authentication.getName() != null
            ? authentication.getName() : "inconnu";
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private static Boolean asBoolean(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        return Boolean.parseBoolean(value.toString());
    }

    private static Long asLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}