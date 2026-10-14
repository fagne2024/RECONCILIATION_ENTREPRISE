/**
 * Liste ENV commune : rapport de réconciliation, relevé, résumé écarts BO (envCode).
 * T-E = agrégat / total entité (ex-TOTAL en base result8rec / env_code vide en écart BO).
 */
export const RECONCILIATION_ENV_OPTIONS: readonly string[] = [
  'BET',
  'HT',
  'T-E',
  'HUBAO',
  'TOP20',
  'GU3'
];

/** Harmonise ancien TOTAL, vide, et T-E pour comparaisons / API. */
export function normalizeReconciliationReportEnv(env?: string | null): string {
  const t = (env ?? '').trim();
  if (!t) return 'T-E';
  const u = t.toUpperCase();
  if (u === 'TOTAL' || u === 'T-E') return 'T-E';
  return t;
}
