export interface Operation {
    id?: number;
    typeOperation: string;
    dateOperation: string;
    codeProprietaire: string;
    service?: string;
    montant: number;
    soldeAvant: number;
    soldeApres: number;
    nomBordereau?: string;
    banque?: string;
    statut: string;
    pays: string;
    compteId?: number;
    parentOperationId?: number;
    reference?: string;
}

export interface OperationCreateRequest {
    compteId: number;
    typeOperation: string;
    montant: number;
    banque?: string;
    nomBordereau?: string;
    service?: string;
    reference?: string;
    dateOperation: string;
    referenceType?: string; // "STANDARD" ou "CROSS_BORDER"
}

export interface OperationUpdateRequest {
    typeOperation?: string;
    codeProprietaire?: string;
    service?: string;
    montant?: number;
    soldeAvant?: number;
    soldeApres?: number;
    nomBordereau?: string;
    banque?: string;
    statut?: string;
    pays?: string;
    compteId?: number;
    reference?: string;
    dateOperation?: string;
}

export interface OperationFilter {
    compteId?: number;
    typeOperation?: string;
    pays?: string;
    statut?: string;
    banque?: string;
    codeProprietaire?: string;
    service?: string;
    nomBordereau?: string;
    dateDebut?: string;
    dateFin?: string;
}

export enum TypeOperation {
    TOTAL_CASHIN = 'total_cashin',
    TOTAL_PAIEMENT = 'total_paiement',
    APPROVISIONNEMENT = 'Appro_client',
    APPRO_FOURNISSEUR = 'Appro_fournisseur',
    AJUSTEMENT = 'ajustement',
    COMPENSE = 'Compense_client',
    COMPENSE_FOURNISSEUR = 'Compense_fournisseur',
    NIVELLEMENT = 'nivellement',
    REGULARISATION_SOLDE = 'régularisation_solde',
    FRAIS_TRANSACTION = 'FRAIS_TRANSACTION',
    ANNULATION_PARTENAIRE = 'annulation_partenaire',
    ANNULATION_BO = 'annulation_bo',
    TRANSACTION_CREE = 'transaction_cree',
    TSOP = 'tsop'
}

export enum StatutOperation {
    EN_ATTENTE = 'En attente',
    VALIDEE = 'Validée',
    REJETEE = 'Rejetée',
    ANNULEE = 'Annulée',
    EN_COURS = 'En cours'
} 