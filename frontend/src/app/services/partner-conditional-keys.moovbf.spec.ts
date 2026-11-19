import {
  BO_CONDITIONAL_KEY_COLUMN,
  PARTNER_CONDITIONAL_KEY_COLUMN,
  PartnerConditionalKeysService
} from './partner-conditional-keys.service';
import { AutoProcessingModel } from './auto-processing.service';

/**
 * Modèle partenaire MOOVBF ↔ BO TRXGU1 (config réelle de l'environnement de test) :
 * ID Partenaire par défaut (cash-in), Token GU de part et d'autre pour le paiement marchand.
 * La détection repose uniquement sur le service du fichier PARTENAIRE ; le libellé service
 * du BO n'est pas comparé.
 */
describe('Clés conditionnelles MOOVBF ↔ TRXGU1 (détection sur le partenaire)', () => {
  const service = new PartnerConditionalKeysService();
  const trxgu1 = 'mod_le_bas__sur_trxgu1_csv_1f0ff357';
  const moovbf = {
    name: 'Modèle basé sur MOOVBF.csv',
    reconciliationKeys: {
      partnerKeys: ['ID Partenaire'],
      boKeys: ['ID Partenaire'],
      boModels: [trxgu1],
      boModelKeys: { [trxgu1]: ['ID Partenaire'] },
      boTreatments: { [trxgu1]: [] },
      partnerConditionalKeys: {
        enabled: true,
        conditionColumn: 'Service',
        rules: [{ whenValue: 'PAIEMENTMARCHAND_MOOV', keyColumn: 'Token GU', boKeyColumn: 'Token GU' }],
        defaultKeyColumn: 'ID Partenaire'
      },
      boConditionalKeys: {
        enabled: true,
        conditionColumn: 'Service',
        rules: [{ whenValue: 'PAIEMENTMARCHAND_MOOV', keyColumn: 'Token GU' }],
        defaultKeyColumn: 'ID Partenaire'
      }
    }
  } as unknown as AutoProcessingModel;

  const bo = (id: string, service: string, token: string) =>
    ({ 'ID Partenaire': id, Service: service, 'Token GU': token, Montant: '1000' });
  const partner = (id: string, service: string, token: string) =>
    ({ 'ID Partenaire': id, 'Token GU': token, Service: service, 'Montant CI': '1000' });

  const partnerRows = [
    partner('DKCASH1', 'CASHIN_MOOV', ''),
    partner('MP-MOOV-1', 'PAIEMENTMARCHAND_MOOV', '1794978328935')
  ];

  it.each([
    'PAIEMENTMARCHAND_MOOV_BF',
    'BF_PAIEMENTMARCHAND_MOOV',
    'BFPAIEMENTMARCHANDMOOV',
    'LIBELLE_BO_QUELCONQUE'
  ])('BO « %s » : le paiement marchand prend le Token GU, le cash-in garde l\'ID Partenaire', boService => {
    const prepared = service.applyModelConditionalKeys(
      [bo('DKCASH1', 'CASHIN_MOOV_BF', '111'), bo('DKMP1', boService, '1794978328935')],
      partnerRows,
      moovbf
    )!;

    expect(prepared.boKeyColumn).toBe(BO_CONDITIONAL_KEY_COLUMN);
    expect(prepared.partnerKeyColumn).toBe(PARTNER_CONDITIONAL_KEY_COLUMN);
    expect(prepared.boData.map(r => r[BO_CONDITIONAL_KEY_COLUMN])).toEqual(['DKCASH1', '1794978328935']);
    expect(prepared.partnerData.map(r => r[PARTNER_CONDITIONAL_KEY_COLUMN])).toEqual(['DKCASH1', '1794978328935']);
  });

  it('un libellé BO « paiement marchand » sans token côté partenaire garde la clé par défaut', () => {
    const prepared = service.applyModelConditionalKeys(
      [bo('DKMP2', 'PAIEMENTMARCHAND_MOOV', '999')],
      partnerRows,
      moovbf
    )!;
    expect(prepared.boData[0][BO_CONDITIONAL_KEY_COLUMN]).toBe('DKMP2');
  });
});
