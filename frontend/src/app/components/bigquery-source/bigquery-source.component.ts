import { Component, EventEmitter, OnDestroy, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import {
  BigQueryLauncherQuery,
  BigQueryPartnerFile,
  BigQueryReadyExtract,
  BigQueryService
} from '../../services/bigquery.service';
import { PopupService } from '../../services/popup.service';

interface SelectablePartnerFile extends BigQueryPartnerFile {
  selected: boolean;
}

/** Fichiers prêts pour une réconciliation : BO issu de BigQuery + fichiers partenaires du dossier. */
export interface BigQueryLaunchFiles {
  boFile: File | null;
  partnerFiles: File[];
  launch: boolean;
}

/**
 * Source BigQuery de la réconciliation magique (Lanceur).
 *
 * <p>Propose les extractions préparées automatiquement (la veille), une extraction à l'instant T
 * pour une date choisie, et les fichiers partenaires du sous-dossier du dossier surveillé.
 * Le composant reste masqué si aucune requête BigQuery n'est configurée.</p>
 */
@Component({
  selector: 'app-bigquery-source',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './bigquery-source.component.html',
  styleUrls: ['./bigquery-source.component.scss']
})
export class BigquerySourceComponent implements OnInit, OnDestroy {

  /** Fichiers à placer dans la fenêtre (et lancement immédiat si {@code launch}). */
  @Output() filesReady = new EventEmitter<BigQueryLaunchFiles>();

  private destroy$ = new Subject<void>();

  available = false;
  queries: BigQueryLauncherQuery[] = [];
  extracts: BigQueryReadyExtract[] = [];
  partnerFiles: SelectablePartnerFile[] = [];
  partnerError: string | null = null;

  selectedQueryId: number | null = null;
  date = BigquerySourceComponent.yesterday();

  extracting = false;
  loadingFiles = false;
  expanded = true;

  constructor(
    private service: BigQueryService,
    private popupService: PopupService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private static yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant('LNC.bq.' + key, params);
  }

  private errorMessage(err: any): string {
    return err?.error?.error || err?.error?.message || err?.message || this.t('errUnknown');
  }

  refresh(): void {
    forkJoin({
      queries: this.service.launcherQueries().pipe(catchError(() => of([] as BigQueryLauncherQuery[]))),
      extracts: this.service.readyExtracts().pipe(catchError(() => of([] as BigQueryReadyExtract[])))
    }).pipe(takeUntil(this.destroy$)).subscribe(({ queries, extracts }) => {
      this.queries = queries || [];
      this.extracts = extracts || [];
      this.available = this.queries.length > 0;
      if (this.selectedQueryId == null && this.queries.length) this.selectedQueryId = this.queries[0].id;
      if (this.available) this.loadPartnerFiles();
      this.cdr.markForCheck();
    });
  }

  loadPartnerFiles(): void {
    this.service.partnerFiles().pipe(takeUntil(this.destroy$)).subscribe({
      next: files => {
        const since = this.extractDate();
        this.partnerFiles = (files || []).map(f => ({
          ...f,
          // Présélection : fichiers déposés depuis la date des opérations extraites
          selected: !since || (f.lastModified || '').slice(0, 10) >= since
        }));
        this.partnerError = null;
        this.cdr.markForCheck();
      },
      error: err => {
        this.partnerFiles = [];
        this.partnerError = this.errorMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  /** Date des opérations de l'extraction la plus récente (aaaa-mm-jj). */
  private extractDate(): string | null {
    const dates = this.extracts.map(e => e.dateParam).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }

  get selectedPartnerCount(): number {
    return this.partnerFiles.filter(f => f.selected).length;
  }

  toggleAll(value: boolean): void {
    this.partnerFiles.forEach(f => f.selected = value);
  }

  /** Extraction à l'instant T, puis utilisation comme fichier BO. */
  async extractNow(): Promise<void> {
    if (this.selectedQueryId == null) return;
    this.extracting = true;
    this.cdr.markForCheck();
    try {
      const extract = await firstValueFrom(this.service.extractNow(this.selectedQueryId, this.date || null));
      if (extract.status !== 'OK' || !extract.fileName) {
        this.popupService.showError(extract.message || this.t('extractFailed'));
        return;
      }
      if (!extract.rowCount) {
        this.popupService.showWarning(extract.message || this.t('noRows'));
      }
      this.refresh();
      const file = await firstValueFrom(this.service.extractFile(extract.id, extract.fileName));
      this.filesReady.emit({ boFile: file, partnerFiles: [], launch: false });
    } catch (err) {
      this.popupService.showError(this.errorMessage(err));
    } finally {
      this.extracting = false;
      this.cdr.markForCheck();
    }
  }

  async useExtract(e: BigQueryReadyExtract, launch = false): Promise<void> {
    this.loadingFiles = true;
    this.cdr.markForCheck();
    try {
      const boFile = await firstValueFrom(this.service.extractFile(e.extractId, e.fileName));
      const partnerFiles = launch ? await this.downloadSelectedPartners() : [];
      if (launch && !partnerFiles.length) {
        this.popupService.showWarning(this.t('noPartnerSelected'));
        this.filesReady.emit({ boFile, partnerFiles: [], launch: false });
        return;
      }
      this.filesReady.emit({ boFile, partnerFiles, launch });
    } catch (err) {
      this.popupService.showError(this.errorMessage(err));
    } finally {
      this.loadingFiles = false;
      this.cdr.markForCheck();
    }
  }

  async addSelectedPartners(): Promise<void> {
    this.loadingFiles = true;
    this.cdr.markForCheck();
    try {
      const partnerFiles = await this.downloadSelectedPartners();
      this.filesReady.emit({ boFile: null, partnerFiles, launch: false });
    } catch (err) {
      this.popupService.showError(this.errorMessage(err));
    } finally {
      this.loadingFiles = false;
      this.cdr.markForCheck();
    }
  }

  private async downloadSelectedPartners(): Promise<File[]> {
    const selected = this.partnerFiles.filter(f => f.selected);
    const files: File[] = [];
    for (const f of selected) {
      files.push(await firstValueFrom(this.service.partnerFile(f.fileName)));
    }
    return files;
  }

  formatSize(size: number | null | undefined): string {
    if (!size) return '0 o';
    if (size < 1024) return `${size} o`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} Ko`;
    return `${(size / 1024 / 1024).toFixed(1)} Mo`;
  }
}
