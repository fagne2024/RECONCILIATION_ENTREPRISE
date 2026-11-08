import * as Papa from 'papaparse';
import { fixGarbledCharacters } from './encoding-fixer';
import { deduplicateHeaderNames } from './row-column.util';
import {
  countFilledCells,
  isMarkerRow,
  createPostHeaderRowFilter,
  detectGenericHeaderRowIndex,
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
    /** Reçoit chaque ligne au fil de la lecture : évite de garder tout le fichier en objets. */
    onRow?: (row: Record<string, string>) => void;
    yieldFn?: () => Promise<void>;
}

/** Position de l'en-tête détectée dans un fichier (index parmi les lignes non vides). */
export interface CsvHeaderPlan {
    headerIndex: number;
    /**
     * specific : modèle, Airtel ou GDJ ; generic : détection générique ;
     * none : aucun en-tête repéré (la 1re ligne sert d'en-tête).
     */
    kind: 'specific' | 'generic' | 'none';
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|', ':'];

const WORKER_THRESHOLD_BYTES = 512 * 1024;
const YIELD_EVERY_ROWS = 1500;
const PROGRESS_EVERY_ROWS = 2500;
const PREVIEW_BYTES = 256 * 1024;

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

/**
 * Localise l'en-tête d'un CSV à partir de ses premières lignes.
 * Ordre : modèle attendu, Airtel, GDJ (détections spécifiques), puis détection générique
 * (première ligne textuelle suivie de données). Les index sont ceux des lignes non vides.
 */
export function planCsvHeader(
    lines: string[],
    delimiter: string,
    expectedHeaderColumns: string[] = [],
    scan = 80
): CsvHeaderPlan {
    const previewLines = (lines || [])
        .filter(line => line.split(delimiter).some(cell => cell.trim()))
        .slice(0, scan);
    const rows = previewLines.map(line => line.split(delimiter).map(cell => cell.trim()));

    const modelIndex = expectedHeaderColumns.length
        ? findHeaderRowIndexInGrid(rows, expectedHeaderColumns, scan)
        : null;
    const specificIndex =
        modelIndex ??
        findAirtelCsvHeaderLineIndex(previewLines) ??
        findGdjHeaderLineIndexInCsvLines(previewLines, delimiter);
    if (specificIndex !== null) {
        return { headerIndex: specificIndex, kind: 'specific' };
    }

    const genericIndex = detectGenericHeaderRowIndex(rows, 30);
    if (genericIndex !== null) {
        return { headerIndex: genericIndex, kind: 'generic' };
    }

    return { headerIndex: 0, kind: 'none' };
}

/**
 * Choisit le séparateur et l'en-tête. Le séparateur par défaut gagne si son en-tête est
 * spécifique (modèle, Airtel, GDJ). Sinon, on teste les autres séparateurs et on retient
 * l'en-tête générique le plus large : un préambule contenant « : » (heures, « Date=… »)
 * peut faire échouer la détection par défaut alors que la tabulation convient.
 */
export function resolveCsvHeaderPlan(
    lines: string[],
    defaultDelimiter: string,
    expectedHeaderColumns: string[] = [],
    scan = 80
): { delimiter: string; plan: CsvHeaderPlan } {
    const defaultPlan = planCsvHeader(lines, defaultDelimiter, expectedHeaderColumns, scan);
    if (defaultPlan.kind === 'specific') {
        return { delimiter: defaultDelimiter, plan: defaultPlan };
    }

    const others = CANDIDATE_DELIMITERS.filter(d => d !== defaultDelimiter);
    let best: { delimiter: string; plan: CsvHeaderPlan; width: number } | null = null;
    for (const delimiter of [defaultDelimiter, ...others]) {
        const plan = delimiter === defaultDelimiter
            ? defaultPlan
            : planCsvHeader(lines, delimiter, expectedHeaderColumns, scan);
        if (plan.kind !== 'generic') {
            continue;
        }
        const nonEmpty = (lines || []).filter(line => line.split(delimiter).some(cell => cell.trim()));
        const width = countFilledCells(nonEmpty[plan.headerIndex].split(delimiter));
        // Strictement plus large : à largeur égale, le séparateur par défaut est conservé.
        if (!best || width > best.width) {
            best = { delimiter, plan, width };
        }
    }

    if (best) {
        return { delimiter: best.delimiter, plan: best.plan };
    }
    return { delimiter: defaultDelimiter, plan: defaultPlan };
}

/** Évite le coût de fixGarbledCharacters sur les cellules ASCII simples. */
function maybeFixCell(text: string): string {
    if (!text) {
        return '';
    }
    if (!/[\u0080-ÿ]|�|ï¿½|Ã.|Â./.test(text)) {
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
 * L'en-tête est repéré sur un aperçu du début du fichier (voir planCsvHeader).
 */
export async function readCsvFileUltraFast(
    file: File,
    options: FastCsvReadOptions = {}
): Promise<FastCsvReadResult> {
    let plan: CsvHeaderPlan | null = null;
    let delimiter = '';
    try {
        const preview = stripBom(await file.slice(0, PREVIEW_BYTES).text());
        const resolved = resolveCsvHeaderPlan(
            preview.split(/\r?\n/),
            detectCsvDelimiter(preview),
            options.expectedHeaderColumns ?? []
        );
        if (resolved.plan.kind === 'generic') {
            plan = resolved.plan;
            delimiter = resolved.delimiter;
        }
    } catch {
        // Aperçu illisible : lecture par défaut (comportement historique).
        plan = null;
        delimiter = '';
    }
    return readCsvFileStreaming(file, options, plan, delimiter);
}

function readCsvFileStreaming(
    file: File,
    options: FastCsvReadOptions,
    plan: CsvHeaderPlan | null,
    delimiter: string
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
        let rowIndex = -1;
        let postHeaderFilter: ((cells: unknown[]) => boolean) | null = null;
        const rows: Record<string, string>[] = [];

        const parseConfig = {
            skipEmptyLines: true as const,
            encoding: 'UTF-8',
            delimiter,
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
                rowIndex++;

                // En-tête déjà repéré (détection générique) : lignes avant l'en-tête ignorées.
                if (plan && !headers) {
                    if (rowIndex < plan.headerIndex) {
                        skippedBeforeHeader++;
                        return;
                    }
                    headers = finalizeHeaderRow(cells, options);
                    headerLineIndex = rowIndex;
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

                // Lignes après l'en-tête : marqueurs et lignes parasites avant les données écartés.
                if (!postHeaderFilter) {
                    postHeaderFilter = createPostHeaderRowFilter(headers.length);
                }
                if (!postHeaderFilter(cells)) {
                    skippedEmpty++;
                    return;
                }

                const row: Record<string, string> = {};
                headers.forEach((header, index) => {
                    row[header] = maybeFixCell(String(cells[index] ?? ''));
                });
                if (options.onRow) {
                    options.onRow(row);
                } else {
                    rows.push(row);
                }
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
                    rows: options.onRow ? [] : rows,
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

    const resolved = resolveCsvHeaderPlan(
        text.split(/\r?\n/, 400),
        detectCsvDelimiter(text),
        options.expectedHeaderColumns ?? [],
        20
    );
    const delimiter = resolved.delimiter;
    const skipRows = resolved.plan.headerIndex;

    const estimatedTotal = Math.max(1, (text.match(/\r?\n/g) || []).length - skipRows - 1);

    return new Promise((resolve, reject) => {
        let headers: string[] | null = null;
        let headerLineIndex = skipRows;
        let skippedBeforeHeader = 0;
        let skippedEmpty = 0;
        let processedLines = 0;
        let rowIndex = -1;
        let postHeaderFilter: ((cells: unknown[]) => boolean) | null = null;
        const rows: Record<string, string>[] = [];

        Papa.parse<string[]>(text, {
            skipEmptyLines: true,
            delimiter,
            worker: false,
            step: (results, parser) => {
                const cells = (results.data as string[]).map(cell => String(cell ?? '').trim());

                if (!cells.some(cell => cell)) {
                    if (!headers) {
                        skippedBeforeHeader++;
                    } else {
                        skippedEmpty++;
                    }
                    return;
                }
                rowIndex++;

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

                if (!postHeaderFilter) {
                    postHeaderFilter = createPostHeaderRowFilter(headers.length);
                }
                if (!postHeaderFilter(cells)) {
                    skippedEmpty++;
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

/* ------------------------------------------------------------------------------------------
 * Lecture avec paramétrage manuel des lignes (optionnel).
 * Les numéros sont ceux des lignes brutes du fichier (1-based, lignes vides comprises).
 * Sans paramétrage, l'en-tête et le début des données sont détectés automatiquement.
 * ------------------------------------------------------------------------------------------ */

/** Ligne d'en-tête et première ligne de données choisies (1-based, lignes brutes). */
export interface CsvRowRange {
    headerLine: number;
    dataStartLine: number;
}

export interface CsvParsedTable {
    headers: string[];
    rows: Record<string, string>[];
    delimiter: string;
    /** Ligne d'en-tête réellement utilisée (1-based). */
    headerLine: number;
    /** Première ligne de données réellement utilisée (1-based). */
    dataStartLine: number;
    /**
     * Origine de l'en-tête : paramétrage manuel, détection spécifique (modèle, Airtel, GDJ),
     * détection générique, ou aucune (la 1re ligne est prise par défaut, à vérifier).
     */
    headerSource: 'manual' | 'specific' | 'generic' | 'none';
}

/** Séparateur qui découpe la ligne donnée en le plus de colonnes (le défaut gagne à égalité). */
function pickDelimiterForLine(line: string, fallback: string): string {
    let best = fallback;
    let bestWidth = (line || '').split(fallback).length;
    for (const delimiter of CANDIDATE_DELIMITERS) {
        const width = (line || '').split(delimiter).length;
        if (delimiter !== fallback && width > bestWidth) {
            best = delimiter;
            bestWidth = width;
        }
    }
    return best;
}

/** Index brut de la n-ième ligne non vide (même critère que planCsvHeader). */
function rawIndexOfNonEmptyLine(lines: string[], delimiter: string, nonEmptyIndex: number): number {
    let count = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].split(delimiter).some(cell => cell.trim())) {
            count++;
            if (count === nonEmptyIndex) {
                return i;
            }
        }
    }
    return 0;
}

/**
 * Lit un CSV en mémoire. Avec `rowRange`, l'en-tête et le début des données sont ceux
 * indiqués par l'utilisateur ; sans, ils sont détectés (modèle, Airtel, GDJ, générique).
 * Les lignes entièrement vides et les lignes marqueur (ex. « [STARTDATA] ») sont écartées.
 */
export function parseCsvWithHeaderPlan(
    csvContent: string,
    options: FastCsvReadOptions = {},
    rowRange: CsvRowRange | null = null
): CsvParsedTable {
    let text = stripBom(csvContent || '');
    if (options.stripAirtelPreamble !== false) {
        text = stripAirtelReportPreambleFromText(text);
    }
    const lines = text.split(/\r?\n/);
    const defaultDelimiter = detectCsvDelimiter(text);

    let delimiter: string;
    let headerIdx: number;
    let dataIdx: number | null = null;
    let headerSource: CsvParsedTable['headerSource'];
    if (rowRange) {
        headerIdx = Math.max(0, Math.floor(rowRange.headerLine) - 1);
        dataIdx = Math.max(headerIdx + 1, Math.floor(rowRange.dataStartLine) - 1);
        delimiter = pickDelimiterForLine(lines[headerIdx] ?? '', defaultDelimiter);
        headerSource = 'manual';
    } else {
        const resolved = resolveCsvHeaderPlan(
            lines.slice(0, 400),
            defaultDelimiter,
            options.expectedHeaderColumns ?? [],
            20
        );
        delimiter = resolved.delimiter;
        headerIdx = rawIndexOfNonEmptyLine(lines, delimiter, resolved.plan.headerIndex);
        headerSource = resolved.plan.kind;
    }

    const grid = Papa.parse<string[]>(lines.slice(headerIdx).join('\n'), {
        delimiter,
        skipEmptyLines: false
    }).data;
    const headerCells = (grid[0] || []).map(cell => String(cell ?? '').trim());
    const headers = deduplicateHeaderNames(finalizeHeaderRow(headerCells, options));

    const postHeaderFilter = dataIdx === null ? createPostHeaderRowFilter(headers.length) : null;
    const rows: Record<string, string>[] = [];
    let firstDataIdx: number | null = null;
    for (let i = 1; i < grid.length; i++) {
        const cells = (grid[i] || []).map(cell => String(cell ?? '').trim());
        if (!cells.some(Boolean)) {
            continue;
        }
        const rawIdx = headerIdx + i;
        if (dataIdx !== null) {
            if (rawIdx < dataIdx || isMarkerRow(cells)) {
                continue;
            }
        } else if (!postHeaderFilter!(cells)) {
            continue;
        }
        if (firstDataIdx === null) {
            firstDataIdx = rawIdx;
        }
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
            row[header] = maybeFixCell(cells[index] ?? '');
        });
        rows.push(row);
    }

    return {
        headers,
        rows,
        delimiter,
        headerLine: headerIdx + 1,
        dataStartLine: (dataIdx ?? firstDataIdx ?? headerIdx + 1) + 1,
        headerSource
    };
}
