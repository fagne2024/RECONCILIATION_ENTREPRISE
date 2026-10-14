import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { ImpactOPService } from '../../services/impact-op.service';
import { OperationService } from '../../services/operation.service';
import { CompteService } from '../../services/compte.service';
import { PopupService } from '../../services/popup.service';
import { ExportOptimizationService } from '../../services/export-optimization.service';
import { ImpactOP } from '../../models/impact-op.model';
import { OperationCreateRequest } from '../../models/operation.model';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';

@Component({
  selector: 'app-ecart-partenaire',
  templateUrl: './ecart-partenaire.component.html',
  styleUrls: ['./ecart-partenaire.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcartPartenaireComponent implements OnInit, OnDestroy {
  response: ReconciliationResponse | null = null;
  private subscription = new Subscription();
  filteredPartnerOnly: Record<string, string>[] = [];
  partnerOnlyPage = 1;
  pageSize = 20; // Modifiable par l'utilisateur
  searchKey: string = '';
  isLoading = false;
  loadProgress = 0;
  private volumeCache: number | null = null;
  private searchSubject = new Subject<string>();
  private searchIndex: Map<string, Set<number>> = new Map(); // Index de recherche pour performance
  isSavingEcartPartnerToImpactOP = false;
  selectedPartnerOnlyKeys: string[] = [];
  selectedPartnerImportOpDate: string | null = null;
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
    private impactOPService: ImpactOPService,
    private operationService: OperationService,
    private compteService: CompteService,
    private popupService: PopupService,
    private exportOptimizationService: ExportOptimizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscription.add(
      this.appStateService.getReconciliationResults().subscribe((response: ReconciliationResponse | null) => {
        if (response) {
          this.response = response;
          this.loadPartnerOnly();
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

  private async loadPartnerOnly(): Promise<void> {
    this.isLoading = true;
    this.loadProgress = 0;
    this.cdr.markForCheck();
    
    try {
      const partnerOnly = this.response?.partnerOnly || [];
      const total = partnerOnly.length;
      
      if (total === 0) {
        this.filteredPartnerOnly = [];
        this.reconciliationTabsService.setFilteredPartnerOnly([]);
        return;
      }

      // Chargement progressif par chunks pour éviter de bloquer l'UI
      // Utiliser des chunks plus petits pour un feedback plus rapide
      const chunkSize = 500; // Chunks plus petits pour un feedback plus rapide
      this.filteredPartnerOnly = [];
      
      // Charger immédiatement un petit échantillon pour l'initialisation rapide
      if (partnerOnly.length > 0) {
        const sampleSize = Math.min(50, total);
        const sample = partnerOnly.slice(0, sampleSize);
        this.filteredPartnerOnly.push(...sample);
        this.loadProgress = 2;
        this.initializeColumns();
        this.cdr.markForCheck();
        
        // Permettre au navigateur de mettre à jour l'UI immédiatement
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Charger le reste par chunks pour un feedback régulier
      for (let i = 50; i < total; i += chunkSize) {
        const chunk = partnerOnly.slice(i, Math.min(i + chunkSize, total));
        this.filteredPartnerOnly.push(...chunk);
        this.loadProgress = Math.round(((i + chunk.length) / total) * 98 + 2); // 2-100%
        this.cdr.markForCheck();
        
        // Permettre au navigateur de mettre à jour l'UI
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
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
    if (this.filteredPartnerOnly.length === 0) return;

    const allColumnsSet = new Set<string>();
    const sampleRecord = this.filteredPartnerOnly[0];

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
    const partnerOnly = this.response?.partnerOnly || [];
    
    partnerOnly.forEach((record, index) => {
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
    const partnerOnly = this.response?.partnerOnly || [];
    
    if (!searchTerm || !searchTerm.trim()) {
      // Pas de recherche : afficher tous les éléments
      this.filteredPartnerOnly = partnerOnly;
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
          this.filteredPartnerOnly = partnerOnly.filter((_, index) => matchingIndices.has(index));
        } else {
          // Fallback : recherche classique si l'index ne trouve rien
          this.filteredPartnerOnly = this.performClassicSearch(partnerOnly, termLower);
        }
      } else {
        // Fallback : recherche classique
        this.filteredPartnerOnly = this.performClassicSearch(partnerOnly, termLower);
      }
    }
    
    // Réinitialiser à la première page après recherche
    this.partnerOnlyPage = 1;
    this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
    this.volumeCache = null;
    this.cdr.markForCheck();
  }
  
  private performClassicSearch(partnerOnly: Record<string, string>[], termLower: string): Record<string, string>[] {
    return partnerOnly.filter(record => {
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
    return this.filteredPartnerOnly.length;
  }

  getTotalResultsCount(): number {
    return this.response?.partnerOnly?.length || 0;
  }

  getPagedPartnerOnly(): Record<string, string>[] {
    const start = (this.partnerOnlyPage - 1) * this.pageSize;
    return this.filteredPartnerOnly.slice(start, start + this.pageSize);
  }

  getTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPartnerOnly.length / this.pageSize));
  }

  nextPage(): void {
    if (this.partnerOnlyPage < this.getTotalPages()) {
      this.partnerOnlyPage++;
      this.cdr.markForCheck();
    }
  }

  prevPage(): void {
    if (this.partnerOnlyPage > 1) {
      this.partnerOnlyPage--;
      this.cdr.markForCheck();
    }
  }

  goToPage(page: number): void {
    const totalPages = this.getTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.partnerOnlyPage = page;
      this.cdr.markForCheck();
    }
  }

  getVisiblePages(): number[] {
    const totalPages = this.getTotalPages();
    const currentPage = this.partnerOnlyPage;
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
    return (this.partnerOnlyPage - 1) * this.pageSize;
  }

  getEndIndex(): number {
    return Math.min(this.partnerOnlyPage * this.pageSize, this.filteredPartnerOnly.length);
  }

  onItemsPerPageChange(): void {
    this.partnerOnlyPage = 1; // Revenir à la première page
    this.cdr.markForCheck();
  }

  getPartnerOnlyCount(): number {
    return this.response?.partnerOnly?.length || 0;
  }

  calculateTotalVolumePartnerOnly(): number {
    if (this.volumeCache !== null) {
      return this.volumeCache;
    }

    if (!this.filteredPartnerOnly || this.filteredPartnerOnly.length === 0) {
      this.volumeCache = 0;
      return 0;
    }

    // Calcul optimisé avec limite
    const maxToProcess = Math.min(this.filteredPartnerOnly.length, 10000);
    let total = 0;
    
    for (let i = 0; i < maxToProcess; i++) {
      total += this.getPartnerOnlyVolume(this.filteredPartnerOnly[i]);
    }
    
    // Extrapolation si nécessaire
    if (this.filteredPartnerOnly.length > maxToProcess) {
      total = (total / maxToProcess) * this.filteredPartnerOnly.length;
    }
    
    this.volumeCache = total;
    return total;
  }

  getPartnerOnlyVolume(record: Record<string, string>): number {
    const amountColumns = ['montant', 'Montant', 'amount', 'Crédit', 'crédit', 'volume', 'Volume'];
    for (const col of amountColumns) {
      if (record[col]) {
        const amount = parseFloat(record[col]);
        if (!isNaN(amount)) return amount;
      }
    }
    return 0;
  }

  getPartnerOnlyDate(record: Record<string, string>): string {
    return record['Date'] || record['date'] || record['Date opération'] || record['dateOperation'] || '';
  }

  getPartnerOnlyKeys(record: Record<string, string>): string[] {
    return Object.keys(record).map(key => fixGarbledCharacters(key));
  }

  getRecordValue(record: Record<string, string>, key: string): string {
    const originalKey = Object.keys(record).find(k => fixGarbledCharacters(k) === key);
    return originalKey ? (record[originalKey] || '').toString() : '';
  }

  private getPartnerOnlyKey(record: Record<string, string>): string {
    const parts = [
      record['Numéro Trans GU'] || record['numeroTransGU'] || '',
      record['ID Opération'] || record['id_operation'] || '',
      record['Date opération'] || record['dateOperation'] || '',
      record['Montant'] || record['montant'] || ''
    ].filter(p => p).join('|');
    return parts || JSON.stringify(record);
  }

  isPartnerRecordSelected(record: Record<string, string>): boolean {
    return this.selectedPartnerOnlyKeys.includes(this.getPartnerOnlyKey(record));
  }

  togglePartnerSelection(record: Record<string, string>, event: any): void {
    const key = this.getPartnerOnlyKey(record);
    if (event.target.checked) {
      if (!this.selectedPartnerOnlyKeys.includes(key)) {
        this.selectedPartnerOnlyKeys.push(key);
      }
    } else {
      this.selectedPartnerOnlyKeys = this.selectedPartnerOnlyKeys.filter(k => k !== key);
    }
  }

  get allPartnerSelectedOnPage(): boolean {
    const page = this.getPagedPartnerOnly();
    return page.length > 0 && page.every(r => this.isPartnerRecordSelected(r));
  }

  toggleSelectAllPartnerOnPage(event: any): void {
    const page = this.getPagedPartnerOnly();
    const pageKeys = page.map(r => this.getPartnerOnlyKey(r));
    if (event.target.checked) {
      this.selectedPartnerOnlyKeys = Array.from(new Set([...this.selectedPartnerOnlyKeys, ...pageKeys]));
    } else {
      this.selectedPartnerOnlyKeys = this.selectedPartnerOnlyKeys.filter(k => !pageKeys.includes(k));
    }
  }

  isPartnerRecordEligible(record: Record<string, string>): boolean {
    // Vérifier si l'enregistrement a les données nécessaires pour créer une OP
    // Méthode très permissive : activer le bouton si on trouve au moins un montant ET une date
    // dans n'importe quelle colonne du record
    
    if (!record || Object.keys(record).length === 0) {
      return false;
    }
    
    // Chercher un montant/volume dans toutes les clés (insensible à la casse)
    const amountKeywords = ['montant', 'amount', 'crédit', 'credit', 'volume', 'prix', 'price'];
    const hasAmount = Object.keys(record).some(key => {
      const keyLower = key.toLowerCase();
      const value = record[key];
      const hasKeyword = amountKeywords.some(keyword => keyLower.includes(keyword));
      const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
      // Vérifier aussi si la valeur peut être parsée comme un nombre
      if (hasKeyword && hasValue) {
        const numValue = parseFloat(String(value).replace(/[,\s]/g, ''));
        return !isNaN(numValue);
      }
      return false;
    });
    
    // Chercher une date dans toutes les clés (insensible à la casse)
    const dateKeywords = ['date', 'jour', 'operation', 'opération', 'op', 'time', 'temps'];
    const hasDate = Object.keys(record).some(key => {
      const keyLower = key.toLowerCase();
      const value = record[key];
      return dateKeywords.some(keyword => keyLower.includes(keyword)) &&
             value !== undefined && value !== null && String(value).trim() !== '';
    });
    
    // Activer le bouton si on a trouvé au moins un montant et une date
    // Les validations détaillées seront faites dans createOperationFromPartnerRecord
    return hasAmount && hasDate;
  }

  async createOperationFromPartnerRecord(record: Record<string, string>): Promise<void> {
    try {
      if (!this.isPartnerRecordEligible(record)) {
        await this.popupService.showWarning('❌ Données insuffisantes pour créer une opération');
        return;
      }

      const rawType = this.getFromRecord(record, ['Type Opération', 'typeOperation', 'type_operation']);
      const normalized = this.normalizeType(rawType);
      const typeOperation = normalized.includes('compens') ? 'Compense_client'
                            : normalized.includes('appro') ? 'Appro_client'
                            : normalized.includes('nivel') ? 'nivellement'
                            : normalized.includes('regularis') ? 'régularisation_solde'
                            : rawType || 'ajustement';

      const { agency } = this.getPartnerOnlyAgencyAndService(record);
      const codeProprietaire = (this.getFromRecord(record, ['Agence','agency','Code propriétaire','Code proprietaire','codeProprietaire','code_proprietaire']) || agency || '').trim();
      if (!codeProprietaire) {
        await this.popupService.showWarning('Code propriétaire introuvable pour cette ligne');
        return;
      }

      // Nettoyer les séparateurs de milliers pour éviter d'obtenir 200 au lieu de 200000000
      const rawAmountStr = this.getFromRecord(record, ['Montant','montant','amount']) || String(this.getPartnerOnlyVolume(record) || '0');
      const normalizedAmount = parseFloat(String(rawAmountStr).replace(/[,\s]/g, '')) || 0;
      const montant = Math.abs(normalizedAmount);
      const rawDate = this.getFromRecord(record, ['Date opération','Date','dateOperation','date_operation','DATE']);
      const defaultDateCandidate = this.selectedPartnerImportOpDate
          || this.extractIsoDay(rawDate)
          || this.extractIsoDay(this.getPartnerOnlyDate(record))
          || this.toIsoLocalDate(new Date().toISOString());

      const dateInput = await this.popupService.showDateInput(
          'Sélectionnez la date d\'opération pour cette création Import OP.',
          'Créer OP - Date d\'opération',
          defaultDateCandidate
      );

      if (dateInput === null) {
        await this.popupService.showInfo('Création de l\'opération annulée.');
        return;
      }

      const normalizedDate = this.toIsoLocalDate(dateInput || defaultDateCandidate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        await this.popupService.showWarning('Date d\'opération invalide. Création annulée.');
        return;
      }

      this.selectedPartnerImportOpDate = normalizedDate;
      const nomBordereau = this.getFromRecord(record, ['Numéro Trans GU','Numero Trans GU','numeroTransGU','numero_trans_gu']);

      // Charger les codes propriétaires des banques
      let banqueCodes: string[] = [];
      try {
        const comptesBanque = await firstValueFrom(this.compteService.filterComptes({ categorie: ['Banque'] }));
        if (comptesBanque && comptesBanque.length > 0) {
          banqueCodes = [...new Set(comptesBanque.map(c => c.codeProprietaire).filter((cp): cp is string => cp !== undefined && cp !== null))].sort();
        }
      } catch (e) {
        console.error('Erreur lors du chargement des codes propriétaires des banques:', e);
      }
      
      // Si aucune banque trouvée, utiliser une liste vide avec "ECOBANK CM" par défaut
      if (banqueCodes.length === 0) {
        banqueCodes = ['ECOBANK CM'];
      } else {
        // Ajouter "ECOBANK CM" en première position si elle n'existe pas déjà
        if (!banqueCodes.includes('ECOBANK CM')) {
          banqueCodes.unshift('ECOBANK CM');
        }
      }
      
      // Demander la banque via autocomplétion (avec "ECOBANK CM" par défaut)
      const banqueInput = await this.popupService.showAutocompleteInput(
          'Banque (code propriétaire) :', 
          'Créer OP', 
          banqueCodes, 
          'ECOBANK CM'
      );
      const banque = (banqueInput || '').trim();
      if (!banque) {
        await this.popupService.showWarning('Banque obligatoire');
        return;
      }

      // Demander le type de référence (Standard/Cross Border/Nivellement)
      const referenceTypeInput = await this.popupService.showSelectInput(
          'Type de référence :', 
          'Sélectionner le type', 
          ['STANDARD', 'CROSS_BORDER', 'NIVELLEMENT'], 
          'STANDARD'
      );
      const referenceType = referenceTypeInput || 'STANDARD';

      // Si NIVELLEMENT est sélectionné, forcer le type d'opération à "nivellement"
      let finalTypeOperation = typeOperation;
      if (referenceType === 'NIVELLEMENT') {
        finalTypeOperation = 'nivellement';
      }

      const comptes = await firstValueFrom(this.compteService.getComptesByCodeProprietaire(codeProprietaire));
      if (!comptes || !comptes.length) {
        await this.popupService.showError(`Aucun compte trouvé pour le code propriétaire: ${codeProprietaire}`);
        return;
      }
      const compteId = comptes[0].id!;

      const payload: OperationCreateRequest = {
          compteId,
          typeOperation: finalTypeOperation,
          montant,
          banque,
          nomBordereau: nomBordereau || undefined,
          dateOperation: normalizedDate,
          referenceType: referenceType
      };

      await new Promise<void>((resolve, reject) => {
          this.operationService.createOperation(payload).subscribe({
              next: async () => { 
                  await this.popupService.showSuccess('Opération créée'); 
                  resolve(); 
              },
              error: async (err) => { 
                  console.error(err); 
                  await this.popupService.showError("Échec de création de l'opération"); 
                  reject(err); 
              }
          });
      });
    } catch (e) {
      console.error(e);
      await this.popupService.showError('Erreur lors de la création de l\'opération');
    }
  }

  private getFromRecord(record: Record<string, string>, keys: string[]): string {
    for (const k of keys) {
      const v = record[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return '';
  }

  private normalizeType(input: string): string {
    return (input || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private extractIsoDay(input: string): string {
    const s = String(input || '').trim();
    if (!s) return '';
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  }

  private toIsoLocalDate(input: string): string {
    try {
      const d = new Date(input);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch {}
    return input;
  }

  private getPartnerOnlyAgencyAndService(record: Record<string, string>): { agency: string; service: string; volume: number; date: string; country: string } {
    // Fonction helper pour trouver une valeur avec plusieurs noms de colonnes possibles
    const getValueWithFallback = (possibleKeys: string[]): string => {
      for (const key of possibleKeys) {
        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
          return record[key].toString();
        }
      }
      return '';
    };

    // Recherche d'agence avec plusieurs noms possibles
    const agency = getValueWithFallback(['Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'AGENCY']);
    
    // Recherche de service avec plusieurs noms possibles
    const service = getValueWithFallback(['Service', 'service', 'SERVICE', 'serv', 'Serv']);
    
    // Recherche de volume/montant avec plusieurs noms possibles
    const volumeStr = getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME']);
    const volume = volumeStr ? parseFloat(volumeStr.toString().replace(',', '.')) : 0;
    
    // Recherche de date avec plusieurs noms possibles
    const date = getValueWithFallback(['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'created', 'Created', 'CREATED', 'Date opération', 'dateOperation', 'date_operation']);

    // Recherche de pays (simplifiée)
    const country = getValueWithFallback(['Pays', 'pays', 'PAYS', 'country', 'Country', 'COUNTRY']) || 'Non spécifié';

    return { agency, service, volume, date, country };
  }

  async saveEcartPartnerToImpactOP(): Promise<void> {
    const sourceRecords: Record<string, string>[] =
      this.selectedPartnerOnlyKeys.length > 0
        ? this.filteredPartnerOnly.filter(r => this.selectedPartnerOnlyKeys.includes(this.getPartnerOnlyKey(r)))
        : this.filteredPartnerOnly;

    if (sourceRecords.length === 0) {
      this.popupService.showWarning('❌ Aucune ligne sélectionnée pour la sauvegarde.');
      return;
    }

    this.isSavingEcartPartnerToImpactOP = true;
    try {
      const dateInput = await this.popupService.showDateInput(
        'Sélectionnez la date d\'opération à appliquer pour les Import OP générés.',
        'Date Import OP',
        this.selectedPartnerImportOpDate || new Date().toISOString().split('T')[0]
      );

      if (dateInput === null) {
        return;
      }

      const impactOPData: ImpactOP[] = sourceRecords.map((record, index) => {
        const getOriginalKey = (correctedKey: string): string => {
          const originalKey = Object.keys(record).find(k => fixGarbledCharacters(k) === correctedKey);
          return originalKey || correctedKey;
        };

        const getValue = (keys: string[]): string => {
          for (const key of keys) {
            const originalKey = getOriginalKey(key);
            if (record[originalKey] !== undefined && record[originalKey] !== null && record[originalKey] !== '') {
              return record[originalKey].toString();
            }
            // Essayer aussi directement avec la clé
            if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
              return record[key].toString();
            }
          }
          return '';
        };

        const getNumber = (keys: string[]): number => {
          const value = getValue(keys);
          const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
          return isNaN(parsed) ? 0 : parsed;
        };

        // Récupérer les valeurs réelles des colonnes ECART Partenaire
        // Type: colonne "Type" dans les données ECART Partenaire
        const typeOperation = getValue(['Type', 'type', 'TYPE', 'Type Opération', 'typeOperation', 'type_operation']) || 'DEPOT';
        
        // Agence: colonne "Agence" dans les données ECART Partenaire
        const codeProprietaire = getValue(['Agence', 'agence', 'AGENCE', 'agency', 'Code propriétaire', 'Code proprietaire', 'codeProprietaire', 'code_proprietaire']) || 'UNKNOWN';
        
        // Pays/GRX: colonne "Pays" dans les données ECART Partenaire
        const groupeReseau = getValue(['Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'groupe de réseau', 'groupeReseau', 'groupe_reseau']) || 'DEFAULT';
        
        // Soldes: colonnes "Solde_avant" et "Solde_Après" dans les données ECART Partenaire
        const soldeAvant = getNumber(['Solde_avant', 'Solde_Avant', 'SOLDE_AVANT', 'solde_avant', 'Solde avant', 'soldeAvant']);
        const soldeApres = getNumber(['Solde_Après', 'Solde_Apres', 'SOLDE_APRES', 'solde_après', 'Solde après', 'soldeApres', 'Solde aprés']);

        return {
          id: undefined,
          typeOperation: typeOperation,
          montant: getNumber(['Montant', 'montant', 'amount']),
          soldeAvant: soldeAvant,
          soldeApres: soldeApres,
          codeProprietaire: codeProprietaire,
          dateOperation: dateInput || new Date().toISOString(),
          numeroTransGU: getValue(['Numéro Trans GU', 'numeroTransGU', 'numero_trans_gu']) || `GU-${Date.now()}-${index}`,
          groupeReseau: groupeReseau.length > 10 ? groupeReseau.substring(0, 10) : groupeReseau,
          statut: 'EN_ATTENTE',
          commentaire: `Importé depuis ECART Partenaire - ${new Date().toLocaleString('fr-FR')}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as ImpactOP;
      });

      let successCount = 0;
      let errorCount = 0;

      for (const impactOP of impactOPData) {
        try {
          await firstValueFrom(this.impactOPService.createImpactOP(impactOP));
          successCount++;
        } catch (error) {
          errorCount++;
          console.error('Erreur lors de la création de l\'Import OP:', error);
        }
      }

      if (successCount > 0) {
        this.popupService.showSuccess(`✅ ${successCount} Import OP créés avec succès !`);
      } else {
        this.popupService.showError('❌ Aucun Import OP n\'a pu être créé.');
      }
    } catch (error: any) {
      this.popupService.showError(`❌ Erreur: ${error.message || 'Erreur inconnue'}`);
    } finally {
      this.isSavingEcartPartnerToImpactOP = false;
    }
  }

  async exportResults(): Promise<void> {
    if (!this.filteredPartnerOnly || this.filteredPartnerOnly.length === 0) {
      this.popupService.showWarning('Aucun écart Partenaire à exporter');
      return;
    }

    this.isExporting = true;
    this.exportProgress = 0;
    this.exportMessage = 'Préparation de l\'export...';
    this.cdr.markForCheck();

    try {
      const totalRecords = this.filteredPartnerOnly.length;
      const isLargeDataset = totalRecords > 5000;

      // Étape 1: Collecter les colonnes
      this.exportMessage = 'Collecte des colonnes...';
      this.cdr.markForCheck();
      
      const allColumns = new Set<string>();
      const columnMap = new Map<string, string>(); // correctedKey -> originalKey

      // Collecter les colonnes sur un échantillon représentatif
      const sampleRecord = this.filteredPartnerOnly[0];
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
        const chunk = this.filteredPartnerOnly.slice(i, Math.min(i + chunkSize, totalRecords));
        
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
        this.exportMessage = `Transformation: ${Math.min(i + chunk.length, totalRecords).toLocaleString()}/${totalRecords.toLocaleString()} écarts Partenaire`;
        this.cdr.markForCheck();

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Étape 3: Exporter avec le service optimisé
      this.exportMessage = 'Génération du fichier Excel...';
      this.exportProgress = 50;
      this.cdr.markForCheck();

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const fileName = `ecart_partenaire_${timestamp}`;

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
      this.popupService.showError('Erreur lors de l\'export des écarts Partenaire');
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
