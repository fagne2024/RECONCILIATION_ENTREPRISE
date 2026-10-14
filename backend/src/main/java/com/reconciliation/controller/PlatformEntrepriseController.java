package com.reconciliation.controller;

import com.reconciliation.dto.CreateEntrepriseRequest;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.service.EmailService;
import com.reconciliation.service.PlatformEntrepriseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Administration des entreprises (tenants) - reservee au SUPER_ADMIN.
 *
 * <p>Toutes les routes sont protegees a la fois par Spring Security
 * ({@code /api/platform/**} = {@code ROLE_SUPER_ADMIN}) et par
 * {@link PreAuthorize}. Le jeton d'activation n'est JAMAIS renvoye au client :
 * seul le resultat de l'envoi de l'email l'est.</p>
 */
@RestController
@RequestMapping("/api/platform/entreprises")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class PlatformEntrepriseController {

    private static final Logger log = LoggerFactory.getLogger(PlatformEntrepriseController.class);

    private final PlatformEntrepriseService service;
    private final EmailService emailService;

    public PlatformEntrepriseController(PlatformEntrepriseService service, EmailService emailService) {
        this.service = service;
        this.emailService = emailService;
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> list(
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived) {
        List<Map<String, Object>> body = service.findAll().stream()
            .filter(e -> includeArchived || e.getStatut() != EntrepriseStatut.ARCHIVEE)
            .sorted(Comparator.comparing(EntrepriseEntity::getId))
            .map(this::toSummary)
            .collect(Collectors.toList());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> detail(@PathVariable Long id) {
        EntrepriseEntity entreprise = service.findById(id);
        Map<String, Object> body = toSummary(entreprise);
        body.put("users", service.users(id).stream().map(u -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("username", u.username());
            row.put("email", u.email());
            row.put("profil", u.profilNom());
            row.put("enabled", u.enabled());
            return row;
        }).collect(Collectors.toList()));
        return ResponseEntity.ok(body);
    }

    /**
     * Cree une entreprise et son administrateur de facon atomique, puis envoie
     * (best-effort, hors transaction) le lien d'activation par email.
     */
    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody CreateEntrepriseRequest request,
            Authentication authentication) {
        String actor = actorOf(authentication);
        PlatformEntrepriseService.ProvisionedEntreprise result = service.create(request, actor);

        boolean emailSent = sendActivationEmail(
            result.adminEmail(), result.adminUsername(), result.nom(), result.activationToken());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", result.id());
        body.put("code", result.code());
        body.put("nom", result.nom());
        body.put("statut", result.statut());
        body.put("adminUsername", result.adminUsername());
        body.put("adminEmail", result.adminEmail());
        body.put("droitsAccordes", result.droitsAccordes());
        body.put("modulesActives", 0);
        body.put("activationEmailSent", emailSent);
        body.put("message", emailSent
            ? "Entreprise creee. Le lien d'activation a ete envoye a l'administrateur."
            : "Entreprise creee. L'email d'activation n'a pas pu etre envoye : utilisez le renvoi de lien.");
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> update(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        String nom = body == null ? null : asString(body.get("nom"));
        String code = body == null ? null : asString(body.get("code"));
        EntrepriseEntity entreprise = service.update(id, nom, code, actorOf(authentication));
        return ResponseEntity.ok(toSummary(entreprise));
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> suspend(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(toSummary(service.suspend(id, actorOf(authentication))));
    }

    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> reactivate(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(toSummary(service.reactivate(id, actorOf(authentication))));
    }

    @PostMapping("/{id}/archive")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> archive(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(toSummary(service.archive(id, actorOf(authentication))));
    }

    @PostMapping("/{id}/resend-activation")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> resendActivation(@PathVariable Long id, Authentication authentication) {
        PlatformEntrepriseService.ActivationRenewal renewal =
            service.renewActivation(id, actorOf(authentication));

        boolean emailSent = sendActivationEmail(
            renewal.adminEmail(), renewal.adminUsername(), renewal.nom(), renewal.activationToken());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", renewal.entrepriseId());
        body.put("adminUsername", renewal.adminUsername());
        body.put("adminEmail", renewal.adminEmail());
        body.put("activationEmailSent", emailSent);
        body.put("message", emailSent
            ? "Nouveau lien d'activation envoye a l'administrateur."
            : "Lien d'activation regenere mais l'email n'a pas pu etre envoye.");
        return ResponseEntity.ok(body);
    }

    // ------------------------------------------------------------------

    private boolean sendActivationEmail(String email, String username, String nom, String token) {
        try {
            emailService.sendActivationEmail(email, username, emailService.getActivationUrl(token), nom);
            return true;
        } catch (Exception e) {
            log.warn("Envoi du lien d'activation impossible pour '{}' : {}", username, e.getMessage());
            return false;
        }
    }

    private Map<String, Object> toSummary(EntrepriseEntity entreprise) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", entreprise.getId());
        body.put("code", entreprise.getCode());
        body.put("nom", entreprise.getNom());
        body.put("statut", entreprise.getStatut().name());
        body.put("createdAt", entreprise.getCreatedAt());
        body.put("updatedAt", entreprise.getUpdatedAt());
        body.put("modulesActives", service.activeModuleCount(entreprise.getId()));
        return body;
    }

    private static String actorOf(Authentication authentication) {
        return authentication != null && authentication.getName() != null
            ? authentication.getName() : "inconnu";
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }
}
