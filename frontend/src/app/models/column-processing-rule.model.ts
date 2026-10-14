export interface ColumnProcessingRule {
  id?: number;
  sourceColumn: string;
  targetColumn: string;
  formatType?: string;
  toUpperCase?: boolean;
  toLowerCase?: boolean;
  trimSpaces?: boolean;
  removeSpecialChars?: boolean;
  removeAccents?: boolean;
  stringToRemove?: string;
  padZeros?: boolean;
  /** Longueur cible si padZeros (défaut : 10 pour To/MSISDN, sinon 8). */
  padZeroLength?: number;
  regexReplace?: string;
  specialCharReplacementMap?: { [key: string]: string };
  ruleOrder?: number;
}
