package com.reconciliation.service;

import com.reconciliation.dto.OPPARTVerificationLigneRequest;
import com.reconciliation.dto.OPPARTVerificationResultDto;

import com.reconciliation.entity.OPPARTEntity;
import com.reconciliation.repository.OPPARTRepository;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.time.format.SignStyle;
import java.time.temporal.ChronoField;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class OPPARTService {

    @Autowired
    private OPPARTRepository oppartRepository;

    private static final DateTimeFormatter ISO_DATE_TIME = DateTimeFormatter.ISO_DATE_TIME;

    /** Format des dates telles qu'écrites dans les cellules Excel. */
    private static final DateTimeFormatter IMPORT_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** Numéro de série Excel maximal correspondant au 31/12/9999. */
    private static final double EXCEL_SERIAL_MAX = 2958465d;

    /** Clé de date pour la détection de doublons. */
    private static final DateTimeFormatter DUPLICATE_DATE_FORMATTER = DateTimeFormatter.ofPattern("uuuu-MM-dd");
    private static final DateTimeFormatter DUPLICATE_DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm");

    /** Nombre d'identifiants envoyés par requête lors du contrôle de doublons. */
    private static final int DUP_QUERY_BATCH = 500;

    /**
     * Formats de date acceptés à l'import, essayés dans l'ordre.
     * Couvre notamment {@code 08-MAY-26}, {@code 08-mai-2026}, {@code 2026-06-08},
     * {@code 08/06/2026} et {@code 16/06/2026 11:25}, avec ou sans secondes.
     */
    private static final List<DateTimeFormatter> IMPORT_DATE_FORMATS = buildImportDateFormats();

    private static List<DateTimeFormatter> buildImportDateFormats() {
        List<DateTimeFormatter> formats = new ArrayList<>();

        // Dates compactes : 20260908, 20260908 16:44:52, 20260908164452.
        // Placees en tete car un nombre de 8 chiffres correspond aussi a la forme
        // yyyyMMdd et ne doit pas etre lu comme un numero de serie Excel.
        formats.addAll(List.of(
                DateTimeFormatter.ofPattern("uuuuMMdd HH:mm:ss"),
                DateTimeFormatter.ofPattern("uuuuMMdd HH:mm"),
                DateTimeFormatter.ofPattern("uuuuMMddHHmmss"),
                DateTimeFormatter.ofPattern("uuuuMMddHHmm"),
                DateTimeFormatter.ofPattern("uuuuMMdd")));

        // Dates avec mois alphabetique : 08-MAY-26, 08-mai-2026, 8/May/2026.
        for (Locale locale : List.of(Locale.ENGLISH, Locale.FRENCH)) {
            for (String sep : List.of("-", "/", ".")) {
                formats.add(new DateTimeFormatterBuilder()
                        .parseCaseInsensitive()
                        .appendValue(ChronoField.DAY_OF_MONTH, 1, 2, SignStyle.NOT_NEGATIVE)
                        .appendLiteral(sep)
                        .appendPattern("MMM")
                        .appendLiteral(sep)
                        .appendValueReduced(ChronoField.YEAR, 2, 4, 2000)
                        .optionalStart().appendLiteral(' ').appendPattern("HH:mm").optionalEnd()
                        .optionalStart().appendLiteral(':').appendPattern("ss").optionalEnd()
                        .toFormatter(locale));
            }
        }

        formats.addAll(List.of(
                DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm"),
                DateTimeFormatter.ofPattern("uuuu-MM-dd"),
                DateTimeFormatter.ofPattern("dd-MM-uuuu HH:mm:ss"),
                DateTimeFormatter.ofPattern("dd-MM-uuuu HH:mm"),
                DateTimeFormatter.ofPattern("dd-MM-uuuu"),
                DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm:ss"),
                DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm"),
                DateTimeFormatter.ofPattern("dd/MM/uuuu"),
                DateTimeFormatter.ofPattern("MM/dd/uuuu HH:mm:ss"),
                DateTimeFormatter.ofPattern("MM/dd/uuuu HH:mm"),
                DateTimeFormatter.ofPattern("MM/dd/uuuu")));

        // ResolverStyle.STRICT : le resolver par defaut ecrête les dates impossibles
        // (30/02/2026 devenait le 28/02/2026 au lieu d'etre rejete). STRICT exige
        // l'annee proleptique "uuuu" plutot que "yyyy".
        List<DateTimeFormatter> strict = new ArrayList<>(formats.size());
        for (DateTimeFormatter format : formats) {
            strict.add(format.withResolverStyle(ResolverStyle.STRICT));
        }
        return strict;
    }

    /**
     * Convertit le resultat d'un pattern en LocalDateTime, y compris pour un motif
     * sans heure ({@code LocalDateTime.parse} echoue alors faute d'heure).
     */
    private static LocalDateTime toDateTime(TemporalAccessor parsed) {
        try {
            return LocalDateTime.from(parsed);
        } catch (DateTimeException e) {
            return LocalDate.from(parsed).atStartOfDay();
        }
    }

    /** Nombre de lignes renvoyées dans l'aperçu renvoyé par /validate. */
    private static final int PREVIEW_LIMIT = 20;

    /** En-têtes du modèle, dans l'ordre. Aligné sur l'export XLSX de l'écran OPPART. */
    private static final String[] TEMPLATE_HEADERS = {
            "Client", "Type_OP", "Montant", "Date opération BO", "Date opération part", "Date demande",
            "ID Transaction", "Pays", "Source"
    };

    private static final String[] TEMPLATE_EXAMPLE = {
            "ORANGE", "COMPENSE_PART", "1500.50", "2026-01-15 10:30:00",
            "2026-01-14 09:15:00", "2026-01-14 09:10:00", "TRX000123", "CI", "MANUEL"
    };

    /**
     * Alias acceptés pour chaque champ OPPART, comparés après normalisation
     * (minuscules, sans accent, sans ponctuation). Le premier alias trouvé dans le
     * fichier est utilisé.
     */
    private static final Map<String, List<String>> FIELD_ALIASES = Map.of(
            "client", List.of("client", "nomclient", "nomduclient"),
            "typeOp", List.of("typeop", "typeoperation", "typedop", "type"),
            "montant", List.of("montant", "amount", "montantdevise"),
            "dateOperation", List.of("date", "dateoperation", "dateoperationbo", "dateop", "datecomptable", "datevalue"),
            "dateOperationPart", List.of("dateoperationpart", "dateoperationpartenaire", "dateoperationpartner", "datepartenaire", "dateoppart", "datepart"),
            "dateDemande", List.of("datedemande", "datedelademande", "demande", "requestdate", "requesttime", "requestdatetime", "daterequest", "dateinitiation", "initiationdate", "initiationtime", "initiationdatetime", "requesteddate"),
            "idTransaction", List.of("idtransaction", "numtransaction", "numerotransgu", "idtrx", "transactionid"),
            "pays", List.of("pays", "country", "codePays"),
            "source", List.of("source", "origine", "originesource")
    );

    /**
     * Récupérer toutes les lignes OPPART avec filtres optionnels.
     */
  public List<OPPARTEntity> getOPPARTs(String client, String typeOp, String typeOpContains, String pays, String source,
      String statut, String token, String dateDebut, String dateFin) {
    LocalDateTime start = parseDateTime(dateDebut);
    LocalDateTime end = parseDateTime(dateFin);
    if (end != null && isDateOnly(dateFin)) {
      end = end.toLocalDate().atTime(LocalTime.MAX);
    }
    return oppartRepository.findWithFilters(client, typeOp, normalizeToken(typeOpContains), pays, source, normalizeStatut(statut),
    normalizeToken(token), start, end);
    }

  /** Une borne haute sans heure vaut pour toute la journée, pas pour minuit. */
  private static boolean isDateOnly(String value) {
    return value != null && value.trim().length() == 10;
    }

    /** Un token vide ou composed uniquement d'espaces équivaut à « pas de filtre ». */
    private static String normalizeToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        return token.trim();
    }

    private static String normalizeStatut(String statut) {
        if (statut == null || statut.isBlank()) {
            return null;
        }
        String v = statut.trim().toUpperCase();
        if (v.equals("EN_COURS") || v.equals("EN COURS") || v.equals("ENCOURS") || v.equals("EN_COURS ")) {
            return OPPARTEntity.STATUT_EN_COURS;
        }
        return v;
    }

    private LocalDateTime parseDateTime(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim().replace(" ", "T").replaceAll("Z$", "").replaceAll("\\.\\d+$", "");
        if (v.length() == 10) {
            try {
                return LocalDateTime.parse(v + "T00:00:00", ISO_DATE_TIME);
            } catch (DateTimeParseException e) {
                return null;
            }
        }
        try {
            return LocalDateTime.parse(v, ISO_DATE_TIME);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    public OPPARTEntity getOPPART(Long id) {
        return oppartRepository.findById(id).orElse(null);
    }

    public OPPARTEntity createOPPART(OPPARTEntity oppart) {
        oppart.setStatut(OPPARTEntity.STATUT_EN_COURS);
        return oppartRepository.save(oppart);
    }

    /**
     * Génère un token de correspondance unique.
     */
    public String generateToken() {
        return "OPP-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
    }

    /**
     * Change le statut d'une ligne (EN_COURS / OK).
     */
    public OPPARTEntity updateStatut(Long id, String statut) {
        OPPARTEntity oppart = oppartRepository.findById(id).orElse(null);
        if (oppart == null) {
            return null;
        }
        oppart.setStatut(statut);
        return oppartRepository.save(oppart);
    }

    /**
     * Lie 2 lignes via un token commun et les passe enstatut OK.
     * Retourne les 2 lignes liées, ou null si l'une des deux est introuvable.
     */
    public List<OPPARTEntity> linkOpparts(Long id1, Long id2, String token) {
        List<Long> ids = new ArrayList<>();
        if (id1 != null) {
            ids.add(id1);
        }
        if (id2 != null && !id2.equals(id1)) {
            ids.add(id2);
        }
        return linkOpparts(ids, token);
    }

    /**
     * Lie un groupe de lignes (2 ou plus) via un token commun et les passe en statut OK.
     * Utilisé par la recherche de correspondance par agrégation (somme de N lignes = 1 ligne).
     * Retourne les lignes liées, ou null si moins de 2 ids distincts ou ligne(s) introuvable(s).
     */
    public List<OPPARTEntity> linkOpparts(List<Long> ids, String token) {
        if (ids == null) {
            return null;
        }
        List<Long> distinct = new ArrayList<>();
        for (Long id : ids) {
            if (id != null && !distinct.contains(id)) {
                distinct.add(id);
            }
        }
        if (distinct.size() < 2) {
            return null;
        }
        List<OPPARTEntity> entities = oppartRepository.findAllById(distinct);
        if (entities.size() != distinct.size()) {
            return null;
        }
        // Détache d'abord les éventuels anciens tokens pour éviter de contaminer d'autres groupes.
        for (OPPARTEntity entity : entities) {
            detachToken(entity);
        }

        String sharedToken = (token == null || token.isBlank()) ? generateToken() : token.trim();
        for (OPPARTEntity entity : entities) {
            entity.setToken(sharedToken);
            entity.setStatut(OPPARTEntity.STATUT_OK);
            oppartRepository.save(entity);
        }
        return entities;
    }

    /**
     * Supprime le token d'une ligne et la repasse en EN_COURS (ainsi que sa ligne jumelle si elle existe).
     */
    public OPPARTEntity unlinkOppart(Long id) {
        OPPARTEntity oppart = oppartRepository.findById(id).orElse(null);
        if (oppart == null) {
            return null;
        }
        String token = oppart.getToken();
        if (token != null) {
            oppartRepository.findByToken(token).forEach(other -> {
                other.setToken(null);
                other.setStatut(OPPARTEntity.STATUT_EN_COURS);
                oppartRepository.save(other);
            });
        }
        oppart.setToken(null);
        oppart.setStatut(OPPARTEntity.STATUT_EN_COURS);
        return oppartRepository.save(oppart);
    }

    private void detachToken(OPPARTEntity oppart) {
        String token = oppart.getToken();
        if (token == null) {
            return;
        }
        oppartRepository.findByToken(token).forEach(other -> {
            other.setToken(null);
            other.setStatut(OPPARTEntity.STATUT_EN_COURS);
            oppartRepository.save(other);
        });
        oppart.setToken(null);
    }

    /**
     * Créer plusieurs lignes OPPART en une requête (évite 429 Too Many Requests).
     */
    public Map<String, Object> createOPPARTBatch(List<OPPARTEntity> opparts) {
        Map<String, Object> result = new HashMap<>();
        List<OPPARTEntity> created = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int index = 0;
        for (OPPARTEntity oppart : opparts != null ? opparts : List.<OPPARTEntity>of()) {
            index++;
            try {
                if (oppart == null) {
                    errors.add("Ligne " + index + " : ligne vide ignorée.");
                    continue;
                }
                oppart.setStatut(OPPARTEntity.STATUT_EN_COURS);
                OPPARTEntity saved = oppartRepository.save(oppart);
                created.add(saved);
            } catch (Exception e) {
                errors.add("Ligne " + index + " : " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        }
        result.put("successCount", created.size());
        result.put("errorCount", errors.size());
        result.put("created", created);
        result.put("errors", errors);
        result.put("total", (opparts != null ? opparts.size() : 0));
        return result;
    }

    public OPPARTEntity updateOPPART(OPPARTEntity oppart) {
        if (oppart.getId() != null) {
            OPPARTEntity existing = oppartRepository.findById(oppart.getId()).orElse(null);
            if (existing != null) {
                // Un payload sans statut / token ne doit pas écraser la valeur courante.
                if (oppart.getStatut() == null || oppart.getStatut().isBlank()) {
                    oppart.setStatut(existing.getStatut());
                }
                if (oppart.getToken() == null || oppart.getToken().isBlank()) {
                    oppart.setToken(existing.getToken());
                }
            }
        }
        if (oppart.getStatut() == null || oppart.getStatut().isBlank()) {
            oppart.setStatut(OPPARTEntity.STATUT_EN_COURS);
        }
        return oppartRepository.save(oppart);
    }

    public boolean deleteOPPART(Long id) {
        if (oppartRepository.existsById(id)) {
            oppartRepository.deleteById(id);
            return true;
        }
        return false;
    }

    /**
     * Suppression en masse de lignes OPPART.
     */
    public Map<String, Object> deleteOPPARTs(List<Long> ids) {
        Map<String, Object> result = new HashMap<>();
        List<Long> deleted = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        if (ids == null || ids.isEmpty()) {
            result.put("success", false);
            result.put("deletedCount", 0);
            result.put("errors", List.of("Aucun identifiant fourni."));
            return result;
        }
        for (Long id : ids) {
            try {
                if (deleteOPPART(id)) {
                    deleted.add(id);
                } else {
                    errors.add("Ligne id=" + id + " introuvable.");
                }
            } catch (Exception e) {
                errors.add("Ligne id=" + id + " : " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        }
        result.put("success", errors.isEmpty());
        result.put("deletedCount", deleted.size());
        result.put("errors", errors);
        return result;
    }

    /**
     * Récupérer les options de filtres distinctes.
     * Chaque dimension est un SELECT DISTINCT : la table n'est pas chargée,
     * contrairement à un findAll() par dimension.
     */
    public Map<String, List<String>> getFilterOptions() {
        Map<String, List<String>> options = new HashMap<>();
        options.put("clients", oppartRepository.findDistinctClients());
        options.put("typeOps", oppartRepository.findDistinctTypeOps());
        options.put("pays", oppartRepository.findDistinctPays());
        options.put("sources", oppartRepository.findDistinctSources());
        options.put("statuts", List.of(OPPARTEntity.STATUT_EN_COURS, OPPARTEntity.STATUT_OK));
        return options;
    }

    // ===================== Import de fichier =====================

    /**
     * Analyse un fichier OPPART sans rien enregistrer : renvoie un résumé
     * (lignes valides / en erreur / doublons) et un aperçu des premières lignes parsées.
     */
    public Map<String, Object> validateFile(MultipartFile file) {
        Map<String, Object> result = new HashMap<>();
        List<String> errors = new ArrayList<>();
        int errorLines = 0;
        int duplicates = 0;
        int totalReceived = 0;
        List<Map<String, String>> preview = new ArrayList<>();
        List<ValidRow> valides = new ArrayList<>();

        try {
            List<Map<String, String>> data = parseImportFile(file);
            totalReceived = data.size();

            // Première passe : parsing et contrôle de format, sans toucher la base.
            for (int i = 0; i < data.size(); i++) {
                Map<String, String> row = data.get(i);
                int lineNumber = i + 2; // +2 : index 0-based et une ligne d'en-tête
                int errorsBefore = errors.size();

                OPPARTEntity candidate = buildFromRow(row);
                if (candidate == null) {
                    errors.add("Ligne " + lineNumber + " : ligne vide, aucune donnée exploitable.");
                } else {
                    validateImportRow(candidate, lineNumber, errors);
                    if (errors.size() == errorsBefore) {
                        valides.add(new ValidRow(candidate, lineNumber));
                    } else {
                        errorLines++;
                    }
                }

                if (preview.size() < PREVIEW_LIMIT) {
                    preview.add(previewRow(candidate, lineNumber, errors.size() > errorsBefore));
                }
            }

            // Seconde passe : une requête bornée aux lignes du fichier.
            Set<String> knownKeys = existingRowKeys(valides);
            for (ValidRow valide : valides) {
                // add() renvoie false si la clé existait déjà (doublon en base ou dans le fichier).
                if (!knownKeys.add(rowKey(valide.oppart))) {
                    duplicates++;
                }
            }
        } catch (Exception e) {
            errors.add("Erreur lors de la lecture du fichier : " + e.getMessage());
        }

        result.put("totalReceived", totalReceived);
        result.put("validLines", valides.size());
        result.put("errorLines", errorLines);
        result.put("duplicates", duplicates);
        result.put("hasErrors", !errors.isEmpty());
        result.put("errors", errors);
        result.put("preview", preview);
        result.put("headers", TEMPLATE_HEADERS);
        return result;
    }

    /**
     * Importe un fichier OPPART. Les lignes invalides et les doublons sont ignorés,
     * chaque ligne Renseignée étant enregistrée en statut EN_COURS et sans token.
     */
    public Map<String, Object> uploadFile(MultipartFile file) {
        Map<String, Object> result = new HashMap<>();
        List<String> errors = new ArrayList<>();
        int count = 0;
        int duplicates = 0;
        int errorLines = 0;
        int totalReceived = 0;
        List<ValidRow> valides = new ArrayList<>();

        try {
            List<Map<String, String>> data = parseImportFile(file);
            totalReceived = data.size();

            // Première passe : parsing et contrôle de format, sans toucher la base.
            for (int i = 0; i < data.size(); i++) {
                Map<String, String> row = data.get(i);
                int lineNumber = i + 2;
                try {
                    OPPARTEntity oppart = buildFromRow(row);
                    if (oppart == null) {
                        continue;
                    }
                    List<String> rowErrors = new ArrayList<>();
                    validateImportRow(oppart, lineNumber, rowErrors);
                    if (!rowErrors.isEmpty()) {
                        errors.addAll(rowErrors);
                        errorLines++;
                        continue;
                    }
                    valides.add(new ValidRow(oppart, lineNumber));
                } catch (Exception e) {
                    errors.add("Ligne " + lineNumber + " : " + e.getMessage());
                    errorLines++;
                }
            }

            // Seconde passe : une requête bornée aux lignes du fichier, puis écriture.
            Set<String> knownKeys = existingRowKeys(valides);
            for (ValidRow valide : valides) {
                OPPARTEntity oppart = valide.oppart;
                try {
                    if (!knownKeys.add(rowKey(oppart))) {
                        duplicates++;
                        continue;
                    }
                    oppart.setStatut(OPPARTEntity.STATUT_EN_COURS);
                    oppart.setToken(null);
                    oppartRepository.save(oppart);
                    count++;
                } catch (Exception e) {
                    errors.add("Ligne " + valide.lineNumber + " : " + e.getMessage());
                    errorLines++;
                }
            }
        } catch (Exception e) {
            errors.add("Erreur lors de la lecture du fichier : " + e.getMessage());
        }

        result.put("success", errorLines == 0);
        result.put("count", count);
        result.put("duplicates", duplicates);
        result.put("errorLines", errorLines);
        result.put("totalReceived", totalReceived);
        result.put("hasErrors", !errors.isEmpty());
        result.put("errors", errors);
        result.put("message", buildImportMessage(count, duplicates, errorLines));
        return result;
    }

    private static String buildImportMessage(int count, int duplicates, int errorLines) {
        StringBuilder sb = new StringBuilder();
        if (count > 0) {
            sb.append(count).append(" ligne(s) OPPART importée(s) avec succès");
            if (duplicates > 0) {
                sb.append(" · ").append(duplicates).append(" doublon(s) ignoré(s)");
            }
        } else if (duplicates > 0) {
            sb.append("Aucune ligne importée : ").append(duplicates)
                    .append(" doublon(s) déjà présent(s), ignoré(s)");
        } else {
            sb.append("0 ligne(s) OPPART importée(s)");
        }
        if (errorLines > 0) {
            sb.append(" · ").append(errorLines).append(" ligne(s) en erreur ignorée(s)");
        }
        return sb.toString();
    }

    /**
     * Génère le modèle XLSX d'import OPPART (en-têtes + une ligne d'exemple).
     */
    public byte[] generateTemplate() throws IOException {
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("OPPART");
            Row header = sheet.createRow(0);
            for (int i = 0; i < TEMPLATE_HEADERS.length; i++) {
                Cell cell = header.createCell(i, CellType.STRING);
                cell.setCellValue(TEMPLATE_HEADERS[i]);
                sheet.setColumnWidth(i, 20 * 256);
            }
            Row example = sheet.createRow(1);
            for (int i = 0; i < TEMPLATE_EXAMPLE.length; i++) {
                example.createCell(i, CellType.STRING).setCellValue(TEMPLATE_EXAMPLE[i]);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        }
    }

    // ===================== Import : parsing =====================

    private List<Map<String, String>> parseImportFile(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IOException("Fichier vide.");
        }
        String name = file.getOriginalFilename();
        if (name == null || name.isBlank()) {
            throw new IOException("Nom de fichier absent.");
        }
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
            return parseCsvFile(file);
        }
        if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
            return parseExcelFile(file);
        }
        throw new IOException("Format non supporté : utilisez un fichier CSV, TSV, XLS ou XLSX.");
    }

    private List<Map<String, String>> parseCsvFile(MultipartFile file) throws IOException {
        List<Map<String, String>> data = new ArrayList<>();
        String content = stripBom(new String(file.getBytes(), java.nio.charset.StandardCharsets.UTF_8));
        // Retire le caractère de fin de fichier Windows qui polluerait la dernière valeur.
        String[] lines = content.split("\\r?\\n");
        if (lines.length == 0) {
            throw new IOException("Fichier vide ou format invalide.");
        }

        String separator = detectSeparator(lines[0]);
        String[] headers = lines[0].split(separator, -1);
        for (int i = 0; i < headers.length; i++) {
            headers[i] = headers[i].trim();
        }

        for (int i = 1; i < lines.length; i++) {
            if (lines[i].trim().isEmpty()) {
                continue;
            }
            String[] values = lines[i].split(separator, -1);
            Map<String, String> row = new HashMap<>();
            for (int j = 0; j < Math.min(headers.length, values.length); j++) {
                row.put(headers[j], values[j].trim());
            }
            data.add(row);
        }
        return data;
    }

    private List<Map<String, String>> parseExcelFile(MultipartFile file) throws IOException {
        List<Map<String, String>> data = new ArrayList<>();
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IOException("Fichier vide ou format invalide.");
            }

            List<String> headers = new ArrayList<>();
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                headers.add(cell != null ? cell.toString().trim() : "Colonne" + i);
            }

            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) {
                    continue;
                }
                Map<String, String> rowData = new HashMap<>();
                for (int j = 0; j < headers.size(); j++) {
                    rowData.put(headers.get(j), readCellAsText(row.getCell(j)));
                }
                if (rowData.values().stream().anyMatch(v -> v != null && !v.isBlank())) {
                    data.add(rowData);
                }
            }
        }
        return data;
    }

    private static String readCellAsText(Cell cell) {
        if (cell == null) {
            return "";
        }
        try {
            if (cell.getCellType() == CellType.NUMERIC) {
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().format(IMPORT_DATE_FORMATTER);
                }
                double value = cell.getNumericCellValue();
                // Évite la notation scientifique pour les grands nombres (identifiants de transaction).
                if (value == Math.rint(value) && !Double.isInfinite(value) && Math.abs(value) < 1e15) {
                    return String.valueOf((long) value);
                }
                return String.valueOf(value);
            }
            if (cell.getCellType() == CellType.STRING) {
                return cell.getStringCellValue().trim();
            }
            if (cell.getCellType() == CellType.BOOLEAN) {
                return String.valueOf(cell.getBooleanCellValue());
            }
            if (cell.getCellType() == CellType.FORMULA) {
                return cell.getCellFormula().trim();
            }
        } catch (Exception e) {
            return cell.toString().trim();
        }
        return cell.toString().trim();
    }

    private static String stripBom(String value) {
        return value.startsWith("\uFEFF") ? value.substring(1) : value;
    }

    /** Séparateur CSV le plus présent sur la ligne d'en-tête. */
    private static String detectSeparator(String headerLine) {
        int comma = count(headerLine, ',');
        int semicolon = count(headerLine, ';');
        int tab = count(headerLine, '\t');
        if (semicolon >= comma && semicolon >= tab) {
            return ";";
        }
        if (tab >= comma && tab >= semicolon) {
            return "\t";
        }
        return ",";
    }

    private static int count(String value, char target) {
        int total = 0;
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) == target) {
                total++;
            }
        }
        return total;
    }

    // ===================== Import : mapping & validation =====================

    /**
     * Construit une entité OPPART depuis une ligne brute du fichier.
     * Retourne null si la ligne ne contient aucune donnée exploitable.
     */
    private OPPARTEntity buildFromRow(Map<String, String> row) {
        String client = valueOf(row, "client");
        String typeOp = valueOf(row, "typeOp");
        String pays = valueOf(row, "pays");
        String source = valueOf(row, "source");
        String idTransaction = valueOf(row, "idTransaction");
        String rawMontant = valueOf(row, "montant");
        LocalDateTime dateOperation = parseImportDate(valueOf(row, "dateOperation"));
        LocalDateTime dateOperationPart = parseImportDate(valueOf(row, "dateOperationPart"));
        LocalDateTime dateDemande = parseImportDate(valueOf(row, "dateDemande"));

        if (isBlank(client) && isBlank(typeOp) && isBlank(pays) && isBlank(idTransaction) && isBlank(rawMontant)) {
            return null;
        }

        OPPARTEntity oppart = new OPPARTEntity();
        oppart.setClient(emptyToNull(client));
        oppart.setTypeOp(emptyToNull(typeOp));
        oppart.setPays(emptyToNull(pays));
        oppart.setSource(emptyToNull(source));
        oppart.setIdTransaction(emptyToNull(idTransaction));
        if (!isBlank(rawMontant)) {
            oppart.setMontant(parseMontant(rawMontant));
        }
        if (dateOperation != null) {
            oppart.setDateOperation(dateOperation);
        }
        if (dateOperationPart != null) {
            oppart.setDateOperationPart(dateOperationPart);
        }
        if (dateDemande != null) {
            oppart.setDateDemande(dateDemande);
        }
        return oppart;
    }

    /** Lit la valeur d'un champ en essayant tous ses alias. */
    private static String valueOf(Map<String, String> row, String field) {
        for (String alias : FIELD_ALIASES.get(field)) {
            for (Map.Entry<String, String> entry : row.entrySet()) {
                if (normalizeHeader(entry.getKey()).equals(normalizeHeader(alias))) {
                    return entry.getValue() == null ? "" : entry.getValue().trim();
                }
            }
        }
        return "";
    }

    /** Minuscules, sans accent et sans ponctuation, pour comparer des en-têtes. */
    private static String normalizeHeader(String value) {
        if (value == null) {
            return "";
        }
        String noAccents = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        return noAccents.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String emptyToNull(String value) {
        return isBlank(value) ? null : value;
    }

    /** Accepte 1500.5, 1 500,50, "1 500,50" et les montants négatifs. */
    private static BigDecimal parseMontant(String raw) {
        String cleaned = raw.replace(" ", "").replace("\u00a0", "").replace("'", "");
        if (cleaned.isEmpty()) {
            return null;
        }
        // Format anglo-saisir (1,500.50) : le point est le séparateur décimal.
        if (cleaned.matches("-?\\d{1,3}(\\.\\d{3})+,\\d+")) {
            cleaned = cleaned.replace(".", "").replace(',', '.');
        } else {
            // Format français : la virgule est le séparateur décimal.
            cleaned = cleaned.replace(',', '.');
        }
        return new BigDecimal(cleaned);
    }

    /**
     * Accepte les dates sérialisées Excel, ainsi que JJ/MM/AAAA, AAAA-MM-JJ et
     * leurs variantes avec heure, séparateurs '-' ou '/'. L'année est repérée par son
     * groupe de 4 chiffres : si elle est en tête, le format est AAAA/MM/JJ, sinon
     * c'est JJ/MM/AAAA (convention française).
     */
    private static LocalDateTime parseImportDate(String raw) {
        if (isBlank(raw)) {
            return null;
        }
        String value = raw.trim();

        // Formats explicites : dates compactes, mois alphabetique, ISO, JJ/MM/AAAA.
        for (DateTimeFormatter format : IMPORT_DATE_FORMATS) {
            try {
                return toDateTime(format.parse(value));
            } catch (DateTimeParseException e) {
                // format non applicable, on essaie le suivant
            }
        }

        // Date Excel serialisee (nombre de jours depuis le 30/12/1899).
        if (value.matches("^\\d+(\\.\\d+)?$")) {
            try {
                double serial = Double.parseDouble(value);
                if (serial < 1d || serial > EXCEL_SERIAL_MAX) {
                    return null;
                }
                return org.apache.poi.ss.usermodel.DateUtil.getLocalDateTime(serial);
            } catch (Exception e) {
                return null;
            }
        }

        try {
            List<Integer> numbers = new ArrayList<>();
            for (String token : value.split("[^0-9]+")) {
                if (!token.isEmpty()) {
                    if (token.length() > 4) {
                        return null;
                    }
                    numbers.add(Integer.parseInt(token));
                }
            }
            if (numbers.size() < 3) {
                return null;
            }

            int yearIndex = -1;
            for (int i = 0; i < numbers.size(); i++) {
                if (String.valueOf(numbers.get(i)).length() == 4) {
                    yearIndex = i;
                    break;
                }
            }

            int year;
            int month;
            int day;
            int timeStart;
            if (yearIndex == 0) {
                year = numbers.get(0);
                month = numbers.get(1);
                day = numbers.get(2);
                timeStart = 3;
            } else if (yearIndex >= 2) {
                day = numbers.get(0);
                month = numbers.get(1);
                year = numbers.get(yearIndex);
                timeStart = yearIndex + 1;
            } else {
                return null;
            }

            int hour = timeStart < numbers.size() ? numbers.get(timeStart) : 0;
            int minute = timeStart + 1 < numbers.size() ? numbers.get(timeStart + 1) : 0;
            int second = timeStart + 2 < numbers.size() ? Math.min(numbers.get(timeStart + 2), 59) : 0;

            return LocalDateTime.of(year, month, day, Math.min(hour, 23), Math.min(minute, 59), second);
        } catch (Exception e) {
            return null;
        }
    }

    private static void validateImportRow(OPPARTEntity oppart, int lineNumber, List<String> errors) {
        if (isBlank(oppart.getClient())) {
            errors.add("Ligne " + lineNumber + " : champ obligatoire manquant → 'Client'");
        }
        if (isBlank(oppart.getTypeOp())) {
            errors.add("Ligne " + lineNumber + " : champ obligatoire manquant → 'Type_OP'");
        }
        if (isBlank(oppart.getPays())) {
            errors.add("Ligne " + lineNumber + " : champ obligatoire manquant → 'Pays'");
        }
        if (oppart.getMontant() == null) {
            errors.add("Ligne " + lineNumber + " : champ obligatoire manquant ou invalide → 'Montant'");
        }
        if (oppart.getDateOperation() == null) {
            errors.add("Ligne " + lineNumber + " : champ obligatoire manquant ou date illisible → 'Date opération BO'");
        }
    }

    /**
     * Clé d'identification d'une ligne, utilisée pour détecter les doublons
     * (en base et à l'intérieur du fichier importé).
     */
    private static String rowKey(OPPARTEntity oppart) {
        return String.join("|",
                normalizeForKey(oppart.getClient()),
                normalizeForKey(oppart.getTypeOp()),
                normalizeForKey(oppart.getPays()),
                oppart.getMontant() == null ? "" : oppart.getMontant().stripTrailingZeros().toPlainString(),
                duplicateDateKey(oppart),
                normalizeForKey(oppart.getIdTransaction()));
    }

    /**
     * Partie date de la clé de doublon.
     * L'import accepte des dates sans heure ({@code 20260908}) comme avec heure
     * ({@code 20260908 16:44:52}) : comparer le datetime complet laissait passer
     * ces doublons. L'identifiant de transaction faisant foi, on compare au jour.
     * Sans identifiant de transaction, l'heure est conservée pour ne pas fusionner
     * deux opérations légitimes et distinctes du même jour.
     */
    private static String duplicateDateKey(OPPARTEntity oppart) {
        if (oppart.getDateOperation() == null) {
            return "";
        }
        LocalDateTime date = oppart.getDateOperation();
        if (isBlank(oppart.getIdTransaction())) {
            return date.format(DUPLICATE_DATE_TIME_FORMATTER);
        }
        return date.format(DUPLICATE_DATE_FORMATTER);
    }

    private static String normalizeForKey(String value) {
        return isBlank(value) ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Clés des lignes déjà présentes en base.
     *
     * Ne charge plus toute la table : interroge uniquement les lignes susceptibles de
     * correspondre aux lignes du fichier, par identifiant de transaction, ou à défaut
     * par client et par jour. La taille de la requête est bornée par la taille du
     * fichier, donc la mémoire ne dépend plus du volume déjà en base.
     *
     * Les prédicats SQL sont volontairement permissifs : un faux positif est corrigé
     * en Java par rowKey(), alors qu'un faux négatif laisserait passer un doublon.
     * UPPER(TRIM(...)) reproduit exactement normalizeForKey() — la collation de la
     * colonne ignore la casse mais pas les espaces finaux, que Java, lui, supprime.
     */
    private Set<String> existingRowKeys(List<ValidRow> valides) {
        Set<String> keys = new HashSet<>();
        if (valides == null || valides.isEmpty()) {
            return keys;
        }

        Set<String> ids = new LinkedHashSet<>();
        Set<String> clients = new LinkedHashSet<>();
        LocalDateTime min = null;
        LocalDateTime max = null;
        for (ValidRow valide : valides) {
            OPPARTEntity oppart = valide.oppart;
            String id = normalizeForKey(oppart.getIdTransaction());
            if (!id.isEmpty()) {
                ids.add(id);
                continue;
            }
            String client = normalizeForKey(oppart.getClient());
            if (!client.isEmpty()) {
                clients.add(client);
            }
            LocalDateTime date = oppart.getDateOperation();
            if (date != null) {
                min = (min == null || date.isBefore(min)) ? date : min;
                max = (max == null || date.isAfter(max)) ? date : max;
            }
        }

        for (List<String> lot : partitionner(new ArrayList<>(ids), DUP_QUERY_BATCH)) {
            for (OPPARTEntity existing : oppartRepository.findByNormalizedIdTransactions(lot)) {
                keys.add(rowKey(existing));
            }
        }

        if (!clients.isEmpty() && min != null && max != null) {
            LocalDateTime debut = min.toLocalDate().atStartOfDay();
            LocalDateTime fin = max.toLocalDate().plusDays(1).atStartOfDay();
            for (OPPARTEntity existing : oppartRepository.findByNormalizedClientsAndDates(new ArrayList<>(clients), debut, fin)) {
                keys.add(rowKey(existing));
            }
        }
        return keys;
    }

    /**
     * Verifie un lot de lignes concernees, sans charger la table.
     *
     * Resolution par identifiant de transaction, puis complétion par le groupe de
     * correspondance via le token partagé. Le repli par montant + jour + client a
     * ete retire : les deux jambes d'une compensation n'ont ni le meme montant ni
     * la meme date (une ligne source=BO peut grouper plusieurs lignes partenaires et
     * porter sa propre date comptable), ce repli produisait des faux positifs.
     * Le statut retenu est celui du groupe de correspondance complet : une
     * compensation dont une seule jambe n'est pas OK n'est pas certifiable.
     */
    public List<OPPARTVerificationResultDto> verifierLignes(List<OPPARTVerificationLigneRequest> lignes) {
        List<OPPARTVerificationResultDto> resultats = new ArrayList<>();
        if (lignes == null || lignes.isEmpty()) {
            return resultats;
        }

        Set<String> ids = new LinkedHashSet<>();
        for (OPPARTVerificationLigneRequest ligne : lignes) {
            String id = normalizeForKey(ligne.getNumeroTransGu());
            if (!id.isEmpty()) {
                ids.add(id);
            }
        }

        Map<String, OPPARTEntity> parId = new HashMap<>();
        for (List<String> lot : partitionner(new ArrayList<>(ids), DUP_QUERY_BATCH)) {
            for (OPPARTEntity oppart : oppartRepository.findByNormalizedIdTransactions(lot)) {
                String cle = normalizeForKey(oppart.getIdTransaction());
                OPPARTEntity dejaVu = parId.get(cle);
                if (dejaVu == null || estOk(oppart) && !estOk(dejaVu)) {
                    parId.put(cle, oppart);
                }
            }
        }

        Map<Integer, OPPARTEntity> resolues = new HashMap<>();
        for (int i = 0; i < lignes.size(); i++) {
            OPPARTEntity trouvee = parId.get(normalizeForKey(lignes.get(i).getNumeroTransGu()));
            if (trouvee != null) {
                resolues.put(i, trouvee);
            }
        }

        Set<String> tokens = new LinkedHashSet<>();
        for (OPPARTEntity oppart : resolues.values()) {
            String token = normalizeForKey(oppart.getToken());
            if (!token.isEmpty()) {
                tokens.add(token);
            }
        }

        Map<String, List<OPPARTEntity>> groupes = new HashMap<>();
        for (List<String> lot : partitionner(new ArrayList<>(tokens), DUP_QUERY_BATCH)) {
            for (OPPARTEntity oppart : oppartRepository.findByNormalizedTokens(lot)) {
                String cle = normalizeForKey(oppart.getToken());
                if (!cle.isEmpty()) {
                    groupes.computeIfAbsent(cle, k -> new ArrayList<>()).add(oppart);
                }
            }
        }

        for (int i = 0; i < lignes.size(); i++) {
            OPPARTVerificationLigneRequest ligne = lignes.get(i);
            OPPARTEntity trouvee = resolues.get(i);
            OPPARTVerificationResultDto dto = new OPPARTVerificationResultDto();
            dto.setNumeroTransGu(ligne.getNumeroTransGu());
            if (trouvee == null) {
                dto.setTrouve(false);
                dto.setMotif(motifIntrouvable(ligne));
                resultats.add(dto);
                continue;
            }
            List<OPPARTEntity> groupe = groupes.get(normalizeForKey(trouvee.getToken()));
            dto.setTrouve(true);
            dto.setMode(OPPARTVerificationResultDto.MODE_ID_TRANSGU);
            dto.setId(trouvee.getId());
            dto.setTypeOp(trouvee.getTypeOp());
            dto.setMontant(trouvee.getMontant());
            dto.setDateOperation(trouvee.getDateOperation() != null
                    ? trouvee.getDateOperation().toString() : null);
            dto.setClient(trouvee.getClient());
            dto.setToken(trouvee.getToken());
            dto.setStatut(statutGroupe(trouvee, groupe));
            if (dto.getStatut() == null) {
                dto.setStatut(OPPARTEntity.STATUT_EN_COURS);
            }
            resultats.add(dto);
        }
        return resultats;
    }

    /**
     * Statut retenu pour une compensation : OK uniquement si toutes les lignes de la
     * correspondance le sont. A defaut, le statut le plus bloqueur du groupe.
     */
    private static String statutGroupe(OPPARTEntity trouvee, List<OPPARTEntity> groupe) {
        if (groupe == null || groupe.isEmpty()) {
            return trouvee.getStatut();
        }
        boolean tousOk = true;
        String bloqueur = null;
        for (OPPARTEntity membre : groupe) {
            if (!estOk(membre)) {
                tousOk = false;
                if (bloqueur == null) {
                    bloqueur = membre.getStatut();
                }
            }
        }
        if (tousOk) {
            return OPPARTEntity.STATUT_OK;
        }
        return bloqueur != null ? bloqueur : trouvee.getStatut();
    }

    private static String motifIntrouvable(OPPARTVerificationLigneRequest ligne) {
        if (normalizeForKey(ligne.getNumeroTransGu()).isEmpty()) {
            return "N° trans GU absent de la ligne";
        }
        return "Aucune ligne OPPART ne porte ce N° trans GU : le rapprochement se fait sur l'identifiant, "
                + "qui doit correspondre exactement à celui d'une ligne OPPART";
    }

    private static boolean estOk(OPPARTEntity oppart) {
        return OPPARTEntity.STATUT_OK.equalsIgnoreCase(oppart.getStatut());
    }

    /** Découpe une liste en lots, pour ne pas envoyer un IN gigante à MySQL. */
    private static <T> List<List<T>> partitionner(List<T> items, int taille) {
        List<List<T>> lots = new ArrayList<>();
        for (int i = 0; i < items.size(); i += taille) {
            lots.add(items.subList(i, Math.min(items.size(), i + taille)));
        }
        return lots;
    }

    /** Une ligne valide du fichier, avec son numéro pour le rapport d'erreurs. */
    private static final class ValidRow {
        private final OPPARTEntity oppart;
        private final int lineNumber;

        ValidRow(OPPARTEntity oppart, int lineNumber) {
            this.oppart = oppart;
            this.lineNumber = lineNumber;
        }
    }

    private static Map<String, String> previewRow(OPPARTEntity oppart, int lineNumber, boolean hasError) {
        Map<String, String> preview = new HashMap<>();
        preview.put("line", String.valueOf(lineNumber));
        preview.put("client", oppart == null || oppart.getClient() == null ? "" : oppart.getClient());
        preview.put("typeOp", oppart == null || oppart.getTypeOp() == null ? "" : oppart.getTypeOp());
        preview.put("montant", oppart == null || oppart.getMontant() == null ? "" : oppart.getMontant().toPlainString());
        preview.put("date", oppart == null || oppart.getDateOperation() == null
                ? "" : oppart.getDateOperation().format(IMPORT_DATE_FORMATTER));
        preview.put("dateOperationPart", oppart == null || oppart.getDateOperationPart() == null
                ? "" : oppart.getDateOperationPart().format(IMPORT_DATE_FORMATTER));
        preview.put("dateDemande", oppart == null || oppart.getDateDemande() == null
                ? "" : oppart.getDateDemande().format(IMPORT_DATE_FORMATTER));
        preview.put("idTransaction", oppart == null || oppart.getIdTransaction() == null ? "" : oppart.getIdTransaction());
        preview.put("pays", oppart == null || oppart.getPays() == null ? "" : oppart.getPays());
        preview.put("source", oppart == null || oppart.getSource() == null ? "" : oppart.getSource());
        preview.put("status", hasError ? "ERREUR" : "OK");
        return preview;
    }

    /**
     * Lie les lignes de compense par N° Trans GU.
     * Pour chaque transGu, cherche 1 ligne BO (COMPENSE_BO) et 1 ligne Partenaire (contenant "COMPENSE" ou "PARTNER" dans typeOp).
     * Lie chaque paire trouvée avec un token généré (statut -> OK).
     * Retourne un résumé : { success, linkedCount, skipped, details: [...] }
     */
    public Map<String, Object> linkCompensesByTransGu(List<String> transGus) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> details = new ArrayList<>();
        int linkedCount = 0;
        int skippedCount = 0;

        if (transGus == null || transGus.isEmpty()) {
            result.put("success", false);
            result.put("message", "Aucun N° Trans GU fourni.");
            return result;
        }

        // Normaliser les transGus (uppercase, trim)
        Set<String> normalizedTransGus = new LinkedHashSet<>();
        for (String t : transGus) {
            if (t != null && !t.isBlank()) {
                normalizedTransGus.add(normalizeForKey(t));
            }
        }

        // Recherche par lots pour éviter les IN trop gros
        for (List<String> batch : partitionner(new ArrayList<>(normalizedTransGus), DUP_QUERY_BATCH)) {
            List<OPPARTEntity> candidates = oppartRepository.findByNormalizedIdTransactions(batch);

            // Grouper par transGu normalisé
            Map<String, List<OPPARTEntity>> byTransGu = new HashMap<>();
            for (OPPARTEntity op : candidates) {
                String key = normalizeForKey(op.getIdTransaction());
                if (!key.isEmpty()) {
                    byTransGu.computeIfAbsent(key, k -> new ArrayList<>()).add(op);
                }
            }

            // Pour chaque transGu demandé, chercher la paire BO + Partenaire
            for (String transGu : batch) {
                List<OPPARTEntity> group = byTransGu.get(transGu);
                Map<String, Object> detail = new HashMap<>();
                detail.put("transGu", transGu);

                if (group == null || group.isEmpty()) {
                    detail.put("status", "NOT_FOUND");
                    detail.put("message", "Aucune ligne OPPART avec ce N° Trans GU");
                    skippedCount++;
                    details.add(detail);
                    continue;
                }

                // Séparer BO et Partenaire
                OPPARTEntity ligneBo = null;
                OPPARTEntity lignePartner = null;

                for (OPPARTEntity op : group) {
                    String typeOp = (op.getTypeOp() == null ? "" : op.getTypeOp().toUpperCase());
                    if (typeOp.contains("BO") && typeOp.contains("COMPENS")) {
                        ligneBo = op;
                    } else if (typeOp.contains("COMPENS") || typeOp.contains("PARTNER")) {
                        // Priorité à la première ligne partenaire trouvée
                        if (lignePartner == null) {
                            lignePartner = op;
                        }
                    }
                }

                if (ligneBo == null || lignePartner == null) {
                    detail.put("status", "INCOMPLETE_PAIR");
                    detail.put("message", "Paire BO/Partenaire incomplète (BO: " + (ligneBo != null) + ", Partner: " + (lignePartner != null) + ")");
                    detail.put("foundCount", group.size());
                    skippedCount++;
                    details.add(detail);
                    continue;
                }

                // Vérifier si déjà liées (même token)
                if (ligneBo.getToken() != null && ligneBo.getToken().equals(lignePartner.getToken())) {
                    detail.put("status", "ALREADY_LINKED");
                    detail.put("token", ligneBo.getToken());
                    detail.put("message", "Déjà liées");
                    skippedCount++;
                    details.add(detail);
                    continue;
                }

                // Lier la paire
                List<Long> ids = List.of(ligneBo.getId(), lignePartner.getId());
                List<OPPARTEntity> linked = linkOpparts(ids, null); // token auto-généré

                if (linked != null && linked.size() == 2) {
                    detail.put("status", "LINKED");
                    detail.put("token", linked.get(0).getToken());
                    detail.put("ids", List.of(ligneBo.getId(), lignePartner.getId()));
                    linkedCount++;
                } else {
                    detail.put("status", "ERROR");
                    detail.put("message", "Échec liaison");
                    skippedCount++;
                }
                details.add(detail);
            }
        }

        result.put("success", true);
        result.put("linkedCount", linkedCount);
        result.put("skippedCount", skippedCount);
        result.put("totalRequested", normalizedTransGus.size());
        result.put("details", details);
        return result;
    }
}