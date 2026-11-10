import { of, throwError } from 'rxjs';
import { ModelNormalizationService } from './model-normalization.service';

/** Normalisation des colonnes au chargement d'un fichier (traitement / réconciliation). */
describe('ModelNormalizationService', () => {
  const saved = [
    { modelId: 'trxbo', columnName: 'Numéro Trans GU', equivalents: ['Num Trans GU', 'ID'] },
    { modelId: 'trxbo', columnName: 'Agence', equivalents: ['Agency', 'Client'] },
    { modelId: 'airtel', columnName: 'Montant', equivalents: ['Transaction Amount'] }
  ];

  const build = (get: jest.Mock) => new ModelNormalizationService({ get } as any);

  it('renomme les en-têtes équivalents du modèle, sans appliquer ceux d’un autre modèle', async () => {
    const get = jest.fn().mockReturnValue(of(saved));
    const service = build(get);
    const rows = [{ 'Num Trans GU': '1794', Agency: 'A1', 'Transaction Amount': '10' }];

    const { rows: out, plan } = await service.normalizeRows(rows, ['trxbo']);

    expect(out[0]).toEqual({ 'Numéro Trans GU': '1794', Agence: 'A1', 'Transaction Amount': '10' });
    expect(plan.renames).toHaveLength(2);
  });

  it('charge la configuration une seule fois pour plusieurs fichiers', async () => {
    const get = jest.fn().mockReturnValue(of(saved));
    const service = build(get);
    await service.normalizeRows([{ ID: '1' }], ['trxbo']);
    await service.normalizeRows([{ 'Transaction Amount': '1' }], ['airtel']);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ne bloque jamais le traitement si la configuration est indisponible', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => new Error('403')));
    const service = build(get);
    const rows = [{ 'Num Trans GU': '1794' }];
    const { rows: out, plan } = await service.normalizeRows(rows, ['trxbo']);
    expect(out[0]).toEqual({ 'Num Trans GU': '1794' });
    expect(plan.renames).toEqual([]);
  });

  it('modèle sans configuration : données inchangées', async () => {
    const get = jest.fn().mockReturnValue(of(saved));
    const service = build(get);
    const rows = [{ 'Num Trans GU': '1794' }];
    const { rows: out } = await service.normalizeRows(rows, ['inconnu', undefined]);
    expect(out[0]).toEqual({ 'Num Trans GU': '1794' });
  });
});
