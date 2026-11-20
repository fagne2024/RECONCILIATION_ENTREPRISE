/**
 * Extraction de données (écran Traitement et règles de traitement des colonnes des modèles).
 *
 * - emailDomain : domaine d'une adresse e-mail (après « @ »).
 * - firstChars  : N caractères à partir de la position de départ (1 = premier caractère).
 * - lastChars   : N caractères en partant de la fin (position 1 = dernier caractère).
 *
 * Dans une règle de modèle, l'extraction est stockée dans `formatType` (champ texte déjà
 * persisté côté serveur) : `extract:firstChars:<début>:<nombre>`, `extract:lastChars:<début>:<nombre>`
 * ou `extract:emailDomain`. Même format lu par ColumnProcessingService (backend).
 */
export type ExtractionType = 'emailDomain' | 'firstChars' | 'lastChars';

export interface ExtractionSpec {
  type: ExtractionType;
  start: number;
  count: number;
}

export const EXTRACTION_FORMAT_PREFIX = 'extract:';

const entierPositif = (valeur: unknown, defaut: number): number => {
  const n = Math.floor(Number(valeur));
  return Number.isFinite(n) && n >= 1 ? n : defaut;
};

export function serializeExtractionFormat(spec: ExtractionSpec): string {
  if (spec.type === 'emailDomain') {
    return `${EXTRACTION_FORMAT_PREFIX}emailDomain`;
  }
  return `${EXTRACTION_FORMAT_PREFIX}${spec.type}:${entierPositif(spec.start, 1)}:${entierPositif(spec.count, 1)}`;
}

/** Lit une extraction stockée dans `formatType` ; null si ce n'est pas une extraction. */
export function parseExtractionFormat(formatType?: string | null): ExtractionSpec | null {
  const texte = (formatType || '').trim();
  if (!texte.toLowerCase().startsWith(EXTRACTION_FORMAT_PREFIX)) {
    return null;
  }
  const [, type, start, count] = texte.split(':');
  if (type === 'emailDomain') {
    return { type, start: 1, count: 1 };
  }
  if (type === 'firstChars' || type === 'lastChars') {
    return { type, start: entierPositif(start, 1), count: entierPositif(count, 1) };
  }
  return null;
}

export function applyExtraction(value: unknown, spec: ExtractionSpec): string {
  if (value === null || value === undefined) {
    return '';
  }
  const texte = String(value);
  const start = entierPositif(spec.start, 1);
  const count = entierPositif(spec.count, 1);
  switch (spec.type) {
    case 'emailDomain': {
      const at = texte.indexOf('@');
      return at !== -1 ? texte.substring(at + 1) : '';
    }
    case 'firstChars': {
      const debut = start - 1;
      return texte.substring(debut, debut + count);
    }
    case 'lastChars': {
      const debut = Math.max(0, texte.length - start - count + 1);
      return texte.substring(debut, debut + count);
    }
    default:
      return texte;
  }
}

/** Nom par défaut de la colonne extraite (même convention que l'écran Traitement). */
export function defaultExtractionColumnName(sourceColumn: string, spec: ExtractionSpec): string {
  switch (spec.type) {
    case 'emailDomain':
      return `${sourceColumn}_domaine`;
    case 'firstChars':
      return `${sourceColumn}_debut_${spec.count}`;
    case 'lastChars':
      return `${sourceColumn}_fin_${spec.count}`;
    default:
      return `${sourceColumn}_extrait`;
  }
}
