package com.reconciliation.service.sharepoint;

import com.reconciliation.entity.SharepointSyncConfigEntity;
import com.reconciliation.entity.SharepointSyncRunEntity;
import com.reconciliation.entity.SharepointSyncSourceEntity;
import com.reconciliation.repository.SharepointSyncConfigRepository;
import com.reconciliation.repository.SharepointSyncRunRepository;
import com.reconciliation.repository.SharepointSyncSourceRepository;
import com.reconciliation.service.SuiviCompenseOpImportService;
import com.reconciliation.service.SuiviCompenseOpSaveService;
import com.reconciliation.tenant.TenantContext;
import com.reconciliation.util.HeuresLancement;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Synchronisation SharePoint → suivi des compenses OP (écran Banque).
 *
 * <p>Pour chaque lien configuré : recherche du dernier classeur du site (motif du nom, mois
 * AAAAMM le plus récent), lecture des feuilles « Compense client » et « Compense fournisseur »
 * à partir de la ligne qui suit la dernière ligne chargée, puis enregistrement des lignes du
 * mois du fichier sans doublon ({@link SuiviCompenseOpSaveService}).</p>
 *
 * <p>Le job vérifie chaque minute si une heure de lancement configurée est passée ; la
 * colonne {@code last_auto_run_at} est réservée par un UPDATE conditionnel, de sorte qu'une
 * seule instance (dev / prod sur la même base) lance un créneau donné.</p>
 */
@Service
@Slf4j
public class SharepointSyncService {

    public static final String DEFAULT_SHEET_CLIENT = "Compense client";
    public static final String DEFAULT_SHEET_FOURNISSEUR = "Compense fournisseur";

    private static final Pattern IDENTIFIANT = Pattern.compile("^[A-Za-z0-9.\\-]{1,100}$");

    private final SharepointSyncConfigRepository configRepository;
    private final SharepointSyncSourceRepository sourceRepository;
    private final SharepointSyncRunRepository runRepository;
    private final SuiviCompenseOpImportService importService;
    private final SuiviCompenseOpSaveService saveService;
    private final GraphClient graph;
    private final SecretCipher cipher;
    private final JdbcTemplate jdbcTemplate;
    private final boolean schedulerEnabled;

