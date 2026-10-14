import * as Papa from 'papaparse';
import { fixGarbledCharacters } from './encoding-fixer';
import {
  findHeaderRowIndexInGrid,
  findGdjHeaderLineIndexInCsvLines,
  looksLikeAirtelReportPreamble,
  looksLikeAirtelTransactionalHeader,
  looksLikeGdjReportPreamble,
  looksLikeGdjTransactionalHeader,
  scoreHeaderRowMatch
} from './model-header-detection.util';

export interface FastCsvReadResult {
    rows: Record<string, string>[];
    headerLine: number;
    removedLines: number;
}

export interface FastCsvReadOptions {
    /** Retire le préambule Airtel (User / Customer Transaction Report). Activé par défaut. */
    stripAirtelPreamble?: boolean;
    /** Colonnes attendues (fichier modèle watch-folder) pour localiser l'en-tête. */
    expectedHeaderColumns?: string[];
    /** Normalise les noms de colonnes (ex. normalizeColumnName + FR). */
    normalizeHeader?: (header: string, index: number) => string;
    /** Transforme la ligne d'en-tête complète avant lecture des données. */
    finalizeHeaders?: (headers: string[]) => string[];
    onProgress?: (processed: number, total: number) => void;
    yieldFn?: () => Promise<void>;
}

const WORKER_THRESHOLD_BYTES = 512 * 1024;
const YIELD_EVERY_ROWS = 1500;
const PROGRESS_EVERY_ROWS = 2500;

/** Détection de séparateur identique à /traitement (glisser-déposer). */
export function detectCsvDelimiter(csvContent: string): string {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        return ';';
    }

    const firstLine = lines[0];
    const secondLine = lines.length > 1 ? lines[1] : '';
    const delimiters = [',', ';', '\t', '|', ':'];
    const delimiterScores: Record<string, number> = {};

    delimiters.forEach(delimiter => {
        delimiterScores[delimiter] = firstLine.split(delimiter).length;
    });

    if (secondLine) {
        delimiters.forEach(delimiter => {
            const fields1 = firstLine.split(delimiter);
            const fields2 = secondLine.split(delimiter);
            if (Math.abs(fields1.length - fields2.length) <= 1) {
                delimiterScores[delimiter] += 10;
            }
        });
    }

    let bestDelimiter = ';';
    let bestScore = 0;
    Object.entries(delimiterScores).forEach(([delimiter, score]) => {
        if (score > bestScore) {
            bestScore = score;
            bestDelimiter = delimiter;
        }
    });

    return bestDelimiter;
}

export function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/** Préambule Airtel : ne garder que les lignes à partir de l'en-tête transactionnel. */
export function stripAirtelReportPreambleFromText(text: string): string {
    const lower = text.toLowerCase();
    const isAirtel =
        lower.includes('user_transaction_report') ||
        lower.includes('user transaction report') ||
        lower.includes('customer_transaction_report') ||
        lower.includes('customer transaction report') ||
        (lower.includes('selection criteria') && lower.includes('from date'));

    if (!isAirtel) {
        return text;
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i].toLowerCase();
        const hasTransactionId = line.includes('transaction id') || line.includes('transaction_id');
        const hasSerialOrSender =
            line.includes('s. no') ||
            line.includes('s.no') ||
            line.includes('record no') ||
            line.includes('record_no') ||
            line.includes('sender msisdn') ||
            line.includes('sender_msisdn') ||
            line.includes('payer mobile number');
        if (hasTransactionId && hasSerialOrSender) {
            return lines.slice(i).join('\n');
        }
    }

    return lines.length > 5 ? lines.slice(5).join('\n') : text;
}

function findAirtelCsvHeaderLineIndex(lines: string[]): number | null {
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (!line?.trim()) {
            continue;
        }
        const cells = line.split(/[,;\t|]/).map(cell => cell.trim());
        if (looksLikeAirtelTransactionalHeader(cells)) {
            return i;
        }
    }
    return null;
}

/** Évite le coût de fixGarbledCharacters sur les cellules ASCII simples. */
function maybeFixCell(text: string): string {
    if (!text) {
        return '';
    }
    if (!/[\u0080-\u00FF]|\uFFFD|ï¿½|Ã.|Â./.test(text)) {
        return text;
    }
    return fixGarbledCharacters(text);
}

function looksLikeAirtelPreamble(cells: string[]): boolean {
    return looksLikeAirtelReportPreamble(cells);
}

function looksLikeAirtelHeader(cells: string[]): boolean {
    return looksLikeAirtelTransactionalHeader(cells);
}

