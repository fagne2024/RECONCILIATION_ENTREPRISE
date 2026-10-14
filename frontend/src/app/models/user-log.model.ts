export interface UserLog {
  id?: number;
  permission: string;
  module: string;
  username: string;
  dateHeure: string;
  createdAt?: string;
  details?: string; // Détails de la modification (ex: numéro de compte modifié, ID de l'élément, etc.)
}

export interface UserLogFilter {
  username?: string;
  module?: string;
  permission?: string;
  dateDebut?: string;
  dateFin?: string;
}

