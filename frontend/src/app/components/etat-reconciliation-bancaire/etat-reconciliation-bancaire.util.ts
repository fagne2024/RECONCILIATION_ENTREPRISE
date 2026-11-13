import { ReleveBancaireRow } from '../../models/releve-bancaire.model';
import { OperationBancaire } from '../../models/operation-bancaire.model';

/**
 * Logique pure de l'état de réconciliation bancaire : une case = un compte bancaire × un jour
 * (date comptable des lignes de relevé).
 *
 * Statut d'une ligne de relevé (même règle que la colonne « statut » du module Banque) :
 *  - relevé KO (non rapproché)                         → Non réconcilié
 *  - relevé OK, sans opération rapprochée              → Réconcilié
 *  - relevé OK, opération « Niveau reconciliation »    → En cours de validation
 *  - opération rapprochée « Niveau Group »             → En cours de clôture
 *  - opération rapprochée « Terminé »                  → Terminé
 * Le statut d'une case est celui de la ligne la MOINS avancée du jour.
 */

export type BankPeriod =
    | 'jour' | '7_jours' | '30_jours' | 'semaine' | 'semaine_passee'
    | 'mois' | 'trimestre' | 'semestre' | 'annee';

export type BankStatus =
    | 'NON_RECONCILIE'
    | 'RECONCILIE'
    | 'EN_COURS_VALIDATION'
    | 'EN_COURS_CLOTURE'
    | 'TERMINE';

/** Du moins avancé au plus avancé. */
export const BANK_STATUS_ORDER: BankStatus[] = [
    'NON_RECONCILIE', 'RECONCILIE', 'EN_COURS_VALIDATION', 'EN_COURS_CLOTURE', 'TERMINE'
];

export interface BankLine {
    row: ReleveBancaireRow;
    status: BankStatus;
    /** Opération bancaire rapprochée (même date, montant et banque), s'il y en a une. */
    operation?: OperationBancaire;
}

export interface BankDayCell {
    date: string;
    status: BankStatus;
    total: number;
    counts: Record<BankStatus, number>;
    lines: BankLine[];
}

export interface BankAccountRow {
    key: string;
    /** Libellé principal : nom du compte, sinon banque. */
    label: string;
    /** Numéro de compte. */
    code: string;
    banque: string;
    country: string;
    days: Record<string, BankDayCell>;
}

export interface BankStats {
    total: number;
    reconcilie: number;
    enCoursValidation: number;
    enCoursCloture: number;
    termine: number;
    nonReco: number;
}

export function emptyStats(): BankStats {
    return { total: 0, reconcilie: 0, enCoursValidation: 0, enCoursCloture: 0, termine: 0, nonReco: 0 };
}

function emptyCounts(): Record<BankStatus, number> {
    return { NON_RECONCILIE: 0, RECONCILIE: 0, EN_COURS_VALIDATION: 0, EN_COURS_CLOTURE: 0, TERMINE: 0 };
}

export function statusRank(status: BankStatus): number {
    return BANK_STATUS_ORDER.indexOf(status);
}

