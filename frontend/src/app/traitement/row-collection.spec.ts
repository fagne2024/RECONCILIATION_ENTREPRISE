import { RowCollection } from './row-collection';

describe('RowCollection', () => {
  const sample = () => [
    { ref: 'A', montant: '10' },
    { ref: 'B', montant: '20' },
    { ref: 'C', montant: '30' },
  ];

  it('se construit depuis un tableau et expose length', () => {
    const c = RowCollection.from(sample());
    expect(c.length).toBe(3);
  });

  it('itère comme un tableau (for...of et spread)', () => {
    const c = RowCollection.from(sample());
    const refs: string[] = [];
    for (const row of c) refs.push(row['ref']);
    expect(refs).toEqual(['A', 'B', 'C']);
    expect([...c].map(r => r['ref'])).toEqual(['A', 'B', 'C']);
  });

  it('map, filter, find, some, every, reduce et slice reproduisent les résultats d\'un tableau', () => {
    const c = RowCollection.from(sample());
    expect(c.map(r => r['montant'])).toEqual(['10', '20', '30']);
    expect(c.filter(r => r['ref'] !== 'B').length).toBe(2);
    expect(c.find(r => r['ref'] === 'C')).toEqual({ ref: 'C', montant: '30' });
    expect(c.some(r => r['ref'] === 'Z')).toBe(false);
    expect(c.every(r => r['montant'] !== undefined)).toBe(true);
    expect(c.reduce((acc, r) => acc + Number(r['montant']), 0)).toBe(60);
    expect(c.slice(1).map(r => r['ref'])).toEqual(['B', 'C']);
    expect(c.slice(-1).map(r => r['ref'])).toEqual(['C']);
  });

  it('lecture seule : modifier l\'objet reçu dans forEach ne modifie pas la collection', () => {
    const c = RowCollection.from(sample());
    c.forEach(row => { row['montant'] = 'changé'; });
    expect(c.at(0)['montant']).toBe('10');
  });

  it('mutateEach persiste les modifications de chaque ligne', () => {
    const c = RowCollection.from(sample());
    c.mutateEach((row, i) => {
      row['montant'] = `${row['montant']}-${i}`;
      if (row['ref'] === 'B') return;
    });
    expect(c.map(r => r['montant'])).toEqual(['10-0', '20-1', '30-2']);
  });

  it('setAt remplace une ligne par index', () => {
    const c = RowCollection.from(sample());
    c.setAt(1, { ref: 'X', montant: '99' });
    expect(c.at(1)).toEqual({ ref: 'X', montant: '99' });
    expect(c.length).toBe(3);
  });

  it('push accepte plusieurs lignes et renvoie la nouvelle taille', () => {
    const c = new RowCollection();
    expect(c.push({ a: '1' }, { a: '2' })).toBe(2);
    expect(c.toArray()).toEqual([{ a: '1' }, { a: '2' }]);
  });

  it('clone est indépendant de l\'original', () => {
    const original = RowCollection.from(sample());
    const copy = original.clone();
    copy.mutateEach(row => { row['montant'] = 'copie'; });
    copy.push({ ref: 'D', montant: '40' });

    expect(original.length).toBe(3);
    expect(original.at(0)['montant']).toBe('10');
    expect(copy.length).toBe(4);
    expect(copy.at(0)['montant']).toBe('copie');
  });

  it('toArray matérialise des objets indépendants du stockage', () => {
    const c = RowCollection.from(sample());
    const arr = c.toArray();
    arr[0]['ref'] = 'modifié';
    expect(c.at(0)['ref']).toBe('A');
  });

  it('clear vide la collection', () => {
    const c = RowCollection.from(sample());
    c.clear();
    expect(c.length).toBe(0);
    expect([...c]).toEqual([]);
  });

  it('from accepte null et undefined comme collection vide', () => {
    expect(RowCollection.from(null).length).toBe(0);
    expect(RowCollection.from(undefined).length).toBe(0);
  });
});
