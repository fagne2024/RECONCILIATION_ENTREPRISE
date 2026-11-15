import { createColumnKeyResolver, resolveColumnKeyInRow } from './row-column.util';

describe('createColumnKeyResolver', () => {
  const rows: Record<string, string>[] = [
    { 'Num Trans GU': '1', 'téléphone client': 'a', amount: '10' },
    { 'Num Trans GU': '2', 'téléphone client': 'b', amount: '20' },
    { 'Reference Number': 'x', Montant: '5' }
  ];
  const columns = ['Num Trans GU', 'num trans gu', 'Telephone Client', 'PAYS', 'Reference Number', 'montant', ''];

  it('donne le même résultat que resolveColumnKeyInRow, y compris pour des structures différentes', () => {
    const resolve = createColumnKeyResolver();
    for (const row of rows) {
      for (const column of columns) {
        expect(resolve(row, column)).toBe(resolveColumnKeyInRow(row, column));
      }
    }
  });

  it('résultat stable sur appels répétés (cache)', () => {
    const resolve = createColumnKeyResolver();
    expect(resolve(rows[0], 'PAYS')).toBeNull();
    expect(resolve(rows[1], 'PAYS')).toBeNull();
    expect(resolve(rows[1], 'num trans gu')).toBe('Num Trans GU');
  });
});
