import {
  applyExtraction,
  defaultExtractionColumnName,
  parseExtractionFormat,
  serializeExtractionFormat
} from './column-extraction.util';
import { applyColumnProcessingRulesAsync } from './column-processing.util';

describe('Extraction de données (Traitement et règles de modèle)', () => {
  it('extrait à gauche, à droite et le domaine e-mail', () => {
    expect(applyExtraction('ABCDEFGH', { type: 'firstChars', start: 1, count: 3 })).toBe('ABC');
    expect(applyExtraction('ABCDEFGH', { type: 'firstChars', start: 3, count: 2 })).toBe('CD');
    expect(applyExtraction('ABCDEFGH', { type: 'lastChars', start: 1, count: 3 })).toBe('FGH');
    expect(applyExtraction('ABCDEFGH', { type: 'lastChars', start: 2, count: 3 })).toBe('EFG');
    expect(applyExtraction('ABC', { type: 'lastChars', start: 2, count: 5 })).toBe('ABC');
    expect(applyExtraction('jean@intouch.sn', { type: 'emailDomain', start: 1, count: 1 })).toBe('intouch.sn');
    expect(applyExtraction('sans-arobase', { type: 'emailDomain', start: 1, count: 1 })).toBe('');
  });

  it('stocke et relit la configuration dans formatType', () => {
    const format = serializeExtractionFormat({ type: 'firstChars', start: 2, count: 4 });
    expect(format).toBe('extract:firstChars:2:4');
    expect(parseExtractionFormat(format)).toEqual({ type: 'firstChars', start: 2, count: 4 });
    expect(parseExtractionFormat('extract:emailDomain')).toEqual({ type: 'emailDomain', start: 1, count: 1 });
    expect(parseExtractionFormat('numeric')).toBeNull();
    expect(parseExtractionFormat('')).toBeNull();
    expect(defaultExtractionColumnName('Description', { type: 'lastChars', start: 1, count: 8 })).toBe('Description_fin_8');
  });

  it('règle de modèle : écrit l’extraction dans une nouvelle colonne, la source est conservée', async () => {
    const rows = [
      { Description: 'retrait 2026111551.jj1623715.544 de ouedraogo 61762960' },
      { Description: 'retrait 2026111424.iw1623715.408 de foner sawadogo 60210404' }
    ];
    const out = await applyColumnProcessingRulesAsync(rows, [{
      sourceColumn: 'Description',
      targetColumn: 'Téléphone',
      formatType: serializeExtractionFormat({ type: 'lastChars', start: 1, count: 8 }),
      trimSpaces: true
    }], 1000);
    expect(out.map(r => r['Téléphone'])).toEqual(['61762960', '60210404']);
    expect(out[0].Description).toBe('retrait 2026111551.jj1623715.544 de ouedraogo 61762960');
  });
});
