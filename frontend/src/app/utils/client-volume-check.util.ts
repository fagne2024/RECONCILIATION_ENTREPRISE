import { isMsisdnPreserveColumn } from './text-cell.util';

/**
 * Contrôle du volume par client (numéro de téléphone) au chargement d'un fichier BO / partenaire.
 *
 * Règle : un numéro est listé s'il apparaît STRICTEMENT plus de `minOccurrences` fois
 * (par défaut 3, donc au moins 4 lignes) ET que son volume cumulé est SUPÉRIEUR OU ÉGAL
 * à `minVolume` (par défaut 400 000). Le volume est la somme des montants
 * en valeur absolue (les fichiers partenaires portent souvent des débits négatifs).
 */
export interface ClientVolumeCheckOptions {
    minOccurrences: number;
    minVolume: number;
}

export const DEFAULT_CLIENT_VOLUME_CHECK_OPTIONS: ClientVolumeCheckOptions = {
    minOccurrences: 3,
    minVolume: 400000
};

export interface ClientVolumeEntry {
    phone: string;
    occurrences: number;
    volume: number;
    /** Services utilisés par le numéro (valeurs distinctes, ordre de première apparition). */
    services: string[];
}

export interface ClientVolumeCheckResult {
    entries: ClientVolumeEntry[];
    analyzedRows: number;
    /** Lignes ignorées faute de numéro exploitable. */
    skippedRows: number;
    distinctPhones: number;
}

/**
 * Parse un montant tolérant les formats « 1 000,50 », « 1.000,50 », « 1,000.50 », « 1000 FCFA ».
 * Retourne 0 si la valeur n'est pas exploitable.
 */
export function parseFlexibleAmount(raw: unknown): number {
    if (raw === null || raw === undefined) {
        return 0;
    }
    if (typeof raw === 'number') {
        return isFinite(raw) ? raw : 0;
    }
    let s = String(raw).replace(/[\s  ]/g, '').replace(/[^0-9,.\-]/g, '');
    if (!s || !/\d/.test(s)) {
        return 0;
    }
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        // Le dernier séparateur est le séparateur décimal, l'autre sépare les milliers.
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (lastComma >= 0) {
        // « 1,000,000 » ou « 1,000 » (3 chiffres après chaque virgule) = milliers ; sinon décimale.
        s = /^-?\d{1,3}(,\d{3})+$/.test(s) && (s.match(/,/g) || []).length > 1
            ? s.replace(/,/g, '')
            : s.replace(',', '.');
    } else if (lastDot >= 0 && (s.match(/\./g) || []).length > 1) {
        // « 1.000.000 » : points de milliers.
        s = s.replace(/\./g, '');
    }
    const value = parseFloat(s);
    return isNaN(value) ? 0 : value;
}

/** Normalise un numéro : ne garde que les chiffres (espaces, +, tirets, apostrophes Excel retirés). */
export function normalizePhone(raw: unknown): string {
    if (raw === null || raw === undefined) {
        return '';
    }
    return String(raw).replace(/\D/g, '');
}

export function computeClientVolumes(
    rows: Record<string, unknown>[],
    phoneColumn: string,
    amountColumn: string,
    options: ClientVolumeCheckOptions = DEFAULT_CLIENT_VOLUME_CHECK_OPTIONS,
    serviceColumn?: string | null,
    /**
     * Si renseigné (avec `serviceColumn`), seules les transactions de ce service sont prises
     * en compte : nombre de transactions, volume et règle sont calculés pour ce service uniquement.
     */
    onlyService?: string | null
): ClientVolumeCheckResult {
    const byPhone = new Map<string, { occurrences: number; volume: number; services: Set<string> }>();
    let skippedRows = 0;
    let analyzedRows = 0;
    const list = rows || [];
    const serviceFilter = serviceColumn && onlyService ? onlyService : null;

    for (const row of list) {
        if (serviceFilter && String((row && row[serviceColumn!]) ?? '').trim() !== serviceFilter) {
            continue;
        }
        analyzedRows++;
        const phone = normalizePhone(row ? row[phoneColumn] : null);
        if (!phone) {
            skippedRows++;
            continue;
        }
        const amount = Math.abs(parseFlexibleAmount(row[amountColumn]));
        let acc = byPhone.get(phone);
        if (acc) {
            acc.occurrences++;
            acc.volume += amount;
        } else {
            acc = { occurrences: 1, volume: amount, services: new Set<string>() };
            byPhone.set(phone, acc);
        }
        if (serviceColumn) {
            const service = String(row[serviceColumn] ?? '').trim();
            if (service) {
                acc.services.add(service);
            }
        }
    }

    const entries: ClientVolumeEntry[] = [];
    byPhone.forEach((acc, phone) => {
        if (acc.occurrences > options.minOccurrences && acc.volume >= options.minVolume) {
            entries.push({
                phone,
                occurrences: acc.occurrences,
                volume: Math.round(acc.volume * 100) / 100,
                services: Array.from(acc.services)
            });
        }
    });
    entries.sort((a, b) => b.volume - a.volume || b.occurrences - a.occurrences);

    return { entries, analyzedRows, skippedRows, distinctPhones: byPhone.size };
}

/** Propose une colonne téléphone par défaut (msisdn, phone, tel, numero…). */
export function guessPhoneColumn(columns: string[]): string {
    const byName = columns.find(c => /num[eé]ro|n[°o]\s*t[eé]l|msisdn|t[eé]l[eé]phone|phone|mobile/i.test(c));
    return byName || columns.find(c => isMsisdnPreserveColumn(c)) || '';
}

/** Propose une colonne montant par défaut (montant, amount…). */
export function guessAmountColumn(columns: string[]): string {
    return columns.find(c => /montant|amount/i.test(c))
        || columns.find(c => /valeur|value|volume|somme|total/i.test(c))
        || '';
}

/** Propose une colonne service par défaut (service, type…), facultative. */
export function guessServiceColumn(columns: string[]): string {
    return columns.find(c => /service/i.test(c))
        || columns.find(c => /^(type|produit|product|op[eé]ration)/i.test(c.trim()))
        || '';
}

export type ClientVolumeSortKey = 'phone' | 'occurrences' | 'volume' | 'services';
export type SortDirection = 'asc' | 'desc';

/** Services distincts présents dans les résultats (triés alphabétiquement), pour le filtre. */
export function collectEntryServices(entries: ClientVolumeEntry[]): string[] {
    const set = new Set<string>();
    entries.forEach(e => e.services.forEach(s => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

/**
 * Filtre les numéros ayant utilisé `service` (vide = tous) puis trie selon la colonne demandée.
 * Le tri par numéro est numérique quand c'est possible ; en cas d'égalité, le volume départage.
 */
export function filterAndSortClientVolumes(
    entries: ClientVolumeEntry[],
    service: string,
    sortKey: ClientVolumeSortKey,
    direction: SortDirection
): ClientVolumeEntry[] {
    const filtered = service ? entries.filter(e => e.services.includes(service)) : entries.slice();
    const factor = direction === 'asc' ? 1 : -1;
    const compare = (a: ClientVolumeEntry, b: ClientVolumeEntry): number => {
        switch (sortKey) {
            case 'phone':
                return a.phone.localeCompare(b.phone, undefined, { numeric: true });
            case 'occurrences':
                return a.occurrences - b.occurrences;
            case 'services':
                return a.services.join(', ').localeCompare(b.services.join(', '), 'fr', { sensitivity: 'base' });
            default:
                return a.volume - b.volume;
        }
    };
    return filtered.sort((a, b) => (compare(a, b) || (a.volume - b.volume)) * factor);
}
