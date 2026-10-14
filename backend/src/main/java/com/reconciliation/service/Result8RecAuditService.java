package com.reconciliation.service;

import com.reconciliation.dto.Result8RecAuditActionStatDto;
import com.reconciliation.dto.Result8RecAuditDto;
import com.reconciliation.entity.Result8RecAuditEntity;
import com.reconciliation.entity.Result8RecEntity;
import com.reconciliation.repository.Result8RecAuditRepository;
import com.reconciliation.util.CountryNormalizationUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Enregistre et expose l'historique des actions par ligne rapport (données, statut, traitement, validation).
 */
@Service
@RequiredArgsConstructor
public class Result8RecAuditService {

    public static final String SAUVEGARDE_RESULTAT = "SAUVEGARDE_RESULTAT";
    public static final String STATUT_OK = "STATUT_OK";
    public static final String CHANGEMENT_STATUT = "CHANGEMENT_STATUT";
    public static final String VALIDATION_TERMINÉ = "VALIDATION_TERMINÉ";
    public static final String CHANGEMENT_TRAITEMENT = "CHANGEMENT_TRAITEMENT";
    public static final String CREATION = "CREATION";

    private final Result8RecAuditRepository auditRepository;

    @Transactional(readOnly = true)
    public List<Result8RecAuditDto> listHistory(Long result8recId) {
        return auditRepository.findByResult8recIdOrderByCreatedAtAsc(result8recId).stream()
                .map(Result8RecAuditService::toDto)
                .collect(Collectors.toList());
    }

    public static Result8RecAuditDto toDto(Result8RecAuditEntity e) {
        return new Result8RecAuditDto(
                e.getId(),
                e.getActionType(),
                e.getUsername(),
                e.getTraitementSnapshot(),
                e.getStatusSnapshot(),
                e.getDetail(),
                e.getCreatedAt()
        );
    }

    /**
     * Agrège les actions d'audit sur une période pour le « Top 3 des utilisateurs ».
     *
     * <p>Filtres appliqués : période (sur {@code createdAt}), service exact, ENV strict
     * (T-E = agrégat sans env explicite) et périmètre pays (variantes demandées +
     * pays autorisés de l'utilisateur pour le cloisonnement).</p>
     *
     * @param start                    début de période inclusif
     * @param endExclusive             fin de période exclusive
     * @param service                  service exact ou {@code null}
     * @param envKey                   clé ENV stricte ({@code 'T-E'} pour l'agrégat) ou {@code null}
     * @param requestedCountryVariants variantes pays demandées (minuscules) ou {@code null} (tous)
     * @param allowedCountryCodes      codes pays autorisés de l'utilisateur ou {@code null} (tous)
     */
    @Transactional(readOnly = true)
    public List<Result8RecAuditActionStatDto> aggregateActions(
            LocalDateTime start,
            LocalDateTime endExclusive,
            String service,
            String envKey,
            List<String> requestedCountryVariants,
            List<String> allowedCountryCodes
    ) {
        if (start == null || endExclusive == null || !start.isBefore(endExclusive)) {
            return List.of();
        }
        // Périmètre vide (aucun pays autorisé pour l'utilisateur) : rien à renvoyer.
        if (allowedCountryCodes != null && allowedCountryCodes.isEmpty()) {
            return List.of();
        }

        List<Object[]> grouped = auditRepository.aggregateActionsByUserAndCountry(
                start, endExclusive, service
        );

        Map<StatKey, Long> totals = new LinkedHashMap<>();
        for (Object[] row : grouped) {
            String username = row[0] != null ? String.valueOf(row[0]).trim() : "";
            if (username.isEmpty()) {
                continue;
            }
            if (!matchesCountryFilter(
                    row[3] != null ? String.valueOf(row[3]) : null,
                    requestedCountryVariants,
                    allowedCountryCodes)) {
                continue;
            }
            if (!matchesEnvKey(row[4] != null ? String.valueOf(row[4]) : null, envKey)) {
                continue;
            }
            String actionType = row[1] != null ? String.valueOf(row[1]) : "";
            String traitementSnapshot = row[2] != null ? String.valueOf(row[2]) : null;
            long count = row[5] instanceof Number n ? n.longValue() : 0L;
            if (count <= 0) {
                continue;
            }
            totals.merge(new StatKey(username, actionType, traitementSnapshot), count, Long::sum);
        }

        return totals.entrySet().stream()
                .map(e -> new Result8RecAuditActionStatDto(
                        e.getKey().username(),
                        e.getKey().actionType(),
                        e.getKey().traitementSnapshot(),
                        e.getValue()))
                .collect(Collectors.toList());
    }

