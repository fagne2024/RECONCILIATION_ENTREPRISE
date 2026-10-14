package com.reconciliation.service;

import com.reconciliation.entity.ImpactOPEntity;
import com.reconciliation.repository.ImpactOPRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class ImpactOPService {

    @Autowired
    private ImpactOPRepository impactOPRepository;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FORMATTER_WITH_MS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.S");

    /**
     * Récupérer tous les impacts OP avec filtres
     */
    public List<ImpactOPEntity> getImpactOPs(String codeProprietaire, String typeOperation, 
                                            String groupeReseau, String numeroTransGU, String statut, String dateDebut, 
                                            String dateFin, Double montantMin, Double montantMax) {
        
        ImpactOPEntity.Statut statutEnum = null;
        if (statut != null && !statut.isEmpty()) {
            try {
                statutEnum = ImpactOPEntity.Statut.valueOf(statut);
            } catch (IllegalArgumentException e) {
                // Statut invalide, on ignore le filtre
            }
        }

        LocalDateTime dateDebutParsed = null;
        LocalDateTime dateFinParsed = null;
        
        if (dateDebut != null && !dateDebut.isEmpty()) {
            try {
                // Gérer différents formats de date
                if (dateDebut.contains("T")) {
                    dateDebutParsed = LocalDateTime.parse(dateDebut.replace("T", " "));
                } else {
                    // Format "YYYY-MM-DD HH:mm:ss"
                    dateDebutParsed = LocalDateTime.parse(dateDebut, DATE_FORMATTER);
                }
                System.out.println("Date début parsée: " + dateDebutParsed); // Debug
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
                } else {
                    // Format "YYYY-MM-DD HH:mm:ss"
                    dateFinParsed = LocalDateTime.parse(dateFin, DATE_FORMATTER);
                }
                System.out.println("Date fin parsée: " + dateFinParsed); // Debug
            } catch (Exception e) {
                System.err.println("Erreur parsing date fin: " + dateFin + " - " + e.getMessage());
                // Date invalide, on ignore le filtre
            }
        }

        System.out.println("Filtrage Impact OP - Paramètres:");
        System.out.println("  codeProprietaire: " + codeProprietaire);
        System.out.println("  dateDebut: " + dateDebut + " -> " + dateDebutParsed);
        System.out.println("  dateFin: " + dateFin + " -> " + dateFinParsed);

        List<ImpactOPEntity> results = impactOPRepository.findWithFilters(
            codeProprietaire, typeOperation, groupeReseau, numeroTransGU, statutEnum,
            dateDebutParsed, dateFinParsed, montantMin, montantMax);
        
        System.out.println("Résultats trouvés: " + results.size());
        
        return results;
    }

    /**
     * Récupérer un impact OP par ID
     */
    public ImpactOPEntity getImpactOP(Long id) {
        return impactOPRepository.findById(id).orElse(null);
    }

    /**
     * Créer un nouvel impact OP (refuse les doublons).
     */
    public ImpactOPEntity createImpactOP(ImpactOPEntity impactOP) {
        if (isDuplicateImpactOP(impactOP, null)) {
            throw new IllegalArgumentException(
                "Doublon : cet impact OP existe déjà (même transaction ou limite de 2 lignes par numéro Trans GU).");
        }
        return impactOPRepository.save(impactOP);
    }

    /**
     * Créer plusieurs impacts OP en une seule requête (évite le rate limiting 429).
     * Chaque élément est sauvegardé individuellement ; les erreurs sont collectées.
     */
    public Map<String, Object> createImpactOPBatch(List<ImpactOPEntity> impacts) {
        Map<String, Object> result = new HashMap<>();
        List<ImpactOPEntity> created = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int index = 0;
        for (ImpactOPEntity impact : impacts != null ? impacts : List.<ImpactOPEntity>of()) {
            index++;
            try {
                if (isDuplicateImpactOP(impact, null)) {
                    errors.add("Ligne " + index + ": Doublon détecté (même transaction ou limite Trans GU).");
                    continue;
                }
                ImpactOPEntity saved = impactOPRepository.save(impact);
                created.add(saved);
            } catch (Exception e) {
                errors.add("Ligne " + index + ": " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        }
        result.put("successCount", created.size());
        result.put("errorCount", errors.size());
        result.put("created", created);
        result.put("errors", errors);
        result.put("total", (impacts != null ? impacts.size() : 0));
        return result;
    }

    /**
     * Mettre à jour un impact OP
     */
    public ImpactOPEntity updateImpactOP(ImpactOPEntity impactOP) {
        if (impactOP.getId() == null) {
            throw new IllegalArgumentException("ID requis pour la mise à jour");
        }
        return impactOPRepository.save(impactOP);
    }

    /**
     * Supprimer un impact OP
     */
    public boolean deleteImpactOP(Long id) {
        if (impactOPRepository.existsById(id)) {
            impactOPRepository.deleteById(id);
            return true;
        }
        return false;
    }

    /**
     * Supprimer plusieurs impacts OP en une seule requête
     */
    public Map<String, Object> deleteImpactOPs(List<Long> ids) {
        Map<String, Object> result = new HashMap<>();
        List<String> errors = new ArrayList<>();
        int deletedCount = 0;

        if (ids == null || ids.isEmpty()) {
            result.put("success", false);
            result.put("deletedCount", 0);
            result.put("errors", List.of("Aucun ID fourni"));
            return result;
        }

        for (Long id : ids) {
            try {
                if (impactOPRepository.existsById(id)) {
                    impactOPRepository.deleteById(id);
                    deletedCount++;
                } else {
                    errors.add("Impact OP ID " + id + " non trouvé");
                }
            } catch (Exception e) {
                errors.add("Erreur lors de la suppression de l'impact OP ID " + id + ": " + e.getMessage());
            }
        }

        result.put("success", errors.isEmpty() || deletedCount > 0);
        result.put("deletedCount", deletedCount);
        result.put("errors", errors);
        return result;
    }

    /**
     * Mettre à jour tous les commentaires des impacts OP existants
     */
    public Map<String, Object> updateAllComments() {
        Map<String, Object> result = new HashMap<>();
        int updatedCount = 0;
        int tsopCount = 0;
        int impactJ1Count = 0;
        
        try {
            // Récupérer tous les impacts OP
            List<ImpactOPEntity> allImpacts = impactOPRepository.findAll();
            
            for (ImpactOPEntity impact : allImpacts) {
                String typeOperation = impact.getTypeOperation();
                String newComment = "";
                
                // Définir le commentaire selon le type d'opération
                if (typeOperation != null && typeOperation.toUpperCase().contains("TSOP")) {
                    newComment = "TSOP";
                    tsopCount++;
                } else {
                    newComment = "IMPACT J+1";
                    impactJ1Count++;
                }
                
                // Mettre à jour le commentaire seulement s'il est différent
                if (!newComment.equals(impact.getCommentaire())) {
                    impact.setCommentaire(newComment);
                    impactOPRepository.save(impact);
                    updatedCount++;
                }
            }
            
            result.put("success", true);
            result.put("message", "✅ Mise à jour terminée : " + updatedCount + " commentaires mis à jour");
            result.put("totalImpacts", allImpacts.size());
            result.put("updatedCount", updatedCount);
            result.put("tsopCount", tsopCount);
            result.put("impactJ1Count", impactJ1Count);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "❌ Erreur lors de la mise à jour : " + e.getMessage());
            result.put("error", e.getMessage());
        }
        
        return result;
    }

    /**
     * Vérifier si un type d'opération doit être exclu de l'import
     */
    private boolean shouldExcludeTypeOperation(String typeOperation) {
        if (typeOperation == null || typeOperation.trim().isEmpty()) {
            return false;
        }
        return typeOperation.trim().toUpperCase().startsWith("ANNULATION_");
    }

    /**
     * Valider un fichier d'impacts OP
     */
    public Map<String, Object> validateFile(MultipartFile file) {
        Map<String, Object> result = new HashMap<>();
        List<String> errors = new ArrayList<>();
        int validLines = 0;
        int errorLines = 0;
        int duplicates = 0;
        int newRecords = 0;
        int excludedLines = 0; // Compteur pour les lignes exclues

        try {
            List<Map<String, String>> data = parseFile(file);
            
            // Debug: afficher les en-têtes trouvés
            if (!data.isEmpty()) {
                System.out.println("En-têtes trouvés: " + data.get(0).keySet());
                System.out.println("Première ligne: " + data.get(0));
            }
            
            for (int i = 0; i < data.size(); i++) {
                Map<String, String> row = data.get(i);
                int lineNumber = i + 2; // +2 car l'index commence à 0 et on a un header
                
                try {
                    // Vérifier si le type d'opération doit être exclu
                    String typeOperationField = findFieldIgnoreAccents(row, "Type Opération");
                    String typeOperation = row.get(typeOperationField);
                    
                    if (shouldExcludeTypeOperation(typeOperation)) {
                        System.out.println("Ligne " + lineNumber + " EXCLUE - Type d'opération: " + typeOperation);
                        excludedLines++;
                        continue; // Passer à la ligne suivante
                    }
                    
                    // Valider les données
                    validateRow(row, lineNumber, errors);
                    
                    if (errors.stream().noneMatch(error -> error.contains("Ligne " + lineNumber))) {
                        validLines++;
                        
                        // Vérifier les doublons
                        if (isDuplicate(row)) {
                            duplicates++;
                        } else {
                            newRecords++;
                        }
                    } else {
                        errorLines++;
                    }
                } catch (Exception e) {
                    errors.add("Ligne " + lineNumber + ": Erreur de validation - " + e.getMessage());
                    errorLines++;
                }
            }
        } catch (Exception e) {
            errors.add("Erreur lors de la lecture du fichier: " + e.getMessage());
        }

        result.put("validLines", validLines);
        result.put("errorLines", errorLines);
        result.put("duplicates", duplicates);
        result.put("newRecords", newRecords);
        result.put("excludedLines", excludedLines); // Ajouter le compteur des lignes exclues
        result.put("hasErrors", !errors.isEmpty());
        result.put("errors", errors);

        return result;
    }

    /**
     * Uploader un fichier d'impacts OP
     */
    public Map<String, Object> uploadFile(MultipartFile file) {
        Map<String, Object> result = new HashMap<>();
        List<String> errors = new ArrayList<>();
        int count = 0;
        int duplicates = 0;
        int totalReceived = 0;
        int excludedLines = 0; // Compteur pour les lignes exclues

        System.out.println("=== DÉBUT uploadFile Impact OP ===");
        System.out.println("DEBUG: Nom du fichier: " + (file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown"));
        System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
        System.out.println("DEBUG: Type MIME: " + file.getContentType());

        try {
            List<Map<String, String>> data = parseFile(file);
            totalReceived = data.size();
            System.out.println("DEBUG: Nombre total de lignes parsées: " + totalReceived);
            
            if (!data.isEmpty()) {
                System.out.println("DEBUG: En-têtes trouvés: " + data.get(0).keySet());
                System.out.println("DEBUG: Première ligne: " + data.get(0));
            }
            
            for (int i = 0; i < data.size(); i++) {
                Map<String, String> row = data.get(i);
                int lineNumber = i + 2; // +2 car l'index commence à 0 et on a un header
                
                System.out.println("DEBUG: Traitement ligne " + lineNumber + "/" + data.size() + " - Progression: " + Math.round((i * 100.0) / data.size()) + "%");
                System.out.println("DEBUG: Ligne " + lineNumber + " - Contenu: " + row);
                
                try {
                    // Vérifier si le type d'opération doit être exclu
                    String typeOperationField = findFieldIgnoreAccents(row, "Type Opération");
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Champ Type Opération trouvé: " + typeOperationField);
                    
                    if (typeOperationField == null) {
                        System.out.println("DEBUG: Ligne " + lineNumber + " - ERREUR: Champ 'Type Opération' non trouvé");
                        errors.add("Ligne " + lineNumber + ": Champ 'Type Opération' non trouvé");
                        continue;
                    }
                    
                    String typeOperation = row.get(typeOperationField);
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Type d'opération: " + typeOperation);
                    
                    if (shouldExcludeTypeOperation(typeOperation)) {
                        System.out.println("DEBUG: Ligne " + lineNumber + " - EXCLUE - Type d'opération: " + typeOperation);
                        excludedLines++;
                        continue; // Passer à la ligne suivante
                    }
                    
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Création de l'entité...");
                    ImpactOPEntity impact = createImpactFromRow(row);
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Entité créée avec succès - ID: " + impact.getId());
                    
                    // Vérifier les doublons
                    System.out.println("DEBUG: Ligne " + lineNumber + " - Vérification des doublons...");
                    if (!isDuplicate(row)) {
                        System.out.println("DEBUG: Ligne " + lineNumber + " - Pas de doublon, sauvegarde...");
                        impactOPRepository.save(impact);
                        count++;
                        System.out.println("DEBUG: Ligne " + lineNumber + " - Sauvegardé avec succès");
                    } else {
                        System.out.println("DEBUG: Ligne " + lineNumber + " - DOUBLON DÉTECTÉ, ignoré");
                        duplicates++;
                    }
                } catch (Exception e) {
                    System.out.println("DEBUG: Ligne " + lineNumber + " - ERREUR: " + e.getMessage());
                    System.out.println("DEBUG: Stack trace:");
                    e.printStackTrace();
                    errors.add("Ligne " + lineNumber + ": " + e.getMessage());
                }
            }
        } catch (Exception e) {
            System.out.println("DEBUG: ERREUR CRITIQUE lors de la lecture du fichier: " + e.getMessage());
            System.out.println("DEBUG: Stack trace:");
            e.printStackTrace();
            errors.add("Erreur lors de la lecture du fichier: " + e.getMessage());
        }

        System.out.println("DEBUG: === RÉSUMÉ DU TRAITEMENT ===");
        System.out.println("DEBUG: Total de lignes reçues: " + totalReceived);
        System.out.println("DEBUG: Lignes traitées avec succès: " + count);
        System.out.println("DEBUG: Doublons détectés: " + duplicates);
        System.out.println("DEBUG: Lignes exclues: " + excludedLines);
        System.out.println("DEBUG: Erreurs: " + errors.size());
        System.out.println("DEBUG: === FIN RÉSUMÉ ===");

        String message = errors.isEmpty() ? 
            "✅ " + count + " enregistrements importés avec succès" + 
            (excludedLines > 0 ? " (" + excludedLines + " lignes exclues)" : "") : 
            "❌ Erreurs lors de l'import: " + String.join(", ", errors);

        result.put("success", errors.isEmpty());
        result.put("message", message);
        result.put("count", count);
        result.put("duplicates", duplicates);
        result.put("totalReceived", totalReceived);
        result.put("excludedLines", excludedLines); // Ajouter le compteur des lignes exclues

        System.out.println("=== FIN uploadFile Impact OP ===");
        return result;
    }

    /**
     * Mettre à jour le statut d'un impact OP
     */
    public ImpactOPEntity updateStatut(Long id, String statut, String commentaire) {
        ImpactOPEntity impact = impactOPRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Impact OP non trouvé"));

        try {
            impact.setStatut(ImpactOPEntity.Statut.valueOf(statut));
        } catch (IllegalArgumentException e) {
            throw new RuntimeException("Statut invalide: " + statut);
        }

        if (commentaire != null && !commentaire.trim().isEmpty()) {
            impact.setCommentaire(commentaire);
        }

        return impactOPRepository.save(impact);
    }

    /**
     * Récupérer les options de filtres
     */
    public Map<String, List<String>> getFilterOptions() {
        Map<String, List<String>> options = new HashMap<>();
        options.put("codeProprietaires", impactOPRepository.findDistinctCodeProprietaires());
        options.put("typeOperations", impactOPRepository.findDistinctTypeOperations());
        options.put("groupeReseaux", impactOPRepository.findDistinctGroupeReseaux());
        options.put("numeroTransGUs", impactOPRepository.findDistinctNumeroTransGU());
        return options;
    }

    /**
     * Exporter les impacts OP en Excel
     */
    public byte[] exportToExcel(String codeProprietaire, String typeOperation, 
                               String groupeReseau, String numeroTransGu, String statut, String dateDebut, 
                               String dateFin, Double montantMin, Double montantMax) throws IOException {
        
        List<ImpactOPEntity> impacts = getImpactOPs(codeProprietaire, typeOperation, 
                                                   groupeReseau, numeroTransGu, statut, dateDebut, 
                                                   dateFin, montantMin, montantMax);

        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Impacts OP");

            // Créer le style pour l'en-tête
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // Créer le style pour les montants négatifs
            CellStyle negativeStyle = workbook.createCellStyle();
            Font negativeFont = workbook.createFont();
            negativeFont.setColor(IndexedColors.RED.getIndex());
            negativeStyle.setFont(negativeFont);

            // Créer le style pour les montants positifs
            CellStyle positiveStyle = workbook.createCellStyle();
            Font positiveFont = workbook.createFont();
            positiveFont.setColor(IndexedColors.GREEN.getIndex());
            positiveStyle.setFont(positiveFont);

            // En-têtes
            Row headerRow = sheet.createRow(0);
            String[] headers = {"Type Opération", "Montant", "Solde avant", "Solde après", 
                              "Code propriétaire", "Date opération", "Numéro Trans GU", 
                              "Groupe de réseau", "Statut", "Commentaire"};
            
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // Données
            for (int i = 0; i < impacts.size(); i++) {
                ImpactOPEntity impact = impacts.get(i);
                Row row = sheet.createRow(i + 1);

                row.createCell(0).setCellValue(impact.getTypeOperation());
                
                Cell montantCell = row.createCell(1);
                montantCell.setCellValue(impact.getMontant().doubleValue());
                if (impact.getMontant().compareTo(BigDecimal.ZERO) < 0) {
                    montantCell.setCellStyle(negativeStyle);
                } else {
                    montantCell.setCellStyle(positiveStyle);
                }

                row.createCell(2).setCellValue(impact.getSoldeAvant().doubleValue());
                row.createCell(3).setCellValue(impact.getSoldeApres().doubleValue());
                row.createCell(4).setCellValue(impact.getCodeProprietaire());
                row.createCell(5).setCellValue(impact.getDateOperation().format(DATE_FORMATTER));
                row.createCell(6).setCellValue(impact.getNumeroTransGU());
                row.createCell(7).setCellValue(impact.getGroupeReseau());
                row.createCell(8).setCellValue(impact.getStatut().toString());
                row.createCell(9).setCellValue(impact.getCommentaire() != null ? impact.getCommentaire() : "");
            }

            // Auto-dimensionner les colonnes
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            return outputStream.toByteArray();
        }
    }

    /**
     * Récupérer les statistiques
     */
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        
        long total = impactOPRepository.count();
        long enAttente = impactOPRepository.countByStatut(ImpactOPEntity.Statut.EN_ATTENTE);
        long traite = impactOPRepository.countByStatut(ImpactOPEntity.Statut.TRAITE);
        long erreur = impactOPRepository.countByStatut(ImpactOPEntity.Statut.ERREUR);
        
        Double montantTotal = impactOPRepository.sumTotalMontant();
        if (montantTotal == null) montantTotal = 0.0;

        stats.put("total", total);
        stats.put("enAttente", enAttente);
        stats.put("traite", traite);
        stats.put("erreur", erreur);
        stats.put("montantTotal", montantTotal);

        return stats;
    }

    /**
     * Récupérer la somme des impacts OP pour une date et un code propriétaire donnés
     */
    public Double getSumForDate(String date, String codeProprietaire) {
        try {
            // Parser la date pour obtenir le début et la fin de la journée
            LocalDateTime dateDebut = LocalDateTime.parse(date + " 00:00:00", DATE_FORMATTER);
            LocalDateTime dateFin = LocalDateTime.parse(date + " 23:59:59", DATE_FORMATTER);
            
            // Récupérer tous les impacts OP pour cette date et ce code propriétaire
            List<ImpactOPEntity> impacts = impactOPRepository.findByCodeProprietaireAndDateOperationBetween(
                codeProprietaire, dateDebut, dateFin);
            
            // Calculer la somme des montants
            return impacts.stream()
                .mapToDouble(impact -> impact.getMontant().doubleValue())
                .sum();
        } catch (Exception e) {
            System.err.println("Erreur lors du calcul de la somme Impact OP pour la date " + date + 
                             " et le code propriétaire " + codeProprietaire + ": " + e.getMessage());
            return 0.0;
        }
    }

    /**
     * Parser un fichier (CSV ou Excel)
     */
    private List<Map<String, String>> parseFile(MultipartFile file) throws IOException {
        List<Map<String, String>> data = new ArrayList<>();
        
        if (file.getOriginalFilename().toLowerCase().endsWith(".csv")) {
            data = parseCsvFile(file);
        } else {
            data = parseExcelFile(file);
        }
        
        return data;
    }

    /**
     * Parse un fichier CSV
     * 
     * Cette méthode gère :
     * - ENCODAGE : Lecture du fichier en UTF-8 et détection du séparateur
     * - NORMALISATION : Nettoyage des en-têtes et des données
     * - TYPAGE : Conversion des données vers le format standardisé
     * 
     * @param file Le fichier CSV à parser
     * @return La liste des enregistrements parsés et normalisés
     * @throws IOException En cas d'erreur de lecture du fichier
     */
    private List<Map<String, String>> parseCsvFile(MultipartFile file) throws IOException {
        List<Map<String, String>> data = new ArrayList<>();
        String content = new String(file.getBytes(), "UTF-8");
        String[] lines = content.split("\n");
        
        if (lines.length < 2) {
            throw new RuntimeException("Fichier vide ou format invalide");
        }

        // Détecter automatiquement le séparateur
        String separator = detectSeparator(lines[0]);

        // En-têtes
        String[] headers = lines[0].split(separator);
        for (int i = 0; i < headers.length; i++) {
            headers[i] = headers[i].trim();
        }
        
        // Données
        for (int i = 1; i < lines.length; i++) {
            if (lines[i].trim().isEmpty()) continue;
            
            String[] values = lines[i].split(separator);
            Map<String, String> row = new HashMap<>();
            
            for (int j = 0; j < Math.min(headers.length, values.length); j++) {
                row.put(headers[j], values[j].trim());
            }
            
            data.add(row);
        }
        
        return data;
    }

    /**
     * Parser un fichier Excel
     */
    private List<Map<String, String>> parseExcelFile(MultipartFile file) throws IOException {
        List<Map<String, String>> data = new ArrayList<>();
        
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new RuntimeException("Fichier vide ou format invalide");
            }

            // En-têtes
            List<String> headers = new ArrayList<>();
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                headers.add(cell != null ? cell.toString().trim() : "Colonne" + i);
            }

            // Données
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    Map<String, String> rowData = new HashMap<>();
                    for (int j = 0; j < headers.size(); j++) {
                        Cell cell = row.getCell(j);
                        String value = "";
                        if (cell != null) {
                            switch (cell.getCellType()) {
                                case STRING:
                                    value = cell.getStringCellValue();
                                    break;
                                case NUMERIC:
                                    if (DateUtil.isCellDateFormatted(cell)) {
                                        value = cell.getLocalDateTimeCellValue().format(DATE_FORMATTER);
                                    } else {
                                        value = String.valueOf(cell.getNumericCellValue());
                                    }
                                    break;
                                default:
                                    value = cell.toString();
                            }
                        }
                        rowData.put(headers.get(j), value.trim());
                    }
                    data.add(rowData);
                }
            }
        }
        
        return data;
    }

    /**
     * Valider une ligne de données
     */
    private void validateRow(Map<String, String> row, int lineNumber, List<String> errors) {
        // Vérifier les champs obligatoires avec gestion des accents
        String[] requiredFields = {"Type Opération", "Montant", "Solde avant", "Solde après", 
                                 "Code propriétaire", "Date opération", "Numéro Trans GU", "Groupe de réseau"};
        
        for (String field : requiredFields) {
            String actualField = findFieldIgnoreAccents(row, field);
            if (actualField == null || row.get(actualField) == null || row.get(actualField).trim().isEmpty()) {
                errors.add("❌ Ligne " + lineNumber + ": Champ obligatoire manquant → '" + field + "'");
            }
        }

        // Valider le montant
        try {
            String montantField = findFieldIgnoreAccents(row, "Montant");
            if (montantField != null && row.get(montantField) != null) {
                BigDecimal montant = new BigDecimal(row.get(montantField).replace(",", ""));
            }
        } catch (Exception e) {
            String montantValue = row.get("Montant") != null ? row.get("Montant") : "valeur manquante";
            errors.add("❌ Ligne " + lineNumber + ": Montant invalide → '" + montantValue + "' (format attendu: nombre décimal)");
        }

        // Valider les soldes
        try {
            String soldeAvantField = findFieldIgnoreAccents(row, "Solde avant");
            String soldeApresField = findFieldIgnoreAccents(row, "Solde après");
            if (soldeAvantField != null && row.get(soldeAvantField) != null) {
                BigDecimal soldeAvant = new BigDecimal(row.get(soldeAvantField).replace(",", ""));
            }
            if (soldeApresField != null && row.get(soldeApresField) != null) {
                BigDecimal soldeApres = new BigDecimal(row.get(soldeApresField).replace(",", ""));
            }
        } catch (Exception e) {
            errors.add("❌ Ligne " + lineNumber + ": Solde invalide → Format attendu: nombre décimal");
        }

        // Valider la date - accepter les deux formats
        try {
            String dateField = findFieldIgnoreAccents(row, "Date opération");
            String dateStr = row.get(dateField);
            System.out.println("📅 Validation date ligne " + lineNumber + ": " + dateStr);
            if (dateStr.contains("T")) {
                LocalDateTime.parse(dateStr); // Format ISO
            } else if (dateStr.contains(".")) {
                LocalDateTime.parse(dateStr, DATE_FORMATTER_WITH_MS); // Format avec millisecondes
            } else {
                LocalDateTime.parse(dateStr, DATE_FORMATTER); // Format avec espace
            }
        } catch (Exception e) {
            String dateValue = row.get("Date opération") != null ? row.get("Date opération") : "valeur manquante";
            System.out.println("❌ Erreur date ligne " + lineNumber + ": " + e.getMessage());
            errors.add("❌ Ligne " + lineNumber + ": Date invalide → '" + dateValue + "' (formats acceptés: yyyy-MM-dd HH:mm:ss, yyyy-MM-ddTHH:mm:ss, yyyy-MM-dd HH:mm:ss.S)");
        }
    }

    /**
     * Trouver un champ en ignorant les accents
     */
    private String findFieldIgnoreAccents(Map<String, String> row, String targetField) {
        String normalizedTarget = normalizeString(targetField);
        for (String field : row.keySet()) {
            if (normalizeString(field).equals(normalizedTarget)) {
                return field;
            }
        }
        return null;
    }

    /**
     * Normaliser une chaîne pour ignorer les accents
     */
    private String normalizeString(String str) {
        return java.text.Normalizer.normalize(str, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .toLowerCase();
    }

    /**
     * Détecter automatiquement le séparateur CSV
     */
    private String detectSeparator(String headerLine) {
        // Compter les occurrences de chaque séparateur possible
        int commaCount = headerLine.length() - headerLine.replace(",", "").length();
        int semicolonCount = headerLine.length() - headerLine.replace(";", "").length();
        int tabCount = headerLine.length() - headerLine.replace("\t", "").length();
        
        System.out.println("DEBUG: Détection séparateur - Virgules: " + commaCount + ", Point-virgules: " + semicolonCount + ", Tabs: " + tabCount);
        
        // Retourner le séparateur le plus fréquent
        if (semicolonCount >= commaCount && semicolonCount >= tabCount) {
            return ";";
        } else if (tabCount >= commaCount && tabCount >= semicolonCount) {
            return "\t";
        } else {
            return ",";
        }
    }

    /**
     * Créer un ImpactOPEntity à partir d'une ligne de données
     */
    private ImpactOPEntity createImpactFromRow(Map<String, String> row) {
        System.out.println("DEBUG: === DÉBUT createImpactFromRow ===");
        System.out.println("DEBUG: En-têtes disponibles: " + row.keySet());
        
        String montantField = findFieldIgnoreAccents(row, "Montant");
        String soldeAvantField = findFieldIgnoreAccents(row, "Solde avant");
        String soldeApresField = findFieldIgnoreAccents(row, "Solde après");
        String dateField = findFieldIgnoreAccents(row, "Date opération");
        String typeOperationField = findFieldIgnoreAccents(row, "Type Opération");
        String codeProprietaireField = findFieldIgnoreAccents(row, "Code propriétaire");
        String numeroTransGUField = findFieldIgnoreAccents(row, "Numéro Trans GU");
        String groupeReseauField = findFieldIgnoreAccents(row, "Groupe de réseau");
        
        System.out.println("DEBUG: Champs trouvés:");
        System.out.println("  - Montant: " + montantField + " -> " + (montantField != null ? row.get(montantField) : "NULL"));
        System.out.println("  - Solde avant: " + soldeAvantField + " -> " + (soldeAvantField != null ? row.get(soldeAvantField) : "NULL"));
        System.out.println("  - Solde après: " + soldeApresField + " -> " + (soldeApresField != null ? row.get(soldeApresField) : "NULL"));
        System.out.println("  - Date opération: " + dateField + " -> " + (dateField != null ? row.get(dateField) : "NULL"));
        System.out.println("  - Type Opération: " + typeOperationField + " -> " + (typeOperationField != null ? row.get(typeOperationField) : "NULL"));
        System.out.println("  - Code propriétaire: " + codeProprietaireField + " -> " + (codeProprietaireField != null ? row.get(codeProprietaireField) : "NULL"));
        System.out.println("  - Numéro Trans GU: " + numeroTransGUField + " -> " + (numeroTransGUField != null ? row.get(numeroTransGUField) : "NULL"));
        System.out.println("  - Groupe de réseau: " + groupeReseauField + " -> " + (groupeReseauField != null ? row.get(groupeReseauField) : "NULL"));
        
        // Vérifier que tous les champs requis sont présents
        if (montantField == null) throw new RuntimeException("Champ 'Montant' non trouvé");
        if (soldeAvantField == null) throw new RuntimeException("Champ 'Solde avant' non trouvé");
        if (soldeApresField == null) throw new RuntimeException("Champ 'Solde après' non trouvé");
        if (dateField == null) throw new RuntimeException("Champ 'Date opération' non trouvé");
        if (typeOperationField == null) throw new RuntimeException("Champ 'Type Opération' non trouvé");
        if (codeProprietaireField == null) throw new RuntimeException("Champ 'Code propriétaire' non trouvé");
        if (numeroTransGUField == null) throw new RuntimeException("Champ 'Numéro Trans GU' non trouvé");
        if (groupeReseauField == null) throw new RuntimeException("Champ 'Groupe de réseau' non trouvé");
        
        BigDecimal montant = new BigDecimal(row.get(montantField).replace(",", ""));
        BigDecimal soldeAvant = new BigDecimal(row.get(soldeAvantField).replace(",", ""));
        BigDecimal soldeApres = new BigDecimal(row.get(soldeApresField).replace(",", ""));
        
        // Parser la date selon le format
        String dateStr = row.get(dateField);
        System.out.println("DEBUG: Date brute: '" + dateStr + "'");
        LocalDateTime dateOperation;
        if (dateStr.contains("T")) {
            dateOperation = LocalDateTime.parse(dateStr); // Format ISO
            System.out.println("DEBUG: Date parsée (ISO): " + dateOperation);
        } else if (dateStr.contains(".")) {
            dateOperation = LocalDateTime.parse(dateStr, DATE_FORMATTER_WITH_MS); // Format avec millisecondes
            System.out.println("DEBUG: Date parsée (avec ms): " + dateOperation);
        } else {
            dateOperation = LocalDateTime.parse(dateStr, DATE_FORMATTER); // Format avec espace
            System.out.println("DEBUG: Date parsée (standard): " + dateOperation);
        }

        // Créer l'entité avec le commentaire par défaut selon le type d'opération
        ImpactOPEntity impact = new ImpactOPEntity(
            row.get(typeOperationField),
            montant,
            soldeAvant,
            soldeApres,
            row.get(codeProprietaireField),
            dateOperation,
            row.get(numeroTransGUField),
            row.get(groupeReseauField)
        );
        
        // Définir le commentaire selon le type d'opération
        String typeOperation = row.get(typeOperationField);
        if (typeOperation != null && typeOperation.toUpperCase().contains("TSOP")) {
            impact.setCommentaire("TSOP");
        } else {
            impact.setCommentaire("IMPACT J+1");
        }
        
        System.out.println("DEBUG: Entité créée avec succès");
        System.out.println("DEBUG: === FIN createImpactFromRow ===");
        
        return impact;
    }

    /**
     * Vérifie si un impact OP est un doublon (limite 2 / numéro Trans GU ou ligne identique).
     *
     * @param excludeId ID à ignorer (mise à jour), null pour une création.
     */
    public boolean isDuplicateImpactOP(ImpactOPEntity impact, Long excludeId) {
        if (impact == null || impact.getNumeroTransGU() == null || impact.getNumeroTransGU().trim().isEmpty()) {
            return false;
        }
        String numeroTransGU = impact.getNumeroTransGU().trim();
        List<ImpactOPEntity> existingByNumeroTransGU = impactOPRepository.findByNumeroTransGU(numeroTransGU);
        List<ImpactOPEntity> candidates = new ArrayList<>();
        for (ImpactOPEntity e : existingByNumeroTransGU) {
            if (excludeId != null && excludeId.equals(e.getId())) {
                continue;
            }
            candidates.add(e);
        }
        if (candidates.size() >= 2) {
            return true;
        }
        for (ImpactOPEntity existing : candidates) {
            if (isExactDuplicate(impact, existing)) {
                return true;
            }
        }
        return false;
    }

    private boolean isExactDuplicate(ImpactOPEntity a, ImpactOPEntity b) {
        if (a == null || b == null) {
            return false;
        }
        String commentA = a.getCommentaire() == null ? "" : a.getCommentaire();
        String commentB = b.getCommentaire() == null ? "" : b.getCommentaire();
        return Objects.equals(a.getCodeProprietaire(), b.getCodeProprietaire())
                && Objects.equals(a.getNumeroTransGU(), b.getNumeroTransGU())
                && Objects.equals(a.getDateOperation(), b.getDateOperation())
                && a.getMontant().compareTo(b.getMontant()) == 0
                && a.getSoldeAvant().compareTo(b.getSoldeAvant()) == 0
                && a.getSoldeApres().compareTo(b.getSoldeApres()) == 0
                && Objects.equals(a.getTypeOperation(), b.getTypeOperation())
                && Objects.equals(a.getGroupeReseau(), b.getGroupeReseau())
                && commentA.equals(commentB);
    }

    /**
     * Vérifier si un impact est un doublon (import fichier)
     */
    private boolean isDuplicate(Map<String, String> row) {
        try {
            String dateField = findFieldIgnoreAccents(row, "Date opération");
            String codeProprietaireField = findFieldIgnoreAccents(row, "Code propriétaire");
            String numeroTransGUField = findFieldIgnoreAccents(row, "Numéro Trans GU");
            String montantField = findFieldIgnoreAccents(row, "Montant");
            String soldeAvantField = findFieldIgnoreAccents(row, "Solde avant");
            String soldeApresField = findFieldIgnoreAccents(row, "Solde après");
            String typeOperationField = findFieldIgnoreAccents(row, "Type Opération");
            String groupeReseauField = findFieldIgnoreAccents(row, "Groupe de réseau");
            String commentaireField = findFieldIgnoreAccents(row, "Commentaire");
            
            String codeProprietaire = row.get(codeProprietaireField);
            String numeroTransGU = row.get(numeroTransGUField);
            String dateStr = row.get(dateField);
            String montantStr = row.get(montantField);
            String soldeAvantStr = row.get(soldeAvantField);
            String soldeApresStr = row.get(soldeApresField);
            String typeOperation = row.get(typeOperationField);
            String groupeReseau = row.get(groupeReseauField);
            String commentaire = commentaireField != null ? row.get(commentaireField) : "";
            
            System.out.println("Vérification doublon - Code: " + codeProprietaire + ", Numéro: " + numeroTransGU + 
                             ", Date: " + dateStr + ", Montant: " + montantStr + ", Type: " + typeOperation);
            
            LocalDateTime dateOperation;
            if (dateStr.contains("T")) {
                dateOperation = LocalDateTime.parse(dateStr); // Format ISO
            } else if (dateStr.contains(".")) {
                dateOperation = LocalDateTime.parse(dateStr, DATE_FORMATTER_WITH_MS); // Format avec millisecondes
            } else {
                dateOperation = LocalDateTime.parse(dateStr, DATE_FORMATTER); // Format avec espace
            }
            
            ImpactOPEntity probe = new ImpactOPEntity();
            probe.setTypeOperation(typeOperation);
            probe.setMontant(new BigDecimal(montantStr.replace(",", "")));
            probe.setSoldeAvant(new BigDecimal(soldeAvantStr.replace(",", "")));
            probe.setSoldeApres(new BigDecimal(soldeApresStr.replace(",", "")));
            probe.setCodeProprietaire(codeProprietaire);
            probe.setDateOperation(dateOperation);
            probe.setNumeroTransGU(numeroTransGU);
            probe.setGroupeReseau(groupeReseau);
            probe.setCommentaire(commentaire);

            boolean duplicate = isDuplicateImpactOP(probe, null);
            if (duplicate) {
                System.out.println("❌ DOUBLON DÉTECTÉ - Numéro Trans GU: " + numeroTransGU);
            } else {
                System.out.println("✅ ENREGISTREMENT AUTORISÉ - Numéro Trans GU: " + numeroTransGU);
            }
            return duplicate;
        } catch (Exception e) {
            System.out.println("❌ ERREUR lors de la vérification doublon: " + e.getMessage());
            return false;
        }
    }
} 