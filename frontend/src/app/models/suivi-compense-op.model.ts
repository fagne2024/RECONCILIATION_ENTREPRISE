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

export interface SuiviCompenseOpUploadResponse {
  totalRead: number;
  saved: number;
  duplicatesIgnored?: number;
  error?: string;
}
