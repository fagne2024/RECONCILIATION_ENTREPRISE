import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TrxSfService, TrxSfData, TrxSfStatistics, ValidationResult } from '../../services/trx-sf.service';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { FraisTransactionService } from '../../services/frais-transaction.service';
import { FraisTransaction } from '../../models/frais-transaction.model';
import { normalizeCountryFilterOptions, countriesMatch } from '../../utils/country-codes.util';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-trx-sf',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './trx-sf.component.html',
  styleUrls: ['./trx-sf.component.scss']
})
export class TrxSfComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  trxSfData: TrxSfData[] = [];
  filteredTrxSfData: TrxSfData[] = [];
  isLoading = false;
  showAllDataTrxSf: boolean = false; // Flag pour afficher toutes les données
  
  // Upload
  selectedFile: File | null = null;
  fileType: 'full' | 'statut' | null = null; // 'full' = 8 colonnes, 'statut' = 2 colonnes
  isUploading = false;
  isChangingStatut = false;
  uploadMessage: { type: 'success' | 'error', text: string } | null = null;
  validationResult: any = null;
  // Aperçu local lors de la validation
  previewHeaders: string[] = [];
  previewRows: any[] = [];
  previewTotal: number = 0;
  fraisConfigurations: FraisTransaction[] = [];

  private readonly requiredFullHeaders: string[] = [
    'id transaction',
    'téléphone client',
    'montant',
    'service',
    'agence',
    'date transaction',
    'numéro trans gu',
    'pays'
  ];

  private formatExcelDateToIso(value: any): string {
    // Excel serial date -> JS Date: days since 1899-12-30
    if (typeof value === 'number' && !isNaN(value)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = value * 24 * 60 * 60 * 1000;
      const date = new Date(excelEpoch.getTime() + ms);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    // String dates: try to parse; if fails, return as-is
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
      }
      return value.trim();
    }
    return '';
  }

  private buildNormalizedCsv(headers: string[], rows: any[], isExcelSource: boolean): string {
    // Map incoming headers (case-insensitive) to canonical keys
    const headerMap = new Map<string, string>(); // canonical -> source header
    const lowerToOriginal = new Map<string, string>();
    headers.forEach(h => lowerToOriginal.set(h.trim().toLowerCase(), h));
    this.requiredFullHeaders.forEach(canonical => {
      const src = lowerToOriginal.get(canonical) || canonical; // fallback
      headerMap.set(canonical, src);
    });

    const csvHeaders = [
      'ID Transaction',
      'Téléphone Client',
      'Montant',
      'Service',
      'Agence',
      'Date Transaction',
      'Numéro Trans GU',
      'Pays',
      'Frais'
    ];

    const lines: string[] = [];
    lines.push(csvHeaders.join(';'));

    rows.forEach(r => {
      const values: string[] = [];
      this.requiredFullHeaders.forEach(canonical => {
        const src = headerMap.get(canonical) as string;
        let v: any = r[src] ?? r[canonical] ?? '';
        if (canonical === 'date transaction') {
          v = this.formatExcelDateToIso(v);
        }
        if (v === null || v === undefined) v = '';
        const s = String(v).replace(/\r|\n|;/g, ' ').trim();
        values.push(s);
      });
      // Calculer FRAIS selon service/agence et montant
      const service = (r[headerMap.get('service') as string] || r['service'] || '').toString();
      const agence = (r[headerMap.get('agence') as string] || r['agence'] || '').toString();
      // Parsing robuste du montant
      const montantRaw = (r[headerMap.get('montant') as string] || r['montant'] || '').toString();
      const montantClean = montantRaw.replace(/[^0-9,.-]/g, '').replace(/,(?=\d{2}$)/, '.').replace(/,/g, '');
      const montant = parseFloat(montantClean || '0') || 0;
      const fraisCalcules = this.calculateFraisForTransaction(service, agence, montant);
      values.push(fraisCalcules.toString());
      lines.push(values.join(';'));
    });

    return lines.join('\n');
  }

  private async normalizeFullFile(file: File): Promise<File> {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    if (isCsv) {
      const text: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e: any) => resolve(e.target.result as string);
        reader.onerror = () => reject(new Error('Erreur de lecture CSV'));
        reader.readAsText(file, 'UTF-8');
      });
      const lines = text.split('\n').filter(l => l.trim());
      const headerLine = lines[0] || '';
      const headers = headerLine.split(/[,;]/).map(h => h.trim());
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/[,;]/).map(v => v.trim());
        const row: any = {};
        headers.forEach((h, idx) => row[h] = values[idx] ?? '');
        rows.push(row);
      }
      // Construire un XLSX normalisé pour préserver l'ordre attendu Frais/Commentaire
      const XLSX = await import('xlsx');
      const aoa: any[] = [];
      // Entêtes dans l'ordre: 8 colonnes + Frais (index 8) + Commentaire (index 9)
      const xlsxHeaders = [
        'ID Transaction',
        'Téléphone Client',
        'Montant',
        'Service',
        'Agence',
        'Date Transaction',
        'Numéro Trans GU',
        'Pays',
        'Frais',
        'Commentaire'
      ];
      aoa.push(xlsxHeaders);
      rows.forEach(r => {
        const headerMap = new Map<string, string>();
        const lowerToOriginal = new Map<string, string>();
        headers.forEach(h => lowerToOriginal.set(h.trim().toLowerCase(), h));
        this.requiredFullHeaders.forEach(canonical => {
          const src = lowerToOriginal.get(canonical) || canonical;
          headerMap.set(canonical, src);
        });
        const get = (key: string) => r[headerMap.get(key) as string] ?? r[key] ?? '';
        const montantRaw = (get('montant') || '').toString();
        const montantClean = montantRaw.replace(/[^0-9,.-]/g, '').replace(/,(?=\d{2}$)/, '.').replace(/,/g, '');
        const montant = parseFloat(montantClean || '0') || 0;
        const frais = this.calculateFraisForTransaction(String(get('service') || ''), String(get('agence') || ''), montant);
        const row = [
          String(get('id transaction')).trim(),
          String(get('téléphone client')).trim(),
          montant,
          String(get('service')).trim(),
          String(get('agence')).trim(),
          this.formatExcelDateToIso(get('date transaction')),
          String(get('numéro trans gu')).trim(),
          String(get('pays')).trim(),
          frais,
          '' // commentaire vide
        ];
        aoa.push(row);
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, 'TRX_SF');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      return new File([wbout], `${file.name.replace(/\.[^.]+$/, '')}_normalized.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    if (isExcel) {
      const { data, XLSX }: any = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e: any) => {
          try {
            const arr = new Uint8Array(e.target.result as ArrayBuffer);
            const mod = await import('xlsx');
            resolve({ data: arr, XLSX: mod });
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Erreur de lecture Excel'));
        reader.readAsArrayBuffer(file);
      });
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rowsAoA: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const headersRow: any[] = (rowsAoA && rowsAoA.length > 0) ? rowsAoA[0] : [];
      const headersOriginal = headersRow.map((h: any) => String(h || '').trim());
      const rows: any[] = [];
      for (let r = 1; r < rowsAoA.length; r++) {
        const values = rowsAoA[r] as any[];
        const row: any = {};
        headersOriginal.forEach((h, idx) => {
          row[h] = (values && values.length > idx) ? values[idx] : '';
        });
        rows.push(row);
      }
      // Construire un XLSX normalisé pour respecter l'ordre attendu (Frais col 8, Commentaire col 9)
      const aoa: any[] = [];
      const xlsxHeaders = [
        'ID Transaction',
        'Téléphone Client',
        'Montant',
        'Service',
        'Agence',
        'Date Transaction',
        'Numéro Trans GU',
        'Pays',
        'Frais',
        'Commentaire'
      ];
      aoa.push(xlsxHeaders);
      rows.forEach(r => {
        const headerMap = new Map<string, string>();
        const lowerToOriginal = new Map<string, string>();
        headersOriginal.forEach(h => lowerToOriginal.set(String(h).trim().toLowerCase(), String(h).trim()));
        this.requiredFullHeaders.forEach(canonical => {
          const src = lowerToOriginal.get(canonical) || canonical;
          headerMap.set(canonical, src);
        });
        const get = (key: string) => r[headerMap.get(key) as string] ?? r[key] ?? '';
        const montantRaw = (get('montant') || '').toString();
        const montantClean = montantRaw.replace(/[^0-9,.-]/g, '').replace(/,(?=\d{2}$)/, '.').replace(/,/g, '');
        const montant = parseFloat(montantClean || '0') || 0;
        const frais = this.calculateFraisForTransaction(String(get('service') || ''), String(get('agence') || ''), montant);
        const row = [
          String(get('id transaction')).trim(),
          String(get('téléphone client')).trim(),
          montant,
          String(get('service')).trim(),
          String(get('agence')).trim(),
          this.formatExcelDateToIso(get('date transaction')),
          String(get('numéro trans gu')).trim(),
          String(get('pays')).trim(),
          frais,
          ''
        ];
        aoa.push(row);
      });
      const wb2 = XLSX.utils.book_new();
      const ws2 = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb2, ws2, 'TRX_SF');
      const wbout2 = XLSX.write(wb2, { bookType: 'xlsx', type: 'array' });
      return new File([wbout2], `${file.name.replace(/\.[^.]+$/, '')}_normalized.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    // Fallback: return original
    return file;
  }
  
  // Filtres
  filterForm: FormGroup;
  agences: string[] = [];
  services: string[] = [];
  pays: string[] = [];
  numeroTransGUs: string[] = [];
  statuts: string[] = ['EN_ATTENTE', 'TRAITE', 'ERREUR'];
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;
  
  // Statistiques
  totalMontant = 0;
  
  // Sélection multiple
  selectedItems: Set<number> = new Set();
  isSelectAll = false;
  isSelectionMode = false;
  selectedStatut = 'EN_ATTENTE';
  isUpdatingMultipleStatuts = false;
  
  // Vérification FRAIS
  isVerifyingFrais = false;
  
  // Gestion des doublons
  duplicates: TrxSfData[] = [];
  isLoadingDuplicates = false;
  isRemovingDuplicates = false;
  
  // Informations utilisateur
  isAdminUser = false;
  userAgency = '';
  
  // Gestion du type de fichier
  showFileTypeSelector = false;
  
  constructor(
    private trxSfService: TrxSfService,
    private fb: FormBuilder,
    private appState: AppStateService,
    private popupService: PopupService,
    private fraisService: FraisTransactionService
  ) {
    this.filterForm = this.fb.group({
      agence: [''],
      service: [''],
      pays: [''],
      numeroTransGu: [''],
      statut: [''],
      dateDebut: [''],
      dateFin: ['']
    });
  }

  ngOnInit(): void {
    this.loadTrxSfData();
    this.loadFraisConfigurations();
    
    // Écouter les changements de filtres
    this.filterForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  private loadFraisConfigurations(): void {
    this.fraisService.getAllFraisTransactionsActifs('TRX SF')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (configs) => {
          this.fraisConfigurations = configs || [];
          console.log('📋 Configurations de frais chargées:', this.fraisConfigurations.length);
        },
        error: (error) => {
          console.warn('⚠️ Impossible de charger les configurations de frais:', error);
          this.fraisConfigurations = [];
        }
      });
  }

  private calculateFraisForTransaction(service: string, agence: string, montant: number): number {
    if (!this.fraisConfigurations || this.fraisConfigurations.length === 0) {
      return 0;
    }

    const normalizeKey = (s: string) => (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    const nService = normalizeKey(service);
    const nAgence = normalizeKey(agence);

    const matchExact = this.fraisConfigurations.find(f =>
      normalizeKey(f.service) === nService &&
      normalizeKey(f.agence) === nAgence &&
      f.actif
    );

    const matchServiceOnly = this.fraisConfigurations.find(f =>
      normalizeKey(f.service) === nService && f.actif
    );

    const matchAgenceOnly = this.fraisConfigurations.find(f =>
      normalizeKey(f.agence) === nAgence && f.actif
    );

    const matchServiceContains = this.fraisConfigurations.find(f =>
      nService.includes(normalizeKey(f.service)) && f.actif
    );

    // Heuristique simple de meilleure correspondance par longueur
    const scored = this.fraisConfigurations
      .filter(f => f.actif)
      .map(f => {
        const ns = normalizeKey(f.service);
        let score = 0;
        if (nService.includes(ns)) score = ns.length;
        else if (ns.includes(nService)) score = nService.length - 1;
        return { f, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const bestServiceMatch = scored.length > 0 ? scored[0].f : undefined;

    const config = matchExact || matchServiceOnly || matchAgenceOnly || matchServiceContains || bestServiceMatch;

    if (!config) {
      return 0;
    }

    if (config.typeCalcul === 'POURCENTAGE' && config.pourcentage) {
      return Math.round((montant * (config.pourcentage / 100)) * 100) / 100;
    }
    return config.montantFrais || 0;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTrxSfData(): void {
    this.isLoading = true;
    
    // Vérifier si l'utilisateur est admin ou a une agence spécifique
    const username = this.appState.getUsername();
    const isAdmin = this.appState.isAdmin();
    
    // Mettre à jour les propriétés pour l'affichage
    this.isAdminUser = isAdmin;
    this.userAgency = username || '';
    
    // Si showAllDataTrxSf est activé, ne pas appliquer de filtre de date
    let dateDebutStr: string | undefined = undefined;
    let dateFinStr: string | undefined = undefined;
    
    if (!this.showAllDataTrxSf) {
      // Calculer les dates du mois en cours pour le chargement par défaut
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      
      // Premier jour du mois en cours à 00:00:00
      const dateDebut = new Date(year, month, 1);
      dateDebutStr = `${year}-${String(month + 1).padStart(2, '0')}-01 00:00:00`;
      
      // Dernier jour du mois en cours à 23:59:59
      const dateFin = new Date(year, month + 1, 0, 23, 59, 59);
      dateFinStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dateFin.getDate()).padStart(2, '0')} 23:59:59`;
    }
    
    if (isAdmin) {
      // Admin : charger les données (avec ou sans filtre de date selon showAllDataTrxSf)
      this.trxSfService.getTrxSfs({
        dateDebut: dateDebutStr,
        dateFin: dateFinStr
      })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.trxSfData = data;
            this.initializeFilterLists();
            this.applyFilters();
            this.isLoading = false;
          },
          error: (error) => {
            console.error('Erreur lors du chargement des données:', error);
            this.isLoading = false;
            // En cas d'erreur, on utilise des données fictives pour la démo
          this.trxSfData = this.generateMockData();
          this.initializeFilterLists();
          this.applyFilters();
        }
      });
    } else {
      // Utilisateur non-admin : utiliser l'username comme agence et filtrer par mois en cours (ou toutes les données)
      const userAgency = username;
      if (userAgency) {
        this.trxSfService.getTrxSfs({
          agence: userAgency,
          dateDebut: dateDebutStr,
          dateFin: dateFinStr
        })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (data) => {
              this.trxSfData = data;
              this.initializeFilterLists();
              this.applyFilters();
              this.isLoading = false;
            },
            error: (error) => {
              console.error(`Erreur lors du chargement des données pour l'agence ${userAgency}:`, error);
              this.isLoading = false;
              // En cas d'erreur, on utilise des données fictives pour la démo
              this.trxSfData = this.generateMockData().filter(item => item.agence === userAgency);
              this.initializeFilterLists();
              this.applyFilters();
            }
          });
      } else {
        // Pas d'agence définie, charger des données vides
        this.trxSfData = [];
        this.initializeFilterLists();
        this.applyFilters();
        this.isLoading = false;
      }
    }
  }

  private   initializeFilterLists(): void {
    this.agences = this.getUniqueAgences();
    this.services = this.getUniqueServices();
    this.pays = this.getUniquePays();
    this.numeroTransGUs = this.getUniqueNumeroTransGUs();
  }

  private generateMockData(): TrxSfData[] {
    const mockData: TrxSfData[] = [];
    const agences = ['AGENCE_A', 'AGENCE_B', 'AGENCE_C'];
    const services = ['TRANSFERT', 'PAIEMENT', 'VIREMENT', 'RETRAIT'];
    const pays = ['SENEGAL', 'MALI', 'BURKINA FASO', 'COTE D\'IVOIRE'];
    const statuts: ('EN_ATTENTE' | 'TRAITE' | 'ERREUR')[] = ['EN_ATTENTE', 'TRAITE', 'ERREUR'];
    
    for (let i = 1; i <= 50; i++) {
      mockData.push({
        idTransaction: `TRX_SF_${String(i).padStart(6, '0')}`,
        telephoneClient: `+221${Math.floor(Math.random() * 90000000) + 10000000}`,
        montant: Math.floor(Math.random() * 1000000) / 100,
        service: services[Math.floor(Math.random() * services.length)],
        agence: agences[Math.floor(Math.random() * agences.length)],
        dateTransaction: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
        numeroTransGu: `GU_${String(Math.floor(Math.random() * 1000000)).padStart(8, '0')}`,
        pays: pays[Math.floor(Math.random() * pays.length)],
        statut: statuts[Math.floor(Math.random() * statuts.length)],
        frais: Math.floor(Math.random() * 5000) / 100,
        commentaire: `Transaction SF ${i} - ${Math.random() > 0.5 ? 'Crédit' : 'Débit'}`,
        dateImport: new Date().toISOString()
      });
    }
    
    return mockData;
  }

  applyFilters(): void {
    let filtered = [...this.trxSfData];
    const filters = this.filterForm.value;
    
    if (filters.agence) {
      filtered = filtered.filter(item => item.agence === filters.agence);
    }
    
    if (filters.service) {
      filtered = filtered.filter(item => item.service === filters.service);
    }
    
    if (filters.pays) {
      filtered = filtered.filter(item => countriesMatch(item.pays, filters.pays));
    }
    
    if (filters.numeroTransGu) {
      filtered = filtered.filter(item => item.numeroTransGu === filters.numeroTransGu);
    }
    
    if (filters.statut) {
      filtered = filtered.filter(item => item.statut === filters.statut);
    }
    
    // Dates: utiliser bornes de journée pour éviter que le filtre reste sans effet
    const hasStart = !!filters.dateDebut;
    const hasEnd = !!filters.dateFin;
    const start = hasStart ? new Date(filters.dateDebut) : null;
    const end = hasEnd ? new Date(filters.dateFin) : null;
    if (start) { start.setHours(0, 0, 0, 0); }
    if (end) { end.setHours(23, 59, 59, 999); }
    
    if (start) {
      filtered = filtered.filter(item => this.safeDate(item.dateTransaction) >= start!);
    }
    if (end) {
      filtered = filtered.filter(item => this.safeDate(item.dateTransaction) <= end!);
    }
    
    this.filteredTrxSfData = filtered;
    this.calculateTotalMontant();
    this.calculateTotalPages();
    this.currentPage = 1;
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.applyFilters();
  }

  onDateChange(controlName: 'dateDebut' | 'dateFin'): void {
    const value: string = this.filterForm.get(controlName)?.value;
    if (!value) {
      this.applyFilters();
      return;
    }
    const other: 'dateDebut' | 'dateFin' = controlName === 'dateDebut' ? 'dateFin' : 'dateDebut';
    const otherVal = this.filterForm.get(other)?.value;
    if (!otherVal) {
      // Si l'autre borne est vide, la caler sur la même date pour appliquer immédiatement
      this.filterForm.patchValue({ [other]: value });
    } else {
      this.applyFilters();
    }
  }

  private safeDate(value: string): Date {
    // Gère formats: ISO, 'YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY', 'YYYY-MM-DD'
    if (!value) return new Date('1970-01-01T00:00:00');
    // ISO direct
    const iso = new Date(value);
    if (!isNaN(iso.getTime())) return iso;
    // YYYY-MM-DD HH:mm:ss
    const ymdHms = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (ymdHms) {
      const [_, y, m, d, h, mi, s] = ymdHms;
      return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(mi), Number(s));
    }
    // DD/MM/YYYY
    const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) {
      const [_, d, m, y] = dmy;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    // YYYY-MM-DD
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
      const [_, y, m, d] = ymd;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    return new Date(value);
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.uploadMessage = null;
      this.validationResult = null;
      this.fileType = null;
      this.showFileTypeSelector = false;
      
      // Détecter automatiquement le type de fichier
      this.detectFileType(file);
    }
  }
  
  private detectFileType(file: File): void {
    console.log('🔍 Détection du type de fichier:', file.name);
    
    // Pour les fichiers Excel, on ne peut pas facilement détecter le nombre de colonnes
    // sans parser le fichier. On va permettre à l'utilisateur de choisir le type.
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
    
    if (isExcel) {
      // Pour les fichiers Excel, on laisse l'utilisateur choisir
      // Par défaut, on assume que c'est un fichier complet
      this.fileType = 'full';
      console.log('✅ Fichier Excel détecté - Type par défaut: Fichier complet (8 colonnes)');
      return;
    }
    
    // Pour les fichiers CSV, on peut analyser le contenu
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const content = e.target.result;
      const lines = content.split('\n');
      
      if (lines.length > 0) {
        const firstLine = lines[0];
        const columns = firstLine.split(/[,;]/); // Détecter le séparateur
        
        console.log('🔍 Détection du type de fichier CSV:');
        console.log('   - Nombre de colonnes détectées:', columns.length);
        console.log('   - Première ligne:', firstLine);
        
        if (columns.length >= 7 && columns.length <= 9) {
          // Fichier complet (8 colonnes ± 1)
          this.fileType = 'full';
          console.log('✅ Type détecté: Fichier complet (8 colonnes)');
        } else if (columns.length >= 2 && columns.length <= 4) {
          // Fichier de statut (2 colonnes ± 2)
          this.fileType = 'statut';
          console.log('✅ Type détecté: Fichier de statut (2 colonnes)');
        } else {
          // Type indéterminé - par défaut, on assume que c'est un fichier complet
          this.fileType = 'full';
          console.log('❓ Type indéterminé, nombre de colonnes:', columns.length, '- Par défaut: Fichier complet');
        }
      }
    };
    reader.readAsText(file);
  }

  toggleFileType(): void {
    this.showFileTypeSelector = !this.showFileTypeSelector;
  }

  onFileTypeChange(type: 'full' | 'statut'): void {
    this.fileType = type;
    this.showFileTypeSelector = false;
    this.validationResult = null;
    this.uploadMessage = null;
    console.log('🔄 Type de fichier changé manuellement vers:', type);
  }

  validateFile(): void {
    if (!this.selectedFile) {
      this.uploadMessage = { type: 'error', text: I18nService.t('TSF.noFileSelected') };
      return;
    }

    // Validation côté frontend des 8 colonnes requises (full)
    if (this.fileType === 'full') {
      const required = [
        ...this.requiredFullHeaders
      ];

      const file = this.selectedFile;
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

      const onHeaders = (headersLower: string[], headersOriginal: string[], getRows: () => any[]) => {
        const missing = required.filter(h => !headersLower.includes(h));
        if (missing.length > 0) {
          this.uploadMessage = { type: 'error', text: `Colonnes manquantes: ${missing.join(', ')}` };
          this.validationResult = null;
          this.previewHeaders = [];
          this.previewRows = [];
          this.previewTotal = 0;
          return;
        }
        // Construire un aperçu local (total et 5 premières lignes)
        try {
          const allRows = getRows();
          this.previewTotal = allRows.length;
          this.previewHeaders = headersOriginal;
          this.previewRows = allRows.slice(0, 5);
        } catch (e) {
          console.warn('Aperçu local non disponible:', e);
          this.previewHeaders = headersOriginal;
          this.previewRows = [];
          this.previewTotal = 0;
        }
        // Normaliser localement et valider côté backend avec le fichier normalisé
        this.isUploading = true;
        this.uploadMessage = null;
        this.validationResult = null;
        this.normalizeFullFile(file)
          .then(normalizedFile => this.trxSfService.validateFile(normalizedFile)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (result) => {
              this.validationResult = result;
              this.isUploading = false;
            },
            error: (error) => {
              console.error('Erreur lors de la validation:', error);
              this.uploadMessage = { type: 'error', text: 'Erreur lors de la validation du fichier' };
              this.isUploading = false;
            }
          }))
          .catch(err => {
            console.error('Erreur normalisation:', err);
            this.uploadMessage = { type: 'error', text: 'Erreur lors de la normalisation du fichier' };
            this.isUploading = false;
          });
      };

      if (isCsv) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          const text = e.target.result as string;
          const lines = text.split('\n').filter(l => l.trim());
          const firstLine = lines[0] || '';
          const headers = firstLine.split(/[,;]/).map(h => h.trim());
          const headersLower = headers.map(h => h.toLowerCase());
          const getRows = () => {
            const rows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(/[,;]/).map(v => v.trim());
              if (values.length > 0) {
                const row: any = {};
                headers.forEach((h, idx) => {
                  row[h] = values[idx] ?? '';
                });
                rows.push(row);
              }
            }
            return rows;
          };
          onHeaders(headersLower, headers, getRows);
        };
        reader.onerror = () => {
          this.uploadMessage = { type: 'error', text: 'Erreur de lecture du fichier' };
        };
        reader.readAsText(file, 'UTF-8');
        return;
      }

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = async (e: any) => {
          try {
            const data = new Uint8Array(e.target.result as ArrayBuffer);
            const XLSX = await import('xlsx');
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const headersRow: any[] = (rows && rows.length > 0) ? rows[0] : [];
            const headersOriginal = headersRow.map((h: any) => String(h || '').trim());
            const headersLower = headersOriginal.map((h: any) => String(h || '').trim().toLowerCase());
            const getRows = () => {
              const dataRows: any[] = [];
              for (let r = 1; r < rows.length; r++) {
                const values = rows[r] as any[];
                const row: any = {};
                headersOriginal.forEach((h, idx) => {
                  row[h] = (values && values.length > idx) ? values[idx] : '';
                });
                dataRows.push(row);
              }
              return dataRows;
            };
            onHeaders(headersLower, headersOriginal, getRows);
          } catch (err) {
            console.error('Erreur lecture Excel:', err);
            this.uploadMessage = { type: 'error', text: 'Erreur lors de la lecture du fichier Excel' };
          }
        };
        reader.onerror = () => {
          this.uploadMessage = { type: 'error', text: 'Erreur de lecture du fichier Excel' };
        };
        reader.readAsArrayBuffer(file);
        return;
      }
    }

    // Par défaut (statut ou type indéterminé), on délègue au backend
    this.isUploading = true;
    this.uploadMessage = null;
    this.validationResult = null;
    this.trxSfService.validateFile(this.selectedFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.validationResult = result;
          this.isUploading = false;
        },
        error: (error) => {
          console.error('Erreur lors de la validation:', error);
          this.uploadMessage = { type: 'error', text: 'Erreur lors de la validation du fichier' };
          this.isUploading = false;
        }
      });
  }

  uploadFile(): void {
    if (!this.selectedFile) {
      this.uploadMessage = { type: 'error', text: I18nService.t('TSF.noFileSelected') };
      return;
    }

    this.isUploading = true;
    this.uploadMessage = null;

    const doUpload = (fileToSend: File) => {
      this.trxSfService.uploadFile(fileToSend)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            this.isUploading = false;
            this.uploadMessage = { 
              type: 'success', 
              text: I18nService.t('TSF.uploadOkCount', { count: result.count }) 
            };
            this.selectedFile = null;
            this.validationResult = null;
            this.loadTrxSfData(); // Recharger les données
          },
          error: (error) => {
            console.error('Erreur lors de l\'upload:', error);
            this.isUploading = false;
            this.uploadMessage = { type: 'error', text: I18nService.t('TSF.uploadErrorShort') };
          }
        });
    };

    if (this.fileType === 'full') {
      this.normalizeFullFile(this.selectedFile)
        .then(normalized => doUpload(normalized))
        .catch(err => {
          console.error('Erreur normalisation:', err);
          this.isUploading = false;
          this.uploadMessage = { type: 'error', text: 'Erreur lors de la normalisation du fichier' };
        });
      return;
    }

    doUpload(this.selectedFile);
  }
  
  changeStatutFile(): void {
    if (!this.selectedFile) {
      this.uploadMessage = { type: 'error', text: I18nService.t('TSF.noFileSelected') };
      return;
    }

    this.isChangingStatut = true;
    this.uploadMessage = null;
    this.validationResult = null;

    this.trxSfService.changeStatutFromFile(this.selectedFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isChangingStatut = false;
          
          let message = `${I18nService.t('TSF.statusChangeDone')} `;
          message += I18nService.t('TSF.statusChangeOkDetail2', { total: response.totalLines, processed: response.processedLines, updated: response.updatedLines });
          
          if (response.errorLines > 0) {
            message += `, Erreurs: ${response.errorLines}`;
          }
          
          this.uploadMessage = { 
            type: response.success ? 'success' : 'error', 
            text: message 
          };
          
          this.selectedFile = null;
          this.validationResult = null;
          this.loadTrxSfData(); // Recharger les données
        },
        error: (error) => {
          console.error('Erreur lors du changement de statut:', error);
          this.isChangingStatut = false;
          this.uploadMessage = { 
            type: 'error', 
            text: error.error?.error || error.error?.message || 'Erreur lors du changement de statut' 
          };
        }
      });
  }

  calculateTotalMontant(): void {
    this.totalMontant = this.filteredTrxSfData.reduce((sum, item) => sum + item.montant, 0);
  }

  calculateTotalPages(): void {
    this.totalPages = Math.ceil(this.filteredTrxSfData.length / this.itemsPerPage);
  }

  getPaginatedData(): TrxSfData[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredTrxSfData.slice(startIndex, endIndex);
  }

  getStatutCount(statut: string): number {
    return this.filteredTrxSfData.filter(item => item.statut === statut).length;
  }

  formatMontant(montant: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF'
    }).format(montant);
  }

  formatMontantTotal(): string {
    return this.formatMontant(this.totalMontant);
  }

  formatFraisTotal(): string {
    const totalFrais = this.filteredTrxSfData.reduce((sum, item) => sum + (item.frais || 0), 0);
    return this.formatMontant(totalFrais);
  }

  getStatutClass(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE': return 'statut-en-attente';
      case 'TRAITE': return 'statut-traite';
      case 'ERREUR': return 'statut-erreur';
      default: return '';
    }
  }

  getStatutLabel(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE': return I18nService.t('TBL.statutEnAttente');
      case 'TRAITE': return I18nService.t('TBL.statutTraite');
      case 'ERREUR': return I18nService.t('TBL.statutErreur');
      default: return statut || '';
    }
  }

  onPageChange(page: number): void {
    this.currentPage = page;
  }

  onItemsPerPageChange(): void {
    this.calculateTotalPages();
    this.currentPage = 1; // Retour à la première page
  }

  getStartIndex(): number {
    return (this.currentPage - 1) * this.itemsPerPage;
  }

  getEndIndex(): number {
    const endIndex = this.currentPage * this.itemsPerPage;
    return Math.min(endIndex, this.filteredTrxSfData.length);
  }

  getUniqueAgences(): string[] {
    return [...new Set(this.trxSfData.map(item => item.agence))].sort();
  }

  getUniqueServices(): string[] {
    return [...new Set(this.trxSfData.map(item => item.service))].sort();
  }

  getUniquePays(): string[] {
    return normalizeCountryFilterOptions(this.trxSfData.map(item => item.pays));
  }

  getUniqueNumeroTransGUs(): string[] {
    return [...new Set(this.trxSfData.map(item => item.numeroTransGu))].sort();
  }

  formatDate(date: string): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  formatMontantFrais(montant: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF'
    }).format(montant);
  }

  onStatutChange(item: TrxSfData, event: any): void {
    const target = event.target as HTMLSelectElement;
    const newStatut = target.value;
    
    if (newStatut && newStatut !== item.statut && item.id) {
      // Sauvegarder l'ancien statut pour pouvoir le restaurer en cas d'erreur
      const oldStatut = item.statut;
      
      // Mettre à jour immédiatement l'interface pour une meilleure UX
      item.statut = newStatut as 'EN_ATTENTE' | 'TRAITE' | 'ERREUR';

      this.trxSfService.updateStatut(item.id, newStatut)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            console.log(`Statut mis à jour avec succès: ${oldStatut} → ${newStatut}`, result);
            this.showTemporaryMessage('success', `${I18nService.t('TSF.statusUpdated')}: ${this.getStatutLabel(newStatut)}`);
          },
          error: (error) => {
            console.error('Erreur lors de la mise à jour du statut:', error);
            
            // Restaurer l'ancien statut en cas d'erreur
            item.statut = oldStatut;
            target.value = oldStatut || 'EN_ATTENTE';
            
            this.showTemporaryMessage('error', I18nService.t('TSF.statusUpdateErrorShort'));
          }
        });
    }
  }

  deleteTrxSf(id: number): void {
    if (confirm(I18nService.t('TSF.confirmDelete'))) {
      this.trxSfService.deleteTrxSf(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.trxSfData = this.trxSfData.filter(item => item.id !== id);
            this.applyFilters();
            console.log('Transaction supprimée avec succès');
          },
          error: (error) => {
            console.error('Erreur lors de la suppression:', error);
          }
        });
    }
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(this.totalPages, start + maxVisible - 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  async exportTrxSfData(): Promise<void> {
    if (this.filteredTrxSfData.length === 0) {
      this.showTemporaryMessage('error', I18nService.t('MSG.noDataToExport'));
      return;
    }

    try {
      // Demander le nom du fichier à l'utilisateur
      const fileName = await this.promptFileName();
      if (!fileName) {
        console.log('Export annulé par l\'utilisateur');
        return;
      }

      // Importer ExcelJS dynamiquement
      const ExcelJS = (await import('exceljs')).Workbook;
      const workbook = new ExcelJS();
      const worksheet = workbook.addWorksheet(I18nService.t('EXPORT.sheetSfTransactions'));

      // Définir les colonnes
      worksheet.columns = [
        { header: I18nService.t('TBL.transactionId'), key: 'idTransaction', width: 20 },
        { header: I18nService.t('TBL.customerPhone'), key: 'telephoneClient', width: 15 },
        { header: I18nService.t('TBL.amount'), key: 'montant', width: 15, style: { numFmt: '#,##0.00' } },
        { header: I18nService.t('TBL.service'), key: 'service', width: 20 },
        { header: I18nService.t('TBL.agency'), key: 'agence', width: 15 },
        { header: I18nService.t('TBL.date'), key: 'dateTransaction', width: 20 },
        { header: I18nService.t('TBL.guTransactionNumber'), key: 'numeroTransGu', width: 20 },
        { header: I18nService.t('TBL.country'), key: 'pays', width: 10 },
        { header: I18nService.t('TBL.status'), key: 'statut', width: 15 },
        { header: I18nService.t('TBL.fees'), key: 'frais', width: 15, style: { numFmt: '#,##0.00' } },
        { header: I18nService.t('TBL.comment'), key: 'commentaire', width: 30 },
        { header: I18nService.t('TBL.importDate'), key: 'dateImport', width: 20 }
      ];

      // Style de l'en-tête
      worksheet.getRow(1).eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1976D2' }
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Ajouter les données
      this.filteredTrxSfData.forEach((item, idx) => {
        const excelRow = worksheet.addRow({
          idTransaction: item.idTransaction,
          telephoneClient: item.telephoneClient,
          montant: item.montant,
          service: item.service,
          agence: item.agence,
          dateTransaction: this.formatDate(item.dateTransaction),
          numeroTransGu: item.numeroTransGu,
          pays: item.pays,
          statut: item.statut,
          frais: item.frais,
          commentaire: item.commentaire,
          dateImport: this.formatDate(item.dateImport)
        });

        // Appliquer des couleurs selon le statut
        const statutCell = excelRow.getCell('statut');
        switch (item.statut) {
          case 'EN_ATTENTE':
            statutCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
            statutCell.font = { color: { argb: 'FF000000' }, bold: true };
            break;
          case 'TRAITE':
            statutCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
            statutCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            break;
          case 'ERREUR':
            statutCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF44336' } };
            statutCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            break;
        }
      });

      // Ajouter un résumé en bas
      const summaryRow = worksheet.addRow([]);
      const summaryRow2 = worksheet.addRow([I18nService.t('TSF.reportSummary'), '', '', '', '', '', '', '', '', '', '', '']);
      summaryRow2.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        cell.font = { bold: true };
      });

      const totalMontant = this.filteredTrxSfData.reduce((sum, item) => sum + (item.montant || 0), 0);
      const totalFrais = this.filteredTrxSfData.reduce((sum, item) => sum + (item.frais || 0), 0);
      const enAttente = this.filteredTrxSfData.filter(item => item.statut === 'EN_ATTENTE').length;
      const traite = this.filteredTrxSfData.filter(item => item.statut === 'TRAITE').length;
      const erreur = this.filteredTrxSfData.filter(item => item.statut === 'ERREUR').length;

      worksheet.addRow([I18nService.t('TSF.summaryTotalAmount'), '', totalMontant.toFixed(2), '', '', '', '', '', '', '', '', '']);
      worksheet.addRow([I18nService.t('TSF.summaryTotalFees'), '', '', '', '', '', '', '', '', totalFrais.toFixed(2), '', '']);
      worksheet.addRow([I18nService.t('TSF.summaryPending'), '', '', '', '', '', '', '', enAttente, '', '', '']);
      worksheet.addRow([I18nService.t('TSF.summaryProcessed'), '', '', '', '', '', '', '', traite, '', '', '']);
      worksheet.addRow([I18nService.t('TSF.summaryError'), '', '', '', '', '', '', '', erreur, '', '', '']);
      worksheet.addRow([I18nService.t('TSF.summaryTotalTransactions'), '', '', '', '', '', '', '', this.filteredTrxSfData.length, '', '', '']);

      // Générer et télécharger le fichier
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      this.showTemporaryMessage('success', I18nService.t('EXPORT.successTransactions', { count: this.filteredTrxSfData.length }));

    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      this.showTemporaryMessage('error', I18nService.t('TSF.exportErrorShort'));
    }
  }

  async exportNumeroTransGuOnly(): Promise<void> {
    if (this.filteredTrxSfData.length === 0) {
      this.showTemporaryMessage('error', I18nService.t('MSG.noDataToExport'));
      return;
    }

    try {
      const fileName = await this.promptFileName();
      if (!fileName) {
        return;
      }

      const ExcelJS = (await import('exceljs')).Workbook;
      const workbook = new ExcelJS();
      const worksheet = workbook.addWorksheet(I18nService.t('EXPORT.sheetTransGuNumbers'));

      worksheet.columns = [
        { header: I18nService.t('TBL.guTransactionNumber'), key: 'numeroTransGu', width: 25 }
      ];

      worksheet.getRow(1).eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1976D2' }
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      this.filteredTrxSfData.forEach(item => {
        worksheet.addRow({ numeroTransGu: item.numeroTransGu || '' });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}_NUMERO_TRANS_GU.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      this.showTemporaryMessage('success', I18nService.t('EXPORT.successNumbers', { count: this.filteredTrxSfData.length }));
    } catch (error) {
      console.error('Erreur lors de l\'export Numéro Trans GU:', error);
      this.showTemporaryMessage('error', I18nService.t('TSF.exportTransGuErrorShort'));
    }
  }

  private async promptFileName(): Promise<string | null> {
    return new Promise((resolve) => {
      const fileName = prompt(I18nService.t('TSF.exportFileNamePrompt'), 
        `TRX_SF_${new Date().toISOString().split('T')[0]}`);
      resolve(fileName);
    });
  }

  refreshData(): void {
    this.loadTrxSfData();
  }
  
  toggleShowAllDataTrxSf(): void {
    this.showAllDataTrxSf = !this.showAllDataTrxSf;
    this.loadTrxSfData();
  }

  // Téléchargement des modèles de fichiers (CSV)
  downloadTemplate(type: 'full' | 'statut'): void {
    const separator = ';';
    let headers: string[] = [];
    let fileName = '';

    if (type === 'full') {
      headers = [
        'ID Transaction',
        'Téléphone Client',
        'Montant',
        'Service',
        'Agence',
        'Date Transaction',
        'Numéro Trans GU',
        'Pays',
        'Frais'
      ];
      fileName = 'MODELE_TRX_SF_COMPLET.csv';
    } else {
      headers = [
        'Agence',
        'Numéro Trans GU'
      ];
      fileName = 'MODELE_TRX_SF_STATUT.csv';
    }

    const content = headers.join(separator) + '\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // Méthodes pour la sélection multiple
  toggleSelectionMode(): void {
    this.isSelectionMode = !this.isSelectionMode;
    if (!this.isSelectionMode) {
      this.clearSelection();
    }
  }

  toggleSelectAll(): void {
    if (this.isSelectAll) {
      this.clearSelection();
    } else {
      this.selectAll();
    }
  }

  selectAll(): void {
    this.selectedItems.clear();
    // Sélectionner TOUTES les lignes filtrées, pas seulement celles de la page courante
    this.filteredTrxSfData.forEach(item => {
      if (item.id) {
        this.selectedItems.add(item.id);
      }
    });
    this.isSelectAll = true;
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.isSelectAll = false;
  }

  toggleItemSelection(item: TrxSfData): void {
    if (item.id) {
      if (this.selectedItems.has(item.id)) {
        this.selectedItems.delete(item.id);
      } else {
        this.selectedItems.add(item.id);
      }
      this.updateSelectAllState();
    }
  }

  updateSelectAllState(): void {
    // Vérifier si TOUTES les lignes filtrées sont sélectionnées, pas seulement la page courante
    const allFilteredItems = this.filteredTrxSfData;
    const selectedCount = allFilteredItems.filter(item => item.id && this.selectedItems.has(item.id)).length;
    this.isSelectAll = selectedCount === allFilteredItems.length && allFilteredItems.length > 0;
  }

  getSelectedCount(): number {
    return this.selectedItems.size;
  }

  isItemSelected(item: TrxSfData): boolean {
    return item.id ? this.selectedItems.has(item.id) : false;
  }

  updateMultipleStatuts(): void {
    if (this.selectedItems.size === 0) {
      this.popupService.showWarning(I18nService.t('TSF.selectToUpdate'), I18nService.t('TSF.selectionRequired'));
      return;
    }

    this.isUpdatingMultipleStatuts = true;
    const selectedIds = Array.from(this.selectedItems);
    
    // Créer les promesses pour mettre à jour chaque transaction
    const updatePromises = selectedIds.map(id => 
      this.trxSfService.updateStatut(id, this.selectedStatut).toPromise()
    );

    Promise.all(updatePromises)
      .then(() => {
        console.log(`${selectedIds.length} transactions mises à jour avec le statut ${this.selectedStatut}`);
        this.clearSelection();
        this.loadTrxSfData(); // Recharger les données
        this.isUpdatingMultipleStatuts = false;
      })
      .catch(error => {
        console.error('Erreur lors de la mise à jour multiple:', error);
        this.isUpdatingMultipleStatuts = false;
        this.popupService.showError(I18nService.t('TSF.bulkUpdateErrorTitle'), I18nService.t('MSG.updateErrorTitle'));
      });
  }

  // Méthodes pour la gestion des doublons
  loadDuplicates(): void {
    this.isLoadingDuplicates = true;
    
    this.trxSfService.getDuplicates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (duplicates) => {
          this.duplicates = duplicates;
          this.isLoadingDuplicates = false;
          console.log(`🔍 ${duplicates.length} doublon(s) trouvé(s)`);
        },
        error: (error) => {
          console.error('Erreur lors de la recherche des doublons:', error);
          this.isLoadingDuplicates = false;
          this.popupService.showError(I18nService.t('TSF.duplicatesSearchErrorTitle'), I18nService.t('TSF.readErrorTitle'));
        }
      });
  }

  async removeDuplicates(): Promise<void> {
    if (this.duplicates.length === 0) {
      this.popupService.showInfo(I18nService.t('TSF.noDuplicate'), I18nService.t('TSF.noDuplicate'));
      return;
    }

    const confirmed = await this.popupService.showConfirm(
      I18nService.t('TSF.confirmBulkDelete', { count: this.duplicates.length }),
      I18nService.t('TSF.confirmDeleteTitle')
    );
    if (!confirmed) {
      return;
    }

    this.isRemovingDuplicates = true;
    
    this.trxSfService.removeDuplicates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isRemovingDuplicates = false;
          this.duplicates = [];
          console.log(`✅ ${response.removedCount} doublon(s) supprimé(s)`);
          this.popupService.showSuccess(I18nService.t('TSF.duplicatesDeletedOk', { count: response.removedCount }), I18nService.t('TSF.deleteOkTitle'));
          this.loadTrxSfData(); // Recharger les données
        },
        error: (error) => {
          console.error('Erreur lors de la suppression des doublons:', error);
          this.isRemovingDuplicates = false;
          this.popupService.showError(I18nService.t('TSF.bulkDeleteErrorTitle'), I18nService.t('TSF.readErrorTitle'));
        }
      });
  }

  // Méthode helper pour afficher des messages temporaires
  private showTemporaryMessage(type: 'success' | 'error', message: string) {
    // Créer un élément de message temporaire
    const messageElement = document.createElement('div');
    messageElement.className = `temp-message ${type}`;
    messageElement.textContent = message;
    messageElement.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 15px;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      z-index: var(--z-nav);
      ${type === 'success' ? 'background-color: #28a745;' : 'background-color: #dc3545;'}
    `;
    
    document.body.appendChild(messageElement);
    
    // Supprimer le message après 3 secondes
    setTimeout(() => {
      if (document.body.contains(messageElement)) {
        document.body.removeChild(messageElement);
      }
    }, 3000);
  }

  verifierFrais(): void {
    // Créer un input file invisible pour sélectionner le fichier
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx,.xls';
    fileInput.style.display = 'none';
    
    fileInput.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        this.traiterFichierFrais(file);
      }
    };
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }

  private traiterFichierFrais(file: File): void {
    if (this.filteredTrxSfData.length === 0) {
      this.popupService.showError(I18nService.t('TSF.noTrxLoaded'), I18nService.t('TSF.noDataTitle'));
      return;
    }

    this.isVerifyingFrais = true;

    try {
      console.log('🔄 Début du traitement du fichier de vérification FRAIS...', file.name);

      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

      if (isCsv) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          try {
            const donneesFichier: any[] = [];
            const csvText = e.target.result;
            const lignes = csvText.split('\n').filter((ligne: string) => ligne.trim());

            if (lignes.length < 2) {
              throw new Error(I18nService.t('TSF.csvHeaderRequired'));
            }

            const entetes = lignes[0].split(';').map((h: string) => h.trim().toLowerCase());
            console.log('📋 En-têtes CSV détectés:', entetes);

            const colonneRequises = ['type operation', 'code proprietaire', 'numero trans gu'];
            const colonnesManquantes = colonneRequises.filter(col => !entetes.includes(col));
            if (colonnesManquantes.length > 0) {
              throw new Error(`Colonnes manquantes dans le fichier: ${colonnesManquantes.join(', ')}\nColonnes attendues: ${colonneRequises.join(', ')}`);
            }

            for (let i = 1; i < lignes.length; i++) {
              const valeurs = lignes[i].split(';').map((v: string) => v.trim());
              if (valeurs.length >= entetes.length) {
                const ligne: any = {};
                entetes.forEach((entete: string, index: number) => {
                  ligne[entete] = valeurs[index] || '';
                });
                donneesFichier.push(ligne);
              }
            }

            console.log(`📊 ${donneesFichier.length} lignes trouvées dans le fichier`);
            this.verifierEtMettreAJourStatuts(donneesFichier);
          } catch (error) {
            console.error('❌ Erreur lors du parsing du CSV:', error);
            this.popupService.showError(`❌ Erreur lors du traitement du fichier:\n${error}`, 'Erreur de Traitement');
            this.isVerifyingFrais = false;
          }
        };
        reader.onerror = () => {
          this.popupService.showError('❌ Erreur lors de la lecture du fichier', 'Erreur de Lecture');
          this.isVerifyingFrais = false;
        };
        reader.readAsText(file, 'UTF-8');
        return;
      }

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = async (e: any) => {
          try {
            const data = new Uint8Array(e.target.result as ArrayBuffer);
            const XLSX = await import('xlsx');
            const wb = XLSX.read(data, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            const sheet = wb.Sheets[sheetName];

            // Convertir en JSON en conservant la première ligne comme en-têtes
            const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (!rows || rows.length === 0) {
              throw new Error('La feuille Excel est vide');
            }

            // Normaliser les clés en minuscules
            const donneesFichier = rows.map(row => {
              const normalized: any = {};
              Object.keys(row).forEach(k => {
                normalized[String(k).trim().toLowerCase()] = row[k];
              });
              return normalized;
            });

            const entetes = Object.keys(donneesFichier[0]);
            console.log('📋 En-têtes Excel détectés:', entetes);

            const colonneRequises = ['type operation', 'code proprietaire', 'numero trans gu'];
            const colonnesManquantes = colonneRequises.filter(col => !entetes.includes(col));
            if (colonnesManquantes.length > 0) {
              throw new Error(`Colonnes manquantes dans le fichier: ${colonnesManquantes.join(', ')}\nColonnes attendues: ${colonneRequises.join(', ')}`);
            }

            console.log(`📊 ${donneesFichier.length} lignes trouvées dans le fichier`);
            this.verifierEtMettreAJourStatuts(donneesFichier);
          } catch (error) {
            console.error('❌ Erreur lors du parsing de l\'Excel:', error);
            this.popupService.showError(`❌ Erreur lors du traitement du fichier:\n${error}`, 'Erreur de Traitement');
            this.isVerifyingFrais = false;
          }
        };
        reader.onerror = () => {
          this.popupService.showError('❌ Erreur lors de la lecture du fichier Excel', 'Erreur de Lecture');
          this.isVerifyingFrais = false;
        };
        reader.readAsArrayBuffer(file);
        return;
      }

      this.popupService.showError(I18nService.t('TSF.formatNotSupportedMsg'), I18nService.t('TSF.formatNotSupported'));
      this.isVerifyingFrais = false;
    } catch (error) {
      console.error('❌ Erreur lors du traitement du fichier:', error);
      this.popupService.showError(I18nService.t('TSF.fileProcessingErrorMsg', { error }), I18nService.t('TSF.processingErrorTitle'));
      this.isVerifyingFrais = false;
    }
  }

  private verifierEtMettreAJourStatuts(donneesFichier: any[]): void {
    try {
      console.log('🔄 Début de la vérification et mise à jour des statuts...');

      let transactionsTrouvees = 0;
      let transactionsNonTrouvees = 0;
      let transactionsMisesAJour = 0;
      let transactionsErreur = 0;
      const detailsNonTrouvees: string[] = [];
      const detailsErreurs: string[] = [];

      // Créer un index des transactions TRX SF par numeroTransGu
      const indexTrxSf = new Map<string, TrxSfData>();
      this.filteredTrxSfData.forEach(trx => {
        if (trx.numeroTransGu) {
          indexTrxSf.set(trx.numeroTransGu.trim().toLowerCase(), trx);
        }
      });

      console.log(`📋 Index créé avec ${indexTrxSf.size} transactions TRX SF`);

      // Vérifier chaque ligne du fichier
      donneesFichier.forEach((ligne, index) => {
        const numeroTransGu = ligne['numero trans gu']?.trim();
        const typeOperation = ligne['type operation']?.trim();
        const codeProprietaire = ligne['code proprietaire']?.trim();

        console.log(`🔍 [${index + 1}] Recherche: ${numeroTransGu} | Type: ${typeOperation} | Code: ${codeProprietaire}`);

        if (!numeroTransGu) {
          console.warn(`⚠️ [${index + 1}] Numero Trans GU manquant`);
          return;
        }

        // Chercher la transaction correspondante
        const transactionTrxSf = indexTrxSf.get(numeroTransGu.toLowerCase());

        if (transactionTrxSf) {
          transactionsTrouvees++;
          console.log(`✅ [${index + 1}] Transaction trouvée: ID ${transactionTrxSf.id}`);

          // Mettre à jour le statut à TRAITE
          if (transactionTrxSf.statut !== 'TRAITE') {
            try {
              // Mise à jour via le service
              this.trxSfService.updateStatut(transactionTrxSf.id!, 'TRAITE')
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                  next: (result) => {
                    transactionTrxSf.statut = 'TRAITE';
                    transactionsMisesAJour++;
                    console.log(`✅ Statut mis à jour pour ID ${transactionTrxSf.id}: ${result?.statut || 'TRAITE'}`);
                  },
                  error: (error) => {
                    transactionsErreur++;
                    const msgErreur = `ID ${transactionTrxSf.id}: ${error.message || 'Erreur inconnue'}`;
                    detailsErreurs.push(msgErreur);
                    console.error(`❌ Erreur mise à jour ID ${transactionTrxSf.id}:`, error);
                  }
                });
            } catch (error) {
              transactionsErreur++;
              const msgErreur = `ID ${transactionTrxSf.id}: ${error}`;
              detailsErreurs.push(msgErreur);
              console.error(`❌ Erreur lors de la mise à jour ID ${transactionTrxSf.id}:`, error);
            }
          } else {
            console.log(`ℹ️ [${index + 1}] Transaction déjà TRAITE: ID ${transactionTrxSf.id}`);
          }
        } else {
          transactionsNonTrouvees++;
          const detail = `${numeroTransGu} | ${typeOperation} | ${codeProprietaire}`;
          detailsNonTrouvees.push(detail);
          console.warn(`❌ [${index + 1}] Transaction NON trouvée: ${detail}`);
        }
      });

      // Attendre un peu pour les mises à jour asynchrones
      setTimeout(() => {
        // Générer le rapport
        let rapport = I18nService.t('TSF.reportTitleText');
        rapport += I18nService.t('TSF.reportFileProcessed', { count: donneesFichier.length });
        rapport += I18nService.t('TSF.reportFound', { count: transactionsTrouvees });
        rapport += I18nService.t('TSF.reportNotFoundCount', { count: transactionsNonTrouvees });
        rapport += I18nService.t('TSF.reportUpdated', { count: transactionsMisesAJour });
        rapport += I18nService.t('TSF.reportErrors', { count: transactionsErreur });

        if (detailsNonTrouvees.length > 0) {
          rapport += I18nService.t('TSF.reportNotFound');
          detailsNonTrouvees.slice(0, 10).forEach((detail, i) => {
            rapport += `${i + 1}. ${detail}\n`;
          });
          if (detailsNonTrouvees.length > 10) {
            rapport += `... et ${detailsNonTrouvees.length - 10} autre(s)\n`;
          }
          rapport += `\n`;
        }

        if (detailsErreurs.length > 0) {
          rapport += I18nService.t('TSF.reportUpdateErrors');
          detailsErreurs.slice(0, 5).forEach((erreur, i) => {
            rapport += `${i + 1}. ${erreur}\n`;
          });
          if (detailsErreurs.length > 5) {
            rapport += `... et ${detailsErreurs.length - 5} autre(s)\n`;
          }
        }

        this.popupService.showInfo(rapport, I18nService.t('TSF.verifyReportTitle'));

        // Log complet dans la console
        console.log('📊 Rapport complet:', {
          fichierLignes: donneesFichier.length,
          transactionsTrouvees,
          transactionsNonTrouvees,
          transactionsMisesAJour,
          transactionsErreur,
          detailsNonTrouvees,
          detailsErreurs
        });

        this.showTemporaryMessage('success', I18nService.t('TSF.verifyDone', { count: transactionsMisesAJour }));
        
        // Recharger les données pour refléter les changements
        this.loadTrxSfData();
        
        this.isVerifyingFrais = false;
      }, 2000); // Attendre 2 secondes pour les mises à jour asynchrones

    } catch (error) {
      console.error('❌ Erreur lors de la vérification:', error);
      this.popupService.showError(I18nService.t('TSF.verifyErrorMsg', { error }), I18nService.t('TSF.verifyErrorTitle'));
      this.isVerifyingFrais = false;
    }
  }
}
