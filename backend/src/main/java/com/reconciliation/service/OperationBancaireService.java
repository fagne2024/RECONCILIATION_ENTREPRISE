package com.reconciliation.service;

import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.model.OperationBancaire;
import com.reconciliation.repository.OperationBancaireRepository;
import com.reconciliation.dto.OperationBancaireCreateRequest;
import com.reconciliation.dto.OperationBancaireUpdateRequest;
import org.springframework.beans.factory.annotation.Autowired;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.repository.CompteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class OperationBancaireService {
    
    private static final Logger logger = LoggerFactory.getLogger(OperationBancaireService.class);
    
    @Autowired
    private OperationBancaireRepository operationBancaireRepository;
    @Autowired
    private CompteRepository compteRepository;
    
    @Autowired
    private PaysFilterService paysFilterService;

    /** Historique des actions par opération (utilisateur, date, détail). */
    @Autowired
    private OperationBancaireAuditService auditService;

    /** Règles de calcul configurables (Configuration > Calcul) : prioritaire sur les valeurs codées en dur. */
    @Autowired
    private CalculationRuleService calculationRuleService;
    
    // Récupérer toutes les opérations bancaires
    public List<OperationBancaire> getAllOperationsBancaires() {
        return getAllOperationsBancaires(null);
    }
    
    public List<OperationBancaire> getAllOperationsBancaires(String username) {
        try {
            List<OperationBancaireEntity> operations;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                // null signifie tous les pays (GNL ou admin)
                if (allowedPays == null) {
                    operations = operationBancaireRepository.findAllOrderByDateOperationDesc();
                } else if (allowedPays.isEmpty()) {
                    // Aucun pays autorisé, retourner une liste vide
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés
                    operations = operationBancaireRepository.findByPaysInOrderByDateOperationDesc(allowedPays);
                }
            } else {
                // Pas de username, retourner toutes les opérations (comportement par défaut)
                operations = operationBancaireRepository.findAllOrderByDateOperationDesc();
            }
            
            return operations.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getAllOperationsBancaires pour username: {}", username, e);
            e.printStackTrace();
            // En cas d'erreur, retourner une liste vide pour éviter les crashes
            return new ArrayList<>();
        }
    }
    
    // Récupérer une opération bancaire par ID
    public Optional<OperationBancaire> getOperationBancaireById(Long id) {
        return operationBancaireRepository.findById(id)
                .map(this::convertToModel);
    }
    
    // Récupérer les opérations bancaires par pays
    public List<OperationBancaire> getOperationsBancairesByPays(String pays) {
        return getOperationsBancairesByPays(pays, null);
    }
    
    public List<OperationBancaire> getOperationsBancairesByPays(String pays, String username) {
        try {
            // Vérifier que l'utilisateur a accès à ce pays
            if (username != null && !username.isEmpty()) {
                if (!paysFilterService.canAccessPays(username, pays)) {
                    return new ArrayList<>(); // L'utilisateur n'a pas accès à ce pays
                }
            }
            
            return operationBancaireRepository.findByPaysOrderByDateOperationDesc(pays).stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getOperationsBancairesByPays pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Récupérer les opérations bancaires par agence
    public List<OperationBancaire> getOperationsBancairesByAgence(String agence) {
        return getOperationsBancairesByAgence(agence, null);
    }
    
    public List<OperationBancaire> getOperationsBancairesByAgence(String agence, String username) {
        try {
            List<OperationBancaireEntity> operations;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : toutes les opérations
                    operations = operationBancaireRepository.findByAgenceOrderByDateOperationDesc(agence);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés après récupération par agence
                    List<OperationBancaireEntity> allByAgence = operationBancaireRepository.findByAgenceOrderByDateOperationDesc(agence);
                    final List<String> finalAllowedPays = allowedPays;
                    operations = allByAgence.stream()
                        .filter(op -> op.getPays() != null && finalAllowedPays.contains(op.getPays()))
                        .collect(Collectors.toList());
                }
            } else {
                operations = operationBancaireRepository.findByAgenceOrderByDateOperationDesc(agence);
            }
            
            return operations.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getOperationsBancairesByAgence pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Récupérer les opérations bancaires par statut
    public List<OperationBancaire> getOperationsBancairesByStatut(String statut) {
        return getOperationsBancairesByStatut(statut, null);
    }
    
    public List<OperationBancaire> getOperationsBancairesByStatut(String statut, String username) {
        try {
            List<OperationBancaireEntity> operations;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : toutes les opérations
                    operations = operationBancaireRepository.findByStatutOrderByDateOperationDesc(statut);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés après récupération par statut
                    List<OperationBancaireEntity> allByStatut = operationBancaireRepository.findByStatutOrderByDateOperationDesc(statut);
                    final List<String> finalAllowedPays = allowedPays;
                    operations = allByStatut.stream()
                        .filter(op -> op.getPays() != null && finalAllowedPays.contains(op.getPays()))
                        .collect(Collectors.toList());
                }
            } else {
                operations = operationBancaireRepository.findByStatutOrderByDateOperationDesc(statut);
            }
            
            return operations.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getOperationsBancairesByStatut pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Récupérer les opérations bancaires par plage de dates
    public List<OperationBancaire> getOperationsBancairesByDateRange(LocalDateTime dateDebut, LocalDateTime dateFin) {
        return getOperationsBancairesByDateRange(dateDebut, dateFin, null);
    }
    
    public List<OperationBancaire> getOperationsBancairesByDateRange(LocalDateTime dateDebut, LocalDateTime dateFin, String username) {
        try {
            List<OperationBancaireEntity> operations;
            
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : toutes les opérations
                    operations = operationBancaireRepository.findByDateOperationBetween(dateDebut, dateFin);
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer par pays autorisés après récupération par date
                    List<OperationBancaireEntity> allByDate = operationBancaireRepository.findByDateOperationBetween(dateDebut, dateFin);
                    final List<String> finalAllowedPays = allowedPays;
                    operations = allByDate.stream()
                        .filter(op -> op.getPays() != null && finalAllowedPays.contains(op.getPays()))
                        .collect(Collectors.toList());
                }
            } else {
                operations = operationBancaireRepository.findByDateOperationBetween(dateDebut, dateFin);
            }
            
            return operations.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getOperationsBancairesByDateRange pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Filtrer les opérations bancaires
    public List<OperationBancaire> filterOperationsBancaires(String pays, String codePays, String mois,
                                                             String agence, String typeOperation, String statut,
                                                             LocalDateTime dateDebut, LocalDateTime dateFin, String reference) {
        return filterOperationsBancaires(pays, codePays, mois, agence, typeOperation, statut, dateDebut, dateFin, reference, null);
    }
    
    public List<OperationBancaire> filterOperationsBancaires(String pays, String codePays, String mois,
                                                             String agence, String typeOperation, String statut,
                                                             LocalDateTime dateDebut, LocalDateTime dateFin, String reference, String username) {
        try {
            List<OperationBancaireEntity> operations;
            
            // Récupérer les pays autorisés pour l'utilisateur
            List<String> allowedPays = null;
            if (username != null && !username.isEmpty()) {
                allowedPays = paysFilterService.getAllowedPaysCodes(username);
                // null signifie tous les pays (GNL ou admin)
            }
            
            if (allowedPays == null) {
                // GNL ou admin : toutes les opérations
                operations = operationBancaireRepository.findFilteredOperationsOrderByDateOperationDesc(
                    pays, codePays, mois, agence, typeOperation, statut, dateDebut, dateFin, reference);
            } else if (allowedPays.isEmpty()) {
                // Aucun pays autorisé
                return new ArrayList<>();
            } else {
                // Filtrer d'abord par pays autorisés, puis appliquer les autres filtres
                List<OperationBancaireEntity> allFiltered = operationBancaireRepository.findFilteredOperationsOrderByDateOperationDesc(
                    pays, codePays, mois, agence, typeOperation, statut, dateDebut, dateFin, reference);
                
                // Filtrer par pays autorisés
                final List<String> finalAllowedPays = allowedPays;
                operations = allFiltered.stream()
                    .filter(op -> {
                        if (op.getPays() == null) return false;
                        // Vérifier si le pays de l'opération est dans la liste autorisée
                        return finalAllowedPays.contains(op.getPays());
                    })
                    .collect(Collectors.toList());
            }
            
            return operations.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans filterOperationsBancaires pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Créer une nouvelle opération bancaire
    @Transactional
    public OperationBancaire createOperationBancaire(OperationBancaireCreateRequest request) {
        logger.info("🏦 Création d'une nouvelle opération bancaire: agence={}, type={}, montant={}", 
                   request.getAgence(), request.getTypeOperation(), request.getMontant());
        
        OperationBancaireEntity entity = new OperationBancaireEntity();
        entity.setPays(request.getPays());
        entity.setCodePays(request.getCodePays());
        entity.setMois(request.getMois());
        
        // Convertir la date string en LocalDateTime
        if (request.getDateOperation() != null && !request.getDateOperation().isEmpty()) {
            try {
                if (request.getDateOperation().length() == 10) { // format yyyy-MM-dd
                    entity.setDateOperation(LocalDateTime.parse(request.getDateOperation() + "T00:00:00"));
                } else {
                    entity.setDateOperation(LocalDateTime.parse(request.getDateOperation()));
                }
            } catch (Exception e) {
                logger.error("Erreur lors du parsing de la date: {}", e.getMessage());
                entity.setDateOperation(LocalDateTime.now());
            }
        } else {
            entity.setDateOperation(LocalDateTime.now());
        }
        
        entity.setAgence(request.getAgence());
        entity.setTypeOperation(request.getTypeOperation());
        entity.setNomBeneficiaire(request.getNomBeneficiaire());
        entity.setCompteADebiter(request.getCompteADebiter());
        entity.setMontant(request.getMontant());
        entity.setModePaiement(request.getModePaiement());
        entity.setReference(request.getReference());
        entity.setIdGlpi(request.getIdGlpi());
        entity.setBo(request.getBo());
        entity.setBanqueCorrigee(request.getBanqueCorrigee());
        entity.setDemandeur(request.getDemandeur());
        entity.setValideur(request.getValideur());
        entity.setStatut(request.getStatut() != null && !request.getStatut().isBlank() ? request.getStatut() : "En attente");

        entity.setOperationId(request.getOperationId());
        entity.setTraitement(request.getTraitement() != null && !request.getTraitement().isBlank()
                ? request.getTraitement() : TRAITEMENT_NIVEAU_RECONCILIATION);
        entity.setCommentaire(request.getCommentaire());
        
        logger.info("📋 Création opération bancaire - Traitement reçu: '{}'", request.getTraitement());
        
        OperationBancaireEntity savedEntity = operationBancaireRepository.save(entity);
        
        logger.info("✅ Opération bancaire créée avec ID: {} - Traitement sauvegardé: '{}'", 
                   savedEntity.getId(), savedEntity.getTraitement());
        auditService.log(savedEntity, OperationBancaireAuditService.CREATION, "Opération créée");
        operationBancaireRepository.save(savedEntity);
        
        return convertToModel(savedEntity);
    }
    
    // Mettre à jour une opération bancaire
    @Transactional
    public OperationBancaire updateOperationBancaire(Long id, OperationBancaireUpdateRequest request, boolean admin) {
        OperationBancaireEntity entity = operationBancaireRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Opération bancaire non trouvée avec ID: " + id));

        // Un traitement « Terminé » ne peut être modifié que par un administrateur
        if (!admin
                && TRAITEMENT_TERMINE.equalsIgnoreCase(entity.getTraitement())
                && request.getTraitement() != null
                && !TRAITEMENT_TERMINE.equalsIgnoreCase(request.getTraitement())) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Seul un administrateur peut modifier le traitement d'une opération « Terminé ».");
        }
        
        String previousStatut = entity.getStatut();
        java.util.Map<String, String> avant = OperationBancaireAuditService.snapshot(entity);

        if (request.getPays() != null) entity.setPays(request.getPays());
        if (request.getCodePays() != null) entity.setCodePays(request.getCodePays());
        if (request.getMois() != null) entity.setMois(request.getMois());
        
        if (request.getDateOperation() != null && !request.getDateOperation().isEmpty()) {
            try {
                if (request.getDateOperation().length() == 10) {
                    entity.setDateOperation(LocalDateTime.parse(request.getDateOperation() + "T00:00:00"));
                } else {
                    entity.setDateOperation(LocalDateTime.parse(request.getDateOperation()));
                }
            } catch (Exception e) {
                logger.error("Erreur lors du parsing de la date: {}", e.getMessage());
            }
        }
        
        if (request.getAgence() != null) entity.setAgence(request.getAgence());
        if (request.getTypeOperation() != null) entity.setTypeOperation(request.getTypeOperation());
        if (request.getNomBeneficiaire() != null) entity.setNomBeneficiaire(request.getNomBeneficiaire());
        if (request.getCompteADebiter() != null) entity.setCompteADebiter(request.getCompteADebiter());
        if (request.getMontant() != null) entity.setMontant(request.getMontant());
        if (request.getModePaiement() != null) entity.setModePaiement(request.getModePaiement());
        if (request.getReference() != null) entity.setReference(request.getReference());
        if (request.getIdGlpi() != null) entity.setIdGlpi(request.getIdGlpi());
        if (request.getBo() != null) entity.setBo(request.getBo());
        if (request.getBanqueCorrigee() != null) entity.setBanqueCorrigee(request.getBanqueCorrigee());
        if (request.getDemandeur() != null) entity.setDemandeur(request.getDemandeur());
        if (request.getValideur() != null) entity.setValideur(request.getValideur());

        if (request.getStatut() != null) entity.setStatut(request.getStatut());
        if (request.getOperationId() != null) entity.setOperationId(request.getOperationId());
        if (request.getTraitement() != null) entity.setTraitement(request.getTraitement());
        if (request.getCommentaire() != null) entity.setCommentaire(request.getCommentaire());
        
        auditService.logDiff(avant, entity);
        OperationBancaireEntity savedEntity = operationBancaireRepository.save(entity);
        // Impacter le compte si le statut devient Validée (ou Clôturée) ET que l'impact n'a pas déjà été appliqué
        if (!statutImpactant(previousStatut) && statutImpactant(savedEntity.getStatut())) {
            appliquerImpactSurCompte(savedEntity);
        }

        return convertToModel(savedEntity);
    }

    /** « Validée » et « Clôturée » déclenchent l'impact sur le compte (une seule fois : impactApplique). */
    private static boolean statutImpactant(String statut) {
        return "Validée".equalsIgnoreCase(statut) || OperationBancaireAuditService.STATUT_CLOTURE.equalsIgnoreCase(statut);
    }

    private void appliquerImpactSurCompte(OperationBancaireEntity ob) {
        try {
            // Vérifier si l'impact a déjà été appliqué pour éviter le double impact
            if (Boolean.TRUE.equals(ob.getImpactApplique())) {
                logger.warn("⚠️ L'impact a déjà été appliqué pour l'opération bancaire {} - Ignoré", ob.getId());
                return;
            }
            
            String numero = ob.getCompteADebiter();
            if (numero == null || numero.isEmpty()) {
                logger.warn("⚠️ Aucun compte spécifié pour l'opération bancaire {}", ob.getId());
                return;
            }
            Optional<CompteEntity> opt = compteRepository.findByNumeroCompte(numero);
            if (opt.isEmpty()) {
                logger.warn("⚠️ Compte {} introuvable pour l'opération bancaire {}", numero, ob.getId());
                return;
            }
            CompteEntity compte = opt.get();
            double soldeInitial = compte.getSolde();
            double montant = ob.getMontant() != null ? ob.getMontant() : 0.0;

            double soldeFinal = soldeInitial;
            String type = ob.getTypeOperation() != null ? ob.getTypeOperation() : "";
            // Classification pilotée par les règles de calcul (repli : valeurs codées en dur).
            if (calculationRuleService.matchesAny(type, "BANQUE.TYPES_APPROVISIONNEMENT",
                    CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT)) {
                soldeFinal = soldeInitial + montant; // crédit
            } else if (calculationRuleService.matchesAny(type, "BANQUE.TYPES_COMPENSATION",
                    CalculationRuleService.DEFAULT_TYPES_COMPENSATION)) {
                soldeFinal = soldeInitial - montant; // débit
            } else if (calculationRuleService.matchesAny(type, "BANQUE.TYPES_NIVELLEMENT",
                    CalculationRuleService.DEFAULT_TYPES_NIVELLEMENT)) {
                soldeFinal = soldeInitial + montant; // signe du montant décide
            } else {
                logger.info("ℹ️ Type '{}' non impactant, pas d'ajustement de solde", ob.getTypeOperation());
                return;
            }

            compte.setSolde(soldeFinal);
            compte.setDateDerniereMaj(LocalDateTime.now());
            compteRepository.save(compte);
            
            // Marquer l'impact comme appliqué pour éviter le double impact
            ob.setImpactApplique(true);
            operationBancaireRepository.save(ob);
            
            logger.info("✅ Solde compte mis à jour suite validation op bancaire {}: {} -> {}", ob.getId(), soldeInitial, soldeFinal);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de l'impact sur le compte pour op bancaire {}: {}", ob.getId(), e.getMessage(), e);
        }
    }
    
    // Niveaux de traitement. Le « statut réconciliation » en découle (affiché côté écran) :
    // Niveau reconciliation => En cours ; Niveau Group => OK ; Terminé => Validé.
    public static final String TRAITEMENT_NIVEAU_RECONCILIATION = "Niveau reconciliation";
    public static final String TRAITEMENT_NIVEAU_GROUP = "Niveau Group";
    public static final String TRAITEMENT_TERMINE = "Terminé";

    /**
     * Applique le résultat de la réconciliation (OK/KO) sur une opération :
     * OK (ligne rapprochée d'une ligne du relevé) => « Niveau Group » ;
     * KO (rapprochement retiré) => retour à « Niveau reconciliation » si elle était à « Niveau Group ».
     * Une ligne « Terminé » n'est jamais rétrogradée.
     */
    @Transactional
    public boolean updateReconStatus(Long id, String status) {
        Optional<OperationBancaireEntity> opt = operationBancaireRepository.findById(id);
        if (opt.isEmpty()) return false;
        OperationBancaireEntity e = opt.get();
        String traitementAvant = e.getTraitement();
        e.setReconStatus(status);
        if (!TRAITEMENT_TERMINE.equalsIgnoreCase(e.getTraitement())) {
            if ("OK".equalsIgnoreCase(status)) {
                e.setTraitement(TRAITEMENT_NIVEAU_GROUP);
            } else if ("KO".equalsIgnoreCase(status) && TRAITEMENT_NIVEAU_GROUP.equalsIgnoreCase(e.getTraitement())) {
                e.setTraitement(TRAITEMENT_NIVEAU_RECONCILIATION);
            }
        }
        if (!java.util.Objects.equals(traitementAvant, e.getTraitement())) {
            auditService.log(e, OperationBancaireAuditService.STATUT_RECONCILIATION,
                    "Réconciliation " + status + " : " + (traitementAvant == null ? "—" : traitementAvant)
                            + " → " + (e.getTraitement() == null ? "—" : e.getTraitement()));
        }
        operationBancaireRepository.save(e);
        return true;
    }

    // Mettre à jour en lot le statut des opérations bancaires
    @Transactional
    public int bulkUpdateStatut(List<Long> ids, String nouveauStatut) {
        if (ids == null || ids.isEmpty() || nouveauStatut == null || nouveauStatut.isEmpty()) {
            return 0;
        }
        List<OperationBancaireEntity> operations = operationBancaireRepository.findAllById(ids);
        int updated = 0;
        for (OperationBancaireEntity entity : operations) {
            String previous = entity.getStatut();
            java.util.Map<String, String> avant = OperationBancaireAuditService.snapshot(entity);
            entity.setStatut(nouveauStatut);
            auditService.logDiff(avant, entity);
            OperationBancaireEntity saved = operationBancaireRepository.save(entity);
            if (!statutImpactant(previous) && statutImpactant(nouveauStatut)) {
                appliquerImpactSurCompte(saved);
            }
            updated++;
        }
        return updated;
    }

    /**
     * Clôture en lot : le statut ne change pas ; le niveau de traitement passe de « Niveau Group » à « Terminé »
     * (le statut de réconciliation affiché devient alors « Clôturé »). Les lignes qui ne sont pas au niveau groupe sont ignorées.
     * @return nombre de lignes clôturées
     */
    @Transactional
    public int bulkCloturer(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        int cloturees = 0;
        for (OperationBancaireEntity entity : operationBancaireRepository.findAllById(ids)) {
            if (!TRAITEMENT_NIVEAU_GROUP.equalsIgnoreCase(entity.getTraitement() == null ? "" : entity.getTraitement().trim())) {
                continue;
            }
            String avant = entity.getTraitement();
            entity.setTraitement(TRAITEMENT_TERMINE);
            auditService.log(entity, OperationBancaireAuditService.CLOTURE,
                    "Clôture : traitement " + avant + " → " + TRAITEMENT_TERMINE + " ; statut de réconciliation : Clôturé");
            operationBancaireRepository.save(entity);
            cloturees++;
        }
        return cloturees;
    }

    // Supprimer une opération bancaire
    @Transactional
    public boolean deleteOperationBancaire(Long id) {
        Optional<OperationBancaireEntity> optionalOperation = operationBancaireRepository.findById(id);
        if (optionalOperation.isPresent()) {
            operationBancaireRepository.deleteById(id);
            logger.info("✅ Opération bancaire ID: {} supprimée avec succès", id);
            return true;
        }
        logger.warn("⚠️ Opération bancaire ID: {} introuvable pour suppression", id);
        return false;
    }
    
    // Récupérer les pays distincts
    public List<String> getDistinctPays() {
        return getDistinctPays(null);
    }
    
    public List<String> getDistinctPays(String username) {
        try {
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les pays
                    return operationBancaireRepository.findDistinctPays();
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer uniquement les pays autorisés
                    List<String> allPays = operationBancaireRepository.findDistinctPays();
                    return allPays.stream()
                        .filter(allowedPays::contains)
                        .collect(Collectors.toList());
                }
            }
            return operationBancaireRepository.findDistinctPays();
        } catch (Exception e) {
            logger.error("Erreur dans getDistinctPays pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Récupérer les agences distinctes
    public List<String> getDistinctAgences() {
        return getDistinctAgences(null);
    }
    
    public List<String> getDistinctAgences(String username) {
        try {
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : toutes les agences
                    return operationBancaireRepository.findDistinctAgences();
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer les agences selon les pays autorisés
                    List<OperationBancaire> operations = getAllOperationsBancaires(username);
                    return operations.stream()
                        .map(OperationBancaire::getAgence)
                        .filter(agence -> agence != null && !agence.isEmpty())
                        .distinct()
                        .sorted()
                        .collect(Collectors.toList());
                }
            }
            return operationBancaireRepository.findDistinctAgences();
        } catch (Exception e) {
            logger.error("Erreur dans getDistinctAgences pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Récupérer les types d'opération distincts
    /**
     * Banques (colonne bo) déjà présentes sur les opérations d'un pays, triées et sans doublon.
     * Sans pays, aucune banque n'est proposée : la liste ne doit contenir que celles du pays choisi.
     */
    public List<String> getDistinctBanques(List<String> paysValues) {
        List<String> values = paysValues == null ? List.of() : paysValues.stream()
                .filter(v -> v != null && !v.isBlank())
                .map(v -> v.trim().toUpperCase(java.util.Locale.ROOT))
                .distinct()
                .collect(Collectors.toList());
        if (values.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return operationBancaireRepository.findDistinctBoByPays(values).stream()
                    .map(String::trim)
                    .filter(b -> !b.isEmpty())
                    .distinct()
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Erreur dans getDistinctBanques", e);
            return new ArrayList<>();
        }
    }

    public List<String> getDistinctTypesOperation() {
        return getDistinctTypesOperation(null);
    }
    
    public List<String> getDistinctTypesOperation(String username) {
        try {
            if (username != null && !username.isEmpty()) {
                List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
                
                if (allowedPays == null) {
                    // GNL ou admin : tous les types
                    return operationBancaireRepository.findDistinctTypesOperation();
                } else if (allowedPays.isEmpty()) {
                    return new ArrayList<>();
                } else {
                    // Filtrer les types selon les pays autorisés
                    List<OperationBancaire> operations = getAllOperationsBancaires(username);
                    return operations.stream()
                        .map(OperationBancaire::getTypeOperation)
                        .filter(type -> type != null && !type.isEmpty())
                        .distinct()
                        .sorted()
                        .collect(Collectors.toList());
                }
            }
            return operationBancaireRepository.findDistinctTypesOperation();
        } catch (Exception e) {
            logger.error("Erreur dans getDistinctTypesOperation pour username: {}", username, e);
            return new ArrayList<>();
        }
    }
    
    // Récupérer les statuts distincts
    public List<String> getDistinctStatuts() {
        return operationBancaireRepository.findDistinctStatuts();
    }
    
    // Convertir une entité en modèle
    private OperationBancaire convertToModel(OperationBancaireEntity entity) {
        OperationBancaire model = new OperationBancaire(
            entity.getId(),
            entity.getPays(),
            entity.getCodePays(),
            entity.getMois(),
            entity.getDateOperation(),
            entity.getAgence(),
            entity.getTypeOperation(),
            entity.getNomBeneficiaire(),
            entity.getCompteADebiter(),
            entity.getMontant(),
            entity.getModePaiement(),
            entity.getReference(),
            entity.getIdGlpi(),
            entity.getBo(),
            entity.getStatut(),
            entity.getOperationId()
        );
        model.setBanqueCorrigee(entity.getBanqueCorrigee());
        model.setDemandeur(entity.getDemandeur());
        model.setValideur(entity.getValideur());
        model.setImpactApplique(entity.getImpactApplique());

        model.setTraitement(entity.getTraitement());
        model.setCommentaire(entity.getCommentaire());
        model.setLastActionUser(entity.getLastActionUser());
        model.setLastActionAt(entity.getLastActionAt());
        return model;
    }
}

