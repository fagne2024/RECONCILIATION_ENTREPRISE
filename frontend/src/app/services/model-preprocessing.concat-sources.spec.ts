import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelPreProcessingConfig } from './auto-processing.service';

describe('ModelPreProcessingService — concaténation : seules les colonnes concaténées restent', () => {
  const service = new ModelPreProcessingService();
  const rows = () => [{ ID: '1', Date: '19/11/2026', Heure: '23:53', Montant: '100' }];

  it('retire les colonnes sources par défaut', async () => {
    const config = {
      columnConcatRules: [{ id: 'c1', sourceColumns: ['Date', 'Heure'], targetColumn: 'DateHeure', separator: '-', enabled: true }]
    } as ModelPreProcessingConfig;
    const out = await service.applyPreProcessingAsync(rows(), config);
    expect(out[0]).toEqual({ ID: '1', Montant: '100', DateHeure: '19/11/2026-23:53' });
  });

  it('garde les sources si l’option est décochée, et ne retire jamais une colonne produite', async () => {
    const keep = {
      columnConcatRules: [{ id: 'c1', sourceColumns: ['Date', 'Heure'], targetColumn: 'DateHeure', separator: '', enabled: true, removeSourceColumns: false }]
    } as ModelPreProcessingConfig;
    expect(Object.keys((await service.applyPreProcessingAsync(rows(), keep))[0])).toContain('Heure');

    // Cible écrite dans une des sources : « Date » reste (c'est la colonne concaténée), « Heure » part.
    const inPlace = {
      columnConcatRules: [{ id: 'c1', sourceColumns: ['Date', 'Heure'], targetColumn: 'Date', separator: '', enabled: true }]
    } as ModelPreProcessingConfig;
    const out = (await service.applyPreProcessingAsync(rows(), inPlace))[0];
    expect(Object.keys(out).sort()).toEqual(['Date', 'ID', 'Montant']);
  });
});
