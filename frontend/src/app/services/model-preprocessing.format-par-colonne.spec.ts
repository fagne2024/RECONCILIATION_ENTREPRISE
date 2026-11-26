import { ModelPreProcessingService, createPreProcessingUsage } from './model-preprocessing.service';
import { ModelPreProcessingConfig } from './auto-processing.service';
import { I18nService } from './i18n/i18n.service';
import { mergeBilingualColumnsInRows } from '../utils/bilingual-column.util';

/**
 * Cas TRXGU1 : action « Supprimer des caractères » dont les réglages par défaut (supprimer 1 caractère)
 * sont remplacés, pour « Téléphone client », par des paramètres de colonne avec leur propre condition.
 */
describe('ModelPreProcessingService — paramètres de format par colonne (TRXGU1)', () => {
  const service = new ModelPreProcessingService();

  // Traductions absentes en test : la clé seule ne distinguerait pas les réglages décrits.
  beforeEach(() => {
    jest.spyOn(I18nService, 't').mockImplementation((key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${Object.values(params).join('|')})` : key);
  });
  afterEach(() => jest.restoreAllMocks());

  const config = (): ModelPreProcessingConfig => ({
    formatActions: [{
      id: 'format-2', type: 'removeCharacters', enabled: true, columns: ['Téléphone client'],
      removeCharMode: 'remove', removeCharPosition: 'start', removeCharCount: 1, leadingZeroMode: 'none',
      applyConditionEnabled: false, conditionColumn: '', conditionValue: '',
      columnSettings: {
        'Téléphone client': {
          removeCharMode: 'keep', removeCharPosition: 'start', removeCharCount: 5, leadingZeroMode: 'strip',
          applyConditionEnabled: true, conditionColumn: 'Service',
          conditionValue: 'GA_CASHIN_MOOV, MYTP_GA_CASHIN_MOOV, GA_CASHOUT_MOOV'
        }
      }
    }]
  } as ModelPreProcessingConfig);

  const rows = () => [
    { 'téléphone client': '065124699', Service: 'GA_CASHIN_MOOV' },
    { 'téléphone client': '062911718', Service: 'MYTP_GA_CASHIN_MOOV' },
    { 'téléphone client': '062514399', Service: 'GA_CASHOUT_MOOV' },
    { 'téléphone client': '077023229', Service: 'GA_PAIEMENTMARCHAND_AIRTEL' }
  ];

  it('applique les paramètres de la colonne, seulement aux services de la condition', async () => {
    const out = await service.applyPreProcessingAsync(rows(), config(), {});
    expect(out.map(r => r['téléphone client'])).toEqual(['65124', '62911', '62514', '077023229']);
  });

  it('fichier « téléphone client » + copie « Téléphone client » : l’export garde la valeur formatée', async () => {
    // Copie ajoutée par l'enrichissement des colonnes (nom exact du modèle) avant le pré-traitement.
    const input = rows().map(r => ({ ...r, 'Téléphone client': r['téléphone client'] }));
    const cfg = {
      ...config(),
      columnConcatRules: [{ id: 'c', sourceColumns: ['Téléphone client', 'Montant'], targetColumn: 'CLECI', separator: '', enabled: true, removeSourceColumns: false }]
    } as ModelPreProcessingConfig;
    input.forEach(r => (r as Record<string, string>)['Montant'] = '15000');
    const out = await service.applyPreProcessingAsync(input, cfg, {});
    const { rows: merged } = mergeBilingualColumnsInRows(out, ['Téléphone client', 'Montant', 'Service', 'CLECI']);
    expect(merged.map(r => r['Téléphone client'])).toEqual(['65124', '62911', '62514', '077023229']);
    expect(merged[0]['CLECI']).toBe('6512415000');
  });

  it('fusion des colonnes : la valeur de la colonne au nom du modèle est prioritaire', () => {
    const { rows: merged } = mergeBilingualColumnsInRows(
      [{ 'téléphone client': '065124699', 'Téléphone client': '65124' }],
      ['Téléphone client']
    );
    expect(merged[0]).toEqual({ 'Téléphone client': '65124' });
  });

  it('le résumé décrit les paramètres de la colonne, pas les réglages par défaut de l’action', async () => {
    const cfg = config();
    const usage = createPreProcessingUsage();
    await service.applyPreProcessingAsync(rows(), cfg, { usage });
    const fromColumn = (service as any).describeFormatAction(
      (service as any).formatActionAppliedToColumn(cfg.formatActions![0], 'Téléphone client'),
      ['Téléphone client']
    );
    const fromAction = (service as any).describeFormatAction(cfg.formatActions![0], ['Téléphone client']);
    expect(fromColumn).not.toEqual(fromAction);
    const summary = service.getPreProcessingSummary(cfg, usage);
    expect(summary.detailText).toContain(fromColumn);
    expect(summary.detailText).not.toContain(fromAction);
  });
});
