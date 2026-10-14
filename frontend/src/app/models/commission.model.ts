export interface CommissionTransaction {
    id?: number;
    service: string;
    agence: string;
    montantCommission: number;
    typeCalcul?: string; // NOMINAL ou POURCENTAGE
    pourcentage?: number;
    description?: string;
    actif: boolean;
    dateCreation?: string;
    dateModification?: string;
}

export interface CommissionRequest {
    service: string;
    agence: string;
    montantCommission: number;
    typeCalcul?: string; // NOMINAL ou POURCENTAGE
    pourcentage?: number;
    description?: string;
    actif?: boolean;
}
