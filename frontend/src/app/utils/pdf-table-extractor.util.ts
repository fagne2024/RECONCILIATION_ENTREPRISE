/**
 * Extraction des tableaux d'un PDF (relevés bancaires, états…) côté navigateur.
 *
 * Le texte du PDF est lu avec sa position (pdf.js), regroupé en lignes, puis découpé en colonnes
 * à partir des espaces verticaux communs aux lignes du tableau. Le résultat est un fichier CSV
 * (séparateur « ; ») qui suit ensuite le circuit normal des fichiers de traitement.
 *
 * Limite : un PDF scanné (image sans texte) ne contient aucun texte exploitable.
 */

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfLine {
  page: number;
  y: number;
  items: PdfTextItem[];
}

export interface PdfTableExtraction {
  rows: string[][];
  pageCount: number;
  columnCount: number;
}

export class PdfSansTexteError extends Error {
  constructor(fileName: string) {
    super(`Le PDF « ${fileName} » ne contient pas de texte exploitable (document scanné ?).`);
    this.name = 'PdfSansTexteError';
  }
}

export function isPdfFile(file: File | null | undefined): boolean {
  if (!file) return false;
  return /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
}

let pdfjsPromise: Promise<any> | null = null;

/** Charge pdf.js à la demande (hors bundle principal) ; le « worker » s'exécute dans le thread principal. */
function loadPdfJs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib: any = await import('pdfjs-dist/legacy/build/pdf');
      const worker: any = await import('pdfjs-dist/legacy/build/pdf.worker.entry');
      const pdfjs = lib?.getDocument ? lib : lib.default;
      (window as any).pdfjsWorker = (window as any).pdfjsWorker || worker?.default || worker;
      return pdfjs;
    })().catch(err => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

/** Lit toutes les pages et regroupe le texte en lignes (haut vers bas, gauche vers droite). */
async function readLines(file: File): Promise<{ lines: PdfLine[]; pageCount: number }> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const lines: PdfLine[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of content.items as any[]) {
        const str = (it?.str ?? '').toString();
        if (!str.trim()) continue;
        const t = it.transform || [1, 0, 0, 1, 0, 0];
        items.push({
          str,
          x: Number(t[4]) || 0,
          y: Number(t[5]) || 0,
          width: Number(it.width) || str.length * 4,
          height: Math.abs(Number(it.height) || Number(t[3]) || 8)
        });
      }
      // Regroupement par ordonnée : même ligne si l'écart vertical est inférieur à la demi-hauteur du texte
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      let current: PdfLine | null = null;
      for (const item of items) {
        const tolerance = Math.max(2, item.height * 0.5);
        if (!current || Math.abs(current.y - item.y) > tolerance) {
          current = { page: p, y: item.y, items: [] };
          lines.push(current);
        }
        current.items.push(item);
      }
      page.cleanup?.();
    }
  } finally {
    await doc.destroy?.();
  }
  lines.forEach(line => line.items.sort((a, b) => a.x - b.x));
  return { lines, pageCount: doc.numPages };
}

/** Nombre de blocs de texte d'une ligne, séparés par un espace horizontal net. */
function countBlocks(line: PdfLine, minGap: number): number {
  let blocks = 0;
  let end = -Infinity;
  for (const item of line.items) {
    if (item.x - end > minGap) blocks++;
    end = Math.max(end, item.x + item.width);
  }
  return blocks;
}

/**
 * Bornes de colonnes : zones horizontales qu'aucune ligne du tableau (ou presque) ne recouvre.
 * Retourne les abscisses de séparation, triées.
 */
