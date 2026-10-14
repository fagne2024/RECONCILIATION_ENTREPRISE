import { I18nService } from './i18n/i18n.service';
import { Injectable } from '@angular/core';
import { EcartBoSummary } from './ecart-bo-summary.service';
import { ReleveManualRangeRow } from './dashboard.service';
import { normalizeReconciliationReportEnv } from '../constants/reconciliation-env-options';
import { countriesMatch } from '../utils/country-codes.util';
import {
  resolveTraitementKind,
  statutFromTraitementDisplayLabel,
  traitementDisplayLabel
} from '../shared/result8rec-audit-display';

export interface BoPartenaireResult8Row {
  id?: number;
  date: string;
  service: string;
  country: string;
  env?: string;
  totalTransactions: number;
  totalVolume: number;
  traitement?: string;
  glpiId?: string;
}

export interface BoPartenaireMonthlyAggregateRow {
  monthYyyyMm: string;
  service: string;
  traitement: string;
  statutRapport: string;
  boNombre: number;
  boVolume: number;
  partenaireNombre: number;
  partenaireVolume: number;
  ecartNombre: number;
  ecartVolume: number;
  tauxVolume: number | null;
  ticketIds: string[];
}

export interface RapportDateServiceLine {
  date: string;
  service: string;
  traitement: string;
  statutRapport: string;
  nombre: number;
  volume: number;
}

@Injectable({ providedIn: 'root' })
export class BoPartenaireAggregationService {
  computeMonthlyRows(params: {
    rawReport: BoPartenaireResult8Row[];
    manualRows: ReleveManualRangeRow[];
    ecartAll: EcartBoSummary[];
    country: string;
    envNorm: string | null;
    startDate: string;
    endDate: string;
    /** Si renseigné, ne calcule que ce mois (yyyy-MM). */
    monthFilter?: string;
  }): BoPartenaireMonthlyAggregateRow[] {
    const { rawReport, manualRows, ecartAll, country, envNorm, startDate, endDate, monthFilter } =
      params;
    const filtered = rawReport.filter((row) => {
      if (!countriesMatch(row.country, country)) {
        return false;
      }
      if (envNorm != null && normalizeReconciliationReportEnv(row.env) !== envNorm) {
        return false;
      }
      const ymd = this.formatDateForSearch(row.date);
      return this.isYmdInRangeInclusive(ymd, startDate, endDate);
    });

    const services = new Set<string>();
    const months = new Set<string>();
    for (const row of filtered) {
      const svc = (row.service || '').trim();
      if (svc) {
        services.add(svc);
      }
      const m = this.monthFromYmd(this.formatDateForSearch(row.date));
      if (m) {
        if (!monthFilter || m === monthFilter) {
          months.add(m);
        }
      }
    }

    const rows: BoPartenaireMonthlyAggregateRow[] = [];
    const monthList = Array.from(months).sort();
    const serviceList = Array.from(services).sort((a, b) => a.localeCompare(b, 'fr'));

    for (const monthYyyyMm of monthList) {
      const { start, end } = this.monthBounds(monthYyyyMm);
      const monthFiltered = filtered.filter((r) =>
        this.isYmdInRangeInclusive(this.formatDateForSearch(r.date), start, end)
      );
      for (const service of serviceList) {
        const repLines = monthFiltered.filter((l) => this.strEqual(l.service, service));
        if (!repLines.length) {
          continue;
        }
        const agg = this.aggregatesPourService(
          service,
          monthFiltered,
          start,
          end,
          envNorm,
          manualRows,
          ecartAll,
          country
        );
        const traitement = this.dominantTraitementRawValue(repLines.map((l) => l.traitement));
        const ecN = agg.boNombre - agg.partenaireNombre - agg.decalageJm1Nombre + agg.decalageJp1Nombre;
        const ecV = agg.boVolume - agg.partenaireVolume - agg.decalageJm1Volume + agg.decalageJp1Volume;
        const taux =
          agg.boVolume !== 0
            ? (ecV / agg.boVolume) * 100
            : agg.partenaireVolume !== 0
              ? null
              : 0;
        rows.push({
          monthYyyyMm,
          service,
          traitement,
          statutRapport: statutFromTraitementDisplayLabel(traitement),
          boNombre: agg.boNombre,
          boVolume: agg.boVolume,
          partenaireNombre: agg.partenaireNombre,
          partenaireVolume: agg.partenaireVolume,
          ecartNombre: ecN,
          ecartVolume: ecV,
          tauxVolume: taux,
          ticketIds: this.collectTicketIds(repLines)
        });
      }
    }

    return rows;
  }

