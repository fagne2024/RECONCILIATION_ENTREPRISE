import { fixCellEncoding } from './encoding-fixer';
import { normalizeColumnKey, resolveColumnKeyInRow } from './row-column.util';

/**
 * Définition bilingue d'une colonne : libellé FR, libellé EN, identifiant interne stable.
 * Toute variante d'en-tête est résolue vers le même `id`, puis vers le libellé FR canonique.
 */
export interface BilingualColumnDefinition {
  id: string;
  fr: string;
  en: string;
}

/** Rapports marchands Moov / Orange (captures FR et EN). */
export const MERCHANT_REPORT_COLUMNS: BilingualColumnDefinition[] = [
  { id: 'orgShortCode', fr: "Code court de l'organisation", en: 'Organization Short Code' },
  { id: 'orgName', fr: "Nom de l'organisation", en: 'Organization Name' },
  { id: 'profile', fr: 'Profil', en: 'Profile' },
  { id: 'receiptNo', fr: 'N° de reçu', en: 'Receipt No.' },
  { id: 'thirdPartyTxId', fr: 'ID de transaction tiers', en: 'ThirdPartyTransactionId' },
  { id: 'completionTime', fr: 'Heure de fin', en: 'Completion Time' },
  { id: 'initiationTime', fr: "Heure d'initiation", en: 'Initiation Time' },
  { id: 'details', fr: 'Détails', en: 'Details' },
  { id: 'transactionStatus', fr: 'Statut de la transaction', en: 'Transaction Status' },
  { id: 'currency', fr: 'Devise', en: 'Currency' },
  { id: 'paidIn', fr: 'Versé', en: 'Paid In' },
  { id: 'withdrawn', fr: 'Retiré', en: 'Withdrawn' },
  { id: 'balance', fr: 'Solde', en: 'Balance' },
  { id: 'commission', fr: 'Commission', en: 'Commission' },
  { id: 'fee', fr: 'Frais', en: 'Fee' },
  { id: 'tax', fr: 'Impôt', en: 'Tax' },
  { id: 'reasonType', fr: 'Type de motif', en: 'Reason Type' },
  { id: 'remarks', fr: 'REMARKS', en: 'REMARKS' },
  { id: 'initiatorMsisdn', fr: "MSISDN de l'initiateur", en: 'Initiator MSISDN' },
  { id: 'oppositeParty', fr: 'Partie adverse', en: 'Opposite Party' },
  { id: 'linkedTxId', fr: 'ID de transaction liée', en: 'Linked Transaction ID' }
];

/** Alias FR supplémentaires (relevés d'opérations : libellés FR de la banque). */
export const MERCHANT_REPORT_FR_ALIASES: Record<string, string[]> = {
  receiptNo: ['Reçu n°', 'Recu n°', 'Reçu no', 'Numéro de reçu'],
  completionTime: ["Le temps d'achèvement", "Temps d'achèvement", 'Temps de fin'],
  initiationTime: ["Temps d'initiation", 'Temps initiation'],
  transactionStatus: ['Etat de la transaction', 'État de la transaction', 'Statut transaction', 'Transfer Status', 'Statut du transfert'],
  paidIn: ['Payé en', 'Paye en'],
  reasonType: ['Type de raison'],
  remarks: ['Remarque', 'Remarques'],
  details: ['Des détails', 'Détail'],
  linkedTxId: ['Identifiant des liens de la transaction', 'Identifiant des liens de transaction']
};

/** Alias Orange Money : en-têtes variables des relevés (ex. « Généré le : », « Application : »). */
export const ORANGE_MONEY_COLUMN_DEFINITIONS: BilingualColumnDefinition[] = [
  { id: 'omStatut', fr: 'Statut', en: 'Généré le :' },
  { id: 'omPaiement', fr: 'Paiement', en: 'Application :' }
];

const ORANGE_MONEY_EXTRA_ALIASES: Record<string, string[]> = {
  omStatut: ['Généré le', 'Genere le :', 'Genere le', 'Status', 'État', 'Etat', 'State'],
  omPaiement: ['Application', 'Application:', 'Payment', 'Moyen de Paiement', 'Moyen paiement']
};

/**
 * Colonnes bancaires (relevé et opérations) : libellé FR du modèle, libellé EN équivalent
 * et variantes courantes. Un fichier en anglais et un modèle configuré en français
 * désignent ainsi la même colonne.
 */