function tryResolveHeaderFromModelColumns(
    cells: string[],
    options: FastCsvReadOptions
): string[] | null {
    if (!options.expectedHeaderColumns?.length) {
        return null;
    }
    return scoreHeaderRowMatch(cells, options.expectedHeaderColumns) > 0
        ? finalizeHeaderRow(cells, options)
        : null;
}

function estimateRowCount(fileSizeBytes: number): number {
    return Math.max(1, Math.floor(fileSizeBytes / 130));
}

function finalizeHeaderRow(
    rawHeaders: string[],
    options: FastCsvReadOptions
): string[] {
    let headers = rawHeaders.map((header, index) => {
        const cleaned = maybeFixCell(header.trim());
        return options.normalizeHeader
            ? options.normalizeHeader(cleaned || `Col${index + 1}`, index)
            : (cleaned || `Col${index + 1}`);
    });
    if (options.finalizeHeaders) {
        headers = options.finalizeHeaders(headers);
    }
    return headers;
}

/**
 * Lecture CSV depuis un File — PapaParse sur le fil principal, avec cession
 * régulière (`yieldFn`) pour éviter le blocage de l'UI sur les gros fichiers.
 */
export function readCsvFileUltraFast(
    file: File,
    options: FastCsvReadOptions = {}
): Promise<FastCsvReadResult> {
    const isLargeFile = file.size > WORKER_THRESHOLD_BYTES;

    // IMPORTANT: on n'utilise plus le mode Web Worker intégré de PapaParse
    // (`worker: true`). Il fait planter le parsing des gros fichiers avec :
    //   TypeError: Cannot read properties of undefined (reading 'call')
    // car le File cloné dans le blob worker perd sa méthode `slice()`, ce qui
    // casse `FileStreamer._readChunk`. De plus, en mode worker,
    // `parser.pause()`/`parser.resume()` lèvent « Not implemented », donc la
    // progression ne peut pas céder le fil principal.
    // On parse donc toujours sur le fil principal en cédant régulièrement la
    // main via `yieldFn` pour garder l'UI réactive.
    const yieldFn = options.yieldFn || (isLargeFile
        ? function () { return new Promise<void>(resolve => setTimeout(resolve, 0)); }
        : undefined);
    const estimatedTotal = estimateRowCount(file.size);

    return new Promise((resolve, reject) => {
        let headers: string[] | null = null;
        let headerLineIndex = 0;
        let skippedBeforeHeader = 0;
        let skippedEmpty = 0;
        let processedLines = 0;
        const rows: Record<string, string>[] = [];

        const parseConfig = {
            skipEmptyLines: true as const,
            encoding: 'UTF-8',
            delimiter: '',
            step: (results: Papa.ParseStepResult<string[]>, parser: Papa.Parser) => {
                const cells = (results.data as string[]).map(cell => String(cell ?? '').trim());

                if (!cells.some(cell => cell)) {
                    if (!headers) {
                        skippedBeforeHeader++;
                    } else {
                        skippedEmpty++;
                    }
                    return;
                }

                if (!headers) {
                    const modelHeader = tryResolveHeaderFromModelColumns(cells, options);
                    if (modelHeader) {
                        headers = modelHeader;
                        headerLineIndex = skippedBeforeHeader;
                        return;
                    }

                    if (options.stripAirtelPreamble !== false && looksLikeAirtelPreamble(cells)) {
                        skippedBeforeHeader++;
                        return;
                    }

                    if (looksLikeAirtelHeader(cells)) {
                        headers = finalizeHeaderRow(cells, options);
                        headerLineIndex = skippedBeforeHeader;
                        return;
                    }

                    // Préambule GDJ (LA GABONAISE DES JEUX) : ignorer les lignes de
                    // métadonnées (Account Holder:, Short Code:, Time Period:, ...) et
                    // garder uniquement l'en-tête transactionnel (Revenue No., ...).
                    if (looksLikeGdjReportPreamble(cells)) {
                        skippedBeforeHeader++;
                        return;
                    }

                    if (looksLikeGdjTransactionalHeader(cells)) {
                        headers = finalizeHeaderRow(cells, options);
                        headerLineIndex = skippedBeforeHeader;
                        return;
                    }

                    if (skippedBeforeHeader === 0) {
                        headers = finalizeHeaderRow(cells, options);
                        headerLineIndex = 0;
                        return;
                    }

                    if (options.expectedHeaderColumns?.length && skippedBeforeHeader < 80) {
                        skippedBeforeHeader++;
                        return;
                    }

                    if (skippedBeforeHeader < 15) {
                        skippedBeforeHeader++;
                        return;
                    }

                    headers = finalizeHeaderRow(cells, options);
                    headerLineIndex = skippedBeforeHeader;
                    return;
                }

                const row: Record<string, string> = {};
                headers.forEach((header, index) => {
                    row[header] = maybeFixCell(String(cells[index] ?? ''));
                });
                rows.push(row);
                processedLines++;

                if (processedLines % PROGRESS_EVERY_ROWS === 0) {
                    options.onProgress?.(processedLines, estimatedTotal);
                }

                if (yieldFn && processedLines % YIELD_EVERY_ROWS === 0) {
                    parser.pause();
                    void yieldFn().then(() => parser.resume()).catch(() => parser.resume());
                }
            },
            complete: () => {
                options.onProgress?.(processedLines, processedLines || estimatedTotal);
                resolve({
                    rows,
                    headerLine: headerLineIndex,
                    removedLines: skippedBeforeHeader + skippedEmpty
                });
            },
            error: (error: Error) => reject(error)
        };

        Papa.parse<string[]>(file, { ...parseConfig, worker: false });
    });
}

