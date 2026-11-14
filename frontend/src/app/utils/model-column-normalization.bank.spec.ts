import {
  BANK_BUILT_IN_EQUIVALENCES,
  mergeBuiltInEquivalences,
  planColumnNormalization
} from './model-column-normalization.util';

describe('Équivalences intégrées des modèles bancaires', () => {
  const modelColumns = ['Numero de compte', 'Nom du compte', 'Banque', 'Pays', 'Date comptable', 'Date de valeur',
    'Référence', 'Debit', 'Credit', 'Montant', 'Devise'];
  const configured = [
    { columnName: 'Date comptable', equivalents: ['Date de la transaction', "Date d'opération"] },
    { columnName: 'Référence', equivalents: ['NARRATION', 'Libelle operation'] }
  ];

  it('reprend « Date » et « Val. » d\'un extrait de compte PDF', () => {
    const merged = mergeBuiltInEquivalences(configured, BANK_BUILT_IN_EQUIVALENCES, modelColumns);
    const plan = planColumnNormalization(['Date', 'Libelle operation', 'Val.', 'Debit', 'Credit'], merged, modelColumns);

    expect(plan.renames).toEqual(expect.arrayContaining([
      { from: 'Date', to: 'Date comptable' },
      { from: 'Val.', to: 'Date de valeur' },
      { from: 'Libelle operation', to: 'Référence' }
    ]));
  });

  it('garde la priorité aux équivalents configurés et ignore les colonnes absentes du modèle', () => {
    const merged = mergeBuiltInEquivalences(configured, BANK_BUILT_IN_EQUIVALENCES, ['Date comptable', 'Référence']);

    expect(merged.find(e => e.columnName === 'Date comptable')!.equivalents[0]).toBe('Date de la transaction');
    expect(merged.some(e => e.columnName === 'Date de valeur')).toBe(false);
  });
});
