package com.reconciliation.service;

import com.reconciliation.entity.EcartSoldeEntity;
import com.reconciliation.entity.FraisTransactionEntity;
import com.reconciliation.entity.OperationEntity;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.model.EcartSolde;
import com.reconciliation.model.EcartBoSummaryDTO;
import com.reconciliation.repository.EcartSoldeRepository;
import com.reconciliation.repository.OperationRepository;
import com.reconciliation.repository.CompteRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class EcartSoldeService {
    
    @Autowired
    private EcartSoldeRepository ecartSoldeRepository;
    
    @Autowired
    private FraisTransactionService fraisTransactionService;
    
    @Autowired
    private OperationRepository operationRepository;
    
    @Autowired
    private CompteRepository compteRepository;
    
    public List<EcartSolde> getAllEcartSoldes() {
        return ecartSoldeRepository.findAllOrderByDateTransactionDesc().stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public Optional<EcartSolde> getEcartSoldeById(Long id) {
        return ecartSoldeRepository.findById(id)
                .map(this::convertToModel);
    }
    
    public List<EcartSolde> getEcartSoldesByAgence(String agence) {
        return ecartSoldeRepository.findByAgence(agence).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<EcartSolde> getEcartSoldesByService(String service) {
        return ecartSoldeRepository.findByService(service).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<EcartSolde> getEcartSoldesByPays(String pays) {
        return ecartSoldeRepository.findByPays(pays).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<EcartSolde> getEcartSoldesByStatut(String statut) {
        return ecartSoldeRepository.findByStatut(statut).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<EcartSolde> getEcartSoldesByDateRange(LocalDateTime dateDebut, LocalDateTime dateFin) {
        return ecartSoldeRepository.findByDateTransactionBetween(dateDebut, dateFin).stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public List<String> getDistinctAgences() {
        return ecartSoldeRepository.findDistinctAgence();
    }
    
    public List<String> getDistinctServices() {
        return ecartSoldeRepository.findDistinctService();
    }
    
    public List<String> getDistinctPays() {
        return ecartSoldeRepository.findDistinctPays();
    }
    
    public List<String> getDistinctNumeroTransGu() {
        return ecartSoldeRepository.findDistinctNumeroTransGu();
    }
    
    /**
     * Récupérer tous les écarts de solde avec filtres
     */
    public List<EcartSoldeEntity> getEcartSoldes(String agence, String service, String pays, 
                                                 String numeroTransGu, String statut, String dateDebut, 
                                                 String dateFin) {
        
        LocalDateTime dateDebutParsed = null;
        LocalDateTime dateFinParsed = null;
        
        if (dateDebut != null && !dateDebut.isEmpty()) {
            try {
                // Gérer différents formats de date
                if (dateDebut.contains("T")) {
                    dateDebutParsed = LocalDateTime.parse(dateDebut.replace("T", " "));
                } else {
                    // Format "YYYY-MM-DD HH:mm:ss"
                    dateDebutParsed = LocalDateTime.parse(dateDebut, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
            } catch (Exception e) {
                // Date invalide, on ignore le filtre
            }
        }
        
        if (dateFin != null && !dateFin.isEmpty()) {
            try {
                // Gérer différents formats de date
                if (dateFin.contains("T")) {
                    dateFinParsed = LocalDateTime.parse(dateFin.replace("T", " "));
                } else {
                    // Format "YYYY-MM-DD HH:mm:ss"
                    dateFinParsed = LocalDateTime.parse(dateFin, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
            } catch (Exception e) {
                // Date invalide, on ignore le filtre
            }
        }

        List<EcartSoldeEntity> results = ecartSoldeRepository.findWithFilters(
            agence, service, pays, numeroTransGu, statut, dateDebutParsed, dateFinParsed);
        
        return results;
    }
    
    @Transactional
    public EcartSolde createEcartSolde(EcartSolde ecartSolde) {
        EcartSoldeEntity entity = convertToEntity(ecartSolde);
        entity = ecartSoldeRepository.save(entity);
        
        // SUPPRIMÉ: Création automatique des frais de transaction pour les écarts de solde
        // createFraisTransactionForEcartSolde(entity);
        
        return convertToModel(entity);
    }
    
    @Transactional
    public List<EcartSolde> createMultipleEcartSoldes(List<EcartSolde> ecartSoldes) {
        List<EcartSoldeEntity> entitiesToSave = new ArrayList<>();
        List<EcartSolde> savedEcartSoldes = new ArrayList<>();
        int duplicatesCount = 0;
        int newRecordsCount = 0;
        
        System.out.println("=== DÉBUT createMultipleEcartSoldes ===");
        System.out.println("DEBUG: Nombre d'écarts de solde à traiter: " + ecartSoldes.size());
        
        for (EcartSolde ecartSolde : ecartSoldes) {
            // Vérifier si c'est un doublon
            if (ecartSolde.getIdTransaction() != null && !ecartSolde.getIdTransaction().trim().isEmpty()) {
                if (ecartSoldeRepository.existsByIdTransaction(ecartSolde.getIdTransaction())) {
                    System.out.println("DEBUG: Doublon détecté pour ID: " + ecartSolde.getIdTransaction());
                    duplicatesCount++;
                    continue; // Ignorer ce doublon
                }
            }
            
            // Ajouter le commentaire par défaut si aucun commentaire n'est défini
            if (ecartSolde.getCommentaire() == null || ecartSolde.getCommentaire().trim().isEmpty()) {
                ecartSolde.setCommentaire("IMPACT J+1");
                System.out.println("DEBUG: Commentaire par défaut ajouté pour ID: " + ecartSolde.getIdTransaction());
            }
            
            // Convertir en entité et ajouter à la liste à sauvegarder
            EcartSoldeEntity entity = convertToEntity(ecartSolde);
            entitiesToSave.add(entity);
            newRecordsCount++;
            System.out.println("DEBUG: Nouvel enregistrement préparé pour ID: " + ecartSolde.getIdTransaction());
        }
        
        System.out.println("DEBUG: Résultats de la vérification:");
        System.out.println("  - Doublons ignorés: " + duplicatesCount);
        System.out.println("  - Nouveaux enregistrements à sauvegarder: " + newRecordsCount);
        
        // Sauvegarder seulement les nouveaux enregistrements
        if (!entitiesToSave.isEmpty()) {
            List<EcartSoldeEntity> savedEntities = ecartSoldeRepository.saveAll(entitiesToSave);
            savedEcartSoldes = savedEntities.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
            
            System.out.println("DEBUG: Enregistrements sauvegardés avec succès: " + savedEcartSoldes.size());
        }
        
        System.out.println("=== FIN createMultipleEcartSoldes ===");
        return savedEcartSoldes;
    }

    @Transactional
    public int saveEcartBoSummary(List<EcartBoSummaryDTO> summaryData) {
        System.out.println("=== DÉBUT saveEcartBoSummary ===");
        System.out.println("DEBUG: Nombre de résumés à sauvegarder: " + summaryData.size());
        
        List<EcartSoldeEntity> entitiesToSave = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ISO_DATE_TIME;
        
        for (EcartBoSummaryDTO summary : summaryData) {
            try {
                // Parser la date
                LocalDateTime dateTransaction;
                if (summary.getDate() != null && !summary.getDate().trim().isEmpty()) {
                    try {
                        // Essayer de parser au format ISO
                        if (summary.getDate().contains("T")) {
                            dateTransaction = LocalDateTime.parse(summary.getDate(), formatter);
                        } else {
                            // Format simple YYYY-MM-DD
                            dateTransaction = LocalDateTime.parse(summary.getDate() + "T00:00:00", formatter);
                        }
                    } catch (Exception e) {
                        System.out.println("DEBUG: Erreur de parsing de date, utilisation de la date actuelle: " + summary.getDate());
                        dateTransaction = LocalDateTime.now();
                    }
                } else {
                    dateTransaction = LocalDateTime.now();
                }

                // Créer un ID transaction unique basé sur le service, pays et date
                String idTransaction = String.format("ECART_BO_%s_%s_%s", 
                    summary.getService() != null ? summary.getService().replaceAll("\\s+", "_") : "UNKNOWN",
                    summary.getPays() != null ? summary.getPays().replaceAll("\\s+", "_") : "UNKNOWN",
                    dateTransaction.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));

                // Vérifier si un enregistrement similaire existe déjà
                if (ecartSoldeRepository.existsByIdTransaction(idTransaction)) {
                    System.out.println("DEBUG: Enregistrement déjà existant pour: " + idTransaction);
                    continue;
                }

                // Créer l'entité
                EcartSoldeEntity entity = new EcartSoldeEntity();
                entity.setIdTransaction(idTransaction);
                entity.setService(summary.getService());
                entity.setPays(summary.getPays());
                entity.setMontant(summary.getMontant() != null ? summary.getMontant() : 0.0);
                entity.setDateTransaction(dateTransaction);
                entity.setStatut(summary.getStatut() != null ? summary.getStatut() : "EN_ATTENTE");
                entity.setCommentaire(String.format("Écart BO regroupé - %d transaction(s) - Service: %s, Pays: %s", 
                    summary.getNombreTransactions() != null ? summary.getNombreTransactions() : 0,
                    summary.getService(),
                    summary.getPays()));
                entity.setDateImport(LocalDateTime.now());

                entitiesToSave.add(entity);
                System.out.println("DEBUG: Résumé préparé pour service: " + summary.getService() + ", montant: " + summary.getMontant());
            } catch (Exception e) {
                System.err.println("DEBUG: Erreur lors du traitement du résumé: " + e.getMessage());
                e.printStackTrace();
            }
        }

        // Sauvegarder tous les enregistrements
        if (!entitiesToSave.isEmpty()) {
            List<EcartSoldeEntity> savedEntities = ecartSoldeRepository.saveAll(entitiesToSave);
            System.out.println("DEBUG: " + savedEntities.size() + " résumé(s) sauvegardé(s) avec succès");
            System.out.println("=== FIN saveEcartBoSummary ===");
            return savedEntities.size();
        }

        System.out.println("=== FIN saveEcartBoSummary - Aucun enregistrement à sauvegarder ===");
        return 0;
    }
    
    @Transactional
    public EcartSolde updateEcartSolde(Long id, EcartSolde ecartSolde) {
        EcartSoldeEntity entity = ecartSoldeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Écart de solde non trouvé"));
        
        entity.setIdTransaction(ecartSolde.getIdTransaction());
        entity.setTelephoneClient(ecartSolde.getTelephoneClient());
        // Forcer le signe du montant en fonction du service (CASHIN -> négatif)
        entity.setService(ecartSolde.getService());
        entity.setMontant(normalizeMontantByService(ecartSolde.getMontant(), ecartSolde.getService()));
        entity.setAgence(ecartSolde.getAgence());
        entity.setDateTransaction(ecartSolde.getDateTransaction());
        entity.setNumeroTransGu(ecartSolde.getNumeroTransGu());
        entity.setPays(ecartSolde.getPays());
        entity.setStatut(ecartSolde.getStatut());
        entity.setCommentaire(ecartSolde.getCommentaire());
        
        entity = ecartSoldeRepository.save(entity);
        return convertToModel(entity);
    }
    
    @Transactional
    public boolean deleteEcartSolde(Long id) {
        if (ecartSoldeRepository.existsById(id)) {
            ecartSoldeRepository.deleteById(id);
            return true;
        }
        return false;
    }

    /**
     * Suppression en lot d'écarts de solde par leurs IDs.
     */
    @Transactional
    public Map<String, Object> deleteEcartSoldes(List<Long> ids) {
        Map<String, Object> result = new HashMap<>();
        List<String> errors = new ArrayList<>();
        int deletedCount = 0;
        if (ids != null) {
            for (Long id : ids) {
                try {
                    if (ecartSoldeRepository.existsById(id)) {
                        ecartSoldeRepository.deleteById(id);
                        deletedCount++;
                    } else {
                        errors.add("ID " + id + " non trouvé");
                    }
                } catch (Exception e) {
                    errors.add("ID " + id + ": " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
                }
            }
        }
        result.put("deletedCount", deletedCount);
        result.put("errors", errors);
        result.put("totalRequested", ids != null ? ids.size() : 0);
        return result;
    }
    
    @Transactional
    public boolean updateStatut(Long id, String nouveauStatut) {
        System.out.println("=== DÉBUT updateStatut ===");
        System.out.println("DEBUG: ID: " + id);
        System.out.println("DEBUG: Nouveau statut: " + nouveauStatut);
        
        try {
            EcartSoldeEntity entity = ecartSoldeRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Écart de solde non trouvé"));
            
            System.out.println("DEBUG: Entité trouvée - ID: " + entity.getId());
            System.out.println("DEBUG: Ancien statut: " + entity.getStatut());
            
            entity.setStatut(nouveauStatut);
            System.out.println("DEBUG: Nouveau statut défini: " + entity.getStatut());
            
            EcartSoldeEntity savedEntity = ecartSoldeRepository.save(entity);
            System.out.println("DEBUG: Entité sauvegardée - ID: " + savedEntity.getId());
            System.out.println("DEBUG: Statut final: " + savedEntity.getStatut());
            
            System.out.println("=== FIN updateStatut - SUCCÈS ===");
            return true;
        } catch (Exception e) {
            System.out.println("=== ERREUR updateStatut ===");
            System.out.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
    }

    @Transactional
    public boolean updateStatutWithComment(Long id, String nouveauStatut, String commentaire) {
        System.out.println("=== DÉBUT updateStatutWithComment ===");
        System.out.println("DEBUG: ID: " + id);
        System.out.println("DEBUG: Nouveau statut: " + nouveauStatut);
        System.out.println("DEBUG: Commentaire: " + commentaire);
        
        try {
            EcartSoldeEntity entity = ecartSoldeRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Écart de solde non trouvé"));
            
            System.out.println("DEBUG: Entité trouvée - ID: " + entity.getId());
            System.out.println("DEBUG: Ancien statut: " + entity.getStatut());
            System.out.println("DEBUG: Ancien commentaire: " + entity.getCommentaire());
            
            entity.setStatut(nouveauStatut);
            entity.setCommentaire(commentaire);
            System.out.println("DEBUG: Nouveau statut défini: " + entity.getStatut());
            System.out.println("DEBUG: Nouveau commentaire défini: " + entity.getCommentaire());
            
            EcartSoldeEntity savedEntity = ecartSoldeRepository.save(entity);
            System.out.println("DEBUG: Entité sauvegardée - ID: " + savedEntity.getId());
            System.out.println("DEBUG: Statut final: " + savedEntity.getStatut());
            System.out.println("DEBUG: Commentaire final: " + savedEntity.getCommentaire());
            
            System.out.println("=== FIN updateStatutWithComment - SUCCÈS ===");
            return true;
        } catch (Exception e) {
            System.out.println("=== ERREUR updateStatutWithComment ===");
            System.out.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
    }
    
    @Transactional
    public List<EcartSolde> uploadCsvFile(MultipartFile file) throws IOException {
        List<EcartSolde> ecartSoldes = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.S");
        
        String fileName = file.getOriginalFilename().toLowerCase();
        
        System.out.println("=== DÉBUT uploadCsvFile ===");
        System.out.println("DEBUG: Nom du fichier: " + fileName);
        
        if (fileName.endsWith(".csv")) {
            // Traitement des fichiers CSV
            try (BufferedReader br = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
                String line;
                boolean isFirstLine = true;
                int lineNumber = 0;
                
                while ((line = br.readLine()) != null) {
                    lineNumber++;
                    if (isFirstLine) {
                        // Ignorer l'en-tête
                        isFirstLine = false;
                        System.out.println("DEBUG: En-tête ignoré: " + line);
                        continue;
                    }
                    
                    // Traiter la ligne de données
                    String[] values = line.split(";");
                    if (values.length >= 9) {
                        try {
                            EcartSolde ecartSolde = parseEcartSoldeFromValues(values, formatter);
                            
                            // Ajouter le commentaire par défaut si aucun commentaire n'est défini
                            if (ecartSolde.getCommentaire() == null || ecartSolde.getCommentaire().trim().isEmpty()) {
                                ecartSolde.setCommentaire("IMPACT J+1");
                                System.out.println("DEBUG: Commentaire par défaut ajouté pour ID: " + ecartSolde.getIdTransaction());
                            }
                            
                            ecartSoldes.add(ecartSolde);
                            System.out.println("DEBUG: Ligne " + lineNumber + " parsée avec succès pour ID: " + ecartSolde.getIdTransaction());
                        } catch (Exception e) {
                            // Ignorer les lignes avec des erreurs de parsing
                            System.err.println("Erreur lors du parsing de la ligne CSV " + lineNumber + ": " + line + " - " + e.getMessage());
                        }
                    } else {
                        System.err.println("Ligne " + lineNumber + " ignorée - nombre de colonnes insuffisant: " + values.length);
                    }
                }
            }
        } else {
            // Traitement des fichiers Excel
            try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
                Sheet sheet = workbook.getSheetAt(0); // Première feuille
                System.out.println("DEBUG: Nombre de lignes dans la feuille: " + sheet.getLastRowNum());
                
                for (int i = 1; i <= sheet.getLastRowNum(); i++) { // Commencer à 1 pour ignorer l'en-tête
                    Row row = sheet.getRow(i);
                    if (row != null) {
                        try {
                            EcartSolde ecartSolde = parseEcartSoldeFromExcelRow(row, formatter);
                            
                            // Ajouter le commentaire par défaut si aucun commentaire n'est défini
                            if (ecartSolde.getCommentaire() == null || ecartSolde.getCommentaire().trim().isEmpty()) {
                                ecartSolde.setCommentaire("IMPACT J+1");
                                System.out.println("DEBUG: Commentaire par défaut ajouté pour ID: " + ecartSolde.getIdTransaction());
                            }
                            
                            ecartSoldes.add(ecartSolde);
                            System.out.println("DEBUG: Ligne " + (i + 1) + " parsée avec succès pour ID: " + ecartSolde.getIdTransaction());
                        } catch (Exception e) {
                            // Ignorer les lignes avec des erreurs de parsing
                            System.err.println("Erreur lors du parsing de la ligne Excel " + (i + 1) + " - " + e.getMessage());
                        }
                    }
                }
            }
        }
        
        System.out.println("DEBUG: Nombre total d'écarts de solde parsés: " + ecartSoldes.size());
        
        // Filtrer les doublons et sauvegarder
        List<EcartSoldeEntity> entitiesToSave = new ArrayList<>();
        int duplicatesCount = 0;
        int newRecordsCount = 0;
        
        for (EcartSolde ecartSolde : ecartSoldes) {
            // Vérifier si c'est un doublon
            if (ecartSolde.getIdTransaction() != null && !ecartSolde.getIdTransaction().trim().isEmpty()) {
                if (ecartSoldeRepository.existsByIdTransaction(ecartSolde.getIdTransaction())) {
                    System.out.println("DEBUG: Doublon détecté pour ID: " + ecartSolde.getIdTransaction());
                    duplicatesCount++;
                    continue; // Ignorer ce doublon
                }
            }
            
            // Convertir en entité et ajouter à la liste à sauvegarder
            EcartSoldeEntity entity = convertToEntity(ecartSolde);
            entitiesToSave.add(entity);
            newRecordsCount++;
            System.out.println("DEBUG: Nouvel enregistrement préparé pour ID: " + ecartSolde.getIdTransaction());
        }
        
        System.out.println("DEBUG: Résultats de la vérification:");
        System.out.println("  - Doublons ignorés: " + duplicatesCount);
        System.out.println("  - Nouveaux enregistrements à sauvegarder: " + newRecordsCount);
        
        // Sauvegarder seulement les nouveaux enregistrements
        List<EcartSolde> savedEcartSoldes = new ArrayList<>();
        if (!entitiesToSave.isEmpty()) {
            List<EcartSoldeEntity> savedEntities = ecartSoldeRepository.saveAll(entitiesToSave);
            savedEcartSoldes = savedEntities.stream()
                    .map(this::convertToModel)
                    .collect(Collectors.toList());
            
            System.out.println("DEBUG: Enregistrements sauvegardés avec succès: " + savedEcartSoldes.size());
        }
        
        System.out.println("=== FIN uploadCsvFile ===");
        return savedEcartSoldes;
    }
    
    public Map<String, Object> validateFile(MultipartFile file) throws IOException {
        List<EcartSolde> ecartSoldes = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int validLines = 0;
        int errorLines = 0;
        int duplicates = 0;
        int newRecords = 0;
        
        System.out.println("=== DÉBUT validateFile ===");
        System.out.println("DEBUG: Nom du fichier: " + file.getOriginalFilename());
        System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
        
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.S");
        String fileName = file.getOriginalFilename().toLowerCase();
        
        try {
            if (fileName.endsWith(".csv")) {
                // Validation des fichiers CSV
                System.out.println("DEBUG: Traitement fichier CSV");
                try (BufferedReader br = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
                    String line;
                    boolean isFirstLine = true;
                    int lineNumber = 0;
                    
                    while ((line = br.readLine()) != null) {
                        lineNumber++;
                        if (isFirstLine) {
                            isFirstLine = false;
                            System.out.println("DEBUG: En-tête ignoré: " + line);
                            continue;
                        }
                        
                        try {
                            String[] values = line.split(";");
                            System.out.println("DEBUG: Ligne " + lineNumber + " - Colonnes: " + values.length);
                            System.out.println("DEBUG: Ligne " + lineNumber + " - Contenu brut: '" + line + "'");
                            System.out.println("DEBUG: Ligne " + lineNumber + " - Valeurs parsées:");
                            for (int i = 0; i < Math.min(values.length, 10); i++) {
                                System.out.println("  [" + i + "] = '" + values[i] + "'");
                            }
                            
                            if (values.length >= 9) {
                                EcartSolde ecartSolde = parseEcartSoldeFromValues(values, formatter);
                                
                                // Vérifier les doublons
                                if (isDuplicate(ecartSolde)) {
                                    duplicates++;
                                    errors.add("Ligne " + lineNumber + ": Doublon détecté pour ID " + ecartSolde.getIdTransaction());
                                    System.out.println("DEBUG: Doublon détecté pour ID: " + ecartSolde.getIdTransaction());
                                } else {
                                    newRecords++;
                                    ecartSoldes.add(ecartSolde);
                                    System.out.println("DEBUG: Nouvel enregistrement ajouté pour ID: " + ecartSolde.getIdTransaction());
                                }
                                validLines++;
                            } else {
                                errorLines++;
                                errors.add("Ligne " + lineNumber + ": Nombre de colonnes insuffisant (" + values.length + " au lieu de 9)");
                                System.out.println("DEBUG: Erreur ligne " + lineNumber + " - Colonnes insuffisantes");
                            }
                        } catch (Exception e) {
                            errorLines++;
                            errors.add("Ligne " + lineNumber + ": " + e.getMessage());
                            System.out.println("DEBUG: Exception ligne " + lineNumber + ": " + e.getMessage());
                            e.printStackTrace();
                        }
                    }
                }
            } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
                // Validation des fichiers Excel
                System.out.println("DEBUG: Traitement fichier Excel");
                try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
                    Sheet sheet = workbook.getSheetAt(0);
                    System.out.println("DEBUG: Nombre de lignes dans la feuille: " + sheet.getLastRowNum());
                    
                    for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                        Row row = sheet.getRow(i);
                        if (row != null) {
                            try {
                                EcartSolde ecartSolde = parseEcartSoldeFromExcelRow(row, formatter);
                                
                                // Vérifier les doublons
                                if (isDuplicate(ecartSolde)) {
                                    duplicates++;
                                    errors.add("Ligne " + (i + 1) + ": Doublon détecté pour ID " + ecartSolde.getIdTransaction());
                                    System.out.println("DEBUG: Doublon détecté pour ID: " + ecartSolde.getIdTransaction());
                                } else {
                                    newRecords++;
                                    ecartSoldes.add(ecartSolde);
                                    System.out.println("DEBUG: Nouvel enregistrement ajouté pour ID: " + ecartSolde.getIdTransaction());
                                }
                                validLines++;
                            } catch (Exception e) {
                                errorLines++;
                                errors.add("Ligne " + (i + 1) + ": " + e.getMessage());
                                System.out.println("DEBUG: Exception ligne " + (i + 1) + ": " + e.getMessage());
                                e.printStackTrace();
                            }
                        }
                    }
                }
            } else {
                errors.add("Format de fichier non supporté: " + fileName);
                System.out.println("DEBUG: Format non supporté: " + fileName);
            }
        } catch (Exception e) {
            System.out.println("DEBUG: Exception générale dans validateFile: " + e.getMessage());
            e.printStackTrace();
            errors.add("Erreur générale lors de la validation: " + e.getMessage());
        }
        
        System.out.println("DEBUG: Résultats finaux:");
        System.out.println("  - Lignes valides: " + validLines);
        System.out.println("  - Lignes avec erreurs: " + errorLines);
        System.out.println("  - Doublons: " + duplicates);
        System.out.println("  - Nouveaux enregistrements: " + newRecords);
        System.out.println("=== FIN validateFile ===");
        
        return Map.of(
            "validLines", validLines,
            "errorLines", errorLines,
            "duplicates", duplicates,
            "newRecords", newRecords,
            "hasErrors", errorLines > 0 || duplicates > 0,
            "errors", errors
        );
    }
    
    private boolean isDuplicate(EcartSolde ecartSolde) {
        // Vérifier si un enregistrement avec le même IDTransaction existe déjà
        if (ecartSolde.getIdTransaction() == null || ecartSolde.getIdTransaction().trim().isEmpty()) {
            System.out.println("DEBUG: IDTransaction null ou vide, pas de vérification de doublon");
            return false;
        }
        
        try {
            boolean exists = ecartSoldeRepository.existsByIdTransaction(ecartSolde.getIdTransaction());
            System.out.println("DEBUG: Vérification doublon pour ID " + ecartSolde.getIdTransaction() + " -> " + exists);
            return exists;
        } catch (Exception e) {
            System.out.println("DEBUG: Erreur lors de la vérification de doublon: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }
    
    private EcartSolde parseEcartSoldeFromValues(String[] values, DateTimeFormatter formatter) {
        try {
            EcartSolde ecartSolde = new EcartSolde();
            
            System.out.println("DEBUG: === DÉBUT parseEcartSoldeFromValues ===");
            System.out.println("DEBUG: Nombre de colonnes reçues: " + values.length);
            
            // Vérifier que nous avons assez de colonnes
            if (values.length < 9) {
                throw new IllegalArgumentException("Nombre de colonnes insuffisant: " + values.length + " (attendu: 9)");
            }
            
            System.out.println("DEBUG: Mapping des colonnes:");
            System.out.println("  [1] IDTransaction = '" + values[1] + "'");
            System.out.println("  [2] Téléphone = '" + values[2] + "'");
            System.out.println("  [3] Service = '" + values[3] + "'");
            System.out.println("  [4] Agence = '" + values[4] + "'");
            System.out.println("  [5] Date = '" + values[5] + "'");
            System.out.println("  [6] Numéro Trans GU = '" + values[6] + "'");
            System.out.println("  [7] Pays = '" + values[7] + "'");
            System.out.println("  [8] Statut = '" + values[8] + "'");
            
            ecartSolde.setIdTransaction(values[1] != null ? values[1].trim() : "");
            ecartSolde.setTelephoneClient(values[2] != null ? values[2].trim() : "");
            
            // Le montant n'est pas dans ce fichier, on le définit à 0.0
            ecartSolde.setMontant(0.0);
            System.out.println("DEBUG: Montant non disponible dans ce fichier, défini à 0.0");
            
            ecartSolde.setService(values[3] != null ? values[3].trim() : "");
            ecartSolde.setAgence(values[4] != null ? values[4].trim() : "");
            
            // Parser la date
            if (values[5] != null && !values[5].trim().isEmpty()) {
                try {
                    String dateStr = values[5].trim();
                    LocalDateTime dateTransaction;
                    
                    // Gérer le format avec .0 à la fin
                    if (dateStr.endsWith(".0")) {
                        dateStr = dateStr.substring(0, dateStr.length() - 2);
                        // Utiliser le formatter sans millisecondes
                        DateTimeFormatter formatterWithoutMs = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                        dateTransaction = LocalDateTime.parse(dateStr, formatterWithoutMs);
                    } else {
                        // Utiliser le formatter avec millisecondes
                        dateTransaction = LocalDateTime.parse(dateStr, formatter);
                    }
                    
                    ecartSolde.setDateTransaction(dateTransaction);
                    System.out.println("DEBUG: Date parsée avec succès: " + dateTransaction);
                } catch (Exception e) {
                    System.out.println("DEBUG: ERREUR parsing date - Valeur: '" + values[5] + "' - Exception: " + e.getMessage());
                    throw new IllegalArgumentException("Date invalide: " + values[5] + " - " + e.getMessage());
                }
            } else {
                ecartSolde.setDateTransaction(LocalDateTime.now());
                System.out.println("DEBUG: Date vide, définie à maintenant");
            }
            
            ecartSolde.setNumeroTransGu(values[6] != null ? values[6].trim() : "");
            ecartSolde.setPays(values[7] != null ? values[7].trim() : "");
            ecartSolde.setStatut("EN_ATTENTE");
            ecartSolde.setDateImport(LocalDateTime.now());
            
            System.out.println("DEBUG: Entité EcartSolde créée avec succès:");
            System.out.println("  - IDTransaction: " + ecartSolde.getIdTransaction());
            System.out.println("  - Téléphone: " + ecartSolde.getTelephoneClient());
            System.out.println("  - Montant: " + ecartSolde.getMontant());
            System.out.println("  - Service: " + ecartSolde.getService());
            System.out.println("  - Agence: " + ecartSolde.getAgence());
            System.out.println("  - Date: " + ecartSolde.getDateTransaction());
            System.out.println("  - Numéro Trans GU: " + ecartSolde.getNumeroTransGu());
            System.out.println("  - Pays: " + ecartSolde.getPays());
            System.out.println("DEBUG: === FIN parseEcartSoldeFromValues ===");
            
            return ecartSolde;
        } catch (Exception e) {
            System.out.println("DEBUG: Erreur parsing valeurs: " + e.getMessage());
            throw e;
        }
    }
    
    private EcartSolde parseEcartSoldeFromExcelRow(Row row, DateTimeFormatter formatter) {
        EcartSolde ecartSolde = new EcartSolde();
        
        // Lire les cellules Excel (commencer à l'index 1 pour ignorer la première colonne)
        ecartSolde.setIdTransaction(getCellValueAsString(row.getCell(1))); // IDTransaction
        ecartSolde.setTelephoneClient(getCellValueAsString(row.getCell(2))); // téléphone client
        ecartSolde.setMontant(getCellValueAsDouble(row.getCell(3))); // montant
        ecartSolde.setService(getCellValueAsString(row.getCell(4))); // Service
        ecartSolde.setAgence(getCellValueAsString(row.getCell(5))); // Agence
        
        // Parser la date
        String dateStr = getCellValueAsString(row.getCell(6));
        LocalDateTime dateTransaction = LocalDateTime.parse(dateStr, formatter);
        ecartSolde.setDateTransaction(dateTransaction);
        
        ecartSolde.setNumeroTransGu(getCellValueAsString(row.getCell(7))); // Numéro Trans GU
        ecartSolde.setPays(getCellValueAsString(row.getCell(8))); // PAYS
        ecartSolde.setStatut("EN_ATTENTE");
        ecartSolde.setDateImport(LocalDateTime.now());
        
        return ecartSolde;
    }
    
    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue().trim();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.S"));
                } else {
                    return String.valueOf((long) cell.getNumericCellValue());
                }
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return "";
        }
    }
    
    private Double getCellValueAsDouble(Cell cell) {
        if (cell == null) return 0.0;
        
        switch (cell.getCellType()) {
            case NUMERIC:
                return cell.getNumericCellValue();
            case STRING:
                try {
                    return Double.parseDouble(cell.getStringCellValue().trim());
                } catch (NumberFormatException e) {
                    return 0.0;
                }
            case FORMULA:
                try {
                    return cell.getNumericCellValue();
                } catch (Exception e) {
                    return 0.0;
                }
            default:
                return 0.0;
        }
    }
    
    /**
     * SUPPRIMÉ: Création automatique des frais de transaction pour un écart de solde
     * Cette méthode a été supprimée car les frais ne doivent pas être générés automatiquement
     * pour les écarts de solde selon la demande de l'utilisateur.
     */
    // private void createFraisTransactionForEcartSolde(EcartSoldeEntity ecartSolde) {
    //     // MÉTHODE SUPPRIMÉE
    // }
    
    private EcartSolde convertToModel(EcartSoldeEntity entity) {
        return new EcartSolde(
                entity.getId(),
                entity.getIdTransaction(),
                entity.getTelephoneClient(),
                entity.getMontant(),
                entity.getService(),
                entity.getAgence(),
                entity.getDateTransaction(),
                entity.getNumeroTransGu(),
                entity.getPays(),
                entity.getDateImport(),
                entity.getStatut(),
                entity.getCommentaire()
        );
    }
    
    private EcartSoldeEntity convertToEntity(EcartSolde model) {
        EcartSoldeEntity entity = new EcartSoldeEntity();
        entity.setId(model.getId());
        entity.setIdTransaction(model.getIdTransaction());
        entity.setTelephoneClient(model.getTelephoneClient());
        // Forcer le signe du montant en fonction du service (CASHIN -> négatif)
        entity.setService(model.getService());
        entity.setMontant(normalizeMontantByService(model.getMontant(), model.getService()));
        entity.setAgence(model.getAgence());
        entity.setDateTransaction(model.getDateTransaction());
        entity.setNumeroTransGu(model.getNumeroTransGu());
        entity.setPays(model.getPays());
        entity.setDateImport(model.getDateImport());
        entity.setStatut(model.getStatut());
        entity.setCommentaire(model.getCommentaire());
        return entity;
    }

    // Normalise le montant selon le service: si le service contient "cashin", le montant doit être négatif
    private double normalizeMontantByService(Double montant, String service) {
        double value = montant != null ? montant : 0.0;
        String s = service != null ? service.toLowerCase() : "";
        if (s.contains("cashin")) {
            return -Math.abs(value);
        }
        return value;
    }
} 