import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, timer, Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil, switchMap, tap, map } from 'rxjs/operators';

import { FileWatcherService } from '../../services/file-watcher.service';
import { ReconciliationService, ReconciliationConfig, ProgressUpdate } from '../../services/reconciliation.service';
import { AutoProcessingService } from '../../services/auto-processing.service';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { MagicReconciliationService, MagicReconciliationProgress } from '../../services/magic-reconciliation.service';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../services/i18n/i18n.service';
import { SharedUiModule } from '../../shared/shared-ui.module';

@Component({
  selector: 'app-reconciliation-launcher',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SharedUiModule],
  templateUrl: './reconciliation-launcher.component.html',
  styleUrls: ['./reconciliation-launcher.component.scss']
})
export class ReconciliationLauncherComponent implements OnInit, OnDestroy {
  boFile: File | null = null;
  partnerFile: File | null = null;
  boFileName = '';
  partnerFileName = '';
  isLoading = false;
  errorMessage = '';
  successMessage = '';
mode: 'magic' | 'assisted' | 'manual' = 'magic';
  selectedMode: 'magic' | 'assisted' | 'manual' | null = 'manual';
  
  // Toast notifications
  showToast = false;
  toastMessage = '';
  private toastTimeout: any;

  // Popup reconciliation magique
  showMagicModal = false;
  boDragOver = false;
  partnerDragOver = false;
  private lastFocusedElement: HTMLElement | null = null;

  // Magic reconciliation state
  magicRunning = false;
  magicStep = 0;
  magicProgress = 0;
  magicProgressStep = '';
  magicCurrentFile = 0;
  magicTotalFiles = 0;
  magicEstimatedTime = 0;
  magicBoFiles: File[] = [];
  magicPartnerFiles: File[] = [];
  magicUploadedBoFiles: string[] = [];
  magicUploadedPartnerFiles: string[] = [];
  magicBoFileToDelete: string | null = null;
  magicPartnerFileToDelete: string | null = null;
  magicBoPreview: any[] = [];
  magicPartnerPreview: any[] = [];
  magicBoHeaders: string[] = [];
  magicPartnerHeaders: string[] = [];
  magicBoPreviewReady = false;
  magicPartnerPreviewReady = false;
  
  // Assisted reconciliation state
  assistedBoFile: File | null = null;
  assistedPartnerFile: File | null = null;
  assistedBoKey = '';
  assistedPartnerKey = '';
  assistedSuggestions: any[] = [];
  assistedSelectedSuggestion = 0;
  assistedShowSuggestions = false;
  
  // Manual reconciliation state
  manualBoFile: File | null = null;
  manualPartnerFile: File | null = null;
  manualBoKey = '';
  manualPartnerKey = '';
  
  private magicBoParsed = false;
  private determinedReconciliationType: string | null = null;
  private subscriptions: Subscription[] = [];
  private destroy$ = new Subject<void>();

