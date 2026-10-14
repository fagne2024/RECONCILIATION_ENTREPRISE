package com.reconciliation.service;

import com.reconciliation.entity.CompteEntity;
import com.reconciliation.entity.OperationEntity;
import com.reconciliation.model.Compte;
import com.reconciliation.repository.CompteRepository;
import com.reconciliation.repository.OperationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class CompteService {
    
    private static final Logger logger = LoggerFactory.getLogger(CompteService.class);
    private static final Map<String, String> COUNTRY_CODE_TO_NAME = Map.ofEntries(
            Map.entry("CM", "Cameroun"),
            Map.entry("CI", "Côte d'Ivoire"),
            Map.entry("SN", "Sénégal"),
            Map.entry("BF", "Burkina Faso"),
            Map.entry("ML", "Mali"),
            Map.entry("BJ", "Bénin"),
            Map.entry("NE", "Niger"),
            Map.entry("TD", "Tchad"),
            Map.entry("TG", "Togo"),
            Map.entry("GA", "Gabon"),
            Map.entry("GN", "Guinée"),
            Map.entry("KE", "Kenya"),
            Map.entry("MZ", "Mozambique"),
            Map.entry("NG", "Nigeria"),
            Map.entry("CF", "Centrafrique"),
            Map.entry("CG", "Congo"),
            Map.entry("CD", "RD Congo"),
            Map.entry("GQ", "Guinée équatoriale"),
            Map.entry("ST", "São Tomé-et-Príncipe"),
            Map.entry("AO", "Angola"),
            Map.entry("GW", "Guinée-Bissau"),
            Map.entry("SL", "Sierra Leone"),
            Map.entry("LR", "Liberia"),
            Map.entry("GH", "Ghana"),
            Map.entry("MR", "Mauritanie"),
            Map.entry("GM", "Gambie"),
            Map.entry("CV", "Cap-Vert")
    );
    
    @Autowired
    private CompteRepository compteRepository;
    
    @Autowired
    private OperationRepository operationRepository;

    @Autowired
    private CompteRegroupementService compteRegroupementService;
    
    @Autowired
    private PaysFilterService paysFilterService;
    
    public List<Compte> getAllComptes() {
        return getAllComptes(null);
    }
    
    public List<Compte> getAllComptes(String username) {
        try {
            List<CompteEntity> comptes;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                // null signifie tous les pays (GNL ou admin)
                if (allowedPays == null) {
                    comptes = compteRepository.findAll();
                } else if (allowedPays.isEmpty()) {
                    // Aucun pays autorisé, retourner une liste vide
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    comptes = compteRepository.findByPaysIn(allowedPays);
                }
            } else {
                // Pas de username, retourner tous les comptes (comportement par défaut)
                comptes = compteRepository.findAll();
            }
            
            return comptes.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getAllComptes pour username: {}", username, e);
            e.printStackTrace();
            // En cas d'erreur, retourner une liste vide pour éviter les crashes
            return new ArrayList<>();
        }
    }
    
    public Optional<Compte> getCompteById(Long id) {
        return getCompteById(id, null);
    }
    
    public Optional<Compte> getCompteById(Long id, String username) {
        Optional<CompteEntity> compteOpt = compteRepository.findById(id);
        if (compteOpt.isEmpty()) {
            return Optional.empty();
        }
        
        CompteEntity compte = compteOpt.get();
        
        // Vérifier l'accès par pays si username fourni
        if (username != null && !username.isEmpty()) {
            if (!paysFilterService.canAccessPays(username, compte.getPays())) {
                return Optional.empty(); // L'utilisateur n'a pas accès à ce pays
            }
        }
        
        return Optional.of(convertToModel(compte));
    }
    
    public Optional<Compte> getCompteByNumero(String numeroCompte) {
        return getCompteByNumero(numeroCompte, null);
    }
    
    public Optional<Compte> getCompteByNumero(String numeroCompte, String username) {
        Optional<CompteEntity> compteOpt = compteRepository.findByNumeroCompte(numeroCompte);
        if (compteOpt.isEmpty()) {
            return Optional.empty();
        }
        
        CompteEntity compte = compteOpt.get();
        
        // Vérifier l'accès par pays si username fourni
        if (username != null && !username.isEmpty()) {
            if (!paysFilterService.canAccessPays(username, compte.getPays())) {
                return Optional.empty(); // L'utilisateur n'a pas accès à ce pays
            }
        }
        
        return Optional.of(convertToModel(compte));
    }
    
    /**
     * Récupère un compte par agence et service
     * Le numéro de compte est construit comme "agence_service"
     */
    public Optional<Compte> getCompteByAgencyAndService(String agency, String service) {
        return getCompteByAgencyAndService(agency, service, null);
    }
    
    public Optional<Compte> getCompteByAgencyAndService(String agency, String service, String username) {
        String numeroCompte = agency + "_" + service;
        return getCompteByNumero(numeroCompte, username);
    }
    
    /**
     * Crée ou récupère un compte pour une combinaison agence+service
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public Compte getOrCreateCompteByAgencyAndService(String agency, String service, String pays) {
        String numeroCompte = agency + "_" + service;
        return compteRepository.findByNumeroCompte(numeroCompte)
                .map(this::convertToModel)
                .orElseGet(() -> {
                    // Créer un nouveau compte
                    Compte newCompte = new Compte();
                    newCompte.setNumeroCompte(numeroCompte);
                    newCompte.setCodeProprietaire(numeroCompte);
                    newCompte.setPays(pays != null ? pays : "SN");
                    newCompte.setSolde(0.0);
                    newCompte.setDateDerniereMaj(LocalDateTime.now());
                    return saveCompte(newCompte);
                });
    }
    
    /**
     * Récupère un compte par service
     * Toutes les agences d'un même service impactent le même compte
     */
    public Optional<Compte> getCompteByService(String service) {
        return getCompteByService(service, null);
    }
    
    public Optional<Compte> getCompteByService(String service, String username) {
        return getCompteByNumero(service, username);
    }
    
    /**
     * Crée ou récupère un compte pour un service
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public Compte getOrCreateCompteByService(String service, String pays) {
        return compteRepository.findByNumeroCompte(service)
                .map(this::convertToModel)
                .orElseGet(() -> {
                    // Créer un nouveau compte
                    Compte newCompte = new Compte();
                    newCompte.setNumeroCompte(service);
                    newCompte.setCodeProprietaire(service);
                    newCompte.setPays(pays != null ? pays : "SN");
                    newCompte.setSolde(0.0);
                    newCompte.setDateDerniereMaj(LocalDateTime.now());
                    return saveCompte(newCompte);
                });
    }
    
    public List<Compte> getComptesByPays(String pays) {
        return getComptesByPays(pays, null);
    }
    
    public List<Compte> getComptesByPays(String pays, String username) {
        // Vérifier que l'utilisateur a accès à ce pays
        if (username != null && !username.isEmpty()) {
            if (!paysFilterService.canAccessPays(username, pays)) {
                return new ArrayList<>(); // L'utilisateur n'a pas accès à ce pays
            }
        }
        
        return compteRepository.findByPays(pays).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Compte> getComptesByCodeProprietaire(String codeProprietaire) {
        return getComptesByCodeProprietaire(codeProprietaire, null);
    }
    
    public List<Compte> getComptesByCodeProprietaire(String codeProprietaire, String username) {
        try {
            List<CompteEntity> comptes;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les comptes
                    comptes = compteRepository.findByCodeProprietaire(codeProprietaire);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    comptes = compteRepository.findByCodeProprietaireAndPaysIn(codeProprietaire, allowedPays);
                }
            } else {
                comptes = compteRepository.findByCodeProprietaire(codeProprietaire);
            }
            
            return comptes.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getComptesByCodeProprietaire pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    public List<Compte> getComptesBySoldeSuperieurA(Double soldeMin) {
        return getComptesBySoldeSuperieurA(soldeMin, null);
    }
    
    public List<Compte> getComptesBySoldeSuperieurA(Double soldeMin, String username) {
        try {
            List<CompteEntity> comptes;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les comptes
                    comptes = compteRepository.findBySoldeSuperieurA(soldeMin);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    comptes = compteRepository.findBySoldeSuperieurAAndPaysIn(soldeMin, allowedPays);
                }
            } else {
                comptes = compteRepository.findBySoldeSuperieurA(soldeMin);
            }
            
            return comptes.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getComptesBySoldeSuperieurA pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public Compte saveCompte(Compte compte) {
        CompteEntity entity = convertToEntity(compte);
        if (entity.getDateDerniereMaj() == null) {
            entity.setDateDerniereMaj(LocalDateTime.now());
        }
        CompteEntity savedEntity = compteRepository.save(entity);
        return convertToModel(savedEntity);
    }
    
    @Transactional
    public boolean deleteCompte(Long id) {
        try {
            if (compteRepository.existsById(id)) {
                // Vérifier s'il y a des opérations liées à ce compte
                List<OperationEntity> operationsLiees = operationRepository.findByCompteId(id);
                if (!operationsLiees.isEmpty()) {
                    logger.warn("Impossible de supprimer le compte ID {} : {} opérations liées trouvées", id, operationsLiees.size());
                    return false;
                }
                
                compteRepository.deleteById(id);
                logger.info("Compte ID {} supprimé avec succès", id);
                return true;
            }
            return false;
        } catch (Exception e) {
            logger.error("Erreur lors de la suppression du compte ID {} : {}", id, e.getMessage(), e);
            return false;
        }
    }
    
    @Transactional
    public boolean updateSolde(Long id, Double nouveauSolde) {
        Optional<CompteEntity> optionalCompte = compteRepository.findById(id);
        if (optionalCompte.isPresent()) {
            CompteEntity compte = optionalCompte.get();
            compte.setSolde(nouveauSolde);
            compte.setDateDerniereMaj(LocalDateTime.now());
            compteRepository.save(compte);
            return true;
        }
        return false;
    }
    
    /**
     * Met à jour le solde d'un compte en ajoutant ou soustrayant un montant
     */
    @Transactional
    public boolean updateSoldeByMontant(Long id, Double montant, boolean isCredit) {
        Optional<CompteEntity> optionalCompte = compteRepository.findById(id);
        if (optionalCompte.isPresent()) {
            CompteEntity compte = optionalCompte.get();
            double soldeActuel = compte.getSolde();
            double nouveauSolde;
            
            if (isCredit) {
                nouveauSolde = soldeActuel + montant;
            } else {
                nouveauSolde = soldeActuel - montant;
            }
            
            compte.setSolde(nouveauSolde);
            compte.setDateDerniereMaj(LocalDateTime.now());
            compteRepository.save(compte);
            return true;
        }
        return false;
    }
    
    /**
     * Récupère le solde actuel d'un compte
     */
    public Double getSoldeCompte(Long id) {
        Optional<CompteEntity> optionalCompte = compteRepository.findById(id);
        return optionalCompte.map(CompteEntity::getSolde).orElse(null);
    }
    
    /**
     * Vérifie si un compte a un solde suffisant pour une opération
     */
    public boolean hasSoldeSuffisant(Long id, Double montant) {
        Double solde = getSoldeCompte(id);
        return solde != null && solde >= montant;
    }
    
    public boolean compteExists(String numeroCompte) {
        return compteRepository.existsByNumeroCompte(numeroCompte);
    }
    
    public List<String> getDistinctPays() {
        return compteRepository.findDistinctPays();
    }
    
    public List<String> getDistinctCodeProprietaire() {
        return compteRepository.findDistinctCodeProprietaire();
    }
    
    public List<Compte> filterComptes(List<String> pays, Double soldeMin, String dateDebut, String dateFin, List<String> codeProprietaire, List<String> categorie, List<String> type) {
        return filterComptes(pays, soldeMin, dateDebut, dateFin, codeProprietaire, categorie, type, null);
    }
    
    public List<Compte> filterComptes(List<String> pays, Double soldeMin, String dateDebut, String dateFin, List<String> codeProprietaire, List<String> categorie, List<String> type, String username) {
        try {
            System.out.println("Service: Filtrage des comptes");
            System.out.println("Service: Pays = " + pays);
            System.out.println("Service: SoldeMin = " + soldeMin);
            System.out.println("Service: CodeProprietaire = " + codeProprietaire);
            System.out.println("Service: Categorie = " + categorie);
            System.out.println("Service: Type = " + type);
            System.out.println("Service: DateDebut = " + dateDebut);
            System.out.println("Service: DateFin = " + dateFin);
            System.out.println("Service: Username = " + username);
            
            List<CompteEntity> entities;
            
            // Filtrer d'abord par pays autorisés si username fourni
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les comptes
                    entities = compteRepository.findAll();
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés (code ou libellé pays selon les données historiques)
                    entities = compteRepository.findAll().stream()
                            .filter(entity -> countryMatchesAny(entity.getPays(), allowedPays))
                            .collect(Collectors.toList());
                }
            } else {
                entities = compteRepository.findAll();
            }
            
            System.out.println("Service: Total entités trouvées après filtrage pays = " + entities.size());
            
            List<Compte> result = entities.stream()
                    .filter(entity -> pays == null || pays.isEmpty() || countryMatchesAny(entity.getPays(), pays))
                    .filter(entity -> soldeMin == null || entity.getSolde() >= soldeMin)
                    .filter(entity -> codeProprietaire == null || codeProprietaire.isEmpty() || codeProprietaire.contains(entity.getCodeProprietaire()))
                    .filter(entity -> categorie == null || categorie.isEmpty() || categorie.contains(entity.getCategorie()))
                    .filter(entity -> type == null || type.isEmpty() || type.contains(entity.getType()))
                    .filter(entity -> {
                        if ((dateDebut == null || dateDebut.isEmpty()) && (dateFin == null || dateFin.isEmpty())) {
                            return true;
                        }
                        if (entity.getDateDerniereMaj() == null) {
                            return false;
                        }
                        String dateMaj = entity.getDateDerniereMaj().toString();
                        boolean afterDebut = (dateDebut == null || dateDebut.isEmpty()) || dateMaj.compareTo(dateDebut) >= 0;
                        boolean beforeFin = (dateFin == null || dateFin.isEmpty()) || dateMaj.compareTo(dateFin) <= 0;
                        return afterDebut && beforeFin;
                    })
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
            
            System.out.println("Service: Résultats après filtrage = " + result.size());
            return result;
        } catch (Exception e) {
            logger.error("Erreur dans filterComptes pour username: {}", username, e);
            return new ArrayList<>();
        }
    }

    private boolean countryMatchesAny(String rowCountry, List<String> selectedCountries) {
        if (selectedCountries == null || selectedCountries.isEmpty()) {
            return true;
        }
        return selectedCountries.stream().anyMatch(selected -> countriesMatch(rowCountry, selected));
    }

    private boolean countriesMatch(String left, String right) {
        String leftKey = countryMatchKey(left);
        String rightKey = countryMatchKey(right);
        if (leftKey.isEmpty() || rightKey.isEmpty()) {
            return leftKey.equals(rightKey);
        }
        return leftKey.equals(rightKey);
    }

    private String countryMatchKey(String value) {
        if (value == null || value.trim().isEmpty()) {
            return "";
        }
        String trimmed = value.trim();
        String upper = trimmed.toUpperCase(Locale.ROOT);
        if ("CITCH".equals(upper) || upper.startsWith("CITCH")) {
            return normalizeCountryName(COUNTRY_CODE_TO_NAME.get("CI"));
        }
        String nameFromCode = COUNTRY_CODE_TO_NAME.get(upper);
        if (nameFromCode != null) {
            return normalizeCountryName(nameFromCode);
        }
        return normalizeCountryName(trimmed);
    }

    private String normalizeCountryName(String value) {
        return java.text.Normalizer.normalize(value.trim(), java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT);
    }
    
    /**
     * Récupère tous les comptes d'une agence
     */
    public List<Compte> getComptesByAgency(String agency) {
        return getComptesByAgency(agency, null);
    }
    
    public List<Compte> getComptesByAgency(String agency, String username) {
        try {
            List<CompteEntity> comptes;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les comptes
                    comptes = compteRepository.findByAgency(agency);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    comptes = compteRepository.findByAgencyAndPaysIn(agency, allowedPays);
                }
            } else {
                comptes = compteRepository.findByAgency(agency);
            }
            
            return comptes.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getComptesByAgency pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    /**
     * Récupère tous les comptes d'un service
     */
    public List<Compte> getComptesByService(String service) {
        return getComptesByService(service, null);
    }
    
    public List<Compte> getComptesByService(String service, String username) {
        try {
            List<CompteEntity> comptes;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les comptes
                    comptes = compteRepository.findByService(service);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    comptes = compteRepository.findByServiceAndPaysIn(service, allowedPays);
                }
            } else {
                comptes = compteRepository.findByService(service);
            }
            
            return comptes.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getComptesByService pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    /**
     * Récupère la liste des agences uniques
     */
    public List<String> getDistinctAgencies() {
        return compteRepository.findDistinctCodeProprietaire().stream()
                .map(code -> code.split("_")[0])
                .distinct()
                .sorted()
                .collect(Collectors.toList());
    }
    
    /**
     * Récupère la liste des services uniques
     */
    public List<String> getDistinctServices() {
        return compteRepository.findDistinctCodeProprietaire().stream()
                .distinct()
                .sorted()
                .collect(Collectors.toList());
    }
    
    private Compte convertToModel(CompteEntity entity) {
        Compte compte = new Compte(
                entity.getId(),
                entity.getNumeroCompte(),
                entity.getSolde(),
                entity.getDateDerniereMaj(),
                entity.getPays(),
                entity.getCodeProprietaire()
        );
        compte.setAgence(entity.getAgence());
        compte.setType(entity.getType()); // Ajout
        compte.setCategorie(entity.getCategorie()); // Ajout
        // Indicateurs de fusion: consolide (compte regroupé) et regroupe (compte original regroupé)
        try {
            boolean isConsolide = compteRegroupementService != null && compte.getId() != null
                    ? compteRegroupementService.isCompteConsolide(compte.getId())
                    : false;
            boolean isRegroupe = compteRegroupementService != null && compte.getId() != null
                    ? compteRegroupementService.isCompteRegroupe(compte.getId())
                    : false;
            compte.setConsolide(isConsolide);
            compte.setRegroupe(isRegroupe);
        } catch (Exception ignored) {
            // En cas d'indisponibilité, ne pas bloquer la conversion
        }
        return compte;
    }
    
    private CompteEntity convertToEntity(Compte model) {
        CompteEntity entity = new CompteEntity();
        entity.setId(model.getId());
        entity.setNumeroCompte(model.getNumeroCompte());
        entity.setSolde(model.getSolde());
        entity.setDateDerniereMaj(model.getDateDerniereMaj());
        entity.setPays(model.getPays());
        entity.setCodeProprietaire(model.getCodeProprietaire());
        entity.setAgence(model.getAgence());
        entity.setType(model.getType()); // Ajout
        entity.setCategorie(model.getCategorie()); // Ajout
        return entity;
    }
} 