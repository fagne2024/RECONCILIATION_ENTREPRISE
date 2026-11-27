import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  SharepointSourceReport,
  SharepointSyncConfig,
  SharepointSyncRun,
  SharepointSyncService,
  SharepointSyncSource,
  SharepointSyncSourceRequest
} from '../../services/sharepoint-sync.service';
import { PopupService } from '../../services/popup.service';

const DEFAULT_SHEET_CLIENT = 'Compense client';
const DEFAULT_SHEET_FOURNISSEUR = 'Compense fournisseur';

/**
 * Configuration > Synchronisation SharePoint.
 *
 * <p>Connexion Microsoft 365 (application Entra ID), heures de lancement du job, liens
 * SharePoint à scanner (dernier fichier du site, feuilles « Compense client » et
 * « Compense fournisseur ») et historique. Les lignes du mois sont chargées dans le suivi
 * des compenses OP (écran Banque), en reprenant après la dernière ligne chargée.</p>
 */
@Component({
  selector: 'app-configuration-sharepoint-sync',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-sharepoint-sync.component.html',
  styleUrls: ['./configuration-sharepoint-sync.component.scss']
})
export class ConfigurationSharepointSyncComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  config: SharepointSyncConfig | null = null;
  form = { enabled: false, heuresExecution: '08:00', azureTenantId: '', clientId: '', clientSecret: '' };

  sources: SharepointSyncSource[] = [];
  history: SharepointSyncRun[] = [];

  /** Lien en cours d'édition (id null = nouveau lien). */
  editing: (SharepointSyncSourceRequest & { id: number | null }) | null = null;

  reports: SharepointSourceReport[] = [];

  loading = false;
  savingConfig = false;
  savingSource = false;
  testingConnexion = false;
  /** Action en cours : 'all' ou `${action}-${id}`. */
  busy: string | null = null;

  constructor(
    private service: SharepointSyncService,
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

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant('CFG.sharepoint.' + key, params);
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
    this.loadSources();
    this.loadHistory();
  }

  private applyConfig(cfg: SharepointSyncConfig): void {
    this.config = cfg;
    this.form = {
      enabled: cfg.enabled,
      heuresExecution: cfg.heuresExecution || '08:00',
      azureTenantId: cfg.azureTenantId || '',
      clientId: cfg.clientId || '',
      clientSecret: ''
    };
  }

  loadSources(): void {
    this.service.listSources().pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.sources = list || [];
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

  saveConfig(): void {
    this.savingConfig = true;
    this.service.saveConfig({
      enabled: this.form.enabled,
      heuresExecution: this.form.heuresExecution,
      azureTenantId: this.form.azureTenantId.trim() || null,
      clientId: this.form.clientId.trim() || null,
      clientSecret: this.form.clientSecret.trim() || null
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

  async clearSecret(): Promise<void> {
    if (!(await this.popupService.showConfirm(this.t('confirmClearSecret')))) return;
    this.savingConfig = true;
    this.service.saveConfig({
      enabled: false,
      heuresExecution: this.form.heuresExecution,
      azureTenantId: this.form.azureTenantId.trim() || null,
      clientId: this.form.clientId.trim() || null,
      effacerSecret: true
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

  // ------------------------------------------------------------ Liens

  newSource(): void {
    this.editing = {
      id: null,
      libelle: '',
      url: '',
      filePattern: '',
      sheetClient: DEFAULT_SHEET_CLIENT,
      sheetFournisseur: DEFAULT_SHEET_FOURNISSEUR,
      enabled: true
    };
  }

  editSource(s: SharepointSyncSource): void {
    this.editing = {
      id: s.id,
      libelle: s.libelle,
      url: s.url,
      filePattern: s.filePattern,
      sheetClient: s.sheetClient || DEFAULT_SHEET_CLIENT,
      sheetFournisseur: s.sheetFournisseur || DEFAULT_SHEET_FOURNISSEUR,
      enabled: s.enabled
    };
  }

  cancelEdit(): void {
    this.editing = null;
  }

  saveSource(): void {
    if (!this.editing) return;
    const { id, ...req } = this.editing;
    this.savingSource = true;
    const call = id == null ? this.service.createSource(req) : this.service.updateSource(id, req);
    call.pipe(takeUntil(this.destroy$), finalize(() => {
      this.savingSource = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.editing = null;
        this.loadSources();
      },
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  async deleteSource(s: SharepointSyncSource): Promise<void> {
    if (!(await this.popupService.showConfirm(this.t('confirmDelete', { libelle: s.libelle })))) return;
    this.busy = 'delete-' + s.id;
    this.service.deleteSource(s.id).pipe(takeUntil(this.destroy$), finalize(() => {
      this.busy = null;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => this.loadSources(),
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  async resetCursor(s: SharepointSyncSource): Promise<void> {
    if (!(await this.popupService.showConfirm(this.t('confirmReset', { libelle: s.libelle })))) return;
    this.busy = 'reset-' + s.id;
    this.service.resetCursor(s.id).pipe(takeUntil(this.destroy$), finalize(() => {
      this.busy = null;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => this.loadSources(),
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  testSource(s: SharepointSyncSource): void {
    this.busy = 'test-' + s.id;
    this.service.testSource(s.id).pipe(takeUntil(this.destroy$), finalize(() => {
      this.busy = null;
      this.cdr.markForCheck();
    })).subscribe({
      next: report => this.reports = [report],
      error: err => this.popupService.showError(this.errorMessage(err))
    });
  }

  runSource(s: SharepointSyncSource): void {
    this.busy = 'run-' + s.id;
    this.service.runSource(s.id).pipe(takeUntil(this.destroy$), finalize(() => this.afterRun()))
      .subscribe({
        next: reports => this.reports = reports || [],
        error: err => this.popupService.showError(this.errorMessage(err))
      });
  }

  runAll(): void {
    this.busy = 'all';
    this.service.runAll().pipe(takeUntil(this.destroy$), finalize(() => this.afterRun()))
      .subscribe({
        next: reports => this.reports = reports || [],
        error: err => this.popupService.showError(this.errorMessage(err))
      });
  }

  private afterRun(): void {
    this.busy = null;
    this.loadSources();
    this.loadHistory();
    this.cdr.markForCheck();
  }

  closeReports(): void {
    this.reports = [];
  }

  /** Index Excel 0-based → numéro de ligne affiché dans Excel. */
  excelRow(index: number | null): string {
    return index == null ? '—' : String(index + 1);
  }

  get anyBusy(): boolean {
    return this.busy !== null;
  }

  close(): void {
    this.location.back();
  }
}
