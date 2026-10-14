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

export function normalizeRecordsDateFields<T extends Record<string, unknown>>(records: T[] | undefined | null): T[] {
    if (!records?.length) return records || [];
    return records.map(r => normalizeRecordDateFields(r));
}
