/**
 * Libellés de regroupement du rapport BO vs Partenaire (même pays / ENV que les filtres).
 * Un service est rattaché au **premier** token de cette liste (triés du plus long au plus court)
 * dont le nom du service contient le texte, sans tenir compte de la casse.
 *
 * Ex. : tous les noms contenant « CASHINOM » → groupe affiché **CASHINOM** (pas CASHINOMCM2).
 */
export const BO_PARTENAIRE_SERVICE_GROUP_TOKENS: readonly string[] = [
  'CASHINOM',
  'CASHINMTN'
];
