import { applyColumnProcessingRulesToRow, applyColumnProcessingRulesSync } from './column-processing.util';
import { ColumnProcessingRule } from '../models/column-processing-rule.model';

describe('column-processing.util', () => {
  it('conserve les points dans IDTransaction malgré removeSpecialChars', () => {
    const row: Record<string, string> = {
      IDTransaction: 'CO260628.2356.D41732'
    };
    const rules: ColumnProcessingRule[] = [{
      sourceColumn: 'IDTransaction',
      targetColumn: 'IDTransaction',
      removeSpecialChars: true,
      trimSpaces: true
    }];

    applyColumnProcessingRulesToRow(row, rules);
    expect(row.IDTransaction).toBe('CO260628.2356.D41732');
  });

  it('conserve les points de l\'ID Partenaire Orange Money malgré removeSpecialChars (TRXGU1)', () => {
    const row: Record<string, string> = {
      'ID Partenaire': 'MP261121.2357.A64116_CI'
    };
    const rules: ColumnProcessingRule[] = [{
      sourceColumn: 'ID Partenaire',
      targetColumn: '',
      removeSpecialChars: true,
      stringToRemove: '_CM, _CI, _BF, _ML, _GA'
    }];

    applyColumnProcessingRulesToRow(row, rules);
    expect(row['ID Partenaire']).toBe('MP261121.2357.A64116');
  });

  it('supprime toujours les points hors colonnes identifiant', () => {
    const row: Record<string, string> = { Libelle: 'A.B-C' };
    applyColumnProcessingRulesToRow(row, [{ sourceColumn: 'Libelle', targetColumn: 'Libelle', removeSpecialChars: true }]);
    expect(row.Libelle).toBe('ABC');
  });

  it('applique les règles en lot synchrone via plan précompilé', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      MSISDN: ` 050141527${i % 10} `,
      IDTransaction: `CO260628.2356.D${i}`
    }));
    const rules: ColumnProcessingRule[] = [{
      sourceColumn: 'MSISDN',
      targetColumn: 'MSISDN',
      trimSpaces: true,
      removeSpecialChars: true
    }];

    applyColumnProcessingRulesSync(data, rules);
    expect(data[0].MSISDN).toBe('0501415270');
    expect(data[0].IDTransaction).toBe('CO260628.2356.D0');
  });
});
