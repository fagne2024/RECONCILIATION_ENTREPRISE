import { ModelPreProcessingService, createPreProcessingUsage } from './model-preprocessing.service';
import { ModelPreProcessingConfig } from './auto-processing.service';
import { expandConditionValuesWithMappings } from '../utils/model-column-normalization.util';

describe('ModelPreProcessingService — renommer une valeur vide', () => {
  const service = new ModelPreProcessingService();

  const config = (): ModelPreProcessingConfig => ({
    valueMappings: [
      { id: 'm1', column: 'Service', fromValue: '', fromEmpty: true, toValue: 'PAIEMENTMARCHANDOMQRCODE', enabled: true },
      { id: 'm2', column: 'Service', fromValue: 'Cash in', toValue: 'CASHIN_OM', enabled: true }
    ]
  } as ModelPreProcessingConfig);

  it('donne le nouveau libellé aux cellules vides (vide, espaces) sans toucher aux autres', async () => {
    const rows: Record<string, string>[] = [
      { Service: '', Ref: '1' },
      { Service: '   ', Ref: '2' },
      { Service: 'Cash in', Ref: '3' },
      { Service: 'Paiement marchand', Ref: '4' }
    ];
    const usage = createPreProcessingUsage();
    const out = await service.applyPreProcessingAsync(rows, config(), { usage });
    expect(out.map(r => r['Service'])).toEqual([
      'PAIEMENTMARCHANDOMQRCODE', 'PAIEMENTMARCHANDOMQRCODE', 'CASHIN_OM', 'Paiement marchand'
    ]);
  });

  it('une ligne sans « Valeur vide » ni 1re valeur reste ignorée (ligne incomplète)', async () => {
    const cfg = { valueMappings: [{ id: 'm', column: 'Service', fromValue: '', toValue: 'X', enabled: true }] } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync([{ Service: '' }], cfg, {});
    expect(out[0]['Service']).toBe('');
    expect(service.getActiveValueMappings(cfg.valueMappings)).toHaveLength(0);
  });

  it('respecte la condition sur la 2e colonne', async () => {
    const cfg = {
      valueMappings: [{
        id: 'm', column: 'Service', fromValue: '', fromEmpty: true, toValue: 'QR', enabled: true,
        conditionColumn: 'Type', conditionValue: 'QR CODE'
      }]
    } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync(
      [{ Service: '', Type: 'QR CODE' }, { Service: '', Type: 'AUTRE' }], cfg, {});
    expect(out.map(r => r['Service'])).toEqual(['QR', '']);
  });

  it('une condition de normalisation sur la nouvelle valeur reconnaît aussi le vide', () => {
    const expanded = expandConditionValuesWithMappings(
      [{ modelColumn: 'Montant QR', equivalents: ['Montant'], conditions: [{ column: 'Service', values: ['QR'], equivalent: 'Montant' }] } as any],
      [{ column: 'Service', fromValue: '', fromEmpty: true, toValue: 'QR', enabled: true }]
    );
    expect((expanded[0] as any).conditions[0].values).toEqual(['QR', '']);
  });
});
