package com.reconciliation.controller;

import com.reconciliation.entity.EntrepriseBrandingEntity;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.entity.NavigationLabelAuditEntity;
import com.reconciliation.repository.EntrepriseBrandingRepository;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.service.NavigationLabelAuditService;
import com.reconciliation.tenant.TenantContext;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Parametrage d'affichage de l'application.
 *
 * <p>Le logo et le theme sont propres a CHAQUE entreprise : ils sont stockes
 * dans {@code entreprise_branding} (cle = identifiant d'entreprise).</p>
 *
 * <ul>
 *   <li>Lecture : soit l'entreprise est fournie explicitement via
 *       {@code ?entreprise=CODE} (page de connexion, avant authentification),
 *       soit elle est deduite de l'entreprise du compte connecte
 *       ({@link TenantContext}). Sans entreprise, on renvoie {@code null} :
 *       l'application reprend ses couleurs/logo par defaut (cas SUPER_ADMIN).</li>
 *   <li>Ecriture : strictement limitee a l'entreprise du compte connecte. Un
 *       compte sans entreprise (SUPER_ADMIN) est refuse (403).</li>
 * </ul>
 *
 * <p>Les libelles de navigation restent GLOBAUX (stockage memoire) : hors
 * perimetre de l'etape 8.</p>
 */
@RestController
@RequestMapping("/api/configuration")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class ConfigurationController {

    @Autowired
    private NavigationLabelAuditService auditService;

    @Autowired
    private EntrepriseRepository entrepriseRepository;

    @Autowired
    private EntrepriseBrandingRepository brandingRepository;

    // Libelles de navigation : stockage en mémoire (global, hors perimetre etape 8).
    private final Map<String, Object> configStorage = new ConcurrentHashMap<>();

    private static final String NAVIGATION_LABELS_KEY = "navigation_labels";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @GetMapping("/navigation-labels")
    public ResponseEntity<Map<String, Object>> getNavigationLabels() {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> labels = (List<Map<String, Object>>) configStorage.getOrDefault(NAVIGATION_LABELS_KEY, new ArrayList<>());
        Map<String, Object> response = new HashMap<>();
        response.put("labels", labels);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/navigation-labels")
    public ResponseEntity<Void> saveNavigationLabels(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> labels = (List<Map<String, Object>>) request.get("labels");
        if (labels != null) {
            configStorage.put(NAVIGATION_LABELS_KEY, labels);
        }
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/navigation-labels")
    public ResponseEntity<Void> resetNavigationLabels() {
        configStorage.remove(NAVIGATION_LABELS_KEY);
        return ResponseEntity.ok().build();
    }

    // ===== LOGO DE L'APPLICATION (par entreprise) =====

    @GetMapping("/logo")
    public ResponseEntity<Map<String, Object>> getLogo(
            @RequestParam(name = "entreprise", required = false) String entreprise) {
        Long entrepriseId = resolveReadEntrepriseId(entreprise);
        Map<String, Object> response = new HashMap<>();
        response.put("logo", readLogoData(entrepriseId));
        response.put("settings", readLogoSettings(entrepriseId));
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logo")
    public ResponseEntity<Void> saveLogo(@RequestBody Map<String, Object> request) {
        Long entrepriseId = currentTenantId();
        if (entrepriseId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        EntrepriseBrandingEntity branding = getOrCreate(entrepriseId);
        if (request.containsKey("logo")) {
            Object logo = request.get("logo");
            String value = (logo == null || String.valueOf(logo).isEmpty()) ? null : String.valueOf(logo);
            branding.setLogoData(value);
        }
        if (request.get("settings") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> settings = new HashMap<>((Map<String, Object>) request.get("settings"));
            branding.setLogoSettingsJson(writeJson(settings));
        }
        branding.setUpdatedAt(LocalDateTime.now());
        brandingRepository.save(branding);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/logo")
    public ResponseEntity<Void> deleteLogo() {
        Long entrepriseId = currentTenantId();
        if (entrepriseId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        brandingRepository.findById(entrepriseId).ifPresent(branding -> {
            branding.setLogoData(null);
            branding.setUpdatedAt(LocalDateTime.now());
            brandingRepository.save(branding);
        });
        return ResponseEntity.ok().build();
    }

    // ===== DESIGN / THEME DE L'APPLICATION (par entreprise) =====

    @GetMapping("/theme")
    public ResponseEntity<Map<String, Object>> getTheme(
            @RequestParam(name = "entreprise", required = false) String entreprise) {
        Long entrepriseId = resolveReadEntrepriseId(entreprise);
        Map<String, Object> response = new HashMap<>();
        response.put("theme", readThemeData(entrepriseId));
        return ResponseEntity.ok(response);
    }

    @PostMapping("/theme")
    public ResponseEntity<Void> saveTheme(@RequestBody Map<String, Object> request) {
        Long entrepriseId = currentTenantId();
        if (entrepriseId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Object theme = request.get("theme");
        if (!(theme instanceof Map)) {
            return ResponseEntity.badRequest().build();
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> value = new HashMap<>((Map<String, Object>) theme);
        EntrepriseBrandingEntity branding = getOrCreate(entrepriseId);
        branding.setThemeJson(writeJson(value));
        branding.setUpdatedAt(LocalDateTime.now());
        brandingRepository.save(branding);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/theme")
    public ResponseEntity<Void> deleteTheme() {
        Long entrepriseId = currentTenantId();
        if (entrepriseId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        brandingRepository.findById(entrepriseId).ifPresent(branding -> {
            branding.setThemeJson(null);
            branding.setUpdatedAt(LocalDateTime.now());
            brandingRepository.save(branding);
        });
        return ResponseEntity.ok().build();
    }

    // ===== HELPERS =====

    /**
     * Entreprise cible d'une LECTURE : le code explicite (sous-domaine /
     * {@code ?entreprise=CODE}) prime, sinon l'entreprise du compte connecte.
     * Renvoie {@code null} si aucune entreprise (SUPER_ADMIN / anonyme) : le
     * frontend reprend alors les valeurs par defaut.
     */
    private Long resolveReadEntrepriseId(String entrepriseCode) {
        if (entrepriseCode != null && !entrepriseCode.isBlank()) {
            // Collation MySQL insensible a la casse/accents : findByCode("intouch")
            // retrouve "INTOUCH". On n'expose la marque que des entreprises ACTIVES.
            return entrepriseRepository.findByCode(entrepriseCode.trim())
                .filter(e -> e.getStatut() == EntrepriseStatut.ACTIVE)
                .map(EntrepriseEntity::getId)
                .orElse(null);
        }
        return currentTenantId();
    }

    /** Entreprise du compte connecte, ou {@code null} (anonyme / SUPER_ADMIN). */
    private Long currentTenantId() {
        Long tenant = TenantContext.get();
        if (tenant == null || TenantContext.NO_TENANT.equals(tenant)) {
            return null;
        }
        return tenant;
    }

    private EntrepriseBrandingEntity getOrCreate(Long entrepriseId) {
        return brandingRepository.findById(entrepriseId).orElseGet(() -> {
            EntrepriseBrandingEntity branding = new EntrepriseBrandingEntity();
            branding.setEntrepriseId(entrepriseId);
            return branding;
        });
    }

    private Object readThemeData(Long entrepriseId) {
        if (entrepriseId == null) {
            return null;
        }
        return brandingRepository.findById(entrepriseId)
            .map(EntrepriseBrandingEntity::getThemeJson)
            .map(this::readJsonMap)
            .orElse(null);
    }

    private Object readLogoData(Long entrepriseId) {
        if (entrepriseId == null) {
            return null;
        }
        return brandingRepository.findById(entrepriseId)
            .map(EntrepriseBrandingEntity::getLogoData)
            .filter(value -> value != null && !value.isEmpty())
            .orElse(null);
    }

    private Object readLogoSettings(Long entrepriseId) {
        if (entrepriseId == null) {
            return null;
        }
        return brandingRepository.findById(entrepriseId)
            .map(EntrepriseBrandingEntity::getLogoSettingsJson)
            .map(this::readJsonMap)
            .orElse(null);
    }

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception ignored) {
            return null;
        }
    }

    private String writeJson(Object value) {
        try {
            return OBJECT_MAPPER.writeValueAsString(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    // ===== AUDIT / HISTORIQUE =====

    @GetMapping("/navigation-labels/history")
    public ResponseEntity<List<NavigationLabelAuditEntity>> getAllHistory() {
        return ResponseEntity.ok(auditService.getAllHistory());
    }

    @GetMapping("/navigation-labels/history/{labelId}")
    public ResponseEntity<List<NavigationLabelAuditEntity>> getHistoryForLabel(@PathVariable String labelId) {
        return ResponseEntity.ok(auditService.getHistoryForLabel(labelId));
    }

    @GetMapping("/navigation-labels/history/group/{groupKey}")
    public ResponseEntity<List<NavigationLabelAuditEntity>> getHistoryForGroup(@PathVariable String groupKey) {
        return ResponseEntity.ok(auditService.getHistoryForGroup(groupKey));
    }

    @PostMapping("/navigation-labels/restore/{labelId}/{version}")
    public ResponseEntity<Void> restoreVersion(@PathVariable String labelId, @PathVariable int version) {
        // Récupérer l'historique pour ce label
        List<NavigationLabelAuditEntity> history = auditService.getHistoryForLabel(labelId);
        if (version >= 0 && version < history.size()) {
            NavigationLabelAuditEntity target = history.get(version);
            // Restaurer l'ancien label
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> labels = (List<Map<String, Object>>) configStorage.getOrDefault(NAVIGATION_LABELS_KEY, new ArrayList<>());
            for (Map<String, Object> label : labels) {
                if (labelId.equals(label.get("id"))) {
                    label.put("label", target.getOldLabel());
                    break;
                }
            }
            configStorage.put(NAVIGATION_LABELS_KEY, labels);

            // Logger la restauration
            auditService.logChange(labelId, target.getLabelType(), target.getGroupKey(),
                target.getSubmenuKey(), target.getNestedKey(),
                target.getNewLabel(), target.getOldLabel(),
                "system", "RESTORE", "Restauration version " + version);
        }
        return ResponseEntity.ok().build();
    }
}
