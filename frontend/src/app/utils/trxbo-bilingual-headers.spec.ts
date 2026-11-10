import { findEquivalentHeader, TRXBO_COLUMN_DEFINITIONS } from './bilingual-column.util';
import { findHeaderRowIndexInGrid } from './model-header-detection.util';
import { resolveColumnKeyInRow } from './row-column.util';

/**
 * Traitement de fichier BO (TRXBO) : le modèle est configuré dans une langue,
 * le fichier exporté dans l'autre. Les en-têtes doivent être reconnus quand même.
 */
describe('TRXBO : reconnaissance des en-têtes FR / EN au traitement', () => {
  const frHeaders = TRXBO_COLUMN_DEFINITIONS.map(d => d.fr);
  const enHeaders = TRXBO_COLUMN_DEFINITIONS.map(d => d.en);
  const rowFrom = (headers: string[]) => Object.fromEntries(headers.map(h => [h, 'x']));

  it.each(TRXBO_COLUMN_DEFINITIONS.map(d => [d.fr, d.en]))(
    'règle sur « %s » appliquée à la colonne « %s » (et inversement)',
    (fr, en) => {
      expect(resolveColumnKeyInRow(rowFrom(enHeaders), fr)).toBe(en);
      expect(resolveColumnKeyInRow(rowFrom(frHeaders), en)).toBe(fr);
    }
  );

  it('détecte la ligne d’en-tête anglaise avec un modèle français (préambule ignoré)', () => {
    const grid = [
      ['Export transactions', '', ''],
      ['Période : 01/11/2026 - 09/11/2026'],
      enHeaders,
      enHeaders.map(() => 'valeur')
    ];
    expect(findHeaderRowIndexInGrid(grid, frHeaders)).toBe(2);
  });

  it('détecte la ligne d’en-tête française avec un modèle anglais', () => {
    const grid = [['Rapport'], frHeaders, frHeaders.map(() => 'valeur')];
    expect(findHeaderRowIndexInGrid(grid, enHeaders)).toBe(1);
  });

  it('findEquivalentHeader ne confond pas Agence / Agent', () => {
    expect(findEquivalentHeader(enHeaders, 'Agence')).toBe('Agency');
    expect(findEquivalentHeader(enHeaders, 'Agent')).toBeNull(); // déjà présent sous ce nom
    expect(findEquivalentHeader(['Agent', 'Service'], 'Agence')).toBeNull();
  });
});
