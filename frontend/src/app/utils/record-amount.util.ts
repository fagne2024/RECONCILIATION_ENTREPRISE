const AMOUNT_KEY_FRAGMENTS = [
    'amount',
    'montant',
    'debit',
    'credit',
    'crédit',
    'débit',
    'valeur',
    'value',
    'volume',
    'somme',
    'sum',
    'total',
    'balance',
    'prix',
    'price'
];

/**
 * Convertit un montant texte en nombre.
 * Gère « 1 000,50 », « 1.000,50 », « 1,000.50 », « -2,531,000 » (virgules = milliers)
 * et « -195,000 » (groupe « ,000 » = milliers, les zéros ne sont pas perdus).
 * `groupedThousands` : un groupe de exactement 3 chiffres après un séparateur est toujours
 * un séparateur de milliers (ex. « 12,500 » = 12500) — utile pour les montants bancaires sans décimales.
 * Retourne null si la valeur n'est pas un nombre.
 */
export function tryParseAmount(raw: unknown, options: { groupedThousands?: boolean } = {}): number | null {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }
    if (raw === null || raw === undefined) {
        return null;
    }
    let s = String(raw).replace(/[\s  ']/g, '').replace(/[^0-9,.+\-]/g, '');
    if (!s || !/\d/.test(s)) {
        return null;
    }
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const isGrouped = (sep: string): boolean =>
        new RegExp(`^[-+]?\\d{1,3}(\\${sep}\\d{3})+$`).test(s);
    const count = (sep: string): number => s.split(sep).length - 1;

    if (lastComma >= 0 && lastDot >= 0) {
        // Le dernier séparateur est le séparateur décimal, l'autre sépare les milliers.
        s = lastComma > lastDot
            ? s.replace(/\./g, '').replace(',', '.')
            : s.replace(/,/g, '');
    } else if (lastComma >= 0) {
        const lone = count(',') === 1;
        const zerosGroup = lone && /,000$/.test(s);
        s = isGrouped(',') && (!lone || zerosGroup || options.groupedThousands)
            ? s.replace(/,/g, '')
            : s.replace(',', '.');
    } else if (lastDot >= 0) {
        const lone = count('.') === 1;
        if (isGrouped('.') && (!lone || options.groupedThousands)) {
            s = s.replace(/\./g, '');
        }
    }
    const value = Number(s);
    return Number.isFinite(value) ? value : null;
}

/** Parse un montant (espaces, séparateurs de milliers et virgule décimale). 0 si non numérique. */
export function parseAmountValue(raw: unknown): number {
    if (raw === '') {
        return 0;
    }
    return tryParseAmount(raw) ?? 0;
}

/**
 * Extrait le montant d'une ligne (colonne AMOUNT, Montant, crédit/débit, etc.).
 * Somme en valeur absolue si plusieurs colonnes montant coexistent.
 */
export function extractRecordAmount(
    record: Record<string, string> | null | undefined,
    options: { absolute?: boolean } = {}
): number {
    if (!record) {
        return 0;
    }

    const useAbsolute = options.absolute !== false;
    let total = 0;
    let found = false;

    for (const key of Object.keys(record)) {
        const lowerKey = key.toLowerCase();
        if (!AMOUNT_KEY_FRAGMENTS.some(fragment => lowerKey.includes(fragment))) {
            continue;
        }
        const value = parseAmountValue(record[key]);
        if (value === 0) {
            continue;
        }
        total += useAbsolute ? Math.abs(value) : value;
        found = true;
    }

    if (found) {
        return total;
    }

    for (const key of ['AMOUNT', 'Amount', 'amount', 'Montant', 'montant', 'MONTANT']) {
        if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
            const value = parseAmountValue(record[key]);
            return useAbsolute ? Math.abs(value) : value;
        }
    }

    return 0;
}

/** Colonnes de montant qui ne sont pas le montant de la transaction (soldes, frais, taxes). */
const NON_TRANSACTION_AMOUNT_FRAGMENTS = [
    'balance', 'solde', 'previous', 'post', 'avant', 'apres', 'après',
    'fee', 'frais', 'commission', 'charge', 'tax', 'taxe', 'tva'
];

function normalizeAmountHeader(header: string): string {
    return (header || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function isNonTransactionAmountHeader(header: string): boolean {
    const lower = normalizeAmountHeader(header);
    return NON_TRANSACTION_AMOUNT_FRAGMENTS.some(fragment => lower.includes(normalizeAmountHeader(fragment)));
}

/**
 * Colonne(s) portant le montant de la transaction parmi les en-têtes d'un résultat :
 * - une colonne « montant » / « amount » (le nom exact d'abord, puis « montant transaction »…) ;
 * - à défaut, le couple débit / crédit (relevés : une seule des deux renseignée par ligne) ;
 * - à défaut, une colonne valeur / somme / total.
 * Les soldes (avant / après), frais, commissions et taxes ne sont jamais retenus : les sommer
 * gonflerait le volume (ex. « Previous Balance », « Post Balance » d'un fichier partenaire).
 */
export function findTransactionAmountColumns(headers: readonly string[]): string[] {
    const candidates = headers.filter(h => !!h && !isNonTransactionAmountHeader(h));
    const lower = (h: string) => normalizeAmountHeader(h);

    const amountColumns = candidates.filter(h => lower(h).includes('montant') || lower(h).includes('amount'));
    if (amountColumns.length) {
        const exact = amountColumns.find(h => ['montant', 'amount'].includes(lower(h)));
        const transaction = amountColumns.find(h => lower(h).includes('transaction') || lower(h).includes('operation'));
        return [exact ?? transaction ?? amountColumns[0]];
    }

    const debit = candidates.find(h => lower(h).includes('debit'));
    const credit = candidates.find(h => lower(h).includes('credit'));
    if (debit || credit) {
        return [debit, credit].filter((h): h is string => !!h);
    }

    const other = candidates.find(h => ['valeur', 'value', 'somme', 'sum', 'total'].some(f => lower(h).includes(f)));
    return other ? [other] : [];
}

/** Montant de la transaction d'une ligne (valeur absolue), lu sur les colonnes retenues. */
export function transactionAmountOf(
    record: Record<string, string> | null | undefined,
    columns: readonly string[]
): number {
    if (!record || !columns.length) {
        return 0;
    }
    let total = 0;
    for (const column of columns) {
        total += Math.abs(parseAmountValue(record[column]));
    }
    return total;
}
