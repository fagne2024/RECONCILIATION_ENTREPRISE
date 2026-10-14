package com.reconciliation.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

/**
 * Response optimisée pour la réconciliation
 * Retourne uniquement un résumé pour éviter de surcharger le frontend
 */
@Data
public class ReconciliationSummaryResponse {
    // Statistiques globales
    private int totalBoRecords;
    private int totalPartnerRecords;
    private int totalMatches;
    private int totalMismatches;
    private int totalBoOnly;
    private int totalPartnerOnly;

    // Performance
    private long executionTimeMs;
    private int processedRecords;
    private double recordsPerSecond;

    // Preview des résultats (limité à 100 pour chaque catégorie)
    private List<MatchSummary> matchesPreview;
    private List<Map<String, String>> mismatchesPreview;
    private List<Map<String, String>> boOnlyPreview;
    private List<Map<String, String>> partnerOnlyPreview;

    // Indique si les données sont tronquées
    private boolean matchesTruncated;
    private boolean mismatchesTruncated;
    private boolean boOnlyTruncated;
    private boolean partnerOnlyTruncated;

    // ID de session pour récupérer les détails complets
    private String sessionId;

    @Data
    public static class MatchSummary {
        private String key;
        private boolean hasDifferences;
        private int differenceCount;
        private String reconciliationType;
        // N'inclut PAS les données complètes pour réduire la taille
    }
}
