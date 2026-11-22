import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelRowFilter } from './auto-processing.service';

/**
 * Équivalent de la requête USSD GA :
 *   tag = 'sended' OR (tag = 'finished' AND actionDone IS NOT NULL)
 */
describe('ModelPreProcessingService — conditions par valeur des filtres de lignes', () => {
  const service = new ModelPreProcessingService();

  const filter: ModelRowFilter = {
    id: 'f1',
    column: 'STATUT',
    selectedValues: ['sended', 'finished'],
    enabled: true,
    valueConditions: [{ values: ['finished'], column: 'actionDone', operator: 'notEmpty' }]
  };

  const rows = [
    { ID: '1', STATUT: 'sended', actionDone: '' },
    { ID: '2', STATUT: 'finished', actionDone: 'REFUND' },
    { ID: '3', STATUT: 'finished', actionDone: '' },
    { ID: '4', STATUT: 'finished', actionDone: 'NULL' },
    { ID: '5', STATUT: 'initiated', actionDone: 'X' }
  ];

  it('garde sended, et finished seulement si actionDone n\'est pas vide (NULL = vide)', () => {
    expect(service.applyRowFilters(rows, [filter]).map(r => r.ID)).toEqual(['1', '2']);
  });

  it('opérateur « est vide » : sended seulement si actionDone est vide', () => {
    const sendedEmpty: ModelRowFilter = {
      ...filter,
      valueConditions: [{ values: ['sended'], column: 'actionDone', operator: 'empty' }]
    };
    const data = [...rows, { ID: '6', STATUT: 'sended', actionDone: 'X' }];
    expect(service.applyRowFilters(data, [sendedEmpty]).map(r => r.ID)).toEqual(['1', '2', '3', '4']);
  });

  it('opérateurs égal / différent', () => {
    const equals: ModelRowFilter = {
      ...filter,
      valueConditions: [{ values: ['finished'], column: 'actionDone', operator: 'equals', value: 'REFUND' }]
    };
    expect(service.applyRowFilters(rows, [equals]).map(r => r.ID)).toEqual(['1', '2']);
    const notEquals: ModelRowFilter = {
      ...filter,
      valueConditions: [{ values: ['finished'], column: 'actionDone', operator: 'notEquals', value: 'REFUND' }]
    };
    expect(service.applyRowFilters(rows, [notEquals]).map(r => r.ID)).toEqual(['1', '3', '4']);
  });

  it('sans condition, le filtre garde son comportement', () => {
    const plain: ModelRowFilter = { ...filter, valueConditions: undefined };
    expect(service.applyRowFilters(rows, [plain]).map(r => r.ID)).toEqual(['1', '2', '3', '4']);
  });
});
