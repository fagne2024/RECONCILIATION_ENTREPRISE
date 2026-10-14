export interface FraisTransaction {
    id?: number;
    service: string;
    agence: string;
    montantFrais: number;
    typeCalcul?: string; // NOMINAL ou POURCENTAGE
    pourcentage?: number;
    description?: string;
    actif: boolean;
    dateCreation?: string;
    dateModification?: string;
    montantCalcule?: number; // Montant calculé avec le nombre de transactions
    nombreTransactions?: number; // Nombre de transactions pour le calcul
    dateCalcul?: string; // Date des données utilisées pour le calcul
}

export interface FraisTransactionRequest {
    service: string;
    agence: string;
    montantFrais: number;
    typeCalcul?: string; // NOMINAL ou POURCENTAGE
    pourcentage?: number;
    description?: string;
    actif?: boolean;
} 