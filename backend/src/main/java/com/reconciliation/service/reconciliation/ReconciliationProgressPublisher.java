package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.model.ReconciliationProgress;
import com.reconciliation.service.ReconciliationProgressService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ReconciliationProgressPublisher {

    private static final Logger logger = LoggerFactory.getLogger(ReconciliationProgressPublisher.class);
    private final ReconciliationProgressService progressService;

    public ReconciliationProgressPublisher(ReconciliationProgressService progressService) {
        this.progressService = progressService;
    }

    void publishProgress(
            ReconciliationRequest request,
            double percentage,
            String step,
            int processedRecords,
            int totalRecords,
            int matchesCount,
            int boOnlyCount,
            int partnerRemaining) {

        String sessionId = request.getProgressSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }

        progressService.updateProgress(
            sessionId,
            ReconciliationProgress.detailed(
                Math.min(100.0, Math.max(0.0, percentage)),
                step,
                processedRecords,
                totalRecords,
                matchesCount,
                boOnlyCount,
                partnerRemaining
            )
        );
    }
}