package com.reconciliation.service;

import com.reconciliation.entity.*;
import com.reconciliation.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Field;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class RenommerService {

    @Autowired
    private ServiceReferenceRepository serviceReferenceRepository;
    
    @Autowired
    private CompteRepository compteRepository;
    
    @Autowired
    private OperationRepository operationRepository;
    
    @Autowired
    private FraisTransactionRepository fraisTransactionRepository;
    
    @Autowired
    private OperationBancaireRepository operationBancaireRepository;
    
    @Autowired
    private RedevanceAgenceParamRepository redevanceAgenceParamRepository;
    
    @Autowired
    private CompteSoldeBoRepository compteSoldeBoRepository;
    
    @Autowired
    private CompteSoldeClotureRepository compteSoldeClotureRepository;

    public List<Map<String, Object>> getModuleConfigs() {
        return List.of(
            createModuleConfig("services", "Services", "ServiceReferenceEntity",
                List.of("nom", "libelle", "commentaire", "description"),
                "nom", "libelle"),
            createModuleConfig("comptes", "Comptes", "CompteEntity",
                List.of("numeroCompte", "libelle", "type", "categorie"),
                "numeroCompte", "libelle"),
            createModuleConfig("operations", "Opérations", "OperationEntity",
                List.of("service", "typeOperation", "statut", "pays", "nomBordereau", "banque", "reference"),
                "service", "typeOperation"),
            createModuleConfig("frais", "Frais", "FraisTransactionEntity",
                List.of("service", "agence", "description", "typeCalcul", "actif"),
                "service", "description"),
            createModuleConfig("commissions", "Commissions", "FraisTransactionEntity",
                List.of("service", "agence", "description", "typeCalcul", "actif"),
                "service", "description"),
            createModuleConfig("banque", "Banque", "OperationBancaireEntity",
                List.of("pays", "agence", "typeOperation", "nomBeneficiaire", "statut", "reconStatus", "traitement", "reference"),
                "pays", "agence"),
            createModuleConfig("redevance", "Redevance Loterie", "RedevanceAgenceParamEntity",
                List.of("agence", "tauxRedevancePourcentage", "retenueSurGainsPourcentage", "taxeJeuxHasardPourcentage"),
                "agence", "tauxRedevancePourcentage"),
            createModuleConfig("niveaux-validation", "Niveaux Validation", "NiveauValidationConfig",
                List.of("valeur", "description", "statutAssocie", "description"),
                "valeur", "description")
        );
    }

    public List<Map<String, Object>> getEntities(String moduleKey, String search) {
        List<?> entities = getEntitiesForModule(moduleKey);
        
        return entities.stream()
            .map(entity -> toMap(moduleKey, entity))
            .filter(map -> search == null || search.isEmpty() || matchesSearch(map, search))
            .collect(Collectors.toList());
    }

    public Optional<?> getById(String moduleKey, Long id) {
        return getEntityById(moduleKey, id);
    }

    @Transactional
    public Object update(String moduleKey, Long id, Map<String, Object> updates) {
        Object entity = getEntityById(moduleKey, id)
            .orElseThrow(() -> new IllegalArgumentException("Entité non trouvée: " + moduleKey + " id=" + id));
        
        updates.forEach((fieldName, value) -> {
            try {
                Field field = entity.getClass().getDeclaredField(fieldName);
                field.setAccessible(true);
                field.set(entity, convertValue(field.getType(), value));
            } catch (NoSuchFieldException | IllegalAccessException e) {
                // Ignorer les champs inexistants
            }
        });
        
        return saveEntity(moduleKey, entity);
    }

    private List<?> getEntitiesForModule(String moduleKey) {
        return switch (moduleKey) {
            case "services" -> serviceReferenceRepository.findAll();
            case "comptes" -> compteRepository.findAll();
            case "operations" -> operationRepository.findAll();
            case "frais" -> fraisTransactionRepository.findAll();
            case "commissions" -> fraisTransactionRepository.findAll();
            case "banque" -> operationBancaireRepository.findAll();
            case "redevance" -> redevanceAgenceParamRepository.findAll();
            case "niveaux-validation" -> getNiveauxValidationConfigs();
            default -> throw new IllegalArgumentException("Module inconnu: " + moduleKey);
        };
    }

    private Optional<?> getEntityById(String moduleKey, Long id) {
        return switch (moduleKey) {
            case "services" -> serviceReferenceRepository.findById(id);
            case "comptes" -> compteRepository.findById(id);
            case "operations" -> operationRepository.findById(id);
            case "frais" -> fraisTransactionRepository.findById(id);
            case "commissions" -> fraisTransactionRepository.findById(id);
            case "banque" -> operationBancaireRepository.findById(id);
            case "redevance" -> redevanceAgenceParamRepository.findById(id);
            case "niveaux-validation" -> getNiveauValidationById(id);
            default -> Optional.empty();
        };
    }

    private Object saveEntity(String moduleKey, Object entity) {
        return switch (moduleKey) {
            case "services" -> serviceReferenceRepository.save((ServiceReferenceEntity) entity);
            case "comptes" -> compteRepository.save((CompteEntity) entity);
            case "operations" -> operationRepository.save((OperationEntity) entity);
            case "frais" -> fraisTransactionRepository.save((FraisTransactionEntity) entity);
            case "commissions" -> fraisTransactionRepository.save((FraisTransactionEntity) entity);
            case "banque" -> operationBancaireRepository.save((OperationBancaireEntity) entity);
            case "redevance" -> redevanceAgenceParamRepository.save((RedevanceAgenceParamEntity) entity);
            case "niveaux-validation" -> saveNiveauValidation(entity);
            default -> throw new IllegalArgumentException("Module inconnu: " + moduleKey);
        };
    }

    private List<?> getNiveauxValidationConfigs() {
        // Pour l'instant, retourner une liste vide - utilise localStorage côté frontend
        return List.of();
    }

    private Optional<?> getNiveauValidationById(Long id) {
        return Optional.empty();
    }

    private Object saveNiveauValidation(Object entity) {
        return entity; // Pas de persistence pour l'instant
    }

    private Map<String, Object> createModuleConfig(String key, String label, String entityClass, 
            List<String> fields, String titleField, String labelField) {
        Map<String, Object> config = new HashMap<>();
        config.put("key", key);
        config.put("label", label);
        config.put("entityClass", entityClass);
        config.put("fields", fields);
        config.put("titleField", titleField);
        config.put("labelField", labelField);
        return config;
    }

    private Map<String, Object> toMap(String moduleKey, Object entity) {
        Map<String, Object> map = new HashMap<>();
        map.put("module", moduleKey);
        map.put("entityType", getModuleLabel(moduleKey));
        
        try {
            // Mapping explicite selon le type de module pour éviter les problèmes de lazy loading
            switch (moduleKey) {
                case "services":
                    map.putAll(toMapService((ServiceReferenceEntity) entity));
                    break;
                case "comptes":
                    map.putAll(toMapCompte((CompteEntity) entity));
                    break;
                case "operations":
                    map.putAll(toMapOperation((OperationEntity) entity));
                    break;
                case "frais":
                case "commissions":
                    map.putAll(toMapFrais((FraisTransactionEntity) entity));
                    break;
                case "banque":
                    map.putAll(toMapBanque((OperationBancaireEntity) entity));
                    break;
                case "redevance":
                    map.putAll(toMapRedevance((RedevanceAgenceParamEntity) entity));
                    break;
                default:
                    // Fallback reflection pour les autres
                    for (Field field : entity.getClass().getDeclaredFields()) {
                        field.setAccessible(true);
                        try {
                            map.put(field.getName(), field.get(entity));
                        } catch (IllegalAccessException ignored) {}
                    }
            }
        } catch (Exception e) {
            // Log l'erreur mais continue
            System.err.println("Erreur mapping " + moduleKey + ": " + e.getMessage());
        }
        return map;
    }
    
    private Map<String, Object> toMapService(ServiceReferenceEntity e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("nom", e.getServiceLabel());
        m.put("libelle", e.getServiceLabel());
        m.put("commentaire", e.getMotif());
        m.put("description", e.getMotif());
        m.put("serviceLabel", e.getServiceLabel());
        m.put("codeReco", e.getCodeReco());
        m.put("codeService", e.getCodeService());
        m.put("pays", e.getPays());
        m.put("status", e.getStatus());
        m.put("motif", e.getMotif());
        m.put("createdAt", e.getCreatedAt());
        m.put("updatedAt", e.getUpdatedAt());
        return m;
    }
    
    private Map<String, Object> toMapCompte(CompteEntity e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("numeroCompte", e.getNumeroCompte());
        m.put("libelle", e.getCategorie()); // Pas de libelle, on utilise categorie
        m.put("type", e.getType());
        m.put("categorie", e.getCategorie());
        m.put("pays", e.getPays());
        m.put("codeProprietaire", e.getCodeProprietaire());
        m.put("agence", e.getAgence());
        m.put("solde", e.getSolde());
        m.put("dateDerniereMaj", e.getDateDerniereMaj());
        return m;
    }
    
    private Map<String, Object> toMapOperation(OperationEntity e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("service", e.getService());
        m.put("typeOperation", e.getTypeOperation());
        m.put("statut", e.getStatut());
        m.put("pays", e.getPays());
        m.put("nomBordereau", e.getNomBordereau());
        m.put("banque", e.getBanque());
        m.put("reference", e.getReference());
        m.put("codeProprietaire", e.getCodeProprietaire());
        m.put("dateOperation", e.getDateOperation());
        m.put("montant", e.getMontant());
        m.put("soldeAvant", e.getSoldeAvant());
        m.put("soldeApres", e.getSoldeApres());
        m.put("nomBordereau", e.getNomBordereau());
        m.put("recordCount", e.getRecordCount());
        return m;
    }
    
    private Map<String, Object> toMapFrais(FraisTransactionEntity e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("service", e.getService());
        m.put("agence", e.getAgence());
        m.put("description", e.getDescription());
        m.put("typeCalcul", e.getTypeCalcul());
        m.put("actif", e.getActif());
        m.put("montantFrais", e.getMontantFrais());
        m.put("pourcentage", e.getPourcentage());
        m.put("dateCreation", e.getDateCreation());
        m.put("dateModification", e.getDateModification());
        return m;
    }
    
    private Map<String, Object> toMapBanque(OperationBancaireEntity e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("pays", e.getPays());
        m.put("codePays", e.getCodePays());
        m.put("mois", e.getMois());
        m.put("agence", e.getAgence());
        m.put("typeOperation", e.getTypeOperation());
        m.put("nomBeneficiaire", e.getNomBeneficiaire());
        m.put("statut", e.getStatut());
        m.put("reconStatus", e.getReconStatus());
        m.put("traitement", e.getTraitement());
        m.put("reference", e.getReference());
        m.put("montant", e.getMontant());
        m.put("modePaiement", e.getModePaiement());
        m.put("compteADebiter", e.getCompteADebiter());
        m.put("dateOperation", e.getDateOperation());
        return m;
    }
    
    private Map<String, Object> toMapRedevance(RedevanceAgenceParamEntity e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("agence", e.getAgence());
        m.put("tauxRedevancePourcentage", e.getTauxRedevancePourcentage());
        m.put("retenueSurGainsPourcentage", e.getRetenueSurGainsPourcentage());
        m.put("retenueSurGainsSeuil", e.getRetenueSurGainsSeuil());
        m.put("taxeJeuxHasardPourcentage", e.getTaxeJeuxHasardPourcentage());
        m.put("tauxRedevancePourcentage", e.getTauxRedevancePourcentage());
        m.put("dateCreation", e.getDateCreation());
        m.put("dateModification", e.getDateModification());
        return m;
    }

    private String getModuleLabel(String moduleKey) {
        return switch (moduleKey) {
            case "services" -> "Services";
            case "comptes" -> "Comptes";
            case "operations" -> "Opérations";
            case "frais" -> "Frais";
            case "commissions" -> "Commissions";
            case "banque" -> "Banque";
            case "redevance" -> "Redevance Loterie";
            case "niveaux-validation" -> "Niveaux Validation";
            default -> moduleKey;
        };
    }

    private boolean matchesSearch(Map<String, Object> map, String search) {
        String lowerSearch = search.toLowerCase();
        return map.values().stream()
            .filter(Objects::nonNull)
            .anyMatch(v -> v.toString().toLowerCase().contains(lowerSearch));
    }

    private Object convertValue(Class<?> type, Object value) {
        if (value == null) return null;
        if (type == Long.class || type == long.class) {
            return Long.valueOf(value.toString());
        }
        if (type == Integer.class || type == int.class) {
            return Integer.valueOf(value.toString());
        }
        if (type == Double.class || type == double.class) {
            return Double.valueOf(value.toString());
        }
        if (type == Boolean.class || type == boolean.class) {
            return Boolean.valueOf(value.toString());
        }
        return value.toString();
    }
}