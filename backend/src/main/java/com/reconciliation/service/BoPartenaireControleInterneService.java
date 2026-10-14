package com.reconciliation.service;

import com.reconciliation.dto.BoPartenaireControleInterneDto;
import com.reconciliation.dto.BoPartenaireControleInterneValidateRequest;
import com.reconciliation.entity.BoPartenaireControleInterneEntity;
import com.reconciliation.exception.ControleInterneAccessDeniedException;
import com.reconciliation.dto.BoPartenaireControleInterneCommentDto;
import com.reconciliation.dto.BoPartenaireControleInterneCommentSaveRequest;
import com.reconciliation.dto.BoPartenaireControleInterneSendEmailRequest;
import com.reconciliation.entity.BoPartenaireControleInterneCommentEntity;
import com.reconciliation.repository.BoPartenaireControleInterneCommentRepository;
import com.reconciliation.repository.BoPartenaireControleInterneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class BoPartenaireControleInterneService {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final BoPartenaireControleInterneRepository repository;
    private final BoPartenaireControleInterneCommentRepository commentRepository;
    private final PermissionCheckService permissionCheckService;
    private final EmailService emailService;

    public BoPartenaireControleInterneService(
        BoPartenaireControleInterneRepository repository,
        BoPartenaireControleInterneCommentRepository commentRepository,
        PermissionCheckService permissionCheckService,
        EmailService emailService
    ) {
        this.repository = repository;
        this.commentRepository = commentRepository;
        this.permissionCheckService = permissionCheckService;
        this.emailService = emailService;
    }

    public List<BoPartenaireControleInterneDto> list(
        String country,
        String env,
        String startMonth,
        String endMonth
    ) {
        String normalizedCountry = normalize(country);
        String normalizedEnv = normalizeEnv(env);
        String start = normalizeMonth(startMonth);
        String end = normalizeMonth(endMonth);

        return repository
            .findByCountryAndEnvAndMonthYyyyMmBetween(normalizedCountry, normalizedEnv, start, end)
            .stream()
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    @Transactional
    public BoPartenaireControleInterneDto validate(
        BoPartenaireControleInterneValidateRequest request,
        String username
    ) {
        assertCanValidate(username);

        if (request == null) {
            throw new IllegalArgumentException("Corps de requête manquant");
        }

        String month = normalizeMonth(request.getMonthYyyyMm());
        String country = normalize(request.getCountry());
        String env = normalizeEnv(request.getEnv());
        String service = normalize(request.getService());

        if (month.isEmpty() || country.isEmpty() || service.isEmpty()) {
            throw new IllegalArgumentException("Mois, pays et service sont obligatoires");
        }

        BoPartenaireControleInterneEntity entity = repository
            .findByMonthYyyyMmAndCountryAndEnvAndService(month, country, env, service)
            .orElseGet(BoPartenaireControleInterneEntity::new);

        entity.setMonthYyyyMm(month);
        entity.setCountry(country);
        entity.setEnv(env);
        entity.setService(service);
        entity.setStatut(BoPartenaireControleInterneEntity.STATUT_VALIDE);
        entity.setValidatedBy(username != null && !username.isBlank() ? username.trim() : "system");
        entity.setValidatedAt(LocalDateTime.now());

        return toDto(repository.save(entity));
    }

    @Transactional
    public BoPartenaireControleInterneDto revoke(
        BoPartenaireControleInterneValidateRequest request,
        String username
    ) {
        assertCanRevoke(username);

        if (request == null) {
            throw new IllegalArgumentException("Corps de requête manquant");
        }

        String month = normalizeMonth(request.getMonthYyyyMm());
        String country = normalize(request.getCountry());
        String env = normalizeEnv(request.getEnv());
        String service = normalize(request.getService());

        if (month.isEmpty() || country.isEmpty() || service.isEmpty()) {
            throw new IllegalArgumentException("Mois, pays et service sont obligatoires");
        }

        BoPartenaireControleInterneEntity entity = repository
            .findByMonthYyyyMmAndCountryAndEnvAndService(month, country, env, service)
            .orElseThrow(() -> new IllegalArgumentException("Aucune validation trouvée pour cette ligne"));

        entity.setStatut(BoPartenaireControleInterneEntity.STATUT_EN_COURS);
        entity.setValidatedBy(null);
        entity.setValidatedAt(null);

        return toDto(repository.save(entity));
    }

    public BoPartenaireControleInterneCommentDto getComment(
        String country,
        String env,
        String monthYyyyMm
    ) {
        String month = normalizeMonth(monthYyyyMm);
        String normalizedCountry = normalize(country);
        String normalizedEnv = normalizeEnv(env);
        if (month.isEmpty() || normalizedCountry.isEmpty()) {
            return emptyCommentDto(month, normalizedCountry, normalizedEnv);
        }
        return commentRepository
            .findByMonthYyyyMmAndCountryAndEnv(month, normalizedCountry, normalizedEnv)
            .map(this::toCommentDto)
            .orElseGet(() -> emptyCommentDto(month, normalizedCountry, normalizedEnv));
    }

    @Transactional
    public BoPartenaireControleInterneCommentDto saveComment(
        BoPartenaireControleInterneCommentSaveRequest request,
        String username
    ) {
        assertCanModifyComment(username);
        if (request == null) {
            throw new IllegalArgumentException("Corps de requête manquant");
        }
        String month = normalizeMonth(request.getMonthYyyyMm());
        String country = normalize(request.getCountry());
        String env = normalizeEnv(request.getEnv());
        if (month.isEmpty() || country.isEmpty()) {
            throw new IllegalArgumentException("Mois et pays sont obligatoires");
        }
        BoPartenaireControleInterneCommentEntity entity = commentRepository
            .findByMonthYyyyMmAndCountryAndEnv(month, country, env)
            .orElseGet(BoPartenaireControleInterneCommentEntity::new);
        entity.setMonthYyyyMm(month);
        entity.setCountry(country);
        entity.setEnv(env);
        entity.setCommentaire(normalizeComment(request.getCommentaire()));
        entity.setUpdatedBy(username != null && !username.isBlank() ? username.trim() : "system");
        entity.setUpdatedAt(LocalDateTime.now());
        return toCommentDto(commentRepository.save(entity));
    }

    @Transactional
    public BoPartenaireControleInterneCommentDto sendCommentEmail(
        BoPartenaireControleInterneSendEmailRequest request,
        String username
    ) {
        assertCanSendEmail(username);
        if (request == null) {
            throw new IllegalArgumentException("Corps de requête manquant");
        }
        String month = normalizeMonth(request.getMonthYyyyMm());
        String country = normalize(request.getCountry());
        String env = normalizeEnv(request.getEnv());
        if (month.isEmpty() || country.isEmpty()) {
            throw new IllegalArgumentException("Mois et pays sont obligatoires");
        }
        List<String> recipients = normalizeRecipients(request.getRecipients());
        if (recipients.isEmpty()) {
            throw new IllegalArgumentException("Au moins une adresse e-mail destinataire est requise");
        }

        String commentaire = normalizeComment(request.getCommentaire());
        String summaryText = request.getSummaryText() != null ? request.getSummaryText().trim() : "";
        String pageUrl = buildControleInternePageUrl(country, env, month);
        String subject = String.format(
            "Contrôle interne BO vs Partenaire — %s — %s — %s",
            country,
            env,
            month
        );
        StringBuilder body = new StringBuilder();
        body.append("Bonjour,\n\n");
        body.append("Voici le commentaire de contrôle interne pour le périmètre suivant :\n");
        body.append("• Pays : ").append(country).append('\n');
        body.append("• Environnement : ").append(env).append('\n');
        body.append("• Période : ").append(month).append("\n\n");
        if (!summaryText.isEmpty()) {
            body.append("Synthèse :\n").append(summaryText).append("\n\n");
        }
        body.append("Commentaire :\n");
        body.append(commentaire.isEmpty() ? "(aucun commentaire saisi)" : commentaire).append("\n\n");
        body.append("Accès à l'application ReconciliApp :\n");
        body.append(emailService.getLoginUrl()).append("\n\n");
        body.append("Page contrôle interne (après connexion) :\n");
        body.append(pageUrl).append("\n\n");
        body.append("Cordialement,\n");
        body.append(username != null && !username.isBlank() ? username.trim() : "L'équipe de réconciliation");

        for (String recipient : recipients) {
            emailService.sendControleInterneCommentEmail(recipient, subject, body.toString());
        }

        BoPartenaireControleInterneCommentEntity entity = commentRepository
            .findByMonthYyyyMmAndCountryAndEnv(month, country, env)
            .orElseGet(BoPartenaireControleInterneCommentEntity::new);
        entity.setMonthYyyyMm(month);
        entity.setCountry(country);
        entity.setEnv(env);
        entity.setCommentaire(commentaire);
        entity.setUpdatedBy(username != null && !username.isBlank() ? username.trim() : "system");
        entity.setUpdatedAt(LocalDateTime.now());
        entity.setLastEmailedAt(LocalDateTime.now());
        entity.setLastEmailedBy(username != null && !username.isBlank() ? username.trim() : "system");
        return toCommentDto(commentRepository.save(entity));
    }

    private BoPartenaireControleInterneCommentDto emptyCommentDto(
        String month,
        String country,
        String env
    ) {
        BoPartenaireControleInterneCommentDto dto = new BoPartenaireControleInterneCommentDto();
        dto.setMonthYyyyMm(month);
        dto.setCountry(country);
        dto.setEnv(env);
        dto.setCommentaire("");
        return dto;
    }

    private BoPartenaireControleInterneCommentDto toCommentDto(BoPartenaireControleInterneCommentEntity e) {
        BoPartenaireControleInterneCommentDto dto = new BoPartenaireControleInterneCommentDto();
        dto.setMonthYyyyMm(e.getMonthYyyyMm());
        dto.setCountry(e.getCountry());
        dto.setEnv(e.getEnv());
        dto.setCommentaire(e.getCommentaire() != null ? e.getCommentaire() : "");
        dto.setUpdatedBy(e.getUpdatedBy());
        if (e.getUpdatedAt() != null) {
            dto.setUpdatedAt(e.getUpdatedAt().format(ISO));
        }
        if (e.getLastEmailedAt() != null) {
            dto.setLastEmailedAt(e.getLastEmailedAt().format(ISO));
        }
        dto.setLastEmailedBy(e.getLastEmailedBy());
        return dto;
    }

    private String normalizeComment(String value) {
        return value != null ? value.trim() : "";
    }

    private List<String> normalizeRecipients(List<String> recipients) {
        Set<String> unique = new LinkedHashSet<>();
        if (recipients != null) {
            for (String raw : recipients) {
                if (raw == null) {
                    continue;
                }
                for (String part : raw.split("[,;\\s]+")) {
                    String email = part.trim().toLowerCase();
                    if (!email.isEmpty() && email.contains("@")) {
                        unique.add(email);
                    }
                }
            }
        }
        return new ArrayList<>(unique);
    }

    private String buildControleInternePageUrl(String country, String env, String monthYyyyMm) {
        String year = monthYyyyMm.length() >= 4 ? monthYyyyMm.substring(0, 4) : "";
        String month = monthYyyyMm.length() >= 7 ? monthYyyyMm.substring(5, 7) : "";
        return String.format(
            "https://reconciliation.intouchgroup.net:4200/controle-interne-bo-partenaire?country=%s&env=%s&year=%s&month=%s",
            country,
            env,
            year,
            month
        );
    }

    private void assertCanValidate(String username) {
        if (!permissionCheckService.canValidateBoPartenaireControleInterne(username)) {
            throw new ControleInterneAccessDeniedException(
                "Vous n'avez pas la permission « valider_controle_interne » pour ce sous-menu."
            );
        }
    }

    private void assertCanRevoke(String username) {
        if (!permissionCheckService.canRevokeBoPartenaireControleInterne(username)) {
            throw new ControleInterneAccessDeniedException(
                "Seul un administrateur peut annuler une validation de contrôle interne."
            );
        }
    }

    private void assertCanModifyComment(String username) {
        if (!permissionCheckService.hasSubmenuActionPermission(
            username,
            "Résultats · Contrôle interne BO vs Partenaire",
            "modifier_commentaire_controle_interne"
        )) {
            throw new ControleInterneAccessDeniedException(
                "Vous n'avez pas la permission « modifier_commentaire_controle_interne » pour ce sous-menu."
            );
        }
    }

    private void assertCanSendEmail(String username) {
        if (!permissionCheckService.hasSubmenuActionPermission(
            username,
            "Résultats · Contrôle interne BO vs Partenaire",
            "envoyer_email_controle_interne"
        )) {
            throw new ControleInterneAccessDeniedException(
                "Vous n'avez pas la permission « envoyer_email_controle_interne » pour ce sous-menu."
            );
        }
    }

    private BoPartenaireControleInterneDto toDto(BoPartenaireControleInterneEntity e) {
        BoPartenaireControleInterneDto dto = new BoPartenaireControleInterneDto();
        dto.setId(e.getId());
        dto.setMonthYyyyMm(e.getMonthYyyyMm());
        dto.setCountry(e.getCountry());
        dto.setEnv(e.getEnv());
        dto.setService(e.getService());
        dto.setStatut(e.getStatut());
        dto.setValidatedBy(e.getValidatedBy());
        if (e.getValidatedAt() != null) {
            dto.setValidatedAt(e.getValidatedAt().format(ISO));
        }
        return dto;
    }

    private String normalize(String value) {
        return value != null ? value.trim() : "";
    }

    private String normalizeEnv(String env) {
        String v = normalize(env);
        return v.isEmpty() ? "ALL" : v.toUpperCase();
    }

    private String normalizeMonth(String month) {
        String v = normalize(month);
        if (v.endsWith("-ALL")) {
            return v.length() >= 8 ? v.substring(0, 8) : v;
        }
        if (v.length() >= 7) {
            return v.substring(0, 7);
        }
        return v;
    }
}
