export interface Compte {
    id?: number;
    numeroCompte: string;
    solde: number;
    dateDerniereMaj: string;
    pays: string;
    codeProprietaire?: string;
    agence?: string;
    type?: string; // Ajouté : TOP20, B2B, G&I
    categorie?: string; // Ajouté : Client, Service, Banque
    consolide?: boolean;
    regroupe?: boolean;
}

export interface CompteCreateRequest {
    numeroCompte: string;
    solde: number;
    pays: string;
    codeProprietaire?: string;
    agence?: string;
    type?: string; // Ajouté
    categorie?: string; // Ajouté
}

export interface CompteUpdateRequest {
    numeroCompte?: string;
    solde?: number;
    pays?: string;
    codeProprietaire?: string;
    agence?: string;
    type?: string; // Ajouté
    categorie?: string; // Ajouté
}

export interface CompteFilter {
    pays?: string | string[];
    dateDebut?: string;
    dateFin?: string;
    codeProprietaire?: string | string[];
    categorie?: string | string[];
    type?: string | string[];
} 

export interface CompteSoldeCloture {
    id?: number;
    numeroCompte: string;
    dateSolde: string;
    soldeCloture: number;
}