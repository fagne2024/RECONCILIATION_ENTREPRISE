export interface ImpactOP {
  id?: number;
  typeOperation: string;
  montant: number;
  soldeAvant: number;
  soldeApres: number;
  codeProprietaire: string;
  dateOperation: string;
  numeroTransGU: string;
  groupeReseau: string;
  statut?: 'EN_ATTENTE' | 'TRAITE' | 'ERREUR';
  commentaire?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImpactOPFilter {
  codeProprietaire?: string;
  typeOperation?: string;
  groupeReseau?: string;
  numeroTransGu?: string;
  statut?: string;
  dateDebut?: string;
  dateFin?: string;
  montantMin?: number;
  montantMax?: number;
}

export interface ImpactOPValidationResult {
  validLines: number;
  errorLines: number;
  duplicates: number;
  newRecords: number;
  hasErrors: boolean;
  errors: string[];
}

export interface ImpactOPUploadResult {
  success: boolean;
  message: string;
  count: number;
  duplicates: number;
  totalReceived: number;
} 