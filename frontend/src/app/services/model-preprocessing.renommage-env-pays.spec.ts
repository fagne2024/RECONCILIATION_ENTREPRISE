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

  it('condition évaluée sur les colonnes ENV / PAYS du résultat : pas d’alias (Pays provenance, Country, Devise)', async () => {
    const out = await run(null, null, [
      { Service: 'Cash in', ENV: 'BET', 'Pays provenance': 'CI' },
      { Service: 'Cash in', ENV: 'BET', Country: 'CI' },
      { Service: 'Cash in', 'Country of origin': 'SN', Devise: 'SN' },
      { Service: 'Cash in', ENV: 'BET', PAYS: 'CI' }
    ]);
    expect(out.map(r => r['Service'])).toEqual(['Cash in', 'Cash in', 'Cash in', 'CASHIN_OM_BET_CI']);
  });

  it('ENV / PAYS vides dans le résultat : le renommage conditionnel n’est pas appliqué', async () => {
    const out = await run(null, null, [
      { Service: 'Cash in', ENV: '  ', PAYS: 'CI' },
      { Service: 'Cash out', ENV: '' }
    ]);
    expect(out.map(r => r['Service'])).toEqual(['Cash in', 'Cash out']);
  });

  describe('ENV / PAYS produits par une section placée après le renommage des valeurs', () => {
    const base = (extra: Partial<ModelPreProcessingConfig>) => ({
      valueMappings: mappings.map(m => ({ ...m })),
      ...extra
    } as ModelPreProcessingConfig);

    it('renommage d’en-tête Country → PAYS (ordre par défaut) : condition lue sur le PAYS du résultat', async () => {
      const cfg = base({
        columnRenameRules: [
          { id: 'r1', sourceColumn: 'Country', targetColumn: 'PAYS', enabled: true },
          { id: 'r2', sourceColumn: 'Environnement', targetColumn: 'ENV', enabled: true }
        ]
      });
      const out = await service.applyPreProcessingAsync([
        { Service: 'Cash in', Environnement: 'BET', Country: 'CI' },
        { Service: 'Cash in', Environnement: 'BET', Country: 'ML' },
        { Service: 'Cash in', Environnement: 'BET' },
        { Service: 'Cash out', Environnement: 'HT', Country: 'CI' }
      ], cfg, {});
      expect(out.map(r => r['Service'])).toEqual(['CASHIN_OM_BET_CI', 'Cash in', 'Cash in', 'CASHOUT_HT']);
      expect(out.every(r => Object.keys(r).every(k => !k.startsWith('__')))).toBe(true);
    });

    it('même résultat avec le traitement synchrone', () => {
      const cfg = base({
        columnRenameRules: [{ id: 'r1', sourceColumn: 'Country', targetColumn: 'PAYS', enabled: true }]
      });
      const out = service.applyPreProcessing([
        { Service: 'Cash in', Country: 'SN' },
        { Service: 'Cash in', Country: 'CI' }
      ], cfg);
      expect(out.map(r => r['Service'])).toEqual(['CASHIN_OM_SN', 'Cash in']);
      expect(Object.keys(out[0])).toEqual(['Service', 'PAYS']);
    });

    it('la colonne renommée suit aussi un renommage d’en-tête postérieur', async () => {
      const cfg = base({
        columnRenameRules: [
          { id: 'r1', sourceColumn: 'Country', targetColumn: 'PAYS', enabled: true },
          { id: 'r2', sourceColumn: 'Service', targetColumn: 'Libellé', enabled: true }
        ]
      });
      const out = await service.applyPreProcessingAsync([{ Service: 'Cash in', Country: 'SN' }], cfg, {});
      expect(out[0]).toEqual({ 'Libellé': 'CASHIN_OM_SN', PAYS: 'SN' });
    });

    it('PAYS retiré du résultat (source d’une concaténation) : renommage non appliqué', async () => {
      const cfg = base({
        columnConcatRules: [{ id: 'c1', sourceColumns: ['PAYS', 'Ref'], targetColumn: 'Clé', separator: '-', enabled: true }]
      });
      const out = await service.applyPreProcessingAsync([{ Service: 'Cash in', PAYS: 'SN', Ref: '1' }], cfg, {});
      expect(out[0]['Service']).toBe('Cash in');
      expect(out[0]['PAYS']).toBeUndefined();
    });

    it('PAYS choisi avant le traitement : pas d’attente, la valeur choisie est celle du résultat', async () => {
      const cfg = base({
        paysColumn: { enabled: true, value: 'SN' },
        columnRenameRules: [{ id: 'r1', sourceColumn: 'Country', targetColumn: 'PAYS', enabled: true }]
      });
      const out = await service.applyPreProcessingAsync([{ Service: 'Cash in', Country: 'CI' }], cfg, {});
      expect(out[0]['Service']).toBe('CASHIN_OM_SN');
      expect(out[0]['PAYS']).toBe('SN');
    });
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
