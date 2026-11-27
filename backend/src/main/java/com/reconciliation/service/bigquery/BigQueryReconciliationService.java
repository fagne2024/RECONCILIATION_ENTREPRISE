package com.reconciliation.service.bigquery;

import com.reconciliation.entity.BigQueryConfigEntity;
import com.reconciliation.entity.BigQueryExtractEntity;
import com.reconciliation.entity.BigQueryQueryEntity;
import com.reconciliation.repository.BigQueryConfigRepository;
import com.reconciliation.repository.BigQueryExtractRepository;
import com.reconciliation.repository.BigQueryQueryRepository;
import com.reconciliation.service.EntrepriseWatchFolderService;
import com.reconciliation.service.sharepoint.SecretCipher;
import com.reconciliation.tenant.TenantContext;
import com.reconciliation.util.HeuresLancement;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Source BigQuery pour la réconciliation.
 *
 * <ul>
 *   <li>Une <b>extraction</b> exécute une requête (paramètre {@code @date} = date des opérations,
 *       la veille par défaut) et écrit le résultat en CSV côté serveur, nommé
 *       {@code <préfixe>_BQ_<aaaammjj>.csv} pour être reconnu par le modèle BO.</li>
 *   <li>Aux heures configurées, les extractions de la veille sont <b>préparées automatiquement</b> ;
 *       dans le Lanceur, l'utilisateur les charge d'un clic comme fichier BO, avec les fichiers
 *       partenaires du sous-dossier du dossier surveillé, puis lance la réconciliation.</li>
 *   <li>Un lancement manuel exécute la requête à l'instant T pour la date choisie.</li>
 * </ul>
 */
@Service
@Slf4j
public class BigQueryReconciliationService {

    private static final Pattern PREFIX = Pattern.compile("^[A-Za-z0-9_-]{1,50}$");
    private static final Pattern SUBFOLDER = Pattern.compile("^[A-Za-z0-9 _-]{1,100}$");
    private static final Pattern PROJECT = Pattern.compile("^[a-z0-9.:-]{1,200}$");
    private static final Pattern LOCATION = Pattern.compile("^[A-Za-z0-9-]{0,100}$");
    private static final Pattern LEADING_COMMENTS = Pattern.compile("^(\\s*(--[^\\n]*\\n|/\\*.*?\\*/))*\\s*", Pattern.DOTALL);
    private static final Pattern PARTNER_FILE = Pattern.compile("(?i).+\\.(csv|xlsx|xls)$");
    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
    private static final int KEEP_EXTRACTS = 10;
    private static final long MAX_PARTNER_BYTES = 300L * 1024 * 1024;

    private final BigQueryConfigRepository configRepository;
    private final BigQueryQueryRepository queryRepository;
    private final BigQueryExtractRepository extractRepository;
    private final BigQueryClient client;
    private final SecretCipher cipher;
    private final EntrepriseWatchFolderService watchFolderService;
    private final JdbcTemplate jdbcTemplate;
    private final boolean schedulerEnabled;
    private final Path extractRoot;

