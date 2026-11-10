import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, Subject } from 'rxjs';
import * as XLSX from 'xlsx';
import { AutoProcessingModel, AutoProcessingService } from '../../services/auto-processing.service';
import { ModelPreProcessingService } from '../../services/model-preprocessing.service';
import { FileWatcherService } from '../../services/file-watcher.service';
import { ModelNormalizationService } from '../../services/model-normalization.service';
import { PopupService } from '../../services/popup.service';
import { suggestEquivalentHeaders } from '../../utils/bilingual-column.util';
import { findHeaderRowIndexInGrid } from '../../utils/model-header-detection.util';
import {
  ModelColumnEquivalence,
  normalizeHeaderKey,
  planColumnNormalization
} from '../../utils/model-column-normalization.util';

/** Une colonne par défaut du modèle, éditée à l'écran. */
interface ColumnRow {
  columnName: string;
  equivalents: string[];
  /** Saisie en cours d'un nouvel en-tête équivalent. */
  draft: string;
  /** Colonne ajoutée à la main (absente du fichier modèle). */
  custom: boolean;
  suggestions: string[];
}

type CheckStatus = 'present' | 'equivalent' | 'missing';

interface CheckResult {
  fileName: string;
  headerFound: boolean;
  columns: Array<{ columnName: string; status: CheckStatus; foundAs?: string }>;
  /** En-têtes du fichier qui ne correspondent à aucune colonne du modèle. */
  extraHeaders: string[];
}

/**
 * Configuration > Normalisation modèle.
 *
 * Pour chaque modèle, liste les colonnes par défaut (celles du fichier modèle et celles
 * utilisées par sa configuration) et permet d'y associer des en-têtes équivalents
 * (autre langue, nouvelle version du fichier, libellé propre à un partenaire).
 * Au chargement d'un fichier (traitement ou réconciliation), un en-tête équivalent
 * présent est renommé avec le nom de la colonne par défaut.
 */
