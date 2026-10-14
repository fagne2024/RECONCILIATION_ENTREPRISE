const characterMap: { [key: string]: string } = {
  'Ã©': 'é',
  'Ã¨': 'è',
  'Ãª': 'ê',
  'Ã«': 'ë',
  'Ã ': 'à',
  'Ã¢': 'â',
  'Ã¤': 'ä',
  'Ã§': 'ç',
  'Ã´': 'ô',
  'Ã¶': 'ö',
  'Ã¹': 'ù',
  'Ã»': 'û',
  'Ã¼': 'ü',
  'Ã®': 'î',
  'Ã¯': 'ï',
  'Â°': '°',
  'NÂ°': 'N°',
  'nÂ°': 'n°',
  'NÃ°': 'N°',
  'nÃ°': 'n°',
  'SuccÃ¨s': 'Succès',
  'succÃ¨s': 'succès',
  'DÃ©bit': 'Débit',
  'dÃ©bit': 'débit',
  'VersÃ©': 'Versé',
  'versÃ©': 'versé',
  'RetirÃ©': 'Retiré',
  'retirÃ©': 'retiré',
  'ImpÃ´t': 'Impôt',
  'impÃ´t': 'impôt',
  'DÃ©tails': 'Détails',
  'dÃ©tails': 'détails',
  'liÃ©e': 'liée',
  'liÃ©': 'lié',
  'CrÃ©dit': 'Crédit',
  'crÃ©dit': 'crédit',
  'RÃ©fÃ©rence': 'Référence',
  'rÃ©fÃ©rence': 'référence',
  'Sous-rÃ©seau': 'Sous-réseau',
  'sous-rÃ©seau': 'sous-réseau',
  'Numï¿½ro': 'Numéro',
  'Opï¿½ration': 'Opération',
  'aprï¿½s': 'après',
  'rï¿½fï¿½rence': 'référence',
  'crï¿½dit': 'crédit',
  'dï¿½bit': 'débit',
  'Expditeur': 'Expéditeur',
  'Bnficiaire': 'Bénéficiaire',
  'Opration': 'Opération',
  'rgularisation': 'régularisation',
  'rseau': 'réseau',
  'Sous-rseau': 'Sous-réseau',
  'T te de r seau': 'Tête de réseau',
};

function mojibakeMarkerCount(text: string): number {
  return (text.match(/Ã.|Â.|ï¿½/g) || []).length;
}

/**
 * Répare UTF-8 lu comme Latin-1 / Windows-1252 (ex. « DÃ©bit » → « Débit »).
 */
export function fixUtf8Mojibake(text: string): string {
  if (!text) {
    return '';
  }

  if (!/[\u0080-\u00FF]/.test(text)) {
    return text;
  }

  if (text.length > 0) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 255) {
        return text;
      }
    }
  }

  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (decoded.includes('\uFFFD')) {
      return text;
    }
    if (mojibakeMarkerCount(decoded) < mojibakeMarkerCount(text)) {
      return decoded;
    }
    if (mojibakeMarkerCount(text) > 0 && mojibakeMarkerCount(decoded) === 0) {
      return decoded;
    }
  } catch {
    // ignore
  }

  return text;
}

/**
 * Répare les chaînes de caractères où l'encodage UTF-8 a été mal interprété.
 */
/** Motifs connus que fixUtf8Mojibake dégrade (ex. NÃ° → Nð). */
function applyPreMojibakeFixes(text: string): string {
  let out = text;
  out = out.replace(/NÃ°/gi, 'N°');
  out = out.replace(/nÃ°/gi, 'n°');
  out = out.replace(/(\d)[ÂÃ][\s\u00A0](?=\d)/g, '$1 ');
  return out;
}

/**
 * Motifs ASCII (sans accent) corrigés par fixGarbledCharacters : si aucun de ces motifs
 * n'est présent ET qu'il n'y a aucun caractère non-ASCII, fixGarbledCharacters ne modifiera
 * jamais la chaîne. Permet de retourner la cellule telle quelle au lieu d'enchaîner ~40
 * regex + TextDecoder (très coûteux par cellule sur les fichiers volumineux).
 */
const ASCII_ACRONYM_FIX_RE = /Expditeur|Bnficiaire|Opration|opration|rgularisation|rseau|rfrence|Numro|numro|aprs|crdit|dbit|tlphone|diteur|nficiaire|pration|gularisation|T\s+te\s+de\s+r\s+seau/i;

function needsEncodingFix(text: string): boolean {
  if (!/[\u0080-\u00FF]|\uFFFD|ï¿½|Ã.|Â./.test(text)) {
    return ASCII_ACRONYM_FIX_RE.test(text);
  }
  return true;
}

