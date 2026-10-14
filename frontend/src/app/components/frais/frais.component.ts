import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Subscription, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { FraisTransactionService } from '../../services/frais-transaction.service';
import { FraisTransaction, FraisTransactionRequest } from '../../models/frais-transaction.model';
import * as XLSX from 'xlsx';
import { MatSelect } from '@angular/material/select';
import { PopupService } from '../../services/popup.service';
import { PaysService } from '../../services/pays.service';
import { Pays } from '../../models/pays.model';
import { normalizeCountryFilterOptions, matchesCountryFilter, countriesMatch } from '../../utils/country-codes.util';

interface ExportFraisData {
    'ID'?: number | undefined;
    'Service': string;
    'Agence': string;
    'Type de Calcul': string;
    'Valeur Paramétrée': string;
    'Description': string;
    'Statut': string;
    'Date Création': string;
    'Date Modification': string;
    [key: string]: any; // Index signature pour éviter l'erreur de linter
}

@Component({
    selector: 'app-frais',
    templateUrl: './frais.component.html',
    styleUrls: ['./frais.component.scss']
})
export class FraisComponent implements OnInit, OnDestroy {
    fraisTransactions: FraisTransaction[] = [];
    filteredFrais: FraisTransaction[] = [];
    services: string[] = [];
    agences: string[] = [];
    pays: Pays[] = [];
    paysList: string[] = [];
    
    isLoading = false;
    isAdding = false;
    isEditing = false;
    isExporting = false;
    showAddForm = false;
    showEditForm = false;

    /** Clients à créer pour la ligne en cours d'ajout (un frais sera créé par client). */
    addClients: string[] = [];
    newClientInput = '';
    clientsTouched = false;
    
    addForm: FormGroup;
    editForm: FormGroup;
    filterForm: FormGroup;
    
    editingFrais: FraisTransaction | null = null;
    
    // Pagination
    currentPage = 1;
    pageSize = 10;
    totalPages = 1;
    pagedFrais: FraisTransaction[] = [];
    
    // Propriétés pour le test des frais
    testService: string = '';
    testAgence: string = '';
    testTypeCalcul: string = 'NOMINAL';
    testMontantFrais: number = 0;
    testPourcentage: number = 0;
    testVolumeOperation: number = 0;
    testNombreTransactions: number = 1;
    testResult: any = null;
    
    // Filtres avancés
    serviceSearch: string = '';
    filteredServicesList: string[] = [];
    agenceSearch: string = '';
    filteredAgencesList: string[] = [];
    paysSearch: string = '';
    filteredPaysList: string[] = [];
    serviceSearchCtrl = new FormControl('');
    agenceSearchCtrl = new FormControl('');
    paysSearchCtrl = new FormControl('');
    dateDebut: string = '';
    dateFin: string = '';
    @ViewChild('serviceSelect') serviceSelect!: MatSelect;
    @ViewChild('agenceSelect') agenceSelect!: MatSelect;
    @ViewChild('paysSelect') paysSelect!: MatSelect;
    
    private subscription = new Subscription();
    
    constructor(
        private fraisTransactionService: FraisTransactionService,
        private paysService: PaysService,
        private fb: FormBuilder,
        private popupService: PopupService
    ) {
        this.addForm = this.fb.group({
            service: ['', [Validators.required]],
            typeCalcul: ['NOMINAL', [Validators.required]],
            montantFrais: [0, [Validators.required, Validators.min(0)]],
            pourcentage: [0, [Validators.min(0), Validators.max(100)]],
            description: [''],
            actif: [true]
        });
        
        this.editForm = this.fb.group({
            id: [null],
            service: ['', [Validators.required]],
            agence: ['', [Validators.required]],
            typeCalcul: ['NOMINAL', [Validators.required]],
            montantFrais: [0, [Validators.required, Validators.min(0)]],
            pourcentage: [0, [Validators.min(0), Validators.max(100)]],
            description: [''],
            actif: [true]
        });
        
        this.filterForm = this.fb.group({
            services: [[]],
            agences: [[]],
            pays: [[]],
            actif: [''],
            dateDebut: [''],
            dateFin: ['']
        });
    }
    
