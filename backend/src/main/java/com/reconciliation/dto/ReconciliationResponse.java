package com.reconciliation.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class ReconciliationResponse {
    private List<Match> matches;
    private List<Map<String, String>> boOnly;
    private List<Map<String, String>> partnerOnly;
    private List<Map<String, String>> mismatches;
    
    // Ajout des propriétés de totaux
    private int totalBoRecords;
    private int totalPartnerRecords;
    private int totalMatches;
    private int totalMismatches;
    private int totalBoOnly;
    private int totalPartnerOnly;
    
    // Ajout des propriétés de performance
    private long executionTimeMs;
    private int processedRecords;
    private double progressPercentage;

    /** Session pour charger les details via /results/matches (reponses volumineuses tronquees). */
    private String progressSessionId;
    private boolean resultsPaginated;

    /**
     * Règles de régularisation configurées sur le modèle partenaire (cas → composants source/signe).
     * Permet au front (certification de solde) de composer le montant à régulariser.
     */
    private List<Map<String, Object>> regularisationRules;

    /**
     * Commentaires configurés sur le modèle partenaire (clés: tsop, trxsf, rgfrais, …).
     * Permet au front (certification de solde) d'identifier le type de chaque écart.
     */
    private Map<String, String> configComments;

    /**
     * Configuration trxboOppart complète du modèle partenaire (operationTypes, comments,
     * additionalOperationTypes, regularisationRules, aggregationTypes). Permet au front
     * (certification de solde) de piloter toute la logique des agrégats des écarts.
     */
    private Map<String, Object> trxboOppartConfig;

    @Data
    public static class Match {
        private String key;
        private Map<String, String> boData;
        private Map<String, String> partnerData; // Pour compatibilité avec l'existant
        private List<Map<String, String>> partnerDataList; // Pour les correspondances multiples
        private List<Difference> differences;
        private String reconciliationType; // Type de réconciliation utilisé
    }

    @Data
    public static class Difference {
        private String boColumn;
        private String partnerColumn;
        private String boValue;
        private String partnerValue;
        private boolean different;
    }
} 