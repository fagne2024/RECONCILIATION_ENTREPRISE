package com.reconciliation.service;

import com.reconciliation.entity.OperationEntity;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.model.Operation;
import com.reconciliation.repository.OperationRepository;
import com.reconciliation.repository.CompteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.Map;
import java.util.HashMap;

import com.reconciliation.dto.OperationUpdateRequest;
import com.reconciliation.dto.OperationCreateRequest;
import com.reconciliation.entity.FraisTransactionEntity;
import com.reconciliation.repository.AgencySummaryRepository;
import com.reconciliation.entity.AgencySummaryEntity;
import com.reconciliation.dto.OperationBancaireCreateRequest;
import com.reconciliation.repository.OperationBancaireRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class OperationService {
    
    private static final Logger logger = LoggerFactory.getLogger(OperationService.class);
    
    @Autowired
    private OperationRepository operationRepository;
    
    @Autowired
    private CompteRepository compteRepository;
    
    @Autowired
    private FraisTransactionService fraisTransactionService;
    
    @Autowired
    private AgencySummaryRepository agencySummaryRepository;
    
    @Autowired
    private CompteRegroupementService compteRegroupementService;
    
    @Autowired
    private OperationBancaireService operationBancaireService;

    @Autowired
    private OperationBancaireRepository operationBancaireRepository;
    
    @Autowired
    @Lazy
    private OperationService self; // Self-injection pour la gestion transactionnelle
    
    @Autowired
    private PaysFilterService paysFilterService;
    
    public List<Operation> getAllOperations() {
        return getAllOperations(null);
    }
    
    public List<Operation> getAllOperations(String username) {
        try {
            List<OperationEntity> operations;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                // null signifie tous les pays (GNL ou admin)
                if (allowedPays == null) {
                    operations = operationRepository.findAllOrderByDateOperationDesc();
                } else if (allowedPays.isEmpty()) {
                    // Aucun pays autorisé, retourner une liste vide
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    operations = operationRepository.findByPaysInOrderByDateOperationDesc(allowedPays);
                }
            } else {
                // Pas de username, retourner toutes les opérations (comportement par défaut)
                operations = operationRepository.findAllOrderByDateOperationDesc();
            }
            
            return operations.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getAllOperations pour username: {}", username, e);
            e.printStackTrace();
            // En cas d'erreur, retourner une liste vide pour éviter les crashes
            return new ArrayList<>();
        }
    }
    
    public Optional<Operation> getOperationById(Long id) {
        return operationRepository.findById(id)
                .map(this::convertToModel);
    }
    
    public List<Operation> getOperationsByCompteId(Long compteId) {
        return operationRepository.findByCompteIdOrderByDateOperationDesc(compteId).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByCompte(String numeroCompte, LocalDateTime dateDebut, LocalDateTime dateFin, String typeOperation) {
        // Vérifier si le compte est consolidé pour agréger les opérations des services sous-jacents
        try {
            CompteEntity compte = compteRepository.findByNumeroCompte(numeroCompte).orElse(null);
            if (compte != null && compteRegroupementService != null && compteRegroupementService.isCompteConsolide(compte.getId())) {
                // Compte consolidé : récupérer les services depuis codeProprietaire
                String codeProprietaire = compte.getCodeProprietaire();
                if (codeProprietaire != null && !codeProprietaire.trim().isEmpty()) {
                    List<String> services = Arrays.asList(codeProprietaire.split(","));
                    return operationRepository.findByCompteNumeroInAndFiltersOrderByDateOperationDesc(
                            services, dateDebut, dateFin, typeOperation).stream()
                            .map(this::convertToModel)
                            .collect(Collectors.toList());
                }
            }
        } catch (Exception e) {
            logger.warn("Erreur lors de la vérification du compte consolidé pour {}: {}", numeroCompte, e.getMessage());
        }
        
        // Compte normal ou erreur : comportement standard
        return operationRepository.findByCompteNumeroCompteAndFiltersOrderByDateOperationDesc(
                numeroCompte, dateDebut, dateFin, typeOperation).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByCompteForReleve(String numeroCompte, LocalDateTime dateDebut, LocalDateTime dateFin, String typeOperation) {
        // Vérifier si le compte est consolidé pour agréger les opérations des services sous-jacents
        try {
            CompteEntity compte = compteRepository.findByNumeroCompte(numeroCompte).orElse(null);
            if (compte != null && compteRegroupementService != null && compteRegroupementService.isCompteConsolide(compte.getId())) {
                // Compte consolidé : récupérer les services depuis codeProprietaire
                String codeProprietaire = compte.getCodeProprietaire();
                if (codeProprietaire != null && !codeProprietaire.trim().isEmpty()) {
                    List<String> services = Arrays.asList(codeProprietaire.split(","));
                    return operationRepository.findByCompteNumeroInAndFiltersOrderByDateOperationAsc(
                            services, dateDebut, dateFin, typeOperation).stream()
                            .map(this::convertToModel)
                            .collect(Collectors.toList());
                }
            }
        } catch (Exception e) {
            logger.warn("Erreur lors de la vérification du compte consolidé pour {}: {}", numeroCompte, e.getMessage());
        }
        
        // Compte normal ou erreur : comportement standard
        List<OperationEntity> operationsEntities = operationRepository.findByCompteNumeroCompteAndFiltersOrderByDateOperationAsc(
                numeroCompte, dateDebut, dateFin, typeOperation);
        
        
        return operationsEntities.stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByType(String typeOperation) {
        return operationRepository.findByTypeOperationOrderByDateOperationDesc(typeOperation).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByPays(String pays) {
        return operationRepository.findByPaysOrderByDateOperationDesc(pays).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByStatut(String statut) {
        return operationRepository.findByStatutOrderByDateOperationDesc(statut).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByBanque(String banque) {
        return operationRepository.findByBanqueOrderByDateOperationDesc(banque).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByDateRange(LocalDateTime dateDebut, LocalDateTime dateFin) {
        return operationRepository.findByDateOperationBetween(dateDebut, dateFin).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByMontantSuperieurA(Double montantMin) {
        return operationRepository.findByMontantSuperieurAOrderByDateOperationDesc(montantMin).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByCodeProprietaire(String codeProprietaire) {
        return operationRepository.findByCodeProprietaireOrderByDateOperationDesc(codeProprietaire).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByNomBordereau(String nomBordereau) {
        return operationRepository.findByNomBordereauContainingOrderByDateOperationDesc(nomBordereau).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getOperationsByService(String service) {
        return operationRepository.findByServiceOrderByDateOperationDesc(service).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> filterOperations(Long compteId, String typeOperation, String pays, String statut, 
                                          String banque, String codeProprietaire, String service, String nomBordereau, 
                                          LocalDateTime dateDebut, LocalDateTime dateFin) {
        return operationRepository.findFilteredOperationsOrderByDateOperationDesc(
                compteId, typeOperation, pays, statut, banque, codeProprietaire, service, nomBordereau, dateDebut, dateFin)
                .stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<String> getDistinctCodeProprietaire() {
        return operationRepository.findDistinctCodeProprietaire();
    }
    
    public List<String> getDistinctBanque() {
        return operationRepository.findDistinctBanque();
    }
    
    public List<String> getDistinctService() {
        return operationRepository.findDistinctService();
    }
    
    public List<String> getDistinctServiceByCodeProprietaire(String codeProprietaire) {
        return operationRepository.findDistinctServiceByCodeProprietaire(codeProprietaire);
    }
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Operation createAdjustment(Long compteId, double amount, String reason) {
        OperationCreateRequest adjustmentRequest = new OperationCreateRequest();
        adjustmentRequest.setCompteId(compteId);
        adjustmentRequest.setMontant(amount);
        adjustmentRequest.setTypeOperation("ajustement_solde");
        adjustmentRequest.setNomBordereau(reason);
        adjustmentRequest.setBanque("SYSTEM");
        
        return createOperation(adjustmentRequest);
    }
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Operation createOperationForSummary(OperationCreateRequest request) {
        // Créer une seule opération SANS déclencher la logique des 4 opérations
        // Utilisé spécifiquement pour les résumés d'agence
        logger.info("🔧 Création d'une seule opération pour résumé: type={}, compte={}, montant={}", 
                   request.getTypeOperation(), request.getCompteId(), request.getMontant());
        return createSingleOperation(request);
    }
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public OperationEntity createOperationEntityForSummary(OperationCreateRequest request) {
        // Créer une seule opération SANS déclencher la logique des 4 opérations
        // Utilisé spécifiquement pour les résumés d'agence - retourne l'entité
        logger.info("🔧 Création d'une seule opération entité pour résumé: type={}, compte={}, montant={}", 
                   request.getTypeOperation(), request.getCompteId(), request.getMontant());
        
        CompteEntity compte = compteRepository.findById(request.getCompteId())
                .orElseThrow(() -> new IllegalArgumentException("Compte non trouvé avec ID: " + request.getCompteId()));
        
        logger.info("🔧 Compte trouvé: ID={}, Numéro={}, Solde actuel={}", 
                   compte.getId(), compte.getNumeroCompte(), compte.getSolde());

        OperationEntity entity = new OperationEntity();
        entity.setCompte(compte);
        entity.setTypeOperation(request.getTypeOperation());
        entity.setMontant(request.getMontant());
        entity.setBanque(request.getBanque());
        entity.setNomBordereau(request.getNomBordereau());
        entity.setService(request.getService());
        // Convertir la date string en LocalDateTime
        if (request.getDateOperation() != null) {
            // Parser la date string
            LocalDateTime dateTime = LocalDateTime.parse(request.getDateOperation() + "T00:00:00");
            entity.setDateOperation(dateTime);
        }
        entity.setCodeProprietaire(compte.getCodeProprietaire());
        entity.setPays(compte.getPays());
        entity.setRecordCount(request.getRecordCount());
        
        // Calculer les soldes
        double soldeAvant = compte.getSolde();
        double soldeApres = soldeAvant + request.getMontant();
        entity.setSoldeAvant(soldeAvant);
        entity.setSoldeApres(soldeApres);
        
        // Mettre à jour le solde du compte
        compte.setSolde(soldeApres);
        compteRepository.save(compte);
        
        // Sauvegarder l'opération
        OperationEntity savedEntity = operationRepository.save(entity);
        
        logger.info("✅ Opération entité créée avec ID: {}, nouveau solde compte: {}", 
                   savedEntity.getId(), soldeApres);
        
        return savedEntity;
    }
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Operation createSingleOperationForSummary(OperationCreateRequest request) {
        // Créer une seule opération SANS déclencher la logique des 4 opérations
        // Utilisé spécifiquement pour les résumés d'agence
        logger.info("🔧 Création d'une seule opération pour résumé: type={}, compte={}, montant={}", 
                   request.getTypeOperation(), request.getCompteId(), request.getMontant());
        return createSingleOperation(request);
    }
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Operation createOperation(OperationCreateRequest request) {
        // Vérifier si c'est une opération qui doit générer les 4 opérations
        if (shouldCreateFourOperations(request)) {
            return createOperationWithFourOperations(request);
        } else {
            return createSingleOperation(request);
        }
    }
    
    /**
     * Détermine si une opération doit générer les 4 opérations
     */
    private boolean shouldCreateFourOperations(OperationCreateRequest request) {
        // Générer les 4 opérations pour les types total_cashin, total_paiement, annulation_bo et transaction_cree
        // qui ont un service défini et qui ne sont pas déjà des frais
        return ("total_cashin".equals(request.getTypeOperation()) || 
                "total_paiement".equals(request.getTypeOperation()) ||
                "annulation_bo".equals(request.getTypeOperation()) ||
                "transaction_cree".equals(request.getTypeOperation())) 
               && request.getService() != null 
               && !request.getService().trim().isEmpty()
               && !"FRAIS_TRANSACTION".equals(request.getTypeOperation());
    }
    
    /**
     * Crée une opération avec la logique des 4 opérations
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Operation createOperationWithFourOperations(OperationCreateRequest request) {
        System.out.println("=== DÉBUT createOperationWithFourOperations ===");
        System.out.println("DEBUG: 📋 Création manuelle avec logique des 4 opérations");
        System.out.println("DEBUG: 📋 Type: " + request.getTypeOperation() + ", Service: " + request.getService());
        
        // Récupérer le compte agence (compte sélectionné)
        CompteEntity agenceCompte = compteRepository.findById(request.getCompteId())
                .orElseThrow(() -> new IllegalArgumentException("Compte non trouvé avec ID: " + request.getCompteId()));
        
        String agence = agenceCompte.getNumeroCompte();
        String service = request.getService();
        String dateStr = request.getDateOperation() != null ? 
            request.getDateOperation().substring(0, 10) : 
            LocalDateTime.now().toLocalDate().toString();
        
        System.out.println("DEBUG: 📋 Agence: " + agence + ", Service: " + service + ", Date: " + dateStr);
        
        // 1. Créer le compte service s'il n'existe pas
        CompteEntity serviceCompte = createOrGetServiceCompte(service, agence, agenceCompte.getPays());
        
        // 2. Créer l'opération nominale agence (comportement existant)
        OperationCreateRequest agenceOperationRequest = new OperationCreateRequest();
        agenceOperationRequest.setCompteId(agenceCompte.getId());
        agenceOperationRequest.setTypeOperation(request.getTypeOperation());
        agenceOperationRequest.setMontant(request.getMontant());
        agenceOperationRequest.setBanque(request.getBanque());
        agenceOperationRequest.setNomBordereau("AGENCY_SUMMARY_" + dateStr + "_" + agence);
        agenceOperationRequest.setService(service);
        agenceOperationRequest.setDateOperation(request.getDateOperation());
        agenceOperationRequest.setRecordCount(request.getRecordCount());
        
        System.out.println("DEBUG: 🔧 Création opération nominale agence");
        Operation agenceOperation = createSingleOperation(agenceOperationRequest);
        
        // 3. Créer l'opération nominale service (nouvelle logique)
        OperationCreateRequest serviceOperationRequest = new OperationCreateRequest();
        serviceOperationRequest.setCompteId(serviceCompte.getId());
        serviceOperationRequest.setTypeOperation(request.getTypeOperation());
        serviceOperationRequest.setMontant(request.getMontant());
        serviceOperationRequest.setBanque(request.getBanque());
        serviceOperationRequest.setNomBordereau("SERVICE_SUMMARY_" + dateStr + "_" + service);
        serviceOperationRequest.setService(agence); // L'agence devient le service
        serviceOperationRequest.setDateOperation(request.getDateOperation());
        serviceOperationRequest.setRecordCount(request.getRecordCount());
        
        System.out.println("DEBUG: 🔧 Création opération nominale service");
        createSingleOperation(serviceOperationRequest);
        
        System.out.println("DEBUG: ✅ Création des 4 opérations terminée");
        System.out.println("=== FIN createOperationWithFourOperations ===");
        
        // Retourner l'opération agence comme opération principale
        return agenceOperation;
    }
    
    /**
     * Crée ou récupère le compte service
     */
    private CompteEntity createOrGetServiceCompte(String serviceName, String agence, String pays) {
        // Chercher le compte service existant
        Optional<CompteEntity> existingServiceCompte = compteRepository.findByNumeroCompte(serviceName);
        
        if (existingServiceCompte.isPresent()) {
            System.out.println("DEBUG: ✅ Compte service existant trouvé: " + serviceName);
            return existingServiceCompte.get();
        } else {
            // Créer un nouveau compte service
            System.out.println("DEBUG: ➕ Création d'un nouveau compte service: " + serviceName);
            CompteEntity newServiceCompte = new CompteEntity();
            newServiceCompte.setNumeroCompte(serviceName);
            newServiceCompte.setPays(pays != null ? pays : "CM");
            newServiceCompte.setCodeProprietaire(serviceName);
            newServiceCompte.setAgence(agence); // L'agence reste la même
            newServiceCompte.setSolde(0.0);
            newServiceCompte.setDateDerniereMaj(LocalDateTime.now());
            
            CompteEntity savedServiceCompte = compteRepository.save(newServiceCompte);
            System.out.println("DEBUG: ✅ Nouveau compte service créé avec ID: " + savedServiceCompte.getId());
            return savedServiceCompte;
        }
    }
    
    /**
     * Crée une opération simple (logique existante)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Operation createSingleOperation(OperationCreateRequest request) {
        logger.info("🔧 createSingleOperation appelée: compteId={}, type={}, montant={}", 
                   request.getCompteId(), request.getTypeOperation(), request.getMontant());
        
        CompteEntity compte = compteRepository.findById(request.getCompteId())
                .orElseThrow(() -> new IllegalArgumentException("Compte non trouvé avec ID: " + request.getCompteId()));
        
        logger.info("🔧 Compte trouvé: ID={}, Numéro={}, Solde actuel={}", 
                   compte.getId(), compte.getNumeroCompte(), compte.getSolde());

        OperationEntity entity = new OperationEntity();
        entity.setCompte(compte);
        entity.setTypeOperation(request.getTypeOperation());
        entity.setMontant(request.getMontant());
        entity.setBanque(request.getBanque());
        entity.setNomBordereau(request.getNomBordereau());
        entity.setService(request.getService());
        // Date de l'opération : utiliser celle du DTO si fournie, sinon maintenant
        if (request.getDateOperation() != null && !request.getDateOperation().isEmpty()) {
            try {
                System.out.println("DEBUG: Parsing date: " + request.getDateOperation());
                // Si la date fournie ne contient pas d'heure, on ajoute l'heure courante
                if (request.getDateOperation().length() == 10) { // format yyyy-MM-dd
                    java.time.LocalDate date = java.time.LocalDate.parse(request.getDateOperation());
                    java.time.LocalTime now = java.time.LocalTime.now();
                    entity.setDateOperation(date.atTime(now));
                } else {
                    entity.setDateOperation(java.time.LocalDateTime.parse(request.getDateOperation()));
                }
                System.out.println("DEBUG: Date parsée: " + entity.getDateOperation());
            } catch (Exception e) {
                System.out.println("DEBUG: Erreur parsing date: " + e.getMessage());
                entity.setDateOperation(LocalDateTime.now()); // fallback si parsing échoue
            }
        } else {
            entity.setDateOperation(LocalDateTime.now());
        }
        entity.setPays(compte.getPays());
        entity.setCodeProprietaire(compte.getNumeroCompte());
        entity.setRecordCount(request.getRecordCount());
        entity.setParentOperationId(request.getParentOperationId()); // Ajouter cette ligne

        // Générer automatiquement la référence pour les opérations Compense_client
        if ("Compense_client".equals(request.getTypeOperation())) {
            String reference = generateCompenseClientReference(compte.getNumeroCompte(), entity.getDateOperation(), null, request.getReferenceType());
            entity.setReference(reference);
        }
        
        // Générer automatiquement la référence pour les opérations Appro_client
        if ("Appro_client".equals(request.getTypeOperation())) {
            String reference = generateApproClientReference(compte.getNumeroCompte(), entity.getDateOperation(), null, request.getReferenceType());
            entity.setReference(reference);
        }
        
        // Générer automatiquement la référence pour les opérations Appro_fournisseur
        if ("Appro_fournisseur".equals(request.getTypeOperation())) {
            String reference = generateApproFournisseurReference(compte.getNumeroCompte(), entity.getDateOperation(), null, request.getReferenceType());
            entity.setReference(reference);
        }
        
        // Générer automatiquement la référence pour les opérations Compense_fournisseur
        if ("Compense_fournisseur".equals(request.getTypeOperation())) {
            String reference = generateCompenseFournisseurReference(compte.getNumeroCompte(), entity.getDateOperation(), null, request.getReferenceType());
            entity.setReference(reference);
        }
        
        // Générer automatiquement la référence pour les opérations nivellement
        if ("nivellement".equals(request.getTypeOperation())) {
            String reference = generateNivellementReference(compte.getNumeroCompte(), entity.getDateOperation(), null);
            entity.setReference(reference);
        }

        double soldeAvant = compte.getSolde();
        entity.setSoldeAvant(soldeAvant);
        double impact = calculateImpact(entity.getTypeOperation(), entity.getMontant(), entity.getService());
        double soldeApres = soldeAvant + impact;

        logger.info("🔧 Calcul solde: soldeAvant={}, impact={}, soldeApres={}", 
                   soldeAvant, impact, soldeApres);

        // Par défaut, statut 'Validée' pour toutes les opérations
            entity.setStatut("Validée");
            entity.setSoldeApres(soldeApres);
            compte.setSolde(soldeApres);
            compte.setDateDerniereMaj(LocalDateTime.now());
            compteRepository.save(compte);
            
            logger.info("✅ Solde du compte {} mis à jour: {} -> {}", 
                       compte.getNumeroCompte(), soldeAvant, soldeApres);
            
            // Synchroniser les comptes consolidés si ce compte est regroupé
            synchroniserComptesConsolides(compte.getId());

        OperationEntity savedEntity = operationRepository.save(entity);
        
        // Créer automatiquement les frais de transaction si applicable
        // Pour toutes les opérations qui ont un service défini et qui ne sont pas déjà des frais
        if (entity.getService() != null && !"FRAIS_TRANSACTION".equals(entity.getTypeOperation())) {
            createFraisTransactionAutomatique(savedEntity);
        }
        
        // Créer automatiquement une opération bancaire pour les types Compense_client, Appro_client, nivellement et régularisation_solde
        logger.info("🔍 Vérification du type d'opération pour création bancaire: {}", entity.getTypeOperation());
        if ("Compense_client".equals(entity.getTypeOperation()) || 
            "Appro_client".equals(entity.getTypeOperation()) || 
            "nivellement".equals(entity.getTypeOperation()) ||
            "régularisation_solde".equals(entity.getTypeOperation())) {
            logger.info("✅ Type d'opération détecté pour création bancaire automatique: {}", entity.getTypeOperation());
            createOperationBancaireAutomatique(savedEntity, compte);
        } else {
            logger.info("ℹ️ Type d'opération non éligible pour création bancaire: {}", entity.getTypeOperation());
        }
        
        return convertToModel(savedEntity);
    }

    @Transactional
    public Operation updateOperation(Long id, OperationUpdateRequest request) {
        OperationEntity operationToUpdate = operationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Opération non trouvée avec ID: " + id));

        CompteEntity compte = operationToUpdate.getCompte();
        if (compte == null) {
            throw new IllegalStateException("L'opération à modifier n'est pas associée à un compte.");
        }

        // Sauvegarder l'ancien type d'opération pour vérifier s'il a changé
        String oldTypeOperation = operationToUpdate.getTypeOperation();
        double oldImpact = operationToUpdate.getSoldeApres() - operationToUpdate.getSoldeAvant();
        
        // Mettre à jour les champs modifiables
        operationToUpdate.setTypeOperation(request.getTypeOperation());
        operationToUpdate.setMontant(request.getMontant());
        operationToUpdate.setBanque(request.getBanque());
        operationToUpdate.setNomBordereau(request.getNomBordereau());
        operationToUpdate.setService(request.getService());
        
        // Mettre à jour la date d'opération si fournie
        if (request.getDateOperation() != null && !request.getDateOperation().isEmpty()) {
            try {
                operationToUpdate.setDateOperation(java.time.LocalDate.parse(request.getDateOperation()).atStartOfDay());
            } catch (Exception e) {
                System.out.println("DEBUG: Erreur parsing date de mise à jour: " + e.getMessage());
                // Ne pas changer la date si le parsing échoue
            }
        }

        // Générer une nouvelle référence si le type d'opération a changé OU si la référence n'existe pas pour un type auto-généré
        System.out.println("DEBUG: 🔄 Vérification de la génération de référence");
        System.out.println("DEBUG: Ancien type: " + oldTypeOperation);
        System.out.println("DEBUG: Nouveau type: " + request.getTypeOperation());
        System.out.println("DEBUG: Types égaux? " + (request.getTypeOperation() != null && request.getTypeOperation().equals(oldTypeOperation)));
        System.out.println("DEBUG: Référence actuelle: " + operationToUpdate.getReference());
        
        boolean shouldGenerateReference = false;
        String reason = "";
        
        // Vérifier si le type d'opération a changé
        if (request.getTypeOperation() != null && !request.getTypeOperation().equals(oldTypeOperation)) {
            shouldGenerateReference = true;
            reason = "Type d'opération changé";
        }
        // Vérifier si la référence n'existe pas pour un type auto-généré
        else if (request.getTypeOperation() != null && 
                 (operationToUpdate.getReference() == null || operationToUpdate.getReference().trim().isEmpty()) &&
                 isAutoGeneratedReferenceType(request.getTypeOperation())) {
            shouldGenerateReference = true;
            reason = "Référence manquante pour type auto-généré";
        }
        
        if (shouldGenerateReference) {
            System.out.println("DEBUG: ✅ " + reason + ", génération de nouvelle référence");
            String newReference = generateReferenceForOperationType(
                request.getTypeOperation(), 
                operationToUpdate.getCodeProprietaire(), 
                operationToUpdate.getDateOperation(),
                operationToUpdate.getId()
            );
            System.out.println("DEBUG: Nouvelle référence générée: " + newReference);
            if (newReference != null) {
                operationToUpdate.setReference(newReference);
                System.out.println("DEBUG: ✅ Référence mise à jour dans l'entité: " + operationToUpdate.getReference());
            } else {
                System.out.println("DEBUG: ❌ Aucune référence générée (null), référence inchangée");
            }
        } else {
            System.out.println("DEBUG: ❌ Pas de génération de référence nécessaire");
        }

        // Recalculer le nouvel impact et le solde après
        double newImpact = calculateImpact(request.getTypeOperation(), request.getMontant(), request.getService());
        operationToUpdate.setSoldeApres(operationToUpdate.getSoldeAvant() + newImpact);

        double impactDifference = newImpact - oldImpact;

        // Mettre à jour les opérations suivantes
        List<OperationEntity> subsequentOps = operationRepository
            .findByCompteIdAndDateOperationAfterOrderByDateOperationAsc(compte.getId(), operationToUpdate.getDateOperation());
            
        for (OperationEntity op : subsequentOps) {
            op.setSoldeAvant(op.getSoldeAvant() + impactDifference);
            op.setSoldeApres(op.getSoldeApres() + impactDifference);
        }
        
        // Mettre à jour le solde du compte
        compte.setSolde(compte.getSolde() + impactDifference);
        
        // Synchroniser les comptes consolidés si ce compte est regroupé
        synchroniserComptesConsolides(compte.getId());
        
        // Autoriser les soldes négatifs (suppression de la contrainte)
        
        compteRepository.save(compte);
        OperationEntity savedEntity = operationRepository.save(operationToUpdate);
        
        return convertToModel(savedEntity);
    }
    
    /**
     * Recalcule le solde de clôture du compte basé sur toutes les opérations valides
     * Garantit que le solde de clôture est toujours égal au solde en cours du compte
     */
    @Transactional
    public void recalculerSoldeClotureCompte(Long compteId) {
        try {
            CompteEntity compte = compteRepository.findById(compteId)
                .orElseThrow(() -> new RuntimeException("Compte non trouvé: " + compteId));
            
            // Récupérer toutes les opérations (incluant les annulations et tous les statuts)
            // Utiliser findAll puis filtrer par compte pour éviter les filtres automatiques
            List<OperationEntity> operationsValides = operationRepository
                .findAll()
                .stream()
                .filter(op -> compteId.equals(op.getCompte().getId()))
                .sorted((op1, op2) -> op1.getDateOperation().compareTo(op2.getDateOperation()))
                .collect(Collectors.toList());
            
            
            if (!operationsValides.isEmpty()) {
                // Le solde de clôture est le solde après de la dernière opération
                double soldeCloture = operationsValides.get(operationsValides.size() - 1).getSoldeApres();
                
                
                
                // Mettre à jour le solde du compte avec le solde de clôture
                compte.setSolde(soldeCloture);
                compte.setDateDerniereMaj(LocalDateTime.now());
                compteRepository.save(compte);
                
                // Synchroniser les comptes consolidés si ce compte est regroupé
                synchroniserComptesConsolides(compteId);
            } else {
                logger.warn("⚠️ Aucune opération valide trouvée pour le compte {}, solde inchangé", compte.getNumeroCompte());
            }
        } catch (Exception e) {
            logger.error("❌ Erreur lors du recalcul du solde de clôture pour le compte {}: {}", compteId, e.getMessage(), e);
            throw new RuntimeException("Erreur lors du recalcul du solde de clôture", e);
        }
    }

    @Transactional
    public boolean deleteOperation(Long id) {
        Optional<OperationEntity> optionalOperation = operationRepository.findById(id);
        if (optionalOperation.isPresent()) {
            OperationEntity operation = optionalOperation.get();
            
            logger.info("🗑️ Suppression de l'opération ID: {} (Type: {}, Montant: {}) - AUCUN IMPACT sur le solde", 
                       id, operation.getTypeOperation(), operation.getMontant());
            
            // Supprimer l'opération SANS recalculer le solde
            // La suppression ne doit pas avoir d'impact sur le solde selon les spécifications
            operationRepository.deleteById(id);
            
            logger.info("✅ Opération ID: {} supprimée avec succès (aucun impact sur le solde)", id);
            
            return true;
        }
        logger.warn("⚠️ Opération ID: {} introuvable pour suppression", id);
        return false;
    }
    
    @Transactional
    public boolean updateOperationStatut(Long id, String nouveauStatut) {
        Optional<OperationEntity> optionalOperation = operationRepository.findById(id);
        if (optionalOperation.isPresent()) {
            OperationEntity operation = optionalOperation.get();
            if ("Validée".equals(nouveauStatut)) {
                CompteEntity compte = operation.getCompte();

                // Déterminer le solde chronologique juste avant cette opération (pas le solde courant du compte)
                double soldeAvantChronologique = 0.0;
                try {
                    List<OperationEntity> operationsPrecedentes = operationRepository
                        .findAll()
                        .stream()
                        .filter(op -> op.getCompte() != null && op.getCompte().getId().equals(compte.getId()))
                        .filter(op -> op.getDateOperation().isBefore(operation.getDateOperation()))
                        .sorted((o1, o2) -> o1.getDateOperation().compareTo(o2.getDateOperation()))
                        .collect(java.util.stream.Collectors.toList());
                    if (!operationsPrecedentes.isEmpty()) {
                        OperationEntity derniere = operationsPrecedentes.get(operationsPrecedentes.size() - 1);
                        if (derniere.getSoldeApres() != null) {
                            soldeAvantChronologique = derniere.getSoldeApres();
                        }
                    }
                } catch (Exception e) {
                    logger.warn("⚠️ Impossible de déterminer le solde chronologique avant l'opération {}: {}", id, e.getMessage());
                }

                double impact = calculateImpact(operation.getTypeOperation(), operation.getMontant(), operation.getService());

                // Mettre à jour cette opération selon la chronologie
                operation.setSoldeAvant(soldeAvantChronologique);
                operation.setSoldeApres(soldeAvantChronologique + impact);
                
                // Mettre à jour le solde du compte
                // Le solde du compte sera harmonisé par le recalcul de clôture; on met à jour provisoirement
                compte.setSolde(operation.getSoldeApres());
                compte.setDateDerniereMaj(LocalDateTime.now());
                compteRepository.save(compte);
                
                // Synchroniser les comptes consolidés si ce compte est regroupé
                synchroniserComptesConsolides(compte.getId());
                
                // Mettre à jour les soldes des opérations suivantes
                List<OperationEntity> operationsSuivantes = operationRepository
                    .findByCompteIdAndDateOperationAfterOrderByDateOperationAsc(compte.getId(), operation.getDateOperation());
                
                double soldeCourant = operation.getSoldeApres();
                for (OperationEntity opSuivante : operationsSuivantes) {
                    opSuivante.setSoldeAvant(soldeCourant);
                    double impactOpSuivante = calculateImpact(opSuivante.getTypeOperation(), opSuivante.getMontant(), opSuivante.getService());
                    soldeCourant += impactOpSuivante;
                    opSuivante.setSoldeApres(soldeCourant);
                }
                
                if (!operationsSuivantes.isEmpty()) {
                    operationRepository.saveAll(operationsSuivantes);
                }
                
                // Synchroniser les comptes consolidés si ce compte est regroupé
                synchroniserComptesConsolides(compte.getId());
            }
            
            // Logique d'annulation obsolète supprimée - gérée par la logique simplifiée ci-dessous
            
            operation.setStatut(nouveauStatut);
            operationRepository.save(operation);

            // Synchroniser le statut sur l'opération bancaire liée
            try {
                List<com.reconciliation.entity.OperationBancaireEntity> obList = operationBancaireRepository.findByOperationId(operation.getId());
                for (com.reconciliation.entity.OperationBancaireEntity ob : obList) {
                    // Règle: si l'opération est Annulée -> statut bancaire Rejetée
                    if ("Annulée".equalsIgnoreCase(nouveauStatut)) {
                        ob.setStatut("Rejetée");
                    } else {
                        ob.setStatut(nouveauStatut);
                    }
                    operationBancaireRepository.save(ob);
                }
            } catch (Exception e) {
                logger.warn("⚠️ Synchronisation statut opérations bancaires liée à {} impossible: {}", id, e.getMessage());
            }

            // Suppression dans agency_summary si statut Annulée ou Rejetée ET type concerné
            if (("Annulée".equals(nouveauStatut) || "Rejetée".equals(nouveauStatut)) &&
                ("total_cashin".equals(operation.getTypeOperation()) || "total_paiement".equals(operation.getTypeOperation()))) {
                String date = operation.getDateOperation().toLocalDate().toString();
                String agency = operation.getCodeProprietaire();
                String service = operation.getService();
                agencySummaryRepository.deleteByDateAndAgencyAndService(date, agency, service);
            }

            // Création d'une nouvelle ligne d'annulation si le statut devient "Annulée"
            if ("Annulée".equals(nouveauStatut)) {
                CompteEntity compte = operation.getCompte();
                if (compte != null) {
                    try {
                    // 1. Créer une nouvelle opération d'annulation
                    String typeOriginal = operation.getTypeOperation();
                    String typeAnnulation = "annulation_" + typeOriginal;
                    
                    // 2. Créer le nom du bordereau pour l'annulation
                    String nomBordereauOriginal = operation.getNomBordereau();
                    String nomBordereauAnnulation = "ANNULATION_" + nomBordereauOriginal;
                    
                    // 3. Calculer l'impact inverse et créer la nouvelle ligne
                    double soldeActuel = compte.getSolde();
                    double impactOriginal = calculateImpact(typeOriginal, operation.getMontant(), operation.getService());
                    double impactInverse = -impactOriginal; // Impact inverse
                    double soldeApres = soldeActuel + impactInverse;
                    
                    logger.info("🔄 Création ligne d'annulation - Solde actuel: {}, Impact inverse: {}, Solde après: {}", 
                               soldeActuel, impactInverse, soldeApres);
                    
                    // 4. Créer la nouvelle opération d'annulation
                    OperationEntity operationAnnulation = new OperationEntity();
                    operationAnnulation.setCompte(compte);
                    operationAnnulation.setTypeOperation(typeAnnulation);
                    operationAnnulation.setMontant(operation.getMontant() != null ? operation.getMontant() : 0.0);
                    operationAnnulation.setService(operation.getService());
                    operationAnnulation.setDateOperation(operation.getDateOperation());
                    operationAnnulation.setNomBordereau(nomBordereauAnnulation);
                    operationAnnulation.setCodeProprietaire(operation.getCodeProprietaire());
                    operationAnnulation.setPays(operation.getPays());
                    operationAnnulation.setStatut("Annulée");
                    operationAnnulation.setSoldeAvant(soldeActuel);
                    operationAnnulation.setSoldeApres(soldeApres);
                    operationAnnulation.setReference(operation.getReference());
                    
                    // 5. Sauvegarder la nouvelle opération d'annulation
                    operationRepository.save(operationAnnulation);
                    
                    logger.info("✅ Nouvelle ligne d'annulation créée - Type: {}, Montant: {}, Solde: {} → {}", 
                               typeAnnulation, operation.getMontant(), soldeActuel, soldeApres);
                    
                    // 6. Annuler automatiquement les frais liés à l'opération originale
                    List<OperationEntity> fraisOperations = operationRepository.findFraisByParentOperationId(operation.getId());
                    logger.info("🔍 Recherche des frais liés à l'opération ID: {} - Nombre trouvé: {}", 
                               operation.getId(), fraisOperations.size());
                    
                    // Variable pour suivre le solde final après toutes les annulations
                    double soldeFinal = soldeApres;
                    
                    for (OperationEntity fraisOp : fraisOperations) {
                        if (!"Annulée".equals(fraisOp.getStatut())) {
                            logger.info("💰 Création ligne d'annulation pour frais ID: {}", fraisOp.getId());
                            
                            // Vérifications de sécurité
                            if (fraisOp.getMontant() == null) {
                                logger.warn("⚠️ Frais ID: {} a un montant null, ignoré", fraisOp.getId());
                                continue;
                            }
                            
                            // Créer une nouvelle ligne d'annulation pour le frais
                            OperationEntity fraisAnnulation = new OperationEntity();
                            fraisAnnulation.setCompte(compte);
                            fraisAnnulation.setTypeOperation("annulation_FRAIS_TRANSACTION");
                            fraisAnnulation.setMontant(fraisOp.getMontant());
                            fraisAnnulation.setService(fraisOp.getService());
                            fraisAnnulation.setDateOperation(fraisOp.getDateOperation());
                            fraisAnnulation.setNomBordereau("ANNULATION_FRAIS_" + (fraisOp.getNomBordereau() != null ? fraisOp.getNomBordereau() : ""));
                            fraisAnnulation.setCodeProprietaire(fraisOp.getCodeProprietaire());
                            fraisAnnulation.setPays(fraisOp.getPays());
                            fraisAnnulation.setStatut("Annulée");
                            fraisAnnulation.setSoldeAvant(soldeFinal); // Solde après les annulations précédentes
                            double soldeApresFrais = soldeFinal + fraisOp.getMontant(); // Impact inverse des frais
                            fraisAnnulation.setSoldeApres(soldeApresFrais);
                            fraisAnnulation.setReference(fraisOp.getReference());
                            
                            // Mettre à jour le solde final
                            soldeFinal = soldeApresFrais;
                            
                            // Sauvegarder la nouvelle ligne d'annulation des frais
                            operationRepository.save(fraisAnnulation);
                            
                            logger.info("✅ Ligne d'annulation frais créée - Type: {}, Montant: {}, Solde: {} → {}", 
                                       "annulation_FRAIS_TRANSACTION", fraisOp.getMontant(), 
                                       fraisAnnulation.getSoldeAvant(), fraisAnnulation.getSoldeApres());
                        } else {
                            logger.info("⚠️ Frais ID: {} déjà annulé, ignoré", fraisOp.getId());
                        }
                    }
                    
                    // 7. Mettre à jour le solde du compte avec le solde après de la dernière ligne d'annulation
                    compte.setSolde(soldeFinal);
                    compte.setDateDerniereMaj(LocalDateTime.now());
                    compteRepository.save(compte);
                    
                    // 8. Synchroniser les comptes consolidés si ce compte est regroupé
                    synchroniserComptesConsolides(compte.getId());
                    
                    } catch (Exception e) {
                        logger.error("❌ Erreur lors de la création des lignes d'annulation pour l'opération ID: {}: {}", id, e.getMessage(), e);
                        throw new RuntimeException("Erreur lors de l'annulation de l'opération", e);
                    }
                }
            }
            return true;
        }
        return false;
    }
    
    @Transactional
    public int bulkUpdateOperationStatut(List<Long> ids, String nouveauStatut) {
        if (ids == null || ids.isEmpty() || nouveauStatut == null || nouveauStatut.isEmpty()) {
            return 0;
        }
        int updated = 0;
        for (Long id : ids) {
            try {
                boolean ok = updateOperationStatut(id, nouveauStatut);
                if (ok) {
                    updated++;
                }
            } catch (Exception ex) {
                logger.warn("⚠️ Echec maj statut pour operation {}: {}", id, ex.getMessage());
            }
        }
        return updated;
    }
    
    /**
     * Détermine si une opération est un débit (diminue le solde)
     */
    private boolean isDebitOperation(String typeOperation) {
        return "total_cashin".equals(typeOperation) || 
               "Compense_client".equals(typeOperation) || 
               "Compense_fournisseur".equals(typeOperation) ||
               "FRAIS_TRANSACTION".equals(typeOperation) ||
               "annulation_partenaire".equals(typeOperation) ||
               "annulation_bo".equals(typeOperation) ||
               "transaction_cree".equals(typeOperation);
    }
    
    /**
     * Détermine si une opération est un crédit (augmente le solde)
     */
    private boolean isCreditOperation(String typeOperation) {
        return "total_paiement".equals(typeOperation) || 
               "Appro_client".equals(typeOperation) ||
               "Appro_fournisseur".equals(typeOperation);
    }
    
    /**
     * Détermine si une opération est un ajustement (peut être positif ou négatif)
     */
    private boolean isAjustementOperation(String typeOperation) {
        return "ajustement".equals(typeOperation) ||
               "nivellement".equals(typeOperation) ||
               "régularisation_solde".equals(typeOperation);
    }
    
    private double calculateImpact(String typeOperation, double montant, String service) {
        // Traitement des opérations d'annulation
        if (typeOperation.startsWith("annulation_")) {
            // Extraire le type d'origine (enlever le préfixe 'annulation_')
            String typeOrigine = typeOperation.substring(11); // 'annulation_'.length = 11
            
            // Calculer l'impact inverse de l'opération d'origine
            if ("FRAIS_TRANSACTION".equals(typeOrigine)) {
                // Les frais sont toujours des débits, donc l'annulation des frais est un crédit
                return montant; // crédit (positif)
            } else if ("total_paiement".equals(typeOrigine)) {
                // total_paiement est un crédit, donc l'annulation est un débit
                return -montant; // débit (négatif)
            } else if ("total_cashin".equals(typeOrigine)) {
                // total_cashin est un débit, donc l'annulation est un crédit
                return montant; // crédit (positif)
            } else if ("Appro_client".equals(typeOrigine)) {
                // Appro_client est un crédit, donc l'annulation est un débit
                return -montant; // débit (négatif)
            } else if ("Appro_fournisseur".equals(typeOrigine)) {
                // Appro_fournisseur est un crédit, donc l'annulation est un débit
                return -montant; // débit (négatif)
            } else if ("Compense_client".equals(typeOrigine)) {
                // Compense_client est un débit, donc l'annulation est un crédit
                return montant; // crédit (positif)
            } else if ("Compense_fournisseur".equals(typeOrigine)) {
                // Compense_fournisseur est un débit, donc l'annulation est un crédit
                return montant; // crédit (positif)
            } else if ("ajustement".equals(typeOrigine)) {
                // ajustement peut être positif ou négatif, l'annulation inverse le signe
                return -montant; // inverse du montant
            } else if ("nivellement".equals(typeOrigine)) {
                // nivellement peut être positif ou négatif, l'annulation inverse le signe
                return -montant; // inverse du montant
            } else if ("régularisation_solde".equals(typeOrigine)) {
                // régularisation_solde peut être positif ou négatif, l'annulation inverse le signe
                return -montant; // inverse du montant
            } else {
                // Pour les autres types, utiliser la logique par défaut
                if (isDebitOperation(typeOrigine)) {
                    return montant; // Si l'original était un débit, l'annulation est un crédit
                } else if (isCreditOperation(typeOrigine)) {
                    return -montant; // Si l'original était un crédit, l'annulation est un débit
                }
            }
        }
        
        if ("annulation_bo".equals(typeOperation)) {
            if (service != null) {
                String s = service.toLowerCase();
                if (s.contains("cashin")) {
                    return montant; // crédit (positif)
                } else if (s.contains("paiement")) {
                    return -Math.abs(montant); // débit (négatif)
                }
            }
            // Par défaut, comportement précédent pour annulation_bo
            return -montant;
        }
        if ("transaction_cree".equals(typeOperation)) {
            if (service != null) {
                String s = service.toLowerCase();
                if (s.contains("cashin") || s.contains("send") || s.contains("airtime")) {
                    return -montant;
                } else if (s.contains("paiement")) {
                    return montant;
                }
            }
            // Par défaut, comportement précédent
            return -montant;
        }
        // TSOP: même logique que transaction_cree
        // Si service est CASHIN → montant en débit (négatif)
        // Si service est PAIEMENT → montant en crédit (positif)
        if ("tsop".equals(typeOperation) || typeOperation.toUpperCase().contains("TSOP")) {
            if (service != null) {
                String s = service.toLowerCase();
                if (s.contains("cashin") || s.contains("send") || s.contains("airtime")) {
                    return -montant;
                } else if (s.contains("paiement")) {
                    return montant;
                }
            }
            // Par défaut, comportement comme cashin (débit)
            return -montant;
        }
        if (isDebitOperation(typeOperation)) {
            return -montant;
        } else if (isCreditOperation(typeOperation)) {
            return montant;
        } else if (isAjustementOperation(typeOperation)) {
            return montant;
        }
        return 0; // Ou une autre logique par défaut
    }
    
    private Operation convertToModel(OperationEntity entity) {
        Operation op = new Operation(
                entity.getId(),
                entity.getTypeOperation(),
                entity.getDateOperation(),
                entity.getCodeProprietaire(),
                entity.getService(),
                entity.getMontant(),
                entity.getSoldeAvant(),
                entity.getSoldeApres(),
                entity.getNomBordereau(),
                entity.getBanque(),
                entity.getStatut(),
                entity.getPays(),
                entity.getCompte() != null ? entity.getCompte().getId() : null,
                entity.getRecordCount()
        );
        op.setParentOperationId(entity.getParentOperationId());
        op.setReference(entity.getReference());
        return op;
    }
    
    
    public Map<String, Object> getStatsByType() {
        Map<String, Object> stats = new HashMap<>();
        
        // Récupérer toutes les opérations
        List<Operation> allOperations = getAllOperations();
        
        // Filtrer pour exclure toutes les annulations sauf annulation_bo
        List<Operation> filteredOperations = allOperations.stream()
                .filter(op -> {
                    String typeOperation = op.getTypeOperation();
                    // Garder annulation_bo, exclure toutes les autres annulations
                    if (typeOperation != null && typeOperation.startsWith("annulation_")) {
                        return typeOperation.equals("annulation_bo");
                    }
                    return true;
                })
                .collect(Collectors.toList());
        
        // Grouper par type d'opération
        Map<String, List<Operation>> operationsByType = filteredOperations.stream()
                .collect(Collectors.groupingBy(Operation::getTypeOperation));
        
        // Calculer les statistiques pour chaque type
        for (Map.Entry<String, List<Operation>> entry : operationsByType.entrySet()) {
            String typeOperation = entry.getKey();
            List<Operation> operations = entry.getValue();
            
            Map<String, Object> typeStats = new HashMap<>();
            typeStats.put("count", operations.size());
            typeStats.put("totalAmount", operations.stream().mapToDouble(Operation::getMontant).sum());
            
            stats.put(typeOperation, typeStats);
        }
        
        return stats;
    }
    
    public Map<String, Object> getStatsByTypeWithFilters(String pays, Long compteId) {
        Map<String, Object> stats = new HashMap<>();
        
        // Récupérer toutes les opérations
        List<Operation> allOperations = getAllOperations();
        
        // Appliquer les filtres
        List<Operation> filteredOperations = allOperations.stream()
                .filter(op -> pays == null || pays.isEmpty() || pays.equals(op.getPays()))
                .filter(op -> compteId == null || compteId.equals(op.getCompteId()))
                .filter(op -> {
                    String typeOperation = op.getTypeOperation();
                    // Garder annulation_bo, exclure toutes les autres annulations
                    if (typeOperation != null && typeOperation.startsWith("annulation_")) {
                        return typeOperation.equals("annulation_bo");
                    }
                    return true;
                })
                .collect(Collectors.toList());
        
        // Grouper par type d'opération
        Map<String, List<Operation>> operationsByType = filteredOperations.stream()
                .collect(Collectors.groupingBy(Operation::getTypeOperation));
        
        // Calculer les statistiques pour chaque type
        for (Map.Entry<String, List<Operation>> entry : operationsByType.entrySet()) {
            String typeOperation = entry.getKey();
            List<Operation> operations = entry.getValue();
            
            Map<String, Object> typeStats = new HashMap<>();
            typeStats.put("count", operations.size());
            typeStats.put("totalAmount", operations.stream().mapToDouble(Operation::getMontant).sum());
            
            stats.put(typeOperation, typeStats);
        }
        
        return stats;
    }
    
    /**
     * Créer automatiquement une opération de frais de transaction
     * AMÉLIORATION : Garantir que les données AgencySummary sont disponibles
     * NOUVELLE LOGIQUE : Gérer les opérations service avec les mêmes frais que les opérations agence
     */
    public void createFraisTransactionAutomatique(OperationEntity operation) {
        System.out.println("=== DÉBUT createFraisTransactionAutomatique ===");
        System.out.println("DEBUG: 📋 Opération: " + operation.getTypeOperation() + " - " + operation.getService() + " - " + operation.getCodeProprietaire());
        
        // Vérifier si l'opération a un service défini
        if (operation.getService() == null || operation.getService().trim().isEmpty()) {
            System.out.println("DEBUG: ⚠️ Pas de service défini, pas de frais");
            return;
        }
        
        // Récupérer le numéro de compte (qui est l'agence)
        String numeroCompte = operation.getCodeProprietaire();
        if (numeroCompte == null || numeroCompte.trim().isEmpty()) {
            System.out.println("DEBUG: ⚠️ Pas de code propriétaire, pas de frais");
            return;
        }
        
        // DÉTERMINER LA CONFIGURATION DE FRAIS À UTILISER
        String servicePourFrais, agencePourFrais;
        
        // Vérifier si c'est une opération service (bordereau commence par SERVICE_SUMMARY)
        if (operation.getNomBordereau() != null && operation.getNomBordereau().startsWith("SERVICE_SUMMARY_")) {
            // Pour les opérations service : utiliser la configuration originale
            // Le service de l'opération est en fait l'agence originale
            // Le codeProprietaire de l'opération est en fait le service original
            agencePourFrais = operation.getService(); // L'agence originale
            servicePourFrais = numeroCompte; // Le service original
            System.out.println("DEBUG: 🔄 Opération SERVICE détectée - Utilisation de la configuration originale");
            System.out.println("DEBUG: 🔄 Service pour frais: " + servicePourFrais + " (service original)");
            System.out.println("DEBUG: 🔄 Agence pour frais: " + agencePourFrais + " (agence originale)");
        } else {
            // Pour les opérations agence : utiliser la configuration normale
            servicePourFrais = operation.getService();
            agencePourFrais = numeroCompte;
            System.out.println("DEBUG: 🔄 Opération AGENCE détectée - Utilisation de la configuration normale");
            System.out.println("DEBUG: 🔄 Service pour frais: " + servicePourFrais);
            System.out.println("DEBUG: 🔄 Agence pour frais: " + agencePourFrais);
        }
        
        // Chercher le frais applicable pour cette configuration
        Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(servicePourFrais, agencePourFrais);
        
        if (fraisOpt.isEmpty()) {
            System.out.println("DEBUG: ⚠️ Aucun frais applicable trouvé pour service=" + servicePourFrais + " et agence=" + agencePourFrais);
            return;
        }
        
        FraisTransactionEntity frais = fraisOpt.get();
        System.out.println("DEBUG: ✅ Frais trouvé: ID=" + frais.getId() + ", Description='" + frais.getDescription() + "', Montant=" + frais.getMontantFrais() + ", Type=" + frais.getTypeCalcul());
        
        // Calculer le montant des frais selon le type
        Double montantFrais;
        if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
            // Frais en pourcentage : Volume Total × Pourcentage
            montantFrais = operation.getMontant() * (frais.getPourcentage() / 100.0);
            System.out.println("DEBUG: 💰 Calcul frais en pourcentage:");
            System.out.println("  - Volume total: " + operation.getMontant() + " FCFA");
            System.out.println("  - Pourcentage: " + frais.getPourcentage() + "%");
            System.out.println("  - Montant frais: " + montantFrais + " FCFA");
        } else {
            // Frais fixe : Valeur fixe × Nombre de transactions
            int nombreTransactions;
            
            // LOGIQUE SPÉCIALE POUR LES ANNULATIONS
            if ("annulation_bo".equals(operation.getTypeOperation()) || "annulation_partenaire".equals(operation.getTypeOperation()) || "transaction_cree".equals(operation.getTypeOperation())) {
                // Pour les annulations : toujours 1 transaction pour les frais fixes
                nombreTransactions = 1;
                System.out.println("DEBUG: 💰 Calcul frais fixe pour ANNULATION:");
                System.out.println("  - Type: " + operation.getTypeOperation());
                System.out.println("  - Montant paramétré: " + frais.getMontantFrais() + " FCFA");
                System.out.println("  - Nombre de transactions: " + nombreTransactions + " (toujours 1 pour les annulations)");
            } else {
                // Pour les autres opérations : calcul normal
                nombreTransactions = getNombreTransactionsFromOperationWithRetry(operation);
                System.out.println("DEBUG: 💰 Calcul frais fixe pour opération normale:");
                System.out.println("  - Montant paramétré: " + frais.getMontantFrais() + " FCFA");
                System.out.println("  - Nombre de transactions: " + nombreTransactions);
            }
            
            montantFrais = frais.getMontantFrais() * nombreTransactions;
            System.out.println("  - Montant frais: " + montantFrais + " FCFA");
        }
        
        // Créer l'opération de frais avec les caractéristiques spécifiées
        OperationEntity fraisOperation = new OperationEntity();
        fraisOperation.setCompte(operation.getCompte()); // Même compte (agence)
        fraisOperation.setTypeOperation("FRAIS_TRANSACTION");
        // Lien vers l'opération nominale d'origine
        fraisOperation.setParentOperationId(operation.getId());
        // Règle métier : pour annulation_bo (cashin ou paiement), les frais créditent le compte
        // TOUJOURS enregistrer un montant positif pour les frais
        double montantFraisFinal = Math.abs(montantFrais);
        fraisOperation.setMontant(montantFraisFinal);
        fraisOperation.setParentOperationId(operation.getId()); // Lien explicite avec l'opération d'origine
        fraisOperation.setService(operation.getService());
        fraisOperation.setDateOperation(operation.getDateOperation());
        fraisOperation.setBanque("SYSTEM");
        fraisOperation.setPays(operation.getPays() != null ? operation.getPays() : "CM");
        fraisOperation.setCodeProprietaire(operation.getCodeProprietaire());
        // Format du bordereau : FEES_SUMMARY_[DATE]_[AGENCE]
        String dateStr = operation.getDateOperation().toLocalDate().toString();
        fraisOperation.setNomBordereau("FEES_SUMMARY_" + dateStr + "_" + numeroCompte);
        // Calculer les soldes
        double soldeAvant = operation.getSoldeApres();
        double soldeApres;
        if ("annulation_bo".equals(operation.getTypeOperation()) && operation.getService() != null &&
            (operation.getService().toLowerCase().contains("cashin") || operation.getService().toLowerCase().contains("paiement"))) {
            soldeApres = soldeAvant + montantFraisFinal; // Créditer les frais
        } else {
            soldeApres = soldeAvant - montantFraisFinal; // Débiter les frais (comportement par défaut)
        }
        fraisOperation.setSoldeAvant(soldeAvant);
        // Les frais automatiques sont toujours validés par défaut
        fraisOperation.setStatut("Validée");
        fraisOperation.setSoldeApres(soldeApres);
        
        // Mettre à jour le solde du compte
        CompteEntity compte = operation.getCompte();
        compte.setSolde(soldeApres);
        compte.setDateDerniereMaj(java.time.LocalDateTime.now());
        compteRepository.save(compte);
        
        // Synchroniser les comptes consolidés si ce compte est regroupé
        synchroniserComptesConsolides(compte.getId());
        
        System.out.println("DEBUG: 📝 Création de l'opération FRAIS_TRANSACTION:");
        System.out.println("  - Montant: " + montantFrais);
        System.out.println("  - Bordereau: " + fraisOperation.getNomBordereau());
        System.out.println("  - Solde avant: " + soldeAvant);
        System.out.println("  - Solde après: " + fraisOperation.getSoldeApres());
        System.out.println("  - Statut: " + fraisOperation.getStatut());
        
        // Sauvegarder l'opération de frais
        OperationEntity savedFraisOperation = operationRepository.save(fraisOperation);
        System.out.println("DEBUG: ✅ Opération de frais créée avec ID: " + savedFraisOperation.getId());
        System.out.println("=== FIN createFraisTransactionAutomatique ===");
    }

    /**
     * Récupérer le nombre de transactions depuis l'AgencySummary avec retry
     * AMÉLIORATION : Attendre que les données soient disponibles
     */
    private int getNombreTransactionsFromOperationWithRetry(OperationEntity operation) {
        int maxRetries = 3;
        int retryDelayMs = 1000; // 1 seconde
        
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(
                    operation.getDateOperation().toLocalDate().toString(),
                    operation.getCodeProprietaire(),
                    operation.getService()
                );
                
                if (!summaries.isEmpty()) {
                    AgencySummaryEntity summary = summaries.get(0);
                    return summary.getRecordCount();
                }

                if (operation.getRecordCount() != null) {
                    return operation.getRecordCount();
                }

                double volumeTotal = operation.getMontant();
                int nombreTransactions = (int) Math.round(volumeTotal / 118765.0);
                return Math.max(1, nombreTransactions);
                
            } catch (Exception e) {
                logger.debug("Erreur recuperation nombre transactions (tentative {}/{}): {}", attempt, maxRetries, e.getMessage());
                if (attempt < maxRetries) {
                    try {
                        Thread.sleep(retryDelayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                } else {
                    double volumeTotal = operation.getMontant();
                    int nombreTransactions = (int) Math.round(volumeTotal / 118765.0);
                    return Math.max(1, nombreTransactions);
                }
            }
        }
        
        if (operation.getRecordCount() != null) {
            return operation.getRecordCount();
        }

        double volumeTotal = operation.getMontant();
        int nombreTransactions = (int) Math.round(volumeTotal / 118765.0);
        return Math.max(1, nombreTransactions);
    }

    /**
     * Enrichir une opération avec ses frais de transaction associés
     * NOUVELLE LOGIQUE : Gérer les opérations service avec les mêmes frais que les opérations agence
     */
    private Operation enrichOperationWithFrais(Operation operation) {
        try {
            // Vérifier si l'opération a un service défini
            if (operation.getService() == null || operation.getService().trim().isEmpty()) {
                operation.setFraisApplicable(false);
                return operation;
            }
            
            // Récupérer le numéro de compte (qui est l'agence)
            String numeroCompte = operation.getCodeProprietaire();
            if (numeroCompte == null || numeroCompte.trim().isEmpty()) {
                operation.setFraisApplicable(false);
                return operation;
            }
            
            // DÉTERMINER LA CONFIGURATION DE FRAIS À UTILISER
            String servicePourFrais, agencePourFrais;
            
            // Vérifier si c'est une opération service (bordereau commence par SERVICE_SUMMARY)
            if (operation.getNomBordereau() != null && operation.getNomBordereau().startsWith("SERVICE_SUMMARY_")) {
                // Pour les opérations service : utiliser la configuration originale
                agencePourFrais = operation.getService(); // L'agence originale
                servicePourFrais = numeroCompte; // Le service original
            } else {
                // Pour les opérations agence : utiliser la configuration normale
                servicePourFrais = operation.getService();
                agencePourFrais = numeroCompte;
            }
            
            // Chercher le frais applicable pour cette configuration
            Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(servicePourFrais, agencePourFrais);
            
            if (fraisOpt.isEmpty()) {
                operation.setFraisApplicable(false);
                return operation;
            }
            
            FraisTransactionEntity frais = fraisOpt.get();
            operation.setFraisApplicable(true);
            operation.setTypeCalculFrais(frais.getTypeCalcul());
            operation.setPourcentageFrais(frais.getPourcentage());
            operation.setDescriptionFrais(frais.getDescription());
            
            // Calculer le montant des frais selon le type
            if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                // Frais en pourcentage : Volume Total × Pourcentage
                operation.setMontantFrais(operation.getMontant() * (frais.getPourcentage() / 100.0));
            } else {
                // Frais fixe : Valeur fixe × Nombre de transactions estimé
                int nombreTransactions;
                
                // LOGIQUE SPÉCIALE POUR LES ANNULATIONS
                if ("annulation_bo".equals(operation.getTypeOperation()) || "annulation_partenaire".equals(operation.getTypeOperation()) || "transaction_cree".equals(operation.getTypeOperation())) {
                    // Pour les annulations : toujours 1 transaction pour les frais fixes
                    nombreTransactions = 1;
                } else {
                    // Pour les autres opérations : calcul normal
                    nombreTransactions = estimateNombreTransactions(operation);
                }
                
                operation.setMontantFrais(frais.getMontantFrais() * nombreTransactions);
            }
            
        } catch (Exception e) {
            System.out.println("DEBUG: ❌ Erreur lors de l'enrichissement des frais: " + e.getMessage());
            operation.setFraisApplicable(false);
        }
        
        return operation;
    }
    
    /**
     * Estimer le nombre de transactions pour une opération
     * AMÉLIORATION : Utiliser les données réelles de l'AgencySummary
     */
    private int estimateNombreTransactions(Operation operation) {
        try {
            List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(
                operation.getDateOperation().toLocalDate().toString(),
                operation.getCodeProprietaire(),
                operation.getService()
            );
            
            if (!summaries.isEmpty()) {
                return summaries.get(0).getRecordCount();
            }

            if (operation.getRecordCount() != null) {
                return operation.getRecordCount();
            }

            double volumeTotal = operation.getMontant();
            int nombreTransactions = (int) Math.round(volumeTotal / 118765.0);
            return Math.max(1, nombreTransactions);
            
        } catch (Exception e) {
            logger.debug("Erreur estimation nombre transactions: {}", e.getMessage());
            if (operation.getRecordCount() != null) {
                return operation.getRecordCount();
            }
            double volumeTotal = operation.getMontant();
            int nombreTransactions = (int) Math.round(volumeTotal / 118765.0);
            return Math.max(1, nombreTransactions);
        }
    }
    
    /**
     * Récupérer toutes les opérations enrichies avec leurs frais
     */
    public List<Operation> getAllOperationsWithFrais() {
        return getAllOperationsWithFrais(null);
    }

    /**
     * Opérations FRAIS_TRANSACTION sur une plage de dates (sans enrichissement).
     * Utilisé par les classements pour éviter de charger toutes les opérations.
     */
    public List<Operation> getFraisTransactionsForRanking(LocalDateTime dateDebut, LocalDateTime dateFin) {
        return operationRepository.findFraisTransactionsByDateRange(dateDebut, dateFin).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<Operation> getAllOperationsWithFrais(String username) {
        List<OperationEntity> operations;
        
        if (username != null) {
            List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
            
            // null signifie tous les pays (GNL ou admin)
            if (allowedPays == null) {
                operations = operationRepository.findAllOrderByDateOperationDesc();
            } else if (allowedPays.isEmpty()) {
                // Aucun pays autorisé, retourner une liste vide
                return new ArrayList<>();
            } else {
                // Filtrer par pays autorisés
                operations = operationRepository.findByPaysInOrderByDateOperationDesc(allowedPays);
            }
        } else {
            // Pas de username, retourner toutes les opérations (comportement par défaut)
            operations = operationRepository.findAllOrderByDateOperationDesc();
        }
        
        return operations.stream()
                .map(this::convertToModel)
                .map(this::enrichOperationWithFrais)
                .collect(Collectors.toList());
    }
    
    /**
     * Récupérer toutes les opérations enrichies avec leurs frais, incluant les annulations
     * Utilisé pour les relevés de compte et calculs de solde
     */
    public List<Operation> getAllOperationsWithFraisForAccountStatement() {
        return operationRepository.findAllOrderByDateOperationDesc().stream()
                .filter(op -> op.getStatut() == null || !op.getStatut().equals("Annulée"))
                .map(this::convertToModel)
                .map(this::enrichOperationWithFrais)
                .collect(Collectors.toList());
    }
    
    /**
     * Récupérer une opération par ID enrichie avec ses frais
     */
    public Optional<Operation> getOperationByIdWithFrais(Long id) {
        return operationRepository.findById(id)
                .map(this::convertToModel)
                .map(this::enrichOperationWithFrais);
    }
    
    /**
     * Récupérer les opérations par compte enrichies avec leurs frais
     */
    public List<Operation> getOperationsByCompteIdWithFrais(Long compteId) {
        return operationRepository.findByCompteIdOrderByDateOperationDesc(compteId).stream()
                .map(this::convertToModel)
                .map(this::enrichOperationWithFrais)
                .collect(Collectors.toList());
    }
    
    /**
     * Corriger les frais existants qui n'ont pas de parentOperationId renseigné
     * Cette méthode lie les frais aux opérations nominales via le bordereau
     */
    @Transactional
    public int correctFraisParentOperationId() {
        System.out.println("DEBUG: 🔧 Début de la correction des parentOperationId des frais...");
        int correctedCount = 0;
        
        // Récupérer tous les frais sans parentOperationId
        List<OperationEntity> fraisWithoutParent = operationRepository.findByTypeOperation("FRAIS_TRANSACTION").stream()
            .filter(frais -> frais.getParentOperationId() == null)
            .collect(Collectors.toList());
        
        System.out.println("DEBUG: 📊 Nombre de frais sans parentOperationId: " + fraisWithoutParent.size());
        
        for (OperationEntity frais : fraisWithoutParent) {
            // Extraire la date et l'agence du bordereau des frais
            String bordereau = frais.getNomBordereau();
            if (bordereau != null && bordereau.startsWith("FEES_SUMMARY_")) {
                String[] parts = bordereau.split("_");
                if (parts.length >= 4) {
                    String date = parts[2];
                    String agence = parts[3];
                    
                    // Chercher l'opération nominale correspondante
                    String nominalBordereau = "AGENCY_SUMMARY_" + date + "_" + agence;
                    List<OperationEntity> nominalOperations = operationRepository.findByNomBordereauContaining(nominalBordereau).stream()
                        .filter(op -> !"FRAIS_TRANSACTION".equals(op.getTypeOperation()))
                        .collect(Collectors.toList());
                    
                    if (!nominalOperations.isEmpty()) {
                        // Prendre la première opération nominale trouvée
                        OperationEntity nominalOp = nominalOperations.get(0);
                        frais.setParentOperationId(nominalOp.getId());
                        operationRepository.save(frais);
                        correctedCount++;
                        System.out.println("DEBUG: ✅ Frais ID " + frais.getId() + " lié à l'opération nominale ID " + nominalOp.getId());
                    }
                }
            }
        }
        
        System.out.println("DEBUG: ✅ Correction terminée. " + correctedCount + " frais corrigés.");
        return correctedCount;
    }

    /**
     * Créer une opération sans frais automatiques.
     * Utilisé pour les opérations d'annulation qui n'ont pas besoin d'impact sur le solde.
     */
    private Operation createOperationWithoutFrais(OperationCreateRequest request) {
        CompteEntity compte = compteRepository.findById(request.getCompteId())
                .orElseThrow(() -> new IllegalArgumentException("Compte non trouvé avec ID: " + request.getCompteId()));

        OperationEntity entity = new OperationEntity();
        entity.setCompte(compte);
        entity.setTypeOperation(request.getTypeOperation());
        entity.setMontant(request.getMontant());
        entity.setBanque(request.getBanque());
        entity.setNomBordereau(request.getNomBordereau());
        entity.setService(request.getService());
        // Date de l'opération : utiliser celle du DTO si fournie, sinon maintenant
        if (request.getDateOperation() != null && !request.getDateOperation().isEmpty()) {
            try {
                System.out.println("DEBUG: Parsing date: " + request.getDateOperation());
                // Si la date fournie ne contient pas d'heure, on ajoute l'heure courante
                if (request.getDateOperation().length() == 10) { // format yyyy-MM-dd
                    java.time.LocalDate date = java.time.LocalDate.parse(request.getDateOperation());
                    java.time.LocalTime now = java.time.LocalTime.now();
                    entity.setDateOperation(date.atTime(now));
                } else {
                    entity.setDateOperation(java.time.LocalDateTime.parse(request.getDateOperation()));
                }
                System.out.println("DEBUG: Date parsée: " + entity.getDateOperation());
            } catch (Exception e) {
                System.out.println("DEBUG: Erreur parsing date: " + e.getMessage());
                entity.setDateOperation(LocalDateTime.now()); // fallback si parsing échoue
            }
        } else {
            entity.setDateOperation(LocalDateTime.now());
        }
        entity.setPays(compte.getPays());
        entity.setCodeProprietaire(compte.getNumeroCompte());
        entity.setRecordCount(request.getRecordCount());
        entity.setParentOperationId(request.getParentOperationId());

        // Calculer l'impact sur le solde comme pour les opérations normales
        double soldeAvant = compte.getSolde();
        entity.setSoldeAvant(soldeAvant);
        double impact = calculateImpact(entity.getTypeOperation(), entity.getMontant(), entity.getService());
        double soldeApres = soldeAvant + impact;

        // Par défaut, statut 'Validée' pour toutes les opérations
            entity.setStatut("Validée");
            entity.setSoldeApres(soldeApres);
            compte.setSolde(soldeApres);
            compte.setDateDerniereMaj(LocalDateTime.now());
            compteRepository.save(compte);
            
            // Synchroniser les comptes consolidés si ce compte est regroupé
            synchroniserComptesConsolides(compte.getId());

        OperationEntity savedEntity = operationRepository.save(entity);
        
        // Ne créer aucun frais automatique pour les opérations d'annulation
        return convertToModel(savedEntity);
    }



    public Map<String, List<String>> getOperationFilterOptions() {
        return getOperationFilterOptions(null);
    }
    
    public Map<String, List<String>> getOperationFilterOptions(String username) {
        Map<String, List<String>> filterOptions = new HashMap<>();
        filterOptions.put("typeOperations", operationRepository.findDistinctTypeOperation());
        filterOptions.put("services", operationRepository.findDistinctService());
        
        // Filtrer les pays selon les permissions de l'utilisateur
        if (username != null) {
            List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
            if (allowedPays == null) {
                // GNL ou admin : tous les pays
                filterOptions.put("pays", operationRepository.findDistinctPays());
            } else if (allowedPays.isEmpty()) {
                filterOptions.put("pays", new ArrayList<>());
            } else {
                // Filtrer uniquement les pays autorisés
                List<String> allPays = operationRepository.findDistinctPays();
                filterOptions.put("pays", allPays.stream()
                    .filter(allowedPays::contains)
                    .collect(Collectors.toList()));
            }
        } else {
            filterOptions.put("pays", operationRepository.findDistinctPays());
        }
        
        filterOptions.put("statuts", operationRepository.findDistinctStatut());
        filterOptions.put("banques", operationRepository.findDistinctBanque());
        filterOptions.put("codeProprietaires", operationRepository.findDistinctCodeProprietaire());
        // Si tu as un champ nomBordereau distinct, ajoute-le ici
        return filterOptions;
    }
    
    /**
     * Crée une opération avec un impact inverse sur le solde (pour les annulations)
     * L'impact inverse annule l'effet de l'opération originale
     * @deprecated Cette méthode n'est plus utilisée. La logique d'annulation modifie maintenant directement les opérations existantes.
     */
    @Deprecated
    @Transactional
    private Operation createOperationWithInverseImpact(OperationCreateRequest request, String typeOperationOriginale) {
        CompteEntity compte = compteRepository.findById(request.getCompteId())
            .orElseThrow(() -> new RuntimeException("Compte non trouvé: " + request.getCompteId()));
        
        OperationEntity entity = new OperationEntity();
        entity.setCompte(compte);
        entity.setTypeOperation(request.getTypeOperation());
        entity.setMontant(request.getMontant());
        entity.setBanque(request.getBanque());
        entity.setNomBordereau(request.getNomBordereau());
        entity.setService(request.getService());
        entity.setDateOperation(LocalDateTime.parse(request.getDateOperation()));
        entity.setPays(compte.getPays());
        entity.setCodeProprietaire(compte.getNumeroCompte());
        entity.setRecordCount(request.getRecordCount());
        entity.setParentOperationId(request.getParentOperationId());

        // Calculer l'impact inverse de l'opération originale
        double soldeAvant = compte.getSolde();
        entity.setSoldeAvant(soldeAvant);
        
        // L'impact inverse est l'opposé de l'impact de l'opération originale
        double impactOriginal = calculateImpact(typeOperationOriginale, request.getMontant(), request.getService());
        double impactInverse = -impactOriginal; // Impact inverse
        double soldeApres = soldeAvant + impactInverse;
        
        entity.setStatut("Validée");
        entity.setSoldeApres(soldeApres);
        
        // Mettre à jour le solde du compte avec l'impact inverse
        compte.setSolde(soldeApres);
        compte.setDateDerniereMaj(LocalDateTime.now());
        compteRepository.save(compte);
        
        // Synchroniser les comptes consolidés si ce compte est regroupé
        synchroniserComptesConsolides(compte.getId());

        OperationEntity savedEntity = operationRepository.save(entity);
        
        logger.info("🔄 Opération d'annulation créée avec impact inverse: {} (impact original: {}, impact inverse: {})", 
                   request.getTypeOperation(), impactOriginal, impactInverse);
        
        return convertToModel(savedEntity);
    }

    /**
     * Synchronise automatiquement le solde de clôture avec le solde en cours pour tous les comptes
     * Appelée quotidiennement ou après des modifications importantes
     */
    @Transactional
    public void synchroniserSoldesClotureQuotidiens() {
        try {
            logger.info("🔄 Début de la synchronisation des soldes de clôture quotidiens...");
            
            // Récupérer tous les comptes
            List<CompteEntity> tousLesComptes = compteRepository.findAll();
            int comptesTraites = 0;
            int comptesModifies = 0;
            
            for (CompteEntity compte : tousLesComptes) {
                try {
                    double soldeAvant = compte.getSolde();
                    synchroniserComptesConsolides(compte.getId());
                    
                    // Recharger le compte pour vérifier le nouveau solde
                    CompteEntity compteApres = compteRepository.findById(compte.getId()).orElse(null);
                    if (compteApres != null && compteApres.getSolde() != soldeAvant) {
                        comptesModifies++;
                        logger.info("📊 Compte {} synchronisé: {} → {}", 
                                   compte.getNumeroCompte(), soldeAvant, compteApres.getSolde());
                    }
                    comptesTraites++;
                } catch (Exception e) {
                    logger.error("❌ Erreur lors de la synchronisation du compte {}: {}", 
                                compte.getNumeroCompte(), e.getMessage());
                }
            }
            
            logger.info("✅ Synchronisation terminée: {} comptes traités, {} modifiés", 
                       comptesTraites, comptesModifies);
                       
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la synchronisation des soldes de clôture quotidiens: {}", 
                        e.getMessage(), e);
            throw new RuntimeException("Erreur lors de la synchronisation des soldes", e);
        }
    }
    
    /**
     * Synchronise les comptes consolidés qui dépendent du compte modifié
     */
    private void synchroniserComptesConsolides(Long compteId) {
        try {
            List<CompteEntity> comptesConsolides = compteRegroupementService.getComptesConsolidesDependants(compteId);
            for (CompteEntity compteConsolide : comptesConsolides) {
                compteRegroupementService.synchroniserSoldeCompteConsolide(compteConsolide.getId());
            }
        } catch (Exception e) {
            logger.error("Erreur lors de la synchronisation des comptes consolidés pour le compte {}: {}", 
                        compteId, e.getMessage(), e);
        }
    }
    
    /**
     * Génère automatiquement la référence pour les opérations Compense_client
     * Format: CODE_PROPRIETAIRE-DATE_JJMMAA-CP{NUMERO}
     * Exemple: CELCM0001-120825-CP1
     */
    private String generateCompenseClientReference(String codeProprietaire, LocalDateTime dateOperation, Long operationIdToExclude, String referenceType) {
        // Formater la date au format jjmmaa
        String dateFormatted = dateOperation.format(java.time.format.DateTimeFormatter.ofPattern("ddMMyy"));
        
        // Compter le nombre d'opérations Compense_client existantes pour cette agence et cette journée
        // Utiliser la requête adaptée selon que l'on exclut une opération ou non
        Long existingCount = (operationIdToExclude == null)
            ? operationRepository.countCompenseOperationsByCodeProprietaireAndDate(
                codeProprietaire,
                dateOperation
              )
            : operationRepository.countCompenseOperationsByCodeProprietaireAndDateExcludingId(
                codeProprietaire,
                dateOperation,
                operationIdToExclude
              );
        
        // Le numéro sera le nombre d'opérations existantes + 1
        int numero = existingCount.intValue() + 1;
        
        // Construire la référence selon le type
        String prefix = "CROSS_BORDER".equals(referenceType) ? "CB" : "CP";
        String reference = String.format("%s-%s%s%d", codeProprietaire, dateFormatted, prefix, numero);
        
        System.out.println("DEBUG: Génération référence Compense_client: " + reference);
        System.out.println("DEBUG: Code propriétaire: " + codeProprietaire);
        System.out.println("DEBUG: Date formatée: " + dateFormatted);
        System.out.println("DEBUG: Numéro d'opération: " + numero);
        System.out.println("DEBUG: Nombre d'opérations existantes (excluant ID " + operationIdToExclude + "): " + existingCount);
        
        return reference;
    }
    
    /**
     * Génère automatiquement la référence pour les opérations Appro_client
     * Format: CODE_PROPRIETAIRE-DATE_JJMMAA-AP{NUMERO}
     * Exemple: CELCM0001-120825-AP1
     */
    private String generateApproClientReference(String codeProprietaire, LocalDateTime dateOperation, Long operationIdToExclude, String referenceType) {
        // Formater la date au format jjmmaa
        String dateFormatted = dateOperation.format(java.time.format.DateTimeFormatter.ofPattern("ddMMyy"));
        
        // Compter le nombre d'opérations Appro_client existantes pour cette agence et cette journée
        // Utiliser la requête adaptée selon que l'on exclut une opération ou non
        Long existingCount = (operationIdToExclude == null)
            ? operationRepository.countApproClientOperationsByCodeProprietaireAndDate(
                codeProprietaire,
                dateOperation
              )
            : operationRepository.countApproClientOperationsByCodeProprietaireAndDateExcludingId(
                codeProprietaire,
                dateOperation,
                operationIdToExclude
              );
        
        // Le numéro sera le nombre d'opérations existantes + 1
        int numero = existingCount.intValue() + 1;
        
        // Construire la référence selon le type
        String prefix = "CROSS_BORDER".equals(referenceType) ? "CB" : "AP";
        String reference = String.format("%s-%s%s%d", codeProprietaire, dateFormatted, prefix, numero);
        
        System.out.println("DEBUG: Génération référence Appro_client: " + reference);
        System.out.println("DEBUG: Code propriétaire: " + codeProprietaire);
        System.out.println("DEBUG: Date formatée: " + dateFormatted);
        System.out.println("DEBUG: Numéro d'opération: " + numero);
        System.out.println("DEBUG: Nombre d'opérations existantes (excluant ID " + operationIdToExclude + "): " + existingCount);
        
        return reference;
    }
    
    /**
     * Génère automatiquement la référence pour les opérations Appro_fournisseur
     * Format: CODE_PROPRIETAIRE-DATE_JJMMAA-APFR{NUMERO}
     * Exemple: CELCM0001-120825-APFR1
     */
    private String generateApproFournisseurReference(String codeProprietaire, LocalDateTime dateOperation, Long operationIdToExclude, String referenceType) {
        // Formater la date au format jjmmaa
        String dateFormatted = dateOperation.format(java.time.format.DateTimeFormatter.ofPattern("ddMMyy"));
        
        // Compter le nombre d'opérations Appro_fournisseur existantes pour cette agence et cette journée
        // Utiliser la requête adaptée selon que l'on exclut une opération ou non
        Long existingCount = (operationIdToExclude == null)
            ? operationRepository.countApproFournisseurOperationsByCodeProprietaireAndDate(
                codeProprietaire,
                dateOperation
              )
            : operationRepository.countApproFournisseurOperationsByCodeProprietaireAndDateExcludingId(
                codeProprietaire,
                dateOperation,
                operationIdToExclude
              );
        
        // Le numéro sera le nombre d'opérations existantes + 1
        int numero = existingCount.intValue() + 1;
        
        // Construire la référence selon le type
        String prefix = "CROSS_BORDER".equals(referenceType) ? "CBFR" : "APFR";
        String reference = String.format("%s-%s-%s%d", codeProprietaire, dateFormatted, prefix, numero);
        
        System.out.println("DEBUG: Génération référence Appro_fournisseur: " + reference);
        System.out.println("DEBUG: Code propriétaire: " + codeProprietaire);
        System.out.println("DEBUG: Date formatée: " + dateFormatted);
        System.out.println("DEBUG: Numéro d'opération: " + numero);
        System.out.println("DEBUG: Nombre d'opérations existantes (excluant ID " + operationIdToExclude + "): " + existingCount);
        
        return reference;
    }
    
    /**
     * Génère automatiquement la référence pour les opérations Compense_fournisseur
     * Format: CODE_PROPRIETAIRE-DATE_JJMMAA-CPFR{NUMERO}
     * Exemple: CELCM0001-120825-CPFR1
     */
    private String generateCompenseFournisseurReference(String codeProprietaire, LocalDateTime dateOperation, Long operationIdToExclude, String referenceType) {
        // Formater la date au format jjmmaa
        String dateFormatted = dateOperation.format(java.time.format.DateTimeFormatter.ofPattern("ddMMyy"));
        
        // Compter le nombre d'opérations Compense_fournisseur existantes pour cette agence et cette journée
        // Utiliser la requête adaptée selon que l'on exclut une opération ou non
        Long existingCount = (operationIdToExclude == null)
            ? operationRepository.countCompenseFournisseurOperationsByCodeProprietaireAndDate(
                codeProprietaire,
                dateOperation
              )
            : operationRepository.countCompenseFournisseurOperationsByCodeProprietaireAndDateExcludingId(
                codeProprietaire,
                dateOperation,
                operationIdToExclude
              );
        
        // Le numéro sera le nombre d'opérations existantes + 1
        int numero = existingCount.intValue() + 1;
        
        // Construire la référence selon le type
        String prefix = "CROSS_BORDER".equals(referenceType) ? "CBFR" : "CPFR";
        String reference = String.format("%s-%s-%s%d", codeProprietaire, dateFormatted, prefix, numero);
        
        System.out.println("DEBUG: Génération référence Compense_fournisseur: " + reference);
        System.out.println("DEBUG: Code propriétaire: " + codeProprietaire);
        System.out.println("DEBUG: Date formatée: " + dateFormatted);
        System.out.println("DEBUG: Numéro d'opération: " + numero);
        System.out.println("DEBUG: Nombre d'opérations existantes (excluant ID " + operationIdToExclude + "): " + existingCount);
        
        return reference;
    }
    
    /**
     * Génère automatiquement la référence pour les opérations nivellement
     * Format: CODE_PROPRIETAIRE-DATE_JJMMAA-NV{NUMERO}
     * Exemple: CELCM0001-120825NV1
     */
    private String generateNivellementReference(String codeProprietaire, LocalDateTime dateOperation, Long operationIdToExclude) {
        // Formater la date au format jjmmaa
        String dateFormatted = dateOperation.format(java.time.format.DateTimeFormatter.ofPattern("ddMMyy"));
        
        // Compter le nombre d'opérations nivellement existantes pour cette journée et ce code propriétaire
        // Utiliser la requête adaptée selon que l'on exclut une opération ou non
        Long existingCount = (operationIdToExclude == null)
            ? operationRepository.countNivellementOperationsByCodeProprietaireAndDate(codeProprietaire, dateOperation)
            : operationRepository.countNivellementOperationsByCodeProprietaireAndDateExcludingId(codeProprietaire, dateOperation, operationIdToExclude);
        
        // Le numéro sera le nombre d'opérations existantes + 1
        int numero = existingCount.intValue() + 1;
        
        // Construire la référence avec le code propriétaire
        String reference = String.format("%s-%sNV%d", codeProprietaire, dateFormatted, numero);
        
        System.out.println("DEBUG: Génération référence Nivellement: " + reference);
        System.out.println("DEBUG: Code propriétaire: " + codeProprietaire);
        System.out.println("DEBUG: Date formatée: " + dateFormatted);
        System.out.println("DEBUG: Numéro d'opération: " + numero);
        System.out.println("DEBUG: Nombre d'opérations existantes (excluant ID " + operationIdToExclude + "): " + existingCount);
        
        return reference;
    }
    
    /**
     * Méthode helper pour générer une référence selon le type d'opération
     * Utilisée lors de la mise à jour d'une opération
     */
    private String generateReferenceForOperationType(String typeOperation, String codeProprietaire, LocalDateTime dateOperation, Long operationIdToExclude) {
        System.out.println("DEBUG: 🔧 generateReferenceForOperationType appelée");
        System.out.println("DEBUG: Type d'opération: " + typeOperation);
        System.out.println("DEBUG: Code propriétaire: " + codeProprietaire);
        System.out.println("DEBUG: Date d'opération: " + dateOperation);
        System.out.println("DEBUG: ID opération à exclure: " + operationIdToExclude);
        
        String reference = null;
        switch (typeOperation) {
            case "Compense_client":
                reference = generateCompenseClientReference(codeProprietaire, dateOperation, operationIdToExclude, null);
                break;
            case "Appro_client":
                reference = generateApproClientReference(codeProprietaire, dateOperation, operationIdToExclude, null);
                break;
            case "Appro_fournisseur":
                reference = generateApproFournisseurReference(codeProprietaire, dateOperation, operationIdToExclude, null);
                break;
            case "Compense_fournisseur":
                reference = generateCompenseFournisseurReference(codeProprietaire, dateOperation, operationIdToExclude, null);
                break;
            case "nivellement":
                reference = generateNivellementReference(codeProprietaire, dateOperation, operationIdToExclude);
                break;
            default:
                // Pour les autres types, retourner null pour garder la référence existante
                System.out.println("DEBUG: Type d'opération non géré: " + typeOperation + ", retour null");
                return null;
        }
        
        System.out.println("DEBUG: Référence générée: " + reference);
        return reference;
    }
    
    /**
     * Vérifie si un type d'opération génère automatiquement des références
     */
    private boolean isAutoGeneratedReferenceType(String typeOperation) {
        if (typeOperation == null) {
            return false;
        }
        
        switch (typeOperation) {
            case "Compense_client":
            case "Appro_client":
            case "Appro_fournisseur":
            case "Compense_fournisseur":
            case "nivellement":
                return true;
            default:
                return false;
        }
    }
    
    /**
     * Récupère le numéro de compte en se basant sur le code propriétaire
     * Exemple : Si BANQUE = "ECOBANK CM", cherche un compte avec code_proprietaire = "ECOBANK CM"
     * et retourne son numéro de compte (ex: "123456098765")
     * 
     * @param codeProprietaireRecherche Le code propriétaire à chercher (provient de la colonne BANQUE de l'opération)
     * @return Le numéro de compte correspondant, ou null si non trouvé
     */
    private String recupererNumeroCompteParCodeProprietaire(String codeProprietaireRecherche) {
        try {
            if (codeProprietaireRecherche == null || codeProprietaireRecherche.trim().isEmpty()) {
                logger.debug("🔍 Code propriétaire null ou vide, impossible de récupérer le numéro de compte");
                return null;
            }
            
            logger.info("🔍 Recherche du compte avec code_proprietaire = '{}'", codeProprietaireRecherche);
            
            // Chercher un compte avec le code propriétaire correspondant
            List<CompteEntity> comptes = compteRepository.findAll();
            
            // Priorité 1: Correspondance exacte du code propriétaire (catégorie Banque de préférence)
            for (CompteEntity compte : comptes) {
                if (codeProprietaireRecherche.equals(compte.getCodeProprietaire()) && 
                    "Banque".equalsIgnoreCase(compte.getCategorie())) {
                    logger.info("✅ Compte trouvé (catégorie Banque) : code_proprietaire='{}' -> numéro_compte='{}'", 
                               codeProprietaireRecherche, compte.getNumeroCompte());
                    return compte.getNumeroCompte();
                }
            }
            
            // Priorité 2: Correspondance exacte du code propriétaire (toutes catégories)
            for (CompteEntity compte : comptes) {
                if (codeProprietaireRecherche.equals(compte.getCodeProprietaire())) {
                    logger.info("✅ Compte trouvé : code_proprietaire='{}' -> numéro_compte='{}' (catégorie: {})", 
                               codeProprietaireRecherche, compte.getNumeroCompte(), compte.getCategorie());
                    return compte.getNumeroCompte();
                }
            }
            
            // Priorité 3: Recherche partielle (code propriétaire contient la valeur recherchée)
            for (CompteEntity compte : comptes) {
                if (compte.getCodeProprietaire() != null && 
                    compte.getCodeProprietaire().toUpperCase().contains(codeProprietaireRecherche.toUpperCase()) &&
                    "Banque".equalsIgnoreCase(compte.getCategorie())) {
                    logger.info("✅ Compte trouvé (correspondance partielle) : code_proprietaire='{}' contient '{}' -> numéro_compte='{}'", 
                               compte.getCodeProprietaire(), codeProprietaireRecherche, compte.getNumeroCompte());
                    return compte.getNumeroCompte();
                }
            }
            
            logger.warn("⚠️ Aucun compte trouvé avec code_proprietaire = '{}'", codeProprietaireRecherche);
            logger.warn("💡 Vérifiez que le compte existe avec exactement ce code propriétaire dans la base de données");
            return null;
            
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération du numéro de compte pour code_proprietaire='{}': {}", 
                        codeProprietaireRecherche, e.getMessage(), e);
            return null;
        }
    }
    
    /**
     * Crée automatiquement une opération bancaire pour les types Compense_client, Appro_client et nivellement
     * L'opération bancaire est créée avec les informations disponibles du formulaire
     * Les autres colonnes devront être complétées manuellement
     */
    private void createOperationBancaireAutomatique(OperationEntity operation, CompteEntity compte) {
        try {
            logger.info("🏦 Création automatique d'une opération bancaire pour l'opération ID: {} (Type: {})", 
                       operation.getId(), operation.getTypeOperation());
            logger.info("🔍 Type d'opération détaillé: '{}' (Compense_client={}, Appro_client={}, nivellement={})", 
                       operation.getTypeOperation(),
                       "Compense_client".equals(operation.getTypeOperation()),
                       "Appro_client".equals(operation.getTypeOperation()),
                       "nivellement".equals(operation.getTypeOperation()));
            
            OperationBancaireCreateRequest request = new OperationBancaireCreateRequest();
            
            // Remplir les informations disponibles depuis l'opération
            request.setPays(operation.getPays() != null ? operation.getPays() : "");
            
            // Déterminer le code pays à partir du pays
            String codePays = "";
            if (operation.getPays() != null) {
                switch (operation.getPays().toUpperCase()) {
                    case "CÔTE D'IVOIRE":
                    case "COTE D'IVOIRE":
                        codePays = "CI";
                        break;
                    case "MALI":
                        codePays = "ML";
                        break;
                    case "BURKINA FASO":
                        codePays = "BF";
                        break;
                    case "SÉNÉGAL":
                    case "SENEGAL":
                        codePays = "SN";
                        break;
                    case "TOGO":
                        codePays = "TG";
                        break;
                    case "CAMEROUN":
                    case "CAMEROON":
                        codePays = "CM";
                        break;
                    default:
                        codePays = operation.getPays().substring(0, Math.min(2, operation.getPays().length())).toUpperCase();
                }
            }
            request.setCodePays(codePays);
            
            // Formater le mois à partir de la date d'opération
            if (operation.getDateOperation() != null) {
                String mois = operation.getDateOperation().format(
                    java.time.format.DateTimeFormatter.ofPattern("MMMM yyyy", java.util.Locale.FRENCH));
                request.setMois(mois);
                request.setDateOperation(operation.getDateOperation().toString());
            } else {
                request.setDateOperation(LocalDateTime.now().toString());
            }
            
            // Utiliser le code propriétaire comme agence (qui représente le compte/agence)
            request.setAgence(operation.getCodeProprietaire() != null ? operation.getCodeProprietaire() : compte.getNumeroCompte());
            
            // Type d'opération bancaire basé sur le type d'opération
            String typeOperationBancaire = "";
            switch (operation.getTypeOperation()) {
                case "Compense_client":
                    typeOperationBancaire = "Compensation Client";
                    break;
                case "Appro_client":
                    typeOperationBancaire = "Approvisionnement";
                    break;
                case "nivellement":
                    typeOperationBancaire = "Nivellement";
                    break;
                case "régularisation_solde":
                    typeOperationBancaire = "Régularisation Solde";
                    break;
                default:
                    typeOperationBancaire = operation.getTypeOperation();
            }
            request.setTypeOperation(typeOperationBancaire);
            
            // Montant de l'opération
            request.setMontant(operation.getMontant());
            
            // Référence de l'opération si disponible
            request.setReference(operation.getReference());
            
            // Banque si disponible
            request.setBo(operation.getBanque());
            
            // Récupérer le numéro de compte basé sur le code propriétaire (BANQUE)
            // La valeur de la colonne BANQUE de l'opération correspond au code_proprietaire du compte à chercher
            String numeroCompte = recupererNumeroCompteParCodeProprietaire(operation.getBanque());
            if (numeroCompte != null && !numeroCompte.isEmpty()) {
                request.setCompteADebiter(numeroCompte);
                logger.info("📋 Numéro de compte récupéré automatiquement: {} pour BANQUE: {}", 
                           numeroCompte, operation.getBanque());
            } else {
                logger.warn("⚠️ Aucun numéro de compte trouvé pour BANQUE: {}", operation.getBanque());
            }
            
            // Nom du bénéficiaire par défaut : Agence + Pays
            String nomBeneficiaire = (operation.getCodeProprietaire() != null ? operation.getCodeProprietaire() : "") + 
                                    " " + 
                                    (operation.getPays() != null ? operation.getPays() : "");
            request.setNomBeneficiaire(nomBeneficiaire.trim());
            logger.info("👤 Nom bénéficiaire généré: {}", nomBeneficiaire.trim());
            
            // Mode de paiement par défaut : Virement
            request.setModePaiement("Virement bancaire");
            
            // Statut par défaut "En attente" car les autres informations doivent être complétées manuellement
            request.setStatut("En attente");
            
            // Traitement par défaut "Niveau Group" pour Compense_client, Appro_client et nivellement
            String typeOp = operation.getTypeOperation();
            logger.info("🔍 Vérification traitement pour type d'opération: '{}'", typeOp);
            
            if ("Compense_client".equals(typeOp) || 
                "Appro_client".equals(typeOp) || 
                "nivellement".equals(typeOp)) {
                request.setTraitement("Niveau Group");
                logger.info("✅ Traitement défini par défaut à 'Niveau Group' pour le type: '{}'", typeOp);
                logger.info("📋 Valeur du traitement dans la requête: '{}'", request.getTraitement());
            } else {
                logger.info("ℹ️ Type d'opération '{}' n'a pas de traitement par défaut défini (Compense_client={}, Appro_client={}, nivellement={})", 
                           typeOp,
                           "Compense_client".equals(typeOp),
                           "Appro_client".equals(typeOp),
                           "nivellement".equals(typeOp));
            }
            
            // Lien avec l'opération d'origine
            request.setOperationId(operation.getId());
            
            // Le champ suivant devra être rempli manuellement :
            // - idGlpi
            
            // Créer l'opération bancaire
            operationBancaireService.createOperationBancaire(request);
            
            logger.info("✅ Opération bancaire créée automatiquement avec succès pour l'opération ID: {}", operation.getId());
            
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la création automatique de l'opération bancaire pour l'opération ID: {} - {}", 
                        operation.getId(), e.getMessage(), e);
            // Ne pas propager l'erreur pour ne pas bloquer la création de l'opération
        }
    }

} 