    ngOnInit() {
        this.loadFraisTransactions();
        this.loadServices();
        this.loadAgences();
        this.loadPays();
        this.serviceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            this.filteredServicesList = this.services.filter(p => p.toLowerCase().includes(s));
            if (this.filteredServicesList.length === 1 && !this.filterForm.controls['services'].value.includes(this.filteredServicesList[0])) {
                this.filterForm.controls['services'].setValue([this.filteredServicesList[0]]);
                if (this.serviceSelect) { this.serviceSelect.close(); }
                this.applyFilters();
            }
        });
        this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            this.filteredAgencesList = this.agences.filter(c => c.toLowerCase().includes(s));
            if (this.filteredAgencesList.length === 1 && !this.filterForm.controls['agences'].value.includes(this.filteredAgencesList[0])) {
                this.filterForm.controls['agences'].setValue([this.filteredAgencesList[0]]);
                if (this.agenceSelect) { this.agenceSelect.close(); }
                this.applyFilters();
            }
        });
        this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            this.filteredPaysList = this.paysList.filter(p => p.toLowerCase().includes(s));
            if (this.filteredPaysList.length === 1 && !this.filterForm.controls['pays'].value.includes(this.filteredPaysList[0])) {
                this.filterForm.controls['pays'].setValue([this.filteredPaysList[0]]);
                if (this.paysSelect) { this.paysSelect.close(); }
                this.applyFilters();
            }
        });
    }
    
    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
    
    loadFraisTransactions() {
        this.isLoading = true;
        this.subscription.add(
            this.fraisTransactionService.getAllFraisTransactions().subscribe({
                next: (data) => {
                    this.fraisTransactions = data;
                    this.filteredFrais = [...data];
                    this.applyFilters();
                    this.isLoading = false;
                },
                error: (err) => {
                    console.error('Erreur de chargement des frais de transaction', err);
                    this.isLoading = false;
                }
            })
        );
    }
    
    loadServices() {
        this.subscription.add(
            this.fraisTransactionService.getAllServices().subscribe({
                next: (services) => {
                    this.services = services;
                    this.filteredServicesList = services; // Correction ici
                },
                error: (err) => {
                    console.error('Erreur de chargement des services', err);
                }
            })
        );
    }
    
    loadAgences() {
        this.subscription.add(
            this.fraisTransactionService.getAllAgences().subscribe({
                next: (agences) => {
                    this.agences = agences;
                    this.filteredAgencesList = agences; // Correction ici
                },
                error: (err) => {
                    console.error('Erreur de chargement des agences', err);
                }
            })
        );
    }
    
    loadPays() {
        this.subscription.add(
            this.paysService.getPays('Frais').subscribe({
                next: (pays) => {
                    this.pays = pays;
                    this.paysList = normalizeCountryFilterOptions(pays.map(p => p.nom));
                    this.filteredPaysList = this.paysList;
                },
                error: (err) => {
                    console.error('Erreur de chargement des pays', err);
                }
            })
        );
    }
    
    addFraisTransaction() {
        this.clientsTouched = true;

        // Valider la saisie client en cours (non encore ajoutée via Entrée)
        if (this.newClientInput && this.newClientInput.trim()) {
            this.addClientFromInput();
        }

        if (this.addClients.length === 0) {
            this.popupService.showWarning('Ajoutez au moins un client');
            return;
        }

        if (this.addForm.invalid) {
            this.addForm.markAllAsTouched();
            return;
        }

        this.isAdding = true;
        const formValue = this.addForm.value;

        // Une ligne de frais est créée pour chaque client, avec les mêmes paramètres.
        const requests = this.addClients.map(client => {
            const fraisRequest: FraisTransactionRequest = {
                service: formValue.service,
                agence: client,
                typeCalcul: formValue.typeCalcul,
                montantFrais: formValue.typeCalcul === 'NOMINAL' ? formValue.montantFrais : 0,
                pourcentage: formValue.typeCalcul === 'POURCENTAGE' ? formValue.pourcentage : undefined,
                description: formValue.description,
                actif: formValue.actif
            };
            return this.fraisTransactionService.createFraisTransaction(fraisRequest).pipe(
                map(() => ({ client, ok: true as const, message: '' })),
                catchError(err => of({ client, ok: false as const, message: this.extractErrorMessage(err) }))
            );
        });

        this.subscription.add(
            forkJoin(requests).subscribe({
                next: (results) => {
                    this.isAdding = false;
                    const created = results.filter(r => r.ok).length;
                    const failed = results.filter(r => !r.ok);

                    if (created > 0) {
                        this.popupService.showSuccess(
                            created === 1 ? 'Frais de transaction ajouté' : `${created} frais ajoutés (un par client)`
                        );
                    }
                    if (failed.length > 0) {
                        const details = failed.map(f => `${f.client} : ${f.message}`).join('\n');
                        this.popupService.showError(`${failed.length} client(s) non ajouté(s)\n${details}`);
                    }

                    this.loadFraisTransactions();
                    this.cancelAdd();
                },
                error: (err) => {
                    console.error('Erreur lors de l\'ajout', err);
                    this.popupService.showError('Erreur lors de l\'ajout du frais de transaction');
                    this.isAdding = false;
                }
            })
        );
    }

    /** Ajoute un ou plusieurs clients (séparés par , ; ou saut de ligne) à la ligne en cours. */
    addClientFromInput() {
        const raw = (this.newClientInput || '').trim();
        if (!raw) {
            return;
        }
        const parts = raw.split(/[,;\n]/).map(p => p.trim()).filter(p => !!p);
        const duplicates: string[] = [];
        let added = 0;
        for (const part of parts) {
            if (this.addClients.some(c => c.toLowerCase() === part.toLowerCase())) {
                duplicates.push(part);
                continue;
            }
            this.addClients.push(part);
            added++;
        }
        this.newClientInput = '';
        if (added > 0) {
            this.clientsTouched = true;
        }
        if (duplicates.length > 0) {
            this.popupService.showInfo(`Client(s) déjà présent(s) : ${duplicates.join(', ')}`);
        }
    }

    removeAddClient(index: number) {
        this.addClients.splice(index, 1);
    }

    onClientInputKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            this.addClientFromInput();
        }
    }

    private extractErrorMessage(err: any): string {
        if (err && err.error) {
            if (typeof err.error === 'string') {
                return err.error;
            }
            if (err.error.error) {
                return err.error.error;
            }
            if (err.error.message) {
                return err.error.message;
            }
        }
        return err?.message || 'Erreur inconnue';
    }
    
    editFraisTransaction(frais: FraisTransaction) {
        this.editingFrais = frais;
        this.editForm.patchValue({
            id: frais.id,
            service: frais.service,
            agence: frais.agence,
            typeCalcul: frais.typeCalcul || 'NOMINAL',
            montantFrais: frais.montantFrais,
            pourcentage: frais.pourcentage || 0,
            description: frais.description,
            actif: frais.actif
        });
        this.showEditForm = true;
        this.showAddForm = false;
    }
    
    updateFraisTransaction() {
        if (this.editForm.valid && this.editingFrais) {
            const formValue = this.editForm.value;
            
            // Préparer la requête selon le type de calcul
            const fraisRequest: FraisTransactionRequest = {
                service: formValue.service,
                agence: formValue.agence,
                typeCalcul: formValue.typeCalcul,
                montantFrais: formValue.typeCalcul === 'NOMINAL' ? formValue.montantFrais : 0,
                pourcentage: formValue.typeCalcul === 'POURCENTAGE' ? formValue.pourcentage : undefined,
                description: formValue.description,
                actif: formValue.actif
            };
            
            this.subscription.add(
                this.fraisTransactionService.updateFraisTransaction(this.editingFrais.id!, fraisRequest).subscribe({
                    next: () => {
                        this.loadFraisTransactions();
                        this.cancelEdit();
                    },
                    error: (err) => {
                        console.error('Erreur lors de la mise à jour', err);
                        // Afficher le message d'erreur du backend
                        if (err.error && err.error.error) {
                            this.popupService.showError('Erreur: ' + err.error.error);
                        } else {
                            this.popupService.showError('Erreur lors de la mise à jour du frais de transaction');
                        }
                    }
                })
            );
        }
    }
    
    deleteFraisTransaction(id: number) {
        if (confirm('Êtes-vous sûr de vouloir supprimer ce frais de transaction ?')) {
            this.subscription.add(
                this.fraisTransactionService.deleteFraisTransaction(id).subscribe({
                    next: () => {
                        this.loadFraisTransactions();
                    },
                    error: (err) => {
                        console.error('Erreur lors de la suppression', err);
                    }
                })
            );
        }
    }
    
    toggleFraisTransaction(id: number) {
        this.subscription.add(
            this.fraisTransactionService.toggleFraisTransaction(id).subscribe({
                next: () => {
                    this.loadFraisTransactions();
                },
                error: (err) => {
                    console.error('Erreur lors de l\'activation/désactivation', err);
                }
            })
        );
    }
    
    cancelAdd() {
        this.showAddForm = false;
        this.addClients = [];
        this.newClientInput = '';
        this.clientsTouched = false;
        this.addForm.reset({ actif: true, typeCalcul: 'NOMINAL', montantFrais: 0, pourcentage: 0 });
    }
    
    cancelEdit() {
        this.showEditForm = false;
        this.editingFrais = null;
        this.editForm.reset();
    }
    
    applyFilters() {
        // Synchroniser les champs du formulaire avec les sélections UI
        this.filterForm.controls['services'].setValue(this.filterForm.controls['services'].value);
        this.filterForm.controls['agences'].setValue(this.filterForm.controls['agences'].value);
        this.filterForm.controls['pays'].setValue(this.filterForm.controls['pays'].value);
        const filter = {
            ...this.filterForm.value,
            services: this.filterForm.controls['services'].value,
            agences: this.filterForm.controls['agences'].value,
            pays: this.filterForm.controls['pays'].value,
            dateDebut: this.dateDebut,
            dateFin: this.dateFin
        };
        this.isLoading = true;
        this.subscription.add(
            this.fraisTransactionService.filterFraisTransactions(filter).subscribe({
                next: (frais) => {
                    this.fraisTransactions = frais;
                    this.filteredFrais = [...frais];
                    this.updatePagedFrais();
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
        this.filterForm.reset();
        this.applyFilters();
    }
    
    updatePagedFrais() {
        this.totalPages = Math.ceil(this.filteredFrais.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        this.pagedFrais = this.filteredFrais.slice(startIndex, startIndex + this.pageSize);
    }
    
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePagedFrais();
        }
    }
    
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePagedFrais();
        }
    }
    
    goToPage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.updatePagedFrais();
        }
    }
    
    getVisiblePages(): number[] {
        const maxVisible = 5;
        const pages: number[] = [];
        
        if (this.totalPages <= maxVisible) {
            for (let i = 1; i <= this.totalPages; i++) {
                pages.push(i);
            }
        } else {
            let start = Math.max(1, this.currentPage - 2);
            let end = Math.min(this.totalPages, start + maxVisible - 1);
            
            if (end - start < maxVisible - 1) {
                start = Math.max(1, end - maxVisible + 1);
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
        }
        
        return pages;
    }
    
    onTypeCalculChange() {
        // Réinitialiser les validations selon le type de calcul
        const typeCalcul = this.addForm.get('typeCalcul')?.value;
        const montantControl = this.addForm.get('montantFrais');
        const pourcentageControl = this.addForm.get('pourcentage');
        
        if (typeCalcul === 'NOMINAL') {
            montantControl?.setValidators([Validators.required, Validators.min(0)]);
            pourcentageControl?.clearValidators();
        } else if (typeCalcul === 'POURCENTAGE') {
            montantControl?.clearValidators();
            pourcentageControl?.setValidators([Validators.required, Validators.min(0), Validators.max(100)]);
        }
        
        montantControl?.updateValueAndValidity();
        pourcentageControl?.updateValueAndValidity();
    }

    // Méthodes pour le modal d'ajout
    closeAddModal(event: Event) {
        if (event.target === event.currentTarget) {
            this.cancelAdd();
        }
    }

    showCalculationPreview(): boolean {
        const service = this.addForm.get('service')?.value;
        const agence = this.addForm.get('agence')?.value;
        const typeCalcul = this.addForm.get('typeCalcul')?.value;
        
        return !!(service && agence && typeCalcul);
    }

    getTypeCalculDisplayName(): string {
        const typeCalcul = this.addForm.get('typeCalcul')?.value;
        switch (typeCalcul) {
            case 'NOMINAL':
                return 'Frais fixe';
            case 'POURCENTAGE':
                return 'Frais en pourcentage';
            default:
                return 'Non défini';
        }
    }
    
    // Méthodes pour le test des frais
    onTestTypeChange() {
        // Réinitialiser les valeurs selon le type de calcul
        if (this.testTypeCalcul === 'NOMINAL') {
            this.testPourcentage = 0;
        } else {
            this.testMontantFrais = 0;
            this.testNombreTransactions = 1;
        }
        this.testResult = null;
    }
    
    testFraisCalculation() {
        if (!this.testService || !this.testAgence || !this.testVolumeOperation) {
            this.popupService.showWarning('Veuillez remplir tous les champs obligatoires');
            return;
        }
        
        const params: any = {
            service: this.testService,
            agence: this.testAgence,
            typeCalcul: this.testTypeCalcul,
            montantFrais: this.testMontantFrais,
            volumeOperation: this.testVolumeOperation
        };
        
        if (this.testTypeCalcul === 'POURCENTAGE') {
            params.pourcentage = this.testPourcentage;
        } else {
            params.nombreTransactions = this.testNombreTransactions;
        }
        
        this.subscription.add(
            this.fraisTransactionService.testFraisCalculation(params).subscribe({
                next: (result: any) => {
                    this.testResult = result;
                },
                error: (err: any) => {
                    console.error('Erreur lors du test', err);
                    this.popupService.showError('Erreur lors du test du calcul');
                }
            })
        );
    }

    /**
     * Exporter les frais de transaction en CSV
     */
    exportToCSV() {
        if (!this.filteredFrais || !this.filteredFrais.length) {
            this.popupService.showInfo('Aucune donnée à exporter', 'Aucune Donnée');
            return;
        }

        this.isExporting = true;
        
        try {
            // Préparer les données pour l'export
            const exportData: ExportFraisData[] = this.filteredFrais.map(frais => ({
                'Service': frais.service,
                'Agence': frais.agence,
                'Type de Calcul': frais.typeCalcul === 'POURCENTAGE' ? 'Frais en pourcentage' : 'Frais fixe',
                'Valeur Paramétrée': frais.typeCalcul === 'POURCENTAGE' 
                    ? `${frais.pourcentage}%` 
                    : `${frais.montantFrais} FCFA`,
                'Description': frais.description || '-',
                'Statut': frais.actif ? 'Actif' : 'Inactif',
                'Date Création': frais.dateCreation ? new Date(frais.dateCreation).toLocaleString('fr-FR') : '-',
                'Date Modification': frais.dateModification ? new Date(frais.dateModification).toLocaleString('fr-FR') : '-'
            }));

            // Créer le CSV
            const replacer = (key: string, value: any) => value === null ? '' : value;
            const header = Object.keys(exportData[0]);
            const csv = [
                header.join(','),
                ...exportData.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
            ].join('\r\n');

            // Télécharger le fichier
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = `frais_transaction_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            
            this.isExporting = false;
        } catch (error) {
            console.error('Erreur lors de l\'export CSV:', error);
            this.popupService.showError('Erreur lors de l\'export CSV');
            this.isExporting = false;
        }
    }

    /**
     * Exporter les frais de transaction en Excel
     */
    exportToExcel() {
        if (!this.filteredFrais || !this.filteredFrais.length) {
            this.popupService.showInfo('Aucune donnée à exporter', 'Aucune Donnée');
            return;
        }

        this.isExporting = true;
        
        try {
            // Préparer les données pour l'export
            const exportData: ExportFraisData[] = this.filteredFrais.map(frais => ({
                'Service': frais.service,
                'Agence': frais.agence,
                'Type de Calcul': frais.typeCalcul === 'POURCENTAGE' ? 'Frais en pourcentage' : 'Frais fixe',
                'Valeur Paramétrée': frais.typeCalcul === 'POURCENTAGE' 
                    ? `${frais.pourcentage}%` 
                    : `${frais.montantFrais} FCFA`,
                'Description': frais.description || '-',
                'Statut': frais.actif ? 'Actif' : 'Inactif',
                'Date Création': frais.dateCreation ? new Date(frais.dateCreation).toLocaleString('fr-FR') : '-',
                'Date Modification': frais.dateModification ? new Date(frais.dateModification).toLocaleString('fr-FR') : '-'
            }));

            // Créer la feuille de calcul
            const ws = XLSX.utils.json_to_sheet(exportData);

            // Styles pour l'en-tête
            const headerStyle = { 
                fill: { fgColor: { rgb: 'FF764BA2' } }, 
                font: { bold: true, color: { rgb: 'FFFFFFFF' } },
                border: { 
                    top: { style: 'thin', color: { rgb: 'FFCCCCCC' } }, 
                    bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } }, 
                    left: { style: 'thin', color: { rgb: 'FFCCCCCC' } }, 
                    right: { style: 'thin', color: { rgb: 'FFCCCCCC' } } 
                }
            };

            // Appliquer le style à l'en-tête
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx++) {
                const cell = XLSX.utils.encode_cell({ r: 0, c: colIdx });
                if (ws[cell]) ws[cell].s = headerStyle;
            }

            // Largeur automatique des colonnes
            ws['!cols'] = [
                { wch: 15 }, // Service
                { wch: 20 }, // Agence
                { wch: 18 }, // Type de Calcul
                { wch: 20 }, // Valeur Paramétrée
                { wch: 30 }, // Description
                { wch: 10 }, // Statut
                { wch: 20 }, // Date Création
                { wch: 20 }  // Date Modification
            ];

            // Créer le classeur
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Frais de Transaction');

            // Télécharger le fichier
            XLSX.writeFile(wb, `frais_transaction_${new Date().toISOString().split('T')[0]}.xlsx`);
            
            this.isExporting = false;
        } catch (error) {
            console.error('Erreur lors de l\'export Excel:', error);
            this.popupService.showError('Erreur lors de l\'export Excel', 'Erreur d\'Export');
            this.isExporting = false;
        }
    }

    /**
     * Exporter les frais de transaction via l'API backend
     */
    exportViaAPI() {
        this.isExporting = true;
        
        this.subscription.add(
            this.fraisTransactionService.exportFraisTransactions().subscribe({
                next: (response) => {
                    if (response.success && response.data) {
                        // Utiliser les données de l'API pour créer l'export
                        const exportData: ExportFraisData[] = response.data.map((item: any) => ({
                            'Service': item.Service,
                            'Agence': item.Agence,
                            'Type de Calcul': item['Type de Calcul'],
                            'Valeur Paramétrée': item['Valeur Paramétrée'],
                            'Description': item.Description,
                            'Statut': item.Statut,
                            'Date Création': item['Date Création'],
                            'Date Modification': item['Date Modification']
                        }));

                        // Créer le CSV
                        const replacer = (key: string, value: any) => value === null ? '' : value;
                        const header = Object.keys(exportData[0]);
                        const csv = [
                            header.join(','),
                            ...exportData.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
                        ].join('\r\n');

                        // Télécharger le fichier
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = window.URL.createObjectURL(blob);
                        link.download = `frais_transaction_api_${new Date().toISOString().split('T')[0]}.csv`;
                        link.click();
                        
                        console.log(`Export réussi: ${response.totalCount} frais exportés`);
                    } else {
                        this.popupService.showError('Erreur lors de l\'export: ' + (response.error || 'Erreur inconnue'), 'Erreur d\'Export');
                    }
                    this.isExporting = false;
                },
                error: (err) => {
                    console.error('Erreur lors de l\'export via API:', err);
                    this.popupService.showError('Erreur lors de l\'export via API', 'Erreur d\'Export');
                    this.isExporting = false;
                }
            })
        );
    }

    onServiceChange(event: any) {
        this.filterForm.controls['services'].setValue(event.value);
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.serviceSelect) this.serviceSelect.close();
        }, 100);
    }
    onAgenceChange(event: any) {
        this.filterForm.controls['agences'].setValue(event.value);
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.agenceSelect) this.agenceSelect.close();
        }, 100);
    }
    
    onPaysChange(event: any) {
        this.filterForm.controls['pays'].setValue(event.value);
        this.applyFilters();
        
        // Fermer automatiquement le dropdown après un choix
        setTimeout(() => {
            if (this.paysSelect) this.paysSelect.close();
        }, 100);
    }
    onDateDebutChange(event: any) {
        this.dateDebut = event.target.value;
        this.filterForm.controls['dateDebut'].setValue(this.dateDebut);
        this.applyFilters();
    }
    onDateFinChange(event: any) {
        this.dateFin = event.target.value;
        this.filterForm.controls['dateFin'].setValue(this.dateFin);
        this.applyFilters();
    }

    // Méthodes pour le modal de modification
    closeEditModal(event: Event) {
        if (event.target === event.currentTarget) {
            this.cancelEdit();
        }
    }

    showEditCalculationPreview(): boolean {
        const typeCalcul = this.editForm.get('typeCalcul')?.value;
        const service = this.editForm.get('service')?.value;
        const agence = this.editForm.get('agence')?.value;
        
        if (typeCalcul === 'NOMINAL') {
            const montant = this.editForm.get('montantFrais')?.value;
            return service && agence && montant && montant > 0;
        } else if (typeCalcul === 'POURCENTAGE') {
            const pourcentage = this.editForm.get('pourcentage')?.value;
            return service && agence && pourcentage && pourcentage > 0;
        }
        
        return false;
    }

    getEditTypeCalculDisplayName(): string {
        const typeCalcul = this.editForm.get('typeCalcul')?.value;
        return typeCalcul === 'POURCENTAGE' ? 'Frais en pourcentage' : 'Frais fixe';
    }
} 