/** Date locale yyyy-MM-dd (évite le décalage de fuseau de `new Date('yyyy-MM-dd')`). */
export function formatLocalYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseLocalYmd(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function addDaysIso(iso: string, days: number): string {
    const d = parseLocalYmd(iso);
    d.setDate(d.getDate() + days);
    return formatLocalYmd(d);
}

/** Normalise une date (chaîne ISO, Date ou tableau Jackson [y, m, d]) en yyyy-MM-dd. */
export function toIsoDate(value: unknown): string {
    if (!value) {
        return '';
    }
    if (Array.isArray(value) && value.length >= 3) {
        const [y, m, d] = value as number[];
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? '' : formatLocalYmd(value);
    }
    const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
}

/** Code pays d'un relevé : colonne pays, sinon deux derniers caractères du code banque. */
export function countryOf(row: ReleveBancaireRow): string {
    const p = (row.pays || '').trim();
    if (p) {
        return p.toUpperCase();
    }
    const b = (row.banque || '').trim();
    return b.length >= 2 ? b.slice(-2).toUpperCase() : '';
}

export function isLineOk(row: ReleveBancaireRow): boolean {
    return String(row.reconStatus || '').toUpperCase() === 'OK';
}

function normalizeText(value: string | undefined | null): string {
    return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function normalizeBank(value: string | undefined | null): string {
    return (value || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function amountDigits(amount: number): string {
    return String(Math.abs(amount || 0)).replace(/\D/g, '');
}

/** Banque d'une opération : banque corrigée prioritaire, sinon BO (comme le module Banque). */
export function operationBank(op: Pick<OperationBancaire, 'bo' | 'banqueCorrigee'>): string {
    return (op.banqueCorrigee || '').trim() || (op.bo || '').trim();
}

/** Clé de rapprochement d'une opération : date + montant + banque (le sens n'est pas utilisé ici). */
export function operationMatchKey(op: OperationBancaire): string {
    return `${toIsoDate(op.dateOperation).replace(/-/g, '')}${amountDigits(op.montant)}${normalizeBank(operationBank(op))}`;
}

/** Clés candidates d'une ligne de relevé : date de valeur puis date comptable. */
export function releveMatchKeys(r: ReleveBancaireRow): string[] {
    const debit = (r.debit || 0) > 0 ? Math.abs(r.debit as number) : 0;
    const credit = (r.credit || 0) > 0 ? Math.abs(r.credit as number) : 0;
    const amount = debit > 0 ? debit : credit;
    const bank = normalizeBank(r.banque);
    const keys: string[] = [];
    for (const d of [toIsoDate(r.dateValeur), toIsoDate(r.dateComptable)]) {
        if (d) {
            const k = `${d.replace(/-/g, '')}${amountDigits(amount)}${bank}`;
            if (!keys.includes(k)) {
                keys.push(k);
            }
        }
    }
    return keys;
}

/** Niveau de traitement d'une opération : 'terminé' | 'group' | 'reconciliation' (ou vide). */
function operationLevel(op: OperationBancaire): 'termine' | 'group' | 'reconciliation' {
    const t = normalizeText(op.traitement);
    if (t === 'termine') {
        return 'termine';
    }
    if (t === 'niveau group') {
        return 'group';
    }
    return 'reconciliation';
}

/** Statut d'une ligne de relevé, éventuellement rapprochée d'une opération. */
export function lineStatus(row: ReleveBancaireRow, op?: OperationBancaire): BankStatus {
    if (op) {
        const level = operationLevel(op);
        if (level === 'termine') {
            return 'TERMINE';
        }
        if (level === 'group') {
            return 'EN_COURS_CLOTURE';
        }
        return isLineOk(row) ? 'EN_COURS_VALIDATION' : 'NON_RECONCILIE';
    }
    return isLineOk(row) ? 'RECONCILIE' : 'NON_RECONCILIE';
}

/** Index clé → opérations, pour retrouver l'opération d'une ligne de relevé. */
export function indexOperations(ops: OperationBancaire[]): Map<string, OperationBancaire[]> {
    const map = new Map<string, OperationBancaire[]>();
    for (const op of ops || []) {
        const k = operationMatchKey(op);
        const list = map.get(k);
        if (list) {
            list.push(op);
        } else {
            map.set(k, [op]);
        }
    }
    return map;
}

const LEVEL_RANK = { reconciliation: 0, group: 1, termine: 2 } as const;

/** Opération rapprochée d'une ligne ; en cas de plusieurs candidates, la plus avancée. */
export function findOperation(row: ReleveBancaireRow, index: Map<string, OperationBancaire[]>): OperationBancaire | undefined {
    let best: OperationBancaire | undefined;
    for (const k of releveMatchKeys(row)) {
        for (const op of index.get(k) || []) {
            if (!best || LEVEL_RANK[operationLevel(op)] > LEVEL_RANK[operationLevel(best)]) {
                best = op;
            }
        }
        if (best) {
            break;
        }
    }
    return best;
}

/** Regroupe les lignes de relevé par compte puis par jour comptable, avec leur statut. */
export function buildBankAccountRows(rows: ReleveBancaireRow[], operations: OperationBancaire[] = []): BankAccountRow[] {
    const index = indexOperations(operations);
    const map = new Map<string, BankAccountRow>();
    for (const r of rows || []) {
        const date = toIsoDate(r.dateComptable);
        if (!date) {
            continue;
        }
        const code = (r.numeroCompte || '').trim();
        const banque = (r.banque || '').trim();
        const country = countryOf(r);
        const key = `${country}|${banque}|${code}`;
        let acc = map.get(key);
        if (!acc) {
            acc = { key, label: (r.nomCompte || '').trim() || banque || code || '—', code, banque, country, days: {} };
            map.set(key, acc);
        }
        let cell = acc.days[date];
        if (!cell) {
            cell = { date, status: 'NON_RECONCILIE', total: 0, counts: emptyCounts(), lines: [] };
            acc.days[date] = cell;
        }
        const operation = findOperation(r, index);
        const status = lineStatus(r, operation);
        cell.total++;
        cell.counts[status]++;
        cell.lines.push({ row: r, status, operation });
        if (cell.total === 1 || statusRank(status) < statusRank(cell.status)) {
            cell.status = status;
        }
    }
    const result = Array.from(map.values());
    result.sort((a, b) =>
        a.country.localeCompare(b.country) || a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }) || a.code.localeCompare(b.code));
    return result;
}

/** Compte les cases (compte × jour) par statut sur l'intervalle [from, to] (bornes incluses). */
export function computeStats(rows: BankAccountRow[], from: string, to: string): BankStats {
    const stats = emptyStats();
    for (const row of rows) {
        for (const cell of Object.values(row.days)) {
            if (cell.date < from || cell.date > to) {
                continue;
            }
            stats.total++;
            switch (cell.status) {
                case 'RECONCILIE': stats.reconcilie++; break;
                case 'EN_COURS_VALIDATION': stats.enCoursValidation++; break;
                case 'EN_COURS_CLOTURE': stats.enCoursCloture++; break;
                case 'TERMINE': stats.termine++; break;
                default: stats.nonReco++;
            }
        }
    }
    return stats;
}

/** Liste des jours de `start` à `end` inclus. */
export function listDates(start: string, end: string): string[] {
    const out: string[] = [];
    if (!start || !end || start > end) {
        return out;
    }
    for (let d = start; d <= end && out.length < 800; d = addDaysIso(d, 1)) {
        out.push(d);
    }
    return out;
}

/** Bornes [start, end] (incluses) de la période, plafonnées à aujourd'hui. */
export function computePeriodRange(period: BankPeriod, today: Date = new Date()): { start: string; end: string } {
    const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const mondayOffset = (ref.getDay() === 0 ? -6 : 1) - ref.getDay();
    let start = new Date(ref);
    let endExclusive = new Date(ref);
    endExclusive.setDate(ref.getDate() + 1);

    switch (period) {
        case 'jour':
            break;
        case '7_jours':
            start.setDate(ref.getDate() - 6);
            break;
        case '30_jours':
            start.setDate(ref.getDate() - 29);
            break;
        case 'semaine_passee':
            start = new Date(ref);
            start.setDate(ref.getDate() + mondayOffset - 7);
            endExclusive = new Date(start);
            endExclusive.setDate(start.getDate() + 7);
            break;
        case 'mois':
            start = new Date(ref.getFullYear(), ref.getMonth(), 1);
            break;
        case 'trimestre':
            start = new Date(ref.getFullYear(), Math.floor(ref.getMonth() / 3) * 3, 1);
            break;
        case 'semestre':
            start = new Date(ref.getFullYear(), Math.floor(ref.getMonth() / 6) * 6, 1);
            break;
        case 'annee':
            start = new Date(ref.getFullYear(), 0, 1);
            break;
        case 'semaine':
        default:
            start = new Date(ref);
            start.setDate(ref.getDate() + mondayOffset);
            break;
    }
    const end = new Date(endExclusive);
    end.setDate(endExclusive.getDate() - 1);
    return { start: formatLocalYmd(start), end: formatLocalYmd(end) };
}

/** Période précédente de même longueur, immédiatement avant `start`. */
export function previousRange(start: string, end: string): { start: string; end: string } {
    const length = listDates(start, end).length || 1;
    const prevEnd = addDaysIso(start, -1);
    return { start: addDaysIso(prevEnd, -(length - 1)), end: prevEnd };
}

/** Samedi ou dimanche (aucun relevé attendu). */
export function isWeekendIso(iso: string): boolean {
    const dow = parseLocalYmd(iso).getDay();
    return dow === 0 || dow === 6;
}

/** Hauteurs (px) des mini-histogrammes de KPI. */
export function sparkHeights(values: number[], maxPx = 22, minPx = 3): number[] {
    const max = Math.max(0, ...values);
    return values.map(v => (max <= 0 || v <= 0 ? minPx : Math.max(minPx, Math.round((v / max) * maxPx))));
}
