package com.reconciliation.service;

import com.reconciliation.entity.FraisTransactionEntity;
import com.reconciliation.entity.AgencySummaryEntity;
import com.reconciliation.repository.FraisTransactionRepository;
import com.reconciliation.repository.AgencySummaryRepository;
import com.reconciliation.dto.FraisTransactionRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Collectors;

@Service
public class FraisTransactionService {
    
    @Autowired
    private FraisTransactionRepository fraisTransactionRepository;
    
    @Autowired
    private AgencySummaryRepository agencySummaryRepository;
    
    /**
     * Créer un nouveau frais de transaction
     */
    @Transactional
    public FraisTransactionEntity createFraisTransaction(FraisTransactionRequest request) {
        // Vérifier s'il existe déjà un frais pour ce service et cette agence
        Optional<FraisTransactionEntity> existingFrais = fraisTransactionRepository.findFraisApplicable(request.getService(), request.getAgence());
        if (existingFrais.isPresent()) {
            throw new IllegalArgumentException("Un frais de transaction existe déjà pour le service '" + request.getService() + "' et l'agence '" + request.getAgence() + "'");
        }
        
        FraisTransactionEntity frais = new FraisTransactionEntity();
        frais.setService(request.getService());
        frais.setAgence(request.getAgence());
        frais.setMontantFrais(request.getMontantFrais());
        frais.setTypeCalcul(request.getTypeCalcul() != null ? request.getTypeCalcul() : "NOMINAL");
        frais.setPourcentage(request.getPourcentage());
        frais.setDescription(request.getDescription());
        frais.setActif(request.getActif() != null ? request.getActif() : true);
        frais.setDateCreation(LocalDateTime.now());
        frais.setDateModification(LocalDateTime.now());
        
        return fraisTransactionRepository.save(frais);
    }
    
    /**
     * Mettre à jour un frais de transaction existant
     */
    @Transactional
    public FraisTransactionEntity updateFraisTransaction(Long id, FraisTransactionRequest request) {
        FraisTransactionEntity frais = fraisTransactionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Frais de transaction non trouvé avec ID: " + id));
        
        // Vérifier s'il existe déjà un autre frais pour ce service et cette agence (excluant celui en cours de modification)
        Optional<FraisTransactionEntity> existingFrais = fraisTransactionRepository.findFraisApplicable(request.getService(), request.getAgence());
        if (existingFrais.isPresent() && !existingFrais.get().getId().equals(id)) {
            throw new IllegalArgumentException("Un frais de transaction existe déjà pour le service '" + request.getService() + "' et l'agence '" + request.getAgence() + "'");
        }
        
        frais.setService(request.getService());
        frais.setAgence(request.getAgence());
        frais.setMontantFrais(request.getMontantFrais());
        frais.setTypeCalcul(request.getTypeCalcul() != null ? request.getTypeCalcul() : "NOMINAL");
        frais.setPourcentage(request.getPourcentage());
        frais.setDescription(request.getDescription());
        if (request.getActif() != null) {
            frais.setActif(request.getActif());
        }
        frais.setDateModification(LocalDateTime.now());
        
        return fraisTransactionRepository.save(frais);
    }
    
    /**
     * Récupérer un frais de transaction par ID
     */
    public Optional<FraisTransactionEntity> getFraisTransactionById(Long id) {
        return fraisTransactionRepository.findById(id);
    }
    
    /**
     * Récupérer tous les frais de transaction actifs
     */
    public List<FraisTransactionEntity> getAllFraisTransactionsActifs() {
        return fraisTransactionRepository.findByActifTrueOrderByDateModificationDesc();
    }
    
    /**
     * Récupérer tous les frais de transaction
     */
    public List<FraisTransactionEntity> getAllFraisTransactions() {
        return fraisTransactionRepository.findAllOrderByDateModificationDesc();
    }
    
    /**
     * Récupérer les frais de transaction par service
     */
    public List<FraisTransactionEntity> getFraisTransactionsByService(String service) {
        return fraisTransactionRepository.findByServiceAndActifTrueOrderByDateModificationDesc(service);
    }
    
