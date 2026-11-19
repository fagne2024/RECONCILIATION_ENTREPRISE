import { parseValeursCondition, remplitConditionDedoublonnage, supprimerDoublonsCroises } from './cross-dedup.util';
import { resolvePreProcessingSectionOrder } from '../services/auto-processing.service';

describe('cross-dedup.util', () => {
  const rows = [
    { Envoi: 'R1', Annulation: '', Statut: 'SUCCES' },   // 0 : R1 annulée plus bas
    { Envoi: 'R2', Annulation: '', Statut: 'SUCCES' },   // 1 : aucune annulation
    { Envoi: '', Annulation: 'r1 ', Statut: 'SUCCES' },  // 2 : annulation de R1
    { Envoi: 'R3', Annulation: '', Statut: 'ECHEC' },    // 3
    { Envoi: '', Annulation: 'R3', Statut: 'ECHEC' }     // 4 : annulation de R3
  ];

  it('supprime uniquement le côté A', () => {
    const res = supprimerDoublonsCroises(rows, 'Envoi', 'Annulation', 'A');
    expect(res.supprimees).toBe(2);
    expect(res.rows.map(r => rows.indexOf(r))).toEqual([1, 2, 4]);
  });

  it('supprime uniquement le côté B', () => {
    const res = supprimerDoublonsCroises(rows, 'Envoi', 'Annulation', 'B');
    expect(res.rows.map(r => rows.indexOf(r))).toEqual([0, 1, 3]);
  });

  it('ne compare et ne supprime que les lignes qui remplissent la condition', () => {
    const condition = { colonne: 'Statut', operateur: 'EGAL' as const, valeurs: ['succes'] };
    const res = supprimerDoublonsCroises(rows, 'Envoi', 'Annulation', 'A', condition);
    expect(res.rows.map(r => rows.indexOf(r))).toEqual([1, 2, 3, 4]);
  });

  it('opérateurs de condition', () => {
    const row = { Statut: ' Paiement OM ', Vide: '' };
    expect(remplitConditionDedoublonnage(row, { colonne: 'Statut', operateur: 'CONTIENT', valeurs: ['om'] })).toBe(true);
    expect(remplitConditionDedoublonnage(row, { colonne: 'Statut', operateur: 'DIFFERENT', valeurs: ['paiement om'] })).toBe(false);
    expect(remplitConditionDedoublonnage(row, { colonne: 'Vide', operateur: 'VIDE', valeurs: [] })).toBe(true);
    expect(remplitConditionDedoublonnage(row, { colonne: 'Vide', operateur: 'NON_VIDE', valeurs: [] })).toBe(false);
    expect(remplitConditionDedoublonnage(row, null)).toBe(true);
  });

  it('valeurs de condition séparées par « ; »', () => {
    expect(parseValeursCondition(' SUCCES ; VALIDE;; ')).toEqual(['SUCCES', 'VALIDE']);
  });

  it('ordre des sections : section absente insérée à sa place par défaut', () => {
    const ancien = ['formatActions', 'rowFilters', 'columnConcatRules', 'columnMathRules', 'valueMappings', 'columnRenameRules'] as any;
    expect(resolvePreProcessingSectionOrder(ancien)).toEqual([
      'formatActions', 'rowFilters', 'columnConcatRules', 'columnMathRules', 'valueMappings', 'crossDedupRules', 'columnRenameRules'
    ]);
  });
});
