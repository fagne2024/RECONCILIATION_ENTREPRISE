import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { I18nService } from './i18n/i18n.service';
import { fixCellEncoding } from '../utils/encoding-fixer';
import { getRowColumnValue } from '../utils/row-column.util';
import { stripAllWhitespace } from '../utils/concat.util';
import {
  preserveLeadingZeroString,
  shouldExportCellAsText,
  finalizeTextPreserveColumnValue,
  formatCellForCsvExport,
  exportTextCellValue
} from '../utils/text-cell.util';

/** Couleurs par type de commentaire pour export écarts (TRXBO/OPPART) - ARGB 8 caractères */
export const ECART_COMMENT_COLORS: Record<string, string> = {
  TSOP: 'FFFFCDD2',   // Rouge clair
  TRXSF: 'FFFFF9C4',  // Jaune clair
  Ecart: 'FFFFAB91',  // Orange clair
  RGFRAIS: 'FFB3E5FC' // Bleu clair
};

export interface ExportProgress {
  current: number;
  total: number;
  percentage: number;
  message: string;
  isComplete: boolean;
}

export interface ExportOptions {
  chunkSize?: number;
  /** @deprecated Ignoré : l’export CSV utilise le thread principal (compatible CSP stricte). */
  useWebWorker?: boolean;
  enableCompression?: boolean;
  format?: 'csv' | 'xlsx' | 'xls';
  onProgress?: (progress: ExportProgress) => void | Promise<void>;
  yieldFn?: () => Promise<void>;
}

export interface ExportWithCommentColorsOptions {
  commentColumn?: string;
  colorMap?: Record<string, string>;
}

