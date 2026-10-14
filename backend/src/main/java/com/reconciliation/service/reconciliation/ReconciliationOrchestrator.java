package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import com.reconciliation.model.ReconciliationProgress;
import com.reconciliation.service.ColumnProcessingService;
import com.reconciliation.service.ConfigurableReconciliationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ReconciliationOrchestrator {

    private static final Logger logger = LoggerFactory.getLogger(ReconciliationOrchestrator.class);

    private final PartnerIndexBuilder partnerIndexBuilder;
    private final BatchProcessor batchProcessor;
    private final MatchClassifier matchClassifier;
    private final SpecialRatioReconciliationService specialRatioService;
    private final ParametricReconciliationService parametricService;
    private final ReconciliationProgressPublisher progressPublisher;
    private final ReconciliationMemoryManager memoryManager;
    private final ConfigurableReconciliationService configurableService;
    private final ColumnProcessingService columnProcessingService;

    public ReconciliationOrchestrator(
            PartnerIndexBuilder partnerIndexBuilder,
            BatchProcessor batchProcessor,
            MatchClassifier matchClassifier,
            SpecialRatioReconciliationService specialRatioService,
            ParametricReconciliationService parametricService,
            ReconciliationProgressPublisher progressPublisher,
            ReconciliationMemoryManager memoryManager,
            ConfigurableReconciliationService configurableService,
            ColumnProcessingService columnProcessingService) {
        this.partnerIndexBuilder = partnerIndexBuilder;
        this.batchProcessor = batchProcessor;
        this.matchClassifier = matchClassifier;
        this.specialRatioService = specialRatioService;
        this.parametricService = parametricService;
        this.progressPublisher = progressPublisher;
        this.memoryManager = memoryManager;
        this.configurableService = configurableService;
        this.columnProcessingService = columnProcessingService;
    }

    public ReconciliationResponse reconcile(ReconciliationRequest request) {
        long startTime = System.currentTimeMillis();
        
        logger.info("Début de la réconciliation - BO: {} lignes, Partenaire: {} lignes", 
            request.getBoFileContent().size(), request.getPartnerFileContent().size());

        // Apply column processing rules
        String boModelId = request.getModelId();
        String partnerModelId = null;
        
        if (boModelId == null && request.getBoColumnFilters() != null && !request.getBoColumnFilters().isEmpty()) {
            boModelId = request.getBoColumnFilters().get(0).getModelId();
        }
        
        logger.info("🔍 Recherche du modèle partenaire pour les données partenaires...");
        partnerModelId = configurableService.getPartnerModelId(request);
        if (partnerModelId != null && !partnerModelId.isEmpty()) {
            logger.info("✅ ModelId partenaire détecté automatiquement: {}", partnerModelId);
        } else {
            logger.warn("⚠️ Aucun modèle partenaire spécifique trouvé pour les données partenaires");
            logger.info("  📋 Colonnes partenaires détectées: {}", 
                request.getPartnerFileContent().isEmpty() ? "aucune" : 
                String.join(", ", request.getPartnerFileContent().get(0).keySet()));
            partnerModelId = boModelId;
            logger.info("⚠️ Utilisation du modelId général (BO) comme fallback: {}", partnerModelId);
        }
        
        List<Map<String, String>> processedBoData = applyColumnProcessingRules(request.getBoFileContent(), "bo", boModelId);
        List<Map<String, String>> processedPartnerData = applyColumnProcessingRules(request.getPartnerFileContent(), "partner", partnerModelId);

        // Determine reconciliation logic type
        ConfigurableReconciliationService.ReconciliationLogicType logicType = 
            configurableService.determineReconciliationLogic(request);
        
        logger.info("🔍 Vérification de la détection TRXBO/OPPART...");
        boolean isTRXBOOPPART = configurableService.detectTRXBOOPPARTContent(request);
        logger.info("🔍 Résultat de la détection TRXBO/OPPART: {}", isTRXBOOPPART);

        // Ratio effectif : ratio manuel (1-2 à 1-5) > ratio configuré sur le modèle > détection automatique
        String requestedType = request.getReconciliationType() == null ? "1-1" : request.getReconciliationType();
        boolean isCustomRatio = isSupportedParametricType(requestedType);
        String configuredType = configurableService.getConfiguredReconciliationType(request);
        boolean isConfiguredRatio = isSupportedParametricType(configuredType);
        String effectiveType = isCustomRatio ? requestedType : (isConfiguredRatio ? configuredType : null);
        
        // Release raw JSON data after detection
        memoryManager.releaseRequestFileContent(request);
        
        if (isTRXBOOPPART) {
            logger.info("🔍 Réconciliation TRXBO/OPPART détectée - Utilisation de la logique SPECIAL_RATIO{}",
                    effectiveType != null ? " paramétrée sur le ratio " + effectiveType : " (ratio historique 1:2)");
            if (effectiveType != null) {
                request.setReconciliationType(effectiveType);
            }
            logicType = ConfigurableReconciliationService.ReconciliationLogicType.SPECIAL_RATIO;
        } else if (effectiveType != null) {
            if (isCustomRatio) {
                logger.info("🎯 Ratio manuel sélectionné: {} - Utilisation de la méthode paramétrique", effectiveType);
            } else {
                logger.info("⚙️ Ratio configuré sur le modèle partenaire: {} - Utilisation de la méthode paramétrique", effectiveType);
            }
            request.setReconciliationType(effectiveType);
            request.setBoFileContent(processedBoData);
            request.setPartnerFileContent(processedPartnerData);
            return parametricService.reconcile(request, startTime);
        } else {
            logger.info("🔒 RÉCONCILIATION AUTOMATIQUE - Forçage de la logique 1-1");
            if (request.getReconciliationType() != null && !"1-1".equals(request.getReconciliationType())) {
                logger.info("⚠️ Type paramétrable détecté: {} mais IGNORÉ - Forçage 1-1", request.getReconciliationType());
            }
            if (logicType == ConfigurableReconciliationService.ReconciliationLogicType.SPECIAL_RATIO) {
                logger.info("⚠️ Logique SPECIAL_RATIO détectée mais IGNORÉE - Utilisation STANDARD");
                logicType = ConfigurableReconciliationService.ReconciliationLogicType.STANDARD;
            }
            logger.info("✅ Logique standard 1-1 utilisée - Logique configurable: {}", logicType);
        }

        logMemoryState();
        
        try {
            logger.info("🚀 Début de la réconciliation optimisée");
            logger.info("📊 Données BO: {} lignes", processedBoData.size());
            logger.info("📊 Données Partenaire: {} lignes", processedPartnerData.size());
            logger.info("🔑 Clé BO: '{}'", request.getBoKeyColumn());
            logger.info("🔑 Clé Partenaire: '{}'", request.getPartnerKeyColumn());

            // Handle special ratio (TRXBO/OPPART)
            if (logicType == ConfigurableReconciliationService.ReconciliationLogicType.SPECIAL_RATIO) {
                logger.info("🔄 Utilisation de la méthode de réconciliation SPECIAL_RATIO pour TRXBO/OPPART");
                request.setBoFileContent(processedBoData);
                request.setPartnerFileContent(processedPartnerData);
                return specialRatioService.reconcile(request, startTime);
            }

            // Handle parametric types
            if (request.getReconciliationType() != null && !"1-1".equals(request.getReconciliationType())) {
                logger.info("🔄 Réconciliation avec type paramétrable: {}", request.getReconciliationType());
                return parametricService.reconcile(request, startTime);
            }

            // Standard 1-1 reconciliation
            return executeStandardReconciliation(request, processedBoData, processedPartnerData, startTime);

        } catch (Exception e) {
            long totalTime = System.currentTimeMillis() - startTime;
            logger.error("❌ Erreur lors de la réconciliation après {} ms: {}", totalTime, e.getMessage(), e);
            throw new RuntimeException("Erreur lors de la réconciliation: " + e.getMessage(), e);
        }
    }

    /**
     * Types paramétrables pilotés par le ratio (1-2 à 1-5). Un ratio "1-1" reste le chemin standard.
     */
    private boolean isSupportedParametricType(String reconciliationType) {
        return "1-2".equals(reconciliationType)
                || "1-3".equals(reconciliationType)
                || "1-4".equals(reconciliationType)
                || "1-5".equals(reconciliationType);
    }

    private ReconciliationResponse executeStandardReconciliation(
            ReconciliationRequest request,
            List<Map<String, String>> processedBoData,
            List<Map<String, String>> processedPartnerData,
            long startTime) {

        // Apply BO filters
        List<Map<String, String>> filteredBoRecords = applyBOFilters(processedBoData, request.getBoColumnFilters());
        logger.info("✅ Nombre d'enregistrements BO après filtrage: {}", filteredBoRecords.size());

        progressPublisher.publishProgress(
            request, 1.0, "Indexation des enregistrements partenaire...",
            0, filteredBoRecords.size(), 0, 0, processedPartnerData.size()
        );

        // Initialize response
        ReconciliationResponse response = new ReconciliationResponse();
        response.setMatches(new ArrayList<>());
        response.setBoOnly(new ArrayList<>());
        response.setPartnerOnly(new ArrayList<>());
        response.setMismatches(new ArrayList<>());

        // Build partner index
        Map<String, List<Map<String, String>>> partnerIndex = partnerIndexBuilder.buildIndex(
            processedPartnerData, 
            request.getPartnerKeyColumn(), 
            request.getAdditionalKeys()
        );

        // Process batches
        int totalRecords = filteredBoRecords.size();
        int processedRecords = 0;

        progressPublisher.publishProgress(
            request, 2.0, "Traitement des enregistrements BO...",
            0, totalRecords, 0, 0, countPartnerIndexRemaining(partnerIndex)
        );

        for (int i = 0; i < filteredBoRecords.size(); i += BatchProcessor.BATCH_SIZE) {
            int endIndex = Math.min(i + BatchProcessor.BATCH_SIZE, filteredBoRecords.size());
            List<Map<String, String>> chunk = filteredBoRecords.subList(i, endIndex);
            
            BatchProcessor.BatchResult result = batchProcessor.processBatch(
                chunk, partnerIndex, request, request.getBoKeyColumn()
            );
            
            response.getMatches().addAll(result.getMatches());
            response.getBoOnly().addAll(result.getBoOnly());
            response.getMismatches().addAll(result.getMismatches());
            processedRecords += result.getProcessedCount();

            double progress = (double) processedRecords / totalRecords * 100;
            long elapsedTime = System.currentTimeMillis() - startTime;
            double recordsPerSecond = processedRecords / (elapsedTime / 1000.0);

            logger.info("📊 Progression: {}% ({}/{} enregistrements) - Vitesse: {} rec/s", 
                String.format("%.2f", progress), processedRecords, totalRecords, String.format("%.0f", recordsPerSecond));

            progressPublisher.publishProgress(
                request, progress,
                String.format("Traitement %,d / %,d enregistrements BO", processedRecords, totalRecords),
                processedRecords, totalRecords,
                response.getMatches().size(), response.getBoOnly().size(),
                countPartnerIndexRemaining(partnerIndex)
            );
        }

        // Collect remaining partner-only records
        logger.info("🔍 Recherche des enregistrements uniquement partenaire...");
        progressPublisher.publishProgress(
            request, 99.0, "Recherche des enregistrements uniquement partenaire...",
            totalRecords, totalRecords, response.getMatches().size(), response.getBoOnly().size(),
            countPartnerIndexRemaining(partnerIndex)
        );

        int partnerOnlyCount = matchClassifier.collectPartnerOnlyRecords(
            partnerIndex, response, request.getPartnerKeyColumn(), request.getAdditionalKeys()
        );
        partnerIndex.clear();
        logger.info("✅ Nombre total d'enregistrements uniquement partenaire: {}", partnerOnlyCount);

        // Calculate totals
        response.setTotalBoRecords(filteredBoRecords.size());
        response.setTotalPartnerRecords(processedPartnerData.size());
        response.setTotalMatches(response.getMatches().size());
        response.setTotalMismatches(response.getMismatches().size());
        response.setTotalBoOnly(response.getBoOnly().size());
        response.setTotalPartnerOnly(response.getPartnerOnly().size());

        // Final timing
        long totalTime = System.currentTimeMillis() - startTime;
        double recordsPerSecond = (double) totalRecords / (totalTime / 1000.0);
        
        response.setExecutionTimeMs(totalTime);
        response.setProcessedRecords(totalRecords);
        response.setProgressPercentage(100.0);

        progressPublisher.publishProgress(
            request, 100.0, "Réconciliation terminée",
            totalRecords, totalRecords,
            response.getTotalMatches(), response.getTotalBoOnly(), response.getTotalPartnerOnly()
        );

        logger.info("🎯 RÉSULTATS FINAUX:");
        logger.info("📊 Total BO: {}", response.getTotalBoRecords());
        logger.info("📊 Total Partenaire: {}", response.getTotalPartnerRecords());
        logger.info("✅ Correspondances: {}", response.getTotalMatches());
        logger.info("❌ Différences: {}", response.getTotalMismatches());
        logger.info("📈 Uniquement BO: {}", response.getTotalBoOnly());
        logger.info("📈 Uniquement Partenaire: {}", response.getTotalPartnerOnly());
        logger.info("⚡ Performance: {} enregistrements/seconde", String.format("%.0f", recordsPerSecond));
        logger.info("⏱️  Temps total d'exécution: {} ms ({} secondes)", totalTime, String.format("%.2f", totalTime / 1000.0));

        memoryManager.releaseReconciliationWorkingSets(processedPartnerData);
        
        return response;
    }

    private List<Map<String, String>> applyColumnProcessingRules(List<Map<String, String>> fileContent, 
                                                                  String fileType, String modelId) {
        if (fileContent == null || fileContent.isEmpty()) {
            return new ArrayList<>();
        }
        if (modelId == null || modelId.isEmpty()) {
            logger.info("Aucun modelId fourni pour {}, pas de traitement de colonnes", fileType);
            return fileContent;
        }
        
        logger.info("🔧 Application des règles du modèle {} pour le type {}", modelId, fileType);
        
        // Convertir List<Map<String, String>> en List<Map<String, Object>>
        List<Map<String, Object>> dataAsObject = new ArrayList<>();
        for (Map<String, String> row : fileContent) {
            Map<String, Object> rowAsObject = new HashMap<>(row);
            dataAsObject.add(rowAsObject);
        }
        
        // Appliquer les règles du modèle
        List<Map<String, Object>> processedDataAsObject = columnProcessingService.processDataList(modelId, dataAsObject);
        
        // Convertir de nouveau en List<Map<String, String>>
        List<Map<String, String>> processedData = new ArrayList<>();
        for (Map<String, Object> row : processedDataAsObject) {
            Map<String, String> rowAsString = new HashMap<>();
            for (Map.Entry<String, Object> entry : row.entrySet()) {
                rowAsString.put(entry.getKey(), entry.getValue() != null ? entry.getValue().toString() : null);
            }
            processedData.add(rowAsString);
        }
        
        logger.info("✅ Règles du modèle {} appliquées à {} lignes", modelId, processedData.size());
        return processedData;
    }

    private List<Map<String, String>> applyBOFilters(List<Map<String, String>> boRecords, 
                                                     List<ReconciliationRequest.BOColumnFilter> filters) {
        if (filters == null || filters.isEmpty()) {
            logger.info("Aucun filtre BO à appliquer");
            return boRecords;
        }
        
        logger.info("Application de {} filtres BO", filters.size());
        for (ReconciliationRequest.BOColumnFilter filter : filters) {
            logger.info("Filtre: colonne='{}', valeurs sélectionnées={}", 
                filter.getColumnName(), filter.getSelectedValues());
        }
        
        List<Map<String, String>> filteredRecords = new ArrayList<>();
        int excludedCount = 0;
        
        for (Map<String, String> record : boRecords) {
            boolean shouldInclude = true;
            
            for (ReconciliationRequest.BOColumnFilter filter : filters) {
                String columnValue = record.get(filter.getColumnName());
                
                if (columnValue == null || !filter.getSelectedValues().contains(columnValue)) {
                    shouldInclude = false;
                    logger.debug("Enregistrement exclu par le filtre {}: valeur '{}' non trouvée dans {}", 
                        filter.getColumnName(), columnValue, filter.getSelectedValues());
                    excludedCount++;
                    break;
                }
            }
            
            if (shouldInclude) {
                filteredRecords.add(record);
            }
        }
        
        logger.info("Filtrage terminé: {} enregistrements conservés sur {} ({} exclus)", 
            filteredRecords.size(), boRecords.size(), excludedCount);
        
        if (!filteredRecords.isEmpty()) {
            logger.info("Exemple d'enregistrement conservé: {}", filteredRecords.get(0));
        }
        
        return filteredRecords;
    }

    private void logMemoryState() {
        Runtime runtime = Runtime.getRuntime();
        long maxMemory = runtime.maxMemory();
        long totalMemory = runtime.totalMemory();
        long freeMemory = runtime.freeMemory();
        long usedMemory = totalMemory - freeMemory;
        
        logger.info("💾 État mémoire - Max: {} MB, Utilisé: {} MB, Libre: {} MB", 
            maxMemory / 1024 / 1024, usedMemory / 1024 / 1024, freeMemory / 1024 / 1024);
    }

    private int countPartnerIndexRemaining(Map<String, List<Map<String, String>>> partnerIndex) {
        int total = 0;
        for (List<Map<String, String>> partnersForKey : partnerIndex.values()) {
            synchronized (partnersForKey) {
                total += partnersForKey.size();
            }
        }
        return total;
    }
}