export const BANKING_COLUMN_DEFINITIONS: Array<BilingualColumnDefinition & { aliases?: string[] }> = [
  { id: 'bkNumeroCompte', fr: 'Numéro de compte', en: 'Account Number', aliases: ['N° de compte', 'Numero de compte', 'Account No', 'Account No.', 'Compte'] },
  { id: 'bkNomCompte', fr: 'Nom du compte', en: 'Account Name', aliases: ['Nom du Compte', 'Libellé du compte'] },
  { id: 'bkBanque', fr: 'Banque', en: 'Bank', aliases: ['Bank Name', 'Nom de la banque', 'Banque appro', 'Bank appro'] },
  { id: 'bkDateComptable', fr: 'Date comptable', en: 'Accounting Date', aliases: ['Booking Date', 'Date de comptabilisation'] },
  { id: 'bkDateValeur', fr: 'Date de valeur', en: 'Value Date', aliases: ['Date valeur', 'Date de Valeur'] },
  { id: 'bkLibelle', fr: 'Libellé / Narration', en: 'Label / Narration', aliases: ['Libellé/Narration', 'Libelle', 'Libellé', 'Narration', 'Narrative', 'Label', 'Description'] },
  { id: 'bkDebit', fr: 'Débit', en: 'Debit', aliases: ['Debits', 'Débits'] },
  { id: 'bkCredit', fr: 'Crédit', en: 'Credit', aliases: ['Credits', 'Crédits'] },
  { id: 'bkMontant', fr: 'Montant', en: 'Amount', aliases: ['Montant opération', 'Transaction Amount'] },
  { id: 'bkDevise', fr: 'Devise', en: 'Currency', aliases: ['Devise du compte', 'Account Currency'] },
  { id: 'bkStatutReconciliation', fr: 'Statut Réconciliation', en: 'Reconciliation Status', aliases: ['Statut reconciliation'] },
  { id: 'bkNumeroCheque', fr: 'Numéro de chèque', en: 'Cheque Number', aliases: ['Numéro de chèque', 'Numero de cheque', 'Chèque', 'Cheque', 'Check Number'] },
  { id: 'bkNumeroSerie', fr: 'Numéro de série', en: 'Serial Number', aliases: ['Numero de serie', 'Series Number', 'Numéro de serie'] },
  // Opérations bancaires
  { id: 'bkDateOperation', fr: 'Date Opération', en: 'Operation Date', aliases: ['Date operation', 'Transaction Date'] },
  { id: 'bkTypeOperation', fr: 'Type Opération', en: 'Operation Type', aliases: ['Type operation', "Type d'opération", 'Transaction Type'] },
  // Relevés de transferts mobile money (ex. modèle Airtel GA) : même concept, libellés différents.
  { id: 'trfId', fr: 'ID du transfert', en: 'Transfer ID', aliases: ['Transaction ID', 'Transaction Id', 'Transaction_ID', 'ID transaction'] },
  { id: 'trfSender', fr: 'Expéditeur', en: 'Sender', aliases: ['Sender Msisdn', 'Sender MSISDN', 'Sender_msisdn', 'Expediteur'] },
  { id: 'trfReceiver', fr: 'Destinataire', en: 'Receiver', aliases: ['Receiver Msisdn', 'Receiver MSISDN', 'Receiver_msisdn'] },
  { id: 'trfDate', fr: 'Date du transfert', en: 'Transfer On', aliases: ['Transaction Date and Time', 'Transaction Date & Time', 'Transfer Date', 'Date et heure de transaction'] },
  { id: 'bkAgence', fr: 'Agence', en: 'Agency', aliases: ['Code agence', 'Agency Code'] },
  { id: 'bkCompteADebiter', fr: 'Compte à débiter', en: 'Debit Account', aliases: ['Compte a debiter', 'Account To Debit'] },
  { id: 'bkNomBeneficiaire', fr: 'Nom Bénéficiaire', en: 'Beneficiary', aliases: ['Beneficiary Name', 'Nom beneficiaire'] },
  { id: 'bkModePaiement', fr: 'Mode Paiement', en: 'Payment Mode', aliases: ['Mode de paiement', 'Mode de Paiement', 'Payment Method'] },
  { id: 'bkReference', fr: 'Référence', en: 'Reference', aliases: ['Reference Number'] },
  { id: 'bkIdGlpi', fr: 'ID GLPI', en: 'Ticket ID', aliases: ['ID Ticket', 'ID ticket', 'GLPI ID'] },
  { id: 'bkBanqueCorrigee', fr: 'Banque Corrigée', en: 'Corrected Bank', aliases: ['Banque corrigee'] },
  { id: 'bkPays', fr: 'Pays', en: 'Country', aliases: ['Pays provenance'] },
  { id: 'bkCodePays', fr: 'Code Pays', en: 'Country Code', aliases: ['Code pays'] },
  { id: 'bkMois', fr: 'Mois', en: 'Month', aliases: [] },
  // Colonnes du modèle opérations bancaires (OPBO / OPPART)
  { id: 'bkSoldeAvant', fr: 'Solde avant', en: 'Balance before', aliases: ['Solde avant'] },
  { id: 'bkSoldeApres', fr: 'Solde après', en: 'Balance after', aliases: ['Solde aprés', 'Solde apres'] },
  { id: 'bkIdOperation', fr: 'ID Opération', en: 'ID Operation', aliases: ['ID Opération', 'Id operation'] },
  { id: 'bkCodeProprietaire', fr: 'Code propriétaire', en: 'Proprietary Code', aliases: ['Code proprietaire'] },
  { id: 'bkTelephone', fr: 'Téléphone', en: 'Phone', aliases: ['Telephone', 'Phone Number'] },
  { id: 'bkNumBordereau', fr: 'Num bordereau', en: 'Billnumber', aliases: ['Bill number', 'Bill Number', 'Numéro bordereau', 'Numero bordereau'] },
  { id: 'bkDateVersement', fr: 'Date de versement', en: 'Date of payment', aliases: ['Date de paiement', 'Payment Date'] },
  { id: 'bkDemandeur', fr: 'Login demandeur Appro', en: 'Applicant Login Appro', aliases: ['Demandeur', 'Login demandeur', 'Requester', 'Applicant Login'] },
  { id: 'bkValideur', fr: 'Login valideur Appro', en: 'Login validator Appro', aliases: ['Valideur', 'Login valideur', 'Validator', 'Approver'] },
  { id: 'bkMotifRejet', fr: 'Motif rejet', en: 'Rejection reason', aliases: ['Motif de rejet'] },
  { id: 'bkFraisConnexion', fr: 'Frais connexion', en: 'connection fee', aliases: ['Frais de connexion', 'Connection Fee'] },
  { id: 'bkNumTransGU', fr: 'Numéro Trans GU', en: 'Num Trans GU', aliases: ['Num Trans GU', 'Numero Trans GU'] },
  { id: 'bkMotifRegularisation', fr: 'Motif régularisation', en: 'Regularization reason', aliases: ['Motif regularisation'] },
  { id: 'bkGroupeReseau', fr: 'groupe de réseau', en: 'network group', aliases: ['Groupe de réseau', 'Groupe reseau', 'Network group', 'Network Group'] }
];

