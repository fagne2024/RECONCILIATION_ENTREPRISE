import { OperateurCondition, remplitConditionDedoublonnage } from './cross-dedup.util';

/**
 * Condition d'application d'une option du traitement des modèles : la valeur d'une autre colonne
 * de la ligne (égale à / différente de / contient l'une des valeurs, vide, non vide).
 * Comparaison sans tenir compte de la casse ni des espaces autour.
 */
export interface ModelCondition {
  column: string;
  operator: OperateurCondition;
  /** Valeurs comparées (ignorées pour VIDE / NON_VIDE) ; l'une d'elles suffit. */
  values: string[];
}

/** Conditions complètes (colonne choisie, et au moins une valeur sauf VIDE / NON_VIDE). */
export function getActiveModelConditions(conditions?: ModelCondition[] | null): ModelCondition[] {
  return (conditions ?? []).filter(condition =>
    !!condition?.column?.trim()
    && (condition.operator === 'VIDE'
      || condition.operator === 'NON_VIDE'
      || (condition.values ?? []).some(value => String(value ?? '').trim() !== ''))
  );
}

/** Vrai si la ligne remplit TOUTES les conditions (aucune condition = toujours vrai). */
export function rowMatchesModelConditions(
  row: Record<string, unknown>,
  conditions?: ModelCondition[] | null
): boolean {
  const active = getActiveModelConditions(conditions);
  for (const condition of active) {
    if (!remplitConditionDedoublonnage(row, {
      colonne: condition.column.trim(),
      operateur: condition.operator,
      valeurs: condition.values ?? []
    })) {
      return false;
    }
  }
  return true;
}

/** Colonnes lues par les conditions (à conserver en entrée du traitement). */
export function getModelConditionColumns(conditions?: ModelCondition[] | null): string[] {
  return getActiveModelConditions(conditions).map(condition => condition.column.trim());
}

/** Copie profonde (enregistrement / restauration du modèle), conditions incomplètes retirées. */
export function cloneModelConditions(conditions?: ModelCondition[] | null): ModelCondition[] | undefined {
  const active = getActiveModelConditions(conditions);
  if (!active.length) {
    return undefined;
  }
  return active.map(condition => ({
    column: condition.column.trim(),
    operator: condition.operator,
    values: condition.operator === 'VIDE' || condition.operator === 'NON_VIDE'
      ? []
      : (condition.values ?? []).map(value => String(value).trim()).filter(value => value !== '')
  }));
}

const OPERATOR_LABELS: Record<OperateurCondition, string> = {
  EGAL: '=',
  DIFFERENT: '≠',
  CONTIENT: 'contient',
  VIDE: 'vide',
  NON_VIDE: 'non vide'
};

/** Texte court pour les résumés : « si Service = A, B et Pays ≠ CI ». */
export function describeModelConditions(conditions?: ModelCondition[] | null): string {
  const active = getActiveModelConditions(conditions);
  if (!active.length) {
    return '';
  }
  const parts = active.map(condition => {
    const label = OPERATOR_LABELS[condition.operator] ?? condition.operator;
    return condition.operator === 'VIDE' || condition.operator === 'NON_VIDE'
      ? `${condition.column} ${label}`
      : `${condition.column} ${label} ${(condition.values ?? []).join(', ')}`;
  });
  return ` [si ${parts.join(' et ')}]`;
}