    private final Set<Long> running = ConcurrentHashMap.newKeySet();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "bigquery-extract");
        t.setDaemon(true);
        return t;
    });

    public BigQueryReconciliationService(BigQueryConfigRepository configRepository,
                                         BigQueryQueryRepository queryRepository,
                                         BigQueryExtractRepository extractRepository,
                                         BigQueryClient client,
                                         SecretCipher cipher,
                                         EntrepriseWatchFolderService watchFolderService,
                                         JdbcTemplate jdbcTemplate,
                                         @Value("${bigquery.scheduler-enabled:true}") boolean schedulerEnabled,
                                         @Value("${bigquery.extract-dir:${app.watch-folder.path:../watch-folder}-bigquery}") String extractDir) {
        this.configRepository = configRepository;
        this.queryRepository = queryRepository;
        this.extractRepository = extractRepository;
        this.client = client;
        this.cipher = cipher;
        this.watchFolderService = watchFolderService;
        this.jdbcTemplate = jdbcTemplate;
        this.schedulerEnabled = schedulerEnabled;
        this.extractRoot = Paths.get(extractDir).toAbsolutePath().normalize();
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    // ================================================================ DTO

    public record ConfigView(boolean enabled, String heuresExecution, String projectId, String location,
                             String serviceAccountEmail, boolean cleDefinie, String partnerSubfolder, int maxRows,
                             String dossierPartenaires, LocalDateTime lastAutoRunAt, LocalDateTime prochainLancement,
                             boolean schedulerActif, LocalDateTime updatedAt, String updatedBy) {}

    public record ConfigRequest(Boolean enabled, String heuresExecution, String projectId, String location,
                                String serviceAccountJson, Boolean effacerCle, String partnerSubfolder,
                                Integer maxRows) {}

    public record QueryRequest(String libelle, String sqlText, String boFilePrefix, Boolean enabled) {}

    public record DryRunView(List<String> colonnes, long octetsLus, String fichierBo) {}

    /** Extraction prête pour le Lanceur (dernière extraction réussie d'une requête active). */
    public record ReadyExtract(Long extractId, Long queryId, String libelle, String fileName, LocalDate dateParam,
                               long rowCount, Long fileBytes, LocalDateTime preparedAt, String declencheur) {}

    public record PartnerFile(String fileName, long size, LocalDateTime lastModified) {}

    /** Fichier à renvoyer au navigateur. */
    public record Download(String fileName, byte[] content) {}

    // ======================================================== Configuration

    public ConfigView getConfig() {
        return toView(configRepository.findFirstByOrderByIdAsc().orElseGet(BigQueryConfigEntity::new));
    }

    public ConfigView saveConfig(ConfigRequest req, String username) {
        if (req == null) throw new IllegalArgumentException("Configuration absente.");
        BigQueryConfigEntity c = configRepository.findFirstByOrderByIdAsc().orElseGet(BigQueryConfigEntity::new);
        boolean wasEnabled = Boolean.TRUE.equals(c.getEnabled());
        String oldHeures = c.getHeuresExecution();

        String heures = HeuresLancement.normalize(req.heuresExecution());
        String project = trimToNull(req.projectId());
        String location = trimToNull(req.location());
        String subfolder = defaultIfBlank(req.partnerSubfolder(), "partenaires");
        if (project != null && !PROJECT.matcher(project).matches()) {
            throw new IllegalArgumentException("ID de projet Google Cloud invalide.");
        }
        if (location != null && !LOCATION.matcher(location).matches()) {
            throw new IllegalArgumentException("Région invalide (ex. EU, US, europe-west1).");
        }
        if (!SUBFOLDER.matcher(subfolder).matches()) {
            throw new IllegalArgumentException("Nom de sous-dossier invalide (lettres, chiffres, espace, _ et - uniquement).");
        }
        int maxRows = req.maxRows() == null ? 1_000_000 : req.maxRows();
        if (maxRows < 1 || maxRows > 5_000_000) {
            throw new IllegalArgumentException("Limite de lignes entre 1 et 5 000 000.");
        }

        if (Boolean.TRUE.equals(req.effacerCle())) {
            c.setServiceAccountEnc(null);
            c.setServiceAccountEmail(null);
        } else if (req.serviceAccountJson() != null && !req.serviceAccountJson().isBlank()) {
            String json = req.serviceAccountJson().trim();
            if (json.length() > 20_000) throw new IllegalArgumentException("Clé JSON trop volumineuse.");
            BigQueryClient.ServiceAccount sa = client.parseServiceAccount(json);
            c.setServiceAccountEnc(cipher.encrypt(json));
            c.setServiceAccountEmail(sa.clientEmail());
            if (project == null) project = sa.projectId();
        }
        c.setHeuresExecution(heures);
        c.setProjectId(project);
        c.setLocation(location);
        c.setPartnerSubfolder(subfolder);
        c.setMaxRows(maxRows);
        boolean enabled = Boolean.TRUE.equals(req.enabled());
        if (enabled && (project == null || c.getServiceAccountEnc() == null)) {
            throw new IllegalArgumentException("Renseignez le projet et la clé du compte de service avant d'activer la préparation automatique.");
        }
        c.setEnabled(enabled);
        if (enabled && (!wasEnabled || !heures.equals(oldHeures))) {
            c.setLastAutoRunAt(LocalDateTime.now());
        }
        c.setUpdatedAt(LocalDateTime.now());
        c.setUpdatedBy(trimToNull(username));
        return toView(configRepository.save(c));
    }

    public void testConnexion() {
        client.checkCredentials(context().serviceAccount());
    }

    private ConfigView toView(BigQueryConfigEntity c) {
        LocalDateTime next = null;
        if (Boolean.TRUE.equals(c.getEnabled())) {
            try {
                next = HeuresLancement.nextSlot(HeuresLancement.parse(c.getHeuresExecution()), LocalDateTime.now(),
                        c.getLastAutoRunAt());
            } catch (IllegalArgumentException ignored) { }
        }
        String dossier = null;
        try {
            dossier = partnerFolder(c).toString();
        } catch (RuntimeException ignored) { }
        return new ConfigView(Boolean.TRUE.equals(c.getEnabled()), c.getHeuresExecution(), c.getProjectId(),
                c.getLocation(), c.getServiceAccountEmail(), c.getServiceAccountEnc() != null, c.getPartnerSubfolder(),
                c.getMaxRows() == null ? 1_000_000 : c.getMaxRows(), dossier, c.getLastAutoRunAt(), next,
                schedulerEnabled, c.getUpdatedAt(), c.getUpdatedBy());
    }

    // ================================================================ Requêtes

    public List<BigQueryQueryEntity> listQueries() {
        return queryRepository.findAllByOrderByIdAsc();
    }

    public BigQueryQueryEntity createQuery(QueryRequest req) {
        BigQueryQueryEntity q = new BigQueryQueryEntity();
        q.setCreatedAt(LocalDateTime.now());
        apply(q, req);
        return queryRepository.save(q);
    }

    public BigQueryQueryEntity updateQuery(Long id, QueryRequest req) {
        BigQueryQueryEntity q = findQuery(id);
        apply(q, req);
        return queryRepository.save(q);
    }

    public void deleteQuery(Long id) {
        queryRepository.delete(findQuery(id));
    }

    private void apply(BigQueryQueryEntity q, QueryRequest req) {
        if (req == null) throw new IllegalArgumentException("Requête absente.");
        String libelle = trimToNull(req.libelle());
        String sql = req.sqlText() == null ? null : req.sqlText().trim();
        String prefix = trimToNull(req.boFilePrefix());
        if (libelle == null || libelle.length() > 150) throw new IllegalArgumentException("Libellé obligatoire (150 caractères au plus).");
        if (sql == null || sql.isEmpty()) throw new IllegalArgumentException("La requête SQL est obligatoire.");
        if (sql.length() > 60_000) throw new IllegalArgumentException("Requête SQL trop longue.");
        checkReadOnly(sql);
        if (prefix == null || !PREFIX.matcher(prefix).matches()) {
            throw new IllegalArgumentException("Préfixe du fichier BO invalide (lettres, chiffres, _ et -), ex. TRXBO.");
        }
        q.setLibelle(libelle);
        q.setSqlText(sql);
        q.setBoFilePrefix(prefix.toUpperCase(Locale.ROOT));
        q.setEnabled(req.enabled() == null || req.enabled());
        q.setUpdatedAt(LocalDateTime.now());
    }

    /** Seules les requêtes de lecture (SELECT / WITH) sont acceptées. */
    static void checkReadOnly(String sql) {
        String body = LEADING_COMMENTS.matcher(sql).replaceFirst("").toUpperCase(Locale.ROOT);
        if (!(body.startsWith("SELECT") || body.startsWith("WITH") || body.startsWith("("))) {
            throw new IllegalArgumentException("Seules les requêtes de lecture (SELECT ou WITH) sont autorisées.");
        }
        String noTrailing = sql.trim().replaceAll(";\\s*$", "");
        if (noTrailing.contains(";")) {
            throw new IllegalArgumentException("Une seule instruction SQL est autorisée.");
        }
    }

    /** Vérification à blanc (gratuite) d'une requête enregistrée. */
    public DryRunView dryRun(Long queryId, LocalDate date) {
        BigQueryQueryEntity q = findQuery(queryId);
        Ctx ctx = context();
        LocalDate d = date == null ? LocalDate.now().minusDays(1) : date;
        BigQueryClient.DryRun r = client.dryRun(ctx.serviceAccount(), ctx.project(), ctx.location(), q.getSqlText(), d);
        return new DryRunView(r.columns(), r.bytesProcessed(), fileName(q, d));
    }

    // ============================================================ Extractions

    /**
     * Extraction à l'instant T (lancement manuel) pour une requête et une date.
     *
     * @throws IllegalStateException si une extraction est déjà en cours pour l'entreprise
     */
    public BigQueryExtractEntity extractNow(Long queryId, LocalDate date, String username) {
        Long entrepriseId = TenantContext.get();
        if (!running.add(entrepriseId)) {
            throw new IllegalStateException("Une extraction BigQuery est déjà en cours, réessayez dans quelques instants.");
        }
        try {
            BigQueryQueryEntity q = findQuery(queryId);
            Ctx ctx = context();
            LocalDate d = date == null ? LocalDate.now().minusDays(1) : date;
            return extract(ctx, q, d, BigQueryExtractEntity.DECLENCHEUR_MANUEL, username);
        } finally {
            running.remove(entrepriseId);
        }
    }

    private BigQueryExtractEntity extract(Ctx ctx, BigQueryQueryEntity q, LocalDate date, String declencheur,
                                          String username) {
        BigQueryExtractEntity e = new BigQueryExtractEntity();
        e.setQueryId(q.getId());
        e.setQueryLibelle(q.getLibelle());
        e.setDateParam(date);
        e.setDeclencheur(declencheur);
        e.setUtilisateur(limit(username, 255));
        e.setStartedAt(LocalDateTime.now());
        e.setStatus(BigQueryExtractEntity.STATUS_EN_COURS);
        e = extractRepository.save(e);

        String name = fileName(q, date);
        Path dir = queryFolder(q.getId());
        Path tmp = dir.resolve(name + ".part-" + e.getId());
        try {
            Files.createDirectories(dir);
            long rows;
            try (Writer w = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
                rows = client.run(ctx.serviceAccount(), ctx.project(), ctx.location(), q.getSqlText(), date,
                        ctx.maxRows(), new CsvSink(w));
            }
            Path target = dir.resolve(name);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            e.setStatus(BigQueryExtractEntity.STATUS_OK);
            e.setRowCount(rows);
            e.setFileName(name);
            e.setFileBytes(Files.size(target));
            e.setMessage(rows == 0 ? "Aucune ligne renvoyée pour le " + date + "." : null);
        } catch (Exception ex) {
            e.setStatus(BigQueryExtractEntity.STATUS_ERREUR);
            e.setMessage(limit(ex instanceof BigQueryClient.BigQueryException || ex instanceof IllegalArgumentException
                    ? ex.getMessage()
                    : "Erreur inattendue : " + ex.getClass().getSimpleName()
                        + (ex.getMessage() != null ? " (" + ex.getMessage() + ")" : ""), 4000));
            if (!(ex instanceof BigQueryClient.BigQueryException)) {
                log.error("Extraction BigQuery « {} » : {}", q.getLibelle(), ex.getMessage(), ex);
            }
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) { }
        }
        e.setEndedAt(LocalDateTime.now());
        e = extractRepository.save(e);
        purgeOldExtracts(q.getId());
        return e;
    }

    /** Ne garde que les derniers fichiers d'une requête (les lignes d'historique restent). */
    private void purgeOldExtracts(Long queryId) {
        List<BigQueryExtractEntity> ok = extractRepository.findByQueryIdAndStatusOrderByStartedAtDescIdDesc(
                queryId, BigQueryExtractEntity.STATUS_OK);
        Set<String> keep = new java.util.HashSet<>();
        for (int i = 0; i < ok.size() && keep.size() < KEEP_EXTRACTS; i++) {
            if (ok.get(i).getFileName() != null) keep.add(ok.get(i).getFileName());
        }
        Path dir = queryFolder(queryId);
        if (!Files.isDirectory(dir)) return;
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.csv")) {
            for (Path f : files) {
                if (!keep.contains(f.getFileName().toString())) Files.deleteIfExists(f);
            }
        } catch (IOException ex) {
            log.warn("Nettoyage des extractions BigQuery ({}) : {}", dir, ex.getMessage());
        }
    }

    /** Dernière extraction réussie (fichier toujours présent) de chaque requête active. */
    public List<ReadyExtract> readyExtracts() {
        List<ReadyExtract> out = new ArrayList<>();
        for (BigQueryQueryEntity q : queryRepository.findByEnabledTrueOrderByIdAsc()) {
            for (BigQueryExtractEntity e : extractRepository.findByQueryIdAndStatusOrderByStartedAtDescIdDesc(
                    q.getId(), BigQueryExtractEntity.STATUS_OK)) {
                if (e.getFileName() != null && Files.isRegularFile(queryFolder(q.getId()).resolve(e.getFileName()))) {
                    out.add(new ReadyExtract(e.getId(), q.getId(), q.getLibelle(), e.getFileName(), e.getDateParam(),
                            e.getRowCount() == null ? 0 : e.getRowCount(), e.getFileBytes(),
                            e.getEndedAt() != null ? e.getEndedAt() : e.getStartedAt(), e.getDeclencheur()));
                    break;
                }
            }
        }
        return out;
    }

    public Download downloadExtract(Long extractId) throws IOException {
        BigQueryExtractEntity e = extractRepository.findById(extractId)
                .orElseThrow(() -> new NoSuchElementException("Extraction introuvable."));
        if (!BigQueryExtractEntity.STATUS_OK.equals(e.getStatus()) || e.getFileName() == null || e.getQueryId() == null) {
            throw new NoSuchElementException("Extraction sans fichier.");
        }
        Path f = queryFolder(e.getQueryId()).resolve(e.getFileName()).normalize();
        if (!f.startsWith(queryFolder(e.getQueryId())) || !Files.isRegularFile(f)) {
            throw new NoSuchElementException("Fichier d'extraction supprimé : relancez l'extraction.");
        }
        return new Download(e.getFileName(), Files.readAllBytes(f));
    }

    public List<BigQueryExtractEntity> history() {
        return extractRepository.findTop50ByOrderByStartedAtDescIdDesc();
    }

    // ============================================================ Fichiers partenaires

    public List<PartnerFile> partnerFiles() throws IOException {
        Path dir = partnerFolder(configRepository.findFirstByOrderByIdAsc().orElseGet(BigQueryConfigEntity::new));
        Files.createDirectories(dir);
        List<PartnerFile> out = new ArrayList<>();
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir)) {
            for (Path f : files) {
                String name = f.getFileName().toString();
                if (!Files.isRegularFile(f) || !PARTNER_FILE.matcher(name).matches() || name.startsWith("~$")) continue;
                out.add(new PartnerFile(name, Files.size(f),
                        LocalDateTime.ofInstant(Files.getLastModifiedTime(f).toInstant(), ZoneId.systemDefault())));
            }
        }
        out.sort(Comparator.comparing(PartnerFile::lastModified).reversed());
        return out;
    }

    /** Fichier partenaire au format CSV (« ; ») : les classeurs Excel sont convertis (première feuille). */
    public Download partnerFileAsCsv(String fileName) throws IOException {
        if (fileName == null || !PARTNER_FILE.matcher(fileName).matches()
                || fileName.contains("/") || fileName.contains("\\") || fileName.contains("..")) {
            throw new IllegalArgumentException("Nom de fichier invalide.");
        }
        Path dir = partnerFolder(configRepository.findFirstByOrderByIdAsc().orElseGet(BigQueryConfigEntity::new));
        Path f = dir.resolve(fileName).normalize();
        if (!f.startsWith(dir) || !Files.isRegularFile(f)) throw new NoSuchElementException("Fichier introuvable.");
        if (Files.size(f) > MAX_PARTNER_BYTES) throw new IllegalArgumentException("Fichier trop volumineux.");
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".csv")) {
            return new Download(fileName, Files.readAllBytes(f));
        }
        String csvName = fileName.replaceAll("(?i)\\.xlsx?$", ".csv");
        try (InputStream in = Files.newInputStream(f); Workbook wb = WorkbookFactory.create(in)) {
            return new Download(csvName, sheetToCsv(wb).getBytes(StandardCharsets.UTF_8));
        }
    }

    static String sheetToCsv(Workbook wb) throws IOException {
        Sheet sheet = wb.getSheetAt(0);
        DataFormatter formatter = new DataFormatter(Locale.ROOT);
        FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();
        StringWriter out = new StringWriter();
        CsvSink sink = new CsvSink(out);
        int width = 0;
        for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            width = Math.max(width, row.getLastCellNum());
        }
        boolean first = true;
        for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            List<String> values = new ArrayList<>(width);
            boolean empty = true;
            for (int c = 0; c < width; c++) {
                Cell cell = row.getCell(c);
                String v = cell == null ? "" : formatter.formatCellValue(cell, evaluator).trim();
                if (!v.isEmpty()) empty = false;
                values.add(v);
            }
            if (empty) continue;
            if (first) {
                sink.header(values);
                first = false;
            } else {
                sink.row(values);
            }
        }
        return out.toString();
    }

    private Path partnerFolder(BigQueryConfigEntity c) {
        Path base = watchFolderService.currentFolder();
        Path dir = base.resolve(defaultIfBlank(c.getPartnerSubfolder(), "partenaires")).normalize();
        if (!dir.startsWith(base)) throw new IllegalStateException("Sous-dossier partenaires invalide.");
        return dir;
    }

    // ============================================================ Planification

    /** Chaque minute : prépare les extractions de la veille quand une heure configurée est atteinte. */
    @Scheduled(cron = "${bigquery.check-cron:30 * * * * *}")
    public void tick() {
        if (!schedulerEnabled) return;
        List<Map<String, Object>> rows;
        try {
            rows = jdbcTemplate.queryForList(
                    "SELECT entreprise_id, heures_execution, last_auto_run_at FROM bigquery_config WHERE enabled = 1");
        } catch (DataAccessException e) {
            log.debug("Préparation BigQuery : lecture de la configuration impossible ({})", e.getMessage());
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Map<String, Object> row : rows) {
            Long entrepriseId = ((Number) row.get("entreprise_id")).longValue();
            LocalDateTime slot;
            try {
                slot = HeuresLancement.dueSlot(HeuresLancement.parse((String) row.get("heures_execution")), now,
                        toLocalDateTime(row.get("last_auto_run_at")));
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (slot == null) continue;
            int claimed = jdbcTemplate.update(
                    "UPDATE bigquery_config SET last_auto_run_at = ? WHERE entreprise_id = ? AND enabled = 1 "
                            + "AND (last_auto_run_at IS NULL OR last_auto_run_at < ?)",
                    Timestamp.valueOf(now), entrepriseId, Timestamp.valueOf(slot));
            if (claimed != 1) continue;
            log.info("Préparation BigQuery : lancement planifié {} pour l'entreprise {}", slot.toLocalTime(), entrepriseId);
            executor.submit(() -> {
                try {
                    TenantContext.runAs(entrepriseId, this::runScheduled);
                } catch (Exception e) {
                    log.error("Préparation BigQuery (entreprise {}) : {}", entrepriseId, e.getMessage(), e);
                }
            });
        }
    }

    void runScheduled() {
        Long entrepriseId = TenantContext.get();
        if (!running.add(entrepriseId)) {
            log.info("Préparation BigQuery (entreprise {}) : extraction déjà en cours, créneau ignoré", entrepriseId);
            return;
        }
        try {
            Ctx ctx;
            try {
                ctx = context();
            } catch (RuntimeException e) {
                log.warn("Préparation BigQuery (entreprise {}) : {}", entrepriseId, e.getMessage());
                return;
            }
            LocalDate veille = LocalDate.now().minusDays(1);
            for (BigQueryQueryEntity q : queryRepository.findByEnabledTrueOrderByIdAsc()) {
                BigQueryExtractEntity e = extract(ctx, q, veille, BigQueryExtractEntity.DECLENCHEUR_AUTO, "job planifié");
                log.info("Préparation BigQuery (entreprise {}) « {} » du {} : {} ({} lignes){}", entrepriseId,
                        q.getLibelle(), veille, e.getStatus(), e.getRowCount(),
                        e.getMessage() != null ? " — " + e.getMessage() : "");
            }
        } finally {
            running.remove(entrepriseId);
        }
    }

    // ============================================================ Utilitaires

    private record Ctx(BigQueryClient.ServiceAccount serviceAccount, String project, String location, long maxRows) {}

    private Ctx context() {
        BigQueryConfigEntity c = configRepository.findFirstByOrderByIdAsc()
                .orElseThrow(() -> new IllegalArgumentException("Connexion BigQuery non configurée."));
        if (c.getServiceAccountEnc() == null) throw new IllegalArgumentException("Clé du compte de service non renseignée.");
        if (c.getProjectId() == null) throw new IllegalArgumentException("Projet Google Cloud non renseigné.");
        BigQueryClient.ServiceAccount sa = client.parseServiceAccount(cipher.decrypt(c.getServiceAccountEnc()));
        return new Ctx(sa, c.getProjectId(), c.getLocation(), c.getMaxRows() == null ? 1_000_000 : c.getMaxRows());
    }

    private BigQueryQueryEntity findQuery(Long id) {
        return queryRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Requête introuvable."));
    }

    static String fileName(BigQueryQueryEntity q, LocalDate date) {
        return q.getBoFilePrefix() + "_BQ_" + date.format(YMD) + ".csv";
    }

    private Path queryFolder(Long queryId) {
        return extractRoot.resolve(String.valueOf(TenantContext.get())).resolve(String.valueOf(queryId));
    }

    private static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.util.Date d) return LocalDateTime.ofInstant(Instant.ofEpochMilli(d.getTime()), ZoneId.systemDefault());
        return null;
    }

    private static String trimToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static String defaultIfBlank(String v, String def) {
        return v == null || v.isBlank() ? def : v.trim();
    }

    private static String limit(String v, int max) {
        return v == null || v.length() <= max ? v : v.substring(0, max);
    }

    /**
     * CSV lu par le Lanceur : séparateur « ; », sans guillemets (le lecteur du navigateur ne les
     * gère pas), donc « ; », guillemets et retours à la ligne des valeurs sont remplacés par un espace.
     */
    static final class CsvSink implements BigQueryClient.RowSink {
        private final Writer out;

        /** @param out flux tamponné de préférence ; il est fermé (et vidé) par l'appelant */
        CsvSink(Writer out) {
            this.out = out;
        }

        @Override
        public void header(List<String> columns) throws IOException {
            row(columns);
        }

        @Override
        public void row(List<String> values) throws IOException {
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) out.write(';');
                out.write(clean(values.get(i)));
            }
            out.write('\n');
        }

        static String clean(String v) {
            if (v == null) return "";
            return v.replaceAll("[;\"\\r\\n]", " ").trim();
        }
    }
}
