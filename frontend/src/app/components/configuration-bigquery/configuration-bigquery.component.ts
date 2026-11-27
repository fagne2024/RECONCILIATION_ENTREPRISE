import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  BigQueryConfig,
  BigQueryDryRun,
  BigQueryExtract,
  BigQueryQuery,
  BigQueryQueryRequest,
  BigQueryService
} from '../../services/bigquery.service';
import { PopupService } from '../../services/popup.service';

/**
 * Configuration > BigQuery.
 *
 * <p>Compte de service Google (clé JSON), projet, heures de préparation automatique des
 * extractions de la veille, sous-dossier des fichiers partenaires et requêtes dont le résultat
 * sert de fichier BO dans le Lanceur (réconciliation magique).</p>
 */
@Component({
  selector: 'app-configuration-bigquery',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-bigquery.component.html',
  styleUrls: ['../configuration-sharepoint-sync/configuration-sharepoint-sync.component.scss', './configuration-bigquery.component.scss']
})
export class ConfigurationBigqueryComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  config: BigQueryConfig | null = null;
  form = {
    enabled: false,
    heuresExecution: '06:00',
    projectId: '',
    location: '',
    serviceAccountJson: '',
    partnerSubfolder: 'partenaires',
    maxRows: 1000000
  };

  queries: BigQueryQuery[] = [];
  history: BigQueryExtract[] = [];
  editing: (BigQueryQueryRequest & { id: number | null }) | null = null;

  dryRunDate = ConfigurationBigqueryComponent.yesterday();
  dryRunResult: (BigQueryDryRun & { libelle: string }) | null = null;

  loading = false;
  savingConfig = false;
  savingQuery = false;
  testingConnexion = false;
  busy: string | null = null;

  constructor(
    private service: BigQueryService,
    private popupService: PopupService,
    private translate: TranslateService,
    private location: Location,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private static yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant('CFG.bigquery.' + key, params);
  }

  private errorMessage(err: any): string {
    return err?.error?.error || err?.error?.message || this.t('errUnknown');
  }

  load(): void {
    this.loading = true;
    this.service.getConfig().pipe(takeUntil(this.destroy$), finalize(() => {
      this.loading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: cfg => this.applyConfig(cfg),
      error: err => this.popupService.showError(this.errorMessage(err))
    });
    this.loadQueries();
    this.loadHistory();
  }

  private applyConfig(cfg: BigQueryConfig): void {
    this.config = cfg;
    this.form = {
      enabled: cfg.enabled,
      heuresExecution: cfg.heuresExecution || '06:00',
      projectId: cfg.projectId || '',
      location: cfg.location || '',
      serviceAccountJson: '',
      partnerSubfolder: cfg.partnerSubfolder || 'partenaires',
      maxRows: cfg.maxRows || 1000000
    };
  }

  loadQueries(): void {
    this.service.listQueries().pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.queries = list || [];
        this.cdr.markForCheck();
      },
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  loadHistory(): void {
    this.service.history().pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.history = list || [];
        this.cdr.markForCheck();
      },
      error: () => { /* historique facultatif */ }
    });
  }

  // ------------------------------------------------------------ Connexion et planning

  onKeyFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.form.serviceAccountJson = String(reader.result || '');
      this.cdr.markForCheck();
    };
    reader.readAsText(file);
  }

  saveConfig(): void {
    this.savingConfig = true;
    this.service.saveConfig({
      enabled: this.form.enabled,
      heuresExecution: this.form.heuresExecution,
      projectId: this.form.projectId.trim() || null,
      location: this.form.location.trim() || null,
      serviceAccountJson: this.form.serviceAccountJson.trim() || null,
      partnerSubfolder: this.form.partnerSubfolder,
      maxRows: Number(this.form.maxRows)
    }).pipe(takeUntil(this.destroy$), finalize(() => {
      this.savingConfig = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: cfg => {
        this.applyConfig(cfg);
        this.popupService.showSuccess(this.t('configSaved'));
      },
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  async clearKey(): Promise<void> {
    if (!(await this.popupService.showConfirm(this.t('confirmClearKey')))) return;
    this.savingConfig = true;
    this.service.saveConfig({
      enabled: false,
      heuresExecution: this.form.heuresExecution,
      projectId: this.form.projectId.trim() || null,
      location: this.form.location.trim() || null,
      effacerCle: true,
      partnerSubfolder: this.form.partnerSubfolder,
      maxRows: Number(this.form.maxRows)
    }).pipe(takeUntil(this.destroy$), finalize(() => {
      this.savingConfig = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: cfg => this.applyConfig(cfg),
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  testConnexion(): void {
    this.testingConnexion = true;
    this.service.testConnexion().pipe(takeUntil(this.destroy$), finalize(() => {
      this.testingConnexion = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: res => this.popupService.showSuccess(res?.message || this.t('connexionOk')),
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  // ------------------------------------------------------------ Requêtes

  newQuery(): void {
    this.editing = {
      id: null,
      libelle: '',
      sqlText: 'SELECT *\nFROM `projet.dataset.transactions`\nWHERE DATE(date_transaction) = @date',
      boFilePrefix: 'TRXBO',
      enabled: true
    };
  }

  editQuery(q: BigQueryQuery): void {
    this.editing = { id: q.id, libelle: q.libelle, sqlText: q.sqlText, boFilePrefix: q.boFilePrefix, enabled: q.enabled };
  }

  cancelEdit(): void {
    this.editing = null;
  }

  saveQuery(): void {
    if (!this.editing) return;
    const { id, ...req } = this.editing;
    this.savingQuery = true;
    const call = id == null ? this.service.createQuery(req) : this.service.updateQuery(id, req);
    call.pipe(takeUntil(this.destroy$), finalize(() => {
      this.savingQuery = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.editing = null;
        this.loadQueries();
      },
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  async deleteQuery(q: BigQueryQuery): Promise<void> {
    if (!(await this.popupService.showConfirm(this.t('confirmDelete', { libelle: q.libelle })))) return;
    this.busy = 'delete-' + q.id;
    this.service.deleteQuery(q.id).pipe(takeUntil(this.destroy$), finalize(() => {
      this.busy = null;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => this.loadQueries(),
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  dryRun(q: BigQueryQuery): void {
    this.busy = 'dry-' + q.id;
    this.service.dryRun(q.id, this.dryRunDate || null).pipe(takeUntil(this.destroy$), finalize(() => {
      this.busy = null;
      this.cdr.markForCheck();
    })).subscribe({
      next: res => this.dryRunResult = { ...res, libelle: q.libelle },
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  get anyBusy(): boolean {
    return this.busy !== null;
  }

  close(): void {
    this.location.back();
  }
}
