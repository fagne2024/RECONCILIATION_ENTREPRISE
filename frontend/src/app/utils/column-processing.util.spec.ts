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