    /**
     * Récupérer les frais de transaction par agence
     */
    public List<FraisTransactionEntity> getFraisTransactionsByAgence(String agence) {
        return fraisTransactionRepository.findByAgenceAndActifTrueOrderByDateModificationDesc(agence);
    }
    
    /**
     * Trouver le frais applicable pour un service et une agence donnés
     */
    public Optional<FraisTransactionEntity> getFraisApplicable(String service, String agence) {
        return fraisTransactionRepository.findFraisApplicable(service, agence);
    }
    
    /**
     * Récupérer tous les services uniques
     */
    public List<String> getAllServices() {
        return fraisTransactionRepository.findDistinctServices();
    }
    
    /**
     * Récupérer toutes les agences uniques
     */
    public List<String> getAllAgences() {
        return fraisTransactionRepository.findDistinctAgences();
    }

    public List<FraisTransactionEntity> filterFraisTransactions(Map<String, Object> filters) {
        List<FraisTransactionEntity> all = fraisTransactionRepository.findAllOrderByDateModificationDesc();
        List<String> services = (List<String>) filters.getOrDefault("services", null);
        List<String> agences = (List<String>) filters.getOrDefault("agences", null);
        List<String> paysNames = (List<String>) filters.getOrDefault("pays", null);
        String actifStr = filters.get("actif") != null ? filters.get("actif").toString() : null;
        Boolean actif = (actifStr == null || actifStr.isEmpty()) ? null : Boolean.valueOf(actifStr);
        String dateDebut = filters.get("dateDebut") != null ? filters.get("dateDebut").toString() : null;
        String dateFin = filters.get("dateFin") != null ? filters.get("dateFin").toString() : null;
        
        // Construire un map agence -> pays pour le filtrage par pays
        Map<String, String> agenceToPaysMap = null;
        Set<String> allowedPaysCodes = null;
        if (paysNames != null && !paysNames.isEmpty()) {
            // Convertir les noms de pays en codes pays
            allowedPaysCodes = new HashSet<>();
            for (String paysName : paysNames) {
                String code = getCountryCode(paysName);
                if (code != null && !code.isEmpty()) {
                    allowedPaysCodes.add(code);
                }
            }
            
            // Construire le map agence -> pays depuis AgencySummary
            agenceToPaysMap = agencySummaryRepository.findAll().stream()
                .filter(s -> s.getAgency() != null && s.getCountry() != null)
                .collect(Collectors.toMap(
                    AgencySummaryEntity::getAgency,
                    AgencySummaryEntity::getCountry,
                    (existing, replacement) -> existing // En cas de doublon, garder le premier
                ));
        }
        
        final Map<String, String> finalAgenceToPaysMap = agenceToPaysMap;
        final Set<String> finalAllowedPaysCodes = allowedPaysCodes;
        
        return all.stream()
            .filter(f -> (services == null || services.isEmpty() || services.contains(f.getService())))
            .filter(f -> (agences == null || agences.isEmpty() || agences.contains(f.getAgence())))
            .filter(f -> {
                // Filtrer par pays si spécifié
                if (finalAllowedPaysCodes != null && !finalAllowedPaysCodes.isEmpty() && finalAgenceToPaysMap != null) {
                    String pays = finalAgenceToPaysMap.get(f.getAgence());
                    if (pays == null) {
                        return false; // Agence sans pays, exclure
                    }
                    String paysCode = getCountryCode(pays);
                    return paysCode != null && finalAllowedPaysCodes.contains(paysCode);
                }
                return true;
            })
            .filter(f -> (actif == null || f.getActif().equals(actif)))
            .filter(f -> (dateDebut == null || dateDebut.isEmpty() || (f.getDateCreation() != null && !f.getDateCreation().toLocalDate().isBefore(java.time.LocalDate.parse(dateDebut)))))
            .filter(f -> (dateFin == null || dateFin.isEmpty() || (f.getDateCreation() != null && !f.getDateCreation().toLocalDate().isAfter(java.time.LocalDate.parse(dateFin)))))
            .toList();
    }
    
