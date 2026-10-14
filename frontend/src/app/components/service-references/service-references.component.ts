import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';

import { ServiceReference, ServiceReferencePayload } from '../../models/service-reference.model';
import { ServiceReferenceService } from '../../services/service-reference.service';
import { ModernPopupComponent, PopupConfig } from '../modern-popup/modern-popup.component';
import { ServiceReferencesDashboardPanelComponent } from './service-references-dashboard-panel.component';
import { TranslateModule } from '@ngx-translate/core';

type ImportPayload = ServiceReferencePayload & { rowNumber: number };

/** Dimension de filtre : pour calculer les listes déroulantes en excluant une dimension (cloisonnement). */
type ServiceRefFilterDimension =
    | 'pays'
    | 'operateur'
    | 'reseau'
    | 'serviceType'
    | 'codeService'
    | 'status'
    | 'reconciliable';

@Component({
    selector: 'app-service-references',
    standalone: true,
    imports: [TranslateModule, SharedUiModule],
    templateUrl: './service-references.component.html',
    styleUrls: ['./service-references.component.scss']
})

export class ServiceReferencesComponent implements OnInit, OnDestroy {
    private readonly destroy$ = new Subject<void>();
    references: ServiceReference[] = [];
    filteredReferences: ServiceReference[] = [];
    isLoading = false;
    isSaving = false;
    isImporting = false;
    isExporting = false;
    errorMessage: string | null = null;
    successMessage: string | null = null;
    errorDetails: string[] = [];
    searchTerm = '';
    showForm = false;

    referenceForm: FormGroup;
    editingReference: ServiceReference | null = null;
    filterForm: FormGroup;

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
    @ViewChild('formPanel') formPanel?: ElementRef<HTMLElement>;
    @ViewChild('dashboardPanel') dashboardPanel?: ServiceReferencesDashboardPanelComponent;

    private readonly templateHeaders = [
        'Pays',
        'Code Service',
        'Service',
        'Code RECO',
        'Service Type',
        'Opérateur',
        'Réseau',
        'Réconciliable',
        'Motif',
        'Retenu Opérateur'
    ];

    paysOptions: string[] = [];
    operateurOptions: string[] = [];
    serviceTypeOptions: string[] = [];
    reseauOptions: string[] = [];
    codeServiceOptions: string[] = [];

    pageIndex = 1;
    pageSize = 10;
    pageSizeOptions = [10, 25, 50];
    totalItems = 0;
    selectedReferences: Set<number> = new Set();
    allSelected = false;
    isDashboardVisible = false;
    dashboardPeriodMonths = 3;
    private activeInAgencyKeys = new Set<string>();

    constructor(
        private serviceReferenceService: ServiceReferenceService,
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute
    ) {
        this.referenceForm = this.fb.group({
            pays: ['', Validators.required],
            codeService: ['', Validators.required],
            serviceLabel: ['', Validators.required],
            codeReco: ['', Validators.required],
            serviceType: [''],
            operateur: [''],
            reseau: [''],
            reconciliable: [true],
            motif: [''],
            retenuOperateur: [''],
            status: ['ACTIF']
        });

        this.filterForm = this.fb.group({
            pays: [''],
            operateur: [''],
            reseau: [''],
            serviceType: [''],
            codeService: [''],
            status: [''],
            reconciliable: ['all']
        });
    }

