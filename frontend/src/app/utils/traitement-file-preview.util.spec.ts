import { readCsvFileUltraFast } from './fast-csv-reader.util';
import {
  applyColumnLinks,
  csvPreviewGrid,
  detectPreviewRange,
  PREVIEW_LINK_NONE,
  rowsFromGrid,
  validateRowRange
} from './traitement-file-preview.util';

/**
 * Prévisualisation du traitement automatique : en-tête détecté, paramétrage manuel,
 * liens de colonnes confirmés, puis lecture complète avec ces réglages.
 */
describe('Prévisualisation des fichiers du traitement automatique', () => {
  const csv = [
    'Rapport des transactions',
    'Période : 01/11/2026 - 07/11/2026',
    '',
    'Reference;Montant;Etat',
    'R1;10;OK',
    'R2;20;KO',
    ''
  ].join('\n');

  it('repère l\'en-tête après un préambule (numéros de ligne physiques)', () => {
    const grid = csvPreviewGrid(csv, ';', false);

    const range = detectPreviewRange(grid, ['Reference', 'Montant', 'Etat']);

    expect(range.headerLine).toBe(4);
    expect(range.dataStartLine).toBe(5);
    expect(range.source).toBe('model');
  });

  it('construit les lignes selon une plage manuelle', () => {
    const grid = csvPreviewGrid(csv, ';', false);

    const { headers, rows } = rowsFromGrid(grid, { headerLine: 4, dataStartLine: 6 });

    expect(headers).toEqual(['Reference', 'Montant', 'Etat']);
    expect(rows).toEqual([{ Reference: 'R2', Montant: '20', Etat: 'KO' }]);
  });

  it('contrôle la plage saisie', () => {
    expect(validateRowRange({ headerLine: 3, dataStartLine: 3 }, 10)).not.toBeNull();
    expect(validateRowRange({ headerLine: 0, dataStartLine: 2 }, 10)).not.toBeNull();
    expect(validateRowRange({ headerLine: 12, dataStartLine: 13 }, 10)).not.toBeNull();
    expect(validateRowRange({ headerLine: 4, dataStartLine: 5 }, 10)).toBeNull();
  });

  it('applique les liens : renommage vers la colonne du modèle et colonne laissée vide', () => {
    const rows = [{ Reference: 'R1', Montant: '10', Etat: 'OK', Status: 'ancien' }];

    applyColumnLinks(rows, { Status: 'Etat', Amount: 'Montant', Reference: PREVIEW_LINK_NONE });

    expect(rows[0]).toEqual({ Reference: '', Status: 'OK', Amount: '10' });
  });

  it('la lecture complète respecte l\'en-tête et la première ligne de données imposés', async () => {
    const file = new File([csv], 'rapport.csv', { type: 'text/csv' });

    const result = await readCsvFileUltraFast(file, {
      stripAirtelPreamble: false,
      manualRange: { headerLine: 4, dataStartLine: 5 }
    });

    expect(result.rows).toEqual([
      { Reference: 'R1', Montant: '10', Etat: 'OK' },
      { Reference: 'R2', Montant: '20', Etat: 'KO' }
    ]);
  });
});
