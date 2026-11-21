import { PartnerConditionalKeysService, PARTNER_CONDITIONAL_KEY_COLUMN } from './partner-conditional-keys.service';
import { PartnerConditionalKeysConfig } from './auto-processing.service';

describe('Clés optionnelles — valeur de condition exacte', () => {
  const service = new PartnerConditionalKeysService();
  const apply = (whenValue: string, services: string[]) => {
    const config = {
      enabled: true, conditionColumn: 'Service', defaultKeyColumn: 'ID Partenaire',
      rules: [{ whenValue, keyColumn: 'Token GU' }]
    } as PartnerConditionalKeysConfig;
    const rows = services.map((s, i) => ({ Service: s, 'Token GU': `TOK${i}`, 'ID Partenaire': `ID${i}` }));
    return service.applyPartnerConditionalKeys(rows, config, ['ID Partenaire']).map(r => r[PARTNER_CONDITIONAL_KEY_COLUMN]);
  };

  it('BF_PAIEMENTMARCHAND_MOOV : seulement cette valeur (casse / espaces ignorés)', () => {
    expect(apply('BF_PAIEMENTMARCHAND_MOOV', [
      'BF_PAIEMENTMARCHAND_MOOV', ' bf_paiementmarchand_moov ', 'PAIEMENTMARCHAND_MOOV',
      'CI_PAIEMENTMARCHAND_MOOV', 'CITCH_PAIEMENTMARCHAND_MOOV'
    ])).toEqual(['TOK0', 'TOK1', 'ID2', 'ID3', 'ID4']);
  });

  it('PAIEMENTMARCHAND_MOOV : ne couvre plus les services préfixés', () => {
    expect(apply('PAIEMENTMARCHAND_MOOV', ['PAIEMENTMARCHAND_MOOV', 'BF_PAIEMENTMARCHAND_MOOV']))
      .toEqual(['TOK0', 'ID1']);
  });
});
