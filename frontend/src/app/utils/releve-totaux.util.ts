import { normalizeReconciliationReportEnv } from '../constants/reconciliation-env-options';
import { countriesMatch } from './country-codes.util';

/**
 * Logique du relevé de service, partagée entre le relevé (/reconciliation-report)
 * et le rapport BO vs Partenaire (/rapport-reconciliation-bo-partenaire) :
 * une seule source pour les écarts Partenaire J+1 / J-1 et les « Totaux finaux ».
 * Toute évolution de la logique du relevé se fait ici.
 */

/**
 * Type de décalage choisi à l'enregistrement sur /ecart-bo-summary. La ligne est alors datée
 * du jour du rapport concerné. Sans type : écart simple (anciennes lignes Partenaire :
 * J+1 = datées du jour du rapport, J-1 = datées de la veille).
 */
export type TypeDecalage = 'JM1_BO' | 'JM1_PARTENAIRE' | 'JP1_BO' | 'JP1_PARTENAIRE';

export const TYPES_DECALAGE: TypeDecalage[] = ['JM1_BO', 'JM1_PARTENAIRE', 'JP1_BO', 'JP1_PARTENAIRE'];

export function normalizeTypeDecalage(v: string | null | undefined): TypeDecalage | undefined {
  const t = (v || '').trim().toUpperCase();
  return (TYPES_DECALAGE as string[]).includes(t) ? (t as TypeDecalage) : undefined;
}

/** Ligne du Résumé écarts BO (ecart_bo_summary) utilisée par le relevé. */
export interface ReleveEcartLigne {
  dateTransaction: string;
  service?: string | null;
  pays?: string | null;
  /** Plateforme : BO ou PARTENAIRE. */
  env?: string | null;
  /** Environnement technique (BET, HT…) ; vide ou TOTAL = T-E. */
  envCode?: string | null;
  nombreTransactions?: number | null;
  montantTotal?: number | null;
  typeDecalage?: string | null;
}

/** Périmètre d'un relevé : service + date + pays + ENV. */
export interface ReleveScope {
  /** Date du rapport (toute forme lisible ; normalisée en YYYY-MM-DD). */
  date: string;
  service: string;
  country: string;
  /** ENV du relevé ; null = tous les ENV (vue agrégée). */
  env?: string | null;
}

/** Saisies manuelles du relevé (releve_manual). */
export interface ReleveSaisies {
  manualNombre?: number | null;
  manualVolume?: number | null;
  annuleNombre?: number | null;
  annuleVolume?: number | null;
  rembourseNombre?: number | null;
  rembourseVolume?: number | null;
}

export interface ReleveSomme {
  nombre: number;
  volume: number;
}

export interface ReleveTotaux {
  /** Données du rapport (lignes OK du périmètre). */
  rapport: ReleveSomme;
  /** Écart Partenaire J+1 (date du rapport). */
  jp1: ReleveSomme;
  /** Écart Partenaire J-1 (veille du rapport). */
  jm1: ReleveSomme;
  /** BO = Rapport + Trx traité − Trx annulé. */
  bo: ReleveSomme;
  /** Partenaire = Rapport + Trx traité − Trx annulé + J+1 − J-1 + Trx remboursé. */
  partenaire: ReleveSomme;
}