/** Champs métier ReconciliApp (écarts BO, TRX, etc.) — alias FR / EN. */
export const BILINGUAL_COLUMN_ALIASES = {
  date: [
    'Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'dateTransaction', 'DateTransaction',
    'Initiation Time', "Heure d'initiation", 'Heure d initiation', 'Completion Time', 'Heure de fin',
    'Date opération', 'Date operation', 'Transaction Date'
  ],
  agence: [
    'Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'Agent', 'agent',
    'Organization Short Code', "Code court de l'organisation", 'Code court de l organisation',
    'Code proprietaire', 'Code propriétaire', 'Code reseau', 'Code réseau'
  ],
  service: [
    'Service', 'service', 'SERVICE', 'serv', 'Serv', 'Service Name', 'Nom du service',
    'Code service', 'Details', 'Détails', 'Type Opération', 'Type Operation',
    "Type d'opération", 'Operation Type', 'Reason Type', 'Type de motif'
  ],
  pays: [
    'Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'Pays provenance', 'Country of origin',
    'Currency', 'Devise'
  ],
  montant: [
    'montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME',
    'Paid In', 'Versé', 'Verse', 'Withdrawn', 'Retiré', 'Retire', 'Balance', 'Solde'
  ],
  statut: [
    'Statut', 'statut', 'STATUT', 'status', 'Status', 'Transaction Status', 'Statut de la transaction',
    'Etat', 'State', 'Généré le :', 'Généré le', 'Genere le :', 'Genere le'
  ],
  paiement: [
    'Paiement', 'paiement', 'PAIEMENT', 'payment', 'Payment',
    'Application :', 'Application:', 'Application', 'Moyen de Paiement', 'Moyen paiement'
  ],
  receipt: [
    'Receipt No.', 'Receipt No', 'N° de reçu', 'N de recu', 'Numero de recu', 'Numéro de reçu',
    'ID Transaction', 'Transaction ID', 'ThirdPartyTransactionId', 'ID de transaction tiers',
    'Linked Transaction ID', 'ID de transaction liée'
  ]
} as const;

/** Index normalisé → définition (FR, EN, id). - Lazy initialization to avoid circular dependency */
let NORMALIZED_HEADER_INDEX: Map<string, BilingualColumnDefinition> | null = null;