    ngOnInit(): void {
        this.filterForm.valueChanges
            .pipe(
                debounceTime(200),
                distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
                takeUntil(this.destroy$)
            )
            .subscribe(() => this.applyFilters());

        this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
            const d = params.get('dashboard');
            const show =
                d === '1' ||
                d === 'true' ||
                params.get('view') === 'dashboard';
            this.isDashboardVisible = show;
        });

        this.loadReferences();
        this.loadActiveInAgencyKeys();

        this.referenceForm.valueChanges
            .pipe(debounceTime(150), takeUntil(this.destroy$))
            .subscribe(() => this.refreshFormComputedStatus());
    }

    private loadActiveInAgencyKeys(): void {
        this.serviceReferenceService.getActiveInAgencyKeys(this.dashboardPeriodMonths).subscribe({
            next: (keys) => {
                this.activeInAgencyKeys = new Set(keys || []);
                this.refreshFormComputedStatus();
            },
            error: () => {
                this.activeInAgencyKeys = new Set();
            }
        });
    }

    private agencyStatusKey(pays: string, codeService: string): string {
        const paysNorm = (pays || '').trim().toUpperCase();
        const codeNorm = this.normalizeImportCodeService(codeService).toLowerCase();
        return `${paysNorm}|${codeNorm}`;
    }

    private isActiveInReconciliationReport(
        pays: string,
        codeService: string,
        serviceLabel?: string | null,
        codeReco?: string | null
    ): boolean {
        const aliases = [codeService, serviceLabel, codeReco]
            .filter((value): value is string => !!value && String(value).trim().length > 0);
        return aliases.some((alias) => this.activeInAgencyKeys.has(this.agencyStatusKey(pays, alias)));
    }

    private refreshFormComputedStatus(): void {
        if (!this.referenceForm) {
            return;
        }
        const { pays, codeService, serviceLabel, codeReco } = this.referenceForm.value;
        const status = this.isActiveInReconciliationReport(pays, codeService, serviceLabel, codeReco)
            ? 'ACTIF'
            : 'INACTIF';
        if (this.referenceForm.get('status')?.value !== status) {
            this.referenceForm.patchValue({ status }, { emitEvent: false });
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    toggleDashboard(): void {
        this.isDashboardVisible = !this.isDashboardVisible;
        if (this.isDashboardVisible && this.showForm) {
            this.cancelEdit();
        }
        this.syncDashboardQueryParam(this.isDashboardVisible);
    }

    onDashboardPeriodChange(periodMonths: number): void {
        this.dashboardPeriodMonths = periodMonths;
        this.loadActiveInAgencyKeys();
    }

    get importFileAccept(): string {
        return '.xlsx,.xls,.xlsm,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values';
    }

    loadReferences(): void {
        this.clearSelection();
        this.isLoading = true;
        this.errorMessage = null;
        this.serviceReferenceService.listAll().subscribe({
            next: (refs) => {
                this.references = refs.sort((a, b) => a.pays.localeCompare(b.pays));
                this.applyFilters();
                this.isLoading = false;
                this.errorDetails = [];
                this.loadActiveInAgencyKeys();
            },
            error: (error) => {
                console.error('Error while loading references', error);
                const msg = error?.error?.message || error?.message;
                this.errorMessage = error?.status === 429 || (typeof msg === 'string' && msg.includes('Trop de requêtes'))
                    ? (typeof msg === 'string' ? msg : 'Too many requests. Please try again later.')
                    : 'Unable to load the repository. Please try again.';
                this.isLoading = false;
            }
        });
    }

    applyFilters(): void {
        this.updateFilterOptions();
        const term = (this.searchTerm || '').toLowerCase();

        this.filteredReferences = this.references.filter((ref) => {
            const matchesSearch =
                !term ||
                [
                    ref.pays,
                    ref.codeService,
                    ref.serviceLabel,
                    ref.codeReco,
                    ref.serviceType || '',
                    ref.operateur || '',
                    ref.reseau || ''
                ].some((field) => field.toLowerCase().includes(term));

            return matchesSearch && this.matchesFilterForm(ref, null);
        });

        this.totalItems = this.filteredReferences.length;
        this.pageIndex = 1;
        this.syncSelectionWithData();
        this.updateAllSelectedState();
    }

    /**
     * Applique les critères du formulaire de filtre.
     * Si {@code exclude} est renseigné, ce critère est ignoré (pour proposer des valeurs cohérentes sur les autres dimensions).
     */
    private matchesFilterForm(ref: ServiceReference, exclude: ServiceRefFilterDimension | null): boolean {
        const { pays, operateur, serviceType, reseau, codeService, status, reconciliable } = this.filterForm.value;
        const normalizedStatus = (status || '').trim().toUpperCase();

        if (exclude !== 'pays' && pays) {
            if (!ref.pays.toLowerCase().includes(String(pays).toLowerCase())) {
                return false;
            }
        }
        if (exclude !== 'operateur' && operateur) {
            if (!String(ref.operateur || '').toLowerCase().includes(String(operateur).toLowerCase())) {
                return false;
            }
        }
        if (exclude !== 'serviceType' && serviceType) {
            if (!String(ref.serviceType || '').toLowerCase().includes(String(serviceType).toLowerCase())) {
                return false;
            }
        }
        if (exclude !== 'reseau' && reseau) {
            if (!String(ref.reseau || '').toLowerCase().includes(String(reseau).toLowerCase())) {
                return false;
            }
        }
        if (exclude !== 'codeService' && codeService) {
            if (!ref.codeService.toLowerCase().includes(String(codeService).toLowerCase())) {
                return false;
            }
        }
        if (exclude !== 'status' && normalizedStatus) {
            if (String(ref.status || 'ACTIF').toUpperCase() !== normalizedStatus) {
                return false;
            }
        }
        if (exclude !== 'reconciliable' && reconciliable !== 'all') {
            if (ref.reconciliable !== (reconciliable === 'true')) {
                return false;
            }
        }
        return true;
    }

    /**
     * Suggestions de filtres cloisonnées : chaque liste ne contient que les valeurs présentes
     * dans les lignes qui satisfont déjà les autres critères (pays ↔ service ↔ réseau, etc.).
     */
    private updateFilterOptions(): void {
        const unique = <T>(arr: T[]) => Array.from(new Set(arr)).sort();

        this.paysOptions = unique(
            this.references.filter((ref) => this.matchesFilterForm(ref, 'pays')).map((ref) => ref.pays)
        );
        this.operateurOptions = unique(
            this.references
                .filter((ref) => this.matchesFilterForm(ref, 'operateur'))
                .map((ref) => ref.operateur)
                .filter((op): op is string => !!op)
        );
        this.serviceTypeOptions = unique(
            this.references
                .filter((ref) => this.matchesFilterForm(ref, 'serviceType'))
                .map((ref) => ref.serviceType)
                .filter((st): st is string => !!st)
        );
        this.reseauOptions = unique(
            this.references
                .filter((ref) => this.matchesFilterForm(ref, 'reseau'))
                .map((ref) => ref.reseau)
                .filter((rs): rs is string => !!rs)
        );
        this.codeServiceOptions = unique(
            this.references
                .filter((ref) => this.matchesFilterForm(ref, 'codeService'))
                .map((ref) => ref.codeService)
        );
    }

    private norm(s: string | undefined | null): string {
        return (s ?? '').trim().toLowerCase();
    }

    get pagedReferences(): ServiceReference[] {
        const start = (this.pageIndex - 1) * this.pageSize;
        return this.filteredReferences.slice(start, start + this.pageSize);
    }

    get totalPages(): number {
        return Math.max(1, Math.ceil(this.filteredReferences.length / this.pageSize));
    }

    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages) {
            return;
        }
        this.pageIndex = page;
    }

    changePageSize(size: string | number): void {
        this.pageSize = Number(size);
        this.pageIndex = 1;
    }

    resetFilters(): void {
        this.filterForm.reset({
            pays: '',
            operateur: '',
            reseau: '',
            serviceType: '',
            codeService: '',
            status: '',
            reconciliable: 'all'
        });
        this.applyFilters();
    }

    startCreate(): void {
        this.editingReference = null;
        this.referenceForm.setValue({
            pays: '',
            codeService: '',
            serviceLabel: '',
            codeReco: '',
            serviceType: '',
            operateur: '',
            reseau: '',
            reconciliable: true,
            motif: '',
            retenuOperateur: '',
            status: 'INACTIF'
        });
        this.refreshFormComputedStatus();
    }

    openCreateForm(): void {
        if (this.isDashboardVisible) {
            this.isDashboardVisible = false;
            this.syncDashboardQueryParam(false);
        }
        this.showForm = true;
        this.startCreate();
        this.focusFormPanel();
    }

    editReference(reference: ServiceReference): void {
        if (this.isDashboardVisible) {
            this.isDashboardVisible = false;
            this.syncDashboardQueryParam(false);
        }
        this.showForm = true;
        this.editingReference = reference;
        this.referenceForm.patchValue(reference);
        this.refreshFormComputedStatus();
        this.focusFormPanel();
    }

    private syncDashboardQueryParam(showDashboard: boolean): void {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { dashboard: showDashboard ? '1' : null },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    private focusFormPanel(): void {
        setTimeout(() => this.formPanel?.nativeElement?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
    }

    async saveReference(): Promise<void> {
        if (this.referenceForm.invalid) {
            this.referenceForm.markAllAsTouched();
            return;
        }

        this.isSaving = true;
        this.errorMessage = null;
        this.successMessage = null;

        const payload: ServiceReferencePayload = this.referenceForm.value;

        try {
            if (this.editingReference?.id) {
                await firstValueFrom(
                    this.serviceReferenceService.update(
                        this.editingReference.id,
                        this.normalizePayload(payload)
                    )
                );
                this.successMessage = 'Reference updated successfully.';
            } else {
                const normalized = this.normalizePayload(payload);
                const existing = this.findReferenceByPaysAndCodeService(
                    normalized.pays,
                    normalized.codeService
                );
                if (existing?.id) {
                    await firstValueFrom(
                        this.serviceReferenceService.update(existing.id, normalized)
                    );
                    this.successMessage = 'Reference updated successfully.';
                } else {
                    await firstValueFrom(this.serviceReferenceService.create(normalized));
                    this.successMessage = 'Reference added successfully.';
                }
            }
            await this.showSuccessPopup(this.successMessage || 'Operation successful');
            this.startCreate();
            this.loadReferences();
        } catch (error) {
            console.error('Error while saving', error);
            this.errorMessage = this.extractErrorMessage(error) || 'Failed to save.';
            this.errorDetails = [];
            await this.showErrorPopup(this.errorMessage);
        } finally {
            this.isSaving = false;
        }
    }

    async deleteReference(reference: ServiceReference): Promise<void> {
        if (!reference.id) {
            return;
        }

        const confirmed = await ModernPopupComponent.showPopup({
            title: 'Delete this reference?',
            message: `The reference ${reference.codeReco} (${reference.serviceLabel}) will be permanently deleted.`,
            type: 'confirm',
            showCancelButton: true,
            cancelText: 'Cancel',
            confirmText: 'Delete'
        });
        if (!confirmed) {
            return;
        }

        this.errorMessage = null;
        this.successMessage = null;
        this.isLoading = true;
        try {
            await firstValueFrom(this.serviceReferenceService.delete(reference.id));
            this.successMessage = 'Reference deleted.';
            await this.showSuccessPopup(this.successMessage);
            this.loadReferences();
        } catch (error) {
            console.error('Error while deleting', error);
            this.errorMessage = this.extractErrorMessage(error) || 'Unable to delete the reference.';
            this.errorDetails = [];
            this.isLoading = false;
            await this.showErrorPopup(this.errorMessage);
        }
    }

    async deleteSelectedReferences(): Promise<void> {
        if (!this.hasSelection) {
            return;
        }
        const n = this.selectedCount;
        const confirmed = await ModernPopupComponent.showPopup({
            title: 'Bulk delete',
            message: `Delete ${n} selected reference(s)? This action is irreversible.`,
            type: 'confirm',
            showCancelButton: true,
            cancelText: 'Cancel',
            confirmText: 'Delete all'
        });
        if (!confirmed) {
            return;
        }

        this.errorMessage = null;
        this.successMessage = null;
        this.errorDetails = [];
        this.isLoading = true;
        try {
            const ids = Array.from(this.selectedReferences);
            const result = await firstValueFrom(this.serviceReferenceService.deleteBatch(ids));
            if (result.deletedCount === 0 && (result.errors?.length ?? 0) > 0) {
                this.errorMessage = 'No reference could be deleted.';
                this.errorDetails = result.errors;
                this.isLoading = false;
                await this.showErrorPopup(this.errorMessage);
                return;
            }
            this.clearSelection();
            if (result.errors?.length) {
                this.errorDetails = result.errors;
                this.successMessage = `${result.deletedCount} reference(s) deleted. Some rows failed (see the details below the table).`;
                await ModernPopupComponent.showWarning(
                    `${result.deletedCount} deleted. ${result.errors.length} error(s) — details displayed on the page.`,
                    'Partial deletion'
                );
            } else {
                this.successMessage = `${result.deletedCount} reference(s) deleted.`;
                await this.showSuccessPopup(this.successMessage);
            }
            this.loadReferences();
        } catch (error) {
            console.error('Error while bulk deleting', error);
            this.errorMessage = this.extractErrorMessage(error) || 'Unable to delete the selection.';
            this.errorDetails = [];
            this.isLoading = false;
            await this.showErrorPopup(this.errorMessage);
        }
    }

    /** Jeu de données à exporter selon la vue active (référentiel ou dashboard). */
    get referencesToExport(): ServiceReference[] {
        return this.isDashboardVisible
            ? (this.dashboardPanel?.dashboardFilteredRefs ?? this.references)
            : this.filteredReferences;
    }

    async exportReferences(): Promise<void> {
        const rows = this.referencesToExport;
        if (!rows.length) {
            await this.showErrorPopup('No reference to export with the current filters.');
            return;
        }

        this.isExporting = true;
        this.errorMessage = null;

        try {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Référentiel Services');
            const exportHeaders = [...this.templateHeaders, 'Statut'];
            sheet.addRow(exportHeaders);

            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE8EEF7' }
            };

            for (const ref of rows) {
                sheet.addRow([
                    ref.pays,
                    ref.codeService,
                    ref.serviceLabel,
                    ref.codeReco,
                    ref.serviceType || '',
                    ref.operateur || '',
                    ref.reseau || '',
                    ref.reconciliable ? 'OUI' : 'NON',
                    ref.motif || '',
                    ref.retenuOperateur || '',
                    String(ref.status || 'ACTIF').toUpperCase()
                ]);
            }

            sheet.columns?.forEach((column) => {
                column.width = 20;
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
            link.href = url;
            link.download = `referentiel_services_export_${stamp}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);

            this.successMessage = `${rows.length} reference(s) exported.`;
            await this.showSuccessPopup(this.successMessage);
        } catch (error) {
            console.error('Error while exporting', error);
            this.errorMessage = 'Unable to export the repository.';
            await this.showErrorPopup(this.errorMessage);
        } finally {
            this.isExporting = false;
        }
    }

    downloadTemplate(): void {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Référentiel Services');
        sheet.addRow(this.templateHeaders);
        const examples = [
            ['BF', 'DEBIT', 'CI_TUV_CASHIN_ORANGE_HT', 'BF_TUV_CASHIN_ORANGE_HT', 'MOMO CASHIN', 'ORANGE', 'HT', 'OUI', '', ''],
            ['CI', 'CREDIT', 'CI_TSOP_CASHOUT_INTOUCH_HT', 'CI_TSOP_CASHOUT_INTOUCH_HT', 'MOMO CASHOUT', 'ORANGE', 'HT', 'OUI', '', ''],
            ['SN', 'CASHIN_OM', 'SN_MOMO_CASHIN_ORANGE_TOTAL', 'SN_MOMO_CASHIN_ORANGE_TOTAL', 'MOMO PM', 'ORANGE', 'TOTAL', 'NON', 'PAS DE GR', '']
        ];
        sheet.addRows(examples);

        sheet.columns?.forEach(column => {
            column.width = 20;
        });

        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'template_referentiel_services.xlsx';
            link.click();
            window.URL.revokeObjectURL(url);
        });
    }

    triggerFileUpload(): void {
        if (this.fileInput) {
            this.fileInput.nativeElement.click();
        }
    }

    async handleFileInput(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files && input.files[0];
        if (!file) {
            return;
        }

        this.isImporting = true;
        this.errorMessage = null;
        this.successMessage = null;
        this.errorDetails = [];

        try {
            const payloads = await this.parseFile(file);
            if (!payloads.length) {
                this.errorMessage = 'The file does not contain any valid row.';
                await this.showErrorPopup(this.errorMessage);
                return;
            }

            const { toImport, skippedDuplicates } = this.filterImportablePayloads(payloads);

            const batchItems = toImport.map((payload) => {
                const { rowNumber, ...data } = payload;
                return {
                    rowNumber: rowNumber ?? 0,
                    payload: this.normalizePayload(data)
                };
            });

            let successCount = 0;
            const failures: string[] = [];
            const IMPORT_CHUNK = 600;

            for (let offset = 0; offset < batchItems.length; offset += IMPORT_CHUNK) {
                const slice = batchItems.slice(offset, offset + IMPORT_CHUNK);
                try {
                    const result = await firstValueFrom(this.serviceReferenceService.importBatch(slice, true));
                    successCount += result.successCount;
                    if (result.errors?.length) {
                        failures.push(...result.errors);
                    }
                } catch (error) {
                    const message = this.extractErrorMessage(error) || 'Unknown error';
                    const from = offset + 1;
                    const to = Math.min(offset + IMPORT_CHUNK, batchItems.length);
                    failures.push(`Row batch ${from}–${to}: ${message}`);
                }
            }

            const detailLines = [...skippedDuplicates, ...failures];
            this.errorDetails = detailLines;

            const totalLignesFichier = payloads.length;
            if (successCount > 0) {
                const parts = [
                    `Summary: ${totalLignesFichier} valid row(s) in the file.`,
                    `${successCount} reference(s) saved.`
                ];
                if (skippedDuplicates.length) {
                    parts.push(
                        `${skippedDuplicates.length} ignored before sending (empty service code).`
                    );
                }
                parts.push('Same country + service code: updated if the reference already exists.');
                if (failures.length) {
                    parts.push(
                        `${failures.length} row(s) or batch(es) failed (see details: duplicate, validation, rights, etc.).`
                    );
                }
                this.successMessage = parts.join(' ');
                if (failures.length) {
                    this.errorMessage = `${failures.length} problem(s) — open the details below for each row.`;
                }
                await this.showSuccessPopup(this.successMessage);
                this.loadReferences();
            } else if (skippedDuplicates.length || failures.length) {
                this.errorMessage = skippedDuplicates.length && !failures.length
                    ? 'No reference imported: all rows have an empty service code.'
                    : `Import failed or partial: ${failures.length} error(s).`;
                await this.showErrorPopup(this.errorMessage);
            }
        } catch (error) {
            console.error('Error during import', error);
            this.errorMessage = this.extractErrorMessage(error) || 'Import failed. Check the file format.';
            await this.showErrorPopup(this.errorMessage);
        } finally {
            this.isImporting = false;
            if (this.fileInput) {
                this.fileInput.nativeElement.value = '';
            }
        }
    }

    private normalizeImportCodeService(codeService: string | null | undefined): string {
        return (codeService || '').trim().toUpperCase();
    }

    /**
     * Prépare l’import : seules les lignes sans code service sont exclues.
     * Les doublons (même pays + code service) sont gérés en upsert côté API.
     */
    private filterImportablePayloads(payloads: ImportPayload[]): {
        toImport: ImportPayload[];
        skippedDuplicates: string[];
    } {
        const toImport: ImportPayload[] = [];
        const skippedDuplicates: string[] = [];

        for (const payload of payloads) {
            const normalizedPayload = this.normalizePayload(payload);
            const csNorm = this.normalizeImportCodeService(normalizedPayload.codeService);

            if (!csNorm) {
                skippedDuplicates.push(
                    `Row ${payload.rowNumber ?? '?'}: Ignored — empty service code`
                );
                continue;
            }

            toImport.push(payload);
        }

        return { toImport, skippedDuplicates };
    }

    private findReferenceByPaysAndCodeService(
        pays: string,
        codeService: string
    ): ServiceReference | undefined {
        const paysNorm = (pays || '').trim().toUpperCase();
        const csNorm = this.normalizeImportCodeService(codeService);
        if (!paysNorm || !csNorm) {
            return undefined;
        }
        return this.references.find(
            (ref) =>
                (ref.pays || '').trim().toUpperCase() === paysNorm &&
                this.normalizeImportCodeService(ref.codeService) === csNorm
        );
    }

    private async parseFile(file: File): Promise<ImportPayload[]> {
        const name = file.name.toLowerCase();
        let workbook: XLSX.WorkBook;
        if (name.endsWith('.csv')) {
            const text = await file.text();
            workbook = XLSX.read(text, { type: 'string' });
        } else if (name.endsWith('.tsv')) {
            const text = await file.text();
            workbook = XLSX.read(text, { type: 'string', FS: '\t' });
        } else {
            const data = await file.arrayBuffer();
            workbook = XLSX.read(data, { type: 'array' });
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        return rows
            .map((row, index) => this.rowToPayload(row, index + 2))
            .filter((payload): payload is ImportPayload => !!payload);
    }

    /** Première colonne non vide parmi les clés possibles (en-têtes Excel/CSV variables). */
    private cell(row: Record<string, unknown>, ...keys: string[]): string {
        for (const key of keys) {
            const v = this.cleanString(row[key]);
            if (v) {
                return v;
            }
        }
        return '';
    }

    private rowToPayload(row: any, rowNumber: number): ImportPayload | null {
        const r = row as Record<string, unknown>;
        const pays = this.cell(r, 'Pays', 'PAYS', 'Country', 'COUNTRY', 'country', 'pays', 'PAY');
        const codeService = this.cell(
            r,
            'Code Service',
            'CODE SERVICE',
            'Code service',
            'SERVICE CODE',
            'code_service',
            'codeService',
            'CodeService'
        );
        let serviceLabel = this.cell(r, 'Service', 'SERVICE', 'service', 'Libellé service', 'Service Label', 'SERVICE_LABEL');
        let codeReco = this.cell(
            r,
            'Code RECO',
            'CODE RECO',
            'code reco',
            'CodeReco',
            'CODE_RECO',
            'code_reco'
        );

        if (!pays || !codeService) {
            return null;
        }

        if (!serviceLabel) {
            serviceLabel = codeService;
        }
        if (!codeReco) {
            codeReco = codeService;
        }

        const reconciliableRaw = this.cell(r, 'Réconciliable', 'RECONCILIABLE', 'Reconciliable', 'reconciliable').toLowerCase();
        let reconciliable = reconciliableRaw === 'oui' || reconciliableRaw === 'true' || reconciliableRaw === '1';
        if (!reconciliableRaw) {
            reconciliable = true;
        }

        return {
            pays: pays.toUpperCase(),
            codeService: codeService.toUpperCase(),
            serviceLabel,
            codeReco: codeReco.toUpperCase(),
            serviceType: this.cell(r, 'Service Type', 'TYPE', 'service type', 'ServiceType'),
            operateur: this.cell(r, 'Opérateur', 'OPERATEUR', 'Operateur', 'operateur'),
            reseau: this.cell(r, 'Réseau', 'RESEAU', 'Reseau', 'reseau'),
            reconciliable,
            motif: this.cell(r, 'Motif', 'MOTIF', 'motif'),
            retenuOperateur: this.cell(r, 'Retenu Opérateur', 'RETENU OPERATEUR', 'Retenu operateur'),
            rowNumber
        };
    }

    cancelEdit(): void {
        this.showForm = false;
        this.editingReference = null;
        this.startCreate();
    }

    goBackToStats(): void {
        this.router.navigate(['/stats']);
    }

    getRangeLabel(): string {
        if (!this.filteredReferences.length) {
            return 'No row';
        }
        const start = (this.pageIndex - 1) * this.pageSize + 1;
        const end = Math.min(this.filteredReferences.length, start + this.pageSize - 1);
        return `Showing ${start}-${end} / ${this.filteredReferences.length} row(s)`;
    }

    private cleanString(value: any): string {
        return value !== undefined && value !== null ? value.toString().trim() : '';
    }

    private normalizePayload(payload: ServiceReferencePayload): ServiceReferencePayload {
        const sanitize = (val?: string | null, upper = false) => {
            if (val === null || val === undefined) {
                return val as undefined;
            }
            const trimmed = val.toString().trim();
            return upper ? trimmed.toUpperCase() : trimmed;
        };

        return {
            pays: sanitize(payload.pays, true) || '',
            codeService: sanitize(payload.codeService, true) || '',
            serviceLabel: sanitize(payload.serviceLabel) || '',
            codeReco: sanitize(payload.codeReco, true) || '',
            serviceType: sanitize(payload.serviceType || undefined) || undefined,
            operateur: sanitize(payload.operateur || undefined) || undefined,
            reseau: sanitize(payload.reseau || undefined) || undefined,
            reconciliable: payload.reconciliable ?? true,
            motif: sanitize(payload.motif || undefined) || undefined,
            retenuOperateur: sanitize(payload.retenuOperateur || undefined) || undefined
        };
    }

    private extractErrorMessage(error: any): string {
        if (!error) {
            return 'Unknown error';
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error.status === 429) {
            return 'Too many requests (server limit). Wait one minute or retry; batch import limits this case.';
        }
        if (error.status === 403) {
            const m = error.error?.message;
            return typeof m === 'string' && m.length ? m : 'Access denied for this country or this action.';
        }
        if (error.error) {
            if (typeof error.error === 'string') {
                return error.error;
            }
            if (error.error.message) {
                let msg = String(error.error.message);
                const fe = error.error.fieldErrors;
                if (fe && typeof fe === 'object') {
                    const parts = Object.entries(fe).map(([k, v]) => `${k}: ${v}`);
                    if (parts.length) {
                        msg += ' — ' + parts.join(' ; ');
                    }
                }
                return msg;
            }
        }
        if (error.message) {
            return error.message;
        }
        return 'Unknown error';
    }

    private async showSuccessPopup(message: string) {
        const config: PopupConfig = {
            title: 'Success',
            message,
            type: 'success',
            showCancelButton: false,
            confirmText: 'OK'
        };
        await ModernPopupComponent.showPopup(config);
    }

    private async showErrorPopup(message: string) {
        const config: PopupConfig = {
            title: 'Error',
            message,
            type: 'error',
            showCancelButton: false,
            confirmText: 'OK'
        };
        await ModernPopupComponent.showPopup(config);
    }

    formatNumber(value: number, fractionDigits: number = 0): string {
        if (value === null || value === undefined || isNaN(value)) {
            return '0';
        }
        return new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        }).format(value);
    }

    get hasSelection(): boolean {
        return this.selectedReferences.size > 0;
    }

    get selectedCount(): number {
        return this.selectedReferences.size;
    }

    isSelected(ref: ServiceReference): boolean {
        return !!ref.id && this.selectedReferences.has(ref.id);
    }

    toggleSelection(ref: ServiceReference, event: Event): void {
        if (!ref.id) {
            return;
        }
        const checked = (event.target as HTMLInputElement).checked;
        if (checked) {
            this.selectedReferences.add(ref.id);
        } else {
            this.selectedReferences.delete(ref.id);
        }
        this.updateAllSelectedState();
    }

    toggleSelectAll(event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        if (checked) {
            this.filteredReferences.forEach(ref => {
                if (ref.id) {
                    this.selectedReferences.add(ref.id);
                }
            });
        } else {
            this.selectedReferences.clear();
        }
        this.allSelected = checked;
    }

    clearSelection(): void {
        this.selectedReferences.clear();
        this.allSelected = false;
    }

    private updateAllSelectedState(): void {
        if (!this.filteredReferences.length) {
            this.allSelected = false;
            return;
        }
        this.allSelected = this.filteredReferences.every(ref => !ref.id || this.selectedReferences.has(ref.id));
    }

    private syncSelectionWithData(): void {
        const validIds = new Set(this.references.filter(ref => ref.id).map(ref => ref.id!));
        this.selectedReferences.forEach(id => {
            if (!validIds.has(id)) {
                this.selectedReferences.delete(id);
            }
        });
    }

    /**
     * Normalise le code pays (CITCH -> CI, "EG EG" -> "EG")
     */
    private normalizeCountryCode(countryCode: string): string {
        if (!countryCode) return '';
        let normalized = (countryCode || '').toUpperCase().trim();
        
        // Si le code contient des espaces, prendre le premier mot
        if (normalized.includes(' ')) {
            normalized = normalized.split(' ')[0];
        }
        
        // CITCH = CI
        if (normalized === 'CITCH' || normalized.startsWith('CITCH')) {
            return 'CI';
        }
        return normalized;
    }

    /**
     * Retourne le drapeau (emoji) d'un pays à partir de son code
     */
    getCountryFlag(countryCode: string): string {
        const normalizedCode = this.normalizeCountryCode(countryCode);
        const flagMap: { [key: string]: string } = {
            'BF': '🇧🇫', 'BJ': '🇧🇯', 'CI': '🇨🇮', 'CM': '🇨🇲', 'GA': '🇬🇦', 'GN': '🇬🇳', 'KE': '🇰🇪', 'ML': '🇲🇱', 'MZ': '🇲🇿', 'NG': '🇳🇬', 'SN': '🇸🇳', 'TG': '🇹🇬',
            'CF': '🇨🇫', 'TD': '🇹🇩', 'CG': '🇨🇬', 'CD': '🇨🇩', 'GQ': '🇬🇶', 'ST': '🇸🇹', 'AO': '🇦🇴',
            'NE': '🇳🇪', 'GW': '🇬🇼', 'SL': '🇸🇱', 'LR': '🇱🇷', 'GH': '🇬🇭', 'MR': '🇲🇷', 'GM': '🇬🇲', 'CV': '🇨🇻',
            'TZ': '🇹🇿', 'UG': '🇺🇬', 'RW': '🇷🇼', 'BI': '🇧🇮', 'ET': '🇪🇹', 'SO': '🇸🇴', 'DJ': '🇩🇯', 'ER': '🇪🇷', 'SS': '🇸🇸', 'SD': '🇸🇩', 'SC': '🇸🇨', 'MU': '🇲🇺', 'KM': '🇰🇲', 'MG': '🇲🇬',
            'EG': '🇪🇬', 'ZA': '🇿🇦'
        };
        return flagMap[normalizedCode] || '🌍';
    }
}

