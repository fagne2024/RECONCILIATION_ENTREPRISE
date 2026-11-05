package com.reconciliation.service;

import com.reconciliation.model.ReconciliationProgress;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class ReconciliationProgressService {
    private final ConcurrentHashMap<String, ReconciliationProgress> progressMap = new ConcurrentHashMap<>();

    public void updateProgress(String sessionId, ReconciliationProgress progress) {
        progressMap.put(tenantKey(sessionId), progress);
    }

    public ReconciliationProgress getProgress(String sessionId) {
        return progressMap.getOrDefault(tenantKey(sessionId), new ReconciliationProgress(0, "En attente", 0, 0));
    }

    public void createJob(String jobId, String message) {
        ReconciliationProgress progress = new ReconciliationProgress(0, message, 0, 0);
        progressMap.put(tenantKey(jobId), progress);
    }

    /**
     * Scinde les cles de progression par entreprise : un identifiant de session
     * fourni par le client ne doit pas permettre de lire la progression d'une
     * autre entreprise.
     */
    private static String tenantKey(String sessionId) {
        Long tenant = com.reconciliation.tenant.TenantContext.get();
        return (tenant == null ? "0" : tenant.toString()) + ":" + sessionId;
    }
} 