    /** Entreprises dont une synchronisation est en cours sur cette instance. */
    private final Set<Long> running = ConcurrentHashMap.newKeySet();
    /** Exécution des lancements planifiés hors du thread du planificateur (partagé avec d'autres tâches). */
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "sharepoint-sync");
        t.setDaemon(true);
        return t;
    });

    public SharepointSyncService(SharepointSyncConfigRepository configRepository,
                                 SharepointSyncSourceRepository sourceRepository,
                                 SharepointSyncRunRepository runRepository,
                                 SuiviCompenseOpImportService importService,
                                 SuiviCompenseOpSaveService saveService,
                                 GraphClient graph,
                                 SecretCipher cipher,
                                 JdbcTemplate jdbcTemplate,
                                 @Value("${sharepoint.sync.scheduler-enabled:true}") boolean schedulerEnabled) {
        this.configRepository = configRepository;
        this.sourceRepository = sourceRepository;
        this.runRepository = runRepository;
        this.importService = importService;
        this.saveService = saveService;
        this.graph = graph;
        this.cipher = cipher;
        this.jdbcTemplate = jdbcTemplate;
        this.schedulerEnabled = schedulerEnabled;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    // ================================================================ DTO

    public record ConfigView(boolean enabled, String heuresExecution, String azureTenantId, String clientId,
                             boolean clientSecretDefini, LocalDateTime lastAutoRunAt, LocalDateTime prochainLancement,
                             boolean schedulerActif, LocalDateTime updatedAt, String updatedBy) {}

    public record ConfigRequest(Boolean enabled, String heuresExecution, String azureTenantId, String clientId,
                                String clientSecret, Boolean effacerSecret) {}

    public record SourceRequest(String libelle, String url, String filePattern, String sheetClient,
                                String sheetFournisseur, Boolean enabled) {}

    /** Bilan d'une feuille pour une exécution ou un test. */
    public record SheetReport(String feuille, String feuilleTrouvee, int lignesExaminees, int aCharger,
                              int chargees, int doublons, int horsMois, int incompletes, boolean curseurReinitialise,
                              String erreur) {}

    /** Bilan d'un lien (exécution réelle ou test à blanc). */
    public record SourceReport(Long sourceId, String libelle, String status, String fichier, String fichierUrl,
                               OffsetDateTime fichierModifie, String mois, int fichiersTrouves,
                               List<SheetReport> feuilles, String message, boolean test) {}

    // ======================================================== Configuration

    public ConfigView getConfig() {
        return toView(configRepository.findFirstByOrderByIdAsc().orElseGet(SharepointSyncConfigEntity::new));
    }

    public ConfigView saveConfig(ConfigRequest req, String username) {
        if (req == null) throw new IllegalArgumentException("Configuration absente.");
        SharepointSyncConfigEntity c = configRepository.findFirstByOrderByIdAsc().orElseGet(SharepointSyncConfigEntity::new);
        boolean wasEnabled = Boolean.TRUE.equals(c.getEnabled());
        String oldHeures = c.getHeuresExecution();

        String heures = normalizeHeures(req.heuresExecution());
        String tenantId = trimToNull(req.azureTenantId());
        String clientId = trimToNull(req.clientId());
        if (tenantId != null && !IDENTIFIANT.matcher(tenantId).matches()) {
            throw new IllegalArgumentException("ID d'annuaire (tenant) invalide : GUID ou domaine attendu (ex. contoso.onmicrosoft.com).");
        }
        if (clientId != null && !IDENTIFIANT.matcher(clientId).matches()) {
            throw new IllegalArgumentException("ID d'application (client) invalide : GUID attendu.");
        }
        c.setHeuresExecution(heures);
        c.setAzureTenantId(tenantId);
        c.setClientId(clientId);
        if (Boolean.TRUE.equals(req.effacerSecret())) {
            c.setClientSecretEnc(null);
        } else if (req.clientSecret() != null && !req.clientSecret().isBlank()) {
            c.setClientSecretEnc(cipher.encrypt(req.clientSecret().trim()));
        }
        boolean enabled = Boolean.TRUE.equals(req.enabled());
        if (enabled && (tenantId == null || clientId == null || c.getClientSecretEnc() == null)) {
            throw new IllegalArgumentException("Renseignez la connexion Microsoft (annuaire, application, secret) avant d'activer le job.");
        }
        c.setEnabled(enabled);
        // Nouveau planning : il s'applique à partir du prochain créneau (pas de rattrapage immédiat)
        if (enabled && (!wasEnabled || !heures.equals(oldHeures))) {
            c.setLastAutoRunAt(LocalDateTime.now());
        }
        c.setUpdatedAt(LocalDateTime.now());
        c.setUpdatedBy(trimToNull(username));
        return toView(configRepository.save(c));
    }

    /** Vérifie que le compte applicatif obtient un jeton Microsoft. */
    public void testConnexion() {
        graph.checkCredentials(credentials());
    }

    private ConfigView toView(SharepointSyncConfigEntity c) {
        LocalDateTime next = null;
        if (Boolean.TRUE.equals(c.getEnabled())) {
            try {
                next = nextSlot(parseHeures(c.getHeuresExecution()), LocalDateTime.now(), c.getLastAutoRunAt());
            } catch (IllegalArgumentException ignored) { }
        }
        return new ConfigView(Boolean.TRUE.equals(c.getEnabled()), c.getHeuresExecution(), c.getAzureTenantId(),
                c.getClientId(), c.getClientSecretEnc() != null, c.getLastAutoRunAt(), next, schedulerEnabled,
                c.getUpdatedAt(), c.getUpdatedBy());
    }

    // ================================================================ Liens

    public List<SharepointSyncSourceEntity> listSources() {
        return sourceRepository.findAllByOrderByIdAsc();
    }

    public SharepointSyncSourceEntity createSource(SourceRequest req) {
        SharepointSyncSourceEntity s = new SharepointSyncSourceEntity();
        s.setCreatedAt(LocalDateTime.now());
        apply(s, req);
        return sourceRepository.save(s);
    }

    public SharepointSyncSourceEntity updateSource(Long id, SourceRequest req) {
        SharepointSyncSourceEntity s = sourceRepository.findById(id)
                .orElseThrow(() -> new java.util.NoSuchElementException("Lien introuvable."));
        String oldUrl = s.getUrl();
        String oldPattern = s.getFilePattern();
        apply(s, req);
        // Autre site ou autre fichier : le curseur ne s'applique plus
        if (!s.getUrl().equals(oldUrl) || !java.util.Objects.equals(s.getFilePattern(), oldPattern)) {
            clearCursor(s);
        }
        return sourceRepository.save(s);
    }

    public void deleteSource(Long id) {
        SharepointSyncSourceEntity s = sourceRepository.findById(id)
                .orElseThrow(() -> new java.util.NoSuchElementException("Lien introuvable."));
        sourceRepository.delete(s);
    }

    /** Oublie le dernier fichier et les dernières lignes : le prochain scan relit tout (doublons écartés). */
    public SharepointSyncSourceEntity resetCursor(Long id) {
        SharepointSyncSourceEntity s = sourceRepository.findById(id)
                .orElseThrow(() -> new java.util.NoSuchElementException("Lien introuvable."));
        clearCursor(s);
        s.setUpdatedAt(LocalDateTime.now());
        return sourceRepository.save(s);
    }

    private void apply(SharepointSyncSourceEntity s, SourceRequest req) {
        if (req == null) throw new IllegalArgumentException("Lien absent.");
        String libelle = trimToNull(req.libelle());
        String url = trimToNull(req.url());
        String pattern = trimToNull(req.filePattern());
        if (libelle == null) throw new IllegalArgumentException("Le libellé est obligatoire.");
        if (url == null) throw new IllegalArgumentException("Le lien SharePoint est obligatoire.");
        if (pattern == null) throw new IllegalArgumentException("Le motif du nom de fichier est obligatoire (ex. SN_SUIVI_OPS).");
        if (libelle.length() > 150 || url.length() > 2000 || pattern.length() > 200) {
            throw new IllegalArgumentException("Libellé, lien ou motif trop long.");
        }
        SharepointLink.parseSite(url); // valide l'hôte *.sharepoint.com
        s.setLibelle(libelle);
        s.setUrl(url);
        s.setFilePattern(pattern);
        s.setSheetClient(limit(defaultIfBlank(req.sheetClient(), DEFAULT_SHEET_CLIENT), 150));
        s.setSheetFournisseur(limit(defaultIfBlank(req.sheetFournisseur(), DEFAULT_SHEET_FOURNISSEUR), 150));
        s.setEnabled(req.enabled() == null || req.enabled());
        s.setUpdatedAt(LocalDateTime.now());
    }

    private static void clearCursor(SharepointSyncSourceEntity s) {
        s.setLastFileId(null);
        s.setLastFileName(null);
        s.setLastRowClient(null);
        s.setLastRowFournisseur(null);
        s.setLastRowKeyClient(null);
        s.setLastRowKeyFournisseur(null);
    }

    // ============================================================ Historique

    public List<SharepointSyncRunEntity> history() {
        return runRepository.findTop50ByOrderByStartedAtDescIdDesc();
    }

    // ============================================================ Exécution

    /** Test à blanc d'un lien : dernier fichier trouvé et lignes qui seraient chargées, sans rien enregistrer. */
    public SourceReport test(Long sourceId) {
        SharepointSyncSourceEntity s = sourceRepository.findById(sourceId)
                .orElseThrow(() -> new java.util.NoSuchElementException("Lien introuvable."));
        return processSource(s, credentials(), true, SharepointSyncRunEntity.DECLENCHEUR_MANUEL, null);
    }

    /**
     * Lancement manuel (tous les liens actifs, ou un seul lien même désactivé).
     *
     * @throws IllegalStateException si une synchronisation est déjà en cours pour l'entreprise
     */
    public List<SourceReport> runNow(Long sourceId, String username) {
        Long entrepriseId = TenantContext.get();
        if (!running.add(entrepriseId)) {
            throw new IllegalStateException("Une synchronisation est déjà en cours, réessayez dans quelques instants.");
        }
        try {
            GraphClient.Credentials creds = credentials();
            List<SharepointSyncSourceEntity> sources = sourceId == null
                    ? sourceRepository.findByEnabledTrueOrderByIdAsc()
                    : List.of(sourceRepository.findById(sourceId)
                            .orElseThrow(() -> new java.util.NoSuchElementException("Lien introuvable.")));
            if (sources.isEmpty()) throw new IllegalArgumentException("Aucun lien actif à synchroniser.");
            List<SourceReport> reports = new ArrayList<>();
            for (SharepointSyncSourceEntity s : sources) {
                reports.add(processSource(s, creds, false, SharepointSyncRunEntity.DECLENCHEUR_MANUEL, username));
            }
            return reports;
        } finally {
            running.remove(entrepriseId);
        }
    }

    /** Lancement planifié pour l'entreprise courante (thread du job). */
    void runScheduled() {
        Long entrepriseId = TenantContext.get();
        if (!running.add(entrepriseId)) {
            log.info("Synchronisation SharePoint (entreprise {}) : déjà en cours, créneau ignoré", entrepriseId);
            return;
        }
        try {
            GraphClient.Credentials creds;
            try {
                creds = credentials();
            } catch (RuntimeException e) {
                log.warn("Synchronisation SharePoint (entreprise {}) : {}", entrepriseId, e.getMessage());
                recordFailure(null, e.getMessage());
                return;
            }
            for (SharepointSyncSourceEntity s : sourceRepository.findByEnabledTrueOrderByIdAsc()) {
                SourceReport r = processSource(s, creds, false, SharepointSyncRunEntity.DECLENCHEUR_AUTO, "job planifié");
                log.info("Synchronisation SharePoint (entreprise {}) « {} » : {} — {}", entrepriseId, s.getLibelle(),
                        r.status(), r.message());
            }
        } finally {
            running.remove(entrepriseId);
        }
    }

    private SourceReport processSource(SharepointSyncSourceEntity s, GraphClient.Credentials creds, boolean dryRun,
                                       String declencheur, String username) {
        LocalDateTime start = LocalDateTime.now();
        List<SheetReport> sheets = new ArrayList<>();
        String fileName = null;
        String fileUrl = null;
        OffsetDateTime fileModified = null;
        String mois = null;
        int found = 0;
        String status = SharepointSyncRunEntity.STATUS_OK;
        String message;
        try {
            SharepointLink.Site site = SharepointLink.parseSite(s.getUrl());
            List<SharepointLink.FileItem> files = graph.searchFiles(creds, site, s.getFilePattern());
            found = (int) files.stream().filter(f -> SharepointLink.matches(f.name(), s.getFilePattern())).count();
            SharepointLink.FileItem latest = SharepointLink.latest(files, s.getFilePattern())
                    .orElseThrow(() -> new GraphClient.GraphException("Aucun classeur Excel contenant « "
                            + s.getFilePattern() + " » sur le site " + site.host() + site.sitePath() + "."));
            fileName = latest.name();
            fileUrl = latest.webUrl();
            fileModified = latest.lastModified();
            YearMonth month = SharepointLink.monthFromName(latest.name()).orElse(YearMonth.now());
            mois = month.toString();
            boolean newFile = !latest.itemId().equals(s.getLastFileId());

            byte[] content = graph.download(creds, latest);
            try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(content))) {
                sheets.add(processSheet(wb, s, true, newFile, month, latest.name(), dryRun));
                sheets.add(processSheet(wb, s, false, newFile, month, latest.name(), dryRun));
            }
            if (!dryRun) {
                s.setLastFileId(latest.itemId());
                s.setLastFileName(latest.name());
            }
            boolean sheetError = sheets.stream().anyMatch(r -> r.erreur() != null);
            if (sheetError) status = SharepointSyncRunEntity.STATUS_ERREUR;
            message = summary(sheets, dryRun);
        } catch (Exception e) {
            status = SharepointSyncRunEntity.STATUS_ERREUR;
            message = e instanceof GraphClient.GraphException || e instanceof IllegalArgumentException
                    ? e.getMessage()
                    : "Erreur inattendue : " + e.getClass().getSimpleName()
                        + (e.getMessage() != null ? " (" + e.getMessage() + ")" : "");
            if (!(e instanceof GraphClient.GraphException)) {
                log.error("Synchronisation SharePoint « {} » : {}", s.getLibelle(), e.getMessage(), e);
            }
        }

        if (!dryRun) {
            s.setLastRunAt(LocalDateTime.now());
            s.setLastStatus(status);
            s.setLastMessage(limit(message, 2000));
            sourceRepository.save(s);

            SharepointSyncRunEntity run = new SharepointSyncRunEntity();
            run.setSourceId(s.getId());
            run.setSourceLibelle(s.getLibelle());
            run.setDeclencheur(declencheur);
            run.setUtilisateur(limit(username, 255));
            run.setStartedAt(start);
            run.setEndedAt(LocalDateTime.now());
            run.setFileName(limit(fileName, 500));
            run.setStatus(status);
            run.setLignesLues(sheets.stream().mapToInt(SheetReport::lignesExaminees).sum());
            run.setLignesChargees(sheets.stream().mapToInt(SheetReport::chargees).sum());
            run.setDoublons(sheets.stream().mapToInt(SheetReport::doublons).sum());
            run.setHorsMois(sheets.stream().mapToInt(SheetReport::horsMois).sum());
            run.setMessage(limit(message, 4000));
            runRepository.save(run);
        }
        return new SourceReport(s.getId(), s.getLibelle(), status, fileName, fileUrl, fileModified, mois, found,
                sheets, message, dryRun);
    }

    private SheetReport processSheet(Workbook wb, SharepointSyncSourceEntity s, boolean client, boolean newFile,
                                     YearMonth month, String fileName, boolean dryRun) {
        String wanted = client ? defaultIfBlank(s.getSheetClient(), DEFAULT_SHEET_CLIENT)
                : defaultIfBlank(s.getSheetFournisseur(), DEFAULT_SHEET_FOURNISSEUR);
        Sheet sheet = findSheet(wb, wanted);
        if (sheet == null) {
            return new SheetReport(wanted, null, 0, 0, 0, 0, 0, 0, false,
                    "Feuille « " + wanted + " » introuvable dans " + fileName + ".");
        }
        Integer cursor = newFile ? null : (client ? s.getLastRowClient() : s.getLastRowFournisseur());
        String cursorKey = newFile ? null : (client ? s.getLastRowKeyClient() : s.getLastRowKeyFournisseur());
        SuiviCompenseOpImportService.SheetParse parse;
        try {
            parse = importService.parseSheet(sheet, -1);
        } catch (IllegalArgumentException e) {
            return new SheetReport(wanted, sheet.getSheetName(), 0, 0, 0, 0, 0, 0, false, e.getMessage());
        }
        SheetCursor.Selection sel = SheetCursor.select(parse.rows(), cursor, cursorKey, month);
        int saved = 0;
        int duplicates = 0;
        if (!dryRun) {
            if (!sel.toLoad().isEmpty()) {
                SuiviCompenseOpSaveService.SaveResult res = saveService.saveWithoutDuplicates(
                        sel.toLoad(), limit("SharePoint · " + fileName + " · " + sheet.getSheetName(), 255));
                saved = res.saved();
                duplicates = res.duplicatesIgnored();
            }
            if (client) {
                s.setLastRowClient(sel.newCursor());
                s.setLastRowKeyClient(sel.newCursorKey());
            } else {
                s.setLastRowFournisseur(sel.newCursor());
                s.setLastRowKeyFournisseur(sel.newCursorKey());
            }
        }
        return new SheetReport(wanted, sheet.getSheetName(), sel.examined(), sel.toLoad().size(), saved, duplicates,
                sel.horsMois(), sel.incompletes(), sel.cursorReset(), null);
    }

    /** Feuille de même nom (casse, accents et ponctuation ignorés), sinon première feuille qui le contient. */
    static Sheet findSheet(Workbook wb, String wanted) {
        String w = SharepointLink.normalize(wanted);
        if (w.isEmpty()) return null;
        Sheet contains = null;
        for (int i = 0; i < wb.getNumberOfSheets(); i++) {
            Sheet sh = wb.getSheetAt(i);
            String n = SharepointLink.normalize(sh.getSheetName());
            if (n.equals(w)) return sh;
            if (contains == null && n.contains(w)) contains = sh;
        }
        return contains;
    }

    private static String summary(List<SheetReport> sheets, boolean dryRun) {
        List<String> parts = new ArrayList<>();
        for (SheetReport r : sheets) {
            if (r.erreur() != null) {
                parts.add(r.erreur());
                continue;
            }
            StringBuilder sb = new StringBuilder(r.feuilleTrouvee()).append(" : ");
            if (dryRun) {
                sb.append(r.aCharger()).append(" ligne(s) à charger");
            } else {
                sb.append(r.chargees()).append(" chargée(s)");
                if (r.doublons() > 0) sb.append(", ").append(r.doublons()).append(" doublon(s) ignoré(s)");
            }
            if (r.horsMois() > 0) sb.append(", ").append(r.horsMois()).append(" hors mois");
            if (r.incompletes() > 0) sb.append(", ").append(r.incompletes()).append(" incomplète(s) en attente");
            if (r.curseurReinitialise()) sb.append(" (dernière ligne déplacée : feuille relue)");
            parts.add(sb.toString());
        }
        return String.join(" ; ", parts);
    }

    private void recordFailure(SharepointSyncSourceEntity s, String message) {
        SharepointSyncRunEntity run = new SharepointSyncRunEntity();
        run.setSourceId(s == null ? null : s.getId());
        run.setSourceLibelle(s == null ? null : s.getLibelle());
        run.setDeclencheur(SharepointSyncRunEntity.DECLENCHEUR_AUTO);
        run.setUtilisateur("job planifié");
        run.setStartedAt(LocalDateTime.now());
        run.setEndedAt(LocalDateTime.now());
        run.setStatus(SharepointSyncRunEntity.STATUS_ERREUR);
        run.setMessage(limit(message, 4000));
        runRepository.save(run);
    }

    private GraphClient.Credentials credentials() {
        SharepointSyncConfigEntity c = configRepository.findFirstByOrderByIdAsc()
                .orElseThrow(() -> new IllegalArgumentException("Connexion Microsoft non configurée."));
        if (c.getClientSecretEnc() == null) {
            throw new IllegalArgumentException("Secret client non renseigné.");
        }
        return new GraphClient.Credentials(c.getAzureTenantId(), c.getClientId(), cipher.decrypt(c.getClientSecretEnc()));
    }

    // ============================================================ Planification

    /** Chaque minute : lance les entreprises dont un créneau horaire est passé et pas encore exécuté. */
    @Scheduled(cron = "${sharepoint.sync.check-cron:0 * * * * *}")
    public void tick() {
        if (!schedulerEnabled) return;
        List<Map<String, Object>> rows;
        try {
            rows = jdbcTemplate.queryForList(
                    "SELECT entreprise_id, heures_execution, last_auto_run_at FROM sharepoint_sync_config WHERE enabled = 1");
        } catch (DataAccessException e) {
            log.debug("Synchronisation SharePoint : lecture de la configuration impossible ({})", e.getMessage());
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Map<String, Object> row : rows) {
            Long entrepriseId = ((Number) row.get("entreprise_id")).longValue();
            LocalDateTime last = toLocalDateTime(row.get("last_auto_run_at"));
            LocalDateTime slot;
            try {
                slot = dueSlot(parseHeures((String) row.get("heures_execution")), now, last);
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (slot == null) continue;
            // Réservation du créneau : une seule instance (même base) le lance
            int claimed = jdbcTemplate.update(
                    "UPDATE sharepoint_sync_config SET last_auto_run_at = ? WHERE entreprise_id = ? AND enabled = 1 "
                            + "AND (last_auto_run_at IS NULL OR last_auto_run_at < ?)",
                    Timestamp.valueOf(now), entrepriseId, Timestamp.valueOf(slot));
            if (claimed != 1) continue;
            log.info("Synchronisation SharePoint : lancement planifié {} pour l'entreprise {}", slot.toLocalTime(), entrepriseId);
            executor.submit(() -> {
                try {
                    TenantContext.runAs(entrepriseId, this::runScheduled);
                } catch (Exception e) {
                    log.error("Synchronisation SharePoint (entreprise {}) : {}", entrepriseId, e.getMessage(), e);
                }
            });
        }
    }

    static LocalDateTime dueSlot(List<LocalTime> heures, LocalDateTime now, LocalDateTime lastRun) {
        return HeuresLancement.dueSlot(heures, now, lastRun);
    }

    static LocalDateTime nextSlot(List<LocalTime> heures, LocalDateTime now, LocalDateTime lastRun) {
        return HeuresLancement.nextSlot(heures, now, lastRun);
    }

    static String normalizeHeures(String raw) {
        return HeuresLancement.normalize(raw);
    }

    static List<LocalTime> parseHeures(String raw) {
        return HeuresLancement.parse(raw);
    }

    // ============================================================ Utilitaires

    private static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.util.Date d) return new Timestamp(d.getTime()).toLocalDateTime();
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
}
