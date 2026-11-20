/**
 * Utilitaires pour formater les dates issues de fichiers Excel (numéros de série)
 * en chaînes lisibles DD/MM/YYYY HH:MM.
 */

/** Colonne dont le nom évoque une date/heure */
export function isDateColumnName(columnName: string): boolean {
    const lower = (columnName || '').toLowerCase().trim();
    if (!lower) return false;
    if (/date|heure|time|timestamp|datetime/.test(lower)) {
        if (/update|updated|maj/.test(lower) && !/op/.test(lower)) return false;
        return true;
    }
    return false;
}

/** Valeur numérique type numéro de série Excel (date + éventuellement l'heure) */
export function isExcelSerialDateValue(val: unknown): boolean {
    if (val instanceof Date) return true;
    let n: number;
    if (typeof val === 'number') {
        n = val;
    } else if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!/^\d+(\.\d+)?$/.test(trimmed)) return false;
        n = parseFloat(trimmed);
    } else {
        return false;
    }
    return !isNaN(n) && n >= 20000 && n < 1000000;
}

/** Convertit un numéro de série Excel en Date JavaScript (fuseau local) */
export function excelSerialToJsDate(serial: number): Date {
    const wholeDays = Math.floor(serial);
    const fraction = serial - wholeDays;
    // 25569 = jours entre 1899-12-30 et 1970-01-01 (convention Excel / ECMA)
    const utcMs = (wholeDays - 25569) * 86400000 + Math.round(fraction * 86400000);
    return new Date(utcMs);
}

function formatJsDate(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    if (h === 0 && m === 0 && s === 0) {
        return `${day}/${month}/${year}`;
    }
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    if (s === 0) {
        return `${day}/${month}/${year} ${hh}:${mm}`;
    }
    const ss = String(s).padStart(2, '0');
    return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
}

/**
 * Formate une valeur de cellule date (texte, Date, ou numéro de série Excel).
 */
export function formatSpreadsheetDateValue(val: unknown): string {
    if (val === undefined || val === null || val === '') return '';

    if (val instanceof Date && !isNaN(val.getTime())) {
        return formatJsDate(val);
    }

    const str = String(val).trim();
    if (!str) return '';

    // Déjà au format français DD/MM/YYYY [HH:MM[:SS]]
    if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(str)) {
        return str;
    }

    if (isExcelSerialDateValue(val)) {
        const serial = typeof val === 'number' ? val : parseFloat(str);
        return formatJsDate(excelSerialToJsDate(serial));
    }

    // ISO ou autre format parseable
    if (str.includes('-') || str.includes('T') || /\d{4}/.test(str)) {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            return formatJsDate(parsed);
        }
    }

    return str;
}

/**
 * Formate une cellule selon le nom de colonne (dates → texte lisible).
 */
export function formatSpreadsheetCellValue(columnName: string, value: unknown): unknown {
    if (value === undefined || value === null || value === '') return '';
    if (isDateColumnName(columnName)) {
        return formatSpreadsheetDateValue(value);
    }
    return value;
}

/** Normalise les champs date d'un enregistrement (réconciliation / export). */
export function normalizeRecordDateFields<T extends Record<string, unknown>>(record: T): T {
    if (!record) return record;
    const out = { ...record } as T;
    for (const key of Object.keys(out)) {
        if (isDateColumnName(key)) {
            const formatted = formatSpreadsheetDateValue(out[key]);
            (out as Record<string, unknown>)[key] = formatted;
        }
    }
    return out;
}

/**
 * Comme normalizeRecordDateFields, mais modifie l'enregistrement sur place (aucune copie) :
 * pour les gros résultats dont les lignes appartiennent déjà à l'écran (réconciliation magique).
 */
export function normalizeRecordDateFieldsInPlace(record: Record<string, unknown> | null | undefined): void {
    if (!record) return;
    for (const key of Object.keys(record)) {
        if (isDateColumnName(key)) {
            record[key] = formatSpreadsheetDateValue(record[key]);
        }
    }
}

export function normalizeRecordsDateFields<T extends Record<string, unknown>>(records: T[] | undefined | null): T[] {
    if (!records?.length) return records || [];
    return records.map(r => normalizeRecordDateFields(r));
}

/** Date/heure au format unique du fichier produit : AAAA-MM-JJ HH:MM:SS. */
export const OUTPUT_DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

const pad2 = (n: number | string) => String(n).padStart(2, '0');

function isoFromParts(y: string | number, mo: string | number, d: string | number,
                      h: string | number = 0, mi: string | number = 0, s: string | number = 0): string | null {
    const year = Number(y), month = Number(mo), day = Number(d);
    const hour = Number(h), minute = Number(mi), second = Number(s);
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59 && second <= 59)) {
        return null;
    }
    return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

const JS_DATE_MONTHS: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

/**
 * Convertit une valeur de date au format AAAA-MM-JJ HH:MM:SS (ex. 2026-11-19 23:59:59).
 * Tout ce qui suit les secondes (millisecondes, fuseau, texte) est ignoré. Une date sans heure
 * reçoit 00:00:00 ; une heure seule (Excel 1899-12-30) reste HH:MM:SS. Valeur non reconnue :
 * renvoyée telle quelle. Les dates jj/mm/aaaa sont lues au format français (jour d'abord).
 */
export function formatOutputDateTime(val: unknown): unknown {
    if (val === undefined || val === null || val === '') return val;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return val;
        if (val.getFullYear() === 1899 && val.getMonth() === 11 && val.getDate() >= 30) {
            return `${pad2(val.getHours())}:${pad2(val.getMinutes())}:${pad2(val.getSeconds())}`;
        }
        return isoFromParts(val.getFullYear(), val.getMonth() + 1, val.getDate(),
            val.getHours(), val.getMinutes(), val.getSeconds()) ?? val;
    }
    if (typeof val === 'number' && !isExcelSerialDateValue(val)) return val;
    const str = String(val).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
    if (m) return isoFromParts(m[1], m[2], m[3], m[4] ?? 0, m[5] ?? 0, m[6] ?? 0) ?? val;
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
    if (m) return isoFromParts(m[3], m[2], m[1], m[4] ?? 0, m[5] ?? 0, m[6] ?? 0) ?? val;
    // Date JS en texte : « Thu Nov 19 2026 23:53:00 GMT+0000 (…) »
    m = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(str);
    if (m && JS_DATE_MONTHS[m[1]]) return isoFromParts(m[3], JS_DATE_MONTHS[m[1]], m[2], m[4], m[5], m[6]) ?? val;
    if (isExcelSerialDateValue(str)) {
        return formatOutputDateTime(excelSerialToJsDate(parseFloat(str)));
    }
    return val;
}