  buildRapportDateServiceLines(params: {
    rawReport: BoPartenaireResult8Row[];
    country: string;
    envNorm: string | null;
    startDate: string;
    endDate: string;
  }): { validesClotures: RapportDateServiceLine[]; nonValidesClotures: RapportDateServiceLine[] } {
    const { rawReport, country, envNorm, startDate, endDate } = params;
    const byKey = new Map<
      string,
      { date: string; service: string; traitements: string[]; nombre: number; volume: number }
    >();

    for (const row of rawReport) {
      if (!countriesMatch(row.country, country)) {
        continue;
      }
      if (envNorm != null && normalizeReconciliationReportEnv(row.env) !== envNorm) {
        continue;
      }
      const date = this.formatDateForSearch(row.date);
      if (!this.isYmdInRangeInclusive(date, startDate, endDate)) {
        continue;
      }
      const service = (row.service || '').trim();
      if (!service) {
        continue;
      }
      const key = `${date}|${service.toLowerCase()}`;
      const existing = byKey.get(key);
      const traitement = (row.traitement || '').trim();
      const nombre = Number(row.totalTransactions || 0) || 0;
      const volume = Number(row.totalVolume || 0) || 0;
      if (existing) {
        existing.traitements.push(traitement);
        existing.nombre += nombre;
        existing.volume += volume;
      } else {
        byKey.set(key, { date, service, traitements: [traitement], nombre, volume });
      }
    }

    const validesClotures: RapportDateServiceLine[] = [];
    const nonValidesClotures: RapportDateServiceLine[] = [];

    for (const item of byKey.values()) {
      const traitement = this.dominantTraitementRawValue(item.traitements);
      const entry: RapportDateServiceLine = {
        date: item.date,
        service: item.service,
        traitement,
        statutRapport: statutFromTraitementDisplayLabel(traitement),
        nombre: item.nombre,
        volume: item.volume
      };
      if (resolveTraitementKind(traitement) === 'termine') {
        validesClotures.push(entry);
      } else {
        nonValidesClotures.push(entry);
      }
    }

    validesClotures.sort((a, b) => this.compareDateService(a, b));
    nonValidesClotures.sort((a, b) => this.compareDateService(a, b));
    return { validesClotures, nonValidesClotures };
  }

  formatMonthLabel(monthYyyyMm: string): string {
    const [y, m] = monthYyyyMm.split('-').map(Number);
    if (!y || !m) {
      return monthYyyyMm;
    }
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString(I18nService.currentLanguage || 'fr', {
      month: 'long',
      year: 'numeric'
    });
  }

  formatFrShort(ymd: string): string {
    if (!ymd) {
      return '—';
    }
    const p = ymd.split('-');
    if (p.length === 3) {
      return `${p[2]}/${p[1]}/${p[0]}`;
    }
    return ymd;
  }

