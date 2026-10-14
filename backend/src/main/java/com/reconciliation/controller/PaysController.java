package com.reconciliation.controller;

import com.reconciliation.entity.PaysEntity;
import com.reconciliation.entity.ProfilPaysEntity;
import com.reconciliation.service.PaysService;
import com.reconciliation.service.PaysFilterService;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pays")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class PaysController {
    
    @Autowired
    private PaysService paysService;
    
    @Autowired
    private PaysFilterService paysFilterService;
    
    // CRUD Pays
    @GetMapping
    public List<PaysEntity> getAllPays() {
        return paysService.getAllPays();
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<PaysEntity> getPaysById(@PathVariable Long id) {
        return paysService.getPaysById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
    
    @PostMapping
    public PaysEntity createPays(@RequestBody PaysEntity pays) {
        return paysService.createPays(pays);
    }
    
    @PutMapping("/{id}")
    public PaysEntity updatePays(@PathVariable Long id, @RequestBody PaysEntity pays) {
        return paysService.updatePays(id, pays);
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePays(@PathVariable Long id) {
        paysService.deletePays(id);
        return ResponseEntity.noContent().build();
    }
    
    // Gestion des associations Profil-Pays
    @GetMapping("/profil/{profilId}")
    public List<ProfilPaysEntity> getPaysForProfil(@PathVariable Long profilId) {
        return paysService.getPaysForProfil(profilId);
    }
    
    @PostMapping("/profil/{profilId}/associate/{paysId}")
    public ResponseEntity<ProfilPaysEntity> associatePaysToProfil(
            @PathVariable Long profilId, 
            @PathVariable Long paysId) {
        try {
            ProfilPaysEntity result = paysService.associatePaysToProfil(profilId, paysId);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }
    
    @DeleteMapping("/profil/{profilId}/disassociate/{paysId}")
    public ResponseEntity<Void> disassociatePaysFromProfil(
            @PathVariable Long profilId, 
            @PathVariable Long paysId) {
        paysService.disassociatePaysFromProfil(profilId, paysId);
        return ResponseEntity.noContent().build();
    }
    
    @PutMapping("/profil/{profilId}/set-pays")
    public ResponseEntity<Map<String, String>> setPaysForProfil(
            @PathVariable Long profilId,
            @RequestBody List<Long> paysIds) {
        System.out.println("📥 PUT /api/pays/profil/" + profilId + "/set-pays");
        System.out.println("📦 Données reçues: " + paysIds);
        
        try {
            paysService.setPaysForProfil(profilId, paysIds);
            System.out.println("✅ Pays associés avec succès au profil " + profilId);
            return ResponseEntity.ok(Map.of("message", "Pays associés avec succès"));
        } catch (RuntimeException e) {
            System.err.println("❌ Erreur lors de l'association des pays: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> errorResponse = Map.of("error", e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            System.err.println("❌ Erreur inattendue: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> errorResponse = Map.of("error", "Erreur lors de l'association des pays: " + e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        }
    }
    
    @GetMapping("/profil/{profilId}/has-access/{paysCode}")
    public ResponseEntity<Map<String, Boolean>> hasAccessToPays(
            @PathVariable Long profilId,
            @PathVariable String paysCode) {
        boolean hasAccess = paysService.hasAccessToPays(profilId, paysCode);
        return ResponseEntity.ok(Map.of("hasAccess", hasAccess));
    }
    
    /**
     * Récupère les codes de pays autorisés pour l'utilisateur connecté
     * Retourne null si l'utilisateur a accès à GNL (tous les pays)
     * Retourne une liste vide si l'utilisateur n'a aucun pays autorisé
     */
    @GetMapping("/user/allowed-codes")
    public ResponseEntity<Map<String, Object>> getAllowedPaysCodesForCurrentUser() {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> allowedCodes = paysFilterService.getAllowedPaysCodes(username);

        Map<String, Object> response = new java.util.HashMap<>();
        if (allowedCodes == null) {
            response.put("isGlobal", true);
            response.put("codes", null);
            response.put("names", null);
        } else {
            response.put("isGlobal", false);
            response.put("codes", allowedCodes);
            response.put("names", paysFilterService.getAllowedPaysNames(username));
        }

        return ResponseEntity.ok(response);
    }
}