function detectSeparators(tableLines: PdfLine[]): number[] {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const line of tableLines) {
    for (const item of line.items) {
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x + item.width);
    }
  }
  if (!isFinite(minX) || !isFinite(maxX)) return [];
  const origin = Math.floor(minX);
  const size = Math.ceil(maxX) - origin + 2;
  const coverage = new Array<number>(size).fill(0);
  for (const line of tableLines) {
    const seen = new Uint8Array(size);
    for (const item of line.items) {
      const from = Math.max(0, Math.floor(item.x) - origin);
      const to = Math.min(size - 1, Math.ceil(item.x + item.width) - origin);
      for (let i = from; i <= to; i++) seen[i] = 1;
    }
    for (let i = 0; i < size; i++) coverage[i] += seen[i];
  }
  // Tolérance : une poignée de lignes atypiques (texte débordant) ne doit pas fusionner deux colonnes
  const noise = Math.floor(tableLines.length * 0.03);
  const minGapWidth = 3;
  const separators: number[] = [];
  let gapStart = -1;
  for (let i = 0; i < size; i++) {
    const empty = coverage[i] <= noise;
    if (empty && gapStart < 0) gapStart = i;
    if ((!empty || i === size - 1) && gapStart >= 0) {
      const gapEnd = empty ? i : i - 1;
      if (gapStart > 0 && gapEnd < size - 1 && gapEnd - gapStart + 1 >= minGapWidth) {
        separators.push(origin + (gapStart + gapEnd) / 2);
      }
      gapStart = -1;
    }
  }
  return separators;
}

function columnIndex(item: PdfTextItem, separators: number[]): number {
  const center = item.x + Math.min(item.width, 6) / 2;
  let idx = 0;
  while (idx < separators.length && center > separators[idx]) idx++;
  return idx;
}

function toCells(line: PdfLine, separators: number[]): string[] {
  const cells = new Array<string>(separators.length + 1).fill('');
  let lastIdx = -1;
  let lastEnd = 0;
  for (const item of line.items) {
    const idx = columnIndex(item, separators);
    const glue = idx === lastIdx && item.x - lastEnd > 1 ? ' ' : '';
    cells[idx] = cells[idx] ? cells[idx] + (glue || (idx === lastIdx ? '' : ' ')) + item.str : item.str;
    lastIdx = idx;
    lastEnd = item.x + item.width;
  }
  return cells.map(c => c.replace(/\s+/g, ' ').trim());
}

