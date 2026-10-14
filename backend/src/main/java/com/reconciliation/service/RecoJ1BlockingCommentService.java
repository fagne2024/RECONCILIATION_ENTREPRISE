package com.reconciliation.service;

import com.reconciliation.dto.RecoJ1BlockingCommentDto;
import com.reconciliation.dto.RecoJ1BlockingCommentSaveRequest;
import com.reconciliation.entity.RecoJ1BlockingCommentEntity;
import com.reconciliation.repository.RecoJ1BlockingCommentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class RecoJ1BlockingCommentService {

    private final RecoJ1BlockingCommentRepository repository;
    private final JdbcTemplate jdbcTemplate;

    private volatile boolean schemaReady = false;

    public void ensureSchema() {
        if (schemaReady) {
            return;
        }
        synchronized (this) {
            if (schemaReady) {
                return;
            }
            try {
                Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reco_j1_blocking_comment'",
                    Integer.class
                );
                if (count == null || count == 0) {
                    log.info("Création de la table reco_j1_blocking_comment...");
                    jdbcTemplate.execute(
                        "CREATE TABLE IF NOT EXISTS reco_j1_blocking_comment (" +
                            "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                            "reco_date VARCHAR(10) NOT NULL, " +
                            "service VARCHAR(255) NOT NULL, " +
                            "country VARCHAR(128) NOT NULL, " +
                            "env VARCHAR(32) NOT NULL, " +
                            "comment_text TEXT NOT NULL, " +
                            "updated_by VARCHAR(128) NULL, " +
                            "updated_at DATETIME(6) NULL, " +
                            "UNIQUE KEY uk_reco_j1_blocking_scope (reco_date, service, country, env)" +
                            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
                    );
                }
                schemaReady = true;
            } catch (Exception e) {
                log.error("Échec initialisation reco_j1_blocking_comment: {}", e.getMessage(), e);
                throw new IllegalStateException("Table reco_j1_blocking_comment indisponible", e);
            }
        }
    }

    @Transactional(readOnly = true)
    public List<RecoJ1BlockingCommentDto> listBetween(String startDate, String endDate) {
        ensureSchema();
        return repository
            .findByRecoDateGreaterThanEqualAndRecoDateLessThanEqual(startDate, endDate)
            .stream()
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    @Transactional
    public RecoJ1BlockingCommentDto save(RecoJ1BlockingCommentSaveRequest body, String username) {
        ensureSchema();

        String recoDate = blankToNull(body.getRecoDate());
        String service = blankToNull(body.getService());
        String country = normalizeCountry(body.getCountry());
        String env = normalizeEnvForStorage(body.getEnv());
        String commentText = blankToNull(body.getCommentText());

        if (recoDate == null || service == null || country == null || commentText == null) {
            throw new IllegalArgumentException("Date, service, pays et commentaire sont obligatoires.");
        }

        RecoJ1BlockingCommentEntity entity = repository
            .findByRecoDateAndServiceAndCountryAndEnv(recoDate, service, country, env)
            .orElseGet(RecoJ1BlockingCommentEntity::new);

        entity.setRecoDate(recoDate);
        entity.setService(service);
        entity.setCountry(country);
        entity.setEnv(env);
        entity.setCommentText(commentText.trim());
        if (username != null && !username.isBlank()) {
            entity.setUpdatedBy(username.trim());
        }

        return toDto(repository.save(entity));
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeCountry(String country) {
        String trimmed = blankToNull(country);
        if (trimmed == null) {
            return null;
        }
        return trimmed.toUpperCase();
    }

    static String normalizeEnvForStorage(String env) {
        String trimmed = blankToNull(env);
        if (trimmed == null || "ALL".equalsIgnoreCase(trimmed)) {
            return "T-E";
        }
        String upper = trimmed.toUpperCase();
        return "TOTAL".equals(upper) || "T-E".equals(upper) ? "T-E" : upper;
    }

    private RecoJ1BlockingCommentDto toDto(RecoJ1BlockingCommentEntity entity) {
        RecoJ1BlockingCommentDto dto = new RecoJ1BlockingCommentDto();
        dto.setRecoDate(entity.getRecoDate());
        dto.setService(entity.getService());
        dto.setCountry(entity.getCountry());
        dto.setEnv(entity.getEnv());
        dto.setCommentText(entity.getCommentText());
        dto.setUpdatedBy(entity.getUpdatedBy());
        dto.setUpdatedAt(entity.getUpdatedAt() != null ? entity.getUpdatedAt().toString() : null);
        return dto;
    }
}
