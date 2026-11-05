import { fixGarbledCharacters } from './encoding-fixer';

/**
 * Détection et normalisation des champs « métier » d'un enregistrement
 * partenaire, quel que soit le libellé de colonne du fichier source.
 *
 * Les modèles partenaires n'utilisent pas les mêmes entêtes ("Transaction ID",
 * "Numéro Trans GU", "Sender Msisdn", "Transaction Amount", "Horodatage"...).
 * Ces helpers sont partagés par /ecart-partner (saisie de l'ID Annulation) et
 * /suivi-trx-a-annuler (rapprochement automatique Téléphone + Montant +
 * Transaction ID).
 */
export type PartnerField =
  | 'Transaction ID'
  | 'Date'
  | 'Montant'
  | 'Telephone'
  | 'ID Annulation';

export interface PartnerFields {
  transactionId: string;
  date: string;
  montant: string;
  telephone: string;
  idAnnulation: string;
}

export const EMPTY_PARTNER_FIELDS: PartnerFields = {
  transactionId: '',
  date: '',
  montant: '',
  telephone: '',
  idAnnulation: ''
};

/** Libellé de colonne normalisé : minuscules, sans accents ni ponctuation. */
export function normalizePartnerLabel(value: string): string {
  return fixGarbledCharacters(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Score de pertinence d'une colonne pour un champ donné.
 * 0 = colonne non pertinente ; plus le score est élevé, plus la valeur est fiable.
 */
export function scorePartnerField(field: PartnerField, normalizedKey: string): number {
  const key = normalizedKey || '';
  const includesAny = (tokens: string[]): boolean => tokens.some(token => key.includes(token));

  switch (field) {
    case 'Transaction ID':
      if (includesAny(['annulation', 'cancel'])) return 0;
      if (key === 'transactionid' || key === 'idtransaction') return 100;
      if (includesAny(['numerotransgu', 'numerotransaction', 'numerodetransaction', 'numerotrans'])) return 92;
      if (key === 'externaltransactionid' || key === 'externaltransactionreference') return 90;
      if (key.includes('transaction') && includesAny(['id', 'ref', 'numero', 'number'])) return 85;
      if (['id', 'reference', 'ref', 'referencenumber', 'refnum', 'tracenumber'].includes(key)) return 60;
      if (includesAny(['rrn', 'traceid', 'transid'])) return 45;
      return 0;

    case 'Date':
      if (includesAny(['dateannulation', 'datecreation', 'datemodification', 'dateimport'])) return 0;
      if (includesAny(['datetransaction', 'transactiondate'])) return 100;
      if (key.includes('horodatage')) return 95;
      if (includesAny(['operdate', 'dateoperation', 'operationdate', 'dateop'])) return 90;
      if (includesAny(['requestdate', 'completiontime', 'initiationtime', 'postingdate'])) return 85;
      if (key === 'date') return 80;
      if (key.includes('date') || key.includes('time')) return 60;
      if (key.includes('jour')) return 40;
      return 0;

    case 'Montant':
      // Les frais, commissions, taxes et soldes ne sont pas le montant de la transaction.
      if (includesAny(['fee', 'frais', 'commission', 'tax', 'charge', 'balance', 'solde'])) return 0;
      if (includesAny(['transactionamount', 'montanttransaction'])) return 100;
      if (['amount', 'montant', 'mnt', 'valeur'].includes(key)) return 95;
      if (includesAny(['amount', 'montant', 'valeur'])) return 85;
      if (key.includes('paidin')) return 75;
      if (key.includes('withdrawn') || key.includes('withdrawal')) return 70;
      if (key.includes('total')) return 50;
      return 0;

    case 'Telephone':
      if (includesAny(['account', 'compte', 'iban', 'wallet', 'transactionid'])) return 0;
      if (includesAny([
        'payermobilenumber', 'sendermsisdn', 'sendermobilenumber', 'senderphone',
        'payerphone', 'initiatormsisdn', 'initiatormobilenumber', 'initiatorphone'
      ])) return 100;
      if (includesAny([
        'receivermsisdn', 'receivermobilenumber', 'receiverphonenumber', 'payeemobilenumber',
        'payeemsisdn', 'beneficiaryphone', 'beneficiarymobilenumber'
      ])) return 90;
      if (includesAny(['msisdn', 'mobilenumber', 'phonenumber'])) return 85;
      if (['telephone', 'phone', 'mobile', 'tel'].includes(key)) return 80;
      if (includesAny(['telephone', 'phone', 'gsm'])) return 70;
      if (key.includes('oppositeparty')) return 30;
      return 0;

    case 'ID Annulation':
      if (key === 'idannulation' || key === 'annulationid') return 100;
      if (includesAny(['idannul', 'annulationid', 'numeroannulation', 'referenceannulation'])) return 90;
      if (key.includes('annulation') && includesAny(['id', 'numero', 'reference', 'ref'])) return 80;
      return 0;
  }
}

/**
 * Extrait les champs métier d'un ou plusieurs enregistrements partenaires.
 * La valeur la mieux notée l'emporte ; les enregistrements sont parcourus dans
 * l'ordre fourni (partnerData puis partnerDataList par exemple).
 */
export function extractPartnerFields(
  records: ReadonlyArray<Record<string, any> | null | undefined>
): PartnerFields {
  const fields: PartnerFields = { ...EMPTY_PARTNER_FIELDS };
  const scores: Record<PartnerField, number> = {
    'Transaction ID': 0,
    'Date': 0,
    'Montant': 0,
    'Telephone': 0,
    'ID Annulation': 0
  };

  const targets: PartnerField[] = ['Transaction ID', 'Date', 'Montant', 'Telephone', 'ID Annulation'];

  for (const record of records) {
    if (!record) {
      continue;
    }
    for (const rawKey of Object.keys(record)) {
      const rawValue = record[rawKey];
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        continue;
      }
      const normalizedKey = normalizePartnerLabel(rawKey);
      if (!normalizedKey) {
        continue;
      }
      for (const field of targets) {
        const score = scorePartnerField(field, normalizedKey);
        if (score > scores[field]) {
          const value = String(rawValue).trim();
          if (!value) {
            continue;
          }
          scores[field] = score;
          switch (field) {
            case 'Transaction ID':
              fields.transactionId = value;
              break;
            case 'Date':
              fields.date = value;
              break;
            case 'Montant':
              fields.montant = value;
              break;
            case 'Telephone':
              fields.telephone = value;
              break;
            case 'ID Annulation':
              fields.idAnnulation = value;
              break;
          }
        }
      }
    }
  }

  return fields;
}

/** Identifiant de transaction compact (sans espaces, séparateurs ni casse). */
export function normalizePartnerTransactionId(value: string | null | undefined): string {
  return normalizePartnerLabel(value || '');
}

/** Téléphone réduit aux chiffres (les préfixes internationaux restent inclus). */
export function normalizePartnerPhone(value: string | null | undefined): string {
  return fixGarbledCharacters(value || '').replace(/\D+/g, '');
}

/**
 * Clé de rapprochement téléphonique : les 9 derniers chiffres, afin de tolerer
 * les prefixes internationaux et les zeros de tete ("0712345678" vs
 * "+225 07 12 34 56 78").
 */
export function partnerPhoneKey(value: string | null | undefined): string {
  const digits = normalizePartnerPhone(value);
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/**
 * Montant normalisé en chaîne à 2 décimales.
 * Gère "1 000,50", "1,000.50", "1000.5", "500"...
 * Retourne '' si aucune valeur numérique exploitable.
 */
export function normalizePartnerAmount(value: string | null | undefined): string {
  const parsed = parsePartnerAmount(value);
  return parsed === null ? '' : parsed.toFixed(2);
}

export function parsePartnerAmount(value: string | null | undefined): number | null {
  let text = fixGarbledCharacters(value || '').replace(/[^\d,.\-]/g, '').trim();
  if (!text || !/\d/.test(text)) {
    return null;
  }

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // 1.000,50 -> 1000.50
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,000.50 -> 1000.50
      text = text.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    text = decimals > 0 && decimals <= 2
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (lastDot >= 0) {
    // « 1.000 » / « 1.234.567 » : séparateurs de milliers sans décimales.
    const dotCount = (text.match(/\./g) || []).length;
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function partnerTransactionIdsMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizePartnerTransactionId(left);
  const b = normalizePartnerTransactionId(right);
  return !!a && !!b && a === b;
}

export function partnerPhonesMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizePartnerPhone(left);
  const b = normalizePartnerPhone(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 8 && longer.endsWith(shorter);
}

export function partnerAmountsMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = parsePartnerAmount(left);
  const b = parsePartnerAmount(right);
  return a !== null && b !== null && Math.abs(a - b) <= 0.01;
}

/**
 * Score de correspondance entre une ligne de suivi et un enregistrement
 * partenaire : Transaction ID prioritaire, puis Téléphone + Montant, puis
 * Téléphone seul. 0 = aucune correspondance exploitable.
 */
export function partnerMatchScore(left: PartnerFields, right: PartnerFields): number {
  if (partnerTransactionIdsMatch(left.transactionId, right.transactionId)) {
    return 100;
  }
  const phoneMatch = partnerPhonesMatch(left.telephone, right.telephone);
  const amountMatch = partnerAmountsMatch(left.montant, right.montant);
  if (phoneMatch && amountMatch) {
    return 80;
  }
  if (amountMatch && !left.telephone && !right.telephone) {
    return 55;
  }
  if (phoneMatch) {
    return 40;
  }
  return 0;
}
