import * as XLSX from 'xlsx';
import { formatSpreadsheetDateValue } from './date-format.util';

/**
 * Fichier Orange (Date and Time = cellule date Excel) : lu avec les options « gros fichier »
 * du mode assisté, la date doit sortir en jj/mm/aaaa hh:mm et non en numéro de série (46345.995…).
 */
describe('Lecture des dates Excel (mode assisté, fichier > 1 Mo)', () => {
  it('cellule date → 19/11/2026 23:53', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Transfer Id', 'Date and Time', 'Transfer Amount'],
      ['CI261119.2353.28982592', 46345.99513888889, 15000]
    ]);
    ws['B2'].z = 'dd/mm/yyyy hh:mm';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Feuil1');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const relu = XLSX.read(new Uint8Array(buffer), {
      type: 'array', cellDates: true, cellNF: false, cellText: false, sheetStubs: false,
      dense: true, cellStyles: false, cellHTML: false, cellFormula: false, raw: true, codepage: 65001
    });
    const grid = XLSX.utils.sheet_to_json<any[]>(relu.Sheets[relu.SheetNames[0]], { header: 1, defval: '', raw: true });
    const cellule = grid[1][1];

    expect(cellule instanceof Date).toBe(true);
    expect(formatSpreadsheetDateValue(cellule)).toBe('19/11/2026 23:53');
  });
});
