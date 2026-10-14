/**
 * Modèles du sous-module Configuration > Calcul.
 */

export type CalculationRuleType = 'FORMULE' | 'LISTE' | 'PARAMETRE';

export interface CalculationFormulaTerm {
  signe: '+' | '-';
  coefficient: number;
  variable: string;
  absolue: boolean;
}

export interface CalculationRule {
  id?: number;
  code: string;
  module: string;
  sousModule?: string;
  libelle: string;
  description?: string;
  type: CalculationRuleType;
  expression?: string;
  valeurs?: string;
  valeur?: number;
  unite?: string;
  ordre?: number;
  actif?: boolean;
  systeme?: boolean;
  dateCreation?: string;
  dateModification?: string;
}

/** Variable disponible pour construire une formule. */
export interface CalculationVariable {
  code: string;
  label: string;
  module: string;
}

/** Catalogue des variables utilisables dans les formules de certification de solde. */
export const CALCULATION_VARIABLES: CalculationVariable[] = [
  { code: 'SOLDE_OUVERTURE', label: 'Solde ouverture OPPART', module: 'CERTIFICATION_SOLDE' },
  { code: 'SOLDE_CLOTURE', label: 'Solde clôture OPPART', module: 'CERTIFICATION_SOLDE' },
  { code: 'VARIATION', label: 'Variation du solde (clôture - ouverture)', module: 'CERTIFICATION_SOLDE' },
  { code: 'MOUVEMENT_NET_OPPART', label: 'Mouvement net OPPART', module: 'CERTIFICATION_SOLDE' },
  { code: 'FRAIS_FACTURE', label: 'Frais facturé (OPPART)', module: 'CERTIFICATION_SOLDE' },
  { code: 'FRAIS_ATTENDU', label: 'Frais attendu (BO)', module: 'CERTIFICATION_SOLDE' },
  { code: 'ECART_PARTENAIRE', label: 'Écart partenaire retenu', module: 'CERTIFICATION_SOLDE' },
  { code: 'RGFRAIS', label: 'RGFRAIS', module: 'CERTIFICATION_SOLDE' },
  { code: 'TSOP', label: 'TSOP', module: 'CERTIFICATION_SOLDE' },
  { code: 'TRX_SF', label: 'TRX SF', module: 'CERTIFICATION_SOLDE' },
  { code: 'TOTAL_REGULARISATION', label: 'Total à régulariser', module: 'CERTIFICATION_SOLDE' },
  { code: 'ECART_MOUVEMENT', label: 'Écart mouvement', module: 'CERTIFICATION_SOLDE' },
  { code: 'ECART_FRAIS', label: 'Écart frais', module: 'CERTIFICATION_SOLDE' },
  { code: 'ECART_CERTIFICATION', label: 'Écart de certification (synthèse)', module: 'CERTIFICATION_SOLDE' },
  { code: 'SOLDE_CLOTURE_THEORIQUE', label: 'Solde de clôture théorique', module: 'CERTIFICATION_SOLDE' }
];

/** Libellés affichables pour les modules regroupant les règles. */
export const CALCULATION_MODULE_LABELS: Record<string, string> = {
  CERTIFICATION_SOLDE: 'Certification de solde',
  ECART_SOLDE: 'Écart de solde',
  COMPTES: 'Comptes',
  COLUMN_SELECTION: 'Sélection des colonnes',
  BANQUE: 'Banque',
  MODELES: 'Modèles de traitement'
};

/** Libellés affichables pour les sous-modules. */
export const CALCULATION_SUBMODULE_LABELS: Record<string, string> = {
  ECART_MOUVEMENT: 'Écart mouvement',
  ECART_FRAIS: 'Écart frais',
  ECART_CERTIFICATION: 'Écart de certification',
  ECART_PARTENAIRE: 'Écart partenaire',
  FRAIS: 'Frais',
  REGULARISATION: 'Régularisation',
  CRITICITE: 'Criticité',
  CONFIANCE: 'Confiance',
  CLASSIFICATION: 'Classification des opérations',
  DETECTION_FICHIERS: 'Détection des fichiers'
};
