import { alignRowsToHeaders } from './row-column.util';
describe('alignRowsToHeaders', () => {
  it('aligne un fichier EN et un fichier FR sur les en-têtes FR fixés', () => {
    const headers = ['Reçu n°', 'Heure de fin', 'Devise'];
    const rowEn = { 'Receipt No.': 'R1', 'Completion Time': 'T1', 'Currency': 'XAF' };
    const rowFr = { 'Reçu n°': 'R2', "Le temps d'achèvement": 'T2', 'Devise': 'EUR' };
    const out = alignRowsToHeaders([rowEn, rowFr], headers);
    expect(out).toEqual([
      { 'Reçu n°': 'R1', 'Heure de fin': 'T1', 'Devise': 'XAF' },
      { 'Reçu n°': 'R2', 'Heure de fin': 'T2', 'Devise': 'EUR' }
    ]);
  });
  it('aligne sur des en-têtes EN fixés', () => {
    const out = alignRowsToHeaders([{ 'Reçu n°': 'R2', 'Devise': 'XAF' }], ['Receipt No.', 'Currency']);
    expect(out).toEqual([{ 'Receipt No.': 'R2', 'Currency': 'XAF' }]);
  });
});

import { chooseBatchHeaderSet, getCanonicalFrenchLabel, resolveCanonicalColumnId } from './bilingual-column.util';
describe('chooseBatchHeaderSet (sans modèle)', () => {
  const EN = ['Receipt No.', 'Completion Time', 'Currency', 'Paid In', 'Balance', 'Remark'];
  const FR = ['Reçu n°', 'Heure de fin', 'Devise', 'Versé', 'Solde', 'Remarque'];
  it('garde les en-têtes anglais si le lot est en anglais', () => {
    expect(chooseBatchHeaderSet(EN)).toEqual(EN);
  });
  it('garde les en-têtes français si le lot est en français', () => {
    const out = chooseBatchHeaderSet(FR);
    expect(out.length).toBe(FR.length);
    out.forEach(h => expect(FR).toContain(h));
  });
  it('lot mixte : une seule langue, un seul nom par concept', () => {
    const out = chooseBatchHeaderSet([...EN, ...FR]);
    expect(out.length).toBe(EN.length);
    const langOk = out.every(h => EN.includes(h)) || out.every(h => FR.includes(h));
    expect(langOk).toBe(true);
  });
  it('empile les lignes EN et FR sous les en-têtes choisis', () => {
    const headers = chooseBatchHeaderSet([...EN, ...FR]);
    const rowEn = Object.fromEntries(EN.map((h, i) => [h, 'en' + i]));
    const rowFr = Object.fromEntries(FR.map((h, i) => [h, 'fr' + i]));
    const out = alignRowsToHeaders([rowEn, rowFr], headers);
    expect(Object.keys(out[0])).toEqual(headers);
    expect(out[1][headers[0]]).toBe('fr0');
  });
});

describe('chooseBatchHeaderSet avec langue imposée', () => {
  it('garde les libellés français quand le français est imposé, même si le lot est majoritairement anglais', () => {
    const keys = ['Receipt No.', 'Completion Time', 'Currency', 'Remark'];
    const frExpected = keys.map(k => getCanonicalFrenchLabel(resolveCanonicalColumnId(k)!));
    expect(chooseBatchHeaderSet(keys, 'fr')).toEqual(frExpected);
    expect(frExpected.every(label => !!label && !keys.includes(label!))).toBe(true);
    expect(chooseBatchHeaderSet(keys)).toEqual(['Receipt No.', 'Completion Time', 'Currency', 'Remark']);
  });
});
