export interface ReconciliationRequest {
    boFileContent: Record<string, string>[];
    partnerFileContent: Record<string, string>[];
    boKeyColumn: string;
    partnerKeyColumn: string;
    // Support pour plusieurs clés de réconciliation
    additionalKeys?: {
        boColumn: string;
        partnerColumn: string;
    }[];
    comparisonColumns: {
        boColumn: string;
        partnerColumn: string;
    }[];
    selectedService?: string;
    
    // ID du modèle de traitement à utiliser pour les règles de nettoyage
    modelId?: string;
    
    // Filtres BO pour la réconciliation
    boColumnFilters?: BOColumnFilter[];
    
    // Type de réconciliation (1-1, 1-2, 1-3, 1-4, 1-5)
    reconciliationType?: string;

    /** Identifiant de session pour le suivi de progression en temps réel. */
    progressSessionId?: string;
}

export interface BOColumnFilter {
    modelId: string;
    modelName: string;
    columnName: string;
    selectedValues: string[];
    appliedAt: string;
} 