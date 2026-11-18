import { ModelPreProcessingService } from './model-preprocessing.service';
import { AutoProcessingModel } from './auto-processing.service';

/**
 * Dédoublonnage du fichier final sur la clé de réconciliation du modèle :
 * une clé vide n'est pas un doublon (Wave api_payout sans identifiant de session API).
 */
describe('ModelPreProcessingService – dédoublonnage sur clé vide', () => {
  const service = new ModelPreProcessingService();
  const modeleWave = {
    name: 'Modèle basé sur WAVE.csv',
    filePattern: '*WAVE*.csv',
    reconciliationKeys: { partnerKeys: ['ID PARTENAIRE PM'], boKeys: ['ID Partenaire'] }
  } as unknown as AutoProcessingModel;

  const ligne = (ci: string, service: string, pm: string) =>
    ({ 'ID PARTENAIRE CI': ci, SERVICE: service, 'ID PARTENAIRE PM': pm });

  it('conserve toutes les lignes api_payout dont la clé est vide', () => {
    const rows = [
      ligne('T_1', 'api_checkout', 'cos-1'),
      ligne('pt-1', 'api_payout', ''),
      ligne('pt-2', 'api_payout', ''),
      ligne('pt-3', 'api_payout', '  '),
      ligne('T_1', 'api_checkout', 'cos-1')
    ];

    const res = service.deduplicateRowsByReconciliationKey(modeleWave, rows);

    expect(res.uniqueRows.filter(r => r.SERVICE === 'api_payout')).toHaveLength(3);
    expect(res.uniqueRows).toHaveLength(4);
    expect(res.duplicatesRemoved).toBe(1);
  });

  it('applique la même règle avec des colonnes choisies par l\'utilisateur', () => {
    const rows = [ligne('pt-1', 'api_payout', ''), ligne('pt-2', 'api_payout', '')];

    const res = service.deduplicateRowsByConfiguredColumns(rows, ['ID PARTENAIRE PM'], modeleWave);

    expect(res.uniqueRows).toHaveLength(2);
    expect(res.duplicatesRemoved).toBe(0);
  });
});
