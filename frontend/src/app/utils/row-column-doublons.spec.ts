import { applyDuplicateColumnChoice, findDuplicateColumnGroups, uniqueHeaderNames } from './row-column.util';

describe('Colonnes en double : choix de l\'occurrence gardée', () => {
  it('repère « X (2) » et « X_1 » seulement si « X » existe', () => {
    const groups = findDuplicateColumnGroups(['ID', 'Téléphone', 'Montant', 'Téléphone (2)', 'Ref_1', 'Date_1', 'Date']);
    expect(groups).toEqual([
      { base: 'Téléphone', keys: ['Téléphone', 'Téléphone (2)'] },
      { base: 'Date', keys: ['Date_1', 'Date'] }
    ]);
  });

  it('garde la 2e occurrence sous le nom de la 1re, à sa position', () => {
    const rows = [{ ID: 'A', 'Téléphone': '111', Montant: '5', 'Téléphone (2)': '222' }];
    const groups = findDuplicateColumnGroups(Object.keys(rows[0]));
    const out = applyDuplicateColumnChoice(rows, groups, new Map([['Téléphone', 'Téléphone (2)']]));
    expect(out).toEqual([{ ID: 'A', 'Téléphone': '222', Montant: '5' }]);
    expect(Object.keys(out[0])).toEqual(['ID', 'Téléphone', 'Montant']);
  });

  it('garde la 1re occurrence par défaut', () => {
    const rows = [{ 'Téléphone': '111', 'Téléphone (2)': '222' }];
    const groups = findDuplicateColumnGroups(Object.keys(rows[0]));
    expect(applyDuplicateColumnChoice(rows, groups, new Map())).toEqual([{ 'Téléphone': '111' }]);
  });

  it('rend uniques les en-têtes Excel en double', () => {
    expect(uniqueHeaderNames(['Tel', 'Montant', 'Tel', 'tel', ''])).toEqual(['Tel', 'Montant', 'Tel (2)', 'tel (3)', '']);
  });
});
