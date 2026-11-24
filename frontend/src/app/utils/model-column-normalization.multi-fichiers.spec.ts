import {
  groupRowIndexesByHeaders,
  ModelColumnEquivalence,
  normalizeRowsByHeaderSet
} from './model-column-normalization.util';

/**
 * Traitement de plusieurs fichiers : chaque fichier a son propre jeu d'en-têtes.
 * La normalisation doit s'appliquer à chacun, pas seulement aux lignes du premier fichier.
 */
describe('Normalisation modèle – plusieurs fichiers aux en-têtes différents', () => {
  const equivalences: ModelColumnEquivalence[] = [
    { columnName: 'Status', equivalents: ['Transaction Status', 'Statut'] },
    { columnName: 'Amount', equivalents: ['Montant'] }
  ];

  const fichierModele = (statut: string, montant: string) => ({ Reference: 'R', Status: statut, Amount: montant });
  const fichierAnglais = (statut: string, montant: string) => ({ Reference: 'R', 'Transaction Status': statut, Amount: montant });
  const fichierFrancais = (statut: string, montant: string) => ({ Reference: 'R', Statut: statut, Montant: montant });

  it('regroupe les lignes par jeu d\'en-têtes en conservant leurs positions', () => {
    const rows = [fichierModele('OK', '1'), fichierAnglais('OK', '2'), fichierAnglais('KO', '3'), fichierModele('OK', '4')];

    const groups = groupRowIndexesByHeaders(rows);

    expect(groups.map(g => g.indexes)).toEqual([[0, 3], [1, 2]]);
  });

  it('normalise chaque fichier vers les colonnes du modèle, dans l\'ordre d\'origine', async () => {
    const rows = [
      fichierModele('OK', '10'),
      fichierAnglais('SUCCESS', '20'),
      fichierFrancais('Réussi', '30')
    ];

    const { rows: normalized, plan } = await normalizeRowsByHeaderSet(rows, equivalences);

    expect(normalized.map(r => r['Status'])).toEqual(['OK', 'SUCCESS', 'Réussi']);
    expect(normalized.map(r => r['Amount'])).toEqual(['10', '20', '30']);
    expect(normalized.every(r => !('Transaction Status' in r) && !('Statut' in r) && !('Montant' in r))).toBe(true);
    expect(plan.renames.map(r => `${r.from}→${r.to}`).sort())
      .toEqual(['Montant→Amount', 'Statut→Status', 'Transaction Status→Status']);
  });

  it('un seul fichier : comportement inchangé', async () => {
    const rows = [fichierAnglais('OK', '1'), fichierAnglais('KO', '2')];

    const { rows: normalized } = await normalizeRowsByHeaderSet(rows, equivalences);

    expect(normalized.map(r => r['Status'])).toEqual(['OK', 'KO']);
  });
});