  // Parsed data (for compatibility)
  boData: Record<string, string>[] = [];
  partnerData: Record<string, string>[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private appStateService: AppStateService,
    private reconciliationTabsService: ReconciliationTabsService,
    private reconciliationService: ReconciliationService,
    private popupService: PopupService,
    private autoProcessingService: AutoProcessingService,
    private magicReconciliationService: MagicReconciliationService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
    private fileWatcherService: FileWatcherService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['mode']) {
        const mode = params['mode'];
        this.mode = mode;
        this.selectedMode = mode;
        
        if (mode === 'magic') {
          this.openMagicReconciliation();
        }
      }
    });

    this.loadUploadedFiles();
    
    // Écouter les changements de langue
    this.subscriptions.push(
      this.translate.onLangChange.subscribe(() => {
        this.cdr.detectChanges();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return I18nService.t(key, params);
  }

  // ===== MODE SELECTION =====

  selectMode(mode: 'magic' | 'assisted' | 'manual'): void {
    this.selectedMode = mode;
    this.appStateService.setReconciliationLaunchMode(mode);
    this.appStateService.setReconciliationEntryPath('/reconciliation-launcher');
  }

  closeMagicModal(): void {
    this.showMagicModal = false;
    this.boDragOver = false;
    this.partnerDragOver = false;
    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
      this.lastFocusedElement = null;
    }
  }

  confirmMagicLaunch(): void {
    if (!this.canLaunchMagic) {
      return;
    }
    this.closeMagicModal();
    this.launchMagicReconciliation();
  }

  get canLaunchMagic(): boolean {
    return this.magicBoFiles.length > 0 && this.magicPartnerFiles.length > 0;
  }

  formatFileSize(size: number): string {
    if (!size) return '0 o';
    if (size < 1024) return `${size} o`;
    if (size < 1048576) return `${Math.round(size / 1024)} Ko`;
    return `${(size / 1048576).toFixed(1)} Mo`;
  }

  onMagicOverlayMouseDown(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      this.closeMagicModal();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showMagicModal) {
      this.closeMagicModal();
    }
  }

  onBoDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.boDragOver = true;
  }

  onBoDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.boDragOver = false;
    if (event.dataTransfer?.files?.length) {
      this.addMagicFiles(event.dataTransfer.files, true);
    }
  }

  onPartnerDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.partnerDragOver = true;
  }

  onPartnerDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.partnerDragOver = false;
    if (event.dataTransfer?.files?.length) {
      this.addMagicFiles(event.dataTransfer.files, false);
    }
  }

  private showToastMessage(message: string): void {
    this.toastMessage = message;
    this.showToast = true;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
    }, 2200);
  }

  getModeDisplayName(mode: string): string {
    const names: Record<string, string> = {
      'manual': this.t('LNC.modeManualShort'),
      'assisted': this.t('LNC.modeAssistedShort'),
      'magic': this.t('LNC.modeMagicShort')
    };
    return names[mode] || mode;
  }

  proceedWithSelectedMode(): void {
    if (!this.selectedMode) return;

    if (this.selectedMode === 'manual') {
      this.appStateService.setReconciliationLaunchMode('manual');
      this.appStateService.setReconciliationEntryPath('/reconciliation-launcher');
      this.router.navigate(['/column-selection'], { queryParams: { mode: 'manual' } });
      return;
    }

    if (this.selectedMode === 'assisted') {
      this.appStateService.setReconciliationLaunchMode('assisted');
      this.appStateService.setReconciliationEntryPath('/upload-assisted');
      this.router.navigate(['/upload-assisted']);
      return;
    }

    if (this.selectedMode === 'magic') {
      this.openMagicReconciliation();
    }
  }

  // ===== GESTION DES FICHIERS UPLOADÉS =====

  loadUploadedFiles(): void {
    this.fileWatcherService.getAvailableFiles().subscribe({
      next: (files) => {
        this.magicUploadedBoFiles = files
          .filter(f => f.fileName.toLowerCase().includes('bo') || f.fileName.toLowerCase().includes('backoffice'))
          .map(f => f.fileName);
        this.magicUploadedPartnerFiles = files
          .filter(f => f.fileName.toLowerCase().includes('partner') || f.fileName.toLowerCase().includes('partenaire'))
          .map(f => f.fileName);
      },
      error: (err) => {
        console.error('Erreur chargement fichiers:', err);
      }
    });
  }

  // ===== MAGIC RECONCILIATION =====

  private static readonly ACCEPTED_FILE_PATTERN = /\.(csv|xlsx|xls)$/i;

  onMagicBoFilesSelected(event: any): void {
    this.addMagicFiles(event.target.files, true);
    event.target.value = '';
  }

  onMagicPartnerFilesSelected(event: any): void {
    this.addMagicFiles(event.target.files, false);
    event.target.value = '';
  }

  private addMagicFiles(fileList: FileList | null, single: boolean): void {
    const all = Array.from(fileList || []);
    const valid = all.filter(f => ReconciliationLauncherComponent.ACCEPTED_FILE_PATTERN.test(f.name));

    if (valid.length < all.length) {
      this.showToastMessage(this.t('LNC.magicOnlyCsvExcel'));
    }

    if (single) {
      if (valid[0]) {
        this.magicBoFiles = [valid[0]];
      }
      return;
    }

    for (const file of valid) {
      const alreadyAdded = this.magicPartnerFiles.some(p => p.name === file.name && p.size === file.size);
      if (!alreadyAdded) {
        this.magicPartnerFiles.push(file);
      }
    }
  }

  removeMagicBoFile(index: number): void {
    this.magicBoFiles.splice(index, 1);
  }

  removeMagicPartnerFile(index: number): void {
    this.magicPartnerFiles.splice(index, 1);
  }

  openMagicReconciliation(): void {
    this.selectedMode = 'magic';
    this.mode = 'magic';
    this.appStateService.setReconciliationLaunchMode('magic');
    this.appStateService.setReconciliationEntryPath('/reconciliation-launcher');
    this.refreshFilesFromState();
    this.lastFocusedElement = document.activeElement as HTMLElement;
    this.showMagicModal = true;
    setTimeout(() => this.cdr.detectChanges());
  }

  private refreshFilesFromState(): void {
    const existingFiles = this.appStateService.getUploadedFiles();
    this.boFile = existingFiles.boFile;
    this.partnerFile = existingFiles.partnerFile;

    // Reutiliser les fichiers deja charges dans le popup
    if (!this.magicBoFiles.length && existingFiles.boFile) {
      this.magicBoFiles = [existingFiles.boFile];
    }
    if (!this.magicPartnerFiles.length && existingFiles.partnerFile) {
      this.magicPartnerFiles = [existingFiles.partnerFile];
    }
  }

