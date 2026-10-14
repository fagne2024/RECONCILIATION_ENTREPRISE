import * as XLSX from 'xlsx';
import { I18nService } from '../services/i18n/i18n.service';

/**
 * Association clé technique d'export (toujours en français, car elle sert
 * aussi de repère de mise en forme) -> clé i18n du libellé affiché.
 */
export type SheetHeaderMap = Record<string, string>;

/**
 * Traduit la première ligne d'une feuille SheetJS construite depuis des objets
 * dont les clés sont techniques.
 *
 * `json_to_sheet` utilise les clés d'objet comme en-têtes : on les réécrit donc
 * après coup, sans toucher au reste de la feuille (largeurs, styles, mise en
 * forme conditionnelle par en-tête restent pilotés par les clés techniques).
 */
export function translateSheetHeaders(
  worksheet: XLSX.WorkSheet,
  headers: SheetHeaderMap
): void {
  const ref = worksheet['!ref'];
  if (!ref) return;

  const range = XLSX.utils.decode_range(ref);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const key = cellValue(worksheet, range.s.r, c);
    const i18nKey = key ? headers[key] : undefined;
    if (i18nKey) {
      const address = XLSX.utils.encode_cell({ r: range.s.r, c });
      worksheet[address] = { ...worksheet[address], t: 's', v: I18nService.t(i18nKey) };
    }
  }
}

function cellValue(worksheet: XLSX.WorkSheet, row: number, column: number): string {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = worksheet[address] as XLSX.CellObject | undefined;
  return cell && typeof cell.v === 'string' ? cell.v : '';
}
