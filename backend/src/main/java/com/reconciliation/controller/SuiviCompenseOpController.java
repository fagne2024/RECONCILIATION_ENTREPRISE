package com.reconciliation.controller;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.repository.SuiviCompenseOpRepository;
import com.reconciliation.service.SuiviCompenseOpImportService;
import com.reconciliation.service.SuiviCompenseOpSaveService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/banque/suivi-compense-op")
public class SuiviCompenseOpController {

    @Autowired
    private SuiviCompenseOpRepository repository;
    @Autowired
    private SuiviCompenseOpImportService importService;
    @Autowired
    private SuiviCompenseOpSaveService saveService;

    @GetMapping
    public List<SuiviCompenseOpEntity> list() {
        return repository.findAllByOrderByDateOperationDescIdDesc();
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) {
        try {
            List<SuiviCompenseOpEntity> rows = importService.parse(file);
            // Doublons : clé métier déjà en base, ou répétée dans le même fichier
            SuiviCompenseOpSaveService.SaveResult result = saveService.saveWithoutDuplicates(rows, file.getOriginalFilename());
            return ResponseEntity.ok(Map.of(
                    "totalRead", result.totalRead(),
                    "saved", result.saved(),
                    "duplicatesIgnored", result.duplicatesIgnored()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Import impossible"));
        }
    }

    /** Saisie manuelle d'une ligne ; typeReference : COMPENSE (défaut), APPRO ou CROSS_BORDER. */
    public record CreateSuiviCompenseRequest(
            java.time.LocalDate dateOperation, String codeAgence, String banque, String compteBancaire,
            Double montant, String modePaiement, String idTicket, String service, String reseau,
            String typeReference) {}

    /**
     * Ajout manuel d'une ligne. La référence est toujours générée côté serveur :
     * CODE_AGENCE (ou service)-jjmmaa + CP/AP/CB + numéro du jour (ex. GRACE-061126CP1).
     */
    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateSuiviCompenseRequest req) {
        if (req == null || req.dateOperation() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "La date est obligatoire."));
        }
        if (req.montant() == null || req.montant() == 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le montant est obligatoire."));
        }
        SuiviCompenseOpEntity e = new SuiviCompenseOpEntity();
        e.setDateOperation(req.dateOperation());
        e.setCodeAgence(trimToNull(req.codeAgence()));
        e.setBanque(trimToNull(req.banque()));
        e.setCompteBancaire(trimToNull(req.compteBancaire()));
        e.setMontant(req.montant());
        e.setModePaiement(trimToNull(req.modePaiement()));
        e.setIdTicket(trimToNull(req.idTicket()));
        e.setService(trimToNull(req.service()));
        e.setReseau(trimToNull(req.reseau()));
        String code = SuiviCompenseOpImportService.agenceOuService(e);
        if (code == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le code agence ou le service est obligatoire."));
        }
        String prefix = SuiviCompenseOpImportService.referencePrefix(code, e.getDateOperation(), req.typeReference());
        List<String> existing = repository.findByReferenceStartingWith(prefix).stream()
                .map(SuiviCompenseOpEntity::getReference).toList();
        String reference = SuiviCompenseOpImportService.nextReference(code, e.getDateOperation(), req.typeReference(), existing);
        e.setReference(reference);
        e.setDedupKey(com.reconciliation.util.BankingDedupKey.of("REF", reference));
        if (!repository.findByDedupKeyIn(List.of(e.getDedupKey())).isEmpty()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "La référence " + reference + " existe déjà, réessayez."));
        }
        e.setSourceFilename("Saisie manuelle");
        e.setUploadedAt(LocalDateTime.now());
        return ResponseEntity.status(HttpStatus.CREATED).body(repository.save(e));
    }

    /** Modification d'une ligne (date, agence/service, banque, montant…, référence). */
    public record UpdateSuiviCompenseRequest(
            java.time.LocalDate dateOperation, String codeAgence, String banque, String compteBancaire,
            Double montant, String modePaiement, String reference, String idTicket, String service, String reseau) {}

    /**
     * Modifie une ligne du suivi (ex. date restée vide à l'import). La référence est modifiable mais doit
     * rester unique ; vide, l'ancienne est conservée. La clé de doublon est recalculée.
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody UpdateSuiviCompenseRequest req) {
        var opt = repository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        if (req == null || req.dateOperation() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "La date est obligatoire."));
        }
        if (req.montant() == null || req.montant() == 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le montant est obligatoire."));
        }
        SuiviCompenseOpEntity e = opt.get();
        e.setDateOperation(req.dateOperation());
        e.setCodeAgence(trimToNull(req.codeAgence()));
        e.setBanque(trimToNull(req.banque()));
        e.setCompteBancaire(trimToNull(req.compteBancaire()));
        e.setMontant(req.montant());
        e.setModePaiement(trimToNull(req.modePaiement()));
        e.setIdTicket(trimToNull(req.idTicket()));
        e.setService(trimToNull(req.service()));
        e.setReseau(trimToNull(req.reseau()));
        if (SuiviCompenseOpImportService.agenceOuService(e) == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le code agence ou le service est obligatoire."));
        }
        String reference = trimToNull(req.reference());
        if (reference != null) {
            String norm = com.reconciliation.util.BankingDedupKey.normalizeText(reference);
            boolean pris = repository.findByReferenceIn(List.of(reference)).stream()
                    .anyMatch(o -> !o.getId().equals(id)
                            && norm.equals(com.reconciliation.util.BankingDedupKey.normalizeText(o.getReference())));
            if (pris) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "La référence " + reference + " existe déjà sur une autre ligne."));
            }
            e.setReference(reference);
        }
        e.setDedupKey(SuiviCompenseOpSaveService.dedupKey(e));
        boolean doublon = repository.findByDedupKeyIn(List.of(e.getDedupKey())).stream()
                .anyMatch(o -> !o.getId().equals(id));
        if (doublon) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Une autre ligne identique existe déjà dans le suivi."));
        }
        return ResponseEntity.ok(repository.save(e));
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    @GetMapping(value = "/template", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    public ResponseEntity<byte[]> template() {
        try {
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=modele-suivi-compense-op.xlsx")
                    .body(importService.generateTemplate());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!repository.existsById(id)) return ResponseEntity.notFound().build();
        repository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
