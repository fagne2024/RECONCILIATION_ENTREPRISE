import { DossierCandidat, devinerRoles, montantReleveAbs, syntheseDossier } from './banque-dossier-lie.util';

const op = (id: number, typeOperation: string, montant: number, date: string): DossierCandidat => ({
  typeLigne: 'OPERATION',
  op: { id, typeOperation, montant, dateOperation: date, pays: 'ML', agence: 'AG', statut: 'Validée' }
});
const rev = (id: number, libelle: string, debit: number, date: string, pairOpId?: number): DossierCandidat => ({
  typeLigne: 'RELEVE',
  rev: { id, libelle, debit, dateValeur: date },
  pairOpId
});

describe('banque-dossier-lie.util', () => {
  it('propose les rôles du préfinancement : appro, frais, remboursement, contreparties et frais du retour', () => {
    const roles = devinerRoles([
      op(1, 'Appro', 1_000_000, '2026-11-02'),
      rev(10, 'VIR APPRO AGENCE', 1_000_000, '2026-11-02', 1),
      op(2, 'Frais', 5_000, '2026-11-02'),
      op(3, 'Compense', 300_000, '2026-11-20'),
      // contrepartie sans paire : retrouvée par le montant
      rev(11, 'VIREMENT RECU', 300_000, '2026-11-20'),
      rev(12, 'FRAIS VIREMENT', 1_000, '2026-11-21')
    ]);
    expect(roles).toEqual(['APPRO', 'APPRO_CONTREPARTIE', 'FRAIS_APPRO',
      'REMBOURSEMENT', 'REMBOURSEMENT_CONTREPARTIE', 'FRAIS_REMBOURSEMENT']);
  });

  it('laisse « Autre » quand rien ne permet de deviner', () => {
    expect(devinerRoles([op(1, 'Nivellement', 10, '2026-11-01'), rev(2, 'DIVERS', 7, '2026-11-01')]))
      .toEqual(['AUTRE', 'AUTRE']);
  });

  it('calcule la synthèse : montant utilisé, frais et écarts avec les contreparties', () => {
    const s = syntheseDossier([
      { role: 'APPRO', montant: 1_000_000 },
      { role: 'APPRO_CONTREPARTIE', montant: 1_000_000 },
      { role: 'FRAIS_APPRO', montant: 5_000 },
      { role: 'REMBOURSEMENT', montant: 300_000 },
      { role: 'REMBOURSEMENT_CONTREPARTIE', montant: 299_000 },
      { role: 'FRAIS_REMBOURSEMENT', montant: 1_000 }
    ]);
    expect(s.montantUtilise).toBe(700_000);
    expect(s.totalFrais).toBe(6_000);
    expect(s.ecartAppro).toBe(0);
    expect(s.ecartRemboursement).toBe(1_000);
  });

  it('prend le montant du relevé en valeur absolue (débit, crédit puis montant)', () => {
    expect(montantReleveAbs({ debit: -50 })).toBe(50);
    expect(montantReleveAbs({ debit: 0, credit: 20 })).toBe(20);
    expect(montantReleveAbs({ montant: -3 })).toBe(3);
    expect(montantReleveAbs(null)).toBe(0);
  });
});
