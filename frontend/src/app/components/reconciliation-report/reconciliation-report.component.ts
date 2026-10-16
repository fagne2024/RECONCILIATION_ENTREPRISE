import { Component, OnInit, Input, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { filter, distinctUntilChanged, skip } from 'rxjs/operators';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import { MatSelect } from '@angular/material/select';
import { ReconciliationResponse, Match } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationSummaryService, AgencySummaryData } from '../../services/reconciliation-summary.service';
import { ExportOptimizationService } from '../../services/export-optimization.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import { PopupService } from '../../services/popup.service';
import { PaysService } from '../../services/pays.service';
import { EcartBoSummaryService, EcartBoSummary } from '../../services/ecart-bo-summary.service';
import { NiveauxValidationConfigService, NiveauTraitementConfig } from '../../services/niveaux-validation-config.service';
import { ProfilService } from '../../services/profil.service';
import { Profil } from '../../models/profil.model';
import {
  RECONCILIATION_ENV_OPTIONS,
  normalizeReconciliationReportEnv
} from '../../constants/reconciliation-env-options';
import { LoggerService } from '../../services/logger.service';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { countriesMatch, countryNameFromCode } from '../../utils/country-codes.util';
import {
    auditSnapshotStatutClass as statutAuditPillClassFn,
    auditSnapshotTraitementClass as traitementAuditPillClassFn,
    resolveTraitementKind as sharedResolveTraitementKind,
    traitementDisplayLabel as sharedTraitementDisplayLabel
} from '../../shared/result8rec-audit-display';
import {
    partitionEcartRecords,
    resolveMagicPartitionContext,
    filterMatchBoDataByMagicPartition,
    filterMatchBoDataByMagicPartitionMulti,
    filterRecordsByMagicPartitionMulti,
    getMagicPartitionServiceTag,
    getMagicPartitionPartnerFileTag,
    servicesMatchPartition,
    MagicPartitionContext
} from '../../utils/magic-partition.util';
import {
    normalizeServiceToken,
    partnerServiceMatchesBo,
    extractServiceTokens,
    MIN_SERVICE_TOKEN_LENGTH
} from '../../utils/service-match.util';
import { MagicServiceSummary } from '../../services/magic-reconciliation.service';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { SharedModule } from '../../shared/shared.module';
import { DsPaginationComponent } from '../../shared/ui';

import { TranslateService } from '@ngx-translate/core';

/** Ligne renvoyée par GET /api/result8rec/{id}/audit-history */
export interface Result8RecAuditEntry {
    id: number;
    actionType: string;
    username?: string;
    traitementSnapshot?: string;
    statusSnapshot?: string;
    detail?: string;
    createdAt?: string;
}

export interface ReconciliationReportData {
    id?: number;
    date: string;
    agency: string;
    service: string;
    country: string;
    env?: string;
    glpiId?: string;
    totalTransactions: number;
    totalVolume: number;
    matches: number;
    boOnly: number;
    partnerOnly: number;
    mismatches: number;
    matchRate: number;
    status: string;
    comment: string;
    traitement?: string;
    username?: string;
}

@Component({
    selector: 'app-reconciliation-report',
    standalone: true,
    imports: [SharedModule, DsPaginationComponent],
    template: `
        <div class="reconciliation-report-page">
            <!-- TOP NAV (aligné sur redevance-loterie) -->
            <nav class="topnav">
                <div class="nav-brand">
                    <div class="nav-brand-dot"></div>
                    ReconciliApp
                </div>
                <div class="nav-sep"></div>
                <div class="nav-path">
                    <strong>{{ 'RPT.pathTitle' | translate }}</strong>
                </div>
                <div class="nav-spacer"></div>
                <div class="nav-actions">
                    <button
                        type="button"
                        class="nav-btn secondary"
                        (click)="refreshReportData()"
                        [disabled]="isLoadingDbReport"
                        [title]="'RPT.refreshKeepFilters' | translate"
                    >
                        <i class="fas" [ngClass]="isLoadingDbReport ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i> {{ 'RPT.refresh' | translate }}
                    </button>
                    <button type="button" class="nav-btn secondary" (click)="goBack()">
                        <i class="fas fa-arrow-left"></i> {{ 'RPT.back' | translate }}
                    </button>
                    <button type="button" class="nav-btn primary" routerLink="/rapport-reconciliation-bo-partenaire">
                        <i class="fas fa-file-alt"></i> {{ 'RPT.comparisonBoPart' | translate }}
                    </button>
                    <button type="button" class="nav-btn secondary" (click)="exportToExcel()" [disabled]="!reportData.length">
                        <i class="fas fa-file-excel"></i> {{ 'COMMON.actions.export' | translate }}
                    </button>
                    <button type="button" class="nav-btn secondary" (click)="saveAll()" [disabled]="!hasSelectedRows()">
                        <i class="fas fa-save"></i> {{ 'RPT.save' | translate }}
                    </button>
                    <button type="button" class="nav-btn primary" *ngIf="showExtendedReportActions" (click)="goToReconciliationDashboard()" [disabled]="!filteredReportData.length && !reportData.length">
                        <i class="fas fa-chart-line"></i> {{ 'RPT.dashboard' | translate }}
                    </button>
                    <button type="button" class="nav-btn secondary" (click)="showExtendedReportActions = !showExtendedReportActions" [title]="(showExtendedReportActions ? 'RPT.hideExtraActions' : 'RPT.showExtraActions') | translate">
                        <i class="fas" [ngClass]="showExtendedReportActions ? 'fa-eye-slash' : 'fa-ellipsis-h'"></i> {{ (showExtendedReportActions ? 'RPT.hideActions' : 'RPT.moreActions') | translate }}
                    </button>
                </div>
            </nav>

            <!-- PAGE HEADER (titre + KPIs) -->
            <div class="page-header-report">
                <div class="ph-report-left">
                    <div class="ph-eyebrow"><span></span>{{ 'RPT.eyebrow' | translate }}</div>
                    <h1 class="ph-title-report">{{ 'RPT.titlePrefix' | translate }} <em>{{ 'RPT.titleEm' | translate }}</em></h1>
                </div>
                <div class="ph-report-right">
                    <div class="hero-kpi-strip">
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RPT.lines' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ kpiSummary.lineCount | number:'1.0-0' }}</span>
                        </div>
                        <div class="hk-strip-sep"></div>
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RPT.agencies' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ kpiSummary.agencies | number:'1.0-0' }}</span>
                        </div>
                        <div class="hk-strip-sep"></div>
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RPT.avgRate' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ kpiSummary.averageMatchRate }}%</span>
                        </div>
                        <div class="hk-strip-sep"></div>
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RPT.trxCount' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ kpiSummary.totalTransactions | number:'1.0-0' }}</span>
                        </div>
                        <div class="hk-strip-sep"></div>
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RPT.volume' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ kpiSummary.totalVolume | number:'1.0-0' }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="main">
                <div class="reconciliation-report-container">
                    <div class="report-header">
                <h2>📊 {{ 'RPT.reportTitle' | translate }} <span class="badge ds-badge" [ngClass]="currentSource === 'live' ? 'badge-live' : 'badge-db'">{{ (currentSource === 'live' ? 'RPT.inProgress' : 'RPT.savedDb') | translate }}</span></h2>
                <p class="magic-report-scope" *ngIf="magicReportServices?.length > 1">
                    {{ 'RPT.selectedReconciliations' | translate: { count: magicReportServices.length } }}
                    <strong class="magic-report-scope-list">{{ magicReportServices.join(' • ') }}</strong>
                </p>
                <p class="magic-report-scope" *ngIf="magicReportServices?.length === 1">
                    {{ 'RPT.magicSelection' | translate }}
                    <strong *ngIf="magicReportPartnerFile">{{ magicReportPartnerFile }}</strong>
                    <span *ngIf="magicReportPartnerFile"> / </span>
                    <strong>{{ magicReportService }}</strong>
                </p>
                <div class="report-actions">
                    <button type="button" class="btn btn-toggle-source ds-btn ds-btn--secondary ds-btn--sm" (click)="toggleDataSource()" [title]="(currentSource === 'live' ? 'RPT.switchToDb' : 'RPT.switchToLive') | translate">
                        🔄 {{ (currentSource === 'live' ? 'RPT.viewDbData' : 'RPT.liveData') | translate }}
                    </button>
                    <button type="button" class="btn btn-voir-plus ds-btn ds-btn--secondary ds-btn--sm" (click)="toggleShowAllMonths()" *ngIf="!hasSelectedRows() && currentSource !== 'live'" [title]="(showAllMonths ? 'RPT.showCurrentMonth' : 'RPT.showAllData') | translate">
                        {{ (showAllMonths ? '📅' : '📋') }} {{ (showAllMonths ? 'RPT.currentMonth' : 'RPT.seeMore') | translate }}
                    </button>
                    <span class="report-display-mode" *ngIf="!hasSelectedRows() && currentSource !== 'live'">
                        {{ 'RPT.lineCount' | translate: { mode: (showAllMonths ? 'RPT.all' : 'RPT.currentMonth') | translate, count: kpiSummary.lineCount } }}
                    </span>
                    <span class="report-loading-more" *ngIf="isLoadingMoreDbReport || isLoadingLiveDetails">
                        ⏳ {{ (isLoadingLiveDetails ? 'RPT.loadingLiveDetails' : 'RPT.loadingPreviousDates') | translate }}
                    </span>
                    <span class="report-load-error" *ngIf="dbLoadError">{{ dbLoadError }}</span>
                    <button type="button" class="btn btn-add ds-btn ds-btn--primary ds-btn--sm" *ngIf="showExtendedReportActions" (click)="addNewRow()" [title]="'RPT.addNewRow' | translate">
                        ➕ {{ 'RPT.newRow' | translate }}
                    </button>
                    <button type="button" class="btn btn-export ds-btn ds-btn--secondary ds-btn--sm" (click)="exportToExcel()" [disabled]="!reportData.length">
                        📥 {{ 'COMMON.actions.export' | translate }}
                    </button>
                    <button type="button" class="btn btn-save-all ds-btn ds-btn--primary ds-btn--sm" (click)="saveAll()" [disabled]="!hasSelectedRows()">
                        💾 {{ 'RPT.save' | translate }}
                    </button>
                    <button type="button" class="btn btn-dashboard ds-btn ds-btn--primary ds-btn--sm" *ngIf="showExtendedReportActions" (click)="goToReconciliationDashboard()" [disabled]="!filteredReportData.length && !reportData.length">
                        📈 {{ 'RPT.dashboard' | translate }}
                    </button>
                    <button type="button" class="btn btn-toggle-actions ds-btn ds-btn--secondary ds-btn--sm" (click)="toggleActionsColumn()" [title]="(showActionsColumn ? 'RPT.hideActionsCol' : 'RPT.showActionsCol') | translate">
                        {{ showActionsColumn ? '👁️' : '👁️‍🗨️' }} {{ (showActionsColumn ? 'RPT.hideActionsBtn' : 'RPT.showActionsBtn') | translate }}
                    </button>
                    <button type="button" class="btn btn-close ds-btn ds-btn--secondary ds-btn--sm" (click)="goBack()">
                        ❌ {{ 'RPT.close' | translate }}
                    </button>
                </div>
            </div>

            <div class="report-filters ds-filter-bar">
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <mat-form-field appearance="fill" class="filter-mat-select">
                        <mat-label>{{ 'RPT.agency' | translate }}</mat-label>
                        <mat-select #agenceSelect [(ngModel)]="selectedAgencies" multiple (ngModelChange)="onAgencyNgModelChange($event)">
                            <mat-option>
                                <ngx-mat-select-search [formControl]="agenceSearchCtrl" [placeholderLabel]="'RPT.searchAgency' | translate" [noEntriesFoundLabel]="'RPT.noAgency' | translate"></ngx-mat-select-search>
                            </mat-option>
                            <mat-option *ngFor="let agency of filteredAgenciesDropdown" [value]="agency">
                                {{ agency }}
                            </mat-option>
                        </mat-select>
                    </mat-form-field>
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <mat-form-field appearance="fill" class="filter-mat-select">
                        <mat-label>{{ 'RPT.country' | translate }}</mat-label>
                        <mat-select #paysSelect [(ngModel)]="selectedCountries" multiple (ngModelChange)="onCountryNgModelChange($event)">
                            <mat-option>
                                <ngx-mat-select-search [formControl]="paysSearchCtrl" [placeholderLabel]="'RPT.searchCountry' | translate" [noEntriesFoundLabel]="'RPT.noCountry' | translate"></ngx-mat-select-search>
                            </mat-option>
                            <mat-option *ngFor="let country of filteredCountriesDropdown" [value]="country">
                                {{ country }}
                            </mat-option>
                        </mat-select>
                    </mat-form-field>
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <mat-form-field appearance="fill" class="filter-mat-select">
                        <mat-label>{{ 'RPT.env' | translate }}</mat-label>
                        <mat-select #envSelect [(ngModel)]="selectedEnvs" multiple (ngModelChange)="onEnvNgModelChange($event)">
                            <mat-option *ngFor="let env of uniqueEnvs" [value]="env">
                                {{ formatEnvFilterLabel(env) }}
                            </mat-option>
                        </mat-select>
                    </mat-form-field>
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <mat-form-field appearance="fill" class="filter-mat-select">
                        <mat-label>{{ 'RPT.service' | translate }}</mat-label>
                        <mat-select #serviceSelect [(ngModel)]="selectedServices" multiple (ngModelChange)="onServiceNgModelChange($event)">
                            <mat-option>
                                <ngx-mat-select-search [formControl]="serviceSearchCtrl" [clearSearchInput]="false" [placeholderLabel]="'RPT.searchService' | translate" [noEntriesFoundLabel]="'RPT.noService' | translate"></ngx-mat-select-search>
                            </mat-option>
                            <mat-option *ngFor="let service of filteredServicesDropdown" [value]="service">
                                {{ service }}
                            </mat-option>
                        </mat-select>
                    </mat-form-field>
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <label>{{ 'RPT.startDate' | translate }}</label>
                    <input 
                        type="date" 
                        [(ngModel)]="selectedDateDebut" 
                        (change)="filterReport()"
                        class="filter-date ds-input"
                        [placeholder]="'RPT.startDate' | translate">
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <label>{{ 'RPT.endDate' | translate }}</label>
                    <div class="filter-inline">
                        <input 
                            type="date" 
                            [(ngModel)]="selectedDateFin" 
                            (change)="filterReport()"
                            class="filter-date ds-input"
                            [placeholder]="'RPT.endDate' | translate">
                        <button 
                            type="button" 
                            (click)="clearDateFilters()" 
                            class="btn-clear-dates ds-btn ds-btn--secondary ds-btn--sm"
                            [title]="'RPT.clearDateFilters' | translate">
                            🗑️ Effacer dates
                        </button>
                    </div>
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <mat-form-field appearance="fill" class="filter-mat-select">
                        <mat-label>{{ 'RPT.status' | translate }}</mat-label>
                        <mat-select #statusSelect [(ngModel)]="selectedStatuses" multiple (ngModelChange)="onStatusNgModelChange($event)">
                            <mat-select-trigger>
                                {{ formatSelectedStatusesLabel() }}
                            </mat-select-trigger>
                            <mat-option *ngFor="let status of uniqueStatuses" [value]="status">
                                {{ getDisplayStatus(status) }}
                            </mat-option>
                        </mat-select>
                    </mat-form-field>
                </div>
                <div class="filter-group" *ngIf="!hasSelectedRows()">
                    <mat-form-field appearance="fill" class="filter-mat-select">
                        <mat-label>{{ 'RPT.processing' | translate }}</mat-label>
                        <mat-select #traitementSelect [(ngModel)]="selectedTraitements" multiple (ngModelChange)="onTraitementNgModelChange($event)">
                            <mat-option *ngFor="let traitement of filteredTraitementOptions" [value]="traitement">
                                {{ getTraitementDisplayLabel(traitement) }}
                            </mat-option>
                        </mat-select>
                    </mat-form-field>
                </div>
                <div class="filter-group bulk-status-group" *ngIf="hasSelectedRows()">
                    <label>{{ 'RPT.changeStatusSelected' | translate }}</label>
                    <div class="bulk-status-controls">
                        <select 
                            [(ngModel)]="bulkStatusSelection" 
                            class="filter-select bulk-status-select ds-select">
                            <option value="">{{ 'RPT.selectStatus' | translate }}</option>
                            <option *ngFor="let status of statusOptions" [value]="status">{{ getDisplayStatus(status) }}</option>
                        </select>
                        <button type="button" 
                            class="btn btn-bulk-status ds-btn ds-btn--primary ds-btn--sm" 
                            (click)="applyBulkStatusChange()" 
                            [disabled]="!bulkStatusSelection">
                            ✅ Appliquer
                        </button>
                        <button type="button" 
                            class="btn btn-clear-selection ds-btn ds-btn--secondary ds-btn--sm" 
                            (click)="clearSelection()">
                            🗑️ {{ 'RPT.deselect' | translate }}
                        </button>
                        <span class="selection-count">
                            {{ 'RPT.rowsSelected' | translate: { count: getSelectedRowsCount() } }}
                        </span>
                    </div>
                </div>
                <div class="filter-group bulk-status-group" *ngIf="hasSelectedRows()">
                    <label>{{ 'RPT.changeProcessingSelected' | translate }}</label>
                    <div class="bulk-status-controls">
                        <select 
                            [(ngModel)]="bulkTraitementSelection" 
                            class="filter-select bulk-status-select ds-select">
                            <option value="">{{ 'RPT.selectProcessing' | translate }}</option>
                            <option value="__CLEAR__">- (Effacer)</option>
                            <option *ngFor="let traitement of traitementOptions" [value]="traitement">{{ getTraitementDisplayLabel(traitement) }}</option>
                        </select>
                        <button type="button" 
                            class="btn btn-bulk-status ds-btn ds-btn--primary ds-btn--sm" 
                            (click)="applyBulkTraitementChange()" 
                            [disabled]="!bulkTraitementSelection">
                            ✅ Appliquer
                        </button>
                        <button type="button" 
                            class="btn btn-clear-selection ds-btn ds-btn--secondary ds-btn--sm" 
                            (click)="clearSelection()">
                            🗑️ {{ 'RPT.deselect' | translate }}
                        </button>
                        <span class="selection-count">
                            {{ 'RPT.rowsSelected' | translate: { count: getSelectedRowsCount() } }}
                        </span>
                    </div>
                </div>
                <div class="filter-group bulk-status-group bulk-delete-group" *ngIf="hasSelectedRows()">
                    <label>{{ 'RPT.deleteSelected' | translate }}</label>
                    <div class="bulk-status-controls">
                        <button
                            type="button"
                            class="btn btn-bulk-delete ds-btn ds-btn--danger ds-btn--sm"
                            (click)="applyBulkDelete()"
                            [disabled]="getBulkDeletableCount() === 0"
                            [title]="'RPT.deleteHint' | translate">
                            🗑️ {{ 'RPT.deleteSelection' | translate: { count: getBulkDeletableCount() } }}
                        </button>
                        <span class="selection-hint" *ngIf="getSelectedRowsCount() > getBulkDeletableCount()">
                            {{ 'RPT.rowsIgnored' | translate: { count: getSelectedRowsCount() - getBulkDeletableCount() } }}
                        </span>
                    </div>
                </div>
                <div class="filter-group">
                    <label>{{ 'RPT.ticketId' | translate }}</label>
                    <div class="filter-inline">
                        <input 
                            type="text" 
                            [(ngModel)]="ticketIdFilter" 
                            (ngModelChange)="onTicketIdFilterChange($event)"
                            class="filter-date ds-input"
                            [placeholder]="'RPT.searchTicketId' | translate">
                        <button 
                            type="button" 
                            (click)="clearTicketIdFilter()" 
                            class="btn-clear-dates ds-btn ds-btn--secondary ds-btn--sm"
                            [title]="'RPT.clearTicketFilter' | translate">
                            🗑️ Effacer
                        </button>
                    </div>
                </div>
            </div>


            <div class="report-summary">
                <div class="summary-cards">
                    <div class="summary-card">
                        <div class="card-icon">🏢</div>
                        <div class="card-content">
                            <div class="card-title">{{ 'RPT.agencies' | translate }}</div>
                            <div class="card-value ds-num">{{ kpiSummary.agencies }}</div>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="card-icon">⚙️</div>
                        <div class="card-content">
                            <div class="card-title">{{ 'RPT.services' | translate }}</div>
                            <div class="card-value ds-num">{{ kpiSummary.services }}</div>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="card-icon">📊</div>
                        <div class="card-content">
                            <div class="card-title">{{ 'RPT.avgRateCard' | translate }}</div>
                            <div class="card-value ds-num">{{ kpiSummary.averageMatchRate }}%</div>
                        </div>
                    </div>
                    <div class="summary-card clickable-card" 
                         [class.active]="activeCardFilter === 'inProgress'"
                         (click)="filterByInProgress()"
                         [title]="'RPT.filterInProgress' | translate">
                        <div class="card-icon">⏳</div>
                        <div class="card-content">
                            <div class="card-title">{{ 'RPT.gapsInProgress' | translate }}</div>
                            <div class="card-value ds-num">{{ kpiSummary.inProgressDiscrepancies | number }}</div>
                        </div>
                    </div>
                    <div class="summary-card clickable-card" 
                         [class.active]="activeCardFilter === 'treated'"
                         (click)="filterByTreated()"
                         [title]="'RPT.clickToFilter' | translate">
                        <div class="card-icon">📊</div>
                        <div class="card-content">
                            <div class="card-title">{{ 'RPT.transactions' | translate }}</div>
                            <div class="card-value ds-num">{{ kpiSummary.totalTransactions | number }}</div>
                        </div>
                    </div>
                    <div class="summary-card clickable-card" 
                         [class.active]="activeCardFilter === 'ticketsToCreate'"
                         (click)="filterByTicketsToCreate()"
                         title="{{ 'RPT.clickToFilter' | translate }}">
                        <div class="card-icon">💰</div>
                        <div class="card-content">
                            <div class="card-title">{{ 'RPT.volume' | translate }}</div>
                            <div class="card-value ds-num">{{ kpiSummary.totalVolume | number }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="report-table-container ds-table-scroll">
                <table class="report-table ds-table">
                    <thead>
                        <tr>
                            <th class="col-expand" title="Historique (sauvegarde, statut, validation)"></th>
                            <th class="col-checkbox">
                                <input 
                                    type="checkbox"
                                    class="ds-checkbox"
                                    [checked]="isAllSelected()" 
                                    [indeterminate]="isSomeSelected()"
                                    (change)="toggleSelectAll($event)"
                                    [title]="'RPT.selectAllFiltered' | translate">
                            </th>
                            <th class="col-date">{{ 'RPT.dateCol' | translate }}</th>
                            <th class="col-text">{{ 'RPT.agency' | translate }}</th>
                            <th class="col-service">{{ 'RPT.service' | translate }}</th>
                            <th class="col-pays">{{ 'RPT.country' | translate }}</th>
                            <th class="col-env">{{ 'RPT.env' | translate }}</th>
                            <th class="col-transactions">{{ 'RPT.transactions' | translate }}</th>
                            <th class="col-number">{{ 'RPT.volume' | translate }}</th>
                            <th class="col-number">{{ 'RPT.matches' | translate }}</th>
                            <th
                                class="col-number th-filter-ecart"
                                [class.th-filter-ecart-active]="activeEcartColumnFilter === 'boOnly'"
                                (click)="toggleFilterByBoEcart()"
                                [title]="'RPT.filterBoGaps' | translate">
                                {{ 'RPT.boGaps' | translate }}
                            </th>
                            <th
                                class="col-number th-filter-ecart"
                                [class.th-filter-ecart-active]="activeEcartColumnFilter === 'partnerOnly'"
                                (click)="toggleFilterByPartnerEcart()"
                                [title]="'RPT.filterPartnerGaps' | translate">
                                {{ 'RPT.partnerGaps' | translate }}
                            </th>
                            <th class="col-number">{{ 'RPT.mismatches' | translate }}</th>
                            <th class="col-number">{{ 'RPT.matchRate' | translate }}</th>
                            <th class="col-text">{{ 'RPT.ticketId' | translate }}</th>
                            <th class="col-select">{{ 'RPT.status' | translate }}</th>
                            <th class="col-select">{{ 'RPT.comment' | translate }}</th>
                            <th class="col-select">{{ 'RPT.processing' | translate }}</th>
                            <th class="col-text">{{ 'RPT.user' | translate }}</th>
                            <th *ngIf="showActionsColumn" class="col-actions">{{ 'RPT.actions' | translate }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <ng-container *ngFor="let item of paginatedData; trackBy: trackByItem">
                        <tr *ngIf="isServiceGroupHeader(item)" class="service-group-header">
                            <td [attr.colspan]="auditHistoryColspan()" class="service-group-header-cell">
                                <span class="service-group-header-dot"></span>
                                <span class="service-group-header-label" [title]="item.service">{{ item.service }}</span>
                                <span class="service-group-header-count">{{ serviceGroupRowCount(item.service) }} agence(s)</span>
                            </td>
                        </tr>
                        <tr *ngIf="!isServiceGroupHeader(item)" [class.editing-row]="editingRow === item" [class.row-selected]="isRowSelected(item)" [ngClass]="getTraitementRowClass(item)" [class.row-audit-open]="isAuditExpanded(item)">
                            <td class="expand-cell">
                                <button type="button"
                                        *ngIf="item.id"
                                        class="btn-row-expand"
                                        [class.open]="isAuditExpanded(item)"
                                        [attr.aria-expanded]="isAuditExpanded(item)"
                                        (click)="toggleAuditRow(item, $event)"
                                        [title]="'RPT.viewAudit' | translate">
                                    {{ isAuditExpanded(item) ? '▼' : '▶' }}
                                </button>
                                <span *ngIf="!item.id" class="expand-placeholder" [title]="'RPT.saveToSeeHistory' | translate"></span>
                            </td>
                            <td class="checkbox-cell">
                                <input 
                                    type="checkbox"
                                    class="ds-checkbox"
                                    [checked]="isRowSelected(item)"
                                    (change)="toggleRowSelection(item, $event)"
                                    [title]="'RPT.selectRow' | translate">
                            </td>
                            <td class="text-cell">
                                <ng-container *ngIf="editingRow !== item; else editDate">
                                    {{formatDate(item.date)}}
                                </ng-container>
                                <ng-template #editDate>
                                    <input [(ngModel)]="item.date" type="date" class="edit-input"/>
                                </ng-template>
                            </td>
                            <td class="text-cell">
                                <ng-container *ngIf="editingRow !== item; else editAgency">
                                    {{item.agency}}
                                </ng-container>
                                <ng-template #editAgency>
                                    <input [(ngModel)]="item.agency" class="edit-input" [placeholder]="'RPT.agency' | translate"/>
                                </ng-template>
                            </td>
                            <td class="text-cell col-service">
                                <ng-container *ngIf="editingRow !== item; else editService">
                                    <span class="service-text" [title]="item.service">{{item.service}}</span>
                                </ng-container>
                                <ng-template #editService>
                                    <input [(ngModel)]="item.service" class="edit-input" [placeholder]="'RPT.service' | translate"/>
                                </ng-template>
                            </td>
                            <td class="text-cell col-pays">
                                <ng-container *ngIf="editingRow !== item; else editCountry">
                                    <span class="country-text" [title]="item.country">{{item.country}}</span>
                                </ng-container>
                                <ng-template #editCountry>
                                    <input [(ngModel)]="item.country" class="edit-input" [placeholder]="'RPT.country' | translate"/>
                                </ng-template>
                            </td>
                            <td class="text-cell col-env">
                                <ng-container *ngIf="editingRow !== item; else editEnv">
                                    <span class="env-text" [title]="formatEnvFilterLabel(item.env)">
                                        {{ formatEnvFilterLabel(item.env) }}
                                    </span>
                                </ng-container>
                                <ng-template #editEnv>
                                    <select [(ngModel)]="item.env" class="edit-select">
                                        <option *ngFor="let env of envOptions" [ngValue]="env">
                                            {{ formatEnvFilterLabel(env) }}
                                        </option>
                                    </select>
                                </ng-template>
                            </td>
                            <td class="col-transactions">
                                <ng-container *ngIf="editingRow !== item; else editTransactions">
                                    {{item.totalTransactions | number}}
                                </ng-container>
                                <ng-template #editTransactions>
                                    <input [(ngModel)]="item.totalTransactions" type="number" class="edit-input"/>
                                </ng-template>
                            </td>
                            <td class="number-cell">
                                <ng-container *ngIf="editingRow !== item; else editVolume">
                                    {{item.totalVolume | number}}
                                </ng-container>
                                <ng-template #editVolume>
                                    <input [(ngModel)]="item.totalVolume" type="number" class="edit-input"/>
                                </ng-template>
                            </td>
                            <td class="match-cell">
                                <ng-container *ngIf="editingRow !== item; else editMatches">
                                    {{getDisplayMatches(item) | number}}
                                </ng-container>
                                <ng-template #editMatches>
                                    <input 
                                        [(ngModel)]="item.matches" 
                                        type="number" 
                                        min="0" 
                                        class="edit-input" 
                                        inputmode="decimal" 
                                        [placeholder]="'RPT.matches' | translate"/>
                                </ng-template>
                            </td>
                            <td class="bo-only-cell">
                                <div class="ecart-cell-container">
                                    <ng-container *ngIf="editingRow !== item; else editBoOnly">
                                        <span class="ecart-value">{{item.boOnly | number}}</span>
                                        <button type="button" 
                                            *ngIf="item.boOnly > 0"
                                            class="btn-transfer-ecart" 
                                            (click)="transferEcartToMatches(item, 'boOnly')"
                                            [disabled]="isRowLocked(item)"
                                            [title]="(isRowLocked(item) ? 'RPT.rowLocked' : 'RPT.transferBoToMatches') | translate">
                                            ➕
                                        </button>
                                    </ng-container>
                                    <ng-template #editBoOnly>
                                        <input 
                                            [(ngModel)]="item.boOnly" 
                                            type="number" 
                                            min="0" 
                                            class="edit-input" 
                                            inputmode="decimal" 
                                            [placeholder]="'RPT.boGaps' | translate"
                                            (ngModelChange)="onEcartChange(item, 'boOnly')"/>
                                    </ng-template>
                                </div>
                            </td>
                            <td class="partner-only-cell">
                                <div class="ecart-cell-container">
                                    <ng-container *ngIf="editingRow !== item; else editPartnerOnly">
                                        <span class="ecart-value">{{getDisplayPartnerOnly(item) | number}}</span>
                                        <button type="button" 
                                            *ngIf="getDisplayPartnerOnly(item) > 0"
                                            class="btn-transfer-ecart" 
                                            (click)="transferEcartToMatches(item, 'partnerOnly')"
                                            [disabled]="isRowLocked(item)"
                                            [title]="(isRowLocked(item) ? 'RPT.rowLocked' : 'RPT.transferPartnerToMatches') | translate">
                                            ➕
                                        </button>
                                    </ng-container>
                                    <ng-template #editPartnerOnly>
                                        <input 
                                            [(ngModel)]="item.partnerOnly" 
                                            type="number" 
                                            min="0" 
                                            class="edit-input" 
                                            inputmode="decimal" 
                                            [placeholder]="'RPT.partnerGaps' | translate"
                                            (ngModelChange)="onEcartChange(item, 'partnerOnly')"/>
                                    </ng-template>
                                </div>
                            </td>
                            <td class="mismatch-cell">{{item.mismatches | number}}</td>
                            <td class="rate-cell number-cell">
                                <span [class]="getRateClass(getDisplayMatchRate(item))">
                                    {{getDisplayMatchRate(item) | number:'1.2-2'}}%
                                </span>
                            </td>
                            <td class="text-cell">
                                <div class="glpi-cell">
                                    <ng-container *ngIf="item.glpiId && item.glpiId.trim() && editingRow !== item; else glpiInput">
                                        <span class="glpi-link" (click)="showTicketOptionsPopup(item.glpiId)" [title]="'RPT.chooseTicketOption' | translate" style="cursor: pointer;">{{item.glpiId}}</span>
                                    </ng-container>
                                    <ng-template #glpiInput>
                                        <div class="glpi-input-container" [class.glpi-disabled]="item.status === 'OK'">
                                            <input 
                                                [(ngModel)]="item.glpiId" 
                                                [placeholder]="'RPT.ticketId' | translate" 
                                                class="edit-input" 
                                                [disabled]="item.status === 'OK'"
                                                (ngModelChange)="onGlpiIdInputChange(item, $event)"
                                                (blur)="onGlpiIdInputBlur(item)"
                                                (keyup.enter)="onGlpiIdInputEnter(item)"/>
                                            <button type="button" 
                                                *ngIf="!item.glpiId || item.glpiId.trim() === ''" 
                                                class="btn-glpi-create"
                                                (click)="showTicketCreateOptionsPopup(item)"
                                                [disabled]="item.status === 'OK'"
                                                [title]="'RPT.chooseTicketPlatform' | translate">
                                                <i class="fas fa-plus-circle"></i> {{ 'RPT.create' | translate }}
                                            </button>
                                        </div>
                                    </ng-template>
                                </div>
                            </td>
                            <td class="select-cell">
                                <div class="status-cell-container">
                                    <ng-container *ngIf="editingStatusRow !== item; else editStatus">
                                        <span [class]="getStatusClass(item.status)" 
                                              class="status-badge" 
                                              [class.locked]="isRowLocked(item)"
                                              (click)="!isRowLocked(item) && startEditStatus(item)" 
                                              [style.cursor]="isRowLocked(item) ? 'not-allowed' : 'pointer'"
                                              [title]="(isRowLocked(item) ? 'RPT.rowLocked' : 'RPT.clickToEdit') | translate">
                                            {{getDisplayStatus(item.status)}}
                                        </span>
                                        <button type="button" 
                                            *ngIf="item.status === 'OK'"
                                            class="btn-releve" 
                                            (click)="showReleveModal(item)"
                                            [title]="'RPT.showStatement' | translate">
                                            📋
                                        </button>
                                    </ng-container>
                                    <ng-template #editStatus>
                                        <select [(ngModel)]="item.status" class="edit-select" (change)="onStatusChange(item)" (blur)="stopEditStatus()">
                                            <option *ngFor="let s of statusOptions" [ngValue]="s">{{ getDisplayStatus(s) }}</option>
                                        </select>
                                    </ng-template>
                                </div>
                            </td>
                            <td class="select-cell">
                                <ng-container *ngIf="editingRow !== item; else editComment">
                                    <span class="comment-text">{{item.comment}}</span>
                                </ng-container>
                                <ng-template #editComment>
                                    <textarea [(ngModel)]="item.comment" class="edit-textarea" [placeholder]="'RPT.comment' | translate" rows="2"></textarea>
                                </ng-template>
                            </td>
                            <td class="select-cell traitement-cell" [ngClass]="'traitement-cell--' + resolveTraitementKind(item.traitement)">
                                <ng-container *ngIf="editingTraitementRow !== item; else editTraitement">
                                    <span [class]="getTraitementClass(item.traitement)" 
                                          [class.locked]="isRowLocked(item)"
                                          (click)="!isRowLocked(item) && startEditTraitement(item)" 
                                          [style.cursor]="isRowLocked(item) ? 'not-allowed' : 'pointer'"
                                          [title]="(isRowLocked(item) ? 'RPT.processingLocked' : 'RPT.clickToEdit') | translate">
                                        {{ getTraitementDisplayLabel(item.traitement) }}
                                    </span>
                                </ng-container>
                                <ng-template #editTraitement>
                                    <select [(ngModel)]="item.traitement" class="edit-select" (change)="onTraitementChange(item)" (blur)="stopEditTraitement()">
                                        <option [ngValue]="undefined">-</option>
                                        <option *ngFor="let t of getTraitementOptionsForItem(item)" [ngValue]="t">{{ getTraitementDisplayLabel(t) }}</option>
                                    </select>
                                </ng-template>
                            </td>
                            <td class="text-cell">
                                {{item.username || '-'}}
                            </td>
                            <td *ngIf="showActionsColumn" class="actions-cell">
                                <ng-container *ngIf="editingRow !== item; else editingActions">
                                    <button type="button" class="icon-btn icon-edit" 
                                            [title]="'RPT.edit' | translate" 
                                            [attr.aria-label]="'RPT.edit' | translate" 
                                            (click)="startEdit(item)"
                                            [disabled]="isRowLocked(item)">
                                        ✏️
                                    </button>
                                    <button type="button" class="icon-btn icon-delete" 
                                            [title]="'RPT.delete' | translate" 
                                            [attr.aria-label]="'RPT.delete' | translate" 
                                            (click)="deleteRow(item)" 
                                            [disabled]="!item.id || isRowLocked(item)">
                                        🗑️
                                    </button>
                                </ng-container>
                                <ng-template #editingActions>
                                    <button type="button" class="icon-btn icon-save" [title]="'RPT.saveChanges' | translate" [attr.aria-label]="'RPT.save' | translate" (click)="saveEdit(item)">💾</button>
                                    <button type="button" class="icon-btn icon-cancel" [title]="'RPT.cancel' | translate" [attr.aria-label]="'RPT.cancel' | translate" (click)="cancelEdit(item)">❌</button>
                                </ng-template>
                            </td>
                        </tr>
                        <tr *ngIf="item.id && isAuditExpanded(item)" class="audit-detail-row">
                            <td [attr.colspan]="auditHistoryColspan()" class="audit-detail-cell">
                                <div class="audit-detail-inner" *ngIf="isAuditLoading(item.id!)">{{ 'RPT.loadingHistory' | translate }}</div>
                                <div class="audit-detail-inner audit-empty" *ngIf="!isAuditLoading(item.id!) && !getAuditRows(item.id!).length">
                                    {{ 'RPT.noAudit' | translate }}
                                </div>
                                <div *ngIf="!isAuditLoading(item.id!) && getAuditRows(item.id!).length" class="audit-panel-card">
                                    <div class="audit-panel-head">{{ 'RPT.actionHistory' | translate }}</div>
                                    <table class="audit-mini-table audit-mini-table--enhanced ds-table">
                                        <thead>
                                            <tr>
                                                <th class="audit-th-date">{{ 'RPT.dateCol' | translate }}</th>
                                                <th>{{ 'RPT.event' | translate }}</th>
                                                <th>{{ 'RPT.user' | translate }}</th>
                                                <th class="audit-th-pill">{{ 'RPT.level' | translate }}</th>
                                                <th class="audit-th-pill">{{ 'RPT.status' | translate }}</th>
                                                <th>{{ 'RPT.detail' | translate }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr *ngFor="let row of getAuditRows(item.id!)">
                                                <td class="audit-td-date">{{ formatAuditInstant(row.createdAt) }}</td>
                                                <td class="audit-td-event">{{ formatAuditActionLabel(row.actionType) }}</td>
                                                <td class="audit-td-user">{{ row.username || '—' }}</td>
                                                <td>
                                                    <span [class]="auditSnapshotTraitementClass(row.traitementSnapshot)">{{ row.traitementSnapshot || '—' }}</span>
                                                </td>
                                                <td>
                                                    <span [class]="auditSnapshotStatutClass(row.statusSnapshot)">{{ getDisplayStatus(row.statusSnapshot) || '—' }}</span>
                                                </td>
                                                <td class="audit-td-detail">{{ row.detail || '—' }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>
                        </ng-container>
                    </tbody>
                </table>
            </div>

            <!-- Contrôles de pagination -->
            <div *ngIf="filteredReportData && filteredReportData.length > 0" class="pagination-container">
                <ds-pagination
                    [page]="currentPage"
                    [pageCount]="totalPages"
                    [totalItems]="filteredReportData.length"
                    [pageSize]="itemsPerPage"
                    [itemLabel]="'RPT.lines' | translate"
                    (pageChange)="goToPage($event)">
                </ds-pagination>
            </div>

            <div *ngIf="!filteredReportData || !filteredReportData.length" class="no-data">
                <div class="no-data-icon">📊</div>
                <div class="no-data-message">Aucune donnée de réconciliation disponible</div>
            </div>
        </div>

        <!-- Modal de relevé -->
        <div *ngIf="isReleveModalVisible" class="modal-overlay">
            <div class="modal-content-releve" (click)="$event.stopPropagation()">
                <div #releveExportContent>
                <div class="modal-header-releve">
                    <h3>📋 {{ 'RPT.statementTitle' | translate }}</h3>
                    <button type="button" class="modal-close-btn" (click)="closeReleveModal()">✕</button>
                </div>
                <div class="modal-body-releve" *ngIf="!isLoadingReleve">
                    <div class="releve-service-title">
                        <div class="releve-service-main">
                            <h4>{{releveData?.service || '-'}}</h4>
                            <div class="releve-date">Date: {{formatDate(releveData?.date || '')}}</div>
                            <div class="releve-date" *ngIf="releveData?.country">Pays : {{ releveData.country }}</div>
                            <div class="releve-date" *ngIf="releveData?.agency">Agence : {{ releveData.agency }}</div>
                        </div>
                    <div class="releve-env releve-env-select-wrap" *ngIf="releveData">
                            <label for="releveEnvSelect">{{ 'RPT.environment' | translate }}</label>
                            <select
                                id="releveEnvSelect"
                                class="releve-env-select"
                                [ngModel]="releveEnv"
                                (ngModelChange)="onReleveEnvChange($event)"
                            >
                                <option *ngFor="let env of envOptions" [ngValue]="env">
                                    {{ formatEnvFilterLabel(env) }}
                                </option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="releve-section">
                        <h5>{{ 'RPT.statementPerfect' | translate }}</h5>
                        <div class="releve-grid">
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.volumeColon' | translate }}</span>
                                <span class="releve-value">{{releveData?.totalVolume | number}}</span>
                            </div>
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.txnNumber' | translate }}</span>
                                <span class="releve-value">{{releveData?.totalTransactions | number}}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Section Trx Partenaire J+1 : synthèse rapport + traité toujours affichée -->
                    <div class="releve-section">
                        <h5>{{ 'RPT.partnerTrxJ1' | translate }}</h5>
                        <div class="releve-ecart-grid" *ngIf="releveEcartData && releveEcartData.length > 0">
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalCount' | translate }}</span>
                                <span class="releve-value">{{getTotalEcartNombre() | number}}</span>
                            </div>
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalVolumeColon' | translate }}</span>
                                <span class="releve-value">{{getTotalEcartVolume() | number}}</span>
                            </div>
                        </div>
                        <div class="releve-total-summary">
                            <div class="releve-total-item">
                                <span class="releve-total-label">💰 {{ 'RPT.synthesis' | translate }}</span>
                                <span class="releve-total-value">{{getTotalTransactionsSum() | number}}</span>
                                <span class="releve-total-value">{{getTotalVolumeSum() | number}}</span>
                            </div>
                        </div>
                        <div class="releve-ecart-details" *ngIf="releveEcartData && releveEcartData.length > 0">
                            <table class="releve-table ds-table">
                                <thead>
                                    <tr>
                                        <th>{{ 'RPT.agency' | translate }}</th>
                                        <th>{{ 'RPT.country' | translate }}</th>
                                        <th>{{ 'RPT.number' | translate }}</th>
                                        <th>{{ 'RPT.volume' | translate }}</th>
                                        <th>{{ 'RPT.status' | translate }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let ecart of releveEcartData">
                                        <td>{{ecart.agence}}</td>
                                        <td>{{ecart.pays}}</td>
                                        <td>{{ecart.nombreTransactions | number}}</td>
                                        <td>{{ecart.montantTotal | number}}</td>
                                        <td>
                                            <span [class]="(ecart.statut === 'OK' || ecart.statut === 'ok') ? 'statut-ok' : 'statut-en-cours'">
                                                {{ getDisplayStatus(ecart.statut) || 'En cours' }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p class="releve-no-data" *ngIf="!releveEcartData || releveEcartData.length === 0">{{ 'RPT.noJ1Data' | translate: { env: releveEnvMessageLabel } }}</p>
                    </div>

                    <!-- Section Données ENV PARTENAIRE J-1 -->
                    <div class="releve-section" *ngIf="releveEcartDataJ1 && releveEcartDataJ1.length > 0">
                        <h5>{{ 'RPT.partnerTrxJm1' | translate }}</h5>
                        <div class="releve-ecart-grid">
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalCount' | translate }}</span>
                                <span class="releve-value">{{getTotalEcartNombreJ1() | number}}</span>
                            </div>
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalVolumeColon' | translate }}</span>
                                <span class="releve-value">{{getTotalEcartVolumeJ1() | number}}</span>
                            </div>
                        </div>
                        <div class="releve-ecart-details">
                            <table class="releve-table ds-table">
                                <thead>
                                    <tr>
                                        <th>{{ 'RPT.agency' | translate }}</th>
                                        <th>{{ 'RPT.country' | translate }}</th>
                                        <th>{{ 'RPT.number' | translate }}</th>
                                        <th>{{ 'RPT.volume' | translate }}</th>
                                        <th>{{ 'RPT.status' | translate }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let ecart of releveEcartDataJ1">
                                        <td>{{ecart.agence}}</td>
                                        <td>{{ecart.pays}}</td>
                                        <td>{{ecart.nombreTransactions | number}}</td>
                                        <td>{{ecart.montantTotal | number}}</td>
                                        <td>
                                            <span [class]="(ecart.statut === 'OK' || ecart.statut === 'ok') ? 'statut-ok' : 'statut-en-cours'">
                                                {{ getDisplayStatus(ecart.statut) || 'En cours' }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="releve-section" *ngIf="releveEcartDataJ1 && releveEcartDataJ1.length === 0 && !isLoadingReleve">
                        <p class="releve-no-data">{{ 'RPT.noJm1Data' | translate: { env: releveEnvMessageLabel } }}</p>
                    </div>

                    <!-- Section Trx traité (saisie manuelle) -->
                    <div class="releve-section">
                        <h5>📝 {{ 'RPT.treatedManual' | translate }}</h5>
                        <div class="releve-manual-upload">
                            <input 
                                type="file" 
                                #releveManualFileInput 
                                accept=".csv,.xls,.xlsx" 
                                (change)="onReleveManualFileSelected($event)"
                                style="display: none">
                            <button type="button" class="btn-releve-upload ds-btn ds-btn--secondary ds-btn--sm" (click)="releveManualFileInput.click()" [disabled]="isReleveManualFileLoading">
                                {{ isReleveManualFileLoading ? '⏳ Chargement...' : '📤 Charger un fichier (CSV / XLS)' }}
                            </button>
                            <span class="releve-upload-hint">{{ 'RPT.uploadHint' | translate }}</span>
                        </div>
                        <div class="releve-manual-or">{{ 'RPT.orManual' | translate }}</div>
                        <div class="releve-manual-input">
                            <div class="releve-input-group">
                                <label class="releve-input-label">{{ 'RPT.numberLabel' | translate }}</label>
                                <input 
                                    type="number" 
                                    [(ngModel)]="releveManualNombre" 
                                    class="releve-input"
                                    placeholder="0"
                                    min="0"
                                    (input)="onReleveManualChange()">
                            </div>
                            <div class="releve-input-group">
                                <label class="releve-input-label">{{ 'RPT.volumeColon' | translate }}</label>
                                <input 
                                    type="number" 
                                    [(ngModel)]="releveManualVolume" 
                                    class="releve-input"
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                    (input)="onReleveManualChange()">
                            </div>
                        </div>
                        <div class="releve-manual-summary" *ngIf="releveManualNombre > 0 || releveManualVolume > 0">
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalCount' | translate }}</span>
                                <span class="releve-value">{{releveManualNombre | number}}</span>
                            </div>
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalVolumeColon' | translate }}</span>
                                <span class="releve-value">{{releveManualVolume | number}}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Section Trx annulé (saisie manuelle) -->
                    <div class="releve-section">
                        <h5>📝 {{ 'RPT.cancelledManual' | translate }}</h5>
                        <div class="releve-manual-upload">
                            <input 
                                type="file" 
                                #releveAnnuleFileInput 
                                accept=".csv,.xls,.xlsx" 
                                (change)="onReleveAnnuleFileSelected($event)"
                                style="display: none">
                            <button type="button" class="btn-releve-upload ds-btn ds-btn--secondary ds-btn--sm" (click)="releveAnnuleFileInput.click()" [disabled]="isReleveAnnuleFileLoading">
                                {{ isReleveAnnuleFileLoading ? '⏳ Chargement...' : '📤 Charger un fichier (CSV / XLS)' }}
                            </button>
                            <span class="releve-upload-hint">{{ 'RPT.uploadHintCancel' | translate }}</span>
                        </div>
                        <div class="releve-manual-or">{{ 'RPT.orManual' | translate }}</div>
                        <div class="releve-manual-input">
                            <div class="releve-input-group">
                                <label class="releve-input-label">{{ 'RPT.numberLabel' | translate }}</label>
                                <input 
                                    type="number" 
                                    [(ngModel)]="releveAnnuleNombre" 
                                    class="releve-input"
                                    placeholder="0"
                                    min="0"
                                    (input)="onReleveAnnuleChange()">
                            </div>
                            <div class="releve-input-group">
                                <label class="releve-input-label">{{ 'RPT.volumeColon' | translate }}</label>
                                <input 
                                    type="number" 
                                    [(ngModel)]="releveAnnuleVolume" 
                                    class="releve-input"
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                    (input)="onReleveAnnuleChange()">
                            </div>
                        </div>
                        <div class="releve-manual-summary" *ngIf="releveAnnuleNombre > 0 || releveAnnuleVolume > 0">
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalCount' | translate }}</span>
                                <span class="releve-value">{{releveAnnuleNombre | number}}</span>
                            </div>
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalVolumeColon' | translate }}</span>
                                <span class="releve-value">{{releveAnnuleVolume | number}}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Section Trx remboursé (saisie manuelle) -->
                    <div class="releve-section">
                        <h5>📝 {{ 'RPT.refundedManual' | translate }}</h5>
                        <div class="releve-manual-upload">
                            <input 
                                type="file" 
                                #releveRembourseFileInput 
                                accept=".csv,.xls,.xlsx" 
                                (change)="onReleveRembourseFileSelected($event)"
                                style="display: none">
                            <button type="button" class="btn-releve-upload ds-btn ds-btn--secondary ds-btn--sm" (click)="releveRembourseFileInput.click()" [disabled]="isReleveRembourseFileLoading">
                                {{ isReleveRembourseFileLoading ? '⏳ Chargement...' : '📤 Charger un fichier (CSV / XLS)' }}
                            </button>
                            <span class="releve-upload-hint">{{ 'RPT.uploadHint' | translate }}</span>
                        </div>
                        <div class="releve-manual-or">{{ 'RPT.orManual' | translate }}</div>
                        <div class="releve-manual-input">
                            <div class="releve-input-group">
                                <label class="releve-input-label">{{ 'RPT.numberLabel' | translate }}</label>
                                <input 
                                    type="number" 
                                    [(ngModel)]="releveRembourseNombre" 
                                    class="releve-input"
                                    placeholder="0"
                                    min="0"
                                    (input)="onReleveRembourseChange()">
                            </div>
                            <div class="releve-input-group">
                                <label class="releve-input-label">{{ 'RPT.volumeColon' | translate }}</label>
                                <input 
                                    type="number" 
                                    [(ngModel)]="releveRembourseVolume" 
                                    class="releve-input"
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                    (input)="onReleveRembourseChange()">
                            </div>
                        </div>
                        <div class="releve-manual-summary" *ngIf="releveRembourseNombre > 0 || releveRembourseVolume > 0">
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalCount' | translate }}</span>
                                <span class="releve-value">{{releveRembourseNombre | number}}</span>
                            </div>
                            <div class="releve-item">
                                <span class="releve-label">{{ 'RPT.totalVolumeColon' | translate }}</span>
                                <span class="releve-value">{{releveRembourseVolume | number}}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Totaux finaux -->
                    <div class="releve-section">
                        <h5>📊 {{ 'RPT.finalTotals' | translate }}</h5>
                        <div class="releve-final-totals">
                            <div class="releve-final-item">
                                <span class="releve-final-label">📈 {{ 'RPT.totalBoTxns' | translate }}</span>
                                <span class="releve-final-value">{{getTotalTransactionsSum() | number}}</span>
                            </div>
                            <div class="releve-final-item">
                                <span class="releve-final-label">📈 {{ 'RPT.totalPartnerTxns' | translate }}</span>
                                <span class="releve-final-value">{{getTotalTransactionsPartenaire() | number}}</span>
                            </div>
                            <div class="releve-final-item">
                                <span class="releve-final-label">📊 Nombre total (Rapport):</span>
                                <span class="releve-final-value">{{releveData?.totalTransactions || 0 | number}}</span>
                            </div>
                            <div class="releve-final-item">
                                <span class="releve-final-label">📊 {{ 'RPT.totalTreated' | translate }}</span>
                                <span class="releve-final-value">{{getTotalNombreSum() | number}}</span>
                            </div>
                            <div class="releve-final-item">
                                <span class="releve-final-label">📊 {{ 'RPT.totalRefundedCount' | translate }}</span>
                                <span class="releve-final-value">{{releveRembourseNombre | number}}</span>
                            </div>
                            <div class="releve-final-item">
                                <span class="releve-final-label">📊 {{ 'RPT.totalRefundedVolume' | translate }}</span>
                                <span class="releve-final-value">{{releveRembourseVolume | number}}</span>
                            </div>
                            <div class="releve-total-summary">
                                <div class="releve-total-item">
                                    <span class="releve-total-label">💰 {{ 'RPT.partnerVolume' | translate }}</span>
                                    <span class="releve-total-value">{{getTotalTransactionsPartenaire() | number}}</span>
                                    <span class="releve-total-value">{{getTotalVolumeSumWithManual() | number}}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-body-releve" *ngIf="isLoadingReleve">
                    <div class="loading-spinner">⏳ >{{ 'RPT.loading' | translate }}</div>
                </div>
                </div>
                <div class="modal-footer-releve">
                    <button type="button" class="btn btn-export-releve ds-btn ds-btn--secondary ds-btn--sm" (click)="exportReleveToExcel()" [disabled]="!releveData">
                        📥 {{ 'COMMON.actions.export' | translate }}
                    </button>
                    <button type="button" class="btn btn-export-releve ds-btn ds-btn--secondary ds-btn--sm" (click)="exportReleveToPdf()" [disabled]="!releveData">
                        🧾 {{ 'RPT.exportPdf' | translate }}
                    </button>
                    <button type="button" class="btn btn-export-releve ds-btn ds-btn--secondary ds-btn--sm" (click)="saveReleveManualData(true)" [disabled]="!releveData || isSavingReleveManualData || !hasPendingReleveManualChanges">
                        {{ isSavingReleveManualData ? ('RPT.savingEntries' | translate) : ('💾 ' + ('RPT.saveEntries' | translate)) }}
                    </button>
                    <button type="button" class="btn btn-validate-releve ds-btn ds-btn--primary ds-btn--sm" (click)="validateReleve()" [disabled]="isReleveValidateButtonDisabled()" [class.btn-validated]="isReleveCdoClosed() || isReleveFullyClosed()" [title]="getReleveActionButtonTitle()">
                        {{ getReleveActionButtonLabel() }}
                    </button>
                    <button type="button" class="btn btn-reject-releve ds-btn ds-btn--danger ds-btn--sm" (click)="openRejectReleveModal()" [disabled]="!releveData || isRejectingReleve">
                        ⛔ {{ 'RPT.rejectReleve' | translate }}
                    </button>
                    <button type="button" class="btn btn-close-modal ds-btn ds-btn--secondary ds-btn--sm" (click)="closeReleveModal()">{{ 'RPT.close' | translate }}</button>
</div>
        </div>
    </div>
        </div>
    </div>

    <!-- Modal de rejet du relevé (dialog natif) -->
    <dialog #rejectDialog
            class="reject-dialog"
            (close)="onDialogClose($event)"
            (cancel)="onEscapeKeydown($event)">
        <div class="reject-header">
            <h3 class="reject-title">{{ 'RPT.rejectReleveTitle' | translate }}</h3>
            <button type="button" class="reject-close" (click)="closeRejectReleveModal()" [disabled]="isRejectingReleve" [attr.aria-label]="'RPT.close' | translate">✕</button>
        </div>

        <div class="reject-body">
            <div class="reject-summary">
                <span class="reject-summary-label">{{ 'RPT.releveToReject' | translate }}</span>
                <div class="reject-summary-grid">
                    <span class="reject-summary-item"><b>{{ 'RPT.service' | translate }}:</b> {{ releveData?.service }}</span>
                    <span class="reject-summary-item"><b>{{ 'RPT.country' | translate }}:</b> {{ releveData?.country }}</span>
                    <span class="reject-summary-item"><b>{{ 'RPT.environment' | translate }}:</b> {{ releveData?.env }}</span>
                    <span class="reject-summary-item"><b>{{ 'RPT.dateCol' | translate }}:</b> {{ releveData?.date }}</span>
                </div>
            </div>

            <p class="reject-warning">{{ 'RPT.rejectWarning' | translate }}</p>

            <div class="reject-field">
                <label class="reject-label" for="rejectReason">
                    {{ 'RPT.rejectReason' | translate }}<span class="required">*</span>
                </label>
                <select id="rejectReason" name="rejectReason" class="reject-input ds-select" [(ngModel)]="rejectReleveReason">
                    <option value="">{{ 'RPT.selectReason' | translate }}</option>
                    <option value="incorrect_data">{{ 'RPT.reasonIncorrectData' | translate }}</option>
                    <option value="incomplete_file">{{ 'RPT.reasonIncompleteFile' | translate }}</option>
                    <option value="duplicate">{{ 'RPT.reasonDuplicate' | translate }}</option>
                    <option value="wrong_period">{{ 'RPT.reasonWrongPeriod' | translate }}</option>
                    <option value="non_compliant_amounts">{{ 'RPT.reasonNonCompliantAmounts' | translate }}</option>
                    <option value="other">{{ 'RPT.reasonOther' | translate }}</option>
                </select>
                <span class="reject-error" *ngIf="rejectFormSubmitted && !rejectReleveReason">{{ 'RPT.reasonRequired' | translate }}</span>
            </div>

            <div class="reject-field" *ngIf="rejectReleveReason === 'other'">
                <label class="reject-label" for="otherReason">
                    {{ 'RPT.otherReason' | translate }}<span class="required">*</span>
                </label>
                <input id="otherReason" name="otherReason" type="text" class="reject-input ds-input"
                       [(ngModel)]="rejectReleveOtherReason"
                       [placeholder]="'RPT.otherReasonPlaceholder' | translate" />
                <span class="reject-error" *ngIf="rejectFormSubmitted && !rejectReleveOtherReason?.trim()">{{ 'RPT.otherReasonRequired' | translate }}</span>
            </div>

            <div class="reject-field">
                <label class="reject-label" for="rejectComment">
                    {{ 'RPT.rejectComment' | translate }}<span class="required">*</span>
                </label>
                <textarea id="rejectComment" name="rejectComment" rows="4" class="reject-input reject-textarea ds-input"
                          [(ngModel)]="rejectReleveCommentaire"
                          [placeholder]="'RPT.rejectCommentPlaceholder' | translate"></textarea>
                <div class="reject-hint-row">
                    <span class="reject-error" *ngIf="rejectFormSubmitted && (!rejectReleveCommentaire?.trim() || rejectReleveCommentaire.trim().length < 10)">{{ 'RPT.rejectCommentRequired' | translate }}</span>
                    <span class="reject-counter">{{ rejectReleveCommentaire.trim().length }}/500</span>
                </div>
            </div>

            <div class="reject-error-banner" *ngIf="rejectErrorMessage">
                <span class="reject-error-banner-title">{{ 'RPT.rejectErrorTitle' | translate }}</span>
                <span>{{ rejectErrorMessage }}</span>
            </div>
        </div>

        <div class="reject-footer">
            <button type="button" class="btn btn-cancel-reject ds-btn ds-btn--secondary" (click)="closeRejectReleveModal()" [disabled]="isRejectingReleve">
                {{ 'RPT.close' | translate }}
            </button>
            <button type="button" class="btn btn-confirm-reject ds-btn ds-btn--danger" (click)="confirmRejectReleve()" [disabled]="isRejectingReleve">
                {{ isRejectingReleve ? ('RPT.rejecting' | translate) : ('RPT.confirmReject' | translate) }}
            </button>
        </div>
    </dialog>
    `,
    styleUrls: ['../../shared/result8rec-audit-pills.scss'],
    styles: [`
        :host {
            display: block;
            max-width: 100%;
            overflow-x: hidden;
        }

        .reconciliation-report-page {
            font-family: var(--font-ui);
            background: var(--rd-bg);
            min-height: 100vh;
            width: 100%;
            color: var(--rd-text1);
            font-size: 15px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        }

        .topnav {
            background: var(--rd-navy);
            height: 52px;
            display: flex;
            align-items: center;
            padding: 0 28px;
            gap: 20px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .nav-brand {
            font-family: var(--font-display);
            font-size: 17px;
            color: var(--color-nav-text);
            letter-spacing: 0.01em;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
        }

        .nav-brand-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--rd-green-m);
            box-shadow: 0 0 0 3px rgba(90, 158, 116, 0.25);
        }

        .nav-sep {
            width: 1px;
            height: 22px;
            background: rgba(255, 255, 255, 0.1);
        }

        .nav-path {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.75);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .nav-path strong {
            font-weight: 500;
        }

        .nav-spacer {
            flex: 1;
        }

        .nav-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }

        .nav-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 7px 16px;
            border-radius: 8px;
            border: none;
            font-family: var(--font-ui);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            letter-spacing: 0.02em;
        }

        .nav-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .nav-btn.primary {
            background: var(--rd-green-m);
            color: var(--color-nav-text);
        }

        .nav-btn.primary:hover:not(:disabled) {
            background: var(--rd-green);
        }

        .nav-btn.secondary {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.75);
            border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .nav-btn.secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.14);
        }

        .page-header-report {
            background: var(--rd-surface);
            border-bottom: 1px solid var(--rd-border);
            padding: 20px 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }

        .ph-report-left {
            min-width: 0;
        }

        .ph-eyebrow {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: var(--rd-text3);
            margin-bottom: 6px;
        }

        .ph-eyebrow span {
            display: inline-block;
            width: 16px;
            height: 1.5px;
            background: var(--rd-text3);
            border-radius: 2px;
        }

        .ph-title-report {
            font-family: var(--font-display);
            font-size: 28px;
            font-weight: 400;
            color: var(--rd-text1);
            letter-spacing: -0.02em;
            line-height: 1.2;
            margin: 0;
        }

        .ph-title-report em {
            font-style: italic;
            color: var(--rd-amber);
        }

        .ph-report-right {
            flex-shrink: 0;
        }

        .hero-kpi-strip {
            display: flex;
            align-items: center;
            gap: 0;
            background: var(--rd-navy);
            border-radius: var(--rd-r-sm);
            padding: 12px 20px;
            box-shadow: var(--rd-shadow);
        }

        .hk-strip-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 0 16px;
        }

        .hk-strip-sep {
            width: 1px;
            height: 32px;
            background: rgba(255, 255, 255, 0.12);
        }

        .hk-strip-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(255, 255, 255, 0.5);
        }

        .hk-strip-value {
            font-size: 22px;
            font-weight: 700;
            color: var(--color-nav-text);
            font-family: var(--font-display);
        }

        .main {
            padding: 28px 28px 60px;
            width: 100%;
            flex: 1;
            position: relative;
            box-sizing: border-box;
        }

        .page-header {
            background: var(--color-surface-sunken);
            padding: 15px 20px;
            border-bottom: 1px solid var(--color-border);
            min-width: 0;
        }

        .breadcrumb {
            display: flex;
            align-items: center;
        }

        .breadcrumb-link {
            color: var(--color-info-solid);
            text-decoration: none;
            font-weight: 500;
            padding: 8px 12px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }

        .breadcrumb-link:hover {
            background: var(--color-surface-sunken);
            text-decoration: none;
            color: var(--color-info-solid);
        }

        .reconciliation-report-container {
            background: var(--rd-surface);
            border-radius: 12px;
            box-shadow: var(--rd-shadow);
            border: 1px solid var(--rd-border);
            margin: 0;
            overflow: hidden;
            max-width: 100%;
            box-sizing: border-box;
        }

        .report-header {
            background: var(--rd-navy);
            color: var(--color-accent-contrast);
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }

        .report-header h2 {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 600;
            min-width: 0;
        }

        .magic-report-scope {
            margin: 8px 0 0;
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.9);
            width: 100%;
        }
        .magic-report-scope-list {
            color: var(--color-warning-solid);
            font-weight: 600;
        }

        .report-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
            min-width: 0;
        }
        .report-display-mode {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.9);
            margin-left: 4px;
        }

        .badge {
            margin-left: 10px;
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        .badge-live { background: var(--color-success-bg); color: var(--color-success-text); }
        .badge-db { background: var(--color-info-bg); color: var(--color-info-solid); }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .btn-export {
            background: var(--color-success);
            color: var(--color-accent-contrast);
        }

        .btn-export:hover:not(:disabled) {
            background: var(--color-success);
            transform: translateY(-1px);
        }

        .btn-close {
            background: var(--color-error);
            color: var(--color-accent-contrast);
        }

        .btn-save-all {
            background: var(--color-info-solid);
            color: var(--color-nav-text);
        }

        .btn-report {
            background: var(--color-duplicate);
            color: var(--color-accent-contrast);
        }

        .btn-report:hover:not(:disabled) {
            background: var(--color-duplicate);
            transform: translateY(-1px);
        }

        .btn-dashboard {
            background: var(--color-warning-solid);
            color: var(--color-accent-contrast);
        }

        .btn-dashboard:hover:not(:disabled) {
            background: var(--color-warning-text);
            transform: translateY(-1px);
        }

        .btn-suivi-ecarts {
            background: var(--color-duplicate);
            color: var(--color-accent-contrast);
        }

        .btn-suivi-ecarts:hover:not(:disabled) {
            background: var(--color-duplicate);
            transform: translateY(-1px);
        }

        .btn-toggle-source {
            background: var(--color-text-muted);
            color: var(--color-accent-contrast);
        }

        .btn-toggle-source:hover:not(:disabled) {
            background: var(--color-text-muted);
            transform: translateY(-1px);
        }

        .btn-toggle-actions {
            background: var(--color-type-compense);
            color: var(--color-accent-contrast);
        }

        .btn-toggle-actions:hover:not(:disabled) {
            background: var(--color-type-compense);
            transform: translateY(-1px);
        }

        .btn-add {
            background: var(--color-info-solid);
            color: var(--color-accent-contrast);
        }

        .btn-add:hover:not(:disabled) {
            background: var(--color-info-text);
            transform: translateY(-1px);
        }

        .icon-btn {
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 4px 6px;
            border-radius: 4px;
        }
        .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .icon-save { color: var(--color-success); }
        .icon-save:hover { background: rgba(40,167,69,0.1); }
        .icon-delete { color: var(--color-error); }
        .icon-delete:hover { background: rgba(220,53,69,0.1); }

        .btn-close:hover {
            background: var(--color-error-solid);
            transform: translateY(-1px);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .report-filters {
            padding: 20px;
            background: var(--color-surface-sunken);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: flex-end;
        }

        .filter-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 0;
            flex: 1 1 auto;
        }

        .filter-group label {
            font-weight: 600;
            color: var(--color-text-muted);
            font-size: 0.9rem;
        }

        .filter-group select {
            padding: 8px 12px;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            font-size: 0.9rem;
            background: var(--color-surface);
            min-width: 120px;
            width: 100%;
            max-width: 180px;
        }

        .bulk-status-group {
            background: var(--color-surface-sunken);
            padding: 15px;
            border-radius: 8px;
            border: 2px solid var(--color-border);
            margin-top: 20px;
        }

        .bulk-status-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .bulk-status-select {
            flex: 1;
            min-width: 200px;
            max-width: 300px;
        }

        .btn-bulk-status {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .btn-bulk-status:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3);
        }

        .btn-bulk-status:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .bulk-delete-group .bulk-status-controls {
            align-items: center;
        }

        .btn-bulk-delete {
            background: linear-gradient(135deg, var(--color-error) 0%, var(--color-error-solid) 100%);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .btn-bulk-delete:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--color-error-solid) 0%, var(--color-error-solid) 100%);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(220, 53, 69, 0.35);
        }

        .btn-bulk-delete:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .selection-hint {
            color: var(--color-text-muted);
            font-size: 0.85rem;
            max-width: 420px;
        }

        .btn-clear-selection {
            background: linear-gradient(135deg, var(--color-text-muted) 0%, var(--color-text-muted) 100%);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .btn-clear-selection:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--color-text-muted) 0%, var(--color-text-muted) 100%);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(108, 117, 125, 0.3);
        }

        .btn-clear-selection:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .selection-count {
            color: var(--color-text-muted);
            font-weight: 600;
            padding: 8px 15px;
            background: var(--color-surface-sunken);
            border-radius: 6px;
            font-size: 0.9rem;
        }

        .filter-input {
            padding: 8px 12px;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            font-size: 0.9rem;
            background: var(--color-surface);
            min-width: 140px;
            width: 100%;
            max-width: 180px;
            transition: border-color 0.2s ease;
        }

        .filter-input:focus {
            outline: none;
            border-color: var(--color-info-solid);
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .filter-date {
            padding: 8px 12px;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            font-size: 0.9rem;
            background: var(--color-surface);
            min-width: 140px;
            width: 100%;
            max-width: 160px;
            transition: border-color 0.2s ease;
        }

        .filter-date:focus {
            outline: none;
            border-color: var(--color-info-solid);
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .filter-inline {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .filter-select {
            padding: 8px 12px;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            font-size: 0.9rem;
            background: var(--color-surface);
            min-width: 120px;
            width: 100%;
            max-width: 180px;
            transition: border-color 0.2s ease;
        }

        .filter-select:focus {
            outline: none;
            border-color: var(--color-info-solid);
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .filter-mat-select {
            width: 100%;
            min-width: 140px;
            max-width: 200px;
        }

        .filter-mat-select .mat-form-field-wrapper {
            padding-bottom: 0;
        }

        .filter-mat-select .mat-form-field-infix {
            padding: 0.4em 0;
            font-size: 0.9rem;
        }

        .btn-clear-dates {
            padding: 8px 12px;
            border: 1px solid var(--color-error);
            background: var(--color-error);
            color: var(--color-accent-contrast);
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
        }

        .btn-clear-dates:hover {
            background: var(--color-error-solid);
            border-color: var(--color-error-solid);
            transform: translateY(-1px);
        }

        .btn-clear-dates:active {
            transform: translateY(0);
        }

        .btn-voir-plus {
            background: var(--color-info-solid);
            color: var(--color-accent-contrast);
        }
        .btn-voir-plus:hover:not(:disabled) {
            background: var(--color-info-text);
            transform: translateY(-1px);
        }

        .report-summary {
            padding: 20px;
            background: var(--color-surface-sunken);
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            min-width: 0;
        }

        .summary-card {
            background: var(--color-surface);
            border-radius: 8px;
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .summary-card.clickable-card {
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .summary-card.clickable-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            background: var(--color-surface-sunken);
        }

        .summary-card.clickable-card.active {
            background: var(--color-info-bg);
            border: 2px solid var(--color-accent);
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }

        .card-icon {
            font-size: 1.5rem;
        }

        .card-content {
            flex: 1;
        }

        .card-title {
            font-size: 0.8rem;
            color: var(--color-text-muted);
            font-weight: 500;
            margin-bottom: 4px;
        }

        .card-value {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--color-text-muted);
        }

        .report-table-container {
            overflow-x: auto;
            overflow-y: auto;
            max-height: calc(100vh - 400px);
            min-height: 600px;
            min-width: 0;
        }

        .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
            table-layout: fixed;
        }

        .report-table th {
            background: var(--color-surface-sunken);
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            color: var(--color-text-muted);
            border-bottom: 2px solid var(--color-border);
            position: sticky;
            top: 0;
            z-index: 10;
            white-space: nowrap;
        }

        .report-table td {
            padding: 10px 8px;
            border-bottom: 1px solid var(--color-border);
        }

        .report-table tr:hover {
            background: var(--color-surface-sunken);
        }

        .number-cell {
            text-align: right;
            font-family: var(--font-mono);
        }

        .text-cell { text-align: left; }

        /* Align headers with numeric columns */
        .col-number { text-align: right; }
        th.th-filter-ecart {
            cursor: pointer;
            user-select: none;
            text-decoration: underline;
            text-decoration-style: dotted;
            text-underline-offset: 3px;
            transition: background 0.2s ease, color 0.2s ease;
        }
        th.th-filter-ecart:hover {
            background: var(--color-surface-sunken);
            color: var(--color-info-solid);
        }
        th.th-filter-ecart-active {
            background: var(--color-info-bg) !important;
            color: var(--color-info-text);
            text-decoration-style: solid;
        }
        .col-select { text-align: left; }
        .col-text { text-align: left; }
        .col-date { text-align: left; }

        /* Column widths to keep alignment stable */
        .col-expand { width: 36px; min-width: 36px; text-align: center; padding: 6px 2px; }
        .expand-cell { text-align: center; vertical-align: middle; }
        .btn-row-expand {
            border: none;
            background: var(--color-surface-sunken);
            color: var(--color-text-muted);
            border-radius: 4px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            font-size: 11px;
            line-height: 1;
            padding: 0;
        }
        .btn-row-expand:hover { background: var(--color-border); }
        .btn-row-expand.open { background: var(--color-info-bg); color: var(--color-info-text); }
        .expand-placeholder { display: inline-block; width: 28px; }
        .row-audit-open { box-shadow: inset 3px 0 0 var(--rd-blue); }
        .audit-detail-row td.audit-detail-cell {
            padding: 0 12px 12px 12px !important;
            background: linear-gradient(to bottom, var(--color-surface-sunken) 0%, var(--color-surface-sunken) 100%);
            border-bottom: 1px solid var(--color-border);
        }
        .service-group-header {
            background: linear-gradient(180deg, var(--color-info-bg) 0%, var(--color-info-bg) 100%);
        }
        .service-group-header td.service-group-header-cell {
            padding: 8px 12px !important;
            border-top: 2px solid var(--color-info-border);
            border-bottom: 1px solid var(--color-info-border);
        }
        .service-group-header-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--rd-blue);
            margin-right: 8px;
            vertical-align: middle;
        }
        .service-group-header-label {
            font-weight: 700;
            font-size: 0.9rem;
            color: var(--rd-blue);
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .service-group-header-count {
            margin-left: 12px;
            font-size: 0.8rem;
            color: var(--color-text-muted);
            font-weight: 600;
        }
        .audit-detail-inner { padding: 10px 4px 4px 4px; font-size: 0.82rem; color: var(--color-text-muted); }
        .audit-empty { font-style: italic; max-width: 900px; }
        .audit-mini-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.82rem;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            overflow: hidden;
        }
        .audit-mini-table th {
            background: var(--color-surface-sunken);
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            position: static;
        }
        .audit-mini-table td {
            padding: 8px 10px;
            border-top: 1px solid var(--color-border);
            vertical-align: top;
        }
        .audit-td-date { white-space: nowrap; font-family: var(--font-mono); font-size: 0.8rem; }
        .audit-td-detail { word-break: break-word; max-width: 320px; color: var(--color-text-primary); }
        .audit-td-event { color: var(--color-text-primary); }
        .audit-td-user { font-weight: 500; color: var(--rd-blue); }
        .audit-panel-card {
            border: 1px solid var(--color-border);
            border-radius: 8px;
            background: var(--color-surface);
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
            overflow: hidden;
            max-width: 100%;
        }
        .audit-panel-head {
            padding: 10px 12px;
            background: linear-gradient(180deg, var(--color-surface-sunken) 0%, var(--color-surface-sunken) 100%);
            border-bottom: 1px solid var(--color-border);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--color-text-muted);
        }
        .audit-mini-table--enhanced { border-radius: 0; border: none; box-shadow: none; }
        .audit-mini-table--enhanced th {
            font-size: 0.68rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--color-text-muted);
            background: var(--color-surface-sunken);
        }
        .audit-th-date { min-width: 8.5rem; }
        .audit-th-pill { text-align: center; }
        .audit-mini-table--enhanced td:nth-child(4),
        .audit-mini-table--enhanced td:nth-child(5) { text-align: center; vertical-align: middle; }

        .col-checkbox { width: 40px; text-align: center; }
        .checkbox-cell { text-align: center; padding: 8px; }
        .checkbox-cell input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        .row-selected {
            background-color: var(--color-info-bg) !important;
        }
        .row-selected:hover {
            background-color: var(--color-info-bg) !important;
        }
        /* Mise en évidence des lignes selon l'étape de traitement */
        .row-traitement-support {
            background-color: rgba(254, 243, 199, 0.35) !important;
            border-left: 4px solid var(--color-warning-solid);
        }
        .row-traitement-support:hover {
            background-color: rgba(253, 230, 138, 0.45) !important;
        }
        .row-traitement-cdo {
            background-color: rgba(209, 236, 241, 0.45) !important;
            border-left: 4px solid var(--color-info-solid);
        }
        .row-traitement-cdo:hover {
            background-color: rgba(190, 229, 235, 0.55) !important;
        }
        .row-traitement-group {
            background-color: rgba(219, 234, 254, 0.4) !important;
            border-left: 4px solid var(--color-info-solid);
        }
        .row-traitement-group:hover {
            background-color: rgba(191, 219, 254, 0.5) !important;
        }
        .row-traitement-termine {
            background-color: rgba(209, 250, 229, 0.45) !important;
            border-left: 4px solid var(--color-success-solid);
        }
        .row-traitement-termine:hover {
            background-color: rgba(167, 243, 208, 0.55) !important;
        }
        .col-date { width: 110px; }
        .col-text { width: 140px; }
        .col-text input { width: 100%; padding: 6px 8px; box-sizing: border-box; }
        .col-number { width: 100px; }
        .col-transactions { width: 100px; text-align: center; }
        .col-select { width: 180px; }
        .col-actions { text-align: left; width: 130px; }
        
        /* Largeur spécifique pour la colonne Service (augmentée) */
        .col-service { width: 300px; min-width: 280px; }
        .col-service input { width: 100%; padding: 6px 8px; box-sizing: border-box; }
        
        /* Largeur spécifique pour la colonne Pays */
        .col-pays { width: 200px; min-width: 180px; }
        .col-pays input { width: 100%; padding: 6px 8px; box-sizing: border-box; }
        
        /* Styles pour le texte des services */
        .service-text {
            display: inline-block;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
            color: var(--color-text-muted);
        }
        
        .service-text:hover {
            white-space: normal;
            word-wrap: break-word;
            background: var(--color-surface-sunken);
            padding: 2px 4px;
            border-radius: 4px;
            z-index: 10;
            position: relative;
        }
        
        /* Styles pour le texte des pays */
        .country-text {
            display: inline-block;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
            color: var(--color-text-muted);
        }
        
        .country-text:hover {
            white-space: normal;
            word-wrap: break-word;
            background: var(--color-surface-sunken);
            padding: 2px 4px;
            border-radius: 4px;
            z-index: 10;
            position: relative;
        }
        .glpi-cell { display: flex; gap: 8px; align-items: center; }
        .glpi-link { color: var(--color-info-solid); text-decoration: none; font-weight: 600; }
        .glpi-link:hover { text-decoration: underline; }
        .glpi-input-container.glpi-disabled {
            opacity: 0.7;
        }
        .glpi-input-container.glpi-disabled .btn-glpi-create {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .glpi-input-container.glpi-disabled .edit-input {
            background-color: var(--color-surface-sunken);
            color: var(--color-text-muted);
            cursor: not-allowed;
        }
        
        .glpi-input-container {
            display: flex;
            gap: 8px;
            align-items: center;
            width: 100%;
        }
        
        .btn-glpi-create {
            background: var(--color-success);
            color: var(--color-accent-contrast);
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        
        .btn-glpi-create:hover {
            background: var(--color-success);
            transform: translateY(-1px);
        }
        
        .btn-glpi-create i {
            font-size: 0.7rem;
        }

        .match-cell {
            text-align: right;
            color: var(--color-success);
            font-weight: 600;
        }

        .bo-only-cell {
            text-align: right;
            color: var(--color-warning-solid);
            font-weight: 600;
        }

        .partner-only-cell {
            text-align: right;
            color: var(--color-warning-solid);
            font-weight: 600;
        }

        .ecart-cell-container {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
        }

        .ecart-value {
            flex: 0 0 auto;
        }

        .btn-transfer-ecart {
            background: var(--color-success);
            color: var(--color-accent-contrast);
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.9rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            min-width: 28px;
            height: 24px;
            flex: 0 0 auto;
        }

        .btn-transfer-ecart:hover {
            background: var(--color-success);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .btn-transfer-ecart:active {
            transform: translateY(0);
        }

        .btn-transfer-ecart:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-text-muted);
        }

        .btn-transfer-ecart:disabled:hover {
            background: var(--color-text-muted);
            transform: none;
            box-shadow: none;
        }

        .status-badge.locked,
        .traitement-badge.locked {
            opacity: 0.6;
            cursor: not-allowed !important;
            pointer-events: none;
        }

        .mismatch-cell {
            text-align: right;
            color: var(--color-error);
            font-weight: 600;
        }

        .rate-cell {
            text-align: right;
            font-weight: 600;
        }

        .select-cell { padding: 6px 8px; }
        .cell-select {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--color-border);
            border-radius: 4px;
            background: var(--color-surface);
            font-size: 0.9rem;
        }

        .rate-excellent {
            color: var(--color-success);
        }

        .rate-good {
            color: var(--color-info-solid);
        }

        .rate-average {
            color: var(--color-warning-solid);
        }

        .rate-poor {
            color: var(--color-error);
        }

        .no-data {
            text-align: center;
            padding: 60px 20px;
            color: var(--color-text-muted);
        }

        .no-data-icon {
            font-size: 3rem;
            margin-bottom: 15px;
        }

        .no-data-message {
            font-size: 1.1rem;
            font-weight: 500;
        }

        /* Styles de pagination */
        .pagination-container {
            padding: 20px;
            background: var(--color-surface-sunken);
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }

        .pagination-info {
            color: var(--color-text-muted);
            font-size: 0.9rem;
            font-weight: 500;
        }

        .pagination-controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .pagination-btn {
            padding: 8px 12px;
            border: 1px solid var(--color-border);
            background: var(--color-surface);
            color: var(--color-text-muted);
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 40px;
            height: 36px;
        }

        .pagination-btn:hover:not(:disabled) {
            background: var(--color-surface-sunken);
            border-color: var(--color-text-muted);
            transform: translateY(-1px);
        }

        .pagination-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-surface-sunken);
        }

        .page-numbers {
            display: flex;
            gap: 4px;
            margin: 0 8px;
        }

        .page-number {
            padding: 8px 12px;
            border: 1px solid var(--color-border);
            background: var(--color-surface);
            color: var(--color-text-muted);
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .page-number:hover {
            background: var(--color-surface-sunken);
            border-color: var(--color-text-muted);
            transform: translateY(-1px);
        }

        .page-number.active {
            background: var(--color-info-solid);
            color: var(--color-accent-contrast);
            border-color: var(--color-info-solid);
            font-weight: 600;
        }

        .page-number.active:hover {
            background: var(--color-info-solid);
            border-color: var(--color-info-solid);
        }

        /* Styles pour l'édition en ligne */
        .editing-row {
            background: var(--color-warning-bg) !important;
            border: 2px solid var(--color-warning-solid) !important;
        }

        .editing-row:hover {
            background: var(--color-warning-bg) !important;
        }

        .edit-input, .edit-select, .edit-textarea {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--color-info-solid);
            border-radius: 4px;
            background: var(--color-surface);
            font-size: 0.9rem;
            box-sizing: border-box;
        }

        .edit-input:focus, .edit-select:focus, .edit-textarea:focus {
            outline: none;
            border-color: var(--color-info-solid);
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .edit-textarea {
            resize: vertical;
            min-height: 60px;
            font-family: inherit;
        }

        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
            text-align: center;
            min-width: 80px;
        }

        .status-ok {
            background: var(--color-success-bg);
            color: var(--color-success-text);
        }

        .status-nok {
            background: var(--color-error-bg);
            color: var(--color-error-text);
        }

        .status-reporting-incomplet {
            background: var(--color-warning-bg);
            color: var(--color-warning-text);
        }

        .status-reporting-indisponible {
            background: var(--color-info-bg);
            color: var(--color-info-text);
        }

        .status-en-cours {
            background: var(--color-neutral-bg);
            color: var(--color-neutral-text);
        }

        .traitement-cell {
            min-width: 168px;
            text-align: center;
            vertical-align: middle;

            &.traitement-cell--support {
                background: rgba(254, 243, 199, 0.45);
            }
            &.traitement-cell--cdo {
                background: rgba(209, 236, 241, 0.55);
            }
            &.traitement-cell--group {
                background: rgba(219, 234, 254, 0.45);
            }
            &.traitement-cell--termine {
                background: rgba(209, 250, 229, 0.45);
            }
            &.traitement-cell--none {
                background: rgba(243, 244, 246, 0.75);
            }
            
            .traitement-badge {
                display: inline-block;
                padding: 5px 11px;
                border-radius: 999px;
                font-size: 0.72rem;
                font-weight: 700;
                line-height: 1.3;
                white-space: normal;
                max-width: 100%;
                transition: all 0.2s;
                border: 1px solid transparent;
                box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
                
                &:hover {
                    opacity: 0.92;
                    transform: scale(1.02);
                }
            }
            
            .edit-select {
                width: 100%;
                padding: 4px 8px;
                border: 1px solid var(--color-border);
                border-radius: 4px;
                font-size: 0.9rem;
                background: var(--color-surface);
                
                &:focus {
                    outline: none;
                    border-color: var(--color-success-solid);
                }
            }
        }

        .traitement-badge {
            display: inline-block;
            padding: 5px 11px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 700;
            text-align: center;
            min-width: 120px;
            border: 1px solid transparent;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }

        .traitement-kind--support {
            background: linear-gradient(180deg, var(--color-warning-bg) 0%, var(--color-warning-bg) 100%);
            color: var(--color-warning-text);
            border-color: var(--color-warning-solid);
        }

        .traitement-kind--cdo {
            background: linear-gradient(180deg, var(--color-info-bg) 0%, var(--color-info-bg) 100%);
            color: var(--color-info-text);
            border-color: var(--color-info-solid);
        }

        .traitement-kind--group {
            background: linear-gradient(180deg, var(--color-info-bg) 0%, var(--color-info-border) 100%);
            color: var(--color-info-text);
            border-color: var(--color-info-solid);
        }

        .traitement-kind--termine {
            background: linear-gradient(180deg, var(--color-success-bg) 0%, var(--color-success-bg) 100%);
            color: var(--color-success-text);
            border-color: var(--color-success-solid);
        }

        .traitement-kind--none {
            background: var(--color-surface-sunken);
            color: var(--color-text-muted);
            border-color: var(--color-border);
        }

        .comment-text {
            font-size: 0.85rem;
            line-height: 1.3;
            max-width: 150px;
            word-wrap: break-word;
        }

        .icon-edit {
            color: var(--color-info-solid);
        }

        .icon-edit:hover {
            background: rgba(0, 123, 255, 0.1);
        }

        .icon-cancel {
            color: var(--color-text-muted);
        }

        .icon-cancel:hover {
            background: rgba(108, 117, 125, 0.1);
        }

        .status-cell-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .col-env {
            width: 70px;
            text-align: center;
            white-space: nowrap;
        }

        .btn-releve {
            background: var(--color-info-solid);
            color: var(--color-accent-contrast);
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 32px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .btn-releve:hover {
            background: var(--color-info-text);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        /* Styles pour le modal de relevé */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content-releve {
            background: var(--color-surface);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            max-width: 900px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        .modal-header-releve {
            padding: 20px;
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            border-radius: 12px 12px 0 0;
        }

        .modal-header-releve h3 {
            margin: 0;
            font-size: 1.3rem;
            font-weight: 600;
        }

        .modal-close-btn {
            background: transparent;
            border: none;
            color: var(--color-accent-contrast);
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        }

        .modal-close-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .modal-body-releve {
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        }

        .releve-service-title {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--color-border);
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
        }

        .releve-service-main h4 {
            margin: 0 0 8px 0;
            font-size: 1.5rem;
            color: var(--color-text-muted);
            font-weight: 600;
        }

        .releve-date {
            color: var(--color-text-muted);
            font-size: 0.95rem;
        }

        .releve-env {
            font-size: 0.95rem;
            color: var(--color-text-muted);
            font-weight: 500;
            white-space: nowrap;
        }

        .releve-env-value {
            font-weight: 700;
            color: var(--color-info-solid);
        }

        .releve-env-select-wrap {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
        }

        .releve-env-select-wrap label {
            font-size: 0.8rem;
            color: var(--color-text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .releve-env-select {
            min-width: 150px;
            padding: 8px 12px;
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--color-info-solid);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            background: var(--color-surface);
            cursor: pointer;
        }

        .releve-env-select:focus {
            outline: none;
            border-color: var(--color-info-solid);
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
        }

        .releve-section {
            margin-bottom: 25px;
        }

        .releve-section h5 {
            margin: 0 0 15px 0;
            font-size: 1.1rem;
            color: var(--color-text-muted);
            font-weight: 600;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--color-surface-sunken);
        }

        .releve-grid, .releve-ecart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }

        .releve-item {
            display: flex;
            flex-direction: column;
            padding: 12px;
            background: var(--color-surface-sunken);
            border-radius: 8px;
            border: 1px solid var(--color-border);
        }

        .releve-label {
            font-size: 0.85rem;
            color: var(--color-text-muted);
            margin-bottom: 5px;
            font-weight: 500;
        }

        .releve-value {
            font-size: 1.2rem;
            color: var(--color-text-muted);
            font-weight: 700;
            font-family: var(--font-mono);
        }

        .releve-total-summary {
            margin: 20px 0;
            padding: 15px;
            background: linear-gradient(135deg, var(--color-success-bg) 0%, var(--color-success-bg) 100%);
            border: 2px solid var(--color-success);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(40, 167, 69, 0.2);
        }

        .releve-total-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }

        .releve-total-label {
            font-size: 1rem;
            color: var(--color-success-text);
            font-weight: 600;
        }

        .releve-total-value {
            font-size: 1.5rem;
            color: var(--color-success-text);
            font-weight: 700;
            font-family: var(--font-mono);
            background: var(--color-surface);
            padding: 8px 16px;
            border-radius: 6px;
            border: 2px solid var(--color-success);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .releve-ecart-details {
            margin-top: 15px;
        }

        .releve-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }

        .releve-table thead {
            background: var(--color-surface-sunken);
        }

        .releve-table th {
            padding: 10px;
            text-align: left;
            font-weight: 600;
            color: var(--color-text-muted);
            border-bottom: 2px solid var(--color-border);
        }

        .releve-table td {
            padding: 10px;
            border-bottom: 1px solid var(--color-border);
        }

        .releve-table tbody tr:hover {
            background: var(--color-surface-sunken);
        }

        .statut-ok {
            background: var(--color-success-bg);
            color: var(--color-success-text);
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .statut-en-cours {
            background: var(--color-warning-bg);
            color: var(--color-warning-text);
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .releve-no-data {
            color: var(--color-text-muted);
            font-style: italic;
            text-align: center;
            padding: 20px;
        }

        /* Zone chargement fichier Trx traité */
        .releve-manual-upload {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .btn-releve-upload {
            padding: 10px 16px;
            border: 1px solid var(--color-info-solid);
            border-radius: 6px;
            background: var(--color-info-solid);
            color: var(--color-nav-text);
            font-size: 0.95rem;
            cursor: pointer;
            transition: background 0.2s, border-color 0.2s;
        }
        .btn-releve-upload:hover:not(:disabled) {
            background: var(--color-info-text);
            border-color: var(--color-info-text);
        }
        .btn-releve-upload:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }
        .releve-upload-hint {
            font-size: 0.85rem;
            color: var(--color-text-muted);
        }
        .releve-manual-or {
            font-size: 0.9rem;
            color: var(--color-text-muted);
            margin-bottom: 10px;
            font-weight: 600;
        }
        /* Styles pour la saisie manuelle */
        .releve-manual-input {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }

        .releve-input-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .releve-input-label {
            font-size: 0.9rem;
            color: var(--color-text-muted);
            font-weight: 600;
        }

        .releve-input {
            padding: 10px;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            font-size: 1rem;
            font-family: var(--font-mono);
            transition: border-color 0.2s ease;
        }

        .releve-input:focus {
            outline: none;
            border-color: var(--color-info-solid);
            box-shadow: 0 0 0 2px rgba(23, 162, 184, 0.25);
        }

        .releve-manual-summary {
            margin-top: 15px;
            padding: 15px;
            background: var(--color-surface-sunken);
            border-radius: 8px;
            border: 1px solid var(--color-border);
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }

        /* Styles pour les totaux finaux */
        .releve-final-totals {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .releve-final-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 15px;
            background: var(--color-surface-sunken);
            border-radius: 6px;
            border: 1px solid var(--color-border);
        }

        .releve-final-label {
            font-size: 1rem;
            color: var(--color-text-muted);
            font-weight: 600;
        }

        .releve-final-value {
            font-size: 1.2rem;
            color: var(--color-text-muted);
            font-weight: 700;
            font-family: var(--font-mono);
        }

        .loading-spinner {
            text-align: center;
            padding: 40px;
            font-size: 1.1rem;
            color: var(--color-text-muted);
        }

        .modal-footer-releve {
            padding: 15px 20px;
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: flex-end;
            background: var(--color-surface-sunken);
            border-radius: 0 0 12px 12px;
        }

        .btn-close-modal {
            background: var(--color-text-muted);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .btn-close-modal:hover {
            background: var(--color-text-muted);
            transform: translateY(-1px);
        }

        .btn-validate-releve {
            background: var(--color-success);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
            margin-right: 10px;
        }

        .btn-validate-releve:hover:not(:disabled) {
            background: var(--color-success);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);
        }

        .btn-validate-releve:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-validate-releve.btn-validated {
            background: var(--color-text-muted);
            color: var(--color-accent-contrast);
            cursor: default;
        }

        .btn-validate-releve.btn-validated:hover {
            background: var(--color-text-muted);
            transform: none;
            box-shadow: none;
        }

        .btn-reject-releve {
            background: var(--rd-red);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
            margin-right: 10px;
        }

        .btn-reject-releve:hover:not(:disabled) {
            background: #6E1D2A;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(139, 38, 53, 0.35);
        }

        .btn-reject-releve:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-export-releve {
            background: var(--color-success);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
            margin-right: 10px;
        }

        .btn-export-releve:hover:not(:disabled) {
            background: var(--color-success);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);
        }

        .btn-export-releve:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .modal-footer-releve {
            justify-content: space-between;
        }

        @media (max-width: 768px) {
            .report-filters {
                flex-wrap: wrap;
                gap: 10px;
            }
            
            .filter-group {
                flex: 1 1 auto;
                min-width: 140px;
            }
            
            .filter-group select,
            .filter-input,
            .filter-date,
            .filter-select {
                min-width: auto;
                max-width: none;
                width: 100%;
            }
            
            .summary-cards {
                grid-template-columns: 1fr;
            }

            .pagination-container {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }

            .pagination-controls {
                justify-content: center;
                flex-wrap: wrap;
            }

            .page-numbers {
                margin: 0 4px;
            }
            
            /* Ajustements pour les colonnes Service et Pays sur mobile */
            .col-service { 
                width: 250px; 
                min-width: 220px; 
            }
            
            .col-pays { 
                width: 150px; 
                min-width: 120px; 
            }
            
            .service-text, .country-text {
                font-size: 0.85rem;
            }
        }
        
        @media (max-width: 480px) {
            .col-service { 
                width: 200px; 
                min-width: 180px; 
            }
            
            .col-pays { 
                width: 120px; 
                min-width: 100px; 
            }
            
            .service-text, .country-text {
                font-size: 0.8rem;
            }
        }

        /* Reject Releve Dialog Styles - Modern native dialog design */
        /* Centrage déterministe : le dialog est positionné en fixed sur toute la
           fenêtre (inset: 0) puis centré via les marges auto. Indispensable car
           les marges auto seules collent le dialog en haut quand le contenu est haut. */
        .reject-dialog {
            padding: 0; 
            border: 0; 
            border-radius: 14px; 
            width: min(540px, 94vw);
            max-width: 94vw;
            margin: auto;
            max-height: 90vh; 
            overflow: hidden; 
            box-shadow: 0 20px 50px rgba(0,0,0,.3);
            background: var(--rd-surface);
            font-family: inherit;
        }

        /* Layout en colonne pour que le header/footer restent visibles
           et que seul le corps défile. */
        .reject-dialog[open] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            display: flex;
            flex-direction: column;
            margin: auto;
            max-height: 90vh;
        }

        .reject-dialog::backdrop {
            background: rgba(20, 25, 35, 0.55);
            backdrop-filter: blur(2px);
        }

        .reject-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 20px;
            border-bottom: 1px solid var(--rd-border);
            background: var(--rd-surface2);
        }

        .reject-title {
            margin: 0;
            font-size: 1.05rem;
            font-weight: 600;
            color: var(--rd-navy);
        }

        .reject-close {
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 1.1rem;
            line-height: 1;
            padding: 4px 8px;
            border-radius: 6px;
            color: var(--rd-text2);
        }

        .reject-close:hover:not(:disabled) {
            background: var(--rd-red-l);
            color: var(--rd-red);
        }

        .reject-body {
            flex: 1 1 auto;
            min-height: 0;
            padding: 18px 20px;
            overflow-y: auto;
        }

        .reject-summary-label {
            display: block;
            font-size: 0.78rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--rd-text2);
            margin-bottom: 8px;
        }

        .reject-summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px 16px;
            padding: 12px 14px;
            border: 1px solid var(--rd-border);
            border-radius: 10px;
            background: var(--rd-bg);
        }

        .reject-summary-item {
            font-size: 0.85rem;
            color: var(--rd-text1);
            overflow-wrap: anywhere;
        }

        .reject-warning {
            margin: 14px 0 4px;
            padding: 10px 12px;
            border-left: 3px solid var(--rd-red);
            border-radius: 6px;
            background: var(--rd-red-l);
            color: var(--rd-red);
            font-size: 0.83rem;
            line-height: 1.45;
        }

        .reject-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 16px;
        }

        .reject-label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--rd-text1);
        }

        .reject-input {
            width: 100%;
            box-sizing: border-box;
            padding: 9px 11px;
            border: 1px solid var(--rd-border2);
            border-radius: 8px;
            background: var(--color-surface);
            font-size: 0.88rem;
            font-family: inherit;
            color: var(--rd-text1);
        }

        .reject-input:focus {
            outline: none;
            border-color: var(--rd-red-m);
            box-shadow: 0 0 0 3px rgba(196, 86, 106, 0.18);
        }

        .reject-textarea {
            resize: vertical;
            min-height: 88px;
        }

        .reject-hint-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .reject-error {
            color: var(--rd-red);
            font-size: 0.78rem;
        }

        .reject-counter {
            margin-left: auto;
            font-size: 0.75rem;
            color: var(--rd-text2);
        }

        .reject-error-banner {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-top: 16px;
            padding: 10px 12px;
            border: 1px solid var(--rd-red-m);
            border-radius: 8px;
            background: var(--rd-red-l);
            color: var(--rd-red);
            font-size: 0.82rem;
        }

        .reject-error-banner-title {
            font-weight: 600;
        }

        .reject-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 14px 20px;
            border-top: 1px solid var(--rd-border);
            background: var(--rd-surface2);
        }

        .btn-cancel-reject,
        .btn-confirm-reject {
            border: none;
            padding: 9px 18px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.88rem;
            font-weight: 600;
            font-family: inherit;
            transition: all 0.2s ease;
        }

        .btn-cancel-reject {
            background: var(--rd-border);
            color: var(--rd-text1);
        }

        .btn-cancel-reject:hover:not(:disabled) {
            background: var(--rd-border2);
        }

        .btn-confirm-reject {
            background: var(--rd-red);
            color: var(--color-nav-text);
        }

        .btn-confirm-reject:hover:not(:disabled) {
            background: #6E1D2A;
        }

        .btn-cancel-reject:disabled,
        .btn-confirm-reject:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .required { 
            color: var(--rd-red); 
            margin-left: 2px; 
        }

        @media (max-width: 480px) { 
            .reject-summary-grid { 
                grid-template-columns: 1fr; 
            } 
        }
    `]
})
export class ReconciliationReportComponent implements OnInit, OnDestroy {
    private readonly resultsModuleName = 'Résultats';
    glpiBaseUrl = 'https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php?id='
    
    // Propriétés de pagination
    currentPage = 1;
    itemsPerPage = 15;
    totalPages = 0;
    paginatedData: ReconciliationReportData[] = [];
    response: ReconciliationResponse | null = null;
    private subscription = new Subscription();
    private loadedFromDb = false;
    isLoadingDbReport = false;
    dbLoadError: string | null = null;
    isLoadingMoreDbReport = false;
    isLoadingLiveDetails = false;
    private liveReportGeneration = 0;
    private lastAppliedSummaryKey = '';
    private agencyStatsIndex: Map<string, { matches: number; boOnly: number; mismatches: number; partnerOnly: number }> | null = null;
    private partnerOnlyWithoutAgencyCount = 0;
    private partnerOnlyWithAgencyServiceInIndex = false;
    private dbLoadToken = 0;
    private lastDbReportFetchKey = '';
    currentSource: 'live' | 'db' = 'db';
    private hasSummary = false;

reportData: ReconciliationReportData[] = [];
    filteredReportData: ReconciliationReportData[] = [];
    kpiScopeData: ReconciliationReportData[] = [];
    kpiSummary = {
        lineCount: 0,
        agencies: 0,
        services: 0,
        averageMatchRate: 0,
        inProgressDiscrepancies: 0,
        totalTransactions: 0,
        totalVolume: 0
    };
    
    selectedAgencies: string[] = [];
    selectedServices: string[] = [];
    selectedCountries: string[] = [];
    selectedDateDebut: string = '';
    selectedDateFin: string = '';
    selectedStatuses: string[] = [];
    selectedTraitements: string[] = [];
    selectedEnvs: string[] = [];
    ticketIdFilter: string = '';
    activeCardFilter: 'inProgress' | 'treated' | 'ticketsToCreate' | null = null;
    /** Filtre au clic sur l'en-tête : lignes avec écarts BO ou Partenaire > 0 */
    activeEcartColumnFilter: 'boOnly' | 'partnerOnly' | null = null;

    agenceSearchCtrl = new FormControl('');
    serviceSearchCtrl = new FormControl('');
    paysSearchCtrl = new FormControl('');
    filteredAgenciesDropdown: string[] = [];
    filteredServicesDropdown: string[] = [];
    filteredCountriesDropdown: string[] = [];

    @ViewChild('agenceSelect') agenceSelect?: MatSelect;
    @ViewChild('serviceSelect') serviceSelect?: MatSelect;
    @ViewChild('paysSelect') paysSelect?: MatSelect;
    @ViewChild('statusSelect') statusSelect?: MatSelect;
    @ViewChild('traitementSelect') traitementSelect?: MatSelect;
    @ViewChild('envSelect') envSelect?: MatSelect;
    /** Par défaut false = afficher uniquement le mois en cours ; true = tout afficher */
    showAllMonths = false;
    
    // Sélection multiple pour changement de statut
    selectedRows: Set<ReconciliationReportData> = new Set();
    bulkStatusSelection: string = '';
    bulkTraitementSelection: string = '';
    private autoSelectAllOnNextPagination = false;
    private hasUserSelectionChanged = false;

    uniqueAgencies: string[] = [];
    uniqueServices: string[] = [];
    uniqueCountries: string[] = [];
    uniqueDates: string[] = [];
    uniqueStatuses: string[] = [];
    uniqueEnvs: string[] = [];
    filteredAgencies: string[] = []; // Agences filtrées selon le pays / ENV sélectionnés
    filteredServices: string[] = []; // Services filtrés selon pays, agence et ENV
    filteredCountries: string[] = []; // Pays proposés selon agences / ENV (dropdown cloisonné)

    statusOptions: string[] = ['OK', 'NOK', 'REPORTING INCOMPLET', 'REPORTING INDISPONIBLE', 'EN COURS.....'];
    commentOptions: string[] = ['ECARTS TRANSMIS', "PAS D'ECARTS CONSTATES", 'NOK'];
    traitementOptions: string[] = ['Niveau Support', 'Responsable CDO', 'Niveau GROUP', 'Terminé'];
    /** Valeurs de traitement proposées dans le filtre (cloisonnées selon les autres filtres actifs). */
    filteredTraitementOptions: string[] = [];
    private readonly legacyTraitementGroup = 'Niveau Group';
    private readonly traitementNiveauGroup = 'Niveau GROUP';
    private readonly defaultOkTraitement = 'Responsable CDO';

    // Cache profils pour validation niveaux
    private profilsCache: Map<string, number> = new Map(); // nom -> id
    private profilsLoaded = false;

    /** Charge la liste des profils pour mapping nom -> id */
    private async loadProfilsCache(): Promise<void> {
        if (this.profilsLoaded) return;
        try {
            const profils = await firstValueFrom(this.profilService.getProfils());
            this.profilsCache.clear();
            for (const p of profils) {
                if (p.id && p.nom) {
                    this.profilsCache.set(p.nom, p.id);
                }
            }
            this.profilsLoaded = true;
        } catch (err) {
            console.warn('Impossible de charger les profils pour validation niveaux:', err);
        }
    }

    /** Récupère l'ID du profil par son nom */
    private getProfilIdByNom(nom: string): number | undefined {
        return this.profilsCache.get(nom);
    }

    /** Récupère le profil de l'utilisateur courant */
    private getCurrentUserProfil(): string | null {
        return this.appStateService.getUserRights()?.profil || null;
    }

    /** Vérifie si l'utilisateur courant peut valider au niveau suivant pour un pays donné */
    private async canUserValidateNextLevel(paysCode: string, currentTraitement: string): Promise<boolean> {
        // Admin bypass
        if (this.appStateService.isAdmin()) return true;

        // Charger profils si pas fait
        await this.loadProfilsCache();

        const userProfilNom = this.getCurrentUserProfil();
        if (!userProfilNom) return false;

        const userProfilId = this.getProfilIdByNom(userProfilNom);
        if (!userProfilId) return false;

        // Trouver le niveau suivant dans la config
        const nextNiveau = this.niveauxValidationConfig.findNextNiveau(paysCode, currentTraitement);
        if (!nextNiveau) return false;

        // Vérifier autorisation
        return this.niveauxValidationConfig.isProfilAutorisePourNiveau(paysCode, nextNiveau.valeur, userProfilId);
    }

    /** Récupère le prochain traitement configuré pour un pays */
    private getNextTraitement(paysCode: string, currentTraitement: string): string | undefined {
        const nextNiveau = this.niveauxValidationConfig.findNextNiveau(paysCode, currentTraitement);
        return nextNiveau?.valeur;
    }

    /** Récupère le statut associé au prochain niveau */
    private getNextStatut(paysCode: string, currentTraitement: string): string | undefined {
        const nextNiveau = this.niveauxValidationConfig.findNextNiveau(paysCode, currentTraitement);
        return nextNiveau?.statutAssocie;
    }
    
    private normalizeTraitementValue(traitement?: string | null): string {
        const value = (traitement || '').trim();
        if (value === this.legacyTraitementGroup) {
            return this.traitementNiveauGroup;
        }
        return value;
    }

    /** Traitement effectif affiché / filtrable (recalculé comme dans le tableau). */
    private getEffectiveTraitementValue(item: ReconciliationReportData): string {
        const normalized = this.normalizeTraitementValue(item.traitement);
        if (item.status === 'OK') {
            return this.isPreservedTraitementOnOk(item) ? normalized : this.defaultOkTraitement;
        }

        const totalEcarts =
            (Number(item.boOnly) || 0) +
            (Number(item.partnerOnly) || 0) +
            (Number(item.mismatches) || 0);
        const traitementAttendu = totalEcarts > 0 ? 'Niveau Support' : this.defaultOkTraitement;
        const preserveAdvanced =
            normalized === 'Terminé' || normalized === this.traitementNiveauGroup;
        return preserveAdvanced ? normalized : traitementAttendu;
    }

    /**
     * Relevé clôturé par le Responsable CDO (Niveau GROUP ou au-delà) pour ce périmètre.
     */
    private isReleveScopeCdoValidated(item: ReconciliationReportData): boolean {
        const scopeLines = this.reportData.filter(line =>
            line.status === 'OK' && this.isSameReleveScope(line, item)
        );
        if (scopeLines.length === 0) {
            return false;
        }
        const unlockedLines = scopeLines.filter(line => !this.isRowLocked(line));
        if (unlockedLines.length === 0) {
            return true;
        }
        return unlockedLines.every(line => {
            const normalized = this.normalizeTraitementValue(line.traitement);
            return normalized === this.traitementNiveauGroup || normalized === 'Terminé';
        });
    }

    /**
     * Relevé entièrement clôturé (Niveau GROUP → Terminé) pour ce périmètre.
     */
    private isReleveScopeValidated(item: ReconciliationReportData): boolean {
        const scopeLines = this.reportData.filter(line =>
            line.status === 'OK' && this.isSameReleveScope(line, item)
        );
        if (scopeLines.length === 0) {
            return false;
        }
        const unlockedLines = scopeLines.filter(line => !this.isRowLocked(line));
        if (unlockedLines.length === 0) {
            return true;
        }
        return unlockedLines.every(line => this.normalizeTraitementValue(line.traitement) === 'Terminé');
    }

    /** Conserve Niveau GROUP (CDO) ou Terminé (GROUP) selon l'état du relevé. */
    private isPreservedTraitementOnOk(item: ReconciliationReportData): boolean {
        const normalized = this.normalizeTraitementValue(item.traitement);
        if (normalized === 'Terminé' && this.isReleveScopeValidated(item)) {
            return true;
        }
        if (normalized === this.traitementNiveauGroup && this.isReleveScopeCdoValidated(item)) {
            return true;
        }
        return false;
    }

    /** Options de traitement autorisées selon l'état de validation du relevé. */
    getTraitementOptionsForItem(item: ReconciliationReportData): string[] {
        if (item.status === 'OK' && !this.isReleveScopeCdoValidated(item)) {
            const totalEcarts =
                (Number(item.boOnly) || 0) +
                (Number(item.partnerOnly) || 0) +
                (Number(item.mismatches) || 0);
            if (totalEcarts > 0) {
                return ['Niveau Support', this.defaultOkTraitement];
            }
            return [this.defaultOkTraitement];
        }
        if (item.status === 'OK' && this.isReleveScopeCdoValidated(item) && !this.isReleveScopeValidated(item)) {
            return [this.traitementNiveauGroup, 'Terminé'];
        }
        return this.traitementOptions;
    }
    // Propriétés pour l'édition en ligne
    editingRow: ReconciliationReportData | null = null;
    originalData: ReconciliationReportData | null = null;
    
    // Propriété pour l'édition directe du traitement (comme dans banque)
    editingTraitementRow: ReconciliationReportData | null = null;
    
    // Flag pour éviter les recalculs automatiques lors des modifications manuelles
    private isManuallyEditingEcart: boolean = false;
    
    // Propriété pour l'édition directe du statut
    editingStatusRow: ReconciliationReportData | null = null;
    
    // Propriété pour contrôler l'affichage de la colonne Actions
    showActionsColumn = false;

    /** Lignes avec panneau « historique » déplié */
    private readonly expandedAuditRowIds = new Set<number>();
    /** Cache historique audit par id result8rec */
    readonly auditHistoryCache = new Map<number, Result8RecAuditEntry[]>();
    private readonly auditHistoryLoadingIds = new Set<number>();

    readonly auditSnapshotTraitementClass = traitementAuditPillClassFn;
    readonly auditSnapshotStatutClass = statutAuditPillClassFn;

    /** Affiche Nouvelle ligne, Tableau de bord et Remboursement (masqués par défaut). */
    showExtendedReportActions = false;

    // Propriétés pour le modal de relevé
    isReleveModalVisible = false;
    releveData: ReconciliationReportData | null = null;
    releveEcartData: any[] = [];
    releveEcartDataJ1: any[] = []; // Écarts plateforme Partenaire, date veille (J-1)
    isLoadingReleve = false;
    isValidatingReleve = false;
    isReleveValidated = false; // Indique si le relevé a été validé
    @ViewChild('releveExportContent') releveExportContentRef!: ElementRef<HTMLDivElement>;
    @ViewChild('rejectDialog') rejectDialogRef?: ElementRef<HTMLDialogElement>;

    // Propriétés pour le modal de rejet de relevé
    isRejectReleveModalVisible = false;
    rejectReleveReason: string = '';
    rejectReleveOtherReason: string = '';
    rejectReleveCommentaire: string = '';
    rejectErrorMessage: string = '';
    isRejectingReleve = false;
    rejectFormSubmitted = false;
    
    // Propriétés pour les données manuelles d'écart traité
    releveManualNombre: number = 0;
    releveManualVolume: number = 0;
    isReleveManualFileLoading = false;
    isSavingReleveManualData = false;
    hasPendingReleveManualChanges = false;

    // Propriétés pour Trx remboursé (saisie manuelle)
    releveRembourseNombre: number = 0;
    releveRembourseVolume: number = 0;
    isReleveRembourseFileLoading = false;

    // Propriétés pour Trx annulé (saisie manuelle)
    releveAnnuleNombre: number = 0;
    releveAnnuleVolume: number = 0;
    isReleveAnnuleFileLoading = false;

    // Environnement du relevé : même liste que /ecart-bo-summary (envCode), T-E = agrégat
    releveEnv: string = 'T-E';
    /** Dernier ENV pour lequel le relevé a été chargé avec succès (annulation si aucune ligne OK). */
    private releveEnvLastValid: string = 'T-E';
    /** Liste ENV : RECONCILIATION_ENV_OPTIONS (BET, HT, T-E, HUBAO, TOP20, GU3) */
    readonly envOptions: string[] = [...RECONCILIATION_ENV_OPTIONS];

    // Pays autorisés pour le cloisonnement
    private allowedCountryCodes: string[] | null = null;
    /** false tant que le cloisonnement pays n'a pas été résolu (évite un tableau vide transitoire). */
    private allowedCountriesResolved = false;
    /** Card magique (pattern / fichier) dont le rapport doit afficher les données. */
    magicReportService = '';
    magicReportPartnerFile = '';
    /** Liste des services (cards) sélectionnés pour le rapport : on affiche ces réconciliations uniquement. */
    magicReportServices: string[] = [];
    private readonly DEFAULT_STATUS = 'EN COURS.....';

    // Gestion des sauvegardes automatiques de l'ID TICKET
    private glpiAutoSaveTimers = new WeakMap<ReconciliationReportData, ReturnType<typeof setTimeout>>();
    private lastSavedGlpiIds = new WeakMap<ReconciliationReportData, string>();
    
    // Limiteur / file d'attente pour éviter les rafales (429)
    private readonly RESULT8REC_MAX_CONCURRENCY = 1;
    private result8RecInFlight = 0;
    private result8RecQueue: Array<() => void> = [];
    
    // Debug logs désactivés par défaut (activer via localStorage.setItem('debugReconciliation','1'))
    private readonly debugReconciliation =
        typeof localStorage !== 'undefined' && localStorage.getItem('debugReconciliation') === '1';
    
    // Anti-spam popup erreurs autosave
    private lastGlpiAutoSaveErrorAt = 0;

    // Ouverture automatique du relevé depuis le dashboard
    private pendingReleveFromDashboard: { country: string; service: string; date: string; env: string | null } | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private http: HttpClient,
        private appStateService: AppStateService,
        private reconciliationSummaryService: ReconciliationSummaryService,
        private reconciliationTabsService: ReconciliationTabsService,
        private reconciliationService: ReconciliationService,
        private exportService: ExportOptimizationService,
        private popupService: PopupService,
        private paysService: PaysService,
        private ecartBoSummaryService: EcartBoSummaryService,
        private logger: LoggerService,
        private translate: TranslateService,
        private niveauxValidationConfig: NiveauxValidationConfigService,
        private profilService: ProfilService
    ) {
        // Initialiser filteredReportData pour éviter les erreurs
        this.filteredReportData = [];
        this.kpiScopeData = [];
        // Charger les pays autorisés
        this.loadAllowedCountries();
    }

    private translateKey(key: string, params?: Record<string, unknown>): string {
        const value = params
            ? this.translate.instant(key, params as never)
            : this.translate.instant(key);
        return typeof value === 'string' ? (value as string) : key;
    }

    private debugLog(...args: any[]): void {
        if (this.debugReconciliation) {
            this.logger.log(...args);
        }
    }

    private debugWarn(...args: any[]): void {
        if (this.debugReconciliation) {
            this.logger.warn(...args);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private buildResultsHeaders(extraHeaders?: Record<string, string>): HttpHeaders {
        return new HttpHeaders({
            'X-Permission-Module': this.resultsModuleName,
            ...(extraHeaders ?? {})
        });
    }

    private queueResult8RecRequest<T>(requestFactory: () => Observable<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const run = () => {
                this.result8RecInFlight++;
                let settled = false;

                const cleanup = () => {
                    if (settled) return;
                    settled = true;
                    this.result8RecInFlight = Math.max(0, this.result8RecInFlight - 1);
                    const next = this.result8RecQueue.shift();
                    if (next) next();
                };

                requestFactory().subscribe({
                    next: (value) => resolve(value),
                    error: (err) => {
                        cleanup();
                        reject(err);
                    },
                    complete: () => {
                        cleanup();
                    }
                });
            };

            if (this.result8RecInFlight < this.RESULT8REC_MAX_CONCURRENCY) {
                run();
            } else {
                this.result8RecQueue.push(run);
            }
        });
    }

    /** Notifie les écrans consommateurs (ex. rapport BO/Partenaire) qu'une ligne result8rec a changé. */
    private notifyResult8RecUpdated(): void {
        this.appStateService.notifyDataUpdate();
    }

    private async putResult8RecWithRetry<T>(
        id: number,
        payload: any,
        options?: { maxRetries?: number; baseDelayMs?: number }
    ): Promise<T> {
        const url = `/api/result8rec/${id}`;
        const maxRetries = options?.maxRetries ?? 3;
        const baseDelayMs = options?.baseDelayMs ?? 400;

        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                return await this.queueResult8RecRequest<T>(() =>
                    this.http.put<T>(url, payload, { headers: this.buildResultsHeaders() })
                );
            } catch (err: any) {
                const status = err?.status;
                if (status === 429 && attempt < maxRetries) {
                    const delay = Math.min(6000, baseDelayMs * Math.pow(2, attempt)) + Math.floor(Math.random() * 200);
                    this.debugWarn(`⏳ 429 sur ${url} - retry dans ${delay}ms (tentative ${attempt + 1}/${maxRetries})`);
                    await this.sleep(delay);
                    attempt++;
                    continue;
                }
                throw err;
            }
        }
    }

    private liveContextDetected = false;
    private initialDbLoadStarted = false;
    private filterListsDeferred = false;
    private static readonly DB_DATE_FETCH_CONCURRENCY = 4;

    ngOnInit() {
        this.initSearchSubscriptions();

        this.reportData = [];
        this.filteredReportData = [];
        this.kpiScopeData = [];
        this.resetSelectionForAuto();
        this.loadedFromDb = false;
        this.currentSource = null;
        this.liveContextDetected = false;
        this.initialDbLoadStarted = false;
        this.filterListsDeferred = false;
        this.lastAppliedSummaryKey = '';
        this.allowedCountriesResolved = false;
        this.applyMagicContextFromRoute();

        this.route.queryParams.pipe(take(1)).subscribe(params => {
            const country = params['country'];
            const service = params['service'];
            const date = params['date'];
            const env = params['env'];
            const openReleve = params['openReleve'];

            if (env && env !== 'ALL') {
                this.releveEnv = this.normalizeReleveEnvKey(env);
            }

            if (country && service && date && openReleve === '1') {
                this.pendingReleveFromDashboard = { country, service, date, env: env || null };
            }
        });

        const summary = this.reconciliationSummaryService.getAgencySummary();
        const response = this.appStateService.getCurrentReconciliationResults();
        const hasLiveContext = this.hasMeaningfulLiveContext(summary, response);
        this.liveContextDetected = hasLiveContext;
        if (!hasLiveContext) {
            this.initialDbLoadStarted = true;
        }

        const summaryStream = hasLiveContext
            ? this.reconciliationSummaryService.agencySummary$.pipe(skip(1))
            : this.reconciliationSummaryService.agencySummary$;

        this.subscription.add(
            summaryStream.pipe(
                distinctUntilChanged((a, b) => this.getSummaryKey(a) === this.getSummaryKey(b))
            ).subscribe(summary => {
                if (summary && summary.length > 0) {
                    this.liveContextDetected = true;
                    this.currentSource = 'live';
                    void this.applySummaryLiveReport(summary).then(() => this.fallbackToDatabaseIfEmpty());
                } else {
                    void this.fallbackToDatabaseIfEmpty();
                }
            })
        );

        this.subscription.add(
            this.appStateService.getReconciliationResults().pipe(
                distinctUntilChanged((a, b) => {
                    const idA = a?.progressSessionId || '';
                    const idB = b?.progressSessionId || '';
                    return idA === idB && (a?.totalMatches ?? 0) === (b?.totalMatches ?? 0);
                }),
                skip(hasLiveContext ? 1 : 0)
            ).subscribe(response => {
                if (!response) {
                    if (
                        !this.liveContextDetected &&
                        !this.loadedFromDb &&
                        this.currentSource !== 'live' &&
                        !this.initialDbLoadStarted
                    ) {
                        this.initialDbLoadStarted = true;
                        this.loadSavedReportFromDatabase();
                    }
                    return;
                }
                this.liveContextDetected = true;
                if (this.hasSummary && this.reportData.length > 0) {
                    this.response = response;
                    return;
                }
                void this.applyLiveReconciliationResponse(response).then(() => this.fallbackToDatabaseIfEmpty());
            })
        );

        this.bootstrapReportOnInit(hasLiveContext, summary, response);
    }

    /**
     * Applique le contexte de réconciliation magique reçu par la route (query params).
     * Formats reçus depuis /results :
     *   - magicServices=A,B,C   : liste des services (cards) sélectionnés à afficher dans le rapport
     *   - magicService=X         : service actif (rétrocompat)
     *   - magicPartnerFile=PF    : fichier partenaire actif
     */
    private applyMagicContextFromRoute(): void {
        try {
            const params = this.route.snapshot.queryParamMap;
            const services = (params.get('magicServices') || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            const service = (params.get('magicService') || '').trim();
            const partnerFile = (params.get('magicPartnerFile') || '').trim();

            if (services.length > 0) {
                this.magicReportServices = services;
                this.magicReportService = services[0];
            } else if (service) {
                this.magicReportServices = [service];
                this.magicReportService = service;
            }

            if (partnerFile) {
                this.magicReportPartnerFile = partnerFile;
            }

            if (service) {
                this.appStateService.setSelectedMagicService(service);
            }
            if (partnerFile) {
                this.appStateService.setSelectedMagicPartnerFile(partnerFile);
            }
            if (this.magicReportService || partnerFile) {
                this.reconciliationTabsService.setMagicViewContext(
                    this.magicReportService,
                    partnerFile
                );
            }
        } catch (err) {
            this.debugLog('applyMagicContextFromRoute erreur:', err);
        }
    }

    /** Chaîne ngOnInit : live (résumé / onglets / réponse) ou BDD, puis filterReport → updatePagination. */
    private bootstrapReportOnInit(
        hasLiveContext: boolean,
        summary: AgencySummaryData[],
        response: ReconciliationResponse | null
    ): void {
        if (hasLiveContext) {
            this.currentSource = 'live';
            this.autoSelectAllOnNextPagination = true;
            if (summary.length > 0) {
                void this.applySummaryLiveReport(summary).then(() => this.fallbackToDatabaseIfEmpty());
            } else if (response) {
                void this.applyLiveReconciliationResponse(response).then(() => this.fallbackToDatabaseIfEmpty());
            } else {
                void this.applySummaryLiveReport([]).then(() => this.fallbackToDatabaseIfEmpty());
            }
            return;
        }

        this.initialDbLoadStarted = true;
        void this.loadSavedReportFromDatabase();
    }

    /**
     * Contexte « en cours » exploitable : résumé, onglets ou réponse avec des volumes réels.
     * Évite de bloquer le chargement BDD à cause d'une réponse vide laissée en mémoire.
     */
    private hasMeaningfulLiveContext(
        summary: AgencySummaryData[],
        response: ReconciliationResponse | null
    ): boolean {
        if (this.isMagicScopeActive() && this.appStateService.getMagicServiceSummaries()?.length) {
            return true;
        }
        if (summary?.length > 0) {
            return true;
        }
        if (this.hasTabsDetailData()) {
            return true;
        }
        return this.hasUsableLiveResponse(response);
    }

    private hasUsableLiveResponse(response: ReconciliationResponse | null): boolean {
        if (!response) {
            return false;
        }
        const total =
            (response.totalMatches ?? 0) +
            (response.totalBoOnly ?? 0) +
            (response.totalPartnerOnly ?? 0) +
            (response.totalMismatches ?? 0);
        if (total > 0) {
            return true;
        }
        return (
            (response.matches?.length ?? 0) +
            (response.boOnly?.length ?? 0) +
            (response.partnerOnly?.length ?? 0) +
            (response.mismatches?.length ?? 0)
        ) > 0;
    }

    /** Si le mode live n'a produit aucune ligne, basculer sur result8rec en base. */
    private async fallbackToDatabaseIfEmpty(): Promise<void> {
        if (this.reportData.length > 0 || this.isLoadingDbReport || this.isLoadingLiveDetails) {
            return;
        }
        // En mode réconciliation magique, le rapport est cloisonné sur la card sélectionnée :
        // ne pas basculer sur la base (elle contiendrait les services hors card).
        if (this.isMagicScopeActive()) {
            return;
        }
        if (this.loadedFromDb && this.lastDbReportFetchKey) {
            return;
        }
        this.liveContextDetected = false;
        this.hasSummary = false;
        this.currentSource = 'db';
        this.initialDbLoadStarted = true;
        await this.loadSavedReportFromDatabase();
    }

    /**
     * Affiche le tableau immédiatement (filterReport → paginatedData),
     * puis enrichit les listes de filtres en arrière-plan si demandé.
     */
    private refreshReportView(options?: { deferFilterLists?: boolean }): void {
        if (options?.deferFilterLists) {
            this.filterReport();
            if (!this.filterListsDeferred) {
                this.filterListsDeferred = true;
                queueMicrotask(() => {
                    this.extractUniqueValues();
                    this.filterListsDeferred = false;
                });
            }
            return;
        }
        this.extractUniqueValues();
        this.filterReport();
    }

    private hasTabsDetailData(): boolean {
        const detailCount =
            (this.reconciliationTabsService.getFilteredMatches()?.length ?? 0) +
            (this.reconciliationTabsService.getFilteredBoOnly()?.length ?? 0) +
            (this.reconciliationTabsService.getFilteredPartnerOnly()?.length ?? 0) +
            (this.reconciliationTabsService.getFilteredMismatches()?.length ?? 0);
        return detailCount > 0;
    }

    private hydrateResponseFromTabs(): void {
        if (!this.response) {
            return;
        }
        const matches = this.scopeMatchesToMagic(this.reconciliationTabsService.getFilteredMatches());
        const boOnly = this.scopeRecordsToMagic(this.reconciliationTabsService.getFilteredBoOnly());
        const partnerOnly = this.scopeRecordsToMagic(this.reconciliationTabsService.getFilteredPartnerOnly());
        const mismatches = this.scopeRecordsToMagic(this.reconciliationTabsService.getFilteredMismatches());
        if (!matches?.length && !boOnly?.length && !partnerOnly?.length && !mismatches?.length) {
            return;
        }
        this.response = {
            ...this.response,
            matches: matches?.length ? matches : this.response.matches,
            boOnly: boOnly?.length ? boOnly : this.response.boOnly,
            partnerOnly: partnerOnly?.length ? partnerOnly : this.response.partnerOnly,
            mismatches: mismatches?.length ? mismatches : this.response.mismatches,
            resultsPaginated: false
        };
    }

    private getSummaryKey(summary: AgencySummaryData[]): string {
        return summary
            .map(item => `${item.agency}|${item.service}|${item.country}|${item.recordCount}|${item.totalVolume}|${item.matches ?? ''}|${item.boOnly ?? ''}`)
            .join(';;');
    }

    private summaryHasDetailedBreakdown(summary: AgencySummaryData[]): boolean {
        if (!summary.length || !summary.every(item => item.matches !== undefined && item.boOnly !== undefined)) {
            return false;
        }
        // Un résumé "précalculé" avec matches=0 partout alors que la réconciliation a des correspondances
        // est incomplet (souvent généré avant le chargement des matches paginés).
        return !this.isAgencySummaryIncomplete(summary);
    }

    private isAgencySummaryIncomplete(summary: AgencySummaryData[]): boolean {
        if (!summary?.length) {
            return true;
        }
        // En mode magique, on compare aux totaux du service de la card sélectionnée,
        // pas aux totaux globaux de la réponse (qui mélangent tous les services).
        const expectedMatches = this.isMagicScopeActive()
            ? this.getMagicScopeExpectedTotals().matches
            : (this.response?.totalMatches ?? 0);
        if (expectedMatches <= 0) {
            return false;
        }
        const matchesInSummary = summary.reduce((sum, item) => sum + (Number(item.matches) || 0), 0);
        // Tolérance: si le résumé ignore totalement les correspondances, forcer une re-agrégation serveur.
        return matchesInSummary === 0;
    }

    private needsAgencySummaryAggregation(): boolean {
        const summary = this.reconciliationSummaryService.getAgencySummary();
        if (summary.length > 0 && this.summaryHasDetailedBreakdown(summary)) {
            return false;
        }
        if (this.hasTabsDetailData() && !this.isAgencySummaryIncomplete(summary)) {
            return false;
        }
        return this.needsPaginatedDetailLoad(this.response) || this.isAgencySummaryIncomplete(summary);
    }

    /**
     * Agrège le résumé par agence sans charger tout le dataset en mémoire (gros volumes paginés).
     */
    private async ensureAgencySummaryForReport(): Promise<AgencySummaryData[] | null> {
        const existing = this.reconciliationSummaryService.getAgencySummary();

        // En mode magique multi-services, le résumé local est un ROLLUP de card
        // (`agency === service`) : il porte les totaux du service mais pas le détail par
        // agence des correspondances. `summaryHasDetailedBreakdown` le juge pourtant
        // "complet" (matches renseignés et non nuls), donc le retour antérieur
        //court-circuitait l'agrégation serveur et le rapport affichait le total du
        // service en une seule ligne au lieu du détail par agence.
        //
        // Or le détail par agence n'existe QUE dans l'agrégation serveur
        // (loadAgencySummaryAggregated) : les matches en mémoire sont paginées, donc
        // filteredMatches est vide et filteredBoOnly ne fournit que les écarts.
        // On force donc l'agrégation serveur dès qu'une carte a été sélectionnée.
        const requiresServerAggregation = this.isMagicScopeActive()
            && this.getReportScopeServices().length > 0;

        if (!requiresServerAggregation && existing.length > 0 && this.summaryHasDetailedBreakdown(existing)) {
            const scoped = this.getEffectiveSummaryForMagic(existing);
            return scoped.length > 0 ? scoped : existing;
        }

        const sessionId =
            this.response?.progressSessionId ||
            this.reconciliationService.getCurrentJobId();

        // Toujours tenter l'agrégation serveur si le résumé local est incomplet
        // (ex: matches=0 partout alors que totalMatches > 0), ou si le périmètre
        // magique exige le détail par agence.
        const shouldForceServerAggregation =
            !!sessionId &&
            (requiresServerAggregation
                || this.isAgencySummaryIncomplete(existing)
                || this.needsPaginatedDetailLoad(this.response));

        if (!shouldForceServerAggregation) {
            return existing.length > 0 ? existing : null;
        }

        this.isLoadingLiveDetails = true;
        this.dbLoadError = null;
        try {
            const { summary, meta } = await this.reconciliationService.loadAgencySummaryAggregated(sessionId!);
            // Cloisonnement magique : l'agrégation serveur renvoie tous les services,
            // on ne conserve que la card (service) sélectionnée.
            const scopedSummary = this.getEffectiveSummaryForMagic(summary);
            if (scopedSummary.length > 0) {
                this.reconciliationSummaryService.setAgencySummary(scopedSummary, {
                    totalPartnerOnly: this.getPartnerOnlyCount(),
                    hasPartnerOnlyWithAgencyService: meta.hasPartnerOnlyWithAgencyService
                });
                this.hasSummary = true;
                return scopedSummary;
            }
            return existing.length > 0 ? existing : null;
        } catch (error) {
            console.error('Erreur agrégation résumé pour le rapport:', error);
            this.dbLoadError = this.translateKey('RPT.dbLoad.summaryError');
            return existing.length > 0 ? existing : null;
        } finally {
            this.isLoadingLiveDetails = false;
        }
    }

    private prepareStatsForSummary(summary: AgencySummaryData[]): void {
        if (this.summaryHasDetailedBreakdown(summary)) {
            this.agencyStatsIndex = null;
            return;
        }
        this.buildAgencyStatsIndex();
    }

    private needsPaginatedDetailLoad(response: ReconciliationResponse | null): boolean {
        if (!response) {
            return false;
        }
        if (this.hasTabsDetailData()) {
            return false;
        }
        if (response.resultsPaginated) {
            return true;
        }
        const detailCount =
            (response.matches?.length ?? 0) +
            (response.boOnly?.length ?? 0) +
            (response.partnerOnly?.length ?? 0) +
            (response.mismatches?.length ?? 0);
        const totalCount =
            (response.totalMatches ?? 0) +
            (response.totalBoOnly ?? 0) +
            (response.totalPartnerOnly ?? 0) +
            (response.totalMismatches ?? 0);
        return totalCount > 0 && detailCount === 0;
    }

    private async ensureLiveDetailDataLoaded(): Promise<boolean> {
        if (!this.response || !this.needsPaginatedDetailLoad(this.response)) {
            return false;
        }

        const sessionId =
            this.response.progressSessionId ||
            this.reconciliationService.getCurrentJobId();
        if (!sessionId) {
            return false;
        }

        this.isLoadingLiveDetails = true;
        this.dbLoadError = null;
        try {
            const details = await this.reconciliationService.loadAllDetailResults(sessionId);
            // Cloisonnement magique : ne conserver que les données de la card sélectionnée.
            const scopedDetails = this.isMagicScopeActive()
                ? {
                    matches: this.scopeMatchesToMagic(details.matches || []),
                    boOnly: this.scopeRecordsToMagic(details.boOnly || []),
                    partnerOnly: this.scopeRecordsToMagic(details.partnerOnly || []),
                    mismatches: this.scopeRecordsToMagic(details.mismatches || [])
                }
                : details;
            this.response = {
                ...this.response,
                ...scopedDetails,
                resultsPaginated: false
            };
            // En mode magique, ne pas écraser la réponse globale partagée (elle sert aux autres écrans).
            if (!this.isMagicScopeActive()) {
                this.appStateService.setReconciliationResults(this.response);
            }
            this.reconciliationTabsService.setFilteredMatches(scopedDetails.matches || []);
            this.reconciliationTabsService.setFilteredBoOnly(scopedDetails.boOnly || []);
            this.reconciliationTabsService.setFilteredPartnerOnly(scopedDetails.partnerOnly || []);
            this.reconciliationTabsService.setFilteredMismatches(scopedDetails.mismatches || []);

            const summary = this.buildAgencySummaryFromDetails(scopedDetails);
            if (summary.length > 0) {
                this.reconciliationSummaryService.setAgencySummary(summary);
                this.hasSummary = true;
            }
            return true;
        } catch (error) {
            console.error('Erreur chargement détails paginés pour le rapport:', error);
            this.dbLoadError = this.translateKey('RPT.dbLoad.detailsError');
            return false;
        } finally {
            this.isLoadingLiveDetails = false;
        }
    }

    private buildAgencySummaryFromDetails(
        details: Pick<ReconciliationResponse, 'matches' | 'boOnly' | 'partnerOnly' | 'mismatches'>
    ): AgencySummaryData[] {
        const summaryMap = new Map<string, AgencySummaryData>();

        const getValue = (record: Record<string, string>, keys: string[]): string => {
            for (const key of keys) {
                const originalKey = Object.keys(record).find(k =>
                    fixGarbledCharacters(k).toLowerCase() === key.toLowerCase() ||
                    k.toLowerCase() === key.toLowerCase()
                );
                if (originalKey && record[originalKey] != null && String(record[originalKey]).trim() !== '') {
                    return String(record[originalKey]);
                }
                if (record[key] != null && String(record[key]).trim() !== '') {
                    return String(record[key]);
                }
            }
            return '';
        };

        const agenceKeys = ['Agence', 'agence', 'AGENCE', 'agency', 'Agency'];
        const serviceKeys = ['Service', 'service', 'SERVICE', 'serv', 'Serv'];
        const paysKeys = ['Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'Pays provenance', 'pays provenance'];
        const dateKeys = [
            'Date opération',
            'dateOperation',
            'date_operation',
            'Date',
            'date',
            'DATE',
            'jour',
            'Jour',
            'JOUR',
            'dateTransaction',
            'DateTransaction'
        ];
        const amountKeys = ['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'AMOUNT', 'volume', 'Volume', 'VOLUME'];

        const addRecord = (
            record: Record<string, string>,
            kind: 'matches' | 'boOnly' | 'mismatches' | 'partnerOnly'
        ) => {
            const agency = getValue(record, agenceKeys) || 'Inconnue';
            const service = getValue(record, serviceKeys) || 'Inconnu';
            const rawCountry = getValue(record, paysKeys);
            const country = rawCountry ? (countryNameFromCode(rawCountry.trim()) || rawCountry.trim()) : 'Inconnu';
            const date = getValue(record, dateKeys) || new Date().toISOString().split('T')[0];
            // Important: le rapport est par jour — inclure la date évite de fusionner plusieurs dates.
            const day = this.formatDateForSearch(date);
            const key = `${agency}-${service}-${country}-${day}`;

            if (!summaryMap.has(key)) {
                summaryMap.set(key, {
                    agency,
                    service,
                    country,
                    date: day,
                    totalVolume: 0,
                    recordCount: 0,
                    matches: 0,
                    boOnly: 0,
                    mismatches: 0,
                    partnerOnly: 0
                });
            }

            const summary = summaryMap.get(key)!;

            // recordCount = transactions BO (matches + boOnly + mismatches). Le partnerOnly est géré séparément.
            if (kind === 'matches' || kind === 'boOnly' || kind === 'mismatches') {
                summary.recordCount += 1;
                summary.totalVolume += this.parseAmount(getValue(record, amountKeys) || '0');
            }

            if (kind === 'matches') summary.matches = (Number(summary.matches) || 0) + 1;
            if (kind === 'boOnly') summary.boOnly = (Number(summary.boOnly) || 0) + 1;
            if (kind === 'mismatches') summary.mismatches = (Number(summary.mismatches) || 0) + 1;
            if (kind === 'partnerOnly') summary.partnerOnly = (Number(summary.partnerOnly) || 0) + 1;
        };

        (details.matches || []).forEach(match => addRecord(match.boData || {}, 'matches'));
        (details.boOnly || []).forEach(record => addRecord(record, 'boOnly'));
        (details.mismatches || []).forEach(record => addRecord(record, 'mismatches'));
        (details.partnerOnly || []).forEach(record => addRecord(record, 'partnerOnly'));

        return Array.from(summaryMap.values()).sort((a, b) => {
            if (a.agency !== b.agency) {
                return a.agency.localeCompare(b.agency);
            }
            return a.service.localeCompare(b.service);
        });
    }

    private buildFallbackSummaryFromResponseTotals(): AgencySummaryData[] {
        const magicSummaries = this.appStateService.getMagicServiceSummaries();
        if (magicSummaries?.length) {
            // Mode magique : ne produire que les lignes des cards (services) sélectionnées.
            const ctx = this.getMagicPartitionContext();
            const scopedServices = this.getReportScopeServices();
            const scoped = magicSummaries
                .filter((s: MagicServiceSummary) => {
                    if (!s.service || s.service === 'Tous') {
                        return false;
                    }
                    if (scopedServices.length > 0 && !this.isServiceInScope(s.service)) {
                        return false;
                    }
                    return !ctx.partnerFile || !s.partnerFileName || s.partnerFileName === ctx.partnerFile;
                })
                .map((s: MagicServiceSummary) => ({
                    agency: s.service,
                    service: s.service,
                    country: this.inferCountryFromMagicContext(s.service, s.partnerFileName),
                    date: new Date().toISOString().split('T')[0],
                    totalVolume: 0,
                    recordCount: s.totalBoRecords || ((s.totalMatches || 0) + (s.totalBoOnly || 0)),
                    matches: s.totalMatches || 0,
                    boOnly: s.totalBoOnly || 0,
                    partnerOnly: s.totalPartnerOnly || 0,
                    mismatches: 0
                }));
            if (scoped.length > 0) {
                return scoped;
            }
        }

        if (!this.response) {
            return [];
        }
        const boOnly = this.response.totalBoOnly ?? 0;
        const partnerOnly = this.response.totalPartnerOnly ?? 0;
        const mismatches = this.response.totalMismatches ?? 0;
        const matches = this.response.totalMatches ?? 0;
        const total = matches + boOnly + partnerOnly + mismatches;
        if (total <= 0) {
            return [];
        }

        return [{
            agency: 'Consolidé',
            service: 'Tous',
            country: '',
            date: new Date().toISOString().split('T')[0],
            totalVolume: 0,
            recordCount: total,
            matches,
            boOnly,
            partnerOnly,
            mismatches
        }];
    }

    private async applySummaryLiveReport(summary: AgencySummaryData[]): Promise<void> {
        this.currentSource = 'live';
        if (!this.hasUserSelectionChanged) {
            this.resetSelectionForAuto();
            this.autoSelectAllOnNextPagination = true;
        }

        // Renseigner la réponse AVANT de calculer le résumé effectif, sinon
        // buildAgencySummaryFromDetailDatasets ne voit que les onglets (souvent limités à
        // une seule card) et les autres cards sélectionnées perdent leur détail par agence.
        if (!this.response) {
            this.response =
                this.appStateService.getCurrentReconciliationResults() ??
                this.buildResponseSnapshotFromTabs();
        }
        this.hydrateResponseFromTabs();

        const effectiveSummary = this.getEffectiveSummaryForMagic(summary);
        const summaryKey = this.getSummaryKey(effectiveSummary);
        if (summaryKey === this.lastAppliedSummaryKey && this.reportData.length > 0) {
            return;
        }
        const generation = ++this.liveReportGeneration;

        const displaySummary = effectiveSummary.length > 0
            ? effectiveSummary
            : this.getEffectiveSummaryForMagic(this.buildFallbackSummaryFromResponseTotals());
        this.prepareStatsForSummary(displaySummary);
        this.generateReportDataFromSummary(displaySummary);
        this.lastAppliedSummaryKey = this.getSummaryKey(displaySummary);
        this.hasSummary = displaySummary.length > 0;
        this.syncLastSavedGlpiValues(this.reportData);
        this.refreshReportView({ deferFilterLists: true });

        if (generation !== this.liveReportGeneration) {
            return;
        }

        if (!this.needsAgencySummaryAggregation()) {
            this.refreshReportView();
            await this.fallbackToDatabaseIfEmpty();
            return;
        }

        const aggregated = await this.ensureAgencySummaryForReport();
        if (!aggregated || aggregated.length === 0 || generation !== this.liveReportGeneration) {
            this.refreshReportView();
            await this.fallbackToDatabaseIfEmpty();
            return;
        }

        this.prepareStatsForSummary(aggregated);
        this.generateReportDataFromSummary(aggregated);
        this.lastAppliedSummaryKey = this.getSummaryKey(aggregated);
        this.syncLastSavedGlpiValues(this.reportData);
        this.refreshReportView();
        await this.fallbackToDatabaseIfEmpty();
    }

    private async applyLiveReconciliationResponse(
        response: ReconciliationResponse,
        options?: { forceRefresh?: boolean }
    ): Promise<void> {
        if (!options?.forceRefresh && this.hasSummary && this.reportData.length > 0) {
            this.response = response;
            return;
        }
        this.response = response;
        this.currentSource = 'live';
        if (!this.hasUserSelectionChanged) {
            this.resetSelectionForAuto();
            this.autoSelectAllOnNextPagination = true;
        }

        this.hydrateResponseFromTabs();

        if (this.hasSummary && this.reportData.length > 0) {
                        // Si on a un résumé, on garde les colonnes Agence/Service/Pays du résumé
                        // mais on récupère les compteurs directement des onglets
                        
                        // Vérifier si les écarts partenaires ont une agence/service dans leurs colonnes
                        const filteredPartnerOnly = this.getPartnerOnlyDataset();
                        const hasPartnerOnlyWithAgencyService = filteredPartnerOnly.some(record => {
                            const partnerInfo = this.getPartnerOnlyAgencyAndService(record);
                            return partnerInfo.agency !== 'Inconnue' && partnerInfo.service !== 'Inconnu';
                        });
                        
                        // Variable pour suivre si on a déjà attribué les écarts partenaires sans agence/service
                        let partnerOnlyWithoutAgencyServiceAttributed = false;
                        
                        this.reportData = this.reportData.map((item, index) => {
                            const isFirstLine = index === 0;
                            const stats = this.calculateDetailedStatsForSummaryItem({
                                date: item.date,
                                agency: item.agency,
                                service: item.service,
                                country: item.country,
                                totalVolume: item.totalVolume,
                                recordCount: item.totalTransactions
                            } as any, isFirstLine, partnerOnlyWithoutAgencyServiceAttributed);
                            
                            // Marquer qu'on a attribué les écarts partenaires sans agence/service si c'était la première ligne
                            if (isFirstLine && !hasPartnerOnlyWithAgencyService && stats.partnerOnly > 0) {
                                partnerOnlyWithoutAgencyServiceAttributed = true;
                            }
                            const matchRate = stats.matchRate;
                            
                            // Utiliser la valeur partnerOnly calculée depuis les statistiques détaillées
                            const calculatedPartnerOnly = stats.partnerOnly;
                            
                            // Définir le traitement par défaut selon la présence d'écarts
                            // Convertir en nombres pour s'assurer que les valeurs sont numériques
                            const boOnlyNum = Number(stats.boOnly) || 0;
                            const partnerOnlyNum = Number(calculatedPartnerOnly) || 0;
                            const mismatchesNum = Number(stats.mismatches) || 0;
                            const totalEcarts = boOnlyNum + partnerOnlyNum + mismatchesNum;
                            
                            // Forcer le recalcul du traitement selon les écarts réels (sauf si "Terminé")
                            const traitementAttendu = totalEcarts > 0 ? 'Niveau Support' : this.defaultOkTraitement;
                            const traitementFinal = this.isPreservedTraitementOnOk(item)
                                ? this.normalizeTraitementValue(item.traitement)
                                : traitementAttendu;
                            
                            return {
                                ...item,
                                matches: stats.matches,
                                boOnly: stats.boOnly,
                                partnerOnly: calculatedPartnerOnly, // Utiliser la valeur calculée
                                mismatches: stats.mismatches,
                                // matchRate et comment seront recalculés par recalculateMatchRate
                                status: this.computeStatusFromCounts(
                                    stats.matches,
                                    stats.boOnly,
                                    calculatedPartnerOnly,
                                    stats.mismatches,
                                    item.totalTransactions
                                ),
                                traitement: traitementFinal
                            };
                        });
                        this.enforceDefaultStatusForReportData();
                        
                        // FORCER toutes les lignes avec statut OK à avoir traitement = "Responsable CDO"
                        this.enforceTraitementForOkStatus();

                        // Appliquer la règle métier de recalcul sur les lignes issues du résumé
                        this.reportData.forEach(item => {
                            // Ne pas recalculer la ligne des écarts partenaires
                            if (!this.isPartnerOnlySpecialLine(item)) {
                                this.recalculateMatchRate(item);
                                this.syncCommentWithValues(item);
                            } else {
                                // Pour la ligne des écarts partenaires, FORCER toutes les valeurs pour éviter toute modification
                                this.enforcePartnerOnlyLineValues(item);
                            }
                        });
                        
                        // Protection finale: s'assurer que toutes les lignes spéciales ont les bonnes valeurs
                        this.reportData.forEach(item => {
                            if (this.isPartnerOnlySpecialLine(item)) {
                                this.enforcePartnerOnlyLineValues(item);
                            }
                        });

                        // Si les écarts partenaires n'étaient pas disponibles au premier rendu,
                        // les récupérer maintenant et garantir la ligne spéciale (agence = service).
                        this.ensurePartnerOnlySpecialLine();
        } else {
            const summary = this.reconciliationSummaryService.getAgencySummary();
            // Si le résumé local est incomplet (matches=0 alors que totalMatches>0),
            // forcer l'agrégation serveur avant d'afficher.
            const usableSummary =
                summary.length > 0 && this.summaryHasDetailedBreakdown(summary)
                    ? summary
                    : null;
            if (usableSummary) {
                this.hasSummary = true;
                this.prepareStatsForSummary(usableSummary);
                this.generateReportDataFromSummary(usableSummary);
            } else {
                const aggregated = await this.ensureAgencySummaryForReport();
                if (aggregated && aggregated.length > 0) {
                    this.hasSummary = true;
                    this.prepareStatsForSummary(aggregated);
                    this.generateReportDataFromSummary(aggregated);
                } else if (summary.length > 0) {
                    // Fallback: résumé local même incomplet (mieux que rien)
                    this.hasSummary = true;
                    this.prepareStatsForSummary(summary);
                    this.generateReportDataFromSummary(summary);
                } else {
                    const fallback = this.buildFallbackSummaryFromResponseTotals();
                    if (fallback.length > 0) {
                        this.prepareStatsForSummary(fallback);
                        this.generateReportDataFromSummary(fallback);
                    } else {
                        this.buildAgencyStatsIndex();
                        this.generateReportData();
                    }
                }
            }
        }

        this.syncLastSavedGlpiValues(this.reportData);
        this.refreshReportView();
        await this.fallbackToDatabaseIfEmpty();
    }

    private buildResponseSnapshotFromTabs(): ReconciliationResponse | null {
        if (!this.hasTabsDetailData()) {
            return null;
        }
        const matches = this.reconciliationTabsService.getFilteredMatches() || [];
        const boOnly = this.reconciliationTabsService.getFilteredBoOnly() || [];
        const partnerOnly = this.reconciliationTabsService.getFilteredPartnerOnly() || [];
        const mismatches = this.reconciliationTabsService.getFilteredMismatches() || [];
        return {
            matches,
            boOnly,
            partnerOnly,
            mismatches,
            totalMatches: matches.length,
            totalBoOnly: boOnly.length,
            totalPartnerOnly: partnerOnly.length,
            totalMismatches: mismatches.length,
            resultsPaginated: false
        } as ReconciliationResponse;
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    private loadAllowedCountries(): void {
        const username = this.appStateService.getUsername();
        if (!username || username === 'admin') {
            // Admin a accès à tous les pays
            this.allowedCountryCodes = null;
            this.allowedCountriesResolved = true;
            console.log('🌍 Cloisonnement Frontend: Admin détecté, accès à tous les pays');
            return;
        }

        // Récupérer les pays autorisés depuis le backend
        this.paysService.getAllowedPaysCodesForCurrentUser().subscribe({
            next: (response) => {
                if (response.isGlobal) {
                    // GNL ou admin : tous les pays
                    this.allowedCountryCodes = null;
                    console.log('🌍 Cloisonnement Frontend: Utilisateur a accès à GNL (tous les pays)');
                } else {
                    // Pays spécifiques
                    this.allowedCountryCodes = response.codes || [];
                    console.log('🌍 Cloisonnement Frontend: Pays autorisés pour ' + username + ':', this.allowedCountryCodes);
                }
                this.allowedCountriesResolved = true;
                if (this.reportData.length > 0) {
                    this.filterReport();
                }
            },
            error: (error) => {
                console.error('❌ Erreur lors de la récupération des pays autorisés:', error);
                // En cas d'erreur, appliquer un filtrage strict (liste vide)
                this.allowedCountryCodes = [];
                this.allowedCountriesResolved = true;
                if (this.reportData.length > 0) {
                    this.filterReport();
                }
            }
        });
    }

    private shouldIncludeCountry(country: string): boolean {
        // Si allowedCountryCodes est null, cela signifie tous les pays (admin ou GNL ou backend gère déjà)
        if (this.allowedCountryCodes === null) {
            return true;
        }

        // Si la liste est vide, aucun pays autorisé
        if (this.allowedCountryCodes.length === 0) {
            return false;
        }

        // Vérifier si le pays est dans la liste autorisée
        // Convertir le nom du pays en code pays si nécessaire
        const countryCode = this.getCountryCode(country);
        return this.allowedCountryCodes.includes(countryCode);
    }

    private getCountryCode(countryName: string): string {
        if (!countryName) return '';
        
        const normalizedName = countryName.trim().toUpperCase();
        
        // Gérer les variantes spéciales comme "CITCH" qui signifie "CI" (Côte d'Ivoire)
        if (normalizedName === 'CITCH' || normalizedName.startsWith('CITCH')) {
            return 'CI';
        }
        
        // Mapping des noms de pays vers leurs codes
        const countryMap: { [key: string]: string } = {
            'CAMEROUN': 'CM',
            'CAMEROON': 'CM',
            'CÔTE D\'IVOIRE': 'CI',
            'COTE D\'IVOIRE': 'CI',
            'COTE DIVOIRE': 'CI',
            'CÔTE DIVOIRE': 'CI',
            'SÉNÉGAL': 'SN',
            'SENEGAL': 'SN',
            'BURKINA FASO': 'BF',
            'BURKINA': 'BF',
            'MALI': 'ML',
            'BÉNIN': 'BJ',
            'BENIN': 'BJ',
            'NIGER': 'NE',
            'TCHAD': 'TD',
            'TOGO': 'TG'
        };

        // Chercher par nom exact (insensible à la casse)
        for (const [name, code] of Object.entries(countryMap)) {
            if (name.toLowerCase() === normalizedName.toLowerCase()) {
                return code;
            }
        }
        
        // Chercher par contenu (pour gérer les cas comme "Côte d'Ivoire" dans "Côte d'Ivoire - Abidjan")
        if (normalizedName.includes('COTE') || normalizedName.includes('CÔTE') || normalizedName.includes('IVOIRE')) {
            return 'CI';
        }
        if (normalizedName.includes('SENEGAL') || normalizedName.includes('SÉNÉGAL')) {
            return 'SN';
        }
        if (normalizedName.includes('CAMEROUN') || normalizedName.includes('CAMEROON')) {
            return 'CM';
        }
        if (normalizedName.includes('BURKINA')) {
            return 'BF';
        }
        if (normalizedName.includes('MALI')) {
            return 'ML';
        }
        if (normalizedName.includes('BENIN') || normalizedName.includes('BÉNIN')) {
            return 'BJ';
        }
        if (normalizedName.includes('NIGER')) {
            return 'NE';
        }
        if (normalizedName.includes('TCHAD')) {
            return 'TD';
        }
        if (normalizedName.includes('TOGO')) {
            return 'TG';
        }

        // Si c'est déjà un code (2 lettres), le retourner tel quel
        if (normalizedName.length === 2) {
            return normalizedName;
        }
        
        // Si c'est un code de 4-5 lettres qui commence par un code pays connu, extraire les 2 premières lettres
        if (normalizedName.length >= 4) {
            const firstTwo = normalizedName.substring(0, 2);
            const validCodes = ['CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'NE', 'TD', 'TG'];
            if (validCodes.includes(firstTwo)) {
                return firstTwo;
            }
        }

        // Sinon, retourner le nom tel quel pour comparaison
        return normalizedName;
    }

    private generateReportDataFromSummary(summary: AgencySummaryData[]) {
        // Cloisonnement magique : garantir que le rapport ne concerne que la card sélectionnée,
        // quelle que soit la source du résumé (local, serveur, ou réponse globale).
        const scopedSummary = this.getEffectiveSummaryForMagic(summary);
        this.debugLog('Génération du rapport à partir du résumé par agence:', scopedSummary);

        // Regrouper d'abord par agence/service/pays/jour — évite une ligne par transaction
        // (ex: date avec heure différentes qui créent des clés distinctes).
        const consolidatedSummary = this.consolidateAgencySummaryByAgency(scopedSummary);
        const withCountry = consolidatedSummary.map(item => {
            const rawCountry = (item.country || '').toString().trim();
            const unknownCountry = /^(inconnu|unknown|non sp[ée]cifi[ée]|non specifie|n\/a|ag)$/i.test(rawCountry);
            return {
                ...item,
                country: (!rawCountry || unknownCountry)
                    ? this.inferCountryFromMagicContext(item.service)
                    : rawCountry
            };
        });

        const filteredSummary = withCountry.filter(item => {
            if (!item.country) {
                return this.isMagicScopeActive();
            }
            return this.shouldIncludeCountry(item.country);
        });
    
        this.debugLog('Résumé filtré par pays:', {
            total: scopedSummary.length,
            consolidated: consolidatedSummary.length,
            filtered: filteredSummary.length,
            allowedCountryCodes: this.allowedCountryCodes
        });
        
        const totalPartnerOnly = this.calculateTotalPartnerOnly();
        
        const uniqueAgencies = new Set(filteredSummary.map(item => item.agency));
        const hasMultipleAgencies = uniqueAgencies.size > 1;
        
        const summaryMeta = this.reconciliationSummaryService.getSummaryMeta();
        const hasPartnerOnlyWithAgencyService = summaryMeta.hasPartnerOnlyWithAgencyService
            || (!this.summaryHasDetailedBreakdown(filteredSummary) &&
                this.getPartnerOnlyDataset().some(record => {
                    const partnerInfo = this.getPartnerOnlyAgencyAndService(record);
                    return partnerInfo.agency !== 'Inconnue' && partnerInfo.service !== 'Inconnu';
                }));
        
        const usePrecomputedStats = this.summaryHasDetailedBreakdown(filteredSummary);

        // Décision PAR SERVICE : un service dont les écarts partenaires ne portent ni agence
        // ni service exploitable doit être porté par une ligne de synthèse "Multiagence" ;
        // tous les autres services conservent leurs écarts dans leurs lignes d'agence (détail).
        //
        // L'ancienne décision était un booléen global calculé sur l'ensemble du dataset :
        // un seul service sans agence forçait l'agrégation de tous les autres services du
        // rapport (les lignes d'agence perdaient leurs écarts, qui partaient sur une ligne
        // Multiagence), d'où un affichage "un service en détail, l'autre agrégé".
        const servicesNeedingPartnerOnlyLine = this.computeServicesNeedingPartnerOnlyLine(
            hasMultipleAgencies,
            totalPartnerOnly
        );
        const shouldCreatePartnerOnlyLine = servicesNeedingPartnerOnlyLine.size > 0;
        
        // Stocker cette information dans une propriété de classe pour qu'elle soit accessible dans calculateDetailedStatsForSummaryItem
        // (solution de contournement si le paramètre n'est pas correctement transmis)
        (this as any)._shouldCreatePartnerOnlyLine = shouldCreatePartnerOnlyLine;
        (this as any)._hasMultipleAgencies = hasMultipleAgencies;
        (this as any)._hasPartnerOnlyWithAgencyService = hasPartnerOnlyWithAgencyService;
        (this as any)._totalPartnerOnly = totalPartnerOnly;
        
        let partnerOnlyWithoutAgencyServiceAttributed = false;
        
        this.reportData = filteredSummary.map((item, index) => {
            const isFirstLine = index === 0;
            // La ligne d'agence perd ses écarts partenaires UNIQUEMENT si SON service est
            // porté par une ligne Multiagence. Les autres services restent en détail.
            const rowService = String(item.service || '').trim();
            const shouldSkipPartnerOnly = servicesNeedingPartnerOnlyLine.has(rowService);
            const partnerOnlyAlreadyAttributedValue = partnerOnlyWithoutAgencyServiceAttributed || shouldSkipPartnerOnly;

            if (usePrecomputedStats) {
                const row = this.buildReportRowFromPrecomputedSummary(
                    item,
                    shouldSkipPartnerOnly,
                    partnerOnlyAlreadyAttributedValue,
                    isFirstLine,
                    shouldCreatePartnerOnlyLine
                );
                if (isFirstLine && !hasPartnerOnlyWithAgencyService && row.partnerOnly > 0 && !shouldSkipPartnerOnly) {
                    partnerOnlyWithoutAgencyServiceAttributed = true;
                }
                return row;
            }

            const detailedStats = this.calculateDetailedStatsForSummaryItem(item, isFirstLine, partnerOnlyAlreadyAttributedValue);
            
            if (isFirstLine && !hasPartnerOnlyWithAgencyService && detailedStats.partnerOnly > 0 && !shouldSkipPartnerOnly) {
                partnerOnlyWithoutAgencyServiceAttributed = true;
            }
            
            const boOnly = detailedStats.boOnly;
            // Si on doit créer une ligne spéciale, ne pas inclure les écarts partenaires dans les lignes d'agence
            const partnerOnly = shouldSkipPartnerOnly ? 0 : detailedStats.partnerOnly;
            
            const mismatches = detailedStats.mismatches;
            
            const boOnlyNum = Number(boOnly) || 0;
            const partnerOnlyNum = Number(partnerOnly) || 0;
            const mismatchesNum = Number(mismatches) || 0;
            const totalEcarts = boOnlyNum + partnerOnlyNum + mismatchesNum;
            const traitementDefault = totalEcarts > 0 ? 'Niveau Support' : 'Responsable CDO';
            
            const matches = detailedStats.matches;
            // Utiliser recordCount comme source de vérité principale (vient du résumé)
            // Le recordCount représente le nombre réel de transactions dans le résumé
            const totalTransactions = item.recordCount || (matches + boOnly + partnerOnly + mismatches);
            
            const reportItem: ReconciliationReportData = {
                date: item.date,
                agency: item.agency,
                service: item.service,
                country: item.country,
                totalTransactions: totalTransactions,
                totalVolume: item.totalVolume,
                matches: matches,
                boOnly: boOnly,
                partnerOnly: partnerOnly,
                mismatches: mismatches,
                matchRate: totalTransactions > 0 ? (matches / totalTransactions) * 100 : 0,
                status: this.computeStatusFromCounts(
                    matches,
                    boOnly,
                    partnerOnly,
                    mismatches,
                    totalTransactions
                ),
                comment: '',
                traitement: traitementDefault
            };
            this.updateCommentFromCounts(
                reportItem,
                detailedStats.matches,
                boOnly,
                partnerOnly,
                mismatches,
                { force: true }
            );
            
            return reportItem;
        });
        
        // Créer les lignes "Multiagence" UNIQUEMENT pour les services dont les écarts
        // partenaires ne sont pas attribuables à une agence. Les autres services restent
        // intégralement en détail dans leurs lignes d'agence.
        if (servicesNeedingPartnerOnlyLine.size > 0) {
            // Récupérer le service depuis la première ligne du résumé
            const firstItem = filteredSummary[0];
            const serviceName = firstItem?.service || 'Service Inconnu';
            const latestDate = filteredSummary.reduce((latest, item) => {
                const day = this.formatDateForSearch(item.date) || item.date || '';
                return this.getSortableDateTime(day) > this.getSortableDateTime(latest) ? day : latest;
            }, firstItem?.date || new Date().toISOString().split('T')[0]);
            const country = firstItem?.country || '';

            // Cloisonner les écarts partenaire par service (tag _magicService puis colonne service).
            const partnerLines = this.buildPartnerOnlyLinesByService(
                latestDate,
                country,
                serviceName,
                filteredSummary,
                servicesNeedingPartnerOnlyLine
            );
            partnerLines.forEach(line => {
                // FORCER immédiatement les valeurs correctes pour chaque ligne spéciale
                this.enforcePartnerOnlyLineValues(line);
            });

            // Placer les lignes Multiagence en première position
            this.reportData.unshift(...partnerLines);
        }
        
        this.enforceDefaultStatusForReportData();
        
        // FORCER toutes les lignes avec statut OK à avoir traitement = "Responsable CDO"
        this.enforceTraitementForOkStatus();

        if (!usePrecomputedStats) {
            this.reportData.forEach(item => {
                if (!this.isPartnerOnlySpecialLine(item)) {
                    this.recalculateMatchRate(item);
                    this.syncCommentWithValues(item);
                } else {
                    this.enforcePartnerOnlyLineValues(item);
                }
            });
        } else {
            this.reportData.forEach(item => {
                if (this.isPartnerOnlySpecialLine(item)) {
                    this.enforcePartnerOnlyLineValues(item);
                }
            });
        }

        // IMPORTANT: si les écarts partenaires arrivent plus tard (ou ne sont pas attribuables),
        // garantir la création/mise à jour de la ligne spéciale.
        this.ensurePartnerOnlySpecialLine();

        this.reportData = (this.reportData || []).filter(r =>
            this.isPartnerOnlySpecialLine(r) ||
            (
                ((r?.agency || '').toString().trim() !== '') &&
                ((r?.service || '').toString().trim() !== '')
            )
        );

        // Multiagence en première position, puis reste trié par date.
        // Parmi les lignes Multiagence, tri par nom de service (A→Z) pour un affichage stable
        // des différentes lignes cloisonnées par service.
        this.reportData.sort((a, b) => {
            const aMulti = this.isMultiagenceRow(a) ? 0 : 1;
            const bMulti = this.isMultiagenceRow(b) ? 0 : 1;
            if (aMulti !== bMulti) {
                return aMulti - bMulti;
            }
            if (aMulti === 0 && bMulti === 0) {
                return (a.service || '').localeCompare(b.service || '');
            }
            return this.getSortableDateTime(b.date) - this.getSortableDateTime(a.date);
        });

        // Affichage par service (mode magique) : 2 lignes par service, une "Multiagence"
        // pour les écarts BO et une ligne service pour les correspondances + écarts
        // partenaire. Remplace le détail par agence.
        this.collapseReportToServiceSummary();

        this.syncLastSavedGlpiValues(this.reportData);
    }

    /** Vrai pour toute ligne de synthèse multi-agences (écarts BO ou écarts partenaire). */
    private isMultiagenceRow(item: ReconciliationReportData): boolean {
        return this.isPartnerOnlySpecialLine(item)
            || !!(item as any)?.__boGapAggregate
            || (item?.agency || '').trim().toUpperCase() === 'MULTIAGENCE';
    }

    /**
     * Consolide le résumé par agence + service + pays (tous jours confondus).
     * Cumule Transactions / Correspondances / Volume / écarts et
     * conserve la date la plus récente pour l'affichage.
     */
    private consolidateAgencySummaryByAgency(summary: AgencySummaryData[]): AgencySummaryData[] {
        if (!summary?.length) {
            return [];
        }

        const map = new Map<string, AgencySummaryData>();
        for (const item of summary) {
            if (!item) {
                continue;
            }
            const agency = (item.agency || '').trim();
            const day = this.formatDateForSearch(item.date) || (item.date || '');
            const key = [
                agency.toUpperCase(),
                (item.service || '').trim().toUpperCase(),
                (item.country || '').trim().toUpperCase()
            ].join('|');

            const existing = map.get(key);
            if (!existing) {
                map.set(key, {
                    agency: agency || item.agency,
                    service: item.service,
                    country: item.country,
                    date: day,
                    totalVolume: Number(item.totalVolume) || 0,
                    recordCount: Number(item.recordCount) || 0,
                    matches: Number(item.matches) || 0,
                    boOnly: Number(item.boOnly) || 0,
                    partnerOnly: Number(item.partnerOnly) || 0,
                    mismatches: Number(item.mismatches) || 0
                });
                continue;
            }

            existing.recordCount = (Number(existing.recordCount) || 0) + (Number(item.recordCount) || 0);
            existing.totalVolume = (Number(existing.totalVolume) || 0) + (Number(item.totalVolume) || 0);
            existing.matches = (Number(existing.matches) || 0) + (Number(item.matches) || 0);
            existing.boOnly = (Number(existing.boOnly) || 0) + (Number(item.boOnly) || 0);
            existing.partnerOnly = (Number(existing.partnerOnly) || 0) + (Number(item.partnerOnly) || 0);
            existing.mismatches = (Number(existing.mismatches) || 0) + (Number(item.mismatches) || 0);

            // Garder la date la plus récente
            if (this.getSortableDateTime(day) > this.getSortableDateTime(existing.date)) {
                existing.date = day;
            }
        }

        return Array.from(map.values()).sort((a, b) => {
            if (a.agency !== b.agency) {
                return a.agency.localeCompare(b.agency);
            }
            return (a.service || '').localeCompare(b.service || '');
        });
    }

    private buildReportRowFromPrecomputedSummary(
        item: AgencySummaryData,
        shouldSkipPartnerOnly: boolean,
        partnerOnlyAlreadyAttributed: boolean,
        isFirstLine: boolean,
        shouldCreatePartnerOnlyLine: boolean
    ): ReconciliationReportData {
        const matches = item.matches ?? 0;
        const mismatches = item.mismatches ?? 0;
        const boOnlyOnly = item.boOnly ?? 0;

        let partnerOnly = 0;
        if (!shouldSkipPartnerOnly && !partnerOnlyAlreadyAttributed && !shouldCreatePartnerOnlyLine) {
            if (this.reconciliationSummaryService.getSummaryMeta().hasPartnerOnlyWithAgencyService) {
                partnerOnly = item.partnerOnly ?? 0;
            } else if (isFirstLine) {
                partnerOnly = this.reconciliationSummaryService.getSummaryMeta().totalPartnerOnly
                    || this.getPartnerOnlyCount();
            }
        } else if (!shouldSkipPartnerOnly && !partnerOnlyAlreadyAttributed) {
            partnerOnly = item.partnerOnly ?? 0;
        }

        // recordCount backend = matches + boOnly + mismatches (+ partnerOnly si renseigné)
        const totalTransactions = item.recordCount || (matches + boOnlyOnly + mismatches + partnerOnly);
        const totalEcarts = boOnlyOnly + partnerOnly + mismatches;
        const traitementDefault = totalEcarts > 0 ? 'Niveau Support' : 'Responsable CDO';

        const reportItem: ReconciliationReportData = {
            date: item.date,
            agency: item.agency,
            service: item.service,
            country: item.country,
            totalTransactions,
            totalVolume: item.totalVolume,
            matches,
            // Écarts BO (sans incohérences) : la colonne "Incohérences" est séparée
            boOnly: boOnlyOnly,
            partnerOnly,
            mismatches,
            matchRate: totalTransactions > 0 ? (matches / totalTransactions) * 100 : 0,
            status: this.computeStatusFromCounts(matches, boOnlyOnly, partnerOnly, mismatches, totalTransactions),
            comment: '',
            traitement: traitementDefault
        };
        this.updateCommentFromCounts(reportItem, matches, boOnlyOnly, partnerOnly, mismatches, { force: true });
        return reportItem;
    }

    private calculateTotalPartnerOnly(): number {
        const meta = this.reconciliationSummaryService.getSummaryMeta();
        if (meta.totalPartnerOnly > 0) {
            return meta.totalPartnerOnly;
        }
        return this.getPartnerOnlyCount();
    }

    /**
     * Services dont les écarts partenaires ne portent NI agence NI service exploitable.
     *
     * Ces services doivent être portés par une ligne de synthèse "Multiagence" ; tous les
     * autres services gardent leurs écarts dans leurs lignes d'agence (détail).
     *
     * L'analyse est faite service par service. Le booléen global qui remplaçait ce
     * calcul (`hasMultipleAgencies && !hasPartnerOnlyWithAgencyService`) était calculé sur
     * l'ensemble du dataset : un seul service sans agence imposait sa ligne Multiagence à
     * tous les services du rapport, ce qui vidait les lignes d'agence de leurs écarts.
     *
     * Le regroupement utilise le tag magique `_magicService` en priorité : c'est le libellé
     * BO canonique, donc directement comparable à `item.service` des lignes du rapport.
     */
    private computeServicesNeedingPartnerOnlyLine(
        hasMultipleAgencies: boolean,
        totalPartnerOnly: number
    ): Set<string> {
        const result = new Set<string>();
        if (!hasMultipleAgencies || !(totalPartnerOnly > 0)) {
            return result;
        }
        const dataset = this.getPartnerOnlyDataset() || [];
        if (!dataset.length) {
            return result;
        }

        const perService = new Map<string, { total: number; withAgencyService: number }>();
        for (const record of dataset) {
            const info = this.getPartnerOnlyAgencyAndService(record);
            const service = this.getMagicServiceTag(record)
                || String(info.service || '').trim();
            if (!service) {
                continue;
            }
            const current = perService.get(service) || { total: 0, withAgencyService: 0 };
            current.total += 1;
            const hasAgency = !!info.agency && info.agency !== 'Inconnue';
            const hasService = !!info.service && info.service !== 'Inconnu';
            if (hasAgency && hasService) {
                current.withAgencyService += 1;
            }
            perService.set(service, current);
        }

        perService.forEach((value, service) => {
            if (value.total > 0 && value.withAgencyService === 0) {
                result.add(service);
            }
        });
        return result;
    }

    /**
     * Construit les lignes "Multiagence" pour les écarts Partenaire sans agence/service,
     * cloisonnées par service : un service distinct = une ligne.
     * Le service est déterminé via le tag magique _magicService, sinon par la colonne service
     * du fichier partenaire, sinon via le service par défaut fourni.
     */
    private buildPartnerOnlyLinesByService(
        date: string,
        country: string,
        fallbackService: string,
        summary: Array<{ service?: string; country?: string }> = [],
        onlyForServices?: Set<string>
    ): ReconciliationReportData[] {
        const dataset = this.getPartnerOnlyDataset() || [];
        const defaultService = String(fallbackService || '').trim() || 'Service Inconnu';

        // Pays par service : priorité au pays d'une ligne (non Inconnu) du résumé pour ce service,
        // sinon le pays global fourni. Permet à chaque ligne "Multiagence" de reprendre le pays
        // de sa card (ex. Gabon pour GA_* vs un autre pays pour une autre card).
        const countryByService = new Map<string, string>();
        for (const item of Array.isArray(summary) ? summary : []) {
            const svc = String((item).service || '').trim() || defaultService;
            const rawCountry = String((item).country || '').trim();
            if (!countryByService.has(svc) && rawCountry && !/^(inconnu|unknown|non sp[ée]cifi[ée]|non specifie|n\/a|ag)$/i.test(rawCountry)) {
                countryByService.set(svc, rawCountry);
            }
        }

        // Libellés service BO distincts présents dans les lignes normales du rapport.
        // La ligne "Multiagence" (écarts partenaire) doit afficher le MÊME service que ces lignes,
        // toujours basé sur le BO : on mappe le service partenaire vers un libellé BO équivalent.
        const boServiceLabels = Array.from(new Set(
            (Array.isArray(summary) ? summary : [])
                .map(item => String((item).service || '').trim())
                .filter(svc => svc && svc !== 'Inconnu' && svc !== 'Service Inconnu')
        ));

        // Mappe un service partenaire (ou tag magique) vers le libellé service BO à afficher.
        // Priorité : tag _magicService (BO canonique) → correspondance partenaire↔BO → sinon
        // le libellé partenaire d'origine (aucune correspondance BO trouvée).
        const resolveDisplayService = (record: Record<string, string>): string => {
            const magicTag = getMagicPartitionServiceTag(record);
            if (magicTag) {
                return magicTag;
            }
            const partnerService = String(this.getPartnerOnlyAgencyAndService(record).service || '').trim();
            if (!partnerService || partnerService === 'Inconnu') {
                return defaultService;
            }
            // Trouver un libellé BO équivalent au service partenaire.
            // Priorité à l'égalité exacte (normalisée) pour éviter qu'un libellé partenaire
            // ne soit rattaché au mauvais libellé BO quand plusieurs libellés se ressemblent.
            const partnerNorm = normalizeServiceToken(partnerService);
            const exactLabel = boServiceLabels.find(label => normalizeServiceToken(label) === partnerNorm);
            if (exactLabel) {
                return exactLabel;
            }
            for (const boLabel of boServiceLabels) {
                if (partnerServiceMatchesBo(partnerService, boLabel)) {
                    return boLabel;
                }
            }
            return partnerService;
        };

        // Regrouper les écarts partenaires par service affiché, en ne retenant QUE les
        // services qui ont réellement besoin d'une ligne de synthèse "Multiagence".
        // Les autres services restent en détail sur leurs lignes d'agence.
        //
        // Le filtrage utilise la MÊME clé que computeServicesNeedingPartnerOnlyLine
        // (tag _magicService en priorité, sinon colonne service partenaire) : les deux
        // fonctions doivent être d'accord, faute de quoi une ligne Multiagence attendue
        // serait silencieusement perdue.
        const groups = new Map<string, { count: number; date: string }>();
        for (const record of dataset) {
            if (onlyForServices?.size) {
                const info = this.getPartnerOnlyAgencyAndService(record);
                const key = this.getMagicServiceTag(record)
                    || String(info.service || '').trim();
                if (!onlyForServices.has(key)) {
                    continue;
                }
            }
            const service = resolveDisplayService(record);
            // La date de la ligne d'écart partenaire est celle de l'enregistrement du
            // FICHIER PARTENAIRE, pas la date la plus récente du résumé BO : cette
            // dernière peut être postérieure (le BO peut contenir des transactions des
            // jours suivants) et affichait donc des écarts datés à tort.
            const recordDate = this.formatDateForSearch(this.getPartnerOnlyAgencyAndService(record).date) || date;
            const current = groups.get(service) || { count: 0, date: recordDate };
            current.count += 1;
            if (this.getSortableDateTime(recordDate) > this.getSortableDateTime(current.date)) {
                current.date = recordDate;
            }
            groups.set(service, current);
        }

        if (groups.size === 0) {
            // Aucun écart partenaire ne correspond à un service nécessitant une ligne de
            // synthèse : ne rien créer plutôt que d'inventer une ligne "Multiagence".
            return [];
        }

        const lines: ReconciliationReportData[] = [];
        Array.from(groups.keys())
            .sort((a, b) => a.localeCompare(b))
            .forEach(service => {
                const entry = groups.get(service) || { count: 0, date };
                const count = entry.count;
                const svcCountry = countryByService.get(service) || country;
                lines.push({
                    date: entry.date || date,
                    agency: 'Multiagence',
                    service,
                    country: svcCountry,
                    glpiId: '',
                    totalTransactions: count,
                    totalVolume: 0,
                    matches: 0,
                    boOnly: 0,
                    partnerOnly: count,
                    mismatches: 0,
                    matchRate: 0,
                    status: 'NOK',
                    comment: this.buildCommentForCounts(0, 0, count, 0, count),
                    traitement: 'Niveau Support',
                    username: undefined
                });
            });
        return lines;
    }

    /**
     * Retourne le dataset des écarts Partenaire disponible:
     * - priorité à la réponse magic complète (taguée _magicService)
     * - puis aux données filtrées des onglets
     * - sinon fallback sur les résultats de réconciliation en mémoire (response.partnerOnly)
     */
    private getPartnerOnlyDataset(): Record<string, string>[] {
        const magicFull = this.appStateService.getMagicFullResponse();
        const magicPartnerOnly = magicFull?.partnerOnly;
        if (magicPartnerOnly && magicPartnerOnly.length > 0) {
            return this.scopeRecordsToMagic(magicPartnerOnly);
        }
        const fromTabs = this.reconciliationTabsService.getFilteredPartnerOnly();
        if (fromTabs && fromTabs.length > 0) {
            return this.scopeRecordsToMagic(fromTabs);
        }
        return this.scopeRecordsToMagic(this.response?.partnerOnly || []);
    }

    /**
     * Retourne le nombre d'écarts Partenaire même si le dataset n'est pas chargé (fallback sur totalPartnerOnly).
     */
    private getPartnerOnlyCount(): number {
        const dataset = this.getPartnerOnlyDataset();
        if (dataset && dataset.length > 0) {
            return dataset.length;
        }
        if (this.isMagicScopeActive()) {
            return this.getMagicScopeExpectedTotals().partnerOnly;
        }
        const fallback = (this.response as any)?.totalPartnerOnly;
        return typeof fallback === 'number' && fallback > 0 ? fallback : 0;
    }

    /**
     * Garantit la création/mise à jour de la ligne spéciale (agence === service) pour les écarts Partenaire
     * quand ils ne sont pas attribuables aux lignes d'agence (multi-agences + pas d'agence/service côté partenaire).
     */
    private ensurePartnerOnlySpecialLine(): void {
        if (!this.reportData || this.reportData.length === 0) {
            return;
        }

        const totalPartnerOnly = this.getPartnerOnlyCount();
        if (totalPartnerOnly <= 0) {
            return;
        }

        // Ne considérer que les lignes "normales" pour la détection multi-agences
        const normalRows = this.reportData.filter(r => !(r.agency === r.service && r.agency && r.service));
        const uniqueAgencies = new Set(normalRows.map(r => r.agency).filter(Boolean));
        const hasMultipleAgencies = uniqueAgencies.size > 1;

        const partnerOnlyDataset = this.getPartnerOnlyDataset();
        const hasPartnerOnlyWithAgencyService =
            partnerOnlyDataset.length > 0 &&
            partnerOnlyDataset.some(record => {
                const info = this.getPartnerOnlyAgencyAndService(record);
                return info.agency !== 'Inconnue' && info.service !== 'Inconnu';
            });

        // Même analyse par service que generateReportDataFromSummary : ce chemin ne doit pas
        // réintroduire une ligne "Multiagence" regroupant tous les services, sinon les
        // services disposant déjà d'un détail par agence repasseraient en agrégé.
        const servicesNeedingLine = this.computeServicesNeedingPartnerOnlyLine(
            hasMultipleAgencies,
            totalPartnerOnly
        );
        const shouldCreatePartnerOnlyLine = servicesNeedingLine.size > 0;
        (this as any)._shouldCreatePartnerOnlyLine = shouldCreatePartnerOnlyLine;
        (this as any)._hasMultipleAgencies = hasMultipleAgencies;
        (this as any)._hasPartnerOnlyWithAgencyService = hasPartnerOnlyWithAgencyService;

        if (!shouldCreatePartnerOnlyLine) {
            return;
        }

        // Prendre une ligne "normale" avec service renseigné pour alimenter le libellé et la date.
        const seedRow =
            normalRows.find(r => (r?.service || '').toString().trim() !== '') ??
            normalRows[0] ??
            this.reportData[0];

        const serviceName = (seedRow?.service || '').toString().trim();
        if (!serviceName) {
            return;
        }

        const latestDate = normalRows.reduce((latest, row) => {
            const day = this.formatDateForSearch(row.date) || row.date || '';
            return this.getSortableDateTime(day) > this.getSortableDateTime(latest) ? day : latest;
        }, (seedRow?.date || '').toString().trim() || new Date().toISOString().split('T')[0]);

        const country = (seedRow?.country || '').toString().trim();

        // Cloisonner les écarts partenaire par service : une ligne "Multiagence" par service
        // nécessitant effectivement une synthèse.
        const partnerLines = this.buildPartnerOnlyLinesByService(
            latestDate,
            country,
            serviceName,
            this.reportData,
            servicesNeedingLine
        );
        partnerLines.forEach(line => {
            const existing = this.reportData.find(r =>
                (r.agency === r.service && r.agency === line.service) ||
                ((r.agency || '').trim().toUpperCase() === 'MULTIAGENCE' &&
                    (r.service || '').trim() === line.service)
            );
            if (existing) {
                // Si la ligne est en OK, elle est soldée → ne pas la réécrire (commentaire doit rester intact)
                if (existing.status === 'OK') {
                    return;
                }
                existing.partnerOnly = line.partnerOnly;
                existing.totalTransactions = line.partnerOnly;
                existing.matches = 0;
                existing.boOnly = 0;
                existing.mismatches = 0;
                existing.matchRate = 0;
                existing.agency = 'Multiagence';
                existing.service = line.service;
                existing.date = latestDate;
                existing.status = 'NOK';
                // Mettre à jour le commentaire (statut non OK)
                existing.comment = this.buildCommentForCounts(0, 0, line.partnerOnly, 0, line.partnerOnly);
                existing.traitement = 'Niveau Support';
            } else {
                const specialLine: ReconciliationReportData = {
                    date: latestDate,
                    agency: line.agency,
                    service: line.service,
                    country: line.country,
                    glpiId: '',
                    totalTransactions: line.partnerOnly,
                    totalVolume: 0,
                    matches: 0,
                    boOnly: 0,
                    partnerOnly: line.partnerOnly,
                    mismatches: 0,
                    matchRate: 0,
                    status: 'NOK',
                    comment: this.buildCommentForCounts(0, 0, line.partnerOnly, 0, line.partnerOnly),
                    traitement: 'Niveau Support',
                    username: undefined
                };
                this.reportData.unshift(specialLine);
            }
        });

        // Multiagence toujours en tête (parmi elles, tri par service A→Z)
        this.reportData.sort((a, b) => {
            const aMulti = this.isPartnerOnlySpecialLine(a) ? 0 : 1;
            const bMulti = this.isPartnerOnlySpecialLine(b) ? 0 : 1;
            if (aMulti !== bMulti) {
                return aMulti - bMulti;
            }
            if (aMulti === 0 && bMulti === 0) {
                return (a.service || '').localeCompare(b.service || '');
            }
            return this.getSortableDateTime(b.date) - this.getSortableDateTime(a.date);
        });

        // S'assurer que les lignes normales n'absorbent pas les écarts partenaires quand la ligne spéciale existe
        this.reportData.forEach(r => {
            if (!this.isPartnerOnlySpecialLine(r)) {
                r.partnerOnly = 0;
            }
        });
    }

    /**
     * Détecte si une ligne est la ligne spéciale des écarts partenaires.
     * Cette ligne a agency === service et contient des écarts partenaires.
     * Ne pas vérifier matches === 0 ou boOnly === 0 car ces valeurs peuvent être modifiées.
     */
    private isPartnerOnlySpecialLine(item: ReconciliationReportData): boolean {
        if (!item) return false;
        // Lignes de synthèse par service (une ligne par service, avec BO + partenaire) :
        // ce ne sont pas des lignes d'écarts partenaires, ne pas leur appliquer la logique.
        if ((item as any).__serviceSummaryRow) return false;
        // Ligne de synthèse des ÉCARTS BO (agency === 'Multiagence') : ce n'est pas une
        // ligne d'écarts partenaires, ne pas lui appliquer la logique partenaire.
        if ((item as any).__boGapAggregate) return false;
        const agency = (item.agency || '').trim();
        const service = (item.service || '').trim();
        const agencyNorm = agency.toUpperCase();

        // La ligne spéciale est identifiée soit par agency === service (ancien comportement),
        // soit par agency === Multiagence (nouvel affichage) avec service renseigné.
        const matchesLegacyKey = agency && service && agency === service;
        const matchesMultiAgenceKey = agencyNorm === 'MULTIAGENCE' && !!service;
        if (!matchesLegacyKey && !matchesMultiAgenceKey) {
            return false;
        }

        // partnerOnly > 0 (ou totalTransactions > 0 si partnerOnly a été modifié à 0)
        return (item.partnerOnly > 0 || (item.totalTransactions > 0 && item.mismatches === 0));
    }

    /**
     * Force les valeurs correctes pour une ligne spéciale des écarts partenaires.
     * Cette méthode doit être appelée chaque fois qu'une ligne spéciale est détectée.
     */
    private enforcePartnerOnlyLineValues(item: ReconciliationReportData): void {
        // Ne pas forcer les valeurs si l'utilisateur est en train de modifier manuellement les écarts
        if (this.isManuallyEditingEcart) {
            this.debugLog(`🔒 enforcePartnerOnlyLineValues: Modification manuelle en cours - skip pour ${item.agency}/${item.service}`);
            return;
        }

        // Si la ligne spéciale est en statut OK, elle est considérée comme soldée :
        // tout doit rester à 0 et le commentaire doit rester intact.
        if (item.status === 'OK') {
            return;
        }
        
        // Vérifier d'abord avec la méthode standard
        let isSpecialLine = this.isPartnerOnlySpecialLine(item);
        
        // Si ce n'est pas détecté comme ligne spéciale, vérifier avec les critères alternatifs
        // (au cas où partnerOnly a été modifié à 0)
        if (!isSpecialLine && item.agency === item.service && 
            item.agency && item.service &&
            item.totalTransactions > 0 &&
            item.mismatches === 0) {
            // C'est probablement une ligne spéciale dont partnerOnly a été modifié à 0
            // Restaurer partnerOnly si nécessaire (mais ne pas forcer si l'utilisateur l'a modifié)
            isSpecialLine = true;
            if (item.partnerOnly === 0 && item.totalTransactions > 0) {
                // Si partnerOnly est 0 mais totalTransactions > 0, restaurer partnerOnly
                // en soustrayant matches et boOnly
                const currentMatches = this.normalizeNumericValue(item.matches);
                const currentBoOnly = this.normalizeNumericValue(item.boOnly);
                const restoredPartnerOnly = Math.max(0, item.totalTransactions - currentMatches - currentBoOnly);
                item.partnerOnly = restoredPartnerOnly;
                this.debugLog(`🔒 enforcePartnerOnlyLineValues: Ligne spéciale ${item.agency}/${item.service} détectée par critères alternatifs - partnerOnly restauré à ${restoredPartnerOnly}`);
            }
        }
        
        if (!isSpecialLine) return;

        // Avec des écarts partenaires: statut NOK (pas "EN COURS")
        if ((Number(item.partnerOnly) || 0) > 0 || (Number(item.totalTransactions) || 0) > 0) {
            if (item.status !== 'OK') {
                item.status = 'NOK';
            }
        }
        
        const originalMatches = item.matches;
        const originalPartnerOnly = item.partnerOnly;
        const originalBoOnly = item.boOnly;
        
        // FORCER seulement mismatches à 0 (les autres valeurs peuvent être modifiées)
        item.mismatches = 0;
        
        // S'assurer que partnerOnly est défini.
        // Important: 0 est une valeur valide (ex: l'utilisateur transfère tout vers les correspondances),
        // donc on ne doit PAS considérer 0 comme "absent".
        // On ne remplit avec totalTransactions que si partnerOnly est null/undefined.
        if (!this.isManuallyEditingEcart) {
            const hasPartnerOnlyValue = item.partnerOnly !== null && item.partnerOnly !== undefined;
            if (!hasPartnerOnlyValue) {
                item.partnerOnly = item.totalTransactions ?? 0;
            }
        }
        
        // Normaliser les valeurs
        const currentMatches = this.normalizeNumericValue(item.matches);
        const currentBoOnly = this.normalizeNumericValue(item.boOnly);
        const currentPartnerOnly = this.normalizeNumericValue(item.partnerOnly);
        
        // NE PAS modifier totalTransactions - utiliser la valeur existante
        const currentTotalTransactions = this.normalizeNumericValue(item.totalTransactions);
        
        // Recalculer le taux de correspondance
        if (currentTotalTransactions > 0) {
            item.matchRate = (currentMatches / currentTotalTransactions) * 100;
        } else {
            item.matchRate = 0;
        }
        
        // Ne pas recalculer le commentaire si l'utilisateur est en train de modifier manuellement
        if (!this.isManuallyEditingEcart) {
            // Recalculer le commentaire avec les valeurs réelles (matches, boOnly, partnerOnly, mismatches)
            // Utiliser les valeurs réelles, pas getDisplayMatches/getDisplayPartnerOnly car on veut les valeurs modifiables
            item.comment = this.buildCommentForCounts(currentMatches, currentBoOnly, currentPartnerOnly, 0, currentTotalTransactions);
        }
        
        // Log si des valeurs ont été corrigées
        if (originalMatches !== 0 || originalPartnerOnly !== item.partnerOnly) {
            this.debugWarn(`⚠️ enforcePartnerOnlyLineValues: Ligne spéciale ${item.agency}/${item.service} corrigée - matches: ${originalMatches}→${currentMatches}, partnerOnly: ${originalPartnerOnly}→${item.partnerOnly}, commentaire: ${item.comment}`);
        } else {
            this.debugLog(`🔒 enforcePartnerOnlyLineValues: Ligne spéciale ${item.agency}/${item.service} protégée - matches=${currentMatches}, partnerOnly=${item.partnerOnly}, commentaire: ${item.comment}`);
        }
    }

    private statsKey(agency: string, service: string, country: string): string {
        return `${this.normStatsPart(agency)}|${this.normStatsPart(service)}|${this.normStatsPart(country)}`;
    }

    private normStatsPart(value: string): string {
        return (value || '').toString().trim().toLowerCase();
    }

    // ─── Cloisonnement réconciliation magique ────────────────────────────────────────────

    /** Contexte magique (service / fichier partenaire) partagé entre les écrans de résultats. */
    private getMagicPartitionContext(): MagicPartitionContext {
        return resolveMagicPartitionContext({
            appStateService: this.appStateService.getSelectedMagicService(),
            appStatePartnerFile: this.appStateService.getSelectedMagicPartnerFile(),
            tabsContext: this.reconciliationTabsService.getMagicViewContext()
        });
    }

    /**
     * Déduit le pays d'une card magique depuis son libellé service / fichier partenaire
     * (codes pays), sinon se rabat sur le pays autorisé unique s'il n'en existe qu'un.
     */
    private inferCountryFromMagicContext(service: string, partnerFile?: string): string {
        const sources = `${service || ''} ${partnerFile || ''}`.toUpperCase();
        const match = sources.match(/\b(CM|CI|SN|BF|ML|BJ|NE|TD|TG|GA|GN|KE|NG)\b/)
            || sources.match(/^(CM|CI|SN|BF|ML|BJ|NE|TD|TG|GA|GN)_/);
        const code = match?.[1] || '';
        if (code) {
            return countryNameFromCode(code) || code;
        }
        if (Array.isArray(this.allowedCountryCodes) && this.allowedCountryCodes.length === 1) {
            return this.allowedCountryCodes[0];
        }
        return '';
    }

    /** Vrai quand le rapport doit être cloisonné sur la card (service) sélectionnée. */
    private isMagicScopeActive(): boolean {
        const ctx = this.getMagicPartitionContext();
        return !!(ctx.service || ctx.partnerFile);
    }

    /** Fichier partenaire à appliquer au cloisonnement du rapport.
     *  En groupe (plusieurs cards), chaque card garde son fichier partenaire : on ne
     *  restreint pas globalement par un seul fichier (sinon on perd les autres cards). */
    private getReportScopePartnerFile(): string {
        if (this.getReportScopeServices().length > 1) {
            return '';
        }
        return this.getMagicPartitionContext().partnerFile || '';
    }

    /**
     * Liste des fichiers partenaires autorisés pour le périmètre courant.
     *
     * En groupe (plusieurs cards), `getReportScopePartnerFile()` renvoie volontairement ''
     * pour ne pas restreindre à un seul fichier. Mais cela désactive complètement le
     * contrôle `_magicPartnerFile` de `recordMatchesAnyMagicService()` : les écarts
     * partenaires des AUTRES fichiers partenaires fuite alors dans le rapport, dès lors
     * que leur `_magicService` correspond à un service du périmètre (ou passe l'appariement
     * flou `partnerServiceMatchesBo`).
     *
     * On reconstruit donc la liste des fichiers depuis les résumés magiques, en ne gardant
     * que ceux des services effectivement dans le périmètre.
     */
    private getReportScopePartnerFiles(): string[] {
        const ctx = this.getMagicPartitionContext();
        const services = this.getReportScopeServices();
        const files = new Set<string>();
        if (ctx.partnerFile) {
            files.add(ctx.partnerFile);
        }
        if (services.length > 1) {
            const summaries = this.appStateService.getMagicServiceSummaries() || [];
            summaries.forEach(s => {
                if (!s?.service || s.service === 'Tous') {
                    return;
                }
                if (!this.isServiceInScope(s.service)) {
                    return;
                }
                const file = (s.partnerFileName || '').trim();
                if (file) {
                    files.add(file);
                }
            });
        }
        return Array.from(files);
    }

    /**
     * Écarte les enregistrements dont le fichier partenaire est hors périmètre.
     * Sans tag `_magicPartnerFile`, l'enregistrement est conservé (dataset non tagué).
     */
    private filterByReportScopePartnerFiles<T>(records: T[]): T[] {
        const allowed = this.getReportScopePartnerFiles();
        if (!allowed.length || !records?.length) {
            return records || [];
        }
        return records.filter(record => {
            const tag = getMagicPartitionPartnerFileTag(record as unknown as Record<string, string>);
            if (!tag) {
                return true;
            }
            return allowed.some(file => servicesMatchPartition(tag, file));
        });
    }

    /** Filtre les correspondances selon le(s) service(s) magique(s) sélectionné(s). */
    private scopeMatchesToMagic(matches: Match[]): Match[] {
        const ctx = this.getMagicPartitionContext();
        const services = this.getReportScopeServices();
        const partnerFile = this.getReportScopePartnerFile();
        if (services.length === 0 && !ctx.partnerFile) {
            return matches;
        }
        const primaryService = services[0] || ctx.service || '';
        this.reconciliationTabsService.setMagicViewContext(primaryService, ctx.partnerFile);
        if (services.length > 0) {
            // Le filtre multi-services laisse passer les écarts d'un autre fichier partenaire
            // dont le libellé service correspond : on re-cloisonne par fichier partenaire.
            return this.filterByReportScopePartnerFiles(
                filterMatchBoDataByMagicPartitionMulti(matches, services, partnerFile)
            );
        }
        return filterMatchBoDataByMagicPartition(matches, primaryService, partnerFile);
    }

    /** Filtre les écarts BO/Partenaire/incohérences selon le(s) service(s) magique(s) sélectionné(s). */
    private scopeRecordsToMagic(records: Record<string, string>[]): Record<string, string>[] {
        const ctx = this.getMagicPartitionContext();
        const services = this.getReportScopeServices();
        const partnerFile = this.getReportScopePartnerFile();
        if (services.length === 0 && !ctx.partnerFile) {
            return records;
        }
        const primaryService = services[0] || ctx.service || '';
        this.reconciliationTabsService.setMagicViewContext(primaryService, ctx.partnerFile);
        if (services.length > 0) {
            // Même correction que pour les correspondances : en multi-services le filtre
            // `_magicPartnerFile` est désactivé, les écarts des autres fichiers partenaires
            // doivent être écartés explicitement.
            return this.filterByReportScopePartnerFiles(
                filterRecordsByMagicPartitionMulti(records, services, partnerFile)
            );
        }
        return partitionEcartRecords(records, ctx);
    }

    /** Totaux attendus pour le(s) service(s) magique(s) actif(s) (sans mélanger les autres services). */
    private getMagicScopeExpectedTotals(): { matches: number; boOnly: number; partnerOnly: number } {
        const ctx = this.getMagicPartitionContext();
        const summaries = this.appStateService.getMagicServiceSummaries();
        const totals = { matches: 0, boOnly: 0, partnerOnly: 0 };
        const scope = this.getReportScopeServices();
        const matched = summaries.filter(s => {
            if (!s.service || s.service === 'Tous') {
                return false;
            }
            if (scope.length > 0 && !this.isServiceInScope(s.service)) {
                return false;
            }
            return !ctx.partnerFile || !s.partnerFileName || s.partnerFileName === ctx.partnerFile;
        });
        matched.forEach(s => {
            totals.matches += s.totalMatches || 0;
            totals.boOnly += s.totalBoOnly || 0;
            totals.partnerOnly += s.totalPartnerOnly || 0;
        });
        if (matched.length > 0) {
            return totals;
        }
        return {
            matches: this.response?.totalMatches ?? 0,
            boOnly: this.response?.totalBoOnly ?? 0,
            partnerOnly: this.response?.totalPartnerOnly ?? 0
        };
    }

    /** Liste des services (cards) à inclure dans le rapport ; sinon le service actif unique. */
    private getReportScopeServices(): string[] {
        if (this.magicReportServices?.length) {
            return this.magicReportServices;
        }
        if (this.magicReportService) {
            return [this.magicReportService];
        }
        const ctx = this.getMagicPartitionContext();
        return ctx.service ? [ctx.service] : [];
    }

    /** Vrai si le service fourni fait partie du périmètre du rapport. */
    private isServiceInScope(service: string): boolean {
        const svc = (service || '').toString().trim();
        if (!svc) {
            return false;
        }
        const scope = this.getReportScopeServices();
        if (scope.length === 0) {
            return true;
        }
        return this.serviceLabelsMatchAny(svc, scope);
    }

    private serviceLabelsMatchAny(service: string, labels: string[]): boolean {
        const svcNorm = normalizeServiceToken(service);
        return labels.some(label => {
            const labelNorm = normalizeServiceToken(label);
            return labelNorm === svcNorm || svcNorm.includes(labelNorm) || labelNorm.includes(svcNorm);
        });
    }

    /** Libellés service autorisés pour le(s) card(s) sélectionnée(s) (partner + BO variants). */
    private getAllowedMagicServiceLabels(): string[] {
        const ctx = this.getMagicPartitionContext();
        const labels = new Set<string>();
        const scope = this.getReportScopeServices();
        scope.forEach(svc => {
            if (svc) {
                labels.add(svc);
            }
        });
        const summaries = this.appStateService.getMagicServiceSummaries();
        summaries
            .filter(s =>
                s.service &&
                s.service !== 'Tous' &&
                this.isServiceInScope(s.service) &&
                (!ctx.partnerFile || !s.partnerFileName || s.partnerFileName === ctx.partnerFile)
            )
            .forEach(current => {
                if (current.partnerService) {
                    labels.add(current.partnerService);
                }
                (current.boServices || '')
                    .split(',')
                    .map(l => l.trim())
                    .filter(Boolean)
                    .forEach(l => labels.add(l));
            });
        return [...labels];
    }

    /** Ne conserve que les lignes du résumé appartenant à la card sélectionnée. */
    private scopeSummaryToMagicService(summary: AgencySummaryData[]): AgencySummaryData[] {
        if (!this.isMagicScopeActive()) {
            return summary;
        }
        const allowed = this.getAllowedMagicServiceLabels();
        if (!allowed.length) {
            return summary;
        }
        const allowedNorm = allowed.map(label => normalizeServiceToken(label)).filter(Boolean);
        const significantTokens = (value: string): string[] =>
            extractServiceTokens(value).filter(t => t.length >= MIN_SERVICE_TOKEN_LENGTH);
        const allowedTokens = allowed.map(label => significantTokens(label)).flat();
        return summary.filter(item => {
            const svc = (item.service || '').toString().trim();
            if (!svc) {
                return false;
            }
            const svcNorm = normalizeServiceToken(svc);
            if (allowedNorm.includes(svcNorm)) {
                return true;
            }
            if (allowed.some(label => partnerServiceMatchesBo(label, svc))) {
                return true;
            }
            // Dernier recours : partage de tokens significatifs (ex. CASHINMTNCM ↔ GU2_CASHINMTN_CI).
            const svcTokens = significantTokens(svc);
            return svcTokens.some(t => allowedTokens.includes(t));
        });
    }

    /**
     * Résumé effectif du rapport en mode magique :
     * reconstruit le résumé depuis les datasets cloisonnés (source de vérité), sinon
     * filtre le résumé transmis sur les services autorisés de la card sélectionnée.
     * Les résumés déjà cloisonnés (reconstruits/filtrés ici) sont mémorisés pour rester
     * idempotent (évite de perdre des lignes lors d'un second passage).
     */
    private readonly magicScopedSummaries = new WeakSet<AgencySummaryData[]>();

    private getEffectiveSummaryForMagic(summary: AgencySummaryData[]): AgencySummaryData[] {
        if (!this.isMagicScopeActive() || this.magicScopedSummaries.has(summary)) {
            return summary;
        }
        const fallback = this.buildFallbackSummaryFromResponseTotals();
        const expected = this.getMagicScopeExpectedTotals();
        const expectedBo = (expected.matches || 0) + (expected.boOnly || 0);
        const scoped = this.scopeSummaryToMagicService(summary);
        const scope = this.getReportScopeServices();
        // Affichage "par agence" pour TOUT le groupe de cards sélectionné : reconstruire le
        // résumé depuis les datasets cloisonnés du rapport (source de vérité sur le groupe).
        const fromDetail = this.buildAgencySummaryFromDetailDatasets();
        // Combiner TOUTES les sources par agence/service : le résumé entrant (scoped) couvre
        // les services dont les datasets ne sont pas chargés, fromDetail couvre ceux dont les
        // datasets le sont, fallback garantit une ligne au moins par card du scope.
        // Puis on retire le rollup des services déjà couverts par un détail par agence,
        // sinon le total du service s'affiche en doublon au-dessus de son propre détail.
        const combined = this.dropRollupRowsWhenDetailed(
            this.mergeAgencySummarySources([fromDetail, scoped, fallback])
        );
        const combinedServices = new Set(combined.map(r => (r.service || '').toString().trim()).filter(Boolean));
        const scopeNorm = scope.map(svc => normalizeServiceToken(svc)).filter(Boolean);
        const coversAll = scope.every(svc => {
            const n = normalizeServiceToken(svc);
            return combinedServices.has(n) || combinedServices.has(svc);
        });
        if (combined.length > 0 && (expectedBo <= 0 || coversAll)) {
            this.magicScopedSummaries.add(combined);
            return combined;
        }
        if (combined.length > 0) {
            this.magicScopedSummaries.add(combined);
            return combined;
        }
        this.magicScopedSummaries.add(scoped);
        return scoped;
    }

    /** Fusionne plusieurs résumés par agence en une seule liste (union par agence|service|pays).
     *  Les totaux sont sommés quand la même clé existe dans plusieurs sources. */
    private mergeAgencySummarySources(sources: AgencySummaryData[][]): AgencySummaryData[] {
        const map = new Map<string, AgencySummaryData>();
        for (const list of sources) {
            for (const item of list || []) {
                const agency = (item.agency || '').toString().trim() || 'Multiagence';
                const service = (item.service || '').toString().trim();
                const country = (item.country || '').toString().trim();
                const key = `${agency}|${service}|${country}`;
                const existing = map.get(key);
                if (!existing) {
                    map.set(key, { ...item, agency, service, country });
                    continue;
                }
                existing.recordCount = (existing.recordCount || 0) + (item.recordCount || 0);
                existing.totalVolume = (existing.totalVolume || 0) + (item.totalVolume || 0);
                existing.matches = (existing.matches || 0) + (item.matches || 0);
                existing.boOnly = (existing.boOnly || 0) + (item.boOnly || 0);
                existing.partnerOnly = (existing.partnerOnly || 0) + (item.partnerOnly || 0);
                existing.mismatches = (existing.mismatches || 0) + (item.mismatches || 0);
                if (!existing.date && item.date) {
                    existing.date = item.date;
                }
            }
        }
        return Array.from(map.values());
    }

    /**
     * Regroupe le rapport magique par service : exactement 2 lignes par service.
     *
     *  - ligne "Multiagence" : les ÉCARTS BO du service. Les transactions présentes en BO
     *    mais absentes du fichier partenaire n'ont pas d'agence partenaire, elles sont donc
     *    portées par une ligne de synthèse multi-agences.
     *  - ligne "<service>"  : les CORRESPONDANCES et les ÉCARTS PARTENAIRE du service.
     *
     * Remplace l'affichage par agence, qui affichait un total de service en doublon
     * au-dessus de son propre détail (agency === service) et masquait les écarts derrière
     * des lignes par agence sans total lisible.
     */
    private collapseReportToServiceSummary(): void {
        if (!this.isMagicScopeActive() || !this.reportData?.length) {
            return;
        }
        const scope = new Set(this.getReportScopeServices().map(s => (s || '').trim()).filter(Boolean));

        interface ServiceTotals {
            service: string; country: string; date: string;
            matches: number; boOnly: number; partnerOnly: number; mismatches: number; totalVolume: number;
        }
        const totals = new Map<string, ServiceTotals>();
        this.reportData.forEach(row => {
            const service = (row.service || '').toString().trim();
            if (!service || (scope.size && !scope.has(service))) {
                return;
            }
            const current = totals.get(service) || {
                service,
                country: (row.country || '').toString().trim(),
                date: (row.date || '').toString().trim(),
                matches: 0, boOnly: 0, partnerOnly: 0, mismatches: 0, totalVolume: 0
            };
            current.matches += Number(row.matches) || 0;
            current.boOnly += Number(row.boOnly) || 0;
            current.partnerOnly += Number(row.partnerOnly) || 0;
            current.mismatches += Number(row.mismatches) || 0;
            current.totalVolume += Number(row.totalVolume) || 0;
            if (!current.country && row.country) {
                current.country = (row.country || '').toString().trim();
            }
            const rowDate = (row.date || '').toString().trim();
            if (rowDate && (!current.date || this.getSortableDateTime(rowDate) > this.getSortableDateTime(current.date))) {
                current.date = rowDate;
            }
            totals.set(service, current);
        });

        if (!totals.size) {
            return;
        }

        const collapsed: ReconciliationReportData[] = [];
        Array.from(totals.keys())
            .sort((a, b) => a.localeCompare(b))
            .forEach(service => {
                const t = totals.get(service)!;
                const transactions = t.matches + t.boOnly + t.partnerOnly + t.mismatches;
                if (transactions === 0) {
                    return;
                }
                const row: ReconciliationReportData = {
                    date: t.date,
                    agency: service,
                    service,
                    country: t.country,
                    glpiId: '',
                    totalTransactions: transactions,
                    totalVolume: t.totalVolume,
                    matches: t.matches,
                    boOnly: t.boOnly,
                    partnerOnly: t.partnerOnly,
                    mismatches: t.mismatches,
                    matchRate: transactions > 0 ? (t.matches / transactions) * 100 : 0,
                    status: this.computeStatusFromCounts(t.matches, t.boOnly, t.partnerOnly, t.mismatches, transactions),
                    comment: this.buildCommentForCounts(t.matches, t.boOnly, t.partnerOnly, t.mismatches, transactions),
                    traitement: (t.matches === transactions && t.boOnly === 0 && t.partnerOnly === 0 && t.mismatches === 0)
                        ? 'Responsable CDO'
                        : 'Niveau Support',
                    username: undefined
                };
                // Marqueur : empêche isPartnerOnlySpecialLine() de considérer cette ligne
                // comme une ligne d'écarts partenaires (agency === service) et de
                // lui imposer un partnerOnly via enforcePartnerOnlyLineValues().
                (row as any).__serviceSummaryRow = true;
                collapsed.push(row);
            });

        if (collapsed.length) {
            this.reportData = collapsed;
        }
    }

    /**
     * Supprime les lignes de rollup `agency === service` d'un service qui dispose déjà
     * d'un vrai détail par agence.
     *
     * `mergeAgencySummarySources` fusionne par clé `agency|service|country`. Comme le pays
     * fait partie de la clé, le rollup d'une card (`agency = service`, pays `Gabon`) et ses
     * lignes d'agence (pays `GA`) ne se rejoignent jamais : les deux survivaient, ce qui
     * affichait le total du service en une ligne EN PLUS de son détail par agence
     * (ex. 16 401 en une ligne à côté des 8 lignes d'agence qui totalisent 16 401).
     *
     * Le rollup n'est conservé que si le détail ne couvre pas ses totaux, pour ne jamais
     * perdre de la donnée.
     */
    private dropRollupRowsWhenDetailed(summary: AgencySummaryData[]): AgencySummaryData[] {
        if (!summary?.length) {
            return summary || [];
        }

        const detailTotals = new Map<string, number>();
        summary.forEach(row => {
            const svc = String(row.service || '').trim();
            const agency = String(row.agency || '').trim();
            if (!svc || !agency || agency === svc || agency === 'Multiagence') {
                return;
            }
            detailTotals.set(svc, (detailTotals.get(svc) || 0) + (Number(row.recordCount) || 0));
        });
        if (!detailTotals.size) {
            return summary;
        }

        const kept = summary.filter(row => {
            const svc = String(row.service || '').trim();
            const agency = String(row.agency || '').trim();
            if (!detailTotals.has(svc) || agency !== svc) {
                return true;
            }
            const rollupTotal = Number(row.recordCount) || 0;
            const detail = detailTotals.get(svc) || 0;
            // Détail déjà complet → le rollup est un doublon. Détail partiel → on le garde.
            return detail < rollupTotal;
        });

        return kept.length ? kept : summary;
    }

    private getDetailDatasets(): {
        filteredMatches: Match[];
        filteredBoOnly: Record<string, string>[];
        filteredPartnerOnly: Record<string, string>[];
        filteredMismatches: Record<string, string>[];
    } {
        // Privilégier la réponse complète (source multi-services) plutôt que les onglets,
        // qui sont souvent cloisonnés sur la seule card active (sinon les autres cards perdent
        // leur détail par agence). On ne retombe sur les onglets que si la réponse est absente.
        // La réponse magique complète (toutes les cards, taggée `_magicService`) posée à la fin
        // de la réconciliation est fusionnée en priorité : elle est la source de vérité du groupe.
        const magicFull = this.appStateService.getMagicFullResponse();
        const tabsMatches = this.reconciliationTabsService.getFilteredMatches();
        const tabsBoOnly = this.reconciliationTabsService.getFilteredBoOnly();
        const tabsPartnerOnly = this.reconciliationTabsService.getFilteredPartnerOnly();
        const tabsMismatches = this.reconciliationTabsService.getFilteredMismatches();
        const respMatches = this.response?.matches || [];
        const respBoOnly = this.response?.boOnly || [];
        const respPartnerOnly = this.response?.partnerOnly || [];
        const respMismatches = this.response?.mismatches || [];
        const fullMatches = magicFull?.matches?.length ? magicFull.matches : respMatches;
        const fullBoOnly = magicFull?.boOnly?.length ? magicFull.boOnly : respBoOnly;
        const fullPartnerOnly = magicFull?.partnerOnly?.length ? magicFull.partnerOnly : respPartnerOnly;
        const fullMismatches = magicFull?.mismatches?.length ? magicFull.mismatches : respMismatches;
        const filteredMatches = this.scopeMatchesToMagic(
            fullMatches.length ? fullMatches : (tabsMatches?.length ? tabsMatches : [])
        );
        const filteredBoOnly = this.scopeRecordsToMagic(
            fullBoOnly.length ? fullBoOnly : (tabsBoOnly?.length ? tabsBoOnly : [])
        );
        const filteredPartnerOnly = this.scopeRecordsToMagic(
            fullPartnerOnly.length ? fullPartnerOnly : (tabsPartnerOnly?.length ? tabsPartnerOnly : [])
        );
        const filteredMismatches = this.scopeRecordsToMagic(
            fullMismatches.length ? fullMismatches : (tabsMismatches?.length ? tabsMismatches : [])
        );
        return { filteredMatches, filteredBoOnly, filteredPartnerOnly, filteredMismatches };
    }

    private buildAgencyStatsIndex(): void {
        if (!this.response) {
            this.agencyStatsIndex = null;
            this.partnerOnlyWithoutAgencyCount = 0;
            this.partnerOnlyWithAgencyServiceInIndex = false;
            return;
        }

        const index = new Map<string, { matches: number; boOnly: number; mismatches: number; partnerOnly: number }>();
        const ensure = (key: string) => {
            let bucket = index.get(key);
            if (!bucket) {
                bucket = { matches: 0, boOnly: 0, mismatches: 0, partnerOnly: 0 };
                index.set(key, bucket);
            }
            return bucket;
        };

        const { filteredMatches, filteredBoOnly, filteredPartnerOnly, filteredMismatches } = this.getDetailDatasets();

        for (const match of filteredMatches) {
            const info = this.getBoAgencyAndService(match);
            ensure(this.statsKey(info.agency, info.service, info.country)).matches++;
        }
        for (const record of filteredBoOnly) {
            const info = this.getBoOnlyAgencyAndService(record);
            ensure(this.statsKey(info.agency, info.service, info.country)).boOnly++;
        }
        for (const record of filteredMismatches) {
            const info = this.getMismatchAgencyAndService(record);
            ensure(this.statsKey(info.agency, info.service, info.country)).mismatches++;
        }

        this.partnerOnlyWithAgencyServiceInIndex = false;
        this.partnerOnlyWithoutAgencyCount = 0;
        for (const record of filteredPartnerOnly) {
            const info = this.getPartnerOnlyAgencyAndService(record);
            if (info.agency !== 'Inconnue' && info.service !== 'Inconnu') {
                this.partnerOnlyWithAgencyServiceInIndex = true;
                ensure(this.statsKey(info.agency, info.service, info.country)).partnerOnly++;
            } else {
                this.partnerOnlyWithoutAgencyCount++;
            }
        }

        this.agencyStatsIndex = index;
    }

    /**
     * Construit le résumé par agence directement depuis les datasets cloisonnés du rapport
     * (toutes les cards/services sélectionnés). Garantit un affichage "par agence" même quand
     * le résumé transmis par la page résultats ne couvre pas le groupe complet.
     */
    private buildAgencySummaryFromDetailDatasets(): AgencySummaryData[] {
        const { filteredMatches, filteredBoOnly, filteredPartnerOnly, filteredMismatches } = this.getDetailDatasets();
        type Bucket = {
            agency: string; service: string; country: string; date: string;
            totalVolume: number; recordCount: number;
            matches: number; boOnly: number; partnerOnly: number; mismatches: number;
        };
        const map = new Map<string, Bucket>();
        const ensure = (agency: string, service: string, country: string, date: string): Bucket => {
            const key = `${agency}|${service}|${country}`;
            let bucket = map.get(key);
            if (!bucket) {
                bucket = {
                    agency, service, country, date,
                    totalVolume: 0, recordCount: 0, matches: 0, boOnly: 0, partnerOnly: 0, mismatches: 0
                };
                map.set(key, bucket);
            } else if (date > (bucket.date || '')) {
                bucket.date = date;
            }
            return bucket;
        };
        const addBo = (
            agency: string, service: string, country: string, date: string, volume: number,
            kind: 'matches' | 'boOnly' | 'mismatches'
        ) => {
            const bucket = ensure(agency, service, country, date);
            bucket.recordCount += 1;
            bucket.totalVolume += volume || 0;
            if (kind === 'matches') bucket.matches += 1;
            if (kind === 'boOnly') bucket.boOnly += 1;
            if (kind === 'mismatches') bucket.mismatches += 1;
        };
        let partnerOnlyWithoutAgency = 0;
        let hasPartnerOnlyWithAgencyService = false;

        filteredMatches.forEach(match => {
            const info = this.getBoAgencyAndService(match);
            addBo(info.agency, info.service, info.country, info.date, info.volume, 'matches');
        });
        filteredBoOnly.forEach(record => {
            const info = this.getBoOnlyAgencyAndService(record);
            addBo(info.agency, info.service, info.country, info.date, info.volume, 'boOnly');
        });
        filteredMismatches.forEach(record => {
            const info = this.getBoOnlyAgencyAndService(record);
            addBo(info.agency, info.service, info.country, info.date, info.volume, 'mismatches');
        });
        filteredPartnerOnly.forEach(record => {
            const info = this.getPartnerOnlyAgencyAndService(record);
            if (info.agency !== 'Inconnue' && info.service !== 'Inconnu') {
                hasPartnerOnlyWithAgencyService = true;
                ensure(info.agency, info.service, info.country, info.date).partnerOnly += 1;
            } else {
                partnerOnlyWithoutAgency += 1;
            }
        });

        const rows = Array.from(map.values()).sort((a, b) =>
            a.agency !== b.agency ? a.agency.localeCompare(b.agency) : a.service.localeCompare(b.service)
        );
        this.partnerOnlyWithAgencyServiceInIndex = hasPartnerOnlyWithAgencyService;
        this.partnerOnlyWithoutAgencyCount = partnerOnlyWithoutAgency;
        return rows;
    }

    private calculateDetailedStatsForSummaryItem(summaryItem: AgencySummaryData, isFirstLine: boolean = false, partnerOnlyAlreadyAttributed: boolean = false) {
        if (isFirstLine) {
            this.debugLog(`calculateDetailedStatsForSummaryItem - première ligne ${summaryItem.agency}/${summaryItem.service}`);
        }

        if (summaryItem.agency === summaryItem.service && summaryItem.agency && summaryItem.service) {
            return {
                matches: 0,
                boOnly: 0,
                partnerOnly: 0,
                mismatches: 0,
                matchRate: 0
            };
        }

        if (!this.response) {
            return {
                matches: Math.floor(summaryItem.recordCount * 0.8),
                boOnly: Math.floor(summaryItem.recordCount * 0.1),
                partnerOnly: Math.floor(summaryItem.recordCount * 0.05),
                mismatches: Math.floor(summaryItem.recordCount * 0.05),
                matchRate: 80
            };
        }

        if (summaryItem.matches !== undefined && summaryItem.boOnly !== undefined) {
            const shouldCreatePartnerOnlyLineFromContext = (this as any)._shouldCreatePartnerOnlyLine === true;
            let finalPartnerOnly = summaryItem.partnerOnly ?? 0;
            if (isFirstLine && shouldCreatePartnerOnlyLineFromContext) {
                finalPartnerOnly = 0;
            } else if (partnerOnlyAlreadyAttributed || shouldCreatePartnerOnlyLineFromContext) {
                finalPartnerOnly = 0;
            } else if (!this.reconciliationSummaryService.getSummaryMeta().hasPartnerOnlyWithAgencyService) {
                if (isFirstLine && !partnerOnlyAlreadyAttributed) {
                    finalPartnerOnly = this.reconciliationSummaryService.getSummaryMeta().totalPartnerOnly
                        || this.getPartnerOnlyCount();
                } else {
                    finalPartnerOnly = 0;
                }
            }
            const mismatches = summaryItem.mismatches ?? 0;
            const boOnlyOnly = summaryItem.boOnly ?? 0;
            const matches = summaryItem.matches ?? 0;
            const totalTransactions = summaryItem.recordCount || (matches + boOnlyOnly + mismatches + finalPartnerOnly);
            return {
                matches,
                boOnly: boOnlyOnly,
                partnerOnly: finalPartnerOnly,
                mismatches,
                matchRate: totalTransactions > 0 ? (matches / totalTransactions) * 100 : 0
            };
        }

        const shouldCreatePartnerOnlyLineFromContext = (this as any)._shouldCreatePartnerOnlyLine === true;
        const key = this.statsKey(summaryItem.agency, summaryItem.service, summaryItem.country);
        const bucket = this.agencyStatsIndex?.get(key) ?? { matches: 0, boOnly: 0, mismatches: 0, partnerOnly: 0 };

        let finalPartnerOnly = 0;
        if (isFirstLine && shouldCreatePartnerOnlyLineFromContext) {
            finalPartnerOnly = 0;
        } else if (partnerOnlyAlreadyAttributed || shouldCreatePartnerOnlyLineFromContext) {
            finalPartnerOnly = 0;
        } else if (this.partnerOnlyWithAgencyServiceInIndex) {
            finalPartnerOnly = bucket.partnerOnly;
        } else if (isFirstLine && !partnerOnlyAlreadyAttributed && !shouldCreatePartnerOnlyLineFromContext) {
            finalPartnerOnly = this.partnerOnlyWithoutAgencyCount;
        }

        const totalTransactions = summaryItem.recordCount || (bucket.matches + bucket.boOnly + bucket.mismatches + finalPartnerOnly);

        return {
            matches: bucket.matches,
            boOnly: bucket.boOnly,
            partnerOnly: finalPartnerOnly,
            mismatches: bucket.mismatches,
            matchRate: totalTransactions > 0 ? (bucket.matches / totalTransactions) * 100 : 0
        };
    }

    private flexibleMatch(value1: string, value2: string): boolean {
        if (!value1 || !value2) return false;
        // Normaliser les chaînes (supprimer espaces, convertir en minuscules)
        const norm1 = value1.toString().trim().toLowerCase();
        const norm2 = value2.toString().trim().toLowerCase();
        return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
    }

    // Méthodes utilitaires pour extraire les informations d'agence/service/pays
    private getBoAgencyAndService(match: Match) {
        const boData = match.boData;
        return {
            agency: boData['Agence'] || boData['agency'] || boData['agence'] || boData['AGENCE'] || 'Inconnue',
            service: boData['Service'] || boData['service'] || boData['SERVICE'] || this.getMagicServiceTag(boData) || 'Inconnu',
            country: boData['GRX'] || boData['grx'] || boData['Pays provenance'] || boData['country'] || boData['pays'] || boData['PAYS'] || 'Inconnu',
            date: boData['Date'] || boData['date'] || boData['DATE'] || new Date().toISOString().split('T')[0],
            volume: this.parseAmount(boData['montant'] || boData['amount'] || boData['AMOUNT'] || '0')
        };
    }

    private getBoOnlyAgencyAndService(record: Record<string, string>) {
        return {
            agency: record['Agence'] || record['agency'] || record['agence'] || record['AGENCE'] || 'Inconnue',
            service: record['Service'] || record['service'] || record['SERVICE'] || this.getMagicServiceTag(record) || 'Inconnu',
            country: record['GRX'] || record['grx'] || record['Pays provenance'] || record['country'] || record['pays'] || record['PAYS'] || 'Inconnu',
            date: record['Date'] || record['date'] || record['DATE'] || new Date().toISOString().split('T')[0],
            volume: this.parseAmount(record['montant'] || record['amount'] || record['AMOUNT'] || '0')
        };
    }

    private getMagicServiceTag(record: Record<string, string> | undefined): string {
        if (!record) {
            return '';
        }
        return String(record['_magicService'] || '').trim();
    }

    private getPartnerOnlyAgencyAndService(record: Record<string, string>) {
        // Fonction helper pour trouver une valeur avec plusieurs noms de colonnes possibles
        const getValueWithFallback = (possibleKeys: string[]): string => {
            for (const key of possibleKeys) {
                if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                    return record[key].toString().trim();
                }
            }
            return '';
        };

        // Recherche d'agence avec plusieurs noms possibles (priorité aux colonnes partenaire)
        const agency = getValueWithFallback([
            'Code proprietaire', 'Code propriétaire', 'codeProprietaire', 'code_proprietaire',
            'Agent', 'agent', 'AGENT',
            'Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'AGENCY'
        ]) || 'Inconnue';
        
        // Recherche de service avec plusieurs noms possibles (priorité aux colonnes partenaire)
        const service = getValueWithFallback([
            'Type Opération', 'Type opération', 'typeOperation', 'type_operation', 'Type Operation',
            'TRANS TYPE', 'Trans Type', 'transType', 'trans_type',
            'Service', 'service', 'SERVICE', 'serv', 'Serv',
            'TYPE', 'Type', 'type'
        ]) || this.getMagicServiceTag(record) || 'Inconnu';
        
        // Recherche de pays
        const country = getValueWithFallback([
            'groupe de réseau', 'Groupe de réseau', 'groupeReseau', 'groupe_reseau',
            'Pays provenance', 'paysProvenance', 'pays_provenance',
            'Pays', 'pays', 'PAYS', 'country', 'Country', 'COUNTRY'
        ]) || 'Inconnu';
        
        // Recherche de date
        const date = getValueWithFallback([
            'Date opération', 'Date opération', 'dateOperation', 'date_operation', 'Date Operation',
            'TIMESTAMP', 'Timestamp', 'timestamp',
            'Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR'
        ]) || new Date().toISOString().split('T')[0];
        
        // Recherche de volume/montant
        const volumeStr = getValueWithFallback([
            'Montant', 'montant', 'MONTANT', 'amount', 'Amount', 'AMOUNT',
            'volume', 'Volume', 'VOLUME'
        ]);
        const volume = volumeStr ? this.parseAmount(volumeStr) : 0;

        return { agency, service, country, date, volume };
    }

    private getMismatchAgencyAndService(record: Record<string, string>) {
        return {
            agency: record['Agence'] || record['agency'] || record['agence'] || record['AGENCE'] || 'Inconnue',
            service: record['Service'] || record['service'] || record['SERVICE'] || this.getMagicServiceTag(record) || 'Inconnu',
            country: record['GRX'] || record['grx'] || record['Pays provenance'] || record['country'] || record['pays'] || record['PAYS'] || 'Inconnu',
            date: record['Date'] || record['date'] || record['DATE'] || new Date().toISOString().split('T')[0],
            volume: this.parseAmount(record['montant'] || record['amount'] || record['AMOUNT'] || '0')
        };
    }

    private generateReportData() {
        if (!this.response) return;

        // Récupérer les données filtrées des onglets (fallback sur la réponse si paginée),
        // cloisonnées sur la card (service) sélectionnée en mode réconciliation magique.
        const { filteredMatches, filteredBoOnly, filteredPartnerOnly, filteredMismatches } = this.getDetailDatasets();

        // Grouper les données par agence, service, pays et date
        const groupedData = new Map<string, ReconciliationReportData>();

        // Traiter les correspondances (onglet matches)
        filteredMatches.forEach(match => {
            const key = this.getGroupKey(match.boData);
            if (!groupedData.has(key)) {
                groupedData.set(key, this.createEmptyReportData(match.boData));
            }
            const data = groupedData.get(key)!;
            data.matches++;
            data.totalVolume += this.parseAmount(match.boData['amount'] || match.boData['montant'] || '0');
        });

        // Traiter les écarts BO (onglet boOnly)
        filteredBoOnly.forEach(record => {
            const key = this.getGroupKey(record);
            if (!groupedData.has(key)) {
                groupedData.set(key, this.createEmptyReportData(record));
            }
            const data = groupedData.get(key)!;
            data.boOnly++;
            data.totalVolume += this.parseAmount(record['amount'] || record['montant'] || '0');
        });

        // Traiter les écarts Partenaire (onglet partnerOnly)
        filteredPartnerOnly.forEach(record => {
            const key = this.getGroupKey(record);
            if (!groupedData.has(key)) {
                groupedData.set(key, this.createEmptyReportData(record));
            }
            const data = groupedData.get(key)!;
            data.partnerOnly++;
            data.totalVolume += this.parseAmount(record['amount'] || record['montant'] || '0');
        });

        // Traiter les incohérences (mismatches - incluses dans les écarts BO)
        filteredMismatches.forEach(record => {
            const key = this.getGroupKey(record);
            if (!groupedData.has(key)) {
                groupedData.set(key, this.createEmptyReportData(record));
            }
            const data = groupedData.get(key)!;
            data.mismatches++;
            data.totalVolume += this.parseAmount(record['amount'] || record['montant'] || '0');
        });

        // Calculer les taux de correspondance (valeur initiale)
        this.reportData = Array.from(groupedData.values()).map(data => {
            // Calculer le nombre total de transactions (correspondances + écarts BO + écarts partenaires + incohérences)
            const totalTransactions = data.matches + data.boOnly + data.partnerOnly + data.mismatches;
            const rate = totalTransactions > 0 ? (data.matches / totalTransactions) * 100 : 0;

            // Définir le traitement par défaut selon la présence d'écarts
            // Convertir en nombres pour s'assurer que les valeurs sont numériques
            const boOnlyNum = Number(data.boOnly) || 0;
            const partnerOnlyNum = Number(data.partnerOnly) || 0;
            const mismatchesNum = Number(data.mismatches) || 0;
            const totalEcarts = boOnlyNum + partnerOnlyNum + mismatchesNum;
            const traitementDefault = totalEcarts > 0 ? 'Niveau Support' : 'Responsable CDO';
            
            const reportItem: ReconciliationReportData = {
                ...data,
                totalTransactions: totalTransactions,
                matchRate: rate,
                status: this.computeStatusFromCounts(
                    data.matches,
                    data.boOnly,
                    data.partnerOnly,
                    data.mismatches,
                    totalTransactions
                ),
                comment: '',
                traitement: traitementDefault
            };
            this.updateCommentFromCounts(
                reportItem,
                data.matches,
                data.boOnly,
                data.partnerOnly,
                data.mismatches,
                { force: true }
            );
            return reportItem;
        });
        this.enforceDefaultStatusForReportData();
        
        // FORCER toutes les lignes avec statut OK à avoir traitement = "Responsable CDO"
        this.enforceTraitementForOkStatus();

        // Appliquer la règle métier de recalcul sur chaque ligne
        this.reportData.forEach(item => {
            // Ne pas recalculer la ligne des écarts partenaires
            if (!this.isPartnerOnlySpecialLine(item)) {
                this.recalculateMatchRate(item);
                this.syncCommentWithValues(item);
            } else {
                // Pour la ligne des écarts partenaires, FORCER toutes les valeurs pour éviter toute modification
                this.enforcePartnerOnlyLineValues(item);
            }
        });
        
        // Protection finale: s'assurer que toutes les lignes spéciales ont les bonnes valeurs
        this.reportData.forEach(item => {
            if (this.isPartnerOnlySpecialLine(item)) {
                this.enforcePartnerOnlyLineValues(item);
            }
        });
        
        // Trier par date décroissante (les plus récentes en premier)
        this.reportData.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA; // Décroissant (plus récent en premier)
        });
        
        // Mettre à jour la pagination après génération des données
        this.updatePagination();

        this.syncLastSavedGlpiValues(this.reportData);
    }

    private getGroupKey(record: Record<string, string>): string {
        const agency =
            record['Code proprietaire'] ||
            record['Code propriétaire'] ||
            record['codeProprietaire'] ||
            record['code_proprietaire'] ||
            record['Agent'] ||
            record['agent'] ||
            record['AGENT'] ||
            record['agency'] ||
            record['agence'] ||
            record['Agence'] ||
            record['AGENCE'] ||
            '';

        const service =
            record['_magicService'] ||
            record['Type Opération'] ||
            record['Type opération'] ||
            record['typeOperation'] ||
            record['type_operation'] ||
            record['Type Operation'] ||
            record['TRANS TYPE'] ||
            record['Trans Type'] ||
            record['service'] ||
            record['Service'] ||
            record['SERVICE'] ||
            record['serv'] ||
            record['Serv'] ||
            record['type'] ||
            record['TYPE'] ||
            '';

        const country =
            record['groupe de réseau'] ||
            record['Groupe de réseau'] ||
            record['groupeReseau'] ||
            record['groupe_reseau'] ||
            record['GRX'] ||
            record['grx'] ||
            record['country'] ||
            record['Pays provenance'] ||
            record['Pays'] ||
            record['PAYS'] ||
            record['pays'] ||
            '';

        const rawDate =
            record['Date opération'] ||
            record['dateOperation'] ||
            record['date_operation'] ||
            record['Date Operation'] ||
            record['TIMESTAMP'] ||
            record['Timestamp'] ||
            record['timestamp'] ||
            record['Date'] ||
            record['DATE'] ||
            record['date'] ||
            record['jour'] ||
            record['Jour'] ||
            record['JOUR'] ||
            record['transaction_date'] ||
            '';

        const date = rawDate && String(rawDate).trim() !== ''
            ? String(rawDate)
            : new Date().toISOString().split('T')[0];

        const safeAgency = agency || 'Inconnue';
        const safeService = service || 'Inconnu';
        const safeCountry = country || 'Inconnu';
        
        return `${safeAgency}|${safeService}|${safeCountry}|${date}`;
    }

    private createEmptyReportData(record: Record<string, string>): ReconciliationReportData {
        const agency =
            record['Code proprietaire'] ||
            record['Code propriétaire'] ||
            record['codeProprietaire'] ||
            record['code_proprietaire'] ||
            record['Agent'] ||
            record['agent'] ||
            record['AGENT'] ||
            record['agency'] ||
            record['agence'] ||
            record['Agence'] ||
            record['AGENCE'] ||
            '';

        const service =
            record['_magicService'] ||
            record['Type Opération'] ||
            record['Type opération'] ||
            record['typeOperation'] ||
            record['type_operation'] ||
            record['Type Operation'] ||
            record['TRANS TYPE'] ||
            record['Trans Type'] ||
            record['service'] ||
            record['Service'] ||
            record['SERVICE'] ||
            record['serv'] ||
            record['Serv'] ||
            record['type'] ||
            record['TYPE'] ||
            '';

        const country =
            record['groupe de réseau'] ||
            record['Groupe de réseau'] ||
            record['groupeReseau'] ||
            record['groupe_reseau'] ||
            record['GRX'] ||
            record['grx'] ||
            record['country'] ||
            record['Pays provenance'] ||
            record['Pays'] ||
            record['PAYS'] ||
            record['pays'] ||
            '';

        const rawDate =
            record['Date opération'] ||
            record['dateOperation'] ||
            record['date_operation'] ||
            record['Date Operation'] ||
            record['TIMESTAMP'] ||
            record['Timestamp'] ||
            record['timestamp'] ||
            record['Date'] ||
            record['DATE'] ||
            record['date'] ||
            record['jour'] ||
            record['Jour'] ||
            record['JOUR'] ||
            record['transaction_date'] ||
            '';

        const date = rawDate && String(rawDate).trim() !== ''
            ? String(rawDate)
            : new Date().toISOString().split('T')[0];

        const safeAgency = agency || 'Inconnue';
        const safeService = service || 'Inconnu';
        const safeCountry = country || 'Inconnu';

        return {
            date,
            agency: safeAgency,
            service: safeService,
            country: safeCountry,
            glpiId: '',
            totalTransactions: 0,
            totalVolume: 0,
            matches: 0,
            boOnly: 0,
            partnerOnly: 0,
            mismatches: 0,
            matchRate: 0,
            status: this.DEFAULT_STATUS,
            comment: '',
            traitement: undefined
        };
    }

    private parseAmount(amount: string): number {
        if (!amount) return 0;
        const cleaned = amount.replace(/[^\d.-]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }

    private extractUniqueValues() {
        this.uniqueAgencies = [...new Set(this.reportData.map(item => item.agency))].sort();
        this.uniqueServices = [...new Set(this.reportData.map(item => item.service))].sort();
        // Toujours exposer les pays sous forme de libellés (ex. GA → Gabon).
        // On garde le matching tolérant via countriesMatch au moment des filtres.
        const normalizedCountries = this.reportData
            .map(item => {
                const raw = (item.country || '').trim();
                if (!raw) return '';
                return countryNameFromCode(raw) || raw;
            })
            .filter(country => country && country.trim() !== '');
        this.uniqueCountries = [...new Set(normalizedCountries)].sort((a, b) => a.localeCompare(b, 'fr'));
        this.uniqueDates = [...new Set(this.reportData.map(item => item.date))].sort();
        this.uniqueStatuses = [...new Set(this.reportData.map(item => item.status).filter(status => status && status.trim() !== ''))].sort();
        this.uniqueEnvs = [...new Set(this.reportData.map(item => this.normalizeReleveEnvKey(item.env)))].filter(e => e !== '').sort();
        
        this.filteredAgencies = [...this.uniqueAgencies];
        this.filteredServices = [...this.uniqueServices];
        this.filteredCountries = [...this.uniqueCountries];
        this.updateFilteredAgencies();
        this.updateFilteredCountries();
        this.updateFilteredServices();
        this.updateFilteredTraitements();
        this.refreshDropdownLists();
    }

    /**
     * Met à jour les valeurs de traitement proposées selon les filtres actifs
     * (agence, pays, service, statut, ENV, dates, ticket…) — hors filtre traitement lui-même.
     */
    private updateFilteredTraitements(): void {
        const traitements = new Set<string>();
        this.reportData
            .filter(item => this.matchesBaseReportFilters(item, { excludeTraitement: true }))
            .forEach(item => {
                const value = this.getEffectiveTraitementValue(item);
                if (value) {
                    traitements.add(value);
                }
            });

        const ordered = this.traitementOptions.filter(t => traitements.has(t));
        const extras = [...traitements].filter(t => !this.traitementOptions.includes(t)).sort();
        this.filteredTraitementOptions = [...ordered, ...extras];

        this.selectedTraitements = this.selectedTraitements.filter(t =>
            this.filteredTraitementOptions.includes(t)
        );
    }

    /**
     * Met à jour la liste des agences filtrées selon le pays et l’ENV sélectionnés.
     */
    private updateFilteredAgencies(envOverride?: string[] | null): void {
        const envsForFilter =
            envOverride !== undefined && envOverride !== null ? envOverride : this.selectedEnvs;
        const noCountry = this.selectedCountries.length === 0;

        if (noCountry && (!envsForFilter || envsForFilter.length === 0)) {
            this.filteredAgencies = [...this.uniqueAgencies];
            return;
        }

        const agenciesFor = new Set<string>();
        this.reportData
            .filter(item => {
                const matchesCountry =
                    noCountry ||
                    this.selectedCountries.some(sel => countriesMatch(sel, item.country));
                return matchesCountry && this.itemMatchesEnvFilter(item.env, envsForFilter);
            })
            .forEach(item => agenciesFor.add(item.agency));

        this.filteredAgencies = Array.from(agenciesFor).sort();
    }

    /**
     * Met à jour la liste des pays proposés selon les agences et l’ENV (cohérent avec le cloisonnement service).
     */
    private updateFilteredCountries(envOverride?: string[] | null): void {
        const envsForFilter =
            envOverride !== undefined && envOverride !== null ? envOverride : this.selectedEnvs;
        const noAgency = this.selectedAgencies.length === 0;

        if (noAgency && (!envsForFilter || envsForFilter.length === 0)) {
            this.filteredCountries = [...this.uniqueCountries];
            return;
        }

        const countries = new Set<string>();
        this.reportData
            .filter(item => {
                const matchesAgency = noAgency || this.selectedAgencies.includes(item.agency);
                return matchesAgency && this.itemMatchesEnvFilter(item.env, envsForFilter);
            })
            .forEach(item => {
                if (item.country && item.country.trim()) {
                    const raw = item.country.trim();
                    countries.add(countryNameFromCode(raw) || raw);
                }
            });
        this.filteredCountries = Array.from(countries).sort();
    }

    /**
     * Met à jour la liste des services filtrés selon pays, agence et ENV sélectionnés (ENV cloisonne les services proposés).
     * @param envSelectionOverride Valeur ENV à appliquer tout de suite (ex. depuis ngModelChange du filtre ENV).
     */
    private updateFilteredServices(envSelectionOverride?: string[] | null): void {
        const envsForFilter =
            envSelectionOverride !== undefined && envSelectionOverride !== null
                ? envSelectionOverride
                : this.selectedEnvs;
        const noCountry = this.selectedCountries.length === 0;
        const noAgency = this.selectedAgencies.length === 0;

        if (noCountry && noAgency && (!envsForFilter || envsForFilter.length === 0)) {
            this.filteredServices = [...this.uniqueServices];
            return;
        }

        const servicesForSelection = new Set<string>();
        this.reportData
            .filter(item => {
                const matchesCountry =
                    noCountry ||
                    this.selectedCountries.some(sel => countriesMatch(sel, item.country));
                const matchesAgency = noAgency || this.selectedAgencies.includes(item.agency);
                return (
                    matchesCountry &&
                    matchesAgency &&
                    this.itemMatchesEnvFilter(item.env, envsForFilter)
                );
            })
            .forEach(item => servicesForSelection.add(item.service));

        this.filteredServices = Array.from(servicesForSelection).sort();
    }

    private initSearchSubscriptions(): void {
        this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            this.filteredAgenciesDropdown = this.filteredAgencies.filter(a => a.toLowerCase().includes(s));
        });
        this.serviceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const raw = (search || '').trim();
            const s = raw.toLowerCase();
            this.filteredServicesDropdown = this.filteredServices.filter(a => a.toLowerCase().includes(s));
            if (!raw) {
                this.selectedServices = [];
            } else {
                this.selectedServices = this.filteredServices.filter(a => a.toLowerCase().includes(s));
            }
            this.filterReport();
        });
        this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            this.filteredCountriesDropdown = this.filteredCountries.filter(a => a.toLowerCase().includes(s));
        });
    }

    private refreshDropdownLists(): void {
        this.filteredAgenciesDropdown = [...this.filteredAgencies];
        this.filteredServicesDropdown = [...this.filteredServices];
        this.filteredCountriesDropdown = [...this.filteredCountries];
        this.agenceSearchCtrl.setValue('', { emitEvent: false });
        this.serviceSearchCtrl.setValue('', { emitEvent: false });
        this.paysSearchCtrl.setValue('', { emitEvent: false });
    }

    /** Ferme le panneau du mat-select (multi) après un clic : évite la liste « figée » ouverte. */
    private closeFilterMatSelectPanel(select?: MatSelect): void {
        setTimeout(() => select?.close(), 0);
    }

    onAgencyNgModelChange(agencies: string[] | null | undefined): void {
        this.selectedAgencies = Array.isArray(agencies) ? [...agencies] : [];
        this.updateFilteredCountries();
        this.updateFilteredServices();
        this.refreshDropdownLists();
        this.filterReport();
        this.closeFilterMatSelectPanel(this.agenceSelect);
    }

    onCountryNgModelChange(countries: string[] | null | undefined): void {
        this.selectedCountries = Array.isArray(countries) ? [...countries] : [];
        this.updateFilteredAgencies();
        this.selectedAgencies = this.selectedAgencies.filter(a =>
            this.filteredAgencies.includes(a)
        );
        this.updateFilteredCountries();
        this.updateFilteredServices();
        this.selectedServices = this.selectedServices.filter(s =>
            this.filteredServices.includes(s)
        );
        this.refreshDropdownLists();
        this.filterReport();
        this.closeFilterMatSelectPanel(this.paysSelect);
    }

    onServiceNgModelChange(services: string[] | null | undefined): void {
        this.selectedServices = Array.isArray(services) ? [...services] : [];
        this.filterReport();
        this.closeFilterMatSelectPanel(this.serviceSelect);
    }

    onStatusNgModelChange(statuses: string[] | null | undefined): void {
        this.selectedStatuses = Array.isArray(statuses) ? [...statuses] : [];
        this.filterReport();
        this.closeFilterMatSelectPanel(this.statusSelect);
    }

    onTraitementNgModelChange(traitements: string[] | null | undefined): void {
        this.selectedTraitements = Array.isArray(traitements) ? [...traitements] : [];
        this.filterReport();
        this.closeFilterMatSelectPanel(this.traitementSelect);
    }

    /** @deprecated Utiliser onAgencyNgModelChange — conservé pour compatibilité interne. */
    onAgencySelectionChange(): void {
        this.onAgencyNgModelChange(this.selectedAgencies);
    }

    /** @deprecated Utiliser onCountryNgModelChange */
    onCountrySelectionChange(): void {
        this.onCountryNgModelChange(this.selectedCountries);
    }

    /** @deprecated Utiliser onServiceNgModelChange */
    onServiceSelectionChange(): void {
        this.onServiceNgModelChange(this.selectedServices);
    }

    /** @deprecated Utiliser onStatusNgModelChange */
    onStatusSelectionChange(): void {
        this.onStatusNgModelChange(this.selectedStatuses);
    }

    /** @deprecated Utiliser onTraitementNgModelChange */
    onTraitementSelectionChange(): void {
        this.onTraitementNgModelChange(this.selectedTraitements);
    }

    /**
     * Filtre ENV : utiliser ngModelChange (valeur à jour) plutôt que selectionChange (souvent vide avec mat-select multiple).
     */
    onEnvNgModelChange(envs: string[] | null | undefined): void {
        this.selectedEnvs = Array.isArray(envs) ? [...envs] : [];
        const snapshot = [...this.selectedEnvs];
        this.applyEnvDependentDropdowns(snapshot);
        this.filterReport();
        this.closeFilterMatSelectPanel(this.envSelect);
    }

    /** Recalcule agences / pays / services proposés pour les listes déroulantes selon la sélection ENV courante. */
    private applyEnvDependentDropdowns(envsSnapshot: string[]): void {
        this.updateFilteredAgencies(envsSnapshot);
        this.selectedAgencies = this.selectedAgencies.filter(a => this.filteredAgencies.includes(a));
        this.updateFilteredCountries(envsSnapshot);
        this.selectedCountries = this.selectedCountries.filter(c => this.filteredCountries.includes(c));
        this.updateFilteredServices(envsSnapshot);
        this.selectedServices = this.selectedServices.filter(s => this.filteredServices.includes(s));
        this.refreshDropdownLists();
    }

    onTicketIdFilterChange(value: string): void {
        this.ticketIdFilter = value;
        this.filterReport();
    }

    clearTicketIdFilter(): void {
        this.ticketIdFilter = '';
        this.filterReport();
    }

    clearDateFilters(): void {
        this.selectedDateDebut = '';
        this.selectedDateFin = '';
        this.filterReport();
    }

    clearAgencyFilter(): void {
        this.selectedAgencies = [];
        this.updateFilteredCountries();
        this.updateFilteredServices();
        this.refreshDropdownLists();
        this.filterReport();
    }

    clearServiceFilter(): void {
        this.selectedServices = [];
        this.refreshDropdownLists();
        this.filterReport();
    }

    clearCountryFilter(): void {
        this.selectedCountries = [];
        this.updateFilteredAgencies();
        this.updateFilteredCountries();
        this.updateFilteredServices();
        this.refreshDropdownLists();
        this.filterReport();
    }

    clearTraitementFilter(): void {
        this.selectedTraitements = [];
        this.filterReport();
    }

    toggleShowAllMonths(): void {
        this.showAllMonths = !this.showAllMonths;
        this.currentPage = 1; // Toujours revenir à la page 1 pour afficher les données cohérentes
        if (this.loadedFromDb && this.shouldReloadSavedReportForCurrentScope()) {
            this.dbLoadToken++;
            this.loadSavedReportFromDatabase();
            return;
        }
        this.filterReport(); // filterReport() appelle updatePagination() en fin
    }

    filterByInProgress(): void {
        if (this.activeCardFilter === 'inProgress') {
            // Si déjà actif, désactiver le filtre
            this.activeCardFilter = null;
        } else {
            this.activeCardFilter = 'inProgress';
        }
        this.filterReport();
    }

    filterByTreated(): void {
        if (this.activeCardFilter === 'treated') {
            // Si déjà actif, désactiver le filtre
            this.activeCardFilter = null;
        } else {
            this.activeCardFilter = 'treated';
        }
        this.filterReport();
    }

    filterByTicketsToCreate(): void {
        if (this.activeCardFilter === 'ticketsToCreate') {
            // Si déjà actif, désactiver le filtre
            this.activeCardFilter = null;
        } else {
            this.activeCardFilter = 'ticketsToCreate';
        }
        this.filterReport();
    }

    toggleFilterByBoEcart(): void {
        this.activeEcartColumnFilter =
            this.activeEcartColumnFilter === 'boOnly' ? null : 'boOnly';
        this.filterReport();
    }

    toggleFilterByPartnerEcart(): void {
        this.activeEcartColumnFilter =
            this.activeEcartColumnFilter === 'partnerOnly' ? null : 'partnerOnly';
        this.filterReport();
    }

    /** Retourne true si la date de l'item est dans le mois précédent OU le 1er du mois courant
     *  (comparaison locale, insensible timezone). La période affichée par défaut est donc le
     *  mois précédent (du 01 au 01 du mois courant). */
    private isItemInCurrentMonth(itemDateStr: string): boolean {
        if (!itemDateStr || typeof itemDateStr !== 'string') return false;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        // Mois précédent (0-indexed) avec gestion du passage janvier → décembre de l'année précédente
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        // Chaîne YYYY-MM-DD : extraire année/mois en local pour éviter décalage timezone
        const match = itemDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const y = parseInt(match[1], 10);
            const m = parseInt(match[2], 10) - 1; // 0-indexed
            const day = parseInt(match[3], 10);
            // Dans le mois précédent (tous les jours)
            if (y === prevYear && m === prevMonth) return true;
            // Ou le 1er du mois courant
            if (y === currentYear && m === currentMonth && day === 1) return true;
            return false;
        }
        const d = new Date(itemDateStr);
        if (isNaN(d.getTime())) return false;
        const inPrevMonth = d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        const isFirstCurrentMonth =
            d.getDate() === 1 && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        return inPrevMonth || isFirstCurrentMonth;
    }

    private hasExplicitDateFilter(): boolean {
        return !!(this.selectedDateDebut || this.selectedDateFin);
    }

    private toYmdLocal(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    private currentMonthDateRange(): { startDate: string; endDate: string } {
        const now = new Date();
        // Période par défaut = mois précédent : du 01 du mois précédent au 01 du mois courant (inclus).
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: this.toYmdLocal(first), endDate: this.toYmdLocal(last) };
    }

    private getDbReportFetchScope(): { startDate?: string; endDate?: string; key: string } {
        const startRaw = (this.selectedDateDebut || '').trim();
        const endRaw = (this.selectedDateFin || '').trim();
        if (startRaw || endRaw) {
            const normalized = this.normalizeDbReportDateBounds(startRaw, endRaw);
            return {
                startDate: normalized.start,
                endDate: normalized.end,
                key: `range:${normalized.start}:${normalized.end}`
            };
        }
        if (!this.showAllMonths) {
            const month = this.currentMonthDateRange();
            return { ...month, key: `month:${month.startDate}:${month.endDate}` };
        }
        return { key: 'all' };
    }

    /** Une seule borne saisie → jour unique ; bornes inversées → échange. */
    private normalizeDbReportDateBounds(
        startRaw: string,
        endRaw: string
    ): { start: string; end: string } {
        let start = startRaw;
        let end = endRaw;
        if (start && !end) {
            end = start;
        } else if (!start && end) {
            start = end;
        }
        if (start && end && start > end) {
            const t = start;
            start = end;
            end = t;
        }
        return { start, end };
    }

    /** Pays transmis à l’API pour éviter le refus 413 (période multi-jours sans filtre pays). */
    private resolveCountryParamForApi(): string | undefined {
        if (this.selectedCountries.length === 1) {
            return this.selectedCountries[0];
        }
        const profileNames = this.appStateService.getProfileCountryNames();
        if (profileNames.length === 1) {
            return profileNames[0];
        }
        const scope = this.appStateService.getUserPaysScope();
        if (scope?.codes?.length === 1) {
            return countryNameFromCode(scope.codes[0]) || scope.codes[0];
        }
        return undefined;
    }

    private shouldReloadSavedReportForCurrentScope(): boolean {
        if (this.currentSource === 'live') {
            return false;
        }
        if (this.isLoadingDbReport) {
            return false;
        }
        return this.getDbReportFetchScope().key !== this.lastDbReportFetchKey;
    }

    private matchesBaseReportFilters(
        item: ReconciliationReportData,
        options?: { excludeTraitement?: boolean }
    ): boolean {
        if (this.currentSource !== 'live' && !this.showAllMonths && !this.hasExplicitDateFilter() && item.date) {
            if (!this.isItemInCurrentMonth(item.date)) {
                return false;
            }
        }

        if (this.allowedCountriesResolved && !this.shouldIncludeCountry(item.country || '')) {
            return false;
        }

        const agencyMatch = this.selectedAgencies.length === 0 || this.selectedAgencies.includes(item.agency);
        const qSvc = (this.serviceSearchCtrl.value || '').trim();
        const serviceMatch =
            qSvc.length > 0
                ? this.selectedServices.includes(item.service)
                : this.selectedServices.length === 0 || this.selectedServices.includes(item.service);
        const countryFilterMatch =
            this.selectedCountries.length === 0 ||
            this.selectedCountries.some(sel => countriesMatch(sel, item.country));
        const statusMatch = this.selectedStatuses.length === 0 || this.selectedStatuses.includes(item.status);
        const traitementMatch = options?.excludeTraitement
            || this.selectedTraitements.length === 0
            || this.selectedTraitements.includes(this.getEffectiveTraitementValue(item));
        const envMatch = this.itemMatchesEnvFilter(item.env, this.selectedEnvs);
        const ticketFilter = (this.ticketIdFilter || '').trim().toLowerCase();
        const ticketMatch = !ticketFilter || (item.glpiId || '').toLowerCase().includes(ticketFilter);

        if (this.selectedDateDebut || this.selectedDateFin) {
            const bounds = this.normalizeDbReportDateBounds(
                (this.selectedDateDebut || '').trim(),
                (this.selectedDateFin || '').trim()
            );
            const itemYmd = this.formatDateForSearch(item.date);
            if (bounds.start && itemYmd < bounds.start) {
                return false;
            }
            if (bounds.end && itemYmd > bounds.end) {
                return false;
            }
        }

        return agencyMatch && serviceMatch && countryFilterMatch && statusMatch && traitementMatch && envMatch && ticketMatch;
    }

    private matchesCardAndEcartFilters(item: ReconciliationReportData): boolean {
        if (this.activeCardFilter === 'inProgress') {
            const status = (item.status || '').trim().toUpperCase();
            const isOk = status === 'OK';
            const boOnly = Number(item.boOnly) || 0;
            const partnerOnly = Number(item.partnerOnly) || 0;
            const mismatches = Number(item.mismatches) || 0;
            const totalEcarts = boOnly + partnerOnly + mismatches;
            if (isOk || totalEcarts <= 0) {
                return false;
            }
        }

        if (this.activeEcartColumnFilter === 'boOnly') {
            return (Number(item.boOnly) || 0) > 0;
        }
        if (this.activeEcartColumnFilter === 'partnerOnly') {
            return this.getDisplayPartnerOnly(item) > 0;
        }

        return true;
    }

    filterReport() {
        if (this.loadedFromDb && this.shouldReloadSavedReportForCurrentScope()) {
            this.dbLoadToken++;
            this.loadSavedReportFromDatabase();
            return;
        }

        this.updateFilteredTraitements();

        this.kpiScopeData = this.reportData.filter((item) => this.matchesBaseReportFilters(item));

        this.filteredReportData = this.kpiScopeData.filter((item) => this.matchesCardAndEcartFilters(item));
        
        // FORCER les lignes OK sans niveau avancé à Responsable CDO
        this.filteredReportData.forEach(item => {
            item.traitement = this.getEffectiveTraitementValue(item);
        });
        
        // Trier par date décroissante (les plus récentes en premier)
        this.filteredReportData.sort((a, b) => this.getSortableDateTime(b.date) - this.getSortableDateTime(a.date));

        this.refreshKpiSummary();
        
        // Réinitialiser à la première page et mettre à jour la pagination
        this.currentPage = 1;
        this.updatePagination();

        // Si on vient du dashboard avec une demande spécifique de relevé, tenter de l'ouvrir
        this.tryOpenReleveFromDashboard();
    }

    /**
     * Si des paramètres (pays, service, date) ont été fournis via l'URL,
     * ouvre automatiquement le relevé correspondant une fois les données chargées/filtrées.
     */
    private tryOpenReleveFromDashboard(): void {
        if (!this.pendingReleveFromDashboard || !this.filteredReportData || this.filteredReportData.length === 0) {
            return;
        }

        const target = this.pendingReleveFromDashboard;
        const targetDate = this.formatDateForSearch(target.date);

        const matchingItem = this.filteredReportData.find(item =>
            item &&
            item.country === target.country &&
            item.service === target.service &&
            this.formatDateForSearch(item.date) === targetDate &&
            item.status === 'OK' &&
            (!target.env ||
                target.env === 'ALL' ||
                this.normalizeReleveEnvKey(item.env) === this.normalizeReleveEnvKey(target.env))
        );

        if (matchingItem) {
            if (target.env && target.env !== 'ALL') {
                this.releveEnv = this.normalizeReleveEnvKey(target.env);
            }
            this.showReleveModal(matchingItem);
            this.pendingReleveFromDashboard = null;
        }
    }

    private refreshKpiSummary(): void {
        const rows = this.kpiScopeData || [];
        // KPIs "Lignes/Agences/Services/Taux moyen/Nbre TRX/Volume" :
        // on exclut la ligne spéciale multi-agences (écarts Partenaire) pour ne pas fausser les compteurs.
        const kpiRows = rows.filter(item => !this.isPartnerOnlySpecialLine(item));
        let totalTransactions = 0;
        let totalVolume = 0;
        let inProgressDiscrepancies = 0;

        for (const item of kpiRows) {
            totalTransactions += Number(item.totalTransactions) || 0;
            totalVolume += Number(item.totalVolume) || 0;
        }

        for (const item of rows) {
            const status = (item.status || '').trim().toUpperCase();
            if (status !== 'OK') {
                inProgressDiscrepancies +=
                    (Number(item.boOnly) || 0) +
                    (Number(item.partnerOnly) || 0) +
                    (Number(item.mismatches) || 0);
            }
        }

        const averageMatchRate =
            kpiRows.length === 0
                ? 0
                : Math.round((kpiRows.reduce((sum, item) => sum + (Number(item.matchRate) || 0), 0) / kpiRows.length) * 100) / 100;

        this.kpiSummary = {
            lineCount: kpiRows.length,
            agencies: new Set(kpiRows.map((item) => item.agency).filter(Boolean)).size,
            services: new Set(kpiRows.map((item) => item.service).filter(Boolean)).size,
            averageMatchRate,
            inProgressDiscrepancies,
            totalTransactions,
            totalVolume
        };
    }

    formatDate(dateStr: string): string {
        const raw = (dateStr ?? '').toString().trim();
        if (!raw) {
            return '';
        }
        const date = new Date(raw);
        if (isNaN(date.getTime()) || date.toString() === 'Invalid Date') {
            // Ne jamais afficher "Invalid Date" dans le tableau
            return raw;
        }
        return date.toLocaleDateString('fr-FR');
    }

    /** Tri stable : date invalide => en bas (timestamp = 0). */
    private getSortableDateTime(value: string | undefined | null): number {
        const raw = (value ?? '').toString().trim();
        if (!raw) {
            return 0;
        }
        const d = new Date(raw);
        const t = d.getTime();
        return isNaN(t) ? 0 : t;
    }


    private computeStatusFromCounts(matches: number, boOnly: number, partnerOnly: number, mismatches: number, totalTransactions: number): string {
        // Indisponible si aucun enregistrement
        if (totalTransactions === 0) return 'REPORTING INDISPONIBLE';

        // ✅ Forcer OK dès que le taux est à 100% (aucun écart) même sans données "response"
        if (boOnly === 0 && partnerOnly === 0 && mismatches === 0 && matches === totalTransactions) {
            return 'OK';
        }

        // En cours si les données détaillées ne sont pas encore disponibles
        if (!this.response) return 'EN COURS.....';

        // Si on a un écart, statut par défaut = NOK
        if (boOnly > 0 || partnerOnly > 0 || mismatches > 0) return 'NOK';

        // Incomplet si uniquement un côté est présent sans correspondances
        if (matches === 0 && ((boOnly > 0 && partnerOnly === 0) || (partnerOnly > 0 && boOnly === 0))) return 'REPORTING INCOMPLET';

        // Sinon statut par défaut "EN COURS"
        return this.DEFAULT_STATUS;
    }

    private buildCommentForCounts(matches: number, boOnly: number, partnerOnly: number, mismatches: number, totalTransactions?: number): string {
        // Calculer le total des transactions si non fourni
        const total = totalTransactions !== undefined ? totalTransactions : (matches + boOnly + partnerOnly + mismatches);
        
        // Si pas d'écarts OU si toutes les transactions sont des correspondances, retourner le commentaire par défaut
        // "Pas d'écarts" seulement si tous les écarts sont à 0.
        // Ne pas utiliser "matches === total" comme raccourci, car les règles métier
        // peuvent faire que matches == total même si partnerOnly > 0 (et on doit alors l'afficher).
        if (boOnly === 0 && partnerOnly === 0 && mismatches === 0) {
            return "PAS D'ECARTS CONSTATES";
        }

        // Afficher les valeurs réelles dans le commentaire (sans soustraction)
        const parts: string[] = [];
        parts.push(`${matches} correspondances`);
        if (boOnly > 0) parts.push(`${boOnly} écart(s) BO`);
        if (partnerOnly > 0) parts.push(`${partnerOnly} écart(s) Partenaire`);
        if (mismatches > 0) parts.push(`${mismatches} incohérence(s)`);
        return parts.join(' • ');
    }

    private shouldAutoUpdateComment(item: ReconciliationReportData | null | undefined, options?: { force?: boolean }): boolean {
        return !!options?.force;
    }

    private updateCommentFromCounts(
        item: ReconciliationReportData,
        matches: number,
        boOnly: number,
        partnerOnly: number,
        mismatches: number,
        options?: { force?: boolean }
    ): void {
        if (!item) {
            return;
        }
        
        // Ne pas mettre à jour le commentaire si l'utilisateur est en train de modifier manuellement les écarts
        if (this.isManuallyEditingEcart) {
            this.debugLog('🔒 updateCommentFromCounts: Modification manuelle en cours - skip pour', item.agency, item.service);
            return;
        }
        
        // PROTECTION ABSOLUE : Pour le statut OK, le commentaire ne doit JAMAIS être modifié,
        // même si `force` est activé ailleurs.
        if (item.status === 'OK') {
            this.debugLog('🔒 updateCommentFromCounts: Commentaire préservé pour ligne avec statut OK', item.id, item.agency, item.service);
            return;
        }
        
        // Vérifier s'il n'y a vraiment pas d'écarts
        const hasNoEcarts = boOnly === 0 && partnerOnly === 0 && mismatches === 0;
        const totalTransactions = this.normalizeNumericValue(item.totalTransactions);
        const allMatches = totalTransactions > 0 && matches === totalTransactions;

        // Si la ligne est "sété" (sauvegardée avec un ID), préserver TOUJOURS le commentaire existant
        // SAUF si force est activé explicitement
        if (this.isRowSete(item) && !options?.force) {
            this.debugLog('🔒 updateCommentFromCounts: Commentaire préservé pour ligne sété', item.id, item.agency, item.service);
            return;
        }

        if (!this.shouldAutoUpdateComment(item, options)) {
            return;
        }
        // Passer totalTransactions pour vérifier la cohérence
        item.comment = this.buildCommentForCounts(matches, boOnly, partnerOnly, mismatches, item.totalTransactions);
    }

    /**
     * Synchronise le commentaire avec les valeurs réelles de l'item.
     * Cette méthode est appelée après le chargement des données pour s'assurer
     * que le commentaire correspond toujours aux valeurs affichées.
     * Pour les lignes "sété", préserve le commentaire SAUF s'il n'y a vraiment pas d'écarts
     * (pour corriger les commentaires incorrects).
     * 
     * @param item L'item à synchroniser
     * @param preserveComment Si true, préserve toujours le commentaire (utilisé lors d'un changement de statut)
     */
    private syncCommentWithValues(item: ReconciliationReportData, preserveComment: boolean = false): void {
        if (!item) {
            return;
        }

        // Ne pas synchroniser si l'utilisateur est en train de modifier manuellement les écarts
        if (this.isManuallyEditingEcart) {
            this.debugLog(`🔒 syncCommentWithValues: Modification manuelle en cours - skip pour ${item.agency}/${item.service}`);
            return;
        }

        // Ne pas modifier la ligne spéciale des écarts partenaires
        // Vérifier d'abord avec la méthode standard
        let isSpecialLine = this.isPartnerOnlySpecialLine(item);
        
        // Si ce n'est pas détecté, vérifier avec les critères alternatifs
        if (!isSpecialLine && item.agency === item.service &&
            item.agency && item.service &&
            item.totalTransactions > 0 &&
            item.mismatches === 0) {
            isSpecialLine = true;
        }
        
        if (isSpecialLine) {
            // Pour la ligne des écarts partenaires, FORCER toutes les valeurs correctes et préserver le commentaire existant
            this.enforcePartnerOnlyLineValues(item);
            return;
        }

        // Si on doit préserver le commentaire (lors d'un changement de statut), ne rien faire
        // Ne JAMAIS modifier le commentaire si preserveComment est true
        if (preserveComment) {
            this.debugLog('🔒 syncCommentWithValues: Commentaire préservé pour item', item.id, item.agency, item.service);
            return;
        }

        // PROTECTION ABSOLUE : Pour le statut OK, le commentaire ne doit JAMAIS être modifié
        // Le commentaire ne doit pas être changé quand le statut passe à OK
        if (item.status === 'OK') {
            this.debugLog('🔒 syncCommentWithValues: Commentaire préservé pour ligne avec statut OK', item.id, item.agency, item.service);
            return;
        }

        const matches = this.normalizeNumericValue(item.matches);
        const boOnly = this.normalizeNumericValue(item.boOnly);
        let partnerOnly = this.normalizeNumericValue(item.partnerOnly);
        const mismatches = this.normalizeNumericValue(item.mismatches);
        const totalTransactions = this.normalizeNumericValue(item.totalTransactions);

        // Pour les lignes normales (non spéciales), s'assurer que partnerOnly est 0
        // car les écarts partenaires sont dans la ligne spéciale (sauf pour une seule agence où ils sont sur la même ligne)
        // Note: Si c'est une seule agence, partnerOnly peut être > 0, donc on ne le force pas à 0
        // On laisse la valeur telle quelle pour permettre les modifications

        // NE PAS modifier totalTransactions - utiliser la valeur existante
        // Seules les correspondances, les écarts et le commentaire doivent être mis à jour

        // Si la ligne est "sété" (sauvegardée avec un ID), préserver TOUJOURS le commentaire existant
        if (this.isRowSete(item)) {
            this.debugLog('🔒 syncCommentWithValues: Commentaire préservé pour ligne sété', item.id, item.agency, item.service);
            return;
        }

        // Si partnerOnly est 0 mais que le commentaire contient "écart(s) Partenaire" (et que ce n'est pas la ligne spéciale),
        // alors le commentaire doit être recalculé car il est obsolète
        if (partnerOnly === 0 && item.comment && item.comment.includes('écart(s) Partenaire') && 
            !(item.agency === item.service && item.agency && item.service)) {
            this.debugWarn(`⚠️ syncCommentWithValues: Commentaire obsolète détecté pour ${item.agency}/${item.service} - partnerOnly=0 mais commentaire contient "écart(s) Partenaire" - recalcul nécessaire`);
        }

        // Recalculer le commentaire pour qu'il corresponde aux valeurs réelles
        item.comment = this.buildCommentForCounts(matches, boOnly, partnerOnly, mismatches, item.totalTransactions);
    }

    private normalizeStatus(status?: string | null): string {
        const value = (status ?? '').trim();
        return value === '' ? this.DEFAULT_STATUS : value;
    }

    private applyDefaultStatus(item: ReconciliationReportData): ReconciliationReportData {
        if (!item) {
            return item;
        }
        item.status = this.normalizeStatus(item.status);
        return item;
    }

    private enforceDefaultStatusForReportData(): void {
        this.reportData = this.reportData.map(item => this.applyDefaultStatus(item));
    }

    /**
     * Force les lignes OK à « Responsable CDO » tant que le relevé du périmètre n'est pas validé.
     */
    private enforceTraitementForOkStatus(): void {
        this.reportData.forEach(item => {
            item.traitement = this.normalizeTraitementValue(item.traitement);
            if (item.status === 'OK' && !this.isPreservedTraitementOnOk(item)) {
                item.traitement = this.defaultOkTraitement;
            }
        });
    }

    getDisplayStatus(status?: string | null): string {
        return this.normalizeStatus(status);
    }

    formatSelectedStatusesLabel(): string {
        if (!this.selectedStatuses?.length) {
            return '';
        }
        return this.selectedStatuses.map(status => this.getDisplayStatus(status)).join(', ');
    }

    /**
     * Recalcule les données selon le statut sélectionné.
     * Si le statut passe à "OK", seules les correspondances sont alignées sur le total
     * tout en conservant les écarts visibles pour l'utilisateur.
     */
    private recalculateDataBasedOnStatus(item: ReconciliationReportData): ReconciliationReportData {
        // Si le statut est "OK", même les lignes spéciales doivent avoir leurs écarts à 0
        if (item.status === 'OK' && this.isPartnerOnlySpecialLine(item)) {
            // Pour une ligne spéciale avec statut OK, tous les écarts doivent être à 0
            // Mais le commentaire doit être préservé.
            // Demande métier: réinitialiser aussi le nombre de transactions (ligne soldée).
            const previousComment = item.comment ?? '';
            return {
                ...item,
                matches: 0,
                boOnly: 0,
                partnerOnly: 0,
                mismatches: 0,
                totalTransactions: 0,
                matchRate: 0,
                traitement: 'Responsable CDO', // Traitement automatique à "Responsable CDO" pour statut OK
                comment: previousComment // Préserver le commentaire existant
            };
        }
        
        // Ne pas modifier la ligne spéciale des écarts partenaires (sauf si statut OK)
        if (this.isPartnerOnlySpecialLine(item)) {
            // Pour la ligne des écarts partenaires, FORCER toutes les valeurs correctes
            this.enforcePartnerOnlyLineValues(item);
            return {
                ...item,
                matches: 0,
                boOnly: 0,
                partnerOnly: item.partnerOnly || 0,
                mismatches: 0,
                totalTransactions: item.partnerOnly || 0,
                matchRate: 0
            };
        }

        const matches = this.normalizeNumericValue(item.matches);
        const boOnly = this.normalizeNumericValue(item.boOnly);
        const partnerOnly = this.normalizeNumericValue(item.partnerOnly);
        const mismatches = this.normalizeNumericValue(item.mismatches);
        const totalTransactions = this.normalizeNumericValue(item.totalTransactions);

        const recalculated = { 
            ...item,
            matches,
            boOnly,
            partnerOnly,
            mismatches
        };
        const previousComment = item.comment ?? '';

        const totalEcart = boOnly + partnerOnly + mismatches;
        const effectiveTotalTransactions = totalTransactions > 0 ? totalTransactions : matches + totalEcart;

        // Si la ligne est "sété", préserver le commentaire existant
        const isSete = this.isRowSete(item);

        // Si le statut est "OK", aligner les correspondances sur le total et solder les écarts
        if (item.status === 'OK') {
            console.log('🔄 Recalcul pour statut OK:', {
                avant: {
                    matches: item.matches,
                    boOnly: item.boOnly,
                    partnerOnly: item.partnerOnly,
                    mismatches: item.mismatches,
                    totalTransactions: item.totalTransactions
                }
            });

            // Les correspondances doivent refléter la totalité des transactions (sans modifier totalTransactions)
            recalculated.matches = totalTransactions;
            
            // Les écarts sont soldés (remis à zéro) puisque la ligne est finalisée
            recalculated.boOnly = 0;
            recalculated.partnerOnly = 0;
            recalculated.mismatches = 0;
            
            // NE PAS modifier totalTransactions - utiliser la valeur existante
            recalculated.totalTransactions = totalTransactions;
            
            // Recalculer le taux de correspondance
            recalculated.matchRate = totalTransactions > 0 ? 
                (recalculated.matches / totalTransactions) * 100 : 0;
            
            // Quand le statut passe à "OK", Responsable CDO tant que le relevé n'est pas validé
            if (!this.isPreservedTraitementOnOk(item)) {
                recalculated.traitement = this.defaultOkTraitement;
            } else {
                recalculated.traitement = this.normalizeTraitementValue(item.traitement);
            }
            
            // Préserver le commentaire existant quand le statut est "OK"
            // Le commentaire ne doit pas être modifié quand le statut passe à "OK"
            recalculated.comment = previousComment;
            
            console.log('🔄 Recalcul pour statut OK - commentaire préservé, totalTransactions inchangé:', {
                commentaire: previousComment,
                matches: recalculated.matches,
                totalTransactions: totalTransactions, // Non modifié
                matchRate: recalculated.matchRate,
                traitement: recalculated.traitement,
                ecartsReinitialises: {
                    boOnly: recalculated.boOnly,
                    partnerOnly: recalculated.partnerOnly,
                    mismatches: recalculated.mismatches
                },
                isSete: isSete
            });
        } else {
            // Pour les autres statuts, NE PAS modifier totalTransactions - utiliser la valeur existante
            recalculated.totalTransactions = totalTransactions;
            recalculated.matchRate = totalTransactions > 0 ? 
                (recalculated.matches / totalTransactions) * 100 : 0;
            
            // Pour les statuts autres que "OK", mettre à jour le commentaire pour refléter les valeurs actuelles
            // Seulement si la ligne n'est pas "sété" (pour préserver les commentaires des lignes sauvegardées)
            if (!isSete) {
                recalculated.comment = this.buildCommentForCounts(
                    recalculated.matches,
                    recalculated.boOnly,
                    recalculated.partnerOnly,
                    recalculated.mismatches,
                    effectiveTotalTransactions
                );
            } else {
                // Si la ligne est "sété", préserver le commentaire existant
                recalculated.comment = previousComment;
            }
        }
        
        return recalculated;
    }

    /**
     * Extrait les écarts BO et Partenaire depuis le commentaire
     * Format attendu: "206 correspondances • 4 écart(s) BO • 5 écart(s) Partenaire"
     */
    private extractDiscrepanciesFromComment(comment?: string): { boCount: number; partnerCount: number } {
        if (!comment) {
            return { boCount: 0, partnerCount: 0 };
        }

        // Normaliser le texte pour gérer les accents
        const normalized = comment.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Extraire les écarts BO (format: "X écart(s) BO" ou "X écart(s) BO")
        const boMatch = normalized.match(/(\d+)\s*ecart\(s\)\s*bo/i);
        
        // Extraire les écarts Partenaire (format: "X écart(s) Partenaire" ou "X écart(s) Partenaire")
        const partnerMatch = normalized.match(/(\d+)\s*ecart\(s\)\s*partenaire/i);

        const boCount = boMatch ? parseInt(boMatch[1], 10) : 0;
        const partnerCount = partnerMatch ? parseInt(partnerMatch[1], 10) : 0;

        return { boCount, partnerCount };
    }

    trackByItem(index: number, item: ReconciliationReportData): string {
        const isHeader = !!(item as any)?.__serviceGroupHeader;
        if (isHeader) {
            return (item as any)?.id || `__svc_${(item.service || '').trim()}`;
        }
        return `${item.agency}-${item.service}-${item.date}`;
    }

    /** Nombre de colonnes du tableau incluant Historique et Actions opt. */
    auditHistoryColspan(): number {
        return 19 + (this.showActionsColumn ? 1 : 0);
    }

    private clearAuditHistoryUiState(): void {
        this.expandedAuditRowIds.clear();
        this.auditHistoryCache.clear();
        this.auditHistoryLoadingIds.clear();
    }

    isAuditExpanded(item: ReconciliationReportData): boolean {
        return item.id != null && this.expandedAuditRowIds.has(item.id);
    }

    toggleAuditRow(item: ReconciliationReportData, ev?: Event): void {
        ev?.stopPropagation?.();
        if (!item.id) {
            return;
        }
        if (this.expandedAuditRowIds.has(item.id)) {
            this.expandedAuditRowIds.delete(item.id);
        } else {
            this.expandedAuditRowIds.add(item.id);
            this.fetchAuditHistoryIfNeeded(item.id);
        }
    }

    private fetchAuditHistoryIfNeeded(id: number): void {
        if (this.auditHistoryCache.has(id)) {
            return;
        }
        this.auditHistoryLoadingIds.add(id);
        this.http
            .get<Result8RecAuditEntry[]>(`/api/result8rec/${id}/audit-history`, { headers: this.buildResultsHeaders() })
            .subscribe({
                next: (rows) => {
                    this.auditHistoryLoadingIds.delete(id);
                    this.auditHistoryCache.set(id, Array.isArray(rows) ? rows : []);
                },
                error: () => {
                    this.auditHistoryLoadingIds.delete(id);
                    this.auditHistoryCache.set(id, []);
                }
            });
    }

    isAuditLoading(id: number): boolean {
        return this.auditHistoryLoadingIds.has(id);
    }

    getAuditRows(id: number): Result8RecAuditEntry[] {
        return this.auditHistoryCache.get(id) ?? [];
    }

    formatAuditActionLabel(actionType?: string): string {
        if (!actionType) {
            return '—';
        }
        const m: Record<string, string> = {
            CREATION: this.translateKey('RPT.audit.action.CREATION'),
            SAUVEGARDE_RESULTAT: this.translateKey('RPT.audit.action.SAUVEGARDE_RESULTAT'),
            STATUT_OK: this.translateKey('RPT.audit.action.STATUT_OK'),
            CHANGEMENT_STATUT: this.translateKey('RPT.audit.action.CHANGEMENT_STATUT'),
            'VALIDATION_TERMINÉ': this.translateKey('RPT.audit.action.VALIDATION_TERMINÉ'),
            CHANGEMENT_TRAITEMENT: this.translateKey('RPT.audit.action.CHANGEMENT_TRAITEMENT'),
        };
        return m[actionType] || actionType;
    }

    formatAuditInstant(iso?: string | null): string {
        if (!iso) {
            return '—';
        }
        const d = new Date(iso as string);
        if (Number.isNaN(d.getTime())) {
            return String(iso);
        }
        return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    }

    async exportToExcel() {
        const rowsSource = this.filteredReportData.length > 0 ? this.filteredReportData : this.reportData;
        
        if (!rowsSource || rowsSource.length === 0) {
            this.popupService.showError(this.translateKey('RPT.export.noData'));
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Rapport de Réconciliation');

            // Définir les colonnes
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 12 },
                { header: 'Agence', key: 'agency', width: 20 },
                { header: 'Service', key: 'service', width: 20 },
                { header: 'Pays', key: 'country', width: 15 },
                { header: 'Transactions', key: 'transactions', width: 15 },
                { header: 'Volume', key: 'volume', width: 15 },
                { header: 'Correspondances', key: 'matches', width: 15 },
                { header: 'Écarts BO', key: 'boOnly', width: 12 },
                { header: 'Écarts Partenaire', key: 'partnerOnly', width: 18 },
                { header: 'Incohérences', key: 'mismatches', width: 15 },
                { header: 'Taux de Correspondance', key: 'matchRate', width: 20 },
                { header: 'ID TICKET', key: 'glpiId', width: 15 },
                { header: 'Statut', key: 'status', width: 15 },
                { header: 'Commentaire', key: 'comment', width: 30 },
                { header: 'Traitement', key: 'traitement', width: 18 }
            ];

            // Style de l'en-tête avec fond bleu foncé et texte blanc
            worksheet.getRow(1).eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF2C3E50' } // Bleu foncé
                };
                cell.font = { 
                    color: { argb: 'FFFFFFFF' }, 
                    bold: true,
                    size: 11
                };
                cell.alignment = { 
                    horizontal: 'center', 
                    vertical: 'middle',
                    wrapText: true
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF1A252F' } },
                    bottom: { style: 'thin', color: { argb: 'FF1A252F' } },
                    left: { style: 'thin', color: { argb: 'FF1A252F' } },
                    right: { style: 'thin', color: { argb: 'FF1A252F' } }
                };
            });

            // Hauteur de l'en-tête
            worksheet.getRow(1).height = 30;

            // Ajouter les données avec couleurs conditionnelles
            rowsSource.forEach((item, idx) => {
                const matchRate = item.matchRate || 0;
                const row = worksheet.addRow({
                    date: this.formatDate(item.date),
                    agency: item.agency,
                    service: item.service,
                    country: item.country,
                    transactions: Number(item.totalTransactions) || 0,
                    volume: Number(item.totalVolume) || 0,
                    matches: Number(item.matches) || 0,
                    boOnly: Number(item.boOnly) || 0,
                    partnerOnly: Number(item.partnerOnly) || 0,
                    mismatches: Number(item.mismatches) || 0,
                    matchRate: `${matchRate.toFixed(2)}%`,
                    glpiId: item.glpiId || '',
                    status: this.getDisplayStatus(item.status),
                    comment: item.comment,
                    traitement: this.getTraitementDisplayLabel(item.traitement)
                });

                // Couleur de fond pour toute la ligne selon le taux de correspondance
                let rowFillColor = 'FFFFFFFF'; // Blanc par défaut
                let rowTextColor = 'FF000000'; // Noir par défaut

                if (matchRate >= 95) {
                    // 🟢 Vert : Taux excellents (≥95%)
                    rowFillColor = 'FFD4EDDA'; // Vert clair
                    rowTextColor = 'FF155724'; // Vert foncé
                } else if (matchRate >= 80) {
                    // 🔵 Bleu : Taux bons (80-94%)
                    rowFillColor = 'FFD1ECF1'; // Bleu clair
                    rowTextColor = 'FF0C5460'; // Bleu foncé
                } else if (matchRate >= 60) {
                    // 🟡 Jaune : Taux moyens (60-79%)
                    rowFillColor = 'FFFFF3CD'; // Jaune clair
                    rowTextColor = 'FF856404'; // Jaune foncé
                } else {
                    // 🔴 Rouge : Taux faibles (<60%)
                    rowFillColor = 'FFF8D7DA'; // Rouge clair
                    rowTextColor = 'FF721C24'; // Rouge foncé
                }

                // Appliquer la couleur de fond à toute la ligne
                row.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: rowFillColor }
                    };
                    cell.font = { 
                        color: { argb: rowTextColor },
                        size: 10
                    };
                    cell.alignment = { 
                        horizontal: 'left', 
                        vertical: 'middle',
                        wrapText: true
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE9ECEF' } },
                        bottom: { style: 'thin', color: { argb: 'FFE9ECEF' } },
                        left: { style: 'thin', color: { argb: 'FFE9ECEF' } },
                        right: { style: 'thin', color: { argb: 'FFE9ECEF' } }
                    };
                });

                // Styles spécifiques pour certaines colonnes
                // Correspondances - toujours vert
                const matchesCell = row.getCell('matches');
                matchesCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD4EDDA' }
                };
                matchesCell.font = { 
                    color: { argb: 'FF155724' },
                    bold: true,
                    size: 10
                };

                // Écarts BO - Jaune
                const boOnlyCell = row.getCell('boOnly');
                if (item.boOnly > 0) {
                    boOnlyCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFF3CD' }
                    };
                    boOnlyCell.font = { 
                        color: { argb: 'FF856404' },
                        bold: true,
                        size: 10
                    };
                }

                // Écarts Partenaire - Orange
                const partnerOnlyCell = row.getCell('partnerOnly');
                if (item.partnerOnly > 0) {
                    partnerOnlyCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFE0B2' } // Orange clair
                    };
                    partnerOnlyCell.font = { 
                        color: { argb: 'FFE65100' }, // Orange foncé
                        bold: true,
                        size: 10
                    };
                }

                // Incohérences - Rouge
                const mismatchesCell = row.getCell('mismatches');
                if (item.mismatches > 0) {
                    mismatchesCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF8D7DA' }
                    };
                    mismatchesCell.font = { 
                        color: { argb: 'FF721C24' },
                        bold: true,
                        size: 10
                    };
                }

                // Taux de Correspondance - Style selon la valeur
                const matchRateCell = row.getCell('matchRate');
                matchRateCell.font = { 
                    color: { argb: rowTextColor },
                    bold: true,
                    size: 11
                };
                matchRateCell.alignment = { 
                    horizontal: 'center', 
                    vertical: 'middle'
                };

                // Colonnes montant en nombre avec format numérique
                const numFmt = '#,##0.00';
                row.getCell('transactions').numFmt = '#,##0';
                row.getCell('volume').numFmt = numFmt;
                row.getCell('matches').numFmt = '#,##0';
                row.getCell('boOnly').numFmt = '#,##0';
                row.getCell('partnerOnly').numFmt = '#,##0';
                row.getCell('mismatches').numFmt = '#,##0';
                // Alignement numérique pour Transactions, Volume
                row.getCell('transactions').alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell('volume').alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell('matches').alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell('boOnly').alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell('partnerOnly').alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell('mismatches').alignment = { horizontal: 'right', vertical: 'middle' };
            });

            // Générer le fichier Excel
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `rapport_reconciliation_${new Date().toISOString().slice(0,10)}.xlsx`;
            saveAs(new Blob([buffer]), fileName);
            
            this.popupService.showSuccess(this.translateKey('RPT.export.success', { file: fileName }), this.translateKey('RPT.export.successTitle'));
        } catch (error) {
            console.error('❌ Erreur lors de l\'export Excel:', error);
            this.popupService.showError('Erreur d\'export', 'Une erreur est survenue lors de l\'export Excel.');
        }
    }

    goBack() {
        this.router.navigate(['/results']);
    }

    // Ouvrir GLPI pour créer un nouveau ticket (titre + description préremplis)
    openGlpiCreate(item: ReconciliationReportData) {
        const { title, description } = this.buildReconciliationTicketTexts(item);
        const params = new URLSearchParams();
        params.set('name', title);
        params.set('content', description);
        const glpiCreateUrl = `https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php?${params.toString()}`;
        window.open(glpiCreateUrl, '_blank', 'noopener,noreferrer');
    }

    // Ouvrir BOMETIER pour créer un nouveau ticket (titre + description préremplis)
    openBometierCreate(item: ReconciliationReportData) {
        const { title, description } = this.buildReconciliationTicketTexts(item);
        const params = new URLSearchParams();
        params.set('title', title);
        params.set('description', description);
        const bometierCreateUrl = `https://bometier.gutouch.net/creation-ticket?${params.toString()}`;
        window.open(bometierCreateUrl, '_blank', 'noopener,noreferrer');
    }

    /** Titre / description ticket : RAPPORT DE RECONCILIATION + ENV + PAYS + DATE + Service */
    private buildReconciliationTicketTexts(item: ReconciliationReportData): { title: string; description: string } {
        const env = this.resolveTicketEnvLabel(item);
        const pays = (item.country || '').trim() || '—';
        const date = this.formatDate(item.date || '');
        const service = (item.service || '').trim() || '—';
        const title = `RAPPORT DE RECONCILIATION - ${env} - ${pays} - ${date} - ${service}`;
        const description = 'Bonjour,\n\nMerci de prendre en charge les écarts constatés.';
        return { title, description };
    }

    private resolveTicketEnvLabel(item: ReconciliationReportData): string {
        const rowEnv = (item.env || '').trim();
        if (rowEnv) {
            return rowEnv;
        }
        if (this.selectedEnvs?.length === 1) {
            return this.selectedEnvs[0];
        }
        if (this.selectedEnvs?.length > 1) {
            return this.selectedEnvs.join(', ');
        }
        return 'T-E';
    }

    // Afficher un popup pour choisir où créer un nouveau ticket (GLPI ou BOMETIER)
    showTicketCreateOptionsPopup(item: ReconciliationReportData): void {
        const message = this.translateKey('RPT.ticket.createMessage');
        const title = this.translateKey('RPT.ticket.createTitle');
        this.showTicketChoiceOverlay(title, message, () => this.openGlpiCreate(item), () => this.openBometierCreate(item));
    }

    private showTicketChoiceOverlay(title: string, message: string, onGlpi: () => void, onBometier: () => void): void {
        const overlay = document.createElement('div');
        overlay.className = 'modern-popup-overlay';
        overlay.innerHTML = `
            <div class="modern-popup popup-type-info">
                <div class="popup-header">
                    <div class="popup-title-wrapper">
                        <span class="popup-icon">🎫</span>
                        <h3 class="popup-title">${title}</h3>
                    </div>
                    <button class="popup-close" aria-label="Fermer">×</button>
                </div>
                <div class="popup-content">
                    <p class="popup-message">${message}</p>
                </div>
                <div class="popup-actions popup-actions-two-buttons">
                    <button class="popup-btn popup-btn-glpi">🔵 GLPI</button>
                    <button class="popup-btn popup-btn-bometier">🟢 BOMETIER</button>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .modern-popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); display: flex;
                justify-content: center; align-items: center; z-index: 9999;
                animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
            .modern-popup { background: var(--color-surface); border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
                max-width: 450px; width: 90%; overflow: hidden; border-top: 4px solid var(--color-info-solid); }
            .popup-header { display: flex; justify-content: space-between; align-items: center;
                padding: 24px 24px 16px 24px; background: linear-gradient(135deg, var(--color-surface-sunken) 0%, var(--color-surface) 100%); }
            .popup-title-wrapper { display: flex; align-items: center; gap: 12px; }
            .popup-icon { font-size: 24px; }
            .popup-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--color-text-primary); }
            .popup-close { background: rgba(0, 0, 0, 0.05); border: none; font-size: 22px; cursor: pointer;
                color: var(--color-text-muted); padding: 0; width: 32px; height: 32px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; }
            .popup-close:hover { background: rgba(0, 0, 0, 0.1); color: var(--color-text-primary); }
            .popup-content { padding: 20px 24px; }
            .popup-message { margin: 0; color: var(--color-text-muted); line-height: 1.6; font-size: 15px; }
            .popup-actions-two-buttons { display: flex; justify-content: center; gap: 12px;
                padding: 16px 24px 24px 24px; background: var(--color-surface-sunken); border-top: 1px solid var(--color-surface-sunken); }
            .popup-btn { padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer;
                font-weight: 600; font-size: 14px; min-width: 140px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
            .popup-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15); }
            .popup-btn-glpi { background: linear-gradient(135deg, var(--color-info-solid) 0%, var(--color-info-solid) 100%); color: var(--color-accent-contrast); }
            .popup-btn-glpi:hover { background: linear-gradient(135deg, var(--color-info-solid) 0%, var(--color-info-text) 100%); }
            .popup-btn-bometier { background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-text) 100%); color: var(--color-accent-contrast); }
            .popup-btn-bometier:hover { background: linear-gradient(135deg, var(--color-success-text) 0%, var(--color-success-text) 100%); }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const cleanup = () => {
            document.body.style.overflow = 'auto';
            if (style.parentNode) style.parentNode.removeChild(style);
            overlay.remove();
            document.removeEventListener('keydown', handleEscape);
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cleanup();
        };

        overlay.querySelector('.popup-close')?.addEventListener('click', cleanup);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
        document.addEventListener('keydown', handleEscape);

        overlay.querySelector('.popup-btn-glpi')?.addEventListener('click', () => { cleanup(); onGlpi(); });
        overlay.querySelector('.popup-btn-bometier')?.addEventListener('click', () => { cleanup(); onBometier(); });
    }

    // Obtenir l'URL du ticket GLPI avec l'ID
    getGlpiTicketUrl(idGlpi: string): string {
        return `https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php?id=${idGlpi}`;
    }

    getBometierTicketUrl(idGlpi: string): string {
        return `https://bometier.gutouch.net/details-ticket/${idGlpi}`;
    }

    // Afficher un popup pour choisir entre GLPI et BOMETIER
    async showTicketOptionsPopup(ticketId: string): Promise<void> {
        const message = `Choisissez la plateforme pour ouvrir le ticket ${ticketId}:`;
        const title = 'Ouvrir le ticket';
        
        // Créer un popup personnalisé avec deux boutons
        const overlay = document.createElement('div');
        overlay.className = 'modern-popup-overlay';
        overlay.innerHTML = `
            <div class="modern-popup popup-type-info">
                <div class="popup-header">
                    <div class="popup-title-wrapper">
                        <span class="popup-icon">🎫</span>
                        <h3 class="popup-title">${title}</h3>
                    </div>
                    <button class="popup-close" aria-label="Fermer">×</button>
                </div>
                <div class="popup-content">
                    <p class="popup-message">${message}</p>
                </div>
                <div class="popup-actions popup-actions-two-buttons">
                    <button class="popup-btn popup-btn-glpi">
                        🔵 GLPI
                    </button>
                    <button class="popup-btn popup-btn-bometier">
                        🟢 BOMETIER
                    </button>
                </div>
            </div>
        `;

        // Ajouter les styles si nécessaire
        const style = document.createElement('style');
        style.textContent = `
            .modern-popup-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(4px);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .modern-popup {
                background: var(--color-surface);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
                max-width: 450px;
                width: 90%;
                animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                overflow: hidden;
                border-top: 4px solid var(--color-info-solid);
            }
            .popup-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 24px 24px 16px 24px;
                background: linear-gradient(135deg, var(--color-surface-sunken) 0%, var(--color-surface) 100%);
            }
            .popup-title-wrapper {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .popup-icon {
                font-size: 24px;
                line-height: 1;
            }
            .popup-title {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                color: var(--color-text-primary);
            }
            .popup-close {
                background: rgba(0, 0, 0, 0.05);
                border: none;
                font-size: 22px;
                cursor: pointer;
                color: var(--color-text-muted);
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            }
            .popup-close:hover {
                background: rgba(0, 0, 0, 0.1);
                color: var(--color-text-primary);
                transform: rotate(90deg);
            }
            .popup-content {
                padding: 20px 24px;
            }
            .popup-message {
                margin: 0;
                color: var(--color-text-muted);
                line-height: 1.6;
                font-size: 15px;
            }
            .popup-actions-two-buttons {
                display: flex;
                justify-content: center;
                gap: 12px;
                padding: 16px 24px 24px 24px;
                background: var(--color-surface-sunken);
                border-top: 1px solid var(--color-surface-sunken);
            }
            .popup-btn {
                padding: 12px 24px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                min-width: 140px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .popup-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
            }
            .popup-btn-glpi {
                background: linear-gradient(135deg, var(--color-info-solid) 0%, var(--color-info-solid) 100%);
                color: var(--color-accent-contrast);
            }
            .popup-btn-glpi:hover {
                background: linear-gradient(135deg, var(--color-info-solid) 0%, var(--color-info-text) 100%);
            }
            .popup-btn-bometier {
                background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-text) 100%);
                color: var(--color-accent-contrast);
            }
            .popup-btn-bometier:hover {
                background: linear-gradient(135deg, var(--color-success-text) 0%, var(--color-success-text) 100%);
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { 
                    opacity: 0;
                    transform: translateY(-30px) scale(0.9);
                }
                to { 
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const cleanup = () => {
            document.body.style.overflow = 'auto';
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
            overlay.remove();
        };

        // Gérer la fermeture
        const closeBtn = overlay.querySelector('.popup-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', cleanup);
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
            }
        });

        // Gérer Escape
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Gérer les clics sur les boutons
        const glpiBtn = overlay.querySelector('.popup-btn-glpi');
        const bometierBtn = overlay.querySelector('.popup-btn-bometier');

        if (glpiBtn) {
            glpiBtn.addEventListener('click', () => {
                cleanup();
                document.removeEventListener('keydown', handleEscape);
                this.openGlpiTicket(ticketId);
            });
        }

        if (bometierBtn) {
            bometierBtn.addEventListener('click', () => {
                cleanup();
                document.removeEventListener('keydown', handleEscape);
                this.openBometierTicket(ticketId);
            });
        }
    }

    // Ouvrir le ticket dans GLPI
    openGlpiTicket(ticketId: string): void {
        const url = this.getGlpiTicketUrl(ticketId);
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Ouvrir le ticket dans BOMETIER
    openBometierTicket(ticketId: string): void {
        const url = this.getBometierTicketUrl(ticketId);
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    onGlpiIdInputChange(item: ReconciliationReportData, value: string) {
        if (!item || !item.id || this.editingRow === item) {
            return;
        }

        const trimmed = (value || '').trim();
        if (!trimmed) {
            this.clearGlpiAutoSaveTimer(item);
            return;
        }

        this.clearGlpiAutoSaveTimer(item);
        const timer = setTimeout(() => this.triggerGlpiAutoSave(item), 800);
        this.glpiAutoSaveTimers.set(item, timer);
    }

    onGlpiIdInputBlur(item: ReconciliationReportData) {
        if (!item) return;
        if (!item.id) {
            if ((item.glpiId || '').trim()) {
                this.popupService.showWarning(this.translateKey('RPT.row.notSavedMessage'), this.translateKey('RPT.row.notSavedTitle'));
            }
            return;
        }
        this.triggerGlpiAutoSave(item, true);
    }

    onGlpiIdInputEnter(item: ReconciliationReportData) {
        if (!item) return;
        if (!item.id) {
            if ((item.glpiId || '').trim()) {
                this.popupService.showWarning(this.translateKey('RPT.row.notSavedMessage'), this.translateKey('RPT.row.notSavedTitle'));
            }
            return;
        }
        this.triggerGlpiAutoSave(item, true);
    }

    private triggerGlpiAutoSave(item: ReconciliationReportData, force = false) {
        this.clearGlpiAutoSaveTimer(item);

        if (this.editingRow === item) {
            return;
        }

        const glpiValue = (item.glpiId || '').trim();
        if (!glpiValue) {
            return;
        }

        const lastSaved = this.lastSavedGlpiIds.get(item) || '';
        // Ne pas forcer un PUT si la valeur n'a pas changé (évite rafales/429)
        if (glpiValue === lastSaved) {
            return;
        }

        this.saveGlpiIdAutomatically(item, glpiValue);
    }

    private async saveGlpiIdAutomatically(item: ReconciliationReportData, glpiId: string) {
        if (!item.id) {
            return;
        }

        const payload = this.buildUpdatePayload(item, { glpiId });
        try {
            await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
            item.glpiId = glpiId;
            this.lastSavedGlpiIds.set(item, glpiId);
            // volontairement silencieux (évite spam de notifications)
        } catch (err: any) {
            const now = Date.now();
            // Éviter spam si le backend rate-limit
            if (now - this.lastGlpiAutoSaveErrorAt > 5000) {
                this.lastGlpiAutoSaveErrorAt = now;
                this.popupService.showError(this.translateKey('RPT.row.ticketIdSaveError'));
            }
            // Log seulement si debug activé
            this.debugWarn('❌ Erreur autosave ID TICKET', err);
        }
    }

    private clearGlpiAutoSaveTimer(item: ReconciliationReportData) {
        const timer = this.glpiAutoSaveTimers.get(item);
        if (timer) {
            clearTimeout(timer);
            this.glpiAutoSaveTimers.delete(item);
        }
    }

    private syncLastSavedGlpiValues(items: ReconciliationReportData[]) {
        if (!items || !items.length) {
            return;
        }
        items.forEach(row => {
            this.lastSavedGlpiIds.set(row, (row.glpiId || '').trim());
        });
    }

    private buildUpdatePayload(item: ReconciliationReportData, overrides: Partial<ReconciliationReportData> = {}) {
        const data = { ...item, ...overrides };
        const traitementValue = typeof data.traitement === 'string' ? data.traitement.trim() : '';
        const traitement = traitementValue !== '' ? data.traitement : this.determineDefaultTraitement(data);

        return {
            date: data.date,
            agency: data.agency,
            service: data.service,
            country: data.country,
            env: this.normalizeReleveEnvKey(data.env),
            totalTransactions: data.totalTransactions,
            totalVolume: data.totalVolume,
            matches: data.matches,
            boOnly: data.boOnly,
            partnerOnly: data.partnerOnly,
            mismatches: data.mismatches,
            matchRate: data.matchRate,
            status: data.status,
            comment: data.comment,
            traitement,
            glpiId: data.glpiId || ''
        };
    }

    private shouldUseProgressiveDbLoad(scope: { startDate?: string; endDate?: string; key: string }): boolean {
        if (scope.startDate && scope.endDate && scope.startDate === scope.endDate) {
            return false;
        }
        if (scope.startDate && scope.endDate && this.resolveCountryParamForApi()) {
            return false;
        }
        return true;
    }

    private buildDbReportHttpParams(
        scope: { startDate?: string; endDate?: string },
        dateOverride?: string
    ): HttpParams {
        const cacheBuster = new Date().getTime();
        let params = new HttpParams().set('_t', String(cacheBuster));
        const startDate = dateOverride ?? scope.startDate;
        const endDate = dateOverride ?? scope.endDate;
        if (startDate) {
            params = params.set('startDate', startDate);
        }
        if (endDate) {
            params = params.set('endDate', endDate);
        }
        const country = this.resolveCountryParamForApi();
        if (country) {
            params = params.set('country', country);
        }
        return params;
    }

    private resolveDbLoadErrorMessage(err: unknown): string {
        const httpErr = err as HttpErrorResponse;
        if (httpErr?.status === 413) {
            const body = httpErr.error as { message?: string; error?: string } | null;
            if (body?.error === 'country_required') {
                return this.translateKey('RPT.dbLoad.countryRequired');
            }
            return (
                body?.message ||
                this.translateKey('RPT.dbLoad.tooManyRows')
            );
        }
        if (httpErr?.status === 403) {
            return this.translateKey('RPT.dbLoad.forbidden');
        }
        return this.translateKey('RPT.dbLoad.generic');
    }

    private buildDbReportFetchHeaders(): HttpHeaders {
        return this.buildResultsHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
    }

    private async fetchResult8RecRows(
        scope: { startDate?: string; endDate?: string },
        dateOverride?: string
    ): Promise<any[]> {
        const rows = await firstValueFrom(
            this.http.get<any[]>('/api/result8rec', {
                headers: this.buildDbReportFetchHeaders(),
                params: this.buildDbReportHttpParams(scope, dateOverride)
            })
        );
        return Array.isArray(rows) ? rows : [];
    }

    private async fetchReportDates(scope: { startDate?: string; endDate?: string }): Promise<string[]> {
        const dates = await firstValueFrom(
            this.http.get<string[]>('/api/result8rec/dates', {
                headers: this.buildDbReportFetchHeaders(),
                params: this.buildDbReportHttpParams(scope)
            })
        );
        return Array.isArray(dates) ? dates.filter(d => !!d) : [];
    }

    private finishEmptyDbLoad(scope: { key: string }): void {
        this.reportData = [];
        this.filteredReportData = [];
        this.kpiScopeData = [];
        this.refreshKpiSummary();
        this.paginatedData = [];
        this.extractUniqueValues();
        this.currentSource = 'db';
        this.lastDbReportFetchKey = scope.key;
        this.isLoadingDbReport = false;
        this.isLoadingMoreDbReport = false;
        this.updatePagination();
    }

    private mergeReportDataById(
        existing: ReconciliationReportData[],
        incoming: ReconciliationReportData[]
    ): ReconciliationReportData[] {
        const byId = new Map<number, ReconciliationReportData>();
        const withoutId: ReconciliationReportData[] = [];

        for (const item of existing) {
            if (item.id != null) {
                byId.set(item.id, item);
            } else {
                withoutId.push(item);
            }
        }

        for (const item of incoming) {
            if (item.id != null) {
                byId.set(item.id, item);
            } else {
                withoutId.push(item);
            }
        }

        return [...byId.values(), ...withoutId];
    }

    private mapResult8RecRows(
        rows: any[],
        preserveComments: Map<number, string>
    ): ReconciliationReportData[] {
        return rows.map(r => {
            const boOnly = Number(r.boOnly || r.bo_only) || 0;
            const partnerOnly = Number(r.partnerOnly || r.partner_only) || 0;
            const mismatches = Number(r.mismatches) || 0;
            const totalEcarts = boOnly + partnerOnly + mismatches;

            let traitement = r.traitement;
            if (traitement && traitement.trim() === 'Terminé') {
                traitement = 'Terminé';
            } else if (r.status === 'OK') {
                const normalized = this.normalizeTraitementValue(r.traitement);
                if (normalized === 'Terminé') {
                    traitement = 'Terminé';
                } else if (normalized === this.traitementNiveauGroup) {
                    traitement = this.traitementNiveauGroup;
                } else {
                    traitement = this.defaultOkTraitement;
                }
            } else if (!traitement || traitement.trim() === '') {
                traitement = totalEcarts > 0 ? 'Niveau Support' : this.defaultOkTraitement;
            } else {
                const traitementAttendu = totalEcarts > 0 ? 'Niveau Support' : this.defaultOkTraitement;
                if (traitement !== 'Terminé' && traitement !== this.traitementNiveauGroup && traitement !== traitementAttendu) {
                    traitement = traitementAttendu;
                }
            }

            traitement = this.normalizeTraitementValue(traitement);

            let comment = r.comment || '';
            if (preserveComments.has(r.id)) {
                comment = preserveComments.get(r.id)!;
            } else if (!r.id && r.status !== 'OK') {
                const totalTransactions = r.totalTransactions || r.recordCount || 0;
                if (!comment || comment.trim() === '') {
                    comment = totalEcarts === 0
                        ? "PAS D'ECARTS CONSTATES"
                        : this.buildCommentForCounts(
                            r.matches || 0,
                            boOnly,
                            partnerOnly,
                            mismatches,
                            totalTransactions
                        );
                } else {
                    comment = this.buildCommentForCounts(
                        r.matches || 0,
                        boOnly,
                        partnerOnly,
                        mismatches,
                        totalTransactions
                    );
                }
            }

            const rawEnv = r.env ?? r.env_code ?? r.envCode;
            return {
                id: r.id,
                date: r.date,
                agency: r.agency,
                service: r.service,
                country: r.country,
                env: rawEnv != null && String(rawEnv).trim() !== ''
                    ? this.normalizeReleveEnvKey(String(rawEnv))
                    : undefined,
                glpiId: r.glpiId || r.glpi_id || '',
                totalTransactions: r.totalTransactions || r.recordCount || 0,
                totalVolume: r.totalVolume || 0,
                matches: r.matches || 0,
                boOnly,
                partnerOnly,
                mismatches,
                matchRate: r.matchRate || 0,
                status: r.status || '',
                comment,
                traitement,
                username: r.username || ''
            };
        });
    }

    private finalizeLoadedReportData(preserveComments: Map<number, string>): void {
        this.reportData.forEach(item => {
            if (this.isPartnerOnlySpecialLine(item)) {
                this.enforcePartnerOnlyLineValues(item);
            }
        });

        this.enforceDefaultStatusForReportData();

        this.reportData.forEach(item => {
            const hasPreservedComment = preserveComments.has(item.id!);
            const preservedComment = hasPreservedComment ? preserveComments.get(item.id!)! : null;

            if (hasPreservedComment && preservedComment) {
                item.comment = preservedComment;
            }

            this.recalculateMatchRate(item, hasPreservedComment);
            this.syncCommentWithValues(item, hasPreservedComment);

            if (hasPreservedComment && preservedComment) {
                item.comment = preservedComment;
            }
        });

        this.syncLastSavedGlpiValues(this.reportData);
        this.enforceTraitementForOkStatus();

        this.reportData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        preserveComments.forEach((preservedComment, itemId) => {
            const item = this.reportData.find(r => r.id === itemId);
            if (item) {
                item.comment = preservedComment;
            }
        });
    }

    private applyLoadedReportToView(preserveComments: Map<number, string>): void {
        this.extractUniqueValues();
        this.filterReport();

        preserveComments.forEach((preservedComment, itemId) => {
            const item = this.reportData.find(r => r.id === itemId);
            const filteredItem = this.filteredReportData.find(r => r.id === itemId);
            if (item) {
                item.comment = preservedComment;
            }
            if (filteredItem) {
                filteredItem.comment = preservedComment;
            }
        });

        this.updatePagination();
    }

    private async processDbReportRows(
        rows: any[],
        preserveComments: Map<number, string>,
        scope: { key: string },
        token: number,
        finalizeLoad: boolean
    ): Promise<void> {
        this.clearAuditHistoryUiState();

        if (!rows.length) {
            this.finishEmptyDbLoad(scope);
            return;
        }

        if (token !== this.dbLoadToken) {
            return;
        }

        this.reportData = this.mapResult8RecRows(rows, preserveComments);
        this.finalizeLoadedReportData(preserveComments);

        if (finalizeLoad) {
            this.currentSource = 'db';
            this.lastDbReportFetchKey = scope.key;
            this.isLoadingDbReport = false;
            this.isLoadingMoreDbReport = false;
            this.applyLoadedReportToView(preserveComments);
        }
    }

    private async loadSavedReportFromDatabase(preserveComments: Map<number, string> = new Map()): Promise<void> {
        if (this.currentSource === 'live') {
            return;
        }

        const scope = this.getDbReportFetchScope();
        const token = ++this.dbLoadToken;

        this.loadedFromDb = true;
        this.isLoadingDbReport = true;
        this.isLoadingMoreDbReport = false;
        this.dbLoadError = null;
        this.reportData = [];
        this.filteredReportData = [];
        this.kpiScopeData = [];
        this.refreshKpiSummary();
        this.paginatedData = [];

        try {
            if (!this.shouldUseProgressiveDbLoad(scope)) {
                const rows = await this.fetchResult8RecRows(scope);
                if (token !== this.dbLoadToken) {
                    return;
                }
                await this.processDbReportRows(rows, preserveComments, scope, token, true);
                return;
            }

            const dates = await this.fetchReportDates(scope);
            if (token !== this.dbLoadToken) {
                return;
            }

            if (!dates.length) {
                this.clearAuditHistoryUiState();
                this.finishEmptyDbLoad(scope);
                return;
            }

            this.clearAuditHistoryUiState();

            const firstDate = dates[0];
            const firstRows = await this.fetchResult8RecRows(scope, firstDate);
            if (token !== this.dbLoadToken) {
                return;
            }

            this.reportData = this.mapResult8RecRows(firstRows, preserveComments);
            this.finalizeLoadedReportData(preserveComments);
            this.currentSource = 'db';
            this.lastDbReportFetchKey = scope.key;
            this.isLoadingDbReport = false;
            this.isLoadingMoreDbReport = dates.length > 1;
            this.applyLoadedReportToView(preserveComments);

            const remainingDates = dates.slice(1);
            const concurrency = ReconciliationReportComponent.DB_DATE_FETCH_CONCURRENCY;
            for (let i = 0; i < remainingDates.length; i += concurrency) {
                if (token !== this.dbLoadToken) {
                    return;
                }

                const batch = remainingDates.slice(i, i + concurrency);
                const batchResults = await Promise.all(
                    batch.map(date => this.fetchResult8RecRows(scope, date))
                );
                if (token !== this.dbLoadToken) {
                    return;
                }

                for (let j = 0; j < batch.length; j++) {
                    const mapped = this.mapResult8RecRows(batchResults[j], preserveComments);
                    this.reportData = this.mergeReportDataById(this.reportData, mapped);
                }

                this.reportData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const loadedThroughIndex = i + batch.length;
                this.isLoadingMoreDbReport = loadedThroughIndex < remainingDates.length;
                this.applyLoadedReportToView(preserveComments);
            }

            this.finalizeLoadedReportData(preserveComments);
            this.isLoadingMoreDbReport = false;
            this.applyLoadedReportToView(preserveComments);
        } catch (err: unknown) {
            if (token !== this.dbLoadToken) {
                return;
            }
            this.isLoadingDbReport = false;
            this.isLoadingMoreDbReport = false;
            const httpErr = err as HttpErrorResponse;
            if (httpErr?.status === 404) {
                console.log('Backend non disponible - les donnees sauvegardees ne seront pas chargees');
                return;
            }
            this.dbLoadError = this.resolveDbLoadErrorMessage(err);
            console.error('Erreur chargement rapport base:', err);
            this.popupService.showError('Chargement du rapport', this.dbLoadError);
        }
    }

    saveRow(item: ReconciliationReportData) {
        // Obsolète: remplacé par confirmAndSave
        this.confirmAndSave(item);
    }

    /**
     * Force un rechargement complet de la page sans cache (équivalent à Shift+F5)
     */
    private forceReload(): void {
        // Attendre un court délai pour laisser le message de succès s'afficher
        setTimeout(() => {
            // Forcer le rechargement sans cache en ajoutant un paramètre unique à l'URL
            const url = new URL(window.location.href);
            url.searchParams.set('_reload', Date.now().toString());
            window.location.href = url.toString();
        }, 500);
    }

    /**
     * Détermine le traitement par défaut selon la présence d'écarts
     * - Si écarts > 0 : "Niveau Support"
     * - Si pas d'écarts (tous à 0) : "Responsable CDO"
     */
    private determineDefaultTraitement(item: ReconciliationReportData): string {
        // Convertir en nombres et s'assurer que les valeurs null/undefined sont traitées comme 0
        const boOnly = this.normalizeNumericValue(item.boOnly);
        const partnerOnly = this.normalizeNumericValue(item.partnerOnly);
        const mismatches = this.normalizeNumericValue(item.mismatches);
        
        const totalEcarts = boOnly + partnerOnly + mismatches;
        
        // Seulement "Niveau Support" si on a AU MOINS un écart
        return totalEcarts > 0 ? 'Niveau Support' : 'Responsable CDO';
    }

    private normalizeUniqKeyPart(value: string | null | undefined): string {
        return (value ?? '').trim().toUpperCase();
    }

    private buildUniqKeyForRow(item: Pick<ReconciliationReportData, 'date' | 'agency' | 'service' | 'country'>): string {
        const date = (item.date ?? '').toString().trim();
        return [
            date,
            this.normalizeUniqKeyPart(item.agency),
            this.normalizeUniqKeyPart(item.service),
            this.normalizeUniqKeyPart(item.country)
        ].join('__');
    }

    private findDuplicateRowByKey(
        draft: ReconciliationReportData
    ): ReconciliationReportData | null {
        const key = this.buildUniqKeyForRow(draft);
        // Chercher un doublon dans les lignes déjà présentes (DB ou local), autre que la ligne courante
        return this.reportData.find(r => r !== draft && this.buildUniqKeyForRow(r) === key) ?? null;
    }

    private computeMatchesAndRate(totalTransactions: number, boOnly: number, partnerOnly: number, mismatches: number): { matches: number; matchRate: number } {
        // Règle métier:
        // - Seuls les écarts BO (et les incohérences) impactent les correspondances.
        // - Les écarts Partenaire restent visibles dans le commentaire mais ne "reviennent" pas en correspondances.
        const totalEcartsForMatches = boOnly + mismatches;
        const matches = totalTransactions > 0 ? Math.max(0, totalTransactions - totalEcartsForMatches) : 0;

        const matchRate =
            totalTransactions > 0
                ? (boOnly === 0 && mismatches === 0 ? 100 : (matches / totalTransactions) * 100)
                : 0;

        return { matches, matchRate };
    }

    private removeDraftRowFromTable(draft: ReconciliationReportData): void {
        const idx = this.reportData.indexOf(draft);
        if (idx >= 0) {
            this.reportData.splice(idx, 1);
            this.extractUniqueValues();
            this.filterReport();
            this.updatePagination();
        }
    }

    private async updateExistingRowPartnerOnlyOnly(existingRow: ReconciliationReportData, newPartnerOnly: number): Promise<void> {
        if (!existingRow.id) {
            this.popupService.showError(this.translateKey('RPT.row.updateNoId'), this.translateKey('RPT.row.updateImpossibleTitle'));
            return;
        }

        if (this.isRowLocked(existingRow)) {
            this.popupService.showWarning(this.translateKey('RPT.row.lockedOkDone'), this.translateKey('RPT.row.lockedTitle'));
            return;
        }

        const savedComment = existingRow.comment ?? '';
        const previousTraitement = existingRow.traitement;
        const previousStatus = existingRow.status;

        existingRow.partnerOnly = this.normalizeNumericValue(newPartnerOnly);
        // Mettre à jour les champs calculés sans toucher au commentaire
        this.recalculateMatchRate(existingRow, true);

        // Ne pas impacter statut / traitement / commentaire
        existingRow.comment = savedComment;
        existingRow.traitement = previousTraitement;
        existingRow.status = previousStatus;

        const payload = {
            date: existingRow.date,
            agency: existingRow.agency,
            service: existingRow.service,
            country: existingRow.country,
            env: this.normalizeReleveEnvKey(existingRow.env),
            totalTransactions: existingRow.totalTransactions,
            totalVolume: existingRow.totalVolume,
            matches: existingRow.matches,
            boOnly: existingRow.boOnly,
            partnerOnly: existingRow.partnerOnly,
            mismatches: existingRow.mismatches,
            matchRate: existingRow.matchRate,
            status: existingRow.status,
            comment: savedComment,
            traitement: existingRow.traitement || '',
            glpiId: existingRow.glpiId || ''
        };

        await this.putResult8RecWithRetry<any>(existingRow.id, payload, { maxRetries: 3, baseDelayMs: 500 });
        this.popupService.showSuccess(
            this.translateKey('RPT.row.partnerGapsUpdatedMessage', { id: existingRow.id }),
            this.translateKey('RPT.row.partnerGapsUpdatedTitle')
        );

        // Rafraîchir les données DB (sans écraser les commentaires)
        const preserveComments = new Map<number, string>();
        preserveComments.set(existingRow.id, savedComment);
        this.loadSavedReportFromDatabase(preserveComments);
    }

    /**
     * Construit un payload de mise à jour qui ne modifie que `partnerOnly` et `comment`.
     * Tous les autres champs restent identiques à l'enregistrement existant (DB).
     *
     * Note: on conserve la règle "statut OK => commentaire inchangé".
     */
    private buildPartnerOnlyAndCommentOnlyUpdatePayloadFromExisting(
        existing: any,
        newPartnerOnly: number,
        newComment: string,
        envOverride?: string
    ): any {
        const existingStatus = (existing?.status ?? '').toString();
        const finalComment = existingStatus === 'OK' ? (existing?.comment ?? '').toString() : (newComment ?? '').toString();

        const payload = {
            date: existing?.date,
            agency: existing?.agency,
            service: existing?.service,
            country: existing?.country,
            env: this.normalizeReleveEnvKey(envOverride || existing?.env),
            totalTransactions: Number(existing?.totalTransactions ?? 0) || 0,
            totalVolume: Number(existing?.totalVolume ?? 0) || 0,
            matches: Number(existing?.matches ?? 0) || 0,
            boOnly: Number(existing?.boOnly ?? 0) || 0,
            partnerOnly: this.normalizeNumericValue(newPartnerOnly),
            mismatches: Number(existing?.mismatches ?? 0) || 0,
            matchRate: Number(existing?.matchRate ?? 0) || 0,
            status: existingStatus,
            comment: finalComment,
            traitement: (existing?.traitement ?? '').toString(),
            glpiId: (existing?.glpiId ?? '').toString()
        };

        return payload;
    }

    /**
     * Construit un payload complet de mise à jour à partir des données de la ligne en mémoire (item).
     * Permet de modifier tous les champs éditables (pas seulement partnerOnly et comment).
     * Règle métier: si statut OK, le commentaire n'est pas modifié.
     */
    private buildFullUpdatePayloadFromItem(
        item: ReconciliationReportData,
        envOverride?: string
    ): any {
        const existingStatus = (item?.status ?? '').toString();
        const finalComment = existingStatus === 'OK' ? (item?.comment ?? '').toString() : (item?.comment ?? '').toString();

        const payload = {
            date: item?.date,
            agency: item?.agency,
            service: item?.service,
            country: item?.country,
            env: this.normalizeReleveEnvKey(envOverride || item?.env),
            totalTransactions: this.normalizeNumericValue(item?.totalTransactions),
            totalVolume: this.normalizeNumericValue(item?.totalVolume),
            matches: this.normalizeNumericValue(item?.matches),
            boOnly: this.normalizeNumericValue(item?.boOnly),
            partnerOnly: this.normalizeNumericValue(item?.partnerOnly),
            mismatches: this.normalizeNumericValue(item?.mismatches),
            matchRate: this.normalizeNumericValue(item?.matchRate),
            status: existingStatus,
            comment: finalComment,
            traitement: (item?.traitement ?? '').toString(),
            glpiId: (item?.glpiId ?? '').toString()
        };

        return payload;
    }

    private async updatePartnerOnlyFromExistingApiEntity(existing: any, newPartnerOnly: number): Promise<void> {
        const id = existing?.id;
        if (!id) {
            this.popupService.showError(this.translateKey('RPT.row.existingIdNotFound'), this.translateKey('RPT.row.updateImpossibleTitle'));
            return;
        }

        // Si on a déjà la ligne en mémoire, on préfère la mettre à jour localement (meilleure cohérence UI)
        const inMemory = this.reportData.find(r => r.id === id);
        if (inMemory) {
            await this.updateExistingRowPartnerOnlyOnly(inMemory, newPartnerOnly);
            return;
        }

        const totalTransactions = Number(existing.totalTransactions ?? 0) || 0;
        const totalVolume = Number(existing.totalVolume ?? 0) || 0;
        const boOnly = Number(existing.boOnly ?? 0) || 0;
        const mismatches = Number(existing.mismatches ?? 0) || 0;
        const partnerOnly = this.normalizeNumericValue(newPartnerOnly);

            const matches = Number(existing.matches ?? 0) || 0;
            const matchRate = totalTransactions > 0 ? (matches / totalTransactions) * 100 : 0;

            // Mettre à jour le commentaire avec les deux écarts (BO + Partenaire) pour cohérence
            const comment =
                existing.status === 'OK'
                    ? (existing.comment ?? '')
                    : this.buildCommentForCounts(matches, boOnly, partnerOnly, mismatches, totalTransactions);

        const payload = {
            date: existing.date,
            agency: existing.agency,
            service: existing.service,
            country: existing.country,
            env: this.normalizeReleveEnvKey(existing?.env),
            totalTransactions,
            totalVolume,
            matches,
            boOnly,
            partnerOnly,
            mismatches,
            matchRate,
            status: existing.status,
            comment,
            traitement: existing.traitement ?? '',
            glpiId: existing.glpiId ?? ''
        };

        await this.putResult8RecWithRetry<any>(id, payload, { maxRetries: 3, baseDelayMs: 500 });
        this.popupService.showSuccess(
            this.translateKey('RPT.row.partnerGapsUpdatedMessage', { id }),
            this.translateKey('RPT.row.partnerGapsUpdatedTitle')
        );
        this.loadSavedReportFromDatabase();
    }

    async confirmAndSave(item: ReconciliationReportData) {
        // Contrôle d'unicité sur la clé (date, agence, service, pays)
        const duplicateLocal = this.findDuplicateRowByKey(item);
        if (duplicateLocal) {
            if (!duplicateLocal.id) {
                this.popupService.showWarning(
                    this.translateKey('RPT.duplicate.unsaved'),
                    this.translateKey('RPT.duplicate.title')
                );
                return;
            }
            const existingId = duplicateLocal.id
                ? `id=${duplicateLocal.id}`
                : this.translateKey('RPT.duplicate.idUnknown');
            const msg = this.translateKey('RPT.duplicate.existsPartner', {
                    id: existingId,
                    details: `${this.formatDate(item.date)} | ${item.agency} | ${item.service} | ${item.country}`,
                    current: this.normalizeNumericValue(duplicateLocal.partnerOnly),
                    next: this.normalizeNumericValue(item.partnerOnly)
                });

            const confirmedUpdate = await this.popupService.showConfirm(msg, this.translateKey('RPT.duplicate.title'));
            if (!confirmedUpdate) {
                return;
            }

            try {
                await this.updateExistingRowPartnerOnlyOnly(duplicateLocal, this.normalizeNumericValue(item.partnerOnly));
                // La ligne saisie était un doublon: on la retire pour éviter la confusion
                this.removeDraftRowFromTable(item);
            } catch (e: any) {
                console.error('❌ Erreur mise à jour écarts partenaire (doublon local)', e);
                this.popupService.showError(this.translateKey('RPT.row.partnerGapsUpdateError'));
            }
            return;
        }

        // 1) Sélectionner l'environnement pour cette ligne
        const envOptions = this.envOptions;
        const itemEnvNorm = this.normalizeReleveEnvKey(item.env);
        const currentEnv = envOptions.includes(itemEnvNorm)
            ? itemEnvNorm
            : (envOptions.includes(this.normalizeReleveEnvKey(this.releveEnv))
                  ? this.normalizeReleveEnvKey(this.releveEnv)
                  : 'T-E');
        const selectedEnv = await this.popupService.showSelectInput(
            this.translateKey('RPT.ticket.envMessage'),
            this.translateKey('RPT.ticket.envLabel'),
            envOptions,
            currentEnv
        );
        if (!selectedEnv) {
            // Annulation du choix => on annule la sauvegarde
            return;
        }
        item.env = selectedEnv;

        // 2) Confirmation finale de la sauvegarde
        const message = this.translateKey('RPT.row.saveConfirm', {
            details: `${this.formatDate(item.date)} | ${item.agency} | ${item.service} | ${item.country}`,
            env: item.env
        });
        const confirmed = await this.popupService.showConfirm(message, this.translateKey('RPT.row.saveConfirmTitle'));
        if (!confirmed) return;
        
        // PROTECTION ABSOLUE : Pour le statut OK, préserver le commentaire existant
        const savedComment = item.status === 'OK' ? (item.comment ?? '') : item.comment;
        
        // Pour le statut OK : CDO → GROUP → Terminé selon l'état du relevé
        let traitement: string;
        if (item.status === 'OK') {
            if (this.isPreservedTraitementOnOk(item)) {
                traitement = this.normalizeTraitementValue(item.traitement);
            } else {
                traitement = this.defaultOkTraitement;
                item.traitement = traitement;
            }
            console.log(`🔄 confirmAndSave: Statut OK - traitement="${traitement}" pour ${item.agency}/${item.service}, commentaire préservé: "${savedComment}"`);
        } else {
            // Pour les autres statuts, utiliser le traitement existant ou le traitement par défaut
            traitement = item.traitement && item.traitement.trim() !== ''
                ? item.traitement
                : this.determineDefaultTraitement(item);
        }
        
        // Log pour déboguer les écarts partenaires
        if (item.partnerOnly > 0) {
            console.log(`💾 confirmAndSave: Sauvegarde ligne ${item.agency}/${item.service} avec partnerOnly=${item.partnerOnly}, matches=${item.matches}, boOnly=${item.boOnly}, totalTransactions=${item.totalTransactions}`);
        }
        
        const payload = {
            date: item.date,
            agency: item.agency,
            service: item.service,
            country: item.country,
            env: this.normalizeReleveEnvKey(item.env),
            glpiId: item.glpiId || '',
            totalTransactions: item.totalTransactions,
            totalVolume: item.totalVolume,
            matches: item.matches,
            boOnly: item.boOnly,
            partnerOnly: item.partnerOnly,
            mismatches: item.mismatches,
            matchRate: item.matchRate,
            status: item.status,
            comment: savedComment, // Utiliser le commentaire préservé pour statut OK
            traitement: traitement
        };
        
        // Log complet du payload pour déboguer
        console.log(`💾 confirmAndSave - Payload complet pour ${item.agency}/${item.service}:`, JSON.stringify(payload, null, 2));
        try {
            const saved = await firstValueFrom(
                this.http.post<any>('/api/result8rec', payload, { headers: this.buildResultsHeaders() })
            );
            item.id = saved.id;
            this.appStateService.notifySummarySaved();
            await this.popupService.showSuccess(this.translateKey('RPT.row.saved'));
            await this.maybeOfferEcartBoSummaryRedirectForRows([item]);
        } catch (err: unknown) {
            const httpErr = err as HttpErrorResponse;
            if (httpErr?.status === 409) {
                const existing = httpErr.error;
                const msg = this.translateKey('RPT.duplicate.existsApi', {
                        id: existing?.id,
                        details: `${this.formatDate(item.date)} | ${item.agency} | ${item.service} | ${item.country}`,
                        next: this.normalizeNumericValue(item.partnerOnly)
                    });

                const ok = await this.popupService.showConfirm(msg, this.translateKey('RPT.duplicate.title'));
                if (!ok) {
                    return;
                }
                try {
                    await this.updatePartnerOnlyFromExistingApiEntity(existing, this.normalizeNumericValue(item.partnerOnly));
                    this.removeDraftRowFromTable(item);
                } catch (e: any) {
                    console.error('❌ Erreur mise à jour écarts partenaire (doublon backend)', e);
                    this.popupService.showError(this.translateKey('RPT.row.partnerGapsUpdateError'));
                }
            } else {
                console.error('❌ Erreur de sauvegarde', err);
                this.popupService.showError(this.translateKey('RPT.row.saveError'), this.translateKey('RPT.row.saveErrorTitle'));
            }
        }
    }

    async deleteRow(item: ReconciliationReportData) {
        if (!item.id) return;
        const confirmed = await this.popupService.showConfirm(
            this.translateKey('RPT.row.deleteConfirm', { id: item.id }), 
            this.translateKey('RPT.row.deleteConfirmTitle')
        );
        if (!confirmed) return;
        
        this.http.delete('/api/result8rec/' + item.id, { headers: this.buildResultsHeaders() })
        .subscribe({
            next: () => {
                // Ne pas supprimer la ligne du rapport (qui est calculée) mais juste retirer l'id
                item.id = undefined;
                this.popupService.showSuccess(this.translateKey('RPT.row.deleted'));
                // Actualiser la page/données après suppression
                if (this.currentSource === 'db') {
                    this.loadSavedReportFromDatabase();
                }
            },
            error: (err: HttpErrorResponse) => {
                console.error('❌ Erreur suppression', err);
                this.popupService.showError('Erreur de suppression', 'Impossible de supprimer l\'enregistrement');
            }
        });
    }

    async updateRow(item: ReconciliationReportData) {
        if (!item.id) return;
        const confirmed = await this.popupService.showConfirm(
            this.translateKey('RPT.row.updateConfirmLocal', { id: item.id }),
            this.translateKey('RPT.row.updateConfirmTitle')
        );
        if (!confirmed) return;

        // PROTECTION ABSOLUE : Sauvegarder le commentaire AVANT toute modification pour le préserver
        // Pour le statut OK, le commentaire ne doit JAMAIS être modifié
        const savedComment = item.comment ?? '';

        // Recalculer les valeurs selon le statut
        // ⚠️ Pour le statut OK, les données (matches, écarts, traitement) ont déjà été
        // recalculées dans recalculateDataBasedOnStatus lors du changement de statut.
        // On réutilise donc directement l'item courant pour ne pas perdre la mémoire des écarts.
        const recalculatedData = item.status === 'OK'
            ? { ...item }
            : this.recalculateDataBasedOnStatus(item);
        
        // PROTECTION ABSOLUE : S'assurer que le commentaire préservé est utilisé dans les données recalculées
        // et dans l'item original également - EN AUCUN CAS le commentaire ne doit être modifié pour statut OK
        recalculatedData.comment = savedComment;
        item.comment = savedComment;

        // Pour le statut OK, le traitement doit être "Responsable CDO" (déjà défini dans recalculateDataBasedOnStatus)
        // Pour les autres statuts, utiliser le traitement existant ou le traitement par défaut
        let traitement: string;
        if (item.status === 'OK') {
            // S'assurer que le traitement est bien "Responsable CDO" pour le statut OK
            traitement = recalculatedData.traitement && recalculatedData.traitement.trim() !== ''
                ? recalculatedData.traitement
                : 'Responsable CDO';
            console.log(`🔄 updateRow: Statut OK - traitement forcé à "${traitement}" pour ${item.agency}/${item.service}, commentaire préservé: "${savedComment}"`);
        } else {
            // Pour les autres statuts, utiliser le traitement existant ou le traitement par défaut
            traitement = recalculatedData.traitement && recalculatedData.traitement.trim() !== ''
                ? recalculatedData.traitement
                : this.determineDefaultTraitement(recalculatedData);
        }

        // Log pour déboguer les écarts partenaires
        if (recalculatedData.partnerOnly > 0) {
            console.log(`💾 updateRow: Mise à jour ligne ${recalculatedData.agency}/${recalculatedData.service} avec partnerOnly=${recalculatedData.partnerOnly}, matches=${recalculatedData.matches}, boOnly=${recalculatedData.boOnly}, totalTransactions=${recalculatedData.totalTransactions}`);
        }

        const payload = {
            date: recalculatedData.date,
            agency: recalculatedData.agency,
            service: recalculatedData.service,
            country: recalculatedData.country,
            env: this.normalizeReleveEnvKey(recalculatedData.env),
            totalTransactions: recalculatedData.totalTransactions,
            totalVolume: recalculatedData.totalVolume,
            matches: recalculatedData.matches,
            boOnly: recalculatedData.boOnly,
            partnerOnly: recalculatedData.partnerOnly,
            mismatches: recalculatedData.mismatches,
            matchRate: recalculatedData.matchRate,
            status: recalculatedData.status,
            comment: savedComment, // Utiliser le commentaire préservé
            traitement: traitement,
            glpiId: recalculatedData.glpiId || ''
        };
        
        // Log complet du payload pour déboguer
        this.debugLog(
            `💾 updateRow - Payload complet pour ${recalculatedData.agency}/${recalculatedData.service}:`,
            JSON.stringify(payload, null, 2)
        );

        const ecartBoRedirectSnapshot: ReconciliationReportData = { ...item };

        try {
            await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
            this.notifyResult8RecUpdated();
            await this.popupService.showSuccess(this.translateKey('RPT.row.updated'));
            await this.maybeOfferEcartBoSummaryRedirectForRows([ecartBoRedirectSnapshot]);
            // Mettre à jour localement l'item avec le commentaire préservé
            item.comment = savedComment;
            
            // Créer une map pour préserver les commentaires lors du rechargement
            const preserveComments = new Map<number, string>();
            preserveComments.set(item.id, savedComment);
            
            // Rafraîchir les données après la mise à jour en préservant les commentaires
            this.loadSavedReportFromDatabase(preserveComments);
            
            // Après le rechargement, restaurer le commentaire préservé pour cette ligne
            setTimeout(() => {
                const updatedItem = this.reportData.find(r => r.id === item.id);
                const filteredItem = this.filteredReportData.find(r => r.id === item.id);
                
                if (preserveComments.has(item.id!)) {
                    const preservedComment = preserveComments.get(item.id!)!;
                    // Restaurer dans reportData
                    if (updatedItem) {
                        updatedItem.comment = preservedComment;
                    }
                    // Restaurer dans filteredReportData
                    if (filteredItem) {
                        filteredItem.comment = preservedComment;
                    }
                    // Restaurer dans l'item original
                    item.comment = preservedComment;
                }
                // Mettre à jour la pagination pour refléter les changements
                this.updatePagination();
            }, 200);
        } catch (err: any) {
            this.debugWarn('❌ Erreur de mise à jour', err);
            this.popupService.showError(this.translateKey('RPT.row.updateError'), this.translateKey('RPT.row.updateErrorTitle'));
        }
    }

    async saveAll() {
        // Sauvegarder uniquement les lignes sélectionnées (checkbox)
        const selected = Array.from(this.selectedRows);
        if (selected.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.bulk.noSelection'), this.translateKey('RPT.bulk.noSelectionTitle'));
            return;
        }

        // Filtrer uniquement les lignes qui ont les données requises (agence, service, pays)
        const rowsSource = selected.filter(item => 
            item.agency && item.agency.trim() !== '' && 
            item.service && item.service.trim() !== '' && 
            item.country && item.country.trim() !== ''
        );
        
        if (rowsSource.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.bulk.nothingToSave'), this.translateKey('RPT.bulk.nothingToSaveTitle'));
            return;
        }
        
        // Afficher un popup pour sélectionner la date à appliquer à toutes les lignes
        // Date par défaut : J-1 (hier)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const defaultDate = yesterday.toISOString().split('T')[0];
        
        const selectedDate = await this.popupService.showDateInput(
            this.translateKey('RPT.bulk.selectDateMessage', { count: rowsSource.length }),
            this.translateKey('RPT.bulk.selectDateTitle'),
            defaultDate // Date par défaut : J-1
        );
        
        if (!selectedDate) {
            // L'utilisateur a annulé la sélection de date
            return;
        }

        // Sélectionner l'environnement à appliquer à toutes les lignes
        const envOptions = this.envOptions;
        const releveNorm = this.normalizeReleveEnvKey(this.releveEnv);
        const defaultEnvAll = envOptions.includes(releveNorm) ? releveNorm : 'T-E';
        const selectedEnvAll = await this.popupService.showSelectInput(
            this.translateKey('RPT.bulk.selectEnvMessage', { count: rowsSource.length }),
            'Environnement pour toutes les lignes',
            envOptions,
            defaultEnvAll
        );
        if (!selectedEnvAll) {
            // Annulation du choix d'environnement
            return;
        }
        
        const confirmed = await this.popupService.showConfirm(
            `Confirmer la sauvegarde de ${rowsSource.length} ligne(s) avec la date ${selectedDate} et l'environnement ${selectedEnvAll} ?`, 
            'Confirmation de sauvegarde en masse'
        );
        if (!confirmed) return;

        // Préparer les payloads en distinguant CREATE vs UPDATE.
        // RÈGLE MÉTIER: en UPDATE (ligne avec id), seule la colonne "écart partenaire" doit être modifiée.
        type PreparedCreate = {
            mode: 'create';
            sourceItem: ReconciliationReportData;
            payloadItem: any;
            /** boOnly avant recalcul (le recalcul OK met souvent boOnly à 0 dans le payload). */
            ecartBoHintPreRecalc: number;
        };
        type PreparedUpdate = {
            mode: 'update';
            sourceItem: ReconciliationReportData;
            newPartnerOnly: number;
            newComment: string;
            env: string;
            ecartBoHintPreRecalc: number;
        };
        const prepared: Array<PreparedCreate | PreparedUpdate> = rowsSource.map((item) => {
            // Mettre à jour l'environnement sur l'item en mémoire
            item.env = selectedEnvAll;

            const ecartBoHintPreRecalc = this.normalizeNumericValue(item.boOnly) || 0;

            if (item.id) {
                return {
                    mode: 'update',
                    sourceItem: item,
                    newPartnerOnly: this.normalizeNumericValue(item.partnerOnly),
                    newComment: (item.comment ?? '').toString(),
                    env: selectedEnvAll,
                    ecartBoHintPreRecalc
                };
            }

            const recalculatedData = this.recalculateDataBasedOnStatus(item);
            const traitement = recalculatedData.traitement && recalculatedData.traitement.trim() !== ''
                ? recalculatedData.traitement
                : this.determineDefaultTraitement(recalculatedData);

            return {
                mode: 'create',
                sourceItem: item,
                payloadItem: {
                    date: selectedDate,
                    agency: recalculatedData.agency,
                    service: recalculatedData.service,
                    country: recalculatedData.country,
                    env: selectedEnvAll,
                    glpiId: recalculatedData.glpiId || '',
                    totalTransactions: recalculatedData.totalTransactions,
                    totalVolume: recalculatedData.totalVolume,
                    matches: recalculatedData.matches,
                    boOnly: recalculatedData.boOnly,
                    partnerOnly: recalculatedData.partnerOnly,
                    mismatches: recalculatedData.mismatches,
                    matchRate: recalculatedData.matchRate,
                    status: recalculatedData.status,
                    comment: recalculatedData.comment,
                    traitement: traitement
                },
                ecartBoHintPreRecalc
            };
        });

        let createdCount = 0;
        let updatedCount = 0;
        let skippedDuplicates = 0;
        let errorCount = 0;
        const saveFailureLines: string[] = [];
        const recordSaveFailure = (agency: string, service: string, country: string, err: unknown) => {
            const he = err as HttpErrorResponse;
            const st = he?.status != null ? String(he.status) : '?';
            let detail = '';
            const b = he?.error;
            if (typeof b === 'string') {
                detail = b.slice(0, 200);
            } else if (b && typeof b === 'object' && 'message' in b) {
                detail = String((b as { message?: string }).message || '').slice(0, 200);
            } else if (err instanceof Error) {
                detail = err.message.slice(0, 200);
            }
            saveFailureLines.push(
                `${agency} | ${service} | ${country} — HTTP ${st}${detail ? ` — ${detail}` : ''}`
            );
        };

        // Mises à jour (lignes déjà persistées) : requêtes séquentielles avec léger espacement (évite le 429)
        for (const row of prepared) {
            if (row.mode !== 'update') {
                continue;
            }
            const item = row.sourceItem;
            try {
                const id = item.id;
                if (!id) {
                    continue;
                }
                // Utiliser toutes les données de la ligne en mémoire (item) pour permettre la modification de tous les champs
                // Règle métier conservée: si statut OK, le commentaire n'est pas modifié
                const payload = this.buildFullUpdatePayloadFromItem(item, row.env);
                await this.putResult8RecWithRetry<any>(id, payload, { maxRetries: 5, baseDelayMs: 600 });
                updatedCount++;
                this.appStateService.notifySummarySaved();
            } catch (e) {
                console.error('❌ saveAll: erreur mise à jour ligne', e);
                errorCount++;
                recordSaveFailure(item.agency, item.service, item.country, e);
            }
            await this.sleep(60);
        }

        // Créations : un seul POST /bulk par lot (évite des centaines de requêtes → plus de 429)
        const createRows = prepared.filter((r): r is PreparedCreate => r.mode === 'create');
        const bulkChunkSize = 350;
        const bulkConflicts: Array<{ prepared: PreparedCreate; existing: any }> = [];

        for (let offset = 0; offset < createRows.length; offset += bulkChunkSize) {
            const chunk = createRows.slice(offset, offset + bulkChunkSize);
            const bodies = chunk.map((c) => c.payloadItem);
            try {
                const bulkResp = await firstValueFrom(
                    this.http.post<{ results: Array<{ status: string; entity: any }> }>('/api/result8rec/bulk', bodies, {
                        headers: this.buildResultsHeaders()
                    })
                );
                const results = bulkResp?.results ?? [];
                if (results.length !== chunk.length) {
                    errorCount += chunk.length;
                    for (const c of chunk) {
                        recordSaveFailure(c.payloadItem.agency, c.payloadItem.service, c.payloadItem.country, {
                            status: 0,
                            error: `Réponse bulk incohérente (${results.length}/${chunk.length})`
                        } as HttpErrorResponse);
                    }
                    continue;
                }
                for (let i = 0; i < chunk.length; i++) {
                    const outcome = results[i];
                    const c = chunk[i];
                    const st = (outcome?.status || '').toUpperCase();
                    if (st === 'CREATED' && outcome.entity?.id != null) {
                        c.sourceItem.id = outcome.entity.id;
                        createdCount++;
                        this.appStateService.notifySummarySaved();
                    } else if (st === 'CONFLICT' && outcome.entity?.id != null) {
                        bulkConflicts.push({ prepared: c, existing: outcome.entity });
                    } else {
                        errorCount++;
                        recordSaveFailure(
                            c.payloadItem.agency,
                            c.payloadItem.service,
                            c.payloadItem.country,
                            { status: 0, error: `Réponse bulk inattendue: ${JSON.stringify(outcome)}` } as HttpErrorResponse
                        );
                    }
                }
            } catch (e) {
                console.error('❌ saveAll: erreur bulk create', e);
                errorCount += chunk.length;
                for (const c of chunk) {
                    recordSaveFailure(c.payloadItem.agency, c.payloadItem.service, c.payloadItem.country, e);
                }
            }
        }

        if (bulkConflicts.length > 0) {
            const mergeAll = await this.popupService.showConfirm(
                this.translateKey('RPT.bulk.duplicatesFound', { count: bulkConflicts.length }),
                this.translateKey('RPT.bulk.duplicatesFoundTitle')
            );
            if (mergeAll) {
                for (const { prepared: p, existing } of bulkConflicts) {
                    const existingId = existing?.id;
                    if (!existingId) {
                        skippedDuplicates++;
                        continue;
                    }
                    try {
                        // Utiliser les données de la ligne source (p.sourceItem) qui contient toutes les modifications
                        const updatePayload = this.buildFullUpdatePayloadFromItem(p.sourceItem, selectedEnvAll);
                        await this.putResult8RecWithRetry<any>(existingId, updatePayload, { maxRetries: 5, baseDelayMs: 600 });
                        updatedCount++;
                        p.sourceItem.id = existingId;
                        this.appStateService.notifySummarySaved();
                    } catch (e) {
                        errorCount++;
                        recordSaveFailure(p.payloadItem.agency, p.payloadItem.service, p.payloadItem.country, e);
                    }
                    await this.sleep(80);
                }
            } else {
                skippedDuplicates += bulkConflicts.length;
            }
        }

        const failuresAppend =
            saveFailureLines.length > 0
                ? this.translateKey('RPT.bulk.saveErrors', {
                            count: saveFailureLines.length,
                            details: saveFailureLines.slice(0, 20).join('\n')
                        }) +
                  (saveFailureLines.length > 20 ? `\n… et ${saveFailureLines.length - 20} autre(s)` : '')
                : '';

        const anySaveOk = createdCount + updatedCount > 0;

        const summaryMessage =
            this.translateKey('RPT.bulk.saveSummary', { created: createdCount, updated: updatedCount, skipped: skippedDuplicates, errors: errorCount }) +
            failuresAppend;

        await this.popupService.showSuccess(summaryMessage);
        if (anySaveOk) {
            // Laisser le DOM se stabiliser après fermeture du popup Succès (évite que le confirm ne s’affiche pas).
            await new Promise<void>(resolve => setTimeout(resolve, 80));
            const redirectRows = this.collectEcartBoRedirectCandidateRows(rowsSource, prepared);
            await this.maybeOfferEcartBoSummaryRedirectForRows(redirectRows);
        }
        this.clearSelection();
    }

    /**
     * Lignes pour lesquelles proposer Résumé Écarts BO après saveAll (hint boOnly avant recalcul + détection commentaire / détail BO).
     * Aucun popup si tout est à 0 écart BO.
     */
    private collectEcartBoRedirectCandidateRows(
        rowsSource: ReconciliationReportData[],
        prepared: ReadonlyArray<{ sourceItem: ReconciliationReportData; ecartBoHintPreRecalc: number }>
    ): ReconciliationReportData[] {
        const set = new Set<ReconciliationReportData>();
        for (const row of rowsSource) {
            if (this.reportRowIndicatesBoEcartWork(row)) {
                set.add(row);
            }
        }
        for (const p of prepared) {
            if ((p.ecartBoHintPreRecalc ?? 0) > 0) {
                set.add(p.sourceItem);
            }
        }
        return [...set];
    }

    goToReconciliationDashboard() {
        this.router.navigate(['/reconciliation-dashboard']);
    }

    /**
     * Ligne concernée par des écarts BO pour proposer « Résumé Écarts BO ».
     * La redirection ne doit être proposée que si la colonne Écarts BO est strictement > 0.
     */
    private reportRowIndicatesBoEcartWork(row: ReconciliationReportData): boolean {
        return (this.normalizeNumericValue(row.boOnly) || 0) > 0;
    }

    /**
     * Propose la redirection vers /ecart-bo-summary si pertinent. Retourne true si l’utilisateur confirme la navigation.
     */
    private async maybeOfferEcartBoSummaryRedirectForRows(rows: ReconciliationReportData[]): Promise<boolean> {
        const candidates = rows.filter(r => this.reportRowIndicatesBoEcartWork(r));
        if (candidates.length === 0) {
            return false;
        }
        const confirmed = await this.popupService.showConfirm(
            this.translateKey('RPT.ecartSummary.candidates', { count: candidates.length }),
            this.translateKey('RPT.ecartSummary.title')
        );
        if (confirmed) {
            this.router.navigate(['/ecart-bo-summary']);
            return true;
        }
        return false;
    }

    /**
     * Calcule le volume des écarts BO uniquement pour une combinaison agence/service/pays/date
     * Utilise EXACTEMENT la même logique que loadSummaryData() dans ecart-bo-summary.component.ts
     */
    private calculateBoOnlyVolume(agency: string, service: string, country: string, date: string): number {
        // Essayer d'abord avec ReconciliationTabsService (données filtrées)
        let boOnlyData: Record<string, string>[] = [];
        if (this.reconciliationTabsService.getFilteredBoOnly()?.length) {
            boOnlyData = this.reconciliationTabsService.getFilteredBoOnly();
        } else if (this.response?.boOnly?.length) {
            boOnlyData = this.scopeRecordsToMagic(this.response.boOnly);
        }
        
        if (!boOnlyData || boOnlyData.length === 0) {
            console.warn('⚠️ calculateBoOnlyVolume: Pas de données boOnly disponibles');
            return 0;
        }

        // Fonction helper pour extraire les valeurs - EXACTEMENT comme dans ecart-bo-summary
        const getValue = (record: Record<string, string>, keys: string[]): string => {
            for (const key of keys) {
                const originalKey = Object.keys(record).find(k => 
                    fixGarbledCharacters(k).toLowerCase() === key.toLowerCase() || 
                    k.toLowerCase() === key.toLowerCase()
                );
                if (originalKey && record[originalKey]) {
                    return record[originalKey].toString();
                }
                if (record[key]) {
                    return record[key].toString();
                }
            }
            return '';
        };

        // Mêmes clés que dans ecart-bo-summary.component.ts ligne 305-309
        const dateKeys = ['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'dateTransaction', 'DateTransaction'];
        const montantKeys = ['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME'];
        const agenceKeys = ['Agence', 'agence', 'AGENCE', 'agency', 'Agency'];
        const serviceKeys = ['Service', 'service', 'SERVICE', 'serv', 'Serv'];
        const paysKeys = ['Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx'];

        // Normaliser la date pour la comparaison (format YYYY-MM-DD)
        const normalizeDate = (dateStr: string): string => {
            if (!dateStr) return '';
            const datePart = dateStr.split('T')[0];
            return datePart;
        };

        const targetDate = normalizeDate(date);
        let totalMontant = 0;

        // Parcourir tous les enregistrements boOnly et additionner les montants qui correspondent
        // EXACTEMENT comme dans loadSummaryData() ligne 320-342
        boOnlyData.forEach(record => {
            const recordAgency = getValue(record, agenceKeys) || 'Non spécifié';
            const recordService = getValue(record, serviceKeys) || 'Non spécifié';
            const recordCountry = getValue(record, paysKeys) || 'Non spécifié';
            const recordDate = normalizeDate(getValue(record, dateKeys));

            // Vérifier si la transaction correspond à la combinaison recherchée
            const agencyMatch = agency && recordAgency && recordAgency.toLowerCase() === agency.toLowerCase();
            const serviceMatch = service && recordService && recordService.toLowerCase() === service.toLowerCase();
            const countryMatch = country && recordCountry && recordCountry.toLowerCase() === country.toLowerCase();
            const dateMatch = targetDate && recordDate && recordDate === targetDate;

            if (agencyMatch && serviceMatch && countryMatch && dateMatch) {
                // Extraire le montant EXACTEMENT comme dans loadSummaryData() ligne 325-326
                const montantStr = getValue(record, montantKeys);
                const montant = montantStr ? parseFloat(montantStr.toString().replace(',', '.')) : 0;
                totalMontant += isNaN(montant) ? 0 : montant;
            }
        });

        // Log de débogage
        if (totalMontant === 0) {
            console.warn('⚠️ calculateBoOnlyVolume - Volume = 0 pour:', { agency, service, country, date, targetDate });
            console.warn('⚠️ calculateBoOnlyVolume - Total boOnly records disponibles:', boOnlyData.length);
            if (boOnlyData.length > 0) {
                const sample = boOnlyData[0];
                console.warn('⚠️ calculateBoOnlyVolume - Exemple de record (premier):', {
                    keys: Object.keys(sample),
                    agency: getValue(sample, agenceKeys),
                    service: getValue(sample, serviceKeys),
                    country: getValue(sample, paysKeys),
                    date: normalizeDate(getValue(sample, dateKeys)),
                    montant: getValue(sample, montantKeys)
                });
            }
        }

        return totalMontant;
    }

    getRateClass(rate: number): string {
        if (rate >= 95) return 'rate-excellent';
        if (rate >= 85) return 'rate-good';
        if (rate >= 70) return 'rate-average';
        return 'rate-poor';
    }

    private groupDataByAgency(data: ReconciliationReportData[]): any {
        const groupedData: { [key: string]: any } = {};
        
        data.forEach(item => {
            const agency = item.agency;
            
            if (!groupedData[agency]) {
                groupedData[agency] = {
                    agency: agency,
                    services: {},
                    totalTransactions: 0,
                    totalVolume: 0,
                    totalMatches: 0,
                    totalBoOnly: 0,
                    totalPartnerOnly: 0,
                    totalMismatches: 0,
                    averageMatchRate: 0
                };
            }
            
            // Grouper par service dans l'agence
            const service = item.service;
            if (!groupedData[agency].services[service]) {
                groupedData[agency].services[service] = {
                    service: service,
                    transactions: 0,
                    volume: 0,
                    matches: 0,
                    boOnly: 0,
                    partnerOnly: 0,
                    mismatches: 0,
                    matchRate: 0,
                    status: item.status,
                    comment: item.comment,
                    traitement: item.traitement,
                    glpiId: item.glpiId
                };
            }
            
            // Accumuler les totaux
            groupedData[agency].totalTransactions += item.totalTransactions;
            groupedData[agency].totalVolume += item.totalVolume;
            groupedData[agency].totalMatches += item.matches;
            groupedData[agency].totalBoOnly += item.boOnly;
            groupedData[agency].totalPartnerOnly += item.partnerOnly;
            groupedData[agency].totalMismatches += item.mismatches;
            
            // Mettre à jour le service
            groupedData[agency].services[service].transactions += item.totalTransactions;
            groupedData[agency].services[service].volume += item.totalVolume;
            groupedData[agency].services[service].matches += item.matches;
            groupedData[agency].services[service].boOnly += item.boOnly;
            groupedData[agency].services[service].partnerOnly += item.partnerOnly;
            groupedData[agency].services[service].mismatches += item.mismatches;
            groupedData[agency].services[service].matchRate = item.matchRate;
            groupedData[agency].services[service].status = item.status;
            groupedData[agency].services[service].comment = item.comment;
            groupedData[agency].services[service].traitement = item.traitement;
            groupedData[agency].services[service].glpiId = item.glpiId;
        });
        
        // Calculer les taux moyens par agence
        Object.keys(groupedData).forEach(agency => {
            const agencyData = groupedData[agency];
            agencyData.averageMatchRate = agencyData.totalTransactions > 0 
                ? (agencyData.totalMatches / agencyData.totalTransactions) * 100 
                : 0;
        });
        
        return groupedData;
    }

    private exportDetailedReportToExcel(reportData: any) {
        const fileName = `rapport_detaille_agences_${new Date().toISOString().slice(0,10)}`;
        
        // Récupérer les données originales pour avoir toutes les lignes individuelles
        const rowsSource = this.filteredReportData.length > 0 ? this.filteredReportData : this.reportData;
        
        // Feuille 1: Résumé par agence
        const agencySummary = Object.values(reportData).map((agency: any) => ({
            'Agence': agency.agency,
            'Total Transactions': agency.totalTransactions,
            'Total Volume': agency.totalVolume,
            'Correspondances': agency.totalMatches,
            'Écarts BO': agency.totalBoOnly,
            'Écarts Partenaire': agency.totalPartnerOnly,
            'Incohérences': agency.totalMismatches,
            'Taux Moyen': `${agency.averageMatchRate.toFixed(2)}%`,
            'Nombre de Services': Object.keys(agency.services).length
        }));
        
        // Feuille 2: Détail complet - une ligne par agence/service/date
        const detailedRows = rowsSource.map(item => ({
            'Date': this.formatDate(item.date),
            'Agence': item.agency,
            'Service': item.service,
            'Pays': item.country,
            'Transactions': item.totalTransactions,
            'Volume': item.totalVolume,
            'Correspondances': item.matches,
            'Écarts BO': item.boOnly,
            'Écarts Partenaire': item.partnerOnly,
            'Incohérences': item.mismatches,
            'Taux': `${item.matchRate.toFixed(2)}%`,
            'Statut': this.getDisplayStatus(item.status),
            'Commentaire': item.comment,
            'Traitement': this.getTraitementDisplayLabel(item.traitement),
            'ID TICKET': item.glpiId
        }));
        
        // Exporter les deux feuilles séparément
        this.exportService.exportExcelOptimized(
            agencySummary, 
            ['Agence', 'Total Transactions', 'Total Volume', 'Correspondances', 'Écarts BO', 'Écarts Partenaire', 'Incohérences', 'Taux Moyen', 'Nombre de Services'], 
            `${fileName}_resume_agences.xlsx`
        );
        
        // Attendre un peu avant le deuxième export
        setTimeout(() => {
            this.exportService.exportExcelOptimized(
                detailedRows, 
                ['Date', 'Agence', 'Service', 'Pays', 'Transactions', 'Volume', 'Correspondances', 'Écarts BO', 'Écarts Partenaire', 'Incohérences', 'Taux', 'Statut', 'Commentaire', 'Traitement', 'ID TICKET'], 
                `${fileName}_detail_complet.xlsx`
            );
        }, 1000);
    }

    // Méthodes de pagination
    updatePagination() {
        this.totalPages = Math.ceil(this.filteredReportData.length / this.itemsPerPage);
        if (this.currentPage > this.totalPages && this.totalPages > 0) {
            this.currentPage = this.totalPages;
        }
        if (this.currentPage < 1) {
            this.currentPage = 1;
        }
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const slice = this.filteredReportData.slice(startIndex, endIndex);
        this.paginatedData = this.shouldGroupByService() ? this.injectServiceGroupHeaders(slice) : slice;

        // En mode "données en cours", cocher toutes les lignes par défaut (une seule fois)
        if (this.autoSelectAllOnNextPagination && this.currentSource === 'live') {
            this.selectAllFilteredRows();
            this.autoSelectAllOnNextPagination = false;
        }
    }

    /** Vrai quand le rapport magique doit afficher chaque card (service) dans un bloc séparé.
     *
     *  Désactivé : l'en-tête "X agence(s)" agrupait les lignes par service et rendait la
     *  lecture ambiguë (un même service pouvait apparaître en.detail sur une carte et
     *  agrégé sur une autre). Le rapport attendu est une liste plate : lignes Multiagence
     *  (écarts partenaires) en tête, puis lignes d'agence triées par agence. */
    private shouldGroupByService(): boolean {
        return false;
    }

    /** Intercale une ligne d'en-tête de service avant chaque bloc d'agences d'une card. */
    private injectServiceGroupHeaders(rows: ReconciliationReportData[]): ReconciliationReportData[] {
        if (!rows.length) {
            return rows;
        }
        // Regrouper par service (blocs contigus) en gardant les plus récentes d'abord dans chaque bloc.
        const grouped = [...rows].sort((a, b) => {
            const sa = (a.service || '').toString().trim();
            const sb = (b.service || '').toString().trim();
            if (sa !== sb) {
                return sa.localeCompare(sb);
            }
            return this.getSortableDateTime(b.date) - this.getSortableDateTime(a.date);
        });
        const out: ReconciliationReportData[] = [];
        let lastService = '';
        grouped.forEach(row => {
            const service = (row.service || '').toString().trim();
            if (service && service !== lastService) {
                out.push({ __serviceGroupHeader: true, service, country: row.country, date: '', id: `__svc_${service}` } as unknown as ReconciliationReportData);
                lastService = service;
            }
            out.push(row);
        });
        return out;
    }

    /** Vrai si la ligne est un marqueur d'en-tête de groupe de services (non sélectionnable/modifiable). */
    isServiceGroupHeader(item: ReconciliationReportData): boolean {
        return !!(item as any)?.__serviceGroupHeader;
    }

    /** Nombre d'agences (lignes) du bloc d'une card affichées en page courante. */
    serviceGroupRowCount(service: string): number {
        return this.paginatedData.filter(r => !this.isServiceGroupHeader(r) && (r.service || '').trim() === (service || '').trim()).length;
    }

    goToPage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.updatePagination();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePagination();
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePagination();
        }
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

    getPaginationEndIndex(): number {
        if (!this.filteredReportData) return 0;
        return Math.min(this.currentPage * this.itemsPerPage, this.filteredReportData.length);
    }

    getPaginationStartIndex(): number {
        return (this.currentPage - 1) * this.itemsPerPage + 1;
    }

    // Méthodes pour l'édition en ligne
    startEdit(item: ReconciliationReportData) {
        // Vérifier si la ligne est verrouillée
        if (this.isRowLocked(item)) {
            this.popupService.showWarning(this.translateKey('RPT.row.lockedStatusOk'), this.translateKey('RPT.row.lockedTitle'));
            return;
        }
        // Sauvegarder une copie des données originales
        this.originalData = { ...item };
        this.editingRow = item;
    }

    cancelEdit(item: ReconciliationReportData) {
        if (this.originalData) {
            // Restaurer les données originales
            Object.assign(item, this.originalData);
        }
        this.editingRow = null;
        this.originalData = null;
    }

    async saveEdit(item: ReconciliationReportData) {
        // Valider les données avant sauvegarde
        if (!this.validateEditData(item)) {
            return;
        }

        // RÈGLE MÉTIER (reconciliation-report):
        // Pour une mise à jour d'une ligne EXISTANTE, l'utilisateur peut modifier TOUS les champs
        // éditables (service, pays, agence, env, statut, traitement, glpiId, commentaire, écarts...).
        // Seule contrainte conservée : si le statut est OK, le commentaire en base est conservé.
        if (item.id) {
            const base: ReconciliationReportData = this.originalData ? { ...this.originalData } : { ...item };

            // Si la ligne est en statut OK, le commentaire ne doit pas être modifié (protection existante).
            const status = (item.status ?? '').toString();
            const newComment = status === 'OK' ? (base.comment ?? '') : ((item.comment ?? '').toString());
            item.comment = newComment;

            // Conserver les valeurs éditée par l'utilisateur (service, pays, agence, env, statut, traitement,
            // glpiId, écarts...) — on ne réinitialise plus depuis base, seul le commentaire OK est protégé.
            await this.updateRowFull(item, base);

            // Sortir du mode édition
            this.editingRow = null;
            this.originalData = null;
            return;
        }

        // Vérifier si c'est la ligne spéciale
        const isSpecialLine = this.isPartnerOnlySpecialLine(item) || 
            (item.agency === item.service && item.agency && item.service &&
             item.totalTransactions > 0 && item.mismatches === 0);

        // Si on a des données originales, calculer la différence pour les colonnes écarts
        // Le nombre saisi représente le nouveau nombre d'écarts (après déduction)
        if (this.originalData) {
            // Calculer la différence pour les écarts BO
            const originalBoOnly = this.normalizeNumericValue(this.originalData.boOnly);
            const newBoOnly = this.normalizeNumericValue(item.boOnly);
            const boOnlyDifference = originalBoOnly - newBoOnly;

            // Calculer la différence pour les écarts Partenaire
            const originalPartnerOnly = this.normalizeNumericValue(this.originalData.partnerOnly);
            const newPartnerOnly = this.normalizeNumericValue(item.partnerOnly);
            const partnerOnlyDifference = originalPartnerOnly - newPartnerOnly;

            if (isSpecialLine) {
                // Pour la ligne spéciale : totalTransactions ne change pas
                // Recalculer matches = totalTransactions - boOnly - partnerOnly
                const currentTotalTransactions = this.normalizeNumericValue(item.totalTransactions);
                item.matches = Math.max(0, currentTotalTransactions - newBoOnly - newPartnerOnly);
                item.boOnly = newBoOnly;
                item.partnerOnly = newPartnerOnly;
                
                // Recalculer le taux et le commentaire
                if (currentTotalTransactions > 0) {
                    item.matchRate = (item.matches / currentTotalTransactions) * 100;
                } else {
                    item.matchRate = 0;
                }
                item.comment = this.buildCommentForCounts(item.matches, newBoOnly, newPartnerOnly, 0, currentTotalTransactions);
                
                console.log(`🔒 saveEdit: Ligne spéciale ${item.agency}/${item.service} - matches=${item.matches}, boOnly=${newBoOnly}, partnerOnly=${newPartnerOnly}, totalTransactions=${currentTotalTransactions}`);
            } else {
                // Pour les lignes normales :
                // - Seuls les écarts BO sont reversés sur les correspondances.
                // - Les écarts Partenaire ne doivent pas augmenter `matches`.
                if (boOnlyDifference !== 0) {
                    const currentMatches = this.normalizeNumericValue(item.matches);
                    item.matches = Math.max(0, currentMatches + boOnlyDifference);
                    
                    // Mettre à jour les écarts avec les nouvelles valeurs (déduites)
                    item.boOnly = newBoOnly;
                    item.partnerOnly = newPartnerOnly;
                    
                    // Log pour déboguer
                    if (newPartnerOnly > 0) {
                        console.log(`💾 saveEdit: Ligne normale ${item.agency}/${item.service} - partnerOnly=${newPartnerOnly}, matches=${item.matches}, boOnly=${newBoOnly}`);
                    }
                }
                
                // Recalculer le taux de correspondance et mettre à jour le commentaire
                this.recalculateMatchRate(item);
            }
        } else {
            // Pas de données originales : recalculer normalement
            if (isSpecialLine) {
                this.enforcePartnerOnlyLineValues(item);
            } else {
                this.recalculateMatchRate(item);
            }
        }

        // Si c'est une nouvelle ligne (pas d'ID), sauvegarder
        if (!item.id) {
            await this.confirmAndSave(item);
        } else {
            // Si c'est une ligne existante, mettre à jour
            await this.updateRow(item);
        }

        // Sortir du mode édition
        this.editingRow = null;
        this.originalData = null;
    }

    /**
     * Met à jour une ligne existante en envoyant TOUS les champs éditables de l'item.
     * Seule contrainte métier conservée : si le statut est 'OK', le commentaire en base est conservé.
     */
    private async updateRowFull(
        item: ReconciliationReportData,
        base: ReconciliationReportData
    ): Promise<void> {
        if (!item.id) return;

        const status = (item.status ?? '').toString();
        const comment = status === 'OK' ? (base.comment ?? '') : (item.comment ?? '').toString();

        const confirmed = await this.popupService.showConfirm(
            this.translateKey('RPT.row.updateConfirmFull', { id: item.id }) +
                (status === 'OK' ? '\n\n(' + this.translateKey('RPT.row.statusOkCommentKept') + ')' : ''),
            this.translateKey('RPT.row.updateConfirmTitle')
        );
        if (!confirmed) return;

        const payload = this.buildFullUpdatePayloadFromItem(item);
        payload.comment = comment;

        try {
            await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
            this.popupService.showSuccess(this.translateKey('RPT.updateSuccess'));

            // Mettre à jour localement avec les valeurs éditée (sauf commentaire si OK)
            Object.assign(item, payload);

            // Recharger depuis la DB en préservant le commentaire (évite recalculs/écrasements)
            const preserveComments = new Map<number, string>();
            preserveComments.set(item.id, comment.toString());
            this.loadSavedReportFromDatabase(preserveComments);
        } catch (err: any) {
            this.debugWarn('❌ Erreur de mise à jour (tous champs)', err);
            this.popupService.showError(this.translateKey('RPT.row.updateError'), this.translateKey('RPT.row.updateErrorTitle'));
        }
    }

    /**
     * Appelé lors de la modification de boOnly ou partnerOnly en mode édition.
     * Met à jour le commentaire et les valeurs associées en temps réel.
     * Si le statut est OK, le commentaire reste inchangé.
     */
    onEcartChange(item: ReconciliationReportData, ecartType: 'boOnly' | 'partnerOnly'): void {
        // Activer le flag pour éviter les recalculs automatiques
        this.isManuallyEditingEcart = true;
        
        try {
            // Si le statut est OK, préserver le commentaire existant et ne pas le modifier
            if (item.status === 'OK') {
                console.log(`🔒 onEcartChange: Statut OK - commentaire préservé pour ${item.agency}/${item.service}`);
                // Mettre à jour uniquement les valeurs numériques, pas le commentaire
                const currentBoOnly = this.normalizeNumericValue(item.boOnly);
                const currentPartnerOnly = this.normalizeNumericValue(item.partnerOnly);
                const currentMismatches = this.normalizeNumericValue(item.mismatches);
                const currentTotalTransactions = this.normalizeNumericValue(item.totalTransactions);
                
                // Recalculer matches = totalTransactions - boOnly - partnerOnly - mismatches
                const currentMatches = Math.max(0, currentTotalTransactions - currentBoOnly - currentPartnerOnly - currentMismatches);
                item.matches = currentMatches;
                
                // Recalculer le taux
                if (currentTotalTransactions > 0) {
                    item.matchRate = (currentMatches / currentTotalTransactions) * 100;
                } else {
                    item.matchRate = 0;
                }
                
                // Le commentaire reste inchangé quand le statut est OK
                return;
            }

            // Vérifier si c'est la ligne spéciale
            const isSpecialLine = this.isPartnerOnlySpecialLine(item) || 
                (item.agency === item.service && item.agency && item.service &&
                 item.totalTransactions > 0 && item.mismatches === 0);

            const currentBoOnly = this.normalizeNumericValue(item.boOnly);
            const currentPartnerOnly = this.normalizeNumericValue(item.partnerOnly);
            const currentMismatches = this.normalizeNumericValue(item.mismatches);

            if (isSpecialLine) {
                // Pour la ligne spéciale : totalTransactions ne change pas
                // Recalculer matches = totalTransactions - boOnly - partnerOnly
                const currentTotalTransactions = this.normalizeNumericValue(item.totalTransactions);
                
                item.matches = Math.max(0, currentTotalTransactions - currentBoOnly - currentPartnerOnly);
                
                // Recalculer le taux
                if (currentTotalTransactions > 0) {
                    item.matchRate = (item.matches / currentTotalTransactions) * 100;
                } else {
                    item.matchRate = 0;
                }
                
                // Mettre à jour le commentaire
                const newComment = this.buildCommentForCounts(item.matches, currentBoOnly, currentPartnerOnly, 0, currentTotalTransactions);
                item.comment = newComment;
                
                // Forcer également la mise à jour dans reportData si l'item existe
                const reportDataItem = this.reportData.find(r => r.id === item.id || (r.agency === item.agency && r.service === item.service && r.date === item.date));
                if (reportDataItem) {
                    reportDataItem.comment = newComment;
                }
                
                console.log(`🔒 onEcartChange: Ligne spéciale ${item.agency}/${item.service} - ${ecartType} modifié, matches=${item.matches}, commentaire=${item.comment}`);
            } else {
                // Pour les lignes normales :
                // - Seuls les écarts BO sont reversés sur les correspondances.
                // - Les écarts Partenaire ne doivent pas augmenter `matches`.
                //
                // On calcule donc matches en se basant sur les valeurs d'origine (début d'édition)
                // et uniquement la variation de BO.
                const currentTotalTransactions = this.normalizeNumericValue(item.totalTransactions);

                const baseMatches = this.originalData ? this.normalizeNumericValue(this.originalData.matches) : this.normalizeNumericValue(item.matches);
                const baseBoOnly = this.originalData ? this.normalizeNumericValue(this.originalData.boOnly) : this.normalizeNumericValue(item.boOnly);
                const boOnlyDiff = baseBoOnly - currentBoOnly; // si BO baisse, diff > 0 => matches augmente

                const currentMatches = Math.max(0, baseMatches + boOnlyDiff);
                item.matches = currentMatches;
                
                // Recalculer le taux
                if (currentTotalTransactions > 0) {
                    item.matchRate = (currentMatches / currentTotalTransactions) * 100;
                } else {
                    item.matchRate = 0;
                }
                
                // Mettre à jour le commentaire (toujours en mode édition, même pour les lignes "sété")
                // Utiliser les valeurs normalisées pour garantir la cohérence
                const commentBefore = item.comment;
                const newComment = this.buildCommentForCounts(currentMatches, currentBoOnly, currentPartnerOnly, currentMismatches, currentTotalTransactions);
                
                // Forcer la mise à jour du commentaire directement
                item.comment = newComment;
                
                // Forcer également la mise à jour dans reportData si l'item existe
                const reportDataItem = this.reportData.find(r => r.id === item.id || (r.agency === item.agency && r.service === item.service && r.date === item.date));
                if (reportDataItem) {
                    reportDataItem.comment = newComment;
                }
                
                console.log(`🔒 onEcartChange: Ligne normale ${item.agency}/${item.service} - ${ecartType} modifié`, {
                    totalTransactions: currentTotalTransactions,
                    matches: currentMatches,
                    boOnly: currentBoOnly,
                    partnerOnly: currentPartnerOnly,
                    mismatches: currentMismatches,
                    commentBefore: commentBefore,
                    commentAfter: item.comment,
                    updatedInReportData: !!reportDataItem
                });
            }
        } finally {
            // Désactiver le flag après un délai pour permettre à Angular de terminer le cycle de détection
            // Utiliser un délai plus long pour éviter que d'autres méthodes ne recalculent le commentaire
            // Forcer la mise à jour du commentaire même si le flag est actif
            setTimeout(() => {
                // Vérifier que le commentaire a bien été mis à jour
                if (item.status !== 'OK') {
                    const finalBoOnly = this.normalizeNumericValue(item.boOnly);
                    const finalPartnerOnly = this.normalizeNumericValue(item.partnerOnly);
                    const finalMismatches = this.normalizeNumericValue(item.mismatches);
                    const finalMatches = this.normalizeNumericValue(item.matches);
                    const finalTotalTransactions = this.normalizeNumericValue(item.totalTransactions);
                    
                    // Recalculer le commentaire pour s'assurer qu'il est à jour
                    const expectedComment = this.buildCommentForCounts(finalMatches, finalBoOnly, finalPartnerOnly, finalMismatches, finalTotalTransactions);
                    if (item.comment !== expectedComment) {
                        console.log(`🔒 onEcartChange: Correction du commentaire pour ${item.agency}/${item.service}`, {
                            avant: item.comment,
                            après: expectedComment
                        });
                        item.comment = expectedComment;
                    }
                }
                
                this.isManuallyEditingEcart = false;
                console.log(`🔒 onEcartChange: Flag désactivé pour ${item.agency}/${item.service}`);
            }, 300);
        }
    }

    private normalizeNumericValue(value: number | string | null | undefined): number {
        if (value === null || value === undefined) {
            return 0;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '') {
                return 0;
            }
            const parsed = Number(trimmed);
            return isNaN(parsed) ? 0 : parsed;
        }

        const parsed = Number(value);
        return isNaN(parsed) ? 0 : parsed;
    }

    private validateEditData(item: ReconciliationReportData): boolean {
        if (!item.date || !item.agency || !item.service || !item.country) {
            this.popupService.showError(this.translateKey('RPT.validation.requiredFields'), this.translateKey('RPT.validation.invalidDataTitle'));
            return false;
        }

        const numericFields: Array<{ key: keyof ReconciliationReportData; label: string }> = [
            { key: 'totalTransactions', label: this.translateKey('RPT.validation.fieldTotalTransactions') },
            { key: 'totalVolume', label: this.translateKey('RPT.validation.fieldTotalVolume') },
            { key: 'matches', label: this.translateKey('RPT.validation.fieldMatches') },
            { key: 'boOnly', label: this.translateKey('RPT.validation.fieldBoOnly') },
            { key: 'partnerOnly', label: this.translateKey('RPT.validation.fieldPartnerOnly') },
            { key: 'mismatches', label: this.translateKey('RPT.validation.fieldMismatches') }
        ];

        for (const field of numericFields) {
            const rawValue = item[field.key];
            const numericValue = Number(rawValue);
            if (isNaN(numericValue) || numericValue < 0) {
                this.popupService.showError(
                    this.translateKey('RPT.validation.mustBePositive', { field: field.label }),
                    this.translateKey('RPT.validation.invalidDataTitle')
                );
                return false;
            }
            (item as any)[field.key] = numericValue;
        }

        return true;
    }

    private recalculateMatchRate(item: ReconciliationReportData, preserveComment: boolean = false) {
        // Ne pas recalculer si l'utilisateur est en train de modifier manuellement les écarts
        if (this.isManuallyEditingEcart) {
            console.log(`🔒 recalculateMatchRate: Modification manuelle en cours - skip pour ${item.agency}/${item.service}`);
            return;
        }
        
        // Ne pas recalculer la ligne spéciale des écarts partenaires
        if (this.isPartnerOnlySpecialLine(item)) {
            // Pour la ligne des écarts partenaires, FORCER toutes les valeurs correctes
            this.enforcePartnerOnlyLineValues(item);
            return; // Ne pas modifier cette ligne
        }
        
        // Sauvegarder le commentaire si on doit le préserver
        const savedComment = preserveComment ? (item.comment ?? '') : null;
        
        // Normaliser toutes les valeurs numériques
        const totalTransactions = this.normalizeNumericValue(item.totalTransactions);
        const matches = this.normalizeNumericValue(item.matches);
        const boOnly = this.normalizeNumericValue(item.boOnly);
        const partnerOnly = this.normalizeNumericValue(item.partnerOnly);
        const mismatches = this.normalizeNumericValue(item.mismatches);

        // IMPORTANT (règle métier demandée):
        // - On NE recalcule PAS automatiquement les correspondances à partir des écarts.
        // - Seules les actions explicites (ex: transfert des écarts BO) doivent impacter `matches`.
        // Ici on recalcule uniquement le taux à partir de `matches` et `totalTransactions`.
        item.matches = matches;
        item.boOnly = boOnly;
        item.partnerOnly = partnerOnly;
        item.mismatches = mismatches;

        if (totalTransactions > 0) {
            // Si aucun écart, on force 100% uniquement quand matches == totalTransactions
            if (boOnly === 0 && partnerOnly === 0 && mismatches === 0 && matches === totalTransactions) {
                item.matchRate = 100;
            } else {
                item.matchRate = (matches / totalTransactions) * 100;
            }
        } else {
            item.matchRate = 0;
        }
        
        // Si on doit préserver le commentaire, le restaurer maintenant
        if (preserveComment && savedComment !== null) {
            item.comment = savedComment;
        } else if (!this.isRowSete(item)) {
            // Seulement pour les lignes NON sauvegardées, mettre à jour le commentaire
            this.updateCommentFromCounts(item, matches, boOnly, partnerOnly, mismatches, { force: false });
        }
        // Pour les lignes sauvegardées (isRowSete), ne jamais modifier le commentaire
    }

    /**
     * Calcule le nombre de correspondances à afficher selon les règles métier,
     * sans dépendre des valeurs éventuellement incohérentes venant de la base.
     */
    getDisplayMatches(item: ReconciliationReportData): number {
        // Règle métier:
        // - Les correspondances (`matches`) sont une valeur métier "authoritative" (chargée/saisie),
        //   et ne doivent pas être recalculées automatiquement à partir des écarts.
        return this.normalizeNumericValue(item?.matches);
    }

    /**
     * Retourne la valeur de partnerOnly à afficher, en protégeant la ligne spéciale.
     * Pour la ligne spéciale (agency === service), retourne totalTransactions si partnerOnly a été modifié à 0.
     */
    getDisplayPartnerOnly(item: ReconciliationReportData): number {
        // Si le statut est "OK", tous les écarts doivent être à 0
        if (item.status === 'OK') {
            return 0;
        }
        
        // Vérifier d'abord avec la méthode standard
        if (this.isPartnerOnlySpecialLine(item)) {
            const result = item.partnerOnly || 0;
            this.debugLog(`🔒 getDisplayPartnerOnly: Ligne spéciale ${item.agency}/${item.service} - retourne partnerOnly=${result} (item.partnerOnly=${item.partnerOnly})`);
            return result;
        }

        // Protection supplémentaire : si agency === service ET totalTransactions > 0 ET mismatches === 0
        // alors c'est probablement une ligne spéciale même si partnerOnly a été modifié à 0
        if (item.agency === item.service &&
            item.agency && item.service &&
            item.totalTransactions > 0 &&
            item.mismatches === 0) {
            // C'est une ligne spéciale - calculer partnerOnly = totalTransactions - matches - boOnly
            const matches = this.normalizeNumericValue(item.matches);
            const boOnly = this.normalizeNumericValue(item.boOnly);
            const calculatedPartnerOnly = Math.max(0, item.totalTransactions - matches - boOnly);
            this.debugLog(`🔒 getDisplayPartnerOnly: Ligne spéciale détectée par critères alternatifs ${item.agency}/${item.service} - retourne partnerOnly=${calculatedPartnerOnly}`);
            return calculatedPartnerOnly;
        }

        // Pour les lignes normales, retourner la valeur réelle
        const result = this.normalizeNumericValue(item.partnerOnly);
        if (item.comment && item.comment.includes('écart(s) Partenaire') && result === 0) {
            this.debugWarn(`⚠️ getDisplayPartnerOnly: Ligne normale ${item.agency}/${item.service} - item.partnerOnly=${item.partnerOnly}, mais commentaire contient "écart(s) Partenaire" - possible incohérence`);
        }
        // Log spécifique pour la ligne problématique
        if (item.agency === 'XBTCM8057' && item.service === 'CASHINMTNCMPART') {
            this.debugLog(`🔍 getDisplayPartnerOnly: ${item.agency}/${item.service} (ID: ${item.id}) - item.partnerOnly=${item.partnerOnly}, result=${result}, comment: ${item.comment?.substring(0, 50)}...`);
        }
        return result;
    }

    /**
     * Retourne le taux de correspondance à afficher.
     * Pour la ligne spéciale, calcule le taux réel basé sur matches et totalTransactions.
     */
    getDisplayMatchRate(item: ReconciliationReportData): number {
        // Pour la ligne spéciale, calculer le taux réel
        const isSpecialLine = this.isPartnerOnlySpecialLine(item) ||
            (item.agency === item.service && item.agency && item.service &&
             item.totalTransactions > 0 && item.mismatches === 0);
        
        if (isSpecialLine) {
            const matches = this.normalizeNumericValue(item.matches);
            const totalTransactions = this.normalizeNumericValue(item.totalTransactions);
            if (totalTransactions > 0) {
                return (matches / totalTransactions) * 100;
            }
            return 0;
        }
        
        // Pour les lignes normales, retourner la valeur réelle
        return this.normalizeNumericValue(item.matchRate);
    }

    // Méthode pour transférer une partie des écarts vers les correspondances
    async transferEcartToMatches(item: ReconciliationReportData, ecartType: 'boOnly' | 'partnerOnly') {
        // Vérifier si la ligne est verrouillée
        if (this.isRowLocked(item)) {
            this.popupService.showWarning(this.translateKey('RPT.row.lockedStatusOk'), this.translateKey('RPT.row.lockedTitle'));
            return;
        }

        const currentEcart = this.normalizeNumericValue(item[ecartType]);
        
        if (currentEcart <= 0) {
            this.popupService.showWarning(
            this.translateKey('RPT.transfer.noGapTitle'),
            this.translateKey('RPT.transfer.noGap', { type: ecartType === 'boOnly' ? ('BO') : ('Partenaire') })
        );
            return;
        }

        const ecartLabel = ecartType === 'boOnly' ? 'BO' : 'Partenaire';
        const message = this.translateKey('RPT.transfer.prompt', { label: ecartLabel, max: currentEcart });
        
        const userInput = await this.popupService.showTextInput(
            message,
            this.translateKey('RPT.transfer.title', { label: ecartLabel }),
            '',
            this.translateKey('RPT.transfer.rangeHint', { max: currentEcart })
        );
        
        if (userInput === null || userInput.trim() === '') {
            // L'utilisateur a annulé ou n'a rien saisi
            return;
        }

        const transferAmount = Number(userInput.trim());
        
        // Validation
        if (isNaN(transferAmount) || transferAmount <= 0) {
            this.popupService.showError(this.translateKey('RPT.transfer.invalidValueTitle'), this.translateKey('RPT.transfer.invalidValue'));
            return;
        }

        if (transferAmount > currentEcart) {
            this.popupService.showError(
                this.translateKey('RPT.transfer.tooHighTitle'),
                this.translateKey('RPT.transfer.tooHigh', { amount: transferAmount, max: currentEcart })
            );
            return;
        }

        // Effectuer le transfert
        const newEcart = currentEcart - transferAmount;
        item[ecartType] = newEcart;

        // Règle métier demandée:
        // - Seuls les écarts BO sont reversés sur les correspondances.
        // - Les écarts Partenaire ne doivent pas augmenter `matches`.
        if (ecartType === 'boOnly') {
            const newMatches = this.normalizeNumericValue(item.matches) + transferAmount;
            item.matches = newMatches;
        }

        // Recalculer le taux/correspondances selon les règles métier
        this.recalculateMatchRate(item);

        // Mettre à jour le commentaire avec les deux écarts (BO + Partenaire) après transfert,
        // y compris pour les lignes sauvegardées, afin d'avoir un affichage cohérent.
        this.updateCommentFromCounts(
            item,
            this.normalizeNumericValue(item.matches),
            this.normalizeNumericValue(item.boOnly),
            this.normalizeNumericValue(item.partnerOnly),
            this.normalizeNumericValue(item.mismatches),
            { force: true }
        );

        // Sauvegarder si la ligne existe déjà en base
        if (item.id) {
            // Recalculer les valeurs selon le statut (commentaire inclus)
            const recalculatedData = this.recalculateDataBasedOnStatus(item);
            
            // Définir le traitement par défaut si non spécifié
            const traitement = recalculatedData.traitement && recalculatedData.traitement.trim() !== ''
                ? recalculatedData.traitement
                : this.determineDefaultTraitement(recalculatedData);

            const payload = {
                date: recalculatedData.date,
                agency: recalculatedData.agency,
                service: recalculatedData.service,
                country: recalculatedData.country,
                env: this.normalizeReleveEnvKey(recalculatedData.env),
                totalTransactions: recalculatedData.totalTransactions,
                totalVolume: recalculatedData.totalVolume,
                matches: recalculatedData.matches,
                boOnly: recalculatedData.boOnly,
                partnerOnly: recalculatedData.partnerOnly,
                mismatches: recalculatedData.mismatches,
                matchRate: recalculatedData.matchRate,
                status: recalculatedData.status,
                comment: recalculatedData.comment,
                traitement: traitement,
                glpiId: recalculatedData.glpiId || ''
            };

            try {
                await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
                this.popupService.showSuccess(
                    this.translateKey('RPT.transfer.doneTitle'),
                    this.translateKey('RPT.transfer.done', { amount: transferAmount, label: ecartLabel })
                );
                this.loadSavedReportFromDatabase();
            } catch (err) {
                console.error('Erreur lors de la sauvegarde:', err);
                this.popupService.showError(
                    this.translateKey('RPT.transfer.saveErrorTitle'),
                    this.translateKey('RPT.transfer.saveFailed')
                );
            }
        } else {
            this.popupService.showSuccess(
                this.translateKey('RPT.transfer.doneTitle'),
                this.translateKey('RPT.transfer.doneRemember', { amount: transferAmount, label: ecartLabel })
            );
        }
    }

    // Méthode pour créer une nouvelle ligne
    addNewRow() {
        const newRow: ReconciliationReportData = {
            date: new Date().toISOString().split('T')[0],
            agency: '',
            service: '',
            country: '',
            glpiId: '',
            totalTransactions: 0,
            totalVolume: 0,
            matches: 0,
            boOnly: 0,
            partnerOnly: 0,
            mismatches: 0,
            matchRate: 0,
            status: this.DEFAULT_STATUS,
            comment: "PAS D'ECARTS CONSTATES",
            traitement: undefined
        };

        // Ajouter au début du tableau
        this.reportData.unshift(newRow);
        this.lastSavedGlpiIds.set(newRow, '');
        
        // Mettre à jour les données filtrées et la pagination
        this.extractUniqueValues();
        this.filterReport();
        
        // Commencer l'édition de la nouvelle ligne
        this.startEdit(newRow);
    }

    // Méthode pour convertir le statut en classe CSS
    getStatusClass(status?: string | null): string {
        const normalizedStatus = this.normalizeStatus(status);
        const cleanStatus = normalizedStatus.toLowerCase().replace(/\s+/g, '-');
        return `status-badge status-${cleanStatus}`;
    }

    /** Catégorie métier du traitement (alignée avec le rapport BO vs Partenaire). */
    resolveTraitementKind(traitement?: string | null): 'support' | 'cdo' | 'group' | 'termine' | 'none' {
        const normalized = this.normalizeTraitementValue(traitement);
        return sharedResolveTraitementKind(normalized);
    }

    /** Libellé affiché dans la colonne Traitement. */
    getTraitementDisplayLabel(traitement?: string | null): string {
        return sharedTraitementDisplayLabel(this.normalizeTraitementValue(traitement));
    }

    getTraitementRowClass(item: ReconciliationReportData): string {
        const kind = this.resolveTraitementKind(item?.traitement);
        return kind !== 'none' ? `row-traitement-${kind}` : '';
    }

    getTraitementClass(traitement?: string): string {
        const kind = this.resolveTraitementKind(traitement);
        return `traitement-badge traitement-kind--${kind}`;
    }

    /** Indique si le traitement de la ligne est « Terminé ». */
    isTraitementTermine(item: ReconciliationReportData): boolean {
        return this.resolveTraitementKind(item?.traitement) === 'termine';
    }

    // Vérifier si une ligne est verrouillée (statut OK + traitement Terminé)
    isRowLocked(item: ReconciliationReportData): boolean {
        return item.status === 'OK' && item.traitement === 'Terminé';
    }

    /**
     * Vérifie si une ligne est "sété" (traitée) et ne doit plus être modifiée
     * Une ligne est considérée comme "sété" si :
     * - Elle a un ID (elle existe en base de données), OU
     * - Le statut est "OK", OU
     * - Le traitement est "Terminé"
     *
     * Une fois qu'une ligne est sauvegardée en base (item.id existe),
     * son commentaire ne doit plus être modifié automatiquement,
     * même si le statut change.
     */
    private isRowSete(item: ReconciliationReportData): boolean {
        if (!item) {
            return false;
        }
        // Une ligne est considérée comme "sété" (sauvegardée) si :
        // - Elle a un ID (elle existe en base de données) OU
        // - Son statut est 'OK' OU
        // - Son traitement est 'Terminé'
        return !!item.id || item.status === 'OK' || item.traitement === 'Terminé';
    }

    // Méthodes pour l'édition directe du traitement (comme dans banque)
    startEditTraitement(item: ReconciliationReportData) {
        this.editingTraitementRow = item;
    }

    stopEditTraitement() {
        this.editingTraitementRow = null;
    }

    async onTraitementChange(item: ReconciliationReportData) {
        item.traitement = this.normalizeTraitementValue(item.traitement);

        if (item.status === 'OK' && !this.isReleveScopeCdoValidated(item)) {
            const allowed = this.getTraitementOptionsForItem(item);
            if (!item.traitement || !allowed.includes(item.traitement)) {
                item.traitement = this.defaultOkTraitement;
                this.popupService.showWarning(
                    this.translateKey('RPT.traitement.unauthorizedTitle'),
                    this.translateKey('RPT.traitement.unauthorizedReleve')
                );
            }
        } else if (item.status === 'OK' && this.isReleveScopeCdoValidated(item) && !this.isReleveScopeValidated(item)) {
            const allowed = this.getTraitementOptionsForItem(item);
            if (!item.traitement || !allowed.includes(item.traitement)) {
                item.traitement = this.traitementNiveauGroup;
                this.popupService.showWarning(
                    this.translateKey('RPT.traitement.unauthorizedTitle'),
                    this.translateKey('RPT.traitement.unauthorizedAfterCdo')
                );
            }
        }

        if (!item.id) {
            // Si la ligne n'a pas d'ID, elle n'est pas encore sauvegardée
            // On peut juste mettre à jour localement
            this.stopEditTraitement();
            return;
        }

        // Sauvegarder le traitement via l'API
        const payload = {
            date: item.date,
            agency: item.agency,
            service: item.service,
            country: item.country,
            env: this.normalizeReleveEnvKey(item.env),
            totalTransactions: item.totalTransactions,
            totalVolume: item.totalVolume,
            matches: item.matches,
            boOnly: item.boOnly,
            partnerOnly: item.partnerOnly,
            mismatches: item.mismatches,
            matchRate: item.matchRate,
            status: item.status,
            comment: item.comment,
            traitement: item.traitement || undefined,
            glpiId: item.glpiId || ''
        };

        try {
            const updated = await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
            if (updated.traitement !== undefined) {
                item.traitement = updated.traitement;
            }
            this.stopEditTraitement();
            this.notifyResult8RecUpdated();
            console.log('✅ Traitement mis à jour avec succès');
        } catch (err) {
            console.error('❌ Erreur lors de la mise à jour du traitement', err);
            this.popupService.showError('Erreur', this.translateKey('RPT.traitement.updateError'));
        }
    }

    // Méthodes pour la sélection multiple et changement de statut en masse
    isRowSelected(item: ReconciliationReportData): boolean {
        return this.selectedRows.has(item);
    }

    toggleRowSelection(item: ReconciliationReportData, event: Event): void {
        const checkbox = event.target as HTMLInputElement;
        this.hasUserSelectionChanged = true;
        if (checkbox.checked) {
            // Permettre la sélection même si des colonnes sont vides ou si la ligne est verrouillée
            this.selectedRows.add(item);
        } else {
            this.selectedRows.delete(item);
        }
    }

    isAllSelected(): boolean {
        const data = this.filteredReportData;
        if (!data || data.length === 0) return false;
        // Toutes les lignes du jeu filtré (toutes pages), pas seulement la page courante
        return data.every(item => this.isRowSelected(item));
    }

    isSomeSelected(): boolean {
        const data = this.filteredReportData;
        if (!data || data.length === 0) return false;
        const selectedInFiltered = data.filter(item => this.isRowSelected(item)).length;
        return selectedInFiltered > 0 && selectedInFiltered < data.length;
    }

    toggleSelectAll(event: Event): void {
        const checkbox = event.target as HTMLInputElement;
        this.hasUserSelectionChanged = true;
        const data = this.filteredReportData || [];
        if (checkbox.checked) {
            data.forEach(item => this.selectedRows.add(item));
        } else {
            data.forEach(item => this.selectedRows.delete(item));
        }
    }

    hasSelectedRows(): boolean {
        return this.selectedRows.size > 0;
    }

    getSelectedRowsCount(): number {
        return this.selectedRows.size;
    }

    /** Lignes sélectionnées supprimables en base (id présent, non verrouillées). */
    getBulkDeletableCount(): number {
        return Array.from(this.selectedRows).filter(row => !!row.id && !this.isRowLocked(row)).length;
    }

    clearSelection(): void {
        this.selectedRows.clear();
        this.bulkStatusSelection = '';
        this.bulkTraitementSelection = '';
    }

    async applyBulkStatusChange(): Promise<void> {
        if (!this.bulkStatusSelection || this.selectedRows.size === 0) {
            return;
        }

        const selectedItems = Array.from(this.selectedRows);
        const unlockedItems = selectedItems.filter(item => !this.isRowLocked(item));

        if (unlockedItems.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.bulk.noEditableTitle'), this.translateKey('RPT.bulk.allLocked'));
            this.clearSelection();
            return;
        }

        // Confirmer le changement avec popup moderne
        const confirmMessage = `Voulez-vous changer le statut de ${unlockedItems.length} ligne(s) en "${this.bulkStatusSelection}" ?`;
        const confirmed = await this.popupService.showConfirm(confirmMessage, 'Confirmation de changement de statut');
        if (!confirmed) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        // Séquentiel + léger espacement : la file result8rec sérialise déjà les PUT, mais le compteur rate-limit
        // reste par requête — évite de cramer le quota / minute avec des centaines de lignes.
        for (const item of unlockedItems) {
            const oldStatus = item.status;
            const previousComment = item.comment ?? '';
            item.status = this.bulkStatusSelection;

            const recalculatedData = this.recalculateDataBasedOnStatus(item);
            Object.assign(item, recalculatedData);

            try {
                await this.saveItemStatus(item, oldStatus);
                successCount++;
            } catch (error) {
                errorCount++;
                item.status = oldStatus;
                item.comment = previousComment;
                console.error('❌ Erreur lors de la sauvegarde du statut:', error);
            }
            await this.sleep(100);
        }

        // Vider la sélection
        this.clearSelection();
        
        // Rafraîchir les données après la sauvegarde
        if (this.currentSource === 'db') {
            // Si on est en mode base de données, recharger depuis la DB
            this.loadSavedReportFromDatabase();
        } else {
            // Si on est en mode live, re-filtrer les données
            this.filterReport();
            this.updatePagination();
        }
        
        // Afficher les résultats
        if (successCount > 0) {
            this.notifyResult8RecUpdated();
            this.popupService.showSuccess(this.translateKey('RPT.bulk.statusChanged', { count: successCount }), this.translateKey('RPT.bulk.statusChangedTitle'));
        }
        if (errorCount > 0) {
            this.popupService.showError(this.translateKey('RPT.bulk.statusError', { count: errorCount }), this.translateKey('RPT.bulk.someChangesFailed'));
        }
    }

    async applyBulkTraitementChange(): Promise<void> {
        if (!this.bulkTraitementSelection || this.selectedRows.size === 0) {
            return;
        }

        const selectedItems = Array.from(this.selectedRows);
        const unlockedItems = selectedItems.filter(item => !this.isRowLocked(item));

        if (unlockedItems.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.bulk.noEditableTitle'), this.translateKey('RPT.bulk.allLocked'));
            this.clearSelection();
            return;
        }

        // Déterminer la valeur du traitement (undefined si __CLEAR__, sinon la valeur sélectionnée)
        const traitementValue = this.bulkTraitementSelection === '__CLEAR__' ? undefined : this.bulkTraitementSelection;
        const traitementDisplay = traitementValue || '-';

        const blockedOkLines = unlockedItems.filter(item =>
            item.status === 'OK' &&
            !this.isReleveScopeCdoValidated(item) &&
            traitementValue !== this.defaultOkTraitement &&
            traitementValue !== 'Niveau Support'
        );
        if (blockedOkLines.length > 0) {
            this.popupService.showWarning(
                this.translateKey('RPT.traitement.unauthorizedTitle'),
                this.translateKey('RPT.traitement.unauthorizedBeforeCdo'),
            );
            return;
        }

        const blockedGroupLines = unlockedItems.filter(item =>
            item.status === 'OK' &&
            this.isReleveScopeCdoValidated(item) &&
            !this.isReleveScopeValidated(item) &&
            traitementValue !== this.traitementNiveauGroup &&
            traitementValue !== 'Terminé'
        );
        if (blockedGroupLines.length > 0) {
            this.popupService.showWarning(
                this.translateKey('RPT.traitement.unauthorizedTitle'),
                this.translateKey('RPT.traitement.unauthorizedAfterCdo'),
            );
            return;
        }

        // Confirmer le changement avec popup moderne
        const confirmMessage = `Voulez-vous changer le traitement de ${unlockedItems.length} ligne(s) en "${traitementDisplay}" ?`;
        const confirmed = await this.popupService.showConfirm(confirmMessage, 'Confirmation de changement de traitement');
        if (!confirmed) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const item of unlockedItems) {
            const oldTraitement = item.traitement;
            item.traitement = traitementValue;

            try {
                await this.saveItemTraitement(item);
                successCount++;
            } catch (error) {
                errorCount++;
                item.traitement = oldTraitement;
                console.error('❌ Erreur lors de la sauvegarde du traitement:', error);
            }
            await this.sleep(100);
        }

        // Vider la sélection
        this.clearSelection();
        
        // Rafraîchir les données après la sauvegarde
        if (this.currentSource === 'db') {
            // Si on est en mode base de données, recharger depuis la DB
            this.loadSavedReportFromDatabase();
        } else {
            // Si on est en mode live, re-filtrer les données
            this.filterReport();
            this.updatePagination();
        }
        
        // Afficher les résultats
        if (successCount > 0) {
            this.notifyResult8RecUpdated();
            this.popupService.showSuccess(this.translateKey('RPT.bulk.traitementChanged', { count: successCount }), this.translateKey('RPT.bulk.traitementChangedTitle'));
        }
        if (errorCount > 0) {
            this.popupService.showError(this.translateKey('RPT.bulk.statusError', { count: errorCount }), this.translateKey('RPT.bulk.someChangesFailed'));
        }
    }

    /**
     * Suppression multiple : DELETE /api/result8rec/{id} pour chaque ligne sélectionnée
     * ayant un id et non verrouillée (même règles que le bouton supprimer de la ligne).
     */
    async applyBulkDelete(): Promise<void> {
        if (this.selectedRows.size === 0) {
            return;
        }

        const selectedItems = Array.from(this.selectedRows);
        const deletable = selectedItems.filter(item => !!item.id && !this.isRowLocked(item));
        const skippedNoId = selectedItems.filter(item => !item.id).length;
        const skippedLocked = selectedItems.filter(item => !!item.id && this.isRowLocked(item)).length;

        if (deletable.length === 0) {
            this.popupService.showWarning(
                this.translateKey('RPT.bulk.deleteSelectionHint'),
                'Aucune ligne supprimable'
            );
            return;
        }

        let confirmMessage = this.translateKey('RPT.bulk.deleteConfirm', { count: deletable.length });
        if (skippedNoId > 0 || skippedLocked > 0) {
            confirmMessage += this.translateKey('RPT.bulk.deleteConfirmSkipped', { noId: skippedNoId, locked: skippedLocked });
        }

        const confirmed = await this.popupService.showConfirm(confirmMessage, 'Confirmation de suppression multiple');
        if (!confirmed) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        const removedFromLive: ReconciliationReportData[] = [];

        for (const item of deletable) {
            const id = item.id;
            try {
                await firstValueFrom(this.http.delete<void>('/api/result8rec/' + id, {
                    headers: this.buildResultsHeaders()
                }));
                item.id = undefined;
                successCount++;
                removedFromLive.push(item);
            } catch (err) {
                errorCount++;
                console.error('❌ Erreur suppression multiple', id, err);
            }
        }

        this.clearSelection();

        if (this.currentSource === 'db') {
            this.loadSavedReportFromDatabase();
        } else {
            this.reportData = this.reportData.filter(row => !removedFromLive.includes(row));
            this.extractUniqueValues();
            this.filterReport();
            this.updatePagination();
        }

        if (successCount > 0) {
            this.popupService.showSuccess(this.translateKey('RPT.bulk.deleted', { count: successCount }), this.translateKey('RPT.bulk.deletedTitle'));
        }
        if (errorCount > 0) {
            this.popupService.showError(
                `${errorCount} suppression(s) en erreur`,
                this.translateKey('RPT.bulk.deletePartialTitle')
            );
        }
    }

    private async saveItemTraitement(item: ReconciliationReportData): Promise<void> {
        if (!item.id) {
            throw new Error('ID manquant');
        }

        // S'assurer que le traitement est toujours une chaîne non vide
        const traitementToSave = item.traitement && item.traitement.trim() ? item.traitement.trim() : '';
        
        this.debugLog(`💾 Sauvegarde traitement pour ${item.agency} - ${item.service}: traitement="${traitementToSave}"`);
        this.debugLog(`🔍 État de item.traitement avant envoi: "${item.traitement}" (type: ${typeof item.traitement})`);

        const payload: any = {
            date: item.date,
            agency: item.agency,
            service: item.service,
            country: item.country,
            env: this.normalizeReleveEnvKey(item.env),
            totalTransactions: item.totalTransactions,
            totalVolume: item.totalVolume,
            matches: item.matches,
            boOnly: item.boOnly,
            partnerOnly: item.partnerOnly,
            mismatches: item.mismatches,
            matchRate: item.matchRate,
            status: item.status,
            comment: item.comment,
            glpiId: item.glpiId || ''
        };

        // Toujours inclure le traitement dans le payload, même s'il est vide
        // Le backend gérera la valeur par défaut si nécessaire
        payload.traitement = traitementToSave;

        this.debugLog(`📦 Payload complet envoyé:`, JSON.stringify(payload, null, 2));
        this.debugLog(`🔍 Vérification traitement dans payload: "${payload.traitement}" (type: ${typeof payload.traitement})`);
        
        const updated = await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
        this.debugLog(`✅ Traitement sauvegardé pour ${item.agency} - ${item.service}, réponse complète:`, JSON.stringify(updated, null, 2));
        this.debugLog(`📥 Traitement dans la réponse: "${updated?.traitement}" (type: ${typeof updated?.traitement})`);
        
        // Mettre à jour l'item avec les données retournées
        if (updated?.traitement !== undefined && updated.traitement !== null && updated.traitement.trim() !== '') {
            item.traitement = updated.traitement.trim();
            this.debugLog(`✅ Traitement mis à jour depuis la réponse: "${item.traitement}"`);
        } else if (traitementToSave && traitementToSave.trim() !== '') {
            // Si le traitement n'est pas retourné mais qu'on l'a envoyé, le conserver
            // C'est important car le backend pourrait ne pas toujours retourner le traitement
            item.traitement = traitementToSave.trim();
            this.debugLog(`✅ Traitement conservé depuis valeur envoyée (non retourné par l'API): "${item.traitement}"`);
        } else {
            this.debugLog(`⚠️ Aucun traitement retourné et aucun traitement envoyé pour ${item.agency} - ${item.service}`);
            // Si on a envoyé "Terminé" mais qu'il n'est pas retourné, le forcer quand même
            if (traitementToSave === 'Terminé') {
                item.traitement = 'Terminé';
                this.debugLog(`🔧 Traitement forcé à "Terminé" car c'était la valeur envoyée`);
            }
        }
    }

    private async saveItemStatus(item: ReconciliationReportData, oldStatus: string): Promise<void> {
        if (!item.id) {
            throw new Error('ID manquant');
        }

        const payload = {
            date: item.date,
            agency: item.agency,
            service: item.service,
            country: item.country,
            env: this.normalizeReleveEnvKey(item.env),
            totalTransactions: item.totalTransactions,
            totalVolume: item.totalVolume,
            matches: item.matches,
            boOnly: item.boOnly,
            partnerOnly: item.partnerOnly,
            mismatches: item.mismatches,
            matchRate: item.matchRate,
            status: item.status,
            comment: item.comment,
            traitement: item.traitement || '',
            glpiId: item.glpiId || ''
        };

        const updated = await this.putResult8RecWithRetry<any>(item.id, payload, { maxRetries: 3, baseDelayMs: 500 });
        this.debugLog(`✅ Statut sauvegardé pour ${item.agency} - ${item.service}`);
        // Mettre à jour l'item avec les données retournées
        if (updated?.status !== undefined) {
            item.status = updated.status;
        }
        if (updated?.traitement !== undefined) {
            item.traitement = updated.traitement;
        }
    }

    // Méthodes pour l'édition directe du statut (comme pour le traitement)
    startEditStatus(item: ReconciliationReportData) {
        if (this.isRowLocked(item)) {
            this.popupService.showWarning(this.translateKey('RPT.row.lockedStatusOk'), this.translateKey('RPT.row.lockedTitle'));
            return;
        }
        this.editingStatusRow = item;
    }

    stopEditStatus() {
        this.editingStatusRow = null;
    }

    onStatusChange(item: ReconciliationReportData) {
        // Sauvegarder toutes les valeurs avant modification du statut
        const previousComment = item.comment ?? '';
        const previousMatches = item.matches;
        const previousBoOnly = item.boOnly;
        const previousPartnerOnly = item.partnerOnly;
        const previousMismatches = item.mismatches;
        const previousMatchRate = item.matchRate;
        const previousTotalTransactions = item.totalTransactions;
        
        // Si le statut est "OK", appliquer la logique spéciale pour OK
        if (item.status === 'OK') {
            // Valider les données avant sauvegarde
            if (!this.validateEditData(item)) {
                this.stopEditStatus();
                return;
            }

            // Pour le statut OK, recalculer les données selon le statut
            const recalculatedData = this.recalculateDataBasedOnStatus(item);
            
            // PROTECTION ABSOLUE : Le commentaire ne doit JAMAIS être modifié quand le statut passe à OK
            // Forcer explicitement le commentaire original avant l'assignation
            recalculatedData.comment = previousComment;
            
            // Mettre à jour l'item avec les données recalculées (y compris le traitement)
            Object.assign(item, recalculatedData);
            
            // PROTECTION SUPPLÉMENTAIRE : S'assurer que le commentaire n'a pas été modifié après Object.assign
            if (item.comment !== previousComment) {
                console.warn(`⚠️ onStatusChange: Commentaire modifié détecté pour ${item.agency}/${item.service} - RESTAURATION du commentaire original`);
                item.comment = previousComment;
            }
            
            // Log pour vérifier que le traitement est bien mis à jour
            console.log(`🔄 onStatusChange: Statut OK - traitement mis à jour à "${item.traitement}" pour ${item.agency}/${item.service}, commentaire préservé: "${item.comment}"`);

            // Si c'est une nouvelle ligne (pas d'ID), sauvegarder
            if (!item.id) {
                this.confirmAndSave(item).then(() => {
                    this.stopEditStatus();
                });
            } else {
                // Si c'est une ligne existante, mettre à jour
                this.updateRow(item).then(() => {
                    this.stopEditStatus();
                });
            }
        } else {
            // Pour les autres statuts : NE PAS modifier les autres colonnes
            // Restaurer toutes les valeurs originales sauf le statut
            item.comment = previousComment;
            item.matches = previousMatches;
            item.boOnly = previousBoOnly;
            item.partnerOnly = previousPartnerOnly;
            item.mismatches = previousMismatches;
            item.matchRate = previousMatchRate;
            item.totalTransactions = previousTotalTransactions;
            
            // Pour les autres statuts, comportement normal
            if (!item.id) {
                // Si la ligne n'a pas d'ID, elle n'est pas encore sauvegardée
                // On peut juste mettre à jour localement
                this.stopEditStatus();
                return;
            }

            // Sauvegarder uniquement le statut via l'API (sans modifier les autres colonnes)
            const payload = {
                date: item.date,
                agency: item.agency,
                service: item.service,
                country: item.country,
                env: this.normalizeReleveEnvKey(item.env),
                totalTransactions: previousTotalTransactions,
                totalVolume: item.totalVolume,
                matches: previousMatches,
                boOnly: previousBoOnly,
                partnerOnly: previousPartnerOnly,
                mismatches: previousMismatches,
                matchRate: previousMatchRate,
                status: item.status,
                comment: previousComment,
                traitement: item.traitement || undefined,
                glpiId: item.glpiId || ''
            };

            void (async () => {
                try {
                    const updated = await this.putResult8RecWithRetry<any>(item.id!, payload, {
                        maxRetries: 3,
                        baseDelayMs: 500
                    });
                    if (updated.status !== undefined) {
                        item.status = updated.status;
                    }
                    this.stopEditStatus();
                    this.notifyResult8RecUpdated();
                    console.log('✅ Statut mis à jour avec succès (autres colonnes non modifiées)');
                } catch (err) {
                    console.error('❌ Erreur lors de la mise à jour du statut', err);
                    this.popupService.showError('Erreur', this.translateKey('RPT.status.updateError'));
                }
            })();
        }
    }

    // Méthode pour basculer entre les données en cours et les données en base
    /** Recharge les données sans réinitialiser les filtres (agence, pays, ENV, dates, etc.). */
    refreshReportData(): void {
        if (this.isLoadingDbReport || this.isLoadingMoreDbReport) {
            return;
        }
        if (this.currentSource === 'live') {
            this.loadLiveData();
            return;
        }
        this.dbLoadToken++;
        this.lastDbReportFetchKey = '';
        this.loadSavedReportFromDatabase();
    }

    toggleDataSource() {
        if (this.currentSource === 'live') {
            // Basculer vers les données en base
            this.currentSource = 'db';
            this.resetSelectionForAuto();
            this.loadSavedReportFromDatabase();
        } else {
            // Basculer vers les données en cours
            this.currentSource = 'live';
            this.resetSelectionForAuto();
            this.autoSelectAllOnNextPagination = true;
            this.loadLiveData();
        }
    }

    toggleActionsColumn() {
        this.showActionsColumn = !this.showActionsColumn;
    }

    /** True si aucun filtre ENV actif ou si l’ENV de la ligne est parmi les sélectionnés (casse ignorée). */
    private itemMatchesEnvFilter(
        itemEnv: string | undefined | null,
        envsForFilter: string[] | undefined | null
    ): boolean {
        const list = envsForFilter ?? this.selectedEnvs;
        if (!list || list.length === 0) {
            return true;
        }
        const itemKey = this.normalizeReleveEnvKey(itemEnv).toUpperCase();
        return list.some(sel => this.normalizeReleveEnvKey(sel).toUpperCase() === itemKey);
    }

    /** Clé ENV rapport : vide ou ancien TOTAL → T-E (liste BET, HT, T-E, HUBAO, TOP20, GU3). */
    private normalizeReleveEnvKey(env?: string | null): string {
        return normalizeReconciliationReportEnv(env);
    }

    /** Libellé affichage filtre / tableau (alias normalisation). */
    formatEnvFilterLabel(env?: string | null): string {
        return this.normalizeReleveEnvKey(env);
    }

    get releveEnvMessageLabel(): string {
        return this.normalizeReleveEnvKey(this.releveEnv);
    }

    private isPartenairePlatformEcart(ecart: EcartBoSummary): boolean {
        return (ecart.env || '').trim().toUpperCase() === 'PARTENAIRE';
    }

    /** Lit env_code renvoyé par l’API (camelCase) ou variante snake_case si jamais présente. */
    private getEcartEnvCodeRaw(ecart: EcartBoSummary): string {
        const anyE = ecart as EcartBoSummary & { env_code?: string | null };
        const v = ecart.envCode ?? anyE.env_code;
        return v != null ? String(v).trim() : '';
    }

    /** env_code ecart_bo_summary vs ENV relevé ; code absent → T-E (agrégat). */
    private ecartEnvCodeMatchesReleve(ecart: EcartBoSummary, releveEnvNorm: string): boolean {
        const code = this.getEcartEnvCodeRaw(ecart);
        const ecartKey = !code || code.toUpperCase() === 'TOTAL' ? 'T-E' : code;
        return ecartKey.toUpperCase() === releveEnvNorm.toUpperCase();
    }

    /**
     * Jour calendaire précédent pour une date YYYY-MM-DD (évite le décalage dû à new Date('YYYY-MM-DD') en UTC).
     */
    private subtractCalendarDaysFromYmd(ymd: string, days: number): string {
        const base = this.formatDateForSearch(ymd);
        const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) {
            return base;
        }
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        d.setDate(d.getDate() - days);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
    }

    /**
     * Charge les blocs écarts du relevé à partir du même périmètre que la page Résumé écarts BO (données sauvegardées).
     * J+1 : date = date du rapport ; plateforme Partenaire uniquement (comme /ecart-bo-summary filtré Partenaire).
     * J-1 : date = veille ; plateforme Partenaire uniquement.
     */
    private async loadReleveEcartBoSummariesForCurrentReleve(): Promise<void> {
        if (!this.releveData) {
            return;
        }
        const item = this.releveData;
        const searchDate = this.formatDateForSearch(item.date);
        const searchDateJ1 = this.subtractCalendarDaysFromYmd(searchDate, 1);
        const envKey = this.normalizeReleveEnvKey(this.releveEnv);

        // Même chargement que « Données sauvegardées » sur /ecart-bo-summary (liste complète puis filtre client),
        // pour ne pas exclure des lignes visibles sur cette page (ex. autre libellé de service, pas de filtre API service).
        const ecartData = await firstValueFrom(this.ecartBoSummaryService.getEcartBoSummaries());

        this.releveEcartData = ecartData.filter(ecart => {
            const ecartDate = this.formatDateForSearch(ecart.dateTransaction);
            return (
                ecartDate === searchDate &&
                this.releveStringsEqual(ecart.service, item.service) &&
                this.ecartPaysMatchesReleve(ecart, item.country) &&
                this.isPartenairePlatformEcart(ecart) &&
                this.ecartEnvCodeMatchesReleve(ecart, envKey)
            );
        });

        this.releveEcartDataJ1 = ecartData.filter(ecart => {
            const ecartDate = this.formatDateForSearch(ecart.dateTransaction);
            return (
                ecartDate === searchDateJ1 &&
                this.releveStringsEqual(ecart.service, item.service) &&
                this.ecartPaysMatchesReleve(ecart, item.country) &&
                this.isPartenairePlatformEcart(ecart) &&
                this.ecartEnvCodeMatchesReleve(ecart, envKey)
            );
        });
    }

    private normalizeReleveCountry(country?: string | null): string {
        return (country ?? '').trim();
    }

    /** Même périmètre relevé : service + date + pays + ENV (pas de mélange entre pays / ENV). */
    private isSameReleveScope(a: ReconciliationReportData, b: ReconciliationReportData): boolean {
        return (
            a.service === b.service &&
            a.date === b.date &&
            this.normalizeReleveCountry(a.country) === this.normalizeReleveCountry(b.country) &&
            this.normalizeReleveEnvKey(a.env) === this.normalizeReleveEnvKey(b.env)
        );
    }

    private releveStringsEqual(a?: string | null, b?: string | null): boolean {
        return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
    }

    /**
     * Pays côté ecart_bo_summary souvent vide à la sauvegarde : vide = non cloisonné, compatible relevé.
     * Si les deux sont renseignés, ils doivent coïncider.
     */
    private ecartPaysMatchesReleve(ecart: EcartBoSummary, reportCountry: string): boolean {
        const rep = this.normalizeReleveCountry(reportCountry);
        const ep = this.normalizeReleveCountry(ecart.pays);
        if (!rep) {
            return true;
        }
        if (!ep) {
            return true;
        }
        return this.releveStringsEqual(ep, rep);
    }

    /**
     * Affiche le modal de relevé pour un service avec statut OK
     * Cloisonne par service, date, pays et ENV du rapport (agrégation uniquement sur ce périmètre ; agence écart non filtrée).
     */
    async showReleveModal(item: ReconciliationReportData): Promise<void> {
        if (item.status !== 'OK') {
            this.popupService.showWarning(this.translateKey('RPT.releve.featureOkOnly'));
            return;
        }

        const scopeLines = this.filteredReportData.filter(line =>
            line.status === 'OK' && this.isSameReleveScope(line, item)
        );

        if (scopeLines.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.releve.noRow'));
            return;
        }

        const totalVolume = scopeLines.reduce((sum, line) => sum + (line.totalVolume || 0), 0);
        const totalTransactions = scopeLines.reduce((sum, line) => sum + (line.totalTransactions || 0), 0);

        this.releveData = {
            ...item,
            totalVolume,
            totalTransactions
        };

        this.releveEnv = this.normalizeReleveEnvKey(item.env);
        this.releveEnvLastValid = this.releveEnv;

        this.loadReleveManualData();

        this.isReleveModalVisible = true;
        this.isLoadingReleve = true;
        this.releveEcartData = [];
        this.releveEcartDataJ1 = [];

        try {
            await this.loadReleveEcartBoSummariesForCurrentReleve();
        } catch (error: any) {
            console.error('Erreur lors de la récupération des données Écart BO:', error);
            this.popupService.showError(this.translateKey('RPT.releve.loadError', { message: error.message || this.translateKey('RPT.releve.unknownError') }));
            this.releveEcartData = [];
            this.releveEcartDataJ1 = [];
        } finally {
            this.isLoadingReleve = false;
            // Vérifier si toutes les lignes ont déjà le traitement à "Terminé"
            this.isReleveValidated = this.isReleveCdoClosed();
        }
    }

    /**
     * Changement d'environnement dans le modal relevé : aligne agrégats et trx manuelles sur les lignes OK du même périmètre.
     */
    onReleveEnvChange(newEnv: string): void {
        if (!this.releveData) {
            this.releveEnv = this.normalizeReleveEnvKey(newEnv);
            return;
        }
        if (this.isLoadingReleve) {
            this.releveEnv = this.normalizeReleveEnvKey(newEnv);
            return;
        }

        const envNorm = this.normalizeReleveEnvKey(newEnv);
        if (envNorm === this.releveEnvLastValid) {
            this.releveEnv = envNorm;
            return;
        }

        const base = this.releveData;
        const candidateLine = this.filteredReportData.find(
            line =>
                line.status === 'OK' &&
                line.service === base.service &&
                line.date === base.date &&
                this.normalizeReleveCountry(line.country) === this.normalizeReleveCountry(base.country) &&
                this.normalizeReleveEnvKey(line.env) === envNorm
        );

        if (!candidateLine) {
            this.popupService.showWarning(
                `Aucune ligne OK pour ce service, cette date, ce pays et l'environnement « ${this.formatEnvFilterLabel(envNorm)} ».`
            );
            this.releveEnv = this.releveEnvLastValid;
            return;
        }

        const scopeLines = this.filteredReportData.filter(
            line => line.status === 'OK' && this.isSameReleveScope(line, candidateLine)
        );

        const totalVolume = scopeLines.reduce((sum, line) => sum + (line.totalVolume || 0), 0);
        const totalTransactions = scopeLines.reduce((sum, line) => sum + (line.totalTransactions || 0), 0);

        this.releveEnv = envNorm;
        this.releveEnvLastValid = envNorm;
        this.releveData = {
            ...candidateLine,
            totalVolume,
            totalTransactions
        };

        this.loadReleveManualData();
        this.isReleveValidated = this.isReleveCdoClosed();

        this.isLoadingReleve = true;
        this.loadReleveEcartBoSummariesForCurrentReleve()
            .catch((err: any) => {
                console.error('Erreur lors de la récupération des données Écart BO:', err);
                this.popupService.showError(
                    this.translateKey('RPT.releve.loadError', { message: err?.message || this.translateKey('RPT.releve.unknownError') })
                );
                this.releveEcartData = [];
                this.releveEcartDataJ1 = [];
            })
            .finally(() => {
                this.isLoadingReleve = false;
            });
    }

    /**
     * Formate une date pour la recherche (format YYYY-MM-DD)
     * Gère différents formats de date (ISO, YYYY-MM-DD, etc.)
     */
    private formatDateForSearch(dateStr: string): string {
        if (!dateStr) return '';
        const value = String(dateStr).trim();
        
        // Extraire la partie date si c'est un format ISO (YYYY-MM-DDTHH:mm:ss)
        if (value.includes('T')) {
            return value.split('T')[0];
        }
        
        // Si la date est déjà au format YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.split(' ')[0]; // Enlever l'heure si présente
        }

        // dd/MM/yyyy[ HH:mm[:ss]]
        const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (dmy) {
            return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
        }

        // dd-MM-yyyy
        const dmyDash = value.match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (dmyDash) {
            return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`;
        }
        
        // Essayer de parser la date
        try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        } catch (e) {
            console.error('Erreur lors du formatage de la date:', dateStr, e);
        }
        
        return value;
    }

    /**
     * Relevé clôturé par le Responsable CDO (traitement Niveau GROUP sur le périmètre).
     */
    isReleveCdoClosed(): boolean {
        if (!this.releveData) {
            return false;
        }
        return this.isReleveScopeCdoValidated(this.releveData);
    }

    /**
     * Relevé entièrement terminé (Niveau GROUP a clôturé → Terminé).
     */
    isReleveFullyClosed(): boolean {
        if (!this.releveData) {
            return false;
        }
        return this.isReleveScopeValidated(this.releveData);
    }

    /** @deprecated Utiliser isReleveCdoClosed() ou isReleveFullyClosed() */
    isReleveAlreadyValidated(): boolean {
        return this.isReleveCdoClosed();
    }

    getReleveActionButtonLabel(): string {
        if (this.isValidatingReleve) {
            return '⏳ Validation...';
        }
        if (this.isReleveFullyClosed()) {
            return this.translateKey('RPT.releve.badgeDone');
        }
        if (this.isReleveCdoClosed()) {
            return this.translateKey('RPT.releve.badgeClosed');
        }
        return '✅ Valider';
    }

    isReleveValidateButtonDisabled(): boolean {
        if (this.isValidatingReleve) {
            return true;
        }
        if (this.isReleveFullyClosed()) {
            return true;
        }
        // Après validation CDO : bouton « Clôturé » cliquable pour la clôture GROUP
        return false;
    }

    getReleveActionButtonTitle(): string {
        if (this.isReleveFullyClosed()) {
            return this.translateKey('RPT.statementDoneGroup');
        }
        if (this.isReleveCdoClosed()) {
            return this.translateKey('RPT.statementClosedCdo');
        }
        return this.translateKey('RPT.validateCdo');
    }

    /**
     * Ferme le modal de relevé
     */
    closeReleveModal(): void {
        this.isReleveModalVisible = false;
        this.releveData = null;
        this.releveEcartData = [];
        this.releveEcartDataJ1 = [];
        this.isLoadingReleve = false;
        this.isReleveValidated = false; // Réinitialiser l'état de validation
        this.releveEnv = 'T-E';
        this.releveEnvLastValid = 'T-E';
        // Réinitialiser les données manuelles
        this.releveManualNombre = 0;
        this.releveManualVolume = 0;
        this.releveRembourseNombre = 0;
        this.releveRembourseVolume = 0;
        this.releveAnnuleNombre = 0;
        this.releveAnnuleVolume = 0;
        this.hasPendingReleveManualChanges = false;
        this.isSavingReleveManualData = false;
    }

    // === MÉTHODES DE REJET DE RELEVÉ ===

    /**
     * Ouvre le modal de rejet de relevé
     */
    openRejectReleveModal(): void {
        if (!this.releveData) {
            return;
        }
        this.rejectReleveReason = '';
        this.rejectReleveOtherReason = '';
        this.rejectReleveCommentaire = '';
        this.rejectErrorMessage = '';
        this.rejectFormSubmitted = false;
        this.isRejectReleveModalVisible = true;

        const dialog = this.rejectDialogRef?.nativeElement;
        if (dialog && !dialog.open) {
            dialog.showModal();
        }

        // Focus sur le premier champ après l'ouverture
        setTimeout(() => {
            const reasonSelect = document.getElementById('rejectReason') as HTMLSelectElement;
            if (reasonSelect) reasonSelect.focus();
        }, 0);
    }

    /**
     * Ferme le modal de rejet de relevé
     */
    closeRejectReleveModal(): void {
        this.isRejectReleveModalVisible = false;
        this.rejectReleveReason = '';
        this.rejectReleveOtherReason = '';
        this.rejectReleveCommentaire = '';
        this.rejectErrorMessage = '';
        this.rejectFormSubmitted = false;
        this.isRejectingReleve = false;

        const dialog = this.rejectDialogRef?.nativeElement;
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    /**
     * Gère la fermeture native du dialog (Échap, clic backdrop)
     */
    onDialogClose(event: Event): void {
        // Le dialog se ferme, on nettoie
        this.closeRejectReleveModal();
    }

    /**
     * Empêche la fermeture par Échap si soumission en cours
     */
    onEscapeKeydown(event: KeyboardEvent): void {
        if (this.isRejectingReleve) {
            event.preventDefault();
        }
    }

    /**
     * Confirme le rejet du relevé
     */
    async confirmRejectReleve(): Promise<void> {
        this.rejectFormSubmitted = true;
        this.rejectErrorMessage = '';

        // Validation côté client
        if (!this.rejectReleveReason) {
            const reasonSelect = document.getElementById('rejectReason') as HTMLSelectElement;
            if (reasonSelect) reasonSelect.focus();
            return;
        }
        if (this.rejectReleveReason === 'other' && !this.rejectReleveOtherReason?.trim()) {
            const otherInput = document.getElementById('otherReason') as HTMLInputElement;
            if (otherInput) otherInput.focus();
            return;
        }
        if (!this.rejectReleveCommentaire?.trim() || this.rejectReleveCommentaire.trim().length < 10) {
            const commentArea = document.getElementById('rejectComment') as HTMLTextAreaElement;
            if (commentArea) commentArea.focus();
            return;
        }

        this.isRejectingReleve = true;

        try {
            // Construire le titre selon le motif choisi
            const titre = this.rejectReleveReason === 'other' 
                ? this.rejectReleveOtherReason.trim() 
                : this.getReasonLabel(this.rejectReleveReason);

            const request = {
                service: this.releveData!.service,
                date: this.releveData!.date,
                country: this.releveData!.country,
                env: this.releveData!.env,
                titre,
                commentaire: this.rejectReleveCommentaire.trim()
            };

            const response = await firstValueFrom(
                this.http.post<{ status: string; message: string }>(
                    '/api/reconciliation-report/reject',
                    request
                )
            );

            if (response.status === 'OK') {
                this.popupService.showSuccess(
                    this.translateKey('RPT.rejectSuccessTitle'),
                    this.translateKey('RPT.rejectSuccessMsg', { service: this.releveData!.service })
                );
                this.closeRejectReleveModal();
            } else {
                this.rejectErrorMessage = response.message || this.translateKey('RPT.rejectErrorMsg');
            }
        } catch (error: any) {
            console.error('Erreur lors du rejet du relevé:', error);
            this.rejectErrorMessage = error?.error?.message || error?.message || this.translateKey('RPT.rejectErrorMsg');
        } finally {
            this.isRejectingReleve = false;
        }
    }

    /**
     * Retourne le libellé traduit pour un motif de rejet
     */
    private getReasonLabel(reason: string): string {
        const reasonMap: Record<string, string> = {
            'incorrect_data': this.translateKey('RPT.reasonIncorrectData'),
            'incomplete_file': this.translateKey('RPT.reasonIncompleteFile'),
            'duplicate': this.translateKey('RPT.reasonDuplicate'),
            'wrong_period': this.translateKey('RPT.reasonWrongPeriod'),
            'non_compliant_amounts': this.translateKey('RPT.reasonNonCompliantAmounts')
        };
        return reasonMap[reason] || reason;
    }

    /**
     * Calcule le total du nombre de transactions depuis ecart-bo-summary
     */
    getTotalEcartNombre(): number {
        return this.releveEcartData.reduce((sum, ecart) => sum + (ecart.nombreTransactions || 0), 0);
    }

    /**
     * Calcule le total du volume depuis ecart-bo-summary
     */
    getTotalEcartVolume(): number {
        return this.releveEcartData.reduce((sum, ecart) => sum + (ecart.montantTotal || 0), 0);
    }

    /**
     * Calcule le Volume BO (Rapport + Écart traité - Trx annulé)
     */
    getTotalVolumeSum(): number {
        const rapportVolume = this.releveData?.totalVolume || 0;
        const manualVolume = this.releveManualVolume || 0;
        const annuleVolume = this.releveAnnuleVolume || 0;
        return rapportVolume + manualVolume - annuleVolume;
    }

    /**
     * Calcule le Volume partenaire (Rapport + Écart Partenaire J+1 + Écart traité - Trx annulé - Écart Partenaire J-1 + Trx remboursé)
     */
    getTotalVolumeSumWithManual(): number {
        const rapportVolume = this.releveData?.totalVolume || 0;
        const ecartVolumeJ1 = this.getTotalEcartVolume(); // Écart Partenaire J+1
        const manualVolume = this.releveManualVolume || 0;
        const annuleVolume = this.releveAnnuleVolume || 0;
        const ecartVolumeJ1Minus = this.getTotalEcartVolumeJ1(); // Écart BO J-1
        const rembourseVolume = this.releveRembourseVolume || 0;
        return rapportVolume + ecartVolumeJ1 + manualVolume - annuleVolume - ecartVolumeJ1Minus + rembourseVolume;
    }

    /**
     * Calcule le nombre total de transactions BO (Rapport + Écart traité - Trx annulé)
     */
    getTotalTransactionsSum(): number {
        const rapportTransactions = this.releveData?.totalTransactions || 0;
        const manualNombre = this.releveManualNombre || 0;
        const annuleNombre = this.releveAnnuleNombre || 0;
        return rapportTransactions + manualNombre - annuleNombre;
    }

    /**
     * Calcule le nombre total de transactions Partenaire (Rapport + Écart traité - Trx annulé + Écart Partenaire J+1 - Écart Partenaire J-1 + Trx remboursé)
     */
    getTotalTransactionsPartenaire(): number {
        const rapportTransactions = this.releveData?.totalTransactions || 0;
        const manualNombre = this.releveManualNombre || 0;
        const annuleNombre = this.releveAnnuleNombre || 0;
        const ecartJ1Nombre = this.getTotalEcartNombre(); // Écart Partenaire J+1
        const ecartJ1NombreMinus = this.getTotalEcartNombreJ1(); // Écart Partenaire J-1
        const rembourseNombre = this.releveRembourseNombre || 0;
        return rapportTransactions + manualNombre - annuleNombre + ecartJ1Nombre - ecartJ1NombreMinus + rembourseNombre;
    }

    /**
     * Calcule le nombre total (Écart traité uniquement)
     */
    getTotalNombreSum(): number {
        return this.releveManualNombre || 0;
    }

    /**
     * Charge depuis le backend les valeurs manuelles (Trx traité / Trx remboursé)
     * pour le couple service + date + pays du relevé en cours.
     */
    private loadReleveManualData(): void {
        if (!this.releveData) {
            return;
        }

        const date = this.formatDateForSearch(this.releveData.date);
        const envKey = this.normalizeReleveEnvKey(this.releveEnv ?? this.releveData.env);
        const params = new HttpParams()
            .set('date', date)
            .set('service', this.releveData.service)
            .set('country', this.releveData.country)
            .set('env', envKey);

        this.http.get<any>('/api/reconciliation-report/manual-trx', {
            params,
            headers: this.buildResultsHeaders()
        })
            .subscribe({
                next: (response) => {
                    if (!response) {
                        this.hasPendingReleveManualChanges = false;
                        return;
                    }
                    this.releveManualNombre = typeof response.manualNombre === 'number' ? response.manualNombre : 0;
                    this.releveManualVolume = typeof response.manualVolume === 'number' ? response.manualVolume : 0;
                    this.releveRembourseNombre = typeof response.rembourseNombre === 'number' ? response.rembourseNombre : 0;
                    this.releveRembourseVolume = typeof response.rembourseVolume === 'number' ? response.rembourseVolume : 0;
                    this.hasPendingReleveManualChanges = false;
                },
                error: (err) => {
                    console.error('Erreur lors du chargement des valeurs manuelles de relevé', err);
                }
            });
    }

    /**
     * Sauvegarde en base les valeurs manuelles (Trx traité / Trx remboursé)
     * pour le couple service + date + pays du relevé en cours.
     */
    async saveReleveManualData(showSuccessMessage: boolean = false): Promise<boolean> {
        if (!this.releveData) {
            return false;
        }

        if (!this.hasPendingReleveManualChanges) {
            if (showSuccessMessage) {
                this.popupService.showSuccess(this.translateKey('RPT.releve.manualTitle'), this.translateKey('RPT.releve.nothingToSave'));
            }
            return true;
        }

        const date = this.formatDateForSearch(this.releveData.date);
        const payload = {
            date,
            service: this.releveData.service,
            country: this.releveData.country,
            env: this.normalizeReleveEnvKey(this.releveEnv ?? this.releveData.env),
            manualNombre: this.releveManualNombre || 0,
            manualVolume: this.releveManualVolume || 0,
            rembourseNombre: this.releveRembourseNombre || 0,
            rembourseVolume: this.releveRembourseVolume || 0
        };

        this.isSavingReleveManualData = true;
        try {
            await firstValueFrom(this.http.post<any>('/api/reconciliation-report/manual-trx', payload, {
                headers: this.buildResultsHeaders()
            }));
            this.hasPendingReleveManualChanges = false;
            if (showSuccessMessage) {
                this.popupService.showSuccess(this.translateKey('RPT.releve.manualTitle'), this.translateKey('RPT.releve.manualSaved'));
            } else if (this.debugReconciliation) {
                console.log('✅ Valeurs manuelles de relevé sauvegardées', payload);
            }
            return true;
        } catch (err) {
            console.error('Erreur lors de la sauvegarde des valeurs manuelles de relevé', err);
            this.popupService.showError('Erreur', this.translateKey('RPT.releve.manualSaveError'));
            return false;
        } finally {
            this.isSavingReleveManualData = false;
        }
    }

    /**
     * Calcule le total du nombre de transactions depuis ecart-bo-summary J-1 (ENV BO)
     */
    getTotalEcartNombreJ1(): number {
        return this.releveEcartDataJ1.reduce((sum, ecart) => sum + (ecart.nombreTransactions || 0), 0);
    }

    /**
     * Calcule le total du volume depuis ecart-bo-summary J-1 (ENV BO)
     */
    getTotalEcartVolumeJ1(): number {
        return this.releveEcartDataJ1.reduce((sum, ecart) => sum + (ecart.montantTotal || 0), 0);
    }

    /**
     * Gère les changements dans les champs manuels
     */
    onReleveManualChange(): void {
        this.hasPendingReleveManualChanges = true;
    }

    /**
     * Gère les changements dans les champs Trx remboursé
     */
    onReleveRembourseChange(): void {
        this.hasPendingReleveManualChanges = true;
    }

    /**
     * Gère la sélection d'un fichier CSV ou XLS pour la section Trx remboursé.
     */
    async onReleveRembourseFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input?.files?.[0];
        if (!file) return;
        const fileName = (file.name || '').toLowerCase();
        const isCsv = fileName.endsWith('.csv');
        const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
        if (!isCsv && !isExcel) {
            this.popupService.showError(this.translateKey('RPT.releve.unsupportedFormat'), this.translateKey('RPT.releve.invalidFile'));
            input.value = '';
            return;
        }
        this.isReleveRembourseFileLoading = true;
        try {
            const result = isCsv
                ? await this.parseReleveManualCsv(file)
                : await this.parseReleveManualExcel(file);
            this.releveRembourseNombre = result.nombre;
            this.releveRembourseVolume = result.volume;
            this.onReleveRembourseChange();
            this.popupService.showSuccess(
                this.translateKey('RPT.releve.fileLoaded'),
                this.translateKey('RPT.releve.loadSuccess')
            );
        } catch (err: any) {
            this.popupService.showError(err?.message || 'Erreur lors de la lecture du fichier.', 'Erreur');
        } finally {
            this.isReleveRembourseFileLoading = false;
            input.value = '';
        }
    }

    /**
     * Gère la sélection d'un fichier CSV ou XLS pour la section Trx traité.
     * Remplit Nombre = nombre de lignes (sans en-tête) et Volume = somme de la colonne « montant ».
     */
    async onReleveManualFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input?.files?.[0];
        if (!file) return;
        const fileName = (file.name || '').toLowerCase();
        const isCsv = fileName.endsWith('.csv');
        const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
        if (!isCsv && !isExcel) {
            this.popupService.showError(this.translateKey('RPT.releve.unsupportedFormat'), this.translateKey('RPT.releve.invalidFile'));
            input.value = '';
            return;
        }
        this.isReleveManualFileLoading = true;
        try {
            const result = isCsv
                ? await this.parseReleveManualCsv(file)
                : await this.parseReleveManualExcel(file);
            this.releveManualNombre = result.nombre;
            this.releveManualVolume = result.volume;
            this.onReleveManualChange();
            this.popupService.showSuccess(
                this.translateKey('RPT.releve.fileLoaded'),
                this.translateKey('RPT.releve.loadSuccess')
            );
        } catch (err: any) {
            this.popupService.showError(err?.message || 'Erreur lors de la lecture du fichier.', 'Erreur');
        } finally {
            this.isReleveManualFileLoading = false;
            input.value = '';
        }
    }

    /**
     * Parse un CSV : première ligne = en-tête, cherche la colonne « montant », nombre = lignes données, volume = somme.
     */
    private parseReleveManualCsv(file: File): Promise<{ nombre: number; volume: number }> {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                encoding: 'UTF-8',
                complete: (results) => {
                    try {
                        const rows = results.data as any[][];
                        if (!rows || rows.length === 0) {
                            resolve({ nombre: 0, volume: 0 });
                            return;
                        }
                        resolve(this.extractReleveManualData(rows));
                    } catch (e: any) {
                        reject(e);
                    }
                },
                error: (err) => reject(new Error(err.message || 'Erreur de lecture CSV'))
            });
        });
    }

    /**
     * Parse un fichier Excel (XLS/XLSX) : première ligne = en-tête, cherche « montant », nombre = lignes données, volume = somme.
     */
    private async parseReleveManualExcel(file: File): Promise<{ nombre: number; volume: number }> {
        const data = await this.readFileAsArrayBuffer(file);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) {
            throw new Error(this.translateKey('RPT.releve.noSheet'));
        }
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
        if (!rows || rows.length === 0) {
            return { nombre: 0, volume: 0 };
        }
        return this.extractReleveManualData(rows);
    }

    private extractReleveManualData(rows: any[][]): { nombre: number; volume: number } {
        if (!this.releveData) {
            throw new Error(this.translateKey('RPT.releve.noActiveStatement'));
        }

        const headerRow = rows[0] || [];
        const normalizeHeader = (value: any) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '');
        const findHeaderIndex = (accepted: string[]) =>
            headerRow.findIndex((header: any) => accepted.includes(normalizeHeader(header)));

        const montantIndex = findHeaderIndex(['montant', 'bomontant', 'bo_montant']);
        const serviceIndex = findHeaderIndex(['boservice', 'bo_service']);
        const dateIndex = findHeaderIndex(['bodate', 'bo_date']);

        if (montantIndex === -1) {
            throw new Error(this.translateKey('RPT.releve.missingAmount'));
        }
        if (serviceIndex === -1) {
            throw new Error(this.translateKey('RPT.releve.missingService'));
        }
        if (dateIndex === -1) {
            throw new Error(this.translateKey('RPT.releve.missingDate'));
        }

        const expectedService = (this.releveData.service || '').trim();
        const baseDate = this.formatDateForSearch(this.releveData.date || '');
        const allowedDates = new Set([
            baseDate,
            this.shiftIsoDate(baseDate, -1),
            this.shiftIsoDate(baseDate, 1)
        ]);

        const invalidServiceLines: number[] = [];
        const invalidDateLines: number[] = [];
        const invalidDateFormatLines: number[] = [];
        let volume = 0;
        let nombre = 0;

        rows.slice(1).forEach((row, index) => {
            const lineNumber = index + 2;
            if (!Array.isArray(row) || row.every(cell => String(cell ?? '').trim() === '')) {
                return;
            }

            const serviceValue = String(row[serviceIndex] ?? '').trim();
            if (!this.releveStringsEqual(serviceValue, expectedService)) {
                invalidServiceLines.push(lineNumber);
            }

            const parsedDate = this.parseReleveUploadDate(row[dateIndex]);
            if (!parsedDate) {
                invalidDateFormatLines.push(lineNumber);
            } else if (!allowedDates.has(parsedDate)) {
                invalidDateLines.push(lineNumber);
            }

            const montantValue = row[montantIndex];
            if (montantValue !== null && montantValue !== undefined && montantValue !== '') {
                const numericValue = typeof montantValue === 'number'
                    ? montantValue
                    : parseFloat(String(montantValue).replace(/\s/g, '').replace(',', '.'));
                if (!Number.isNaN(numericValue)) {
                    volume += numericValue;
                }
            }

            nombre++;
        });

        if (invalidServiceLines.length > 0) {
            throw new Error(this.translateKey('RPT.releve.unexpectedService', { service: expectedService, lines: this.formatLineNumbers(invalidServiceLines) }));
        }
        if (invalidDateFormatLines.length > 0) {
            throw new Error(`La colonne BO_date contient des dates invalides (ligne(s) ${this.formatLineNumbers(invalidDateFormatLines)}).`);
        }
        if (invalidDateLines.length > 0) {
            throw new Error(this.translateKey('RPT.releve.invalidDate', { lines: this.formatLineNumbers(invalidDateLines) }));
        }

        return { nombre, volume };
    }

    private parseReleveUploadDate(value: any): string | null {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return this.toIsoLocalDate(value);
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const parsed = XLSX.SSF.parse_date_code(value);
            if (parsed) {
                const month = String(parsed.m).padStart(2, '0');
                const day = String(parsed.d).padStart(2, '0');
                return `${parsed.y}-${month}-${day}`;
            }
        }

        const raw = String(value).trim();
        if (!raw) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            return raw.slice(0, 10);
        }

        const frMatch = raw.match(
            /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );
        if (frMatch) {
            const day = String(frMatch[1]).padStart(2, '0');
            const month = String(frMatch[2]).padStart(2, '0');
            const year = frMatch[3];
            if (frMatch[4] !== undefined) {
                const h = parseInt(frMatch[4], 10);
                const min = parseInt(frMatch[5], 10);
                const sec = frMatch[6] !== undefined ? parseInt(frMatch[6], 10) : 0;
                if (h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) {
                    return null;
                }
            }
            return `${year}-${month}-${day}`;
        }

        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return this.toIsoLocalDate(parsed);
        }

        return null;
    }

    private toIsoLocalDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private shiftIsoDate(isoDate: string, offsetDays: number): string {
        const parsed = new Date(`${isoDate}T00:00:00`);
        parsed.setDate(parsed.getDate() + offsetDays);
        return this.toIsoLocalDate(parsed);
    }

    private formatLineNumbers(lines: number[]): string {
        return lines.slice(0, 10).join(', ') + (lines.length > 10 ? ', ...' : '');
    }

    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Exporte le relevé en Excel
     */
    async exportReleveToExcel(): Promise<void> {
        if (!this.releveData) {
            this.popupService.showWarning(this.translateKey('RPT.releve.noData'));
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();
            
            // Feuille 1: Résumé du relevé
            const summarySheet = workbook.addWorksheet('Résumé');
            
            // Fonction helper pour appliquer des styles
            const applyHeaderStyle = (row: ExcelJS.Row, bgColor: string = 'FF667eea') => {
                row.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: bgColor }
                    };
                    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                });
            };

            const applySectionStyle = (row: ExcelJS.Row) => {
                row.getCell(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE3F2FD' }
                };
                row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF1976D2' } };
            };

            const applyValueStyle = (row: ExcelJS.Row, isTotal: boolean = false) => {
                row.eachCell((cell, colNumber) => {
                    if (colNumber === 1) {
                        cell.font = { size: 10 };
                    } else {
                        cell.font = { size: 10, bold: isTotal };
                        cell.numFmt = '#,##0.00';
                        if (isTotal) {
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFF1F8E9' }
                            };
                        }
                    }
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                });
            };

            // Titre principal
            const titleRow = summarySheet.addRow(['📋 Relevé de Service']);
            titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF667eea' } };
            titleRow.height = 25;
            summarySheet.addRow([]);
            
            // En-tête avec le service et la date (comme dans le modal)
            const serviceRow = summarySheet.addRow([this.releveData.service]);
            serviceRow.getCell(1).font = { size: 14, bold: true, color: { argb: 'FF333333' } };
            serviceRow.height = 20;
            
            const dateRow = summarySheet.addRow([`Date: ${this.formatDate(this.releveData.date)}`]);
            dateRow.getCell(1).font = { size: 11, color: { argb: 'FF666666' } };
            dateRow.height = 18;
            summarySheet.addRow([]);
            
            // Données du Rapport de Réconciliation (Correspondance parfaite)
            const rapportHeader = summarySheet.addRow(['Données du Rapport de Réconciliation (Correspondance parfaite)']);
            applySectionStyle(rapportHeader);
            rapportHeader.height = 18;
            
            const rapportVolumeRow = summarySheet.addRow(['Volume:', this.releveData.totalVolume || 0]);
            applyValueStyle(rapportVolumeRow);
            const rapportTrxRow = summarySheet.addRow(['Nombre de transactions:', this.releveData.totalTransactions || 0]);
            applyValueStyle(rapportTrxRow);
            summarySheet.addRow([]);
            
            // Trx Partenaire J+1 : titre et synthèse rapport + traité toujours exportés
            const ecartJ1Header = summarySheet.addRow(['Trx Partenaire J+1']);
            applySectionStyle(ecartJ1Header);
            ecartJ1Header.height = 18;
            if (this.releveEcartData && this.releveEcartData.length > 0) {
                const ecartJ1NombreRow = summarySheet.addRow(['Nombre total:', this.getTotalEcartNombre()]);
                applyValueStyle(ecartJ1NombreRow);
                const ecartJ1VolumeRow = summarySheet.addRow(['Volume total:', this.getTotalEcartVolume()]);
                applyValueStyle(ecartJ1VolumeRow);
            }
            // Synthèse rapport + écart traité (toujours affichée, même sans ligne Partenaire J+1)
            const volumeBORow = summarySheet.addRow(['💰 Synthèse (rapport + écart traité):', this.getTotalTransactionsSum(), this.getTotalVolumeSum()]);
            volumeBORow.getCell(1).font = { size: 10, bold: true, color: { argb: 'FF28a745' } };
            volumeBORow.getCell(2).font = { size: 10, bold: true, color: { argb: 'FF28a745' } };
            volumeBORow.getCell(3).font = { size: 10, bold: true, color: { argb: 'FF28a745' } };
            volumeBORow.getCell(2).numFmt = '#,##0';
            volumeBORow.getCell(3).numFmt = '#,##0.00';
            volumeBORow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
            volumeBORow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
            volumeBORow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
            volumeBORow.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                };
            });
            summarySheet.addRow([]);
            
            // Données depuis Écart BO J-1
            if (this.releveEcartDataJ1 && this.releveEcartDataJ1.length > 0) {
                const ecartJ1MinusHeader = summarySheet.addRow(['Trx Partenaire J-1']);
                applySectionStyle(ecartJ1MinusHeader);
                ecartJ1MinusHeader.height = 18;
                
                const ecartJ1MinusNombreRow = summarySheet.addRow(['Nombre total:', this.getTotalEcartNombreJ1()]);
                applyValueStyle(ecartJ1MinusNombreRow);
                const ecartJ1MinusVolumeRow = summarySheet.addRow(['Volume total:', this.getTotalEcartVolumeJ1()]);
                applyValueStyle(ecartJ1MinusVolumeRow);
                summarySheet.addRow([]);
            }
            
            // Trx traité (saisie manuelle)
            const manualHeader = summarySheet.addRow(['📝 Trx traité (saisie manuelle)']);
            applySectionStyle(manualHeader);
            manualHeader.height = 18;
            
            const manualNombreRow = summarySheet.addRow(['Nombre:', this.releveManualNombre || 0]);
            applyValueStyle(manualNombreRow);
            const manualVolumeRow = summarySheet.addRow(['Volume:', this.releveManualVolume || 0]);
            applyValueStyle(manualVolumeRow);
            
            // Afficher le résumé seulement si des valeurs sont saisies
            if (this.releveManualNombre > 0 || this.releveManualVolume > 0) {
                const manualNombreTotalRow = summarySheet.addRow(['Nombre total:', this.releveManualNombre || 0]);
                applyValueStyle(manualNombreTotalRow);
                const manualVolumeTotalRow = summarySheet.addRow(['Volume total:', this.releveManualVolume || 0]);
                applyValueStyle(manualVolumeTotalRow);
            }
            summarySheet.addRow([]);
            
            // Trx remboursé (saisie manuelle)
            const rembourseHeader = summarySheet.addRow(['📝 Trx remboursé (saisie manuelle)']);
            applySectionStyle(rembourseHeader);
            rembourseHeader.height = 18;
            
            const rembourseNombreRow = summarySheet.addRow(['Nombre:', this.releveRembourseNombre || 0]);
            applyValueStyle(rembourseNombreRow);
            const rembourseVolumeRow = summarySheet.addRow(['Volume:', this.releveRembourseVolume || 0]);
            applyValueStyle(rembourseVolumeRow);
            
            if (this.releveRembourseNombre > 0 || this.releveRembourseVolume > 0) {
                const rembourseNombreTotalRow = summarySheet.addRow(['Nombre total:', this.releveRembourseNombre || 0]);
                applyValueStyle(rembourseNombreTotalRow);
                const rembourseVolumeTotalRow = summarySheet.addRow(['Volume total:', this.releveRembourseVolume || 0]);
                applyValueStyle(rembourseVolumeTotalRow);
            }
            summarySheet.addRow([]);
            
            // Totaux finaux
            const totauxHeader = summarySheet.addRow(['📊 Totaux finaux']);
            applyHeaderStyle(totauxHeader, 'FF28a745');
            totauxHeader.height = 20;
            
            const trxBORow = summarySheet.addRow(['📈 Nombre total de transactions BO:', this.getTotalTransactionsSum()]);
            applyValueStyle(trxBORow);
            const trxPartenaireRow = summarySheet.addRow(['📈 Nombre total de transactions Partenaire:', this.getTotalTransactionsPartenaire()]);
            applyValueStyle(trxPartenaireRow);
            const trxRapportRow = summarySheet.addRow(['📊 Nombre total (Rapport):', this.releveData.totalTransactions || 0]);
            applyValueStyle(trxRapportRow);
            const trxEcartRow = summarySheet.addRow(['📊 Nombre total (Écart traité):', this.getTotalNombreSum()]);
            applyValueStyle(trxEcartRow);
            
            // Volume partenaire (mis en évidence comme dans le modal) : label, nombre de transactions, volume
            const volumePartenaireRow = summarySheet.addRow(['💰 Volume partenaire:', this.getTotalTransactionsPartenaire(), this.getTotalVolumeSumWithManual()]);
            volumePartenaireRow.getCell(1).font = { size: 10, bold: true };
            volumePartenaireRow.getCell(2).font = { size: 10, bold: true };
            volumePartenaireRow.getCell(3).font = { size: 10, bold: true };
            volumePartenaireRow.getCell(2).numFmt = '#,##0';
            volumePartenaireRow.getCell(3).numFmt = '#,##0.00';
            volumePartenaireRow.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                };
            });
            
            // Ajuster la largeur des colonnes
            summarySheet.getColumn(1).width = 40;
            summarySheet.getColumn(2).width = 20;
            summarySheet.getColumn(3).width = 20;
            
            // Feuille 2: détails écarts Partenaire J+1
            if (this.releveEcartData && this.releveEcartData.length > 0) {
                const ecartJ1Sheet = workbook.addWorksheet('Écart Partenaire J+1');
                ecartJ1Sheet.columns = [
                    { header: 'Agence', key: 'agence', width: 20 },
                    { header: 'Pays', key: 'pays', width: 15 },
                    { header: 'Nombre', key: 'nombre', width: 15 },
                    { header: 'Volume', key: 'volume', width: 20 },
                    { header: 'Statut', key: 'statut', width: 15 }
                ];
                
                // Style de l'en-tête
                const headerRowJ1 = ecartJ1Sheet.getRow(1);
                headerRowJ1.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF17a2b8' }
                    };
                    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                });
                headerRowJ1.height = 20;
                
                let rowIndex = 2;
                this.releveEcartData.forEach(ecart => {
                    const row = ecartJ1Sheet.addRow({
                        agence: ecart.agence,
                        pays: ecart.pays,
                        nombre: ecart.nombreTransactions || 0,
                        volume: ecart.montantTotal || 0,
                        statut: (ecart.statut === 'OK' || ecart.statut === 'ok') ? 'OK' : 'En cours'
                    });
                    
                    // Appliquer des styles alternés
                    const isEven = rowIndex % 2 === 0;
                    row.eachCell((cell, colNumber) => {
                        if (colNumber > 2) {
                            cell.numFmt = '#,##0.00';
                        }
                        if (colNumber === 5) {
                            // Style pour la colonne statut
                            if (cell.value === 'OK') {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
                                cell.font = { color: { argb: 'FF155724' }, bold: true };
                            } else {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
                                cell.font = { color: { argb: 'FF856404' }, bold: true };
                            }
                        } else {
                            cell.fill = isEven ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } } : undefined;
                        }
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                        };
                        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'right', vertical: 'middle' };
                    });
                    rowIndex++;
                });
                
                // Ajouter les totaux
                ecartJ1Sheet.addRow([]);
                const totalRowJ1 = ecartJ1Sheet.addRow(['Total', '', this.getTotalEcartNombre(), this.getTotalEcartVolume(), '']);
                totalRowJ1.eachCell((cell, colNumber) => {
                    if (colNumber > 1 && colNumber < 5) {
                        cell.font = { bold: true, size: 11 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
                        cell.numFmt = '#,##0.00';
                    }
                    cell.border = {
                        top: { style: 'medium', color: { argb: 'FF28a745' } },
                        bottom: { style: 'medium', color: { argb: 'FF28a745' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                });
            }
            
            // Feuille 3: Détails Écart BO J-1
            if (this.releveEcartDataJ1 && this.releveEcartDataJ1.length > 0) {
                const ecartJ1MinusSheet = workbook.addWorksheet('Écart BO J-1');
                ecartJ1MinusSheet.columns = [
                    { header: 'Agence', key: 'agence', width: 20 },
                    { header: 'Pays', key: 'pays', width: 15 },
                    { header: 'Nombre', key: 'nombre', width: 15 },
                    { header: 'Volume', key: 'volume', width: 20 },
                    { header: 'Statut', key: 'statut', width: 15 }
                ];
                
                // Style de l'en-tête
                const headerRowJ1Minus = ecartJ1MinusSheet.getRow(1);
                headerRowJ1Minus.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF6c757d' }
                    };
                    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                });
                headerRowJ1Minus.height = 20;
                
                let rowIndexJ1Minus = 2;
                this.releveEcartDataJ1.forEach(ecart => {
                    const row = ecartJ1MinusSheet.addRow({
                        agence: ecart.agence,
                        pays: ecart.pays,
                        nombre: ecart.nombreTransactions || 0,
                        volume: ecart.montantTotal || 0,
                        statut: (ecart.statut === 'OK' || ecart.statut === 'ok') ? 'OK' : 'En cours'
                    });
                    
                    // Appliquer des styles alternés
                    const isEven = rowIndexJ1Minus % 2 === 0;
                    row.eachCell((cell, colNumber) => {
                        if (colNumber > 2) {
                            cell.numFmt = '#,##0.00';
                        }
                        if (colNumber === 5) {
                            // Style pour la colonne statut
                            if (cell.value === 'OK') {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
                                cell.font = { color: { argb: 'FF155724' }, bold: true };
                            } else {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
                                cell.font = { color: { argb: 'FF856404' }, bold: true };
                            }
                        } else {
                            cell.fill = isEven ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } } : undefined;
                        }
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                        };
                        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'right', vertical: 'middle' };
                    });
                    rowIndexJ1Minus++;
                });
                
                // Ajouter les totaux
                ecartJ1MinusSheet.addRow([]);
                const totalRowJ1Minus = ecartJ1MinusSheet.addRow(['Total', '', this.getTotalEcartNombreJ1(), this.getTotalEcartVolumeJ1(), '']);
                totalRowJ1Minus.eachCell((cell, colNumber) => {
                    if (colNumber > 1 && colNumber < 5) {
                        cell.font = { bold: true, size: 11 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
                        cell.numFmt = '#,##0.00';
                    }
                    cell.border = {
                        top: { style: 'medium', color: { argb: 'FF28a745' } },
                        bottom: { style: 'medium', color: { argb: 'FF28a745' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                });
            }
            
            // Générer le fichier Excel
            const buffer = await workbook.xlsx.writeBuffer();
            const dateStr = this.formatDate(this.releveData.date).replace(/\//g, '-');
            const serviceStr = (this.releveData.service || 'Service').replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `releve_${serviceStr}_${dateStr}_${new Date().toISOString().slice(0,10)}.xlsx`;
            
            saveAs(new Blob([buffer]), fileName);
            
            this.popupService.showSuccess(this.translateKey('RPT.export.success', { file: fileName }), this.translateKey('RPT.export.successTitle'));
        } catch (error: any) {
            console.error('❌ Erreur lors de l\'export Excel du relevé:', error);
            this.popupService.showError('Erreur d\'export', `Une erreur est survenue lors de l'export Excel: ${error.message || 'Erreur inconnue'}`);
        }
    }

    /**
     * Exporte le relevé (modal complet) en PDF, en capturant tout le contenu
     * comme pour l'écran redevance-loterie.
     */
    async exportReleveToPdf(): Promise<void> {
        if (!this.releveData || !this.releveExportContentRef?.nativeElement) {
            return;
        }
        try {
            const element = this.releveExportContentRef.nativeElement;

            // Désactiver temporairement les scrolls / hauteurs max pour capturer tout le contenu
            const originalOverflow = element.style.overflowY;
            const originalMaxHeight = element.style.maxHeight;
            element.style.overflowY = 'visible';
            element.style.maxHeight = 'none';

            const bodyEl = element.querySelector('.modal-body-releve') as HTMLElement | null;
            let bodyOriginalOverflow: string | null = null;
            let bodyOriginalMaxHeight: string | null = null;
            if (bodyEl) {
                bodyOriginalOverflow = bodyEl.style.overflowY;
                bodyOriginalMaxHeight = bodyEl.style.maxHeight;
                bodyEl.style.overflowY = 'visible';
                bodyEl.style.maxHeight = 'none';
            }

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: 'var(--color-bg)'
            });

            // Restaurer les styles après la capture
            element.style.overflowY = originalOverflow;
            element.style.maxHeight = originalMaxHeight;
            if (bodyEl) {
                bodyEl.style.overflowY = bodyOriginalOverflow ?? '';
                bodyEl.style.maxHeight = bodyOriginalMaxHeight ?? '';
            }
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const pageW = pdfW - 2 * margin;
            const pageH = pdfH - 2 * margin;
            const imgW = canvas.width;
            const imgH = canvas.height;
            const ratio = pageW / imgW;
            const pageCanvas = document.createElement('canvas');
            const pageCtx = pageCanvas.getContext('2d');

            // Hauteur de l'image (en px) correspondant à une page PDF
            const pageImgHeight = pageH / ratio;
            const totalPages = Math.ceil(imgH / pageImgHeight);

            pageCanvas.width = imgW;

            for (let page = 0; page < totalPages; page++) {
                const sourceY = page * pageImgHeight;
                const sliceHeight = Math.min(pageImgHeight, imgH - sourceY);

                pageCanvas.height = sliceHeight;
                if (pageCtx) {
                    pageCtx.clearRect(0, 0, imgW, sliceHeight);
                    pageCtx.drawImage(
                        canvas,
                        0,
                        sourceY,
                        imgW,
                        sliceHeight,
                        0,
                        0,
                        imgW,
                        sliceHeight
                    );
                }

                const pageData = pageCanvas.toDataURL('image/png');
                const renderHeight = sliceHeight * ratio;

                if (page > 0) {
                    pdf.addPage();
                }
                pdf.addImage(pageData, 'PNG', margin, margin, pageW, renderHeight);
            }

            const datePart = this.formatDateForSearch(this.releveData.date || '').replace(/-/g, '');
            const servicePart = (this.releveData.service || 'Service').replace(/\s+/g, '-');
            const fileName = `Releve-${servicePart}-${datePart}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('Erreur export PDF relevé:', error);
            this.popupService.showError(this.translateKey('RPT.releve.exportPdfErrorTitle'), this.translateKey('RPT.releve.exportPdfError'));
        }
    }

    /**
     * Validation relevé : CDO → Niveau GROUP (bouton « Clôturé »), puis GROUP → Terminé (bouton « Terminé »).
     */
    async validateReleve(): Promise<void> {
        if (!this.releveData) {
            this.popupService.showWarning(this.translateKey('RPT.releve.noData'));
            return;
        }

        if (this.isReleveFullyClosed()) {
            return;
        }

        if (this.isReleveCdoClosed()) {
            await this.closeReleveAtGroupLevel();
            return;
        }

        await this.validateReleveAsCdo();
    }

    /**
     * Validation Responsable CDO : passe le traitement au niveau suivant configuré.
     */
    private async validateReleveAsCdo(): Promise<void> {
        if (!this.releveData) {
            return;
        }

        const paysCode = this.releveData.country || 'GNL';
        const currentTraitement = this.releveData.traitement || 'Niveau Support';

        // Vérifier qu'un profil est configuré pour le niveau suivant
        const nextNiveau = this.niveauxValidationConfig.findNextNiveau(paysCode, currentTraitement);
        if (!nextNiveau) {
            this.popupService.showError(this.translateKey('RPT.releve.noNextLevel'));
            return;
        }

        if (!this.niveauxValidationConfig.hasProfilsConfigured(paysCode, nextNiveau.valeur)) {
            this.popupService.showError(this.translateKey('RPT.releve.noProfilesConfigured'));
            return;
        }

        // Vérifier autorisation utilisateur pour le niveau suivant
        const canValidate = await this.canUserValidateNextLevel(paysCode, currentTraitement);
        if (!canValidate) {
            this.popupService.showError(this.translateKey('RPT.releve.unauthorizedLevel'));
            return;
        }

        const nextTraitement = this.getNextTraitement(paysCode, currentTraitement);
        if (!nextTraitement) {
            this.popupService.showError(this.translateKey('RPT.releve.noNextLevel'));
            return;
        }

        const releveN = this.normalizeReleveEnvKey(this.releveEnv);
        const envLabel = this.envOptions.includes(releveN) ? releveN : 'T-E';
        const selectedEnv = await this.popupService.showSelectInput(
            this.translateKey('RPT.releve.selectEnv'),
            this.translateKey('RPT.releve.envTitle'),
            this.envOptions,
            envLabel
        );

        if (!selectedEnv) {
            return;
        }

        this.releveEnv = selectedEnv;
        this.releveEnvLastValid = this.normalizeReleveEnvKey(selectedEnv);

        const matchingLines = this.filteredReportData.filter(line =>
            this.isSameReleveScope(line, this.releveData!)
        );

        if (matchingLines.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.releve.noRowScope'));
            return;
        }

        const unlockedLines = matchingLines.filter(line => !this.isRowLocked(line));

        if (unlockedLines.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.releve.allLocked'));
            return;
        }

        const envLabelConfirm = this.normalizeReleveEnvKey(this.releveEnv);
        const confirmMessage = this.translateKey('RPT.releve.validateConfirm', { count: unlockedLines.length, service: this.releveData.service, date: this.formatDate(this.releveData.date), country: this.releveData.country, env: this.formatEnvFilterLabel(envLabelConfirm) });
        const confirmed = await this.popupService.showConfirm(confirmMessage, this.translateKey('RPT.releve.validateTitle'));

        if (!confirmed) {
            return;
        }

        const manualSaveOk = await this.saveReleveManualData();
        if (!manualSaveOk) {
            return;
        }

        await this.applyReleveTraitementToScope(unlockedLines, nextTraitement, this.translateKey('RPT.releve.validateDone'));
    }

    /**
     * Clôture au niveau GROUP : passe le traitement au niveau suivant configuré.
     */
    private async closeReleveAtGroupLevel(): Promise<void> {
        if (!this.releveData) {
            return;
        }

        const paysCode = this.releveData.country || 'GNL';
        const currentTraitement = this.releveData.traitement || 'Niveau Support';

        // Vérifier qu'un profil est configuré pour le niveau suivant
        const nextNiveau = this.niveauxValidationConfig.findNextNiveau(paysCode, currentTraitement);
        if (!nextNiveau) {
            this.popupService.showError(this.translateKey('RPT.releve.noNextLevel'));
            return;
        }

        if (!this.niveauxValidationConfig.hasProfilsConfigured(paysCode, nextNiveau.valeur)) {
            this.popupService.showError(this.translateKey('RPT.releve.noProfilesConfigured'));
            return;
        }

        // Vérifier autorisation utilisateur pour le niveau suivant
        const canValidate = await this.canUserValidateNextLevel(paysCode, currentTraitement);
        if (!canValidate) {
            this.popupService.showError(this.translateKey('RPT.releve.unauthorizedLevel'));
            return;
        }

        const nextTraitement = this.getNextTraitement(paysCode, currentTraitement);
        if (!nextTraitement) {
            this.popupService.showError(this.translateKey('RPT.releve.noNextLevel'));
            return;
        }

        const matchingLines = this.filteredReportData.filter(line =>
            this.isSameReleveScope(line, this.releveData!)
        );

        if (matchingLines.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.releve.noRowScope'));
            return;
        }

        const unlockedLines = matchingLines.filter(line => !this.isRowLocked(line));

        if (unlockedLines.length === 0) {
            this.popupService.showWarning(this.translateKey('RPT.releve.allLocked'));
            return;
        }

        const envLabelConfirm = this.normalizeReleveEnvKey(this.releveEnv);
        const confirmMessage = this.translateKey('RPT.releve.closeGroupConfirm', { count: unlockedLines.length, service: this.releveData.service, date: this.formatDate(this.releveData.date), country: this.releveData.country, env: this.formatEnvFilterLabel(envLabelConfirm) });
        const confirmed = await this.popupService.showConfirm(confirmMessage, this.translateKey('RPT.releve.closeGroupTitle'));

        if (!confirmed) {
            return;
        }

        await this.applyReleveTraitementToScope(unlockedLines, nextTraitement, this.translateKey('RPT.releve.closeGroupDone'));
    }

    private async applyReleveTraitementToScope(
        unlockedLines: ReconciliationReportData[],
        targetTraitement: string,
        successTitle: string
    ): Promise<void> {
        this.isValidatingReleve = true;
        let successCount = 0;
        let errorCount = 0;

        try {
            const updatePromises = unlockedLines.map(async (item) => {
                const oldTraitement = item.traitement;
                item.traitement = targetTraitement;

                try {
                    this.debugLog(`🔄 Relevé: Mise à jour traitement pour ligne ID=${item.id}, traitement="${item.traitement}"`);
                    await this.saveItemTraitement(item);
                    await new Promise(resolve => setTimeout(resolve, 100));

                    if (this.normalizeTraitementValue(item.traitement) === targetTraitement) {
                        successCount++;
                    } else {
                        successCount++;
                    }
                } catch (error: any) {
                    errorCount++;
                    item.traitement = oldTraitement;
                    console.error(`❌ Erreur lors de la mise à jour pour ligne ID=${item.id}:`, error);
                }
            });

            await Promise.all(updatePromises);
            await new Promise(resolve => setTimeout(resolve, 500));

            if (this.currentSource === 'db') {
                await this.loadSavedReportFromDatabase();
            } else {
                this.filterReport();
                this.updatePagination();
            }

            this.isReleveValidated = this.isReleveCdoClosed();

            if (successCount > 0) {
                this.notifyResult8RecUpdated();
                this.popupService.showSuccess(
                    this.translateKey('RPT.releve.traitementUpdated', { traitement: targetTraitement, count: successCount }),
                    successTitle
                );
            }
            if (errorCount > 0) {
                this.popupService.showError(this.translateKey('RPT.releve.updateError', { count: errorCount }), this.translateKey('RPT.releve.someOpsFailed'));
            }
        } catch (error: any) {
            console.error('Erreur lors de la validation:', error);
            this.popupService.showError(`❌ Erreur lors de la validation: ${error.message || 'Erreur inconnue'}`);
        } finally {
            this.isValidatingReleve = false;
        }
    }

    // Méthode pour charger les données en cours
    private loadLiveData() {
        this.loadedFromDb = false;
        this.hasSummary = false;
        this.autoSelectAllOnNextPagination = true;
        
        // Réinitialiser les données
        this.reportData = [];
        this.filteredReportData = [];
        this.kpiScopeData = [];
        this.resetSelectionForAuto();
        
        // Recharger depuis les services
        const summary = this.reconciliationSummaryService.getAgencySummary();
        if (summary && summary.length > 0) {
            this.generateReportDataFromSummary(summary);
            this.extractUniqueValues();
            this.filterReport();
            this.currentSource = 'live';
            this.hasSummary = true;
            this.updatePagination();
        } else {
            // Essayer de charger depuis les résultats de réconciliation via l'observable
            // Prendre la dernière valeur du BehaviorSubject en s'abonnant une fois
            this.appStateService.getReconciliationResults().pipe(
                take(1)
            ).subscribe(response => {
                if (response) {
                    this.response = response;
                    this.generateReportData();
                    this.extractUniqueValues();
                    this.filterReport();
                    this.currentSource = 'live';
                    this.updatePagination();
                } else {
                    // Pas de données en cours disponibles
                    this.popupService.showError(this.translateKey('RPT.releve.noLiveDataTitle'), this.translateKey('RPT.releve.noLiveData'));
                    // Revenir aux données en base
                    this.currentSource = 'db';
                    this.autoSelectAllOnNextPagination = false;
                    this.loadSavedReportFromDatabase();
                }
            });
        }
    }

    private selectAllFilteredRows(): void {
        this.selectedRows.clear();
        this.bulkStatusSelection = '';
        this.bulkTraitementSelection = '';
        this.filteredReportData.forEach(item => this.selectedRows.add(item));
    }

    private resetSelectionForAuto(): void {
        this.selectedRows.clear();
        this.bulkStatusSelection = '';
        this.bulkTraitementSelection = '';
        this.hasUserSelectionChanged = false;
    }
}
