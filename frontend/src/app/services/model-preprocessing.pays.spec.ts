import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelPreProcessingConfig, PAYS_COLUMN_NAME } from './auto-processing.service';

describe('ModelPreProcessingService — colonne PAYS', () => {
  const service = new ModelPreProcessingService();

  it('écrit le code pays (en majuscules) sur toutes les lignes, en remplaçant une valeur existante', async () => {
    const cfg = { paysColumn: { enabled: true, value: 'ci' } } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync([{ Ref: '1' }, { Ref: '2', PAYS: 'SN' }], cfg, {});
    expect(out.map(r => r[PAYS_COLUMN_NAME])).toEqual(['CI', 'CI']);
    expect(service.hasPreProcessing(cfg)).toBe(true);
  });

  it('colonne déclarée sans code : rien n’est écrit, mais la colonne figure dans les colonnes du modèle', async () => {
    const cfg = { paysColumn: { enabled: true } } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync([{ Ref: '1' }], cfg, {});
    expect(out[0][PAYS_COLUMN_NAME]).toBeUndefined();
    expect(service.getActivePaysColumnValue(cfg)).toBeNull();
    expect(service.isPaysColumnDeclared(cfg)).toBe(true);
  });

  it('désactivée : aucune colonne', async () => {
    const cfg = { paysColumn: { enabled: false, value: 'CI' } } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync([{ Ref: '1' }], cfg, {});
    expect(out[0][PAYS_COLUMN_NAME]).toBeUndefined();
  });
});
