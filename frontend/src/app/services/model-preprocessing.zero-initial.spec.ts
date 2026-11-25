import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelFormatAction } from './auto-processing.service';

/**
 * « Supprimer / conserver des caractères » + « Ne pas conserver le 0 initial » :
 * le 0 est retiré avant le comptage des caractères et n'apparaît pas dans le résultat.
 */
describe('ModelPreProcessingService — zéro initial non conservé', () => {
  const service = new ModelPreProcessingService();
  const tel = 'Téléphone client';

  const run = (values: string[], settings: Record<string, unknown>, pays = 'GA') => {
    const action = {
      id: 'format-2', type: 'removeCharacters', enabled: true, columns: [tel], order: 2,
      removeCharMode: 'remove', removeCharPosition: 'start', removeCharCount: 1, leadingZeroMode: 'none',
      columnSettings: { [tel]: { removeCharSpecificPosition: 1, ...settings } }
    } as unknown as ModelFormatAction;
    const rows = values.map(v => ({ [tel]: v, Pays: pays }));
    service.applyFormatActions(rows, [action]);
    return rows.map(r => r[tel]);
  };

  it('065124 → 65124', () => {
    expect(run(['065124'], { removeCharMode: 'keep', removeCharPosition: 'start', removeCharCount: 8, leadingZeroMode: 'strip' }))
      .toEqual(['65124']);
  });

  it('config TRXGU1 GA : conserver 8 caractères sans le 0 → 066696187 donne 66696187', () => {
    expect(run(['066696187', '065589036'], {
      removeCharMode: 'keep', removeCharPosition: 'start', removeCharCount: 8, leadingZeroMode: 'strip',
      applyConditionEnabled: true, conditionColumn: 'Pays', conditionValue: 'GA'
    })).toEqual(['66696187', '65589036']);
  });

  it('valeurs au format texte Excel ="…" (export GU) : enveloppe retirée puis 0 retiré', () => {
    expect(run(['="066696187"', '="065124"', '="062911742"'], {
      removeCharMode: 'keep', removeCharPosition: 'start', removeCharCount: 8, leadingZeroMode: 'strip',
      applyConditionEnabled: true, conditionColumn: 'Pays', conditionValue: 'GA'
    })).toEqual(['66696187', '65124', '62911742']);
  });

  it('un seul 0 est retiré (pas de double finalisation)', () => {
    expect(run(['00123'], { removeCharMode: 'keep', removeCharPosition: 'start', removeCharCount: 10, leadingZeroMode: 'strip' }))
      .toEqual(['0123']);
  });

  it('0 apparu en tête après suppression d\'un préfixe : retiré du résultat', () => {
    expect(run(['241065124'], { removeCharMode: 'remove', removeCharPosition: 'start', removeCharCount: 3, leadingZeroMode: 'strip' }))
      .toEqual(['65124']);
  });

  it('sans « ne pas conserver le 0 », le 0 reste', () => {
    expect(run(['065124'], { removeCharMode: 'keep', removeCharPosition: 'start', removeCharCount: 8, leadingZeroMode: 'none' }))
      .toEqual(['065124']);
  });
});
