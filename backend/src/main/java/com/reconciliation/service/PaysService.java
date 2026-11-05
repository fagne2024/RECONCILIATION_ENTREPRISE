package com.reconciliation.service;

import com.reconciliation.entity.PaysEntity;
import com.reconciliation.entity.ProfilEntity;
import com.reconciliation.entity.ProfilPaysEntity;
import com.reconciliation.exception.DuplicateResourceException;
import com.reconciliation.repository.PaysRepository;
import com.reconciliation.repository.ProfilPaysRepository;
import com.reconciliation.repository.ProfilRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class PaysService {

    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-Z0-9_-]{2,10}$");
    
    @Autowired
    private PaysRepository paysRepository;
    
    @Autowired
    private ProfilPaysRepository profilPaysRepository;
    
    @Autowired
    private ProfilRepository profilRepository;
    
    // CRUD pour Pays
    public List<PaysEntity> getAllPays() {
        return paysRepository.findAll();
    }
    
    public Optional<PaysEntity> getPaysById(Long id) {
        return paysRepository.findById(id);
    }
    
    public PaysEntity createPays(PaysEntity pays) {
        if (pays == null) {
            throw new IllegalArgumentException("Le pays est requis.");
        }
        String code = pays.getCode() == null ? "" : pays.getCode().trim().toUpperCase(Locale.ROOT);
        String nom = pays.getNom() == null ? "" : pays.getNom().trim();
        if (!CODE_PATTERN.matcher(code).matches()) {
            throw new IllegalArgumentException(
                "Code pays invalide : 2 à 10 caractères (lettres, chiffres, '_' ou '-').");
        }
        if (nom.isEmpty() || nom.length() > 100) {
            throw new IllegalArgumentException("Le nom du pays est requis (100 caractères maximum).");
        }
        if (paysRepository.findByCode(code).isPresent()) {
            throw new DuplicateResourceException("Le pays " + code + " existe déjà.");
        }
        return paysRepository.save(new PaysEntity(code, nom));
    }
    
    public PaysEntity updatePays(Long id, PaysEntity pays) {
        Optional<PaysEntity> existing = paysRepository.findById(id);
        if (existing.isPresent()) {
            PaysEntity paysEntity = existing.get();
            paysEntity.setCode(pays.getCode());
            paysEntity.setNom(pays.getNom());
            return paysRepository.save(paysEntity);
        }
        throw new RuntimeException("Pays non trouvé avec l'ID: " + id);
    }
    
    public void deletePays(Long id) {
        paysRepository.deleteById(id);
    }
    
    // Gestion des associations Profil-Pays
    @Transactional
    public ProfilPaysEntity associatePaysToProfil(Long profilId, Long paysId) {
        Optional<ProfilEntity> profilOpt = profilRepository.findById(profilId);
        Optional<PaysEntity> paysOpt = paysRepository.findById(paysId);
        
        if (profilOpt.isEmpty() || paysOpt.isEmpty()) {
            throw new RuntimeException("Profil ou Pays non trouvé");
        }
        
        // Vérifier si l'association existe déjà
        if (profilPaysRepository.existsByProfilIdAndPaysId(profilId, paysId)) {
            throw new RuntimeException("Cette association existe déjà");
        }
        
        ProfilPaysEntity profilPays = new ProfilPaysEntity(profilOpt.get(), paysOpt.get());
        return profilPaysRepository.save(profilPays);
    }
    
    @Transactional
    public void disassociatePaysFromProfil(Long profilId, Long paysId) {
        profilPaysRepository.deleteByProfilIdAndPaysId(profilId, paysId);
    }
    
    public List<ProfilPaysEntity> getPaysForProfil(Long profilId) {
        return profilPaysRepository.findByProfilId(profilId);
    }
    
    public List<ProfilPaysEntity> getProfilsForPays(Long paysId) {
        return profilPaysRepository.findByPaysId(paysId);
    }
    
    @Transactional
    public void setPaysForProfil(Long profilId, List<Long> paysIds) {
        System.out.println("🔄 setPaysForProfil appelé pour profilId: " + profilId + ", paysIds: " + paysIds);
        
        // Vérifier que le profil existe
        Optional<ProfilEntity> profilOpt = profilRepository.findById(profilId);
        if (profilOpt.isEmpty()) {
            System.err.println("❌ Profil non trouvé avec l'ID: " + profilId);
            throw new RuntimeException("Profil non trouvé avec l'ID: " + profilId);
        }
        
        ProfilEntity profil = profilOpt.get();
        System.out.println("✅ Profil trouvé: " + profil.getNom());
        
        // Supprimer toutes les associations existantes
        profilPaysRepository.deleteByProfilId(profilId);
        profilPaysRepository.flush(); // S'assurer que les suppressions sont commitées avant d'ajouter
        System.out.println("🗑️ Anciennes associations supprimées");
        
        // Si la liste est vide, on arrête ici (profil sans pays)
        if (paysIds == null || paysIds.isEmpty()) {
            System.out.println("ℹ️ Aucun pays à associer, profil mis à jour sans pays");
            return;
        }
        
        // Vérifier que tous les pays existent avant de commencer
        List<Long> invalidPaysIds = new ArrayList<>();
        for (Long paysId : paysIds) {
            if (paysId == null) {
                invalidPaysIds.add(null);
                continue;
            }
            if (!paysRepository.existsById(paysId)) {
                invalidPaysIds.add(paysId);
            }
        }
        
        if (!invalidPaysIds.isEmpty()) {
            System.err.println("❌ Pays non trouvés avec les IDs: " + invalidPaysIds);
            throw new RuntimeException("Un ou plusieurs pays n'existent pas avec les IDs: " + invalidPaysIds);
        }
        
        // Ajouter les nouvelles associations
        int addedCount = 0;
        for (Long paysId : paysIds) {
            if (paysId == null) {
                System.err.println("⚠️ Pays ID null ignoré");
                continue;
            }
            
            Optional<PaysEntity> paysOpt = paysRepository.findById(paysId);
            if (paysOpt.isPresent()) {
                try {
                    // Vérifier si l'association existe déjà (au cas où)
                    if (!profilPaysRepository.existsByProfilIdAndPaysId(profilId, paysId)) {
                        ProfilPaysEntity profilPays = new ProfilPaysEntity(profil, paysOpt.get());
                        profilPaysRepository.save(profilPays);
                        addedCount++;
                        System.out.println("✅ Pays associé: " + paysOpt.get().getCode() + " - " + paysOpt.get().getNom());
                    } else {
                        System.out.println("⚠️ Association déjà existante pour pays ID " + paysId + ", ignorée");
                    }
                } catch (Exception e) {
                    System.err.println("❌ Erreur lors de l'association du pays ID " + paysId + ": " + e.getMessage());
                    e.printStackTrace();
                    throw new RuntimeException("Erreur lors de l'association du pays ID " + paysId + ": " + e.getMessage(), e);
                }
            } else {
                System.err.println("⚠️ Pays non trouvé avec l'ID: " + paysId);
                throw new RuntimeException("Pays non trouvé avec l'ID: " + paysId);
            }
        }
        
        if (addedCount == 0 && !paysIds.isEmpty()) {
            throw new RuntimeException("Aucun pays n'a pu être associé au profil");
        }
        
        System.out.println("✅ " + addedCount + " pays associés au profil " + profil.getNom());
    }
    
    // Vérifier si un profil a accès à un pays (ou si c'est GNL)
    public boolean hasAccessToPays(Long profilId, String paysCode) {
        // Si le profil a accès à "GNL", il a accès à tout
        Optional<PaysEntity> gnlPays = paysRepository.findByCode("GNL");
        if (gnlPays.isPresent()) {
            boolean hasGnl = profilPaysRepository.existsByProfilIdAndPaysId(profilId, gnlPays.get().getId());
            if (hasGnl) {
                return true;
            }
        }
        
        // Sinon, vérifier si le profil a accès au pays spécifique
        Optional<PaysEntity> paysOpt = paysRepository.findByCode(paysCode);
        if (paysOpt.isEmpty()) {
            return false;
        }
        
        return profilPaysRepository.existsByProfilIdAndPaysId(profilId, paysOpt.get().getId());
    }
}

