package com.reconciliation.service;

import com.reconciliation.dto.RecoBlockingCommentMailAlertRequest;
import com.reconciliation.entity.RecoBlockingCommentMailAlertEntity;
import com.reconciliation.entity.RecoJ1BlockingCommentEntity;
import com.reconciliation.entity.Result8RecEntity;
import com.reconciliation.repository.RecoBlockingCommentMailAlertRepository;
import com.reconciliation.repository.RecoJ1BlockingCommentRepository;
import com.reconciliation.repository.Result8RecRepository;
import com.reconciliation.tenant.TenantContext;
import com.reconciliation.util.CountryNormalizationUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Relance e-mail quotidienne d'un commentaire de blocage (page « État des réconciliations »).
 *
 * <p>À l'activation, le statut courant de la réconciliation est mémorisé et un premier e-mail
 * part immédiatement. Chaque jour, la tâche planifiée recalcule le statut à partir de
 * {@code result8rec} (mêmes règles que la page) : tant qu'il est identique, l'e-mail est renvoyé ;
 * dès qu'il change, la relance se désactive.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RecoBlockingCommentMailAlertService {

    public static final String STATUS_RECONCILIE = "RECONCILIE";
    public static final String STATUS_NON_RECONCILIE = "NON_RECONCILIE";

    public static final String STOP_MANUAL = "MANUEL";
    public static final String STOP_STATUS_CHANGED = "STATUT_CHANGE";
    public static final String STOP_NO_COMMENT = "COMMENTAIRE_ABSENT";

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int MAX_RECIPIENTS = 20;
    private static final DateTimeFormatter FR_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final RecoBlockingCommentMailAlertRepository alertRepository;
    private final RecoJ1BlockingCommentRepository commentRepository;
    private final RecoJ1BlockingCommentService commentService;
    private final Result8RecRepository result8RecRepository;
    private final EmailService emailService;
    private final JdbcTemplate jdbcTemplate;
    private final PlatformTransactionManager transactionManager;

    @Value("${app.url:http://localhost:4200}")
    private String appUrl;

    /** L'e-mail n'a pu être envoyé à aucun destinataire. */
    public static class MailAlertSendException extends RuntimeException {
        public MailAlertSendException(String message) {
            super(message);
        }
    }

    @Transactional
    public RecoBlockingCommentMailAlertEntity activate(RecoBlockingCommentMailAlertRequest request, String username) {
        commentService.ensureSchema();
        Scope scope = Scope.of(request);
        List<String> recipients = normalizeRecipients(request.getRecipients(), true);
        List<String> ccRecipients = new ArrayList<>(normalizeRecipients(request.getCcRecipients(), false));
        ccRecipients.removeAll(recipients);

        RecoJ1BlockingCommentEntity comment = commentRepository
            .findByRecoDateAndServiceAndCountryAndEnv(scope.recoDate, scope.service, scope.country, scope.env)
            .orElseThrow(() -> new IllegalArgumentException(
                "Enregistrez d'abord le commentaire avant d'activer la relance par e-mail."));

        String status = computeStatus(scope);
        if (STATUS_RECONCILIE.equals(status)) {
            throw new IllegalArgumentException("Cette réconciliation est déjà validée : aucune relance n'est nécessaire.");
        }

        RecoBlockingCommentMailAlertEntity alert = alertRepository
            .findByRecoDateAndServiceAndCountryAndEnv(scope.recoDate, scope.service, scope.country, scope.env)
            .orElseGet(RecoBlockingCommentMailAlertEntity::new);
        if (alert.getId() == null) {
            alert.setRecoDate(scope.recoDate);
            alert.setService(scope.service);
            alert.setCountry(scope.country);
            alert.setEnv(scope.env);
            alert.setCreatedBy(trimToNull(username));
        }
        alert.setRecipients(String.join(",", recipients));
        alert.setCcRecipients(ccRecipients.isEmpty() ? null : String.join(",", ccRecipients));
        alert.setStatusSnapshot(status);
        alert.setActive(true);
        alert.setStoppedReason(null);
        alert.setStoppedAt(null);
        alert.setSendCount(0);
        alert.setLastSentAt(null);
        alert.setUpdatedBy(trimToNull(username));

        String error = sendReminder(alert, comment, status);
        if (alert.getSendCount() == 0) {
            throw new MailAlertSendException(error != null ? error : "L'e-mail n'a pas pu être envoyé.");
        }
        return alertRepository.save(alert);
    }

    @Transactional
    public RecoBlockingCommentMailAlertEntity stop(RecoBlockingCommentMailAlertRequest request, String username) {
        commentService.ensureSchema();
        Scope scope = Scope.of(request);
        RecoBlockingCommentMailAlertEntity alert = alertRepository
            .findByRecoDateAndServiceAndCountryAndEnv(scope.recoDate, scope.service, scope.country, scope.env)
            .orElseThrow(() -> new IllegalArgumentException("Aucune relance par e-mail pour cette réconciliation."));
        deactivate(alert, STOP_MANUAL);
        alert.setUpdatedBy(trimToNull(username));
        return alertRepository.save(alert);
    }

    /**
     * Envoi quotidien. S'exécute hors requête HTTP : le contexte entreprise est posé
     * explicitement pour chaque entreprise ayant au moins une relance active.
     */
    @Scheduled(
        cron = "${reco.blocking-comment.mail-alert.cron:0 0 8 * * *}",
        zone = "${reco.blocking-comment.mail-alert.zone:}"
    )
    public void sendDailyReminders() {
        List<Long> entrepriseIds;
        try {
            entrepriseIds = jdbcTemplate.queryForList(
                "SELECT DISTINCT entreprise_id FROM reco_blocking_comment_mail_alert WHERE active = 1",
                Long.class
            );
        } catch (DataAccessException e) {
            log.warn("Relances e-mail réconciliation : lecture impossible ({})", e.getMessage());
            return;
        }
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        for (Long entrepriseId : entrepriseIds) {
            TenantContext.runAs(entrepriseId, () -> {
                List<Long> alertIds = tx.execute(status -> alertRepository.findByActiveTrue().stream()
                    .map(RecoBlockingCommentMailAlertEntity::getId)
                    .toList());
                for (Long alertId : alertIds == null ? List.<Long>of() : alertIds) {
                    try {
                        tx.executeWithoutResult(status -> processDailyReminder(alertId));
                    } catch (Exception e) {
                        log.error("Relance e-mail réconciliation {} (entreprise {}) : {}", alertId, entrepriseId, e.getMessage(), e);
                    }
                }
            });
        }
    }

    private void processDailyReminder(Long alertId) {
        RecoBlockingCommentMailAlertEntity alert = alertRepository.findById(alertId).orElse(null);
        if (alert == null || !alert.isActive()) {
            return;
        }
        if (alert.getLastSentAt() != null && alert.getLastSentAt().toLocalDate().equals(LocalDate.now())) {
            return;
        }
        Scope scope = new Scope(alert.getRecoDate(), alert.getService(), alert.getCountry(), alert.getEnv());
        RecoJ1BlockingCommentEntity comment = commentRepository
            .findByRecoDateAndServiceAndCountryAndEnv(scope.recoDate, scope.service, scope.country, scope.env)
            .orElse(null);
        if (comment == null) {
            deactivate(alert, STOP_NO_COMMENT);
            return;
        }
        String status = computeStatus(scope);
        if (!status.equals(alert.getStatusSnapshot())) {
            log.info("Relance e-mail réconciliation arrêtée ({} {} {} {}) : statut {} -> {}",
                scope.recoDate, scope.service, scope.country, scope.env, alert.getStatusSnapshot(), status);
            deactivate(alert, STOP_STATUS_CHANGED);
            return;
        }
        sendReminder(alert, comment, status);
    }

    /** Envoie un seul message (destinataires + copie) ; met à jour compteur / date en cas de succès. Renvoie l'erreur éventuelle. */
    private String sendReminder(RecoBlockingCommentMailAlertEntity alert, RecoJ1BlockingCommentEntity comment, String status) {
        String error = null;
        try {
            emailService.sendRecoBlockingReminderEmail(
                splitRecipients(alert.getRecipients()),
                splitRecipients(alert.getCcRecipients()),
                buildSubject(alert, status),
                buildBody(alert, comment, status)
            );
            alert.setSendCount(alert.getSendCount() + 1);
            alert.setLastSentAt(LocalDateTime.now());
        } catch (Exception e) {
            log.warn("Relance e-mail réconciliation ({} {} {}) : {}", alert.getRecoDate(), alert.getService(), alert.getCountry(), e.getMessage());
            error = truncate(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName(), 500);
        }
        alert.setLastError(error);
        return error;
    }

    private void deactivate(RecoBlockingCommentMailAlertEntity alert, String reason) {
        alert.setActive(false);
        alert.setStoppedReason(reason);
        alert.setStoppedAt(LocalDateTime.now());
    }

    /**
     * Statut d'une case de la page « État des réconciliations » : aucune ligne → non réconcilié,
     * toutes « Terminé » → réconcilié, sinon en cours au niveau le plus avancé (traitement, validation, clôture).
     */
    String computeStatus(Scope scope) {
        LocalDate day = parseDate(scope.recoDate);
        String countryCode = CountryNormalizationUtil.normalizeToCode(scope.country);
        List<Result8RecEntity> lines = result8RecRepository
            .findByServiceAndDay(scope.service, day.toString(), day.plusDays(1).toString())
            .stream()
            .filter(r -> countryCode.equals(CountryNormalizationUtil.normalizeToCode(r.getCountry())))
            .filter(r -> scope.env.equals(RecoJ1BlockingCommentService.normalizeEnvForStorage(r.getEnv())))
            .toList();
        if (lines.isEmpty()) {
            return STATUS_NON_RECONCILIE;
        }
        int bestRank = 0;
        boolean pending = false;
        for (Result8RecEntity line : lines) {
            String normalized = normalizeText(line.getTraitement());
            if ("termine".equals(normalized)) {
                continue;
            }
            pending = true;
            bestRank = Math.max(bestRank, rank(traitementKind(normalized)));
        }
        if (!pending) {
            return STATUS_RECONCILIE;
        }
        return switch (bestRank) {
            case 4 -> "EN_COURS_TERMINE";
            case 3 -> "EN_COURS_GROUP";
            case 2 -> "EN_COURS_CDO";
            default -> "EN_COURS_SUPPORT";
        };
    }

    private static String traitementKind(String t) {
        if (t.isEmpty() || "—".equals(t)) {
            return "none";
        }
        if (t.contains("termine")) {
            return "termine";
        }
        if (t.contains("validation")) {
            return "cdo";
        }
        if (t.contains("cloture")) {
            return "group";
        }
        if (t.contains("support") || t.contains("traitement")) {
            return "support";
        }
        if (t.contains("group")) {
            return "group";
        }
        if (t.contains("cdo") || t.contains("responsable")) {
            return "cdo";
        }
        return "none";
    }

    private static int rank(String kind) {
        return switch (kind) {
            case "termine" -> 4;
            case "group" -> 3;
            case "cdo" -> 2;
            default -> 1;
        };
    }

    static String statusLabel(String status) {
        return switch (status) {
            case STATUS_RECONCILIE -> "Réconcilié & validé";
            case STATUS_NON_RECONCILIE -> "Non réconcilié";
            case "EN_COURS_GROUP" -> "En cours de clôture";
            case "EN_COURS_CDO" -> "En cours de validation";
            case "EN_COURS_SUPPORT" -> "En cours de traitement";
            default -> "En cours";
        };
    }

    private String buildSubject(RecoBlockingCommentMailAlertEntity alert, String status) {
        return String.format("Réconciliation en attente — %s (%s) — %s — %s",
            alert.getService(), alert.getCountry(), formatDateFr(alert.getRecoDate()), statusLabel(status));
    }

    private String buildBody(RecoBlockingCommentMailAlertEntity alert, RecoJ1BlockingCommentEntity comment, String status) {
        long pendingDays = ChronoUnit.DAYS.between(parseDate(alert.getRecoDate()), LocalDate.now());
        StringBuilder body = new StringBuilder();
        body.append("Bonjour,\n\n");
        body.append("La réconciliation suivante n'est toujours pas validée :\n");
        body.append("• Service : ").append(alert.getService()).append('\n');
        body.append("• Pays : ").append(alert.getCountry()).append('\n');
        body.append("• Environnement : ").append(alert.getEnv()).append('\n');
        body.append("• Date de réconciliation : ").append(formatDateFr(alert.getRecoDate()))
            .append(" (J+").append(pendingDays).append(")\n");
        body.append("• Statut : ").append(statusLabel(status)).append("\n\n");
        body.append("Commentaire");
        if (comment.getUpdatedBy() != null && !comment.getUpdatedBy().isBlank()) {
            body.append(" de ").append(comment.getUpdatedBy().trim());
        }
        body.append(" :\n").append(comment.getCommentText()).append("\n\n");
        body.append("Page « État des réconciliations » (après connexion) :\n");
        body.append(pageUrl()).append("\n\n");
        body.append("Cet e-mail est renvoyé chaque jour tant que le statut de cette réconciliation ne change pas.\n\n");
        body.append("Cordialement,\n");
        body.append("L'équipe de réconciliation");
        return body.toString();
    }

    private String pageUrl() {
        String base = appUrl != null ? appUrl.trim() : "http://localhost:4200";
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/etat-reconciliations";
    }

    static List<String> normalizeRecipients(List<String> raw, boolean required) {
        Set<String> unique = new LinkedHashSet<>();
        List<String> invalid = new ArrayList<>();
        for (String value : raw == null ? Collections.<String>emptyList() : raw) {
            if (value == null) {
                continue;
            }
            for (String part : value.split("[,;\\s]+")) {
                String email = part.trim().toLowerCase(Locale.ROOT);
                if (email.isEmpty()) {
                    continue;
                }
                if (EMAIL.matcher(email).matches()) {
                    unique.add(email);
                } else {
                    invalid.add(part.trim());
                }
            }
        }
        if (!invalid.isEmpty()) {
            throw new IllegalArgumentException("Adresse(s) e-mail invalide(s) : " + String.join(", ", invalid));
        }
        if (required && unique.isEmpty()) {
            throw new IllegalArgumentException("Au moins une adresse e-mail destinataire est requise.");
        }
        if (unique.size() > MAX_RECIPIENTS) {
            throw new IllegalArgumentException("Maximum " + MAX_RECIPIENTS + " destinataires.");
        }
        return new ArrayList<>(unique);
    }

    static List<String> splitRecipients(String stored) {
        if (stored == null || stored.isBlank()) {
            return List.of();
        }
        return Arrays.stream(stored.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    private static String normalizeText(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "");
    }

    private static LocalDate parseDate(String recoDate) {
        try {
            return LocalDate.parse(recoDate);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Date de réconciliation invalide : " + recoDate);
        }
    }

    private static String formatDateFr(String recoDate) {
        try {
            return LocalDate.parse(recoDate).format(FR_DATE);
        } catch (DateTimeParseException e) {
            return recoDate;
        }
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Périmètre d'un commentaire, normalisé comme dans {@link RecoJ1BlockingCommentService}. */
    record Scope(String recoDate, String service, String country, String env) {
        static Scope of(RecoBlockingCommentMailAlertRequest request) {
            if (request == null) {
                throw new IllegalArgumentException("Corps de requête manquant.");
            }
            String recoDate = trimToNull(request.getRecoDate());
            String service = trimToNull(request.getService());
            String country = trimToNull(request.getCountry());
            if (recoDate == null || service == null || country == null) {
                throw new IllegalArgumentException("Date, service et pays sont obligatoires.");
            }
            parseDate(recoDate);
            return new Scope(recoDate, service, country.toUpperCase(Locale.ROOT),
                RecoJ1BlockingCommentService.normalizeEnvForStorage(request.getEnv()));
        }
    }
}