  collectTicketIds(lines: BoPartenaireResult8Row[]): string[] {
    const set = new Set<string>();
    for (const line of lines) {
      const id = this.normalizeGlpiTicketId(line.glpiId);
      if (id) {
        set.add(id);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  }

  /** Extrait l'identifiant numérique GLPI (évite d'afficher une URL complète). */
  normalizeGlpiTicketId(raw?: string | null): string {
    const v = String(raw || '').trim();
    if (!v) {
      return '';
    }
    const fromUrl = v.match(/[?&]id=(\d+)/i);
    if (fromUrl) {
      return fromUrl[1];
    }
    if (/^\d+$/.test(v)) {
      return v;
    }
    const embedded = v.match(/(\d{5,})/);
    return embedded ? embedded[1] : v;
  }

  private compareDateService(a: RapportDateServiceLine, b: RapportDateServiceLine): number {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return a.service.localeCompare(b.service, 'fr');
  }

  private aggregatesPourService(
    service: string,
    filtered: BoPartenaireResult8Row[],
    dateStart: string,
    dateEnd: string,
    envNorm: string | null,
    manualRows: ReleveManualRangeRow[],
    ecartAll: EcartBoSummary[],
    country: string
  ) {
    const serviceLines = filtered.filter(
      (line) =>
        this.strEqual(line.service, service) &&
        (envNorm == null || normalizeReconciliationReportEnv(line.env) === envNorm)
    );
    const rapportN = serviceLines.reduce((s, l) => s + (l.totalTransactions || 0), 0);
    const rapportV = serviceLines.reduce((s, l) => s + (l.totalVolume || 0), 0);
    const manual = this.sumManualForServiceRange(
      service,
      dateStart,
      dateEnd,
      envNorm,
      manualRows,
      country
    );

    let jp1Nombre = 0;
    let jp1Montant = 0;
    let jm1Nombre = 0;
    let jm1Montant = 0;
    for (const d of this.listYmdInclusive(dateStart, dateEnd)) {
      const j = this.sumEcartPartner(service, d, envNorm, ecartAll, country);
      jp1Nombre += j.nombre;
      jp1Montant += j.montant;
      const jm = this.sumEcartPartner(
        service,
        this.subtractCalendarDaysFromYmd(d, 1),
        envNorm,
        ecartAll,
        country
      );
      jm1Nombre += jm.nombre;
      jm1Montant += jm.montant;
    }

    const boNombre = rapportN + manual.manualNombre;
    const boVolume = rapportV + manual.manualVolume;
    const partenaireNombre =
      rapportN + manual.manualNombre + jp1Nombre - jm1Nombre + manual.rembourseNombre;
    const partenaireVolume =
      rapportV + jp1Montant + manual.manualVolume - jm1Montant + manual.rembourseVolume;

    return {
      boNombre,
      boVolume,
      partenaireNombre,
      partenaireVolume,
      decalageJm1Nombre: jm1Nombre,
      decalageJm1Volume: jm1Montant,
      decalageJp1Nombre: jp1Nombre,
      decalageJp1Volume: jp1Montant
    };
  }

  private sumManualForServiceRange(
    service: string,
    dateStart: string,
    dateEnd: string,
    envNorm: string | null,
    manualRows: ReleveManualRangeRow[],
    country: string
  ) {
    let manualNombre = 0;
    let manualVolume = 0;
    let rembourseNombre = 0;
    let rembourseVolume = 0;
    const cty = (country || '').trim();

    for (const m of manualRows) {
      if (!this.strEqual(m.service, service)) {
        continue;
      }
      if (!this.isYmdInRangeInclusive(m.date, dateStart, dateEnd)) {
        continue;
      }
      if (cty && (m.country || '').trim() && !countriesMatch(m.country, cty)) {
        continue;
      }
      if (envNorm != null) {
        const me = normalizeReconciliationReportEnv(m.env);
        if (me !== envNorm) {
          continue;
        }
      }
      manualNombre += Number(m.manualNombre || 0);
      manualVolume += Number(m.manualVolume || 0);
      rembourseNombre += Number(m.rembourseNombre || 0);
      rembourseVolume += Number(m.rembourseVolume || 0);
    }

    return { manualNombre, manualVolume, rembourseNombre, rembourseVolume };
  }

  private sumEcartPartner(
    service: string,
    dateY: string,
    envKey: string | null,
    ecartAll: EcartBoSummary[],
    country: string
  ): { nombre: number; montant: number } {
    let nombre = 0;
    let montant = 0;
    for (const ecart of ecartAll) {
      const ecartDate = this.formatDateForSearch(ecart.dateTransaction);
      if (ecartDate !== dateY) {
        continue;
      }
      if (!this.strEqual(ecart.service, service)) {
        continue;
      }
      if (!this.ecartPaysMatches(ecart, country)) {
        continue;
      }
      if (!this.isPartenairePlatform(ecart)) {
        continue;
      }
      if (!this.ecartEnvMatches(ecart, envKey)) {
        continue;
      }
      nombre += Number(ecart.nombreTransactions || 0);
      montant += Number(ecart.montantTotal || 0);
    }
    return { nombre, montant };
  }

  private isPartenairePlatform(ecart: EcartBoSummary): boolean {
    return (ecart.env || '').trim().toUpperCase() === 'PARTENAIRE';
  }

  private getEcartEnvCodeRaw(ecart: EcartBoSummary): string {
    const anyE = ecart as EcartBoSummary & { env_code?: string | null };
    const v = ecart.envCode ?? anyE.env_code;
    return v != null ? String(v).trim() : '';
  }

  private ecartEnvMatches(ecart: EcartBoSummary, releveEnvNorm: string | null): boolean {
    if (releveEnvNorm == null) {
      return true;
    }
    const code = this.getEcartEnvCodeRaw(ecart);
    const ecartKey = !code || code.toUpperCase() === 'TOTAL' ? 'T-E' : code;
    return ecartKey.toUpperCase() === releveEnvNorm.toUpperCase();
  }

  private ecartPaysMatches(ecart: EcartBoSummary, selectedCountry: string): boolean {
    const rep = (selectedCountry || '').trim();
    const ep = (ecart.pays || '').trim();
    if (!rep || !ep) {
      return true;
    }
    return countriesMatch(ep, rep);
  }

  private dominantTraitementRawValue(values: (string | undefined | null)[]): string {
    const cleaned = values
      .map((v) => (v ?? '').trim())
      .filter((v) => v.length > 0 && v !== '—');
    if (!cleaned.length) {
      return '';
    }
    const kindRank: Record<'support' | 'cdo' | 'group' | 'termine' | 'none', number> = {
      support: 4,
      cdo: 3,
      group: 2,
      termine: 1,
      none: 0
    };
    let leastAdvanced = cleaned[0];
    for (const t of cleaned) {
      if (kindRank[resolveTraitementKind(t)] > kindRank[resolveTraitementKind(leastAdvanced)]) {
        leastAdvanced = t;
      }
    }
    return leastAdvanced;
  }

  private monthFromYmd(ymd: string): string {
    if (!ymd || ymd.length < 7) {
      return '';
    }
    return ymd.substring(0, 7);
  }

  private monthBounds(monthYyyyMm: string): { start: string; end: string } {
    const [y, m] = monthYyyyMm.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      start: `${monthYyyyMm}-01`,
      end: `${monthYyyyMm}-${String(lastDay).padStart(2, '0')}`
    };
  }

  private listYmdInclusive(start: string, end: string): string[] {
    const out: string[] = [];
    let cur = start;
    while (cur <= end) {
      out.push(cur);
      cur = this.addCalendarDaysToYmd(cur, 1);
    }
    return out;
  }

  private addCalendarDaysToYmd(ymd: string, delta: number): string {
    const p = ymd.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() + delta);
    return this.toYmd(d);
  }

  private subtractCalendarDaysFromYmd(ymd: string, delta: number): string {
    return this.addCalendarDaysToYmd(ymd, -delta);
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private isYmdInRangeInclusive(ymd: string, start: string, end: string): boolean {
    const n = this.formatDateForSearch(ymd);
    return n >= start && n <= end;
  }

  private strEqual(a?: string | null, b?: string | null): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }

  private formatDateForSearch(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    const dmY = dateStr.trim().match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})$/);
    if (dmY) {
      return `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
    }
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.split(' ')[0];
    }
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return this.toYmd(d);
      }
    } catch {
      /* ignore */
    }
    return dateStr;
  }
}

export { traitementDisplayLabel, resolveTraitementKind };