/** Date en YYYY-MM-DD (ISO, « YYYY-MM-DD HH:mm », dd/MM/yyyy, dd-MM-yyyy). */
export function releveYmd(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const value = String(dateStr).trim();
  if (value.includes('T')) {
    return value.split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.split(' ')[0];
  }
  const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }
  const dmyDash = value.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyDash) {
    return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`;
  }
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
  }
  return value;
}

/** Veille calendaire d'une date YYYY-MM-DD (sans décalage UTC). */
export function releveVeille(ymd: string): string {
  const m = releveYmd(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return ymd;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function texteEgal(a?: string | null, b?: string | null): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/** Pays de l'écart souvent vide à la sauvegarde : vide = compatible ; sinon même pays (code ou libellé). */
function relevePaysCompatible(paysEcart?: string | null, paysRapport?: string | null): boolean {
  const ep = (paysEcart ?? '').trim();
  const rp = (paysRapport ?? '').trim();
  if (!ep || !rp) {
    return true;
  }
  return texteEgal(ep, rp) || countriesMatch(ep, rp);
}

/** env_code de l'écart vs ENV du relevé ; code absent ou TOTAL → T-E ; ENV du relevé null = tous. */
function releveEnvCompatible(ecart: ReleveEcartLigne, envReleve?: string | null): boolean {
  if (envReleve === null) {
    return true;
  }
  const anyE = ecart as ReleveEcartLigne & { env_code?: string | null };
  const code = String(ecart.envCode ?? anyE.env_code ?? '').trim();
  const ecartKey = !code || code.toUpperCase() === 'TOTAL' ? 'T-E' : code;
  return ecartKey.toUpperCase() === normalizeReconciliationReportEnv(envReleve).toUpperCase();
}

function estPlateformePartenaire(ecart: ReleveEcartLigne): boolean {
  return (ecart.env || '').trim().toUpperCase() === 'PARTENAIRE';
}

/** Lignes du périmètre (service, pays, ENV) datées d'un jour donné. */
function releveLignesDuJour<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope, ymd: string): T[] {
  return (ecarts || []).filter(
    (e) =>
      releveYmd(e.dateTransaction) === ymd &&
      texteEgal(e.service, scope.service) &&
      relevePaysCompatible(e.pays, scope.country) &&
      releveEnvCompatible(e, scope.env)
  );
}

/** Lignes typées du jour du rapport pour un type de décalage donné. */
function releveLignesTypees<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope, type: TypeDecalage): T[] {
  return releveLignesDuJour(ecarts, scope, releveYmd(scope.date)).filter(
    (e) => normalizeTypeDecalage(e.typeDecalage) === type
  );
}

/** Anciennes lignes Partenaire sans type (J±1 déduit de la date). */
function releveLignesPartenaireSansType<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope, ymd: string): T[] {
  return releveLignesDuJour(ecarts, scope, ymd).filter(
    (e) => !normalizeTypeDecalage(e.typeDecalage) && estPlateformePartenaire(e)
  );
}

/**
 * Écart Partenaire J+1 du relevé : lignes « J+1 Partenaire » datées du jour du rapport,
 * plus les anciennes lignes Partenaire sans type datées du jour du rapport.
 */
export function releveEcartsJp1<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope): T[] {
  return [
    ...releveLignesTypees(ecarts, scope, 'JP1_PARTENAIRE'),
    ...releveLignesPartenaireSansType(ecarts, scope, releveYmd(scope.date))
  ];
}

/**
 * Écart Partenaire J-1 du relevé : lignes « J-1 Partenaire » datées du jour du rapport,
 * plus les anciennes lignes Partenaire sans type datées de la veille.
 */
export function releveEcartsJm1<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope): T[] {
  return [
    ...releveLignesTypees(ecarts, scope, 'JM1_PARTENAIRE'),
    ...releveLignesPartenaireSansType(ecarts, scope, releveVeille(releveYmd(scope.date)))
  ];
}

/** Écart BO J+1 : lignes « J+1 BO » datées du jour du rapport. */
export function releveEcartsBoJp1<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope): T[] {
  return releveLignesTypees(ecarts, scope, 'JP1_BO');
}

/** Écart BO J-1 : lignes « J-1 BO » datées du jour du rapport. */
export function releveEcartsBoJm1<T extends ReleveEcartLigne>(ecarts: T[], scope: ReleveScope): T[] {
  return releveLignesTypees(ecarts, scope, 'JM1_BO');
}

export function releveSommeEcarts(ecarts: ReleveEcartLigne[]): ReleveSomme {
  return (ecarts || []).reduce(
    (s, e) => ({
      nombre: s.nombre + Number(e.nombreTransactions || 0),
      volume: s.volume + Number(e.montantTotal || 0)
    }),
    { nombre: 0, volume: 0 }
  );
}

/** « Totaux finaux » du relevé. */
export function releveTotaux(
  rapport: ReleveSomme,
  saisies: ReleveSaisies | null | undefined,
  jp1: ReleveSomme,
  jm1: ReleveSomme
): ReleveTotaux {
  const s = saisies || {};
  const bo: ReleveSomme = {
    nombre: rapport.nombre + Number(s.manualNombre || 0) - Number(s.annuleNombre || 0),
    volume: rapport.volume + Number(s.manualVolume || 0) - Number(s.annuleVolume || 0)
  };
  const partenaire: ReleveSomme = {
    nombre: bo.nombre + jp1.nombre - jm1.nombre + Number(s.rembourseNombre || 0),
    volume: bo.volume + jp1.volume - jm1.volume + Number(s.rembourseVolume || 0)
  };
  return { rapport, jp1, jm1, bo, partenaire };
}
