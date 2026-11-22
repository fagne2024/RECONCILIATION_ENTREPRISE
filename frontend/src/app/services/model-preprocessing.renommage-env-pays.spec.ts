import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelPreProcessingConfig } from './auto-processing.service';

describe('ModelPreProcessingService — conditions ENV et pays du renommage des valeurs', () => {
  const service = new ModelPreProcessingService();

  const mappings = [
    { id: 'm1', column: 'Service', fromValue: 'Cash in', toValue: 'CASHIN_OM_BET_CI', envConditionValue: 'BET', paysConditionValue: 'CI', enabled: true },
    { id: 'm2', column: 'Service', fromValue: 'Cash in', toValue: 'CASHIN_OM_SN', paysConditionValue: 'SN', enabled: true },
    { id: 'm3', column: 'Service', fromValue: 'Cash out', toValue: 'CASHOUT_HT', envConditionValue: 'HT', enabled: true }
  ];

  const run = (env: string | null, pays: string | null, rows: Record<string, string>[]) => {
    const cfg = {
      valueMappings: mappings.map(m => ({ ...m })),
      ...(env ? { envColumn: { enabled: true, value: env } } : {}),
      ...(pays ? { paysColumn: { enabled: true, value: pays } } : {})
    } as ModelPreProcessingConfig;
    return service.applyPreProcessingAsync(rows, cfg, {});
  };

  it('applique le renommage seulement si l’ENV et le pays choisis correspondent', async () => {
    const out = await run('BET', 'CI', [{ Service: 'Cash in' }, { Service: 'Cash out' }]);
    expect(out.map(r => r['Service'])).toEqual(['CASHIN_OM_BET_CI', 'Cash out']);
  });

  it('condition pays seule : indépendante de l’ENV', async () => {
    const out = await run('HT', 'SN', [{ Service: 'Cash in' }, { Service: 'Cash out' }]);
    expect(out.map(r => r['Service'])).toEqual(['CASHIN_OM_SN', 'CASHOUT_HT']);
  });

  it('sans ENV ni pays choisis : lit les colonnes ENV / Pays du fichier (ex. BO)', async () => {
    const out = await run(null, null, [
      { Service: 'Cash in', ENV: 'bet', Pays: 'CI' },
      { Service: 'Cash in', ENV: 'BET', Pays: 'ML' },
      { Service: 'Cash in' }
    ]);
    expect(out.map(r => r['Service'])).toEqual(['CASHIN_OM_BET_CI', 'Cash in', 'Cash in']);
  });

  it('un renommage sans condition ENV / pays s’applique toujours', async () => {
    const cfg = {
      valueMappings: [{ id: 'm', column: 'Service', fromValue: 'A', toValue: 'B', enabled: true }],
      envColumn: { enabled: true, value: 'GU3' }
    } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync([{ Service: 'A' }], cfg, {});
    expect(out[0]['Service']).toBe('B');
  });
});
