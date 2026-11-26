import { OperationBancaire } from '../models/operation-bancaire.model';
import { ReleveBancaireRow } from '../models/releve-bancaire.model';

/** Type d'une ligne de dossier lié : opération bancaire ou ligne de relevé. */
export type DossierTypeLigne = 'OPERATION' | 'RELEVE';

/**
 * Rôle d'une ligne dans un dossier lié (aligné sur BanqueDossierLieService#ROLES) :
 * appro de préfinancement et sa contrepartie, frais par mémo, compense de remboursement du reliquat
 * et sa contrepartie, frais sur le montant retourné.
 */
export type DossierRole = 'APPRO' | 'APPRO_CONTREPARTIE' | 'FRAIS_APPRO'
  | 'REMBOURSEMENT' | 'REMBOURSEMENT_CONTREPARTIE' | 'FRAIS_REMBOURSEMENT' | 'AUTRE';

export const DOSSIER_ROLES: DossierRole[] = ['APPRO', 'APPRO_CONTREPARTIE', 'FRAIS_APPRO',
  'REMBOURSEMENT', 'REMBOURSEMENT_CONTREPARTIE', 'FRAIS_REMBOURSEMENT', 'AUTRE'];

export interface DossierLigneRef {
  typeLigne: DossierTypeLigne;
  ligneId: number;
  role: DossierRole;
}

export interface DossierResume {
  id: number;
  libelle: string;
  commentaire?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  lignes: DossierLigneRef[];
}

export interface DossierSynthese {
  appro: number;
  approContrepartie: number;
  ecartAppro: number;
  fraisAppro: number;
  remboursement: number;
  remboursementContrepartie: number;
  ecartRemboursement: number;
  fraisRemboursement: number;
  totalFrais: number;
  montantUtilise: number;
  autres: number;
}

export interface DossierLigneDetail extends DossierLigneRef {
  montant: number | null;
  operation?: OperationBancaire | null;
  releve?: ReleveBancaireRow | null;
}

export interface DossierDetail {
  dossier: DossierResume;
  lignes: DossierLigneDetail[];
  totauxParRole: Record<string, number>;
  synthese: DossierSynthese;
}

/** Ligne proposée pour un dossier : l'opération ou le relevé, et l'opération rapprochée en face (paire). */
export interface DossierCandidat {
  typeLigne: DossierTypeLigne;
  op?: OperationBancaire | null;
  rev?: ReleveBancaireRow | null;
  /** Identifiant (côté opération) de la paire de réconciliation à laquelle appartient la ligne. */
  pairOpId?: number | null;
  role?: DossierRole;
}

export function dossierLigneKey(typeLigne: DossierTypeLigne, id: number | null | undefined): string {
  return `${typeLigne}:${id}`;
}

/** Montant d'une ligne de relevé en valeur absolue : débit, sinon crédit, sinon montant. */
export function montantReleveAbs(r: ReleveBancaireRow | null | undefined): number {
  if (!r) return 0;
  if (r.debit) return Math.abs(r.debit);
  if (r.credit) return Math.abs(r.credit);
  return Math.abs(r.montant || 0);
}

export function montantCandidat(c: DossierCandidat): number {
  return c.typeLigne === 'OPERATION' ? Math.abs(c.op?.montant || 0) : montantReleveAbs(c.rev);
}

