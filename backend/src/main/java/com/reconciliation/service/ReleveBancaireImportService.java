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
    @Autowired
    private com.reconciliation.repository.PaysRepository paysRepository;

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
                // Colonne référence présente : elle prime sur le libellé (repli sur le libellé si elle est vide)
                String reference = getString(row, colIndex.get("reference"));
                if (reference != null) dto.libelle = reference;
                dto.debit = getNumber(row, colIndex.get("debit"));
                dto.credit = getNumber(row, colIndex.get("credit"));
                dto.montant = getNumber(row, colIndex.get("montant"));
                // Montant réellement présent dans le fichier (avant le calcul crédit - débit)
                boolean montantRenseigne = dto.montant != null;
                // Fichier avec la seule colonne montant : négatif = débit, positif = crédit
                if (montantRenseigne && dto.debit == null && dto.credit == null) {
                    if (dto.montant < 0) {
                        dto.debit = Math.abs(dto.montant);
                    } else if (dto.montant > 0) {
                        dto.credit = dto.montant;
                    }
                }
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
                dto.banque = getString(row, colIndex.get("banque"));
                dto.pays = getString(row, colIndex.get("pays"));

                // Une ligne avec seulement un montant (fichier issu du traitement automatique, sans compte
                // ni débit/crédit) n'est pas vide : elle doit atteindre le contrôle des champs manquants.
                boolean allEmpty = (dto.numeroCompte == null || dto.numeroCompte.isBlank()) && dto.libelle == null
                        && dto.debit == null && dto.credit == null && !montantRenseigne;
                if (!allEmpty) rows.add(dto);
            }
            int totalRead = rows.size();
            // Déduplication basique (par numéroCompte + dateComptable + dateValeur + libelle + montant)
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            List<ReleveBancaireRow> deduped = new ArrayList<>();
            for (ReleveBancaireRow r : rows) {
                String key = libelleDedupKey(r.libelle,
                        buildDedupKey(r.numeroCompte, r.dateComptable, r.dateValeur, r.libelle, r.montant));
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
            // Banque du fichier prioritaire ; sinon déduite du compte ci-dessous
            e.setBanque(dto.banque);
            // Déterminer la banque: codeProprietaire depuis le compte si existant, sinon heuristique nomCompte
            try {
                if (dto.numeroCompte != null && !dto.numeroCompte.isBlank()) {
                    var compteOpt = compteRepository.findByNumeroCompte(dto.numeroCompte);
                    if (compteOpt.isPresent()) {
                        var compte = compteOpt.get();
                        if (e.getBanque() == null && compte.getCodeProprietaire() != null && !compte.getCodeProprietaire().isBlank()) {
                            e.setBanque(compte.getCodeProprietaire());
                            dto.banque = compte.getCodeProprietaire();
                        }
                    }
                }
                // Pas de repli sur le nom du compte : une banque absente du fichier (et inconnue du
                // compte) reste vide pour être demandée à l'utilisateur (pop-up des champs manquants).
            } catch (Exception ignore) {}
            // Pays : colonne du fichier (ou valeur saisie), sinon pays du compte, sinon suffixe de la banque
            String pays = resolvePaysCode(dto.pays);
            try {
                if (pays == null && dto.numeroCompte != null && !dto.numeroCompte.isBlank()) {
                    pays = resolvePaysCode(compteRepository.findByNumeroCompte(dto.numeroCompte)
                            .map(c -> c.getPays()).orElse(null));
                }
                if (pays == null && e.getBanque() != null) {
                    String b = e.getBanque().trim();
                    if (b.length() >= 2) {
                        String last2 = b.substring(b.length() - 2).toUpperCase();
                        if (paysRepository.findByCode(last2).isPresent()) pays = last2;
                    }
                }
            } catch (Exception ignore) {}
            e.setPays(pays);
            dto.pays = pays;
            // Devise absente du fichier : déduite du pays (ex. ML -> XOF, CM -> XAF)
            if ((dto.devise == null || dto.devise.isBlank()) && pays != null) {
                String devise = DEVISE_PAR_PAYS.get(pays.trim().toUpperCase());
                if (devise != null) {
                    dto.devise = devise;
                    e.setDevise(devise);
                }
            }
            e.setSourceFilename(filename);
            e.setUploadedAt(java.time.LocalDateTime.now());
            // Définir la clé de déduplication stable
            String dedupKey = libelleDedupKey(e.getLibelle(),
                    buildDedupKey(e.getNumeroCompte(), e.getDateComptable(), e.getDateValeur(), e.getLibelle(), e.getMontant()));
            e.setDedupKey(dedupKey);
            list.add(e);
        }
        return list;
    }

    /**
     * Code pays à partir d'un code (ML, SN…) ou d'un nom (Mali, Sénégal…) ; null si vide.
     * Un nom inconnu est conservé tel quel (majuscules) plutôt que perdu.
     */
    String resolvePaysCode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim();
        if (v.matches("(?i)[a-z]{2,3}")) return v.toUpperCase();
        try {
            String target = normalizeText(v);
            for (var p : paysRepository.findAll()) {
                if (normalizeText(p.getNom()).equals(target) && p.getCode() != null) {
                    return p.getCode().trim().toUpperCase();
                }
            }
        } catch (Exception ignore) {}
        return v.toUpperCase();
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

    /** Libellé normalisé (casse, accents, espaces) pour comparer deux libellés. */
    public static String normalizeLibelle(String libelle) {
        return normalizeText(libelle);
    }

    /**
     * Clé de doublon fondée sur le libellé : un même libellé ne doit pas exister deux fois.
     * Sans libellé, la clé de repli (compte + dates + montant) est utilisée pour ne pas écarter
     * toutes les lignes sans libellé.
     */
    public static String libelleDedupKey(String libelle, String fallbackKey) {
        String normalized = normalizeLibelle(libelle);
        if (normalized.isEmpty()) return fallbackKey;
        return com.reconciliation.util.BankingDedupKey.of("LIB", normalized);
    }

    /** Clé de doublon d'une ligne de relevé (partagée par l'import et la saisie manuelle). */
    public static String buildDedupKey(String numeroCompte, LocalDate dateComptable, LocalDate dateValeur, String libelle, Double montant) {
        String num = safe(numeroCompte);
        String dc = safeDate(dateComptable);
        String dv = safeDate(dateValeur);
        String lib = normalizeText(libelle);
        long cents = Math.round((montant == null ? 0d : montant) * 100d);
        return String.join("|", num, dc, dv, lib, String.valueOf(cents));
    }

    /** Devise par code pays, utilisée quand le relevé ne fournit pas la devise. */
    static final Map<String, String> DEVISE_PAR_PAYS = buildDeviseParPays();

    private static Map<String, String> buildDeviseParPays() {
        Map<String, String> m = new HashMap<>();
        // UEMOA
        for (String p : new String[]{"BJ", "BF", "CI", "GW", "ML", "NE", "SN", "TG"}) m.put(p, "XOF");
        // CEMAC
        for (String p : new String[]{"CM", "CF", "TD", "CG", "GQ", "GA"}) m.put(p, "XAF");
        m.put("GN", "GNF");
        m.put("CD", "CDF");
        m.put("NG", "NGN");
        m.put("GH", "GHS");
        m.put("GM", "GMD");
        m.put("SL", "SLE");
        m.put("LR", "LRD");
        m.put("MR", "MRU");
        m.put("MG", "MGA");
        m.put("RW", "RWF");
        m.put("BI", "BIF");
        m.put("KE", "KES");
        m.put("UG", "UGX");
        m.put("TZ", "TZS");
        m.put("MA", "MAD");
        m.put("TN", "TND");
        m.put("FR", "EUR");
        return m;
    }

    private static Workbook createWorkbook(String filename, InputStream is) throws Exception {
        if (filename.endsWith(".xlsx") || filename.endsWith(".xlsm")) {
            return new XSSFWorkbook(is);
        } else if (filename.endsWith(".xls")) {
            return new HSSFWorkbook(is);
        } else if (filename.endsWith(".csv")) {
            return com.reconciliation.util.CsvWorkbookReader.toWorkbook(is);
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

        // En-têtes courts des extraits de compte (ex. PDF « Date ! Libelle operation ! Val. ! Debit ! Credit »)
        m.put("date", "dateComptable");
        m.put("val", "dateValeur");
        m.put("valeur", "dateValeur");
        m.put("dateval", "dateValeur");
        m.put("libelleoperation", "libelle");
        m.put("libelledoperation", "libelle");
        m.put("libelledeloperation", "libelle");

        m.put("libelle", "libelle");
        m.put("narratif", "libelle");
        m.put("narration", "libelle");
        m.put("intitule", "libelle");

        // Référence : reportée dans le libellé, en priorité sur la colonne libellé
        m.put("reference", "reference");
        m.put("ref", "reference");

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
        m.put("banque", "banque");
        m.put("banqueappro", "banque");
        m.put("bo", "banque");
        m.put("numeroserie", "numeroSerie");

        // En-têtes anglais (relevés en anglais) : même champs internes que les en-têtes français
        m.put("accountnumber", "numeroCompte");
        m.put("accountno", "numeroCompte");
        m.put("accountname", "nomCompte");
        m.put("pays", "pays");
        m.put("paysducompte", "pays");
        m.put("codepays", "pays");
        m.put("country", "pays");
        m.put("bank", "banque");
        m.put("bankname", "banque");
        m.put("accountingdate", "dateComptable");
        m.put("bookingdate", "dateComptable");
        m.put("valuedate", "dateValeur");
        m.put("labelnarration", "libelle");
        m.put("libellenarration", "libelle");
        m.put("label", "libelle");
        m.put("amount", "montant");
        m.put("currency", "devise");
        m.put("accountcurrency", "devise");
        m.put("chequenumber", "numeroCheque");
        m.put("checknumber", "numeroCheque");
        m.put("serialnumber", "numeroSerie");
        m.put("seriesnumber", "numeroSerie");
        
        return m;
    }

    private static String getString(Row row, Integer idx) {
        if (idx == null) return null;
        Cell c = row.getCell(idx);
        if (c == null) return null;
        String s = null;
        // Cellule déjà textuelle : lecture directe. Forcer le type STRING vidait les textes « inline »
        // (t="str") des fichiers générés par le traitement automatique (SheetJS) : libellé perdu.
        CellType type = c.getCellType();
        if (type == CellType.STRING || type == CellType.FORMULA) {
            try { s = c.getStringCellValue(); } catch (Exception ignore) { s = null; }
        }
        if (s == null || s.isBlank()) {
            if (type == CellType.STRING) {
                String raw = c.toString();
                s = raw;
            } else {
                c.setCellType(CellType.STRING);
                s = c.getStringCellValue();
            }
        }
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

            // Supprimer libellés et devises, garder chiffres, séparateurs et signe
            s = s.replaceAll("[A-Za-z\\u00C0-\\u017F]", "");
            s = s.replace("\u00A0", "").replace("\u202F", "")
                    .replace(" ", "").replace("'", "");
            s = s.replaceAll("[^0-9,.-]", "");
            if (s.isEmpty()) return null;

            int lastComma = s.lastIndexOf(',');
            int lastDot = s.lastIndexOf('.');
            if (lastComma >= 0 && lastDot >= 0) {
                if (lastComma > lastDot) {
                    // 1.234,56 : point = milliers, virgule = décimales
                    s = s.replace(".", "").replace(',', '.');
                } else {
                    // 1,234.56 : virgule = milliers, point = décimales
                    s = s.replace(",", "");
                }
            } else if (lastComma >= 0) {
                String[] parts = s.split(",");
                boolean thousands = parts.length > 1;
                for (int i = 1; i < parts.length; i++) {
                    if (!parts[i].matches("\\d{3}")) { thousands = false; break; }
                }
                s = thousands ? s.replace(",", "") : s.replace(',', '.');
            } else if (lastDot >= 0) {
                String[] parts = s.split("\\.");
                boolean thousands = parts.length > 1;
                for (int i = 1; i < parts.length; i++) {
                    if (!parts[i].matches("\\d{3}")) { thousands = false; break; }
                }
                if (thousands) s = s.replace(".", "");
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
            if (c.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(c)) {
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
            // Date ISO suivie éventuellement d'une heure (ex. 2026-11-03 17:33:24.0)
            if (s.matches("^\\d{4}-\\d{2}-\\d{2}.*")) {
                return LocalDate.parse(s.substring(0, 10), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            }
            // Date sans année (ex. 01/06) : jour/mois complété avec l'année en cours
            java.util.regex.Matcher jourMois = java.util.regex.Pattern.compile("^(\\d{1,2})[/-](\\d{1,2})$").matcher(s);
            if (jourMois.matches()) {
                return LocalDate.of(LocalDate.now().getYear(),
                        Integer.parseInt(jourMois.group(2)), Integer.parseInt(jourMois.group(1)));
            }
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


