import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelColumnMathRule, ModelPreProcessingConfig } from './auto-processing.service';

describe('Calcul entre colonnes — nombre fixe en B', () => {
  const service = new ModelPreProcessingService();

  const rule = (extra: Partial<ModelColumnMathRule>): ModelColumnMathRule => ({
    id: 'm', sourceColumnA: 'Montant CI', sourceColumnB: '', targetColumn: 'Résultat',
    operation: 'divide', enabled: true, ...extra
  });
  const run = (r: ModelColumnMathRule, rows: Record<string, string>[]) =>
    service.applyPreProcessing(rows, { columnMathRules: [r] } as ModelPreProcessingConfig);

  it('divise / multiplie / ajoute / soustrait un nombre fixe', () => {
    const rows = [{ 'Montant CI': '1500' }];
    expect(run(rule({ constantB: '100' }), rows)[0]['Résultat']).toBe('15');
    expect(run(rule({ constantB: '1,5', operation: 'multiply' }), rows)[0]['Résultat']).toBe('2250');
    expect(run(rule({ constantB: '-500', operation: 'add' }), rows)[0]['Résultat']).toBe('1000');
    expect(run(rule({ constantB: '0.5', operation: 'subtract' }), rows)[0]['Résultat']).toBe('1499.5');
  });

  it('le format décimal suit la colonne A ; division par zéro = cellule vide', () => {
    expect(run(rule({ constantB: '4' }), [{ 'Montant CI': '10,0' }])[0]['Résultat']).toBe('2,5');
    expect(run(rule({ constantB: '0' }), [{ 'Montant CI': '10' }])[0]['Résultat']).toBe('');
  });

  it('nombre fixe vide ou invalide : règle inactive', () => {
    expect(service.getActiveColumnMathRules([rule({ constantB: '' }), rule({ constantB: 'abc' })])).toEqual([]);
    expect(run(rule({ constantB: 'abc' }), [{ 'Montant CI': '10' }])[0]['Résultat']).toBeUndefined();
  });

  it('B colonne : comportement inchangé', () => {
    const out = run(rule({ sourceColumnB: 'Taux', operation: 'multiply' }), [{ 'Montant CI': '10', Taux: '3' }]);
    expect(out[0]['Résultat']).toBe('30');
  });
});
