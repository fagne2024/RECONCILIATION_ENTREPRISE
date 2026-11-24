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

/**
 * Modèle BO sans clé propre (TRXGU1) : le dédoublonnage ne doit pas se faire sur la colonne
 * calculée CLE (Téléphone client + Montant), mais sur les clés déclarées par les partenaires.
 */
describe('ModelPreProcessingService – dédoublonnage d\'un modèle BO sans clé propre', () => {
  const service = new ModelPreProcessingService();
  const trxgu1 = {
    id: '274',
    modelId: 'mod_trxgu1',
    name: 'Modèle basé sur TRXGU1.csv',
    filePattern: '*TRXGU1*.csv',
    fileType: 'bo',
    reconciliationKeys: { partnerKeys: [], boKeys: [], boModelKeys: {} },
    preProcessingConfig: {
      columnConcatRules: [{ id: 'c1', sourceColumns: ['Téléphone client', 'Montant'], targetColumn: 'CLE', separator: '', enabled: true }]
    }
  } as unknown as AutoProcessingModel;
  const orange = {
    id: '280', modelId: 'mod_orange', name: 'ORANGE', fileType: 'partner',
    reconciliationKeys: { partnerKeys: ['ID PARTENAIRE'], boKeys: [], boModelKeys: { mod_trxgu1: ['ID Partenaire'] } }
  } as unknown as AutoProcessingModel;
  const airtel = {
    id: '292', modelId: 'mod_airtel', name: 'AIRTELGA', fileType: 'partner',
    reconciliationKeys: { partnerKeys: ['Token GU'], boKeys: [], boModelKeys: { mod_trxgu1: ['Token GU'] } }
  } as unknown as AutoProcessingModel;

  const ligne = (id: string, token: string) =>
    ({ 'ID Partenaire': id, 'Téléphone client': '77023229', Montant: '1000', 'Token GU': token, CLE: '770232291000' });

  const rows = [ligne('MP1', 'T1'), ligne('MP2', 'T2'), ligne('MP3', 'T3'), ligne('MP1', 'T1')];

  it('utilise ID Partenaire + Token GU déclarés par les partenaires, pas CLE', () => {
    const res = service.deduplicateRowsByReconciliationKey(trxgu1, rows, [trxgu1, orange, airtel]);

    expect(res.dedupColumns).toEqual(['ID Partenaire', 'Token GU']);
    expect(res.uniqueRows).toHaveLength(3);
    expect(res.duplicatesRemoved).toBe(1);
  });

  it('sans modèle partenaire, dédoublonne sur la ligne entière et non sur la seule colonne calculée CLE', () => {
    const res = service.deduplicateRowsByReconciliationKey(trxgu1, rows);

    expect(res.dedupColumns).not.toEqual(['CLE']);
    expect(res.dedupColumns).toContain('ID Partenaire');
    expect(res.uniqueRows).toHaveLength(3);
  });
});
