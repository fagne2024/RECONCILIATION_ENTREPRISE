export interface SuiviEcart {
    id?: number;
    date: string;
    agence: string;
    service: string;
    pays: string;
    montant: number;
    token: string;
    idPartenaire: string;
    statut: string;
    traitement: string;
    telephone?: string;
    commentaire?: string;
    username?: string;
    glpiId?: string;
}

