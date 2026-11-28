import {
  releveEcartsBoJm1,
  releveEcartsBoJp1,
  releveEcartsJm1,
  releveEcartsJp1,
  releveSommeEcarts,
  releveTotaux,
  releveVeille,
  releveYmd
} from './releve-totaux.util';

describe('releve-totaux.util', () => {
  const scope = { date: '2026-11-23', service: 'CM_PAIEMENTMARCHAND_OM_TP', country: 'Cameroun', env: 'BET' };

  it('normalise les dates et calcule la veille', () => {
    expect(releveYmd('2026-11-23T00:00:00')).toBe('2026-11-23');
    expect(releveYmd('23/11/2026')).toBe('2026-11-23');
    expect(releveVeille('2026-12-01')).toBe('2026-11-30');
  });

  it('retient en J+1 / J-1 les écarts Partenaire du périmètre (pays code ou libellé, env_code vide = T-E)', () => {
    const ecarts = [
      { dateTransaction: '2026-11-23T00:00:00', service: 'CM_PAIEMENTMARCHAND_OM_TP', pays: 'CM', env: 'PARTENAIRE', envCode: 'BET', nombreTransactions: 4, montantTotal: 1000 },
      { dateTransaction: '2026-11-22T00:00:00', service: 'cm_paiementmarchand_om_tp', pays: '', env: 'PARTENAIRE', envCode: 'BET', nombreTransactions: 2, montantTotal: 300 },
      // exclus : plateforme BO, autre ENV, autre pays, autre date
      { dateTransaction: '2026-11-23T00:00:00', service: 'CM_PAIEMENTMARCHAND_OM_TP', pays: 'CM', env: 'BO', envCode: 'BET', nombreTransactions: 7, montantTotal: 18900 },
      { dateTransaction: '2026-11-23T00:00:00', service: 'CM_PAIEMENTMARCHAND_OM_TP', pays: 'CM', env: 'PARTENAIRE', envCode: '', nombreTransactions: 9, montantTotal: 9 },
      { dateTransaction: '2026-11-23T00:00:00', service: 'CM_PAIEMENTMARCHAND_OM_TP', pays: 'GA', env: 'PARTENAIRE', envCode: 'BET', nombreTransactions: 9, montantTotal: 9 },
      { dateTransaction: '2026-11-21T00:00:00', service: 'CM_PAIEMENTMARCHAND_OM_TP', pays: 'CM', env: 'PARTENAIRE', envCode: 'BET', nombreTransactions: 9, montantTotal: 9 }
    ];
    expect(releveSommeEcarts(releveEcartsJp1(ecarts, scope))).toEqual({ nombre: 4, volume: 1000 });
    expect(releveSommeEcarts(releveEcartsJm1(ecarts, scope))).toEqual({ nombre: 2, volume: 300 });
  });

  it('range les lignes typées (datées du jour du rapport) dans la bonne colonne, sans double compte', () => {
    const base = { service: 'CM_PAIEMENTMARCHAND_OM_TP', pays: 'CM', envCode: 'BET' };
    const ecarts = [
      { ...base, dateTransaction: '2026-11-23', env: 'BO', typeDecalage: 'JM1_PARTENAIRE', nombreTransactions: 1, montantTotal: 10 },
      { ...base, dateTransaction: '2026-11-23', env: 'PARTENAIRE', typeDecalage: 'JP1_PARTENAIRE', nombreTransactions: 2, montantTotal: 20 },
      { ...base, dateTransaction: '2026-11-23', env: 'BO', typeDecalage: 'JM1_BO', nombreTransactions: 3, montantTotal: 30 },
      { ...base, dateTransaction: '2026-11-23', env: 'BO', typeDecalage: 'JP1_BO', nombreTransactions: 4, montantTotal: 40 },
      // typée datée de la veille : ne compte pas pour le 23 (ni en J-1 « par la date »)
      { ...base, dateTransaction: '2026-11-22', env: 'PARTENAIRE', typeDecalage: 'JP1_PARTENAIRE', nombreTransactions: 50, montantTotal: 500 },
      // écart BO simple (non typé) : jamais en décalage
      { ...base, dateTransaction: '2026-11-23', env: 'BO', nombreTransactions: 7, montantTotal: 18900 }
    ];
    expect(releveSommeEcarts(releveEcartsJm1(ecarts, scope))).toEqual({ nombre: 1, volume: 10 });
    expect(releveSommeEcarts(releveEcartsJp1(ecarts, scope))).toEqual({ nombre: 2, volume: 20 });
    expect(releveSommeEcarts(releveEcartsBoJm1(ecarts, scope))).toEqual({ nombre: 3, volume: 30 });
    expect(releveSommeEcarts(releveEcartsBoJp1(ecarts, scope))).toEqual({ nombre: 4, volume: 40 });
    // ENV null = tous les ENV (vue agrégée)
    expect(releveSommeEcarts(releveEcartsBoJp1(ecarts, { ...scope, env: null }))).toEqual({ nombre: 4, volume: 40 });
  });

  it('calcule les Totaux finaux du relevé', () => {
    const t = releveTotaux(
      { nombre: 46559, volume: 111889312.6 },
      { manualNombre: 3, manualVolume: 100, annuleNombre: 1, annuleVolume: 50, rembourseNombre: 2, rembourseVolume: 20 },
      { nombre: 4, volume: 1000 },
      { nombre: 2, volume: 300 }
    );
    // BO = Rapport + traité − annulé
    expect(t.bo.nombre).toBe(46561);
    expect(t.bo.volume).toBeCloseTo(111889362.6, 2);
    // Partenaire = BO + J+1 − J-1 + remboursé
    expect(t.partenaire.nombre).toBe(46561 + 4 - 2 + 2);
    expect(t.partenaire.volume).toBeCloseTo(111889362.6 + 1000 - 300 + 20, 2);
  });
});
