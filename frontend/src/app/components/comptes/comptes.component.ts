import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Subscription, timer, from, EMPTY } from 'rxjs';
import { delay, retryWhen, scan, concatMap, tap, catchError, finalize } from 'rxjs/operators';
import * as Papa from 'papaparse';
import { CompteService } from '../../services/compte.service';
import { Compte, CompteFilter } from '../../models/compte.model';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OperationService } from '../../services/operation.service';
import { Operation } from '../../models/operation.model';
import * as XLSX from 'xlsx';
import { MatSelect } from '@angular/material/select';
import { Router, ActivatedRoute } from '@angular/router';
import { EcartSoldeService } from '../../services/ecart-solde.service';
import { ImpactOPService } from '../../services/impact-op.service';
import { TrxSfService } from '../../services/trx-sf.service';
import { DashboardService } from '../../services/dashboard.service';
import { StatisticsService, Statistics } from '../../services/statistics.service';
import { AgencySummaryService } from '../../services/agency-summary.service';
import { FraisTransactionService } from '../../services/frais-transaction.service';
import { FraisTransaction } from '../../models/frais-transaction.model';
import { PopupService } from '../../services/popup.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { normalizeCountryFilterOptions, matchesCountryFilter, countriesMatch } from '../../utils/country-codes.util';

type DailySolde = {
    date: string;
    opening: number;
    closing: number;
    closingBo?: number;
    closingManual?: number;
};

/** Ligne affichée dans le tableau des soldes (journalier, hebdo ou mensuel) */
export type ReleveSoldeDisplayRow = {
    periodLabel: string;
    opening: number;
    closing: number;
    closingBo?: number;
    closingManual?: number;
    /** Référence au solde journalier pour écart / impact OP (dernier jour de la période en vue sem/mois) */
    ecartRef: DailySolde;
};

@Component({
    selector: 'app-comptes',
    templateUrl: './comptes.component.html',
    styleUrls: ['./comptes.component.scss']
})
export class ComptesComponent implements OnInit, OnDestroy {
    comptes: Compte[] = [];
    // Source immuable pour les filtres (liste complète non filtrée)
    allComptes: Compte[] = [];
    pagedComptes: Compte[] = [];
    currentPage = 1;
    pageSize = 5;
    totalPages = 1;
    isLoading = false;
    isAdding = false;
    isEditing = false;
    isExporting = false;
    showAddForm = false;
    showEditForm = false;
    editingCompte: Compte | null = null;

    addForm: FormGroup;
    editForm: FormGroup;
    filterForm: FormGroup;

    // Statistiques
    totalComptes = 0;
    totalSolde = 0;
    soldeMoyen = 0;
    soldeMax = 0;
    soldeMin = 0;
    paysUniques = 0;
    
    // Comptes avec soldes max et min
    compteSoldeMax: Compte | null = null;
    compteSoldeMin: Compte | null = null;

    // Listes pour les filtres dynamiques
    paysList: string[] = [];
    /** Suggestions pays pour les modaux ajout / édition (saisie libre hors liste autorisée) */
    filteredPaysAdd: string[] = [];
    filteredPaysEdit: string[] = [];
    codeProprietaireList: string[] = [];

    comptesCritiques: { compte: Compte, moyenneVolume: number }[] = [];
    operations: Operation[] = [];

    // Propriétés pour le relevé de compte
    showReleveModal = false;
    selectedCompte: Compte | null = null;
    releveOperations: Operation[] = [];
    isLoadingReleve = false;
    releveDateDebut = '';
    releveTypeOperation = '';
    releveDateDebutCustom = '';
    releveDateFinCustom = '';
    showAllDataReleve: boolean = false; // Flag pour afficher toutes les données du relevé
    showSoldesSeulement = false; // Pour basculer la vue
    /** Vue des soldes : journalier, par semaine ou par mois */
    releveSoldeViewMode: 'day' | 'week' | 'month' = 'day';
    /** Vue de l'historique des opérations : journalier, par semaine ou par mois */
    releveOperationsViewMode: 'day' | 'week' | 'month' = 'day';
    releveSoldesJournaliers: DailySolde[] = [];
    private groupedReleveOperationsCache: Array<{ main: Operation; frais: Operation[] }> = [];
    private flattenedReleveOperationsCache: Operation[] = [];
    
    // Propriété pour contrôler l'affichage automatique des frais
    showFraisAutomaticallyReleve: boolean = false;
    // Panneau de résumé/calculs du relevé (masqué par défaut)
    showReleveSummary: boolean = false;
    
    // Pagination pour le relevé
    releveCurrentPage = 1;
    relevePageSize = 10;
    releveTotalPages = 1;
    
    // Math pour les calculs dans le template
    Math = Math;

    private subscription = new Subscription();

    volumeJournalier: number = 10000; // Valeur par défaut, modifiable via l'interface
    periodeJours: number = 30; // Valeur par défaut : Mois

    // Pagination pour les cards de soldes critiques
    criticalPage: number = 1;
    criticalPageSize: number = 3; // Nombre de cards visibles à la fois

    // Liste déroulante pour la période
    periodeOptions = [
        { label: "Aujourd'hui", value: 1 },
        { label: "Semaine", value: 7 },
        { label: "Mois", value: 30 }
    ];

    operationTypes: string[] = [
        'total_cashin',
        'total_paiement',
        'Appro_client',
        'ajustement',
        'Compense_client',
        'FRAIS_TRANSACTION',
        'transaction_cree',
        'annulation_bo'
    ];

    selectedPays: string[] = [];
    paysSearch: string = '';
    filteredPaysList: string[] = [];
    selectedCodesProprietaire: string[] = [];
    codeProprietaireSearch: string = '';
    filteredCodeProprietaireList: string[] = [];
    selectedCategories: string[] = [];
    categorieSearch: string = '';
    filteredCategorieList: string[] = [];
    selectedTypes: string[] = [];
    typeSearch: string = '';
    filteredTypeList: string[] = [];
    paysSearchCtrl = new FormControl('');
    codeProprietaireSearchCtrl = new FormControl('');
    categorieSearchCtrl = new FormControl('');
    typeSearchCtrl = new FormControl('');

    // Liste des types de compte
    compteTypes: string[] = ['TOP20', 'B2B', 'G&I'];
    
    // Liste des catégories de compte
    compteCategories: string[] = ['Client', 'Service', 'Banque', 'Comptable'];
    
    // Méthode pour obtenir la classe CSS de la catégorie
    getCategorieClass(categorie: string | undefined): string {
        if (!categorie) return 'categorie-default';
        
        switch (categorie.toLowerCase()) {
            case 'client':
                return 'categorie-client';
            case 'service':
                return 'categorie-service';
            case 'banque':
                return 'categorie-banque';
            case 'comptable':
                return 'categorie-comptable';
            default:
                return 'categorie-default';
        }
    }

    @ViewChild('paysSelect') paysSelect!: MatSelect;
    @ViewChild('codeProprietaireSelect') codeProprietaireSelect!: MatSelect;
    @ViewChild('categorieSelect') categorieSelect!: MatSelect;
    @ViewChild('typeSelect') typeSelect!: MatSelect;

    selectedCompteForBo: Compte | null = null;
    showSoldeBoModal = false;
    dernierSoldeBo: number | null = null;
    dateSoldeBo: string = '';
    /** Import masse des soldes BO depuis le modèle CSV / Excel */
    isImportingSoldeBoBulk = false;

    showClosingOverrideModal = false;
    closingOverrideDate: string = '';
    closingOverrideValue: number | null = null;
    closingOverrideLoading = false;

    // Correction manuelle du solde de clôture
    showSoldeClotureModal = false;
    soldeClotureDateSelection = '';
    soldeClotureValeurAuto: number | null = null;
    soldeClotureValeurManuelle: number | null = null;

    // Propriétés pour les onglets du relevé
    activeTab = 'operations'; // 'operations' ou 'ecart-solde'
    showEcartSoldeTab = false;
    ecartSoldeAgence = '';
    ecartSoldeDateTransaction = '';

    // Cache pour les sommes des impacts OP par date
    impactOPSums: { [date: string]: number } = {};

    // Propriétés pour l'onglet Impact OP
    showImpactOPTab = false;
    impactOPAgence = '';
    impactOPDateTransaction = '';

    // Propriétés pour l'onglet Revenu Journalier
    showRevenuJournalierTab = false;
    revenuJournalierData: { date: string; totalCashin: number; totalPaiement: number; fraisCashin: number; fraisPaiement: number; revenuTotal: number; ecartFrais: number }[] = [];
    isLoadingRevenuJournalier = false;

    // Propriétés pour l'onglet Control Revenu
    showControlRevenuTab = true;
    controlRevenuData: { date: string; service: string; typeControle: string; revenuAttendu: number; revenuReel: number; ecart: number; statut: string; volume: number; nombreTrx: number; totalFraisTrxSf?: number }[] = [];
    
    // Propriétés pour le modal de détails
    showControlRevenuModal = false;
    selectedControlRevenu: any = null;
    
    // Propriétés pour la visualisation par date
    showDateViewModal = false;
    selectedDate = '';
    dateViewData: any[] = [];
    isLoadingDateView = false;
    isLoadingControlRevenu = false;

    // Propriétés pour l'onglet Écart Frais (TRX SF par date/agence)
    showEcartFraisTab = false;
    ecartFraisDate: string = '';
    ecartFraisAgence: string = '';
    ecartFraisItems: import('../../services/trx-sf.service').TrxSfData[] = [];
    isLoadingEcartFrais = false;
    // Pagination Écart Frais
    ecartFraisCurrentPage = 1;
    ecartFraisPageSize = 10;
    ecartFraisTotalPages = 1;
    
    // Nouvelles propriétés pour l'amélioration UX
    ecartFraisSearchTerm = '';
    ecartFraisStatusFilter = '';
    ecartFraisServiceFilter = '';
    ecartFraisSortField = '';
    ecartFraisSortDirection: 'asc' | 'desc' = 'asc';
    ecartFraisJumpToPage = 1;
    ecartFraisFilteredItems: import('../../services/trx-sf.service').TrxSfData[] = [];
    
    // Pagination pour le revenu journalier
    revenuJournalierCurrentPage = 1;
    revenuJournalierPageSize = 10;
    revenuJournalierTotalPages = 1;

    // Filtres pour le revenu journalier
    revenuJournalierDateDebut = '';
    revenuJournalierDateFin = '';
    revenuJournalierMontantMin: number | null = null;
    revenuJournalierMontantMax: number | null = null;
    revenuJournalierTypeRevenu = ''; // 'cashin', 'paiement', 'total', ou ''
    revenuJournalierDataFiltered: { date: string; totalCashin: number; totalPaiement: number; fraisCashin: number; fraisPaiement: number; revenuTotal: number; ecartFrais: number }[] = [];
    
    // Informations de débogage pour le revenu journalier
    revenuJournalierDebugInfo: string = '';

    // Pagination et filtres pour le control revenu
    controlRevenuCurrentPage = 1;
    controlRevenuPageSize = 10;
    controlRevenuTotalPages = 1;
    controlRevenuDateDebut = '';
    controlRevenuDateFin = '';
    controlRevenuService = '';
    controlRevenuType = '';
    controlRevenuSeuil: number | null = null;
    controlRevenuDataFiltered: { date: string; service: string; typeControle: string; revenuAttendu: number; revenuReel: number; ecart: number; statut: string; volume: number; nombreTrx: number; totalFraisTrxSf?: number }[] = [];
    private releveOperationsFetchKey = '';
    private revenuJournalierFetchKey = '';
    private controlRevenuFetchKey = '';
    private ecartFraisFetchKey = '';
    private fraisParametresLoaded = false;
    
    // Propriété pour stocker les frais paramétrés
    fraisParametres: FraisTransaction[] = [];

    // Propriétés pour le tooltip
    tooltipVisible = false;
    tooltipX = 0;
    tooltipY = 0;
    tooltipContent = '';

    constructor(
        private compteService: CompteService,
        private operationService: OperationService,
        private dashboardService: DashboardService,
        private statisticsService: StatisticsService,
        private agencySummaryService: AgencySummaryService,
        private fraisTransactionService: FraisTransactionService,
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private ecartSoldeService: EcartSoldeService,
        private impactOPService: ImpactOPService,
        private trxSfService: TrxSfService,
        private popupService: PopupService,
        private calculService: ConfigurationCalculService
    ) {
        this.addForm = this.fb.group({
            numeroCompte: ['', [Validators.required]],
            solde: [0, [Validators.required, Validators.min(0)]],
            pays: ['', [Validators.required]],
            codeProprietaire: [''],
            type: ['', [Validators.required]], // Ajouté
            categorie: ['', [Validators.required]] // Ajouté
        });

        this.editForm = this.fb.group({
            numeroCompte: ['', [Validators.required]],
            solde: [0, [Validators.required]],
            pays: ['', [Validators.required]],
            codeProprietaire: [''],
            type: ['', [Validators.required]], // Ajouté
            categorie: ['', [Validators.required]] // Ajouté
        });

        this.filterForm = this.fb.group({
            pays: [[]],
            soldeMin: [''],
            dateDebut: [''],
            dateFin: [''],
            codeProprietaire: [[]],
            categorie: [[]],
            type: [[]]
        });
    }

