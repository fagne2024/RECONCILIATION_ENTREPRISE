export interface ReconciliationResponse {
    matches: Match[];
    boOnly: Record<string, string>[];
    partnerOnly: Record<string, string>[];
    mismatches: Record<string, string>[];
    totalBoRecords: number;
    totalPartnerRecords: number;
    totalMatches: number;
    totalMismatches: number;
    totalBoOnly: number;
    totalPartnerOnly: number;
    executionTimeMs?: number;
    processedRecords?: number;
    progressPercentage?: number;
    progressSessionId?: string;
    resultsPaginated?: boolean;
    /**
     * Règles de régularisation configurées sur le modèle partenaire (cas → composants
     * source/signe). Permet de composer le montant à régulariser en certification de solde.
     */
    regularisationRules?: RegularisationRuleConfig[];
    /**
     * Commentaires configurés sur le modèle partenaire (clés: tsop, trxsf, rgfrais, …).
     * Permet d'identifier le type de chaque écart (ex. « TRX SANS FRAIS »).
     */
    configComments?: Record<string, string>;
    /**
     * Configuration trxboOppart complète du modèle partenaire (operationTypes, comments,
     * additionalOperationTypes, regularisationRules, aggregationTypes). Pilote toute la
     * logique des agrégats des écarts.
     */
    trxboOppartConfig?: TrxboOppartConfigResponse;
}

export interface TrxboOppartAggregationTypeConfig {
    kind?: string;
    commentBo?: string;
    commentPartner?: string;
    boLabel?: string;
    partnerLabel?: string;
    boMode?: string;
    partnerMode?: string;
}

export interface TrxboOppartAdditionalTypeConfig {
    label?: string;
    commentBo?: string;
    commentPartner?: string;
}

export interface TrxboOppartConfigResponse {
    operationTypes?: Record<string, string>;
    comments?: Record<string, string>;
    additionalOperationTypes?: TrxboOppartAdditionalTypeConfig[];
    regularisationRules?: RegularisationRuleConfig[];
    aggregationTypes?: TrxboOppartAggregationTypeConfig[];
}

export interface RegularisationRuleConfig {
    case?: string;
    components?: RegularisationComponentConfig[];
}

export interface RegularisationComponentConfig {
    source?: string;
    type?: string;
    sign?: string;
    negativeTokens?: string[];
    defaultSign?: string;
    coefficient?: number;
}

export interface Match {
    key: string;
    boData: Record<string, string>;
    partnerData: Record<string, string>; // Pour compatibilité avec l'existant
    partnerDataList?: Record<string, string>[]; // Pour les correspondances multiples
    differences: Difference[];
    reconciliationType?: string; // Type de réconciliation utilisé
}

export interface Difference {
    boColumn: string;
    partnerColumn: string;
    boValue: string;
    partnerValue: string;
    different: boolean;
} 