    private static boolean matchesCountryFilter(
            String rowCountry,
            List<String> requestedCountryVariants,
            List<String> allowedCountryCodes
    ) {
        if (requestedCountryVariants != null && !requestedCountryVariants.isEmpty()) {
            String normalized = rowCountry == null ? "" : rowCountry.trim().toLowerCase(Locale.ROOT);
            if (!requestedCountryVariants.contains(normalized)) {
                return false;
            }
        }
        if (allowedCountryCodes != null) {
            if (rowCountry == null || rowCountry.isBlank()) {
                return false;
            }
            String code = CountryNormalizationUtil.normalizeToCode(rowCountry);
            return allowedCountryCodes.contains(code);
        }
        return true;
    }

    /**
     * Filtre ENV strict aligné sur le frontend « État des réconciliations » :
     * vide / TOTAL / T-E → clé {@code 'T-E'} ; une clé précise ne matche que cet ENV.
     * {@code envKey} à {@code null} = pas de filtre.
     */
    private static boolean matchesEnvKey(String rowEnv, String envKey) {
        if (envKey == null) {
            return true;
        }
        return strictEnvKey(rowEnv).equals(envKey);
    }

    private static String strictEnvKey(String env) {
        String trimmed = env == null ? "" : env.trim();
        if (trimmed.isEmpty()) {
            return "T-E";
        }
        String upper = trimmed.toUpperCase(Locale.ROOT);
        if ("TOTAL".equals(upper) || "T-E".equals(upper)) {
            return "T-E";
        }
        return upper;
    }

    private record StatKey(String username, String actionType, String traitementSnapshot) {}

    @Transactional
    public void logCreation(Result8RecEntity saved, String username) {
        if (saved == null || saved.getId() == null) {
            return;
        }
        persist(saved.getId(), CREATION,
                saved.getTraitement(),
                saved.getStatus(),
                "Ligne créée",
                username);
    }

    @Transactional
    public void appendFromDiff(Result8RecSnapshot before, Result8RecEntity after, String username) {
        if (before == null || after == null || after.getId() == null) {
            return;
        }
        Result8RecSnapshot s = Result8RecSnapshot.fromEntity(after);
        Long result8recId = after.getId();

        if (before.resultDatasetChanged(s)) {
            persist(result8recId, SAUVEGARDE_RESULTAT,
                    s.traitement,
                    s.status,
                    summarizeResultDiff(before, s),
                    username);
        }

        if (!Objects.equals(norm(before.status), norm(s.status))) {
            String detailStatut = (before.status == null || before.status.isBlank() ? "—" : before.status)
                    + " → " + (s.status == null || s.status.isBlank() ? "—" : s.status);
            if ("OK".equalsIgnoreCase(trim(s.status)) && !"OK".equalsIgnoreCase(trim(before.status))) {
                persist(result8recId, STATUT_OK, s.traitement, s.status, detailStatut, username);
            } else {
                persist(result8recId, CHANGEMENT_STATUT, s.traitement, s.status, detailStatut, username);
            }
        }

        if (!normTraitement(before.traitement).equals(normTraitement(s.traitement))) {
            String detailTr = (before.traitement == null || before.traitement.isBlank() ? "—" : before.traitement)
                    + " → " + (s.traitement == null || s.traitement.isBlank() ? "—" : s.traitement);
            if (isTermine(s.traitement) && !isTermine(before.traitement)) {
                persist(result8recId, VALIDATION_TERMINÉ, s.traitement, s.status, detailTr, username);
            } else {
                persist(result8recId, CHANGEMENT_TRAITEMENT, s.traitement, s.status, detailTr, username);
            }
        }
    }