/** Texte d'une ligne, dans l'ordre de lecture (un espace est rétabli entre deux blocs disjoints). */
function lineText(line: PdfLine): string {
  let text = '';
  let end = -Infinity;
  for (const item of line.items) {
    if (text && item.x - end > 1 && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
    text += item.str;
    end = item.x + item.width;
  }
  return text;
}

/**
 * Relevés imprimés en texte à largeur fixe, colonnes séparées par « ! » ou « | »
 * (ex. « Date ! Libelle operation ! Val.! Debit ! Credit »). Retourne null si le PDF n'a pas cette forme.
 */
function extractDelimitedTable(lines: PdfLine[]): string[][] | null {
  const texts = lines.map(lineText);
  let best: { delimiter: string; count: number; matches: number } | null = null;
  for (const delimiter of ['!', '|']) {
    const frequency = new Map<number, number>();
    for (const text of texts) {
      const count = text.split(delimiter).length - 1;
      if (count >= 2) frequency.set(count, (frequency.get(count) || 0) + 1);
    }
    for (const [count, matches] of frequency) {
      if (!best || matches > best.matches) best = { delimiter, count, matches };
    }
  }
  // Il faut un vrai tableau : au moins un en-tête et deux lignes ayant le même nombre de séparateurs
  if (!best || best.matches < 3) return null;

  const rows: string[][] = [];
  let header: string | null = null;
  for (const text of texts) {
    if (text.split(best.delimiter).length - 1 !== best.count) continue;
    const cells = text.split(best.delimiter).map(c => c.replace(/\s+/g, ' ').trim());
    if (!cells.some(Boolean)) continue; // ligne de séparation vide
    const signature = cells.join('\u0001').toLowerCase();
    if (header === null) header = signature;
    else if (signature === header) continue; // en-tête répété à chaque page
    rows.push(cells);
  }
  return rows.length >= 2 ? rows : null;
}

/** Extrait le tableau principal d'un PDF sous forme de lignes de cellules (la première est l'en-tête). */
export async function extractPdfTable(file: File): Promise<PdfTableExtraction> {
  const { lines, pageCount } = await readLines(file);
  if (!lines.length) throw new PdfSansTexteError(file.name);

  // Tableau « texte » dont les colonnes sont séparées par un caractère (« ! » ou « | ») : découpage direct
  const delimited = extractDelimitedTable(lines);
  if (delimited) {
    return { rows: delimited, pageCount, columnCount: delimited[0].length };
  }

  const minGap = 8;
  const blockCounts = lines.map(line => countBlocks(line, minGap));
  const maxBlocks = Math.max(...blockCounts);
  if (maxBlocks < 2) {
    // Aucun tableau détecté : une colonne de texte, pour ne rien perdre
    return { rows: lines.map(l => [l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()]), pageCount, columnCount: 1 };
  }
  // Lignes de référence du tableau : celles qui ont au moins 3 blocs (2 si le tableau n'a que 2 colonnes)
  const reference = maxBlocks >= 3 ? 3 : 2;
  const tableLines = lines.filter((_, i) => blockCounts[i] >= reference);
  const separators = detectSeparators(tableLines);
  const columnCount = separators.length + 1;
  const minFilled = Math.min(columnCount, reference);

  const rows: string[][] = [];
  let header: string | null = null;
  let started = false;
  // Dernière ligne rattachée au tableau : une suite de libellé doit la suivre de près, sur la même page
  let lastPage = -1;
  let lastY = 0;
  for (const line of lines) {
    const lineHeight = Math.max(6, ...line.items.map(i => i.height));
    const cells = toCells(line, separators);
    const filled = cells.filter(Boolean).length;
    if (!filled) continue;
    if (filled >= minFilled) {
      const signature = cells.join('\u0001').toLowerCase();
      if (header === null) header = signature;
      else if (signature === header) continue; // en-tête répété à chaque page
      rows.push(cells);
      started = true;
      lastPage = line.page;
      lastY = line.y;
    } else if (started && filled === 1 && rows.length > 1
        && line.page === lastPage && lastY - line.y <= lineHeight * 2.2) {
      // Suite d'un libellé sur plusieurs lignes : rattachée à la ligne précédente, même colonne
      const idx = cells.findIndex(Boolean);
      const previous = rows[rows.length - 1];
      previous[idx] = previous[idx] ? `${previous[idx]} ${cells[idx]}` : cells[idx];
      lastY = line.y;
    }
    // Les autres lignes (titres, pieds de page, mentions) sont ignorées
  }
  if (!rows.length) throw new PdfSansTexteError(file.name);
  return { rows, pageCount, columnCount };
}

/**
 * Dates sans année (« 01/06 ») : complétées avec l'année en cours (« 01/06/2026 »).
 * Seules les cellules contenant exactement jour/mois valides sont modifiées.
 */
function completeDatesWithoutYear(rows: string[][]): string[][] {
  const year = new Date().getFullYear();
  return rows.map(row => row.map(cell => {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(cell);
    if (!m) return cell;
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return cell;
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${year}`;
  }));
}

function csvCell(value: string): string {
  const v = value ?? '';
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Convertit un PDF en fichier CSV (séparateur « ; », UTF-8 avec BOM) portant le même nom de base. */
export async function pdfToCsvFile(file: File): Promise<File> {
  const rows = completeDatesWithoutYear((await extractPdfTable(file)).rows);
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
  const base = (file.name || 'document').replace(/\.pdf$/i, '');
  return new File([csv], `${base}.csv`, { type: 'text/csv', lastModified: file.lastModified });
}

/**
 * Remplace chaque PDF d'une sélection par le CSV de son tableau ; les autres fichiers sont inchangés.
 * Les PDF illisibles sont retirés de la sélection et listés dans `errors`.
 */
export async function convertPdfFiles(files: File[]): Promise<{ files: File[]; converted: string[]; errors: string[] }> {
  const out: File[] = [];
  const converted: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!isPdfFile(file)) {
      out.push(file);
      continue;
    }
    try {
      out.push(await pdfToCsvFile(file));
      converted.push(file.name);
    } catch (err: any) {
      errors.push(err instanceof PdfSansTexteError ? err.message : `Lecture du PDF « ${file.name} » impossible : ${err?.message || 'erreur inconnue'}`);
    }
  }
  return { files: out, converted, errors };
}
