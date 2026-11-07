package com.reconciliation.service;

import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.repository.OperationBancaireRepository;
import com.reconciliation.util.BankingDedupKey;
import com.reconciliation.util.CsvWorkbookReader;
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

/**
 * Import des opérations bancaires (chargement manuel et traitement automatique,
 * qui passent tous deux par ce service).
 *
 * <p>Référence : si le fichier en fournit une, elle est conservée. Sinon elle est
 * générée pour les appros : {@code AGENCE-AAAAMMJJ} suivi de {@code APFR n} (appro
 * fournisseur) ou {@code AP n} (appro distributeur / client), avec un compteur
 * par agence et par date qui tient compte des références déjà enregistrées.
 * Les compensations restent sans référence générée.</p>
 */
@Service
public class OperationBancaireImportService {

    @Autowired
    private OperationBancaireRepository repository;

    public static class ImportResult {
        public int totalRead;
        public int saved;
        /** Lignes ignorées car déjà présentes (base ou plus haut dans le fichier). */
        public int duplicatesIgnored;
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
            ReferenceSequencer sequencer = new ReferenceSequencer();

            List<OperationBancaireEntity> candidates = new ArrayList<>();
            int last = sheet.getLastRowNum();
            for (int r = 1; r <= last; r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                result.totalRead++;
                try {
                    String pays = getString(row, idx.get("pays"));
                    String codePays = getString(row, idx.get("code_pays"));
                    String agence = getString(row, idx.get("agence"));
                    String typeOperation = getString(row, idx.get("type_operation"));
                    if (typeOperation == null || typeOperation.isBlank()) {
                        // Colonne obligatoire en base : la ligne est rejetée seule, sans bloquer le lot
                        throw new IllegalArgumentException("type d'opération manquant");
                    }
                    Double montant = getDouble(row, idx.get("montant"));

                    // Si l'agence n'est pas fournie dans le fichier, utiliser une valeur par défaut
                    if (agence == null || agence.isBlank()) {
                        agence = "N/A";
                    }

                    LocalDateTime dateOp = getLocalDateTime(row, idx.get("date_operation"));
                    if (dateOp == null) dateOp = LocalDateTime.now();

                    // Référence du fichier prioritaire ; sinon générée selon le type
                    String fileReference = getString(row, idx.get("reference"));
                    String reference = fileReference;
                    if (reference == null || reference.isBlank()) {
                        reference = sequencer.generate(typeOperation, agence, dateOp.toLocalDate(), montant);
                    }

                    OperationBancaireEntity e = new OperationBancaireEntity();
                    e.setPays(pays);
                    e.setCodePays(codePays);
                    e.setMois(getString(row, idx.get("mois")));
                    e.setDateOperation(dateOp);
                    e.setAgence(agence);
                    e.setTypeOperation(typeOperation);
                    e.setNomBeneficiaire(getString(row, idx.get("nom_beneficiaire")));
                    e.setCompteADebiter(getString(row, idx.get("compte_a_debiter")));
                    e.setMontant(montant);
                    e.setModePaiement(getString(row, idx.get("mode_paiement")));
                    e.setReference(reference);
                    e.setIdGlpi(getString(row, idx.get("id_glpi")));
                    e.setBo(getString(row, idx.get("banque")));
                    e.setBanqueCorrigee(getString(row, idx.get("banque_corrigee")));
                    e.setDemandeur(getString(row, idx.get("demandeur")));
                    e.setValideur(getString(row, idx.get("valideur")));
                    e.setTraitement(getString(row, idx.get("traitement")));

                    String statut = getString(row, idx.get("statut"));
                    e.setStatut((statut == null || statut.isBlank()) ? "En attente" : statut);
                    // Clé de doublon : référence du fichier si elle existe ; sinon agence + date + montant
                    // (cas des compensations, qui n'ont pas de référence). La référence générée n'en fait pas partie.
                    e.setDedupKey(operationDedupKey(fileReference, agence, typeOperation, dateOp, montant));
                    candidates.add(e);
                } catch (Exception ex) {
                    result.errors.add("Ligne " + (r + 1) + ": " + ex.getMessage());
                }
            }
            // Doublons : clés déjà en base ou répétées dans le fichier
            List<OperationBancaireEntity> toSave = new ArrayList<>();
            if (!candidates.isEmpty()) {
                Set<String> keys = new HashSet<>();
                for (OperationBancaireEntity c : candidates) keys.add(c.getDedupKey());
                Set<String> known = new HashSet<>();
                for (OperationBancaireEntity ex : repository.findByDedupKeyIn(keys)) known.add(ex.getDedupKey());
                for (OperationBancaireEntity c : candidates) {
                    if (known.add(c.getDedupKey())) {
                        toSave.add(c);
                    } else {
                        result.duplicatesIgnored++;
                    }
                }
            }
            if (!toSave.isEmpty()) {
                repository.saveAll(toSave);
                result.saved = toSave.size();
            }
            return result;
        }
    }

    /**
     * Clé de doublon d'une opération : la référence du fichier quand elle est renseignée,
     * sinon agence + type + date + montant (les compensations n'ont pas de référence).
     * Le fichier d'origine n'entre pas dans la clé : un même mouvement importé depuis un autre fichier reste détecté.
     */
    static String operationDedupKey(String fileReference, String agence, String typeOperation,
                                    LocalDateTime dateOp, Double montant) {
        if (fileReference != null && !fileReference.isBlank()) {
            return BankingDedupKey.of("REF", fileReference.trim());
        }
        return BankingDedupKey.of("AMT", agence, typeOperation,
                dateOp == null ? null : dateOp.toLocalDate(), montant);
    }

    /**
     * Génère les références manquantes. Un compteur par (agence, date, code) évite les doublons
     * dans le fichier, et la séquence part après les références déjà enregistrées en base.
     */
    private class ReferenceSequencer {
        /** Prochain numéro à utiliser, par base (agence-date + code). */
        private final Map<String, Integer> nextByBase = new HashMap<>();

        String generate(String typeOperation, String agence, LocalDate date, Double montant) {
            String code = referenceCode(typeOperation);
            if (code == null) {
                // Type non reconnu (ni appro ni compense) : format historique
                return legacyReference(agence, date, montant);
            }
            if (code.isEmpty()) {
                // Compensation : la colonne reste vide
                return null;
            }
            String base = agence + "-" + date.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + code;
            Integer next = nextByBase.get(base);
            if (next == null) {
                next = nextFromDatabase(base);
            }
            nextByBase.put(base, next + 1);
            return base + next;
        }

        /** Premier numéro libre pour cette base, d'après les références déjà enregistrées. */
        private int nextFromDatabase(String base) {
            int max = 0;
            for (OperationBancaireEntity existing : repository.findByReferenceStartingWith(base)) {
                String ref = existing.getReference();
                if (ref == null || ref.length() <= base.length()) continue;
                String suffix = ref.substring(base.length());
                if (suffix.matches("\\d{1,9}")) {
                    max = Math.max(max, Integer.parseInt(suffix));
                }
            }
            return max + 1;
        }
    }

    /**
     * Code de référence selon le type : "APFR" (appro fournisseur), "AP" (appro distributeur
     * ou client), "" (compensation : pas de référence générée), null (type non reconnu).
     */
    static String referenceCode(String typeOperation) {
        String n = normalizeType(typeOperation);
        if (n.contains("compens")) return "";
        if (n.contains("appro")) {
            if (n.contains("fournisseur")) return "APFR";
            if (n.contains("distributeur") || n.contains("client")) return "AP";
        }
        return null;
    }

    private static String normalizeType(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]", "");
    }

    private static String legacyReference(String agence, LocalDate date, Double montant) {
        if (agence == null || agence.isBlank() || date == null) {
            return null;
        }
        String dateStr = date.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String agencePrefix = agence.length() >= 6 ? agence.substring(0, 6) : agence;
        String amountStr = montant != null ? String.valueOf(Math.abs(montant.longValue())) : "";
        return dateStr + "-" + agencePrefix + "-" + amountStr;
    }

    private static Workbook createWorkbook(String filename, InputStream is) throws Exception {
        if (filename.endsWith(".xlsx") || filename.endsWith(".xlsm")) {
            return new XSSFWorkbook(is);
        } else if (filename.endsWith(".xls")) {
            return new HSSFWorkbook(is);
        } else if (filename.endsWith(".csv")) {
            return CsvWorkbookReader.toWorkbook(is);
        } else {
            throw new IllegalArgumentException("Format non supporté: " + filename);
        }
    }

    /** En-têtes anglais (opérations en anglais) → clés internes lues par l'import. */
    private static final Map<String, String> OPERATION_EN_ALIASES = Map.ofEntries(
            Map.entry("country", "pays"),
            Map.entry("country_code", "code_pays"),
            Map.entry("agency", "agence"),
            Map.entry("operation_type", "type_operation"),
            Map.entry("transaction_type", "type_operation"),
            Map.entry("amount", "montant"),
            Map.entry("date", "date_operation"),
            Map.entry("operation_date", "date_operation"),
            Map.entry("transaction_date", "date_operation"),
            Map.entry("month", "mois"),
            Map.entry("beneficiary", "nom_beneficiaire"),
            Map.entry("beneficiary_name", "nom_beneficiaire"),
            Map.entry("debit_account", "compte_a_debiter"),
            Map.entry("account_to_debit", "compte_a_debiter"),
            Map.entry("payment_mode", "mode_paiement"),
            Map.entry("payment_method", "mode_paiement"),
            Map.entry("ticket_id", "id_glpi"),
            Map.entry("glpi_id", "id_glpi"),
            Map.entry("bank", "banque"),
            Map.entry("corrected_bank", "banque_corrigee"),
            Map.entry("requester", "demandeur"),
            Map.entry("approver", "valideur"),
            Map.entry("validator", "valideur"),
            Map.entry("processing", "traitement"),
            Map.entry("status", "statut"),
            Map.entry("reference", "reference")
    );

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
        // Libellés alternatifs acceptés : « Type » (sortie du traitement OPPART), « Mode de Paiement » et « ID ticket »
        if (map.containsKey("type") && !map.containsKey("type_operation")) map.put("type_operation", map.get("type"));
        if (map.containsKey("mode_de_paiement")) map.putIfAbsent("mode_paiement", map.get("mode_de_paiement"));
        if (map.containsKey("id_ticket")) map.putIfAbsent("id_glpi", map.get("id_ticket"));
        // Détection FR/EN : une colonne anglaise alimente la clé interne correspondante
        for (Map.Entry<String, String> alias : OPERATION_EN_ALIASES.entrySet()) {
            if (map.containsKey(alias.getKey())) map.putIfAbsent(alias.getValue(), map.get(alias.getKey()));
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
        try { return Double.parseDouble(c.toString().trim().replace(" ", "").replace(" ","")); } catch (Exception e) { return null; }
    }

    private static LocalDateTime getLocalDateTime(Row row, Integer col) {
        if (row == null || col == null) return null;
        Cell c = row.getCell(col);
        if (c == null) return null;
        try {
            if (c.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(c)) {
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

    public byte[] generateTemplate(String fileType) throws Exception {
        Workbook wb = new XSSFWorkbook();
        Sheet sheet = wb.createSheet("Operations");

        if ("operation".equalsIgnoreCase(fileType)) {
            // Modèle des opérations : mêmes colonnes que le tableau Opérations
            String[] headers = new String[]{
                    "Type Opération", "Montant", "Statut", "Date Opération", "Agence",
                    "Référence", "ID GLPI", "Banque", "Banque Corrigée", "Demandeur", "Valideur", "Pays",
                    "Traitement"
            };
            Row h = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = h.createCell(i, CellType.STRING);
                c.setCellValue(headers[i]);
            }
            // Example row (référence vide : générée à l'import)
            Row ex = sheet.createRow(1);
            ex.createCell(0).setCellValue("APPROVISIONNEMENT_DISTRIBUTEUR");
            ex.createCell(1).setCellValue(2455108);
            ex.createCell(2).setCellValue("OK");
            ex.createCell(3).setCellValue("2026-11-02");
            ex.createCell(4).setCellValue("ONUF6873");
            ex.createCell(5).setCellValue("");
            ex.createCell(6).setCellValue("12345");
            ex.createCell(7).setCellValue("MEMO-CI");
            ex.createCell(8).setCellValue("MEMO-CI");
            ex.createCell(9).setCellValue("armandfara.diop");
            ex.createCell(10).setCellValue("Papebassirou.Ly");
            ex.createCell(11).setCellValue("CITCH");
            ex.createCell(12).setCellValue("");

        } else {
            // Template par défaut (BO/Partner)
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
            ex.createCell(10).setCellValue("20251001-AG001-100000");
            ex.createCell(11).setCellValue("12345");
            ex.createCell(12).setCellValue("BOA");
            ex.createCell(13).setCellValue("En attente");
        }

        for (int i = 0; i < sheet.getRow(0).getLastCellNum(); i++) {
            sheet.autoSizeColumn(i);
        }
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        return bos.toByteArray();
    }
}
