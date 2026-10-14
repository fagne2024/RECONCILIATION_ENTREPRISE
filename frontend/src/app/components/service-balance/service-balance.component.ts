import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompteService } from '../../services/compte.service';
import { Compte } from '../../models/compte.model';
import { ServiceBalanceService, RejectRequest } from '../../services/service-balance.service';
import { PopupService } from '../../services/popup.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-service-balance',
    standalone: true,
    imports: [TranslateModule, SharedUiModule],
    templateUrl: './service-balance.component.html',
    styleUrls: ['./service-balance.component.scss']
})
export class ServiceBalanceComponent implements OnInit, OnDestroy {
    serviceComptes: Compte[] = [];
    filteredServiceComptes: Compte[] = [];
    paginatedComptes: Compte[] = [];
    groupedByCountry: { [key: string]: Compte[] } = {};
    selectedComptes: Compte[] = [];
    selectedCountry: string = '';
    
    /** Libellé technique d'un pays absent des données ; seul le texte affiché est traduit. */
    readonly UNDEFINED_COUNTRY = 'Non défini';
    
    // Filtres et recherche
    searchTerm: string = '';
    sortBy: string = 'numeroCompte';
    sortOrder: 'asc' | 'desc' = 'asc';
    filterBySolde: 'all' | 'positive' | 'negative' | 'zero' = 'all';
    
    // Pagination
    currentPage: number = 1;
    itemsPerPage: number = 12;
    totalPages: number = 1;
    
    isLoading = false;
    isMerging = false;
    showMergeForm = false;
    
    mergeForm: FormGroup;
    rejectForm: FormGroup;
    showRejectForm = false;
    compteToReject: Compte | null = null;
    isRejecting = false;
    
    // Exposer Math pour l'utiliser dans le template
    Math = Math;
    
    private subscriptions: Subscription[] = [];

    constructor(
        private compteService: CompteService,
        private serviceBalanceService: ServiceBalanceService,
        private popupService: PopupService,
        private fb: FormBuilder,
        private translate: TranslateService
    ) {
        this.mergeForm = this.fb.group({
            newCompteName: ['', [Validators.required, Validators.minLength(3)]],
            selectedCountry: ['', Validators.required]
        });
        
        this.rejectForm = this.fb.group({
            titre: ['', [Validators.required, Validators.minLength(3)]],
            commentaire: ['', [Validators.required, Validators.minLength(5)]]
        });
    }

    countryLabel(country: string): string {
        return country === this.UNDEFINED_COUNTRY ? this.translateKey('SBL.notDefined') : country;
    }

    ngOnInit() {
        this.testPing();
        this.testConnection();
        this.loadServiceComptes();
    }

    testPing() {
        this.subscriptions.push(
            this.serviceBalanceService.testPing().subscribe({
                next: (result) => {
                    console.log('✅ Ping Backend OK:', result);
                },
                error: (error) => {
                    console.error('❌ Erreur Ping Backend:', error);
                    this.popupService.showError(this.translateKey('SBL.errBackendTitle'), this.translateKey('SBL.errBackendMsg'));
                }
            })
        );
    }

