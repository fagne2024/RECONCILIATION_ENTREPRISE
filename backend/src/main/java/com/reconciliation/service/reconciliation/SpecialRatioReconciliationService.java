package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import com.reconciliation.service.ConfigurableReconciliationService;
import com.reconciliation.service.TrxboOppartConfig;
import com.reconciliation.service.TrxboOppartConfig.AdditionalOperationType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.Collections;

@Service
public class SpecialRatioReconciliationService {

    private static final Logger logger = LoggerFactory.getLogger(SpecialRatioReconciliationService.class);

    // Types d'opérations OPPART et libellés de commentaires : surchargeables par modèle
    // via reconciliation_logic.parameters.trxboOppart (voir TrxboOppartConfig)
    private static final int DEFAULT_SPECIAL_RATIO_COUNT = 2;

    private final ConfigurableReconciliationService configurableService;

    public SpecialRatioReconciliationService(ConfigurableReconciliationService configurableService) {
        this.configurableService = configurableService;
    }

    public ReconciliationResponse reconcile(ReconciliationRequest request, long startTime) {
        logger.info("🔄 Début de la réconciliation avec logique de ratio spéciale configurable");

        int expectedCount = resolveExpectedPartnerCount(request);
        logger.info("📏 Ratio attendu par la logique SPECIAL_RATIO: 1:{}", expectedCount);

        List<ConfigurableReconciliationService.CorrespondenceRule> modelRules =
            configurableService.getCorrespondenceRules(request);
        if (!modelRules.isEmpty()) {
            logger.info("⚠️ {} règle(s) de correspondance configurée(s) sur le modèle ignorée(s) pour SPECIAL_RATIO : "
                + "leurs conditions 'partnerMatches' sont figées sur l'ancien ratio 1:2. La classification métier "
                + "TRXBO/OPPART (TSOP, TRXSF, RGFRAIS, TRXSVC) est recalculée sur le ratio effectif 1:{}",
                modelRules.size(), expectedCount);
        }

        TrxboOppartConfig trxboOppartConfig = configurableService.getTrxboOppartConfig(request);
        logger.info("🏷️ Libellés d'opérations retenus: impact='{}', frais='{}', commission='{}'",
            trxboOppartConfig.getImpactType(), trxboOppartConfig.getFeesType(), trxboOppartConfig.getCommissionType());
        logger.info("💬 Commentaires retenus: tsop='{}', trxsf='{}', rgfrais='{}', trxsvc='{}', trxsfTrxsvc='{}', ecart='{}', partnerOnly='{}'",
            trxboOppartConfig.getCommentTsop(), trxboOppartConfig.getCommentTrxsf(), trxboOppartConfig.getCommentRgfrais(),
            trxboOppartConfig.getCommentTrxsvc(), trxboOppartConfig.getCommentTrxsfTrxsvc(),
            trxboOppartConfig.getCommentEcart(), trxboOppartConfig.getCommentPartnerOnly());

        List<Map<String, String>> filteredBoRecords = applyBOFilters(request.getBoFileContent(), request.getBoColumnFilters());
        logger.info("✅ Nombre d'enregistrements BO après filtrage: {}", filteredBoRecords.size());

        ReconciliationResponse response = new ReconciliationResponse();
        response.setMatches(new ArrayList<>());
        response.setBoOnly(new ArrayList<>());
        response.setPartnerOnly(new ArrayList<>());
        response.setMismatches(new ArrayList<>());
        response.setRegularisationRules(trxboOppartConfig.regularisationRulesAsList());
        response.setConfigComments(trxboOppartConfig.commentsAsMap());
        response.setTrxboOppartConfig(trxboOppartConfig.toMap());

        Map<String, List<Map<String, String>>> partnerIndex = new HashMap<>();
        logger.info("🔍 DEBUG - Création de l'index Partner avec colonne clé: '{}'", request.getPartnerKeyColumn());
        if (request.getAdditionalKeys() != null && !request.getAdditionalKeys().isEmpty()) {
            logger.info("🔑 Clés supplémentaires utilisées: {} paires", request.getAdditionalKeys().size());
        }

        int partnerKeysWithNull = 0;
        for (Map<String, String> partnerRecord : request.getPartnerFileContent()) {
            String partnerKey = buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(), 
                                                  request.getAdditionalKeys(), false);
            if (partnerKey != null) {
                partnerIndex.computeIfAbsent(partnerKey, k -> new ArrayList<>()).add(partnerRecord);
            } else {
                partnerKeysWithNull++;
            }
        }

