export interface Pays {
  id?: number;
  code: string;
  nom: string;
}

export interface ProfilPays {
  id?: number;
  profil?: {
    id?: number;
    nom?: string;
  };
  pays?: Pays;
}