    testConnection() {
        this.subscriptions.push(
            this.serviceBalanceService.testConnection().subscribe({
                next: (result) => {
                    console.log('✅ Connexion API Service Balance OK:', result);
                },
                error: (error) => {
                    console.error('❌ Erreur de connexion API Service Balance:', error);
                    this.popupService.showError(this.translateKey('SBL.errConnectionTitle'), this.translateKey('SBL.errConnectionMsg'));
                }
            })
        );
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    loadServiceComptes() {
        this.isLoading = true;
        this.subscriptions.push(
            this.serviceBalanceService.getServiceComptes().subscribe({
                next: (comptes) => {
                    console.log('Comptes reçus:', comptes);
                    this.serviceComptes = comptes;
                    this.groupComptesByCountry();
                    // Réinitialiser les filtres et appliquer la pagination
                    if (this.selectedCountry) {
                        this.filteredServiceComptes = this.groupedByCountry[this.selectedCountry] || [];
                    }
                    this.applyFiltersAndPagination();
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Erreur lors du chargement des comptes:', error);
                    this.popupService.showError(this.translateKey('SBL.errTitle'), this.translateKey('SBL.errLoadMsg'));
                    this.isLoading = false;
                }
            })
        );
    }
    
    loadAllComptes() {
        this.isLoading = true;
        this.subscriptions.push(
            this.serviceBalanceService.getAllComptes().subscribe({
                next: (comptes) => {
                    console.log('Tous les comptes reçus:', comptes);
                    this.serviceComptes = comptes;
                    this.groupComptesByCountry();
                    // Réinitialiser les filtres et appliquer la pagination
                    if (this.selectedCountry) {
                        this.filteredServiceComptes = this.groupedByCountry[this.selectedCountry] || [];
                    }
                    this.applyFiltersAndPagination();
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Erreur lors du chargement de tous les comptes:', error);
                    this.popupService.showError(this.translateKey('SBL.errTitle'), this.translateKey('SBL.errLoadAllMsg'));
                    this.isLoading = false;
                }
            })
        );
    }

    private isServiceCompte(numeroCompte: string): boolean {
        // Un compte service est identifié par le fait qu'il n'est pas un code d'agence
        // Les codes d'agence sont généralement des codes courts (ex: SPTLN2664)
        // Les services sont généralement des codes plus longs (ex: BF_CASHIN_OM_LONAB)
        return numeroCompte && numeroCompte.length > 10 && numeroCompte.includes('_');
    }

    /**
     * Normalise le code pays pour fusionner les variantes (ex: CITCH -> CI)
     */
    private normalizeCountryCode(country: string): string {
        if (!country) {
            return this.UNDEFINED_COUNTRY;
        }
        
        const normalized = country.trim().toUpperCase();
        
        // Gérer les variantes spéciales comme "CITCH" qui signifie "CI" (Côte d'Ivoire)
        if (normalized === 'CITCH' || normalized.startsWith('CITCH')) {
            return 'CI';
        }
        
        // Map des variantes de noms de pays vers codes normalisés
        const countryMap: { [key: string]: string } = {
            'CÔTE D\'IVOIRE': 'CI',
            'COTE D\'IVOIRE': 'CI',
            'COTE DIVOIRE': 'CI',
            'CÔTE DIVOIRE': 'CI',
            'IVORY COAST': 'CI'
        };
        
        if (countryMap[normalized]) {
            return countryMap[normalized];
        }
        
        return normalized;
    }

    groupComptesByCountry() {
        this.groupedByCountry = {};
        this.serviceComptes.forEach(compte => {
            const rawCountry = compte.pays || this.UNDEFINED_COUNTRY;
            const normalizedCountry = this.normalizeCountryCode(rawCountry);
            
            if (!this.groupedByCountry[normalizedCountry]) {
                this.groupedByCountry[normalizedCountry] = [];
            }
            this.groupedByCountry[normalizedCountry].push(compte);
        });
    }

    onCountryChange(country: string) {
        this.selectedCountry = country;
        this.filteredServiceComptes = this.groupedByCountry[country] || [];
        this.currentPage = 1; // Reset à la première page
        this.selectedComptes = [];
        this.mergeForm.patchValue({ selectedCountry: country });
        this.applyFiltersAndPagination();
    }

    toggleCompteSelection(compte: Compte) {
        const index = this.selectedComptes.findIndex(c => c.id === compte.id);
        if (index > -1) {
            this.selectedComptes.splice(index, 1);
        } else {
            this.selectedComptes.push(compte);
        }
    }

    isCompteSelected(compte: Compte): boolean {
        return this.selectedComptes.some(c => c.id === compte.id);
    }

    getTotalSelectedSolde(): number {
        return this.selectedComptes.reduce((total, compte) => total + compte.solde, 0);
    }

    getSelectedComptesCount(): number {
        return this.selectedComptes.length;
    }

    showMergeDialog() {
        if (this.selectedComptes.length < 2) {
            this.popupService.showWarning(this.translateKey('SBL.warnSelectionTitle'), this.translateKey('SBL.warnSelectionMsg'));
            return;
        }
        this.showMergeForm = true;
    }

    cancelMerge() {
        this.showMergeForm = false;
        this.mergeForm.reset();
    }

    mergeComptes() {
        if (this.mergeForm.invalid || this.selectedComptes.length < 2) {
            return;
        }

        this.isMerging = true;
        const newCompteName = this.mergeForm.get('newCompteName')?.value;
        const selectedCountry = this.mergeForm.get('selectedCountry')?.value;

        this.subscriptions.push(
            this.serviceBalanceService.mergeServiceComptes(
                this.selectedComptes.map(c => c.id!),
                newCompteName,
                selectedCountry
            ).subscribe({
                next: (result) => {
                    console.log('Fusion réussie:', result);
                    this.popupService.showSuccess(
                        this.translateKey('SBL.mergeSuccessTitle'),
                        this.translateKey('SBL.mergeSuccessMsg', {
                            name: newCompteName,
                            solde: result.totalSolde.toLocaleString(this.translate.currentLang === 'en' ? 'en-GB' : 'fr-FR'),
                            count: this.selectedComptes.length
                        })
                    );
                    this.showMergeForm = false;
                    this.mergeForm.reset();
                    this.selectedComptes = [];
                    this.loadServiceComptes(); // Recharger la liste
                },
                error: (error) => {
                    console.error('Erreur lors de la fusion:', error);
                    let errorMessage = this.translateKey('SBL.errMergeMsg');
                    if (error.error && error.error.message) {
                        errorMessage = error.error.message;
                    } else if (error.message) {
                        errorMessage = error.message;
                    }
                    this.popupService.showError(this.translateKey('SBL.errMergeTitle'), errorMessage);
                },
                complete: () => {
                    this.isMerging = false;
                }
            })
        );
    }

    // === MÉTHODES DE REJET ===
    
    openRejectDialog(compte: Compte) {
        this.compteToReject = compte;
        this.rejectForm.reset();
        this.showRejectForm = true;
    }

    cancelReject() {
        this.showRejectForm = false;
        this.compteToReject = null;
        this.rejectForm.reset();
    }

    rejectCompte() {
        if (this.rejectForm.invalid || !this.compteToReject) {
            this.rejectForm.markAllAsTouched();
            return;
        }

        this.isRejecting = true;
        const request: RejectRequest = {
            titre: this.rejectForm.get('titre')?.value,
            commentaire: this.rejectForm.get('commentaire')?.value
        };

        this.subscriptions.push(
            this.serviceBalanceService.rejectServiceCompte(this.compteToReject.id!, request).subscribe({
                next: (result) => {
                    console.log('Rejet réussi:', result);
                    this.popupService.showSuccess(
                        this.translateKey('SBL.rejectSuccessTitle'),
                        this.translateKey('SBL.rejectSuccessMsg', { compte: this.compteToReject!.numeroCompte })
                    );
                    this.cancelReject();
                    this.loadServiceComptes(); // Recharger la liste
                },
                error: (error) => {
                    console.error('Erreur lors du rejet:', error);
                    let errorMessage = this.translateKey('SBL.errRejectMsg');
                    if (error.error && error.error.message) {
                        errorMessage = error.error.message;
                    } else if (error.message) {
                        errorMessage = error.message;
                    }
                    this.popupService.showError(this.translateKey('SBL.errRejectTitle'), errorMessage);
                },
                complete: () => {
                    this.isRejecting = false;
                }
            })
        );
    }

    getCountries(): string[] {
        return Object.keys(this.groupedByCountry).sort();
    }

    getComptesForCountry(country: string): Compte[] {
        return this.groupedByCountry[country] || [];
    }

    getTotalSoldeForCountry(country: string): number {
        return this.getComptesForCountry(country).reduce((total, compte) => total + compte.solde, 0);
    }

    // Méthodes pour les filtres et la recherche
    onSearchChange() {
        this.currentPage = 1;
        this.applyFiltersAndPagination();
    }

    onSortChange() {
        this.applyFiltersAndPagination();
    }

    onFilterChange() {
        this.currentPage = 1;
        this.applyFiltersAndPagination();
    }

    applyFiltersAndPagination() {
        let filtered = [...this.filteredServiceComptes];

        // Filtrage par terme de recherche
        if (this.searchTerm.trim()) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(compte => 
                compte.numeroCompte.toLowerCase().includes(searchLower) ||
                (compte.agence && compte.agence.toLowerCase().includes(searchLower))
            );
        }

        // Filtrage par solde
        if (this.filterBySolde !== 'all') {
            filtered = filtered.filter(compte => {
                switch (this.filterBySolde) {
                    case 'positive': return compte.solde > 0;
                    case 'negative': return compte.solde < 0;
                    case 'zero': return compte.solde === 0;
                    default: return true;
                }
            });
        }

        // Tri
        filtered.sort((a, b) => {
            let aValue: any, bValue: any;
            
            switch (this.sortBy) {
                case 'numeroCompte':
                    aValue = a.numeroCompte.toLowerCase();
                    bValue = b.numeroCompte.toLowerCase();
                    break;
                case 'solde':
                    aValue = a.solde;
                    bValue = b.solde;
                    break;
                case 'dateDerniereMaj':
                    aValue = new Date(a.dateDerniereMaj).getTime();
                    bValue = new Date(b.dateDerniereMaj).getTime();
                    break;
                default:
                    aValue = a.numeroCompte.toLowerCase();
                    bValue = b.numeroCompte.toLowerCase();
            }

            if (aValue < bValue) return this.sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // Mise à jour des comptes filtrés
        this.filteredServiceComptes = filtered;
        
        // Calcul de la pagination
        this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }

        // Application de la pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        this.paginatedComptes = filtered.slice(startIndex, endIndex);
    }

    // Méthodes de pagination
    goToPage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.applyFiltersAndPagination();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    // Méthodes utilitaires
    getTotalFilteredCount(): number {
        return this.filteredServiceComptes.length;
    }

    getPageNumbers(): number[] {
        const pages: number[] = [];
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    }

    clearFilters() {
        this.searchTerm = '';
        this.sortBy = 'numeroCompte';
        this.sortOrder = 'asc';
        this.filterBySolde = 'all';
        this.currentPage = 1;
        this.applyFiltersAndPagination();
    }

    private translateKey(key: string, params?: Record<string, unknown>): string {
        const value = params
            ? this.translate.instant(key, params as never)
            : this.translate.instant(key);
        return typeof value === 'string' ? value : key;
    }
}
