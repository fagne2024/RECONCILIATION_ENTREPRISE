package com.reconciliation.service;

import com.reconciliation.dto.OperationCreateRequest;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.repository.CompteRepository;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class OperationImportService {

    @Autowired
    private OperationService operationService;
    @Autowired
    private CompteRepository compteRepository;
    @Autowired
    private com.reconciliation.repository.OperationRepository operationRepository;

    public static class ImportResult {
        public int totalRead;
        public int saved;
        public List<String> errors = new ArrayList<>();
    }

    public ImportResult importFile(MultipartFile file) throws Exception {
        String orig = file.getOriginalFilename();
        String filename = orig != null ? orig.toLowerCase() : "";
        try (InputStream is = file.getInputStream(); Workbook wb = createWorkbook(filename, is)) {
            Sheet sheet = wb.getSheetAt(0);
            ImportResult result = new ImportResult();
            if (sheet == null) return result;

            Row header = sheet.getRow(0);
            Map<String, Integer> idx = mapHeaders(header);
            System.out.println("DEBUG: En-têtes détectés: " + idx.keySet());
            System.out.println("DEBUG: Mapping des colonnes: " + idx);

            int last = sheet.getLastRowNum();
            System.out.println("DEBUG: Dernière ligne détectée: " + last);
            
            // Approche simplifiée : traiter toutes les lignes jusqu'à la dernière détectée
            for (int r = 1; r <= last; r++) {
                Row row = sheet.getRow(r);
                if (row == null) {
                    System.out.println("DEBUG: Ligne " + r + " est null, ignorée");
                    continue;
                }
                
                // Vérifier si la ligne a du contenu (au moins une cellule non vide)
                boolean hasContent = false;
                for (int j = 0; j < row.getLastCellNum(); j++) {
                    Cell cell = row.getCell(j);
                    if (cell != null && !cell.toString().trim().isEmpty()) {
                        hasContent = true;
                        break;
                    }
                }
                
                if (!hasContent) {
                    System.out.println("DEBUG: Ligne " + r + " est vide, ignorée");
                    continue;
                }
                
                System.out.println("DEBUG: Traitement ligne " + r);
                result.totalRead++;
                try {
                    String numeroCompte = getString(row, idx.get("numero_compte"));
                    System.out.println("DEBUG: Ligne " + r + " - numero_compte: " + numeroCompte);
                    if (numeroCompte == null || numeroCompte.isBlank()) {
                        throw new IllegalArgumentException("numero_compte manquant");
                    }
                    Optional<CompteEntity> compteOpt = compteRepository.findByNumeroCompte(numeroCompte.trim());
                    if (compteOpt.isEmpty()) {
                        throw new IllegalArgumentException("Compte introuvable: " + numeroCompte);
                    }

                    String typeOperation = normalizeType(getString(row, idx.get("type_operation")));
                    System.out.println("DEBUG: Ligne " + r + " - type_operation: " + typeOperation);
                    if (!"transaction_cree".equals(typeOperation) && !"annulation_bo".equals(typeOperation)) {
                        throw new IllegalArgumentException("type_operation invalide (autorisé: transaction_cree, annulation_bo)");
                    }

                    Double montant = getDouble(row, idx.get("montant"));
                    if (montant == null) montant = 0.0;
                    System.out.println("DEBUG: Ligne " + r + " - montant: " + montant);
                    String banque = getString(row, idx.get("banque"));
                    String service = getString(row, idx.get("service"));
                    System.out.println("DEBUG: Ligne " + r + " - service: " + service);
                    if (service == null || service.isBlank()) {
                        throw new IllegalArgumentException("service manquant (obligatoire pour générer la logique des 4 opérations)");
                    }
                    String nomBordereau = getString(row, idx.get("nom_bordereau"));
                    String dateOpStr = getString(row, idx.get("date_operation"));
                    Integer recordCount = getInteger(row, idx.get("record_count"));

                    String isoDate = resolveIsoDate(row, idx.get("date_operation"), dateOpStr);

                    OperationCreateRequest req = new OperationCreateRequest();
                    req.setCompteId(compteOpt.get().getId());
                    req.setTypeOperation(typeOperation);
                    req.setMontant(montant);
                    req.setBanque(banque);
                    req.setNomBordereau(nomBordereau);
                    req.setService(service);
                    req.setDateOperation(isoDate);
                    req.setRecordCount(recordCount);

                    // Vérifier les doublons avant de créer l'opération
                    if (isDuplicate(req)) {
                        result.errors.add("Ligne " + (r + 1) + ": Doublon détecté (même compte, type, montant, service, date)");
                        System.out.println("DEBUG: Doublon détecté pour ligne " + r);
                        continue;
                    }

                    operationService.createOperation(req);
                    result.saved++;
                    System.out.println("DEBUG: Opération créée avec succès pour ligne " + r);
                } catch (Exception ex) {
                    result.errors.add("Ligne " + (r + 1) + ": " + ex.getMessage());
                    System.out.println("DEBUG: Erreur ligne " + r + ": " + ex.getMessage());
                }
            }
            System.out.println("DEBUG: Import terminé - Total lu: " + result.totalRead + ", Sauvé: " + result.saved + ", Erreurs: " + result.errors.size());
            return result;
        }
    }

    private static Workbook createWorkbook(String filename, InputStream is) throws Exception {
        if (filename.endsWith(".xlsx") || filename.endsWith(".xlsm")) {
            return new XSSFWorkbook(is);
        } else if (filename.endsWith(".xls")) {
            return new HSSFWorkbook(is);
        } else if (filename.endsWith(".csv")) {
            List<String> lines;
            try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(is))) {
                lines = br.lines().toList();
            }
            Workbook wb = new XSSFWorkbook();
            Sheet sheet = wb.createSheet();
            int r = 0;
            for (String line : lines) {
                Row row = sheet.createRow(r++);
                // Essayer d'abord le point-virgule, puis la virgule comme fallback
                String[] parts;
                if (line.contains(";")) {
                    parts = line.split(";");
                    System.out.println("DEBUG: Parsing CSV avec point-virgule: " + line);
                } else {
                    parts = line.split(",");
                    System.out.println("DEBUG: Parsing CSV avec virgule: " + line);
                }
                for (int i = 0; i < parts.length; i++) {
                    Cell cell = row.createCell(i, CellType.STRING);
                    cell.setCellValue(parts[i].trim());
                }
            }
            return wb;
        } else {
            throw new IllegalArgumentException("Format non supporté: " + filename);
        }
    }

    private static Map<String, Integer> mapHeaders(Row headerRow) {
        Map<String, Integer> map = new HashMap<>();
        if (headerRow == null) return map;
        for (int i = headerRow.getFirstCellNum(); i < headerRow.getLastCellNum(); i++) {
            Cell c = headerRow.getCell(i);
            String raw = (c != null) ? c.toString() : null;
            if (raw == null) continue;
            String key = normalize(raw);
            map.put(key, i);
        }
        return map;
    }

    private static String normalize(String s) {
        return s == null ? null : s.trim().toLowerCase().replace(" ", "_").replace("é", "e").replace("è", "e").replace("ê", "e").replace("à", "a");
    }

    private static String normalizeType(String s) {
        if (s == null) return null;
        String v = s.trim().toLowerCase();
        if (v.equals("transaction8cree") || v.equals("transaction_cree") || v.equals("transaction-crée") || v.equals("transaction_crée") || v.equals("transaction cree")) {
            return "transaction_cree";
        }
        if (v.equals("annulation_bo") || v.equals("annulation-bo") || v.equals("annulation bo")) {
            return "annulation_bo";
        }
        return v;
    }

    private static String getString(Row row, Integer idx) {
        if (idx == null) return null;
        Cell cell = row.getCell(idx);
        if (cell == null) return null;
        if (cell.getCellType() == CellType.NUMERIC) {
            double v = cell.getNumericCellValue();
            long lv = (long) v;
            if (Math.abs(v - lv) < 1e-9) return Long.toString(lv);
            return Double.toString(v);
        }
        return cell.toString().trim();
    }

    private static Double getDouble(Row row, Integer idx) {
        if (idx == null) return null;
        Cell cell = row.getCell(idx);
        if (cell == null) return null;
        if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
        try { return Double.parseDouble(cell.toString().trim().replace(" ", "").replace(",", ".")); } catch (Exception ignored) { return null; }
    }

    private static Integer getInteger(Row row, Integer idx) {
        if (idx == null) return null;
        Cell cell = row.getCell(idx);
        if (cell == null) return null;
        if (cell.getCellType() == CellType.NUMERIC) return (int) cell.getNumericCellValue();
        try { return Integer.parseInt(cell.toString().trim()); } catch (Exception ignored) { return null; }
    }

    private static String resolveIsoDate(Row row, Integer idx, String fallback) {
        // Try Excel numeric date
        if (idx != null) {
            Cell cell = row.getCell(idx);
            if (cell != null && cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
                java.util.Date d = cell.getDateCellValue();
                return d.toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString() + "T00:00:00";
            }
        }
        if (fallback != null && !fallback.isBlank()) {
            String s = fallback.trim();
            try {
                if (s.length() == 10 && s.matches("\\d{4}-\\d{2}-\\d{2}")) {
                    return s + "T00:00:00";
                }
                if (s.matches("\\d{2}/\\d{2}/\\d{4}")) {
                    LocalDate ld = LocalDate.parse(s, DateTimeFormatter.ofPattern("dd/MM/yyyy"));
                    return ld.toString() + "T00:00:00";
                }
                // Fallback to now if unparsable
            } catch (Exception ignored) {}
        }
        return LocalDateTime.now().withHour(0).withMinute(0).withSecond(0).withNano(0).toString();
    }

    public byte[] generateTemplate() throws Exception {
        Workbook wb = new XSSFWorkbook();
        Sheet sheet = wb.createSheet("Operations");
        String[] headers = new String[]{
            "numero_compte","type_operation","montant","banque","service","date_operation","nom_bordereau","record_count"
        };
        Row h = sheet.createRow(0);
        for (int i = 0; i < headers.length; i++) {
            Cell c = h.createCell(i, CellType.STRING);
            c.setCellValue(headers[i]);
        }
        // Example rows
        Row ex1 = sheet.createRow(1);
        ex1.createCell(0).setCellValue("AG001");
        ex1.createCell(1).setCellValue("transaction_cree");
        ex1.createCell(2).setCellValue(100000);
        ex1.createCell(3).setCellValue("BOA");
        ex1.createCell(4).setCellValue("cashin_moov");
        ex1.createCell(5).setCellValue("2025-10-01");
        ex1.createCell(6).setCellValue("TRX_SUMMARY_2025-10-01");
        ex1.createCell(7).setCellValue(1);

        Row ex2 = sheet.createRow(2);
        ex2.createCell(0).setCellValue("AG001");
        ex2.createCell(1).setCellValue("annulation_bo");
        ex2.createCell(2).setCellValue(50000);
        ex2.createCell(3).setCellValue("SGB");
        ex2.createCell(4).setCellValue("paiement_wave");
        ex2.createCell(5).setCellValue("01/10/2025");
        ex2.createCell(6).setCellValue("CANCEL_SUMMARY_2025-10-01");
        ex2.createCell(7).setCellValue(1);

        for (int i = 0; i < headers.length; i++) sheet.autoSizeColumn(i);

        try (ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            wb.write(bos);
            wb.close();
            return bos.toByteArray();
        }
    }

    /**
     * Vérifie si une opération est un doublon basé sur les critères principaux
     */
    private boolean isDuplicate(OperationCreateRequest request) {
        try {
            // Rechercher des opérations existantes avec les mêmes critères
            List<com.reconciliation.entity.OperationEntity> existingOps = operationRepository.findByCompteIdAndTypeOperationAndMontantAndServiceAndDateOperation(
                request.getCompteId(),
                request.getTypeOperation(),
                request.getMontant(),
                request.getService(),
                java.time.LocalDateTime.parse(request.getDateOperation())
            );
            
            return !existingOps.isEmpty();
        } catch (Exception e) {
            System.out.println("DEBUG: Erreur lors de la vérification des doublons: " + e.getMessage());
            return false; // En cas d'erreur, on laisse passer pour éviter de bloquer l'import
        }
    }
}


