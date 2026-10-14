export interface Module {
  id?: number;
  nom: string;
  visible?: boolean; // Visibilité du module dans l'application
  permissions?: any[]; // Permissions associées (optionnel)
} 