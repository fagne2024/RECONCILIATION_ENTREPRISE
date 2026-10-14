package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import com.reconciliation.dto.ColumnComparison;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.Objects;

@Service
public class BatchProcessor {

    private static final Logger logger = LoggerFactory.getLogger(BatchProcessor.class);
    public static final int BATCH_SIZE = 10000;

    public static class BatchResult {
        private final List<ReconciliationResponse.Match> matches;
        private final List<Map<String, String>> boOnly;
        private final List<Map<String, String>> mismatches;
        private final int processedCount;

        public BatchResult(List<ReconciliationResponse.Match> matches,
                          List<Map<String, String>> boOnly,
                          List<Map<String, String>> mismatches,
                          int processedCount) {
            this.matches = matches;
            this.boOnly = boOnly;
            this.mismatches = mismatches;
            this.processedCount = processedCount;
        }

        public List<ReconciliationResponse.Match> getMatches() { return matches; }
        public List<Map<String, String>> getBoOnly() { return boOnly; }
        public List<Map<String, String>> getMismatches() { return mismatches; }
        public int getProcessedCount() { return processedCount; }
    }

    public BatchResult processBatch(
            List<Map<String, String>> batch,
            Map<String, List<Map<String, String>>> partnerIndex,
            ReconciliationRequest request,
            String normalizedBoKeyColumn) {

        List<ReconciliationResponse.Match> matches = new ArrayList<>();
        List<Map<String, String>> boOnly = new ArrayList<>();
        List<Map<String, String>> mismatches = new ArrayList<>();
        int processedCount = 0;

        for (Map<String, String> boRecord : batch) {
            String boKey = buildCompositeKey(boRecord, normalizedBoKeyColumn, 
                                            request.getAdditionalKeys(), true);
            if (boKey == null) {
                boOnly.add(boRecord);
                processedCount++;
                continue;
            }

            List<Map<String, String>> partnersForKey = partnerIndex.get(boKey);
            Map<String, String> partnerRecord = null;

            if (partnersForKey != null) {
                synchronized (partnersForKey) {
                    if (!partnersForKey.isEmpty()) {
                        partnerRecord = partnersForKey.remove(0);
                    }
                }
            }

            if (partnerRecord == null) {
                boOnly.add(boRecord);
                processedCount++;
            } else {
                List<ReconciliationResponse.Difference> differences = new ArrayList<>();
                boolean isMatch = true;

                for (ColumnComparison comparison : request.getComparisonColumns()) {
                    String boValue = boRecord.get(comparison.getBoColumn());
                    String partnerValue = partnerRecord.get(comparison.getPartnerColumn());
                    
                    if (!Objects.equals(boValue, partnerValue)) {
                        ReconciliationResponse.Difference difference = new ReconciliationResponse.Difference();
                        difference.setBoColumn(comparison.getBoColumn());
                        difference.setPartnerColumn(comparison.getPartnerColumn());
                        difference.setBoValue(boValue);
                        difference.setPartnerValue(partnerValue);
                        difference.setDifferent(true);
                        
                        differences.add(difference);
                        isMatch = false;
                    }
                }

                if (isMatch) {
                    ReconciliationResponse.Match match = new ReconciliationResponse.Match();
                    match.setKey(boRecord.get(request.getBoKeyColumn()));
                    match.setBoData(boRecord);
                    match.setPartnerData(partnerRecord);
                    match.setDifferences(differences);
                    matches.add(match);
                } else {
                    mismatches.add(boRecord);
                    // Remettre la ligne partenaire
                    synchronized (partnersForKey) {
                        partnersForKey.add(0, partnerRecord);
                    }
                }
                processedCount++;
            }
        }

        return new BatchResult(matches, boOnly, mismatches, processedCount);
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