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
  { code: 'SOLDE_CLOTURE_THEORIQUE', label: 'Solde de clôture théorique', module: 'CERTIFICATION_SOLDE' },
  { code: 'PAYIN', label: 'PAYIN', module: 'REDEVANCE_LOTERIE' },
  { code: 'PAYOUT', label: 'PAYOUT', module: 'REDEVANCE_LOTERIE' },
  { code: 'TOTAL_MISES', label: 'Total mises', module: 'REDEVANCE_LOTERIE' },
  { code: 'TOTAL_GAINS', label: 'Total gains', module: 'REDEVANCE_LOTERIE' },
  { code: 'TOTAL_BONUS', label: 'Total bonus', module: 'REDEVANCE_LOTERIE' },
  { code: 'CA_BRUT', label: 'Chiffre d\'affaires brut', module: 'REDEVANCE_LOTERIE' },
  { code: 'TAXE_JEUX_HASARD', label: 'Taxe jeux de hasard', module: 'REDEVANCE_LOTERIE' },
  { code: 'RETENUE_SUR_GAINS', label: 'Retenue sur gains', module: 'REDEVANCE_LOTERIE' },
  { code: 'PBJ', label: 'Produit brut de jeux', module: 'REDEVANCE_LOTERIE' },
  { code: 'PAYIN_X_TAUX', label: 'PAYIN × taux payin', module: 'REDEVANCE_LOTERIE' },
  { code: 'PAYOUT_X_TAUX', label: 'PAYOUT × taux payout', module: 'REDEVANCE_LOTERIE' },
  { code: 'REMUNERATION', label: 'Rémunération intégrateur', module: 'REDEVANCE_LOTERIE' },
  { code: 'REVENU', label: 'Revenu généré (act. com.)', module: 'REDEVANCE_LOTERIE' },
  { code: 'BASE_CALCUL', label: 'Base de calcul', module: 'REDEVANCE_LOTERIE' }
];

/** Libellés affichables pour les modules regroupant les règles. */
export const CALCULATION_MODULE_LABELS: Record<string, string> = {
  CERTIFICATION_SOLDE: 'Certification de solde',
  ECART_SOLDE: 'Écart de solde',
  COMPTES: 'Comptes',
  REDEVANCE_LOTERIE: 'Redevance loterie',
  COLUMN_SELECTION: 'Sélection des colonnes',
  BANQUE: 'Banque',
  MODELES: 'Modèles de traitement',
  TRAITEMENT: 'Traitement'
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
  DETECTION_FICHIERS: 'Détection des fichiers',
  FORMATS_FICHIERS: 'Formats de fichiers',
  INDICATEURS_BRUTS: 'Indicateurs bruts',
  PRODUITS: 'Produits dérivés',
  REDEVANCE: 'Redevance',
  PARAMETRES: 'Paramètres',
  FLUX_TRANSACTION: 'Flux transaction'
};
