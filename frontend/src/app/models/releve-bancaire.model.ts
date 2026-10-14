export interface ReleveBancaireRow {
  id?: number;
  numeroCompte?: string;
  nomCompte?: string;
  banque?: string; // code propriétaire
  dateComptable?: string | Date; // ISO date string or Date
  dateValeur?: string | Date;    // ISO date string or Date
  libelle?: string;
  debit?: number;
  credit?: number;
  montant?: number;
  numeroCheque?: string;
  devise?: string;
  soldeCourant?: number;
  soldeDisponibleCloture?: number;
  soldeDisponibleOuverture?: number;
  soldeComptableOuverture?: number;
  soldeComptableCloture?: number;
  reconStatus?: 'OK' | 'KO';
  commentaire?: string;
  numeroSerie?: string;
}

export interface ReleveUploadResponse {
  batchId: string;
  count: number;
  rows: ReleveBancaireRow[];
  totalRead: number;
  duplicatesIgnored: number;
  unmappedHeaders: string[];
}

export interface ReleveListFilter {
  batchId?: string;
  numeroCompte?: string;
  banque?: string;
  pays?: string; // dérivé des 2 dernières lettres de banque
  devise?: string;
  reconStatus?: 'OK' | 'KO';
  libelleContains?: string;
  dateDebut?: string; // yyyy-MM-dd
  dateFin?: string;   // yyyy-MM-dd
  dateField?: 'comptable' | 'valeur';
  montantMin?: number;
  montantMax?: number;
}


