package com.reconciliation.service;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.util.CsvWorkbookReader;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Import et modele du suivi des compenses OP.
 *
 * <p>Les en-tetes sont reconnus par mots-cles (accents, casse, ponctuation et
 * texte entre parentheses ignores) : « Référence (Libellé Transactions) »,
 * « Mode de paiement » ou « Réseau » sont donc acceptes. La ligne d'en-tete est
 * recherchee dans les premieres lignes du fichier, et le separateur des CSV
 * (tabulation, point-virgule ou virgule) est detecte automatiquement.</p>
 */
@Service
public class SuiviCompenseOpImportService {

    /** Colonnes du modele, dans l'ordre d'affichage du tableau. */
    public static final String[] HEADERS = {
            "Date", "Code agence", "Banque", "Compte bancaire", "Montant", "Mode de paiement",
            "Référence", "ID ticket", "Service", "Réseau"
    };

    /** Nombre minimum de colonnes reconnues pour considerer une ligne comme l'en-tete. */
    private static final int MIN_HEADER_FIELDS = 4;
    /** Nombre de lignes explorees a la recherche de l'en-tete. */
    private static final int HEADER_SEARCH_ROWS = 20;

    public List<SuiviCompenseOpEntity> parse(MultipartFile file) throws Exception {
        String orig = file.getOriginalFilename();
        String filename = orig != null ? orig.toLowerCase() : "";
        try (InputStream is = file.getInputStream(); Workbook wb = createWorkbook(filename, is)) {
            Sheet sheet = wb.getSheetAt(0);
            List<SuiviCompenseOpEntity> out = new ArrayList<>();
            if (sheet == null) return out;

            int headerIdx = findHeaderRow(sheet);
            if (headerIdx < 0) {
                throw new IllegalArgumentException(
                        "En-têtes introuvables : attendu Date, Code agence, Banque, Compte bancaire, Montant, Mode de paiement, Référence, ID ticket, Service, Réseau");
            }
            Map<String, Integer> idx = mapHeaders(sheet.getRow(headerIdx));

            for (int r = headerIdx + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                SuiviCompenseOpEntity e = new SuiviCompenseOpEntity();
                e.setDateOperation(getDate(row, idx.get("date")));
                e.setCodeAgence(getString(row, idx.get("code_agence")));
                e.setBanque(getString(row, idx.get("banque")));
                e.setCompteBancaire(getString(row, idx.get("compte_bancaire")));
                e.setMontant(getDouble(row, idx.get("montant")));
                e.setModePaiement(getString(row, idx.get("mode_paiement")));
                e.setReference(getString(row, idx.get("reference")));
                e.setIdTicket(getString(row, idx.get("id_ticket")));
                e.setService(getString(row, idx.get("service")));
                e.setReseau(getString(row, idx.get("reseau")));
                if (isEmpty(e)) continue; // ignorer les lignes vides
                out.add(e);
            }
            return out;
        }
    }

    public byte[] generateTemplate() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("Suivi compense OP");
            Row h = sheet.createRow(0);
            for (int i = 0; i < HEADERS.length; i++) {
                Cell c = h.createCell(i, CellType.STRING);
                c.setCellValue(HEADERS[i]);
                sheet.setColumnWidth(i, 20 * 256);
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return bos.toByteArray();
        }
    }

    private static boolean isEmpty(SuiviCompenseOpEntity e) {
        return e.getDateOperation() == null && e.getReference() == null && e.getMontant() == null
                && e.getBanque() == null && e.getIdTicket() == null;
    }

    private static Workbook createWorkbook(String filename, InputStream is) throws Exception {
        if (filename.endsWith(".xlsx") || filename.endsWith(".xlsm")) {
            return new XSSFWorkbook(is);
        } else if (filename.endsWith(".xls")) {
            return new HSSFWorkbook(is);
        } else if (filename.endsWith(".csv") || filename.endsWith(".txt") || filename.endsWith(".tsv")) {
            return CsvWorkbookReader.toWorkbook(is);
        }
        throw new IllegalArgumentException("Format non supporté: " + filename);
    }

    /** Premiere ligne (parmi les premieres) reconnaissant assez de colonnes du suivi. */
    private static int findHeaderRow(Sheet sheet) {
        int last = Math.min(sheet.getLastRowNum(), HEADER_SEARCH_ROWS);
        for (int r = 0; r <= last; r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            Set<String> found = new HashSet<>();
            for (int i = row.getFirstCellNum(); i >= 0 && i < row.getLastCellNum(); i++) {
                Cell c = row.getCell(i);
                if (c == null) continue;
                String field = fieldFor(normalize(c.toString()));
                if (field != null) found.add(field);
            }
            if (found.size() >= MIN_HEADER_FIELDS) return r;
        }
        return -1;
    }

    private static Map<String, Integer> mapHeaders(Row headerRow) {
        Map<String, Integer> map = new HashMap<>();
        if (headerRow == null) return map;
        for (int i = headerRow.getFirstCellNum(); i >= 0 && i < headerRow.getLastCellNum(); i++) {
            Cell c = headerRow.getCell(i);
            if (c == null) continue;
            String field = fieldFor(normalize(c.toString()));
            if (field != null) map.putIfAbsent(field, i);
        }
        return map;
    }

    /** Associe un en-tete normalise (mots separes par des espaces) a un champ du suivi. */
    static String fieldFor(String norm) {
        if (norm.isEmpty()) return null;
        if (norm.contains("date")) return "date";
        if (norm.contains("agence")) return "code_agence";
        if (norm.contains("banque")) return "banque";
        if (norm.contains("compte")) return "compte_bancaire";
        if (norm.contains("montant")) return "montant";
        if (norm.contains("mode") && norm.contains("paiement")) return "mode_paiement";
        if (norm.contains("reference")) return "reference";
        if (norm.contains("ticket")) return "id_ticket";
        if (norm.contains("service")) return "service";
        if (norm.contains("seau")) return "reseau";
        return null;
    }

    /** Minuscules, sans accents, ponctuation remplacee par des espaces. */
    static String normalize(String s) {
        if (s == null) return "";
        String n = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        return n.toLowerCase().replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static String getString(Row row, Integer col) {
        if (col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        String v;
        if (c.getCellType() == CellType.NUMERIC) {
            v = new BigDecimal(c.getNumericCellValue()).stripTrailingZeros().toPlainString();
        } else {
            v = c.toString().replace(' ', ' ').trim();
        }
        return v.isEmpty() ? null : v;
    }

    private static Double getDouble(Row row, Integer col) {
        if (col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        if (c.getCellType() == CellType.NUMERIC) return c.getNumericCellValue();
        // Montants saisis avec espaces de milliers (y compris insecables) ou virgule decimale
        String s = c.toString().replaceAll("[\\s\\u00A0\\u202F]", "").replace(',', '.');
        if (s.isEmpty()) return null;
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDate getDate(Row row, Integer col) {
        if (col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        try {
            if (c.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(c)) {
                return c.getLocalDateTimeCellValue().toLocalDate();
            }
            String s = c.toString().trim();
            if (s.isEmpty()) return null;
            if (s.matches("\\d{4}-\\d{2}-\\d{2}.*")) return LocalDate.parse(s.substring(0, 10));
            if (s.matches("\\d{2}/\\d{2}/\\d{4}")) return LocalDate.parse(s, DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        } catch (Exception ignored) { }
        return null;
    }
}
