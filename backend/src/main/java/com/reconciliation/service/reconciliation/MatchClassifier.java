package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class MatchClassifier {

    private static final Logger logger = LoggerFactory.getLogger(MatchClassifier.class);

    int collectPartnerOnlyRecords(
            Map<String, List<Map<String, String>>> partnerIndex,
            ReconciliationResponse response,
            String partnerKeyColumn,
            List<ReconciliationRequest.AdditionalKey> additionalKeys) {

        int partnerOnlyCount = 0;
        for (List<Map<String, String>> partnersForKey : partnerIndex.values()) {
            synchronized (partnersForKey) {
                for (Map<String, String> partnerRecord : partnersForKey) {
                    response.getPartnerOnly().add(partnerRecord);
                    partnerOnlyCount++;
                    if (partnerOnlyCount <= 10) {
                        String partnerKey = buildCompositeKey(partnerRecord, partnerKeyColumn, additionalKeys, false);
                        logger.info("Enregistrement uniquement partenaire trouvé: {}", partnerKey);
                    }
                }
            }
        }
        return partnerOnlyCount;
    }

    String buildCompositeKey(Map<String, String> record, String primaryKeyColumn,
                            List<ReconciliationRequest.AdditionalKey> additionalKeys,
                            boolean isBoRecord) {
        String primaryKey = record.get(primaryKeyColumn);
        if (primaryKey == null) {
            return null;
        }

        if (additionalKeys == null || additionalKeys.isEmpty()) {
            return primaryKey;
        }

        StringBuilder compositeKey = new StringBuilder(primaryKey);
        for (ReconciliationRequest.AdditionalKey additionalKey : additionalKeys) {
            String columnName = isBoRecord ? additionalKey.getBoColumn() : additionalKey.getPartnerColumn();
            String value = record.get(columnName);
            compositeKey.append("||").append(value != null ? value : "");
        }

        return compositeKey.toString();
    }
}