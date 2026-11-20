import { normalizeRecordDateFieldsInPlace } from './date-format.util';

describe('normalizeRecordDateFieldsInPlace', () => {
  it('formate les colonnes de date sur place, sans copie, et reste stable si rappelé', () => {
    const row: Record<string, unknown> = { Date: '46345.99513888889', Montant: '15000', Service: 'CASHIN_OM' };
    const ref = row;
    normalizeRecordDateFieldsInPlace(row);
    expect(row).toBe(ref);
    expect(row['Date']).toBe('19/11/2026 23:53');
    expect(row['Montant']).toBe('15000');
    normalizeRecordDateFieldsInPlace(row);
    expect(row['Date']).toBe('19/11/2026 23:53');
  });
});
