package com.reconciliation.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class ReconciliationRequest {
    private List<Map<String, String>> boFileContent;
    private List<Map<String, String>> partnerFileContent;
    private String boKeyColumn;
    private String partnerKeyColumn;
    private List<ColumnComparison> comparisonColumns;
    
    // Clés supplémentaires pour une réconciliation plus précise (optionnel)
    private List<AdditionalKey> additionalKeys;
    
    // ID du modèle de traitement à utiliser pour les règles de nettoyage
    private String modelId;
    
    // Filtres BO pour la réconciliation
    private List<BOColumnFilter> boColumnFilters;
    
    // Type de réconciliation (1-1, 1-2, 1-3, 1-4, 1-5)
    private String reconciliationType = "1-1";

    /** Identifiant de session pour le suivi de progression en temps réel (polling frontend). */
    private String progressSessionId;
    
    @Data
    public static class AdditionalKey {
        private String boColumn;
        private String partnerColumn;
    }
    
    @Data
    public static class BOColumnFilter {
        private String modelId;
        private String modelName;
        private String columnName;
        private List<String> selectedValues;
        private String appliedAt;
    }
} 