async launchMagicReconciliation(): Promise<void> {
    if (!this.ensureFilesOrRedirectToUpload('magic')) {
      return;
    }

    this.isLoading = true;
    this.magicRunning = true;
    this.magicProgress = 0;
    this.magicProgressStep = this.t('LNC.magicProgressPreparing');
    this.magicCurrentFile = 0;
    this.magicTotalFiles = 0;

    const boFile = this.magicBoFiles[0];
    const partnerFiles = this.magicPartnerFiles;

    if (!boFile || partnerFiles.length === 0) {
      this.popupService.showError(this.t('LNC.noFileSelected'));
      this.isLoading = false;
      this.magicRunning = false;
      return;
    }

    this.appStateService.setUploadedFiles({
      boFile,
      partnerFile: partnerFiles[0]
    });

    try {
      const boData = await this.readFileContent(boFile);
      const partners: { fileName: string; data: Record<string, string>[] }[] = [];

      for (const pf of partnerFiles) {
        const data = await this.readFileContent(pf);
        partners.push({ fileName: pf.name, data });
      }

      const progressCallback = (progress: MagicReconciliationProgress) => {
        this.magicProgress = progress.percentage ?? 0;
        this.magicProgressStep = progress.step ?? '';
        this.magicCurrentFile = progress.current ?? 0;
        this.magicTotalFiles = progress.total ?? 0;
        this.cdr.detectChanges();
      };

      const result = await this.magicReconciliationService.runMultiPartner(
        boFile.name,
        boData,
        partners,
        progressCallback
      );

      this.reconciliationTabsService.clearAllData();
      // Les syntheses par service et les noms de fichiers partenaires alimentent le
      // panneau « Resultats magiques » de /results. Sans ces deux appels, la vue
      // groupee reste vide car rien d'autre ne les publie dans AppStateService.
      this.appStateService.setMagicServiceSummaries(result.serviceSummaries);
      this.appStateService.setMagicPartnerFileNames(result.partnerFileNames ?? []);
      this.appStateService.setReconciliationResults(result.response);
      this.appStateService.setReconciliationEntryPath('/reconciliation-launcher');
      this.router.navigate(['/results']);

    } catch (error) {
      this.popupService.showError(this.t('LNC.magicStartError', {
        message: error instanceof Error ? error.message : this.t('LNC.unknownError')
      }));
    } finally {
      // isLoading n'etait reinitialise que sur le chemin erreur : un lancement
      // reussi laissait le composant fige sur un etat de chargement.
      this.isLoading = false;
      this.magicRunning = false;
    }
  }

  private ensureFilesOrRedirectToUpload(mode: string): boolean {
    if (mode === 'magic') {
      if (!this.magicBoFiles.length) {
        this.popupService.showWarning(this.t('LNC.magicBoFileRequired'));
        return false;
      }
      if (!this.magicPartnerFiles.length) {
        this.popupService.showWarning(this.t('LNC.magicPartnerFilesRequired'));
        return false;
      }
      return true;
    }
    if (!this.boFile || !this.partnerFile) {
      this.popupService.showWarning(this.t('LNC.noFilesSelected'));
      return false;
    }
    return true;
  }

  private matchesFilePattern(fileName: string, pattern: string): boolean {
    if (!pattern || !fileName) return false;

    const lowerName = fileName.toLowerCase();
    const lowerPattern = pattern.toLowerCase();

    const acceptedExtensions = ['.csv', '.xls', '.xlsx'];

    const getExtension = (name: string): string => {
      const match = name.match(/\.[^/.]+$/);
      return match ? match[0] : '';
    };

    const fileNameExt = getExtension(lowerName);
    const patternExt = getExtension(lowerPattern);

    const nameNoExt = lowerName.replace(/\.[^/.]+$/, '');
    const patternNoExt = lowerPattern.replace(/\.[^/.]+$/, '');

    // Mode 1: Pattern avec wildcards
    if (patternNoExt.includes('*') || patternNoExt.includes('?')) {
      const regexPattern = patternNoExt
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      try {
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        const matches = regex.test(nameNoExt);

        if (matches) {
          if (patternExt && acceptedExtensions.includes(patternExt)) {
            const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
            return fileExtAccepted;
          } else {
            return true;
          }
        } else {
          return false;
        }
      } catch (error) {
        return false;
      }
    }

    // Mode 2: Pattern avec extension - correspondance exacte (insensible à la casse)
    if (patternExt && acceptedExtensions.includes(patternExt)) {
      if (nameNoExt === patternNoExt) {
        const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
        return fileExtAccepted;
      }
    } else if (patternExt) {
      const exactMatch = lowerName === lowerPattern;
      if (exactMatch) {
        return true;
      }
    }

    // Mode 3: Pattern simple - détection par inclusion (sans extension)
    const containsPattern = nameNoExt.includes(patternNoExt);

    if (containsPattern) {
      if (patternExt && acceptedExtensions.includes(patternExt)) {
        const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
        return fileExtAccepted;
      }
      return true;
    }

    // Mode 4: Détection par préfixe (optionnel, pour plus de flexibilité)
    const startsWithPattern = nameNoExt.startsWith(patternNoExt);

    if (startsWithPattern) {
      if (patternExt && acceptedExtensions.includes(patternExt)) {
        const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
        return fileExtAccepted;
      }
      return true;
    }

    return false;
  }

  /**
   * Détermine le type de réconciliation à partir de la configuration du modèle partenaire
   * Mapping :
   * - STANDARD → '1-1'
   * - SPECIAL_RATIO avec expectedRatio '1:2' → '1-2', '1:3' → '1-3', etc.
   * - CUSTOM → utilise le ratio attendu si disponible, sinon '1-1'
   */
  private getReconciliationTypeFromModel(model: any): string | null {
    if (!model?.reconciliationLogic?.type) {
      return null;
    }

    const logic = model.reconciliationLogic;
    const ratio = logic.parameters?.expectedRatio;

    switch (logic.type) {
      case 'STANDARD':
        return '1-1';
      case 'SPECIAL_RATIO':
        if (ratio) {
          return ratio.replace(':', '-');
        }
        return '1-2';
      case 'CUSTOM':
        if (ratio) {
          return ratio.replace(':', '-');
        }
        return '1-1';
      default:
        return '1-1';
    }
  }

  private getFileHeaders(file: File): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const lines = content.split('\n');
          const firstLine = lines[0];
          
          let separator = ',';
          if (firstLine.includes(';')) {
            separator = ';';
          }
          
          const headers = firstLine.split(separator).map(h => h.trim().replace(/"/g, ''));
          resolve(headers);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private readFileContent(file: File): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const lines = content.split('\n');
          
          let separator = ',';
          if (lines[0].includes(';')) {
            separator = ';';
          }
          
          const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
          
          const data = lines.slice(1)
            .filter(line => line.trim())
            .map(line => {
              const values = line.split(separator);
              const row: Record<string, string> = {};
              
              headers.forEach((header, index) => {
                row[header] = values[index] ? values[index].trim().replace(/"/g, '') : '';
              });
              
              return row;
            });
          
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private async testFormattingForBetterMatch(
    boFile: File,
    partnerFile: File,
    boKey: string,
    partnerKey: string,
    originalSuggestion: any
  ): Promise<{ boKey: string; partnerKey: string; transformation: any; confidence: number } | null> {
    
    const boData = await this.readFileContent(boFile);
    const partnerData = await this.readFileContent(partnerFile);
    
    const formattingTests = [
      { name: 'trimSpaces', transform: this.applyTrimSpaces },
      { name: 'toLowerCase', transform: this.applyToLowerCase },
      { name: 'toUpperCase', transform: this.applyToUpperCase },
      { name: 'removeSeparators', transform: this.applyRemoveSeparators },
      { name: 'cleanAmounts', transform: this.applyCleanAmounts },
      { name: 'normalizeNumbers', transform: this.applyNormalizeNumbers },
      { name: 'removeDashesAndCommas', transform: this.applyRemoveDashesAndCommas },
      { name: 'removeSuffix_CM', transform: this.applyRemoveSuffixCM },
      { name: 'removeSuffix_MTN', transform: this.applyRemoveSuffixMTN },
      { name: 'removeSuffix_OM', transform: this.applyRemoveSuffixOM },
      { name: 'removeSpaces', transform: this.applyRemoveSpaces },
    ];

    let bestMatch: { boKey: string; partnerKey: string; transformation: any; confidence: number } | null = null;
    let bestConfidence = 0;

    for (const test of formattingTests) {
      try {
        const transformedBoData = test.transform([...boData], boKey);
        const transformedPartnerData = test.transform([...partnerData], partnerKey);
        
        const confidence = this.calculateMatchConfidence(transformedBoData, transformedPartnerData, boKey, partnerKey);
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = {
            boKey,
            partnerKey,
            transformation: { type: test.name, column: boKey },
            confidence
          };
        }
      } catch (error) {
        // Ignorer les erreurs de transformation
      }
    }

    return bestMatch && bestConfidence > 0.5 ? bestMatch : null;
  }

  private calculateMatchConfidence(boData: any[], partnerData: any[], boKey: string, partnerKey: string): number {
    if (!boData.length || !partnerData.length) return 0;
    
    const boKeys = new Set(boData.map(row => row[boKey]?.trim()).filter(Boolean));
    const partnerKeys = new Set(partnerData.map(row => row[partnerKey]?.trim()).filter(Boolean));
    
    let matches = 0;
    for (const key of boKeys) {
      if (partnerKeys.has(key)) {
        matches++;
      }
    }
    
    return matches / Math.max(boKeys.size, partnerKeys.size);
  }

  private async findImprovedMatch(suggestions: any[]): Promise<any | null> {
    for (const suggestion of suggestions) {
      const confidence = suggestion.confidence || suggestion.confidenceScore || 0;
      if (confidence >= 0.70) {
        return {
          boKey: suggestion.boColumn,
          partnerKey: suggestion.partnerColumn,
          transformation: suggestion.transformation,
          confidence
        };
      }
    }
    return null;
  }

  private async applyTransformationToFile(file: File, keyColumn: string, transformation: any): Promise<any[]> {
    const data = await this.readFileContent(file);
    
    switch (transformation?.type) {
      case 'trimSpaces':
        return this.applyTrimSpaces(data, keyColumn);
      case 'toLowerCase':
        return this.applyToLowerCase(data, keyColumn);
      case 'toUpperCase':
        return this.applyToUpperCase(data, keyColumn);
      case 'removeSeparators':
        return this.applyRemoveSeparators(data, keyColumn);
      case 'cleanAmounts':
        return this.applyCleanAmounts(data, keyColumn);
      case 'normalizeNumbers':
        return this.applyNormalizeNumbers(data, keyColumn);
      case 'removeDashesAndCommas':
        return this.applyRemoveDashesAndCommas(data, keyColumn);
      case 'removeSuffix_CM':
        return this.applyRemoveSuffixCM(data, keyColumn);
      case 'removeSuffix_MTN':
        return this.applyRemoveSuffixMTN(data, keyColumn);
      case 'removeSuffix_OM':
        return this.applyRemoveSuffixOM(data, keyColumn);
      case 'removeSpaces':
        return this.applyRemoveSpaces(data, keyColumn);
      default:
        return data;
    }
  }

  private applyTrimSpaces(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.trim() || ''
    }));
  }

  private applyToLowerCase(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.toLowerCase() || ''
    }));
  }

  private applyToUpperCase(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.toUpperCase() || ''
    }));
  }

  private applyRemoveSeparators(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/[\s\-_.,]/g, '') || ''
    }));
  }

  private applyCleanAmounts(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/[^\d.-]/g, '') || ''
    }));
  }

  private applyNormalizeNumbers(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => {
      const value = row[columnName]?.replace(/[^\d.-]/g, '') || '';
      const num = parseFloat(value);
      return {
        ...row,
        [columnName]: isNaN(num) ? value : num.toString()
      };
    });
  }

  private applyRemoveDashesAndCommas(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/[-,\s]/g, '') || ''
    }));
  }

  private applyRemoveSuffixCM(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/_CM$/i, '') || ''
    }));
  }

  private applyRemoveSuffixMTN(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/_MTN$/i, '') || ''
    }));
  }

  private applyRemoveSuffixOM(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/_OM$/i, '') || ''
    }));
  }

  private applyRemoveSpaces(data: Record<string, string>[], columnName: string): Record<string, string>[] {
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName]?.replace(/\s+/g, '') || ''
    }));
  }

  private applyColumnProcessingRules(data: Record<string, string>[], rules: any[]): Record<string, string>[] {
    return data.map(row => {
      let newRow = { ...row };
      for (const rule of rules) {
        if (rule.sourceColumn && newRow[rule.sourceColumn] !== undefined) {
          let value = newRow[rule.sourceColumn];
          
          if (rule.trimSpaces) value = value.trim();
          if (rule.removeSpecialChars) value = value.replace(/[^\w\s]/gi, '');
          if (rule.removeAccents) value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (rule.toUpperCase) value = value.toUpperCase();
          if (rule.toLowerCase) value = value.toLowerCase();
          if (rule.stringToRemove) value = value.replace(new RegExp(rule.stringToRemove, 'g'), '');
          if (rule.padZeros) value = value.padStart(10, '0');
          if (rule.regexReplace) value = value.replace(new RegExp(rule.regexReplace, 'g'), '');
          
          newRow[rule.sourceColumn] = value;
        }
      }
      return newRow;
    });
  }

  private clearBoSelections(): void {
    // Clear BO-related selections for the new simplified UI
  }

  private clearPartnerSelections(): void {
    // Clear Partner-related selections for the new simplified UI
  }

  get hasDataToReset(): boolean {
    return !!this.selectedMode || !!this.boFile || !!this.partnerFile;
  }

  async resetData(): Promise<void> {
    const confirmed = await this.popupService.showConfirm(
      this.t('LNC.resetConfirmMessage'),
      this.t('LNC.resetConfirmTitle')
    );
    
    if (confirmed) {
      this.selectedMode = null;
      this.showMagicModal = false;
      this.magicBoFiles = [];
      this.magicPartnerFiles = [];
      this.appStateService.clearUploadedFiles();
      this.appStateService.clearReconciliationData();
      this.reconciliationService.clearData();
      this.boFile = null;
      this.partnerFile = null;
      this.boData = [];
      this.partnerData = [];
      this.clearBoSelections();
      this.clearPartnerSelections();
      this.showToastMessage(this.t('LNC.resetSuccess'));
    }
  }
}