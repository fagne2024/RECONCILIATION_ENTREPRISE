export type SpecialStringRemovalMode = 'all' | 'start' | 'end';

/**
 * Chaînes à supprimer, séparées par des virgules : « _CM, _CI, _BF » → ['_CM', '_CI', '_BF'].
 * Espaces autour de chaque chaîne ignorés ; triées de la plus longue à la plus courte pour
 * qu'une chaîne plus longue (_CITCH) passe avant une plus courte qui la préfixe (_CI).
 * Une saisie qui ne contient que des virgules / espaces (ex. « , ») est prise telle quelle.
 */
export function parseSpecialStringsToRemove(raw: string | null | undefined): string[] {
  const text = raw ?? '';
  if (!text) {
    return [];
  }
  const parts = [...new Set(text.split(',').map(p => p.trim()).filter(Boolean))];
  if (!parts.length) {
    return [text];
  }
  return parts.sort((a, b) => b.length - a.length);
}

/**
 * Supprime de la valeur chacune des chaînes configurées.
 * - all : toutes les occurrences de chaque chaîne ;
 * - start / end : la première chaîne trouvée en début / fin de valeur (une seule suppression).
 */
export function removeSpecialStrings(
  value: string,
  raw: string | null | undefined,
  mode: SpecialStringRemovalMode | string | null | undefined = 'all'
): string {
  const targets = parseSpecialStringsToRemove(raw);
  if (!value || !targets.length) {
    return value;
  }
  switch (mode ?? 'all') {
    case 'start': {
      const t = targets.find(x => value.startsWith(x));
      return t ? value.substring(t.length) : value;
    }
    case 'end': {
      const t = targets.find(x => value.endsWith(x));
      return t ? value.substring(0, value.length - t.length) : value;
    }
    case 'all':
    default:
      return targets.reduce((acc, t) => acc.split(t).join(''), value);
  }
}
