package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class PartnerIndexBuilder {

    private static final Logger logger = LoggerFactory.getLogger(PartnerIndexBuilder.class);
    private static final int PARALLEL_THREADS = Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors()));

    public Map<String, List<Map<String, String>>> buildIndex(
            List<Map<String, String>> partnerData,
            String partnerKeyColumn,
            List<ReconciliationRequest.AdditionalKey> additionalKeys) {

        logger.info("🔍 Création de l'index optimisé des enregistrements partenaire...");
        if (additionalKeys != null && !additionalKeys.isEmpty()) {
            logger.info("🔑 Clés supplémentaires utilisées: {} paires", additionalKeys.size());
        }

        Map<String, List<Map<String, String>>> partnerIndex = new HashMap<>();
        ExecutorService executorService = Executors.newFixedThreadPool(PARALLEL_THREADS, r -> {
            Thread t = new Thread(r);
            t.setDaemon(true);
            return t;
        });

        try {
            int partnerChunkSize = partnerData.size() / PARALLEL_THREADS;
            List<CompletableFuture<Void>> futures = new ArrayList<>();

            for (int i = 0; i < PARALLEL_THREADS; i++) {
                final int startIndex = i * partnerChunkSize;
                final int endIndex = (i == PARALLEL_THREADS - 1) ? partnerData.size() : (i + 1) * partnerChunkSize;

                CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                    for (int j = startIndex; j < endIndex; j++) {
                        Map<String, String> partnerRecord = partnerData.get(j);
                        String partnerKey = buildCompositeKey(partnerRecord, partnerKeyColumn, additionalKeys, false);
                        if (partnerKey != null) {
                            synchronized (partnerIndex) {
                                partnerIndex.computeIfAbsent(partnerKey, k -> new ArrayList<>()).add(partnerRecord);
                            }
                        }
                    }
                }, executorService);

                futures.add(future);
            }

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            if (additionalKeys != null && !additionalKeys.isEmpty()) {
                logger.info("✅ Index partenaire créé avec {} clés (incluant clés supplémentaires)", partnerIndex.size());
            } else {
                logger.info("✅ Index partenaire créé avec {} clés", partnerIndex.size());
            }

            return partnerIndex;

        } finally {
            executorService.shutdown();
            try {
                if (!executorService.awaitTermination(30, TimeUnit.SECONDS)) {
                    executorService.shutdownNow();
                }
            } catch (InterruptedException e) {
                executorService.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
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