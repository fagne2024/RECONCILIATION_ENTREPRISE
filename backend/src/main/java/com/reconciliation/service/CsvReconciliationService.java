package com.reconciliation.service;

import com.reconciliation.dto.ColumnComparison;
import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import com.reconciliation.model.ReconciliationProgress;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;

// Classe pour stocker les résultats d'un batch de traitement
class ReconciliationBatchResult {
    private final List<ReconciliationResponse.Match> matches;
    private final List<Map<String, String>> boOnly;
    private final List<Map<String, String>> mismatches;
    private final int processedCount;

    public ReconciliationBatchResult(List<ReconciliationResponse.Match> matches, 
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

@Service
public class CsvReconciliationService
implements DisposableBean {
    private static final Logger logger = LoggerFactory.getLogger(CsvReconciliationService.class);
    private final ConfigurableReconciliationService configurableReconciliationService;
    private final ColumnProcessingService columnProcessingService;
    private final ReconciliationProgressService progressService;
    private static final int BATCH_SIZE = 10000;
    // Types d'opérations OPPART et libellés de commentaires : surchargeables par modèle
    // via reconciliation_logic.parameters.trxboOppart (voir TrxboOppartConfig)
    // Nombre d'opérations partenaire attendu par défaut pour la logique SPECIAL_RATIO (TRXBO/OPPART)
    private static final int DEFAULT_SPECIAL_RATIO_COUNT = 2;
    private static final int PARALLEL_THREADS = Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors()));
    private final ConcurrentHashMap<String, Integer> progressMap = new ConcurrentHashMap();
    private final ExecutorService executorService = Executors.newFixedThreadPool(PARALLEL_THREADS, r -> {
        Thread t = new Thread(r);
        t.setDaemon(true);
        return t;
    });

