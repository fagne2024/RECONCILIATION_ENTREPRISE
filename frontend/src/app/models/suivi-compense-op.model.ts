export interface SuiviCompenseOp {
  id?: number;
  dateOperation?: string; // yyyy-MM-dd
  codeAgence?: string;
  banque?: string;
  compteBancaire?: string;
  montant?: number;
  modePaiement?: string;
  reference?: string;
  idTicket?: string;
  service?: string;
  reseau?: string;
  sourceFilename?: string;
  uploadedAt?: string;
}

/** Type d'opération : détermine le suffixe de la référence générée (CP, AP ou CB). */
export type SuiviCompenseReferenceType = 'COMPENSE' | 'APPRO' | 'CROSS_BORDER';

/** Saisie manuelle : la référence est générée par le serveur. */
export interface SuiviCompenseOpCreateRequest {
  dateOperation: string; // yyyy-MM-dd
  codeAgence?: string;
  banque?: string;
  compteBancaire?: string;
  montant: number;
  modePaiement?: string;
  idTicket?: string;
  service?: string;
  reseau?: string;
  typeReference: SuiviCompenseReferenceType;
}

export interface SuiviCompenseOpUploadResponse {
  totalRead: number;
  saved: number;
  duplicatesIgnored?: number;
  error?: string;
}