function getNormalizedHeaderIndex(): Map<string, BilingualColumnDefinition> {
  if (NORMALIZED_HEADER_INDEX) {
    return NORMALIZED_HEADER_INDEX;
  }
  const index = new Map<string, BilingualColumnDefinition>();
  const register = (label: string, def: BilingualColumnDefinition) => {
    const key = normalizeColumnKey(fixCellEncoding(label));
    if (key && !index.has(key)) {
      index.set(key, def);
    }
  };

  for (const def of MERCHANT_REPORT_COLUMNS) {
    register(def.fr, def);
    register(def.en, def);
    for (const alias of MERCHANT_REPORT_FR_ALIASES[def.id] || []) {
      register(alias, def);
    }
    register(def.fr.replace(/'/g, ''), def);
    register(def.en.replace(/\./g, ''), def);
  }

  for (const def of ORANGE_MONEY_COLUMN_DEFINITIONS) {
    register(def.fr, def);
    register(def.en, def);
    register(def.en.replace(/\s*:\s*$/, ''), def);
    const extras = ORANGE_MONEY_EXTRA_ALIASES[def.id] || [];
    for (const extra of extras) {
      register(extra, def);
    }
  }

  // Colonnes bancaires : enregistrées avant les alias génériques (ex. « Montant » / « Amount »)
  for (const def of BANKING_COLUMN_DEFINITIONS) {
    register(def.fr, def);
    register(def.en, def);
    for (const alias of def.aliases || []) {
      register(alias, def);
    }
  }

  for (const aliases of Object.values(BILINGUAL_COLUMN_ALIASES)) {
    for (const alias of aliases) {
      register(alias, { id: alias, fr: alias, en: alias });
    }
  }

  NORMALIZED_HEADER_INDEX = index;
  return index;
}

/** Motifs d'en-tête pour rapports marchands Moov / Orange (FR ou EN). - Lazy to avoid circular dep */
let _merchantReportHeaderMarkers: string[] | null = null;
export function getMerchantReportHeaderMarkers(): string[] {
  if (_merchantReportHeaderMarkers) {
    return _merchantReportHeaderMarkers;
  }
  _merchantReportHeaderMarkers = MERCHANT_REPORT_COLUMNS.flatMap(def => [
    normalizeHeaderForMatch(def.en),
    normalizeHeaderForMatch(def.fr)
  ]).filter(Boolean);
  return _merchantReportHeaderMarkers;
}

export function normalizeHeaderForMatch(header: string): string {
  return normalizeColumnKey(fixCellEncoding(header || ''));
}

/**
 * Libellés FR/EN des définitions bilingues, pré-normalisés (tables constantes).
 *
 * `resolveCanonicalColumnId` est appelée au cœur des boucles sur les lignes (filtres,
 * règles de colonnes, projection, dédup…) : recalculer les ~45 normalisations des
 * définitions à chaque appel représentait ~90 µs par échec d'index — soit des dizaines
 * de secondes à plusieurs minutes de thread principal sur des fichiers volumineux.
 * On les calcule une seule fois, à l'image de `getNormalizedHeaderIndex`.
 */
let _merchantCanonicalLabels: ReadonlyArray<{ id: string; fr: string; en: string }> | null = null;
let _orangeMoneyCanonicalLabels: ReadonlyArray<{ id: string; fr: string; en: string }> | null = null;

function getMerchantCanonicalLabels(): ReadonlyArray<{ id: string; fr: string; en: string }> {
  if (!_merchantCanonicalLabels) {
    _merchantCanonicalLabels = MERCHANT_REPORT_COLUMNS.map(def => ({
      id: def.id,
      fr: normalizeHeaderForMatch(def.fr),
      en: normalizeHeaderForMatch(def.en)
    }));
  }
  return _merchantCanonicalLabels;
}

function getOrangeMoneyCanonicalLabels(): ReadonlyArray<{ id: string; fr: string; en: string }> {
  if (!_orangeMoneyCanonicalLabels) {
    _orangeMoneyCanonicalLabels = ORANGE_MONEY_COLUMN_DEFINITIONS.map(def => ({
      id: def.id,
      fr: normalizeHeaderForMatch(def.fr),
      en: normalizeHeaderForMatch(def.en)
    }));
  }
  return _orangeMoneyCanonicalLabels;
}

/**
 * Résout un en-tête (FR, EN ou variante) vers son identifiant canonique.
 * Ex. "Receipt No." et "N° de reçu" → "receiptNo"
 */
export function resolveCanonicalColumnId(header: string): string | null {
  const normalized = normalizeHeaderForMatch(header);
  if (!normalized) {
    return null;
  }

  const exact = getNormalizedHeaderIndex().get(normalized);
  if (exact) {
    return exact.id;
  }

  for (const def of getMerchantCanonicalLabels()) {
    if (normalized.includes(def.fr) || def.fr.includes(normalized)) {
      return def.id;
    }
    if (normalized.includes(def.en) || def.en.includes(normalized)) {
      return def.id;
    }
  }

  for (const def of getOrangeMoneyCanonicalLabels()) {
    if (normalized === def.fr || normalized === def.en) {
      return def.id;
    }
    if (def.id === 'omStatut' && normalized.includes('genere le')) {
      return def.id;
    }
    if (def.id === 'omPaiement' && normalized.startsWith('application')) {
      return def.id;
    }
  }

  return null;
}

/** Libellé FR canonique pour un id (utilisé après normalisation des fichiers EN). */
/**
 * Variante stricte de `resolveCanonicalColumnId` : uniquement l'index exact (FR, EN, alias déclarés),
 * sans rapprochement par inclusion. À utiliser pour résoudre une colonne clé de réconciliation,
 * où un faux positif ferait matcher sur une mauvaise colonne.
 * Ex. "Num Trans GU" et "Numéro Trans GU" → "bkNumTransGU".
 */
export function resolveExactCanonicalColumnId(header: string): string | null {
  const normalized = normalizeHeaderForMatch(header);
  if (!normalized) {
    return null;
  }
  return getNormalizedHeaderIndex().get(normalized)?.id ?? null;
}

/**
 * En-têtes du fichier BO (TRXBO) : export français ↔ export anglais, colonne par colonne.
 * Volontairement hors de l'index global (`getNormalizedHeaderIndex`) : cet index sert aussi
 * aux filtres, à la déduplication et à l'enrichissement des lignes, où « Payment method »,
 * « Sender » ou « Beneficiary » ont déjà un autre sens (relevés bancaires, transferts).
 * Ici, il ne sert qu'à résoudre les colonnes configurées dans les modèles (clés, conditions).
 */
export const TRXBO_COLUMN_DEFINITIONS: Array<BilingualColumnDefinition & { aliases?: string[] }> = [
  { id: 'trxboId', fr: 'ID', en: 'ID' },
  { id: 'trxboIdTransaction', fr: 'IDTransaction', en: 'ID Transaction', aliases: ['Id Transaction'] },
  { id: 'trxboTelephoneClient', fr: 'téléphone client', en: 'customer phone', aliases: ['Telephone client', 'Customer Phone Number'] },
  { id: 'trxboMontant', fr: 'montant', en: 'amount' },
  { id: 'trxboService', fr: 'Service', en: 'Service' },
  { id: 'trxboMoyenPaiement', fr: 'Moyen de Paiement', en: 'Payment method', aliases: ['Moyen paiement'] },
  { id: 'trxboAgence', fr: 'Agence', en: 'Agency' },
  { id: 'trxboAgent', fr: 'Agent', en: 'Agent' },
  { id: 'trxboTypeAgent', fr: 'Type agent', en: 'Agent Type' },
  { id: 'trxboPixi', fr: 'PIXI', en: 'PIXI' },
  { id: 'trxboDate', fr: 'Date', en: 'Date' },
  { id: 'trxboNumTransGu', fr: 'Numéro Trans GU', en: 'Num Trans GU', aliases: ['Numero Trans GU', 'numeroTransGU', 'numtransactiongu'] },
  { id: 'trxboGrx', fr: 'GRX', en: 'GRX' },
  { id: 'trxboStatut', fr: 'Statut', en: 'Status' },
  { id: 'trxboLatitude', fr: 'Latitude', en: 'Latitude' },
  { id: 'trxboLongitude', fr: 'Longitude', en: 'Longitude' },
  { id: 'trxboIdPartenaireDist', fr: 'ID Partenaire DIST', en: 'Partner ID DIST' },
  { id: 'trxboExpediteur', fr: 'Expéditeur', en: 'Sender' },
  { id: 'trxboPaysProvenance', fr: 'Pays provenance', en: 'Country of origin' },
  { id: 'trxboBeneficiaire', fr: 'Bénéficiaire', en: 'Beneficiary' },
  { id: 'trxboCanalDistribution', fr: 'Canal de distribution', en: 'Distribution channel' }
];

let _trxboHeaderIndex: Map<string, string> | null = null;

function normalizeTrxboHeader(header: string): string {
  return normalizeHeaderForMatch(header).replace(/\s+/g, '');
}

function getTrxboHeaderIndex(): Map<string, string> {
  if (_trxboHeaderIndex) {
    return _trxboHeaderIndex;
  }
  const index = new Map<string, string>();
  for (const def of TRXBO_COLUMN_DEFINITIONS) {
    for (const label of [def.fr, def.en, ...(def.aliases || [])]) {
      const key = normalizeTrxboHeader(label);
      if (key && !index.has(key)) {
        index.set(key, def.id);
      }
    }
  }
  _trxboHeaderIndex = index;
  return index;
}

/** Cache en-tête → id TRXBO : appelé dans les boucles sur les lignes (résolution des règles). */
const _trxboIdCache = new Map<string, string | null>();

/**
 * Identifiant de colonne TRXBO (FR ou EN), ex. « Num Trans GU » et « Numéro Trans GU » → « trxboNumTransGu ».
 * Null si l'en-tête n'est pas une colonne du fichier BO.
 */
export function resolveTrxboColumnId(header: string): string | null {
  if (!header) {
    return null;
  }
  const cached = _trxboIdCache.get(header);
  if (cached !== undefined) {
    return cached;
  }
  const id = getTrxboHeaderIndex().get(normalizeTrxboHeader(header)) ?? null;
  if (_trxboIdCache.size > 5000) {
    _trxboIdCache.clear();
  }
  _trxboIdCache.set(header, id);
  return id;
}

/**
 * Indique si deux en-têtes désignent la même colonne métier, quelle que soit la langue :
 * même identifiant dans l'index bilingue global, ou même colonne du fichier BO (TRXBO).
 * Utilisé pour retrouver dans les données une colonne configurée dans un modèle.
 */
export function areEquivalentColumnHeaders(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const globalA = resolveExactCanonicalColumnId(a);
  if (globalA && globalA === resolveExactCanonicalColumnId(b)) {
    return true;
  }
  const trxboA = resolveTrxboColumnId(a);
  return !!trxboA && trxboA === resolveTrxboColumnId(b);
}

/**
 * Libellés connus pour la même colonne dans l'autre langue ou en variante (définitions TRXBO
 * et bancaires). Sert de suggestions dans Configuration > Normalisation modèle.
 * Ex. « Numéro Trans GU » → ['Num Trans GU', 'Numero Trans GU', …].
 */
export function suggestEquivalentHeaders(column: string): string[] {
  const target = normalizeTrxboHeader(column);
  if (!target) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>([target]);
  const definitions = [...TRXBO_COLUMN_DEFINITIONS, ...BANKING_COLUMN_DEFINITIONS];
  for (const def of definitions) {
    const labels = [def.fr, def.en, ...(def.aliases || [])];
    if (!labels.some(label => normalizeTrxboHeader(label) === target)) {
      continue;
    }
    for (const label of labels) {
      const key = normalizeTrxboHeader(label);
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(label);
      }
    }
  }
  return result;
}

/** Premier en-tête de `headers` désignant la même colonne que `column` (FR ↔ EN), sinon null. */
export function findEquivalentHeader(headers: readonly string[], column: string): string | null {
  if (!column || !headers?.length) {
    return null;
  }
  return headers.find(h => h !== column && areEquivalentColumnHeaders(column, h)) ?? null;
}

export function getCanonicalFrenchLabel(columnId: string): string | null {
  const merchantDef = MERCHANT_REPORT_COLUMNS.find(d => d.id === columnId);
  if (merchantDef) {
    return merchantDef.fr;
  }
  const orangeMoneyDef = ORANGE_MONEY_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  if (orangeMoneyDef) {
    return orangeMoneyDef.fr;
  }
  const bankingDef = BANKING_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  return bankingDef?.fr ?? null;
}

/** Alias Orange Money supplémentaires pour une colonne configurée dans un modèle. */
export function getOrangeMoneyAliasHeadersForColumn(column: string): string[] {
  const columnId = resolveCanonicalColumnId(column);
  if (!columnId) {
    return [];
  }
  const def = ORANGE_MONEY_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  if (!def) {
    return [];
  }
  const aliases = new Set<string>([def.fr, def.en, def.en.replace(/\s*:\s*$/, '')]);
  for (const extra of ORANGE_MONEY_EXTRA_ALIASES[columnId] || []) {
    aliases.add(extra);
  }
  return Array.from(aliases).filter(alias => alias && alias !== column);
}

/**
 * Transforme une liste d'en-têtes bruts en libellés FR canoniques quand une correspondance existe.
 * Colonnes inconnues : conservées telles quelles.
 */
export function normalizeHeadersToFrench(headers: string[]): string[] {
  return headers.map(header => {
    const id = resolveCanonicalColumnId(header);
    if (!id) {
      return header;
    }
    return getCanonicalFrenchLabel(id) || header;
  });
}

/**
 * Enrichit une ligne : pour chaque colonne reconnue, ajoute la clé FR canonique
 * (sans supprimer l'en-tête d'origine). Permet aux modèles configurés en FR de fonctionner
 * avec des fichiers EN.
 */
export function enrichRowWithCanonicalFrenchColumns(row: Record<string, string>): Record<string, string> {
  const aliases = buildFrenchAliasEntries(Object.keys(row));
  if (!aliases.length) {
    return row;
  }
  return applyFrenchAliasesToRow(row, aliases);
}

export interface FrenchAliasEntry {
  frenchKey: string;
  sourceKey: string;
}

/** Alias FR à ajouter une seule fois (calculé sur les en-têtes, pas par ligne). */
export function buildFrenchAliasEntries(headers: string[]): FrenchAliasEntry[] {
  const entries: FrenchAliasEntry[] = [];
  const seen = new Set<string>();

  for (const key of headers) {
    const id = resolveCanonicalColumnId(key);
    if (!id) {
      continue;
    }
    const fr = getCanonicalFrenchLabel(id);
    if (!fr || fr === key || seen.has(fr)) {
      continue;
    }
    seen.add(fr);
    entries.push({ frenchKey: fr, sourceKey: key });
  }

  return entries;
}

/** Ajoute les clés FR manquantes sans recopier toute la ligne si inutile. */
export function applyFrenchAliasesToRow(
  row: Record<string, string>,
  aliases: readonly FrenchAliasEntry[]
): Record<string, string> {
  if (!aliases.length) {
    return row;
  }

  for (const { frenchKey, sourceKey } of aliases) {
    const value = row[sourceKey];
    if (value == null || String(value).trim() === '') {
      continue;
    }
    if (!row[frenchKey] || String(row[frenchKey]).trim() === '') {
      row[frenchKey] = String(value).trim();
    }
  }

  return row;
}

/** Lit une valeur dans un enregistrement en testant plusieurs alias (FR / EN). */
export function getRecordValueByAliases(
  record: Record<string, string>,
  aliasKeys: readonly string[]
): string {
  for (const key of aliasKeys) {
    const resolved = resolveColumnKeyInRow(record, key);
    if (resolved && record[resolved] != null && String(record[resolved]).trim() !== '') {
      return String(record[resolved]).trim();
    }
    if (record[key] != null && String(record[key]).trim() !== '') {
      return String(record[key]).trim();
    }
  }

  const targetKeys = new Set(aliasKeys.map(k => normalizeHeaderForMatch(k)));
  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (rawValue == null || String(rawValue).trim() === '') {
      continue;
    }
    if (targetKeys.has(normalizeHeaderForMatch(rawKey))) {
      return String(rawValue).trim();
    }
    const canonicalId = resolveCanonicalColumnId(rawKey);
    if (canonicalId) {
      for (const alias of aliasKeys) {
        if (resolveCanonicalColumnId(alias) === canonicalId) {
          return String(rawValue).trim();
        }
      }
    }
  }

  return '';
}

