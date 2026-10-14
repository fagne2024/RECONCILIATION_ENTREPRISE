package com.reconciliation.service;

import com.reconciliation.dto.ReleveBancaireRow;
import com.reconciliation.repository.CompteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class ReleveBancaireImportService {

    private static final Map<String, String> HEADER_ALIASES = buildAliases();

    @Autowired
    private CompteRepository compteRepository;

    public com.reconciliation.dto.ReleveImportResult parseFileWithAlerts(MultipartFile file) throws Exception {
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        try (InputStream is = file.getInputStream(); Workbook wb = createWorkbook(filename, is)) {
            Sheet sheet = wb.getSheetAt(0);
            if (sheet == null) return new com.reconciliation.dto.ReleveImportResult(new ArrayList<>(), 0, 0, new ArrayList<>());

            // Detect headers row and map columns
            // Trouver dynamiquement la ligne d'entêtes (fichiers avec bannières hautes)
            int headerRowIdx = findBestHeaderRow(sheet, 50);
            Row header = sheet.getRow(headerRowIdx);
            Map<String, Integer> colIndex = mapHeaders(header);
            List<String> unmapped = new ArrayList<>();
            if (header != null) {
                for (int i = header.getFirstCellNum(); i < header.getLastCellNum(); i++) {
                    Cell c = header.getCell(i);
                    String raw = (c != null) ? c.toString() : null;
                    if (raw == null) continue;
                    String norm = normalize(raw);
                    if (!HEADER_ALIASES.containsKey(norm)) {
                        unmapped.add(raw);
                    }
                }
            }
            List<ReleveBancaireRow> rows = new ArrayList<>();
            for (int r = headerRowIdx + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                ReleveBancaireRow dto = new ReleveBancaireRow();
                dto.nomCompte = getString(row, colIndex.get("nomCompte"));
                dto.numeroCompte = getString(row, colIndex.get("numeroCompte"));
                dto.dateComptable = getDate(row, colIndex.get("dateComptable"));
                dto.dateValeur = getDate(row, colIndex.get("dateValeur"));
                dto.libelle = getString(row, colIndex.get("libelle"));
                dto.debit = getNumber(row, colIndex.get("debit"));
                dto.credit = getNumber(row, colIndex.get("credit"));
                dto.montant = getNumber(row, colIndex.get("montant"));
                if (dto.montant == null) {
                    Double d = dto.debit != null ? dto.debit : 0d;
                    Double c = dto.credit != null ? dto.credit : 0d;
                    dto.montant = c - d;
                }
                dto.numeroCheque = getString(row, colIndex.get("numeroCheque"));
                dto.devise = getString(row, colIndex.get("devise"));
                dto.soldeCourant = getNumber(row, colIndex.get("soldeCourant"));
                dto.soldeDisponibleCloture = getNumber(row, colIndex.get("soldeDisponibleCloture"));
                dto.soldeDisponibleOuverture = getNumber(row, colIndex.get("soldeDisponibleOuverture"));
                dto.soldeComptableOuverture = getNumber(row, colIndex.get("soldeComptableOuverture"));
                dto.soldeComptableCloture = getNumber(row, colIndex.get("soldeComptableCloture"));
                dto.depotTotal = getNumber(row, colIndex.get("depotTotal"));
                dto.totalRetraits = getNumber(row, colIndex.get("totalRetraits"));
                dto.numeroSerie = getString(row, colIndex.get("numeroSerie"));

                boolean allEmpty = (dto.numeroCompte == null || dto.numeroCompte.isBlank()) && dto.libelle == null && dto.debit == null && dto.credit == null;
                if (!allEmpty) rows.add(dto);
            }
            int totalRead = rows.size();
            // Déduplication basique (par numéroCompte + dateComptable + dateValeur + libelle + montant)
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            List<ReleveBancaireRow> deduped = new ArrayList<>();
            for (ReleveBancaireRow r : rows) {
                String key = buildDedupKey(r.numeroCompte, r.dateComptable, r.dateValeur, r.libelle, r.montant);
                if (seen.add(key)) deduped.add(r);
            }
            int duplicatesIgnored = totalRead - deduped.size();
            return new com.reconciliation.dto.ReleveImportResult(deduped, totalRead, duplicatesIgnored, unmapped);
        }
    }

    // Convert rows to entities (for persistence layer)
    public List<com.reconciliation.entity.ReleveBancaireEntity> toEntities(List<ReleveBancaireRow> rows, String filename) {
        List<com.reconciliation.entity.ReleveBancaireEntity> list = new ArrayList<>();
        for (ReleveBancaireRow dto : rows) {
            com.reconciliation.entity.ReleveBancaireEntity e = new com.reconciliation.entity.ReleveBancaireEntity();
            // Normalisation / nettoyage minimal
            if (dto.numeroCompte != null) dto.numeroCompte = dto.numeroCompte.replaceAll("[^0-9A-Za-z]", "");
            if (dto.devise != null) dto.devise = dto.devise.trim().toUpperCase();

            e.setNumeroCompte(dto.numeroCompte);
            e.setNomCompte(dto.nomCompte);
            e.setDateComptable(dto.dateComptable);
            e.setDateValeur(dto.dateValeur);
            e.setLibelle(dto.libelle);
            e.setDebit(dto.debit);
            e.setCredit(dto.credit);
            e.setMontant(dto.montant);
            e.setNumeroCheque(dto.numeroCheque);
            e.setDevise(dto.devise);
            e.setSoldeCourant(dto.soldeCourant);
            e.setSoldeDisponibleCloture(dto.soldeDisponibleCloture);
            e.setSoldeDisponibleOuverture(dto.soldeDisponibleOuverture);
            e.setSoldeComptableOuverture(dto.soldeComptableOuverture);
            e.setSoldeComptableCloture(dto.soldeComptableCloture);
            e.setDepotTotal(dto.depotTotal);
            e.setTotalRetraits(dto.totalRetraits);
            e.setNumeroSerie(dto.numeroSerie);
            // Déterminer la banque: codeProprietaire depuis le compte si existant, sinon heuristique nomCompte
            try {
                if (dto.numeroCompte != null && !dto.numeroCompte.isBlank()) {
                    var compteOpt = compteRepository.findByNumeroCompte(dto.numeroCompte);
                    if (compteOpt.isPresent()) {
                        var compte = compteOpt.get();
                        if (compte.getCodeProprietaire() != null && !compte.getCodeProprietaire().isBlank()) {
                            e.setBanque(compte.getCodeProprietaire());
                            dto.banque = compte.getCodeProprietaire();
                        }
                    }
                }
                if (e.getBanque() == null && dto.nomCompte != null && !dto.nomCompte.isBlank()) {
                    String candidate = dto.nomCompte.trim().replaceAll("[0-9]", "").replaceAll("\\s+", " ").trim();
                    if (candidate.length() >= 3) {
                        e.setBanque(candidate);
                        dto.banque = candidate;
                    }
                }
            } catch (Exception ignore) {}
            e.setSourceFilename(filename);
            e.setUploadedAt(java.time.LocalDateTime.now());
            // Définir la clé de déduplication stable
            String dedupKey = buildDedupKey(e.getNumeroCompte(), e.getDateComptable(), e.getDateValeur(), e.getLibelle(), e.getMontant());
            e.setDedupKey(dedupKey);
            list.add(e);
        }
        return list;
    }

    private static String safe(String s) { return s == null ? "" : s.trim(); }
    private static String safeDate(LocalDate d) { return d == null ? "" : d.toString(); }

    private static String normalizeText(String s) {
        if (s == null) return "";
        String t = s.trim().toLowerCase();
        // supprimer accents de base
        t = java.text.Normalizer.normalize(t, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        // retrait espaces multiples
        t = t.replaceAll("\\s+", " ");
        return t;
    }

    private static String buildDedupKey(String numeroCompte, LocalDate dateComptable, LocalDate dateValeur, String libelle, Double montant) {
        String num = safe(numeroCompte);
        String dc = safeDate(dateComptable);
        String dv = safeDate(dateValeur);
        String lib = normalizeText(libelle);
        long cents = Math.round((montant == null ? 0d : montant) * 100d);
        return String.join("|", num, dc, dv, lib, String.valueOf(cents));
    }

    private static Workbook createWorkbook(String filename, InputStream is) throws Exception {
        if (filename.endsWith(".xlsx") || filename.endsWith(".xlsm")) {
            return new XSSFWorkbook(is);
        } else if (filename.endsWith(".xls")) {
            return new HSSFWorkbook(is);
        } else if (filename.endsWith(".csv")) {
            // Convert CSV to a Workbook-like structure for reuse
            List<String> lines = new java.io.BufferedReader(new java.io.InputStreamReader(is)).lines().toList();
            org.apache.poi.ss.usermodel.Workbook wb = new XSSFWorkbook();
            org.apache.poi.ss.usermodel.Sheet sheet = wb.createSheet();
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
            // Tenter CSV via Apache POI (simple): fallback simple en lisant comme texte
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
            String std = HEADER_ALIASES.get(key);
            if (std != null) map.put(std, i);
        }
        return map;
    }

    private static String normalize(String s) {
        return s.toLowerCase()
                .replace("é", "e").replace("è", "e").replace("ê", "e")
                .replace("à", "a").replace("â", "a")
                .replace("ù", "u")
                .replace("î", "i")
                .replace("ô", "o")
                .replaceAll("[^a-z0-9]", "")
                .trim();
    }

    // Recherche la meilleure ligne d'entêtes en scannant les N premières lignes
    private static int findBestHeaderRow(Sheet sheet, int maxScan) {
        int first = sheet.getFirstRowNum();
        int last = Math.min(sheet.getLastRowNum(), first + Math.max(5, maxScan));
        int bestRow = first;
        int bestScore = -1;
        for (int r = first; r <= last; r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            int score = 0;
            for (int i = row.getFirstCellNum(); i < row.getLastCellNum(); i++) {
                Cell c = row.getCell(i);
                String raw = (c != null) ? c.toString() : null;
                if (raw == null) continue;
                String norm = normalize(raw);
                if (HEADER_ALIASES.containsKey(norm)) score++;
            }
            if (score > bestScore) { bestScore = score; bestRow = r; }
            // Court-circuit si score suffisant
            if (score >= 6) break;
        }
        return bestRow;
    }

    private static Map<String, String> buildAliases() {
        Map<String, String> m = new HashMap<>();
        // Canonical keys → our fields
        m.put("nomducompte", "nomCompte");
        m.put("nomcompte", "nomCompte");
        m.put("numerodecompte", "numeroCompte");
        m.put("numerocompte", "numeroCompte");
        m.put("compte", "numeroCompte");

        m.put("datecomptable", "dateComptable");
        m.put("dateoperation", "dateComptable");

        m.put("datevaleur", "dateValeur");

        m.put("libelle", "libelle");
        m.put("narratif", "libelle");
        m.put("narration", "libelle");
        m.put("intitule", "libelle");

        m.put("debit", "debit");
        m.put("dbit", "debit");
        m.put("debits", "debit");

        m.put("credit", "credit");
        m.put("crdit", "credit");
        m.put("credits", "credit");

        m.put("montant", "montant");

        m.put("numerochéque", "numeroCheque");
        m.put("numerochèque", "numeroCheque");
        m.put("numerochq", "numeroCheque");
        m.put("numcheque", "numeroCheque");
        m.put("cheque", "numeroCheque");

        m.put("devise", "devise");
        m.put("deviseducompte", "devise");

        m.put("soldecourant", "soldeCourant");
        m.put("soldecourantducompte", "soldeCourant");

        m.put("soldedisponibledecloture", "soldeDisponibleCloture");
        m.put("soldedisponibledeclotureducompte", "soldeDisponibleCloture");

        m.put("soldedisponiblealouverture", "soldeDisponibleOuverture");
        m.put("soldedisponiblealouvertureducompte", "soldeDisponibleOuverture");

        m.put("soldecomptabledouverture", "soldeComptableOuverture");
        m.put("soldecomptablealouverture", "soldeComptableOuverture");
        m.put("soldecomptabledecloture", "soldeComptableCloture");
        m.put("depototal", "depotTotal");
        m.put("depottotal", "depotTotal");
        m.put("totaldesretraits", "totalRetraits");
        
        // Support ECOBANK - Mapping des colonnes spécifiques
        // COMPTE -> Numéro de compte
        m.put("compte", "numeroCompte");
        
        // NARRATION -> Libellé
        m.put("narration", "libelle");
        
        // DEVISE DU COMPTE -> Devise
        m.put("deviseducompte", "devise");
        
        // DATE COMPTABLE -> Date comptable
        m.put("datecomptable", "dateComptable");
        
        // DATE DE VALEUR -> Date valeur
        m.put("datedevaleur", "dateValeur");
        
        // CRÉDIT -> Credit (sans XAF/XOF)
        m.put("crédit", "credit");
        m.put("credit", "credit");
        
        // DÉBIT -> Debit (sans XAF/XOF)
        m.put("débit", "debit");
        m.put("debit", "debit");
        
        // SOLDE COURANT -> Solde courant
        m.put("soldecourant", "soldeCourant");
        
        // SOLDE DISPONIBLE DE CLOTURE -> Solde disponible clôture
        m.put("soldedisponibledecloture", "soldeDisponibleCloture");
        
        // SOLDE DISPONIBLE À L'OUVERTURE -> Solde disponible ouverture
        m.put("soldedisponiblealouverture", "soldeDisponibleOuverture");
        
        // SOLDE COMPTABLE D'OUVERTURE -> Solde comptable ouverture
        m.put("soldecomptabledouverture", "soldeComptableOuverture");
        
        // SOLDE COMPTABLE DE CLOTURE -> Solde comptable clôture
        m.put("soldecomptabledecloture", "soldeComptableCloture");
        
        // DÉPOT TOTAL -> Dépôt total
        m.put("depototal", "depotTotal");
        
        // TOTAL DES RETRAITS -> Total retraits
        m.put("totaldesretraits", "totalRetraits");
        
        // NUMÉRO DE SERIE -> Numéro de série (optionnel)
        m.put("numerodeserie", "numeroSerie");
        m.put("numeroserie", "numeroSerie");
        
        return m;
    }

    private static String getString(Row row, Integer idx) {
        if (idx == null) return null;
        Cell c = row.getCell(idx);
        if (c == null) return null;
        c.setCellType(CellType.STRING);
        String s = c.getStringCellValue();
        return (s != null && !s.isBlank()) ? s.trim() : null;
    }

    private static Double getNumber(Row row, Integer idx) {
        if (idx == null) return null;
        Cell c = row.getCell(idx);
        if (c == null) return null;
        try {
            if (c.getCellType() == CellType.NUMERIC) return c.getNumericCellValue();
            String s = c.toString();
            if (s == null) return null;
            s = s.trim();
            if (s.isEmpty()) return null;
            
            // Support ECOBANK: Supprimer XAF, XOF et autres devises
            s = s.replaceAll("(?i)(xaf|xof|usd|eur|cfa)\\s*", "");
            
            // Supprimer libellés et devises
            s = s.replaceAll("[A-Za-z\\u00C0-\\u017F]", "");
            // Garder seulement chiffres, séparateurs et signe
            s = s.replaceAll("[^0-9,.-]", "");
            if (s.isEmpty()) return null;
            // Déterminer séparateur décimal (dernier ',' ou '.')
            int lastComma = s.lastIndexOf(',');
            int lastDot = s.lastIndexOf('.');
            char decimalSep = (lastComma > lastDot) ? ',' : '.';
            // Retirer tous les séparateurs de milliers (l'autre séparateur)
            if (decimalSep == ',') {
                s = s.replace(".", "");
                s = s.replace(',', '.');
            } else {
                s = s.replace(",", "");
            }
            // Nettoyer doublons de signes
            s = s.replaceAll("--", "-");
            return s.isBlank() ? null : Double.parseDouble(s);
        } catch (Exception e) { return null; }
    }

    private static LocalDate getDate(Row row, Integer idx) {
        if (idx == null) return null;
        Cell c = row.getCell(idx);
        if (c == null) return null;
        try {
            // 1) Vrai format date Excel
            if (DateUtil.isCellDateFormatted(c)) {
                return c.getLocalDateTimeCellValue().toLocalDate();
            }
            // 2) Valeur numérique Excel (saisie comme nombre, non formatée)
            if (c.getCellType() == CellType.NUMERIC) {
                double v = c.getNumericCellValue();
                if (DateUtil.isValidExcelDate(v)) {
                    java.util.Date d = DateUtil.getJavaDate(v);
                    return d.toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
                }
            }
            String s = c.toString();
            if (s == null) return null;
            s = s.trim();
            if (s.isBlank()) return null;
            // Try multiple patterns (case-insensitive)
            // Normaliser multiples espaces/points au besoin
            s = s.replaceAll("\\s+", " ").replace('.', '-').replace('/', '-');
            
            // Support ECOBANK: Format DD-MMM-YY (ex: 01-OCT-25)
            String[] patternsEcobank = {"dd-MMM-yy", "dd-MMM-yyyy", "dd MMM yy", "dd MMM yyyy"};
            String[] patternsFr = {"dd-MM-yyyy", "yyyy-MM-dd", "dd MMM yy", "dd MMM yyyy", "dd-MMM-yy", "dd-MMM-yyyy", "ddMMyyyy", "yyyyMMdd"};
            String[] patternsEn = {"dd-MMM-yy", "dd-MMM-yyyy", "dd MMM yy", "dd MMM yyyy"};
            
            // Essayer d'abord les patterns ECOBANK
            for (String p : patternsEcobank) {
                try { return parseCaseInsensitive(s, p, Locale.ENGLISH); } catch (Exception ignore) {}
            }
            for (String p : patternsFr) {
                try { return parseCaseInsensitive(s, p, Locale.FRENCH); } catch (Exception ignore) {}
            }
            for (String p : patternsEn) {
                try { return parseCaseInsensitive(s, p, Locale.ENGLISH); } catch (Exception ignore) {}
            }
            // 3) Fallback: extraire jour/mois/année chiffres si présent
            String digits = s.replaceAll("[^0-9]", "");
            if (digits.length() == 8) {
                // ddMMyyyy
                String dd = digits.substring(0,2), mm = digits.substring(2,4), yyyy = digits.substring(4,8);
                return LocalDate.parse(dd+"-"+mm+"-"+yyyy, DateTimeFormatter.ofPattern("dd-MM-yyyy"));
            }
        } catch (Exception ignore) {}
        return null;
    }

    private static LocalDate parseCaseInsensitive(String input, String pattern, Locale locale) {
        java.time.format.DateTimeFormatter f = new java.time.format.DateTimeFormatterBuilder()
                .parseCaseInsensitive()
                .appendPattern(pattern)
                .toFormatter(locale);
        return LocalDate.parse(input, f);
    }
}