@Injectable({
  providedIn: 'root'
})
export class ExportOptimizationService {
  private _exportProgress = new BehaviorSubject<ExportProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    message: '',
    isComplete: false
  });

  public readonly exportProgress$ = this._exportProgress.asObservable();

  /**
   * Télécharge un fichier
   */
  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export CSV par chunks sur le thread principal.
   * (Les workers via blob: URL sont incompatibles avec une CSP stricte sans worker-src/blob.)
   */
  public async exportCSVOptimized(
    rows: any[], 
    columns: string[], 
    fileName: string, 
    options: ExportOptions = {}
  ): Promise<void> {
    const chunkSize = options.chunkSize ?? (rows.length > 100000 ? 5000 : rows.length > 20000 ? 2000 : 1000);
    await this.exportCSVSynchronous(rows, columns, fileName, chunkSize, options);
  }

  private async yieldExport(options: ExportOptions): Promise<void> {
    if (options.yieldFn) {
      await options.yieldFn();
      return;
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  private formatCellForCsv(raw: unknown, columnName?: string): string {
    if (raw === undefined || raw === null) {
      return '';
    }

    let val = formatCellForCsvExport(columnName, raw);
    if (/Ã.|Â.|ï¿½|\uFFFD/.test(val)) {
      val = fixCellEncoding(val);
      if (columnName && shouldExportCellAsText(columnName, val)) {
        val = formatCellForCsvExport(columnName, val);
      }
    }
    return val;
  }

  private buildCsvLine(row: Record<string, unknown>, columns: string[]): string {
    const cells = new Array<string>(columns.length);
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      cells[i] = this.formatCellForCsv(this.readRowCell(row, col), col);
    }
    return cells.join(';');
  }

  /**
   * Export CSV par chunks sur le thread principal, sans concaténer une méga-chaîne.
   */
  private async exportCSVSynchronous(
    rows: any[], 
    columns: string[], 
    fileName: string, 
    chunkSize: number,
    options: ExportOptions = {}
  ): Promise<void> {
    const totalRows = rows.length;
    const encodedColumns = columns.map(col => {
      const header = col || '';
      return /Ã.|Â.|ï¿½|\uFFFD/.test(header) ? fixCellEncoding(header) : header;
    });
    const parts: BlobPart[] = [];
    const encoder = new TextEncoder();
    parts.push(encoder.encode('\uFEFF'));
    parts.push(encoder.encode(`${encodedColumns.join(';')}\r\n`));

    this._exportProgress.next({
      current: 0,
      total: totalRows,
      percentage: 0,
      message: I18nService.t('EXP.csvProgress', { current: 0, total: totalRows.toLocaleString() }),
      isComplete: false
    });
    await options.onProgress?.({
      current: 0,
      total: totalRows,
      percentage: 0,
      message: I18nService.t('EXP.csvProgress', { current: 0, total: totalRows.toLocaleString() }),
      isComplete: false
    });
    await this.yieldExport(options);

    for (let start = 0; start < totalRows; start += chunkSize) {
      const end = Math.min(start + chunkSize, totalRows);
      const lines = new Array<string>(end - start);
      for (let i = start; i < end; i++) {
        lines[i - start] = this.buildCsvLine(rows[i], columns);
      }
      parts.push(encoder.encode(`${lines.join('\r\n')}\r\n`));

      const progress = end;
      const progressPayload: ExportProgress = {
        current: progress,
        total: totalRows,
        percentage: totalRows ? (progress / totalRows) * 100 : 100,
        message: I18nService.t('EXP.csvProgress', { current: progress.toLocaleString(), total: totalRows.toLocaleString() }),
        isComplete: false
      };
      this._exportProgress.next(progressPayload);
      await options.onProgress?.(progressPayload);
      await this.yieldExport(options);
    }

    const blob = new Blob(parts, { type: 'text/csv;charset=utf-8;' });
    this.downloadFile(blob, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);

    const donePayload: ExportProgress = {
      current: totalRows,
      total: totalRows,
      percentage: 100,
      message: I18nService.t('EXP.csvDone', { file: fileName }),
      isComplete: true
    };
    this._exportProgress.next(donePayload);
    await options.onProgress?.(donePayload);
  }

  /**
   * Export Excel par chunks sur le thread principal
   */
  public async exportExcelOptimized(
    rows: any[], 
    columns: string[], 
    fileName: string, 
    options: ExportOptions = {}
  ): Promise<void> {
    const chunkSize = options.chunkSize ?? (rows.length > 100000 ? 5000 : rows.length > 20000 ? 2000 : 1000);
    const excelFormat = options.format === 'xls' ? 'xls' : 'xlsx';
    const encodedColumns = columns.map(col => {
      const header = col || '';
      return /Ã.|Â.|ï¿½|\uFFFD/.test(header) ? fixCellEncoding(header) : header;
    });

    await this.exportExcelSynchronous(rows, columns, encodedColumns, fileName, chunkSize, excelFormat, options);
  }

  /**
   * Export Excel avec couleurs par type de commentaire (écarts BO / Partenaire TRXBO-OPPART).
   * Utilise ExcelJS pour appliquer un fond de cellule selon la valeur de la colonne Commentaire.
   */
  public async exportExcelWithCommentColors(
    rows: any[],
    columns: string[],
    fileName: string,
    options: ExportWithCommentColorsOptions = {}
  ): Promise<void> {
    const commentColumn = options.commentColumn ?? 'Commentaire';
    const colorMap = options.colorMap ?? ECART_COMMENT_COLORS;
    const hasCommentInColumns = columns.includes(commentColumn);

    this._exportProgress.next({
      current: 0,
      total: rows.length,
      percentage: 0,
      message: I18nService.t('EXP.preparing'),
      isComplete: false
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Écarts', { views: [{ state: 'frozen', ySplit: 1 }] });

    // En-têtes
    const headerRow = worksheet.addRow(columns);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    const chunkSize = 2000;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      for (const row of chunk) {
        const rowData = columns.map(col => {
          const base = this.serializeCellForExport(col, this.readRowCell(row, col));
          return this.cellValueForExcel(col, base);
        });
        const excelRow = worksheet.addRow(rowData);
        if (hasCommentInColumns) {
          const commentValue = (row[commentColumn] ?? '').toString().trim();
          const argb = colorMap[commentValue] || colorMap['Ecart'] || 'FFFFFFFF';
          excelRow.eachCell((cell, colNumber) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
          });
        }
      }
      const progress = Math.min(i + chunkSize, rows.length);
      this._exportProgress.next({
        current: progress,
        total: rows.length,
        percentage: (progress / rows.length) * 100,
        message: I18nService.t('EXP.progress', { current: progress.toLocaleString(), total: rows.length.toLocaleString() }),
        isComplete: false
      });
      if (i % (chunkSize * 2) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Largeurs colonnes
    columns.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = Math.min( Math.max(String(col).length + 2, 12), 50 );
    });

    const finalFileName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    this.downloadFile(blob, finalFileName);

    this._exportProgress.next({
      current: rows.length,
      total: rows.length,
      percentage: 100,
      message: I18nService.t('EXP.done', { file: finalFileName }),
      isComplete: true
    });
  }

  /**
   * Indique si une colonne est une colonne montant/volume (à exporter en nombre)
   */
  private readRowCell(row: Record<string, unknown>, col: string): unknown {
    if (!row || typeof row !== 'object') {
      return '';
    }
    return getRowColumnValue(row, col);
  }

  private isAmountColumn(col: string): boolean {
    const lower = (col || '').toLowerCase();
    const amountKeys = [
      'montant', 'amount', 'volume', 'valeur', 'value', 'somme', 'sum', 'total',
      'credit', 'crédit', 'debit', 'débit', 'verse', 'versé', 'retire', 'retiré',
      'transactions', 'matches', 'boonly', 'partneronly',
      'mismatches', 'totalvolume', 'totaltransactions', 'totalmatches', 'totalboonly',
      'totalpartneronly', 'totalmismatches', 'nombre', 'volume total', 'total volume'
    ];
    return amountKeys.some(k => lower === k || lower.includes(k));
  }

  /**
   * Convertit une valeur pour export Excel : nombre pour colonnes montant, sinon inchangé
   */
  private cellValueForExcel(col: string, val: any): any {
    if (val === undefined || val === null || val === '') return '';
    if (shouldExportCellAsText(col, val)) {
      return finalizeTextPreserveColumnValue(col, val);
    }
    if (!this.isAmountColumn(col)) return val;
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return !isNaN(num) ? num : val;
  }

  /**
   * XLSX attend des valeurs "feuille de calcul" (string/number/boolean/date).
   * Les objets/tableaux (souvent présents dans boData/partnerData) peuvent faire planter json_to_sheet / writeFile.
   */
  private serializeCellForExport(col: string, val: any): string | number | boolean | Date {
    if (val === undefined || val === null) return '';
    if (shouldExportCellAsText(col, val)) {
      return finalizeTextPreserveColumnValue(col, val);
    }
    if (typeof val === 'string') return fixCellEncoding(val);
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (val instanceof Date) return val;
    if (typeof val === 'object') {
      try {
        return fixCellEncoding(JSON.stringify(val));
      } catch {
        return fixCellEncoding(String(val));
      }
    }
    return fixCellEncoding(String(val));
  }

  /**
   * Export Excel synchrone optimisé
   */
  private async exportExcelSynchronous(
    rows: any[], 
    sourceColumns: string[],
    headerColumns: string[],
    fileName: string, 
    chunkSize: number,
    format: 'xlsx' | 'xls' = 'xlsx',
    options: ExportOptions = {}
  ): Promise<void> {
    const totalRows = rows.length;

    if (format === 'xls') {
      await this.exportExcelSynchronousXlsxLib(rows, sourceColumns, headerColumns, fileName, chunkSize, 'xls', options);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Données', { views: [{ state: 'frozen', ySplit: 1 }] });
    const headerRow = worksheet.addRow(headerColumns);
    headerRow.font = { bold: true };

    headerColumns.forEach((col, idx) => {
      if (shouldExportCellAsText(col, '')) {
        worksheet.getColumn(idx + 1).numFmt = '@';
      }
    });

    for (let i = 0; i < totalRows; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      for (const row of chunk) {
        const rowValues: (string | number | boolean | Date | null)[] = new Array(sourceColumns.length);
        const textCells: { index: number; headerCol: string; sourceCol: string }[] = [];

        sourceColumns.forEach((col, idx) => {
          const headerCol = headerColumns[idx] ?? col;
          const rawCell = this.readRowCell(row, col);
          if (shouldExportCellAsText(headerCol, rawCell)) {
            textCells.push({ index: idx, headerCol, sourceCol: col });
            rowValues[idx] = null;
            return;
          }
          const base = this.serializeCellForExport(col, rawCell);
          rowValues[idx] = this.cellValueForExcel(headerCol, base);
        });

        const excelRow = worksheet.addRow(rowValues);
        for (const textCell of textCells) {
          const cell = excelRow.getCell(textCell.index + 1);
          const text = exportTextCellValue(
            textCell.headerCol,
            this.readRowCell(row, textCell.sourceCol)
          );
          cell.value = text === '' ? null : text;
          cell.numFmt = '@';
        }
      }

      const progress = Math.min(i + chunkSize, totalRows);
      const progressPayload: ExportProgress = {
        current: progress,
        total: totalRows,
        percentage: (progress / totalRows) * 100,
        message: I18nService.t('EXP.excelProgress', { current: progress.toLocaleString(), total: totalRows.toLocaleString() }),
        isComplete: false
      };
      this._exportProgress.next(progressPayload);
      await options.onProgress?.(progressPayload);
      await this.yieldExport(options);
    }

    headerColumns.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = Math.min(Math.max(String(col).length + 2, 12), 50);
    });

    const finalFileName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    this.downloadFile(blob, finalFileName);

    this._exportProgress.next({
      current: totalRows,
      total: totalRows,
      percentage: 100,
      message: I18nService.t('EXP.excelDone', { file: finalFileName }),
      isComplete: true
    });
  }

  private async exportExcelSynchronousXlsxLib(
    rows: any[],
    sourceColumns: string[],
    headerColumns: string[],
    fileName: string,
    chunkSize: number,
    format: 'xlsx' | 'xls' = 'xlsx',
    options: ExportOptions = {}
  ): Promise<void> {
    const totalRows = rows.length;
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headerColumns]);
    
    // Traitement par chunks
    for (let i = 0; i < totalRows; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const chunkData = chunk.map(row =>
        sourceColumns.map((col, idx) => {
          const headerCol = headerColumns[idx] ?? col;
          const base = this.serializeCellForExport(col, this.readRowCell(row, col));
          const val = this.cellValueForExcel(headerCol, base);
          if (shouldExportCellAsText(headerCol, val) && val !== '') {
            return { t: 's', v: exportTextCellValue(headerCol, val), z: '@' };
          }
          return val;
        })
      );
      
      // Ajouter les données au worksheet
      XLSX.utils.sheet_add_aoa(worksheet, chunkData, { origin: -1 });
      
      // Mettre à jour la progression
      const progress = Math.min(i + chunkSize, totalRows);
      const progressPayload: ExportProgress = {
        current: progress,
        total: totalRows,
        percentage: (progress / totalRows) * 100,
        message: I18nService.t('EXP.excelProgress', { current: progress.toLocaleString(), total: totalRows.toLocaleString() }),
        isComplete: false
      };
      this._exportProgress.next(progressPayload);
      await options.onProgress?.(progressPayload);
      await this.yieldExport(options);
    }
    
    // Finaliser le workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Données');
    
    // Télécharger le fichier
    let finalFileName: string;
    if (format === 'xls') {
      finalFileName = fileName.endsWith('.xls') ? fileName : fileName + '.xls';
      XLSX.writeFile(workbook, finalFileName, { bookType: 'biff8' });
    } else {
      finalFileName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
      XLSX.writeFile(workbook, finalFileName);
    }
    
    this._exportProgress.next({
      current: totalRows,
      total: totalRows,
      percentage: 100,
      message: I18nService.t('EXP.excelDone', { file: finalFileName }),
      isComplete: true
    });
  }

  /**
   * Export rapide pour petits volumes (< 1000 lignes)
   */
  public exportQuick(
    rows: any[], 
    columns: string[], 
    fileName: string, 
    format: 'csv' | 'xlsx' | 'xls' = 'csv'
  ): void {
    if (format === 'csv') {
      const csvContent = [
        columns.join(';'),
        ...rows.map(row => 
          columns.map(col => {
            const raw = this.readRowCell(row, col);
            return raw === undefined || raw === null || raw === ''
              ? ''
              : this.formatCellForCsv(raw, col);
          }).join(';')
        )
      ].join('\r\n');
      
      const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
      this.downloadFile(blob, fileName.endsWith('.csv') ? fileName : fileName + '.csv');
    } else if (format === 'xlsx' || format === 'xls') {
      const headerRow = columns;
      const dataRows = rows.map(row =>
        columns.map(col => {
          const base = this.serializeCellForExport(col, this.readRowCell(row, col));
          const val = this.cellValueForExcel(col, base);
          if (shouldExportCellAsText(col, val) && val !== '') {
            return {
              t: 's',
              v: exportTextCellValue(col, val),
              z: '@'
            };
          }
          return val;
        })
      );
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Données');
      
      let finalFileName: string;
      if (format === 'xls') {
        finalFileName = fileName.endsWith('.xls') ? fileName : fileName + '.xls';
        // Pour XLS, on utilise le format BIFF8 (Excel 97-2003)
        XLSX.writeFile(workbook, finalFileName, { bookType: 'biff8' });
      } else {
        finalFileName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
        XLSX.writeFile(workbook, finalFileName);
      }
    }
  }

  /**
   * Nettoie les ressources
   */
  public destroy(): void {}
}