/** Lit une valeur via l'id canonique (ex. 'receiptNo', 'initiationTime'). */
export function getRecordValueByCanonicalId(
  record: Record<string, string>,
  columnId: string
): string {
  const def = MERCHANT_REPORT_COLUMNS.find(d => d.id === columnId);
  if (!def) {
    return '';
  }
  return getRecordValueByAliases(record, [def.fr, def.en]);
}

/** Score une ligne de grille pour détecter un en-tête de rapport marchand (FR / EN). */
export function scoreMerchantReportHeaderRow(cells: string[]): number {
  if (!cells?.length) {
    return 0;
  }

  const normalized = cells
    .map(c => normalizeHeaderForMatch(c || ''))
    .filter(Boolean);

  if (normalized.length < 6) {
    return 0;
  }

  let score = 0;
  let matchedCanonical = 0;

  for (const cell of normalized) {
    for (const marker of getMerchantReportHeaderMarkers()) {
      if (cell.includes(marker) || marker.includes(cell)) {
        score += 6;
        break;
      }
    }
    if (resolveCanonicalColumnId(cell)) {
      matchedCanonical += 1;
    }
  }

  score += matchedCanonical * 4;

  const hasOrg = normalized.some(c =>
    c.includes('organization short code') || c.includes('code court de l organisation')
  );
  const hasReceipt = normalized.some(c =>
    c.includes('receipt no') || c.includes('n de recu') || c.includes('recu')
  );
  const hasTime = normalized.some(c =>
    c.includes('initiation time') || c.includes('heure d initiation') || c.includes('heure de fin')
  );
  const hasStatus = normalized.some(c =>
    c.includes('transaction status') || c.includes('statut de la transaction')
  );

  if (hasOrg && hasReceipt) score += 25;
  if (hasTime && hasStatus) score += 20;
  if (hasOrg && hasReceipt && hasTime && hasStatus) score += 40;

  return score;
}

