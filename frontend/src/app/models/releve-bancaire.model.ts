export interface ReleveBancaireRow {
  id?: number;
  numeroCompte?: string;
  nomCompte?: string;
  banque?: string; // code propriétaire
  pays?: string; // code pays du compte (ML, SN…)
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
  /** Lignes déjà présentes en base : rien n'a été enregistré, l'utilisateur doit choisir. */
  doublonsEnAttente?: boolean;
  doublons?: DoublonImportLigne[];
}

/** Ligne d'un import banque déjà présente en base (opérations ou relevé). */
export interface DoublonImportLigne {
  /** Identifiant de la ligne dans le fichier, à renvoyer dans la décision. */
  ligne: number;
  motif: 'REFERENCE' | 'LIBELLE' | 'CLE';
  valeurs: Record<string, any>;
}

/** Décision sur les doublons : numéros de ligne à charger quand même (les autres sont rejetés). */
export interface DecisionDoublons {
  acceptes: number[];
}

/** Valeurs à appliquer aux lignes dont le numéro de compte ou la banque est absent du fichier. */
export interface ReleveImportDefaults {
  numeroCompte?: string;
  nomCompte?: string;
  banque?: string;
  pays?: string;
}

/** Champs obligatoires qu'un fichier de relevé peut ne pas fournir. */
export type ReleveMissingField = 'numeroCompte' | 'nomCompte' | 'banque' | 'pays';

export interface ReleveListFilter {
  batchId?: string;
  numeroCompte?: string;
  banque?: string;
  pays?: string; // code pays (colonne pays du relevé)
  devise?: string;
  reconStatus?: 'OK' | 'KO';
  libelleContains?: string;
  dateDebut?: string; // yyyy-MM-dd
  dateFin?: string;   // yyyy-MM-dd
  dateField?: 'comptable' | 'valeur';
  montantMin?: number;
  montantMax?: number;
}


