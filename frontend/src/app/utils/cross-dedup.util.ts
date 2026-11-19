import { resolveColumnKeyInRow } from './row-column.util';

/**
 * Doublons entre deux colonnes (page Traitement et pré-traitement des modèles).
 *
 * Une ligne est supprimée lorsque sa valeur dans la colonne du côté choisi (A ou B) existe
 * aussi dans l'autre colonne. Un seul côté est supprimé, l'autre est conservé. Comparaison
 * sans espaces de bord et sans casse ; les valeurs vides ne sont jamais des doublons.
 *
 * Condition optionnelle sur une autre colonne : seules les lignes qui la remplissent sont
 * comparées et supprimables. Même règle que TraitementTransformations.remplitCondition (serveur).
 */
export type OperateurCondition = 'EGAL' | 'DIFFERENT' | 'CONTIENT' | 'VIDE' | 'NON_VIDE';

export const OPERATEURS_CONDITION: OperateurCondition[] = ['EGAL', 'DIFFERENT', 'CONTIENT', 'VIDE', 'NON_VIDE'];

export interface ConditionDedoublonnage {
  colonne: string;
  operateur: OperateurCondition;
  valeurs: string[];
}

export type CoteSuppression = 'A' | 'B';

const normaliser = (valeur: unknown): string => (valeur ?? '').toString().trim().toLowerCase();

/** Lit une cellule : clé exacte, sinon clé résolue (accents, encodage, alias bilingues). */
function lireCellule(row: Record<string, any>, colonne: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, colonne)) {
    return row[colonne];
  }
  const cle = resolveColumnKeyInRow(row as Record<string, string>, colonne);
  return cle ? row[cle] : undefined;
}

/** Vrai si la ligne remplit la condition (pas de condition = toutes les lignes). */
export function remplitConditionDedoublonnage(row: Record<string, any>, condition?: ConditionDedoublonnage | null): boolean {
  if (!condition?.colonne) {
    return true;
  }
  const texte = normaliser(lireCellule(row, condition.colonne));
  const cibles = (condition.valeurs || []).map(v => normaliser(v));
  switch (condition.operateur) {
    case 'EGAL': return cibles.includes(texte);
    case 'DIFFERENT': return !cibles.includes(texte);
    case 'CONTIENT': return cibles.filter(c => c !== '').some(c => texte.includes(c));
    case 'VIDE': return texte === '';
    case 'NON_VIDE': return texte !== '';
    default: return false;
  }
}

/** Index des lignes à supprimer pour un dédoublonnage croisé A / B. */
export function indexDoublonsCroises(
  rows: ArrayLike<Record<string, any>>,
  colonneA: string,
  colonneB: string,
  cote: CoteSuppression,
  condition?: ConditionDedoublonnage | null
): Set<number> {
  const supprimees = new Set<number>();
  if (!colonneA || !colonneB || colonneA === colonneB) {
    return supprimees;
  }
  const colonneSupprimee = cote === 'B' ? colonneB : colonneA;
  const autreColonne = cote === 'B' ? colonneA : colonneB;

  const valeursAutreCote = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!remplitConditionDedoublonnage(row, condition)) continue;
    const v = normaliser(lireCellule(row, autreColonne));
    if (v) valeursAutreCote.add(v);
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!remplitConditionDedoublonnage(row, condition)) continue;
    const v = normaliser(lireCellule(row, colonneSupprimee));
    if (v && valeursAutreCote.has(v)) supprimees.add(i);
  }
  return supprimees;
}

/** Applique le dédoublonnage croisé à un tableau de lignes. */
export function supprimerDoublonsCroises<T extends Record<string, any>>(
  rows: T[],
  colonneA: string,
  colonneB: string,
  cote: CoteSuppression,
  condition?: ConditionDedoublonnage | null
): { rows: T[]; supprimees: number } {
  const index = indexDoublonsCroises(rows, colonneA, colonneB, cote, condition);
  if (!index.size) {
    return { rows, supprimees: 0 };
  }
  return { rows: rows.filter((_row, i) => !index.has(i)), supprimees: index.size };
}

/** Valeurs d'une condition saisie en texte : séparées par « ; » (ou retour à la ligne). */
export function parseValeursCondition(texte?: string | null): string[] {
  return (texte || '').split(/[;\n]/).map(v => v.trim()).filter(v => v !== '');
}
