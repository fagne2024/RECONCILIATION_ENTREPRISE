package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class ReconciliationMemoryManager {

    private static final Logger logger = LoggerFactory.getLogger(ReconciliationMemoryManager.class);

    void releaseRequestFileContent(ReconciliationRequest request) {
        if (request == null) return;
        request.setBoFileContent(null);
        request.setPartnerFileContent(null);
        logger.debug("📦 Données brutes JSON libérées");
    }

    void releaseReconciliationWorkingSets(List<Map<String, String>> processedPartnerData) {
        if (processedPartnerData != null) {
            int sizeBefore = processedPartnerData.size();
            processedPartnerData.clear();
            logger.debug("📦 Jeux de travail réconciliation libérés ({} enregistrements)", sizeBefore);
        }
    }
}