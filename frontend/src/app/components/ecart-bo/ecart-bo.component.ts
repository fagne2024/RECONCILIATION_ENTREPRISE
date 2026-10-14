import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { EcartSoldeService } from '../../services/ecart-solde.service';
import { TrxSfService } from '../../services/trx-sf.service';
import { PopupService } from '../../services/popup.service';
import { ExportOptimizationService } from '../../services/export-optimization.service';
import { EcartSolde } from '../../models/ecart-solde.model';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';

@Component({
  selector: 'app-ecart-bo',
  templateUrl: './ecart-bo.component.html',
  styleUrls: ['./ecart-bo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcartBoComponent implements OnInit, OnDestroy {
  response: ReconciliationResponse | null = null;
  private subscription = new Subscription();
  filteredBoOnly: Record<string, string>[] = [];
  boOnlyPage = 1;
  pageSize = 20; // Modifiable par l'utilisateur
  searchKey: string = '';
  isLoading = false;
  loadProgress = 0;
  private volumeCache: number | null = null;
  private searchSubject = new Subject<string>();
  private searchIndex: Map<string, Set<number>> = new Map(); // Index de recherche pour performance
  isSavingEcartBo = false;
  isSavingEcartBoToTrxSf = false;
  selectedBoOnlyKeys: string[] = [];
  isExporting = false;
  exportProgress = 0;
  exportMessage = '';
  private exportSubscription?: Subscription;

  // Gestion des colonnes
  allColumns: string[] = []; // Toutes les colonnes disponibles
  visibleColumns: string[] = []; // Colonnes visibles dans le tableau
  columnVisibility: Map<string, boolean> = new Map(); // État de visibilité de chaque colonne
  showColumnSelector = false;
  
  // Drag & drop pour réorganiser les colonnes
  draggedColumn: string | null = null;
  dragOverColumn: string | null = null;
  isColumnReorderMode = false;

  constructor(
    private appStateService: AppStateService,
    private router: Router,
    private reconciliationTabsService: ReconciliationTabsService,
    private ecartSoldeService: EcartSoldeService,
    private trxSfService: TrxSfService,
    private popupService: PopupService,
    private exportOptimizationService: ExportOptimizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscription.add(
      this.appStateService.getReconciliationResults().subscribe((response: ReconciliationResponse | null) => {
        if (response) {
          this.response = response;
          this.loadBoOnly();
        }
      })
    );

    // Debounce sur la recherche
    this.subscription.add(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(searchTerm => {
        this.performSearch(searchTerm);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.exportSubscription) {
      this.exportSubscription.unsubscribe();
    }
  }

  private async loadBoOnly(): Promise<void> {
    this.isLoading = true;
    this.loadProgress = 0;
    this.cdr.markForCheck();
    
    try {
      const boOnly = this.response?.boOnly || [];
      const allData = [...boOnly];
      const total = boOnly.length;
      
      if (total === 0) {
        this.filteredBoOnly = [];
        this.reconciliationTabsService.setFilteredBoOnly([]);
        return;
      }

      // Chargement progressif par chunks
      const chunkSize = 1000;
      this.filteredBoOnly = [];
      
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = allData.slice(i, Math.min(i + chunkSize, total));
        this.filteredBoOnly.push(...chunk);
        this.loadProgress = Math.round(((i + chunk.length) / total) * 100);
        this.cdr.markForCheck();
        
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
      this.volumeCache = null;
      this.initializeColumns();
      this.buildSearchIndex();
    } finally {
      this.isLoading = false;
      this.loadProgress = 100;
      this.cdr.markForCheck();
    }
  }

  private initializeColumns(): void {
    if (this.filteredBoOnly.length === 0) return;

    const allColumnsSet = new Set<string>();
    const sampleRecord = this.filteredBoOnly[0];

    // Collecter toutes les colonnes
    Object.keys(sampleRecord).forEach(key => {
      const correctedKey = fixGarbledCharacters(key);
      allColumnsSet.add(correctedKey);
    });

    this.allColumns = Array.from(allColumnsSet).sort();
    
    // Par défaut, toutes les colonnes sont visibles
    this.visibleColumns = [...this.allColumns];
    this.allColumns.forEach(col => {
      this.columnVisibility.set(col, true);
    });
  }

  onSearch(): void {
    this.searchSubject.next(this.searchKey);
  }

  private buildSearchIndex(): void {
    this.searchIndex.clear();
    const boOnly = this.response?.boOnly || [];
    const allMismatches = [...boOnly];
    
    allMismatches.forEach((record, index) => {
      // Créer une chaîne de recherche pour ce record
      const searchableText = Object.entries(record)
        .map(([key, value]) => `${key} ${value}`)
        .join(' ')
        .toLowerCase();
      
      // Indexer chaque mot significatif (longueur > 2)
      const words = searchableText.split(/\s+/).filter(w => w.length > 2);
      words.forEach(word => {
        if (!this.searchIndex.has(word)) {
          this.searchIndex.set(word, new Set());
        }
        this.searchIndex.get(word)!.add(index);
      });
    });
  }
  
  private performSearch(searchTerm: string): void {
    const boOnly = this.response?.boOnly || [];
    const allMismatches = [...boOnly];
    
    if (!searchTerm || !searchTerm.trim()) {
      // Pas de recherche : afficher tous les éléments
      this.filteredBoOnly = allMismatches;
    } else {
      const term = searchTerm.trim();
      const termLower = term.toLowerCase();
      const searchTerms = termLower.split(/\s+/).filter(t => t.length > 2);
      
      if (searchTerms.length > 0 && this.searchIndex.size > 0) {
        // Utiliser l'index pour une recherche rapide
        const matchingIndices = new Set<number>();
        
        searchTerms.forEach((searchTermWord, termIndex) => {
          const termMatches = new Set<number>();
          
          // Chercher dans l'index
          this.searchIndex.forEach((indices, indexedWord) => {
            if (indexedWord.includes(searchTermWord)) {
              indices.forEach(idx => termMatches.add(idx));
            }
          });
          
          if (termIndex === 0) {
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
          this.filteredBoOnly = allMismatches.filter((_, index) => matchingIndices.has(index));
        } else {
          // Fallback : recherche classique si l'index ne trouve rien
          this.filteredBoOnly = this.performClassicSearch(allMismatches, termLower);
        }
      } else {
        // Fallback : recherche classique
        this.filteredBoOnly = this.performClassicSearch(allMismatches, termLower);
      }
    }
    
    // Réinitialiser à la première page après recherche
    this.boOnlyPage = 1;
    this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
    this.volumeCache = null;
    this.cdr.markForCheck();
  }
  
  private performClassicSearch(allMismatches: Record<string, string>[], termLower: string): Record<string, string>[] {
    return allMismatches.filter(record => {
      for (const [key, value] of Object.entries(record)) {
        if (!value) continue;
        
        const valueStr = value.toString();
        const valueLower = valueStr.toLowerCase();
        const keyLower = key.toLowerCase();
        
        // 1. Recherche simple : le terme est contenu dans la valeur
        if (valueLower.includes(termLower)) {
          return true;
        }
        
        // 2. Recherche dans le nom de la colonne
        if (keyLower.includes(termLower)) {
          return true;
        }
        
        // 3. Recherche exacte pour les numéros
        const valueNumbers = valueStr.replace(/[^\d]/g, '');
        const termNumbers = termLower.replace(/[^\d]/g, '');
        if (termNumbers && valueNumbers.includes(termNumbers)) {
          return true;
        }
      }
      return false;
    });
  }

  clearSearch(): void {
    this.searchKey = '';
    this.onSearch();
  }

  getSearchResultsCount(): number {
    return this.filteredBoOnly.length;
  }

  getTotalResultsCount(): number {
    const mismatches = this.response?.mismatches || [];
    const boOnly = this.response?.boOnly || [];
    return mismatches.length + boOnly.length;
  }

  getPagedBoOnly(): Record<string, string>[] {
    const start = (this.boOnlyPage - 1) * this.pageSize;
    return this.filteredBoOnly.slice(start, start + this.pageSize);
  }

  getTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredBoOnly.length / this.pageSize));
  }

  nextPage(): void {
    if (this.boOnlyPage < this.getTotalPages()) {
      this.boOnlyPage++;
      this.cdr.markForCheck();
    }
  }

  prevPage(): void {
    if (this.boOnlyPage > 1) {
      this.boOnlyPage--;
      this.cdr.markForCheck();
    }
  }

  goToPage(page: number): void {
    const totalPages = this.getTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.boOnlyPage = page;
      this.cdr.markForCheck();
    }
  }

  getVisiblePages(): number[] {
    const totalPages = this.getTotalPages();
    const currentPage = this.boOnlyPage;
    const maxVisiblePages = 5;
    const pages: number[] = [];

    if (totalPages <= maxVisiblePages) {
      // Afficher toutes les pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Afficher les pages autour de la page courante
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      // Ajuster si on est proche de la fin
      if (end - start < maxVisiblePages - 1) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  getStartIndex(): number {
    return (this.boOnlyPage - 1) * this.pageSize;
  }

  getEndIndex(): number {
    return Math.min(this.boOnlyPage * this.pageSize, this.filteredBoOnly.length);
  }

  onItemsPerPageChange(): void {
    this.boOnlyPage = 1; // Revenir à la première page
    this.cdr.markForCheck();
  }

  getBoEcartCount(): number {
    return (this.response?.mismatches?.length || 0) + (this.response?.boOnly?.length || 0);
  }

  calculateTotalVolumeBoOnly(): number {
    if (this.volumeCache !== null) {
      return this.volumeCache;
    }

    if (!this.filteredBoOnly || this.filteredBoOnly.length === 0) {
      this.volumeCache = 0;
      return 0;
    }

    // Calcul optimisé avec limite
    const maxToProcess = Math.min(this.filteredBoOnly.length, 10000);
    let total = 0;
    
    for (let i = 0; i < maxToProcess; i++) {
      const amount = parseFloat(this.filteredBoOnly[i]['montant'] || this.filteredBoOnly[i]['Montant'] || this.filteredBoOnly[i]['volume'] || '0');
      if (!isNaN(amount)) total += amount;
    }
    
    // Extrapolation si nécessaire
    if (this.filteredBoOnly.length > maxToProcess) {
      total = (total / maxToProcess) * this.filteredBoOnly.length;
    }
    
    this.volumeCache = total;
    return total;
  }

  getBoOnlyAgencyAndService(record: Record<string, string>): { agency: string; service: string; volume: number; date: string; country: string } {
    return {
      agency: record['Agence'] || record['agence'] || record['AGENCE'] || '',
      service: record['Service'] || record['service'] || record['SERVICE'] || '',
      volume: parseFloat(record['montant'] || record['Montant'] || record['volume'] || '0') || 0,
      date: record['Date'] || record['date'] || record['DATE'] || '',
      country: record['Pays'] || record['pays'] || record['PAYS'] || ''
    };
  }

  getBoOnlyKeys(record: Record<string, string>): string[] {
    return Object.keys(record).map(key => fixGarbledCharacters(key));
  }

  getRecordValue(record: Record<string, string>, key: string): string {
    const originalKey = Object.keys(record).find(k => fixGarbledCharacters(k) === key);
    return originalKey ? (record[originalKey] || '').toString() : '';
  }

  private getBoOnlyKey(record: Record<string, string>): string {
    const parts = [
      record['IDTransaction'] || record['id_transaction'] || '',
      record['Date'] || record['date'] || '',
      record['montant'] || record['Montant'] || ''
    ].filter(p => p).join('|');
    return parts || JSON.stringify(record);
  }

  isBoRecordSelected(record: Record<string, string>): boolean {
    return this.selectedBoOnlyKeys.includes(this.getBoOnlyKey(record));
  }

  toggleBoSelection(record: Record<string, string>, event: any): void {
    const key = this.getBoOnlyKey(record);
    if (event.target.checked) {
      if (!this.selectedBoOnlyKeys.includes(key)) {
        this.selectedBoOnlyKeys.push(key);
      }
    } else {
      this.selectedBoOnlyKeys = this.selectedBoOnlyKeys.filter(k => k !== key);
    }
  }

  get allBoSelectedOnPage(): boolean {
    const page = this.getPagedBoOnly();
    return page.length > 0 && page.every(r => this.isBoRecordSelected(r));
  }

  toggleSelectAllBoOnPage(event: any): void {
    const page = this.getPagedBoOnly();
    const pageKeys = page.map(r => this.getBoOnlyKey(r));
    if (event.target.checked) {
      this.selectedBoOnlyKeys = Array.from(new Set([...this.selectedBoOnlyKeys, ...pageKeys]));
    } else {
      this.selectedBoOnlyKeys = this.selectedBoOnlyKeys.filter(k => !pageKeys.includes(k));
    }
  }

  private getBoRecordsForAction(): Record<string, string>[] {
    if (this.selectedBoOnlyKeys.length === 0) {
      return this.filteredBoOnly;
    }
    const keySet = new Set(this.selectedBoOnlyKeys);
    return this.filteredBoOnly.filter(record => keySet.has(this.getBoOnlyKey(record)));
  }

  async saveEcartBoToEcartSolde(): Promise<void> {
    const sourceRecords = this.getBoRecordsForAction();
    if (sourceRecords.length === 0) {
      this.popupService.showWarning('❌ Aucune ligne sélectionnée pour la sauvegarde.');
      return;
    }

    this.isSavingEcartBo = true;
    try {
      const ecartSoldeData: EcartSolde[] = sourceRecords.map((record) => {
        const agencyInfo = this.getBoOnlyAgencyAndService(record);
        const getValue = (keys: string[]): string => {
          for (const key of keys) {
            if (record[key]) return record[key].toString();
          }
          return '';
        };

        return {
          id: undefined,
          idTransaction: getValue(['IDTransaction', 'id_transaction', 'ID_TRANSACTION']),
          telephoneClient: getValue(['téléphone client', 'telephone_client', 'phone']),
          montant: parseFloat(getValue(['montant', 'Montant', 'amount'])) || 0,
          service: agencyInfo.service,
          agence: agencyInfo.agency,
          dateTransaction: agencyInfo.date,
          numeroTransGu: getValue(['Numéro Trans GU', 'numeroTransGU', 'numero_trans_gu']),
          pays: agencyInfo.country,
          statut: 'EN_ATTENTE',
          commentaire: 'IMPACT J+1',
          dateImport: new Date().toISOString()
        };
      });

      const validRecords = ecartSoldeData.filter(record => 
        record.idTransaction && record.agence
      );

      if (validRecords.length === 0) {
        this.popupService.showWarning('❌ Aucune donnée valide trouvée pour la sauvegarde.');
        return;
      }

      const confirmed = await this.popupService.showConfirm(
        `📋 ${validRecords.length} enregistrements valides seront sauvegardés. Continuer ?`,
        'Confirmation'
      );

      if (!confirmed) return;

      const result = await this.ecartSoldeService.createMultipleEcartSoldes(validRecords);
      this.popupService.showSuccess(`✅ ${result.count} enregistrements créés avec succès !`);
    } catch (error: any) {
      this.popupService.showError(`❌ Erreur: ${error.message || 'Erreur inconnue'}`);
    } finally {
      this.isSavingEcartBo = false;
    }
  }

  async saveEcartBoToTrxSf(): Promise<void> {
    const sourceRecords = this.getBoRecordsForAction();
    if (sourceRecords.length === 0) {
      this.popupService.showWarning('❌ Aucune ligne sélectionnée pour la sauvegarde.');
      return;
    }

    this.isSavingEcartBoToTrxSf = true;
    try {
      // Implémentation similaire à saveEcartBoToEcartSolde mais pour TRX SF
      this.popupService.showInfo('Fonctionnalité en cours de développement');
    } catch (error: any) {
      this.popupService.showError(`❌ Erreur: ${error.message || 'Erreur inconnue'}`);
    } finally {
      this.isSavingEcartBoToTrxSf = false;
    }
  }

  async exportResults(): Promise<void> {
    if (!this.filteredBoOnly || this.filteredBoOnly.length === 0) {
      this.popupService.showWarning('Aucun écart BO à exporter');
      return;
    }

    this.isExporting = true;
    this.exportProgress = 0;
    this.exportMessage = 'Préparation de l\'export...';
    this.cdr.markForCheck();

    try {
      const totalRecords = this.filteredBoOnly.length;
      const isLargeDataset = totalRecords > 5000;

      // Étape 1: Collecter les colonnes
      this.exportMessage = 'Collecte des colonnes...';
      this.cdr.markForCheck();
      
      const allColumns = new Set<string>();
      const columnMap = new Map<string, string>(); // correctedKey -> originalKey

      // Collecter les colonnes sur un échantillon représentatif
      const sampleRecord = this.filteredBoOnly[0];
      Object.keys(sampleRecord).forEach(originalKey => {
        const correctedKey = fixGarbledCharacters(originalKey);
        allColumns.add(correctedKey);
        columnMap.set(correctedKey, originalKey);
      });

      const columns = Array.from(allColumns).sort();

      // Étape 2: Transformer les données par chunks
      this.exportMessage = 'Transformation des données...';
      this.cdr.markForCheck();

      const rows: any[] = [];
      const chunkSize = 1000;

      for (let i = 0; i < totalRecords; i += chunkSize) {
        const chunk = this.filteredBoOnly.slice(i, Math.min(i + chunkSize, totalRecords));
        
        chunk.forEach(record => {
          const row: any = {};
          columns.forEach(col => {
            const originalKey = columnMap.get(col);
            row[col] = originalKey && record[originalKey] !== undefined 
              ? String(record[originalKey] || '') 
              : '';
          });
          rows.push(row);
        });

        this.exportProgress = Math.round(((i + chunk.length) / totalRecords) * 50);
        this.exportMessage = `Transformation: ${Math.min(i + chunk.length, totalRecords).toLocaleString()}/${totalRecords.toLocaleString()} écarts BO`;
        this.cdr.markForCheck();

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Étape 3: Exporter avec le service optimisé
      this.exportMessage = 'Génération du fichier Excel...';
      this.exportProgress = 50;
      this.cdr.markForCheck();

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const fileName = `ecart_bo_${timestamp}`;

      // S'abonner à la progression de l'export
      if (this.exportSubscription) {
        this.exportSubscription.unsubscribe();
      }

      this.exportSubscription = this.exportOptimizationService.exportProgress$.subscribe(progress => {
        this.exportProgress = 50 + Math.round(progress.percentage / 2);
        this.exportMessage = progress.message;
        this.cdr.markForCheck();

        if (progress.isComplete) {
          this.isExporting = false;
          if (progress.message.includes('✅')) {
            this.exportMessage = 'Export terminé avec succès !';
            this.popupService.showSuccess('Export réussi !');
          } else if (progress.message.includes('Erreur')) {
            this.exportMessage = 'Erreur lors de l\'export';
            this.popupService.showError('Erreur lors de l\'export');
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
      this.exportMessage = 'Erreur lors de l\'export';
      this.popupService.showError('Erreur lors de l\'export des écarts BO');
      this.cdr.markForCheck();
    }
  }

  // Gestion des colonnes
  toggleColumnVisibility(column: string): void {
    const isVisible = this.columnVisibility.get(column) ?? true;
    this.columnVisibility.set(column, !isVisible);
    
    if (!isVisible) {
      // Ajouter la colonne à visibleColumns si elle n'y est pas déjà
      if (!this.visibleColumns.includes(column)) {
        const originalIndex = this.allColumns.indexOf(column);
        if (originalIndex >= 0) {
          const currentIndex = this.visibleColumns.findIndex(c => c === column);
          if (currentIndex === -1) {
            // Trouver la bonne position dans visibleColumns
            let insertIndex = 0;
            for (let i = 0; i < this.visibleColumns.length; i++) {
              if (this.allColumns.indexOf(this.visibleColumns[i]) < originalIndex) {
                insertIndex = i + 1;
              }
            }
            this.visibleColumns.splice(insertIndex, 0, column);
          }
        } else {
          this.visibleColumns.push(column);
        }
      }
    } else {
      // Retirer la colonne
      this.visibleColumns = this.visibleColumns.filter(c => c !== column);
    }
    this.cdr.markForCheck();
  }

  isColumnVisible(column: string): boolean {
    return this.columnVisibility.get(column) ?? true;
  }

  getVisibleColumns(): string[] {
    return this.visibleColumns.filter(col => this.columnVisibility.get(col) ?? true);
  }

  // Drag & Drop pour réorganiser les colonnes
  onColumnDragStart(event: DragEvent, column: string): void {
    if (!this.isColumnReorderMode) return;
    this.draggedColumn = column;
    event.dataTransfer!.effectAllowed = 'move';
  }

  onColumnDragOver(event: DragEvent, column: string): void {
    if (!this.isColumnReorderMode || !this.draggedColumn) return;
    event.preventDefault();
    this.dragOverColumn = column;
  }

  onColumnDrop(event: DragEvent, targetColumn: string): void {
    if (!this.isColumnReorderMode || !this.draggedColumn) return;
    event.preventDefault();
    
    if (this.draggedColumn !== targetColumn) {
      const draggedIndex = this.visibleColumns.indexOf(this.draggedColumn);
      const targetIndex = this.visibleColumns.indexOf(targetColumn);
      
      if (draggedIndex >= 0 && targetIndex >= 0) {
        const newColumns = [...this.visibleColumns];
        newColumns.splice(draggedIndex, 1);
        newColumns.splice(targetIndex, 0, this.draggedColumn);
        this.visibleColumns = newColumns;
      }
    }
    
    this.draggedColumn = null;
    this.dragOverColumn = null;
    this.cdr.markForCheck();
  }

  onColumnDragEnd(): void {
    this.draggedColumn = null;
    this.dragOverColumn = null;
  }

  toggleColumnReorderMode(): void {
    this.isColumnReorderMode = !this.isColumnReorderMode;
    this.draggedColumn = null;
    this.dragOverColumn = null;
  }

  // Obtenir la valeur d'une cellule pour le tableau
  getCellValue(record: Record<string, string>, column: string): string {
    const originalKey = Object.keys(record).find(k => fixGarbledCharacters(k) === column);
    return originalKey ? (record[originalKey] || '').toString() : '';
  }

  showAllColumns(): void {
    this.allColumns.forEach(c => {
      this.columnVisibility.set(c, true);
      if (!this.visibleColumns.includes(c)) {
        this.visibleColumns.push(c);
      }
    });
    this.visibleColumns = [...this.allColumns];
    this.cdr.markForCheck();
  }

  hideAllColumns(): void {
    this.allColumns.forEach(c => this.columnVisibility.set(c, false));
    this.visibleColumns = [];
    this.cdr.markForCheck();
  }

  goBack(): void {
    this.router.navigate(['/results']);
  }
}
