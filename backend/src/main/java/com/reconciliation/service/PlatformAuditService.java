package com.reconciliation.service;

import com.reconciliation.entity.PlatformAuditLogEntity;
import com.reconciliation.repository.PlatformAuditLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Journal des actions de la plateforme (SUPER_ADMIN).
 *
 * <p>L'enregistrement participe a la transaction de l'action : si celle-ci
 * echoue, la trace est annulee avec elle (coherence).</p>
 */
@Service
public class PlatformAuditService {

    private static final int MAX_LIMIT = 500;

    private final PlatformAuditLogRepository repository;

    public PlatformAuditService(PlatformAuditLogRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void record(String actorUsername, String action, String targetType,
                       String targetId, String details) {
        PlatformAuditLogEntity entry = new PlatformAuditLogEntity();
        entry.setActorUsername(actorUsername != null ? actorUsername : "inconnu");
        entry.setAction(action);
        entry.setTargetType(targetType);
        entry.setTargetId(targetId);
        entry.setDetails(details);
        entry.setCreatedAt(LocalDateTime.now());
        repository.save(entry);
    }

    @Transactional(readOnly = true)
    public List<PlatformAuditLogEntity> recent(int limit) {
        int safeLimit = (limit <= 0) ? 200 : Math.min(limit, MAX_LIMIT);
        return repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, safeLimit)).getContent();
    }

    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<PlatformAuditLogEntity> search(String action, String search, PageRequest pageable) {
        return repository.search(action, search, pageable);
    }
}
