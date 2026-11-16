import { TextDecoder as NodeTextDecoder } from 'util';
import { fixCellEncoding } from './encoding-fixer';
import { normalizeColumnKey } from './row-column.util';

// jsdom ne fournit pas TextDecoder (disponible dans les navigateurs).
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = NodeTextDecoder;
}

describe('encoding-fixer', () => {
  it('répare les majuscules accentuées dont le 2e octet tombe dans la plage Windows-1252 (Ã‰ → É)', () => {
    expect(fixCellEncoding('NUMÃ‰RO TRANSACTION GU')).toBe('NUMÉRO TRANSACTION GU');
    expect(fixCellEncoding('Ã€VALIDER')).toBe('ÀVALIDER');
  });

  it('associe un en-tête mal encodé à la colonne configurée dans le modèle', () => {
    expect(normalizeColumnKey('NUMÃ‰RO TRANSACTION GU')).toBe(normalizeColumnKey('NUMÉRO TRANSACTION GU'));
  });

  it('conserve les cas existants et le texte Unicode déjà correct', () => {
    expect(fixCellEncoding('DÃ©bit')).toBe('Débit');
    expect(fixCellEncoding('l’opération à 10 €')).toBe('l’opération à 10 €');
    expect(fixCellEncoding('NUMÉRO TRANSACTION GU')).toBe('NUMÉRO TRANSACTION GU');
  });
});
