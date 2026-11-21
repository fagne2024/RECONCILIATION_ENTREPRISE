import { parseSpecialStringsToRemove, removeSpecialStrings } from './special-string-removal.util';

describe('Suppression de chaînes spéciales multiples', () => {
  it('sépare par virgule, ignore les espaces, plus longue d\'abord', () => {
    expect(parseSpecialStringsToRemove(' _CI, _CITCH ,_BF,,')).toEqual(['_CITCH', '_CI', '_BF']);
    expect(parseSpecialStringsToRemove(',')).toEqual([',']);
    expect(parseSpecialStringsToRemove('')).toEqual([]);
  });

  it('mode fin : retire _CM, _CI ou _BF selon la valeur', () => {
    const cfg = '_CM, _CI, _BF';
    expect(removeSpecialStrings('PAIEMENT_CM', cfg, 'end')).toBe('PAIEMENT');
    expect(removeSpecialStrings('PAIEMENT_CI', cfg, 'end')).toBe('PAIEMENT');
    expect(removeSpecialStrings('PAIEMENT_BF', cfg, 'end')).toBe('PAIEMENT');
    expect(removeSpecialStrings('PAIEMENT_SN', cfg, 'end')).toBe('PAIEMENT_SN');
    expect(removeSpecialStrings('X_CITCH', '_CI,_CITCH', 'end')).toBe('X');
  });

  it('mode début et toutes les occurrences', () => {
    expect(removeSpecialStrings('CM_CASHIN', 'CI_,CM_', 'start')).toBe('CASHIN');
    expect(removeSpecialStrings('A_CM-B_CI', '_CM,_CI', 'all')).toBe('A-B');
  });

  it('une seule chaîne : comportement inchangé', () => {
    expect(removeSpecialStrings('ABC_CM', '_CM', 'end')).toBe('ABC');
    expect(removeSpecialStrings('1,5', ',', 'all')).toBe('15');
  });
});