    ngOnInit() {
        this.calculService.loadRules().subscribe();
        this.loadComptes();
        this.loadFilterLists();
        this.loadOperationsPeriode();
        this.filteredPaysList = this.paysList;
        this.filteredCodeProprietaireList = this.codeProprietaireList;
        this.filteredCategorieList = this.compteCategories;
        this.filteredTypeList = this.compteTypes;
        
        // Vérifier s'il y a un filtre de catégorie dans les paramètres de la route
        this.route.queryParams.subscribe(params => {
            if (params['filterCategorie']) {
                const categorie = params['filterCategorie'];
                // Attendre que les comptes soient chargés avant d'appliquer le filtre
                setTimeout(() => {
                    this.selectedCategories = [categorie];
                    this.filterForm.controls['categorie'].setValue([categorie]);
                    this.applyFilters();
                }, 500);
            }
        });
        
        this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            const availablePays = this.getFilteredPays();
            this.filteredPaysList = availablePays.filter(p => p.toLowerCase().includes(s));
        });
        this.codeProprietaireSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            const availableCodeProprietaire = this.getFilteredCodeProprietaire();
            this.filteredCodeProprietaireList = availableCodeProprietaire.filter(c => c.toLowerCase().includes(s));
        });
        
        this.categorieSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            const availableCategories = this.getFilteredCategories();
            this.filteredCategorieList = availableCategories.filter(c => c.toLowerCase().includes(s));
        });

        // Synchroniser les valeurs du formulaire vers les variables locales
        this.filterForm.controls['pays'].valueChanges.subscribe((value: string[]) => {
            this.selectedPays = value || [];
        });

        this.filterForm.controls['codeProprietaire'].valueChanges.subscribe((value: string[]) => {
            this.selectedCodesProprietaire = value || [];
        });
        
        this.filterForm.controls['categorie'].valueChanges.subscribe((value: string[]) => {
            this.selectedCategories = value || [];
        });

        this.filterForm.controls['type'].valueChanges.subscribe((value: string[]) => {
            this.selectedTypes = value || [];
        });

        this.subscription.add(
            this.addForm.get('pays')!.valueChanges.subscribe((v: string | null) => {
                this.filteredPaysAdd = this.filterPaysAutocompleteOptions(v);
            })
        );
        this.subscription.add(
            this.editForm.get('pays')!.valueChanges.subscribe((v: string | null) => {
                this.filteredPaysEdit = this.filterPaysAutocompleteOptions(v);
            })
        );
        this.syncPaysAutocompleteFilteredLists();
    }

    /** Pays existants triés (affichage liste + autocomplete) */
    get paysListSorted(): string[] {
        return this.sortPaysCodes(this.paysList);
    }

    private sortPaysCodes(list: string[]): string[] {
        return [...list].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    }

    /** Filtre la liste indicative ; la valeur du champ peut rester une saisie libre hors liste */
    private filterPaysAutocompleteOptions(raw: string | null): string[] {
        const term = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        if (!term) {
            return this.sortPaysCodes(this.paysList);
        }
        return this.sortPaysCodes(this.paysList.filter(p => p.toLowerCase().includes(term)));
    }

    private syncPaysAutocompleteFilteredLists(): void {
        this.filteredPaysAdd = this.filterPaysAutocompleteOptions(this.addForm.get('pays')?.value ?? null);
        this.filteredPaysEdit = this.filterPaysAutocompleteOptions(this.editForm.get('pays')?.value ?? null);
    }

    /** Au focus : réafficher toute la liste dans le panneau d’autocomplete */
    onPaysAutocompleteFocus(mode: 'add' | 'edit'): void {
        const full = this.sortPaysCodes(this.paysList);
        if (mode === 'add') {
            this.filteredPaysAdd = full;
        } else {
            this.filteredPaysEdit = full;
        }
    }

    /** Sélection d’un pays depuis la liste affichée sous le champ */
    selectPaysFromList(mode: 'add' | 'edit', pays: string): void {
        if (mode === 'add') {
            this.addForm.get('pays')?.setValue(pays);
            this.addForm.get('pays')?.markAsTouched();
        } else {
            this.editForm.get('pays')?.setValue(pays);
            this.editForm.get('pays')?.markAsTouched();
        }
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    loadComptes() {
        this.isLoading = true;
        this.subscription.add(
            this.compteService.getAllComptes().subscribe({
                next: (comptes) => {
                    this.allComptes = comptes;
                    this.comptes = comptes;
                    
                    // Mettre à jour les listes filtrées avec cloisonnement après chargement des comptes
                    this.updateFilteredLists();

                    // Par défaut : n'afficher que les comptes Client (sauf lien avec ?filterCategorie=…)
                    const routeCategorie = this.route.snapshot.queryParamMap.get('filterCategorie');
                    if (!routeCategorie) {
                        this.selectedCategories = ['Client'];
                        this.filterForm.controls['categorie'].setValue(['Client'], { emitEvent: false });
                        this.updateFilteredLists();
                        this.applyFilters();
                        return;
                    }

                    this.updatePagedComptes();
                    this.calculateStats();
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Erreur lors du chargement des comptes:', error);
                    this.isLoading = false;
                }
            })
        );
    }

    addCompte() {
        console.log('addCompte() appelé');
        console.log('Form valid:', this.addForm.valid);
        console.log('Form values:', this.addForm.value);
        
        if (this.addForm.valid) {
            this.isAdding = true;
            const newCompte = this.addForm.value;
            
            this.subscription.add(
                this.compteService.createCompte(newCompte).subscribe({
                    next: (compte) => {
                        console.log('Compte créé avec succès:', compte);
                        this.allComptes.unshift(compte);
                        this.comptes.unshift(compte);
                        // Mettre à jour les listes de filtres pour inclure les nouvelles valeurs du compte créé
                        this.updateFilteredLists();
                        this.updatePagedComptes();
                        this.calculateStats();
                        this.addForm.reset();
                        this.showAddForm = false;
                        this.isAdding = false;
                    },
                    error: (error) => {
                        console.error('Erreur lors de l\'ajout du compte:', error);
                        this.isAdding = false;
                        
                        // Extraire le message d'erreur du backend
                        let errorMessage = 'Erreur lors de l\'ajout du compte.';
                        if (error.error) {
                            if (error.error.message) {
                                errorMessage = error.error.message;
                            } else if (error.error.error) {
                                errorMessage = error.error.error;
                            } else if (typeof error.error === 'string') {
                                errorMessage = error.error;
                            }
                        } else if (error.message) {
                            errorMessage = error.message;
                        }
                        
                        // Vérifier si c'est une erreur de permission (403)
                        if (error.status === 403) {
                            errorMessage = errorMessage || 'Vous n\'avez pas la permission pour exécuter cette action.';
                        }
                        
                        this.popupService.showError(errorMessage);
                    }
                })
            );
        } else {
            console.log('Formulaire invalide');
            this.markFormGroupTouched();
        }
    }

    markFormGroupTouched() {
        Object.keys(this.addForm.controls).forEach(key => {
            const control = this.addForm.get(key);
            control?.markAsTouched();
        });
    }

    cancelAdd() {
        this.showAddForm = false;
        this.addForm.reset();
    }

    closeAddModal(event: Event) {
        if (event.target === event.currentTarget) {
            this.cancelAdd();
        }
    }

    closeEditModal(event: Event) {
        if (event.target === event.currentTarget) {
            this.cancelEdit();
        }
    }

    editCompte(compte: Compte) {
        this.editingCompte = compte;
        this.showEditForm = true;
        this.editForm.patchValue({
            numeroCompte: compte.numeroCompte,
            solde: compte.solde,
            pays: compte.pays,
            codeProprietaire: compte.codeProprietaire,
            type: compte.type || '', // Ajouté
            categorie: compte.categorie || '' // Ajouté
        });
    }

    async deleteCompte(id: number) {
        const confirmed = await this.popupService.showConfirm('Êtes-vous sûr de vouloir supprimer ce compte ?');
        if (confirmed) {
            this.subscription.add(
                this.compteService.deleteCompte(id).subscribe({
                    next: (response) => {
                        if (response.success) {
                            this.allComptes = this.allComptes.filter(c => c.id !== id);
                            this.comptes = this.comptes.filter(c => c.id !== id);
                            // Mettre à jour les listes de filtres pour retirer les valeurs qui ne sont plus utilisées
                            this.updateFilteredLists();
                            this.updatePagedComptes();
                            this.calculateStats();
                            this.popupService.showSuccess('Suppression réussie', response.message);
                        } else {
                            this.popupService.showError('Suppression impossible', response.message);
                        }
                    },
                    error: (error) => {
                        console.error('Erreur lors de la suppression:', error);
                        
                        // Extraire le message d'erreur du backend
                        let errorMessage = 'Erreur lors de la suppression du compte.';
                        if (error.error) {
                            if (error.error.message) {
                                errorMessage = error.error.message;
                            } else if (error.error.error) {
                                errorMessage = error.error.error;
                            } else if (typeof error.error === 'string') {
                                errorMessage = error.error;
                            }
                        } else if (error.message) {
                            errorMessage = error.message;
                        }
                        
                        // Vérifier si c'est une erreur de permission (403)
                        if (error.status === 403) {
                            errorMessage = errorMessage || 'Vous n\'avez pas la permission pour exécuter cette action.';
                        }
                        
                        this.popupService.showError(errorMessage);
                    }
                })
            );
        }
    }

    applyFilters() {
        // Synchroniser les champs du formulaire avec les sélections UI
        this.filterForm.controls['pays'].setValue(this.selectedPays);
        this.filterForm.controls['codeProprietaire'].setValue(this.selectedCodesProprietaire);
        this.filterForm.controls['categorie'].setValue(this.selectedCategories);
        this.filterForm.controls['type'].setValue(this.selectedTypes);

        const filter: CompteFilter = {
            ...this.filterForm.value,
            pays: this.selectedPays,
            codeProprietaire: this.selectedCodesProprietaire,
            categorie: this.selectedCategories,
            type: this.selectedTypes
        };
        console.log('Filtres appliqués:', filter);
        this.currentPage = 1;
        this.isLoading = true;
        
        this.subscription.add(
            this.compteService.filterComptes(filter).subscribe({
                next: (comptes) => {
                    console.log('Résultats du filtrage:', comptes);
                    // Ne pas toucher allComptes ici (reste la source complète)
                    this.comptes = comptes;
                    
                    // Mettre à jour les listes filtrées avec cloisonnement après le filtrage
                    this.updateFilteredLists();
                    
                    this.updatePagedComptes();
                    this.calculateStats();
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Erreur lors du filtrage:', error);
                    this.isLoading = false;
                }
            })
        );
    }

    clearFilters() {
        this.currentPage = 1;
        this.filterForm.reset({
            pays: [],
            codeProprietaire: [],
            categorie: [],
            type: [],
            soldeMin: '',
            dateDebut: '',
            dateFin: ''
        });
        this.selectedPays = [];
        this.selectedCodesProprietaire = [];
        this.selectedCategories = [];
        this.selectedTypes = [];
        this.loadComptes();
    }

    /** Recharge les comptes depuis le serveur sans réinitialiser les filtres actifs. */
    refreshComptes(): void {
        if (this.isLoading) {
            return;
        }

        const reloadReleve = this.showReleveModal && !!this.selectedCompte;
        const numeroReleve = this.selectedCompte?.numeroCompte;

        this.isLoading = true;
        this.subscription.add(
            this.compteService.getAllComptes().subscribe({
                next: (comptes) => {
                    this.allComptes = comptes;
                    this.updateFilteredLists();
                    this.loadFilterLists();

                    if (reloadReleve && numeroReleve) {
                        this.selectedCompte = comptes.find(c => c.numeroCompte === numeroReleve) ?? this.selectedCompte;
                    }

                    this.applyFilters();

                    if (reloadReleve) {
                        this.releveOperationsFetchKey = '';
                        this.loadReleveOperations();
                    }
                },
                error: (error) => {
                    console.error('Erreur lors de l\'actualisation des comptes:', error);
                    this.isLoading = false;
                    this.popupService.showError('Erreur lors de l\'actualisation des comptes.');
                }
            })
        );
    }

    updatePagedComptes() {
        this.totalPages = this.comptes.length > 0
            ? Math.ceil(this.comptes.length / this.pageSize)
            : 0;
        if (this.totalPages === 0) {
            this.currentPage = 1;
            this.pagedComptes = [];
            return;
        }
        if (this.currentPage > this.totalPages) {
            this.currentPage = 1;
        }
        if (this.currentPage < 1) {
            this.currentPage = 1;
        }
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.pagedComptes = this.comptes.slice(start, end);
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePagedComptes();
        }
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePagedComptes();
        }
    }

    goToPage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.updatePagedComptes();
        }
    }

    getVisiblePages(): number[] {
        const maxVisible = 5;
        const pages: number[] = [];
        
        if (this.totalPages <= maxVisible) {
            // Si moins de 5 pages, afficher toutes
            for (let i = 1; i <= this.totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Si plus de 5 pages, afficher intelligemment
            let start = Math.max(1, this.currentPage - 2);
            let end = Math.min(this.totalPages, start + maxVisible - 1);
            
            // Ajuster si on est près de la fin
            if (end - start < maxVisible - 1) {
                start = Math.max(1, end - maxVisible + 1);
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
        }
        
        return pages;
    }

    loadOperationsPeriode() {
        const today = new Date();
        const dateDebut = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        dateDebut.setDate(dateDebut.getDate() - (this.periodeJours - 1));
        const dateDebutStr = dateDebut.toISOString().split('T')[0];
        const dateFinStr = today.toISOString().split('T')[0];
        this.operationService.getOperationsByDateRange(dateDebutStr, dateFinStr).subscribe({
            next: (ops) => {
                this.operations = ops;
                this.calculateStats();
            },
            error: (err) => {
                console.error('Erreur lors du chargement des opérations de la période', err);
                this.operations = [];
                this.calculateStats();
            }
        });
    }

    onPeriodeJoursChange() {
        this.criticalPage = 1;
        this.loadOperationsPeriode();
    }

    calculateStats() {
        this.totalComptes = this.comptes.length;
        this.totalSolde = this.comptes.reduce((sum, compte) => sum + compte.solde, 0);
        this.soldeMoyen = this.totalComptes > 0 ? this.totalSolde / this.totalComptes : 0;
        
        if (this.totalComptes > 0) {
            this.soldeMax = Math.max(...this.comptes.map(c => c.solde));
            this.soldeMin = Math.min(...this.comptes.map(c => c.solde));
        } else {
            this.soldeMax = 0;
            this.soldeMin = 0;
        }
        
        this.paysUniques = new Set(this.comptes.map(c => c.pays)).size;
        
        this.compteSoldeMax = this.comptes.find(c => c.solde === this.soldeMax) || null;
        this.compteSoldeMin = this.comptes.find(c => c.solde === this.soldeMin) || null;

        // Calcul dynamique de la moyenne du volume journalier sur la période choisie pour chaque compte
        const jours = this.periodeJours;
        // Ne considérer que: (a) services fusionnés (consolidés) ET (b) toujours inclure Clients et Banques
        const comptesEligibles = this.comptes.filter(c => {
            const isClient = c.categorie === 'Client';
            const isBanque = c.categorie === 'Banque';
            const isServiceConsolide = c.categorie === 'Service' && (c.consolide === true);
            return isClient || isBanque || isServiceConsolide;
        });

        this.comptesCritiques = comptesEligibles.map(c => {
            // Regrouper les opérations par jour, types 'total_cashin', 'Compense_client' et 'Compense_fournisseur' (débits)
            const opsCompte = this.operations.filter(op => op.compteId === c.id && 
                (op.typeOperation === 'total_cashin' || op.typeOperation === 'Compense_client' || op.typeOperation === 'Compense_fournisseur'));
            const volumesParJour: { [date: string]: number } = {};
            opsCompte.forEach(op => {
                const d = new Date(op.dateOperation);
                const dateStr = d.toISOString().split('T')[0];
                if (!volumesParJour[dateStr]) volumesParJour[dateStr] = 0;
                volumesParJour[dateStr] += op.montant;
            });
            // Moyenne sur la période (même si certains jours = 0)
            const totalVolume = Object.values(volumesParJour).reduce((sum, v) => sum + v, 0);
            const moyenne = totalVolume / jours;
            return { compte: c, moyenneVolume: moyenne };
        }).filter(item => item.compte.solde < item.moyenneVolume)
        // Ordonner par solde croissant (du plus faible au plus élevé)
        .sort((a, b) => a.compte.solde - b.compte.solde);
    }

    formatDate(dateString: string): string {
        return new Date(dateString).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Cache pour stocker les dernières dates de solde de clôture par compte
    private lastClosingDateCache: Map<string, string> = new Map();
    // Cache pour les requêtes en cours pour éviter les doublons
    private loadingDates: Set<string> = new Set();

    // Récupère la dernière date du solde de clôture pour un compte (sans charger si pas en cache)
    getLastClosingDate(compte: Compte): string {
        // Si on a déjà chargé le relevé pour ce compte, utiliser cette date
        if (this.selectedCompte?.numeroCompte === compte.numeroCompte && this.releveOperations.length > 0) {
            const lastDate = this.getGlobalClosingBalanceDate();
            if (lastDate) {
                return this.formatDateForTooltip(lastDate);
            }
        }

        // Vérifier le cache
        if (this.lastClosingDateCache.has(compte.numeroCompte)) {
            return this.lastClosingDateCache.get(compte.numeroCompte)!;
        }

        // Retourner la date de dernière mise à jour par défaut (ne pas charger automatiquement)
        return compte.dateDerniereMaj ? this.formatDate(compte.dateDerniereMaj) : 'N/A';
    }

    // Charge la dernière date de clôture pour un compte (appelé uniquement au survol)
    private loadLastClosingDate(compte: Compte): void {
        // Éviter les requêtes en double
        if (this.loadingDates.has(compte.numeroCompte) || this.lastClosingDateCache.has(compte.numeroCompte)) {
            return;
        }

        this.loadingDates.add(compte.numeroCompte);
        
        this.operationService.getOperationsByCompte(compte.numeroCompte, null, null, null).subscribe({
            next: (operations) => {
                this.loadingDates.delete(compte.numeroCompte);
                
                if (operations && operations.length > 0) {
                    // Trier par date décroissante et prendre la première
                    const sortedOps = [...operations].sort((a, b) => {
                        const dateA = new Date(a.dateOperation).getTime();
                        const dateB = new Date(b.dateOperation).getTime();
                        return dateB - dateA;
                    });
                    const lastOp = sortedOps[0];
                    if (lastOp && lastOp.dateOperation) {
                        const formattedDate = this.formatDate(lastOp.dateOperation);
                        this.lastClosingDateCache.set(compte.numeroCompte, formattedDate);
                        // Mettre à jour le tooltip si visible
                        if (this.tooltipVisible) {
                            const solde = compte.solde.toFixed(2);
                            this.tooltipContent = `Solde de clôture: ${solde} FCFA<br>Date: ${formattedDate}`;
                        }
                    }
                }
            },
            error: (error) => {
                this.loadingDates.delete(compte.numeroCompte);
                // Ne pas logger les erreurs 429 (Too Many Requests) pour éviter le spam
                if (error.status !== 429) {
                    console.error(`Erreur lors du chargement de la dernière date pour ${compte.numeroCompte}:`, error);
                }
            }
        });
    }

    // Formate une date pour le tooltip (format YYYY-MM-DD vers format français)
    private formatDateForTooltip(dateString: string): string {
        try {
            // Si c'est déjà au format YYYY-MM-DD
            if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month, day] = dateString.split('-');
                return `${day}/${month}/${year}`;
            }
            // Sinon, parser comme date ISO
            return new Date(dateString).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    // Affiche le tooltip
    showTooltip(event: MouseEvent, compte: Compte): void {
        const solde = compte.solde.toFixed(2);
        let date = this.getLastClosingDate(compte);
        
        // Si la date n'est pas en cache, charger en arrière-plan et utiliser la date par défaut
        if (!this.lastClosingDateCache.has(compte.numeroCompte) && 
            this.selectedCompte?.numeroCompte !== compte.numeroCompte) {
            // Charger la date en arrière-plan
            this.loadLastClosingDate(compte);
        }
        
        this.tooltipContent = `Solde de clôture: ${solde} FCFA<br>Date: ${date}`;
        this.updateTooltipPosition(event);
        this.tooltipVisible = true;
    }

    // Cache le tooltip
    hideTooltip(): void {
        this.tooltipVisible = false;
    }

    // Met à jour la position du tooltip
    updateTooltipPosition(event: MouseEvent): void {
        if (!this.tooltipVisible) return;
        
        const offset = 15;
        this.tooltipX = event.clientX;
        this.tooltipY = event.clientY - offset;
        
        // Ajuster si le tooltip dépasse de l'écran (le transform translate(-50%, -100%) est géré par CSS)
        setTimeout(() => {
            const tooltipElement = document.querySelector('.solde-tooltip') as HTMLElement;
            if (tooltipElement) {
                const rect = tooltipElement.getBoundingClientRect();
                // Ajuster horizontalement si nécessaire
                if (rect.right > window.innerWidth) {
                    this.tooltipX = window.innerWidth - rect.width / 2 - 10;
                }
                if (rect.left < 0) {
                    this.tooltipX = rect.width / 2 + 10;
                }
                // Ajuster verticalement si nécessaire
                if (rect.top < 0) {
                    this.tooltipY = event.clientY + offset + 20;
                }
            }
        }, 0);
    }

    private normalizeToYmd(dateInput: string): string {
        const dateObj = new Date(dateInput);
        if (!isNaN(dateObj.getTime())) {
            return dateObj.toISOString().split('T')[0];
        }
        // Fallback: tenter d'extraire la partie date si déjà au format ISO-like
        const tIndex = dateInput.indexOf('T');
        return tIndex > 0 ? dateInput.substring(0, tIndex) : dateInput;
    }

    private buildReleveDateFilters(): { dateDebut: string | null; dateFin: string | null } {
        if (this.showAllDataReleve) {
            return { dateDebut: null, dateFin: null };
        }
        return this.resolveReleveIntervalDates();
    }

    /** Intervalle effectif (présélection, personnalisé ou mois par défaut) */
    private resolveReleveIntervalDates(): { dateDebut: string | null; dateFin: string | null } {
        if (this.releveDateDebutCustom || this.releveDateFinCustom) {
            return {
                dateDebut: this.releveDateDebutCustom || null,
                dateFin: this.releveDateFinCustom || null
            };
        }

        if (this.releveDateDebut && this.releveDateDebut !== 'custom') {
            const jours = parseInt(this.releveDateDebut, 10);
            if (!isNaN(jours) && jours > 0) {
                const dateFinObj = new Date();
                const dateDebutObj = new Date();
                dateDebutObj.setDate(dateDebutObj.getDate() - jours);
                return {
                    dateDebut: dateDebutObj.toISOString().split('T')[0],
                    dateFin: dateFinObj.toISOString().split('T')[0]
                };
            }
        }

        const { year, monthIndex } = this.getDefaultReleveReportingMonth();
        const dateDebutObj = new Date(year, monthIndex, 1);
        const dateFinObj = new Date(year, monthIndex + 1, 0);
        return {
            dateDebut: dateDebutObj.toISOString().split('T')[0],
            dateFin: dateFinObj.toISOString().split('T')[0]
        };
    }

    /** Intervalle utilisé pour l'export (priorité aux champs Du/Au) */
    getExportDateFilters(): { dateDebut: string | null; dateFin: string | null } {
        if (this.releveDateDebutCustom || this.releveDateFinCustom) {
            return {
                dateDebut: this.releveDateDebutCustom || null,
                dateFin: this.releveDateFinCustom || null
            };
        }
        if (this.showAllDataReleve) {
            return { dateDebut: null, dateFin: null };
        }
        return this.resolveReleveIntervalDates();
    }

    getReleveExportIntervalLabel(): string {
        const { dateDebut, dateFin } = this.getExportDateFilters();
        if (!dateDebut && !dateFin) return '';
        if (dateDebut && dateFin) return `${dateDebut} → ${dateFin}`;
        if (dateDebut) return `à partir du ${dateDebut}`;
        return `jusqu'au ${dateFin}`;
    }

    private getReleveExportFileSuffix(): string {
        const { dateDebut, dateFin } = this.getExportDateFilters();
        if (dateDebut && dateFin) return `${dateDebut}_${dateFin}`;
        if (dateDebut) return `depuis_${dateDebut}`;
        if (dateFin) return `jusquau_${dateFin}`;
        return new Date().toISOString().split('T')[0];
    }

    private syncReleveIntervalFromPeriodPreset(): void {
        const interval = this.resolveReleveIntervalDates();
        this.releveDateDebutCustom = interval.dateDebut || '';
        this.releveDateFinCustom = interval.dateFin || '';
    }

    onReleveCustomDateChange(): void {
        if (this.showAllDataReleve) return;
        if (this.releveDateDebutCustom || this.releveDateFinCustom) {
            this.releveDateDebut = 'custom';
        }
        this.loadReleveOperations();
    }

    applyReleveDateInterval(): void {
        if (this.showAllDataReleve) {
            this.popupService.showWarning(
                'Désactivez « Voir plus » pour filtrer l\'affichage par intervalle, ou renseignez Du/Au pour limiter l\'export uniquement.',
                'Intervalle de dates'
            );
            return;
        }
        if (!this.releveDateDebutCustom && !this.releveDateFinCustom) {
            this.popupService.showWarning('Indiquez au moins une date de début ou de fin.', 'Intervalle de dates');
            return;
        }
        if (this.releveDateDebutCustom && this.releveDateFinCustom && this.releveDateDebutCustom > this.releveDateFinCustom) {
            this.popupService.showWarning('La date de début doit être antérieure ou égale à la date de fin.', 'Intervalle invalide');
            return;
        }
        this.releveDateDebut = 'custom';
        this.loadReleveOperations();
    }

    private operationMatchesDateRange(op: Operation, dateDebut: string | null, dateFin: string | null): boolean {
        if (!dateDebut && !dateFin) return true;
        const ymd = this.normalizeToYmd(op.dateOperation);
        if (!ymd) return false;
        if (dateDebut && ymd < dateDebut) return false;
        if (dateFin && ymd > dateFin) return false;
        return true;
    }

    private getReleveOperationsForExport(): Operation[] {
        const { dateDebut, dateFin } = this.getExportDateFilters();
        if (!dateDebut && !dateFin) {
            return [...this.releveOperations];
        }
        return this.releveOperations.filter(op => this.operationMatchesDateRange(op, dateDebut, dateFin));
    }

    private getReleveSoldesForExport(): DailySolde[] {
        const { dateDebut, dateFin } = this.getExportDateFilters();
        if (!dateDebut && !dateFin) {
            return [...this.releveSoldesJournaliers];
        }
        return this.releveSoldesJournaliers.filter(solde => {
            const ymd = this.normalizeToYmd(solde.date);
            if (!ymd) return false;
            if (dateDebut && ymd < dateDebut) return false;
            if (dateFin && ymd > dateFin) return false;
            return true;
        });
    }

    private getFlattenedReleveOperationsForExport(): Operation[] {
        const ops = this.getReleveOperationsForExport();
        if (ops.length === 0) return [];
        const grouped = this.buildGroupedReleveOperationsFrom(ops);
        return grouped.flatMap(group => [group.main, ...group.frais]);
    }

    private getReleveExportFilterInfo(): string {
        const interval = this.getReleveExportIntervalLabel();
        let filterInfo = interval ? `Période: ${interval}` : 'Historique complet';
        if (this.releveTypeOperation) {
            filterInfo += ` | Type: ${this.getOperationTypeLabel(this.releveTypeOperation)}`;
        }
        return filterInfo;
    }

    private buildReleveFetchKey(): string {
        const { dateDebut, dateFin } = this.buildReleveDateFilters();
        return [
            this.selectedCompte?.numeroCompte || '',
            dateDebut || 'all',
            dateFin || 'all',
            this.releveTypeOperation || 'all'
        ].join('|');
    }

    private buildControlRevenuDateFilters(): { dateDebut: string | null; dateFin: string | null } {
        if (this.controlRevenuDateDebut || this.controlRevenuDateFin) {
            return {
                dateDebut: this.controlRevenuDateDebut || null,
                dateFin: this.controlRevenuDateFin || null
            };
        }
        return this.buildReleveDateFilters();
    }

    private resetReleveTabCaches(): void {
        this.releveOperationsFetchKey = '';
        this.revenuJournalierFetchKey = '';
        this.controlRevenuFetchKey = '';
        this.ecartFraisFetchKey = '';
        this.revenuJournalierData = [];
        this.revenuJournalierDataFiltered = [];
        this.controlRevenuData = [];
        this.controlRevenuDataFiltered = [];
        this.ecartFraisItems = [];
        this.ecartFraisFilteredItems = [];
        this.impactOPSums = {};
    }

    trackByNumber(index: number, value: number): number {
        return value ?? index;
    }

    trackByReleveOperation(index: number, operation: Operation): string | number {
        return operation.id ?? `${operation.dateOperation}|${operation.typeOperation}|${operation.montant}|${index}`;
    }

    trackByReleveGroup(index: number, group: { periodLabel: string }): string {
        return group.periodLabel || String(index);
    }

    trackByReleveSolde(index: number, row: ReleveSoldeDisplayRow): string {
        return row.periodLabel || row.ecartRef?.date || String(index);
    }

    trackByRevenuJournalier(index: number, revenu: { date: string }): string {
        return revenu.date || String(index);
    }

    trackByControlRevenu(index: number, controle: { date: string; service: string; typeControle: string }): string {
        return `${controle.date}|${controle.service}|${controle.typeControle}|${index}`;
    }

    trackByEcartFrais(index: number, item: import('../../services/trx-sf.service').TrxSfData): string | number {
        return item.id ?? item.idTransaction ?? index;
    }

    async exportComptes() {
        this.isExporting = true;
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Comptes');

            worksheet.columns = [
                { header: 'Numéro de Compte', key: 'numeroCompte', width: 20 },
                { header: 'Solde', key: 'solde', width: 15 },
                { header: 'Date Dernière MAJ', key: 'dateDerniereMaj', width: 20 },
                { header: 'Pays', key: 'pays', width: 15 }
            ];

            worksheet.getRow(1).eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1976D2' }
                };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            });

            this.comptes.forEach((compte, idx) => {
                const row = worksheet.addRow({
                    numeroCompte: compte.numeroCompte,
                    solde: compte.solde,
                    dateDerniereMaj: this.formatDate(compte.dateDerniereMaj),
                    pays: compte.pays
                });

                if (idx % 2 === 1) {
                    row.eachCell(cell => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE3F2FD' }
                        };
                    });
                }
            });

            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `comptes_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Erreur lors de l\'export:', error);
        } finally {
            this.isExporting = false;
        }
    }

    goToServiceBalance() {
        this.router.navigate(['/service-balance']);
    }

    goToRedevance() {
        this.router.navigate(['/redevance-loterie']);
    }

    goToPredictions() {
        this.router.navigate(['/predictions']);
    }

    /**
     * Seuils de criticité (ratio solde / moyenne volume).
     * Les règles configurées dans Configuration > Calcul sont prioritaires ;
     * en leur absence, le code conserve ces valeurs par défaut.
     */
    get seuilCriticiteTres(): number {
        return this.calculService.getNumber('COMPTES.SEUIL_CRITICITE_TRES', 0.3);
    }

    get seuilCriticiteMoyen(): number {
        return this.calculService.getNumber('COMPTES.SEUIL_CRITICITE_MOYEN', 0.6);
    }

    get seuilCriticiteFaible(): number {
        return this.calculService.getNumber('COMPTES.SEUIL_CRITICITE_FAIBLE', 0.8);
    }

    async exportSoldesCritiques() {
        this.isExporting = true;
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Soldes Critiques');

            worksheet.columns = [
                { header: 'Position', key: 'position', width: 10 },
                { header: 'Code Propriétaire', key: 'codeProprietaire', width: 22 },
                { header: 'Solde Actuel', key: 'solde', width: 15 },
                { header: `Moyenne Volume (${this.periodeJours}j)`, key: 'moyenneVolume', width: 20 },
                { header: 'Ratio Criticité', key: 'ratioCriticite', width: 15 },
                { header: 'Pays', key: 'pays', width: 15 },
                { header: 'Numéro de Compte', key: 'numeroCompte', width: 20 },
                { header: 'Date Dernière MAJ', key: 'dateDerniereMaj', width: 20 }
            ];

            // Style de l'en-tête
            worksheet.getRow(1).eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFF5722' } // Rouge pour indiquer la criticité
                };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            });

            // Ajouter les données des soldes critiques
            this.comptesCritiques.forEach((item, idx) => {
                const ratioCriticite = item.compte.solde / item.moyenneVolume;
                const row = worksheet.addRow({
                    position: idx + 1,
                    codeProprietaire: item.compte.codeProprietaire || '-',
                    solde: item.compte.solde,
                    moyenneVolume: item.moyenneVolume,
                    ratioCriticite: ratioCriticite.toFixed(2),
                    pays: item.compte.pays,
                    numeroCompte: item.compte.numeroCompte,
                    dateDerniereMaj: this.formatDate(item.compte.dateDerniereMaj)
                });

                // Colorer les lignes selon la criticité
                const ratio = ratioCriticite;
                let fillColor = 'FFFFFFFF'; // Blanc par défaut
                const seuilTres = this.seuilCriticiteTres;
                const seuilMoyen = this.seuilCriticiteMoyen;
                const seuilFaible = this.seuilCriticiteFaible;

                if (ratio < seuilTres) {
                    fillColor = 'FFFFCDD2'; // Rouge clair pour très critique
                } else if (ratio < seuilMoyen) {
                    fillColor = 'FFFFE0B2'; // Orange clair pour critique
                } else if (ratio < seuilFaible) {
                    fillColor = 'FFFFF3E0'; // Jaune clair pour modérément critique
                }

                row.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: fillColor }
                    };
                });
            });

            // Ajouter un résumé
            const summaryRow = worksheet.addRow([]);
            const summaryRow2 = worksheet.addRow(['Résumé:', '', '', '', '', '', '', '']);
            const summaryRow3 = worksheet.addRow(['Total comptes critiques:', this.comptesCritiques.length, '', '', '', '', '', '', '']);
            const summaryRow4 = worksheet.addRow(['Période analysée:', `${this.periodeJours} jours`, '', '', '', '', '', '', '']);
            const summaryRow5 = worksheet.addRow(['Date d\'export:', new Date().toLocaleDateString('fr-FR'), '', '', '', '', '', '', '']);

            // Style du résumé
            [summaryRow2, summaryRow3, summaryRow4, summaryRow5].forEach(row => {
                row.eachCell((cell, colNumber) => {
                    if (colNumber === 1) {
                        cell.font = { bold: true };
                    }
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `soldes_critiques_${this.periodeJours}j_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Erreur lors de l\'export des soldes critiques:', error);
        } finally {
            this.isExporting = false;
        }
    }

    updateCompte() {
        console.log('updateCompte() appelé');
        console.log('Form valid:', this.editForm.valid);
        console.log('Form values:', this.editForm.value);
        
        if (this.editForm.valid && this.editingCompte) {
            this.isEditing = true;
            const updatedCompte = this.editForm.value;
            
            this.subscription.add(
                this.compteService.updateCompte(this.editingCompte.id!, updatedCompte).subscribe({
                    next: (compte) => {
                        console.log('Compte mis à jour avec succès:', compte);
                        this.allComptes = this.allComptes.map(c => c.id === compte.id ? compte : c);
                        this.comptes = this.comptes.map(c => c.id === compte.id ? compte : c);
                        // Mettre à jour les listes de filtres au cas où pays/codeProprietaire/categorie/type ont changé
                        this.updateFilteredLists();
                        this.updatePagedComptes();
                        this.calculateStats();
                        this.showEditForm = false;
                        this.isEditing = false;
                        this.editingCompte = null;
                    },
                    error: (error) => {
                        console.error('Erreur lors de la mise à jour du compte:', error);
                        this.isEditing = false;
                        
                        // Extraire le message d'erreur du backend
                        let errorMessage = 'Erreur lors de la mise à jour du compte.';
                        if (error.error) {
                            if (error.error.message) {
                                errorMessage = error.error.message;
                            } else if (error.error.error) {
                                errorMessage = error.error.error;
                            } else if (typeof error.error === 'string') {
                                errorMessage = error.error;
                            }
                        } else if (error.message) {
                            errorMessage = error.message;
                        }
                        
                        // Vérifier si c'est une erreur de permission (403)
                        if (error.status === 403) {
                            errorMessage = errorMessage || 'Vous n\'avez pas la permission pour exécuter cette action.';
                        }
                        
                        this.popupService.showError(errorMessage);
                    }
                })
            );
        } else {
            console.log('Formulaire invalide');
            this.markEditFormGroupTouched();
        }
    }

    markEditFormGroupTouched() {
        Object.keys(this.editForm.controls).forEach(key => {
            const control = this.editForm.get(key);
            control?.markAsTouched();
        });
    }

    cancelEdit() {
        this.showEditForm = false;
        this.editForm.reset();
        this.editingCompte = null;
    }

    loadFilterLists() {
        this.subscription.add(
            this.compteService.getDistinctPays().subscribe({
                next: (paysList: string[]) => {
                    this.paysList = normalizeCountryFilterOptions(paysList);
                    this.filteredPaysList = this.paysList;
                    this.syncPaysAutocompleteFilteredLists();
                    // Mettre à jour les listes filtrées avec cloisonnement après chargement des données
                    setTimeout(() => {
                        this.updateFilteredLists();
                    }, 100);
                },
                error: (error: any) => {
                    console.error('Erreur lors du chargement de la liste des pays:', error);
                }
            })
        );

        this.subscription.add(
            this.compteService.getDistinctCodeProprietaire().subscribe({
                next: (codeProprietaireList: string[]) => {
                    this.codeProprietaireList = codeProprietaireList;
                    this.filteredCodeProprietaireList = codeProprietaireList;
                    // Mettre à jour les listes filtrées avec cloisonnement après chargement des données
                    setTimeout(() => {
                        this.updateFilteredLists();
                    }, 100);
                },
                error: (error: any) => {
                    console.error('Erreur lors du chargement de la liste des codes propriétaires:', error);
                }
            })
        );
    }

    onPaysChange(event: any) {
        this.selectedPays = event.value;
        console.log('onPaysChange called, selectedPays:', this.selectedPays, 'event:', event);
        this.filterForm.controls['pays'].setValue(this.selectedPays);
        
        // Mettre à jour les listes filtrées pour le cloisonnement
        this.updateFilteredLists();
        
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.paysSelect) this.paysSelect.close();
        }, 100);
    }

    onCodeProprietaireChange(event: any) {
        this.selectedCodesProprietaire = event.value;
        console.log('onCodeProprietaireChange called, selectedCodesProprietaire:', this.selectedCodesProprietaire, 'event:', event);
        this.filterForm.controls['codeProprietaire'].setValue(this.selectedCodesProprietaire);
        
        // Mettre à jour les listes filtrées pour le cloisonnement
        this.updateFilteredLists();
        
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.codeProprietaireSelect) this.codeProprietaireSelect.close();
        }, 100);
    }
    
    onCategorieChange(event: any) {
        this.selectedCategories = event.value;
        console.log('onCategorieChange called, selectedCategories:', this.selectedCategories, 'event:', event);
        this.filterForm.controls['categorie'].setValue(this.selectedCategories);
        
        // Mettre à jour les listes filtrées pour le cloisonnement
        this.updateFilteredLists();
        
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.categorieSelect) this.categorieSelect.close();
        }, 100);
    }

    onTypeChange(event: any) {
        this.selectedTypes = event.value;
        console.log('onTypeChange called, selectedTypes:', this.selectedTypes, 'event:', event);
        this.filterForm.controls['type'].setValue(this.selectedTypes);
        
        // Mettre à jour les listes filtrées pour le cloisonnement
        this.updateFilteredLists();
        
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.typeSelect) this.typeSelect.close();
        }, 100);
    }

    // Méthode pour mettre à jour les listes filtrées avec cloisonnement
    updateFilteredLists() {
        // Mettre à jour les codes propriétaires disponibles selon le pays sélectionné
        this.filteredCodeProprietaireList = this.getFilteredCodeProprietaire();
        
        // Mettre à jour les pays disponibles selon le code propriétaire sélectionné
        this.filteredPaysList = this.getFilteredPays();
        
        // Mettre à jour les catégories disponibles selon les autres filtres
        this.filteredCategorieList = this.getFilteredCategories();
        
        // Mettre à jour les types disponibles selon les autres filtres
        this.filteredTypeList = this.getFilteredTypes();
        
        // Nettoyer les sélections qui ne sont plus valides
        this.cleanInvalidSelections();
        
        console.log('updateFilteredLists - filteredPaysList:', this.filteredPaysList);
        console.log('updateFilteredLists - filteredCodeProprietaireList:', this.filteredCodeProprietaireList);
        console.log('updateFilteredLists - filteredCategorieList:', this.filteredCategorieList);
        console.log('updateFilteredLists - filteredTypeList:', this.filteredTypeList);
    }

    // Méthode pour nettoyer les sélections invalides
    cleanInvalidSelections() {
        const currentPays = this.selectedPays;
        const currentCodeProprietaire = this.selectedCodesProprietaire;
        const currentCategories = this.selectedCategories;
        const currentTypes = this.selectedTypes;

        // Nettoyer les codes propriétaires si le pays a changé
        if (currentCodeProprietaire && currentCodeProprietaire.length > 0) {
            const validCodeProprietaire = currentCodeProprietaire.filter((code: string) => 
                this.filteredCodeProprietaireList.includes(code)
            );
            if (validCodeProprietaire.length !== currentCodeProprietaire.length) {
                this.selectedCodesProprietaire = validCodeProprietaire;
                this.filterForm.controls['codeProprietaire'].setValue(validCodeProprietaire);
            }
        }

        // Nettoyer les pays si le code propriétaire a changé
        if (currentPays && currentPays.length > 0) {
            const validPays = currentPays.filter((pays: string) =>
                this.filteredPaysList.some(fp => countriesMatch(fp, pays))
            );
            if (validPays.length !== currentPays.length) {
                this.selectedPays = validPays;
                this.filterForm.controls['pays'].setValue(validPays);
            }
        }
        
        // Nettoyer les catégories si les autres filtres ont changé
        if (currentCategories && currentCategories.length > 0) {
            const validCategories = currentCategories.filter((categorie: string) => 
                this.filteredCategorieList.includes(categorie)
            );
            if (validCategories.length !== currentCategories.length) {
                this.selectedCategories = validCategories;
                this.filterForm.controls['categorie'].setValue(validCategories);
            }
        }

        // Nettoyer les types si les autres filtres ont changé
        if (currentTypes && currentTypes.length > 0) {
            const validTypes = currentTypes.filter((type: string) => 
                this.filteredTypeList.includes(type)
            );
            if (validTypes.length !== currentTypes.length) {
                this.selectedTypes = validTypes;
                this.filterForm.controls['type'].setValue(validTypes);
            }
        }
    }

    // Méthodes de filtrage avec cloisonnement
    getFilteredPays(): string[] {
        // Si pas de données comptes, retourner la liste de base
        if (!this.comptes || this.comptes.length === 0) {
            return this.paysList;
        }
        
        let data = this.allComptes && this.allComptes.length ? this.allComptes : this.comptes;
        // Filtrer par code propriétaire si sélectionné
        if (this.selectedCodesProprietaire && this.selectedCodesProprietaire.length > 0) {
            data = data.filter(c => c.codeProprietaire && this.selectedCodesProprietaire.includes(c.codeProprietaire));
        }
        // Filtrer par catégorie si sélectionnée
        if (this.selectedCategories && this.selectedCategories.length > 0) {
            data = data.filter(c => c.categorie && this.selectedCategories.includes(c.categorie));
        }
        // Filtrer par type si sélectionné
        if (this.selectedTypes && this.selectedTypes.length > 0) {
            data = data.filter(c => c.type && this.selectedTypes.includes(c.type));
        }
        const pays = normalizeCountryFilterOptions(
            data.map(c => c.pays).filter((p): p is string => p !== undefined && p !== null)
        );
        const withSelected = normalizeCountryFilterOptions([...pays, ...(this.selectedPays || [])]);
        return withSelected;
    }

    getFilteredCodeProprietaire(): string[] {
        // Si pas de données comptes, retourner la liste de base
        if (!this.comptes || this.comptes.length === 0) {
            return this.codeProprietaireList;
        }
        
        let data = this.allComptes && this.allComptes.length ? this.allComptes : this.comptes;
        // Filtrer par pays si sélectionné (cloisonnement principal)
        if (this.selectedPays && this.selectedPays.length > 0) {
            data = data.filter(c => c.pays && matchesCountryFilter(c.pays, this.selectedPays));
        }
        // Filtrer par catégorie si sélectionnée
        if (this.selectedCategories && this.selectedCategories.length > 0) {
            data = data.filter(c => c.categorie && this.selectedCategories.includes(c.categorie));
        }
        // Filtrer par type si sélectionné
        if (this.selectedTypes && this.selectedTypes.length > 0) {
            data = data.filter(c => c.type && this.selectedTypes.includes(c.type));
        }
        const codeProprietaire = [...new Set(data.map(c => c.codeProprietaire).filter((c): c is string => c !== undefined && c !== null))];
        // Toujours inclure les éléments déjà sélectionnés
        const withSelected = Array.from(new Set([...(codeProprietaire || []), ...(this.selectedCodesProprietaire || [])]));
        return withSelected.sort();
    }
    
    getFilteredCategories(): string[] {
        // Si pas de données comptes, retourner la liste de base
        if (!this.comptes || this.comptes.length === 0) {
            return this.compteCategories;
        }
        
        let data = this.allComptes && this.allComptes.length ? this.allComptes : this.comptes;
        // Filtrer par pays si sélectionné
        if (this.selectedPays && this.selectedPays.length > 0) {
            data = data.filter(c => c.pays && matchesCountryFilter(c.pays, this.selectedPays));
        }
        // Filtrer par code propriétaire si sélectionné
        if (this.selectedCodesProprietaire && this.selectedCodesProprietaire.length > 0) {
            data = data.filter(c => c.codeProprietaire && this.selectedCodesProprietaire.includes(c.codeProprietaire));
        }
        // Filtrer par type si sélectionné
        if (this.selectedTypes && this.selectedTypes.length > 0) {
            data = data.filter(c => c.type && this.selectedTypes.includes(c.type));
        }
        const categories = [...new Set(data.map(c => c.categorie).filter((c): c is string => c !== undefined && c !== null))];
        // Toujours inclure les éléments déjà sélectionnés
        const withSelected = Array.from(new Set([...(categories || []), ...(this.selectedCategories || [])]));
        return withSelected.sort();
    }

    getFilteredTypes(): string[] {
        // Si pas de données comptes, retourner la liste de base
        if (!this.comptes || this.comptes.length === 0) {
            return this.compteTypes;
        }
        
        let data = this.allComptes && this.allComptes.length ? this.allComptes : this.comptes;
        // Filtrer par pays si sélectionné
        if (this.selectedPays && this.selectedPays.length > 0) {
            data = data.filter(c => c.pays && matchesCountryFilter(c.pays, this.selectedPays));
        }
        // Filtrer par code propriétaire si sélectionné
        if (this.selectedCodesProprietaire && this.selectedCodesProprietaire.length > 0) {
            data = data.filter(c => c.codeProprietaire && this.selectedCodesProprietaire.includes(c.codeProprietaire));
        }
        // Filtrer par catégorie si sélectionnée
        if (this.selectedCategories && this.selectedCategories.length > 0) {
            data = data.filter(c => c.categorie && this.selectedCategories.includes(c.categorie));
        }
        const types = [...new Set(data.map(c => c.type).filter((t): t is string => t !== undefined && t !== null))];
        // Toujours inclure les éléments déjà sélectionnés
        const withSelected = Array.from(new Set([...(types || []), ...(this.selectedTypes || [])]));
        return withSelected.sort();
    }

    get pagedComptesCritiques() {
        const start = (this.criticalPage - 1) * this.criticalPageSize;
        return this.comptesCritiques.slice(start, start + this.criticalPageSize);
    }

    get totalCriticalPages() {
        return Math.ceil(this.comptesCritiques.length / this.criticalPageSize) || 1;
    }

    prevCriticalPage() {
        if (this.criticalPage > 1) this.criticalPage--;
    }

    nextCriticalPage() {
        if (this.criticalPage < this.totalCriticalPages) this.criticalPage++;
    }

    toggleReleveView(): void {
        this.showSoldesSeulement = !this.showSoldesSeulement;
        this.calculateRelevePagination();
    }

    toggleReleveSummary(): void {
        this.showReleveSummary = !this.showReleveSummary;
    }

    // Méthodes pour le relevé de compte
    viewReleve(compte: Compte): void {
        const isSameCompte = this.selectedCompte?.numeroCompte === compte.numeroCompte;
        this.selectedCompte = compte;
        this.showReleveModal = true;
        this.showRevenuJournalierTab = true; // Activer l'onglet revenu journalier
        this.showControlRevenuTab = true; // Activer l'onglet Control revenu
        this.activeTab = 'operations';
        if (!isSameCompte) {
            this.resetReleveTabCaches();
            this.syncReleveIntervalFromPeriodPreset();
        }
        this.loadReleveOperations();
    }

    closeReleveModal(): void {
        this.showReleveModal = false;
        this.selectedCompte = null;
        this.releveOperations = [];
        this.releveSoldesJournaliers = [];
        this.closeClosingOverrideModal();
        this.invalidateReleveOperationCaches();
        this.showSoldesSeulement = false;
        this.releveOperationsViewMode = 'day';
        this.releveDateDebut = '';
        this.releveTypeOperation = '';
        this.releveDateDebutCustom = '';
        this.releveDateFinCustom = '';
        this.releveCurrentPage = 1;
        this.releveTotalPages = 1;
        this.activeTab = 'operations';
        this.resetReleveTabCaches();
    }

    onRelevePeriodChange(): void {
        this.showAllDataReleve = false;
        if (this.releveDateDebut !== 'custom') {
            this.syncReleveIntervalFromPeriodPreset();
        }
        this.loadReleveOperations();
    }
    
    toggleShowAllDataReleve(): void {
        this.showAllDataReleve = !this.showAllDataReleve;
        if (this.showAllDataReleve) {
            this.releveDateDebut = '';
        } else {
            this.syncReleveIntervalFromPeriodPreset();
        }
        this.loadReleveOperations();
    }

    loadReleveOperations(): void {
        if (!this.selectedCompte) return;

        const fetchKey = this.buildReleveFetchKey();
        if (fetchKey === this.releveOperationsFetchKey && this.releveOperations.length > 0) {
            this.calculateRelevePagination();
            return;
        }

        this.isLoadingReleve = true;
        this.releveOperations = [];
        this.releveSoldesJournaliers = [];
        this.invalidateReleveOperationCaches();
        this.resetReleveTabCaches();
        const { dateDebut, dateFin } = this.buildReleveDateFilters();

        this.operationService.getOperationsByCompteForReleve(
            this.selectedCompte.numeroCompte,
            dateDebut,
            dateFin,
            this.releveTypeOperation || null
        ).subscribe({
            next: (operations: any[]) => {
                this.releveOperations = operations;
                this.releveOperationsFetchKey = fetchKey;
                this.processReleveOperations();
                this.calculateRelevePagination();
                this.isLoadingReleve = false;
                
                // Charger les sommes des impacts OP après avoir chargé les opérations
                this.loadImpactOPSums();
            },
            error: (error: any) => {
                console.error('Erreur lors du chargement du relevé:', error);
                this.isLoadingReleve = false;
            }
        });
    }

    // Méthode pour charger les sommes des impacts OP
    loadImpactOPSums(): void {
        if (!this.selectedCompte || this.releveSoldesJournaliers.length === 0) return;

        this.impactOPSums = {};
        const dates = this.releveSoldesJournaliers.map(solde => solde.date);
        const dateDebut = dates.reduce((min, current) => current < min ? current : min);
        const dateFin = dates.reduce((max, current) => current > max ? current : max);

        this.subscription.add(
            this.impactOPService.getImpactOPs({
                codeProprietaire: this.selectedCompte.numeroCompte,
                dateDebut,
                dateFin
            }).subscribe({
                next: (impacts) => {
                    (impacts || []).forEach((impact: any) => {
                        const date = impact.dateOperation ? this.normalizeToYmd(impact.dateOperation) : '';
                        if (!date) return;
                        this.impactOPSums[date] = (this.impactOPSums[date] || 0) + (Number(impact.montant) || 0);
                    });
                },
                error: (error) => {
                    console.error('Erreur lors du chargement groupé des impacts OP:', error);
                }
            })
        );
    }

    // Méthode pour traiter les opérations du relevé (calcul des soldes, etc.)
    private processReleveOperations(): void {
        // Calculer et stocker les soldes journaliers
        const dailyBalances = this.getDailyBalances(this.releveOperations);
        this.releveSoldesJournaliers = Object.entries(dailyBalances)
            .filter(([key]) => key !== '_globalOpening')
            .map(([date, balances]) => ({
                date,
                opening: balances.opening,
                closing: balances.closing,
                closingBo: undefined, // valeur initiale
                closingManual: undefined
            }))
            // Trier du plus récent au plus ancien pour l'affichage
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        this.loadManualClosingOverrides();

        const dates = this.releveSoldesJournaliers.map(solde => solde.date);
        if (this.selectedCompte && dates.length > 0) {
            const minDate = dates.reduce((min, current) => current < min ? current : min);
            const maxDate = dates.reduce((max, current) => current > max ? current : max);
            this.subscription.add(
                this.compteService.listSoldesBo(this.selectedCompte.numeroCompte, minDate, maxDate).subscribe({
                    next: (soldesBo) => {
                        const soldeBoMap = new Map(soldesBo.map(item => [item.dateSolde, item.soldeBo]));
                        this.releveSoldesJournaliers.forEach(solde => {
                            const val = soldeBoMap.get(solde.date);
                            if (val !== null && val !== undefined) {
                                solde.closingBo = val;
                            }
                        });
                    },
                    error: (error) => {
                        console.error('Erreur lors du chargement groupé des soldes BO:', error);
                    }
                })
            );
        }

        this.calculateRelevePagination();
        this.isLoadingReleve = false;
    }

    private loadManualClosingOverrides(): void {
        if (!this.selectedCompte || this.releveSoldesJournaliers.length === 0) return;

        const dates = this.releveSoldesJournaliers.map(solde => solde.date);
        const minDate = dates.reduce((min, current) => current < min ? current : min);
        const maxDate = dates.reduce((max, current) => current > max ? current : max);

        this.compteService.listSoldesClotureManuels(this.selectedCompte.numeroCompte, minDate, maxDate)
            .subscribe({
                next: (overrides) => {
                    const overrideMap = new Map(overrides.map(item => [item.dateSolde, item.soldeCloture]));
                    this.releveSoldesJournaliers.forEach(solde => {
                        if (overrideMap.has(solde.date)) {
                            solde.closingManual = overrideMap.get(solde.date) ?? undefined;
                        } else {
                            solde.closingManual = undefined;
                        }
                    });
                },
                error: (error) => {
                    console.error('Erreur lors du chargement des soldes de clôture manuels:', error);
                }
            });
    }

    // ==========================
    // Approvisionnements - Calculs
    // ==========================
    // Paramètres ajustables (en jours)
    leadTimeDays: number = 2; // Délai de livraison par défaut
    safetyStockDaysOverride: number | null = null; // Permet de forcer le stock de sécurité (jours)
    // Choix de la base de calcul
    useMonthlyAverage: boolean = true; // Utiliser la moyenne du mois sélectionné
    selectedMonthIndex: number | null = null; // 0-11 (null => mois de référence par défaut)
    selectedYear: number | null = null;

    // Utilitaire: filtre les soldes d'un mois/année
    private filterSoldesByMonthYear(monthIndex: number, year: number) {
        if (!this.releveSoldesJournaliers || this.releveSoldesJournaliers.length === 0) return [] as typeof this.releveSoldesJournaliers;
        return this.releveSoldesJournaliers.filter(s => {
            const d = new Date(s.date);
            return d.getMonth() === monthIndex && d.getFullYear() === year;
        });
    }

    /**
     * Mois affiché par défaut pour le relevé (aligné rapport réconciliation) :
     * le 1er du mois courant → mois calendaire précédent ; à partir du 2 → mois courant.
     */
    private getDefaultReleveReportingMonth(now = new Date()): { year: number; monthIndex: number } {
        const y = now.getFullYear();
        const m = now.getMonth();
        if (now.getDate() < 2) {
            const prev = new Date(y, m - 1, 1);
            return { year: prev.getFullYear(), monthIndex: prev.getMonth() };
        }
        return { year: y, monthIndex: m };
    }

    /** Mois de référence pour les calculs (moyenne mensuelle, etc.) : même ancrage que la période par défaut du relevé */
    private get referenceMonthYear() {
        return this.getDefaultReleveReportingMonth();
    }

    // Mois/année actuellement utilisés (sélection utilisateur sinon mois de référence)
    private get currentMonthYear() {
        const ref = this.referenceMonthYear;
        return {
            monthIndex: this.selectedMonthIndex !== null ? this.selectedMonthIndex : ref.monthIndex,
            year: this.selectedYear !== null ? this.selectedYear : ref.year
        };
    }

    // Libellé du mois courant (ex: Octobre 2025)
    get referenceMonthLabel(): string {
        const { monthIndex, year } = this.currentMonthYear;
        const formatter = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
        const monthName = formatter.format(new Date(year, monthIndex, 1));
        return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
    }

    // Libellé de mois pour le sélecteur (sans année)
    getMonthLabel(monthIndex: number): string {
        const formatter = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
        const monthName = formatter.format(new Date(2000, monthIndex, 1));
        return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`;
    }

    // Moyenne journalière (globale sur l'échantillon courant)
    private get averageConsumptionPerDayGlobal(): number {
        if (!this.releveSoldesJournaliers || this.releveSoldesJournaliers.length === 0) return 0;
        const consumptions: number[] = this.releveSoldesJournaliers.map(s => Math.max(0, (s.opening || 0) - this.getEffectiveClosingValue(s)));
        const total = consumptions.reduce((sum, v) => sum + v, 0);
        return consumptions.length > 0 ? total / consumptions.length : 0;
    }

    // Moyenne journalière sur le mois sélectionné
    private get averageConsumptionPerDayMonthly(): number {
        const { monthIndex, year } = this.currentMonthYear;
        const monthSoldes = this.filterSoldesByMonthYear(monthIndex, year);
        if (!monthSoldes || monthSoldes.length === 0) return 0;
        const consumptions = monthSoldes.map(s => Math.max(0, (s.opening || 0) - this.getEffectiveClosingValue(s)));
        const total = consumptions.reduce((sum, v) => sum + v, 0);
        return consumptions.length > 0 ? total / consumptions.length : 0;
    }

    // Consommation journalière moyenne utilisée pour les calculs (mensuelle ou globale)
    get averageConsumptionPerDay(): number {
        const monthly = this.averageConsumptionPerDayMonthly;
        if (this.useMonthlyAverage && monthly > 0) return monthly;
        return this.averageConsumptionPerDayGlobal;
    }

    // Stock actuel = dernier solde de clôture (ou closingBo si disponible)
    get currentStockAmount(): number {
        if (!this.releveSoldesJournaliers || this.releveSoldesJournaliers.length === 0) return 0;
        // Les soldes sont triés du plus récent au plus ancien
        const latest = this.releveSoldesJournaliers[0];
        const closing = (latest.closingManual ?? latest.closingBo ?? latest.closing) || 0;
        return closing;
    }

    // Jours de stock disponible
    get stockDays(): number {
        const avg = this.averageConsumptionPerDay;
        if (avg <= 0) return 0;
        return +(this.currentStockAmount / avg).toFixed(1);
    }

    // Écart-type quotidien (pour estimer l'incertitude) -> converti en jours
    private get dailyConsumptionStdDevDays(): number {
        const { monthIndex, year } = this.currentMonthYear;
        const soldes = (this.useMonthlyAverage ? this.filterSoldesByMonthYear(monthIndex, year) : this.releveSoldesJournaliers) || [];
        if (soldes.length < 2) return 0;
        const consumptions = soldes.map(s => Math.max(0, (s.opening || 0) - this.getEffectiveClosingValue(s)));
        const avg = this.averageConsumptionPerDay || 0;
        if (avg <= 0) return 0;
        const variance = consumptions.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (consumptions.length - 1);
        const stdDev = Math.sqrt(variance);
        return +(stdDev / avg).toFixed(1); // convertir en jours
    }

    // Stock de sécurité (en jours)
    get safetyStockDays(): number {
        if (this.safetyStockDaysOverride !== null) return this.safetyStockDaysOverride;
        // Heuristique par défaut: 1 écart-type en jours, min 1 jour, max 7 jours
        const days = Math.max(1, Math.min(7, this.dailyConsumptionStdDevDays || 1));
        return +days.toFixed(1);
    }

    // Point de réapprovisionnement (en jours) = délai + stock de sécurité
    get reorderPointDays(): number {
        return +(Math.max(0, (this.leadTimeDays || 0)) + (this.safetyStockDays || 0)).toFixed(1);
    }

    // Quantité recommandée (en jours): viser au moins (reorderPointDays + safetyStockDays)
    // Si stockDays < reorderPointDays, recommander pour remonter à reorderPointDays + safety
    get recommendedDays(): number {
        const targetDays = this.reorderPointDays + this.safetyStockDays;
        const deficit = Math.max(0, targetDays - this.stockDays);
        return +deficit.toFixed(1);
    }

    // Conversion de jours -> montant
    get recommendedQuantityAmount(): number {
        const qty = (this.recommendedDays || 0) * (this.averageConsumptionPerDay || 0);
        return +qty.toFixed(2);
    }

    // Méthode pour recalculer le solde de clôture après validation d'une opération
    public recalculateClosingBalance(): void {
        if (this.releveOperations && this.releveOperations.length > 0) {
            // Recalculer les soldes journaliers
            this.processReleveOperations();
        }
    }

    calculateRelevePagination(): void {
        this.releveCurrentPage = 1;
        if (this.showSoldesSeulement) {
            this.releveTotalPages = Math.ceil(this.releveSoldesDisplayRows.length / this.relevePageSize);
        } else if (this.releveOperationsViewMode !== 'day') {
            this.releveTotalPages = Math.max(1, Math.ceil(this.releveOperationsGroupedSummary.length / this.relevePageSize));
        } else {
            const allOperations = this.getFlattenedReleveOperations();
            this.releveTotalPages = Math.ceil(allOperations.length / this.relevePageSize);
        }
    }

    get pagedReleveOperations(): Operation[] {
        const allOperations = this.getFlattenedReleveOperations();
        
        // Calculer l'index de début et de fin pour la pagination des lignes
        const startIndex = (this.releveCurrentPage - 1) * this.relevePageSize;
        const endIndex = startIndex + this.relevePageSize;
        
        // Extraire les lignes pour la page courante
        return allOperations.slice(startIndex, endIndex);
    }

    // Méthode pour grouper les opérations du relevé avec leurs frais
    getGroupedReleveOperations(): Array<{main: Operation, frais: Operation[]}> {
        if (this.releveOperations.length === 0) {
            this.invalidateReleveOperationCaches();
            return [];
        }

        if (this.groupedReleveOperationsCache.length === 0) {
            const grouped = this.buildGroupedReleveOperations();
            this.groupedReleveOperationsCache = grouped;
            this.flattenedReleveOperationsCache = grouped.flatMap(group => [group.main, ...group.frais]);
        }

        return this.groupedReleveOperationsCache;
    }

    private buildGroupedReleveOperations(): Array<{main: Operation, frais: Operation[]}> {
        return this.buildGroupedReleveOperationsFrom(this.releveOperations);
    }

    private buildGroupedReleveOperationsFrom(operations: Operation[]): Array<{main: Operation, frais: Operation[]}> {
        const grouped: Array<{main: Operation, frais: Operation[]}> = [];
        const operationsMap = new Map<number, {main: Operation | null, frais: Operation[]}>();

        operations.forEach(op => {
            if (op.typeOperation === 'FRAIS_TRANSACTION') {
                const parentId = op.parentOperationId;
                if (parentId) {
                    if (!operationsMap.has(parentId)) {
                        operationsMap.set(parentId, { main: null, frais: [] });
                    }
                    const group = operationsMap.get(parentId);
                    if (group) {
                        group.frais.push(op);
                    }
                }
            } else if (op.id) {
                if (!operationsMap.has(op.id)) {
                    operationsMap.set(op.id, { main: op, frais: [] });
                } else {
                    const group = operationsMap.get(op.id);
                    if (group) {
                        group.main = op;
                    }
                }
            }
        });

        operationsMap.forEach(group => {
            if (group.main) {
                const sortedFrais = group.frais.sort((a, b) =>
                    new Date(b.dateOperation).getTime() - new Date(a.dateOperation).getTime()
                );

                grouped.push({
                    main: group.main,
                    frais: sortedFrais
                });
            }
        });

        return grouped.sort((a, b) =>
            new Date(b.main.dateOperation).getTime() - new Date(a.main.dateOperation).getTime()
        );
    }

    private getFlattenedReleveOperations(): Operation[] {
        if (this.releveOperations.length === 0) {
            this.invalidateReleveOperationCaches();
            return [];
        }

        if (this.flattenedReleveOperationsCache.length === 0) {
            // Assure que le cache groupé est construit et synchronise le cache aplati
            const grouped = this.getGroupedReleveOperations();
            this.flattenedReleveOperationsCache = grouped.flatMap(group => [group.main, ...group.frais]);
        }

        return this.flattenedReleveOperationsCache;
    }

    private invalidateReleveOperationCaches(): void {
        this.groupedReleveOperationsCache = [];
        this.flattenedReleveOperationsCache = [];
    }

    private getAbsoluteReleveOperationIndex(indexOnPage: number): number {
        const startIndex = (this.releveCurrentPage - 1) * this.relevePageSize;
        return startIndex + indexOnPage;
    }

    // Méthode pour vérifier si une opération du relevé a des frais associés
    hasAssociatedFraisReleve(operation: Operation): boolean {
        if (!operation.id) return false;
        
        // Vérifier s'il y a des frais associés à cette opération dans le relevé
        return this.releveOperations.some(op => 
            op.typeOperation === 'FRAIS_TRANSACTION' && 
            op.parentOperationId === operation.id
        );
    }

    // Méthode pour déterminer si on doit afficher automatiquement les frais dans le relevé
    shouldShowFraisAutomaticallyReleve(selectedType: string): boolean {
        if (!selectedType || selectedType === '') {
            return false;
        }
        
        // Types d'opérations qui doivent afficher automatiquement leurs frais
        const typesWithFrais = [
            'total_cashin',
            'total_paiement', 
            'transaction_cree',
            'annulation_bo'
        ];
        
        // Vérifier si le type sélectionné est dans la liste
        return typesWithFrais.includes(selectedType);
    }

    get pagedReleveSoldes(): DailySolde[] {
        const startIndex = (this.releveCurrentPage - 1) * this.relevePageSize;
        const endIndex = startIndex + this.relevePageSize;
        return this.releveSoldesJournaliers.slice(startIndex, endIndex);
    }

    /** Clé de semaine (date du lundi YYYY-MM-DD) pour une date YYYY-MM-DD */
    private getWeekKey(dateStr: string): string {
        const d = new Date(dateStr + 'T12:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.getFullYear(), d.getMonth(), diff);
        const y = monday.getFullYear();
        const m = String(monday.getMonth() + 1).padStart(2, '0');
        const dayNum = String(monday.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayNum}`;
    }

    /** Clé mois pour une date YYYY-MM-DD */
    private getMonthKey(dateStr: string): string {
        return dateStr.slice(0, 7);
    }

    /** Libellé de semaine (ex. "Semaine du 03/02 - 09/02/2025") */
    private getWeekLabel(dateStrStart: string, dateStrEnd: string): string {
        const fmt = (s: string) => {
            const d = new Date(s + 'T12:00:00');
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };
        return `Semaine du ${fmt(dateStrStart)} - ${fmt(dateStrEnd)}`;
    }

    /** Libellé de mois (ex. "Février 2025") */
    private getMonthLabelFromKey(monthKey: string): string {
        const [y, m] = monthKey.split('-').map(Number);
        const formatter = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
        const name = formatter.format(new Date(y, m - 1, 1));
        return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
    }

    /** Liste unifiée des lignes à afficher (journalier, hebdo ou mensuel) */
    get releveSoldesDisplayRows(): ReleveSoldeDisplayRow[] {
        if (!this.releveSoldesJournaliers || this.releveSoldesJournaliers.length === 0) return [];
        if (this.releveSoldeViewMode === 'day') {
            return this.releveSoldesJournaliers.map(s => ({
                periodLabel: this.formatDate(s.date).split(' ')[0],
                opening: s.opening,
                closing: s.closing,
                closingBo: s.closingBo,
                closingManual: s.closingManual,
                ecartRef: s
            }));
        }
        if (this.releveSoldeViewMode === 'week') {
            const byWeek = new Map<string, DailySolde[]>();
            this.releveSoldesJournaliers.forEach(s => {
                const key = this.getWeekKey(s.date);
                if (!byWeek.has(key)) byWeek.set(key, []);
                byWeek.get(key)!.push(s);
            });
            return Array.from(byWeek.entries())
                .map(([key, days]) => {
                    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];
                    return {
                        periodLabel: this.getWeekLabel(first.date, last.date),
                        opening: first.opening,
                        closing: last.closing,
                        closingBo: last.closingBo,
                        closingManual: last.closingManual,
                        ecartRef: last
                    };
                })
                .sort((a, b) => (b.ecartRef.date).localeCompare(a.ecartRef.date));
        }
        // month
        const byMonth = new Map<string, DailySolde[]>();
        this.releveSoldesJournaliers.forEach(s => {
            const key = this.getMonthKey(s.date);
            if (!byMonth.has(key)) byMonth.set(key, []);
            byMonth.get(key)!.push(s);
        });
        return Array.from(byMonth.entries())
            .map(([key, days]) => {
                const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                return {
                    periodLabel: this.getMonthLabelFromKey(key),
                    opening: first.opening,
                    closing: last.closing,
                    closingBo: last.closingBo,
                    closingManual: last.closingManual,
                    ecartRef: last
                };
            })
            .sort((a, b) => (b.ecartRef.date).localeCompare(a.ecartRef.date));
    }

    get pagedReleveSoldesDisplay(): ReleveSoldeDisplayRow[] {
        const rows = this.releveSoldesDisplayRows;
        const startIndex = (this.releveCurrentPage - 1) * this.relevePageSize;
        const endIndex = startIndex + this.relevePageSize;
        return rows.slice(startIndex, endIndex);
    }

    /** Solde de clôture effectif pour une ligne d'affichage (manuel > BO > calculé) */
    getEffectiveClosingFromRow(row: ReleveSoldeDisplayRow): number {
        if (row.closingManual !== undefined && row.closingManual !== null) return row.closingManual;
        return row.closing ?? 0;
    }

    hasManualClosingOverrideRow(row: ReleveSoldeDisplayRow): boolean {
        return row.closingManual !== undefined && row.closingManual !== null;
    }

    prevRelevePage(): void {
        if (this.releveCurrentPage > 1) {
            this.releveCurrentPage--;
        }
    }

    nextRelevePage(): void {
        if (this.releveCurrentPage < this.releveTotalPages) {
            this.releveCurrentPage++;
        }
    }

    goToRelevePage(page: number): void {
        if (page >= 1 && page <= this.releveTotalPages) {
            this.releveCurrentPage = page;
        }
    }

    getVisibleRelevePages(): number[] {
        const totalPages = this.releveTotalPages;
        const currentPage = this.releveCurrentPage;
        const maxVisible = 5;
        
        if (totalPages <= maxVisible) {
            return Array.from({length: totalPages}, (_, i) => i + 1);
        }
        
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        return Array.from({length: end - start + 1}, (_, i) => start + i);
    }

    getOperationTypeLabel(type: string): string {
        const labels: { [key: string]: string } = {
            'total_cashin': 'Total Cash-in',
            'total_paiement': 'Total Paiement',
            'Appro_client': 'Appro_client',
            'ajustement': 'Ajustement',
            'Compense_client': 'Compense_client',
            'frais_transaction': 'Frais Transaction',
            'annulation_partenaire': 'Annulation Partenaire',
            'annulation_bo': 'Annulation BO',
            'transaction_cree': 'Transaction Dénouée'
        };
        return labels[type] || type;
    }

    getOperationTypeClass(type: string): string {
        const classes: { [key: string]: string } = {
            'total_cashin': 'type-cashin',
            'total_paiement': 'type-paiement',
            'Appro_client': 'type-appro',
            'ajustement': 'type-ajustement',
            'Compense_client': 'type-compense',
            'frais_transaction': 'type-frais',
            'annulation_partenaire': 'type-annulation',
            'annulation_bo': 'type-annulation-bo',
            'transaction_cree': 'type-transaction-cree'
        };
        return classes[type] || '';
    }

    async exportReleve(): Promise<void> {
        if (!this.selectedCompte) return;

        const exportOps = this.getReleveOperationsForExport();
        const exportSoldes = this.getReleveSoldesForExport();

        if (this.showSoldesSeulement && exportSoldes.length === 0) {
            await this.popupService.showWarning('Aucun solde à exporter pour cet intervalle.', 'Export impossible');
            return;
        }
        if (!this.showSoldesSeulement && exportOps.length === 0) {
            const hint = this.getReleveExportIntervalLabel()
                ? `Aucune opération entre ${this.getReleveExportIntervalLabel()}.`
                : 'Aucune opération à exporter.';
            await this.popupService.showWarning(hint, 'Export impossible');
            return;
        }

        if (this.showAllDataReleve && !this.releveDateDebutCustom && !this.releveDateFinCustom) {
            const confirmAll = await this.popupService.showConfirm(
                'Aucun intervalle Du/Au n\'est défini : l\'export inclura toutes les opérations chargées. Renseignez Du et Au pour limiter l\'export à une période.',
                'Exporter tout l\'historique ?'
            );
            if (!confirmAll) return;
        }

        if (this.releveDateDebutCustom && this.releveDateFinCustom && this.releveDateDebutCustom > this.releveDateFinCustom) {
            await this.popupService.showWarning('La date de début doit être antérieure ou égale à la date de fin.', 'Intervalle invalide');
            return;
        }

        this.isExporting = true;
        try {
            if (this.showSoldesSeulement) {
                this.exportReleveSoldes();
            } else if (this.releveOperationsViewMode !== 'day') {
                this.exportReleveOperationsGrouped();
            } else {
                this.exportReleveComplet();
            }
        } catch (error) {
            console.error("Erreur lors de l'export du relevé :", error);
            await this.popupService.showError('Une erreur est survenue lors de l\'export du relevé.', 'Erreur d\'export');
        } finally {
            this.isExporting = false;
        }
    }

    private exportReleveSoldes(): void {
        if (!this.selectedCompte) return;

        const viewLabel = this.releveSoldeViewMode === 'day' ? 'Journaliers' : (this.releveSoldeViewMode === 'week' ? 'Hebdomadaires' : 'Mensuels');
        const soldesForExport = this.getReleveSoldesForExport();
        const rows = this.releveSoldesDisplayRows.filter(row => {
                const { dateDebut, dateFin } = this.getExportDateFilters();
                if (!dateDebut && !dateFin) return true;
                const ref = row.ecartRef?.date || row.periodLabel;
                const ymd = this.normalizeToYmd(ref);
                if (!ymd) return true;
                if (dateDebut && ymd < dateDebut) return false;
                if (dateFin && ymd > dateFin) return false;
                return true;
            });

        if (rows.length > 0 && this.releveSoldeViewMode !== 'day') {
            this.exportReleveSoldesGrouped(rows, viewLabel);
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Soldes ${viewLabel}`);

        worksheet.addRow(['Numéro de compte', 'Date', 'Solde d\'ouverture', 'Solde de clôture', 'Variation', 'Solde de Clôture BO', 'Ecart de solde', 'Ecart régularisé']);
        worksheet.addRow(['Intervalle', this.getReleveExportIntervalLabel() || 'Complet', '', '', '', '', '', '']);

        soldesForExport.forEach(solde => {
          const closingValue = this.getEffectiveClosingValue(solde);
          const variation = closingValue - solde.opening;
          const ecart = this.getEcartValue(solde);
          const impactOP = this.getImpactOPValue(solde);
          const row = worksheet.addRow([
            this.selectedCompte?.numeroCompte || '',
            this.formatDate(solde.date).split(' ')[0],
            solde.opening,
            closingValue,
            variation,
            solde.closingBo !== undefined ? solde.closingBo : '',
            ecart,
            impactOP
          ]);

          // Appliquer les couleurs
          if (solde.closingBo !== undefined) {
            const closing = Math.round(closingValue * 100) / 100;
            const closingBo = Math.round(solde.closingBo * 100) / 100;
            if (closing === closingBo) {
              // Les deux en vert
              row.getCell(4).fill = row.getCell(6).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD0FFD0' } // Vert clair
              };
              row.getCell(4).font = row.getCell(6).font = { color: { argb: 'FF2E7D32' }, bold: true };
            } else {
              // Clôture en noir, BO en rouge
              row.getCell(4).font = { color: { argb: 'FF222222' }, bold: true };
              row.getCell(6).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFD0D0' } // Rouge clair
              };
              row.getCell(6).font = { color: { argb: 'FFC62828' }, bold: true };
            }
          }

          // Appliquer les couleurs pour la colonne Ecart de solde
          const tolerance = 0.01; // 1 centime de tolérance
          if (Math.abs(ecart) <= tolerance) {
            row.getCell(7).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE8F5E8' } // Vert clair amélioré
            };
            row.getCell(7).font = { color: { argb: 'FF2E7D32' }, bold: true };
          } else if (ecart > 0) {
            row.getCell(7).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF3E0' } // Orange clair amélioré
            };
            row.getCell(7).font = { color: { argb: 'FFF57C00' }, bold: true };
          } else {
            row.getCell(7).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFEBEE' } // Rouge clair amélioré
            };
            row.getCell(7).font = { color: { argb: 'FFC62828' }, bold: true };
          }

          // Appliquer les couleurs pour la colonne Ecart régularisé
          if (Math.abs(impactOP) <= tolerance) {
            row.getCell(8).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE8F5E8' } // Vert clair amélioré
            };
            row.getCell(8).font = { color: { argb: 'FF2E7D32' }, bold: true };
          } else if (impactOP > 0) {
            row.getCell(8).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF3E0' } // Orange clair amélioré
            };
            row.getCell(8).font = { color: { argb: 'FFF57C00' }, bold: true };
          } else {
            row.getCell(8).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFEBEE' } // Rouge clair amélioré
            };
            row.getCell(8).font = { color: { argb: 'FFC62828' }, bold: true };
          }
        });

        // Largeurs de colonnes
        worksheet.columns = [
          { width: 20 },  // Numéro de compte
          { width: 15 },  // Date
          { width: 20 },  // Solde d'ouverture
          { width: 20 },  // Solde de clôture
          { width: 20 },  // Variation
          { width: 20 },  // Solde de Clôture BO
          { width: 20 },  // Ecart de solde
          { width: 20 }   // Ecart régularisé
        ];

        // Style de l'en-tête
        worksheet.getRow(1).eachCell(cell => {
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        });

        workbook.xlsx.writeBuffer().then(buffer => {
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          saveAs(
            blob,
            `releve_soldes_${this.selectedCompte?.numeroCompte || 'compte'}_${this.getReleveExportFileSuffix()}.xlsx`
          );
        });
    }

    private exportReleveSoldesGrouped(rows: ReleveSoldeDisplayRow[], viewLabel: string): void {
        if (!this.selectedCompte) return;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Soldes ${viewLabel}`);

        worksheet.addRow(['Numéro de compte', 'Période', 'Solde d\'ouverture', 'Solde de clôture', 'Variation', 'Solde de Clôture BO', 'Ecart de solde', 'Ecart régularisé']);

        rows.forEach(row => {
            const closingValue = this.getEffectiveClosingFromRow(row);
            const variation = closingValue - row.opening;
            const ecart = this.getEcartValue(row.ecartRef);
            const impactOP = this.getImpactOPValue(row.ecartRef);
            const xlRow = worksheet.addRow([
                this.selectedCompte?.numeroCompte || '',
                row.periodLabel,
                row.opening,
                closingValue,
                variation,
                row.closingBo !== undefined ? row.closingBo : '',
                ecart,
                impactOP
            ]);

            const tolerance = 0.01;
            // Couleurs variation
            xlRow.getCell(5).font = { color: { argb: variation >= 0 ? 'FF2E7D32' : 'FFC62828' }, bold: true };
            // Couleurs écart
            if (Math.abs(ecart) <= tolerance) {
                xlRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E8' } };
                xlRow.getCell(7).font = { color: { argb: 'FF2E7D32' }, bold: true };
            } else if (ecart > 0) {
                xlRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
                xlRow.getCell(7).font = { color: { argb: 'FFF57C00' }, bold: true };
            } else {
                xlRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
                xlRow.getCell(7).font = { color: { argb: 'FFC62828' }, bold: true };
            }
            // Couleurs impact OP
            if (Math.abs(impactOP) <= tolerance) {
                xlRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E8' } };
                xlRow.getCell(8).font = { color: { argb: 'FF2E7D32' }, bold: true };
            } else if (impactOP > 0) {
                xlRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
                xlRow.getCell(8).font = { color: { argb: 'FFF57C00' }, bold: true };
            } else {
                xlRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
                xlRow.getCell(8).font = { color: { argb: 'FFC62828' }, bold: true };
            }
        });

        worksheet.columns = [
            { width: 20 }, { width: 25 }, { width: 20 }, { width: 20 },
            { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }
        ];
        worksheet.getRow(1).eachCell(cell => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        });

        const suffix = this.releveSoldeViewMode === 'week' ? 'hebdomadaires' : 'mensuels';
        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `releve_soldes_${suffix}_${this.selectedCompte?.numeroCompte || 'compte'}_${this.getReleveExportFileSuffix()}.xlsx`);
        });
    }

    private exportReleveOperationsGrouped(): void {
        const exportOps = this.getReleveOperationsForExport();
        if (!this.selectedCompte || exportOps.length === 0) return;

        const groups = this.buildReleveOperationsGroupedSummaryFrom(exportOps);
        const modeLabel = this.releveOperationsViewMode === 'week' ? 'Hebdomadaire' : 'Mensuel';
        const suffix = this.releveOperationsViewMode === 'week' ? 'hebdomadaire' : 'mensuel';

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Historique ${modeLabel}`);

        // En-tête info
        worksheet.addRow([`RELEVÉ DE COMPTE — VUE ${modeLabel.toUpperCase()}`]);
        worksheet.addRow([]);
        worksheet.addRow(['Numéro de compte:', this.selectedCompte.numeroCompte, '', 'Solde actuel:', this.selectedCompte.solde]);
        worksheet.addRow(['Intervalle:', this.getReleveExportIntervalLabel() || 'Complet', '', '', '']);
        worksheet.addRow([]);

        // En-tête tableau
        const headerRow = worksheet.addRow(['Période', 'Nb opérations', 'Total Débits', 'Total Crédits', 'Variation', 'Solde d\'ouverture', 'Solde de clôture']);
        headerRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
        });

        let grandTotalDebit = 0;
        let grandTotalCredit = 0;

        groups.forEach(group => {
            const xlRow = worksheet.addRow([
                group.periodLabel,
                group.operations.length,
                group.totalDebit,
                group.totalCredit,
                group.variation,
                group.opening,
                group.closing
            ]);
            grandTotalDebit += group.totalDebit;
            grandTotalCredit += group.totalCredit;

            xlRow.getCell(3).font = { color: { argb: 'FFC62828' } };
            xlRow.getCell(4).font = { color: { argb: 'FF2E7D32' } };
            xlRow.getCell(5).font = { color: { argb: group.variation >= 0 ? 'FF2E7D32' : 'FFC62828' }, bold: true };
            xlRow.getCell(6).font = { color: { argb: 'FF1976D2' } };
            xlRow.getCell(7).font = { color: { argb: 'FF1976D2' }, bold: true };
        });

        // Totaux
        worksheet.addRow([]);
        const totalRow = worksheet.addRow([
            'TOTAL',
            exportOps.length,
            grandTotalDebit,
            grandTotalCredit,
            Math.round((grandTotalCredit - grandTotalDebit) * 100) / 100,
            '', ''
        ]);
        totalRow.eachCell(cell => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        });

        worksheet.columns = [
            { width: 28 }, { width: 16 }, { width: 20 }, { width: 20 },
            { width: 20 }, { width: 20 }, { width: 20 }
        ];

        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `releve_operations_${suffix}_${this.selectedCompte?.numeroCompte || 'compte'}_${this.getReleveExportFileSuffix()}.xlsx`);
        });
    }

    private exportReleveComplet(): void {
        const exportOps = this.getReleveOperationsForExport();
        if (!this.selectedCompte || exportOps.length === 0) return;

        // Créer un tableau complet avec en-tête et données
        const tableData = [];
        // En-tête avec informations du compte
        tableData.push(['RELEVÉ DE COMPTE', '', '', '', '', '', '']);
        tableData.push(['', '', '', '', '', '', '']);
        tableData.push(['Numéro de compte:', this.selectedCompte.numeroCompte, '', 'Solde actuel:', this.selectedCompte.solde, '', '']);
        tableData.push(['Pays:', this.selectedCompte.pays, '', 'Code propriétaire:', this.selectedCompte.codeProprietaire || '-', '', '']);
        tableData.push(['Dernière mise à jour:', this.formatDate(this.selectedCompte.dateDerniereMaj), '', '', '', '', '']);
        tableData.push(['', '', '', '', '', '', '']);
        tableData.push([this.getReleveExportFilterInfo(), '', '', '', '', '', '']);
        tableData.push(['', '', '', '', '', '', '']);
        // En-tête du tableau des opérations
        tableData.push([
            'Date',
            'Type d\'opération',
            'Débit',
            'Crédit',
            'Solde avant',
            'Solde après',
            'Service'
        ]);
        const allOperations = this.getFlattenedReleveOperationsForExport();
        const dailyBalances = this.getDailyBalances(exportOps);
        let lastDate = '';
        allOperations.forEach((op, idx) => {
            const date = op.dateOperation ? op.dateOperation.split('T')[0] : '';
            if (date && date !== lastDate) {
                // Ligne solde d'ouverture
                tableData.push([
                    this.formatDate(date),
                    'Solde d\'ouverture',
                    '', '',
                    this.formatMontant(dailyBalances[date]?.opening ?? ''),
                    '', ''
                ]);
                // Ligne d'espacement
                tableData.push(['', '', '', '', '', '', '']);
                lastDate = date;
            }
            // Calcul Débit/Crédit selon la logique métier (exclusif)
            let debit = '';
            let credit = '';
            if (op.typeOperation.startsWith('annulation_')) {
                // Logique spéciale pour les opérations d'annulation (impact inverse)
                if (this.isAnnulationDebit(op)) {
                    debit = this.formatMontant(op.montant);
                } else if (this.isAnnulationCredit(op)) {
                    credit = this.formatMontant(op.montant);
                }
            } else if (this.isFraisTransactionCredit(op)) {
                credit = this.formatMontant(op.montant);
            } else if (this.isFraisTransactionDebit(op)) {
                debit = this.formatMontant(op.montant);
            } else if (this.isCreditOperation(op.typeOperation, op.service, op.montant)) {
                credit = this.formatMontant(op.montant);
            } else if (this.isDebitOperation(op.typeOperation, op.service, op.montant)) {
                debit = this.formatMontant(op.montant);
            }
            tableData.push([
                this.formatDate(op.dateOperation),
                this.getOperationTypeLabel(op.typeOperation),
                debit,
                credit,
                this.formatMontant(op.soldeAvant),
                this.formatMontant(op.soldeApres),
                op.service || '-'
            ]);
            // Ajout de la ligne de solde de clôture UNIQUEMENT si c'est la dernière opération de la journée
            const isLastOfDay = idx === allOperations.length - 1 ||
                (allOperations[idx + 1] && (allOperations[idx + 1].dateOperation ? allOperations[idx + 1].dateOperation.split('T')[0] : '') !== date);
            if (isLastOfDay) {
                // Ligne d'espacement avant
                tableData.push(['', '', '', '', '', '', '']);
                tableData.push([
                    this.formatDate(date),
                    'Solde de clôture',
                    '', '',
                    this.formatMontant(dailyBalances[date]?.closing ?? ''),
                    '', ''
                ]);
                // Ligne d'espacement après
                tableData.push(['', '', '', '', '', '', '']);
            }
        });
        // Ajouter un résumé en bas
        tableData.push(['', '', '', '', '', '', '']);
        tableData.push(['RÉSUMÉ', '', '', '', '', '', '']);
        tableData.push(['Total opérations:', allOperations.length, '', '', '', '', '']);

        // Calculs totaux par type et totaux débit/crédit
        const totalsByType: { [type: string]: { debit: number, credit: number } } = {};
        let totalDebit = 0;
        let totalCredit = 0;
        allOperations.forEach(op => {
            const { debit, credit } = this.getDebitCreditForOperation(op);
            const typeLabel = this.getOperationTypeLabel(op.typeOperation);
            if (!totalsByType[typeLabel]) totalsByType[typeLabel] = { debit: 0, credit: 0 };
            totalsByType[typeLabel].debit += debit;
            totalsByType[typeLabel].credit += credit;
            totalDebit += debit;
            totalCredit += credit;
        });
        Object.entries(totalsByType).forEach(([type, total]) => {
            tableData.push([
                `Total ${type}:`,
                '',
                this.formatMontant(total.debit),
                this.formatMontant(total.credit),
                '', '', ''
            ]);
        });
        tableData.push(['', '', '', '', '', '', '']);
        tableData.push(['Total Débit:', this.formatMontant(totalDebit), '', '', '', '', '']);
        tableData.push(['Total Crédit:', this.formatMontant(totalCredit), '', '', '', '', '']);
        tableData.push(['Différence (Débit - Crédit):', this.formatMontant(Math.abs(totalDebit - totalCredit)), '', '', '', '', '']);
        if (exportOps.length > 0) {
            const exportDaily = this.getDailyBalances(exportOps);
            const exportDates = Object.keys(exportDaily).filter(d => d !== '_globalOpening').sort();
            const exportFirstDate = exportDates[0];
            const exportLastDate = exportDates[exportDates.length - 1];
            const exportOpening = exportFirstDate ? (exportDaily[exportFirstDate]?.opening ?? 0) : 0;
            let exportClosing = exportLastDate ? (exportDaily[exportLastDate]?.closing ?? 0) : 0;
            if (exportLastDate) {
                const solde = this.getReleveSoldesForExport().find(s => this.normalizeToYmd(s.date) === exportLastDate);
                if (solde) exportClosing = this.getEffectiveClosingValue(solde);
            }
            tableData.push(['', '', '', '', '', '', '']);
            tableData.push([
                `Solde d'ouverture global (${exportFirstDate || '-'}):`,
                this.formatMontant(exportOpening), '', '', '', '', ''
            ]);
            tableData.push([
                `Solde de clôture global (${exportLastDate || '-'}):`,
                this.formatMontant(exportClosing), '', '', '', '', ''
            ]);
            tableData.push([
                'Différence solde ouverture/clôture:',
                this.formatMontant(Math.abs(exportClosing - exportOpening)), '', '', '', '', ''
            ]);
            const ecart = Math.abs(totalDebit - totalCredit) - Math.abs(exportClosing - exportOpening);
            tableData.push(['ECART:', this.formatMontant(ecart), '', '', '', '', '']);
        }
        // Formater toutes les lignes du tableau
        const formattedTableData = tableData.map(row => row.map(cell => this.formatMontant(cell)));
        // Créer la feuille Excel avec le tableau formaté
        const ws = XLSX.utils.aoa_to_sheet(formattedTableData);
        // Appliquer des styles (couleur en-tête et lignes de solde global)
        if (!ws['!rows']) ws['!rows'] = [];
        ws['!rows'][0] = { hpt: 20 };
        for (let c = 0; c < formattedTableData[0].length; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
            if (cell) cell.s = { fill: { fgColor: { rgb: 'D9E1F2' } }, font: { bold: true } };
        }
        for (let r = formattedTableData.length - 3; r < formattedTableData.length; r++) {
            for (let c = 0; c < formattedTableData[r].length; c++) {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                if (cell) cell.s = { fill: { fgColor: { rgb: 'E2EFDA' } }, font: { bold: true } };
            }
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relevé de compte');
        // Sauvegarder le fichier
        const fileName = `releve_compte_${this.selectedCompte.numeroCompte}_${this.getReleveExportFileSuffix()}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    // Ajout d'une méthode utilitaire pour grouper les opérations par date et calculer les soldes d'ouverture/clôture
    getDailyBalances(operations: Operation[]): { [date: string]: { opening: number, closing: number } } {
        const grouped: { [date: string]: Operation[] } = {};
        operations.forEach(op => {
            const date = op.dateOperation ? op.dateOperation.split('T')[0] : '';
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(op);
        });
        const result: { [date: string]: { opening: number, closing: number } } = {};
        let globalOpeningSet = false;
        let globalOpening = 0;
        Object.entries(grouped).forEach(([date, ops], idx) => {
            // Inclure toutes les opérations (y compris les annulations) pour le calcul du solde de clôture
            // Les opérations d'annulation font partie de l'historique et affectent le solde
            const opsValides = ops.filter(op => op.statut !== 'Rejetée');
            
            if (opsValides.length === 0) {
                // Si toutes les opérations sont annulées, utiliser le solde d'ouverture
                const sorted = ops.slice().sort((a, b) => {
                    const tA = new Date(a.dateOperation).getTime();
                    const tB = new Date(b.dateOperation).getTime();
                    if (tA !== tB) return tA - tB;
                    return (a.id || 0) - (b.id || 0);
                });
                const firstTotalOp = sorted.find(op => op.typeOperation === 'total_cashin' || op.typeOperation === 'total_paiement');
                let opening = sorted[0]?.soldeAvant ?? 0;
                if (firstTotalOp) {
                    opening = firstTotalOp.soldeAvant ?? opening;
                }
                if (!globalOpeningSet && firstTotalOp) {
                    globalOpening = firstTotalOp.soldeAvant ?? 0;
                    globalOpeningSet = true;
                } else if (!globalOpeningSet && sorted[0]) {
                    globalOpening = sorted[0].soldeAvant ?? 0;
                    globalOpeningSet = true;
                }
                result[date] = {
                    opening: opening,
                    closing: opening // Solde de clôture = solde d'ouverture si toutes les opérations sont annulées
                };
            } else {
                // Trier les opérations valides par date/heure puis par ID pour garantir l'ordre chronologique
                const sorted = opsValides.slice().sort((a, b) => {
                    const tA = new Date(a.dateOperation).getTime();
                    const tB = new Date(b.dateOperation).getTime();
                    if (tA !== tB) return tA - tB;
                    return (a.id || 0) - (b.id || 0);
                });
                // Chercher la première opération de type total_cashin ou total_paiement
                const firstTotalOp = sorted.find(op => op.typeOperation === 'total_cashin' || op.typeOperation === 'total_paiement');
                let opening = sorted[0]?.soldeAvant ?? 0;
                if (firstTotalOp) {
                    opening = firstTotalOp.soldeAvant ?? opening;
                }
                if (!globalOpeningSet && firstTotalOp) {
                    globalOpening = firstTotalOp.soldeAvant ?? 0;
                    globalOpeningSet = true;
                } else if (!globalOpeningSet && sorted[0]) {
                    globalOpening = sorted[0].soldeAvant ?? 0;
                    globalOpeningSet = true;
                }
                // Le solde de clôture est toujours le soldeApres de la dernière opération valide du jour
                // Trier par date/heure pour s'assurer que la dernière opération est vraiment la dernière chronologiquement
                const lastOperation = sorted[sorted.length - 1];
                const closingBalance = lastOperation?.soldeApres ?? 0;
                
                result[date] = {
                    opening: opening,
                    closing: closingBalance
                };
            }
        });
        (result as any)._globalOpening = globalOpening;
        return result;
    }

    getEffectiveClosingValue(solde: DailySolde): number {
        if (solde.closingManual !== undefined && solde.closingManual !== null) {
            return solde.closingManual;
        }
        return solde.closing ?? 0;
    }

    hasManualClosingOverride(solde: DailySolde): boolean {
        return solde.closingManual !== undefined && solde.closingManual !== null;
    }

    hasManualOverrideFor(date: string): boolean {
        const solde = this.releveSoldesJournaliers.find(s => s.date === date);
        return solde ? this.hasManualClosingOverride(solde) : false;
    }

    // Helpers pour l'affichage UI du relevé
    getOpDate(op: Operation): string {
        return op.dateOperation ? op.dateOperation.split('T')[0] : '';
    }
    shouldShowOpeningBalance(op: Operation, i: number): boolean {
        const allOperations = this.getFlattenedReleveOperations();
        if (allOperations.length === 0) return false;

        const absoluteIndex = this.getAbsoluteReleveOperationIndex(i);
        const currentOp = allOperations[absoluteIndex];
        if (!currentOp) return false;

        if (absoluteIndex === 0) return true;

        const prevOp = allOperations[absoluteIndex - 1];
        if (!prevOp) return true;

        return this.getOpDate(currentOp) !== this.getOpDate(prevOp);
    }
    shouldShowClosingBalance(op: Operation, i: number): boolean {
        const allOperations = this.getFlattenedReleveOperations();
        if (allOperations.length === 0) return false;

        const absoluteIndex = this.getAbsoluteReleveOperationIndex(i);
        const currentOp = allOperations[absoluteIndex];
        if (!currentOp) return false;

        if (absoluteIndex === allOperations.length - 1) return true;

        const nextOp = allOperations[absoluteIndex + 1];
        if (!nextOp) return true;

        return this.getOpDate(currentOp) !== this.getOpDate(nextOp);
    }

    // Détermine si une opération est un débit
    isDebitOperation(type: string, service?: string, montant?: number): boolean {
        if (type === 'transaction_cree') {
            if (service && service.toLowerCase().includes('cashin')) return true;
            if (service && service.toLowerCase().includes('paiement')) return false;
            // Par défaut pour transaction_cree, considérer comme un débit si le service n'est pas reconnu
            return true;
        }
        if (type === 'Compense_client') return true;
        if (type === 'Compense_fournisseur') return true;
        if (type === 'ajustement') return montant !== undefined && montant < 0;
        if (type === 'nivellement') return montant !== undefined && montant < 0;
        if (type === 'régularisation_solde') return montant !== undefined && montant < 0;
        if (type === 'bo') {
            // Pour les opérations BO, la logique dépend du service
            if (service && service.toLowerCase().includes('cashin')) return true;
            if (service && service.toLowerCase().includes('paiement')) return false;
            // Par défaut, considérer comme un débit
            return true;
        }
        if (type === 'partenaire') {
            // Pour les opérations partenaire, considérer comme un débit
            return true;
        }
        return [
            'total_cashin',
            'FRAIS_TRANSACTION'
        ].includes(type);
    }

    // Détermine si une opération est un crédit
    isCreditOperation(type: string, service?: string, montant?: number): boolean {
        if (type === 'transaction_cree') {
            if (service && service.toLowerCase().includes('paiement')) return true;
            if (service && service.toLowerCase().includes('cashin')) return false;
            // Par défaut pour transaction_cree, ne pas considérer comme un crédit si le service n'est pas reconnu
            return false;
        }
        if (type === 'Appro_client') return true;
        if (type === 'Appro_fournisseur') return true;
        if (type === 'ajustement') return montant !== undefined && montant >= 0;
        if (type === 'nivellement') return montant !== undefined && montant >= 0;
        if (type === 'régularisation_solde') return montant !== undefined && montant >= 0;
        if (type === 'bo') {
            // Pour les opérations BO, la logique dépend du service
            if (service && service.toLowerCase().includes('paiement')) return true;
            if (service && service.toLowerCase().includes('cashin')) return false;
            // Par défaut, considérer comme un crédit
            return false;
        }
        if (type === 'partenaire') {
            // Pour les opérations partenaire, considérer comme un crédit
            return false;
        }
        return [
            'total_paiement'
        ].includes(type);
    }

    // Détermine si un FRAIS_TRANSACTION doit être affiché en crédit (cas parent annulation)
    isFraisTransactionCredit(operation: Operation): boolean {
        if (operation.typeOperation !== 'FRAIS_TRANSACTION') return false;
        // Chercher le parent dans la liste des opérations du relevé
        const parent = this.releveOperations.find(op => op.id === operation.parentOperationId);
        return !!(parent && parent.typeOperation.startsWith('annulation_'));
    }

    // Détermine si un FRAIS_TRANSACTION doit être affiché en débit (tous sauf parent annulation)
    isFraisTransactionDebit(operation: Operation): boolean {
        if (operation.typeOperation !== 'FRAIS_TRANSACTION') return false;
        // Chercher le parent dans la liste des opérations du relevé
        const parent = this.releveOperations.find(op => op.id === operation.parentOperationId);
        return !(parent && parent.typeOperation.startsWith('annulation_'));
    }

    // Détermine si une opération d'annulation doit être affichée en débit (impact inverse)
    isAnnulationDebit(operation: Operation): boolean {
        if (!operation.typeOperation.startsWith('annulation_')) return false;
        
        // Extraire le type d'origine (enlever le préfixe 'annulation_')
        const typeOrigine = operation.typeOperation.substring(11); // 'annulation_'.length = 11
        
        // Si l'opération d'origine était un crédit, l'annulation doit être un débit
        return this.isCreditOperation(typeOrigine, operation.service, operation.montant);
    }

    // Détermine si une opération d'annulation doit être affichée en crédit (impact inverse)
    isAnnulationCredit(operation: Operation): boolean {
        if (!operation.typeOperation.startsWith('annulation_')) return false;
        
        // Extraire le type d'origine (enlever le préfixe 'annulation_')
        const typeOrigine = operation.typeOperation.substring(11); // 'annulation_'.length = 11
        
        // Si l'opération d'origine était un débit, l'annulation doit être un crédit
        return this.isDebitOperation(typeOrigine, operation.service, operation.montant);
    }

    // Retourne la première date du relevé (formatée AAAA-MM-JJ)
    getGlobalOpeningBalanceDate(): string | undefined {
        const dates = Object.keys(this.getDailyBalances(this.releveOperations)).filter(d => d !== '_globalOpening').sort();
        return dates[0];
    }
    // Retourne la dernière date du relevé (formatée AAAA-MM-JJ)
    getGlobalClosingBalanceDate(): string | undefined {
        const dates = Object.keys(this.getDailyBalances(this.releveOperations)).filter(d => d !== '_globalOpening').sort();
        return dates[dates.length - 1];
    }
    // Retourne le solde d'ouverture global (première date)
    getGlobalOpeningBalance(): number {
        const daily = this.getDailyBalances(this.releveOperations);
        const firstDate = this.getGlobalOpeningBalanceDate();
        return firstDate ? daily[firstDate]?.opening ?? 0 : 0;
    }
    // Retourne le solde de clôture global (dernière date)
    getGlobalClosingBalance(): number {
        const lastDate = this.getGlobalClosingBalanceDate();
        if (lastDate) {
            const solde = this.releveSoldesJournaliers.find(s => s.date === lastDate);
            if (solde) {
                return this.getEffectiveClosingValue(solde);
            }
            const daily = this.getDailyBalances(this.releveOperations);
            return daily[lastDate]?.closing ?? 0;
        }
        return 0;
    }

    // Ajout d'une méthode utilitaire pour formater les montants
    formatMontant(val: any): string {
        if (typeof val === 'number') {
            return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return val ?? '';
    }

    formatClosingBalance(val: any): string {
        const numericValue = typeof val === 'number' ? val : Number(val);
        if (Number.isFinite(numericValue)) {
            return numericValue.toLocaleString('fr-FR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            });
        }
        return val ?? '';
    }

    // Ajout de la fonction utilitaire pour calculer le débit/crédit d'une opération
    getDebitCreditForOperation(op: Operation): { debit: number, credit: number } {
        let debit = 0;
        let credit = 0;
        if (op.typeOperation.startsWith('annulation_')) {
            if (this.isAnnulationDebit(op)) {
                debit = typeof op.montant === 'number' ? op.montant : parseFloat(op.montant || '0');
            } else if (this.isAnnulationCredit(op)) {
                credit = typeof op.montant === 'number' ? op.montant : parseFloat(op.montant || '0');
            }
        } else if (this.isFraisTransactionCredit(op)) {
            credit = typeof op.montant === 'number' ? op.montant : parseFloat(op.montant || '0');
        } else if (this.isFraisTransactionDebit(op)) {
            debit = typeof op.montant === 'number' ? op.montant : parseFloat(op.montant || '0');
        } else if (this.isCreditOperation(op.typeOperation, op.service, op.montant)) {
            credit = typeof op.montant === 'number' ? op.montant : parseFloat(op.montant || '0');
        } else if (this.isDebitOperation(op.typeOperation, op.service, op.montant)) {
            debit = typeof op.montant === 'number' ? op.montant : parseFloat(op.montant || '0');
        }
        return { debit, credit };
    }

    // Synthèse débits / crédits / variation pour l'historique des opérations du relevé
    get releveTotalDebits(): number {
        const ops = this.getFlattenedReleveOperations();
        return ops.reduce((sum, op) => sum + this.getDebitCreditForOperation(op).debit, 0);
    }
    get releveTotalCredits(): number {
        const ops = this.getFlattenedReleveOperations();
        return ops.reduce((sum, op) => sum + this.getDebitCreditForOperation(op).credit, 0);
    }
    get releveVariation(): number {
        return Math.round((this.releveTotalCredits - this.releveTotalDebits) * 100) / 100;
    }
    get releveTotalMouvements(): number {
        return this.releveTotalDebits + this.releveTotalCredits;
    }
    get relevePercentDebits(): number {
        const total = this.releveTotalMouvements;
        return total === 0 ? 0 : Math.round((this.releveTotalDebits / total) * 10000) / 100;
    }
    get relevePercentCredits(): number {
        const total = this.releveTotalMouvements;
        return total === 0 ? 0 : Math.round((this.releveTotalCredits / total) * 10000) / 100;
    }
    get relevePercentVariation(): number {
        const total = this.releveTotalMouvements;
        return total === 0 ? 0 : Math.round((this.releveVariation / total) * 10000) / 100;
    }

    /** Résumé groupé des opérations par jour/semaine/mois pour la vue "Historique" */
    get releveOperationsGroupedSummary(): Array<{periodLabel: string; operations: Operation[]; totalDebit: number; totalCredit: number; variation: number; opening: number; closing: number}> {
        return this.buildReleveOperationsGroupedSummaryFrom(this.getFlattenedReleveOperations());
    }

    private buildReleveOperationsGroupedSummaryFrom(
        ops: Operation[]
    ): Array<{periodLabel: string; operations: Operation[]; totalDebit: number; totalCredit: number; variation: number; opening: number; closing: number}> {
        if (ops.length === 0) return [];

        const groupKey = (op: Operation): string => {
            const date = this.getOpDate(op);
            if (this.releveOperationsViewMode === 'week') return this.getWeekKey(date);
            if (this.releveOperationsViewMode === 'month') return this.getMonthKey(date);
            return date;
        };
        const groupLabel = (key: string, operations: Operation[]): string => {
            if (this.releveOperationsViewMode === 'week') {
                const dates = operations.map(o => this.getOpDate(o)).sort();
                return this.getWeekLabel(dates[0], dates[dates.length - 1]);
            }
            if (this.releveOperationsViewMode === 'month') return this.getMonthLabelFromKey(key);
            return key;
        };

        const grouped = new Map<string, Operation[]>();
        ops.forEach(op => {
            const k = groupKey(op);
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k)!.push(op);
        });

        return Array.from(grouped.entries())
            .map(([key, groupOps]) => {
                const totalDebit = groupOps.reduce((s, o) => s + this.getDebitCreditForOperation(o).debit, 0);
                const totalCredit = groupOps.reduce((s, o) => s + this.getDebitCreditForOperation(o).credit, 0);
                const sorted = [...groupOps].sort((a, b) => new Date(a.dateOperation).getTime() - new Date(b.dateOperation).getTime());
                return {
                    periodLabel: groupLabel(key, groupOps),
                    operations: sorted,
                    totalDebit: Math.round(totalDebit * 100) / 100,
                    totalCredit: Math.round(totalCredit * 100) / 100,
                    variation: Math.round((totalCredit - totalDebit) * 100) / 100,
                    opening: sorted[0]?.soldeAvant ?? 0,
                    closing: sorted[sorted.length - 1]?.soldeApres ?? 0
                };
            })
            .sort((a, b) => {
                const da = a.operations[0]?.dateOperation ?? '';
                const db = b.operations[0]?.dateOperation ?? '';
                return db.localeCompare(da);
            });
    }

    get pagedReleveOperationsGrouped(): Array<{periodLabel: string; operations: Operation[]; totalDebit: number; totalCredit: number; variation: number; opening: number; closing: number}> {
        const all = this.releveOperationsGroupedSummary;
        const start = (this.releveCurrentPage - 1) * this.relevePageSize;
        return all.slice(start, start + this.relevePageSize);
    }

    onReleveOperationsViewModeChange(mode: 'day' | 'week' | 'month'): void {
        this.releveOperationsViewMode = mode;
        this.calculateRelevePagination();
    }

    // Résumé global pour le footer (comptes filtrés)
    get resumeGlobal() {
      let totalSolde = 0;
      for (const compte of this.comptes) {
        totalSolde += compte.solde || 0;
      }
      return {
        count: this.comptes.length,
        totalSolde
      };
    }

    updateClosingBo(index: number, value: number) {
        this.pagedReleveSoldes[index].closingBo = value;
    }

    openSoldeBoModal(compte: Compte) {
      this.selectedCompteForBo = compte;
      // Par défaut J-1
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      this.dateSoldeBo = yesterday.toISOString().split('T')[0];
      this.showSoldeBoModal = true;
      this.loadSoldeBoForDate();
    }

    onDateSoldeBoChange() {
      this.loadSoldeBoForDate();
    }

    loadSoldeBoForDate() {
      if (this.selectedCompteForBo && this.dateSoldeBo) {
        this.compteService.getSoldeBo(this.selectedCompteForBo.numeroCompte, this.dateSoldeBo).subscribe(val => {
          this.dernierSoldeBo = val;
        });
      }
    }

    closeSoldeBoModal() {
      this.showSoldeBoModal = false;
      this.selectedCompteForBo = null;
      this.dernierSoldeBo = null;
    }

    saveSoldeBo() {
      if (this.selectedCompteForBo && this.dernierSoldeBo !== null && this.dateSoldeBo) {
        console.log('🔄 Enregistrement du solde BO...', {
          numeroCompte: this.selectedCompteForBo.numeroCompte,
          dateSolde: this.dateSoldeBo,
          soldeBo: this.dernierSoldeBo
        });
        
        this.compteService.setSoldeBo(this.selectedCompteForBo.numeroCompte, this.dateSoldeBo, this.dernierSoldeBo)
          .subscribe({
            next: (response) => {
              console.log('✅ Solde BO enregistré avec succès:', response);
              this.popupService.showSuccess('Solde BO enregistré !');
              this.closeSoldeBoModal();
            },
            error: (error) => {
              console.error('❌ Erreur lors de l\'enregistrement du solde BO:', error);
              this.popupService.showError(`Erreur lors de l'enregistrement : ${error.message || error.error?.message || 'Erreur inconnue'}`);
            }
          });
      } else {
        console.warn('⚠️ Données manquantes pour l\'enregistrement du solde BO:', {
          selectedCompteForBo: this.selectedCompteForBo,
          dernierSoldeBo: this.dernierSoldeBo,
          dateSoldeBo: this.dateSoldeBo
        });
        this.popupService.showWarning('Veuillez remplir tous les champs requis');
      }
    }

    /** Télécharge un CSV modèle (UTF-8 BOM, séparateur ;) pour renseigner les soldes BO en masse. */
    downloadSoldeBoTemplate(): void {
        const sep = ';';
        const headers = ['Date', 'Numéro de compte', 'Montant'];
        const example = [`2026-04-29`, `CASBT0025`, `35386986.54`];
        const bom = '\ufeff';
        const csv = bom + [headers.join(sep), example.join(sep)].join('\r\n');
        saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `modele_solde_bo_${new Date().toISOString().split('T')[0]}.csv`);
    }

    onSoldeBoBulkFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        const name = file.name.toLowerCase();
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            this.importSoldeBoBulkFromExcel(file);
        } else {
            this.importSoldeBoBulkFromCsv(file);
        }
    }

    private normalizeHeaderKey(h: string): string {
        return h
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
    }

    private cellToDisplayString(val: unknown): string {
        if (val == null || val === '') {
            return '';
        }
        if (val instanceof Date) {
            const y = val.getFullYear();
            const m = val.getMonth() + 1;
            const d = val.getDate();
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        if (typeof val === 'number') {
            return String(val);
        }
        return String(val).trim();
    }

    /** Extrait les 3 colonnes attendues (libellés français du modèle). */
    private extractSoldeBoBulkFields(row: Record<string, unknown>): { dateRaw: string; numero: string; montantRaw: string } | null {
        let dateRaw = '';
        let numero = '';
        let montantRaw = '';
        for (const [key, val] of Object.entries(row)) {
            const nk = this.normalizeHeaderKey(key);
            const s = this.cellToDisplayString(val);
            if (nk === 'date') {
                dateRaw = s;
            } else if (nk === 'numero de compte' || nk === 'numero compte') {
                numero = s.trim();
            } else if (nk === 'montant') {
                montantRaw = s;
            }
        }
        if (!dateRaw && !numero && !montantRaw) {
            return null;
        }
        return { dateRaw, numero, montantRaw };
    }

    private parseMontantFrancais(raw: string): number | null {
        if (raw == null || raw === '') {
            return null;
        }
        let t = raw.replace(/\s/g, '').replace(/'/g, '');
        if (t.includes(',') && t.includes('.')) {
            if (t.lastIndexOf(',') > t.lastIndexOf('.')) {
                t = t.replace(/\./g, '').replace(',', '.');
            } else {
                t = t.replace(/,/g, '');
            }
        } else if (t.includes(',')) {
            t = t.replace(',', '.');
        }
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }

    /** Retourne une date yyyy-MM-dd pour l’API ou null. */
    private parseSoldeBoDateToIso(raw: string): string | null {
        const s = raw.trim();
        if (!s) {
            return null;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return s;
        }
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
            const d = Number(m[1]);
            const mo = Number(m[2]);
            const y = Number(m[3]);
            const dt = new Date(y, mo - 1, d);
            if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
                return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            }
        }
        return null;
    }

    private importSoldeBoBulkFromCsv(file: File): void {
        Papa.parse<Record<string, unknown>>(file, {
            header: true,
            skipEmptyLines: 'greedy',
            encoding: 'UTF-8',
            delimiter: '', // détection automatique (; ou , selon le fichier / Excel)
            complete: (results) => {
                if (results.errors?.length) {
                    console.warn('Parsing CSV soldes BO:', results.errors);
                }
                const rows = (results.data || []) as Record<string, unknown>[];
                this.processSoldeBoBulkRows(rows);
            },
            error: (err: Error) => {
                console.error(err);
                this.popupService.showError(`Impossible de lire le fichier CSV : ${err.message || 'erreur inconnue'}`);
            }
        });
    }

    private importSoldeBoBulkFromExcel(file: File): void {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = new Uint8Array(reader.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
                this.processSoldeBoBulkRows(json);
            } catch (e) {
                console.error(e);
                this.popupService.showError('Impossible de lire le fichier Excel (vérifiez le format du modèle).');
            }
        };
        reader.onerror = () => this.popupService.showError('Erreur de lecture du fichier.');
        reader.readAsArrayBuffer(file);
    }

    private processSoldeBoBulkRows(rows: Record<string, unknown>[]): void {
        type ParsedLine = { isoDate: string; numero: string; montant: number; line: number };
        const parsed: ParsedLine[] = [];
        const validationErrors: string[] = [];

        rows.forEach((row, i) => {
            const line = i + 2;
            const fields = this.extractSoldeBoBulkFields(row);
            if (!fields) {
                return;
            }
            const { dateRaw, numero, montantRaw } = fields;
            const allEmpty = !dateRaw && !numero && !montantRaw;
            if (allEmpty) {
                return;
            }
            const iso = this.parseSoldeBoDateToIso(dateRaw);
            const montant = this.parseMontantFrancais(montantRaw);
            const rowErrors: string[] = [];
            if (!iso) {
                rowErrors.push(`date invalide (« ${dateRaw} »)`);
            }
            if (!numero) {
                rowErrors.push('numéro de compte manquant');
            }
            if (montant === null) {
                rowErrors.push(`montant invalide (« ${montantRaw} »)`);
            }
            if (rowErrors.length) {
                validationErrors.push(`Ligne ${line} : ${rowErrors.join(', ')}`);
                return;
            }
            parsed.push({ isoDate: iso!, numero, montant: montant!, line });
        });

        if (!parsed.length) {
            const hint = validationErrors.length
                ? validationErrors.slice(0, 8).join('\n')
                : 'Colonnes attendues : Date, Numéro de compte, Montant (CSV séparateur ; ou Excel).';
            this.popupService.showError(`Aucune ligne importable.\n${hint}`);
            return;
        }

        let ok = 0;
        let fail = 0;
        const apiErrors: string[] = [...validationErrors];
        this.isImportingSoldeBoBulk = true;

        from(parsed)
            .pipe(
                concatMap((item) =>
                    this.compteService.setSoldeBo(item.numero, item.isoDate, item.montant).pipe(
                        tap(() => ok++),
                        catchError((err: unknown) => {
                            fail++;
                            const httpErr = err as { error?: { message?: string }; message?: string };
                            const msg =
                                httpErr?.error?.message ||
                                httpErr?.message ||
                                'erreur réseau ou serveur';
                            apiErrors.push(`Ligne ${item.line} (${item.numero}) : ${msg}`);
                            return EMPTY;
                        })
                    )
                ),
                finalize(() => {
                    this.isImportingSoldeBoBulk = false;
                    const parts = [`${ok} solde(s) BO enregistré(s)`];
                    if (fail > 0) {
                        parts.push(`${fail} échec(s)`);
                    }
                    if (validationErrors.length > 0) {
                        parts.push(`${validationErrors.length} ligne(s) ignorée(s) avant envoi`);
                    }
                    if (fail === 0 && validationErrors.length === 0) {
                        this.popupService.showSuccess(parts.join('. ') + '.');
                    } else if (ok > 0) {
                        this.popupService.showWarning(parts.join('. ') + '. Détail dans la console (F12).');
                        console.warn('[Import soldes BO]', apiErrors);
                    } else {
                        this.popupService.showError(parts.join('. ') + '.');
                        console.warn('[Import soldes BO]', apiErrors);
                    }
                })
            )
            .subscribe();
    }

    openClosingOverrideModal(solde: DailySolde) {
      this.closingOverrideDate = solde.date;
      this.closingOverrideValue = this.getEffectiveClosingValue(solde);
      this.showClosingOverrideModal = true;
    }

    closeClosingOverrideModal() {
      this.showClosingOverrideModal = false;
      this.closingOverrideDate = '';
      this.closingOverrideValue = null;
      this.closingOverrideLoading = false;
    }

    saveClosingOverride() {
      if (!this.selectedCompte || !this.closingOverrideDate) {
        this.popupService.showWarning('Aucun compte ou date sélectionné');
        return;
      }
      const value = this.closingOverrideValue !== null ? Number(this.closingOverrideValue) : NaN;
      if (isNaN(value)) {
        this.popupService.showWarning('Veuillez saisir un solde valide');
        return;
      }

      this.closingOverrideLoading = true;
      this.compteService.setSoldeClotureManuel(this.selectedCompte.numeroCompte, this.closingOverrideDate, value)
        .subscribe({
          next: () => {
            const solde = this.releveSoldesJournaliers.find(s => s.date === this.closingOverrideDate);
            if (solde) {
              solde.closingManual = value;
            }
            this.closingOverrideValue = value;
            this.popupService.showSuccess('Solde de clôture mis à jour.');
            this.closingOverrideLoading = false;
            this.closeClosingOverrideModal();
          },
          error: (error) => {
            console.error('Erreur lors de la sauvegarde du solde manuel:', error);
            this.popupService.showError(`Impossible d'enregistrer : ${error.message || 'Erreur inconnue'}`);
            this.closingOverrideLoading = false;
          }
        });
    }

    removeClosingOverride() {
      if (!this.selectedCompte || !this.closingOverrideDate) {
        return;
      }
      this.closingOverrideLoading = true;
      this.compteService.deleteSoldeClotureManuel(this.selectedCompte.numeroCompte, this.closingOverrideDate)
        .subscribe({
          next: () => {
            const solde = this.releveSoldesJournaliers.find(s => s.date === this.closingOverrideDate);
            if (solde) {
              solde.closingManual = undefined;
            }
            this.popupService.showSuccess('Correction supprimée.');
            this.closingOverrideLoading = false;
            this.closeClosingOverrideModal();
          },
          error: (error) => {
            console.error('Erreur lors de la suppression du solde manuel:', error);
            this.popupService.showError(`Impossible de supprimer : ${error.message || 'Erreur inconnue'}`);
            this.closingOverrideLoading = false;
          }
        });
    }

    round2(val: any): number {
      return Math.round(+val * 100) / 100;
    }

    // Méthode pour calculer la valeur de l'écart entre les deux soldes de clôture
    getEcartValue(solde: DailySolde): number {
      if (solde.closingBo === undefined || solde.closingBo === null) {
        return 0; // Pas d'écart si pas de solde BO
      }
      // Arrondir l'écart à 2 décimales
      return Math.round((this.getEffectiveClosingValue(solde) - solde.closingBo) * 100) / 100;
    }

    // Méthode pour déterminer la classe CSS de l'écart
    getEcartClass(solde: DailySolde): string {
      if (solde.closingBo === undefined || solde.closingBo === null) {
        return ''; // Pas de classe si pas de solde BO
      }
      
      const ecart = this.getEcartValue(solde);
      // Utiliser une tolérance pour considérer les écarts très proches de 0 comme nuls
      const tolerance = 0.01; // 1 centime de tolérance
      
      if (Math.abs(ecart) <= tolerance) {
        return 'ecart-zero'; // Écart nul (vert)
      } else if (ecart > 0) {
        return 'ecart-positive'; // Écart positif (orange)
      } else {
        return 'ecart-negative'; // Écart négatif (rouge)
      }
    }

    // Navigation vers la page ecart de solde avec filtres
    navigateToEcartSolde(solde: DailySolde): void {
        if (!this.selectedCompte) return;
        
        // Configurer les données pour l'onglet écart de solde
        this.ecartSoldeAgence = this.selectedCompte.numeroCompte;
        this.ecartSoldeDateTransaction = solde.date;
        
        // Basculer vers l'onglet écart de solde
        this.activeTab = 'ecart-solde';
        this.showEcartSoldeTab = true;
    }

    // Méthode pour calculer la valeur de l'Ecart régularisé
    getImpactOPValue(solde: DailySolde): number {
        // Utiliser le cache si disponible
        if (this.impactOPSums[solde.date] !== undefined) {
            // Inverser le signe : positif devient négatif, négatif devient positif
            return -this.impactOPSums[solde.date];
        }
        
        // Si pas dans le cache, retourner 0 pour l'instant
        // TODO: Implémenter la récupération depuis le backend
        return 0;
    }

    // Méthode pour déterminer la classe CSS de l'Ecart régularisé
    getImpactOPClass(solde: DailySolde): string {
        const impactOP = this.getImpactOPValue(solde);
        const tolerance = 0.01; // 1 centime de tolérance
        
        if (Math.abs(impactOP) <= tolerance) {
            return 'impact-op-zero'; // Ecart régularisé nul (vert)
        } else if (impactOP > 0) {
            return 'impact-op-positive'; // Ecart régularisé positif (orange)
        } else {
            return 'impact-op-negative'; // Ecart régularisé négatif (rouge)
        }
    }

    // Navigation vers la page Ecart régularisé avec filtres
    navigateToImpactOP(solde: DailySolde): void {
        if (!this.selectedCompte) return;
        
        // Configurer les données pour l'onglet Ecart régularisé
        this.impactOPAgence = this.selectedCompte.numeroCompte;
        this.impactOPDateTransaction = solde.date;
        
        // Basculer vers l'onglet Ecart régularisé
        this.activeTab = 'impact-op';
        this.showImpactOPTab = true;
    }

    switchTab(tabName: string): void {
        this.activeTab = tabName;
        if (tabName === 'ecart-solde') {
            this.showEcartSoldeTab = true;
            // Charger les données de revenu journalier si elles ne sont pas déjà chargées
            if (this.revenuJournalierData.length === 0 && this.selectedCompte && this.releveOperations.length > 0) {
                this.loadRevenuJournalier();
            }
        } else if (tabName === 'impact-op') {
            this.showImpactOPTab = true;
        } else if (tabName === 'revenu-journalier') {
            this.showRevenuJournalierTab = true;
            this.loadRevenuJournalier();
        } else if (tabName === 'control-revenu') {
            this.showControlRevenuTab = true;
            this.loadControlRevenu();
        } else if (tabName === 'ecart-frais') {
            this.showEcartFraisTab = true;
            // si une date est déjà sélectionnée, s'assurer que les données sont présentes
            if (this.ecartFraisDate && this.selectedCompte && this.ecartFraisItems.length === 0) {
                this.fetchEcartFraisData(this.selectedCompte.numeroCompte, this.ecartFraisDate);
            }
        }
    }

    // Méthodes pour l'onglet Revenu Journalier
    loadRevenuJournalier(): void {
        if (!this.selectedCompte || this.releveOperations.length === 0) return;

        const dates = this.releveOperations
            .map(op => op.dateOperation ? this.normalizeToYmd(op.dateOperation) : '')
            .filter(Boolean);
        const dateDebut = dates.length > 0 ? dates.reduce((min, current) => current < min ? current : min) : '';
        const dateFin = dates.length > 0 ? dates.reduce((max, current) => current > max ? current : max) : '';
        const fetchKey = [this.selectedCompte.numeroCompte, dateDebut, dateFin, this.releveOperationsFetchKey].join('|');
        if (fetchKey === this.revenuJournalierFetchKey && this.revenuJournalierData.length > 0) {
            this.applyRevenuJournalierFilters();
            return;
        }

        this.isLoadingRevenuJournalier = true;
        this.revenuJournalierData = [];
        this.revenuJournalierDataFiltered = [];

        // Grouper les opérations par date
        const operationsByDate: { [date: string]: Operation[] } = {};
        this.releveOperations.forEach(op => {
            const date = op.dateOperation ? this.normalizeToYmd(op.dateOperation) : '';
            if (!operationsByDate[date]) {
                operationsByDate[date] = [];
            }
            operationsByDate[date].push(op);
        });

        const agence = this.selectedCompte.numeroCompte || '';
        const finishWithFraisByDate = (fraisByDate: Map<string, number>) => {
            Object.entries(operationsByDate).forEach(([date, operations]) => {
                let totalCashin = 0;
                let totalPaiement = 0;
                let fraisCashin = 0;
                let fraisPaiement = 0;

                operations.forEach(op => {
                    if (op.typeOperation === 'total_cashin') {
                        totalCashin += op.montant || 0;
                    } else if (op.typeOperation === 'total_paiement') {
                        totalPaiement += op.montant || 0;
                    } else if (op.typeOperation === 'FRAIS_TRANSACTION') {
                        const service = op.service?.toUpperCase() || '';
                        if (service.includes('CASHIN')) {
                            fraisCashin += op.montant || 0;
                        } else if (service.includes('PAIEMENT')) {
                            fraisPaiement += op.montant || 0;
                        }
                    }
                });

                const revenuTotal = fraisCashin + fraisPaiement;
                this.revenuJournalierData.push({
                    date,
                    totalCashin,
                    totalPaiement,
                    fraisCashin,
                    fraisPaiement,
                    revenuTotal,
                    ecartFrais: fraisByDate.get(date) || 0
                });
            });

            this.revenuJournalierData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            this.revenuJournalierFetchKey = fetchKey;
            this.applyRevenuJournalierFilters();
            this.isLoadingRevenuJournalier = false;
        };

        if (!agence || !dateDebut || !dateFin) {
            finishWithFraisByDate(new Map<string, number>());
            return;
        }

        this.trxSfService.getTrxSfs({ agence, dateDebut, dateFin, statut: 'EN_ATTENTE' }).subscribe({
            next: (rows) => {
                const fraisByDate = new Map<string, number>();
                (rows || []).forEach(row => {
                    const date = row.dateTransaction ? this.normalizeToYmd(row.dateTransaction) : '';
                    if (!date) return;
                    fraisByDate.set(date, (fraisByDate.get(date) || 0) + (row.frais || 0));
                });
                finishWithFraisByDate(fraisByDate);
            },
            error: (error) => {
                console.error('Erreur lors du chargement groupé des frais SF:', error);
                finishWithFraisByDate(new Map<string, number>());
            }
        });
    }

    // Naviguer vers l'onglet Écart Frais (date/agence) depuis Revenu Journalier
    navigateToEcartFrais(date: string): void {
        try { console.log('[ECART_FRAIS][NAV] click date raw =', date); } catch {}
        if (!this.selectedCompte) return;
        const agence = this.selectedCompte.numeroCompte || '';
        const normalizedDate = this.normalizeToYmd(date);
        try { console.log('[ECART_FRAIS][NAV] agence =', agence, 'normalizedDate =', normalizedDate); } catch {}
        this.ecartFraisDate = normalizedDate;
        this.ecartFraisAgence = agence;
        this.activeTab = 'ecart-frais';
        this.showEcartFraisTab = true;
        this.fetchEcartFraisData(agence, normalizedDate);
    }

    private fetchEcartFraisData(agence: string, date: string): void {
        const day = this.normalizeToYmd(date);
        const fetchKey = `${agence}|${day}|EN_ATTENTE`;
        if (fetchKey === this.ecartFraisFetchKey && this.ecartFraisItems.length > 0) {
            this.calculateEcartFraisPagination();
            return;
        }

        this.isLoadingEcartFrais = true;
        this.ecartFraisItems = [];
        this.ecartFraisFilteredItems = [];
        try { console.log('[ECART_FRAIS][REQ] getTrxSfs params =', { agence, dateDebut: day, dateFin: day, statut: 'EN_ATTENTE' }); } catch {}
        this.trxSfService.getTrxSfs({ agence, dateDebut: day, dateFin: day, statut: 'EN_ATTENTE' }).subscribe({
            next: (rows) => {
                try {
                    console.log('[ECART_FRAIS][RESP] rows length =', (rows || []).length);
                    if (rows && rows.length > 0) {
                        const sampleDates = rows.slice(0, 3).map(r => r.dateTransaction);
                        console.log('[ECART_FRAIS][RESP] sample dateTransaction =', sampleDates);
                    }
                } catch {}
                this.ecartFraisItems = rows || [];
                this.ecartFraisFilteredItems = [...this.ecartFraisItems];
                this.ecartFraisFetchKey = fetchKey;
                this.isLoadingEcartFrais = false;
                this.calculateEcartFraisPagination();
            },
            error: () => {
                try { console.error('[ECART_FRAIS][ERR] getTrxSfs error for params =', { agence, dateDebut: day, dateFin: day, statut: 'EN_ATTENTE' }); } catch {}
                this.ecartFraisItems = [];
                this.ecartFraisFilteredItems = [];
                this.isLoadingEcartFrais = false;
                this.calculateEcartFraisPagination();
            }
        });
    }

    // Total des frais TRX SF listés dans le popup
    getTotalFraisEcartTrxSf(): number {
        return (this.ecartFraisItems || []).reduce((sum, it) => sum + (it.frais || 0), 0);
    }

    // Total des montants TRX SF listés dans l'onglet Écart Frais
    getTotalMontantEcartTrxSf(): number {
        return (this.ecartFraisItems || []).reduce((sum, it) => sum + (it.montant || 0), 0);
    }

    // Pagination Écart Frais
    private     calculateEcartFraisPagination(): void {
        this.ecartFraisCurrentPage = 1;
        const total = this.ecartFraisFilteredItems.length;
        this.ecartFraisTotalPages = Math.max(1, Math.ceil(total / this.ecartFraisPageSize));
    }

    get pagedEcartFraisItems(): import('../../services/trx-sf.service').TrxSfData[] {
        const startIndex = (this.ecartFraisCurrentPage - 1) * this.ecartFraisPageSize;
        const endIndex = startIndex + this.ecartFraisPageSize;
        return (this.ecartFraisFilteredItems || []).slice(startIndex, endIndex);
    }

    prevEcartFraisPage(): void {
        if (this.ecartFraisCurrentPage > 1) {
            this.ecartFraisCurrentPage--;
        }
    }

    nextEcartFraisPage(): void {
        if (this.ecartFraisCurrentPage < this.ecartFraisTotalPages) {
            this.ecartFraisCurrentPage++;
        }
    }

    goToEcartFraisPage(page: number): void {
        if (page >= 1 && page <= this.ecartFraisTotalPages) {
            this.ecartFraisCurrentPage = page;
        }
    }

    onChangeEcartFraisPageSize(size: number): void {
        this.ecartFraisPageSize = size;
        this.calculateEcartFraisPagination();
    }

    getVisibleEcartFraisPages(): number[] {
        const totalPages = this.ecartFraisTotalPages;
        const currentPage = this.ecartFraisCurrentPage;
        const maxVisible = 5;
        if (totalPages <= maxVisible) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    // Nouvelles méthodes pour l'amélioration UX
    onEcartFraisSearch(): void {
        this.applyEcartFraisFilters();
    }

    onEcartFraisFilterChange(): void {
        this.applyEcartFraisFilters();
    }

    clearEcartFraisFilters(): void {
        this.ecartFraisSearchTerm = '';
        this.ecartFraisStatusFilter = '';
        this.ecartFraisServiceFilter = '';
        this.applyEcartFraisFilters();
    }

    applyEcartFraisFilters(): void {
        let filtered = [...this.ecartFraisItems];

        // Filtre par terme de recherche
        if (this.ecartFraisSearchTerm) {
            const searchTerm = this.ecartFraisSearchTerm.toLowerCase();
            filtered = filtered.filter(item => 
                item.idTransaction?.toLowerCase().includes(searchTerm) ||
                item.service?.toLowerCase().includes(searchTerm) ||
                item.agence?.toLowerCase().includes(searchTerm) ||
                item.numeroTransGu?.toLowerCase().includes(searchTerm) ||
                item.pays?.toLowerCase().includes(searchTerm)
            );
        }

        // Filtre par statut
        if (this.ecartFraisStatusFilter) {
            filtered = filtered.filter(item => item.statut === this.ecartFraisStatusFilter);
        }

        // Filtre par service
        if (this.ecartFraisServiceFilter) {
            filtered = filtered.filter(item => item.service === this.ecartFraisServiceFilter);
        }

        // Tri
        if (this.ecartFraisSortField) {
            filtered.sort((a, b) => {
                let aValue = a[this.ecartFraisSortField as keyof typeof a];
                let bValue = b[this.ecartFraisSortField as keyof typeof b];

                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();

                if (aValue < bValue) return this.ecartFraisSortDirection === 'asc' ? -1 : 1;
                if (aValue > bValue) return this.ecartFraisSortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        this.ecartFraisFilteredItems = filtered;
        this.ecartFraisCurrentPage = 1;
        this.calculateEcartFraisPagination();
    }

    sortEcartFrais(field: string): void {
        if (this.ecartFraisSortField === field) {
            this.ecartFraisSortDirection = this.ecartFraisSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.ecartFraisSortField = field;
            this.ecartFraisSortDirection = 'asc';
        }
        this.applyEcartFraisFilters();
    }

    getSortIcon(field: string): string {
        if (this.ecartFraisSortField !== field) {
            return 'fa-sort';
        }
        return this.ecartFraisSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
    }

    getUniqueServicesEcartFrais(): string[] {
        const services = [...new Set(this.ecartFraisItems.map(item => item.service))];
        return services.filter(service => service && service.trim() !== '');
    }

    getTransactionIdPrefix(id: string): string {
        if (!id) return '';
        return id.length > 20 ? id.substring(0, 20) + '...' : id;
    }

    getTransactionIdSuffix(id: string): string {
        if (!id || id.length <= 20) return '';
        return '...' + id.substring(id.length - 10);
    }

    copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text).then(() => {
            // Optionnel: afficher une notification de succès
            console.log('ID copié dans le presse-papiers');
        }).catch(err => {
            console.error('Erreur lors de la copie:', err);
        });
    }

    getStatusLabel(status: string): string {
        const statusLabels: { [key: string]: string } = {
            'EN_ATTENTE': 'En attente',
            'TRAITE': 'Traité',
            'ERREUR': 'Erreur'
        };
        return statusLabels[status] || status;
    }

    jumpToEcartFraisPage(): void {
        const page = Math.max(1, Math.min(this.ecartFraisJumpToPage, this.ecartFraisTotalPages));
        this.goToEcartFraisPage(page);
        this.ecartFraisJumpToPage = page;
    }

    // Obtenir le nombre de services uniques dans ecartFraisItems
    getUniqueServicesCount(): number {
        if (!this.ecartFraisItems || this.ecartFraisItems.length === 0) {
            return 0;
        }
        const uniqueServices = new Set(this.ecartFraisItems.map(item => item.service));
        return uniqueServices.size;
    }

    // Exporter les données d'écart frais vers Excel
    exportEcartFrais(): void {
        if (!this.ecartFraisItems || this.ecartFraisItems.length === 0) {
            this.popupService.showError('Aucune donnée à exporter');
            return;
        }

        this.isExporting = true;

        // Créer un nouveau classeur
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Écart Frais');

        // Définir les colonnes
        worksheet.columns = [
            { header: 'ID Transaction', key: 'idTransaction', width: 30 },
            { header: 'Service', key: 'service', width: 25 },
            { header: 'Agence', key: 'agence', width: 20 },
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Numéro Trans GU', key: 'numeroTransGu', width: 25 },
            { header: 'Pays', key: 'pays', width: 10 },
            { header: 'Montant', key: 'montant', width: 15 },
            { header: 'Frais', key: 'frais', width: 15 },
            { header: 'Statut', key: 'statut', width: 15 },
            { header: 'Commentaire', key: 'commentaire', width: 30 }
        ];

        // Appliquer le style de l'en-tête
        worksheet.getRow(1).font = { bold: true, size: 12 };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF667EEA' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 25;

        // Ajouter les données
        this.ecartFraisItems.forEach(item => {
            worksheet.addRow({
                idTransaction: item.idTransaction || '',
                service: item.service || '',
                agence: item.agence || '',
                date: this.formatDate(item.dateTransaction || ''),
                numeroTransGu: item.numeroTransGu || '',
                pays: item.pays || '',
                montant: item.montant || 0,
                frais: item.frais || 0,
                statut: item.statut || '',
                commentaire: item.commentaire || ''
            });
        });

        // Ajouter une ligne de total
        const totalRow = worksheet.addRow({
            idTransaction: '',
            service: '',
            agence: '',
            date: '',
            numeroTransGu: '',
            pays: 'TOTAL',
            montant: this.getTotalMontantEcartTrxSf(),
            frais: this.getTotalFraisEcartTrxSf(),
            statut: '',
            commentaire: ''
        });

        totalRow.font = { bold: true, size: 12 };
        totalRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF3F4F6' }
        };

        // Formater les colonnes de montants
        worksheet.getColumn('montant').numFmt = '#,##0.00';
        worksheet.getColumn('frais').numFmt = '#,##0.00';

        // Générer le fichier Excel
        workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const date = this.formatDate(this.ecartFraisDate).split(' ')[0].replace(/\//g, '-');
            const fileName = `Ecart_Frais_${this.ecartFraisAgence}_${date}.xlsx`;
            saveAs(blob, fileName);
            this.popupService.showSuccess(`Exportation réussie: ${fileName}`);
        }).catch((error: any) => {
            console.error('Erreur lors de l\'exportation:', error);
            this.popupService.showError('Erreur lors de l\'exportation des données');
        }).finally(() => {
            this.isExporting = false;
        });
    }

    // Méthodes utilitaires pour l'onglet revenu journalier
    getTotalRevenuJournalier(): number {
        return this.revenuJournalierDataFiltered.reduce((total, item) => total + item.revenuTotal, 0);
    }

    getTotalCashinJournalier(): number {
        return this.revenuJournalierDataFiltered.reduce((total, item) => total + item.totalCashin, 0);
    }

    getTotalPaiementJournalier(): number {
        return this.revenuJournalierDataFiltered.reduce((total, item) => total + item.totalPaiement, 0);
    }

    getTotalFraisCashinJournalier(): number {
        return this.revenuJournalierDataFiltered.reduce((total, item) => total + item.fraisCashin, 0);
    }

    getTotalFraisPaiementJournalier(): number {
        return this.revenuJournalierDataFiltered.reduce((total, item) => total + item.fraisPaiement, 0);
    }

    getTotalEcartFraisJournalier(): number {
        return this.revenuJournalierDataFiltered.reduce((total, item) => total + item.ecartFrais, 0);
    }

    // Méthodes de pagination pour le revenu journalier
    calculateRevenuJournalierPagination(): void {
        this.revenuJournalierCurrentPage = 1;
        this.revenuJournalierTotalPages = Math.ceil(this.revenuJournalierDataFiltered.length / this.revenuJournalierPageSize);
    }

    get pagedRevenuJournalierData(): { date: string; totalCashin: number; totalPaiement: number; fraisCashin: number; fraisPaiement: number; revenuTotal: number; ecartFrais: number }[] {
        const startIndex = (this.revenuJournalierCurrentPage - 1) * this.revenuJournalierPageSize;
        const endIndex = startIndex + this.revenuJournalierPageSize;
        return this.revenuJournalierDataFiltered.slice(startIndex, endIndex);
    }

    prevRevenuJournalierPage(): void {
        if (this.revenuJournalierCurrentPage > 1) {
            this.revenuJournalierCurrentPage--;
        }
    }

    nextRevenuJournalierPage(): void {
        if (this.revenuJournalierCurrentPage < this.revenuJournalierTotalPages) {
            this.revenuJournalierCurrentPage++;
        }
    }

    goToRevenuJournalierPage(page: number): void {
        if (page >= 1 && page <= this.revenuJournalierTotalPages) {
            this.revenuJournalierCurrentPage = page;
        }
    }

    getVisibleRevenuJournalierPages(): number[] {
        const totalPages = this.revenuJournalierTotalPages;
        const currentPage = this.revenuJournalierCurrentPage;
        const maxVisible = 5;
        
        if (totalPages <= maxVisible) {
            return Array.from({length: totalPages}, (_, i) => i + 1);
        }
        
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        return Array.from({length: end - start + 1}, (_, i) => start + i);
    }

    // Méthodes de filtrage pour le revenu journalier
    applyRevenuJournalierFilters(): void {
        let filteredData = [...this.revenuJournalierData];

        // Filtrage par date de début
        if (this.revenuJournalierDateDebut) {
            filteredData = filteredData.filter(item => item.date >= this.revenuJournalierDateDebut);
        }

        // Filtrage par date de fin
        if (this.revenuJournalierDateFin) {
            filteredData = filteredData.filter(item => item.date <= this.revenuJournalierDateFin);
        }

        // Filtrage par montant minimum
        if (this.revenuJournalierMontantMin !== null && this.revenuJournalierMontantMin >= 0) {
            filteredData = filteredData.filter(item => {
                const montantToCheck = this.getMontantForFilter(item);
                return montantToCheck >= this.revenuJournalierMontantMin!;
            });
        }

        // Filtrage par montant maximum
        if (this.revenuJournalierMontantMax !== null && this.revenuJournalierMontantMax >= 0) {
            filteredData = filteredData.filter(item => {
                const montantToCheck = this.getMontantForFilter(item);
                return montantToCheck <= this.revenuJournalierMontantMax!;
            });
        }

        this.revenuJournalierDataFiltered = filteredData;
        this.calculateRevenuJournalierPagination();
        
        // Mettre à jour les informations de débogage
        this.updateRevenuJournalierDebugInfo();
    }

    private getMontantForFilter(item: any): number {
        switch (this.revenuJournalierTypeRevenu) {
            case 'cashin':
                return item.fraisCashin;
            case 'paiement':
                return item.fraisPaiement;
            case 'total':
                return item.revenuTotal;
            default:
                return item.revenuTotal; // Par défaut, filtrer sur le revenu total
        }
    }

    onRevenuJournalierFiltersChange(): void {
        this.applyRevenuJournalierFilters();
    }

    clearRevenuJournalierFilters(): void {
        this.revenuJournalierDateDebut = '';
        this.revenuJournalierDateFin = '';
        this.revenuJournalierMontantMin = null;
        this.revenuJournalierMontantMax = null;
        this.revenuJournalierTypeRevenu = '';
        this.applyRevenuJournalierFilters();
    }

    // Méthode pour mettre à jour les informations de débogage
    updateRevenuJournalierDebugInfo(): void {
        const agence = this.selectedCompte?.agence || this.selectedCompte?.numeroCompte || 'Non définie';
        const compte = this.selectedCompte?.numeroCompte || 'Non défini';
        const totalLignes = this.revenuJournalierData.length;
        const totalEcart = this.getTotalEcartFraisJournalier();
        
        this.revenuJournalierDebugInfo = `
            Compte: ${compte} | 
            Agence utilisée: ${agence} | 
            Lignes: ${totalLignes} | 
            Total écart: ${totalEcart.toFixed(2)} FCFA
        `;
    }

    // ===== MÉTHODES POUR L'ONGLET CONTROL REVENU =====

    // Méthode pour charger les données de contrôle revenu
    loadControlRevenu(): void {
        if (!this.selectedCompte) return;

        const { dateDebut, dateFin } = this.buildControlRevenuDateFilters();
        const fetchKey = [
            this.selectedCompte.numeroCompte,
            dateDebut || 'all',
            dateFin || 'all'
        ].join('|');
        if (fetchKey === this.controlRevenuFetchKey && this.controlRevenuData.length > 0) {
            this.applyControlRevenuFilters();
            return;
        }

        this.isLoadingControlRevenu = true;
        this.showControlRevenuTab = true;

        // Déterminer l'agence et le service à filtrer AVANT de charger les données
        let agency: string | undefined = undefined;
        let service: string | undefined = undefined;
        
        if (this.selectedCompte) {
            // Récupérer les données de statistiques pour le compte sélectionné
            const numeroCompte = this.selectedCompte.numeroCompte;
            console.log('Numéro de compte:', numeroCompte);
            
            // Essayer de parser l'agence et le service depuis le numéro de compte
            agency = numeroCompte;
            
            if (numeroCompte.includes('_')) {
                const parts = numeroCompte.split('_');
                agency = parts[0];
                service = parts[1];
            } else {
                // Si pas de underscore, utiliser le numéro de compte complet comme agence
                agency = numeroCompte;
            }
        } else {
            console.log('Aucun compte sélectionné, affichage de toutes les données');
        }

        const loadSummaries = () => this.loadAgencySummaryData(agency, service, dateDebut, dateFin, fetchKey);

        if (this.fraisParametresLoaded) {
            loadSummaries();
            return;
        }

        this.fraisTransactionService.getAllFraisTransactionsActifs().subscribe({
            next: (frais) => {
                this.fraisParametres = frais;
                this.fraisParametresLoaded = true;
                loadSummaries();
            },
            error: (error) => {
                console.error('Erreur lors du chargement des frais paramétrés:', error);
                this.fraisParametres = [];
                this.fraisParametresLoaded = true;
                loadSummaries();
            }
        });
    }

    private loadAgencySummaryData(agency: string | undefined, service: string | undefined, dateDebut: string | null, dateFin: string | null, fetchKey: string): void {
        this.agencySummaryService.getAllSummaries(undefined, {
            agencies: agency ? [agency] : undefined,
            services: service ? [service] : undefined,
            startDate: dateDebut || undefined,
            endDate: dateFin || undefined
        }).subscribe({
            next: (allSummaries) => {
                console.log('Données AgencySummary récupérées:', allSummaries);
                console.log('Agence recherchée:', agency);
                console.log('Service recherché:', service);
                console.log('Premiers enregistrements:', allSummaries.slice(0, 5));
                
                // Filtrer les données selon l'agence et le service
                const filteredSummaries = allSummaries.filter((summary: any) => {
                    const matchesAgency = agency ? summary.agency === agency : true; // Si pas d'agence, accepter toutes les agences
                    const matchesService = service ? summary.service === service : true; // Si pas de service, accepter tous les services
                    const matchesDateRange = !this.controlRevenuDateDebut || !this.controlRevenuDateFin || 
                        (summary.date >= this.controlRevenuDateDebut && summary.date <= this.controlRevenuDateFin);
                    
                    // Debug: afficher les correspondances pour les premiers enregistrements
                    if (allSummaries.indexOf(summary) < 3) {
                        console.log('Debug filtrage:', {
                            summaryAgency: summary.agency,
                            summaryService: summary.service,
                            searchedAgency: agency,
                            searchedService: service,
                            matchesAgency,
                            matchesService,
                            matchesDateRange
                        });
                    }
                    
                    return matchesAgency && matchesService && matchesDateRange;
                });
                
                console.log('Statistiques filtrées pour le contrôle revenu:', filteredSummaries);

                if (filteredSummaries.length === 0 || !agency) {
                    this.controlRevenuData = [];
                    this.controlRevenuDataFiltered = [...this.controlRevenuData];
                    this.calculateControlRevenuPagination();
                    this.controlRevenuFetchKey = fetchKey;
                    this.isLoadingControlRevenu = false;
                    return;
                }

                const summaryDates = filteredSummaries.map(summary => summary.date).filter(Boolean);
                const minDate = dateDebut || summaryDates.reduce((min, current) => current < min ? current : min);
                const maxDate = dateFin || summaryDates.reduce((max, current) => current > max ? current : max);

                this.trxSfService.getTrxSfs({ agence: agency, dateDebut: minDate, dateFin: maxDate, statut: 'EN_ATTENTE' }).subscribe({
                    next: (trxRows) => {
                        const fraisByDateService = new Map<string, number>();
                        (trxRows || []).forEach(row => {
                            const trxDate = row.dateTransaction ? this.normalizeToYmd(row.dateTransaction) : '';
                            const key = `${trxDate}|${row.service || ''}`;
                            fraisByDateService.set(key, (fraisByDateService.get(key) || 0) + (row.frais || 0));
                        });
                        this.controlRevenuData = this.transformStatisticsToControlRevenu(filteredSummaries, fraisByDateService);
                        this.controlRevenuDataFiltered = [...this.controlRevenuData];
                        this.calculateControlRevenuPagination();
                        this.controlRevenuFetchKey = fetchKey;
                        this.isLoadingControlRevenu = false;
                    },
                    error: (error) => {
                        console.error('Erreur lors du chargement groupé des frais TRX SF:', error);
                        this.controlRevenuData = this.transformStatisticsToControlRevenu(filteredSummaries, new Map<string, number>());
                        this.controlRevenuDataFiltered = [...this.controlRevenuData];
                        this.calculateControlRevenuPagination();
                        this.controlRevenuFetchKey = fetchKey;
                        this.isLoadingControlRevenu = false;
                    }
                });
            },
            error: (error) => {
                console.error('Erreur lors du chargement des données de contrôle revenu:', error);
                
                // En cas d'erreur, utiliser des données de test
                this.loadTestControlRevenuData();
                this.isLoadingControlRevenu = false;
            }
        });
    }

    private transformStatisticsToControlRevenu(statistics: Statistics[], fraisByDateService: Map<string, number>): any[] {
        const data: any[] = [];
        
        // Traiter chaque enregistrement de statistiques
        for (const stat of statistics) {
            // Utiliser les données réelles des statistiques
            const volume = stat.totalVolume || 0;
            const nombreTrx = stat.recordCount || 0;
            
            // Calculer le revenu attendu basé sur les frais paramétrés
            const revenuAttendu = this.calculateRevenuAttendu(stat.service, stat.agency, volume, nombreTrx);
            
            const totalFraisTrxSf = fraisByDateService.get(`${stat.date}|${stat.service}`) || 0;
            
            // Calculer le revenu réel selon la formule : Revenu attendu - Total frais TRX SF
            const revenuReel = revenuAttendu - totalFraisTrxSf;
            const ecart = revenuReel - revenuAttendu;
            
            // Le statut sera déterminé après avoir analysé tous les services
            let statut = 'normal';
            
            data.push({
                date: stat.date,
                service: stat.service,
                typeControle: 'Contrôle journalier',
                revenuAttendu: revenuAttendu,
                revenuReel: revenuReel,
                ecart: ecart,
                statut: statut,
                volume: volume,
                nombreTrx: nombreTrx,
                totalFraisTrxSf: totalFraisTrxSf // Ajouter les frais TRX SF pour debug
            });
        }
        
        // Analyser les anomalies par service selon les nouveaux critères
        this.analyzeAnomaliesByService(data);
        
        // Trier par date décroissante (du plus récent au plus ancien)
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        return data;
    }

    private calculateRevenuAttendu(service: string, agence: string, volume: number, nombreTrx: number): number {
        // Chercher le frais paramétré pour ce service et cette agence
        const frais = this.fraisParametres.find(f => 
            f.service === service && 
            f.agence === agence && 
            f.actif
        );
        
        if (!frais) {
            console.warn(`Aucun frais paramétré trouvé pour service: ${service}, agence: ${agence}`);
            return volume * 0.01; // Fallback à 1% si pas de frais paramétré
        }
        
        // Calculer le revenu attendu selon le type de calcul
        if (frais.typeCalcul === 'POURCENTAGE' && frais.pourcentage) {
            // Calcul par pourcentage du volume
            return volume * (frais.pourcentage / 100);
        } else {
            // Calcul nominal (montant fixe par transaction)
            return frais.montantFrais * nombreTrx;
        }
    }

    private loadTestControlRevenuData(): void {
        // Données de test pour l'onglet Control Revenu basées sur des statistiques réelles
        this.controlRevenuData = [
            {
                date: '2025-08-09',
                service: 'CM_PAIEMENTMARCHAND_OM_TP',
                typeControle: 'Contrôle journalier',
                revenuAttendu: 2500.00,
                revenuReel: 2475.00,
                ecart: -25.00,
                statut: 'anomalie',
                volume: 250000.00,
                nombreTrx: 45
            },
            {
                date: '2025-08-08',
                service: 'CM_PAIEMENTMARCHAND_OM_TP',
                typeControle: 'Contrôle journalier',
                revenuAttendu: 1800.00,
                revenuReel: 1800.00,
                ecart: 0.00,
                statut: 'normal',
                volume: 180000.00,
                nombreTrx: 32
            },
            {
                date: '2025-08-07',
                service: 'CM_PAIEMENTMARCHAND_OM_TP',
                typeControle: 'Contrôle journalier',
                revenuAttendu: 3200.00,
                revenuReel: 3040.00,
                ecart: -160.00,
                statut: 'critique',
                volume: 320000.00,
                nombreTrx: 58
            },
            {
                date: '2025-08-06',
                service: 'CM_PAIEMENTMARCHAND_OM_TP',
                typeControle: 'Contrôle journalier',
                revenuAttendu: 1500.00,
                revenuReel: 1500.00,
                ecart: 0.00,
                statut: 'normal',
                volume: 150000.00,
                nombreTrx: 28
            },
            {
                date: '2025-08-05',
                service: 'CM_PAIEMENTMARCHAND_OM_TP',
                typeControle: 'Contrôle journalier',
                revenuAttendu: 2200.00,
                revenuReel: 2090.00,
                ecart: -110.00,
                statut: 'anomalie',
                volume: 220000.00,
                nombreTrx: 41
            }
        ];
        
        this.controlRevenuDataFiltered = [...this.controlRevenuData];
        this.calculateControlRevenuPagination();
    }

    // Méthodes de calcul pour le control revenu
    getTotalControlRevenu(): number {
        return this.controlRevenuDataFiltered.length;
    }

    getTotalAnomaliesControlRevenu(): number {
        return this.controlRevenuDataFiltered.filter(item => item.statut === 'anomalie').length;
    }

    getTotalNormauxControlRevenu(): number {
        return this.controlRevenuDataFiltered.filter(item => item.statut === 'normal').length;
    }

    getTotalCritiquesControlRevenu(): number {
        return this.controlRevenuDataFiltered.filter(item => item.statut === 'critique').length;
    }

    getTauxConformiteControlRevenu(): number {
        const total = this.getTotalControlRevenu();
        if (total === 0) return 0;
        
        // Calculer le taux de conformité basé sur la proportion de contrôles normaux
        // pondérés par le revenu attendu (MàG < 1% = normal, MàG >= 1% = anomalie/critique)
        let totalPoidsNormal = 0;
        let totalPoids = 0;
        
        this.controlRevenuDataFiltered.forEach(item => {
            const magPercentage = Math.abs(this.getMagPercentage(item));
            const poids = item.revenuAttendu; // Poids basé sur le revenu attendu
            totalPoids += poids;
            
            // Un contrôle est considéré comme conforme si son MàG < 1%
            if (magPercentage < 1.0) {
                totalPoidsNormal += poids;
            }
        });
        
        if (totalPoids === 0) return 0;
        
        // Retourner le taux de conformité en pourcentage
        const tauxConformite = (totalPoidsNormal / totalPoids) * 100;
        
        // Ajouter un log pour debug
        console.log(`Taux de conformité: ${totalPoidsNormal.toFixed(2)} / ${totalPoids.toFixed(2)} = ${tauxConformite.toFixed(2)}%`);
        
        return tauxConformite;
    }

    getTotalVolumeControlRevenu(): number {
        return this.controlRevenuDataFiltered.reduce((total, item) => total + item.volume, 0);
    }

    getTotalNombreTrxControlRevenu(): number {
        return this.controlRevenuDataFiltered.reduce((total, item) => total + item.nombreTrx, 0);
    }

    getTotalMagControlRevenu(): number {
        return this.controlRevenuDataFiltered.reduce((total, item) => total + item.ecart, 0);
    }

    getMoyenneMagPercentageControlRevenu(): number {
        const totalRevenuAttendu = this.controlRevenuDataFiltered.reduce((total, item) => total + item.revenuAttendu, 0);
        const totalEcart = this.controlRevenuDataFiltered.reduce((total, item) => total + item.ecart, 0);
        if (totalRevenuAttendu === 0) return 0;
        return (totalEcart / totalRevenuAttendu) * 100;
    }

    getTotalRevenuAttenduControlRevenu(): number {
        return this.controlRevenuDataFiltered.reduce((total, item) => total + item.revenuAttendu, 0);
    }

    getTotalRevenuReelControlRevenu(): number {
        return this.controlRevenuDataFiltered.reduce((total, item) => total + item.revenuReel, 0);
    }

    getUniqueServicesControlRevenu(): string[] {
        const services = [...new Set(this.controlRevenuData.map(item => item.service))];
        return services.sort();
    }

    private analyzeAnomaliesByService(data: any[]): void {
        // Analyser chaque ligne individuellement basé sur le pourcentage de MàG (valeur absolue)
        data.forEach(item => {
            // Calculer le pourcentage de MàG en valeur absolue
            const magPercentage = Math.abs(this.getMagPercentage(item));
            
            // Déterminer le statut selon les seuils de MàG
            // MàG < 1% = normal
            // MàG = 1% = anomalie
            // MàG > 1% = critique
            let status = 'normal';
            
            if (magPercentage > 1.0) {
                // MàG > 1% = critique
                status = 'critique';
            } else if (Math.abs(magPercentage - 1.0) < 0.01) {
                // MàG ≈ 1% (avec tolérance de 0.01%) = anomalie
                status = 'anomalie';
            } else if (magPercentage >= 1.0) {
                // MàG >= 1% mais pas exactement 1% = anomalie
                status = 'anomalie';
            } else {
                // MàG < 1% = normal
                status = 'normal';
            }

            // Appliquer le statut à la ligne
            item.statut = status;

            console.log(`Ligne ${item.service} - ${item.date}: MàG ${magPercentage.toFixed(2)}% -> Statut: ${status}`);
        });
    }

    // Méthodes de pagination pour le control revenu
    calculateControlRevenuPagination(): void {
        this.controlRevenuTotalPages = Math.ceil(this.controlRevenuDataFiltered.length / this.controlRevenuPageSize);
        this.controlRevenuCurrentPage = 1;
    }

    get pagedControlRevenuData(): { date: string; service: string; typeControle: string; revenuAttendu: number; revenuReel: number; ecart: number; statut: string; volume: number; nombreTrx: number; totalFraisTrxSf?: number }[] {
        const startIndex = (this.controlRevenuCurrentPage - 1) * this.controlRevenuPageSize;
        const endIndex = startIndex + this.controlRevenuPageSize;
        return this.controlRevenuDataFiltered.slice(startIndex, endIndex);
    }

    prevControlRevenuPage(): void {
        if (this.controlRevenuCurrentPage > 1) {
            this.controlRevenuCurrentPage--;
        }
    }

    nextControlRevenuPage(): void {
        if (this.controlRevenuCurrentPage < this.controlRevenuTotalPages) {
            this.controlRevenuCurrentPage++;
        }
    }

    goToControlRevenuPage(page: number): void {
        if (page >= 1 && page <= this.controlRevenuTotalPages) {
            this.controlRevenuCurrentPage = page;
        }
    }

    getVisibleControlRevenuPages(): number[] {
        const totalPages = this.controlRevenuTotalPages;
        const currentPage = this.controlRevenuCurrentPage;
        const maxVisible = 5;
        
        if (totalPages <= maxVisible) {
            return Array.from({length: totalPages}, (_, i) => i + 1);
        }
        
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        return Array.from({length: end - start + 1}, (_, i) => start + i);
    }

    // Méthodes de filtrage pour le control revenu
    applyControlRevenuFilters(): void {
        let filteredData = [...this.controlRevenuData];

        // Filtrage par date de début
        if (this.controlRevenuDateDebut) {
            filteredData = filteredData.filter(item => item.date >= this.controlRevenuDateDebut);
        }

        // Filtrage par date de fin
        if (this.controlRevenuDateFin) {
            filteredData = filteredData.filter(item => item.date <= this.controlRevenuDateFin);
        }

        // Filtrage par service
        if (this.controlRevenuService) {
            filteredData = filteredData.filter(item => item.service === this.controlRevenuService);
        }

        // Filtrage par type de contrôle
        if (this.controlRevenuType) {
            filteredData = filteredData.filter(item => item.statut === this.controlRevenuType);
        }

        // Filtrage par seuil d'alerte
        if (this.controlRevenuSeuil !== null && this.controlRevenuSeuil >= 0) {
            filteredData = filteredData.filter(item => Math.abs(item.ecart) >= this.controlRevenuSeuil!);
        }

        this.controlRevenuDataFiltered = filteredData;
        this.calculateControlRevenuPagination();
    }

    onControlRevenuFiltersChange(): void {
        this.loadControlRevenu();
    }

    clearControlRevenuFilters(): void {
        this.controlRevenuDateDebut = '';
        this.controlRevenuDateFin = '';
        this.controlRevenuService = '';
        this.controlRevenuType = '';
        this.controlRevenuSeuil = null;
        this.loadControlRevenu();
    }

    // Méthodes d'affichage pour le control revenu
    getControlRevenuRowClass(controle: any): string {
        switch (controle.statut) {
            case 'critique':
                return 'row-critical';
            case 'anomalie':
                return 'row-warning';
            case 'normal':
                return 'row-normal';
            default:
                return '';
        }
    }

    getControlRevenuStatusClass(controle: any): string {
        switch (controle.statut) {
            case 'critique':
                return 'status-critical';
            case 'anomalie':
                return 'status-warning';
            case 'normal':
                return 'status-normal';
            default:
                return '';
        }
    }

    getControlRevenuStatusLabel(controle: any): string {
        switch (controle.statut) {
            case 'critique':
                return 'Critique';
            case 'anomalie':
                return 'Anomalie';
            case 'normal':
                return 'Normal';
            default:
                return 'Inconnu';
        }
    }

    // Méthodes d'action pour le control revenu
    viewControlRevenuDetails(controle: any): void {
        this.selectedControlRevenu = controle;
        this.showControlRevenuModal = true;
    }

    closeControlRevenuModal(): void {
        this.showControlRevenuModal = false;
        this.selectedControlRevenu = null;
    }

    getAbsValue(value: number): number {
        return Math.abs(value);
    }

    getEcartPercentage(ecart: number, revenuAttendu: number): number {
        if (revenuAttendu === 0) return 0;
        return (Math.abs(ecart) / revenuAttendu) * 100;
    }

    getMagPercentage(controle: any): number {
        if (controle.revenuAttendu === 0) return 0;
        return (controle.ecart / controle.revenuAttendu) * 100;
    }

    // Méthodes pour la visualisation par date
    openDateViewModal(date: string): void {
        this.selectedDate = date;
        this.showDateViewModal = true;
        this.loadDateViewData(date);
    }

    closeDateViewModal(): void {
        this.showDateViewModal = false;
        this.selectedDate = '';
        this.dateViewData = [];
    }

    loadDateViewData(date: string): void {
        this.isLoadingDateView = true;
        
        // Filtrer les données pour la date sélectionnée
        const dataForDate = this.controlRevenuData.filter(item => item.date === date);
        
        // Grouper par service et calculer les totaux
        const serviceGroups = new Map<string, any>();
        
        dataForDate.forEach(item => {
            if (!serviceGroups.has(item.service)) {
                serviceGroups.set(item.service, {
                    service: item.service,
                    date: item.date,
                    volume: 0,
                    nombreTrx: 0,
                    revenuAttendu: 0,
                    revenuReel: 0,
                    fraisTrxSf: 0,
                    ecart: 0,
                    statut: 'normal',
                    nombreControles: 0
                });
            }
            
            const group = serviceGroups.get(item.service)!;
            group.volume += item.volume;
            group.nombreTrx += item.nombreTrx;
            group.revenuAttendu += item.revenuAttendu;
            group.revenuReel += item.revenuReel;
            group.fraisTrxSf += (item.totalFraisTrxSf || 0);
            group.ecart += item.ecart;
            group.nombreControles += 1;
            
            // Déterminer le statut global du service
            if (item.statut === 'critique') {
                group.statut = 'critique';
            } else if (item.statut === 'anomalie' && group.statut !== 'critique') {
                group.statut = 'anomalie';
            }
        });
        
        this.dateViewData = Array.from(serviceGroups.values());
        this.isLoadingDateView = false;
    }

    getDateViewTotalVolume(): number {
        return this.dateViewData.reduce((total, item) => total + item.volume, 0);
    }

    getDateViewTotalRevenuAttendu(): number {
        return this.dateViewData.reduce((total, item) => total + item.revenuAttendu, 0);
    }

    getDateViewTotalRevenuReel(): number {
        return this.dateViewData.reduce((total, item) => total + item.revenuReel, 0);
    }

    getDateViewTotalEcart(): number {
        return this.dateViewData.reduce((total, item) => total + item.ecart, 0);
    }

    getDateViewMagPercentage(): number {
        const totalRevenuAttendu = this.getDateViewTotalRevenuAttendu();
        const totalEcart = this.getDateViewTotalEcart();
        if (totalRevenuAttendu === 0) return 0;
        return (totalEcart / totalRevenuAttendu) * 100;
    }

    getMagPercentageFromService(service: any): number {
        if (service.revenuAttendu === 0) return 0;
        return (service.ecart / service.revenuAttendu) * 100;
    }

    getDateViewTotalFraisTrxSf(): number {
        return this.dateViewData.reduce((total, item) => total + item.fraisTrxSf, 0);
    }

    getServiceRowClass(service: any): string {
        if (service.statut === 'critique') return 'critical-row';
        if (service.statut === 'anomalie') return 'anomaly-row';
        return 'normal-row';
    }

    exportDateViewData(): void {
        if (this.dateViewData.length === 0) {
            this.popupService.showWarning('Aucune donnée à exporter');
            return;
        }

        try {
            // Fonction pour formater les montants
            const formatMontant = (montant: number): string => {
                const parts = montant.toFixed(2).split('.');
                const integerPart = parts[0];
                const decimalPart = parts[1];
                const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                return `${formattedInteger},${decimalPart}`;
            };

            // Fonction pour échapper les caractères spéciaux
            const escapeCsvValue = (value: string): string => {
                if (value.includes(';') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            };

            // Préparer les données pour l'export
            const exportData = this.dateViewData.map(service => ({
                'Service': service.service,
                'Volume': formatMontant(service.volume),
                'Nombre de Transactions': service.nombreTrx.toString(),
                'Revenu Attendu': formatMontant(service.revenuAttendu),
                'Frais TRX SF': formatMontant(service.fraisTrxSf),
                'Revenu Reel': formatMontant(service.revenuReel),
                'MaG (%)': this.getMagPercentageFromService(service).toFixed(2) + '%',
                'Statut': this.getControlRevenuStatusLabel(service),
                'Nombre de Controles': service.nombreControles.toString()
            }));

            // Créer le contenu CSV
            const headers = Object.keys(exportData[0]);
            const csvContent = [
                headers.map(header => escapeCsvValue(header)).join(';'),
                ...exportData.map(row => 
                    headers.map(header => {
                        const value = row[header as keyof typeof row];
                        return escapeCsvValue(value.toString());
                    }).join(';')
                )
            ].join('\n');

            // Ajouter les métadonnées
            const metadata = [
                `Export Visualisation par Date - ${this.formatDate(this.selectedDate)}`,
                `Date: ${this.formatDate(this.selectedDate)}`,
                `Nombre de Services: ${this.dateViewData.length}`,
                `Volume Total: ${formatMontant(this.getDateViewTotalVolume())}`,
                `Revenu Attendu Total: ${formatMontant(this.getDateViewTotalRevenuAttendu())}`,
                `Revenu Reel Total: ${formatMontant(this.getDateViewTotalRevenuReel())}`,
                `Frais TRX SF Total: ${formatMontant(this.getDateViewTotalFraisTrxSf())}`,
                `MaG Moyen (%): ${this.getDateViewMagPercentage().toFixed(2)}%`,
                '',
                csvContent
            ].join('\n');

            // Créer et télécharger le fichier
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + metadata], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `visualisation_date_${this.selectedDate.replace(/-/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.popupService.showSuccess('Export terminé avec succès !');
        } catch (error) {
            console.error('Erreur lors de l\'export:', error);
            this.popupService.showError('Erreur lors de l\'export des données');
        }
    }

    exportControlRevenu(controle: any): void {
        // TODO: Implémenter l'export du contrôle
        console.log('Exporter le contrôle:', controle);
        this.popupService.showInfo(`Export du contrôle du ${controle.date} en cours...`);
    }

    exportControlRevenuData(): void {
        if (this.controlRevenuDataFiltered.length === 0) {
            this.popupService.showWarning('Aucune donnée à exporter');
            return;
        }

        try {
            // Fonction pour formater les montants sans devise avec séparateurs de milliers
            const formatMontant = (montant: number): string => {
                // Formater avec séparateurs de milliers et virgule décimale
                const parts = montant.toFixed(2).split('.');
                const integerPart = parts[0];
                const decimalPart = parts[1];
                
                // Ajouter les séparateurs de milliers
                const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                
                return `${formattedInteger},${decimalPart}`;
            };

            // Fonction pour échapper les caractères spéciaux dans les chaînes CSV
            const escapeCsvValue = (value: string): string => {
                if (value.includes(';') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            };

            // Préparer les données pour l'export
            const exportData = this.controlRevenuDataFiltered.map(controle => ({
                'Date': this.formatDate(controle.date),
                'Service': controle.service,
                'Type de Controle': controle.typeControle,
                'Volume': formatMontant(controle.volume),
                'Nombre de Transactions': controle.nombreTrx.toString(),
                'Revenu Attendu': formatMontant(controle.revenuAttendu),
                'Frais TRX SF': formatMontant(controle.totalFraisTrxSf || 0),
                'Revenu Reel': formatMontant(controle.revenuReel),
                'MaG (%)': this.getMagPercentage(controle).toFixed(2) + '%',
                'Statut': this.getControlRevenuStatusLabel(controle)
            }));

            // Créer le contenu CSV avec échappement des caractères spéciaux
            const headers = Object.keys(exportData[0]);
            const csvContent = [
                headers.map(header => escapeCsvValue(header)).join(';'),
                ...exportData.map(row => 
                    headers.map(header => {
                        const value = row[header as keyof typeof row];
                        return escapeCsvValue(value.toString());
                    }).join(';')
                )
            ].join('\n');

            // Ajouter les métadonnées avec formatage des montants
            const metadata = [
                `Export Control Revenu - ${new Date().toLocaleDateString('fr-FR')}`,
                `Total Controles: ${this.getTotalControlRevenu()}`,
                `Volume Total: ${formatMontant(this.getTotalVolumeControlRevenu())}`,
                `Total Transactions: ${this.getTotalNombreTrxControlRevenu().toString()}`,
                `MaG Moyen (%): ${this.getMoyenneMagPercentageControlRevenu().toFixed(2)}%`,
                `Anomalies: ${this.getTotalAnomaliesControlRevenu()}`,
                `Controles Normaux: ${this.getTotalNormauxControlRevenu()}`,
                `Controles Critiques: ${this.getTotalCritiquesControlRevenu()}`,
                `Taux de Conformite: ${this.getTauxConformiteControlRevenu().toFixed(1)}%`,
                '',
                csvContent
            ].join('\n');

            // Créer et télécharger le fichier avec BOM pour Excel
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + metadata], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `control-revenu-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            console.log('Export Control Revenu réussi:', exportData.length, 'lignes exportées');
        } catch (error) {
            console.error('Erreur lors de l\'export Control Revenu:', error);
            this.popupService.showError('Erreur lors de l\'export. Veuillez réessayer.');
        }
    }
} 