import { CompactRowStore } from './compact-row-store';

describe('CompactRowStore', () => {
  let store: CompactRowStore;

  beforeEach(() => {
    store = new CompactRowStore();
  });

  it('restitue une ligne identique à celle poussée (chaînes, nombres, booléens)', () => {
    store.push({ ref: 'A1', montant: 1500.5, actif: true, note: '' });

    expect(store.length).toBe(1);
    expect(store.get(0)).toEqual({ ref: 'A1', montant: 1500.5, actif: true, note: '' });
  });

  it('traite null et undefined comme clé absente', () => {
    store.push({ a: 'x', b: null, c: undefined });

    expect(store.get(0)).toEqual({ a: 'x' });
    expect(Object.keys(store.get(0))).toEqual(['a']);
    expect(store.cell(0, 'b')).toBeUndefined();
  });

  it('gère des colonnes ajoutées après les premières lignes', () => {
    store.push({ a: '1' });
    store.push({ a: '2', b: 'nouveau' });

    expect(store.columns).toEqual(['a', 'b']);
    expect(store.get(0)).toEqual({ a: '1' });
    expect(store.cell(0, 'b')).toBeUndefined();
    expect(store.cell(1, 'b')).toBe('nouveau');
  });

  it('cell() renvoie la valeur d\'une cellule et undefined pour une colonne inconnue', () => {
    store.push({ ref: 'R-9', montant: '10' });

    expect(store.cell(0, 'ref')).toBe('R-9');
    expect(store.cell(0, 'montant')).toBe('10');
    expect(store.cell(0, 'inexistante')).toBeUndefined();
  });

  it('préserve les caractères spéciaux (séparateurs, guillemets, retours ligne, unicode)', () => {
    const tricky = 'a;b,c\t"d"\nligne\u001fséparateur é ✓ 💰';
    store.push({ texte: tricky, vide: '' });

    expect(store.cell(0, 'texte')).toBe(tricky);
    expect(store.get(0)).toEqual({ texte: tricky, vide: '' });
  });

  it('setCell modifie une cellule sans altérer les autres', () => {
    store.push({ a: '1', b: '2' });
    store.push({ a: '3', b: '4' });

    store.setCell(1, 'b', 'modifié');
    store.setCell(0, 'c', 42);

    expect(store.get(0)).toEqual({ a: '1', b: '2', c: 42 });
    expect(store.get(1)).toEqual({ a: '3', b: 'modifié' });
  });

  it('setCell avec null retire la valeur de la ligne', () => {
    store.push({ a: '1', b: '2' });

    store.setCell(0, 'b', null);

    expect(store.get(0)).toEqual({ a: '1' });
  });

  it('mapInPlace applique une transformation à toutes les lignes', () => {
    store.pushAll([{ a: '1' }, { a: '2' }, { a: '3' }]);

    store.mapInPlace((row, i) => ({ ...row, a: `${row.a}-${i}` }));

    expect(store.toArray()).toEqual([{ a: '1-0' }, { a: '2-1' }, { a: '3-2' }]);
  });

  it('forEach parcourt les lignes dans l\'ordre d\'insertion', () => {
    store.pushAll([{ n: 'a' }, { n: 'b' }, { n: 'c' }]);
    const seen: string[] = [];

    store.forEach((row, i) => seen.push(`${i}:${row['n']}`));

    expect(seen).toEqual(['0:a', '1:b', '2:c']);
  });

  it('clear vide les lignes mais conserve les colonnes connues', () => {
    store.push({ a: '1', b: '2' });

    store.clear();

    expect(store.length).toBe(0);
    expect(store.columns).toEqual(['a', 'b']);
  });

  it('setColumns fixe l\'ordre des colonnes', () => {
    store.setColumns(['z', 'a']);
    store.push({ a: '1', z: '2' });

    expect(store.columns).toEqual(['z', 'a']);
    expect(store.get(0)).toEqual({ a: '1', z: '2' });
  });

  it('lève une erreur explicite pour un index hors limites', () => {
    store.push({ a: '1' });

    expect(() => store.get(5)).toThrow(RangeError);
    expect(() => store.cell(-1, 'a')).toThrow(RangeError);
  });

  it('pushAll gère un gros lot sans limite d\'arguments', () => {
    const rows = Array.from({ length: 200000 }, (_, i) => ({ id: String(i) }));

    store.pushAll(rows);

    expect(store.length).toBe(200000);
    expect(store.cell(199999, 'id')).toBe('199999');
  });

  it('le cache de décodage ne renvoie pas de valeur périmée après setCell', () => {
    store.push({ a: '1' });
    expect(store.cell(0, 'a')).toBe('1');

    store.setCell(0, 'a', '2');

    expect(store.cell(0, 'a')).toBe('2');
  });
});
