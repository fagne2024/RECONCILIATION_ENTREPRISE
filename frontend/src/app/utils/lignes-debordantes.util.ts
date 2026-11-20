/**
 * Lignes « débordantes » d'un fichier (écran Traitement).
 *
 * Une cellule texte contenant un retour à la ligne (ex. DESCRIPTION d'un relevé) peut être
 * découpée à la lecture : la suite du texte arrive comme une fausse ligne, avec presque
 * toutes les colonnes vides. Exemple :
 *
 *   11 | 11/15/26 | Crédit | retrait … hors total | 10000
 *   2026111551.jj1623715.544 de ouedraogo 61762960 |   |   |   |        ← suite de DESCRIPTION
 *
 * La fausse ligne est rattachée à la ligne précédente : le texte qui tombe dans une colonne
 * déjà remplie complète la colonne texte qui déborde (la plus longue valeur non numérique),
 * une valeur qui tombe dans une colonne vide de la ligne précédente la remplit.
 */

export interface LignesSource {
  readonly length: number;
  at(index: number): Record<string, any>;
}

export interface ResultatLignesDebordantes {
  /** Lignes réparées, ou null si aucune ligne n'a été rattachée (aucune copie). */
  rows: Record<string, any>[] | null;
  /** Nombre de fausses lignes rattachées à la ligne précédente. */
  fusions: number;
}

/** Colonne obligatoire : remplie sur la majorité des lignes (les fausses lignes font baisser ce taux). */
const SEUIL_COLONNE_OBLIGATOIRE = 0.5;

const estVide = (valeur: unknown): boolean =>
  valeur === undefined || valeur === null || String(valeur).trim() === '';

const estNumerique = (valeur: string): boolean =>
  /^[+-]?[\d\s.,]+$/.test(valeur.trim());

/** Colonne de la ligne qui « déborde » : la plus longue valeur texte (non numérique). */
function colonneTexteDebordante(ligne: Record<string, any>, colonnes: readonly string[]): string | null {
  let meilleure: string | null = null;
  let longueur = 0;
  for (const col of colonnes) {
    const valeur = ligne[col];
    if (estVide(valeur)) {
      continue;
    }
    const texte = String(valeur);
    if (estNumerique(texte)) {
      continue;
    }
    if (texte.length > longueur) {
      meilleure = col;
      longueur = texte.length;
    }
  }
  return meilleure;
}

/**
 * Détecte et rattache les lignes débordantes. Prudent : il faut au moins 3 lignes et
 * 2 colonnes obligatoires (remplies sur plus de la moitié des lignes) ; une ligne n'est rattachée que si
 * elle remplit au plus la moitié des colonnes obligatoires, n'apporte qu'un seul morceau de
 * texte en surplus, et soit ne remplit qu'une colonne obligatoire, soit comble un trou de la
 * ligne précédente. Une ligne « Total » (libellé + montant) n'est donc pas rattachée.
 */
export function rattacherLignesDebordantes(source: LignesSource): ResultatLignesDebordantes {
  const total = source.length;
  if (total < 3) {
    return { rows: null, fusions: 0 };
  }

  const colonnesSet = new Set<string>();
  for (let i = 0; i < total; i++) {
    for (const col of Object.keys(source.at(i) || {})) {
      colonnesSet.add(col);
    }
  }
  const colonnes = [...colonnesSet];
  if (colonnes.length < 3) {
    return { rows: null, fusions: 0 };
  }

  const remplissage = new Map<string, number>(colonnes.map(c => [c, 0]));
  for (let i = 0; i < total; i++) {
    const ligne = source.at(i) || {};
    for (const col of colonnes) {
      if (!estVide(ligne[col])) {
        remplissage.set(col, (remplissage.get(col) || 0) + 1);
      }
    }
  }
  const obligatoires = new Set(colonnes.filter(c => (remplissage.get(c) || 0) > total * SEUIL_COLONNE_OBLIGATOIRE));
  if (obligatoires.size < 2) {
    return { rows: null, fusions: 0 };
  }
  const maxObligatoiresRemplies = Math.floor(obligatoires.size / 2);

  const estSuite = (precedente: Record<string, any>, ligne: Record<string, any>): boolean => {
    const remplies = colonnes.filter(c => !estVide(ligne[c]));
    if (!remplies.length) {
      return false;
    }
    const obligatoiresRemplies = remplies.filter(c => obligatoires.has(c)).length;
    if (obligatoiresRemplies > maxObligatoiresRemplies) {
      return false;
    }
    const surplus = remplies.filter(c => !estVide(precedente[c]));
    if (surplus.length > 1) {
      return false;
    }
    if (surplus.length === 1 && !colonneTexteDebordante(precedente, colonnes)) {
      return false;
    }
    const trous = remplies.length - surplus.length;
    return obligatoiresRemplies <= 1 || trous >= 1;
  };

  // Première passe sans copie : la plupart des fichiers n'ont aucune ligne débordante.
  let aReparer = false;
  for (let i = 1; i < total && !aReparer; i++) {
    aReparer = estSuite(source.at(i - 1) || {}, source.at(i) || {});
  }
  if (!aReparer) {
    return { rows: null, fusions: 0 };
  }

  const resultat: Record<string, any>[] = [];
  let fusions = 0;
  for (let i = 0; i < total; i++) {
    const ligne = source.at(i) || {};
    const precedente = resultat[resultat.length - 1];
    if (!precedente || !estSuite(precedente, ligne)) {
      resultat.push({ ...ligne });
      continue;
    }
    const cible = colonneTexteDebordante(precedente, colonnes);
    for (const col of colonnes) {
      const valeur = ligne[col];
      if (estVide(valeur)) {
        continue;
      }
      if (estVide(precedente[col])) {
        precedente[col] = valeur;
      } else if (cible) {
        precedente[cible] = `${String(precedente[cible]).trimEnd()} ${String(valeur).trim()}`;
      }
    }
    fusions++;
  }
  return { rows: resultat, fusions };
}