function norm(s: string | null | undefined): string {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function dateCandidat(c: DossierCandidat): number {
  const raw: any = c.typeLigne === 'OPERATION' ? c.op?.dateOperation : (c.rev?.dateValeur || c.rev?.dateComptable);
  const t = raw ? new Date(raw).getTime() : NaN;
  return isNaN(t) ? 0 : t;
}

const RE_FRAIS = /\b(frais|commission|comm?|memo|tva|tob|agios?)\b/;
const RE_REMB = /(compense|rembours|retour|reliquat|restitution)/;
const RE_APPRO = /(appro|prefinanc)/;

/**
 * Rôles proposés pour les lignes d'un nouveau dossier (modifiables ensuite) :
 * - opération : frais / mémo → frais ; compense, remboursement → remboursement ; appro → appro ;
 * - relevé : contrepartie de l'opération rapprochée en face, sinon d'une opération de même montant ;
 *   libellé de frais → frais ;
 * - un frais daté à partir du premier remboursement est un frais sur le montant retourné.
 */
export function devinerRoles(candidats: DossierCandidat[]): DossierRole[] {
  type Brut = DossierRole | 'FRAIS';
  const roles: Brut[] = candidats.map(c => {
    if (c.typeLigne !== 'OPERATION') return 'AUTRE';
    const t = norm(`${c.op?.typeOperation || ''} ${c.op?.modePaiement || ''}`);
    if (RE_FRAIS.test(t)) return 'FRAIS';
    if (RE_REMB.test(t)) return 'REMBOURSEMENT';
    if (RE_APPRO.test(t)) return 'APPRO';
    return 'AUTRE';
  });

  const contrepartie = (r: Brut): Brut | null =>
    r === 'APPRO' ? 'APPRO_CONTREPARTIE' : r === 'REMBOURSEMENT' ? 'REMBOURSEMENT_CONTREPARTIE' : r === 'FRAIS' ? 'FRAIS' : null;

  candidats.forEach((c, i) => {
    if (c.typeLigne !== 'RELEVE') return;
    // Contrepartie de l'opération rapprochée en face (paire de réconciliation)
    if (c.pairOpId != null) {
      const j = candidats.findIndex(o => o.typeLigne === 'OPERATION' && o.op?.id === c.pairOpId);
      const cp = j >= 0 ? contrepartie(roles[j]) : null;
      if (cp) { roles[i] = cp; return; }
    }
    if (RE_FRAIS.test(norm(c.rev?.libelle))) { roles[i] = 'FRAIS'; return; }
    // Sinon : opération de même montant
    const m = montantCandidat(c);
    const j = candidats.findIndex((o, k) => o.typeLigne === 'OPERATION' && (roles[k] === 'APPRO' || roles[k] === 'REMBOURSEMENT')
      && Math.abs(montantCandidat(o) - m) < 0.01);
    if (j >= 0) roles[i] = contrepartie(roles[j]) as Brut;
  });

  const datesRemb = candidats.filter((c, i) => roles[i] === 'REMBOURSEMENT' || roles[i] === 'REMBOURSEMENT_CONTREPARTIE')
    .map(dateCandidat).filter(t => t > 0);
  const premierRemb = datesRemb.length ? Math.min(...datesRemb) : null;
  return roles.map((r, i) => {
    if (r !== 'FRAIS') return r;
    return premierRemb != null && dateCandidat(candidats[i]) >= premierRemb ? 'FRAIS_REMBOURSEMENT' : 'FRAIS_APPRO';
  });
}

/** Synthèse d'un dossier (même calcul que BanqueDossierLieService#synthese), pour l'aperçu en direct. */
export function syntheseDossier(lignes: Array<{ role: DossierRole; montant: number }>): DossierSynthese {
  const t: Record<string, number> = {};
  DOSSIER_ROLES.forEach(r => (t[r] = 0));
  lignes.forEach(l => (t[l.role] = (t[l.role] || 0) + (l.montant || 0)));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    appro: r2(t['APPRO']),
    approContrepartie: r2(t['APPRO_CONTREPARTIE']),
    ecartAppro: r2(t['APPRO'] - t['APPRO_CONTREPARTIE']),
    fraisAppro: r2(t['FRAIS_APPRO']),
    remboursement: r2(t['REMBOURSEMENT']),
    remboursementContrepartie: r2(t['REMBOURSEMENT_CONTREPARTIE']),
    ecartRemboursement: r2(t['REMBOURSEMENT'] - t['REMBOURSEMENT_CONTREPARTIE']),
    fraisRemboursement: r2(t['FRAIS_REMBOURSEMENT']),
    totalFrais: r2(t['FRAIS_APPRO'] + t['FRAIS_REMBOURSEMENT']),
    montantUtilise: r2(t['APPRO'] - t['REMBOURSEMENT']),
    autres: r2(t['AUTRE'])
  };
}