    private static String summarizeResultDiff(Result8RecSnapshot a, Result8RecSnapshot b) {
        List<String> parts = new ArrayList<>();
        if (a.totalTransactions != b.totalTransactions) {
            parts.add("Transactions: " + a.totalTransactions + " → " + b.totalTransactions);
        }
        if (Double.compare(a.totalVolume, b.totalVolume) != 0) {
            parts.add("Volume: " + a.totalVolume + " → " + b.totalVolume);
        }
        if (a.matches != b.matches || a.boOnly != b.boOnly || a.partnerOnly != b.partnerOnly
                || a.mismatches != b.mismatches || Double.compare(a.matchRate, b.matchRate) != 0) {
            parts.add("Correspondances / écarts / taux modifiés");
        }
        if (!Objects.equals(norm(a.comment), norm(b.comment))) {
            parts.add("Commentaire mis à jour");
        }
        if (!Objects.equals(norm(a.glpiId), norm(b.glpiId))) {
            parts.add("Ticket: " + (a.glpiId == null || a.glpiId.isBlank() ? "—" : a.glpiId)
                    + " → " + (b.glpiId == null || b.glpiId.isBlank() ? "—" : b.glpiId));
        }
        return String.join("; ", parts);
    }

    private void persist(Long result8recId, String actionType,
                         String traitementSnap, String statusSnap,
                         String detail, String usernameRaw) {
        Result8RecAuditEntity row = new Result8RecAuditEntity();
        row.setResult8recId(result8recId);
        row.setActionType(actionType);
        row.setUsername(usernameRaw);
        row.setTraitementSnapshot(traitementSnap);
        row.setStatusSnapshot(statusSnap);
        row.setDetail(detail != null && detail.length() > 4000 ? detail.substring(0, 3997) + "..." : detail);
        row.setCreatedAt(LocalDateTime.now());
        auditRepository.save(row);
    }

    private static boolean isTermine(String t) {
        return t != null && t.trim().equalsIgnoreCase("Terminé");
    }

    private static String trim(String x) {
        return x == null ? "" : x.trim();
    }

    private static String normTraitement(String t) {
        return t == null ? "" : t.trim();
    }

    private static String norm(String s) {
        return s == null ? "" : s;
    }

    /** Copie des champs utiles avant / après mise à jour */
    public record Result8RecSnapshot(
            String status,
            String traitement,
            int totalTransactions,
            double totalVolume,
            int matches,
            int boOnly,
            int partnerOnly,
            int mismatches,
            double matchRate,
            String comment,
            String glpiId
    ) {
        public static Result8RecSnapshot fromEntity(Result8RecEntity e) {
            return new Result8RecSnapshot(
                    e.getStatus(),
                    e.getTraitement(),
                    e.getTotalTransactions(),
                    e.getTotalVolume(),
                    e.getMatches(),
                    e.getBoOnly(),
                    e.getPartnerOnly(),
                    e.getMismatches(),
                    e.getMatchRate(),
                    e.getComment(),
                    e.getGlpiId()
            );
        }

        boolean resultDatasetChanged(Result8RecSnapshot other) {
            return totalTransactions != other.totalTransactions
                    || Double.compare(totalVolume, other.totalVolume) != 0
                    || matches != other.matches
                    || boOnly != other.boOnly
                    || partnerOnly != other.partnerOnly
                    || mismatches != other.mismatches
                    || Double.compare(matchRate, other.matchRate) != 0
                    || !Objects.equals(norm(comment), norm(other.comment))
                    || !Objects.equals(norm(glpiId), norm(other.glpiId));
        }
    }
}
