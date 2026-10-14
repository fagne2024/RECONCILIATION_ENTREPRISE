package com.reconciliation.controller;

import com.reconciliation.service.UserProfilService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/user-profil")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class UserProfilController {
    
    @Autowired
    private UserProfilService userProfilService;
    
    /**
     * Associe automatiquement des profils par défaut à tous les utilisateurs
     */
    @PostMapping("/associate-default")
    public ResponseEntity<Map<String, Object>> associateDefaultProfils() {
        try {
            userProfilService.associateDefaultProfilsToUsers();
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Profils associés avec succès aux utilisateurs");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", "Erreur lors de l'association des profils: " + e.getMessage());
            
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Associe un profil spécifique à un utilisateur
     */
    @PostMapping("/associate")
    public ResponseEntity<Map<String, Object>> associateProfilToUser(
            @RequestParam String username, 
            @RequestParam String profilName) {
        try {
            boolean success = userProfilService.associateProfilToUser(username, profilName);
            
            Map<String, Object> response = new HashMap<>();
            if (success) {
                response.put("success", true);
                response.put("message", "Profil '" + profilName + "' associé à l'utilisateur '" + username + "'");
            } else {
                response.put("success", false);
                response.put("error", "Impossible d'associer le profil à l'utilisateur");
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", "Erreur lors de l'association: " + e.getMessage());
            
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Vérifie si tous les utilisateurs ont un profil associé
     */
    @GetMapping("/check")
    public ResponseEntity<Map<String, Object>> checkUserProfils() {
        try {
            boolean allHaveProfil = userProfilService.checkAllUsersHaveProfil();
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("allUsersHaveProfil", allHaveProfil);
            response.put("message", allHaveProfil ? 
                "Tous les utilisateurs ont un profil associé" : 
                "Certains utilisateurs n'ont pas de profil associé");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", "Erreur lors de la vérification: " + e.getMessage());
            
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Affiche le statut des associations utilisateur-profil
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getUserProfilStatus() {
        try {
            userProfilService.displayUserProfilStatus();
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Statut affiché dans les logs du serveur");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", "Erreur lors de l'affichage du statut: " + e.getMessage());
            
            return ResponseEntity.badRequest().body(response);
        }
    }
} 