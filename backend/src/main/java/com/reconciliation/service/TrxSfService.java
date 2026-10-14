package com.reconciliation.service;

import com.reconciliation.entity.TrxSfEntity;
import com.reconciliation.repository.TrxSfRepository;
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
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import com.reconciliation.entity.FraisTransactionEntity;
import com.reconciliation.service.FraisTransactionService;

@Service
public class TrxSfService {
    
    @Autowired
    private TrxSfRepository trxSfRepository;
    
    @Autowired
    private FraisTransactionService fraisTransactionService;
    
    public List<TrxSfEntity> getAllTrxSf() {
        return trxSfRepository.findAllOrderByDateTransactionDesc();
    }
    
    /**
     * Récupérer tous les transactions SF avec filtres
     */
    public List<TrxSfEntity> getTrxSfs(String agence, String service, String pays, 
                                      String numeroTransGu, String statut, String dateDebut, 
                                      String dateFin) {
        
        LocalDateTime dateDebutParsed = null;
        LocalDateTime dateFinParsed = null;
        
        if (dateDebut != null && !dateDebut.isEmpty()) {
            try {
                // Gérer différents formats de date
                if (dateDebut.contains("T")) {
                    dateDebutParsed = LocalDateTime.parse(dateDebut.replace("T", " "));
                } else if (dateDebut.matches("\\d{4}-\\d{2}-\\d{2}")) {
                    // Format "YYYY-MM-DD" - ajouter 00:00:00 pour le début de journée
                    dateDebutParsed = LocalDateTime.parse(dateDebut + " 00:00:00", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                } else {
                    // Format "YYYY-MM-DD HH:mm:ss"
                    dateDebutParsed = LocalDateTime.parse(dateDebut, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
                System.out.println("[TRX_SF][SRV] dateDebut input=" + dateDebut + " parsed=" + dateDebutParsed);
            } catch (Exception e) {
                System.err.println("Erreur parsing date début: " + dateDebut + " - " + e.getMessage());
                // Date invalide, on ignore le filtre
            }
        }
        
        if (dateFin != null && !dateFin.isEmpty()) {
            try {
                // Gérer différents formats de date
                if (dateFin.contains("T")) {
                    dateFinParsed = LocalDateTime.parse(dateFin.replace("T", " "));
                } else if (dateFin.matches("\\d{4}-\\d{2}-\\d{2}")) {
                    // Format "YYYY-MM-DD" - ajouter 23:59:59 pour la fin de journée
                    dateFinParsed = LocalDateTime.parse(dateFin + " 23:59:59", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                } else {
                    // Format "YYYY-MM-DD HH:mm:ss"
                    dateFinParsed = LocalDateTime.parse(dateFin, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
                System.out.println("[TRX_SF][SRV] dateFin input=" + dateFin + " parsed=" + dateFinParsed);
            } catch (Exception e) {
                System.err.println("Erreur parsing date fin: " + dateFin + " - " + e.getMessage());
                // Date invalide, on ignore le filtre
            }
        }

        System.out.println("[TRX_SF][SRV] filters agence=" + agence + ", service=" + service + ", statut=" + statut +
            ", dateDebutParsed=" + dateDebutParsed + ", dateFinParsed=" + dateFinParsed);
        List<TrxSfEntity> results = trxSfRepository.findWithFilters(
            agence, service, pays, numeroTransGu, statut, dateDebutParsed, dateFinParsed);
        System.out.println("[TRX_SF][SRV] results size=" + (results != null ? results.size() : 0));
        
        return results;
    }
    
    public Optional<TrxSfEntity> getTrxSfById(Long id) {
        return trxSfRepository.findById(id);
    }
    
    public List<TrxSfEntity> getTrxSfByAgence(String agence) {
        return trxSfRepository.findByAgence(agence);
    }
    
    public List<TrxSfEntity> getTrxSfByService(String service) {
        return trxSfRepository.findByService(service);
    }
    
    public List<TrxSfEntity> getTrxSfByPays(String pays) {
        return trxSfRepository.findByPays(pays);
    }
    
    public List<TrxSfEntity> getTrxSfByStatut(String statut) {
        return trxSfRepository.findByStatut(statut);
    }
    
    public List<TrxSfEntity> getTrxSfByDateRange(LocalDateTime dateDebut, LocalDateTime dateFin) {
        return trxSfRepository.findByDateTransactionBetween(dateDebut, dateFin);
    }
    
    public List<String> getDistinctAgences() {
        return trxSfRepository.findDistinctAgence();
    }
    
    public List<String> getDistinctServices() {
        return trxSfRepository.findDistinctService();
    }
    
    public List<String> getDistinctPays() {
        return trxSfRepository.findDistinctPays();
    }
    
    public List<String> getDistinctNumeroTransGu() {
        return trxSfRepository.findDistinctNumeroTransGu();
    }
    
    /**
     * Traiter un fichier pour changer le statut des transactions correspondantes
     */
    public Map<String, Object> processStatutChangeFile(MultipartFile file) throws IOException {
        System.out.println("🔄 Début du traitement du fichier de changement de statut");
        System.out.println("📁 Nom du fichier: " + file.getOriginalFilename());
        System.out.println("📏 Taille du fichier: " + file.getSize() + " bytes");
        
        Map<String, Object> result = new HashMap<>();
        int totalLines = 0;
        int processedLines = 0;
        int updatedLines = 0;
        int errorLines = 0;
        List<String> errors = new ArrayList<>();
        
        try {
            String fileExtension = getFileExtension(file.getOriginalFilename());
            List<String[]> fileData = new ArrayList<>();
            
            if ("csv".equalsIgnoreCase(fileExtension)) {
                fileData = parseCsvFile(file);
            } else if ("xlsx".equalsIgnoreCase(fileExtension) || "xls".equalsIgnoreCase(fileExtension)) {
                fileData = parseExcelFile(file);
            } else {
                throw new IllegalArgumentException("Format de fichier non supporté. Utilisez CSV, XLS ou XLSX.");
            }
            
            if (fileData.isEmpty()) {
                throw new IllegalArgumentException("Le fichier est vide ou ne contient pas de données valides.");
            }
            
            // Vérifier les en-têtes
            String[] headers = fileData.get(0);
            System.out.println("📋 En-têtes détectés: " + String.join(", ", headers));
            
            int agenceIndex = -1;
            int numeroTransGuIndex = -1;
            
            for (int i = 0; i < headers.length; i++) {
                String header = headers[i].trim().toLowerCase();
                if (header.contains("agence")) {
                    agenceIndex = i;
                } else if (header.contains("numero") && header.contains("trans") && header.contains("gu")) {
                    numeroTransGuIndex = i;
                }
            }
            
            if (agenceIndex == -1 || numeroTransGuIndex == -1) {
                throw new IllegalArgumentException("Le fichier doit contenir les colonnes 'Agence' et 'Numero Trans GU'");
            }
            
            System.out.println("✅ Colonnes trouvées - Agence: " + agenceIndex + ", Numero Trans GU: " + numeroTransGuIndex);
            
            // Traiter les lignes de données (en commençant par l'index 1 pour ignorer les en-têtes)
            for (int i = 1; i < fileData.size(); i++) {
                totalLines++;
                String[] row = fileData.get(i);
                
                try {
                    if (row.length <= Math.max(agenceIndex, numeroTransGuIndex)) {
                        errors.add("Ligne " + (i + 1) + ": Nombre de colonnes insuffisant");
                        errorLines++;
                        continue;
                    }
                    
                    String agence = row[agenceIndex].trim();
                    String numeroTransGu = row[numeroTransGuIndex].trim();
                    
                    if (agence.isEmpty() || numeroTransGu.isEmpty()) {
                        errors.add("Ligne " + (i + 1) + ": Agence ou Numero Trans GU vide");
                        errorLines++;
                        continue;
                    }
                    
                    System.out.println("🔍 Recherche - Agence: " + agence + ", Numero Trans GU: " + numeroTransGu);
                    
                    // Rechercher la transaction correspondante
                    List<TrxSfEntity> matchingTransactions = trxSfRepository.findByAgenceAndNumeroTransGu(agence, numeroTransGu);
                    
                    if (matchingTransactions.isEmpty()) {
                        errors.add("Ligne " + (i + 1) + ": Aucune transaction trouvée pour Agence=" + agence + ", Numero Trans GU=" + numeroTransGu);
                        errorLines++;
                        continue;
                    }
                    
                    // Mettre à jour le statut de toutes les transactions correspondantes
                    for (TrxSfEntity transaction : matchingTransactions) {
                        if (!"TRAITE".equals(transaction.getStatut())) {
                            transaction.setStatut("TRAITE");
                            trxSfRepository.save(transaction);
                            updatedLines++;
                            System.out.println("✅ Statut mis à jour pour ID: " + transaction.getId() + " - Agence: " + agence + ", Numero Trans GU: " + numeroTransGu);
                        } else {
                            System.out.println("ℹ️ Transaction déjà traitée - ID: " + transaction.getId() + " - Agence: " + agence + ", Numero Trans GU: " + numeroTransGu);
                        }
                    }
                    
                    processedLines++;
                    
                } catch (Exception e) {
                    System.out.println("❌ Erreur lors du traitement de la ligne " + (i + 1) + ": " + e.getMessage());
                    errors.add("Ligne " + (i + 1) + ": " + e.getMessage());
                    errorLines++;
                }
            }
            
        } catch (Exception e) {
            System.out.println("❌ Erreur générale lors du traitement: " + e.getMessage());
            throw new RuntimeException("Erreur lors du traitement du fichier: " + e.getMessage(), e);
        }
        
        result.put("totalLines", totalLines);
        result.put("processedLines", processedLines);
        result.put("updatedLines", updatedLines);
        result.put("errorLines", errorLines);
        result.put("errors", errors);
        result.put("success", errorLines == 0);
        
        System.out.println("📊 Résultat final:");
        System.out.println("   - Total lignes: " + totalLines);
        System.out.println("   - Lignes traitées: " + processedLines);
        System.out.println("   - Lignes mises à jour: " + updatedLines);
        System.out.println("   - Lignes avec erreurs: " + errorLines);
        
        return result;
    }
    
    /**
     * Obtenir l'extension d'un fichier
     */
    private String getFileExtension(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex == -1) {
            return "";
        }
        return filename.substring(lastDotIndex + 1).toLowerCase();
    }
    
    /**
     * Parser un fichier CSV
     */
    private List<String[]> parseCsvFile(MultipartFile file) throws IOException {
        List<String[]> data = new ArrayList<>();
        String separator = detectSeparator(file);
        
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.trim().isEmpty()) {
                    String[] values = line.split(separator);
                    data.add(values);
                }
            }
        }
        return data;
    }
    
    /**
     * Parser un fichier Excel
     */
    private List<String[]> parseExcelFile(MultipartFile file) throws IOException {
        List<String[]> data = new ArrayList<>();
        
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            
            for (Row row : sheet) {
                String[] rowData = new String[row.getLastCellNum()];
                for (int i = 0; i < row.getLastCellNum(); i++) {
                    Cell cell = row.getCell(i);
                    rowData[i] = cell != null ? cell.toString() : "";
                }
                data.add(rowData);
            }
        }
        return data;
    }
    
    /**
     * Détecter le séparateur CSV
     */
    private String detectSeparator(MultipartFile file) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
            String firstLine = reader.readLine();
            if (firstLine != null) {
                if (firstLine.contains(",")) return ",";
                if (firstLine.contains(";")) return ";";
                if (firstLine.contains("\t")) return "\t";
            }
        }
        return ","; // Séparateur par défaut
    }
    
    @Transactional
    public TrxSfEntity createTrxSf(TrxSfEntity trxSf) {
        return trxSfRepository.save(trxSf);
    }
    
    @Transactional
    public List<TrxSfEntity> createMultipleTrxSf(List<TrxSfEntity> trxSfList) {
        return trxSfRepository.saveAll(trxSfList);
    }
    
    @Transactional
    public TrxSfEntity updateTrxSf(Long id, TrxSfEntity trxSf) {
        if (trxSfRepository.existsById(id)) {
            trxSf.setId(id);
            return trxSfRepository.save(trxSf);
        }
        return null;
    }
    
    @Transactional
    public boolean deleteTrxSf(Long id) {
        if (trxSfRepository.existsById(id)) {
            trxSfRepository.deleteById(id);
            return true;
        }
        return false;
    }
    
    @Transactional
    public boolean updateStatut(Long id, String nouveauStatut) {
        Optional<TrxSfEntity> optional = trxSfRepository.findById(id);
        if (optional.isPresent()) {
            TrxSfEntity trxSf = optional.get();
            trxSf.setStatut(nouveauStatut);
            trxSfRepository.save(trxSf);
            return true;
        }
        return false;
    }
    
    @Transactional
    public boolean updateStatutWithComment(Long id, String nouveauStatut, String commentaire) {
        Optional<TrxSfEntity> optional = trxSfRepository.findById(id);
        if (optional.isPresent()) {
            TrxSfEntity trxSf = optional.get();
            trxSf.setStatut(nouveauStatut);
            trxSf.setCommentaire(commentaire);
            trxSfRepository.save(trxSf);
            return true;
        }
        return false;
    }
    
    @Transactional
    public List<TrxSfEntity> uploadCsvFile(MultipartFile file) throws IOException {
        List<TrxSfEntity> newTrxSfList = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        int duplicatesFound = 0;
        int totalLines = 0;
        int processedLines = 0;
        int errorLines = 0;
        
        System.out.println("=== DÉBUT uploadCsvFile TRX SF ===");
        String fileName = file.getOriginalFilename();
        System.out.println("DEBUG: Nom du fichier: " + (fileName != null ? fileName : "unknown"));
        System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
        System.out.println("DEBUG: Type MIME: " + file.getContentType());
        
        try (BufferedReader br = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
            String line;
            boolean isFirstLine = true;
            int lineNumber = 0;
            
            // Compter le nombre total de lignes
            System.out.println("DEBUG: Lecture du fichier pour compter les lignes...");
            while ((line = br.readLine()) != null) {
                totalLines++;
            }
            System.out.println("DEBUG: Nombre total de lignes dans le fichier: " + totalLines);
            
            // Réinitialiser le BufferedReader
            try (BufferedReader br2 = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
                while ((line = br2.readLine()) != null) {
                lineNumber++;
                    processedLines++;
                    
                if (isFirstLine) {
                    isFirstLine = false;
                        System.out.println("DEBUG: En-tête détecté (ligne " + lineNumber + "): " + line);
                        System.out.println("DEBUG: Longueur de l'en-tête: " + line.length() + " caractères");
                    continue; // Skip header
                }
                    
                    System.out.println("DEBUG: Traitement ligne " + lineNumber + "/" + totalLines + " - Progression: " + Math.round((processedLines * 100.0) / totalLines) + "%");
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Longueur: " + line.length() + " caractères");
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Contenu brut: '" + line + "'");
                
                try {
                    String[] values = line.split(";");
                        System.out.println("DEBUG: Ligne " + lineNumber + " - Nombre de colonnes après split: " + values.length);
                        
                        // Afficher chaque colonne
                        for (int i = 0; i < values.length; i++) {
                            System.out.println("DEBUG: Ligne " + lineNumber + " - Colonne " + i + ": '" + values[i].trim() + "'");
                        }
                        
                        if (values.length >= 9) {
                            System.out.println("DEBUG: Ligne " + lineNumber + " - Appel de parseTrxSfFromValues...");
                        TrxSfEntity trxSf = parseTrxSfFromValues(values, formatter);
                            
                        if (trxSf != null) {
                                System.out.println("DEBUG: Ligne " + lineNumber + " - Entité créée avec succès - ID: " + trxSf.getIdTransaction());
                                
                            // Vérifier si la transaction existe déjà
                                System.out.println("DEBUG: Ligne " + lineNumber + " - Vérification des doublons...");
                            boolean exists = existsByTransactionDetails(
                                trxSf.getIdTransaction(), 
                                trxSf.getAgence(), 
                                trxSf.getDateTransaction().toString()
                            );
                            
                            if (exists) {
                                duplicatesFound++;
                                    System.out.println("DEBUG: Ligne " + lineNumber + " - DOUBLON DÉTECTÉ pour ID: " + trxSf.getIdTransaction() + " - Ignoré");
                            } else {
                                newTrxSfList.add(trxSf);
                                    System.out.println("DEBUG: Ligne " + lineNumber + " - NOUVELLE TRANSACTION AJOUTÉE - ID: " + trxSf.getIdTransaction());
                            }
                            } else {
                                errorLines++;
                                System.out.println("DEBUG: Ligne " + lineNumber + " - ERREUR: parseTrxSfFromValues a retourné null");
                        }
                    } else {
                                errorLines++;
                                System.out.println("DEBUG: Ligne " + lineNumber + " - ERREUR: Nombre de colonnes insuffisant (" + values.length + " < 9)");
                                System.out.println("DEBUG: Ligne " + lineNumber + " - Contenu: '" + line + "'");
                            }
                    } catch (NumberFormatException e) {
                        errorLines++;
                        System.err.println("DEBUG: Ligne " + lineNumber + " - ERREUR NumberFormatException: " + e.getMessage());
                        System.err.println("DEBUG: Ligne " + lineNumber + " - Contenu: '" + line + "'");
                        e.printStackTrace();
                    } catch (DateTimeParseException e) {
                        errorLines++;
                        System.err.println("DEBUG: Ligne " + lineNumber + " - ERREUR DateTimeParseException: " + e.getMessage());
                        System.err.println("DEBUG: Ligne " + lineNumber + " - Contenu: '" + line + "'");
                        System.err.println("DEBUG: Ligne " + lineNumber + " - Format attendu: yyyy-MM-dd HH:mm:ss");
                        e.printStackTrace();
                } catch (Exception e) {
                        errorLines++;
                        System.err.println("DEBUG: Ligne " + lineNumber + " - ERREUR GÉNÉRALE: " + e.getMessage());
                        System.err.println("DEBUG: Ligne " + lineNumber + " - Contenu: '" + line + "'");
                    e.printStackTrace();
                }
            }
            }
        } catch (Exception e) {
            System.err.println("DEBUG: ERREUR CRITIQUE lors de la lecture du fichier: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
        
        System.out.println("DEBUG: === RÉSUMÉ DU TRAITEMENT ===");
        System.out.println("DEBUG: Total de lignes dans le fichier: " + totalLines);
        System.out.println("DEBUG: Lignes traitées: " + processedLines);
        System.out.println("DEBUG: Lignes avec erreurs: " + errorLines);
        System.out.println("DEBUG: Doublons détectés: " + duplicatesFound);
        System.out.println("DEBUG: Nouvelles transactions à insérer: " + newTrxSfList.size());
        System.out.println("DEBUG: === FIN RÉSUMÉ ===");
        
        if (newTrxSfList.isEmpty()) {
            System.out.println("DEBUG: ATTENTION - Aucune nouvelle transaction à insérer!");
        } else {
            System.out.println("DEBUG: Sauvegarde en base de données...");
            List<TrxSfEntity> savedEntities = trxSfRepository.saveAll(newTrxSfList);
            System.out.println("DEBUG: " + savedEntities.size() + " entités sauvegardées avec succès");
        }
        
        System.out.println("=== FIN uploadCsvFile TRX SF ===");
        return trxSfRepository.saveAll(newTrxSfList);
    }
    
    @Transactional
    public List<TrxSfEntity> uploadExcelFile(MultipartFile file) throws IOException {
        List<TrxSfEntity> trxSfList = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    TrxSfEntity trxSf = parseTrxSfFromExcelRow(row, formatter);
                    if (trxSf != null) {
                        trxSfList.add(trxSf);
                    }
                }
            }
        }
        
        return trxSfRepository.saveAll(trxSfList);
    }
    
    public Map<String, Object> validateFile(MultipartFile file) throws IOException {
        Map<String, Object> result = new HashMap<>();
        List<TrxSfEntity> validRecords = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int validLines = 0;
        int errorLines = 0;
        int duplicates = 0;
        int newRecords = 0;
        int totalLines = 0;
        int processedLines = 0;
        
        System.out.println("=== DÉBUT validateFile TRX SF ===");
        String originalFileName = file.getOriginalFilename();
        System.out.println("DEBUG: Nom du fichier: " + (originalFileName != null ? originalFileName : "unknown"));
        System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
        System.out.println("DEBUG: Type MIME: " + file.getContentType());
        
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        String fileName = originalFileName != null ? originalFileName.toLowerCase() : "";
        
        try {
            if (fileName.endsWith(".csv")) {
                // Validation des fichiers CSV
                System.out.println("DEBUG: Traitement fichier CSV");
                
                // Compter le nombre total de lignes
                System.out.println("DEBUG: Comptage des lignes du fichier CSV...");
                try (BufferedReader brCount = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
                    while (brCount.readLine() != null) {
                        totalLines++;
                    }
                }
                System.out.println("DEBUG: Nombre total de lignes dans le fichier CSV: " + totalLines);
                
                try (BufferedReader br = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
                    String line;
                    boolean isFirstLine = true;
                    int lineNumber = 0;
                    
                    while ((line = br.readLine()) != null) {
                        lineNumber++;
                        processedLines++;
                        
                        if (isFirstLine) {
                            isFirstLine = false;
                            System.out.println("DEBUG: En-tête détecté (ligne " + lineNumber + "): " + line);
                            System.out.println("DEBUG: Longueur de l'en-tête: " + line.length() + " caractères");
                            continue;
                        }
                        
                        System.out.println("DEBUG: Validation ligne " + lineNumber + "/" + totalLines + " - Progression: " + Math.round((processedLines * 100.0) / totalLines) + "%");
                        System.out.println("DEBUG: Ligne " + lineNumber + " - Longueur: " + line.length() + " caractères");
                        System.out.println("DEBUG: Ligne " + lineNumber + " - Contenu brut: '" + line + "'");
                        
                        try {
                            String[] values = line.split(";");
                            System.out.println("DEBUG: Ligne " + lineNumber + " - Nombre de colonnes après split: " + values.length);
                            
                            // Afficher chaque colonne
                            for (int i = 0; i < values.length; i++) {
                                System.out.println("DEBUG: Ligne " + lineNumber + " - Colonne " + i + ": '" + values[i].trim() + "'");
                            }
                            
                            if (values.length >= 9) {
                                TrxSfEntity trxSf = parseTrxSfFromValues(values, formatter);
                                
                                // Vérifier les doublons
                                if (trxSfRepository.existsByIdTransaction(trxSf.getIdTransaction())) {
                                    duplicates++;
                                    errors.add("Ligne " + lineNumber + ": Doublon détecté pour ID " + trxSf.getIdTransaction());
                                    System.out.println("DEBUG: Doublon détecté pour ID: " + trxSf.getIdTransaction());
                                } else {
                                    newRecords++;
                                    validRecords.add(trxSf);
                                    System.out.println("DEBUG: Nouvel enregistrement ajouté pour ID: " + trxSf.getIdTransaction());
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
                    totalLines = sheet.getLastRowNum();
                    System.out.println("DEBUG: Nombre de lignes dans la feuille Excel: " + totalLines);
                    System.out.println("DEBUG: Nombre de feuilles dans le workbook: " + workbook.getNumberOfSheets());
                    System.out.println("DEBUG: Nom de la première feuille: " + sheet.getSheetName());
                    
                    for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                        processedLines++;
                        Row row = sheet.getRow(i);
                        System.out.println("DEBUG: Traitement ligne Excel " + i + "/" + totalLines + " - Progression: " + Math.round((processedLines * 100.0) / totalLines) + "%");
                        
                        if (row != null) {
                            System.out.println("DEBUG: Ligne Excel " + i + " - Nombre de cellules: " + row.getLastCellNum());
                            try {
                                TrxSfEntity trxSf = parseTrxSfFromExcelRow(row, formatter);
                                
                                if (trxSf != null) {
                                    System.out.println("DEBUG: Ligne Excel " + i + " - Entité créée avec succès - ID: " + trxSf.getIdTransaction());
                                
                                // Vérifier les doublons
                                if (trxSfRepository.existsByIdTransaction(trxSf.getIdTransaction())) {
                                    duplicates++;
                                    errors.add("Ligne " + (i + 1) + ": Doublon détecté pour ID " + trxSf.getIdTransaction());
                                        System.out.println("DEBUG: Ligne Excel " + i + " - DOUBLON DÉTECTÉ pour ID: " + trxSf.getIdTransaction());
                                } else {
                                    newRecords++;
                                    validRecords.add(trxSf);
                                        System.out.println("DEBUG: Ligne Excel " + i + " - NOUVEL ENREGISTREMENT AJOUTÉ - ID: " + trxSf.getIdTransaction());
                                }
                                validLines++;
                                } else {
                                    errorLines++;
                                    errors.add("Ligne " + (i + 1) + ": Impossible de parser la ligne");
                                    System.out.println("DEBUG: Ligne Excel " + i + " - ERREUR: parseTrxSfFromExcelRow a retourné null");
                                }
                            } catch (Exception e) {
                                errorLines++;
                                errors.add("Ligne " + (i + 1) + ": " + e.getMessage());
                                System.out.println("DEBUG: Ligne Excel " + i + " - EXCEPTION: " + e.getMessage());
                                e.printStackTrace();
                            }
                        } else {
                            System.out.println("DEBUG: Ligne Excel " + i + " - Ligne vide, ignorée");
                        }
                    }
                } catch (Exception e) {
                    System.out.println("DEBUG: ERREUR lors de la lecture du fichier Excel: " + e.getMessage());
                    e.printStackTrace();
                    throw e;
                }
            } else {
                System.out.println("DEBUG: ERREUR - Type de fichier non supporté: " + fileName);
                errors.add("Type de fichier non supporté: " + fileName);
            }
        } catch (Exception e) {
            System.out.println("DEBUG: EXCEPTION GÉNÉRALE dans validateFile: " + e.getMessage());
            e.printStackTrace();
            errors.add("Erreur générale: " + e.getMessage());
        }
        
        System.out.println("DEBUG: === RÉSUMÉ DE LA VALIDATION ===");
        System.out.println("DEBUG: Total de lignes dans le fichier: " + totalLines);
        System.out.println("DEBUG: Lignes traitées: " + processedLines);
        System.out.println("DEBUG: Lignes valides: " + validLines);
        System.out.println("DEBUG: Lignes avec erreurs: " + errorLines);
        System.out.println("DEBUG: Doublons détectés: " + duplicates);
        System.out.println("DEBUG: Nouveaux enregistrements: " + newRecords);
        System.out.println("DEBUG: Nombre d'erreurs: " + errors.size());
        System.out.println("DEBUG: === FIN RÉSUMÉ ===");
        System.out.println("=== FIN validateFile TRX SF ===");
        
        result.put("validLines", validLines);
        result.put("errorLines", errorLines);
        result.put("duplicates", duplicates);
        result.put("newRecords", newRecords);
        result.put("errors", errors);
        result.put("hasErrors", errorLines > 0);
        result.put("totalLines", totalLines);
        result.put("processedLines", processedLines);
        
        return result;
    }
    
    public Map<String, Object> getStatistics() {
        Map<String, Object> stats = new HashMap<>();
        
        stats.put("total", trxSfRepository.count());
        stats.put("enAttente", trxSfRepository.countByStatut("EN_ATTENTE"));
        stats.put("traite", trxSfRepository.countByStatut("TRAITE"));
        stats.put("erreur", trxSfRepository.countByStatut("ERREUR"));
        
        Double totalMontant = trxSfRepository.sumMontantByStatut("EN_ATTENTE");
        if (totalMontant != null) {
            stats.put("totalMontant", totalMontant);
        } else {
            stats.put("totalMontant", 0.0);
        }
        
        Double totalFrais = trxSfRepository.sumFraisByStatut("EN_ATTENTE");
        if (totalFrais != null) {
            stats.put("totalFrais", totalFrais);
        } else {
            stats.put("totalFrais", 0.0);
        }
        
        return stats;
    }
    
    /**
     * Récupérer la somme des frais par agence et date
     */
    public Double getFraisByAgenceAndDate(String agence, String date) {
        Double frais = trxSfRepository.sumFraisByAgenceAndDate(com.reconciliation.tenant.TenantContext.get(), agence, date);
        return frais != null ? frais : 0.0;
    }
    
    /**
     * Récupérer la somme des frais par agence et date, uniquement pour les transactions EN_ATTENTE
     */
    public Double getFraisByAgenceAndDateEnAttente(String agence, String date) {
        Double frais = trxSfRepository.sumFraisByAgenceAndDateAndStatutEnAttente(com.reconciliation.tenant.TenantContext.get(), agence, date);
        return frais != null ? frais : 0.0;
    }

    /**
     * Récupérer la somme des frais par agence, date et service
     */
    public Double getFraisByAgenceAndDateAndService(String agence, String date, String service) {
        Double frais = trxSfRepository.sumFraisByAgenceAndDateAndService(com.reconciliation.tenant.TenantContext.get(), agence, date, service);
        return frais != null ? frais : 0.0;
    }

    /**
     * Récupérer la somme des frais par agence, date et service, uniquement pour les transactions EN_ATTENTE
     */
    public Double getFraisByAgenceAndDateAndServiceEnAttente(String agence, String date, String service) {
        Double frais = trxSfRepository.sumFraisByAgenceAndDateAndServiceAndStatutEnAttente(com.reconciliation.tenant.TenantContext.get(), agence, date, service);
        return frais != null ? frais : 0.0;
    }

    /**
     * Récupérer la configuration des frais par service
     */
    public Map<String, Object> getFraisConfigByService(String service) {
        // Configuration des frais par service depuis la table frais_transaction
        Map<String, Object> config = new HashMap<>();
        
        try {
            // Chercher un frais applicable pour ce service (on prend le premier trouvé)
            List<FraisTransactionEntity> fraisList = fraisTransactionService.getFraisTransactionsByService(service);
            
            if (!fraisList.isEmpty()) {
                // Prendre le premier frais actif trouvé
                FraisTransactionEntity frais = fraisList.stream()
                    .filter(f -> f.getActif())
                    .findFirst()
                    .orElse(fraisList.get(0)); // Fallback sur le premier si aucun actif
                
                config.put("typeFrais", frais.getTypeCalcul());
                config.put("montant", frais.getMontantFrais());
                config.put("pourcentage", frais.getPourcentage());
                config.put("description", frais.getDescription());
                config.put("service", service);
                config.put("agence", frais.getAgence());
                
                System.out.println("DEBUG: Configuration frais trouvée pour " + service + ":");
                System.out.println("  - Type: " + frais.getTypeCalcul());
                System.out.println("  - Montant: " + frais.getMontantFrais());
                System.out.println("  - Pourcentage: " + frais.getPourcentage());
                System.out.println("  - Agence: " + frais.getAgence());
                
            } else {
                // Pas de configuration trouvée, utiliser les valeurs par défaut
                config.put("typeFrais", "FIXE");
                config.put("montant", 0.0);
                config.put("pourcentage", null);
                config.put("description", "Configuration par défaut");
                config.put("service", service);
                config.put("agence", null);
                
                System.out.println("DEBUG: Aucune configuration frais trouvée pour " + service + ", utilisation des valeurs par défaut");
            }
            
        } catch (Exception e) {
            System.err.println("ERREUR lors de la récupération de la configuration des frais pour " + service + ": " + e.getMessage());
            
            // Configuration par défaut en cas d'erreur
            config.put("typeFrais", "FIXE");
            config.put("montant", 0.0);
            config.put("pourcentage", null);
            config.put("description", "Configuration par défaut (erreur)");
            config.put("service", service);
            config.put("agence", null);
        }
        
        return config;
    }
    
    /**
     * Vérifier si une transaction existe déjà
     */
    public boolean existsByTransactionDetails(String idTransaction, String agence, String dateTransaction) {
        Long count = trxSfRepository.countByTransactionDetails(com.reconciliation.tenant.TenantContext.get(), idTransaction, agence, dateTransaction);
        return count != null && count > 0;
    }
    
    /**
     * Récupérer les transactions en doublon
     */
    public List<TrxSfEntity> findDuplicates() {
        return trxSfRepository.findDuplicates(com.reconciliation.tenant.TenantContext.get());
    }
    
    /**
     * Supprimer les doublons en gardant la plus récente
     */
    @Transactional
    public int removeDuplicates() {
        System.out.println("=== DÉBUT removeDuplicates ===");
        
        // D'abord, compter les doublons existants
        List<TrxSfEntity> duplicatesList = trxSfRepository.findDuplicates(com.reconciliation.tenant.TenantContext.get());
        System.out.println("DEBUG: Nombre de doublons trouvés avant suppression: " + duplicatesList.size());
        
        // Afficher quelques exemples de doublons
        duplicatesList.stream().limit(5).forEach(duplicate -> {
            System.out.println("DEBUG: Doublon - ID: " + duplicate.getIdTransaction() + 
                ", Agence: " + duplicate.getAgence() + 
                ", Date: " + duplicate.getDateTransaction() + 
                ", DB ID: " + duplicate.getId());
        });
        
        // Supprimer les doublons
        int removedCount = trxSfRepository.removeDuplicates(com.reconciliation.tenant.TenantContext.get());
        System.out.println("DEBUG: Nombre de doublons supprimés: " + removedCount);
        
        // Vérifier après suppression
        List<TrxSfEntity> remainingDuplicates = trxSfRepository.findDuplicates(com.reconciliation.tenant.TenantContext.get());
        System.out.println("DEBUG: Nombre de doublons restants après suppression: " + remainingDuplicates.size());
        
        System.out.println("=== FIN removeDuplicates ===");
        return removedCount;
    }
    
    /**
     * Supprimer les doublons manuellement (approche alternative)
     */
    @Transactional
    public int removeDuplicatesManually() {
        System.out.println("=== DÉBUT removeDuplicatesManually ===");
        
        List<TrxSfEntity> duplicates = trxSfRepository.findDuplicates(com.reconciliation.tenant.TenantContext.get());
        System.out.println("DEBUG: Nombre de doublons trouvés: " + duplicates.size());
        
        // Grouper par clé unique (idTransaction + agence + date)
        Map<String, List<TrxSfEntity>> groupedDuplicates = duplicates.stream()
            .collect(Collectors.groupingBy(entity -> 
                entity.getIdTransaction() + "_" + entity.getAgence() + "_" + 
                entity.getDateTransaction().toLocalDate().toString()
            ));
        
        int removedCount = 0;
        
        for (Map.Entry<String, List<TrxSfEntity>> entry : groupedDuplicates.entrySet()) {
            List<TrxSfEntity> duplicateGroup = entry.getValue();
            
            if (duplicateGroup.size() > 1) {
                // Trier par ID (garder le plus récent = ID le plus élevé)
                duplicateGroup.sort((a, b) -> Long.compare(b.getId(), a.getId()));
                
                // Supprimer tous sauf le premier (le plus récent)
                for (int i = 1; i < duplicateGroup.size(); i++) {
                    TrxSfEntity toDelete = duplicateGroup.get(i);
                    System.out.println("DEBUG: Suppression doublon ID DB: " + toDelete.getId() + 
                        ", ID Transaction: " + toDelete.getIdTransaction());
                    trxSfRepository.delete(toDelete);
                    removedCount++;
                }
            }
        }
        
        System.out.println("DEBUG: Nombre de doublons supprimés manuellement: " + removedCount);
        System.out.println("=== FIN removeDuplicatesManually ===");
        return removedCount;
    }
    
    private TrxSfEntity parseTrxSfFromValues(String[] values, DateTimeFormatter formatter) {
        try {
            System.out.println("DEBUG: === DÉBUT parseTrxSfFromValues ===");
            System.out.println("DEBUG: Nombre de valeurs reçues: " + values.length);
            
            TrxSfEntity trxSf = new TrxSfEntity();
            
            // Vérifier que nous avons assez de colonnes
            if (values.length < 9) {
                System.out.println("DEBUG: ERREUR - Nombre de colonnes insuffisant: " + values.length + " (attendu: 9)");
                throw new IllegalArgumentException("Nombre de colonnes insuffisant: " + values.length + " (attendu: 9)");
            }
            
            // ID Transaction (colonne 0)
            String idTransaction = values[0] != null ? values[0].trim() : "";
            System.out.println("DEBUG: ID Transaction: '" + idTransaction + "'");
            trxSf.setIdTransaction(idTransaction);
            
            // Téléphone Client (colonne 1)
            String telephoneClient = values[1] != null ? values[1].trim() : "";
            System.out.println("DEBUG: Téléphone Client: '" + telephoneClient + "'");
            trxSf.setTelephoneClient(telephoneClient);
            
            // Parser le montant (colonne 2)
            System.out.println("DEBUG: Montant brut: '" + values[2] + "'");
            if (values[2] != null && !values[2].trim().isEmpty()) {
                try {
                    String montantStr = values[2].trim().replace(",", ".");
                    System.out.println("DEBUG: Montant après remplacement virgule: '" + montantStr + "'");
                    Double montant = Double.parseDouble(montantStr);
                    System.out.println("DEBUG: Montant parsé: " + montant);
                    trxSf.setMontant(montant);
                } catch (NumberFormatException e) {
                    System.out.println("DEBUG: ERREUR parsing montant: " + e.getMessage());
                    throw new IllegalArgumentException("Montant invalide: '" + values[2] + "' - " + e.getMessage());
                }
            } else {
                System.out.println("DEBUG: Montant vide, valeur par défaut: 0.0");
                trxSf.setMontant(0.0);
            }
            
            // Service (colonne 3)
            String service = values[3] != null ? values[3].trim() : "";
            System.out.println("DEBUG: Service: '" + service + "'");
            trxSf.setService(service);
            
            // Agence (colonne 4)
            String agence = values[4] != null ? values[4].trim() : "";
            System.out.println("DEBUG: Agence: '" + agence + "'");
            trxSf.setAgence(agence);
            
            // Parser la date (colonne 5)
            System.out.println("DEBUG: Date brute: '" + values[5] + "'");
            if (values[5] != null && !values[5].trim().isEmpty()) {
                try {
                    String dateStr = values[5].trim();
                    System.out.println("DEBUG: Date après trim: '" + dateStr + "'");
                    
                    // Gérer le format avec millisecondes (.0)
                    if (dateStr.endsWith(".0")) {
                        dateStr = dateStr.substring(0, dateStr.length() - 2);
                        System.out.println("DEBUG: Date après suppression .0: '" + dateStr + "'");
                    }
                    
                    System.out.println("DEBUG: Format attendu: yyyy-MM-dd HH:mm:ss");
                    LocalDateTime dateTransaction = LocalDateTime.parse(dateStr, formatter);
                    System.out.println("DEBUG: Date parsée: " + dateTransaction);
                    trxSf.setDateTransaction(dateTransaction);
                } catch (Exception e) {
                    System.out.println("DEBUG: ERREUR parsing date: " + e.getMessage());
                    throw new IllegalArgumentException("Date invalide: '" + values[5] + "' - " + e.getMessage());
                }
            } else {
                System.out.println("DEBUG: Date vide, valeur par défaut: maintenant");
                trxSf.setDateTransaction(LocalDateTime.now());
            }
            
            // Numéro Trans GU (colonne 6)
            String numeroTransGu = values[6] != null ? values[6].trim() : "";
            System.out.println("DEBUG: Numéro Trans GU: '" + numeroTransGu + "'");
            trxSf.setNumeroTransGu(numeroTransGu);
            
            // Pays (colonne 7)
            String pays = values[7] != null ? values[7].trim() : "";
            System.out.println("DEBUG: Pays: '" + pays + "'");
            trxSf.setPays(pays);
            
            // Commentaire (colonne 8 - Statut)
            String commentaire = values[8] != null ? values[8].trim() : "";
            System.out.println("DEBUG: Commentaire: '" + commentaire + "'");
            trxSf.setCommentaire(commentaire);
            
            // Frais par défaut (pas de colonne frais dans ce format)
            System.out.println("DEBUG: Frais par défaut: 0.0 (pas de colonne frais)");
                trxSf.setFrais(0.0);
            

            
            // Valeurs par défaut
            trxSf.setStatut("EN_ATTENTE");
            trxSf.setDateImport(LocalDateTime.now());
            
            System.out.println("DEBUG: Entité TrxSfEntity créée avec succès");
            System.out.println("DEBUG: === FIN parseTrxSfFromValues ===");
            
            return trxSf;
        } catch (Exception e) {
            System.out.println("DEBUG: ERREUR dans parseTrxSfFromValues: " + e.getMessage());
            System.out.println("DEBUG: Stack trace:");
            e.printStackTrace();
            throw e;
        }
    }
    
    private TrxSfEntity parseTrxSfFromExcelRow(Row row, DateTimeFormatter formatter) {
        try {
            System.out.println("DEBUG: === DÉBUT parseTrxSfFromExcelRow ===");
            System.out.println("DEBUG: Nombre de cellules dans la ligne: " + row.getLastCellNum());
            
            TrxSfEntity trxSf = new TrxSfEntity();
            
            // ID Transaction (colonne 0)
            String idTransaction = getCellValueAsString(row.getCell(0));
            System.out.println("DEBUG: ID Transaction (Excel): '" + idTransaction + "'");
            trxSf.setIdTransaction(idTransaction);
            
            // Téléphone Client (colonne 1)
            String telephoneClient = getCellValueAsString(row.getCell(1));
            System.out.println("DEBUG: Téléphone Client (Excel): '" + telephoneClient + "'");
            trxSf.setTelephoneClient(telephoneClient);
            
            // Montant (colonne 2)
            Double montant = getCellValueAsDouble(row.getCell(2));
            System.out.println("DEBUG: Montant (Excel): " + montant);
            trxSf.setMontant(montant);
            
            // Service (colonne 3)
            String service = getCellValueAsString(row.getCell(3));
            System.out.println("DEBUG: Service (Excel): '" + service + "'");
            trxSf.setService(service);
            
            // Agence (colonne 4)
            String agence = getCellValueAsString(row.getCell(4));
            System.out.println("DEBUG: Agence (Excel): '" + agence + "'");
            trxSf.setAgence(agence);
            
            // Date Transaction (colonne 5)
            String dateStr = getCellValueAsString(row.getCell(5));
            System.out.println("DEBUG: Date (Excel, string): '" + dateStr + "'");
            LocalDateTime dateTransaction = LocalDateTime.parse(dateStr, formatter);
            System.out.println("DEBUG: Date (Excel, parsée): " + dateTransaction);
            trxSf.setDateTransaction(dateTransaction);
            
            // Numéro Trans GU (colonne 6)
            String numeroTransGu = getCellValueAsString(row.getCell(6));
            System.out.println("DEBUG: Numéro Trans GU (Excel): '" + numeroTransGu + "'");
            trxSf.setNumeroTransGu(numeroTransGu);
            
            // Pays (colonne 7)
            String pays = getCellValueAsString(row.getCell(7));
            System.out.println("DEBUG: Pays (Excel): '" + pays + "'");
            trxSf.setPays(pays);
            
            // Frais (colonne 8, optionnel)
            Double frais = 0.0;
            if (row.getCell(8) != null) {
                frais = getCellValueAsDouble(row.getCell(8));
                System.out.println("DEBUG: Frais (Excel): " + frais);
            } else {
                System.out.println("DEBUG: Frais (Excel): cellule vide, valeur par défaut: 0.0");
            }
            trxSf.setFrais(frais);
            
            // Commentaire (colonne 9, optionnel)
            String commentaire = "";
            if (row.getCell(9) != null) {
                commentaire = getCellValueAsString(row.getCell(9));
                System.out.println("DEBUG: Commentaire (Excel): '" + commentaire + "'");
            } else {
                System.out.println("DEBUG: Commentaire (Excel): cellule vide");
            }
            trxSf.setCommentaire(commentaire);
            
            // Valeurs par défaut
            trxSf.setStatut("EN_ATTENTE");
            trxSf.setDateImport(LocalDateTime.now());
            
            System.out.println("DEBUG: Entité TrxSfEntity créée avec succès depuis Excel");
            System.out.println("DEBUG: === FIN parseTrxSfFromExcelRow ===");
            
            return trxSf;
        } catch (Exception e) {
            System.out.println("DEBUG: ERREUR dans parseTrxSfFromExcelRow: " + e.getMessage());
            System.out.println("DEBUG: Stack trace:");
            e.printStackTrace();
            return null;
        }
    }
    
    private String getCellValueAsString(Cell cell) {
        if (cell == null) {
            System.out.println("DEBUG: getCellValueAsString - Cellule null, retourne chaîne vide");
            return "";
        }
        
        System.out.println("DEBUG: getCellValueAsString - Type de cellule: " + cell.getCellType());
        
        switch (cell.getCellType()) {
            case STRING:
                String stringValue = cell.getStringCellValue().trim();
                System.out.println("DEBUG: getCellValueAsString - Valeur STRING: '" + stringValue + "'");
                return stringValue;
            case NUMERIC:
                long numericValue = (long) cell.getNumericCellValue();
                String numericString = String.valueOf(numericValue);
                System.out.println("DEBUG: getCellValueAsString - Valeur NUMERIC: " + numericValue + " -> '" + numericString + "'");
                return numericString;
            case BOOLEAN:
                boolean booleanValue = cell.getBooleanCellValue();
                String booleanString = String.valueOf(booleanValue);
                System.out.println("DEBUG: getCellValueAsString - Valeur BOOLEAN: " + booleanValue + " -> '" + booleanString + "'");
                return booleanString;
            case BLANK:
                System.out.println("DEBUG: getCellValueAsString - Cellule BLANK, retourne chaîne vide");
                return "";
            default:
                System.out.println("DEBUG: getCellValueAsString - Type non géré: " + cell.getCellType() + ", retourne chaîne vide");
                return "";
        }
    }
    
    private Double getCellValueAsDouble(Cell cell) {
        if (cell == null) {
            System.out.println("DEBUG: getCellValueAsDouble - Cellule null, retourne 0.0");
            return 0.0;
        }
        
        System.out.println("DEBUG: getCellValueAsDouble - Type de cellule: " + cell.getCellType());
        
        switch (cell.getCellType()) {
            case NUMERIC:
                double numericValue = cell.getNumericCellValue();
                System.out.println("DEBUG: getCellValueAsDouble - Valeur NUMERIC: " + numericValue);
                return numericValue;
            case STRING:
                String stringValue = cell.getStringCellValue().trim();
                System.out.println("DEBUG: getCellValueAsDouble - Valeur STRING: '" + stringValue + "'");
                try {
                    double parsedValue = Double.parseDouble(stringValue);
                    System.out.println("DEBUG: getCellValueAsDouble - Conversion réussie: " + parsedValue);
                    return parsedValue;
                } catch (NumberFormatException e) {
                    System.out.println("DEBUG: getCellValueAsDouble - ERREUR conversion: " + e.getMessage() + ", retourne 0.0");
                    return 0.0;
                }
            case BLANK:
                System.out.println("DEBUG: getCellValueAsDouble - Cellule BLANK, retourne 0.0");
                return 0.0;
            default:
                System.out.println("DEBUG: getCellValueAsDouble - Type non géré: " + cell.getCellType() + ", retourne 0.0");
                return 0.0;
        }
    }
}
