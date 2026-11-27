import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelPreProcessingConfig } from './auto-processing.service';
import { ModelCondition, rowMatchesModelConditions, cloneModelConditions } from '../utils/model-conditions.util';

describe('Traitement des modèles — conditions multiples par option', () => {
  const service = new ModelPreProcessingService();
  const moov: ModelCondition[] = [
    { column: 'Service', operator: 'EGAL', values: ['GA_CASHIN_MOOV', 'GA_CASHOUT_MOOV'] },
    { column: 'Pays', operator: 'DIFFERENT', values: ['CI'] }
  ];
  const rows = () => [
    { Service: 'GA_CASHIN_MOOV', Pays: 'GA', Tel: '065124699', Montant: '100' },
    { Service: 'ga_cashout_moov', Pays: 'GA', Tel: '062514399', Montant: '200' },
    { Service: 'GA_CASHIN_MOOV', Pays: 'CI', Tel: '070000000', Montant: '300' },
    { Service: 'AIRTEL', Pays: 'GA', Tel: '077023229', Montant: '400' }
  ];
  const run = (cfg: Partial<ModelPreProcessingConfig>) =>
    service.applyPreProcessingAsync(rows(), cfg as ModelPreProcessingConfig, {});

  it('utilitaire : toutes les conditions (ET), une des valeurs (OU), sans casse ; vide / non vide', () => {
    expect(rowMatchesModelConditions({ Service: 'ga_cashin_moov', Pays: 'GA' }, moov)).toBe(true);
    expect(rowMatchesModelConditions({ Service: 'GA_CASHIN_MOOV', Pays: 'CI' }, moov)).toBe(false);
    expect(rowMatchesModelConditions({ Agent: '' }, [{ column: 'Agent', operator: 'VIDE', values: [] }])).toBe(true);
    expect(rowMatchesModelConditions({ Agent: 'x' }, [{ column: 'Agent', operator: 'NON_VIDE', values: [] }])).toBe(true);
    // Condition incomplète (pas de colonne / pas de valeur) : ignorée.
    expect(rowMatchesModelConditions({ A: '1' }, [{ column: '', operator: 'EGAL', values: ['x'] }, { column: 'A', operator: 'EGAL', values: [] }])).toBe(true);
    expect(cloneModelConditions([{ column: ' A ', operator: 'VIDE', values: ['x'] }])).toEqual([{ column: 'A', operator: 'VIDE', values: [] }]);
    expect(cloneModelConditions([{ column: '', operator: 'EGAL', values: [] }])).toBeUndefined();
  });

  it('format : conditions de l’action + conditions de la colonne', async () => {
    const out = await run({
      formatActions: [{
        type: 'keepLastDigits', enabled: true, columns: ['Tel'], keepLastDigitsCount: 3,
        conditions: [moov[0]],
        columnSettings: { Tel: { keepLastDigitsCount: 3, conditions: [moov[1]] } }
      }]
    } as Partial<ModelPreProcessingConfig>);
    expect(out.map(r => r['Tel'])).toEqual(['699', '399', '070000000', '077023229']);
  });

  it('concaténation et calcul : seulement les lignes qui remplissent les conditions', async () => {
    const out = await run({
      columnConcatRules: [{ id: 'c', sourceColumns: ['Tel', 'Montant'], targetColumn: 'CLE', separator: '', enabled: true, removeSourceColumns: false, conditions: moov }],
      columnMathRules: [{ id: 'm', sourceColumnA: 'Montant', sourceColumnB: '', constantB: '2', targetColumn: 'Double', operation: 'multiply', enabled: true, conditions: moov }]
    });
    expect(out.map(r => r['CLE'])).toEqual(['065124699100', '062514399200', '', '']);
    expect(out.map(r => r['Double'])).toEqual(['200', '400', '', '']);
  });

  it('renommage d’en-tête avec conditions : par ligne, les deux colonnes conservées', async () => {
    const out = await run({
      columnRenameRules: [{ id: 'r', sourceColumn: 'Montant', targetColumn: 'Montant MOOV', enabled: true, conditions: moov }]
    });
    expect(out.map(r => r['Montant MOOV'])).toEqual(['100', '200', '', '']);
    expect(out.map(r => r['Montant'])).toEqual(['', '', '300', '400']);
    // Même colonnes, même ordre sur toutes les lignes : la nouvelle juste après l'ancienne.
    out.forEach(r => expect(Object.keys(r).slice(0, 5)).toEqual(['Service', 'Pays', 'Tel', 'Montant', 'Montant MOOV']));
    // Sans condition : simple renommage de l'en-tête.
    const simple = await run({ columnRenameRules: [{ id: 'r', sourceColumn: 'Montant', targetColumn: 'Amount', enabled: true }] });
    expect(simple.map(r => r['Amount'])).toEqual(['100', '200', '300', '400']);
    expect(simple.some(r => 'Montant' in r)).toBe(false);
  });

  it('renommage des valeurs : conditions multiples en plus de la 2e valeur', async () => {
    const out = await run({
      valueMappings: [{ id: 'v', column: 'Montant', fromValue: '100', toValue: 'CENT', enabled: true, conditions: moov }]
    });
    expect(out[0]['Montant']).toBe('CENT');
    const autre = await service.applyPreProcessingAsync(
      [{ Service: 'AIRTEL', Pays: 'GA', Montant: '100' }],
      { valueMappings: [{ id: 'v', column: 'Montant', fromValue: '100', toValue: 'CENT', enabled: true, conditions: moov }] } as ModelPreProcessingConfig,
      {}
    );
    expect(autre[0]['Montant']).toBe('100');
  });

  it('doublons entre deux colonnes : seules les lignes qui remplissent les conditions sont comparées', async () => {
    const data = [
      { A: '1', B: '', Service: 'X' },
      { A: '', B: '1', Service: 'X' },
      { A: '2', B: '', Service: 'Y' },
      { A: '', B: '2', Service: 'X' }
    ];
    const out = await service.applyPreProcessingAsync(data, {
      crossDedupRules: [{ id: 'd', columnA: 'A', columnB: 'B', deleteSide: 'A', enabled: true,
        conditions: [{ column: 'Service', operator: 'EGAL', values: ['X'] }] }]
    } as ModelPreProcessingConfig, {});
    // A=1 (Service X) supprimée ; A=2 (Service Y) hors conditions : conservée.
    expect(out.map(r => r['A'])).toEqual(['', '2', '']);
  });

  it('les colonnes des conditions sont conservées en entrée du traitement', () => {
    const cols = service.collectInputColumns({
      columnConcatRules: [{ id: 'c', sourceColumns: ['Tel', 'Montant'], targetColumn: 'CLE', separator: '', enabled: true, conditions: moov }]
    } as ModelPreProcessingConfig);
    expect(cols).toEqual(expect.arrayContaining(['Service', 'Pays']));
  });
});
