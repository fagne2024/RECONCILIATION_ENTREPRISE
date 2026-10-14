package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ParametricReconciliationService {

    private static final Logger logger = LoggerFactory.getLogger(ParametricReconciliationService.class);

    public ReconciliationResponse reconcile(ReconciliationRequest request, long startTime) {
        logger.info("🔄 Début de la réconciliation avec type paramétrable: {}", request.getReconciliationType());

        List<Map<String, String>> filteredBoRecords = applyBOFilters(request.getBoFileContent(), request.getBoColumnFilters());
        logger.info("✅ Nombre d'enregistrements BO après filtrage: {}", filteredBoRecords.size());

        ReconciliationResponse response = new ReconciliationResponse();
        response.setMatches(new ArrayList<>());
        response.setBoOnly(new ArrayList<>());
        response.setPartnerOnly(new ArrayList<>());
        response.setMismatches(new ArrayList<>());

        Map<String, List<Map<String, String>>> partnerIndex = new HashMap<>();
        for (Map<String, String> partnerRecord : request.getPartnerFileContent()) {
            String partnerKey = buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(), 
                                                  request.getAdditionalKeys(), false);
            if (partnerKey != null) {
                partnerIndex.computeIfAbsent(partnerKey, k -> new ArrayList<>()).add(partnerRecord);
            }
        }

        logger.info("✅ Index partenaire créé avec {} clés uniques", partnerIndex.size());
        if (request.getAdditionalKeys() != null && !request.getAdditionalKeys().isEmpty()) {
            logger.info("🔑 Clés supplémentaires utilisées: {} paires", request.getAdditionalKeys().size());
        }

        int expectedPartnerCount = getExpectedPartnerCount(request.getReconciliationType());
        logger.info("🎯 Nombre de correspondances partenaire attendues: {}", expectedPartnerCount);

        Set<String> processedPartnerKeys = new HashSet<>();
        int processedCount = 0;

        for (Map<String, String> boRecord : filteredBoRecords) {
            String boKey = buildCompositeKey(boRecord, request.getBoKeyColumn(), 
                                            request.getAdditionalKeys(), true);
            if (boKey == null) {
                response.getBoOnly().add(boRecord);
                processedCount++;
                continue;
            }

            List<Map<String, String>> matchingPartnerRecords = partnerIndex.get(boKey);
            int partnerMatchCount = matchingPartnerRecords != null ? matchingPartnerRecords.size() : 0;

            if (partnerMatchCount == expectedPartnerCount) {
                logger.debug("✅ CORRESPONDANCE PARFAITE ({}): {} correspondances pour key: {}", 
                    request.getReconciliationType(), partnerMatchCount, boKey);
                
                ReconciliationResponse.Match match = new ReconciliationResponse.Match();
                match.setKey(boRecord.get(request.getBoKeyColumn()));
                match.setBoData(boRecord);
                match.setReconciliationType(request.getReconciliationType());
                
                if ("1-1".equals(request.getReconciliationType())) {
                    match.setPartnerData(matchingPartnerRecords.get(0));
                    match.setPartnerDataList(null);
                } else {
                    match.setPartnerData(null);
                    match.setPartnerDataList(matchingPartnerRecords);
                    
                    Map<String, String> combinedPartnerData = new HashMap<>();
                    if (matchingPartnerRecords != null) {
                        for (int i = 0; i < matchingPartnerRecords.size(); i++) {
                            Map<String, String> partnerRecord = matchingPartnerRecords.get(i);
                            for (Map.Entry<String, String> entry : partnerRecord.entrySet()) {
                                combinedPartnerData.put(entry.getKey() + "_PARTNER_" + (i + 1), entry.getValue());
                            }
                        }
                    }
                    match.setPartnerData(combinedPartnerData);
                }
                
                match.setDifferences(new ArrayList<>());
                response.getMatches().add(match);
                processedPartnerKeys.add(boKey);

            } else if (partnerMatchCount > 0) {
                logger.debug("❌ ÉCART ({}): {} correspondances pour key: {} (attendu: {})", 
                    request.getReconciliationType(), partnerMatchCount, boKey, expectedPartnerCount);
                response.getMismatches().add(boRecord);
                if (matchingPartnerRecords != null) {
                    for (Map<String, String> partnerRecord : matchingPartnerRecords) {
                        response.getPartnerOnly().add(partnerRecord);
                    }
                }
                processedPartnerKeys.add(boKey);
            } else {
                logger.debug("📈 BO UNIQUEMENT ({}): 0 correspondances pour key: {}", 
                    request.getReconciliationType(), boKey);
                response.getBoOnly().add(boRecord);
            }

            processedCount++;

            if (processedCount % 1000 == 0) {
                double progress = (double) processedCount / filteredBoRecords.size() * 100;
                logger.info("📊 Progression réconciliation {}: {}% ({}/{} enregistrements)", 
                    request.getReconciliationType(), String.format("%.2f", progress), processedCount, filteredBoRecords.size());
            }
        }

        // Unused partner records
        for (Map<String, String> partnerRecord : request.getPartnerFileContent()) {
            String partnerKey = buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(), 
                                                  request.getAdditionalKeys(), false);
            if (partnerKey != null && !processedPartnerKeys.contains(partnerKey)) {
                response.getPartnerOnly().add(partnerRecord);
            }
        }

        response.setTotalBoRecords(filteredBoRecords.size());
        response.setTotalPartnerRecords(request.getPartnerFileContent().size());
        response.setTotalMatches(response.getMatches().size());
        response.setTotalMismatches(response.getMismatches().size());
        response.setTotalBoOnly(response.getBoOnly().size());
        response.setTotalPartnerOnly(response.getPartnerOnly().size());

        long totalTime = System.currentTimeMillis() - startTime;
        double recordsPerSecond = (double) processedCount / (totalTime / 1000.0);

        response.setExecutionTimeMs(totalTime);
        response.setProcessedRecords(processedCount);
        response.setProgressPercentage(100.0);

        logger.info("🎯 RÉSULTATS FINAUX RÉCONCILIATION {}:", request.getReconciliationType());
        logger.info("📊 Total BO: {}", response.getTotalBoRecords());
        logger.info("📊 Total Partenaire: {}", response.getTotalPartnerRecords());
        logger.info("✅ Correspondances parfaites ({}): {}", request.getReconciliationType(), response.getTotalMatches());
        logger.info("❌ Écarts: {}", response.getTotalMismatches());
        logger.info("📈 Uniquement BO: {}", response.getTotalBoOnly());
        logger.info("📈 Uniquement Partenaire: {}", response.getTotalPartnerOnly());
        logger.info("⚡ Performance: {} enregistrements/seconde", String.format("%.0f", recordsPerSecond));
        logger.info("⏱️  Temps total d'exécution: {} ms ({} secondes)", totalTime, String.format("%.2f", totalTime / 1000.0));

        return response;
    }

    private List<Map<String, String>> applyBOFilters(List<Map<String, String>> boRecords, 
                                                     List<ReconciliationRequest.BOColumnFilter> filters) {
        if (filters == null || filters.isEmpty()) return boRecords;
        
        List<Map<String, String>> filteredRecords = new ArrayList<>();
        for (Map<String, String> record : boRecords) {
            boolean shouldInclude = true;
            for (ReconciliationRequest.BOColumnFilter filter : filters) {
                String columnValue = record.get(filter.getColumnName());
                if (columnValue == null || !filter.getSelectedValues().contains(columnValue)) {
                    shouldInclude = false;
                    break;
                }
            }
            if (shouldInclude) {
                filteredRecords.add(record);
            }
        }
        return filteredRecords;
    }

    String buildCompositeKey(Map<String, String> record, String primaryKeyColumn,
                            List<ReconciliationRequest.AdditionalKey> additionalKeys,
                            boolean isBoRecord) {
        String primaryKey = record.get(primaryKeyColumn);
        if (primaryKey == null) return null;
        if (additionalKeys == null || additionalKeys.isEmpty()) return primaryKey;

        StringBuilder compositeKey = new StringBuilder(primaryKey);
        for (ReconciliationRequest.AdditionalKey additionalKey : additionalKeys) {
            String columnName = isBoRecord ? additionalKey.getBoColumn() : additionalKey.getPartnerColumn();
            String value = record.get(columnName);
            compositeKey.append("||").append(value != null ? value : "");
        }
        return compositeKey.toString();
    }

    int getExpectedPartnerCount(String reconciliationType) {
        switch (reconciliationType) {
            case "1-1": return 1;
            case "1-2": return 2;
            case "1-3": return 3;
            case "1-4": return 4;
            case "1-5": return 5;
            default: return 1;
        }
    }
}