    /**
     * Convertit un nom de pays en code pays pour le filtrage
     */
    private String getCountryCode(String countryName) {
        if (countryName == null || countryName.trim().isEmpty()) {
            return "";
        }
        
        String normalizedName = countryName.trim().toUpperCase();
        
        // Gérer les variantes spéciales comme "CITCH" qui signifie "CI" (Côte d'Ivoire)
        if (normalizedName.equals("CITCH") || normalizedName.startsWith("CITCH")) {
            return "CI";
        }
        
        // Mapping des noms de pays vers leurs codes
        java.util.Map<String, String> countryMap = new java.util.HashMap<>();
        countryMap.put("CAMEROUN", "CM");
        countryMap.put("CAMEROON", "CM");
        countryMap.put("CÔTE D'IVOIRE", "CI");
        countryMap.put("COTE D'IVOIRE", "CI");
        countryMap.put("COTE DIVOIRE", "CI");
        countryMap.put("CÔTE DIVOIRE", "CI");
        countryMap.put("SÉNÉGAL", "SN");
        countryMap.put("SENEGAL", "SN");
        countryMap.put("BURKINA FASO", "BF");
        countryMap.put("BURKINA", "BF");
        countryMap.put("MALI", "ML");
        countryMap.put("BÉNIN", "BJ");
        countryMap.put("BENIN", "BJ");
        countryMap.put("NIGER", "NE");
        countryMap.put("TCHAD", "TD");
        countryMap.put("TOGO", "TG");
        countryMap.put("GNL - TOUS LES PAYS", "GNL");
        
        // Chercher par nom exact (insensible à la casse)
        for (java.util.Map.Entry<String, String> entry : countryMap.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(normalizedName)) {
                return entry.getValue();
            }
        }
        
        // Chercher par contenu (pour gérer les cas comme "Côte d'Ivoire" dans "Côte d'Ivoire - Abidjan")
        if (normalizedName.contains("COTE") || normalizedName.contains("CÔTE") || normalizedName.contains("IVOIRE")) {
            return "CI";
        }
        if (normalizedName.contains("SENEGAL") || normalizedName.contains("SÉNÉGAL")) {
            return "SN";
        }
        if (normalizedName.contains("CAMEROUN") || normalizedName.contains("CAMEROON")) {
            return "CM";
        }
        if (normalizedName.contains("BURKINA")) {
            return "BF";
        }
        if (normalizedName.contains("MALI")) {
            return "ML";
        }
        if (normalizedName.contains("BENIN") || normalizedName.contains("BÉNIN")) {
            return "BJ";
        }
        if (normalizedName.contains("NIGER")) {
            return "NE";
        }
        if (normalizedName.contains("TCHAD")) {
            return "TD";
        }
        if (normalizedName.contains("TOGO")) {
            return "TG";
        }
        
        // Si c'est déjà un code à 2 lettres, le retourner tel quel
        if (normalizedName.length() == 2) {
            return normalizedName;
        }
        
        return "";
    }
    
    /**
     * Supprimer un frais de transaction (suppression physique de la base de données)
     */
    @Transactional
    public boolean deleteFraisTransaction(Long id) {
        Optional<FraisTransactionEntity> frais = fraisTransactionRepository.findById(id);
        if (frais.isPresent()) {
            fraisTransactionRepository.deleteById(id);
            return true;
        }
        return false;
    }
    
    /**
     * Activer/désactiver un frais de transaction
     */
    @Transactional
    public boolean toggleFraisTransaction(Long id) {
        Optional<FraisTransactionEntity> frais = fraisTransactionRepository.findById(id);
        if (frais.isPresent()) {
            FraisTransactionEntity entity = frais.get();
            entity.setActif(!entity.getActif());
            entity.setDateModification(LocalDateTime.now());
            fraisTransactionRepository.save(entity);
            return true;
        }
        return false;
    }
} 