/** Détecte l'index de la ligne d'en-tête d'un rapport marchand (Moov / Orange, FR ou EN). */
export function detectMerchantReportHeaderIndex(jsonData: any[][]): number | null {
  const scanLimit = Math.min(40, jsonData.length);
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < scanLimit; i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) {
      continue;
    }
    const cells = row.map(cell =>
      fixCellEncoding(cell !== null && cell !== undefined ? String(cell).trim() : '')
    );
    const score = scoreMerchantReportHeaderRow(cells);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 40 ? bestIndex : null;
}

function pickPreferredBilingualColumn(
  candidates: string[],
  preferredHeaders: string[] = []
): string {
  if (!candidates.length) {
    return '';
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const preferredSet = new Set(preferredHeaders);
  const preferredNorm = new Set(preferredHeaders.map(h => normalizeHeaderForMatch(h)));

  for (const col of candidates) {
    if (preferredSet.has(col)) {
      return col;
    }
  }
  for (const col of candidates) {
    if (preferredNorm.has(normalizeHeaderForMatch(col))) {
      return col;
    }
  }

  const canonicalId = resolveCanonicalColumnId(candidates[0]);
  if (canonicalId) {
    const fr = getCanonicalFrenchLabel(canonicalId);
    if (fr) {
      const frMatch = candidates.find(
        col => normalizeHeaderForMatch(col) === normalizeHeaderForMatch(fr)
      );
      if (frMatch) {
        return frMatch;
      }
      return fr;
    }
  }

  return candidates[0];
}

function groupHeadersByCanonicalId(headers: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const rawKeyFor = (key: string) => `__raw__:${normalizeHeaderForMatch(key)}`;
  for (const key of headers) {
    const id = resolveCanonicalColumnId(key) || rawKeyFor(key);
    const group = groups.get(id) || [];
    group.push(key);
    groups.set(id, group);
  }

  // Un id canonique approximatif (sous-chaîne) ne doit pas fusionner des colonnes
  // distinctes : « Balance before » et « Balance after » ne sont pas des traductions.
  // Si plusieurs en-têtes non reconnus exactement partagent un id, on les sépare.
  const exactIndex = getNormalizedHeaderIndex();
  for (const [id, keys] of [...groups.entries()]) {
    if (id.startsWith('__raw__:')) continue;
    const approximate = keys.filter(k => !exactIndex.get(normalizeHeaderForMatch(k)));
    const distinctApprox = new Set(approximate.map(k => normalizeHeaderForMatch(k)));
    if (approximate.length < 2 || distinctApprox.size < 2) continue;
    groups.set(id, keys.filter(k => !approximate.includes(k)));
    if (groups.get(id)!.length === 0) groups.delete(id);
    for (const k of approximate) {
      groups.set(rawKeyFor(k), [...(groups.get(rawKeyFor(k)) || []), k]);
    }
  }
  return groups;
}

/**
 * Retire les doublons FR/EN dans une liste de colonnes (une seule colonne par concept).
 */
export function dedupeBilingualColumnNames(
  columns: string[],
  preferredHeaders: string[] = []
): string[] {
  if (!columns.length) {
    return [];
  }

  const groups = groupHeadersByCanonicalId(columns);
  const orderSource = preferredHeaders.length
    ? [...preferredHeaders, ...columns.filter(col => !preferredHeaders.includes(col))]
    : columns;

  const groupIdByKey = new Map<string, string>();
  for (const [id, keys] of groups) {
    for (const k of keys) groupIdByKey.set(k, id);
  }

  const orderedIds: string[] = [];
  const seenIds = new Set<string>();
  for (const col of orderSource) {
    const id = groupIdByKey.get(col) || resolveCanonicalColumnId(col) || `__raw__:${normalizeHeaderForMatch(col)}`;
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }
  for (const id of groups.keys()) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }

  const result: string[] = [];
  const seenNames = new Set<string>();
  for (const id of orderedIds) {
    const picked = pickPreferredBilingualColumn(groups.get(id) || [], preferredHeaders);
    if (picked && !seenNames.has(picked)) {
      seenNames.add(picked);
      result.push(picked);
    }
  }
  return result;
}

