import { Injectable } from '@angular/core';
import { EcartBoSummary } from './ecart-bo-summary.service';
import { ReleveManualRangeRow } from './dashboard.service';
import { BoPartenaireResult8Row } from './bo-partenaire-aggregation.service';

export interface BoPartenaireReportCacheSnapshot {
  rawReport: BoPartenaireResult8Row[];
  ecartAll: EcartBoSummary[];
  manualRows: ReleveManualRangeRow[];
  dateDebut: string;
  dateFin: string;
  selectedCountry: string;
  selectedEnv: string;
  savedAt: number;
}

@Injectable({ providedIn: 'root' })
export class BoPartenaireReportCacheService {
  private snapshot: BoPartenaireReportCacheSnapshot | null = null;

  publish(data: Omit<BoPartenaireReportCacheSnapshot, 'savedAt'>): void {
    this.snapshot = { ...data, savedAt: Date.now() };
  }

  /** Retourne le cache si le périmètre date/pays/env correspond. */
  consumeIfMatching(params: {
    dateDebut: string;
    dateFin: string;
    country: string;
    env: string;
  }): BoPartenaireReportCacheSnapshot | null {
    const snap = this.snapshot;
    if (!snap) {
      return null;
    }
    const maxAgeMs = 15 * 60 * 1000;
    if (Date.now() - snap.savedAt > maxAgeMs) {
      return null;
    }
    if (snap.dateDebut !== params.dateDebut || snap.dateFin !== params.dateFin) {
      return null;
    }
    if ((snap.selectedCountry || '').trim() !== (params.country || '').trim()) {
      return null;
    }
    if (this.normalizeEnv(snap.selectedEnv) !== this.normalizeEnv(params.env)) {
      return null;
    }
    return snap;
  }

  peek(): BoPartenaireReportCacheSnapshot | null {
    return this.snapshot;
  }

  private normalizeEnv(env: string): string {
    return (env || 'ALL').trim().toUpperCase();
  }
}