export function fixGarbledCharacters(text: string | null | undefined): string {
  if (!text) {
    return '';
  }

  // Accélération : la grande majorité des cellules est en ASCII propre et n'est jamais
  // modifiée par le nettoyage ci-dessous → on évite tous les regex + le Uint8Array/TextDecoder.
  if (!needsEncodingFix(text)) {
    return text;
  }

  let fixedText = applyPreMojibakeFixes(text);
  fixedText = fixUtf8Mojibake(fixedText);

  fixedText = fixedText.replace(/Exp\uFFFD?diteur/gi, 'Expéditeur');
  fixedText = fixedText.replace(/B\uFFFD?n\uFFFD?ficiaire/gi, 'Bénéficiaire');
  fixedText = fixedText.replace(/B\uFFFD?nficiaire/gi, 'Bénéficiaire');
  fixedText = fixedText.replace(/Bn\uFFFD?ficiaire/gi, 'Bénéficiaire');
  fixedText = fixedText.replace(/O\uFFFD?pration/gi, 'Opération');
  fixedText = fixedText.replace(/op\uFFFD?ration/gi, 'opération');
  fixedText = fixedText.replace(/r\uFFFD?gularisation/gi, 'régularisation');
  fixedText = fixedText.replace(/r\uFFFD?seau/gi, 'réseau');
  fixedText = fixedText.replace(/r\uFFFD?f\uFFFD?rence/gi, 'référence');
  fixedText = fixedText.replace(/Num\uFFFD?ro/gi, 'Numéro');
  fixedText = fixedText.replace(/num\uFFFD?ro/gi, 'numéro');
  fixedText = fixedText.replace(/apr\uFFFD?s/gi, 'après');
  fixedText = fixedText.replace(/cr\uFFFD?dit/gi, 'crédit');
  fixedText = fixedText.replace(/d\uFFFD?bit/gi, 'débit');
  fixedText = fixedText.replace(/t\uFFFD?l\uFFFD?phone/gi, 'téléphone');

  fixedText = fixedText.replace(/Expditeur/gi, 'Expéditeur');
  fixedText = fixedText.replace(/Bnficiaire/gi, 'Bénéficiaire');
  fixedText = fixedText.replace(/Opration/gi, 'Opération');
  fixedText = fixedText.replace(/opration/gi, 'opération');
  fixedText = fixedText.replace(/rgularisation/gi, 'régularisation');
  fixedText = fixedText.replace(/rseau/gi, 'réseau');
  fixedText = fixedText.replace(/rfrence/gi, 'référence');
  fixedText = fixedText.replace(/Numro/gi, 'Numéro');
  fixedText = fixedText.replace(/numro/gi, 'numéro');
  fixedText = fixedText.replace(/aprs/gi, 'après');
  fixedText = fixedText.replace(/crdit/gi, 'crédit');
  fixedText = fixedText.replace(/dbit/gi, 'débit');
  fixedText = fixedText.replace(/tlphone/gi, 'téléphone');

  for (const [garbled, correct] of Object.entries(characterMap)) {
    const regex = new RegExp(garbled.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    fixedText = fixedText.replace(regex, correct);
  }

  fixedText = fixedText.replace(/([A-Za-z])diteur/gi, '$1éditeur');
  fixedText = fixedText.replace(/([A-Za-z])nficiaire/gi, '$1énéficiaire');
  fixedText = fixedText.replace(/([A-Za-z])pration/gi, '$1opération');
  fixedText = fixedText.replace(/([A-Za-z])gularisation/gi, '$1égularisation');
  fixedText = fixedText.replace(/T\s+te\s+de\s+r\s+seau/gi, 'Tête de réseau');
  fixedText = fixedText.replace(/T te de r seau/gi, 'Tête de réseau');

  return fixedText;
}

/** Variante rapide : saute fixCellEncoding si la chaîne est déjà en ASCII propre. */
export function fixCellEncodingIfNeeded(text: string | null | undefined): string {
  if (!text) {
    return '';
  }
  const trimmed = text.trim();
  if (!/[\u0080-\u00FF]|\uFFFD|ï¿½|Ã.|Â./.test(trimmed)) {
    return trimmed;
  }
  return fixCellEncoding(trimmed);
}

/** Corrige l'encodage d'une valeur de cellule (en-têtes et données). */
export function fixCellEncoding(text: string | null | undefined): string {
  if (!text) {
    return '';
  }

  let fixed = fixGarbledCharacters(text);
  fixed = fixed.replace(/NÂ°/gi, 'N°');
  fixed = fixed.replace(/nÂ°/gi, 'n°');
  fixed = fixed.replace(/(\d)[ÂÃ][\s\u00A0](?=\d)/g, '$1 ');
  fixed = fixed.replace(/\u00A0/g, ' ');
  fixed = fixed.replace(/\u00C2\u00A0/g, ' ');
  return fixed.trim();
}

/** Corrige toutes les clés et valeurs texte d'un enregistrement. */
export function fixRecordEncoding<T extends Record<string, unknown>>(record: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const cleanKey = fixCellEncoding(key);
    if (value === null || value === undefined) {
      out[cleanKey] = '';
    } else if (typeof value === 'string') {
      out[cleanKey] = fixCellEncoding(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[cleanKey] = String(value);
    } else {
      out[cleanKey] = fixCellEncoding(String(value));
    }
  }
  return out;
}