    public CsvReconciliationService(ConfigurableReconciliationService configurableReconciliationService, ColumnProcessingService columnProcessingService, ReconciliationProgressService progressService) {
        this.configurableReconciliationService = configurableReconciliationService;
        this.columnProcessingService = columnProcessingService;
        this.progressService = progressService;
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    public ReconciliationResponse reconcile(ReconciliationRequest request) {
        String partnerKeyValue;
        Map<String, String> firstPartnerRecord;
        String boKeyValue;
        Map<String, String> firstBoRecord;
        long startTime = System.currentTimeMillis();
        logger.info("Début de la réconciliation - BO: {} lignes, Partenaire: {} lignes", (Object)request.getBoFileContent().size(), (Object)request.getPartnerFileContent().size());
        String boModelId = request.getModelId();
        String partnerModelId = null;
        if (boModelId == null && request.getBoColumnFilters() != null && !request.getBoColumnFilters().isEmpty()) {
            boModelId = request.getBoColumnFilters().get(0).getModelId();
        }
        logger.info("🔍 Recherche du modèle partenaire pour les données partenaires...");
        partnerModelId = this.configurableReconciliationService.getPartnerModelId(request);
        if (partnerModelId != null && !partnerModelId.isEmpty()) {
            logger.info("✅ ModelId partenaire détecté automatiquement: {}", (Object)partnerModelId);
        } else {
            logger.warn("⚠️ Aucun modèle partenaire spécifique trouvé pour les données partenaires");
            logger.info("  📋 Colonnes partenaires détectées: {}", (Object)(request.getPartnerFileContent().isEmpty() ? "aucune" : String.join((CharSequence)", ", request.getPartnerFileContent().get(0).keySet())));
            partnerModelId = boModelId;
            logger.info("⚠️ Utilisation du modelId général (BO) comme fallback: {}", (Object)partnerModelId);
        }
        List<Map<String, String>> processedBoData = this.applyColumnProcessingRules(request.getBoFileContent(), "bo", boModelId);
        List<Map<String, String>> processedPartnerData = this.applyColumnProcessingRules(request.getPartnerFileContent(), "partner", partnerModelId);
        if (!processedBoData.isEmpty()) {
            firstBoRecord = processedBoData.get(0);
            boKeyValue = firstBoRecord.get(request.getBoKeyColumn());
            logger.debug("Exemple clé BO: {} -> {}", (Object)request.getBoKeyColumn(), (Object)boKeyValue);
        }
        if (!processedPartnerData.isEmpty()) {
            firstPartnerRecord = processedPartnerData.get(0);
            partnerKeyValue = firstPartnerRecord.get(request.getPartnerKeyColumn());
            logger.debug("Exemple clé Partenaire: {} -> {}", (Object)request.getPartnerKeyColumn(), (Object)partnerKeyValue);
        }
        if (!processedBoData.isEmpty()) {
            logger.debug("Colonnes BO disponibles: {}", processedBoData.get(0).keySet());
        }
        if (!processedPartnerData.isEmpty()) {
            logger.debug("Colonnes Partenaire disponibles: {}", processedPartnerData.get(0).keySet());
        }
        logger.info("🚀 Début de la réconciliation optimisée");
        logger.info("📊 Données BO: {} lignes", (Object)processedBoData.size());
        logger.info("📊 Données Partenaire: {} lignes", (Object)processedPartnerData.size());
        logger.info("🔑 Clé BO: '{}'", (Object)request.getBoKeyColumn());
        logger.info("🔑 Clé Partenaire: '{}'", (Object)request.getPartnerKeyColumn());
        if (!processedBoData.isEmpty()) {
            firstBoRecord = processedBoData.get(0);
            boKeyValue = firstBoRecord.get(request.getBoKeyColumn());
            logger.info("🔍 Exemple clé BO (après traitement): '{}' -> '{}'", (Object)request.getBoKeyColumn(), (Object)boKeyValue);
        }
        if (!processedPartnerData.isEmpty()) {
            firstPartnerRecord = processedPartnerData.get(0);
            partnerKeyValue = firstPartnerRecord.get(request.getPartnerKeyColumn());
            logger.info("🔍 Exemple clé Partenaire (après traitement): '{}' -> '{}'", (Object)request.getPartnerKeyColumn(), (Object)partnerKeyValue);
        }
        if (!processedBoData.isEmpty()) {
            logger.info("📋 Colonnes BO disponibles: {}", processedBoData.get(0).keySet());
        }
        if (!processedPartnerData.isEmpty()) {
            logger.info("📋 Colonnes Partenaire disponibles: {}", processedPartnerData.get(0).keySet());
        }
        try {
            Object result;
            logger.info("🚀 Début de la réconciliation optimisée pour performance");
            logger.info("📊 Nombre d'enregistrements BO: {}", (Object)processedBoData.size());
            logger.info("📊 Nombre d'enregistrements Partenaire: {}", (Object)processedPartnerData.size());
            logger.info("⚡ Threads parallèles: {}", (Object)PARALLEL_THREADS);
            ConfigurableReconciliationService.ReconciliationLogicType logicType = this.configurableReconciliationService.determineReconciliationLogic(request);
            logger.info("🔍 Vérification de la détection TRXBO/OPPART...");
            boolean isTRXBOOPPART = this.configurableReconciliationService.detectTRXBOOPPARTContent(request);
            logger.info("🔍 Résultat de la détection TRXBO/OPPART: {}", (Object)isTRXBOOPPART);
            String requestedType = request.getReconciliationType() == null ? "1-1" : request.getReconciliationType();
            boolean isCustomRatio = this.isSupportedParametricType(requestedType);
            String configuredType = this.configurableReconciliationService.getConfiguredReconciliationType(request);
            boolean isConfiguredRatio = this.isSupportedParametricType(configuredType);
            String effectiveType = isCustomRatio ? requestedType : (isConfiguredRatio ? configuredType : null);
            this.releaseRequestFileContent(request);
            if (isTRXBOOPPART) {
                logger.info("🔍 Réconciliation TRXBO/OPPART détectée - Utilisation de la logique SPECIAL_RATIO{}", effectiveType != null ? " paramétrée sur le ratio " + effectiveType : " (ratio historique 1:2)");
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
                return this.reconcileWithParametricType(request, processedBoData, processedPartnerData, startTime);
            } else {
                logger.info("🔒 RÉCONCILIATION AUTOMATIQUE - Forçage de la logique 1-1 (pas de correspondances multiples)");
                if (!"1-1".equals(requestedType)) {
                    logger.info("⚠️ Type paramétrable détecté: {} mais IGNORÉ pour la réconciliation automatique - Forçage 1-1", requestedType);
                }
                if (logicType == ConfigurableReconciliationService.ReconciliationLogicType.SPECIAL_RATIO) {
                    logger.info("⚠️ Logique SPECIAL_RATIO détectée mais IGNORÉE pour la réconciliation automatique - Utilisation de la logique standard 1-1");
                    logicType = ConfigurableReconciliationService.ReconciliationLogicType.STANDARD;
                }
                logger.info("✅ Logique standard 1-1 utilisée pour la réconciliation automatique - Logique configurable: {}", logicType);
            }
            Runtime runtime = Runtime.getRuntime();
            long maxMemory = runtime.maxMemory();
            long totalMemory = runtime.totalMemory();
            long freeMemory = runtime.freeMemory();
            long usedMemory = totalMemory - freeMemory;
            logger.info("💾 État mémoire - Max: {} MB, Utilisé: {} MB, Libre: {} MB", new Object[]{maxMemory / 1024L / 1024L, usedMemory / 1024L / 1024L, freeMemory / 1024L / 1024L});
            if (logicType == ConfigurableReconciliationService.ReconciliationLogicType.SPECIAL_RATIO) {
                logger.info("🔄 Utilisation de la méthode de réconciliation SPECIAL_RATIO pour TRXBO/OPPART");
                request.setBoFileContent(processedBoData);
                request.setPartnerFileContent(processedPartnerData);
                return this.reconcileWithSpecialRatio(request, startTime);
            }
            List<Map<String, String>> filteredBoRecords = this.applyBOFilters(processedBoData, request.getBoColumnFilters());
            logger.info("✅ Nombre d'enregistrements BO après filtrage: {}", (Object)filteredBoRecords.size());
            this.publishProgress(request, 1.0, "Indexation des enregistrements partenaire...", 0, filteredBoRecords.size(), 0, 0, processedPartnerData.size());
            ReconciliationResponse response = new ReconciliationResponse();
            response.setMatches(new ArrayList<ReconciliationResponse.Match>());
            response.setBoOnly(new ArrayList<Map<String, String>>());
            response.setPartnerOnly(new ArrayList<Map<String, String>>());
            response.setMismatches(new ArrayList<Map<String, String>>());
            logger.info("🔍 Création de l'index optimisé des enregistrements partenaire...");
            if (request.getAdditionalKeys() != null && !request.getAdditionalKeys().isEmpty()) {
                logger.info("🔑 Clés supplémentaires utilisées: {} paires", (Object)request.getAdditionalKeys().size());
            }
            HashMap<String, List<Map<String, String>>> partnerIndex = new HashMap<String, List<Map<String, String>>>();
            if (this.executorService.isShutdown()) {
                logger.error("❌ ExecutorService est fermé, impossible de traiter la réconciliation");
                throw new RuntimeException("ExecutorService non disponible");
            }
            String normalizedBoKeyColumn = request.getBoKeyColumn();
            String normalizedPartnerKeyColumn = request.getPartnerKeyColumn();
            logger.info("🔧 Normalisation des noms de colonnes:");
            logger.info("  BO Key: '{}' -> '{}'", (Object)request.getBoKeyColumn(), (Object)normalizedBoKeyColumn);
            logger.info("  Partner Key: '{}' -> '{}'", (Object)request.getPartnerKeyColumn(), (Object)normalizedPartnerKeyColumn);
            int partnerChunkSize = processedPartnerData.size() / PARALLEL_THREADS;
            ArrayList<CompletableFuture<Void>> partnerIndexFutures = new ArrayList<CompletableFuture<Void>>();
            for (int i = 0; i < PARALLEL_THREADS; ++i) {
                int startIndex = i * partnerChunkSize;
                int endIndex = i == PARALLEL_THREADS - 1 ? processedPartnerData.size() : (i + 1) * partnerChunkSize;
                CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                    for (int j = startIndex; j < endIndex; ++j) {
                        Map partnerRecord = (Map)processedPartnerData.get(j);
                        String partnerKey = this.buildCompositeKey(partnerRecord, normalizedPartnerKeyColumn, request.getAdditionalKeys(), false);
                        if (partnerKey == null) continue;
                        Map map = partnerIndex;
                        synchronized (map) {
                            partnerIndex.computeIfAbsent(partnerKey, k -> new ArrayList()).add(partnerRecord);
                            continue;
                        }
                    }
                }, this.executorService);
                partnerIndexFutures.add(future);
            }
            CompletableFuture.allOf(partnerIndexFutures.toArray(new CompletableFuture[0])).join();
            if (request.getAdditionalKeys() != null && !request.getAdditionalKeys().isEmpty()) {
                logger.info("✅ Index partenaire optimisé créé avec {} clés (incluant clés supplémentaires)", (Object)partnerIndex.size());
            } else {
                logger.info("✅ Index partenaire optimisé créé avec {} clés", (Object)partnerIndex.size());
            }
            logger.info("🔄 Début du traitement par lots (taille: {})", (Object)10000);
            this.publishProgress(request, 2.0, "Traitement des enregistrements BO...", 0, filteredBoRecords.size(), 0, 0, this.countPartnerIndexRemaining(partnerIndex));
            int totalRecords = filteredBoRecords.size();
            int processedRecords = 0;
            for (int i = 0; i < filteredBoRecords.size(); i += 10000) {
                int endIndex = Math.min(i + 10000, filteredBoRecords.size());
                List<Map<String, String>> chunk = filteredBoRecords.subList(i, endIndex);
                result = this.processBatchOptimized(chunk, partnerIndex, request, normalizedBoKeyColumn);
                response.getMatches().addAll(((ReconciliationBatchResult)result).getMatches());
                response.getBoOnly().addAll(((ReconciliationBatchResult)result).getBoOnly());
                response.getMismatches().addAll(((ReconciliationBatchResult)result).getMismatches());
                long currentTime = System.currentTimeMillis();
                long elapsedTime = currentTime - startTime;
                double progress = (double)(processedRecords += ((ReconciliationBatchResult)result).getProcessedCount()) / (double)totalRecords * 100.0;
                double recordsPerSecond = (double)processedRecords / ((double)elapsedTime / 1000.0);
                logger.info("📊 Progression: {}% ({}/{} enregistrements) - Vitesse: {} rec/s - Temps: {} ms", new Object[]{String.format("%.2f", progress), processedRecords, totalRecords, String.format("%.0f", recordsPerSecond), elapsedTime});
                this.publishProgress(request, progress, String.format("Traitement %,d / %,d enregistrements BO", processedRecords, totalRecords), processedRecords, totalRecords, response.getMatches().size(), response.getBoOnly().size(), this.countPartnerIndexRemaining(partnerIndex));
            }
            logger.info("🔍 Recherche optimisée des enregistrements uniquement partenaire...");
            this.publishProgress(request, 99.0, "Recherche des enregistrements uniquement partenaire...", totalRecords, totalRecords, response.getMatches().size(), response.getBoOnly().size(), this.countPartnerIndexRemaining(partnerIndex));
            int partnerOnlyCount = 0;
            for (List<Map<String, String>> partnersForKey : partnerIndex.values()) {
                result = partnersForKey;
                synchronized (result) {
                    for (Map<String, String> partnerRecord : partnersForKey) {
                        response.getPartnerOnly().add(partnerRecord);
                        if (++partnerOnlyCount > 10) continue;
                        String partnerKey = this.buildCompositeKey(partnerRecord, normalizedPartnerKeyColumn, request.getAdditionalKeys(), false);
                        logger.info("Enregistrement uniquement partenaire trouvé: {}", (Object)partnerKey);
                    }
                }
            }
            partnerIndex.clear();
            logger.info("✅ Nombre total d'enregistrements uniquement partenaire: {}", (Object)partnerOnlyCount);
            response.setTotalBoRecords(filteredBoRecords.size());
            response.setTotalPartnerRecords(processedPartnerData.size());
            response.setTotalMatches(response.getMatches().size());
            response.setTotalMismatches(response.getMismatches().size());
            response.setTotalBoOnly(response.getBoOnly().size());
            response.setTotalPartnerOnly(response.getPartnerOnly().size());
            long totalTime = System.currentTimeMillis() - startTime;
            double recordsPerSecond = (double)totalRecords / ((double)totalTime / 1000.0);
            response.setExecutionTimeMs(totalTime);
            response.setProcessedRecords(totalRecords);
            response.setProgressPercentage(100.0);
            this.publishProgress(request, 100.0, "Réconciliation terminée", totalRecords, totalRecords, response.getTotalMatches(), response.getTotalBoOnly(), response.getTotalPartnerOnly());
            logger.info("🎯 RÉSULTATS FINAUX:");
            logger.info("📊 Total BO: {}", (Object)response.getTotalBoRecords());
            logger.info("📊 Total Partenaire: {}", (Object)response.getTotalPartnerRecords());
            logger.info("✅ Correspondances: {}", (Object)response.getTotalMatches());
            logger.info("❌ Différences: {}", (Object)response.getTotalMismatches());
            logger.info("📈 Uniquement BO: {}", (Object)response.getTotalBoOnly());
            logger.info("📈 Uniquement Partenaire: {}", (Object)response.getTotalPartnerOnly());
            logger.info("⚡ Performance: {} enregistrements/seconde", (Object)String.format("%.0f", recordsPerSecond));
            logger.info("⏱️  Temps total d'exécution: {} ms ({} secondes)", (Object)totalTime, (Object)String.format("%.2f", (double)totalTime / 1000.0));
            this.releaseReconciliationWorkingSets(processedPartnerData);
            return response;
        }
        catch (Exception e) {
            long totalTime = System.currentTimeMillis() - startTime;
            logger.error("❌ Erreur lors de la réconciliation après {} ms: {}", new Object[]{totalTime, e.getMessage(), e});
            throw new RuntimeException("Erreur lors de la réconciliation: " + e.getMessage(), e);
        }
    }

    @Deprecated
    private boolean detectTRXBOOPPARTReconciliation(ReconciliationRequest request) {
        boolean hasNumeroTransGU;
        Map<String, String> firstBoRecord;
        Set<String> partnerColumns;
        Set<String> boColumns;
        Map<String, String> firstPartnerRecord;
        logger.info("🔍 Début de la détection TRXBO/OPPART");
        boolean hasTRXBO = false;
        boolean hasOPPART = false;
        if (!request.getPartnerFileContent().isEmpty()) {
            firstPartnerRecord = request.getPartnerFileContent().get(0);
            Set set = firstPartnerRecord.keySet();
            boolean hasToken = set.contains("Token");
            boolean hasCodePixi = set.contains("Code PIXI");
            boolean hasCodeProxy = set.contains("Code de Proxy");
            boolean hasGroupeReseaux = set.contains("Groupe R seaux");
            if (hasToken && hasCodePixi && hasCodeProxy && hasGroupeReseaux) {
                logger.info("🔍 USSDPART détecté par colonnes spécifiques - Exclusion de la logique TRXBO/OPPART");
                return false;
            }
        }
        for (Map<String, String> map : request.getBoFileContent()) {
            for (String value : map.values()) {
                if (value == null || !value.contains("TRXBO")) continue;
                hasTRXBO = true;
                logger.info("🔍 TRXBO détecté dans les valeurs: {}", (Object)value);
                break;
            }
            if (!hasTRXBO) continue;
            break;
        }
        for (Map<String, String> map : request.getPartnerFileContent()) {
            for (String value : map.values()) {
                if (value == null || !value.contains("OPPART")) continue;
                hasOPPART = true;
                logger.info("🔍 OPPART détecté dans les valeurs: {}", (Object)value);
                break;
            }
            if (!hasOPPART) continue;
            break;
        }
        if (!hasTRXBO && !request.getBoFileContent().isEmpty() && (hasTRXBO = (boColumns = request.getBoFileContent().get(0).keySet()).stream().anyMatch(col -> col.contains("TRXBO")))) {
            logger.info("🔍 TRXBO détecté dans les colonnes BO");
        }
        if (!hasOPPART && !request.getPartnerFileContent().isEmpty() && (hasOPPART = (partnerColumns = request.getPartnerFileContent().get(0).keySet()).stream().anyMatch(col -> col.contains("OPPART")))) {
            logger.info("🔍 OPPART détecté dans les colonnes Partenaire");
        }
        if (!hasTRXBO && !request.getBoFileContent().isEmpty()) {
            firstBoRecord = request.getBoFileContent().get(0);
            logger.info("🔍 Vérification des colonnes TRXBO spécifiques...");
            boolean bl = firstBoRecord.containsKey("IDTransaction");
            boolean hasTelephoneClient = firstBoRecord.containsKey("téléphone client") || firstBoRecord.containsKey("t l phone client");
            boolean hasMontant = firstBoRecord.containsKey("montant");
            boolean hasService = firstBoRecord.containsKey("Service");
            hasNumeroTransGU = firstBoRecord.containsKey("Numéro Trans GU") || firstBoRecord.containsKey("Numero Trans GU");
            logger.info("🔍 Colonnes TRXBO - IDTransaction: {}, téléphone client: {}, montant: {}, Service: {}, Numéro Trans GU: {}", new Object[]{bl, hasTelephoneClient, hasMontant, hasService, hasNumeroTransGU});
            int trxboColumnCount = 0;
            if (bl) {
                ++trxboColumnCount;
            }
            if (hasTelephoneClient) {
                ++trxboColumnCount;
            }
            if (hasMontant) {
                ++trxboColumnCount;
            }
            if (hasService) {
                ++trxboColumnCount;
            }
            if (hasNumeroTransGU) {
                ++trxboColumnCount;
            }
            boolean bl2 = hasTRXBO = trxboColumnCount >= 4;
            if (hasTRXBO) {
                logger.info("🔍 TRXBO détecté par colonnes spécifiques ({} colonnes TRXBO)", (Object)trxboColumnCount);
            }
            if (!hasTRXBO) {
                logger.info("🔍 Vérification des valeurs de service...");
                for (Map<String, String> map : request.getBoFileContent()) {
                    String service = map.get("Service");
                    if (service == null || !service.contains("PAIEMENT") && !service.contains("MARCHAND")) continue;
                    hasTRXBO = true;
                    logger.info("🔍 TRXBO détecté par valeur de service: {}", (Object)service);
                    break;
                }
            }
            if (!hasTRXBO) {
                boolean bl3;
                Set<String> boColumns2 = firstBoRecord.keySet();
                boolean bl4 = bl3 = boColumns2.contains("IDTransaction") || boColumns2.contains("téléphone client") || boColumns2.contains("t l phone client") || boColumns2.contains("montant") || boColumns2.contains("Service") || boColumns2.contains("Numéro Trans GU") || boColumns2.contains("Numero Trans GU");
                if (bl3) {
                    hasTRXBO = true;
                    logger.info("🔍 Détection TRXBO basée sur les colonnes disponibles: {}", (Object)boColumns2);
                }
            }
        }
        if (!hasOPPART && !request.getPartnerFileContent().isEmpty()) {
            firstPartnerRecord = request.getPartnerFileContent().get(0);
            logger.info("🔍 Vérification des colonnes OPPART spécifiques...");
            boolean bl = firstPartnerRecord.containsKey("Type Opération");
            boolean hasMontant = firstPartnerRecord.containsKey("Montant");
            boolean hasSoldeAvant = firstPartnerRecord.containsKey("Solde avant");
            boolean hasSoldeApres = firstPartnerRecord.containsKey("Solde aprés") || firstPartnerRecord.containsKey("Solde après");
            hasNumeroTransGU = firstPartnerRecord.containsKey("Numéro Trans GU") || firstPartnerRecord.containsKey("Numero Trans GU");
            logger.info("🔍 Colonnes OPPART - Type Opération: {}, Montant: {}, Solde avant: {}, Solde aprés: {}, Numéro Trans GU: {}", new Object[]{bl, hasMontant, hasSoldeAvant, hasSoldeApres, hasNumeroTransGU});
            int oppartColumnCount = 0;
            if (bl) {
                ++oppartColumnCount;
            }
            if (hasMontant) {
                ++oppartColumnCount;
            }
            if (hasSoldeAvant) {
                ++oppartColumnCount;
            }
            if (hasSoldeApres) {
                ++oppartColumnCount;
            }
            if (hasNumeroTransGU) {
                ++oppartColumnCount;
            }
            boolean bl5 = hasOPPART = oppartColumnCount >= 4;
            if (hasOPPART) {
                logger.info("🔍 OPPART détecté par colonnes spécifiques ({} colonnes OPPART)", (Object)oppartColumnCount);
            }
            if (!hasOPPART) {
                logger.info("🔍 Vérification des valeurs de type d'opération...");
                for (Map map : request.getPartnerFileContent()) {
                    String typeOperation = (String)map.get("Type Opération");
                    if (typeOperation == null || !typeOperation.contains("IMPACT")) continue;
                    hasOPPART = true;
                    logger.info("🔍 OPPART détecté par valeur de type d'opération: {}", (Object)typeOperation);
                    break;
                }
            }
            if (!hasOPPART) {
                boolean bl6;
                Set<String> partnerColumns3 = firstPartnerRecord.keySet();
                boolean bl7 = bl6 = partnerColumns3.contains("Type Opération") || partnerColumns3.contains("Montant") || partnerColumns3.contains("Solde avant") || partnerColumns3.contains("Solde aprés") || partnerColumns3.contains("Solde après") || partnerColumns3.contains("Numéro Trans GU") || partnerColumns3.contains("Numero Trans GU");
                if (bl6) {
                    hasOPPART = true;
                    logger.info("🔍 Détection OPPART basée sur les colonnes disponibles: {}", partnerColumns3);
                }
            }
        }
        logger.info("🔍 Détection TRXBO/OPPART - TRXBO: {}, OPPART: {}", (Object)hasTRXBO, (Object)hasOPPART);
        if (!request.getBoFileContent().isEmpty()) {
            firstBoRecord = request.getBoFileContent().get(0);
            logger.info("🔍 Colonnes BO disponibles: {}", firstBoRecord.keySet());
            logger.info("🔍 Exemple valeurs BO: {}", firstBoRecord.values());
        }
        if (!request.getPartnerFileContent().isEmpty()) {
            firstPartnerRecord = request.getPartnerFileContent().get(0);
            logger.info("🔍 Colonnes Partenaire disponibles: {}", firstPartnerRecord.keySet());
            logger.info("🔍 Exemple valeurs Partenaire: {}", firstPartnerRecord.values());
        }
        return hasTRXBO && hasOPPART;
    }

    private ReconciliationResponse reconcileWithSpecialRatio(ReconciliationRequest request, long startTime) {
        logger.info("🔄 Début de la réconciliation avec logique de ratio spéciale configurable");
        int expectedCount = this.resolveSpecialRatioExpectedCount(request);
        logger.info("📏 Ratio attendu par la logique SPECIAL_RATIO: 1:{}", expectedCount);
        List<ConfigurableReconciliationService.CorrespondenceRule> modelRules = this.configurableReconciliationService.getCorrespondenceRules(request);
        List<ConfigurableReconciliationService.CorrespondenceRule> correspondenceRules = this.createDefaultTRXBOOPPARTRules(expectedCount);
        if (!modelRules.isEmpty()) {
            logger.info("⚠️ {} règle(s) de correspondance configurée(s) sur le modèle ignorée(s) pour SPECIAL_RATIO : leurs conditions 'partnerMatches' sont figées sur l'ancien ratio 1:2. La classification métier TRXBO/OPPART (TSOP, TRXSF, RGFRAIS, TRXSVC) est recalculée sur le ratio effectif 1:{}", modelRules.size(), expectedCount);
        }
        TrxboOppartConfig trxboOppartConfig = this.configurableReconciliationService.getTrxboOppartConfig(request);
        logger.info("🏷️ Libellés d'opérations retenus: impact='{}', frais='{}', commission='{}'", trxboOppartConfig.getImpactType(), trxboOppartConfig.getFeesType(), trxboOppartConfig.getCommissionType());
        logger.info("💬 Commentaires retenus: tsop='{}', trxsf='{}', rgfrais='{}', trxsvc='{}', trxsfTrxsvc='{}', ecart='{}', partnerOnly='{}'", trxboOppartConfig.getCommentTsop(), trxboOppartConfig.getCommentTrxsf(), trxboOppartConfig.getCommentRgfrais(), trxboOppartConfig.getCommentTrxsvc(), trxboOppartConfig.getCommentTrxsfTrxsvc(), trxboOppartConfig.getCommentEcart(), trxboOppartConfig.getCommentPartnerOnly());
        List<Map<String, String>> filteredBoRecords = this.applyBOFilters(request.getBoFileContent(), request.getBoColumnFilters());
        logger.info("✅ Nombre d'enregistrements BO après filtrage: {}", (Object)filteredBoRecords.size());
        ReconciliationResponse response = new ReconciliationResponse();
        response.setMatches(new ArrayList<ReconciliationResponse.Match>());
        response.setBoOnly(new ArrayList<Map<String, String>>());
        response.setPartnerOnly(new ArrayList<Map<String, String>>());
        response.setMismatches(new ArrayList<Map<String, String>>());
        response.setRegularisationRules(trxboOppartConfig.regularisationRulesAsList());
        response.setConfigComments(trxboOppartConfig.commentsAsMap());
        response.setTrxboOppartConfig(trxboOppartConfig.toMap());
        HashMap<String, List<Map<String, String>>> partnerIndex = new HashMap<>();
        logger.info("🔍 DEBUG - Création de l'index Partner avec colonne clé: '{}'", request.getPartnerKeyColumn());
        if (request.getAdditionalKeys() != null && !request.getAdditionalKeys().isEmpty()) {
            logger.info("🔑 Clés supplémentaires utilisées: {} paires", (Object)request.getAdditionalKeys().size());
        }
        int partnerKeysWithNull = 0;
        for (Map<String, String> partnerRecord : request.getPartnerFileContent()) {
            String partnerKey = this.buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(), request.getAdditionalKeys(), false);
            if (partnerKey != null) {
                partnerIndex.computeIfAbsent(partnerKey, k -> new ArrayList()).add(partnerRecord);
                continue;
            }
            ++partnerKeysWithNull;
        }
        logger.info("✅ Index OPPART créé avec {} clés uniques (incluant clés supplémentaires) ({} enregistrements avec clé null)", (Object)partnerIndex.size(), (Object)partnerKeysWithNull);
        if (!partnerIndex.isEmpty()) {
            int sampleCount = Math.min(5, partnerIndex.size());
            logger.info("🔍 DEBUG - Exemples de clés Partner ({} premiers):", (Object)sampleCount);
            int count = 0;
            for (String key : partnerIndex.keySet()) {
                if (count >= sampleCount) break;
                logger.info("  Partner Key[{}]: '{}' (longueur: {})", new Object[]{count, key, key != null ? key.length() : 0});
                ++count;
            }
        }
        HashSet<String> processedPartnerKeys = new HashSet<String>();
        Set<Map<String, String>> usedPartnerRecords = Collections.newSetFromMap(new IdentityHashMap<Map<String, String>, Boolean>());
        int processedCount = 0;
        int boKeysWithNull = 0;
        int boKeysNotFound = 0;
        HashSet<String> sampleBoKeys = new HashSet<String>();
        HashSet<String> samplePartnerKeys = new HashSet<>();
        logger.info("🔍 DEBUG - Traitement des enregistrements BO avec colonne clé: '{}'", (Object)request.getBoKeyColumn());
        for (Map<String, String> boRecord : filteredBoRecords) {
            String action;
            List<Map<String, String>> list;
            int partnerMatchCount;
            String string = this.buildCompositeKey(boRecord, request.getBoKeyColumn(), request.getAdditionalKeys(), true);
            if (string == null) {
                ++boKeysWithNull;
                response.getBoOnly().add(boRecord);
                ++processedCount;
                continue;
            }
            if (sampleBoKeys.size() < 5) {
                sampleBoKeys.add(string);
            }
            int n = partnerMatchCount = (list = partnerIndex.get(string)) != null ? list.size() : 0;
            if (partnerMatchCount == 0) {
                ++boKeysNotFound;
            }
            if (processedCount < 10) {
                logger.info("🔍 DEBUG - TRXBO key[{}]: '{}' (longueur: {}) -> {} correspondances OPPART", new Object[]{processedCount, string, string != null ? string.length() : 0, partnerMatchCount});
            }
            if (processedCount < 5 && partnerMatchCount == 0) {
                boolean foundWithTrim;
                String trimmedBoKey = string != null ? string.trim() : null;
                boolean bl = foundWithTrim = trimmedBoKey != null && partnerIndex.containsKey(trimmedBoKey);
                if (samplePartnerKeys.size() < 5 && !partnerIndex.isEmpty()) {
                    samplePartnerKeys.addAll(partnerIndex.keySet().stream().limit(5 - samplePartnerKeys.size()).collect(Collectors.toList()));
                }
                logger.warn("⚠️ DEBUG - Clé BO '{}' non trouvée dans l'index Partner", (Object)string);
                logger.warn("  Trouvée avec trim? {}", (Object)foundWithTrim);
                if (foundWithTrim) {
                    logger.warn("  ⚠️ PROBLÈME DÉTECTÉ: Les clés nécessitent un trim()!");
                }
            }
            action = this.determineTRXBOAction(list, partnerMatchCount, expectedCount, trxboOppartConfig);
            if (list != null && partnerMatchCount > 0) {
                usedPartnerRecords.addAll(list);
            }
            switch (action) {
                case "MARK_AS_MATCH": {
                    logger.debug("✅ CORRESPONDANCE PARFAITE: {} correspondances pour key: {}", (Object)partnerMatchCount, (Object)string);
                    ReconciliationResponse.Match match = new ReconciliationResponse.Match();
                    match.setKey((String)boRecord.get(request.getBoKeyColumn()));
                    match.setBoData(boRecord);
                    HashMap<String, String> combinedPartnerData = new HashMap<String, String>();
                    if (list != null) {
                        for (int i = 0; i < list.size(); ++i) {
                            Map<String, String> partnerRecord = list.get(i);
                            for (Map.Entry<String, String> entry : partnerRecord.entrySet()) {
                                String key = (String)entry.getKey();
                                String value = (String)entry.getValue();
                                combinedPartnerData.put(key + "_PARTNER_" + (i + 1), value);
                            }
                        }
                    }
                    match.setPartnerData(combinedPartnerData);
                    match.setDifferences(new ArrayList<ReconciliationResponse.Difference>());
                    response.getMatches().add(match);
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_MISMATCH_TRXSF": {
                    logger.debug("⚠️ TRXSF: {} correspondance (IMPACT_COMPTE_GENERAL) pour key: {}", (Object)partnerMatchCount, (Object)string);
                    HashMap<String, String> boRecordTRXSF = new HashMap<String, String>(boRecord);
                    boRecordTRXSF.put("Commentaire", trxboOppartConfig.getCommentTrxsf());
                    response.getBoOnly().add(boRecordTRXSF);
                    if (list != null) {
                        for (Map<String, String> partnerRecord : list) {
                            HashMap<String, String> partnerRecordTRXSF = new HashMap<String, String>(partnerRecord);
                            partnerRecordTRXSF.put("Commentaire", trxboOppartConfig.getCommentTrxsf());
                            response.getPartnerOnly().add(partnerRecordTRXSF);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_MISMATCH_FRAIS_ET_COMMISSION": {
                    logger.debug("⚠️ {} : {} correspondances (frais et commission sans IMPACT_COMPTE_GENERAL) pour key: {}", new Object[]{trxboOppartConfig.getCommentFraisEtCommission(), partnerMatchCount, string});
                    HashMap<String, String> boRecordFraisCom = new HashMap<String, String>(boRecord);
                    boRecordFraisCom.put("Commentaire", trxboOppartConfig.getCommentFraisEtCommission());
                    response.getBoOnly().add(boRecordFraisCom);
                    if (list != null) {
                        for (Map<String, String> partnerRecordFraisCom : list) {
                            HashMap<String, String> partnerRecordCopy = new HashMap<String, String>(partnerRecordFraisCom);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentFraisEtCommission());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_PARTNER_ONLY_REGCOM": {
                    logger.debug("⚠️ {} : {} correspondance (commission sans IMPACT_COMPTE_GENERAL) pour key: {}", new Object[]{trxboOppartConfig.getCommentRegcom(), partnerMatchCount, string});
                    response.getBoOnly().add(boRecord);
                    if (list != null) {
                        for (Map<String, String> partnerRecordRegcom : list) {
                            HashMap<String, String> partnerRecordCopy = new HashMap<String, String>(partnerRecordRegcom);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentRegcom());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_ADDITIONAL_OPERATION_TYPE": {
                    TrxboOppartConfig.AdditionalOperationType additionalOperationType = this.findAdditionalOperationType(list, trxboOppartConfig);
                    if (additionalOperationType == null) {
                        response.getBoOnly().add(boRecord);
                        processedPartnerKeys.add(string);
                        break;
                    }
                    String additionalCommentBo = additionalOperationType.getCommentBo();
                    String additionalCommentPartner = additionalOperationType.getCommentPartner();
                    logger.debug("⚠️ Type d'opération supplémentaire {} : {} correspondance pour key: {}", new Object[]{additionalOperationType.getLabel(), partnerMatchCount, string});
                    HashMap<String, String> boRecordAdditional = new HashMap<String, String>(boRecord);
                    if (additionalCommentBo != null && !additionalCommentBo.trim().isEmpty()) {
                        boRecordAdditional.put("Commentaire", additionalCommentBo);
                    }
                    response.getBoOnly().add(boRecordAdditional);
                    if (list != null) {
                        for (Map<String, String> partnerRecordAdditional : list) {
                            HashMap<String, String> partnerRecordCopy = new HashMap<String, String>(partnerRecordAdditional);
                            if (additionalCommentPartner != null && !additionalCommentPartner.trim().isEmpty()) {
                                partnerRecordCopy.put("Commentaire", additionalCommentPartner);
                            }
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_PARTNER_ONLY_RGFRAIS": {
                    TrxboOppartConfig.AdditionalOperationType compenseType = findAdditionalOperationTypeByLabel(trxboOppartConfig, "COMPENSE");
                    String rgfraisCommentBo = (compenseType != null && compenseType.getCommentBo() != null && !compenseType.getCommentBo().trim().isEmpty())
                            ? compenseType.getCommentBo()
                            : (compenseType != null ? compenseType.getLabel() : trxboOppartConfig.getCommentRgfrais());
                    String rgfraisCommentPartner = (compenseType != null && compenseType.getCommentPartner() != null && !compenseType.getCommentPartner().trim().isEmpty())
                            ? compenseType.getCommentPartner()
                            : (compenseType != null ? compenseType.getLabel() : trxboOppartConfig.getCommentRgfrais());
                    logger.debug("⚠️ {} : {} correspondance (frais sans IMPACT_COMPTE_GENERAL) pour key: {}", new Object[]{rgfraisCommentBo, partnerMatchCount, string});
                    response.getBoOnly().add(boRecord);
                    if (list != null) {
                        for (Map<String, String> partnerRecord2 : list) {
                            HashMap<String, String> partnerRecordRg = new HashMap<String, String>(partnerRecord2);
                            partnerRecordRg.put("Commentaire", rgfraisCommentPartner);
                            response.getPartnerOnly().add(partnerRecordRg);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_MISMATCH_TRXSF_TRXSVC": {
                    logger.debug("⚠️ TRXSF & TRXSVC: {} correspondance (IMPACT_COMPTE_GENERAL seul, ratio 1:{}) pour key: {}", new Object[]{partnerMatchCount, expectedCount, string});
                    HashMap<String, String> boRecordTrxsfSvc = new HashMap<String, String>(boRecord);
                    boRecordTrxsfSvc.put("Commentaire", trxboOppartConfig.getCommentTrxsfTrxsvc());
                    response.getBoOnly().add(boRecordTrxsfSvc);
                    if (list != null) {
                        for (Map<String, String> partnerRecordTrxsfSvc : list) {
                            HashMap<String, String> partnerRecordCopy = new HashMap<String, String>(partnerRecordTrxsfSvc);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentTrxsfTrxsvc());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_MISMATCH_FRAIS_SANS_COMMISSION": {
                    logger.debug("⚠️ {} : {} correspondance (frais sans commission, ratio 1:{}) pour key: {}", new Object[]{trxboOppartConfig.getCommentFraisSansCommission(), partnerMatchCount, expectedCount, string});
                    HashMap<String, String> boRecordFrais = new HashMap<String, String>(boRecord);
                    boRecordFrais.put("Commentaire", trxboOppartConfig.getCommentFraisSansCommission());
                    response.getBoOnly().add(boRecordFrais);
                    if (list != null) {
                        for (Map<String, String> partnerRecordFrais : list) {
                            HashMap<String, String> partnerRecordCopy = new HashMap<String, String>(partnerRecordFrais);
                            partnerRecordCopy.put("Commentaire", trxboOppartConfig.getCommentFraisSansCommission());
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_MISMATCH_TRXSVC": {
                    logger.debug("⚠️ TRXSVC: {} correspondances sans VERSEMENT_COMMISSION (ratio 1:{}) pour key: {}", new Object[]{partnerMatchCount, expectedCount, string});
                    HashMap<String, String> boRecordSvc = new HashMap<String, String>(boRecord);
                    boRecordSvc.put("Commentaire", trxboOppartConfig.getCommentTrxsvc());
                    response.getBoOnly().add(boRecordSvc);
                    if (list != null) {
                        for (Map<String, String> partnerRecordSvc : list) {
                            HashMap<String, String> partnerRecordCopy = new HashMap<String, String>(partnerRecordSvc);
                            partnerRecordCopy.put("Commentaire", "TRXSVC");
                            response.getPartnerOnly().add(partnerRecordCopy);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_MISMATCH": {
                    logger.debug("❌ ÉCART: {} correspondances pour key: {} (condition non respectée)", (Object)partnerMatchCount, (Object)string);
                    HashMap<String, String> boRecordEcart = new HashMap<String, String>(boRecord);
                    boRecordEcart.put("Commentaire", trxboOppartConfig.getCommentEcart());
                    response.getMismatches().add(boRecordEcart);
                    if (list != null) {
                        for (Map<String, String> partnerRecord : list) {
                            HashMap<String, String> partnerRecordEcart = new HashMap<String, String>(partnerRecord);
                            partnerRecordEcart.put("Commentaire", trxboOppartConfig.getCommentEcart());
                            response.getPartnerOnly().add(partnerRecordEcart);
                        }
                    }
                    processedPartnerKeys.add(string);
                    break;
                }
                case "MARK_AS_BO_ONLY_TSOP": {
                    logger.debug("📈 TSOP: {} correspondances pour key: {}", (Object)partnerMatchCount, (Object)string);
                    HashMap<String, String> boRecordTSOP = new HashMap<String, String>(boRecord);
                    boRecordTSOP.put("Commentaire", trxboOppartConfig.getCommentTsop());
                    response.getBoOnly().add(boRecordTSOP);
                    break;
                }
                default: {
                    logger.debug("📈 BO UNIQUEMENT: {} correspondances pour key: {}", (Object)partnerMatchCount, (Object)string);
                    response.getBoOnly().add(boRecord);
                }
            }
            if (++processedCount % 1000 != 0) continue;
            double progress = (double)processedCount / (double)filteredBoRecords.size() * 100.0;
            logger.info("📊 Progression TRXBO/OPPART: {}% ({}/{} enregistrements)", new Object[]{String.format("%.2f", progress), processedCount, filteredBoRecords.size()});
        }
        HashMap<String, Integer> partnerMatchCountMap = new HashMap<String, Integer>();
        for (Map<String, String> map : filteredBoRecords) {
            List<Map<String, String>> matchingPartnerRecords;
            String string = this.buildCompositeKey(map, request.getBoKeyColumn(), request.getAdditionalKeys(), true);
            if (string == null || (matchingPartnerRecords = partnerIndex.get(string)) == null) continue;
            for (Map<String, String> partnerRecord : matchingPartnerRecords) {
                String partnerKeyComposite = this.buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(), request.getAdditionalKeys(), false);
                if (partnerKeyComposite == null) continue;
                partnerMatchCountMap.put(partnerKeyComposite, partnerMatchCountMap.getOrDefault(partnerKeyComposite, 0) + 1);
            }
        }
        HashMap<String, List<Map<String, String>>> partnerOnlyByKey = new HashMap<>();
        for (Map<String, String> map : request.getPartnerFileContent()) {
            String partnerKeyComposite = this.buildCompositeKey(map, request.getPartnerKeyColumn(), request.getAdditionalKeys(), false);
            if (partnerKeyComposite == null || usedPartnerRecords.contains(map)) continue;
            partnerOnlyByKey.computeIfAbsent(partnerKeyComposite, k -> new ArrayList()).add(map);
        }
        for (List<Map<String, String>> list : partnerOnlyByKey.values()) {
            for (Map<String, String> partnerRecord : list) {
                HashMap<String, String> partnerRecordWithComment = new HashMap<String, String>(partnerRecord);
                String type = getPartnerType(partnerRecord);
                boolean isRgfrais = type != null && type.toUpperCase().contains("COMPENSE");
                partnerRecordWithComment.put("Commentaire",
                        isRgfrais ? trxboOppartConfig.getCommentRgfrais() : trxboOppartConfig.getCommentPartnerOnly());
                response.getPartnerOnly().add(partnerRecordWithComment);
            }
        }
        logger.info("🔍 DEBUG - Résumé de la réconciliation:");
        logger.info("  - Enregistrements BO traités: {}", (Object)processedCount);
        logger.info("  - Clés BO null: {}", (Object)boKeysWithNull);
        logger.info("  - Clés BO non trouvées dans l'index Partner: {}", (Object)boKeysNotFound);
        double d = processedCount > 0 ? 100.0 * (double)(processedCount - boKeysNotFound) / (double)processedCount : 0.0;
        logger.info("  - Taux de correspondance: {}%", (Object)String.format("%.2f", d));
        logger.info("  - Matches trouvés: {}", (Object)response.getMatches().size());
        logger.info("  - BO Only: {}", (Object)response.getBoOnly().size());
        logger.info("  - Partner Only: {}", (Object)response.getPartnerOnly().size());
        if (!sampleBoKeys.isEmpty() && !samplePartnerKeys.isEmpty()) {
            logger.info("🔍 DEBUG - Exemples de clés pour comparaison:");
            logger.info("  Exemples clés BO: {}", sampleBoKeys.stream().limit(3L).collect(Collectors.toList()));
            logger.info("  Exemples clés Partner: {}", samplePartnerKeys.stream().limit(3L).collect(Collectors.toList()));
            String firstBoKey = (String)sampleBoKeys.iterator().next();
            String firstPartnerKey = (String)samplePartnerKeys.iterator().next();
            logger.info("  Comparaison première clé BO vs Partner:");
            logger.info("    BO: '{}' (longueur: {})", (Object)firstBoKey, (Object)(firstBoKey != null ? firstBoKey.length() : 0));
            logger.info("    Partner: '{}' (longueur: {})", (Object)firstPartnerKey, (Object)(firstPartnerKey != null ? firstPartnerKey.length() : 0));
            logger.info("    Correspondance exacte? {}", (Object)(firstBoKey != null && firstBoKey.equals(firstPartnerKey) ? 1 : 0));
            if (firstBoKey != null && firstPartnerKey != null) {
                logger.info("    Correspondance après trim? {}", (Object)firstBoKey.trim().equals(firstPartnerKey.trim()));
                logger.info("    Correspondance ignore case? {}", (Object)firstBoKey.equalsIgnoreCase(firstPartnerKey));
            }
        }
        response.setTotalBoRecords(filteredBoRecords.size());
        response.setTotalPartnerRecords(request.getPartnerFileContent().size());
        response.setTotalMatches(response.getMatches().size());
        response.setTotalMismatches(response.getMismatches().size());
        response.setTotalBoOnly(response.getBoOnly().size());
        response.setTotalPartnerOnly(response.getPartnerOnly().size());
        long totalTime = System.currentTimeMillis() - startTime;
        double recordsPerSecond = (double)processedCount / ((double)totalTime / 1000.0);
        response.setExecutionTimeMs(totalTime);
        response.setProcessedRecords(processedCount);
        response.setProgressPercentage(100.0);
        logger.info("🎯 RÉSULTATS FINAUX TRXBO/OPPART:");
        logger.info("📊 Total TRXBO: {}", (Object)response.getTotalBoRecords());
        logger.info("📊 Total OPPART: {}", (Object)response.getTotalPartnerRecords());
        logger.info("✅ Correspondances parfaites (1:2): {}", (Object)response.getTotalMatches());
        logger.info("❌ Écarts (0, 1, ou >2 correspondances): {}", (Object)response.getTotalMismatches());
        logger.info("📈 Uniquement TRXBO: {}", (Object)response.getTotalBoOnly());
        logger.info("📈 Uniquement OPPART: {}", (Object)response.getTotalPartnerOnly());
        logger.info("⚡ Performance: {} enregistrements/seconde", (Object)String.format("%.0f", recordsPerSecond));
        logger.info("⏱️  Temps total d'exécution: {} ms ({} secondes)", (Object)totalTime, (Object)String.format("%.2f", (double)totalTime / 1000.0));
        return response;
    }

    private String buildCompositeKey(Map<String, String> record, String primaryKeyColumn, List<ReconciliationRequest.AdditionalKey> additionalKeys, boolean isBoRecord) {
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

    /**
     * Réconciliation avec ratio paramétrable (1-1, 1-2, 1-3, 1-4, 1-5).
     * Chaque ligne BO est rapprochée d'exactement N lignes partenaire partageant la même clé
     * composite. La comparaison des colonnes de comparisonColumns est appliquée sur chaque ligne
     * du groupe : sans écart la ligne BO est une correspondance, sinon c'est un écart et le groupe
     * partenaire est conservé côté « uniquement partenaire ».
     */
    private ReconciliationResponse reconcileWithParametricType(
            ReconciliationRequest request,
            List<Map<String, String>> boRecords,
            List<Map<String, String>> partnerRecords,
            long startTime) {

        String reconciliationType = request.getReconciliationType() == null ? "1-1" : request.getReconciliationType();
        int expectedPartnerCount = getExpectedPartnerCount(reconciliationType);
        logger.info("🔄 Début de la réconciliation paramétrique: {} ({} partenaire(s) attendu(s) par ligne BO)", reconciliationType, expectedPartnerCount);

        List<Map<String, String>> filteredBoRecords = applyBOFilters(boRecords, request.getBoColumnFilters());
        logger.info("✅ Nombre d'enregistrements BO après filtrage: {}", filteredBoRecords.size());

        ReconciliationResponse response = new ReconciliationResponse();
        response.setMatches(new ArrayList<>());
        response.setBoOnly(new ArrayList<>());
        response.setPartnerOnly(new ArrayList<>());
        response.setMismatches(new ArrayList<>());

        // Index des lignes partenaire par clé composite (ordre d'arrivée conservé)
        Map<String, List<Map<String, String>>> partnerIndex = new HashMap<>();
        for (Map<String, String> partnerRecord : partnerRecords) {
            String partnerKey = buildCompositeKey(partnerRecord, request.getPartnerKeyColumn(), request.getAdditionalKeys(), false);
            if (partnerKey != null) {
                partnerIndex.computeIfAbsent(partnerKey, k -> new ArrayList<>()).add(partnerRecord);
            }
        }
        logger.info("✅ Index partenaire créé avec {} clés uniques ({} lignes)", partnerIndex.size(), partnerRecords.size());
        if (request.getAdditionalKeys() != null && !request.getAdditionalKeys().isEmpty()) {
            logger.info("🔑 Clés supplémentaires utilisées: {} paires", request.getAdditionalKeys().size());
        }

        publishProgress(request, 1.0, "Indexation des enregistrements partenaire...", 0, filteredBoRecords.size(), 0, 0, partnerRecords.size());

        List<ColumnComparison> comparisonColumns = request.getComparisonColumns() != null
                ? request.getComparisonColumns()
                : Collections.emptyList();

        int processedCount = 0;
        for (Map<String, String> boRecord : filteredBoRecords) {
            String boKey = buildCompositeKey(boRecord, request.getBoKeyColumn(), request.getAdditionalKeys(), true);
            if (boKey == null) {
                response.getBoOnly().add(boRecord);
                processedCount++;
                continue;
            }

            List<Map<String, String>> partnersForKey = partnerIndex.get(boKey);
            int availableCount = partnersForKey == null ? 0 : partnersForKey.size();

            if (availableCount == 0) {
                response.getBoOnly().add(boRecord);
            } else if (availableCount == expectedPartnerCount) {
                List<Map<String, String>> group = new ArrayList<>(partnersForKey);
                partnersForKey.clear();

                List<ReconciliationResponse.Difference> differences = collectDifferences(boRecord, group, comparisonColumns);

                ReconciliationResponse.Match match = new ReconciliationResponse.Match();
                match.setKey(boRecord.get(request.getBoKeyColumn()));
                match.setBoData(boRecord);
                match.setReconciliationType(reconciliationType);
                match.setDifferences(differences);
                if (expectedPartnerCount == 1) {
                    match.setPartnerData(group.get(0));
                    match.setPartnerDataList(null);
                } else {
                    match.setPartnerDataList(group);
                    match.setPartnerData(combinePartnerRows(group));
                }

                if (differences.isEmpty()) {
                    response.getMatches().add(match);
                } else {
                    // Groupe consommé mais non concordant : la ligne BO est un écart et les lignes
                    // partenaire sont remises en tête de liste pour apparaître en « uniquement partenaire ».
                    response.getMismatches().add(boRecord);
                    partnersForKey.addAll(0, group);
                }
            } else {
                // Nombre de lignes partenaire inattendu pour ce ratio : écart BO, groupe conservé côté partenaire.
                response.getMismatches().add(boRecord);
            }

            processedCount++;

            if (processedCount % 5000 == 0) {
                double percentage = 1.0 + (98.0 * processedCount / Math.max(1, filteredBoRecords.size()));
                publishProgress(
                        request,
                        percentage,
                        String.format("Traitement %,d / %,d enregistrements BO", processedCount, filteredBoRecords.size()),
                        processedCount,
                        filteredBoRecords.size(),
                        response.getMatches().size(),
                        response.getBoOnly().size(),
                        countPartnerIndexRemaining(partnerIndex));
            }
        }

        // Lignes partenaire non appariées (clé absente du BO ou groupe non conforme au ratio)
        for (List<Map<String, String>> remaining : partnerIndex.values()) {
            if (!remaining.isEmpty()) {
                response.getPartnerOnly().addAll(remaining);
                remaining.clear();
            }
        }

        response.setTotalBoRecords(filteredBoRecords.size());
        response.setTotalPartnerRecords(partnerRecords.size());
        response.setTotalMatches(response.getMatches().size());
        response.setTotalMismatches(response.getMismatches().size());
        response.setTotalBoOnly(response.getBoOnly().size());
        response.setTotalPartnerOnly(response.getPartnerOnly().size());

        long totalTime = System.currentTimeMillis() - startTime;
        double recordsPerSecond = totalTime > 0 ? (double) processedCount / (totalTime / 1000.0) : 0.0;

        response.setExecutionTimeMs(totalTime);
        response.setProcessedRecords(processedCount);
        response.setProgressPercentage(100.0);

        publishProgress(request, 100.0, "Réconciliation terminée", processedCount, filteredBoRecords.size(), response.getTotalMatches(), response.getTotalBoOnly(), 0);

        logger.info("🎯 RÉSULTATS FINAUX RÉCONCILIATION {}:", reconciliationType);
        logger.info("📊 Total BO: {}", response.getTotalBoRecords());
        logger.info("📊 Total Partenaire: {}", response.getTotalPartnerRecords());
        logger.info("✅ Correspondances ({}): {}", reconciliationType, response.getTotalMatches());
        logger.info("❌ Écarts: {}", response.getTotalMismatches());
        logger.info("📈 Uniquement BO: {}", response.getTotalBoOnly());
        logger.info("📈 Uniquement Partenaire: {}", response.getTotalPartnerOnly());
        logger.info("⚡ Performance: {} enregistrements/seconde", String.format("%.0f", recordsPerSecond));
        logger.info("⏱️  Temps total d'exécution: {} ms", totalTime);

        return response;
    }

    /**
     * Compare chaque ligne partenaire du groupe avec la ligne BO sur les colonnes de comparaison.
     */
    private List<ReconciliationResponse.Difference> collectDifferences(
            Map<String, String> boRecord,
            List<Map<String, String>> partnerGroup,
            List<ColumnComparison> comparisonColumns) {

        List<ReconciliationResponse.Difference> differences = new ArrayList<>();
        for (Map<String, String> partnerRecord : partnerGroup) {
            for (ColumnComparison comparison : comparisonColumns) {
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
                }
            }
        }
        return differences;
    }

    /**
     * Fusionne les lignes d'un groupe partenaire en une seule ligne (colonnes suffixées _PARTNER_n)
     * pour les ratios multiples, partnerDataList restant disponible pour l'affichage détaillé.
     */
    private Map<String, String> combinePartnerRows(List<Map<String, String>> partnerGroup) {
        Map<String, String> combined = new HashMap<>();
        for (int i = 0; i < partnerGroup.size(); i++) {
            String suffix = "_PARTNER_" + (i + 1);
            for (Map.Entry<String, String> entry : partnerGroup.get(i).entrySet()) {
                combined.put(entry.getKey() + suffix, entry.getValue());
            }
        }
        return combined;
    }

    /** Un type paramétrable est retenu uniquement s'il fait partie des ratios supportés par le mode manuel. */
    private boolean isSupportedParametricType(String reconciliationType) {
        return "1-2".equals(reconciliationType)
                || "1-3".equals(reconciliationType)
                || "1-4".equals(reconciliationType)
                || "1-5".equals(reconciliationType);
    }

    private int getExpectedPartnerCount(String reconciliationType) {
        switch (reconciliationType) {
            case "1-1": {
                return 1;
            }
            case "1-2": {
                return 2;
            }
            case "1-3": {
                return 3;
            }
            case "1-4": {
                return 4;
            }
            case "1-5": {
                return 5;
            }
        }
        return 1;
    }

    private void releaseRequestFileContent(ReconciliationRequest request) {
        if (request == null) {
            return;
        }
        request.setBoFileContent(null);
        request.setPartnerFileContent(null);
    }

    private void releaseReconciliationWorkingSets(List<Map<String, String>> processedPartnerData) {
        if (processedPartnerData != null) {
            processedPartnerData.clear();
        }
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    private ReconciliationBatchResult processBatchOptimized(List<Map<String, String>> batch, Map<String, List<Map<String, String>>> partnerIndex, ReconciliationRequest request, String normalizedBoKeyColumn) {
        ArrayList<ReconciliationResponse.Match> matches = new ArrayList<ReconciliationResponse.Match>();
        ArrayList<Map<String, String>> boOnly = new ArrayList<Map<String, String>>();
        ArrayList<Map<String, String>> mismatches = new ArrayList<Map<String, String>>();
        int processedCount = 0;
        for (Map<String, String> boRecord : batch) {
            String boKey = this.buildCompositeKey(boRecord, normalizedBoKeyColumn, request.getAdditionalKeys(), true);
            if (boKey == null) {
                boOnly.add(boRecord);
                ++processedCount;
                continue;
            }
            Map<String, String> partnerRecord = null;
            List<Map<String, String>> partnersForKey = partnerIndex.get(boKey);
            if (partnersForKey != null) {
                List<Map<String, String>> list = partnersForKey;
                synchronized (list) {
                    if (!partnersForKey.isEmpty()) {
                        partnerRecord = partnersForKey.remove(0);
                    }
                }
            }
            if (partnerRecord == null) {
                boOnly.add(boRecord);
                ++processedCount;
                continue;
            }
            ArrayList<ReconciliationResponse.Difference> differences = new ArrayList<ReconciliationResponse.Difference>();
            boolean isMatch = true;
            for (ColumnComparison comparison : request.getComparisonColumns()) {
                String partnerValue;
                String boValue = boRecord.get(comparison.getBoColumn());
                if (Objects.equals(boValue, partnerValue = partnerRecord.get(comparison.getPartnerColumn()))) continue;
                ReconciliationResponse.Difference difference = new ReconciliationResponse.Difference();
                difference.setBoColumn(comparison.getBoColumn());
                difference.setPartnerColumn(comparison.getPartnerColumn());
                difference.setBoValue(boValue);
                difference.setPartnerValue(partnerValue);
                difference.setDifferent(true);
                differences.add(difference);
                isMatch = false;
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
                List<Map<String, String>> list = partnersForKey;
                synchronized (list) {
                    partnersForKey.add(0, partnerRecord);
                }
            }
            ++processedCount;
        }
        return new ReconciliationBatchResult(matches, boOnly, mismatches, processedCount);
    }

    @Deprecated
    private Map<String, Map<String, String>> createRecordMap(List<Map<String, String>> records, String keyColumn) {
        HashMap<String, Map<String, String>> map = new HashMap<String, Map<String, String>>();
        for (Map<String, String> record : records) {
            map.put(record.get(keyColumn), record);
        }
        return map;
    }

    public void setProgress(String jobId, int percent) {
        this.progressMap.put(jobId, percent);
    }

    public int getProgress(String jobId) {
        return this.progressMap.getOrDefault(jobId, 0);
    }

    public void removeProgress(String jobId) {
        this.progressMap.remove(jobId);
    }

    private void publishProgress(ReconciliationRequest request, double percentage, String step, int processedRecords, int totalRecords, int matchesCount, int boOnlyCount, int partnerRemaining) {
        String sessionId = request.getProgressSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        this.progressService.updateProgress(sessionId, ReconciliationProgress.detailed(Math.min(100.0, Math.max(0.0, percentage)), step, processedRecords, totalRecords, matchesCount, boOnlyCount, partnerRemaining));
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    private int countPartnerIndexRemaining(Map<String, List<Map<String, String>>> partnerIndex) {
        int total = 0;
        Iterator<List<Map<String, String>>> iterator = partnerIndex.values().iterator();
        while (iterator.hasNext()) {
            List<Map<String, String>> partnersForKey;
            List<Map<String, String>> list = partnersForKey = iterator.next();
            synchronized (list) {
                total += partnersForKey.size();
            }
        }
        return total;
    }

    private List<Map<String, String>> applyBOFilters(List<Map<String, String>> boRecords, List<ReconciliationRequest.BOColumnFilter> filters) {
        if (filters == null || filters.isEmpty()) {
            logger.info("Aucun filtre BO à appliquer");
            return boRecords;
        }
        logger.info("Application de {} filtres BO", (Object)filters.size());
        for (ReconciliationRequest.BOColumnFilter filter : filters) {
            logger.info("Filtre: colonne='{}', valeurs sélectionnées={}", (Object)filter.getColumnName(), filter.getSelectedValues());
        }
        ArrayList<Map<String, String>> filteredRecords = new ArrayList<Map<String, String>>();
        int excludedCount = 0;
        for (Map<String, String> record : boRecords) {
            boolean shouldInclude = true;
            for (ReconciliationRequest.BOColumnFilter filter : filters) {
                String columnValue = record.get(filter.getColumnName());
                if (columnValue != null && filter.getSelectedValues().contains(columnValue)) continue;
                shouldInclude = false;
                logger.debug("Enregistrement exclu par le filtre {}: valeur '{}' non trouvée dans {}", new Object[]{filter.getColumnName(), columnValue, filter.getSelectedValues()});
                ++excludedCount;
                break;
            }
            if (!shouldInclude) continue;
            filteredRecords.add(record);
        }
        logger.info("Filtrage terminé: {} enregistrements conservés sur {} ({} exclus)", new Object[]{filteredRecords.size(), boRecords.size(), excludedCount});
        if (!filteredRecords.isEmpty()) {
            logger.info("Exemple d'enregistrement conservé: {}", filteredRecords.get(0));
        }
        return filteredRecords;
    }

    public void destroy() throws Exception {
        logger.info("🧹 Nettoyage de l'ExecutorService...");
        if (this.executorService != null && !this.executorService.isShutdown()) {
            this.executorService.shutdown();
            if (!this.executorService.awaitTermination(30L, TimeUnit.SECONDS)) {
                logger.warn("⚠️  Forçage de l'arrêt de l'ExecutorService après timeout");
                this.executorService.shutdownNow();
            }
            logger.info("✅ ExecutorService fermé proprement");
        }
    }

    public Map<String, String> normalizeRecord(Map<String, String> record) {
        if (record == null) {
            return new HashMap<String, String>();
        }
        HashMap<String, String> normalizedRecord = new HashMap<String, String>();
        for (Map.Entry<String, String> entry : record.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            String normalizedKey = key != null ? key.trim() : "";
            String normalizedValue = value != null ? value.trim() : "";
            normalizedRecord.put(normalizedKey, normalizedValue);
        }
        return normalizedRecord;
    }

    private String findKeyWithNormalization(Map<String, String> record, String normalizedKeyColumn) {
        if (record == null || normalizedKeyColumn == null) {
            return null;
        }
        String value = record.get(normalizedKeyColumn);
        if (value != null) {
            logger.debug("🔍 Clé exacte trouvée: '{}' -> '{}'", (Object)normalizedKeyColumn, (Object)value);
            return value;
        }
        for (Map.Entry<String, String> entry : record.entrySet()) {
            String normalizedEntryKey = entry.getKey();
            if (!normalizedKeyColumn.equals(normalizedEntryKey)) continue;
            logger.debug("🔍 Clé normalisée trouvée: '{}' (original: '{}') -> '{}'", new Object[]{normalizedEntryKey, entry.getKey(), entry.getValue()});
            return entry.getValue();
        }
        logger.debug("❌ Aucune correspondance trouvée pour '{}'. Clés disponibles: {}", (Object)normalizedKeyColumn, record.keySet());
        return null;
    }

    private String getPartnerType(Map<String, String> partnerRecord) {
        if (partnerRecord == null) {
            return null;
        }
        String type = partnerRecord.get("Type");
        if (type == null || type.trim().isEmpty()) {
            type = partnerRecord.get("Type Opération");
        }
        return type != null ? type.trim() : null;
    }

    /**
     * Nombre d'opérations partenaire attendu par la logique SPECIAL_RATIO.
     * Le ratio explicite de la requête (sélection manuelle) ou celui configuré sur le modèle
     * partenaire est prioritaire ; sinon on retombe sur le ratio historique TRXBO/OPPART 1:2.
     */
    private int resolveSpecialRatioExpectedCount(ReconciliationRequest request) {
        String requestedType = request.getReconciliationType() == null ? "1-1" : request.getReconciliationType();
        int requestedCount = this.getExpectedPartnerCount(requestedType);
        if (this.isSupportedParametricType(requestedType)) {
            return requestedCount;
        }
        String configuredType = this.configurableReconciliationService.getConfiguredReconciliationType(request);
        if (this.isSupportedParametricType(configuredType)) {
            return this.getExpectedPartnerCount(configuredType);
        }
        return DEFAULT_SPECIAL_RATIO_COUNT;
    }

    /**
     * Classification métier TRXBO/OPPART, calculée sur le ratio effectif.
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
    private String determineTRXBOAction(List<Map<String, String>> partnerGroup, int partnerMatchCount, int expectedCount, TrxboOppartConfig config) {
        if (partnerMatchCount == expectedCount) {
            return "MARK_AS_MATCH";
        }
        if (partnerMatchCount == 0) {
            return "MARK_AS_BO_ONLY_TSOP";
        }

        boolean hasImpact = this.containsPartnerType(partnerGroup, config.getImpactType());
        boolean hasFrais = this.containsPartnerType(partnerGroup, config.getFeesType());
        boolean hasCommission = this.containsPartnerType(partnerGroup, config.getCommissionType());

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
            TrxboOppartConfig.AdditionalOperationType additionalOperationType = this.findAdditionalOperationType(partnerGroup, config);
            if (additionalOperationType != null) {
                return "MARK_AS_ADDITIONAL_OPERATION_TYPE";
            }
        }

        // Règlement de commission : le trio IMPACT_COMPTE_GENERAL + FRAIS_TRANSACTION + VERSEMENT_COMMISSION
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
            String type = this.getPartnerType(partnerRecord);
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

    private String determineActionFromRules(List<ConfigurableReconciliationService.CorrespondenceRule> rules, int partnerMatchCount) {
        for (ConfigurableReconciliationService.CorrespondenceRule rule : rules) {
            boolean conditionMet = this.evaluateCondition(rule.getCondition(), partnerMatchCount);
            if (!conditionMet) continue;
            return rule.getAction();
        }
        logger.warn("⚠️ Aucune règle ne correspond pour {} correspondances, action par défaut: MARK_AS_BO_ONLY", (Object)partnerMatchCount);
        return "MARK_AS_BO_ONLY";
    }

    private List<ConfigurableReconciliationService.CorrespondenceRule> createDefaultTRXBOOPPARTRules(int expectedCount) {
        ArrayList<ConfigurableReconciliationService.CorrespondenceRule> rules = new ArrayList<ConfigurableReconciliationService.CorrespondenceRule>();
        ConfigurableReconciliationService.CorrespondenceRule perfectMatch = new ConfigurableReconciliationService.CorrespondenceRule();
        perfectMatch.setName("Correspondance Parfaite TRXBO/OPPART (1:" + expectedCount + ")");
        perfectMatch.setCondition("partnerMatches == " + expectedCount);
        perfectMatch.setAction("MARK_AS_MATCH");
        perfectMatch.setDescription("Une transaction TRXBO correspond à exactement " + expectedCount + " opérations OPPART");
        rules.add(perfectMatch);
        ConfigurableReconciliationService.CorrespondenceRule noMatch = new ConfigurableReconciliationService.CorrespondenceRule();
        noMatch.setName("TRXBO sans correspondance (TSOP)");
        noMatch.setCondition("partnerMatches == 0");
        noMatch.setAction("MARK_AS_BO_ONLY_TSOP");
        noMatch.setDescription("Transaction TRXBO sans correspondance OPPART");
        rules.add(noMatch);
        ConfigurableReconciliationService.CorrespondenceRule singleMatch = new ConfigurableReconciliationService.CorrespondenceRule();
        singleMatch.setName("TRXBO avec une seule correspondance (TRXSF)");
        singleMatch.setCondition("partnerMatches == 1");
        singleMatch.setAction("MARK_AS_MISMATCH_TRXSF");
        singleMatch.setDescription("Transaction TRXBO avec une seule correspondance OPPART (attendu: " + expectedCount + ")");
        rules.add(singleMatch);
        ConfigurableReconciliationService.CorrespondenceRule insufficientMatch = new ConfigurableReconciliationService.CorrespondenceRule();
        insufficientMatch.setName("TRXBO avec un nombre insuffisant de correspondances (TRXSVC)");
        insufficientMatch.setCondition("partnerMatches < " + expectedCount);
        insufficientMatch.setAction("MARK_AS_MISMATCH");
        insufficientMatch.setDescription("Moins de " + expectedCount + " correspondances OPPART pour une ligne TRXBO");
        rules.add(insufficientMatch);
        ConfigurableReconciliationService.CorrespondenceRule multipleMatch = new ConfigurableReconciliationService.CorrespondenceRule();
        multipleMatch.setName("TRXBO avec plusieurs correspondances (Écart)");
        multipleMatch.setCondition("partnerMatches >= " + (expectedCount + 1));
        multipleMatch.setAction("MARK_AS_MISMATCH");
        multipleMatch.setDescription("Transaction TRXBO avec " + (expectedCount + 1) + " ou plus correspondances OPPART (attendu: " + expectedCount + ")");
        rules.add(multipleMatch);
        return rules;
    }

    private boolean evaluateCondition(String condition, int partnerMatchCount) {
        String[] parts;
        if (condition == null || condition.trim().isEmpty()) {
            logger.warn("⚠️ Condition est null ou vide");
            return false;
        }
        String evaluatedCondition = condition.replace("partnerMatches", String.valueOf(partnerMatchCount));
        if ((evaluatedCondition = evaluatedCondition.trim()).contains("==")) {
            String[] parts2 = evaluatedCondition.split("==", 2);
            if (parts2.length == 2) {
                try {
                    String leftStr = parts2[0].trim();
                    String rightStr = parts2[1].trim();
                    int leftValue = Integer.parseInt(leftStr);
                    int rightValue = Integer.parseInt(rightStr);
                    return leftValue == rightValue;
                }
                catch (NumberFormatException e) {
                    logger.error("❌ Impossible de parser les nombres dans la condition: {} (gauche: '{}', droite: '{}')", new Object[]{condition, parts2[0].trim(), parts2.length > 1 ? parts2[1].trim() : "N/A"});
                }
            } else {
                logger.error("❌ Split '==' a produit {} parties au lieu de 2 pour la condition: {}", (Object)parts2.length, (Object)condition);
            }
        } else if (evaluatedCondition.contains("!=")) {
            String[] parts3 = evaluatedCondition.split("!=", 2);
            if (parts3.length == 2) {
                try {
                    String rightStr = parts3[1].trim();
                    int expectedCount = Integer.parseInt(rightStr);
                    return partnerMatchCount != expectedCount;
                }
                catch (NumberFormatException e) {
                    logger.error("❌ Impossible de parser le nombre dans la condition: {}", (Object)condition);
                }
            } else {
                logger.error("❌ Split '!=' a produit {} parties au lieu de 2 pour la condition: {}", (Object)parts3.length, (Object)condition);
            }
        } else if (evaluatedCondition.contains(">=")) {
            String[] parts4 = evaluatedCondition.split(">=");
            if (parts4.length == 2) {
                try {
                    int expectedCount = Integer.parseInt(parts4[1].trim());
                    return partnerMatchCount >= expectedCount;
                }
                catch (NumberFormatException e) {
                    logger.warn("⚠️ Impossible de parser le nombre dans la condition: {}", (Object)condition);
                }
            }
        } else if (evaluatedCondition.contains("<=")) {
            String[] parts5 = evaluatedCondition.split("<=");
            if (parts5.length == 2) {
                try {
                    int expectedCount = Integer.parseInt(parts5[1].trim());
                    return partnerMatchCount <= expectedCount;
                }
                catch (NumberFormatException e) {
                    logger.warn("⚠️ Impossible de parser le nombre dans la condition: {}", (Object)condition);
                }
            }
        } else if (evaluatedCondition.contains(">")) {
            String[] parts6 = evaluatedCondition.split(">");
            if (parts6.length == 2) {
                try {
                    int expectedCount = Integer.parseInt(parts6[1].trim());
                    return partnerMatchCount > expectedCount;
                }
                catch (NumberFormatException e) {
                    logger.warn("⚠️ Impossible de parser le nombre dans la condition: {}", (Object)condition);
                }
            }
        } else if (evaluatedCondition.contains("<") && (parts = evaluatedCondition.split("<")).length == 2) {
            try {
                int expectedCount = Integer.parseInt(parts[1].trim());
                return partnerMatchCount < expectedCount;
            }
            catch (NumberFormatException e) {
                logger.warn("⚠️ Impossible de parser le nombre dans la condition: {}", (Object)condition);
            }
        }
        logger.warn("⚠️ Condition non reconnue: {}", (Object)condition);
        return false;
    }

    private List<Map<String, String>> applyColumnProcessingRules(List<Map<String, String>> data, String fileType, String modelId) {
        logger.debug("Application des règles de traitement pour le type: {}, modelId: {}", (Object)fileType, (Object)modelId);
        if (modelId != null && !modelId.isEmpty()) {
            try {
                logger.info("🔧 Application des règles du modèle {} pour le type {}", (Object)modelId, (Object)fileType);
                ArrayList<Map<String, Object>> dataAsObject = new ArrayList<Map<String, Object>>();
                for (Map<String, String> row : data) {
                    dataAsObject.add(new HashMap<String, Object>(row));
                }
                List<Map<String, Object>> processedDataAsObject = this.columnProcessingService.processDataList(modelId, dataAsObject);
                ArrayList<Map<String, String>> processedData = new ArrayList<Map<String, String>>();
                for (Map<String, Object> map : processedDataAsObject) {
                    HashMap<String, String> rowAsString = new HashMap<String, String>();
                    for (Map.Entry<String, Object> entry : map.entrySet()) {
                        rowAsString.put(entry.getKey(), entry.getValue() != null ? entry.getValue().toString() : null);
                    }
                    processedData.add(rowAsString);
                }
                logger.info("✅ Règles du modèle {} appliquées à {} lignes", (Object)modelId, (Object)processedData.size());
                if (!processedData.isEmpty() && !data.isEmpty()) {
                    Map<String, String> firstOriginal = data.get(0);
                    Map map = (Map)processedData.get(0);
                    for (String key : firstOriginal.keySet()) {
                        String originalValue = firstOriginal.get(key);
                        String processedValue = (String)map.get(key);
                        if (originalValue == null || processedValue == null || originalValue.equals(processedValue)) continue;
                        logger.debug("Transformation {}: '{}' → '{}'", new Object[]{key, originalValue, processedValue});
                    }
                }
                return processedData;
            }
            catch (Exception e) {
                logger.error("❌ Erreur lors de l'application des règles du modèle {}: {}", new Object[]{modelId, e.getMessage(), e});
                logger.warn("⚠️ Utilisation des règles hardcodées en fallback");
            }
        }
        logger.debug("Utilisation des règles hardcodées (fallback)");
        if (data.isEmpty()) {
            return data;
        }
        Map<String, String> firstRow = data.get(0);
        if (!firstRow.containsKey("IDTransaction") && !firstRow.containsKey("Numéro Trans GU")) {
            return data;
        }
        ArrayList<Map<String, String>> processedData = new ArrayList<Map<String, String>>();
        boolean anyTransformed = false;
        for (Map<String, String> map : data) {
            boolean transformNumeroTransGU;
            String idTransaction = map.get("IDTransaction");
            String numeroTransGU = map.get("Numéro Trans GU");
            boolean transformIdTransaction = idTransaction != null && idTransaction.endsWith("_CM");
            boolean bl = transformNumeroTransGU = numeroTransGU != null && numeroTransGU.endsWith("_CM");
            if (!transformIdTransaction && !transformNumeroTransGU) {
                processedData.add(map);
                continue;
            }
            anyTransformed = true;
            HashMap<String, String> processedRow = new HashMap<String, String>(map);
            if (transformIdTransaction) {
                processedRow.put("IDTransaction", idTransaction.substring(0, idTransaction.length() - 3));
                logger.debug("Transformation IDTransaction: {} → {}", (Object)idTransaction, (Object)idTransaction.substring(0, idTransaction.length() - 3));
            }
            if (transformNumeroTransGU) {
                processedRow.put("Numéro Trans GU", numeroTransGU.substring(0, numeroTransGU.length() - 3));
                logger.debug("Transformation Numéro Trans GU: {} → {}", (Object)numeroTransGU, (Object)numeroTransGU.substring(0, numeroTransGU.length() - 3));
            }
            processedData.add(processedRow);
        }
        if (!anyTransformed) {
            return data;
        }
        logger.debug("Règles appliquées à {} lignes sur {}", (Object)processedData.size(), (Object)data.size());
        return processedData;
    }
}

