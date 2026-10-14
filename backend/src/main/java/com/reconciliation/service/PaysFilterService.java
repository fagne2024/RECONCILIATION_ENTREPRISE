package com.reconciliation.service;

import com.reconciliation.entity.ProfilPaysEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.ProfilPaysRepository;
import com.reconciliation.repository.PaysRepository;
import com.reconciliation.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class PaysFilterService {

    private static final Logger log = LoggerFactory.getLogger(PaysFilterService.class);

    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private ProfilPaysRepository profilPaysRepository;
    
    @Autowired
    private PaysRepository paysRepository;

    @Autowired
    private PermissionCheckService permissionCheckService;
    
    /**
     * Récupère les codes de pays autorisés pour un utilisateur
     * Retourne une liste vide si l'utilisateur n'a aucun pays autorisé
     * Retourne null si l'utilisateur a accès à GNL (tous les pays)
     */
    public List<String> getAllowedPaysCodes(String username) {
        try {
            if (username == null || username.isEmpty()) {
                log.debug("PaysFilter: username vide");
                return new ArrayList<>();
            }

            if ("admin".equalsIgnoreCase(username)) {
                log.debug("PaysFilter: admin, tous les pays");
                return null;
            }

            UserEntity user = userRepository.findByUsername(username).orElse(null);
            if (user == null) {
                log.debug("PaysFilter: utilisateur inconnu {}", username);
                return new ArrayList<>();
            }

            if (user.getProfil() != null && user.getProfil().getNom() != null) {
                String profilNom = user.getProfil().getNom().toUpperCase();
                if (profilNom.equals("ADMIN") || profilNom.equals("ADMINISTRATEUR")) {
                    log.debug("PaysFilter: profil admin pour {}", username);
                    return null;
                }
            }

            if (hasGlobalAccessForControleInterneModule(username)) {
                log.debug("PaysFilter: contrôle interne BO vs Partenaire, tous les pays pour {}", username);
                return null;
            }

            if (user.getProfil() == null || user.getProfil().getId() == null) {
                log.debug("PaysFilter: sans profil {}", username);
                return new ArrayList<>();
            }

            Long profilId = user.getProfil().getId();
            List<ProfilPaysEntity> profilPays = profilPaysRepository.findByProfilId(profilId);

            if (profilPays == null || profilPays.isEmpty()) {
                log.debug("PaysFilter: aucun pays pour profil {}", profilId);
                return new ArrayList<>();
            }

            boolean hasGNL = profilPays.stream()
                .anyMatch(pp -> pp != null && pp.getPays() != null && "GNL".equals(pp.getPays().getCode()));

            if (hasGNL) {
                log.debug("PaysFilter: GNL pour {}", username);
                return null;
            }

            List<String> paysCodes = profilPays.stream()
                .filter(pp -> pp != null && pp.getPays() != null && pp.getPays().getCode() != null)
                .map(pp -> pp.getPays().getCode())
                .collect(Collectors.toList());

            log.debug("PaysFilter: {} -> {}", username, paysCodes);
            return paysCodes;
        } catch (Exception e) {
            log.error("PaysFilter erreur pour {}: {}", username, e.getMessage());
            // En cas d'erreur, retourner une liste vide pour sécurité
            return new ArrayList<>();
        }
    }
    
    /**
     * Vérifie si un utilisateur peut accéder à un pays spécifique
     */
    public boolean canAccessPays(String username, String paysCode) {
        List<String> allowedPays = getAllowedPaysCodes(username);
        
        // null signifie tous les pays (GNL)
        if (allowedPays == null) {
            return true;
        }
        
        // Liste vide signifie aucun accès
        if (allowedPays.isEmpty()) {
            return false;
        }
        
        return allowedPays.contains(paysCode);
    }
    
    /**
     * Récupère les noms de pays autorisés (pour l'affichage)
     */
    public List<String> getAllowedPaysNames(String username) {
        List<String> codes = getAllowedPaysCodes(username);
        
        if (codes == null) {
            return List.of("GNL - Tous les pays");
        }
        
        if (codes.isEmpty()) {
            return new ArrayList<>();
        }
        
        return codes.stream()
            .map(code -> paysRepository.findByCode(code))
            .filter(opt -> opt.isPresent())
            .map(opt -> opt.get().getNom())
            .collect(Collectors.toList());
    }

    /**
     * Écran contrôle interne BO vs Partenaire : accès à tous les pays du rapport
     * (le cloisonnement profil ne s'applique pas sur ce sous-menu).
     */
    private boolean hasGlobalAccessForControleInterneModule(String username) {
        String moduleHeader = com.reconciliation.util.RequestContextUtil.getPermissionModuleFromRequest();
        if (moduleHeader == null || moduleHeader.isBlank()) {
            return false;
        }
        String normalized = moduleHeader
            .trim()
            .toLowerCase()
            .replace('·', ' ')
            .replaceAll("\\s+", " ");
        if (!normalized.contains("controle interne bo vs partenaire")) {
            return false;
        }
        return permissionCheckService.hasSubmenuActionPermission(
            username,
            moduleHeader.trim(),
            "consulter"
        ) || permissionCheckService.canValidateBoPartenaireControleInterne(username);
    }
}

