export interface EcartSolde {
    id?: number;
    idTransaction: string;
    telephoneClient?: string;
    montant: number;
    service?: string;
    agence?: string;
    dateTransaction: string;
    numeroTransGu?: string;
    pays?: string;
    dateImport?: string;
    statut?: string;
    commentaire?: string;
    fraisAssocie?: FraisAssocie; // Frais associé à cet écart de solde
}

export interface FraisAssocie {
    id?: number;
    montant: number;
    typeCalcul: string; // 'POURCENTAGE' ou 'NOMINAL'
    pourcentage?: number;
    description?: string;
    bordereau?: string;
    dateOperation?: string;
}

export interface EcartSoldeUploadResponse {
    message: string;
    count: number;
    data: EcartSolde[];
}

export interface EcartSoldeFilter {
    agence?: string;
    service?: string;
    pays?: string;
    numeroTransGu?: string;
    statut?: string;
    dateDebut?: string;
    dateFin?: string;
} 