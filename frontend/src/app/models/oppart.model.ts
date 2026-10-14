export const OPPART_STATUT_EN_COURS = 'EN_COURS';
export const OPPART_STATUT_OK = 'OK';

/** Source proposée par défaut lors d'une création manuelle. */
export const OPPART_SOURCE_MANUEL = 'MANUEL';

export type OppartStatut = typeof OPPART_STATUT_EN_COURS | typeof OPPART_STATUT_OK;

export interface Oppart {
  id?: number;
  client: string;
  typeOp: string;
  montant: number;
  dateOperation: string;
  idTransaction: string;
  pays: string;
  source?: string;
  /** EN_COURS (par défaut) ou OK */
  statut?: OppartStatut | string;
  /** Token partagé par les 2 lignes d'une correspondance */
  token?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Ligne à vérifier dans OPPART, telle qu'elle figure dans la liste des compenses. */
export interface OppartLigneVerification {
  numeroTransGu: string;
  montant: number | null;
  /** Jour au format yyyy-MM-dd. */
  date: string;
  client: string;
}

/** Résultat de la vérification d'une ligne concernée. */
export interface OppartLigneVerificationResult {
  numeroTransGu: string;
  trouve: boolean;
  /** ID_TRANSGU : seule source de résolution fiable. */
  mode: string | null;
  /** Raison de l'absence, quand la ligne n'a pas été retrouvée. */
  motif: string | null;
  id: number | null;
  /** Statut retenu : celui du groupe de correspondance complet. */
  statut: string | null;
  typeOp: string | null;
  montant: number | null;
  dateOperation: string | null;
  client: string | null;
  /** Token partagé par les lignes de la correspondance. */
  token: string | null;
}

export interface OppartDraftRow {
  client: string;
  typeOp: string;
  montant: number;
  dateOperation: string;
  idTransaction: string;
  pays: string;
}

export interface OppartFilter {
  client?: string;
  typeOp?: string;
  pays?: string;
  source?: string;
  statut?: string;
  /** Recherche partielle sur le token de correspondance (insensible à la casse). */
  token?: string;
  dateDebut?: string;
  dateFin?: string;
}

export interface OppartBatchResult {
  successCount: number;
  errorCount: number;
  created: Oppart[];
  errors: string[];
  total: number;
}

/** Une ligne du fichier parsée, telle qu'affichée dans l'aperçu avant import. */
export interface OppartImportPreviewRow {
  line: string;
  client: string;
  typeOp: string;
  montant: string;
  date: string;
  idTransaction: string;
  pays: string;
  source: string;
  status: string;
}

/** Résultat de POST /api/oppart/validate : résumé + aperçu, sans écriture en base. */
export interface OppartValidationResult {
  totalReceived: number;
  validLines: number;
  errorLines: number;
  duplicates: number;
  hasErrors: boolean;
  errors: string[];
  preview: OppartImportPreviewRow[];
  headers: string[];
}

/** Résultat de POST /api/oppart/upload. */
export interface OppartUploadResult {
  success: boolean;
  message: string;
  count: number;
  duplicates: number;
  errorLines: number;
  totalReceived: number;
  hasErrors: boolean;
  errors: string[];
}

/** Paire de lignes candidates à lier, produite par la recherche de correspondance. */
export interface OppartMatchPair {
  gauche: Oppart;
  droite: Oppart;
  ecart: number;
  /** key interne pour le suivi de l'état "déjà liée" */
  pairKey: string;
}

export interface OppartLinkResult {
  success: boolean;
  token?: string;
  linkedIds?: number[];
  opparts?: Oppart[];
  message?: string;
}

/**
 * Correspondance par agrégation : la somme des montants de `lignes` est égale
 * au montant de `cible` (ex. 7 lignes AIRTEL_PARTNER = 1 ligne BO globale).
 */
export interface OppartAggregateMatch {
  /** Ligne dont le montant est égal à la somme des lignes du groupe. */
  cible: Oppart;
  /** Lignes dont les montants ont été additionnés (au moins 2). */
  lignes: Oppart[];
  /** Somme des montants de `lignes`. */
  somme: number;
  /** Montant de la cible. */
  montantCible: number;
  /** Somme - montantCible. */
  ecart: number;
  /**
   * true si les lignes additionnées n'ont pas toutes la même racine de Type_OP
   * que la cible (possible uniquement avec l'option « types différents autorisés »).
   */
  typesMelanges: boolean;
  /** key interne pour le suivi de l'état "déjà liée". */
  matchKey: string;
}
