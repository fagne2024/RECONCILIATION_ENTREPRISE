package com.reconciliation.service;

import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.repository.OperationBancaireRepository;
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
public class OperationBancaireImportService {

    @Autowired
    private OperationBancaireRepository repository;

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

            // Expect header row as first row (0)
            Row header = sheet.getRow(0);
            Map<String, Integer> idx = mapHeaders(header);

            List<OperationBancaireEntity> toSave = new ArrayList<>();
            int last = sheet.getLastRowNum();
            for (int r = 1; r <= last; r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                result.totalRead++;
                try {
                    OperationBancaireEntity e = new OperationBancaireEntity();
                    e.setPays(getString(row, idx.get("pays")));
                    e.setCodePays(getString(row, idx.get("code_pays")));
                    e.setMois(getString(row, idx.get("mois")));
                    LocalDateTime dateOp = getLocalDateTime(row, idx.get("date_operation"));
                    e.setDateOperation(dateOp != null ? dateOp : LocalDateTime.now());
                    e.setAgence(getString(row, idx.get("agence")));
                    e.setTypeOperation(getString(row, idx.get("type_operation")));
                    e.setNomBeneficiaire(getString(row, idx.get("nom_beneficiaire")));
                    e.setCompteADebiter(getString(row, idx.get("compte_a_debiter")));
                    e.setMontant(getDouble(row, idx.get("montant")));
                    e.setModePaiement(getString(row, idx.get("mode_paiement")));
                    e.setReference(getString(row, idx.get("reference")));
                    e.setIdGlpi(getString(row, idx.get("id_glpi")));
                    e.setBo(getString(row, idx.get("banque")));
                    String statut = getString(row, idx.get("statut"));
                    e.setStatut((statut == null || statut.isBlank()) ? "En attente" : statut);
                    toSave.add(e);
                } catch (Exception ex) {
                    result.errors.add("Ligne " + (r + 1) + ": " + ex.getMessage());
                }
            }
            if (!toSave.isEmpty()) {
                repository.saveAll(toSave);
                result.saved = toSave.size();
            }
            return result;
        }
    }

    private static Workbook createWorkbook(String filename, InputStream is) throws Exception {
        if (filename.endsWith(".xlsx") || filename.endsWith(".xlsm")) {
            return new XSSFWorkbook(is);
        } else if (filename.endsWith(".xls")) {
            return new HSSFWorkbook(is);
        } else if (filename.endsWith(".csv")) {
            // Simple CSV to workbook conversion; caller will close the returned workbook
            java.util.List<String> lines;
            try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(is))) {
                lines = br.lines().toList();
            }
            Workbook wb = new XSSFWorkbook();
            Sheet sheet = wb.createSheet();
            int r = 0;
            for (String line : lines) {
                Row row = sheet.createRow(r++);
                String[] parts = line.split(",");
                for (int i = 0; i < parts.length; i++) {
                    Cell cell = row.createCell(i, CellType.STRING);
                    cell.setCellValue(parts[i]);
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
        String n = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        n = n.toLowerCase().trim();
        n = n.replaceAll("[\n\r\t]", " ");
        n = n.replaceAll("[\\s]+", " ");
        n = n.replace(" ", "_");
        n = n.replaceAll("[^a-z0-9_]+", "");
        return n;
    }

    private static String getString(Row row, Integer col) {
        if (row == null || col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        if (c.getCellType() == CellType.STRING) return c.getStringCellValue().trim();
        if (c.getCellType() == CellType.NUMERIC) return String.valueOf((long)c.getNumericCellValue());
        if (c.getCellType() == CellType.BOOLEAN) return Boolean.toString(c.getBooleanCellValue());
        return c.toString().trim();
    }

    private static Double getDouble(Row row, Integer col) {
        if (row == null || col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        if (c.getCellType() == CellType.NUMERIC) return c.getNumericCellValue();
        try { return Double.parseDouble(c.toString().trim().replace(" ", "").replace("\u00A0","")); } catch (Exception e) { return null; }
    }

    private static LocalDateTime getLocalDateTime(Row row, Integer col) {
        if (row == null || col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        try {
            if (DateUtil.isCellDateFormatted(c)) {
                return c.getLocalDateTimeCellValue();
            }
            if (c.getCellType() == CellType.NUMERIC) {
                double v = c.getNumericCellValue();
                if (DateUtil.isValidExcelDate(v)) {
                    java.util.Date d = DateUtil.getJavaDate(v);
                    return d.toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
                }
            }
            String s = c.toString().trim();
            if (s.isEmpty()) return null;
            // Try ISO yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss
            if (s.matches("\\d{4}-\\d{2}-\\d{2}$")) {
                LocalDate ld = LocalDate.parse(s, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                return ld.atStartOfDay();
            }
            if (s.matches("\\d{4}-\\d{2}-\\d{2}T.*")) {
                return LocalDateTime.parse(s);
            }
            // Try dd/MM/yyyy
            if (s.matches("\\d{2}/\\d{2}/\\d{4}")) {
                LocalDate ld = LocalDate.parse(s, DateTimeFormatter.ofPattern("dd/MM/yyyy"));
                return ld.atStartOfDay();
            }
        } catch (Exception ignored) { }
        return null;
    }

    public byte[] generateTemplate() throws Exception {
        Workbook wb = new XSSFWorkbook();
        Sheet sheet = wb.createSheet("Operations");
        String[] headers = new String[]{
                "Pays","Code Pays","Mois","Date Opération","Agence","Type Opération","Nom Bénéficiaire",
                "Compte à débiter","Montant","Mode de Paiement","Référence","ID GLPI","Banque","Statut"
        };
        Row h = sheet.createRow(0);
        for (int i = 0; i < headers.length; i++) {
            Cell c = h.createCell(i, CellType.STRING);
            c.setCellValue(headers[i]);
        }
        // Example row
        Row ex = sheet.createRow(1);
        ex.createCell(0).setCellValue("Côte d'Ivoire");
        ex.createCell(1).setCellValue("CI");
        ex.createCell(2).setCellValue("Octobre 2025");
        ex.createCell(3).setCellValue("2025-10-01");
        ex.createCell(4).setCellValue("AG001");
        ex.createCell(5).setCellValue("Compensation Client");
        ex.createCell(6).setCellValue("John Doe");
        ex.createCell(7).setCellValue("000123456789");
        ex.createCell(8).setCellValue(100000);
        ex.createCell(9).setCellValue("Virement bancaire");
        ex.createCell(10).setCellValue("REF-ABC-123");
        ex.createCell(11).setCellValue("12345");
        ex.createCell(12).setCellValue("BOA");
        ex.createCell(13).setCellValue("En attente");

        for (int i = 0; i < headers.length; i++) sheet.autoSizeColumn(i);

        try (ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            wb.write(bos);
            wb.close();
            return bos.toByteArray();
        }
    }
}


