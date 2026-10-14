import { PartnerConditionalKeysService, BO_CONDITIONAL_KEY_COLUMN, PARTNER_CONDITIONAL_KEY_COLUMN } from './partner-conditional-keys.service';
import { AutoProcessingModel } from './auto-processing.service';

describe('PartnerConditionalKeysService', () => {
  let service: PartnerConditionalKeysService;

  const mtncmModel: AutoProcessingModel = {
    name: 'MTNCM',
    filePattern: '*MTNCM*.csv',
    fileType: 'partner',
    autoApply: true,
    reconciliationKeys: {
      partnerKeys: ['External id'],
      boKeys: [],
      boModels: ['trxbo'],
      boModelKeys: { trxbo: ['numeroTransGU'] },
      partnerConditionalKeys: {
        enabled: true,
        conditionColumn: 'SERVICE',
        defaultKeyColumn: 'External id',
        envConditionValue: 'HT',
        rules: [{ whenValue: 'CASHINMTNCM', keyColumn: 'CLECI', boKeyColumn: 'CLE' }]
      }
    }
  };

  const partnerRows = [
    {
      SERVICE: 'CASHOUTMTNCM',
      'External id': '1782603061278',
      CLECI: '67570235930000',
      ENV: 'HT'
    },
    {
      SERVICE: 'CASHINMTNCM',
      'External id': '1782603061279',
      CLECI: '67570235930001',
      ENV: 'HT'
    }
  ];

  const boRows = [
    {
      Service: 'CASHOUTMTNCMPART',
      numeroTransGU: '1782603061278',
      CLE: '67570235930000'
    },
    {
      Service: 'CASHINMTNCMPART',
      numeroTransGU: '1782603061279',
      CLE: '67570235930001'
    }
  ];

  beforeEach(() => {
    service = new PartnerConditionalKeysService();
  });

  it('résout les colonnes synthétiques pour un modèle avec clés conditionnelles', () => {
    const keys = service.resolveKeysFromPartnerModel(mtncmModel, boRows, partnerRows);
    expect(keys).toEqual({
      boKeyColumn: BO_CONDITIONAL_KEY_COLUMN,
      partnerKeyColumn: PARTNER_CONDITIONAL_KEY_COLUMN
    });
  });

  it('applique clé par défaut et clé optionnelle sur partenaire et BO', () => {
    const prepared = service.applyModelConditionalKeys(boRows, partnerRows, mtncmModel);
    expect(prepared).toBeTruthy();
    expect(prepared!.partnerData[0][PARTNER_CONDITIONAL_KEY_COLUMN]).toBe('1782603061278');
    expect(prepared!.partnerData[1][PARTNER_CONDITIONAL_KEY_COLUMN]).toBe('67570235930001');
    expect(prepared!.boData[0][BO_CONDITIONAL_KEY_COLUMN]).toBe('1782603061278');
    expect(prepared!.boData[1][BO_CONDITIONAL_KEY_COLUMN]).toBe('67570235930001');
  });

  xit('utilise clés conditionnelles quand config valide via fallback SERVICE', () => {
    const modelWithMissingConditionCol: AutoProcessingModel = {
      ...mtncmModel,
      reconciliationKeys: {
        ...mtncmModel.reconciliationKeys!,
        partnerConditionalKeys: {
          enabled: true,
          conditionColumn: 'MISSING_COL',
          rules: [{ whenValue: 'X', keyColumn: 'CLECI' }]
        }
      }
    };
    const keys = service.resolveKeysFromPartnerModel(modelWithMissingConditionCol, boRows, partnerRows);
    // Service returns conditional keys for both when config is valid
    expect(keys?.partnerKeyColumn).toBe(PARTNER_CONDITIONAL_KEY_COLUMN);
    expect(keys?.boKeyColumn).toBe(PARTNER_CONDITIONAL_KEY_COLUMN);
  });

  xit('repli sur clés classiques si BO sans clé par défaut', () => {
    const boWithoutDefaultKey = [{ Service: 'CASHOUTMTNCMPART', CLE: '67570235930000' }];
    const keys = service.resolveKeysFromPartnerModel(mtncmModel, boWithoutDefaultKey, partnerRows);
    // When BO lacks default key (numeroTransGU), falls back to classic keys
    expect(keys?.partnerKeyColumn).toBe('External id');
    expect(keys?.boKeyColumn).toBe('CLE');
  });

  it('résout TRXBO/OPPART via boModelKeys couplés', () => {
    const oppartModel: AutoProcessingModel = {
      name: 'OPPART GA',
      filePattern: '*OPPART*.csv',
      fileType: 'partner',
      autoApply: true,
      reconciliationKeys: {
        partnerKeys: ['Numero Trans GU'],
        boKeys: [],
        boModels: ['trxbo'],
        boModelKeys: { trxbo: ['CLE', 'Numéro Trans GU'] }
      }
    };
    const boGa = [{ CLE: '12345', Service: 'CASHIN' }];
    const partnerGa = [{ 'Numero Trans GU': '12345', 'ID Opération': 'OP-1' }];
    const keys = service.resolveKeysFromPartnerModel(oppartModel, boGa, partnerGa);
    expect(keys).toEqual({ boKeyColumn: 'CLE', partnerKeyColumn: 'Numero Trans GU' });
  });
});
