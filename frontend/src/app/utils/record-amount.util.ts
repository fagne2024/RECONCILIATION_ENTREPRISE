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

/** Parse un montant (espaces, virgule décimale). */
export function parseAmountValue(raw: unknown): number {
    if (raw === null || raw === undefined || raw === '') {
        return 0;
    }
    const normalized = String(raw).replace(/\s/g, '').replace(',', '.');
    const value = parseFloat(normalized);
    return isNaN(value) ? 0 : value;
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