/**
 * Lecture CSV ultra-rapide depuis une chaîne — PapaParse (plus rapide que split manuel).
 */
export async function readCsvContentUltraFast(
    csvContent: string,
    options: FastCsvReadOptions = {}
): Promise<FastCsvReadResult> {
    let text = stripBom(csvContent);
    if (options.stripAirtelPreamble !== false) {
        text = stripAirtelReportPreambleFromText(text);
    }

    const delimiter = detectCsvDelimiter(text);
    const previewLines = text.split(/\r?\n/).slice(0, 20);
    const modelHeaderIdx = options.expectedHeaderColumns?.length
        ? findHeaderRowIndexInGrid(
            previewLines.map(line => line.split(delimiter)),
            options.expectedHeaderColumns,
            20
        )
        : null;
    const airtelHeaderIdx = modelHeaderIdx ?? findAirtelCsvHeaderLineIndex(previewLines);
    const gdjHeaderIdx = findGdjHeaderLineIndexInCsvLines(previewLines, delimiter);
    const skipRows = airtelHeaderIdx !== null ? airtelHeaderIdx : (gdjHeaderIdx !== null ? gdjHeaderIdx : 0);

    const estimatedTotal = Math.max(1, (text.match(/\r?\n/g) || []).length - skipRows - 1);

    return new Promise((resolve, reject) => {
        let headers: string[] | null = null;
        let headerLineIndex = skipRows;
        let skippedBeforeHeader = 0;
        let skippedEmpty = 0;
        let processedLines = 0;
        let rowIndex = -1;
        const rows: Record<string, string>[] = [];

        Papa.parse<string[]>(text, {
            skipEmptyLines: true,
            delimiter,
            worker: false,
            step: (results, parser) => {
                rowIndex++;
                const cells = (results.data as string[]).map(cell => String(cell ?? '').trim());

                if (!cells.some(cell => cell)) {
                    if (rowIndex < skipRows || !headers) {
                        skippedBeforeHeader++;
                    } else {
                        skippedEmpty++;
                    }
                    return;
                }

                if (rowIndex < skipRows) {
                    skippedBeforeHeader++;
                    return;
                }

                if (!headers) {
                    const modelHeader = tryResolveHeaderFromModelColumns(cells, options);
                    if (modelHeader) {
                        headers = modelHeader;
                        headerLineIndex = rowIndex;
                        return;
                    }

                    headers = finalizeHeaderRow(cells, options);
                    headerLineIndex = rowIndex;
                    return;
                }

                const row: Record<string, string> = {};
                headers.forEach((header, index) => {
                    row[header] = maybeFixCell(String(cells[index] ?? ''));
                });
                rows.push(row);
                processedLines++;

                if (processedLines % PROGRESS_EVERY_ROWS === 0) {
                    options.onProgress?.(processedLines, estimatedTotal);
                }

                if (options.yieldFn && processedLines % YIELD_EVERY_ROWS === 0) {
                    parser.pause();
                    options.yieldFn().then(() => parser.resume()).catch(() => parser.resume());
                }
            },
            complete: () => {
                options.onProgress?.(processedLines, processedLines || estimatedTotal);
                resolve({
                    rows,
                    headerLine: headerLineIndex,
                    removedLines: skippedBeforeHeader + skippedEmpty
                });
            },
            error: (error: Error) => reject(error)
        });
    });
}