/**
 * Fusionne les colonnes FR/EN jumelées : une valeur et un libellé par concept canonique.
 */
export function mergeBilingualColumnsInRows(
  rows: Record<string, string>[],
  preferredHeaders: string[] = []
): { rows: Record<string, string>[]; columns: string[] } {
  if (!rows.length) {
    return { rows: [], columns: [] };
  }

  const allHeaders = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allHeaders.add(key);
    }
  }

  const groups = groupHeadersByCanonicalId([...allHeaders]);
  const columns = dedupeBilingualColumnNames([...allHeaders], preferredHeaders);

  const mergedRows = rows.map(row => {
    const merged: Record<string, string> = {};
    for (const [id, keys] of groups) {
      const outputKey = pickPreferredBilingualColumn(keys, preferredHeaders);
      if (!outputKey) {
        continue;
      }
      let value = '';
      for (const key of keys) {
        const cell = row[key];
        if (cell != null && String(cell).trim() !== '') {
          value = String(cell).trim();
          break;
        }
      }
      merged[outputKey] = value;
    }
    return merged;
  });

  const orderedColumns = columns.length
    ? columns
    : Object.keys(mergedRows[0] || {});

  const orderedRows = mergedRows.map(row => {
    const ordered: Record<string, string> = {};
    for (const col of orderedColumns) {
      ordered[col] = row[col] ?? '';
    }
    return ordered;
  });

  return { rows: orderedRows, columns: orderedColumns };
}