@Component({
  selector: 'app-configuration-normalisation',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-normalisation.component.html',
  styleUrls: ['./configuration-normalisation.component.scss']
})
export class ConfigurationNormalisationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  models: AutoProcessingModel[] = [];
  selectedModelKey = '';
  rows: ColumnRow[] = [];
  searchTerm = '';
  newColumnName = '';

  loadingModels = false;
  loadingColumns = false;
  saving = false;
  dirty = false;
  errorMessage = '';

  check: CheckResult | null = null;
  checking = false;

  /** Colonnes par défaut lues dans le vrai fichier modèle (sinon liste générique de repli). */
  templateFileFound = true;

  /** Équivalences enregistrées de l'entreprise (tous modèles), pour les compteurs. */
  private savedByModel = new Map<string, ModelColumnEquivalence[]>();
  private templateFilesCache: any[] | null = null;

  constructor(
    private autoProcessingService: AutoProcessingService,
    private modelPreProcessingService: ModelPreProcessingService,
    private fileWatcherService: FileWatcherService,
    private normalizationService: ModelNormalizationService,
    private popupService: PopupService,
    private translate: TranslateService,
    private location: Location,
    private cd: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.loadingModels = true;
    try {
      const [models, saved] = await Promise.all([
        this.autoProcessingService.getAllModelsUnrestricted(true),
        firstValueFrom(this.normalizationService.list()).catch(() => [] as ModelColumnEquivalence[])
      ]);
      this.models = (models || [])
        .filter(m => !!this.modelKey(m))
        .sort((a, b) => this.typeOrder(a) - this.typeOrder(b) || (a.name || '').localeCompare(b.name || ''));
      this.indexSaved(saved);
      if (this.models.length) {
        await this.selectModel(this.modelKey(this.models[0]));
      }
    } catch {
      this.errorMessage = this.t('CFG.normalisation.loadError');
    } finally {
      this.loadingModels = false;
      this.cd.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ------------------------------------------------------------------
  // Modèles
  // ------------------------------------------------------------------

  modelKey(model: AutoProcessingModel): string {
    return model.modelId || model.id || '';
  }

  get selectedModel(): AutoProcessingModel | undefined {
    return this.models.find(m => this.modelKey(m) === this.selectedModelKey);
  }

  modelTypeLabel(model: AutoProcessingModel): string {
    return this.t(model.fileType === 'bo' ? 'CFG.normalisation.typeBo'
      : model.fileType === 'partner' ? 'CFG.normalisation.typePartner'
        : 'CFG.normalisation.typeOther');
  }

  savedCount(model: AutoProcessingModel): number {
    return (this.savedByModel.get(this.modelKey(model)) || [])
      .reduce((n, eq) => n + (eq.equivalents?.length || 0), 0);
  }

  async onModelChange(key: string): Promise<void> {
    if (this.dirty && !(await this.popupService.showConfirm(
      this.t('CFG.normalisation.discardConfirm'),
      this.t('CFG.normalisation.title')
    ))) {
      // Revenir à la sélection précédente dans la liste déroulante.
      const previous = this.selectedModelKey;
      this.selectedModelKey = '';
      this.cd.detectChanges();
      this.selectedModelKey = previous;
      return;
    }
    await this.selectModel(key);
  }

  private async selectModel(key: string): Promise<void> {
    this.selectedModelKey = key;
    this.check = null;
    this.searchTerm = '';
    this.errorMessage = '';
    const model = this.selectedModel;
    if (!model) {
      this.rows = [];
      return;
    }
    this.loadingColumns = true;
    this.cd.detectChanges();
    try {
      const defaults = await this.collectDefaultColumns(model);
      const saved = this.savedByModel.get(key) || [];
      const byKey = new Map(saved.map(eq => [normalizeHeaderKey(eq.columnName), eq]));
      const rows: ColumnRow[] = defaults.map(col => this.buildRow(col, byKey.get(normalizeHeaderKey(col))?.equivalents || [], false));
      const defaultKeys = new Set(defaults.map(normalizeHeaderKey));
      for (const eq of saved) {
        if (!defaultKeys.has(normalizeHeaderKey(eq.columnName))) {
          rows.push(this.buildRow(eq.columnName, eq.equivalents || [], true));
        }
      }
      this.rows = rows;
      this.dirty = false;
    } finally {
      this.loadingColumns = false;
      this.cd.detectChanges();
    }
  }

  /**
   * Colonnes par défaut : celles du fichier modèle (watch-folder ou gabarit connu),
   * complétées par les colonnes utilisées dans la configuration du modèle
   * (clés de réconciliation, filtres et règles de traitement).
   */
  private async collectDefaultColumns(model: AutoProcessingModel): Promise<string[]> {
    const columns: string[] = [];
    const seen = new Set<string>();
    const add = (col: unknown) => {
      const value = String(col ?? '').trim();
      const key = normalizeHeaderKey(value);
      if (value && key && !seen.has(key) && !value.startsWith('__')) {
        seen.add(key);
        columns.push(value);
      }
    };

    // Référence : le vrai fichier modèle du dossier surveillé. La liste générique codée en dur
    // (commune à tous les modèles Airtel, Orange…) n'est qu'un repli : elle peut contenir des
    // libellés absents du fichier réel (ex. « Status » au lieu de « Transaction Status »).
    if (model.templateFile) {
      (await this.loadTemplateFileColumns(model.templateFile)).forEach(add);
    }
    this.templateFileFound = columns.length > 0;
    if (!columns.length) {
      this.modelPreProcessingService.getDefaultTemplateColumns(model.templateFile, model.filePattern).forEach(add);
    }

    const rk = model.reconciliationKeys;
    if (model.fileType === 'bo') {
      // Clés BO déclarées par les modèles partenaires liés à ce modèle BO.
      for (const pm of this.models) {
        const keys = pm.reconciliationKeys?.boModelKeys?.[this.modelKey(model)] || [];
        keys.forEach(add);
      }
    } else {
      (rk?.partnerKeys || []).forEach(add);
    }
    this.modelPreProcessingService.collectInputColumns(model.preProcessingConfig).forEach(add);

    if (model.id) {
      try {
        const rules = await this.autoProcessingService.getColumnProcessingRules(model.id);
        rules.forEach(rule => add(rule.sourceColumn));
      } catch {
        // Règles indisponibles : on garde les colonnes déjà trouvées.
      }
    }
    return columns;
  }

  private async loadTemplateFileColumns(templateFile: string): Promise<string[]> {
    try {
      if (!this.templateFilesCache) {
        this.templateFilesCache = await firstValueFrom(this.fileWatcherService.getAvailableFiles()) ?? [];
      }
      const cached = this.templateFilesCache.find(f => f.fileName === templateFile);
      if (cached?.columns?.length) {
        return cached.columns;
      }
      const analyzed = await firstValueFrom(this.fileWatcherService.analyzeFile(templateFile));
      return analyzed?.columns || [];
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------
  // Édition
  // ------------------------------------------------------------------

  get filteredRows(): ColumnRow[] {
    const term = normalizeHeaderKey(this.searchTerm);
    if (!term) {
      return this.rows;
    }
    return this.rows.filter(r =>
      normalizeHeaderKey(r.columnName).includes(term)
      || r.equivalents.some(e => normalizeHeaderKey(e).includes(term))
    );
  }

  get configuredCount(): number {
    return this.rows.filter(r => r.equivalents.length > 0).length;
  }

  addEquivalent(row: ColumnRow, value?: string): void {
    const label = (value ?? row.draft).trim();
    row.draft = '';
    if (!label) {
      return;
    }
    const key = normalizeHeaderKey(label);
    if (key === normalizeHeaderKey(row.columnName) || row.equivalents.some(e => normalizeHeaderKey(e) === key)) {
      return;
    }
    const conflict = this.rows.find(r => r !== row && (
      normalizeHeaderKey(r.columnName) === key
      || r.equivalents.some(e => normalizeHeaderKey(e) === key)
    ));
    if (conflict) {
      this.popupService.showWarning(
        this.t('CFG.normalisation.conflict', { header: label, column: conflict.columnName }),
        this.t('CFG.normalisation.title')
      );
      return;
    }
    row.equivalents = [...row.equivalents, label];
    row.suggestions = row.suggestions.filter(s => normalizeHeaderKey(s) !== key);
    this.markDirty();
  }

  removeEquivalent(row: ColumnRow, index: number): void {
    row.equivalents = row.equivalents.filter((_, i) => i !== index);
    row.suggestions = this.computeSuggestions(row.columnName, row.equivalents);
    this.markDirty();
  }

  addCustomColumn(): void {
    const name = this.newColumnName.trim();
    if (!name) {
      return;
    }
    const key = normalizeHeaderKey(name);
    if (this.rows.some(r => normalizeHeaderKey(r.columnName) === key)) {
      this.popupService.showWarning(this.t('CFG.normalisation.columnExists', { column: name }), this.t('CFG.normalisation.title'));
      return;
    }
    this.rows = [...this.rows, this.buildRow(name, [], true)];
    this.newColumnName = '';
    this.markDirty();
  }

  removeCustomColumn(row: ColumnRow): void {
    this.rows = this.rows.filter(r => r !== row);
    this.markDirty();
  }

  async save(): Promise<void> {
    const model = this.selectedModel;
    if (!model || this.saving) {
      return;
    }
    this.saving = true;
    this.cd.detectChanges();
    try {
      const items = this.rows
        .filter(r => r.equivalents.length > 0)
        .map(r => ({ columnName: r.columnName, equivalents: r.equivalents }));
      const saved = await firstValueFrom(this.normalizationService.replaceForModel(this.selectedModelKey, items));
      this.savedByModel.set(this.selectedModelKey, saved);
      this.dirty = false;
      if (this.check) {
        this.check = null;
      }
      this.popupService.showSuccess(this.t('CFG.normalisation.saved'), this.t('CFG.normalisation.title'));
    } catch (error: any) {
      const message = error?.error?.message || error?.message || this.t('CFG.normalisation.saveError');
      this.popupService.showError(message, this.t('CFG.normalisation.title'));
    } finally {
      this.saving = false;
      this.cd.detectChanges();
    }
  }

  async cancel(): Promise<void> {
    if (this.selectedModelKey) {
      await this.selectModel(this.selectedModelKey);
    }
  }

  close(): void {
    this.location.back();
  }

  // ------------------------------------------------------------------
  // Vérification d'un fichier
  // ------------------------------------------------------------------

  async onCheckFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.checking = true;
    this.cd.detectChanges();
    try {
      const grid = await this.readFirstRows(file);
      const defaults = this.rows.map(r => r.columnName);
      const alternatives = new Map(this.rows.map(r => [r.columnName, r.equivalents]));
      const headerIndex = findHeaderRowIndexInGrid(grid, defaults, 80, alternatives);
      const headerFound = headerIndex !== null;
      const headers = (grid[headerFound ? headerIndex! : 0] || [])
        .map(cell => String(cell ?? '').trim())
        .filter(Boolean);
      this.check = this.buildCheck(file.name, headers, headerFound);
    } catch {
      this.popupService.showError(this.t('CFG.normalisation.checkError'), this.t('CFG.normalisation.title'));
    } finally {
      this.checking = false;
      this.cd.detectChanges();
    }
  }

  checkStatus(row: ColumnRow): { status: CheckStatus; foundAs?: string } | null {
    return this.check?.columns.find(c => c.columnName === row.columnName) ?? null;
  }

  get checkSummary(): { present: number; equivalent: number; missing: number } {
    const columns = this.check?.columns || [];
    return {
      present: columns.filter(c => c.status === 'present').length,
      equivalent: columns.filter(c => c.status === 'equivalent').length,
      missing: columns.filter(c => c.status === 'missing').length
    };
  }

  /** Associe un en-tête du fichier vérifié à une colonne manquante (comme équivalent). */
  mapExtraHeader(columnName: string, header: string): void {
    const row = this.rows.find(r => r.columnName === columnName);
    if (!row) {
      return;
    }
    this.addEquivalent(row, header);
    if (this.check) {
      const headers = [...this.check.columns.filter(c => c.foundAs).map(c => c.foundAs!), ...this.check.extraHeaders];
      this.check = this.buildCheck(this.check.fileName, headers, this.check.headerFound);
    }
  }

  get missingRows(): ColumnRow[] {
    return this.rows.filter(r => this.checkStatus(r)?.status === 'missing');
  }

  private buildCheck(fileName: string, headers: string[], headerFound: boolean): CheckResult {
    const equivalences = this.rows.map(r => ({ columnName: r.columnName, equivalents: r.equivalents }));
    // Même calcul qu'au chargement d'un fichier ; le statut de chaque colonne est déduit ci-dessous.
    const plan = planColumnNormalization(headers, equivalences);
    const renamedTo = new Map(plan.renames.map(r => [r.to, r.from]));
    const headerKeys = new Map(headers.map(h => [normalizeHeaderKey(h), h]));
    const used = new Set<string>();
    const columns = this.rows.map(r => {
      const direct = headerKeys.get(normalizeHeaderKey(r.columnName));
      if (direct) {
        used.add(direct);
        return { columnName: r.columnName, status: 'present' as CheckStatus, foundAs: direct };
      }
      const via = renamedTo.get(r.columnName);
      if (via) {
        used.add(via);
        return { columnName: r.columnName, status: 'equivalent' as CheckStatus, foundAs: via };
      }
      return { columnName: r.columnName, status: 'missing' as CheckStatus };
    });
    return {
      fileName,
      headerFound,
      columns,
      extraHeaders: headers.filter(h => !used.has(h))
    };
  }

  private async readFirstRows(file: File): Promise<unknown[][]> {
    const buffer = await file.arrayBuffer();
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv')) {
      const text = new TextDecoder('utf-8').decode(buffer.slice(0, 256 * 1024));
      const lines = text.split(/\r?\n/).slice(0, 80);
      const delimiter = this.detectDelimiter(lines);
      return lines.map(line => line.split(delimiter).map(cell => cell.replace(/^"|"$/g, '').trim()));
    }
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', sheetRows: 80 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
  }

  private detectDelimiter(lines: string[]): string {
    const sample = lines.slice(0, 20).join('\n');
    const candidates = [';', ',', '\t', '|'];
    let best = ';';
    let bestCount = -1;
    for (const d of candidates) {
      const count = sample.split(d).length;
      if (count > bestCount) {
        bestCount = count;
        best = d;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------------

  trackByColumn(_: number, row: ColumnRow): string {
    return row.columnName;
  }

  private buildRow(columnName: string, equivalents: string[], custom: boolean): ColumnRow {
    return {
      columnName,
      equivalents: [...equivalents],
      draft: '',
      custom,
      suggestions: this.computeSuggestions(columnName, equivalents)
    };
  }

  private computeSuggestions(columnName: string, equivalents: string[]): string[] {
    const taken = new Set(equivalents.map(normalizeHeaderKey));
    return suggestEquivalentHeaders(columnName).filter(s => !taken.has(normalizeHeaderKey(s))).slice(0, 4);
  }

  private indexSaved(saved: ModelColumnEquivalence[]): void {
    this.savedByModel.clear();
    for (const eq of saved || []) {
      const key = eq.modelId || '';
      const list = this.savedByModel.get(key) || [];
      list.push(eq);
      this.savedByModel.set(key, list);
    }
  }

  private markDirty(): void {
    this.dirty = true;
    this.cd.detectChanges();
  }

  private typeOrder(model: AutoProcessingModel): number {
    return model.fileType === 'bo' ? 0 : model.fileType === 'partner' ? 1 : 2;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}