        logger.info("✅ Index OPPART créé avec {} clés uniques ({} enregistrements avec clé null)", 
            partnerIndex.size(), partnerKeysWithNull);

        Set<Map<String, String>> usedPartnerRecords = Collections.newSetFromMap(new IdentityHashMap<>());
        int processedCount = 0;
        int boKeysWithNull = 0;
        int boKeysNotFound = 0;
        Set<String> sampleBoKeys = new HashSet<>();
        Set<String> samplePartnerKeys = new HashSet<>();

        logger.info("🔍 DEBUG - Traitement des enregistrements BO avec colonne clé: '{}'", request.getBoKeyColumn());

        for (Map<String, String> boRecord : filteredBoRecords) {
            String boKey = buildCompositeKey(boRecord, request.getBoKeyColumn(), 
                                            request.getAdditionalKeys(), true);
            if (boKey == null) {
                boKeysWithNull++;
                response.getBoOnly().add(boRecord);
                processedCount++;
                continue;
            }

            if (sampleBoKeys.size() < 5) {
                sampleBoKeys.add(boKey);
            }

            List<Map<String, String>> matchingPartnerRecords = partnerIndex.get(boKey);
            int partnerMatchCount = matchingPartnerRecords != null ? matchingPartnerRecords.size() : 0;

            if (partnerMatchCount == 0) {
                boKeysNotFound++;
            }

            if (processedCount < 10) {
                logger.info("🔍 DEBUG - TRXBO key[{}]: '{}' -> {} correspondances OPPART", 
                    processedCount, boKey, partnerMatchCount);
            }

            if (processedCount < 5 && partnerMatchCount == 0) {
                String trimmedBoKey = boKey != null ? boKey.trim() : null;
                boolean foundWithTrim = trimmedBoKey != null && partnerIndex.containsKey(trimmedBoKey);
                
                if (samplePartnerKeys.size() < 5 && !partnerIndex.isEmpty()) {
                    samplePartnerKeys.addAll(partnerIndex.keySet().stream()
                        .limit(5 - samplePartnerKeys.size())
                        .collect(java.util.stream.Collectors.toList()));
                }

                logger.warn("⚠️ DEBUG - Clé BO '{}' non trouvée dans l'index Partner", boKey);
                logger.warn("  Trouvée avec trim? {}", foundWithTrim);
                if (foundWithTrim) {
                    logger.warn("  ⚠️ PROBLÈME DÉTECTÉ: Les clés nécessitent un trim()!");
                }
            }

            String action = determineTRXBOAction(matchingPartnerRecords, partnerMatchCount, expectedCount, trxboOppartConfig);

            if (matchingPartnerRecords != null && partnerMatchCount > 0) {
                usedPartnerRecords.addAll(matchingPartnerRecords);
            }

            switch (action) {
                case "MARK_AS_MATCH":
                    logger.debug("✅ CORRESPONDANCE PARFAITE: {} correspondances pour key: {}", partnerMatchCount, boKey);
                    ReconciliationResponse.Match match = new ReconciliationResponse.Match();
                    match.setKey(boRecord.get(request.getBoKeyColumn()));
                    match.setBoData(boRecord);
                    
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
                    match.setDifferences(new ArrayList<>());
                    response.getMatches().add(match);
                    break;

                case "MARK_AS_MISMATCH_TRXSF":
                    logger.debug("⚠️ TRXSF: {} correspondance (IMPACT_COMPTE_GENERAL) pour key: {}", partnerMatchCount, boKey);
                    Map<String, String> boRecordTRXSF = new HashMap<>(boRecord);
                    boRecordTRXSF.put("Commentaire", trxboOppartConfig.getCommentTrxsf());
                    response.getBoOnly().add(boRecordTRXSF);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecord : matchingPartnerRecords) {
                            Map<String, String> partnerRecordTRXSF = new HashMap<>(partnerRecord);
                            partnerRecordTRXSF.put("Commentaire", trxboOppartConfig.getCommentTrxsf());
                            response.getPartnerOnly().add(partnerRecordTRXSF);
                        }
                    }
                    break;