/**
 * Sans modèle : choisit UNE langue pour le lot (anglais ou français) à partir des
 * en-têtes d'origine, puis retourne la liste d'en-têtes à garder. Un même concept
 * n'apparaît qu'une fois, sous son libellé de la langue choisie.
 */
export function chooseBatchHeaderSet(keys: string[], forcedLanguage?: 'en' | 'fr'): string[] {
  const enLabels = new Set<string>();
  const frLabels = new Set<string>();
  const defs = [
    ...MERCHANT_REPORT_COLUMNS,
    ...ORANGE_MONEY_COLUMN_DEFINITIONS,
    ...BANKING_COLUMN_DEFINITIONS
  ];
  for (const def of defs) {
    enLabels.add(normalizeHeaderForMatch(def.en));
    frLabels.add(normalizeHeaderForMatch(def.fr));
  }
  const isEn = (k: string) => {
    const n = normalizeHeaderForMatch(k);
    return enLabels.has(n) && !frLabels.has(n);
  };
  const isFr = (k: string) => {
    const n = normalizeHeaderForMatch(k);
    return frLabels.has(n) && !enLabels.has(n);
  };

  const unique = [...new Set(keys.map(k => (k || '').trim()).filter(Boolean))];
  const enCount = unique.filter(isEn).length;
  const frCount = unique.filter(isFr).length;
  // Langue imposée par l'utilisateur (fichiers multilingues), sinon la plus fréquente.
  const winner: 'en' | 'fr' = forcedLanguage ?? (enCount > frCount ? 'en' : 'fr');

  const byId = new Map<string, string[]>();
  const result: string[] = [];
  for (const key of unique) {
    const id = resolveCanonicalColumnId(key);
    if (!id) {
      result.push(key);
      continue;
    }
    if (!byId.has(id)) {
      byId.set(id, []);
      result.push(`\u0000${id}`);
    }
    byId.get(id)!.push(key);
  }
  return result.map(entry => {
    if (!entry.startsWith('\u0000')) {
      return entry;
    }
    const candidates = byId.get(entry.slice(1)) || [];
    const preferred = candidates.find(k => (winner === 'en' ? isEn(k) : isFr(k)));
    if (preferred) {
      return preferred;
    }
    // Langue imposée absente du fichier pour ce concept : libellé canonique de cette langue.
    if (forcedLanguage) {
      const canonical = forcedLanguage === 'fr'
        ? getCanonicalFrenchLabel(entry.slice(1))
        : getCanonicalEnglishLabel(entry.slice(1));
      if (canonical) {
        return canonical;
      }
    }
    return candidates[0];
  });
}

/** Libellé anglais canonique d'une colonne (même référentiel que getCanonicalFrenchLabel). */
export function getCanonicalEnglishLabel(columnId: string): string | null {
  const merchantDef = MERCHANT_REPORT_COLUMNS.find(d => d.id === columnId);
  if (merchantDef) {
    return merchantDef.en;
  }
  const orangeMoneyDef = ORANGE_MONEY_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  if (orangeMoneyDef) {
    return orangeMoneyDef.en;
  }
  const bankingDef = BANKING_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  return bankingDef?.en ?? null;
}
