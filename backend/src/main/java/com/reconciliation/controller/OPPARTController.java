package com.reconciliation.controller;

import com.reconciliation.dto.OPPARTVerificationRequest;
import com.reconciliation.dto.OPPARTVerificationResultDto;
import com.reconciliation.entity.OPPARTEntity;
import com.reconciliation.service.OPPARTService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/oppart")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class OPPARTController {

    @Autowired
    private OPPARTService oppartService;

    /**
     * Récupérer toutes les lignes OPPART avec filtres optionnels.
     */
    @GetMapping
    public ResponseEntity<List<OPPARTEntity>> getOPPARTs(
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String typeOp,
            @RequestParam(required = false) String typeOpContains,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String token,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin) {
        try {
            List<OPPARTEntity> opparts = oppartService.getOPPARTs(client, typeOp, typeOpContains, pays, source, statut, token, dateDebut, dateFin);
            return ResponseEntity.ok(opparts);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Récupérer une ligne OPPART par ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<OPPARTEntity> getOPPART(@PathVariable Long id) {
        try {
            OPPARTEntity oppart = oppartService.getOPPART(id);
            if (oppart != null) {
                return ResponseEntity.ok(oppart);
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Créer une ligne OPPART.
     */
    @PostMapping
    public ResponseEntity<OPPARTEntity> createOPPART(@RequestBody OPPARTEntity oppart) {
        try {
            OPPARTEntity created = oppartService.createOPPART(oppart);
            return ResponseEntity.ok(created);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Créer plusieurs lignes OPPART en une requête (évite 429 Too Many Requests).
     */
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> createOPPARTBatch(@RequestBody List<OPPARTEntity> opparts) {
        try {
            Map<String, Object> result = oppartService.createOPPARTBatch(opparts);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Mettre à jour une ligne OPPART.
     */
    @PutMapping("/{id}")
    public ResponseEntity<OPPARTEntity> updateOPPART(@PathVariable Long id, @RequestBody OPPARTEntity oppart) {
        try {
            oppart.setId(id);
            OPPARTEntity updated = oppartService.updateOPPART(oppart);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Supprimer une ligne OPPART.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOPPART(@PathVariable Long id) {
        try {
            boolean deleted = oppartService.deleteOPPART(id);
            if (deleted) {
                return ResponseEntity.ok().build();
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Supprimer plusieurs lignes OPPART.
     */
    @PostMapping("/delete-batch")
    public ResponseEntity<Map<String, Object>> deleteOPPARTs(@RequestBody Map<String, List<Long>> request) {
        try {
            List<Long> ids = request.get("ids");
            Map<String, Object> result = oppartService.deleteOPPARTs(ids);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Récupérer les options de filtres distinctes.
     */
    @GetMapping("/filter-options")
    public ResponseEntity<Map<String, List<String>>> getFilterOptions() {
        try {
            Map<String, List<String>> options = oppartService.getFilterOptions();
            return ResponseEntity.ok(options);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Vérifier un lot de lignes concernées : retrouve la ligne OPPART correspondante
     * et son statut, par N° trans GU ou à défaut par montant + date + client.
     */
    @PostMapping("/verification-lignes")
    public ResponseEntity<List<OPPARTVerificationResultDto>> verificationLignes(
            @RequestBody OPPARTVerificationRequest request) {
        try {
            return ResponseEntity.ok(oppartService.verifierLignes(request != null ? request.getLignes() : null));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Analyser un fichier OPPART sans l'enregistrer : résumé + aperçu pour validation.
     */
    @PostMapping(value = "/validate", consumes = "multipart/form-data")
    public ResponseEntity<Map<String, Object>> validateFile(@RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(oppartService.validateFile(file));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Importer un fichier OPPART. Les lignes invalides et les doublons sont ignorés.
     */
    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    public ResponseEntity<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(oppartService.uploadFile(file));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Télécharger le modèle XLSX d'import OPPART.
     */
    @GetMapping(value = "/template", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    public ResponseEntity<byte[]> downloadTemplate() {
        try {
            byte[] bytes = oppartService.generateTemplate();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=modele-oppart.xlsx")
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Changer le statut d'une ligne (EN_COURS / OK).
     */
    @PutMapping("/{id}/statut")
    public ResponseEntity<OPPARTEntity> updateStatut(@PathVariable Long id, @RequestBody Map<String, String> request) {
        try {
            OPPARTEntity updated = oppartService.updateStatut(id, request != null ? request.get("statut") : null);
            if (updated != null) {
                return ResponseEntity.ok(updated);
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Lier 2 lignes ou un groupe de lignes (agregation : somme de N lignes = 1 ligne)
     * via un token commun généré côté backend (statut des lignes -> OK).
     * Body accepté : { "id1": 1, "id2": 2 } ou { "ids": [1, 2, 3, 4] }.
     */
    @PostMapping("/link")
    public ResponseEntity<Map<String, Object>> linkOpparts(@RequestBody Map<String, Object> request) {
        try {
            List<Long> ids = resolveLinkIds(request);
            Object tokenValue = request != null ? request.get("token") : null;
            String token = tokenValue != null ? String.valueOf(tokenValue) : null;

            if (ids.size() < 2) {
                return ResponseEntity.badRequest()
                        .body(Map.of("success", false, "message", "Il faut au moins 2 identifiants distincts pour lier des lignes."));
            }

            List<OPPARTEntity> linked = oppartService.linkOpparts(ids, token);
            if (linked == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("success", false, "message", "Liaison impossible : ids invalides ou ligne(s) introuvable(s)."));
            }
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "token", linked.get(0).getToken() != null ? linked.get(0).getToken() : "",
                    "linkedIds", linked.stream().map(OPPARTEntity::getId).toList(),
                    "opparts", linked));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Accepte soit {ids: [...]}, soit {id1, id2}. */
    private static List<Long> resolveLinkIds(Map<String, Object> request) {
        List<Long> ids = new ArrayList<>();
        if (request == null) {
            return ids;
        }
        Object rawIds = request.get("ids");
        if (rawIds instanceof List<?> list) {
            for (Object o : list) {
                Long id = toLong(o);
                if (id != null && !ids.contains(id)) {
                    ids.add(id);
                }
            }
        }
        for (String key : List.of("id1", "id2")) {
            Long id = toLong(request.get(key));
            if (id != null && !ids.contains(id)) {
                ids.add(id);
            }
        }
        return ids;
    }

    /**
     * Délier une ligne : token supprimé et statut remis à EN_COURS (ligne jumelle comprise).
     */
    @PostMapping("/{id}/unlink")
    public ResponseEntity<OPPARTEntity> unlinkOppart(@PathVariable Long id) {
        try {
            OPPARTEntity updated = oppartService.unlinkOppart(id);
            if (updated != null) {
                return ResponseEntity.ok(updated);
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Lier les lignes de compense par N° Trans GU.
     * Pour chaque N° Trans GU fourni, retrouve la ligne BO (COMPENSE_BO) et la ligne Partenaire (COMPENSE_PART / *PARTNER)
     * et les lie via un token commun (statut -> OK).
     * Body : { "transGus": ["TRX001", "TRX002", ...] }
     */
    @PostMapping("/link-compenses")
    public ResponseEntity<Map<String, Object>> linkCompensesByTransGu(@RequestBody Map<String, Object> request) {
        try {
            List<String> transGus = extractTransGus(request);
            if (transGus == null || transGus.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("success", false, "message", "Aucun N° Trans GU fourni."));
            }

            Map<String, Object> result = oppartService.linkCompensesByTransGu(transGus);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    private static List<String> extractTransGus(Map<String, Object> request) {
        if (request == null) {
            return List.of();
        }
        Object raw = request.get("transGus");
        if (raw instanceof List<?> list) {
            List<String> transGus = new ArrayList<>();
            for (Object o : list) {
                if (o != null) {
                    String s = String.valueOf(o).trim();
                    if (!s.isEmpty()) {
                        transGus.add(s);
                    }
                }
            }
            return transGus;
        }
        return List.of();
    }

    private static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}