                case "MARK_AS_MISMATCH_FRAIS_ET_COMMISSION":
                    logger.debug("⚠️ {} : {} correspondances (frais et commission sans IMPACT_COMPTE_GENERAL) pour key: {}", trxboOppartConfig.getCommentFraisEtCommission(), partnerMatchCount, boKey);
                    Map<String, String> boRecordFraisCom = new HashMap<>(boRecord);
                    boRecordFraisCom.put("Commentaire", trxboOppartConfig.getCommentFraisEtCommission());
                    response.getBoOnly().add(boRecordFraisCom);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecordFraisCom : matchingPartnerRecords) {
                            Map<String, String> partnerRecordCopy = new HashMap<>(partnerRecordFraisCom);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentFraisEtCommission());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    break;

                case "MARK_AS_PARTNER_ONLY_REGCOM":
                    logger.debug("⚠️ {} : {} correspondance (commission sans IMPACT_COMPTE_GENERAL) pour key: {}", trxboOppartConfig.getCommentRegcom(), partnerMatchCount, boKey);
                    response.getBoOnly().add(boRecord);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecordRegcom : matchingPartnerRecords) {
                            Map<String, String> partnerRecordCopy = new HashMap<>(partnerRecordRegcom);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentRegcom());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    break;

                case "MARK_AS_ADDITIONAL_OPERATION_TYPE": {
                    TrxboOppartConfig.AdditionalOperationType additionalOperationType = this.findAdditionalOperationType(matchingPartnerRecords, trxboOppartConfig);
                    if (additionalOperationType == null) {
                        response.getBoOnly().add(boRecord);
                        break;
                    }
                    String additionalCommentBo = additionalOperationType.getCommentBo();
                    String additionalCommentPartner = additionalOperationType.getCommentPartner();
                    logger.debug("⚠️ Type d'opération supplémentaire {} : {} correspondance pour key: {}", additionalOperationType.getLabel(), partnerMatchCount, boKey);
                    Map<String, String> boRecordAdditional = new HashMap<>(boRecord);
                    if (additionalCommentBo != null && !additionalCommentBo.trim().isEmpty()) {
                        boRecordAdditional.put("Commentaire", additionalCommentBo);
                    }
                    response.getBoOnly().add(boRecordAdditional);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecordAdditional : matchingPartnerRecords) {
                            Map<String, String> partnerRecordCopy = new HashMap<>(partnerRecordAdditional);
                            if (additionalCommentPartner != null && !additionalCommentPartner.trim().isEmpty()) {
                                partnerRecordCopy.put("Commentaire", additionalCommentPartner);
                            }
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    break;
                }

                case "MARK_AS_PARTNER_ONLY_RGFRAIS": {
                    AdditionalOperationType compenseType = findAdditionalOperationTypeByLabel(trxboOppartConfig, "COMPENSE");
                    String rgfraisCommentBo = (compenseType != null && compenseType.getCommentBo() != null && !compenseType.getCommentBo().trim().isEmpty())
                            ? compenseType.getCommentBo()
                            : (compenseType != null ? compenseType.getLabel() : trxboOppartConfig.getCommentRgfrais());
                    String rgfraisCommentPartner = (compenseType != null && compenseType.getCommentPartner() != null && !compenseType.getCommentPartner().trim().isEmpty())
                            ? compenseType.getCommentPartner()
                            : (compenseType != null ? compenseType.getLabel() : trxboOppartConfig.getCommentRgfrais());
                    logger.debug("⚠️ {} : {} correspondance (frais sans IMPACT_COMPTE_GENERAL) pour key: {}", rgfraisCommentBo, partnerMatchCount, boKey);
                    response.getBoOnly().add(boRecord);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecord2 : matchingPartnerRecords) {
                            Map<String, String> partnerRecordRg = new HashMap<>(partnerRecord2);
                            partnerRecordRg.put("Commentaire", rgfraisCommentPartner);
                            response.getPartnerOnly().add(partnerRecordRg);
                        }
                    }
                    break;
                }


                case "MARK_AS_MISMATCH_TRXSF_TRXSVC":
                    logger.debug("⚠️ TRXSF & TRXSVC: {} correspondance (IMPACT_COMPTE_GENERAL seul, ratio 1:{}) pour key: {}", partnerMatchCount, expectedCount, boKey);
                    Map<String, String> boRecordTrxsfSvc = new HashMap<>(boRecord);
                    boRecordTrxsfSvc.put("Commentaire", trxboOppartConfig.getCommentTrxsfTrxsvc());
                    response.getBoOnly().add(boRecordTrxsfSvc);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecordTrxsfSvc : matchingPartnerRecords) {
                            Map<String, String> partnerRecordCopy = new HashMap<>(partnerRecordTrxsfSvc);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentTrxsfTrxsvc());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    break;

                case "MARK_AS_MISMATCH_FRAIS_SANS_COMMISSION":
                    logger.debug("⚠️ {} : {} correspondance (frais sans commission, ratio 1:{}) pour key: {}", trxboOppartConfig.getCommentFraisSansCommission(), partnerMatchCount, expectedCount, boKey);
                    Map<String, String> boRecordFrais = new HashMap<>(boRecord);
                    boRecordFrais.put("Commentaire", trxboOppartConfig.getCommentFraisSansCommission());
                    response.getBoOnly().add(boRecordFrais);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecordFrais : matchingPartnerRecords) {
                            Map<String, String> partnerRecordCopy = new HashMap<>(partnerRecordFrais);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentFraisSansCommission());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    break;

                case "MARK_AS_MISMATCH_TRXSVC":
                    logger.debug("⚠️ TRXSVC: {} correspondances sans VERSEMENT_COMMISSION (ratio 1:{}) pour key: {}", partnerMatchCount, expectedCount, boKey);
                    Map<String, String> boRecordSvc = new HashMap<>(boRecord);
                    boRecordSvc.put("Commentaire", trxboOppartConfig.getCommentTrxsvc());
                    response.getBoOnly().add(boRecordSvc);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecordSvc : matchingPartnerRecords) {
                            Map<String, String> partnerRecordCopy = new HashMap<>(partnerRecordSvc);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentTrxsvc());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    break;

                case "MARK_AS_MISMATCH":
                    logger.debug("❌ ÉCART: {} correspondances pour key: {} (condition non respectée)", partnerMatchCount, boKey);
                    Map<String, String> boRecordEcart = new HashMap<>(boRecord);
                    boRecordEcart.put("Commentaire", trxboOppartConfig.getCommentEcart());
                    response.getMismatches().add(boRecordEcart);
                    if (matchingPartnerRecords != null) {
                        for (Map<String, String> partnerRecord : matchingPartnerRecords) {
                            Map<String, String> partnerRecordEcart = new HashMap<>(partnerRecord);
                            partnerRecordEcart.put("Commentaire", trxboOppartConfig.getCommentEcart());
                            response.getPartnerOnly().add(partnerRecordEcart);
                        }
                    }
                    break;

                case "MARK_AS_BO_ONLY_TSOP":
                    logger.debug("📈 TSOP: {} correspondances pour key: {}", partnerMatchCount, boKey);
                    Map<String, String> boRecordTSOP = new HashMap<>(boRecord);
                    boRecordTSOP.put("Commentaire", trxboOppartConfig.getCommentTsop());
                    response.getBoOnly().add(boRecordTSOP);
                    break;

                case "MARK_AS_BO_ONLY":
                default:
                    logger.debug("📈 BO UNIQUEMENT: {} correspondances pour key: {}", partnerMatchCount, boKey);
                    response.getBoOnly().add(boRecord);
                    break;
            }

            processedCount++;

            if (processedCount % 1000 == 0) {
                double progress = (double) processedCount / filteredBoRecords.size() * 100;
                logger.info("📊 Progression TRXBO/OPPART: {}% ({}/{} enregistrements)", 
                    String.format("%.2f", progress), processedCount, filteredBoRecords.size());
            }
        }

        // Identify unused partner records
        Map<String, List<Map<String, String>>> partnerOnlyByKey = new HashMap<>();
        for (Map<String, String> partnerRecord : request.getPartnerFileContent()) {
            String partnerKeyComposite = buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(),
                    request.getAdditionalKeys(), false);
            if (partnerKeyComposite != null && !usedPartnerRecords.contains(partnerRecord)) {
                partnerOnlyByKey.computeIfAbsent(partnerKeyComposite, k -> new ArrayList<>()).add(partnerRecord);
            }
        }

        for (List<Map<String, String>> partnerRecords : partnerOnlyByKey.values()) {
            for (Map<String, String> partnerRecord : partnerRecords) {
                Map<String, String> partnerRecordWithComment = new HashMap<>(partnerRecord);
                String type = getPartnerType(partnerRecord);
                boolean isRgfrais = type != null && type.toUpperCase().contains("COMPENSE");
                partnerRecordWithComment.put("Commentaire",
                        isRgfrais ? trxboOppartConfig.getCommentRgfrais() : trxboOppartConfig.getCommentPartnerOnly());
                response.getPartnerOnly().add(partnerRecordWithComment);
            }
        }

        // Debug summary
        logger.info("🔍 DEBUG - Résumé de la réconciliation:");
        logger.info("  - Enregistrements BO traités: {}", processedCount);
        logger.info("  - Clés BO null: {}", boKeysWithNull);
        logger.info("  - Clés BO non trouvées dans l'index Partner: {}", boKeysNotFound);
        double matchRate = processedCount > 0 ? (100.0 * (processedCount - boKeysNotFound) / processedCount) : 0.0;
        logger.info("  - Taux de correspondance: {}%", String.format("%.2f", matchRate));
        logger.info("  - Matches trouvés: {}", response.getMatches().size());
        logger.info("  - BO Only: {}", response.getBoOnly().size());
        logger.info("  - Partner Only: {}", response.getPartnerOnly().size());

        if (!sampleBoKeys.isEmpty() && !samplePartnerKeys.isEmpty()) {
            logger.info("🔍 DEBUG - Exemples de clés pour comparaison:");
            logger.info("  Exemples clés BO: {}", sampleBoKeys.stream().limit(3).collect(java.util.stream.Collectors.toList()));
            logger.info("  Exemples clés Partner: {}", samplePartnerKeys.stream().limit(3).collect(java.util.stream.Collectors.toList()));
            
            String firstBoKey = sampleBoKeys.iterator().next();
            String firstPartnerKey = samplePartnerKeys.iterator().next();
            logger.info("  Comparaison première clé BO vs Partner:");
            logger.info("    BO: '{}' (longueur: {})", firstBoKey, firstBoKey != null ? firstBoKey.length() : 0);
            logger.info("    Partner: '{}' (longueur: {})", firstPartnerKey, firstPartnerKey != null ? firstPartnerKey.length() : 0);
            logger.info("    Correspondance exacte? {}", firstBoKey != null && firstBoKey.equals(firstPartnerKey));
            if (firstBoKey != null && firstPartnerKey != null) {
                logger.info("    Correspondance après trim? {}", firstBoKey.trim().equals(firstPartnerKey.trim()));
                logger.info("    Correspondance ignore case? {}", firstBoKey.equalsIgnoreCase(firstPartnerKey));
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

        logger.info("🎯 RÉSULTATS FINAUX TRXBO/OPPART:");
        logger.info("📊 Total TRXBO: {}", response.getTotalBoRecords());
        logger.info("📊 Total OPPART: {}", response.getTotalPartnerRecords());
        logger.info("✅ Correspondances parfaites (1:2): {}", response.getTotalMatches());
        logger.info("❌ Écarts (0, 1, ou >2 correspondances): {}", response.getTotalMismatches());
        logger.info("📈 Uniquement TRXBO: {}", response.getTotalBoOnly());
        logger.info("📈 Uniquement OPPART: {}", response.getTotalPartnerOnly());
        logger.info("⚡ Performance: {} enregistrements/seconde", String.format("%.0f", recordsPerSecond));
        logger.info("⏱️  Temps total d'exécution: {} ms ({} secondes)", totalTime, String.format("%.2f", totalTime / 1000.0));

        return response;
    }

    private List<Map<String, String>> applyBOFilters(List<Map<String, String>> boRecords, 
                                                     List<ReconciliationRequest.BOColumnFilter> filters) {
        if (filters == null || filters.isEmpty()) {
            return boRecords;
        }
        
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

    String getPartnerType(Map<String, String> partnerRecord) {
        if (partnerRecord == null) return null;
        String type = partnerRecord.get("Type");
        if (type == null || type.trim().isEmpty()) {
            type = partnerRecord.get("Type Opération");
        }
        return type != null ? type.trim() : null;
    }

    /**
     * Configuration TRXBO/OPPART du modèle pour la requête courante (libellés et commentaires).
     * Les valeurs par défaut du code servent de repli quand le modèle n'en porte aucune.
     */
    TrxboOppartConfig resolveTrxboOppartConfig(ReconciliationRequest request) {
        return configurableService.getTrxboOppartConfig(request);
    }

    /**
     * Nombre d'opérations partenaire attendu par la logique SPECIAL_RATIO : ratio explicite de la
     * requête (sélection manuelle) prioritaire, sinon ratio configuré sur le modèle partenaire,
     * sinon ratio historique TRXBO/OPPART 1:2.
     */
    int resolveExpectedPartnerCount(ReconciliationRequest request) {
        String requestedType = request.getReconciliationType() == null ? "1-1" : request.getReconciliationType();
        if (isSupportedParametricType(requestedType)) {
            return expectedPartnerCount(requestedType);
        }
        String configuredType = configurableService.getConfiguredReconciliationType(request);
        if (isSupportedParametricType(configuredType)) {
            return expectedPartnerCount(configuredType);
        }
        return DEFAULT_SPECIAL_RATIO_COUNT;
    }

    private boolean isSupportedParametricType(String reconciliationType) {
        return "1-2".equals(reconciliationType)
                || "1-3".equals(reconciliationType)
                || "1-4".equals(reconciliationType)
                || "1-5".equals(reconciliationType);
    }

    private int expectedPartnerCount(String reconciliationType) {
        return Integer.parseInt(reconciliationType.substring(2));
    }

    /**
     * Classification métier TRXBO/OPPART calculée sur le ratio effectif.
     *
     * <ul>
     *   <li>exactement N opérations partenaire : correspondance ;</li>
     *   <li>aucune opération : TSOP (BO seul) ;</li>
     *   <li>frais sans IMPACT ni commission : BO Ecart, partenaire RGFRAIS ;</li>
     *   <li>commission sans IMPACT ni frais : REGCOM côté partenaire ;</li>
     *   <li>une seule ligne avec IMPACT : TRXSF ;</li>
     *   <li>ratio 1:3, trio attendu IMPACT_COMPTE_GENERAL + FRAIS_TRANSACTION + VERSEMENT_COMMISSION :
     *       IMPACT seul → TRXSF &amp; TRXSVC, IMPACT + VERSEMENT_COMMISSION → TRXSF,
     *       IMPACT + FRAIS_TRANSACTION → commentaire « frais sans commission » ;</li>
     *   <li>tout autre cas : écart.</li>
     * </ul>
     */
    String determineTRXBOAction(List<Map<String, String>> partnerGroup, int partnerMatchCount, int expectedCount,
                                TrxboOppartConfig config) {
        if (partnerMatchCount == expectedCount) {
            return "MARK_AS_MATCH";
        }
        if (partnerMatchCount == 0) {
            return "MARK_AS_BO_ONLY_TSOP";
        }

        boolean hasImpact = containsPartnerType(partnerGroup, config.getImpactType());
        boolean hasFrais = containsPartnerType(partnerGroup, config.getFeesType());
        boolean hasCommission = containsPartnerType(partnerGroup, config.getCommissionType());

        // Opérations fournisseur sans IMPACT_COMPTE_GENERAL : RGFRAIS (frais seul), REGCOM (commission seule),
        // RGFRAIS & REGCOM (frais et commission)
        if (!hasImpact && hasFrais && !hasCommission) {
            return "MARK_AS_PARTNER_ONLY_RGFRAIS";
        }
        if (!hasImpact && hasCommission && !hasFrais) {
            return "MARK_AS_PARTNER_ONLY_REGCOM";
        }
        if (!hasImpact && hasFrais && hasCommission) {
            return "MARK_AS_MISMATCH_FRAIS_ET_COMMISSION";
        }

        // Types d'opération supplémentaires déclarés sur le modèle (hors impact / frais / commission) :
        // le premier type déclaré présent dans le groupe porte ses propres commentaires.
        if (!hasImpact && !hasFrais && !hasCommission) {
            AdditionalOperationType additionalOperationType = this.findAdditionalOperationType(partnerGroup, config);
            if (additionalOperationType != null) {
                return "MARK_AS_ADDITIONAL_OPERATION_TYPE";
            }
        }

        if (expectedCount >= 3 && hasImpact) {
            if (!hasFrais && !hasCommission) {
                return "MARK_AS_MISMATCH_TRXSF_TRXSVC";
            }
            if (hasCommission && !hasFrais) {
                return "MARK_AS_MISMATCH_TRXSF";
            }
            if (hasFrais && !hasCommission) {
                return "MARK_AS_MISMATCH_FRAIS_SANS_COMMISSION";
            }
            return "MARK_AS_MISMATCH";
        }
        if (expectedCount >= 3 && hasCommission) {
            return "MARK_AS_MISMATCH_TRXSVC";
        }

        if (partnerMatchCount == 1) {
            return hasFrais ? "MARK_AS_PARTNER_ONLY_RGFRAIS" : "MARK_AS_MISMATCH_TRXSF";
        }
        return "MARK_AS_MISMATCH";
    }

    private boolean containsPartnerType(List<Map<String, String>> partnerGroup, String expectedType) {
        if (partnerGroup == null || partnerGroup.isEmpty() || expectedType == null || expectedType.trim().isEmpty()) {
            return false;
        }
        for (Map<String, String> partnerRecord : partnerGroup) {
            String type = getPartnerType(partnerRecord);
            if (type != null && type.toUpperCase().contains(expectedType.toUpperCase())) {
                return true;
            }
        }
        return false;
    }

    private TrxboOppartConfig.AdditionalOperationType findAdditionalOperationType(List<Map<String, String>> partnerGroup, TrxboOppartConfig config) {
        if (config == null || config.getAdditionalOperationTypes() == null) {
            return null;
        }
        for (TrxboOppartConfig.AdditionalOperationType additionalOperationType : config.getAdditionalOperationTypes()) {
            if (this.containsPartnerType(partnerGroup, additionalOperationType.getLabel())) {
                return additionalOperationType;
            }
        }
        return null;
    }

    private TrxboOppartConfig.AdditionalOperationType findAdditionalOperationTypeByLabel(TrxboOppartConfig config, String label) {
        if (config == null || config.getAdditionalOperationTypes() == null || label == null) {
            return null;
        }
        for (TrxboOppartConfig.AdditionalOperationType additionalOperationType : config.getAdditionalOperationTypes()) {
            if (additionalOperationType.getLabel() != null && additionalOperationType.getLabel().equalsIgnoreCase(label)) {
                return additionalOperationType;
            }
        }
        return null;
    }

    String determineActionFromRules(List<ConfigurableReconciliationService.CorrespondenceRule> rules, int partnerMatchCount) {
        for (ConfigurableReconciliationService.CorrespondenceRule rule : rules) {
            boolean conditionMet = evaluateCondition(rule.getCondition(), partnerMatchCount);
            if (conditionMet) {
                return rule.getAction();
            }
        }
        logger.warn("⚠️ Aucune règle ne correspond pour {} correspondances, action par défaut: MARK_AS_BO_ONLY", partnerMatchCount);
        return "MARK_AS_BO_ONLY";
    }

    boolean evaluateCondition(String condition, int partnerMatchCount) {
        if (condition == null || condition.trim().isEmpty()) return false;
        String[] parts = condition.trim().split("\\s+");
        if (parts.length < 2) return false;
        String operator = parts[0];
        int threshold;
        try {
            threshold = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            return false;
        }
        return switch (operator) {
            case "==" -> partnerMatchCount == threshold;
            case "!=" -> partnerMatchCount != threshold;
            case ">"  -> partnerMatchCount > threshold;
            case ">=" -> partnerMatchCount >= threshold;
            case "<"  -> partnerMatchCount < threshold;
            case "<=" -> partnerMatchCount <= threshold;
            default -> false;
        };
    }

    List<ConfigurableReconciliationService.CorrespondenceRule> createDefaultTRXBOOPPARTRules() {
        List<ConfigurableReconciliationService.CorrespondenceRule> rules = new ArrayList<>();
        // Implementation would go here - rules loaded from configurable service
        return rules;
    }
}