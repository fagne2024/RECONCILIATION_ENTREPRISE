import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { skip } from 'rxjs/operators';
import { ReconciliationResponse, Match } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { EcartBoSummaryService, EcartBoSummaryPrefill, EcartBoSummaryPendingLine } from '../../services/ecart-bo-summary.service';
import { ExportOptimizationService, ExportProgress } from '../../services/export-optimization.service';
import { PopupService } from '../../services/popup.service';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
    filterMatchBoDataByMagicPartition,
    resolveMagicPartitionContext,
    MagicPartitionContext
} from '../../utils/magic-partition.util';

@Component({
  selector: 'app-matches-table',
  standalone: true,
  imports: [TranslateModule, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './matches-table.component.html',
  styleUrls: ['./matches-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatchesTableComponent implements OnInit, OnDestroy {
  response: ReconciliationResponse | null = null;
  filteredMatches: Match[] = [];
  displayedMatches: Match[] = [];
  private subscription = new Subscription();
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;
  
  // Recherche
  searchKey: string = '';
  
  // Colonnes du tableau
  allColumns: string[] = [];
  displayedColumns: string[] = [];
  boColumns: string[] = [];
  partnerColumns: string[] = [];
  
  // Optimisation : chargement progressif
  isLoading = false;
  loadProgress = 0;
  private searchIndex: Map<string, Set<number>> = new Map(); // Index de recherche pour performance
  
  // Affichage BO ou Partenaire
  viewMode: 'BO' | 'PARTNER' = 'BO';
  
  // Sélection de colonnes pour export
  showColumnSelector = false;
  selectedColumnsForExport: { [key: string]: boolean } = {};
  availableColumnsForExport: string[] = [];
  
  // Export
  isExporting = false;
  exportProgress: ExportProgress = {
    current: 0,
    total: 0,
    percentage: 0,
    message: '',
    isComplete: false
  };
  private exportSubscription?: Subscription;
  
  // Menu dropdown
  showExportMenu = false;
  
  /** Signature du dernier résultat traité pour réutiliser le cache sans recharger */
  private lastProcessedSignature: string = '';

  /** Service magique actif (réconciliation magique) — cloisonne l'affichage des correspondances. */
  magicServiceFilterLocked = '';

  // Scroll to top
  showScrollTopBtn = false;

  // Scroll horizontal tableau
  @ViewChild('tableWrapper') tableWrapperRef!: ElementRef<HTMLDivElement>;
  tableScrollLeft = 0;
  tableScrollMax = 0;
  private readonly TABLE_SCROLL_STEP = 300;

  constructor(
    private appStateService: AppStateService,
    private reconciliationTabsService: ReconciliationTabsService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private exportOptimizationService: ExportOptimizationService,
    private popupService: PopupService,
    private ecartBoSummaryService: EcartBoSummaryService,
    private el: ElementRef,
    private translate: TranslateService
  ) {}

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  @HostListener('scroll', ['$event.target'])
  onHostScroll(target: HTMLElement): void {
    this.showScrollTopBtn = target.scrollTop > 300;
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.syncMagicContextFromAppState();
    this.subscription.add(
      this.appStateService.getReconciliationResults().subscribe((response: ReconciliationResponse | null) => {
        if (!response) {
          this.response = null;
          this.filteredMatches = [];
          this.displayedMatches = [];
          this.lastProcessedSignature = '';
          this.cdr.markForCheck();
          return;
        }
        this.response = response;
        const matches = response.matches || [];
        const signature = `${response.totalMatches ?? 0}_${response.totalBoOnly ?? 0}_${response.totalPartnerOnly ?? 0}_${matches.length}`;
        const cached = this.reconciliationTabsService.getFilteredMatches();
        const useCache = cached.length > 0 && (
          cached.length === (response.totalMatches ?? 0) ||
          (matches.length > 0 && cached.length === matches.length)
        ) && this.lastProcessedSignature === signature;
        if (useCache && cached.length > 0) {
          this.applyCachedMatches(cached);
          this.lastProcessedSignature = signature;
          return;
        }
        if (matches.length === 0 && cached.length > 0 && (response.totalMatches ?? 0) === cached.length) {
          this.applyCachedMatches(cached);
          this.lastProcessedSignature = signature;
          return;
        }
        this.lastProcessedSignature = signature;
        this.loadMatchesProgressively(matches);
      })
    );

    this.subscription.add(
      this.appStateService.selectedMagicService$.pipe(skip(1)).subscribe(() => {
        this.syncMagicContextFromAppState();
        if (this.response) {
          this.lastProcessedSignature = '';
          this.loadMatchesProgressively(this.response.matches || []);
        }
      })
    );

    document.addEventListener('click', this.handleDocumentClick.bind(this));
  }

  private syncMagicContextFromAppState(): void {
    const service = this.appStateService.getSelectedMagicService();
    const partnerFile = this.appStateService.getSelectedMagicPartnerFile();
    if (service || partnerFile) {
      this.reconciliationTabsService.setMagicViewContext(service, partnerFile);
      if (service) {
        this.magicServiceFilterLocked = service;
      }
    }
  }

  private getMagicPartitionContext(): MagicPartitionContext {
    return resolveMagicPartitionContext({
      appStateService: this.appStateService.getSelectedMagicService(),
      appStatePartnerFile: this.appStateService.getSelectedMagicPartnerFile(),
      tabsContext: this.reconciliationTabsService.getMagicViewContext()
    });
  }

  private scopeMatchesToMagic(matches: Match[]): Match[] {
    const ctx = this.getMagicPartitionContext();
    if (!ctx.service && !ctx.partnerFile) {
      return matches;
    }
    this.reconciliationTabsService.setMagicViewContext(ctx.service, ctx.partnerFile);
    return filterMatchBoDataByMagicPartition(matches, ctx.service, ctx.partnerFile);
  }

  /** Réutilise les correspondances déjà chargées (ex: retour sur /matches sans nouvelle réconciliation). */
  private applyCachedMatches(cached: Match[]): void {
    this.filteredMatches = this.scopeMatchesToMagic([...cached]);
    this.searchIndex.clear();
    this.buildSearchIndex(this.filteredMatches);
    if (this.filteredMatches.length > 0) {
      this.initializeColumnsOptimized(this.filteredMatches);
    }
    this.applyFilters();
    this.isLoading = false;
    this.loadProgress = 100;
    this.cdr.markForCheck();
  }
  
  /** En dessous de ce seuil : chargement en une fois (pas de chunking). Au-dessus : chunks + index à la fin. */
  private static readonly FAST_PATH_THRESHOLD = 35000;
  private static readonly CHUNK_SIZE = 2500;
  private static readonly YIELD_EVERY_N_CHUNKS = 2;

  private async loadMatchesProgressively(matches: Match[]): Promise<void> {
    this.isLoading = true;
    this.loadProgress = 0;
    this.cdr.markForCheck();
    
    try {
      let filtered = this.scopeMatchesToMagic(matches);
      if (this.isTRXBOOPPARTReconciliation(filtered)) {
        filtered = filtered.filter(match => {
          if (!match.partnerData) return false;
          const typeOperation = this.getTypeOperation(match.partnerData);
          if (!typeOperation) return false;
          if (typeOperation.includes('FRAIS_TRANSACTION')) return false;
          return typeOperation.includes('IMPACT_COMPTIMPACT-COMPTE-GENERAL');
        });
      }
      
      const total = filtered.length;
      if (total === 0) {
        this.filteredMatches = [];
        this.displayedMatches = [];
        return;
      }

      if (total <= MatchesTableComponent.FAST_PATH_THRESHOLD) {
        this.filteredMatches = filtered.slice(0);
        this.applyFilters();
        this.cdr.markForCheck();
        requestAnimationFrame(() => {
          this.buildSearchIndex(this.filteredMatches);
          if (this.filteredMatches.length > 0) {
            this.initializeColumnsOptimized(this.filteredMatches);
          }
          this.applyFilters();
          this.cdr.markForCheck();
        });
      } else {
        const sampleSize = Math.min(1500, total);
        this.filteredMatches = filtered.slice(0, sampleSize);
        this.loadProgress = 10;
        this.cdr.markForCheck();
        await new Promise<void>(r => setTimeout(r, 0));

        const chunkSize = MatchesTableComponent.CHUNK_SIZE;
        for (let i = sampleSize; i < total; i += chunkSize) {
          const chunk = filtered.slice(i, Math.min(i + chunkSize, total));
          this.filteredMatches.push(...chunk);
          this.loadProgress = 10 + Math.round(((this.filteredMatches.length / total) * 85));
          this.cdr.markForCheck();
          const chunkIndex = (i - sampleSize) / chunkSize;
          if (chunkIndex > 0 && chunkIndex % MatchesTableComponent.YIELD_EVERY_N_CHUNKS === 0) {
            await new Promise<void>(r => setTimeout(r, 0));
          }
        }
        this.buildSearchIndex(this.filteredMatches);
        if (this.filteredMatches.length > 0) {
          this.initializeColumnsOptimized(this.filteredMatches);
        }
        this.applyFilters();
      }
    } finally {
      this.isLoading = false;
      this.loadProgress = 100;
      if (this.response) {
        this.lastProcessedSignature = `${this.response.totalMatches ?? 0}_${this.response.totalBoOnly ?? 0}_${this.response.totalPartnerOnly ?? 0}_${this.filteredMatches.length}`;
      }
      this.cdr.markForCheck();
      setTimeout(() => this.updateTableScrollState(), 100);
    }
  }
  
  private buildSearchIndex(matches: Match[], startIndex: number = 0): void {
    matches.forEach((match, localIndex) => {
      const globalIndex = startIndex + localIndex;
      const partnerListValues = (match.partnerDataList || []).flatMap(record =>
        record ? Object.values(record) : []
      );
      const searchableText = [
        match.key || '',
        ...Object.values(match.boData || {}),
        ...Object.values(match.partnerData || {}),
        ...partnerListValues
      ].map(val => String(val).toLowerCase()).join(' ');
      
      // Indexer chaque mot
      const words = searchableText.split(/\s+/).filter(w => w.length > 2);
      words.forEach(word => {
        if (!this.searchIndex.has(word)) {
          this.searchIndex.set(word, new Set());
        }
        this.searchIndex.get(word)!.add(globalIndex);
      });
    });
  }
  
  private handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.export-menu-container')) {
      this.showExportMenu = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.exportSubscription) {
      this.exportSubscription.unsubscribe();
    }
    document.removeEventListener('click', this.handleDocumentClick.bind(this));
  }

  private initializeColumnsOptimized(sampleMatches: Match[]): void {
    if (sampleMatches.length === 0) return;
    
    const boKeysSet = new Set<string>();
    const partnerKeysSet = new Set<string>();
    
    // Parcourir l'ensemble des matches fournis pour récupérer toutes les colonnes BO et partenaire
    sampleMatches.forEach(match => {
      // Collecter les clés BO
      if (match.boData) {
        Object.keys(match.boData).forEach(key => boKeysSet.add(key));
      }
      
      // Collecter les clés partenaire depuis partnerData (peut avoir des suffixes _PARTNER_X)
      if (match.partnerData) {
        Object.keys(match.partnerData).forEach(key => {
          // Enlever le suffixe _PARTNER_X pour obtenir la clé de base
          const baseKey = key.replace(/_PARTNER_\d+$/, '');
          partnerKeysSet.add(baseKey);
        });
      }
      
      // Collecter les clés partenaire depuis partnerDataList
      if (match.partnerDataList && match.partnerDataList.length > 0) {
        match.partnerDataList.forEach(partnerRecord => {
          if (partnerRecord) {
            Object.keys(partnerRecord).forEach(key => {
              partnerKeysSet.add(key);
            });
          }
        });
      }
    });
    
    const boKeys = Array.from(boKeysSet);
    const partnerKeys = Array.from(partnerKeysSet);
    
    // Séparer les colonnes BO et Partenaire
    this.boColumns = boKeys.map(key => `BO_${key}`);
    this.partnerColumns = partnerKeys.map(key => `PARTNER_${key}`);
    
    // Créer des colonnes uniques avec préfixes pour l'affichage
    const allKeys = new Set<string>();
    boKeys.forEach(key => allKeys.add(`BO_${key}`));
    partnerKeys.forEach(key => allKeys.add(`PARTNER_${key}`));
    
    this.allColumns = Array.from(allKeys);
    
    // Colonnes disponibles pour l'export (toutes)
    this.availableColumnsForExport = ['Clé', 'Statut', ...this.allColumns.map(col => this.getColumnLabel(col))];
    
    // Initialiser la sélection pour l'export (toutes sélectionnées par défaut)
    this.availableColumnsForExport.forEach(col => {
      this.selectedColumnsForExport[col] = true;
    });
    
    // Afficher les colonnes selon le mode
    this.updateDisplayedColumns();
  }
  
  private updateDisplayedColumns(): void {
    if (this.viewMode === 'BO') {
      // Afficher les 10 premières colonnes BO
      this.displayedColumns = this.boColumns.slice(0, 10);
    } else {
      // Afficher TOUTES les colonnes partenaire
      this.displayedColumns = this.partnerColumns;
    }
  }
  
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'BO' ? 'PARTNER' : 'BO';
    this.updateDisplayedColumns();
    this.currentPage = 1;
    this.cdr.markForCheck();
  }
  
  setViewMode(mode: 'BO' | 'PARTNER'): void {
    this.viewMode = mode;
    this.updateDisplayedColumns();
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  onSearch(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.filteredMatches];
    
    // Appliquer la recherche de manière optimisée avec index
    if (this.searchKey.trim()) {
      const searchLower = this.searchKey.toLowerCase();
      const searchTerms = searchLower.split(/\s+/).filter(term => term.length > 2); // Ignorer les mots trop courts
      
      if (searchTerms.length > 0 && this.searchIndex.size > 0) {
        // Utiliser l'index pour une recherche rapide
        const matchingIndices = new Set<number>();
        
        // Pour chaque terme, trouver les indices correspondants
        searchTerms.forEach(term => {
          const termMatches = new Set<number>();
          
          // Chercher dans l'index
          this.searchIndex.forEach((indices, indexedWord) => {
            if (indexedWord.includes(term)) {
              indices.forEach(idx => termMatches.add(idx));
            }
          });
          
          // Si c'est le premier terme, initialiser avec ses résultats
          if (matchingIndices.size === 0) {
            termMatches.forEach(idx => matchingIndices.add(idx));
          } else {
            // Intersection : garder seulement les indices présents dans les deux sets
            const intersection = new Set<number>();
            termMatches.forEach(idx => {
              if (matchingIndices.has(idx)) {
                intersection.add(idx);
              }
            });
            matchingIndices.clear();
            intersection.forEach(idx => matchingIndices.add(idx));
          }
        });
        
        // Filtrer selon les indices trouvés
        if (matchingIndices.size > 0) {
          filtered = filtered.filter((_, index) => matchingIndices.has(index));
        } else {
          // Fallback : recherche classique si l'index ne trouve rien
          filtered = filtered.filter(match => {
            const searchableText = [
              match.key || '',
              ...Object.values(match.boData || {}),
              ...Object.values(match.partnerData || {})
            ].map(val => String(val).toLowerCase()).join(' ');
            
            return searchTerms.every(term => searchableText.includes(term));
          });
        }
      } else if (searchTerms.length > 0) {
        // Fallback : recherche classique si pas d'index
        filtered = filtered.filter(match => {
          const searchableText = [
            match.key || '',
            ...Object.values(match.boData || {}),
            ...Object.values(match.partnerData || {})
          ].map(val => String(val).toLowerCase()).join(' ');
          
          return searchTerms.every(term => searchableText.includes(term));
        });
      }
    }
    
    this.displayedMatches = filtered;
    this.totalPages = Math.max(1, Math.ceil(this.displayedMatches.length / this.pageSize));
    
    // Réinitialiser à la première page si nécessaire
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    
    this.cdr.markForCheck();
  }

  getPagedMatches(): Match[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.displayedMatches.slice(start, end);
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.markForCheck();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.markForCheck();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.cdr.markForCheck();
    }
  }

  /**
   * Normalise un nom de colonne pour comparaison tolérante :
   * - corrige l'encodage
   * - met en minuscule
   * - enlève accents, espaces et ponctuation
   */
  private normalizeColumnName(name: string): string {
    const fixed = fixGarbledCharacters(name || '');
    return fixed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // enlever accents
      .replace(/[^a-z0-9]/g, ''); // garder uniquement lettres/chiffres
  }

  /**
   * Récupère une valeur dans un enregistrement en tolérant :
   * - les problèmes d'encodage (via fixGarbledCharacters)
   * - les variations de libellés (ex: "PARTNER: Station", "Station (PARTNER)", "Numro SIM", etc.)
   */
  private getValueByFlexibleKey(record: Record<string, any> | undefined | null, correctedKey: string): string {
    if (!record) {
      return '';
    }

    // 1) Tentative directe via getOriginalKey (corrige l'encodage simple)
    const originalKey = this.getOriginalKey(record, correctedKey);
    const directValue = record[originalKey];
    if (directValue !== undefined && directValue !== null && String(directValue).trim() !== '') {
      return String(directValue).trim();
    }

    // 2) Fallback très tolérant sur le nom de colonne (gère "PARTNER: Station", "Station (PARTNER)", "Numro SIM", etc.)
    const targetNorm = this.normalizeColumnName(correctedKey);
    if (!targetNorm) {
      return '';
    }

    const keys = Object.keys(record);

    for (const k of keys) {
      const keyNorm = this.normalizeColumnName(k);
      if (!keyNorm) continue;

      if (
        keyNorm === targetNorm ||            // équivalence stricte après normalisation
        keyNorm.includes(targetNorm) ||      // la clé contient la cible (ex: partnerstation contient station)
        targetNorm.includes(keyNorm)         // la cible contient la clé
      ) {
        const v = record[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
    }

    return '';
  }

  getValue(match: Match, column: string): string {
    const [prefix, ...keyParts] = column.split('_');
    const key = keyParts.join('_');
    
    if (prefix === 'BO') {
      return this.getValueByFlexibleKey(match.boData, key);
    } else if (prefix === 'PARTNER') {
      // Essayer d'abord dans partnerData (peut avoir des suffixes _PARTNER_X)
      if (match.partnerData) {
        const partnerData = match.partnerData;

        // 1) Chercher la clé "de base" (ex: Station, Numéro SIM, Code PDA)
        const baseValue = this.getValueByFlexibleKey(partnerData, key);
        if (baseValue) {
          return baseValue;
        }

        // 2) Chercher avec différents suffixes (_PARTNER_X)
        for (let i = 1; i <= 10; i++) {
          const suffixedKey = `${key}_PARTNER_${i}`;
          const suffixedValue = this.getValueByFlexibleKey(partnerData, suffixedKey);
          if (suffixedValue) {
            return suffixedValue;
          }
        }
      }
      
      // Essayer dans partnerDataList
      if (match.partnerDataList && match.partnerDataList.length > 0) {
        // Parcourir tous les enregistrements partenaires et retourner la première valeur non vide
        for (const partnerRecord of match.partnerDataList) {
          if (partnerRecord) {
            const value = this.getValueByFlexibleKey(partnerRecord, key);
            if (value) {
              return value;
            }
          }
        }
      }
      
      return '';
    }
    return '';
  }

  getColumnLabel(column: string): string {
    const [prefix, ...keyParts] = column.split('_');
    return `${prefix}: ${keyParts.join('_')}`;
  }

  trackByMatch = (index: number, match: Match): string => match?.key || String(index);

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: string): string => value;

  hasDifferences(match: Match): boolean {
    return match.differences && match.differences.length > 0 && 
           match.differences.some(diff => diff.different);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  toggleExportMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showExportMenu = !this.showExportMenu;
    this.cdr.markForCheck();
    
    if (this.showExportMenu) {
      // Attendre que le DOM soit mis à jour pour positionner le menu
      setTimeout(() => {
        this.positionDropdown();
      }, 10);
    }
  }
  
  private positionDropdown(): void {
    const button = document.querySelector('.export-menu-button') as HTMLElement;
    const dropdown = document.querySelector('.export-menu-dropdown') as HTMLElement;
    
    if (button && dropdown) {
      const rect = button.getBoundingClientRect();
      const viewportMargin = 8;
      const dropdownWidth = dropdown.offsetWidth || 320;
      const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
      const spaceAbove = rect.top - viewportMargin;
      const openUp = dropdown.offsetHeight > spaceBelow && spaceAbove > spaceBelow;
      const availableHeight = Math.max(180, (openUp ? spaceAbove : spaceBelow) - viewportMargin);
      const dropdownHeight = Math.min(dropdown.offsetHeight, availableHeight);
      const left = Math.min(
        Math.max(viewportMargin, rect.right - dropdownWidth),
        window.innerWidth - dropdownWidth - viewportMargin
      );
      const top = openUp
        ? Math.max(viewportMargin, rect.top - dropdownHeight - viewportMargin)
        : rect.bottom + viewportMargin;

      dropdown.style.position = 'fixed';
      dropdown.style.top = `${top}px`;
      dropdown.style.left = `${left}px`;
      dropdown.style.maxHeight = `${availableHeight}px`;
      dropdown.style.overflowY = 'auto';
    }
  }
  
  openColumnSelector(): void {
    this.showColumnSelector = true;
    this.showExportMenu = false;
    this.cdr.markForCheck();
  }
  
  closeColumnSelector(): void {
    this.showColumnSelector = false;
    this.cdr.markForCheck();
  }
  
  toggleAllColumns(select: boolean): void {
    this.availableColumnsForExport.forEach(col => {
      this.selectedColumnsForExport[col] = select;
    });
  }
  
  get selectedColumnsCount(): number {
    return Object.values(this.selectedColumnsForExport).filter(v => v).length;
  }
  
  /**
   * Construit la liste complète des colonnes (BO + Partenaire) à partir de l'intégralité des matches.
   * Garantit que toutes les colonnes partenaire présentes dans les données sont récupérées pour l'export.
   */
  private buildAllColumnsFromSource(source: Match[]): string[] {
    const boKeysSet = new Set<string>();
    const partnerKeysSet = new Set<string>();
    for (const match of source) {
      if (match.boData) {
        Object.keys(match.boData).forEach(key => boKeysSet.add(key));
      }
      if (match.partnerData) {
        Object.keys(match.partnerData).forEach(key => {
          const baseKey = key.replace(/_PARTNER_\d+$/, '');
          partnerKeysSet.add(baseKey);
        });
      }
      if (match.partnerDataList?.length) {
        match.partnerDataList.forEach(pr => {
          if (pr) Object.keys(pr).forEach(key => partnerKeysSet.add(key));
        });
      }
    }
    const boCols = Array.from(boKeysSet).map(k => `BO_${k}`);
    const partnerCols = Array.from(partnerKeysSet).map(k => `PARTNER_${k}`);
    return [...boCols, ...partnerCols];
  }

  /** @param exportAll si true, exporte toute la liste (filteredMatches), sinon les résultats de la recherche (displayedMatches) */
  async exportResults(exportAll: boolean = false): Promise<void> {
    const source = exportAll ? this.filteredMatches : this.displayedMatches;
    if (source.length === 0) {
      this.popupService.showError(this.t(exportAll ? 'MSG.noDataToExport' : 'MSG.noDataToExportHint'));
      return;
    }

    try {
      this.isExporting = true;
      this.exportProgress = {
        current: 0,
        total: source.length,
        percentage: 0,
        message: this.t('MSG.exportPreparing'),
        isComplete: false
      };
      this.showExportMenu = false;
      this.cdr.markForCheck();

      // Colonnes complètes depuis la source : toutes les colonnes BO et partenaire présentes dans les données
      // Garantit que toutes les colonnes partenaire sont récupérées et exportées avec leurs données
      const allExportColumnKeys = this.buildAllColumnsFromSource(source);
      const allExportColumns = ['Clé', 'Statut', ...allExportColumnKeys.map(c => this.getColumnLabel(c))];
      const selectedCols = allExportColumns.filter(col =>
        !this.availableColumnsForExport.includes(col) || this.selectedColumnsForExport[col]
      );
      const columns = selectedCols;
      const total = source.length;

      const columnKeysForExport = allExportColumnKeys;
      const buildRow = (match: Match): Record<string, unknown> => {
        const row: Record<string, unknown> = {};
        selectedCols.forEach(col => {
          if (col === 'Clé') {
            row[col] = match.key;
          } else if (col === 'Statut') {
            row[col] = this.hasDifferences(match) ? '⚠️ Différences' : '✅ OK';
          } else {
            const columnKey = columnKeysForExport.find(c => this.getColumnLabel(c) === col) ??
              this.allColumns.find(c => this.getColumnLabel(c) === col);
            if (columnKey) {
              row[col] = this.getValue(match, columnKey);
            }
          }
        });
        return row;
      };

      const rows: Record<string, unknown>[] = [];
      const exportChunkSize = 3000;
      if (total <= exportChunkSize) {
        for (let i = 0; i < total; i++) {
          rows.push(buildRow(source[i]));
        }
      } else {
        for (let i = 0; i < total; i += exportChunkSize) {
          const end = Math.min(i + exportChunkSize, total);
          for (let j = i; j < end; j++) {
            rows.push(buildRow(source[j]));
          }
          this.exportProgress = {
            current: rows.length,
            total,
            percentage: Math.round((rows.length / total) * 50),
            message: this.t('MSG.exportPreparingRows', { current: rows.length.toLocaleString(), total: total.toLocaleString() }),
            isComplete: false
          };
          this.cdr.markForCheck();
          await new Promise<void>(r => setTimeout(r, 0));
        }
      }

      const fileName = `correspondances_${this.viewMode}_${new Date().toISOString().split('T')[0]}.xlsx`;
      const isLargeDataset = rows.length > 5000;

      // S'abonner à la progression
      if (this.exportSubscription) {
        this.exportSubscription.unsubscribe();
      }

      this.exportSubscription = this.exportOptimizationService.exportProgress$.subscribe(progress => {
        this.exportProgress = progress;
        this.cdr.markForCheck();

        if (progress.isComplete) {
          this.isExporting = false;
          if (progress.message.includes('✅')) {
            this.popupService.showSuccess(this.t('MSG.exportSuccess'));
          } else if (progress.message.includes('Erreur')) {
            this.popupService.showError(this.t('MSG.exportError'));
          }
          this.cdr.markForCheck();
        }
      });

      // Lancer l'export optimisé
      if (isLargeDataset) {
        await this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
          chunkSize: 3000,
          useWebWorker: true,
          enableCompression: true
        });
      } else {
        await this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
          chunkSize: 2000,
          useWebWorker: false
        });
      }

    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      this.isExporting = false;
      this.popupService.showError(this.t('MSG.exportMatchesError'));
      this.cdr.markForCheck();
    }
  }

  // Calculer le volume total des correspondances
  calculateTotalVolume(): number {
    return this.filteredMatches.reduce((total, match) => {
      // Essayer de trouver le montant/volume dans les données BO
      const boData = match.boData || {};
      const volumeKeys = ['montant', 'Montant', 'MONTANT', 'Volume', 'volume', 'amount', 'Amount'];
      
      for (const key of volumeKeys) {
        const originalKey = this.getOriginalKey(boData, key);
        if (boData[originalKey]) {
          const value = parseFloat(String(boData[originalKey]));
          if (!isNaN(value)) {
            return total + value;
          }
        }
      }
      
      // Essayer dans les données partenaire si pas trouvé dans BO
      const partnerData = match.partnerData || {};
      for (const key of volumeKeys) {
        const originalKey = this.getOriginalKey(partnerData, key);
        if (partnerData[originalKey]) {
          const value = parseFloat(String(partnerData[originalKey]));
          if (!isNaN(value)) {
            return total + value;
          }
        }
      }
      
      return total;
    }, 0);
  }

  private getOriginalKey(record: Record<string, any>, correctedKey: string): string {
    const keys = Object.keys(record);
    return keys.find(key => fixGarbledCharacters(key) === correctedKey) || correctedKey;
  }

  /**
   * Vérifie si les matches correspondent à une réconciliation TRXBO/OPPART
   */
  private isTRXBOOPPARTReconciliation(matches: Match[]): boolean {
    if (!matches || matches.length === 0) {
      return false;
    }

    let hasTRXBO = false;
    let hasOPPART = false;

    // Vérifier dans les données BO pour TRXBO
    for (const match of matches) {
      if (match.boData) {
        // Vérifier les valeurs pour "TRXBO"
        const boValues = Object.values(match.boData).join(' ').toUpperCase();
        if (boValues.includes('TRXBO')) {
          hasTRXBO = true;
          break;
        }
        // Vérifier les colonnes spécifiques TRXBO
        const boKeys = Object.keys(match.boData);
        if (boKeys.some(key => ['IDTransaction', 'téléphone client', 'telephone client', 'GRX'].includes(key))) {
          hasTRXBO = true;
          break;
        }
      }
    }

    // Vérifier dans les données partenaire pour OPPART
    for (const match of matches) {
      if (match.partnerData) {
        // Vérifier les valeurs pour "OPPART"
        const partnerValues = Object.values(match.partnerData).join(' ').toUpperCase();
        if (partnerValues.includes('OPPART')) {
          hasOPPART = true;
          break;
        }
        // Vérifier les colonnes spécifiques OPPART
        const partnerKeys = Object.keys(match.partnerData);
        if (partnerKeys.some(key => ['ID Opération', 'Type Opération', 'Type Operation', 'Solde avant', 'Solde après', 'Solde aprés', 'Numéro Trans GU', 'Numero Trans GU'].includes(key))) {
          hasOPPART = true;
          break;
        }
      }
    }

    return hasTRXBO && hasOPPART;
  }

  /**
   * Extrait le type d'opération depuis les données partenaire
   */
  private getTypeOperation(partnerData: Record<string, any>): string {
    if (!partnerData) {
      return '';
    }

    const possibleKeys = [
      'Type Opération',
      'Type Opration', // Avec caractères d'encodage
      'type operation',
      'type_operation',
      'typeOperation',
      'TYPE_OPERATION',
      'TypeOperation',
      'Operation',
      'operation'
    ];

    for (const key of possibleKeys) {
      if (partnerData[key] !== undefined && partnerData[key] !== null && partnerData[key] !== '') {
        return partnerData[key].toString();
      }
    }

    return '';
  }

  goBack(): void {
    this.router.navigate(['/results']);
  }

  /**
   * Extrait une valeur d'un match par noms de colonnes possibles (agence, service, pays, date).
   * Utilise la même tolérance que l'affichage du tableau ({@link getValueByFlexibleKey}) et parcourt
   * boData, partnerData et partnerDataList (correspondances 1-n).
   */
  private getValueFromMatch(match: Match, possibleKeys: string[]): string {
    const sources: Record<string, any>[] = [];
    if (match.boData) {
      sources.push(match.boData);
    }
    if (match.partnerData) {
      sources.push(match.partnerData);
    }
    if (match.partnerDataList?.length) {
      for (const pr of match.partnerDataList) {
        if (pr) {
          sources.push(pr);
        }
      }
    }
    for (const record of sources) {
      for (const key of possibleKeys) {
        const v = this.getValueByFlexibleKey(record, key);
        if (v) {
          return v;
        }
      }
    }
    return '';
  }

  /**
   * Construit les données de préremplissage pour ecart-bo-summary à partir des correspondances affichées.
   * Cloisonnement par service : si plusieurs services distincts sont présents, on produit une
   * ligne par service (montant/nombre agrégés par service). Sinon, une seule ligne globale.
   * Agence : "multiAgence" si plusieurs agences distinctes, sinon l'agence unique.
   */
  getMatchesSummaryForEcartBoSummary(): EcartBoSummaryPrefill | null {
    const matches = this.filteredMatches;
    if (!matches || matches.length === 0) {
      return null;
    }
    const serviceKeys = [
      'Service',
      'service',
      'SERVICE',
      'serv',
      'Serv',
      'Type Opération',
      'Type Operation',
      'Type operation',
      'type operation',
      'Type service',
      'Operation',
      'Opération',
      'Service BO'
    ];
    const agenceKeys = [
      'Agence',
      'agence',
      'AGENCY',
      'Agency',
      'Zone',
      'zone',
      'Agence zone',
      'Agence/Zone',
      'Agence BO',
      'BO agence',
      'BO agence/zone'
    ];
    const paysKeys = [
      'Pays',
      'pays',
      'PAYS',
      'country',
      'Country',
      'GRX',
      'grx',
      'Destination',
      'destination',
      'Code pays',
      'Pays destination',
      'Country code'
    ];
    const dateKeys = ['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'dateTransaction', 'DateTransaction'];

    // Pré-lecture des valeurs par correspondance (évite de reparcourir plusieurs fois les grands volumes).
    const rows = matches.map(match => ({
      service: this.getValueFromMatch(match, serviceKeys),
      pays: this.getValueFromMatch(match, paysKeys),
      date: this.getValueFromMatch(match, dateKeys),
      volume: this.getMatchVolume(match)
    }));
    const agencies = new Set<string>();
    for (const match of matches) {
      const ag = this.getValueFromMatch(match, agenceKeys);
      if (ag) agencies.add(ag);
    }
    const agence = agencies.size > 1 ? 'multiAgence' : (Array.from(agencies)[0] || '');

    const distinctServices = [...new Set(rows.map(r => (r.service || '').trim()).filter(Boolean))];
    if (distinctServices.length === 0) {
      return null;
    }
    const firstService = distinctServices[0];

    // Cloisonnement par service : quand plusieurs services, ce sont des lignes en attente
    // gérées par saveToEcartBoSummary(). Ici on renvoie la ligne du premier service pour
    // rester rétro-compatible avec un appel unique (cas mono-service).
    const serviceOnly = firstService;
    const serviceRows = rows.filter(r => r.service === serviceOnly);
    const pays = serviceRows.map(r => r.pays).find(Boolean) || '';
    const date = serviceRows.map(r => r.date).find(Boolean) || '';
    const volume = serviceRows.reduce((sum, r) => sum + r.volume, 0);
    const nombre = serviceRows.length;

    if (!pays) {
      return null;
    }

    let dateFormatted = date;
    if (dateFormatted) {
      try {
        const d = new Date(dateFormatted);
        if (!isNaN(d.getTime())) {
          dateFormatted = d.toISOString().split('T')[0];
        }
      } catch {
        dateFormatted = new Date().toISOString().split('T')[0];
      }
    } else {
      dateFormatted = new Date().toISOString().split('T')[0];
    }

    return {
      date: dateFormatted,
      agence,
      service: serviceOnly,
      pays,
      nombre,
      volume
    };
  }

  /** Renvoie les lignes en attente par service (montant + nombre agrégés par service), ou null si données insuffisantes. */
  private buildMatchesPendingLinesByService(): EcartBoSummaryPendingLine[] | null {
    const matches = this.filteredMatches;
    if (!matches || matches.length === 0) {
      return null;
    }
    const serviceKeys = [
      'Service',
      'service',
      'SERVICE',
      'serv',
      'Serv',
      'Type Opération',
      'Type Operation',
      'Type operation',
      'type operation',
      'Type service',
      'Operation',
      'Opération',
      'Service BO'
    ];
    const paysKeys = [
      'Pays',
      'pays',
      'PAYS',
      'country',
      'Country',
      'GRX',
      'grx',
      'Destination',
      'destination',
      'Code pays',
      'Pays destination',
      'Country code'
    ];
    const dateKeys = ['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'dateTransaction', 'DateTransaction'];

    const rows = matches.map(match => ({
      service: (this.getValueFromMatch(match, serviceKeys) || '').trim(),
      pays: this.getValueFromMatch(match, paysKeys) || '',
      date: this.getValueFromMatch(match, dateKeys) || '',
      volume: this.getMatchVolume(match)
    }));

    const byService = new Map<string, { pays: string; date: string; nombre: number; volume: number }>();
    for (const r of rows) {
      if (!r.service) continue;
      const agg = byService.get(r.service) || { pays: '', date: '', nombre: 0, volume: 0 };
      agg.nombre += 1;
      agg.volume += r.volume;
      if (!agg.pays && r.pays) agg.pays = r.pays;
      if (!agg.date && r.date) agg.date = r.date;
      byService.set(r.service, agg);
    }

    const lines: EcartBoSummaryPendingLine[] = [];
    for (const [service, agg] of byService) {
      if (!agg.pays) continue;
      let dateFormatted = agg.date;
      if (dateFormatted) {
        const d = new Date(dateFormatted);
        if (!isNaN(d.getTime())) {
          dateFormatted = d.toISOString().split('T')[0];
        }
      } else {
        dateFormatted = new Date().toISOString().split('T')[0];
      }
      lines.push({
        agence: 'multiAgence',
        service,
        pays: agg.pays,
        montant: agg.volume,
        date: dateFormatted,
        statut: 'en cours',
        nombreTransactions: agg.nombre
      });
    }
    return lines.length > 0 ? lines : null;
  }

  /** Montant/volume associé à une correspondance (BO puis partenaire). */
  private getMatchVolume(match: Match): number {
    const boData = match.boData || {};
    const volumeKeys = ['montant', 'Montant', 'MONTANT', 'Volume', 'volume', 'amount', 'Amount'];
    for (const key of volumeKeys) {
      const originalKey = this.getOriginalKey(boData, key);
      const raw = boData[originalKey];
      if (raw) {
        const value = parseFloat(String(raw));
        if (!isNaN(value)) return value;
      }
    }
    const partnerData = match.partnerData || {};
    for (const key of volumeKeys) {
      const originalKey = this.getOriginalKey(partnerData, key);
      const raw = partnerData[originalKey];
      if (raw) {
        const value = parseFloat(String(raw));
        if (!isNaN(value)) return value;
      }
    }
    return 0;
  }

  /**
   * Enregistre les données des correspondances pour préremplir ecart-bo-summary, puis navigue vers /ecart-bo-summary.
   * Cloisonnement par service : si plusieurs services sont présents, on enregistre une ligne en attente
   * par service (à valider puis sauvegarder sur la page de destination). Sinon, formulaire prérempli unique.
   */
  saveToEcartBoSummary(): void {
    const matches = this.filteredMatches;
    const serviceKeys = [
      'Service',
      'service',
      'SERVICE',
      'serv',
      'Serv',
      'Type Opération',
      'Type Operation',
      'Type operation',
      'type operation',
      'Type service',
      'Operation',
      'Opération',
      'Service BO'
    ];
    const distinctServices = matches
      ? [...new Set(matches.map(m => this.getValueFromMatch(m, serviceKeys)).map(v => (v || '').trim()).filter(Boolean))]
      : [];
    const multipleServices = distinctServices.length > 1;

    if (multipleServices) {
      const lines = this.buildMatchesPendingLinesByService();
      if (!lines || lines.length === 0) {
        this.popupService.showWarning(this.t('MSG.cannotPrepareServiceCountry'));
        return;
      }
      this.ecartBoSummaryService.setPendingLinesFromEcartBo(lines, 'matches');
      this.popupService.showSuccess(this.t('MSG.linesPerServiceReady', { count: lines.length }));
      this.router.navigate(['/ecart-bo-summary']);
      this.cdr.markForCheck();
      return;
    }

    const prefill = this.getMatchesSummaryForEcartBoSummary();
    if (!prefill) {
      this.popupService.showWarning(this.t('MSG.cannotPrepareAgencyServiceCountry'));
      return;
    }
    this.ecartBoSummaryService.setPrefillFromMatches(prefill, 'matches');
    this.router.navigate(['/ecart-bo-summary']);
    this.cdr.markForCheck();
  }

  scrollToTop(): void {
    this.el.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onTableScroll(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.tableScrollLeft = el.scrollLeft;
    this.tableScrollMax = el.scrollWidth - el.clientWidth;
    this.cdr.markForCheck();
  }

  scrollTableLeft(): void {
    this.tableWrapperRef?.nativeElement.scrollBy({ left: -this.TABLE_SCROLL_STEP, behavior: 'smooth' });
  }

  scrollTableRight(): void {
    this.tableWrapperRef?.nativeElement.scrollBy({ left: this.TABLE_SCROLL_STEP, behavior: 'smooth' });
  }

  private updateTableScrollState(): void {
    const el = this.tableWrapperRef?.nativeElement;
    if (el) {
      this.tableScrollLeft = el.scrollLeft;
      this.tableScrollMax = el.scrollWidth - el.clientWidth;
      this.cdr.markForCheck();
    }
  }
}
