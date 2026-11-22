import { buildPaysTraitement, PAYS_TRAITEMENT_PAR_DEFAUT } from './pays.service';
import { applyColumnProcessingRulesSync } from '../utils/column-processing.util';

describe('Pays proposés avant un traitement', () => {
  it('13 pays par défaut (dont CITCH = Côte d’Ivoire), puis les pays des rapports (nom du référentiel si connu)', () => {
    const liste = buildPaysTraitement(
      ['ci', 'CITCH', 'BJ', 'GNL', '', 'SN'],
      [{ code: 'BJ', nom: 'Bénin' } as any]
    );
    expect(liste.slice(0, 13).map(p => p.code)).toEqual(PAYS_TRAITEMENT_PAR_DEFAUT.map(p => p.code));
    expect(liste.slice(13)).toEqual([{ code: 'BJ', nom: 'Bénin' }]);
  });

  it('pays des rapports donnés par leur nom : ramenés au code (Gabon = GA, pas de doublon)', () => {
    const liste = buildPaysTraitement(['Gabon', 'SENEGAL', 'Bénin', 'TOGO'], []);
    const codes = liste.map(p => p.code);
    expect(codes).not.toContain('GABON');
    expect(codes).not.toContain('SENEGAL');
    expect(codes.filter(c => c === 'GA').length).toBe(1);
    expect(liste.find(p => p.code === 'BJ')?.nom).toBe('Bénin');
    expect(liste.find(p => p.code === 'TG')?.nom).toBe('Togo');
  });

  it('sans rapports accessibles : la liste par défaut seule', () => {
    expect(buildPaysTraitement(null, null).map(p => p.code))
      .toEqual(['SN', 'CI', 'CITCH', 'GN', 'CM', 'GA', 'ML', 'BF', 'KE', 'TZ', 'UG', 'MR', 'GM']);
  });
});

describe('Règle de colonne : chaînes à supprimer séparées par des virgules', () => {
  it('_CM, _CI, _BF, _ML, _GA', () => {
    const rule = { sourceColumn: 'ID', targetColumn: 'ID', stringToRemove: '_CM, _CI, _BF, _ML, _GA' } as any;
    const rows = ['A1_CM', 'A2_CI', 'A3_BF', 'A4_SN'].map(v => ({ ID: v }));
    const out = applyColumnProcessingRulesSync(rows, [rule]);
    expect(out.map(r => r.ID)).toEqual(['A1', 'A2', 'A3', 'A4_SN']);
  });
});
