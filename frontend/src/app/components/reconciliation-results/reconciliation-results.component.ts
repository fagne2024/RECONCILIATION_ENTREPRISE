import { Component, Input, OnInit, ChangeDetectorRef, OnChanges, SimpleChanges, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { ReconciliationResponse, Match } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { Router, ActivatedRoute } from '@angular/router';
import { ReconciliationService } from '../../services/reconciliation.service';
import { EcartSoldeService } from '../../services/ecart-solde.service';
import { ReconciliationSummaryService, AgencySummaryData } from '../../services/reconciliation-summary.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { EcartSolde } from '../../models/ecart-solde.model';
import { TrxSfService } from '../../services/trx-sf.service';
import { ImpactOPService } from '../../services/impact-op.service';
import { ImpactOP } from '../../models/impact-op.model';
import { ExportOptimizationService, ExportProgress } from '../../services/export-optimization.service';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { PopupService } from '../../services/popup.service';
import { CompteService } from '../../services/compte.service';
import { OperationService } from '../../services/operation.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { OperationCreateRequest } from '../../models/operation.model';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { extractRecordAmount } from '../../utils/record-amount.util';
import {
    partitionEcartRecords,
    recordMatchesMagicPartition,
    recordMatchesAnyMagicService,
    filterMatchBoDataByMagicPartitionMulti,
    filterRecordsByMagicPartitionMulti,
    hasMagicPartitionTags,
    resolveMagicPartitionContext,
    MagicPartitionContext
} from '../../utils/magic-partition.util';
import { MagicServiceSummary } from '../../services/magic-reconciliation.service';
import { countryNameFromCode } from '../../utils/country-codes.util';
import {
    formatSpreadsheetDateValue,
    isDateColumnName,
    normalizeRecordDateFields,
    normalizeRecordsDateFields
} from '../../utils/date-format.util';
import { SharedModule } from '../../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';

interface ApiError {
    error?: {
        message?: string;
        details?: string;
    };
    message?: string;
}

@Component({
    selector: 'app-reconciliation-results',
    standalone: true,
    imports: [SharedModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="results-page">
            <!-- TOP NAV (aligné sur redevance-loterie) -->
            <nav class="topnav">
                <div class="nav-brand">
                    <div class="nav-brand-dot"></div>
                    ReconciliApp
                </div>
                <div class="nav-sep"></div>
                <div class="nav-path">
                    <strong>{{ 'RES.results' | translate }}</strong>
                </div>
                <div class="nav-spacer"></div>
                <div class="nav-actions">
                    <button type="button" class="nav-btn secondary" (click)="openColumnSelector()">
                        <i class="fas fa-file-alt"></i> {{ 'RES.discrepancyReport' | translate }}
                    </button>
                    <button type="button" class="nav-btn primary" (click)="openReconciliationReport()">
                        <i class="fas fa-chart-line"></i> {{ 'RES.reconciliationReport' | translate }}
                    </button>
                </div>
            </nav>

            <!-- PAGE HEADER (titre + KPIs) -->
            <div class="page-header-results">
                <div class="ph-results-left">
                    <div class="ph-eyebrow"><span></span>{{ 'RES.eyebrow' | translate }}</div>
                    <h1 class="ph-title-results">{{ 'RES.titlePrefix' | translate }} <em>{{ 'RES.titleEm' | translate }}</em></h1>
                </div>
                <div class="ph-results-right">
                    <div class="hero-kpi-strip">
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RES.transactionsBo' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ displayBoTransactionTotal | number:'1.0-0' }}</span>
                        </div>
                        <div class="hk-strip-sep"></div>
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RES.matchesBo' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ filteredMatchesCount | number:'1.0-0' }}</span>
                        </div>
                        <div class="hk-strip-sep"></div>
                        <div class="hk-strip-item">
                            <span class="hk-strip-label">{{ 'RES.discrepancies' | translate }}</span>
                            <span class="hk-strip-value ds-num">{{ (filteredBoOnlyCount + filteredPartnerOnlyCount) | number:'1.0-0' }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sélecteur partenaire + service (réconciliation magique) -->
            <div class="magic-services-panel" *ngIf="isMagicServiceView()">
                <div class="magic-services-head">
                    <div class="magic-services-intro">
                        <span class="magic-services-badge">{{ visibleMagicSummaries.length }}</span>
                        <div>
                            <h3 class="magic-services-title">{{ 'RES.magicResults' | translate }}</h3>
                            <p class="magic-services-sub" *ngIf="magicPartnerFileNames.length <= 1">
                                {{ 'RES.commonServices' | translate }}
                            </p>
                            <p class="magic-services-sub" *ngIf="magicPartnerFileNames.length > 1">
                                {{ 'RES.partnerFilesIndependent' | translate: { count: magicPartnerFileNames.length } }}
                            </p>
                        </div>
                    </div>
                    <div class="magic-services-nav" *ngIf="visibleMagicSummaries.length > 1">
                        <button type="button" class="magic-nav-btn" (click)="selectPreviousMagicService()" [disabled]="!canSelectPreviousMagicService()" [title]="'RES.previousService' | translate">‹</button>
                        <span class="magic-nav-counter">{{ getMagicServiceIndex() + 1 }} / {{ visibleMagicSummaries.length }}</span>
                        <button type="button" class="magic-nav-btn" (click)="selectNextMagicService()" [disabled]="!canSelectNextMagicService()" [title]="'RES.nextService' | translate">›</button>
                    </div>
                </div>

                <div class="magic-report-group-bar" *ngIf="visibleMagicSummaries.length">
                    <span class="magic-report-group-label">{{ 'RES.groupedReport' | translate }}</span>
                    <label class="magic-report-group-check">
                        <input type="checkbox" class="ds-checkbox" (change)="toggleAllMagicReportSelection($event)"
                               [checked]="allMagicServicesReportSelected()">
                        <span>{{ 'RES.allReconciliations' | translate }}</span>
                    </label>
                    <span class="magic-report-group-count">
                        {{ 'RES.selectedForReport' | translate: { selected: reportSelectedServices.length, total: visibleMagicSummaries.length } }}
                    </span>
                </div>

                <div class="magic-partners-row" *ngIf="magicPartnerFileNames.length > 1">
                    <span class="magic-partners-label">{{ 'RES.partnerFile' | translate }}</span>
                    <div class="magic-partners-tabs">
                        <button type="button"
                                class="magic-partner-tab"
                                *ngFor="let pf of magicPartnerFileNames"
                                [class.active]="selectedMagicPartnerFile === pf"
                                [title]="pf"
                                (click)="selectMagicPartnerFile(pf)">
                            {{ pf }}
                        </button>
                    </div>
                </div>

                <div class="magic-services-tabs" role="tablist" [attr.aria-label]="'RES.reconciledServices' | translate">
                    <button type="button"
                            role="tab"
                            class="magic-service-tab"
                            *ngFor="let summary of visibleMagicSummaries; let i = index"
                            [class.active]="selectedMagicService === summary.service"
                            [class.report-selected]="isMagicServiceReportSelected(summary.service)"
                            [attr.aria-selected]="selectedMagicService === summary.service"
                            [title]="summary.service"
                            (click)="selectMagicService(summary.service)">
                        <span class="tab-rail">
                            <span
                                class="tab-report-check"
                                role="checkbox"
                                [attr.aria-checked]="isMagicServiceReportSelected(summary.service)"
                                [title]="isMagicServiceReportSelected(summary.service) ? ('RES.removeFromGroupedReport' | translate) : ('RES.addToGroupedReport' | translate)"
                                (click)="$event.stopPropagation(); toggleMagicServiceReportSelection(summary.service)">
                                <span class="tab-report-box">
                                    <span *ngIf="isMagicServiceReportSelected(summary.service)" class="tab-report-tick">✓</span>
                                </span>
                            </span>
                            <span class="tab-index">{{ i + 1 }}</span>
                            <span class="tab-name">{{ summary.service }}</span>
                        </span>
                        <span class="tab-metrics">
                            <span class="metric metric-match">
                                <span class="metric-label">{{ 'RES.match' | translate }}</span>
                                <span class="metric-value ds-num">{{ summary.totalMatches | number:'1.0-0' }}</span>
                            </span>
                            <span class="metric metric-bo">
                                <span class="metric-label">{{ 'RES.boGap' | translate }}</span>
                                <span class="metric-value ds-num">{{ summary.totalBoOnly | number:'1.0-0' }}</span>
                            </span>
                            <span class="metric metric-partner">
                                <span class="metric-label">{{ 'RES.partnerGap' | translate }}</span>
                                <span class="metric-value ds-num">{{ summary.totalPartnerOnly | number:'1.0-0' }}</span>
                            </span>
                        </span>
                    </button>
                </div>
            </div>

            <div class="main">
                <!-- Affichage de la progression -->
                <div *ngIf="showProgress" class="progress-overlay">
                    <div class="progress-card">
                        <div class="progress-header">
                            <h2>{{ 'RES.reconciling' | translate }}</h2>
                            <div class="progress-icon">
                                <i class="fas fa-cog fa-spin"></i>
                            </div>
                        </div>
                        
                        <div class="progress-bar-container">
                            <div class="progress-bar">
                                <div class="progress-fill" [style.width.%]="progressPercentage"></div>
                            </div>
                            <div class="progress-text">
                                {{ progressPercentage | number:'1.0-0' }}{{ 'RES.percentDone' | translate }}
                            </div>
                        </div>
                        
                        <div class="progress-details">
                            <div class="detail-item">
                                <span class="label">📊 {{ 'RES.recordsProcessed' | translate }}</span>
                                <span class="value">{{ processedRecords | number }} / {{ totalRecords | number }}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">⏱️ {{ 'RES.elapsedTime' | translate }}</span>
                                <span class="value">{{ formatTime(getElapsedTime()) }}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">🚀 {{ 'RES.speed' | translate }}</span>
                                <span class="value">{{ getProcessingSpeed() }} {{ 'RES.recPerSec' | translate }}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">📈 {{ 'RES.status' | translate }}</span>
                                <span class="value">{{ getProgressStatus() }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="results-container">
            <div class="summary-section">
                <div class="summary-header">
                    <h3>📊 {{ 'RES.summaryTitle' | translate }}<span *ngIf="isMagicServiceView()"> — {{ selectedMagicPartnerFile || ('RES.partnerFallback' | translate) }} / {{ selectedMagicService }}</span></h3>
                    <button type="button" (click)="openColumnSelector()" class="report-button ds-btn ds-btn--primary">
                        📋 {{ 'RES.discrepancyReportBtn' | translate }}
                    </button>
                </div>
                <div class="stats-grid">
                    <div class="stat-card stat-card-total">
                        <div class="stat-icon">📊</div>
                        <div class="stat-value ds-num">{{ displayBoTransactionTotal }}</div>
                        <div class="stat-label">{{ 'RES.boTxnCount' | translate }}</div>
                    </div>
                    <div class="stat-card stat-card-matched">
                        <div class="stat-icon">✅</div>
                        <div class="stat-value ds-num">{{filteredMatchesCount}}</div>
                        <div class="stat-label">{{ 'RES.matchingBoTxns' | translate }}</div>
                    </div>
                    <div class="stat-card stat-card-bo">
                        <div class="stat-icon">⚠️</div>
                        <div class="stat-value ds-num">{{filteredBoOnlyCount}}</div>
                        <div class="stat-label">{{ 'RES.boGapsNoMatch' | translate }}</div>
                    </div>
                    <div class="stat-card stat-card-partner">
                        <div class="stat-icon">⚠️</div>
                        <div class="stat-value ds-num">{{filteredPartnerOnlyCount}}</div>
                        <div class="stat-label">{{ 'RES.partnerGapsNoMatch' | translate }}</div>
                    </div>
                </div>
            </div>

            <div class="results-tabs">
                <div class="tab-buttons">
                    <button type="button" 
                        class="matches-button"
                        (click)="goToMatches()">
                        ✅ {{ 'RES.viewMatches' | translate }} ({{filteredMatchesCount}})
                    </button>
                    <button type="button" 
                        class="ecart-bo-button"
                        (click)="goToEcartBo()">
                        ⚠️ {{ 'RES.viewBoGaps' | translate }} ({{filteredBoOnlyCount}})
                    </button>
                    <button type="button" 
                        class="ecart-partner-button"
                        (click)="goToEcartPartner()">
                        ⚠️ {{ 'RES.viewPartnerGaps' | translate }} ({{filteredPartnerOnlyCount}})
                    </button>
                    <button type="button" 
                        [class.active]="activeTab === 'agencySummary'"
                        (click)="setActiveTab('agencySummary')">
                        📊 {{ 'RES.agencySummary' | translate }}
                    </button>
                    <button type="button" 
                        class="report-button ds-btn ds-btn--primary"
                        (click)="openReconciliationReport()">
                        📈 {{ 'RES.reconciliationReport' | translate }}
                    </button>
                </div>

                <div class="tab-content">
                    <!-- Les correspondances sont maintenant sur une page séparée -->
                    
                    <!-- Résumé par Agence -->
                    <div *ngIf="activeTab === 'agencySummary'" class="agency-summary-section">
                        <div class="summary-header">
                            <h3>{{ 'RES.volumeByAgencyService' | translate }}</h3>
                            <div class="summary-actions ds-filter-bar">
                                <div class="date-selector">
                                    <label>{{ 'RES.date' | translate }}</label>
                                    <input type="date" class="ds-input" [(ngModel)]="selectedDate">
                                </div>
                                <button type="button" (click)="saveAgencySummary()" class="save-button ds-btn ds-btn--primary ds-btn--sm">
                                    💾 {{ 'RES.save' | translate }}
                                </button>
                                <button type="button" (click)="exportResults()" class="export-button ds-btn ds-btn--secondary ds-btn--sm">
                                    📥 {{ 'RES.exportSummary' | translate }}
                                </button>
                            </div>
                            <div class="summary-stats">
                                <div class="stat-item">
                                    <span class="label">{{ 'RES.boTxnCount' | translate }}:</span>
                                    <span class="value ds-num">{{getTotalRecords() | number:'1.0-0'}}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="label">{{ 'RES.totalVolume' | translate }}</span>
                                    <span class="value ds-num">{{getTotalVolume() | number:'1.0-0'}}</span>
                                </div>
                            </div>
                        </div>
                        <div class="summary-tables-row">
                            <div class="summary-table-agency">
                                <h4>{{ 'RES.volumeByAgency' | translate }}</h4>
                                <table class="ds-table">
                                    <thead>
                                        <tr>
                                            <th><input type="checkbox" class="ds-checkbox" [checked]="allAgencySelected" (change)="toggleSelectAllAgency($event)"></th>
                                            <th>{{ 'RES.agency' | translate }}</th>
                                            <th>{{ 'RES.service' | translate }}</th>
                                            <th>{{ 'RES.country' | translate }}</th>
                                            <th>{{ 'RES.volumeTotal' | translate }}</th>
                                            <th>{{ 'RES.boTxnCount' | translate }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr *ngFor="let summary of getPagedAgencySummary(); trackBy: trackByAgencyName">
                                            <td><input type="checkbox" class="ds-checkbox" [checked]="isAgencySelected(summary)" (change)="toggleAgencySelection(summary, $event)"></td>
                                            <td>{{summary.agency}}</td>
                                            <td>{{summary.service}}</td>
                                            <td>{{summary.country}}</td>
                                            <td class="volume-cell">{{summary.totalVolume | number:'1.0-0'}}</td>
                                            <td class="count-cell">{{summary.recordCount | number:'1.0-0'}}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="summary-table-service">
                                <h4>{{ 'RES.volumeByService' | translate }}</h4>
                                <table class="ds-table">
                                    <thead>
                                        <tr>
                                            <th>{{ 'RES.service' | translate }}</th>
                                            <th>{{ 'RES.volumeTotal' | translate }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr *ngFor="let service of getServiceTotalsArray(); trackBy: trackByServiceName">
                                            <td>{{service.name}}</td>
                                            <td>{{service.volume | number:'1.0-0'}}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="pagination-controls">
                            <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" (click)="prevAgencyPage()" [disabled]="agencyPage === 1">{{ 'RES.previous' | translate }}</button>
                            <span>{{ 'RES.page' | translate }} {{agencyPage}} / {{getTotalAgencyPages()}}</span>
                            <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" (click)="nextAgencyPage()" [disabled]="agencyPage === getTotalAgencyPages()">{{ 'RES.next' | translate }}</button>
                        </div>
                    </div>

                    <!-- Correspondances avec pagination -->
                    <div *ngIf="activeTab === 'matches'" class="matches-section">
                        <!-- Indicateur de chargement avec progression -->
                        <div *ngIf="isLoadingMatches" class="loading-indicator">
                            <div class="spinner"></div>
                            <div class="loading-progress">
                                <span>{{ 'RES.loadingMatches' | translate }}</span>
                                <div *ngIf="loadingProgress.matches.total > 0" class="progress-info">
                                    <div class="progress-bar-mini">
                                        <div class="progress-fill-mini" [style.width.%]="loadingProgress.matches.percentage"></div>
                                    </div>
                                    <span class="progress-text-mini">
                                        {{loadingProgress.matches.current | number}} / {{loadingProgress.matches.total | number}} 
                                        ({{loadingProgress.matches.percentage}}%)
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="search-section ds-filter-bar" *ngIf="!isLoadingMatches">
                            <input 
                                type="text" 
                                [(ngModel)]="searchKey" 
                                (input)="onSearch()"
                                [placeholder]="'RES.searchByKey' | translate"
                                class="search-input ds-input"
                            >
                            <button type="button" (click)="showVolumeSummary = !showVolumeSummary" class="toggle-volume-btn ds-btn ds-btn--secondary ds-btn--sm" [class.active]="showVolumeSummary">
                                📊 {{ (showVolumeSummary ? 'RES.hideVolumes' : 'RES.showVolumes') | translate }}
                            </button>
                            <button type="button" (click)="showMatchesList = !showMatchesList" class="toggle-matches-btn ds-btn ds-btn--secondary ds-btn--sm" [class.active]="showMatchesList">
                                📋 {{ (showMatchesList ? 'RES.hideList' : 'RES.showList') | translate }}
                            </button>
                            <button type="button" (click)="exportResultsOptimized('matches')" class="export-button ds-btn ds-btn--secondary ds-btn--sm" [disabled]="isExporting" [title]="'RES.exportMatchesTitle' | translate">
                                📥 {{ 'RES.exportMatches' | translate }}
                            </button>
                            <button type="button" (click)="exportResultsOptimized('boOnly')" class="export-button ecart-bo-button" [disabled]="isExporting || !filteredBoOnlyCount" [title]="'RES.exportBoGapsTitle' | translate">
                                📥 {{ 'RES.boGaps' | translate }}
                            </button>
                            <button type="button" (click)="exportResultsOptimized('partnerOnly')" class="export-button ecart-partner-button" [disabled]="isExporting || !filteredPartnerOnlyCount" [title]="'RES.exportPartnerGapsTitle' | translate">
                                📥 {{ 'RES.partnerGaps' | translate }}
                            </button>
                        </div>
                        <div class="volume-summary" *ngIf="showVolumeSummary">
                            <h4>📊 {{ 'RES.volumeSummary' | translate }}</h4>
                            <div class="volume-grid">
                                <div class="volume-card">
                                    <div class="volume-label">{{ 'RES.totalVolumeBo' | translate }}</div>
                                    <div class="volume-value ds-num">{{totalVolumeBo | number:'1.0-0'}}</div>
                                </div>
                                <div class="volume-card">
                                    <div class="volume-label">{{ 'RES.totalVolumePartner' | translate }}</div>
                                    <div class="volume-value ds-num">{{totalVolumePartner | number:'1.0-0'}}</div>
                                </div>
                                <div class="volume-card">
                                    <div class="volume-label">{{ 'RES.totalDiff' | translate }}</div>
                                    <div class="volume-value ds-num" [class.positive]="volumeDifference > 0" [class.negative]="volumeDifference < 0">
                                        {{volumeDifference | number:'1.0-0'}}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="matches-list-section" *ngIf="showMatchesList && !isLoadingMatches">
                            <div *ngIf="filteredMatchesCount === 0 && matchesLoaded" class="no-data-message">
                                <p>{{ 'RES.noMatches' | translate }}</p>
                            </div>
                            <div *ngIf="filteredMatchesCount > 0">
                                <div class="pagination-controls">
                                    <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" (click)="prevPage('matches')" [disabled]="matchesPage === 1">{{ 'RES.previous' | translate }}</button>
                                    <span>{{ 'RES.page' | translate }} {{matchesPage}} / {{totalMatchesPages}}</span>
                                    <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" (click)="nextPage('matches')" [disabled]="matchesPage === totalMatchesPages">{{ 'RES.next' | translate }}</button>
                                </div>
                                <div class="match-card" *ngFor="let match of pagedMatches; trackBy: trackByMatchKey">
                            <!-- Fiche des champs clés -->
                            <div class="match-header fiche-header">
                                <div class="fiche-row">
                                    <span class="fiche-label">{{ 'RES.key' | translate }}</span>
                                    <span class="fiche-value">{{match.key}}</span>
                                </div>
                                <div class="fiche-row">
                                    <span class="fiche-label">{{ 'RES.statusLabel' | translate }}</span>
                                    <span class="fiche-value" [class.has-differences]="getCachedHasDifferences(match)">
                                    {{getCachedHasDifferences(match) ? '⚠️ ' + ('RES.diffsDetected' | translate) : '✅ ' + ('RES.perfectMatch' | translate)}}
                                </span>
                            </div>
                                <div class="fiche-row">
                                    <span class="fiche-label">{{ 'RES.amount' | translate }}</span>
                                    <span class="fiche-value">{{match.boData['montant'] || match.partnerData['Crédit'] || match.partnerData['montant']}}</span>
                                        </div>
                                <div class="fiche-row">
                                    <span class="fiche-label">{{ 'RES.dateBo' | translate }}</span>
                                    <span class="fiche-value">{{match.boData['Date']}}</span>
                                    <span class="fiche-label">{{ 'RES.datePartner' | translate }}</span>
                                    <span class="fiche-value">{{match.partnerData['Date']}}</span>
                                        </div>
                                <div class="fiche-row">
                                    <span class="fiche-label">{{ 'RES.agencyColon' | translate }}</span>
                                    <span class="fiche-value">{{getCachedBoAgencyAndService(match).agency}}</span>
                                    <span class="fiche-label">{{ 'RES.serviceColon' | translate }}</span>
                                    <span class="fiche-value">{{getCachedBoAgencyAndService(match).service}}</span>
                                        </div>
                                    </div>
                            <!-- Deux colonnes alignées -->
                            <div class="match-content two-columns">
                                <div class="data-column">
                                    <h4>🏢 {{ 'RES.bo' | translate }}</h4>
                                    <div class="data-grid refined-grid">
                                        <div class="data-row" *ngFor="let key of getCachedBoKeys(match); trackBy: trackByString">
                                            <span class="label">{{key}} :</span>
                                            <span class="value">{{getBoValue(match, key)}}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="data-column">
                                    <h4>🤝 {{ 'RES.partner' | translate }}</h4>
                                    <div class="data-grid refined-grid">
                                        <div class="data-row" *ngFor="let key of getCachedPartnerKeys(match); trackBy: trackByString">
                                            <span class="label">{{key}} :</span>
                                            <span class="value">{{getPartnerValue(match, key)}}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="differences-section" *ngIf="getCachedHasDifferences(match)">
                                <h4>📝 {{ 'RES.diffsSection' | translate }}</h4>
                                <div class="difference-card" *ngFor="let diff of match.differences">
                                    <div class="diff-header">
                                        <span class="column">{{diff.boColumn}} ↔ {{diff.partnerColumn}}</span>
                                    </div>
                                    <div class="diff-values">
                                        <div class="value bo">
                                            <span class="label">{{ 'RES.bo' | translate }} :</span>
                                            <span class="content">{{diff.boValue}}</span>
                                        </div>
                                        <div class="value partner">
                                            <span class="label">{{ 'RES.partner' | translate }} :</span>
                                            <span class="content">{{diff.partnerValue}}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                            </div>
                        </div>
                    </div>

                    <!-- Les écarts BO sont maintenant sur une page séparée -->

                    <!-- ECART Partenaire avec pagination -->
                    <div *ngIf="activeTab === 'partnerOnly'" class="partner-only-section">
                        <!-- Indicateur de chargement avec progression -->
                        <div *ngIf="isLoadingPartnerOnly" class="loading-indicator">
                            <div class="spinner"></div>
                            <div class="loading-progress">
                                <span>{{ 'RES.loadingPartnerGaps' | translate }}</span>
                                <div *ngIf="loadingProgress.partnerOnly.total > 0" class="progress-info">
                                    <div class="progress-bar-mini">
                                        <div class="progress-fill-mini" [style.width.%]="loadingProgress.partnerOnly.percentage"></div>
                                    </div>
                                    <span class="progress-text-mini">
                                        {{loadingProgress.partnerOnly.current | number}} / {{loadingProgress.partnerOnly.total | number}} 
                                        ({{loadingProgress.partnerOnly.percentage}}%)
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="search-section ds-filter-bar" *ngIf="!isLoadingPartnerOnly">
                            <input 
                                type="text" 
                                [(ngModel)]="searchKey" 
                                (input)="onSearch()"
                                [placeholder]="'RES.searchByKey' | translate"
                                class="search-input ds-input"
                            >
                            <button type="button" (click)="showVolumeSummary = !showVolumeSummary" class="toggle-volume-btn ds-btn ds-btn--secondary ds-btn--sm" [class.active]="showVolumeSummary">
                                📊 {{ (showVolumeSummary ? 'RES.hideVolumes' : 'RES.showVolumes') | translate }}
                            </button>
                            <label style="display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" class="ds-checkbox" [checked]="allPartnerSelectedOnPage" (change)="toggleSelectAllPartnerOnPage($event)">
                                <span>{{ 'RES.selectPage' | translate }}</span>
                            </label>
                            <button type="button" (click)="exportResults()" class="export-button ds-btn ds-btn--secondary ds-btn--sm">
                                📥 {{ 'RES.exportPartnerEcarts' | translate }}
                            </button>
                            <button type="button" (click)="saveEcartPartnerToImpactOP()" class="save-button ds-btn ds-btn--primary ds-btn--sm" [disabled]="isSavingEcartPartnerToImpactOP">
                                {{ isSavingEcartPartnerToImpactOP ? '💾 ' + ('RES.saving' | translate) : '💾 ' + ('RES.saveToImportOp' | translate) }}
                            </button>
                        </div>
                        <div class="volume-summary" *ngIf="showVolumeSummary">
                            <h4>📊 {{ 'RES.volumeSummary' | translate }}</h4>
                            <div class="volume-grid">
                                <div class="volume-card">
                                    <div class="volume-label">{{ 'RES.totalVolumePartner' | translate }}</div>
                                    <div class="volume-value ds-num">{{calculateTotalVolumePartnerOnly() | number:'1.0-0'}}</div>
                                </div>
                                <div class="volume-card">
                                    <div class="volume-label">{{ 'RES.txnCount' | translate }}</div>
                                    <div class="volume-value ds-num">{{filteredPartnerOnly.length}}</div>
                                </div>
                            </div>
                        </div>
                        <div *ngIf="filteredPartnerOnlyCount === 0 && partnerOnlyLoaded" class="no-data-message">
                            <p>{{ 'RES.noPartnerGaps' | translate }}</p>
                        </div>
                        <div *ngIf="filteredPartnerOnlyCount > 0">
                            <div class="pagination-controls">
                                <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" (click)="prevPage('partnerOnly')" [disabled]="partnerOnlyPage === 1">{{ 'RES.previous' | translate }}</button>
                                <span>{{ 'RES.page' | translate }} {{partnerOnlyPage}} / {{totalPartnerOnlyPages}}</span>
                                <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" (click)="nextPage('partnerOnly')" [disabled]="partnerOnlyPage === totalPartnerOnlyPages">{{ 'RES.next' | translate }}</button>
                            </div>
                            <div class="unmatched-card" *ngFor="let record of getPagedPartnerOnly(); trackBy: trackByRecordKey">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div style="font-weight:600;color:var(--color-accent);">{{ 'RES.partnerLine' | translate }}</div>
                                    <button type="button" (click)="createOperationFromPartnerRecord(record)" class="save-button ds-btn ds-btn--primary ds-btn--sm" [disabled]="!isPartnerRecordEligible(record)" [title]="'RES.createOp' | translate">➕ {{ 'RES.createOp' | translate }}</button>
                                </div>
                                <label style="display:flex;align-items:center;gap:6px;">
                                    <input type="checkbox" class="ds-checkbox" [checked]="isPartnerRecordSelected(record)" (change)="togglePartnerSelection(record, $event)">
                                    <span>{{ 'RES.select' | translate }}</span>
                                </label>
                            </div>
                            <div class="data-grid">
                                <div class="info-row">
                                    <span class="label">{{ 'RES.volume' | translate }}</span>
                                    <span class="value">{{getPartnerOnlyVolume(record) | number:'1.0-0'}}</span>
                                </div>
                                <div class="info-row">
                                    <span class="label">{{ 'RES.datePlain' | translate }}</span>
                                    <span class="value">{{getPartnerOnlyDate(record)}}</span>
                                </div>
                                <div class="info-row">
                                    <span class="label">{{ 'RES.source' | translate }}</span>
                                    <span class="value" style="display:flex;align-items:center;gap:6px;">
                                        <input type="checkbox" class="ds-checkbox" checked disabled>
                                        {{ record['SOURCE'] || 'PARTENAIRE' }}
                                    </span>
                                </div>
                                <div class="data-row" *ngFor="let key of getPartnerOnlyKeys(record)">
                                    <span class="label">{{key}}:</span>
                                    <span class="value">{{getRecordValue(record, key)}}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section informative en bas -->
            <div class="bottom-info-section" *ngIf="response">
                <div class="info-section-grid">
                    <div class="info-card">
                        <div class="info-card-header">
                            <div class="info-icon">📈</div>
                            <h4>{{ 'RES.matchRate' | translate }}</h4>
                        </div>
                        <div class="info-card-content">
                            <div class="match-rate">
                                <div class="match-rate-value ds-num">{{matchRate | number:'1.1-1'}}%</div>
                                <div class="match-rate-bar">
                                    <div class="match-rate-fill" [style.width.%]="matchRate"></div>
                                </div>
                            </div>
                            <div class="info-details">
                                <span>{{ 'RES.transactionsCount' | translate: { matched: filteredMatchesCount, total: totalTransactions } }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="info-card">
                        <div class="info-card-header">
                            <div class="info-icon">⚖️</div>
                            <h4>{{ 'RES.volumeBalance' | translate }}</h4>
                        </div>
                        <div class="info-card-content">
                            <div class="volume-comparison">
                                <div class="volume-item">
                                    <span class="volume-item-label">{{ 'RES.bo' | translate }}</span>
                                    <span class="volume-item-value ds-num">{{totalVolumeBo | number:'1.0-0'}}</span>
                                </div>
                                <div class="volume-separator">↔</div>
                                <div class="volume-item">
                                    <span class="volume-item-label">{{ 'RES.partner' | translate }}</span>
                                    <span class="volume-item-value ds-num">{{totalVolumePartner | number:'1.0-0'}}</span>
                                </div>
                            </div>
                            <div class="volume-diff" [class.positive]="volumeDifference > 0" [class.negative]="volumeDifference < 0" [class.neutral]="volumeDifference === 0">
                                <span>{{ 'RES.difference' | translate }} {{volumeDifference | number:'1.0-0'}}</span>
                            </div>
                        </div>
                    </div>

                    <div class="info-card">
                        <div class="info-card-header">
                            <div class="info-icon">🔍</div>
                            <h4>{{ 'RES.reconStatus' | translate }}</h4>
                        </div>
                        <div class="info-card-content">
                            <div class="status-indicators">
                                <div class="status-item" [class.has-issues]="filteredBoOnlyCount > 0">
                                    <span class="status-dot"></span>
                                    <span>{{ 'RES.boGapsCount' | translate }} {{filteredBoOnlyCount}}</span>
                                </div>
                                <div class="status-item" [class.has-issues]="filteredPartnerOnlyCount > 0">
                                    <span class="status-dot"></span>
                                    <span>{{ 'RES.partnerGapsCount' | translate }} {{filteredPartnerOnlyCount}}</span>
                                </div>
                                <div class="status-item" [class.success]="filteredMatchesCount > 0">
                                    <span class="status-dot"></span>
                                    <span>{{ 'RES.matchesCount' | translate }} {{filteredMatchesCount}}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="info-card">
                        <div class="info-card-header">
                            <div class="info-icon">💡</div>
                            <h4>{{ 'RES.quickActions' | translate }}</h4>
                        </div>
                        <div class="info-card-content">
                            <div class="quick-actions">
                                <button type="button" class="quick-action-btn ds-btn ds-btn--secondary ds-btn--sm" (click)="goToMatches()" [disabled]="filteredMatchesCount === 0">
                                    ✅ {{ 'RES.matches' | translate }}
                                </button>
                                <button type="button" class="quick-action-btn ds-btn ds-btn--secondary ds-btn--sm" (click)="goToEcartBo()" [disabled]="filteredBoOnlyCount === 0">
                                    ⚠️ {{ 'RES.boGaps' | translate }}
                                </button>
                                <button type="button" class="quick-action-btn ds-btn ds-btn--secondary ds-btn--sm" (click)="goToEcartPartner()" [disabled]="filteredPartnerOnlyCount === 0">
                                    ⚠️ {{ 'RES.partnerGaps' | translate }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="action-buttons">
                <button type="button" class="new-reconciliation-btn ds-btn ds-btn--primary" (click)="nouvelleReconciliation()">
                    🔄 {{ 'RES.newReconciliation' | translate }}
                </button>
                <button type="button" class="stats-btn ds-btn ds-btn--secondary" (click)="goToStats()">
                    📊 {{ 'RES.viewStats' | translate }}
                </button>
            </div>

            <div *ngIf="isExporting" class="export-progress">
                <div class="progress-bar">
                    <div class="progress" [style.width.%]="exportProgressOptimized.percentage"></div>
                </div>
                <div class="progress-text">{{ exportProgressOptimized.message }} - {{ exportProgressOptimized.percentage | number:'1.0-0' }}%</div>
                <div class="progress-details" *ngIf="exportProgressOptimized.total > 0">
                    {{ exportProgressOptimized.current | number }} / {{ exportProgressOptimized.total | number }} {{ 'RES.lines' | translate }}
                </div>
            </div>
        </div>

        <!-- Popup de sélection des colonnes pour l'export -->
        <div *ngIf="showColumnSelector" class="column-selector-overlay">
            <div class="column-selector-popup">
                <div class="popup-header">
                    <h3>📋 {{ 'RES.columnSelectorTitle' | translate }}</h3>
                    <button type="button" (click)="closeColumnSelector()" class="close-btn ds-btn ds-btn--ghost ds-btn--sm">×</button>
                </div>
                
                <div class="popup-content">
                    <div class="selection-controls">
                        <button type="button" (click)="toggleAllColumns(true)" class="select-all-btn ds-btn ds-btn--secondary ds-btn--sm">
                            ✅ {{ 'RES.selectAll' | translate }}
                        </button>
                        <button type="button" (click)="toggleAllColumns(false)" class="deselect-all-btn ds-btn ds-btn--secondary ds-btn--sm">
                            ❌ {{ 'RES.deselectAll' | translate }}
                        </button>
                        <span class="selection-info">
                            {{ 'RES.columnsSelected' | translate: { selected: selectedColumnsCount, total: availableColumns.length } }}
                        </span>
                    </div>
                    
                    <div class="columns-grid">
                        <div *ngFor="let column of availableColumns" class="column-item">
                            <label class="column-checkbox">
                                <input 
                                    type="checkbox"
                                    class="ds-checkbox"
                                    [(ngModel)]="selectedColumns[column]"
                                    [checked]="selectedColumns[column]">
                                <span class="column-name">{{column}}</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="popup-actions">
                    <button type="button" (click)="closeColumnSelector()" class="cancel-btn ds-btn ds-btn--secondary">
                        {{ 'RES.cancel' | translate }}
                    </button>
                    <button type="button" (click)="confirmExportWithSelectedColumns()" class="export-btn ds-btn ds-btn--primary">
                        📥 {{ 'RES.exportSelectedColumns' | translate }}
                    </button>
                </div>
            </div>
        </div>
        </div>
        </div>
    `,
    styles: [`
        .results-page {
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
            z-index: var(--z-sticky);
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
            background: rgba(255, 255, 255, 0.06);
            color: var(--color-nav-text);
        }

        .nav-btn.secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.16);
        }

        .page-header-results {
            background: var(--rd-surface);
            border-bottom: 1px solid var(--rd-border);
            padding: 20px 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }

        .ph-results-left {
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

        .ph-title-results {
            font-family: var(--font-display);
            font-size: 28px;
            font-weight: 400;
            color: var(--rd-text1);
            letter-spacing: -0.02em;
            line-height: 1.2;
            margin: 0;
        }

        .ph-title-results em {
            font-style: italic;
            color: var(--rd-amber);
        }

        .ph-results-right {
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

        .magic-services-panel {
            margin: 0 28px 20px;
            padding: 18px 20px 16px;
            background: var(--rd-surface);
            border: 1px solid var(--rd-border);
            border-radius: var(--rd-r);
            box-shadow: var(--rd-shadow);
        }

        .magic-services-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 14px;
            flex-wrap: wrap;
        }

        .magic-services-intro {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        .magic-services-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 32px;
            height: 32px;
            padding: 0 10px;
            border-radius: 999px;
            background: var(--rd-blue-l);
            color: var(--rd-blue);
            font-size: 13px;
            font-weight: 700;
            flex-shrink: 0;
        }

        .magic-services-title {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            color: var(--rd-text1);
            line-height: 1.3;
        }

        .magic-services-sub {
            margin: 2px 0 0;
            font-size: 12px;
            color: var(--rd-text3);
        }

        .magic-services-nav {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        .magic-nav-btn {
            width: 32px;
            height: 32px;
            border: 1px solid var(--rd-border2);
            border-radius: 8px;
            background: var(--color-surface);
            color: var(--rd-text2);
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }

        .magic-nav-btn:hover:not(:disabled) {
            background: var(--rd-blue-l);
            border-color: var(--rd-blue-m);
            color: var(--rd-blue);
        }

        .magic-nav-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        .magic-nav-counter {
            font-size: 12px;
            font-weight: 600;
            color: var(--rd-text2);
            min-width: 48px;
            text-align: center;
        }

        .magic-report-group-bar {
            display: flex;
            align-items: center;
            gap: 14px;
            flex-wrap: wrap;
            margin: -4px 0 14px;
            padding: 8px 12px;
            border: 1px solid var(--rd-border);
            border-radius: var(--rd-r-sm);
            background: var(--color-surface-sunken);
        }

        .magic-report-group-label {
            font-size: 12px;
            font-weight: 700;
            color: var(--rd-blue);
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }

        .magic-report-group-check {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            font-size: 13px;
            color: var(--rd-text1);
            cursor: pointer;
            user-select: none;
        }

        .magic-report-group-check input[type='checkbox'] {
            accent-color: var(--rd-blue);
            width: 15px;
            height: 15px;
            cursor: pointer;
        }

        .magic-report-group-count {
            font-size: 12px;
            font-weight: 600;
            color: var(--rd-text2);
            margin-left: auto;
        }

        .magic-services-tabs {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: thin;
        }

        .magic-services-tabs::-webkit-scrollbar {
            height: 6px;
        }

        .magic-services-tabs::-webkit-scrollbar-thumb {
            background: var(--rd-border2);
            border-radius: 999px;
        }

        .magic-service-tab {
            flex: 0 0 auto;
            min-width: 220px;
            max-width: 320px;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 14px 16px;
            border: 1.5px solid var(--rd-border);
            border-radius: var(--rd-r-sm);
            background: var(--color-surface);
            cursor: pointer;
            text-align: left;
            transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s, background 0.15s;
            font-family: inherit;
        }

        .magic-service-tab:hover {
            border-color: var(--rd-blue-m);
            box-shadow: 0 4px 14px rgba(30, 74, 122, 0.08);
        }

        .magic-service-tab.active {
            border-color: var(--rd-blue);
            background: linear-gradient(180deg, var(--rd-blue-l) 0%, var(--color-surface) 100%);
            box-shadow: 0 6px 20px rgba(30, 74, 122, 0.12);
        }

        .magic-service-tab .tab-rail {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .magic-service-tab .tab-index {
            flex-shrink: 0;
            width: 22px;
            height: 22px;
            border-radius: 6px;
            background: var(--rd-border);
            color: var(--rd-text2);
            font-size: 11px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .magic-service-tab.active .tab-index {
            background: var(--rd-blue);
            color: var(--color-nav-text);
        }

        .magic-service-tab .tab-report-check {
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .magic-service-tab .tab-report-box {
            width: 18px;
            height: 18px;
            border: 1.5px solid var(--rd-border2);
            border-radius: 5px;
            background: var(--color-surface);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: border-color 0.15s, background 0.15s;
        }

        .magic-service-tab .tab-report-box:hover {
            border-color: var(--rd-blue-m);
        }

        .magic-service-tab.report-selected .tab-report-box {
            border-color: var(--rd-blue);
            background: var(--rd-blue);
        }

        .magic-service-tab .tab-report-tick {
            color: var(--color-nav-text);
            font-size: 12px;
            line-height: 1;
            font-weight: 700;
        }

        .magic-service-tab.report-selected {
            border-color: var(--rd-blue);
            box-shadow: 0 0 0 1px var(--rd-blue-m);
        }

        .magic-service-tab .tab-name {
            font-size: 13px;
            font-weight: 700;
            color: var(--rd-text1);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .magic-service-tab .tab-metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
        }

        .magic-service-tab .metric {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 6px 8px;
            border-radius: 8px;
            background: var(--rd-surface);
            border: 1px solid var(--rd-border);
            min-width: 0;
        }

        .magic-service-tab .metric-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--rd-text3);
        }

        .magic-service-tab .metric-value {
            font-size: 14px;
            font-weight: 700;
            line-height: 1.2;
        }

        .magic-service-tab .metric-match .metric-value { color: var(--rd-green); }
        .magic-service-tab .metric-bo .metric-value { color: var(--rd-amber); }
        .magic-service-tab .metric-partner .metric-value { color: var(--rd-blue); }

        .magic-partners-row {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 14px;
        }

        .magic-partners-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--rd-text3);
        }

        .magic-partners-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .magic-partner-tab {
            max-width: 280px;
            padding: 8px 12px;
            border: 1.5px solid var(--rd-border);
            border-radius: 8px;
            background: var(--color-surface);
            font-size: 12px;
            font-weight: 600;
            color: var(--rd-text2);
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-family: inherit;
            transition: border-color 0.15s, background 0.15s;
        }

        .magic-partner-tab:hover {
            border-color: var(--rd-blue-m);
        }

        .magic-partner-tab.active {
            border-color: var(--rd-blue);
            background: var(--rd-blue-l);
            color: var(--rd-blue);
        }

        .main {
            padding: 28px 28px 60px;
            width: 100%;
            flex: 1;
            position: relative;
            box-sizing: border-box;
        }

        .results-container {
            padding: 24px;
            width: 100%;
            min-height: 100vh;
            box-sizing: border-box;
        }

        .summary-section {
            background: linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-sunken) 100%);
            border-radius: 16px;
            padding: 28px;
            margin-bottom: 32px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .summary-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .summary-header h3 {
            margin: 0;
            color: var(--color-text-primary);
        }

        .report-button {
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            border: none;
            border-radius: 6px;
            padding: 10px 16px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(var(--theme-primary-rgb), 0.3);
        }

        .report-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(var(--theme-primary-rgb), 0.4);
            background: linear-gradient(135deg, var(--color-accent-hover) 0%, var(--color-accent-hover) 100%);
        }

        .report-button:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(var(--theme-primary-rgb), 0.3);
        }

        /* Styles pour la popup de sélection des colonnes */
        .column-selector-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: var(--z-nav);
        }

        .column-selector-popup {
            background: var(--color-surface);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }

        .popup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid var(--color-border);
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            border-radius: 12px 12px 0 0;
        }

        .popup-header h3 {
            margin: 0;
            font-size: 1.2rem;
        }

        .close-btn {
            background: none;
            border: none;
            color: var(--color-accent-contrast);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.3s;
        }

        .close-btn:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }

        .popup-content {
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        }

        .selection-controls {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .select-all-btn, .deselect-all-btn {
            padding: 8px 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s;
        }

        .select-all-btn {
            background-color: var(--color-success-solid);
            color: var(--color-accent-contrast);
        }

        .select-all-btn:hover {
            background-color: var(--color-success-solid);
        }

        .deselect-all-btn {
            background-color: var(--color-error-solid);
            color: var(--color-accent-contrast);
        }

        .deselect-all-btn:hover {
            background-color: var(--color-error-solid);
        }

        .selection-info {
            color: var(--color-text-muted);
            font-size: 0.9rem;
            margin-left: auto;
        }

        .columns-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 10px;
            max-height: 300px;
            overflow-y: auto;
        }

        .column-item {
            border: 1px solid var(--color-border);
            border-radius: 8px;
            padding: 12px;
            background: var(--color-surface-sunken);
            transition: all 0.3s;
        }

        .column-item:hover {
            background: var(--color-surface-sunken);
            border-color: var(--color-accent);
        }

        .column-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            width: 100%;
        }

        .column-checkbox input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: var(--color-accent);
        }

        .column-name {
            flex: 1;
            font-weight: 500;
            color: var(--color-text-primary);
        }

        .default-badge {
            background: var(--color-accent);
            color: var(--color-accent-contrast);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 500;
        }

        .popup-actions {
            padding: 20px;
            border-top: 1px solid var(--color-border);
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .cancel-btn, .export-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: all 0.3s;
        }

        .cancel-btn {
            background-color: var(--color-surface-sunken);
            color: var(--color-text-muted);
            border: 1px solid var(--color-border);
        }

        .cancel-btn:hover {
            background-color: var(--color-border);
        }

        .export-btn {
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            box-shadow: 0 2px 4px rgba(var(--theme-primary-rgb), 0.3);
        }

        .export-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(var(--theme-primary-rgb), 0.4);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 20px;
            margin-top: 24px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--color-surface);
            padding: 28px 24px;
            border-radius: 16px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            transition: all 0.3s ease;
            border: 1px solid rgba(0, 0, 0, 0.05);
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
        }

        .stat-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .stat-card-total::before {
            background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
        }

        .stat-card-matched::before {
            background: linear-gradient(90deg, var(--color-success) 0%, var(--color-success-solid) 100%);
        }

        .stat-card-bo::before {
            background: linear-gradient(90deg, var(--color-warning-solid) 0%, var(--color-warning-solid) 100%);
        }

        .stat-card-partner::before {
            background: linear-gradient(90deg, var(--color-error) 0%, var(--color-error-solid) 100%);
        }

        .stat-icon {
            font-size: 2.5em;
            margin-bottom: 12px;
            display: block;
        }

        .stat-value {
            font-size: 2.8em;
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 8px;
            line-height: 1.2;
        }

        .stat-card-total .stat-value {
            color: var(--color-accent);
        }

        .stat-card-matched .stat-value {
            color: var(--color-success);
        }

        .stat-card-bo .stat-value {
            color: var(--color-warning-solid);
        }

        .stat-card-partner .stat-value {
            color: var(--color-error);
        }

        .stat-label {
            color: var(--color-text-muted);
            font-size: 1em;
            font-weight: 500;
            line-height: 1.4;
            margin-top: 8px;
        }

        .results-tabs {
            background: var(--color-surface);
            border-radius: 16px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            overflow: hidden;
            margin-bottom: 32px;
            border: 1px solid rgba(0, 0, 0, 0.05);
            min-height: 400px;
        }

        .tab-content {
            min-height: 300px;
            width: 100%;
            box-sizing: border-box;
        }

        .matches-section, .partner-only-section {
            width: 100%;
            padding: 20px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .tab-buttons {
            display: flex;
            gap: 15px;
            padding: 10px;
            background: var(--color-surface-sunken);
            border-bottom: 1px solid var(--color-border);
        }

        .tab-buttons button {
            padding: 15px 25px;
            border: none;
            background: none;
            cursor: pointer;
            font-size: 1em;
            color: var(--color-text-muted);
            transition: all 0.3s ease;
        }

        .tab-buttons button.active {
            background: var(--color-accent);
            color: var(--color-accent-contrast);
        }

        .matches-button {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%) !important;
            color: var(--color-accent-contrast) !important;
            font-weight: 600;
            border-radius: 6px;
            transition: all 0.3s ease;
        }

        .matches-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(40, 167, 69, 0.4);
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%) !important;
        }

        .ecart-bo-button {
            background: linear-gradient(135deg, var(--color-warning-solid) 0%, var(--color-warning-solid) 100%) !important;
            color: var(--color-accent-contrast) !important;
            font-weight: 600;
            border-radius: 6px;
            transition: all 0.3s ease;
        }

        .ecart-bo-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(255, 152, 0, 0.4);
            background: linear-gradient(135deg, var(--color-warning-solid) 0%, var(--color-warning-solid) 100%) !important;
        }

        .ecart-partner-button {
            background: linear-gradient(135deg, var(--color-error) 0%, var(--color-error-solid) 100%) !important;
            color: var(--color-accent-contrast) !important;
            font-weight: 600;
            border-radius: 6px;
            transition: all 0.3s ease;
        }

        .ecart-partner-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(220, 53, 69, 0.4);
            background: linear-gradient(135deg, var(--color-error-solid) 0%, var(--color-error-solid) 100%) !important;
        }

        .report-button {
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%) !important;
            color: var(--color-accent-contrast) !important;
            font-weight: 600;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .report-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }

        .report-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none !important;
        }

        .tab-content {
            padding: 20px;
            max-height: 600px;
            overflow-y: auto;
        }

        .matches-section, .unmatched-section {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .match-card, .unmatched-card {
            background: var(--color-surface-sunken);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid var(--color-border);
            width: 100%;
            box-sizing: border-box;
            margin-bottom: 16px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            transition: all 0.3s ease;
        }

        .match-card:hover, .unmatched-card:hover {
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            transform: translateY(-2px);
        }

        .match-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--color-border);
        }

        .key {
            font-weight: bold;
            color: var(--color-accent);
        }

        .status {
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.9em;
        }

        .status.has-differences {
            background: var(--color-surface)3cd;
            color: var(--color-warning-text);
        }

        .match-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .data-column h4 {
            margin: 0 0 10px;
            color: var(--color-accent);
        }

        .data-grid {
            display: grid;
            gap: 8px;
        }

        .data-row {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
        }

        .label {
            color: var(--color-text-muted);
            font-weight: 500;
        }

        .differences-section {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid var(--color-border);
        }

        .differences-section h4 {
            margin: 0 0 10px;
            color: var(--color-error);
        }

        .difference-card {
            background: var(--color-surface)3cd;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
        }

        .diff-header {
            font-weight: bold;
            margin-bottom: 5px;
            color: var(--color-warning-text);
        }

        .diff-values {
            display: grid;
            gap: 5px;
        }

        .value {
            display: grid;
            grid-template-columns: 80px 1fr;
            gap: 10px;
        }

        .value .label {
            font-weight: bold;
        }

        .export-section {
            margin-top: 30px;
            text-align: center;
            display: flex;
            justify-content: center;
            gap: 20px;
        }

        .export-btn, .new-reco-btn {
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 1.1em;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .export-btn {
            background: linear-gradient(45deg, var(--color-accent), var(--color-accent-hover));
            color: var(--color-accent-contrast);
            border: none;
        }

        .export-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(33, 150, 243, 0.3);
        }

        .new-reco-btn {
            background: var(--color-surface-sunken);
            color: var(--color-accent-hover);
            border: 1px solid var(--color-accent-hover);
        }

        .new-reco-btn:hover {
            background: var(--color-accent-hover);
            color: var(--color-accent-contrast);
        }

        .pagination-controls {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .volume-summary {
            background: linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-sunken) 100%);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            border: 1px solid rgba(0, 0, 0, 0.05);
            animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .volume-summary h4 {
            margin: 0 0 16px 0;
            color: var(--color-text-primary);
            font-size: 1.1em;
            font-weight: 600;
        }

        .volume-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 10px;
        }

        .volume-card {
            background: var(--color-surface);
            padding: 18px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
            transition: all 0.3s ease;
            border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .volume-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        .volume-label {
            color: var(--color-text-muted);
            font-size: 0.9em;
            margin-bottom: 5px;
        }

        .volume-value {
            font-size: 1.2em;
            font-weight: bold;
            color: var(--color-accent);
        }

        .volume-value.positive {
            color: var(--color-success-solid);
        }

        .volume-value.negative {
            color: var(--color-error-solid);
        }

        .search-section {
            margin-bottom: 20px;
        }

        .search-input {
            flex: 1;
            padding: 12px 18px;
            border: 2px solid var(--color-border);
            border-radius: 10px;
            font-size: 1em;
            transition: all 0.3s ease;
            background: var(--color-surface);
        }

        .search-input:focus {
            outline: none;
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(var(--theme-primary-rgb), 0.15);
        }

        .agency-service-info {
            background: var(--color-info-bg);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 15px;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }

        .info-row:last-child {
            margin-bottom: 0;
        }

        .info-row .label {
            font-weight: bold;
            color: var(--color-accent-hover);
        }

        .info-row .value {
            color: var(--color-text-primary);
        }

        .agency-summary-section {
            padding: 20px;
            background: var(--color-surface);
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .summary-header {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--color-border);
        }

        .summary-header h3 {
            color: var(--color-accent-hover);
            margin: 0 0 15px 0;
            font-size: 1.4em;
        }

        .summary-actions {
            margin-bottom: 15px;
            text-align: right;
        }

        .summary-stats {
            display: flex;
            gap: 30px;
            margin-top: 15px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .stat-item .label {
            color: var(--color-text-muted);
            font-weight: 500;
        }

        .stat-item .value {
            font-size: 1.2em;
            font-weight: bold;
            color: var(--color-accent-hover);
        }

        .summary-table {
            margin: 20px 0;
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-surface);
        }

        th {
            background: var(--color-surface-sunken);
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
            color: var(--color-text-muted);
            border-bottom: 2px solid var(--color-border);
        }

        td {
            padding: 12px 15px;
            border-bottom: 1px solid var(--color-border);
        }

        .volume-cell {
            text-align: right;
            font-weight: 500;
            color: var(--color-accent-hover);
        }

        .count-cell {
            text-align: center;
            font-weight: 500;
        }

        tbody tr:hover {
            background-color: var(--color-surface-sunken);
        }

        .pagination-controls {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 15px;
            margin-top: 20px;
        }

        .pagination-controls button {
            padding: 8px 16px;
            border: 1px solid var(--color-border);
            background: var(--color-surface);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .pagination-controls button:hover:not(:disabled) {
            background: var(--color-accent-hover);
            color: var(--color-accent-contrast);
            border-color: var(--color-accent-hover);
        }

        .pagination-controls button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .pagination-controls span {
            color: var(--color-text-muted);
        }

        .summary-tables-row {
            display: flex;
            gap: 40px;
            margin-bottom: 20px;
        }
        .summary-table-agency, .summary-table-service {
            flex: 1;
        }
        .summary-table-agency table, .summary-table-service table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-surface-sunken);
        }
        .summary-table-agency th, .summary-table-service th {
            background: var(--color-info-bg);
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            color: var(--color-accent-hover);
            border-bottom: 2px solid var(--color-border);
        }
        .summary-table-agency td, .summary-table-service td {
            padding: 8px 10px;
            border-bottom: 1px solid var(--color-border);
        }

        .non-matching-summary {
            margin-top: 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .non-matching-section {
            background: var(--color-surface);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .non-matching-section h4 {
            color: var(--color-accent-hover);
            margin: 0 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--color-border);
        }

        .non-matching-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .non-matching-item {
            background: var(--color-surface-sunken);
            border-radius: 6px;
            padding: 10px;
            border: 1px solid var(--color-border);
        }

        .item-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-weight: 500;
        }

        .item-details {
            font-size: 0.9em;
            color: var(--color-text-muted);
        }

        .detail-item {
            display: block;
            margin: 2px 0;
        }

        .view-more {
            text-align: center;
            margin-top: 10px;
            display: flex;
            justify-content: center;
            gap: 10px;
        }

        .view-more button {
            background: var(--color-info-bg);
            color: var(--color-accent-hover);
            border: 1px solid var(--color-accent-hover);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .view-more button:hover {
            background: var(--color-accent-hover);
            color: var(--color-accent-contrast);
        }

        .view-more .export-btn {
            background: var(--color-success-solid);
            color: var(--color-accent-contrast);
            border-color: var(--color-success-solid);
        }

        .view-more .export-btn:hover {
            background: var(--color-success-solid);
            border-color: var(--color-success-solid);
        }

        .agency {
            color: var(--color-accent-hover);
            font-weight: 500;
        }

        .service {
            color: var(--color-text-muted);
        }

        .volume {
            color: var(--color-success-solid);
            font-weight: 500;
        }

        .date {
            color: var(--color-text-muted);
            font-size: 0.9em;
        }

        .reconcile-button {
            padding: 0.5rem 1rem;
            background-color: var(--color-info-solid);
            color: var(--color-accent-contrast);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
            transition: background-color 0.2s;
        }

        .reconcile-button:hover {
            background-color: var(--color-info-solid);
        }

        .save-button {
            background-color: var(--color-success-solid);
            color: var(--color-accent-contrast);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.3s;
        }

        .save-button:hover {
            background-color: var(--color-success-solid);
        }

        .save-button:active {
            background-color: var(--color-success-solid);
        }

        .refined-info {
            background: var(--color-surface-sunken);
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 8px;
            display: flex;
            gap: 24px;
            font-weight: 500;
        }
        .refined-info .info-row {
            margin-bottom: 0;
        }
        .refined-grid .data-row {
            padding: 2px 0;
        }

        .date-selector {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-right: 15px;
        }

        .date-selector label {
            font-weight: 500;
            color: var(--color-text-muted);
        }

        .date-selector input {
            padding: 8px;
            border: 1px solid var(--color-border);
            border-radius: 4px;
        }

        .summary-actions {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Section informative en bas */
        .bottom-info-section {
            margin-top: 40px;
            margin-bottom: 30px;
            padding: 30px;
            background: linear-gradient(135deg, var(--color-surface-sunken) 0%, var(--color-surface-sunken) 100%);
            border-radius: 16px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            width: 100%;
            box-sizing: border-box;
        }

        .info-section-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            width: 100%;
        }

        .info-card {
            background: var(--color-surface);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            transition: all 0.3s ease;
            border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .info-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .info-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--color-surface-sunken);
        }

        .info-icon {
            font-size: 1.8em;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            border-radius: 12px;
            color: var(--color-accent-contrast);
        }

        .info-card-header h4 {
            margin: 0;
            font-size: 1.1em;
            font-weight: 600;
            color: var(--color-text-primary);
        }

        .info-card-content {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .match-rate {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .match-rate-value {
            font-size: 2.2em;
            font-weight: 700;
            color: var(--color-success);
            text-align: center;
        }

        .match-rate-bar {
            width: 100%;
            height: 12px;
            background: var(--color-surface-sunken);
            border-radius: 6px;
            overflow: hidden;
        }

        .match-rate-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            border-radius: 6px;
            transition: width 0.5s ease;
        }

        .info-details {
            text-align: center;
            color: var(--color-text-muted);
            font-size: 0.9em;
        }

        .volume-comparison {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 16px;
            background: var(--color-surface-sunken);
            border-radius: 8px;
        }

        .volume-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            flex: 1;
        }

        .volume-item-label {
            font-size: 0.85em;
            color: var(--color-text-muted);
            font-weight: 500;
        }

        .volume-item-value {
            font-size: 1.5em;
            font-weight: 700;
            color: var(--color-accent);
        }

        .volume-separator {
            font-size: 1.5em;
            color: var(--color-accent);
            font-weight: bold;
        }

        .volume-diff {
            text-align: center;
            padding: 10px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.95em;
        }

        .volume-diff.positive {
            background: var(--color-success-bg);
            color: var(--color-success-text);
        }

        .volume-diff.negative {
            background: var(--color-error-bg);
            color: var(--color-error-text);
        }

        .volume-diff.neutral {
            background: var(--color-neutral-bg);
            color: var(--color-neutral-text);
        }

        .status-indicators {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            border-radius: 6px;
            background: var(--color-surface-sunken);
            transition: all 0.3s ease;
        }

        .status-item.has-issues {
            background: var(--color-surface)3cd;
            border-left: 3px solid var(--color-warning-solid);
        }

        .status-item.success {
            background: var(--color-success-bg);
            border-left: 3px solid var(--color-success);
        }

        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--color-text-muted);
            flex-shrink: 0;
        }

        .status-item.has-issues .status-dot {
            background: var(--color-warning-solid);
        }

        .status-item.success .status-dot {
            background: var(--color-success);
        }

        .status-item span:last-child {
            flex: 1;
            font-size: 0.9em;
            color: var(--color-text-primary);
        }

        .quick-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .quick-action-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: 500;
            transition: all 0.3s ease;
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            text-align: left;
        }

        .quick-action-btn:hover:not(:disabled) {
            transform: translateX(4px);
            box-shadow: 0 4px 8px rgba(var(--theme-primary-rgb), 0.3);
        }

        .quick-action-btn:disabled {
            background: var(--color-surface-sunken);
            color: var(--color-text-muted);
            cursor: not-allowed;
            transform: none;
        }

        .action-buttons {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-top: 30px;
            margin-bottom: 20px;
        }

        .export-btn, .new-reconciliation-btn, .stats-btn {
            padding: 14px 28px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 1em;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .export-btn:hover, .new-reconciliation-btn:hover, .stats-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .export-btn {
            background: var(--color-accent);
            color: var(--color-accent-contrast);
        }

        .export-btn:hover {
            background: var(--color-accent-hover);
        }


        .new-reconciliation-btn {
            background: var(--color-success-solid);
            color: var(--color-accent-contrast);
        }

        .new-reconciliation-btn:hover {
            background: var(--color-success-solid);
        }

        .stats-btn {
            background: var(--color-warning-solid);
            color: var(--color-accent-contrast);
        }

        .stats-btn:hover {
            background: var(--color-warning-solid);
        }

        .export-btn:disabled, .new-reconciliation-btn:disabled, .stats-btn:disabled {
            background: var(--color-border-emphasis);
            cursor: not-allowed;
        }

        .export-button {
            background-color: var(--color-success-solid);
            color: var(--color-accent-contrast);
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background-color 0.3s;
        }

        .export-button:hover {
            background-color: var(--color-success-solid);
        }

        .export-button:active {
            background-color: var(--color-success-solid);
        }

        .search-section {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            padding: 16px;
            background: linear-gradient(135deg, var(--color-surface-sunken) 0%, var(--color-surface) 100%);
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            border: 1px solid rgba(0, 0, 0, 0.05);
            flex-wrap: wrap;
        }

        .toggle-volume-btn {
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            padding: 10px 18px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(var(--theme-primary-rgb), 0.3);
            white-space: nowrap;
        }

        .toggle-volume-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(var(--theme-primary-rgb), 0.4);
            background: linear-gradient(135deg, var(--color-accent-hover) 0%, var(--color-accent-hover) 100%);
        }

        .toggle-volume-btn.active {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);
        }

        .toggle-volume-btn.active:hover {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            box-shadow: 0 4px 8px rgba(40, 167, 69, 0.4);
        }

        .toggle-matches-btn {
            background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            color: var(--color-accent-contrast);
            padding: 10px 18px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
            white-space: nowrap;
        }

        .toggle-matches-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(33, 150, 243, 0.4);
            background: linear-gradient(135deg, var(--color-accent-hover) 0%, var(--color-info-solid) 100%);
        }

        .toggle-matches-btn.active {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);
        }

        .toggle-matches-btn.active:hover {
            background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-solid) 100%);
            box-shadow: 0 4px 8px rgba(40, 167, 69, 0.4);
        }

        .matches-list-section {
            animation: slideDown 0.3s ease-out;
            width: 100%;
        }

        .export-progress {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--color-surface);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: var(--z-nav);
            text-align: center;
        }

        .progress-bar {
            width: 300px;
            height: 20px;
            background-color: var(--color-surface-sunken);
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 10px;
        }

        .progress {
            height: 100%;
            background-color: var(--color-success-solid);
            transition: width 0.3s ease;
        }

        .progress-text {
            font-size: 14px;
            color: var(--color-text-muted);
        }

        /* Styles pour les doublons TSOP */
        .tsop-duplicate {
            background-color: var(--color-error-solid) !important;
            color: var(--color-accent-contrast) !important;
            font-weight: bold;
        }

        .tsop-duplicate td {
            background-color: var(--color-error-solid) !important;
            color: var(--color-accent-contrast) !important;
            border-color: var(--color-error-solid) !important;
        }

        /* Styles pour IMPACT sans FRAIS */
        .tsop-sans-frais {
            background-color: var(--color-warning-bg) !important;
            color: var(--color-text-primary) !important;
            font-weight: bold;
        }

        .tsop-sans-frais td {
            background-color: var(--color-warning-bg) !important;
            color: var(--color-text-primary) !important;
            border-color: var(--color-warning-solid) !important;
        }

        .tsop-comment {
            font-weight: bold;
            text-align: center;
        }

        /* Styles pour les indicateurs de chargement */
        .loading-indicator {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            gap: 16px;
            color: var(--color-accent);
            font-size: 1.1em;
            font-weight: 500;
        }

        .loading-progress {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            width: 100%;
            max-width: 400px;
        }

        .progress-info {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .progress-bar-mini {
            width: 100%;
            height: 8px;
            background-color: var(--color-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill-mini {
            height: 100%;
            background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
            border-radius: 4px;
            transition: width 0.3s ease;
        }

        .progress-text-mini {
            font-size: 0.9em;
            color: var(--color-text-muted);
            text-align: center;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid var(--color-surface-sunken);
            border-top: 4px solid var(--color-accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .no-data-message {
            text-align: center;
            padding: 40px;
            color: var(--color-text-muted);
            font-size: 1.1em;
        }
    `]
})
export class ReconciliationResultsComponent implements OnInit, OnDestroy {
    response: ReconciliationResponse | null = null;
    private subscription = new Subscription();
    activeTab: 'matches' | 'boOnly' | 'partnerOnly' | 'agencySummary' = 'matches';
    matchesPage = 1;
    boOnlyPage = 1;
    partnerOnlyPage = 1;
    readonly pageSize = 5;
    searchKey: string = '';
    filteredMatches: Match[] = [];
    filteredBoOnly: Record<string, string>[] = [];
    filteredPartnerOnly: Record<string, string>[] = [];
    
    // Propriétés pour le chargement à la demande (Lazy Loading)
    private currentJobId: string | null = null;
    matchesLoaded: boolean = false;
    boOnlyLoaded: boolean = false;
    partnerOnlyLoaded: boolean = false;
    isLoadingMatches: boolean = false;
    isLoadingBoOnly: boolean = false;
    isLoadingPartnerOnly: boolean = false;
    
    // Cache pour éviter les recalculs
    private matchesCache: Match[] | null = null;
    private boOnlyCache: Record<string, string>[] | null = null;
    private partnerOnlyCache: Record<string, string>[] | null = null;
    private cacheKey: string | null = null;
    
    // Prévention des doublons : un seul chargement à la fois par onglet
    private loadingPromises: Map<string, Promise<any>> = new Map();
    
    // Feedback utilisateur : progression en temps réel
    loadingProgress: {
        matches: { current: number; total: number; percentage: number };
        boOnly: { current: number; total: number; percentage: number };
        partnerOnly: { current: number; total: number; percentage: number };
    } = {
        matches: { current: 0, total: 0, percentage: 0 },
        boOnly: { current: 0, total: 0, percentage: 0 },
        partnerOnly: { current: 0, total: 0, percentage: 0 }
    };
    
    // Configuration du traitement par chunks
    private readonly CHUNK_SIZE = 5000; // Taille des chunks pour le chargement réseau (moins d'appels API = chargement plus rapide)
    private readonly PROCESSING_CHUNK_SIZE = 500;
    private readonly YIELD_INTERVAL = 8; // Yield court pour garder l'UI réactive
    
    // Finalisation écarts BO : les deux flux (boOnly + mismatches) chargent en parallèle
    private boOnlyChunkedDone = false;
    private mismatchesChunkedDone = false;
    
    agencyPage = 1;
    readonly agencyPageSize = 10;
    selectedService: string = '';
    magicServiceSummaries: MagicServiceSummary[] = [];
    magicPartnerFileNames: string[] = [];
    selectedMagicPartnerFile: string = '';
    selectedMagicService: string = '';
    reportSelectedServices: string[] = [];
    selectedDate: string = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Cache pour optimiser les performances
    private agencyServiceCache = new Map<string, { agency: string; service: string; volume: number; date: string; country: string }>();
    isSaving: boolean = false;
    isSavingEcartBo: boolean = false;
    
    isSavingEcartPartner: boolean = false;
    isSavingEcartBoToTrxSf: boolean = false;
    isSavingEcartPartnerToTrxSf: boolean = false;
    isSavingEcartPartnerToImpactOP: boolean = false;
    selectedPartnerImportOpDate: string | null = null;
    exportProgress = 0;
    isExporting = false;
    
    // Propriétés pour l'export optimisé
    exportProgressOptimized: ExportProgress = {
        current: 0,
        total: 0,
        percentage: 0,
        message: '',
        isComplete: false
    };
    private exportOptimizedProgressSub?: Subscription;
    
    // Propriétés pour la progression de la réconciliation
    showProgress = false;
    progressPercentage = 0;
    processedRecords = 0;
    totalRecords = 0;
    executionTime = 0;
    startTime = 0;
    
    // Propriétés pour la sélection des colonnes
    showColumnSelector = false;
    availableColumns: string[] = [];
    selectedColumns: { [key: string]: boolean } = {};
    defaultColumns = ['Service', 'téléphone client', 'montant', 'Agence', 'Date', 'HEURE', 'SOURCE'];
    
    // Propriété pour afficher/masquer le résumé des volumes
    showVolumeSummary = false;

    // Propriété pour afficher/masquer la liste des correspondances (false par défaut - masquée)
    showMatchesList = false;
    
    // Propriétés calculées pour éviter les recalculs dans le template (optimisation performance)
    filteredMatchesCount: number = 0;
    filteredBoOnlyCount: number = 0;
    filteredPartnerOnlyCount: number = 0;
    totalMatchesPages: number = 1;
    totalBoOnlyPages: number = 1;
    totalPartnerOnlyPages: number = 1;
    
    // Cache pour les volumes calculés (évite les recalculs coûteux)
    private cachedTotalVolumeBo: number | null = null;
    private cachedTotalVolumePartner: number | null = null;
    private cachedVolumeDifference: number | null = null;
    private isCalculatingVolumes: boolean = false;
    
    // Propriétés publiques pour le template (évite les appels de fonctions)
    totalVolumeBo: number = 0;
    totalVolumePartner: number = 0;
    volumeDifference: number = 0;
    
    // Cache pour les statistiques (évite les appels répétés depuis le template)
    private cachedTotalTransactions: number | null = null;
    private cachedMatchRate: number | null = null;
    totalTransactions: number = 0; // Propriété publique pour le template
    matchRate: number = 0; // Propriété publique pour le template
    
    // Propriétés paginées pour éviter les appels répétés dans le template
    pagedMatches: Match[] = [];
    pagedBoOnly: Record<string, string>[] = [];
    pagedPartnerOnly: Record<string, string>[] = [];
    
    // Cache pour les clés de chaque match (évite les recalculs dans *ngFor)
    private matchKeysCache = new Map<string, { boKeys: string[]; partnerKeys: string[]; hasDifferences: boolean }>();
    
    // Flag pour éviter les recalculs pendant l'initialisation
    private isInitializing: boolean = false;
    
    // Flag pour éviter les appels multiples de updateKeysCache
    private isUpdatingKeysCache: boolean = false;
    private keysCacheUpdatePromise: Promise<void> | null = null;

    // Mémoïsation par référence d'enregistrement (WeakMap) : une même ligne n'est jamais modifiée
    // en mémoire, on évite de refaire fixGarbledCharacters + filtrage de colonnes + extraction
    // volume/date à chaque détection de changement. Les WeakMap sont nettoyés automatiquement
    // quand les anciens enregistrements deviennent inaccessibles (nouvelle réconciliation).
    private filteredKeysCache = new WeakMap<object, Partial<{ bo: string[]; partner: string[] }>>();
    private originalKeyCache = new WeakMap<object, Map<string, string>>();
    private partnerOnlyVolumeCache = new WeakMap<object, number>();
    private partnerOnlyDateCache = new WeakMap<object, string>();

    // Ajout pour sélection Résumé par Agence
    selectedAgencySummaries: string[] = [];
    get allAgencySelected(): boolean {
        return this.getPagedAgencySummary().length > 0 && this.getPagedAgencySummary().every(s => this.isAgencySelected(s));
    }
    isAgencySelected(summary: any): boolean {
        return this.selectedAgencySummaries.includes(this.getAgencyKey(summary));
    }
    toggleAgencySelection(summary: any, event: any): void {
        const key = this.getAgencyKey(summary);
        if (event.target.checked) {
            if (!this.selectedAgencySummaries.includes(key)) {
                this.selectedAgencySummaries.push(key);
            }
        } else {
            this.selectedAgencySummaries = this.selectedAgencySummaries.filter(sel => sel !== key);
        }
    }
    toggleSelectAllAgency(event: any): void {
        const pageKeys = this.getPagedAgencySummary().map(s => this.getAgencyKey(s));
        if (event.target.checked) {
            this.selectedAgencySummaries = Array.from(new Set([...this.selectedAgencySummaries, ...pageKeys]));
        } else {
            this.selectedAgencySummaries = this.selectedAgencySummaries.filter(sel => !pageKeys.includes(sel));
        }
    }
    saveSelectedAgency(): void {
        // Récupérer tous les résumés (toutes pages si besoin)
        const allSummaries = this.getAgencySummary();
        const selected = allSummaries.filter(s => this.selectedAgencySummaries.includes(this.getAgencyKey(s)));
        // Ici, tu peux appeler une API ou autre logique
    }

    // Sélection pour ECART BO
    selectedBoOnlyKeys: string[] = [];
    private getBoOnlyKey(record: Record<string, string>): string {
        const parts = [
            this.getFromRecord(record, ['CLE', 'clé de réconciliation', 'cle_reconciliation', 'reconciliation_key', 'Key', 'key', 'ID', 'id']),
            this.getFromRecord(record, ['ID Opération', 'ID Operation', 'id_operation', 'idOperation', 'ID OPERATION']),
            this.getFromRecord(record, ['Numéro Trans GU', 'Numero Trans GU', 'numeroTransGU', 'numero_trans_gu']),
            this.getFromRecord(record, ['Référence', 'Reference', 'reference']),
            this.getFromRecord(record, ['Date opération', 'Date', 'dateOperation', 'date_operation', 'DATE']),
            this.getFromRecord(record, ['Montant', 'montant', 'amount', 'Amount', 'volume', 'Volume']),
            this.getFromRecord(record, ['Service', 'service', 'SERVICE']),
            this.getFromRecord(record, ['Agence', 'agence', 'AGENCE', 'agency'])
        ].map(value => value?.toString().trim()).filter(value => !!value);

        if (parts.length === 0) {
            return Object.values(record).join('|');
        }

        return parts.join('|');
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
    private getBoSelectionDataset(): Record<string, string>[] {
        if (this.filteredBoOnly && this.filteredBoOnly.length > 0) {
            return this.filteredBoOnly;
        }
        if (this.response?.boOnly && this.response.boOnly.length > 0) {
            return this.response.boOnly;
        }
        return [];
    }
    private getBoRecordsForAction(): Record<string, string>[] {
        const dataset = this.getBoSelectionDataset();
        if (this.selectedBoOnlyKeys.length === 0) {
            return dataset;
        }
        const keySet = new Set(this.selectedBoOnlyKeys);
        return dataset.filter(record => keySet.has(this.getBoOnlyKey(record)));
    }

    // Sélection pour ECART Partenaire (Import OP)
    selectedPartnerOnlyKeys: string[] = [];
    private getPartnerOnlyKey(record: Record<string, string>): string {
        const numeroTrans = (record['Numéro Trans GU'] || record['Numero Trans GU'] || record['numeroTransGU'] || record['numero_trans_gu'] || '').toString();
        const idOperation = (record['ID Opération'] || record['ID Operation'] || record['id_operation'] || '').toString();
        const dateOp = (record['Date opération'] || record['dateOperation'] || record['date_operation'] || record['Date'] || '').toString();
        const montant = (record['Montant'] || record['montant'] || record['amount'] || '').toString();
        return [numeroTrans, idOperation, dateOp, montant].join('|');
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

    async saveEcartBoToEcartSolde(): Promise<void> {
        const availableRecords = this.getBoSelectionDataset();
        if (availableRecords.length === 0) {
            this.popupService.showWarning(this.t('RES.dlg.noEcartBoToSave'));
            return;
        }

        const sourceRecords = this.getBoRecordsForAction();
        if (sourceRecords.length === 0) {
            this.popupService.showWarning(this.t('RES.dlg.noRowSelectedToSave'));
            return;
        }

        this.isSavingEcartBo = true;

        try {

            // Debug: Afficher les colonnes disponibles dans le premier enregistrement
            if (sourceRecords.length > 0) {
            }

            // Convertir les données ECART BO en format EcartSolde
            const ecartSoldeData: EcartSolde[] = sourceRecords.map((record, index) => {
                const getValueWithFallback = (keys: string[]): string => {
                    for (const key of keys) {
                        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                            return record[key].toString();
                        }
                    }
                    return '';
                };

                // Debug: Afficher les colonnes disponibles pour cet enregistrement

                // Extraire les informations d'agence et de service
                const agencyInfo = this.getBoOnlyAgencyAndService(record);
                
                // Fonction helper pour convertir les dates (y compris format Excel) au format ISO
                const formatDateForBackend = (dateStr: string): string => {
                    if (!dateStr) return '';
                    
                    // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres), ne pas traiter comme Excel
                    if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
                        // Si la date est déjà au format ISO, la retourner
                        if (dateStr.includes('T')) return dateStr;
                        
                        // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
                        const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
                        return cleanedDate.replace(' ', 'T');
                    }
                    
                    // Vérifier si c'est un numéro de série Excel pur (nombre décimal sans autre caractère)
                    const numValue = parseFloat(dateStr);
                    const numStr = numValue.toString();
                    // Vérifier que la conversion en nombre et retour en string donne la même chose (ou presque)
                    if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateStr) - numValue) < 0.0001) {
                        // C'est probablement un numéro de série Excel
                        const excelEpoch = new Date(1900, 0, 1).getTime();
                        const millisecondsPerDay = 86400000;
                        const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
                        return jsDate.toISOString();
                    }
                    
                    // Par défaut, retourner la chaîne telle quelle
                    return dateStr;
                };

                // Créer l'objet EcartSolde avec les données mappées
                const ecartSolde: EcartSolde = {
                    id: undefined, // Sera généré par la base de données
                    idTransaction: getValueWithFallback(['ID Transaction', 'IDTransaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId']),
                    telephoneClient: getValueWithFallback(['t l phone client', 'téléphone client', 'telephone_client', 'TELEPHONE_CLIENT', 'phone', 'Phone']),
                    montant: parseFloat(getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'])) || 0,
                    service: agencyInfo.service,
                    agence: agencyInfo.agency,
                    dateTransaction: formatDateForBackend(agencyInfo.date),
                    numeroTransGu: getValueWithFallback(['Numero Trans GU', 'Numéro Trans GU', 'numero_trans_gu', 'NUMERO_TRANS_GU', 'transaction_number', 'TransactionNumber']),
                    pays: agencyInfo.country,
                    statut: 'EN_ATTENTE', // Statut par défaut
                    commentaire: 'IMPACT J+1', // Commentaire par défaut
                    dateImport: new Date().toISOString()
                };


                return ecartSolde;
            });


            // Validation des données avant sauvegarde
            
            // Log détaillé de chaque enregistrement pour le débogage
            ecartSoldeData.forEach((record, index) => {
            });

            const validRecords = ecartSoldeData.filter(record => 
                record.idTransaction && 
                record.idTransaction.trim() !== '' && 
                record.agence && 
                record.agence.trim() !== ''
            );


            if (validRecords.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noValidDataToSave'));
                return;
            }


            // Créer le contenu CSV pour validation
            const csvContent = this.createCsvContent(validRecords);

            // Afficher un message de confirmation avec les détails
            const selectionSummary = this.selectedBoOnlyKeys.length > 0
                ? this.t('RES.dlg.selectedRows', { count: sourceRecords.length })
                : '';
            const message = this.t('RES.dlg.saveSummaryTitle') +
                this.t('RES.dlg.saveTotalBo', { count: availableRecords.length }) +
                selectionSummary +
                this.t('RES.dlg.saveValidRecords', { count: validRecords.length }) +
                this.t('RES.dlg.saveInvalidRecords', { count: ecartSoldeData.length - validRecords.length }) +
                this.t('RES.dlg.saveDefaultComment') +
                this.t('RES.dlg.saveDuplicatesIgnored') +
                this.t('RES.dlg.saveContinue');

            const confirmed = await this.popupService.showConfirm(message, this.t('RES.dlg.saveConfirmTitle'));
            if (!confirmed) {
                return;
            }

            
            // Sauvegarder les données via le service
            const result = await this.ecartSoldeService.createMultipleEcartSoldes(validRecords);
            
            
            // Afficher un message de succès détaillé
            let successMessage = this.t('RES.dlg.saveSuccessTitle');
            successMessage += this.t('RES.dlg.saveSummaryHeader');
            successMessage += this.t('RES.dlg.saveReceived', { count: result.totalReceived });
            successMessage += this.t('RES.dlg.saveCreated', { count: result.count });
            successMessage += this.t('RES.dlg.saveDuplicates', { count: result.duplicates });
            successMessage += this.t('RES.dlg.saveStoredEcartSolde');
            
            this.popupService.showSuccess(successMessage);
            
        } catch (error: any) {
            
            let errorMessage = this.t('RES.dlg.saveErrorBoTitle');
            if (error.error?.error) {
                errorMessage += this.t('RES.dlg.errorDetails', { detail: error.error.error });
            } else if (error.message) {
                errorMessage += this.t('RES.dlg.errorDetails', { detail: error.message });
            } else {
                errorMessage += this.t('RES.dlg.pleaseRetry');
            }
            
            this.popupService.showError(errorMessage);
        } finally {
            this.isSavingEcartBo = false;
        }
    }

    async saveEcartBoToTrxSf(): Promise<void> {
        const availableRecords = this.getBoSelectionDataset();
        if (availableRecords.length === 0) {
            this.popupService.showWarning(this.t('RES.dlg.noEcartBoToSaveTrx'));
            return;
        }

        const sourceRecords = this.getBoRecordsForAction();
        if (sourceRecords.length === 0) {
            this.popupService.showWarning(this.t('RES.dlg.noRowSelectedToSave'));
            return;
        }

        this.isSavingEcartBoToTrxSf = true;

        try {

            // Convertir les données ECART BO en format TrxSfData avec récupération des frais
            const trxSfDataPromises = sourceRecords.map(async (record, index) => {
                const getValueWithFallback = (keys: string[]): string => {
                    for (const key of keys) {
                        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                            return record[key].toString();
                        }
                    }
                    return '';
                };

                // Extraire les informations d'agence et de service
                const agencyInfo = this.getBoOnlyAgencyAndService(record);
                
                // Fonction helper pour convertir les dates (y compris format Excel) au format ISO
                const formatDateForBackend = (dateStr: string): string => {
                    if (!dateStr) return '';
                    
                    // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres), ne pas traiter comme Excel
                    if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
                        // Si la date est déjà au format ISO, la retourner
                        if (dateStr.includes('T')) return dateStr;
                        
                        // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
                        const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
                        return cleanedDate.replace(' ', 'T');
                    }
                    
                    // Vérifier si c'est un numéro de série Excel pur (nombre décimal sans autre caractère)
                    const numValue = parseFloat(dateStr);
                    const numStr = numValue.toString();
                    // Vérifier que la conversion en nombre et retour en string donne la même chose (ou presque)
                    if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateStr) - numValue) < 0.0001) {
                        // C'est probablement un numéro de série Excel
                        const excelEpoch = new Date(1900, 0, 1).getTime();
                        const millisecondsPerDay = 86400000;
                        const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
                        return jsDate.toISOString();
                    }
                    
                    // Par défaut, retourner la chaîne telle quelle
                    return dateStr;
                };

                // Calculer automatiquement les frais selon la configuration du service
                let frais = 0;
                try {
                    // Récupérer la configuration des frais pour le service
                    const fraisConfigResponse = await this.trxSfService.getFraisConfigByService(agencyInfo.service).toPromise();
                    const fraisConfig = fraisConfigResponse;
                    
                    if (fraisConfig && fraisConfig.typeFrais) {
                        if (fraisConfig.typeFrais === 'NOMINAL' || fraisConfig.typeFrais === 'FIXE') {
                            // Frais fixe : on prend le montant configuré
                            frais = fraisConfig.montant || 0;
                        } else if (fraisConfig.typeFrais === 'POURCENTAGE') {
                            // Frais en pourcentage : on applique le pourcentage sur le montant
                            const pourcentage = fraisConfig.pourcentage || 0;
                            frais = (agencyInfo.volume * pourcentage) / 100;
                        }
                    } else {
                        // Pas de configuration, frais à 0 par défaut
                        frais = 0;
                    }
                    
                } catch (configError) {
                    frais = 0; // Frais par défaut en cas d'erreur
                }

                // Créer l'objet TrxSfData avec les données mappées
                const trxSf: any = {
                    idTransaction: getValueWithFallback(['IDTransaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId']),
                    telephoneClient: getValueWithFallback(['téléphone client', 'telephone_client', 'TELEPHONE_CLIENT', 'phone', 'Phone']),
                    montant: parseFloat(getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'])) || 0,
                    service: agencyInfo.service,
                    agence: agencyInfo.agency,
                    dateTransaction: formatDateForBackend(agencyInfo.date),
                    numeroTransGu: getValueWithFallback(['Numéro Trans GU', 'numero_trans_gu', 'NUMERO_TRANS_GU', 'transaction_number', 'TransactionNumber']),
                    pays: agencyInfo.country,
                    statut: 'EN_ATTENTE',
                    frais: frais, // Frais récupérés depuis l'API
                    commentaire: 'ECART BO - Importé depuis la réconciliation avec frais TSOP',
                    dateImport: new Date().toISOString()
                };


                return trxSf;
            });

            // Attendre que toutes les promesses soient résolues
            const trxSfData = await Promise.all(trxSfDataPromises);


            // Validation des données avant sauvegarde
            const validRecords = trxSfData.filter(record => 
                record.idTransaction && 
                record.idTransaction.trim() !== '' && 
                record.agence && 
                record.agence.trim() !== ''
            );


            if (validRecords.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noValidRecordToSaveTrx'));
                return;
            }

            // Sauvegarder les données dans TRX SF
            
            // Appeler le service pour sauvegarder les données
            const result = await this.trxSfService.createMultipleTrxSf(validRecords).toPromise();
            
            
            // Afficher un message de succès
            this.popupService.showSuccess(this.t('RES.dlg.saveSuccessTrxBo', { count: validRecords.length }));

        } catch (error) {
            
            let errorMessage = this.t('RES.dlg.saveErrorTrxTitle');
            if (error && typeof error === 'object') {
                const errorObj = error as any;
                if (errorObj.error && typeof errorObj.error === 'object') {
                    errorMessage = errorObj.error.message || errorObj.error.details || errorMessage;
                } else if (errorObj.message) {
                    errorMessage = errorObj.message;
                }
            }
            
            this.popupService.showError(`❌ ${errorMessage}`);
                    } finally {
                this.isSavingEcartBoToTrxSf = false;
            }
        }
    
        async saveEcartPartnerToTrxSf(): Promise<void> {
            if (!this.response?.partnerOnly || this.response.partnerOnly.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noEcartPartnerToSaveTrx'));
                return;
            }

        this.isSavingEcartPartnerToTrxSf = true;

        try {

            // Convertir les données ECART Partenaire en format TrxSfData avec récupération des frais
            const trxSfDataPromises = this.response.partnerOnly.map(async (record, index) => {
                const getValueWithFallback = (keys: string[]): string => {
                    for (const key of keys) {
                        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                            return record[key].toString();
                        }
                    }
                    return '';
                };

                // Extraire les informations d'agence et de service
                const agencyInfo = this.getPartnerOnlyAgencyAndService(record);
                
                // Fonction helper pour convertir les dates (y compris format Excel) au format ISO
                const formatDateForBackend = (dateStr: string): string => {
                    if (!dateStr) return '';
                    
                    // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres), ne pas traiter comme Excel
                    if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
                        // Si la date est déjà au format ISO, la retourner
                        if (dateStr.includes('T')) return dateStr;
                        
                        // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
                        const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
                        return cleanedDate.replace(' ', 'T');
                    }
                    
                    // Vérifier si c'est un numéro de série Excel pur (nombre décimal sans autre caractère)
                    const numValue = parseFloat(dateStr);
                    const numStr = numValue.toString();
                    // Vérifier que la conversion en nombre et retour en string donne la même chose (ou presque)
                    if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateStr) - numValue) < 0.0001) {
                        // C'est probablement un numéro de série Excel
                        const excelEpoch = new Date(1900, 0, 1).getTime();
                        const millisecondsPerDay = 86400000;
                        const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
                        return jsDate.toISOString();
                    }
                    
                    // Par défaut, retourner la chaîne telle quelle
                    return dateStr;
                };

                // Calculer automatiquement les frais selon la configuration du service
                let frais = 0;
                try {
                    // Récupérer la configuration des frais pour le service
                    const fraisConfigResponse = await this.trxSfService.getFraisConfigByService(agencyInfo.service).toPromise();
                    const fraisConfig = fraisConfigResponse;
                    
                    if (fraisConfig && fraisConfig.typeFrais) {
                        if (fraisConfig.typeFrais === 'NOMINAL' || fraisConfig.typeFrais === 'FIXE') {
                            // Frais fixe : on prend le montant configuré
                            frais = fraisConfig.montant || 0;
                        } else if (fraisConfig.typeFrais === 'POURCENTAGE') {
                            // Frais en pourcentage : on applique le pourcentage sur le montant
                            const pourcentage = fraisConfig.pourcentage || 0;
                            frais = (agencyInfo.volume * pourcentage) / 100;
                        }
                    } else {
                        // Pas de configuration, frais à 0 par défaut
                        frais = 0;
                    }
                    
                } catch (configError) {
                    frais = 0; // Frais par défaut en cas d'erreur
                }

                // Créer l'objet TrxSfData avec les données mappées
                const trxSf: any = {
                    idTransaction: getValueWithFallback(['IDTransaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId']),
                    telephoneClient: getValueWithFallback(['téléphone client', 'telephone_client', 'TELEPHONE_CLIENT', 'phone', 'Phone']),
                    montant: parseFloat(getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'])) || 0,
                    service: agencyInfo.service,
                    agence: agencyInfo.agency,
                    dateTransaction: formatDateForBackend(agencyInfo.date),
                    numeroTransGu: getValueWithFallback(['Numéro Trans GU', 'numero_trans_gu', 'NUMERO_TRANS_GU', 'transaction_number', 'TransactionNumber']),
                    pays: agencyInfo.country,
                    statut: 'EN_ATTENTE',
                    frais: frais, // Frais récupérés depuis l'API
                    commentaire: 'ECART PARTENAIRE - Importé depuis la réconciliation avec frais TSOP',
                    dateImport: new Date().toISOString()
                };


                return trxSf;
            });

            // Attendre que toutes les promesses soient résolues
            const trxSfData = await Promise.all(trxSfDataPromises);


            // Validation des données avant sauvegarde
            const validRecords = trxSfData.filter(record => 
                record.idTransaction && 
                record.idTransaction.trim() !== '' && 
                record.agence && 
                record.agence.trim() !== ''
            );


            if (validRecords.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noValidRecordToSaveTrx'));
                return;
            }

            // Sauvegarder les données dans TRX SF
            
            // Appeler le service pour sauvegarder les données
            const result = await this.trxSfService.createMultipleTrxSf(validRecords).toPromise();
            
            
            // Afficher un message de succès
            this.popupService.showSuccess(this.t('RES.dlg.saveSuccessTrxPartner', { count: validRecords.length }));

        } catch (error) {
            
            let errorMessage = this.t('RES.dlg.saveErrorTrxTitle');
            if (error && typeof error === 'object') {
                const errorObj = error as any;
                if (errorObj.error && typeof errorObj.error === 'object') {
                    errorMessage = errorObj.error.message || errorObj.error.details || errorMessage;
                } else if (errorObj.message) {
                    errorMessage = errorObj.message;
                }
            }
            
            this.popupService.showError(`❌ ${errorMessage}`);
        } finally {
            this.isSavingEcartPartnerToTrxSf = false;
        }
    }

    // Méthode helper pour créer le contenu CSV pour la validation
    private createCsvContent(ecartSoldeData: EcartSolde[]): string {
        const headers = ['ID', 'IDTransaction', 'téléphone client', 'montant', 'Service', 'Agence', 'Date', 'Numéro Trans GU', 'PAYS'];
        const csvRows = [headers.join(';')];
        
        ecartSoldeData.forEach((ecart, index) => {
            const row = [
                index + 1,
                ecart.idTransaction,
                ecart.telephoneClient,
                ecart.montant,
                ecart.service,
                ecart.agence,
                ecart.dateTransaction,
                ecart.numeroTransGu,
                ecart.pays
            ];
            csvRows.push(row.join(';'));
        });
        
        return csvRows.join('\n');
    }

    /**
     * Détermine la nature de l'écart partenaire
     */
    private determineEcartNature(record: Record<string, string>): string {
        // Vérifier le type d'opération
        const typeOperationKeys = ['Type Opération', 'Type opération', 'type_operation', 'TYPE_OPERATION', 'typeOperation'];
        const typeOperation = typeOperationKeys.find(key => {
            const value = record[key];
            return value !== undefined && value !== null && value !== '';
        });
        
        const typeOperationValue = typeOperation ? record[typeOperation] : '';
        
        // Vérifier s'il y a des frais
        const fraisKeys = ['Frais connexion', 'frais_connexion', 'FRAIS_CONNEXION', 'frais', 'Frais'];
        const hasFrais = fraisKeys.some(key => {
            const value = record[key];
            return value !== undefined && value !== null && value !== '' && parseFloat(value) > 0;
        });

        // Vérifier s'il y a une transaction
        const transactionKeys = ['ID Transaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId'];
        const hasTransaction = transactionKeys.some(key => {
            const value = record[key];
            return value !== undefined && value !== null && value !== '';
        });

        // Vérifier s'il y a un montant
        const montantKeys = ['Montant', 'montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'];
        const hasMontant = montantKeys.some(key => {
            const value = record[key];
            return value !== undefined && value !== null && value !== '' && parseFloat(value) > 0;
        });

        // Logique spéciale pour les cas de correspondance unique (écart partenaire)
        // Si une seule correspondance et type d'opération FRAIS_TRANSACTION -> "Régularisation FRAIS"
        // Si une seule correspondance avec autre type d'opération -> "SANS FRAIS"
        if (typeOperationValue && typeOperationValue.includes('FRAIS_TRANSACTION')) {
            return 'Régularisation FRAIS';
        }
        
        // Déterminer la nature de l'écart selon la logique standard
        if (!hasTransaction && !hasMontant) {
            return 'Ligne partenaire sans transaction ni montant';
        } else if (!hasTransaction) {
            return 'Ligne partenaire sans transaction';
        } else if (!hasFrais && hasMontant) {
            // Cas général avec une seule correspondance -> SANS FRAIS
            return 'SANS FRAIS';
        } else if (!hasMontant) {
            return 'Ligne partenaire sans montant';
        } else {
            return 'Ligne partenaire avec écart non spécifié';
        }
    }

    async saveEcartPartnerToEcartSolde(): Promise<void> {
        if (!this.response?.partnerOnly || this.response.partnerOnly.length === 0) {
            this.popupService.showWarning(this.t('RES.dlg.noEcartPartnerToSave'));
            return;
        }

        this.isSavingEcartPartner = true;

        try {

            // Debug: Afficher les colonnes disponibles dans le premier enregistrement
            if (this.response.partnerOnly.length > 0) {
            }

            // Convertir les données ECART Partenaire en format EcartSolde
            const ecartSoldeData: EcartSolde[] = this.response.partnerOnly.map((record, index) => {
                const getValueWithFallback = (keys: string[]): string => {
                    for (const key of keys) {
                        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                            return record[key].toString();
                        }
                    }
                    return '';
                };

                // Debug: Afficher les colonnes disponibles pour cet enregistrement

                // Extraire les informations d'agence et de service
                const agencyInfo = this.getPartnerOnlyAgencyAndService(record);
                
                // Déterminer la nature de l'écart
                const ecartNature = this.determineEcartNature(record);
                
                // Fonction helper pour convertir les dates (y compris format Excel) au format ISO
                const formatDateForBackend = (dateStr: string): string => {
                    if (!dateStr) return '';
                    
                    // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres), ne pas traiter comme Excel
                    if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
                        // Si la date est déjà au format ISO, la retourner
                        if (dateStr.includes('T')) return dateStr;
                        
                        // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
                        const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
                        return cleanedDate.replace(' ', 'T');
                    }
                    
                    // Vérifier si c'est un numéro de série Excel pur (nombre décimal sans autre caractère)
                    const numValue = parseFloat(dateStr);
                    const numStr = numValue.toString();
                    // Vérifier que la conversion en nombre et retour en string donne la même chose (ou presque)
                    if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateStr) - numValue) < 0.0001) {
                        // C'est probablement un numéro de série Excel
                        const excelEpoch = new Date(1900, 0, 1).getTime();
                        const millisecondsPerDay = 86400000;
                        const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
                        return jsDate.toISOString();
                    }
                    
                    // Par défaut, retourner la chaîne telle quelle
                    return dateStr;
                };

                // Créer l'objet EcartSolde avec les données mappées
                const ecartSolde: EcartSolde = {
                    id: undefined, // Sera généré par la base de données
                    idTransaction: getValueWithFallback(['IDTransaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId']),
                    telephoneClient: getValueWithFallback(['téléphone client', 'telephone_client', 'TELEPHONE_CLIENT', 'phone', 'Phone']),
                    montant: parseFloat(getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'])) || 0,
                    service: agencyInfo.service,
                    agence: agencyInfo.agency,
                    dateTransaction: formatDateForBackend(agencyInfo.date),
                    numeroTransGu: getValueWithFallback(['Numéro Trans GU', 'numero_trans_gu', 'NUMERO_TRANS_GU', 'transaction_number', 'TransactionNumber']),
                    pays: agencyInfo.country,
                    statut: 'EN_ATTENTE', // Statut par défaut
                    commentaire: `IMPACT PARTENAIRE - ${ecartNature}`, // Commentaire avec nature de l'écart
                    dateImport: new Date().toISOString()
                };


                return ecartSolde;
            });


            // Validation des données avant sauvegarde
            
            // Log détaillé de chaque enregistrement pour le débogage
            ecartSoldeData.forEach((record, index) => {
            });

            const validRecords = ecartSoldeData.filter(record => 
                record.idTransaction && 
                record.idTransaction.trim() !== '' && 
                record.agence && 
                record.agence.trim() !== ''
            );


            if (validRecords.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noValidDataToSave'));
                return;
            }


            // Analyser les types d'écarts
            const ecartTypes = new Map<string, number>();
            this.response.partnerOnly.forEach(record => {
                const ecartNature = this.determineEcartNature(record);
                ecartTypes.set(ecartNature, (ecartTypes.get(ecartNature) || 0) + 1);
            });

            // Créer le contenu CSV pour validation
            const csvContent = this.createCsvContent(validRecords);

            // Afficher un message de confirmation avec les détails
            let message = this.t('RES.dlg.saveSummaryTitle') +
                this.t('RES.dlg.saveTotalPartner', { count: this.response.partnerOnly.length }) +
                this.t('RES.dlg.saveValidRecords', { count: validRecords.length }) +
                this.t('RES.dlg.saveInvalidRecords', { count: ecartSoldeData.length - validRecords.length }) +
                this.t('RES.dlg.ecartBreakdown');
            
            ecartTypes.forEach((count, type) => {
                message += this.t('RES.dlg.ecartTypeLine', { type, count });
            });
            
            message += this.t('RES.dlg.savePartnerComment') +
                this.t('RES.dlg.saveDuplicatesIgnored') +
                this.t('RES.dlg.saveContinue');

            const confirmed = await this.popupService.showConfirm(message, this.t('RES.dlg.saveConfirmTitle'));
            if (!confirmed) {
                return;
            }

            
            // Sauvegarder les données via le service
            const result = await this.ecartSoldeService.createMultipleEcartSoldes(validRecords);
            
            
            // Afficher un message de succès détaillé
            let successMessage = this.t('RES.dlg.saveSuccessTitle');
            successMessage += this.t('RES.dlg.saveSummaryHeader');
            successMessage += this.t('RES.dlg.saveReceived', { count: result.totalReceived });
            successMessage += this.t('RES.dlg.saveCreated', { count: result.count });
            successMessage += this.t('RES.dlg.saveDuplicates', { count: result.duplicates });
            successMessage += this.t('RES.dlg.saveStoredEcartSolde');
            
            this.popupService.showSuccess(successMessage);
            
        } catch (error: any) {
            
            let errorMessage = this.t('RES.dlg.saveErrorPartnerTitle');
            if (error.error?.error) {
                errorMessage += this.t('RES.dlg.errorDetails', { detail: error.error.error });
            } else if (error.message) {
                errorMessage += this.t('RES.dlg.errorDetails', { detail: error.message });
            } else {
                errorMessage += this.t('RES.dlg.pleaseRetry');
            }
            
            this.popupService.showError(errorMessage);
        } finally {
            this.isSavingEcartPartner = false;
        }
    }

    async saveEcartPartnerToImpactOP(): Promise<void> {
        if (!this.response?.partnerOnly || this.response.partnerOnly.length === 0) {
            this.popupService.showWarning(this.t('RES.dlg.noEcartPartnerToSaveImportOp'));
            return;
        }

        this.isSavingEcartPartnerToImpactOP = true;

        try {

            // Déterminer la source: lignes sélectionnées ou tout le jeu de données
            const sourceRecords: Record<string, string>[] =
                this.selectedPartnerOnlyKeys.length > 0
                    ? (this.filteredPartnerOnly || []).filter(r => this.selectedPartnerOnlyKeys.includes(this.getPartnerOnlyKey(r)))
                    : (this.response.partnerOnly || []);

            if (sourceRecords.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noRowSelectedToSave'));
                return;
            }


            const defaultDateCandidate = this.selectedPartnerImportOpDate
                || this.extractIsoDay(this.getFromRecord(sourceRecords[0], ['Date opération', 'Date', 'dateOperation', 'date_operation']))
                || this.extractIsoDay(this.getPartnerOnlyDate(sourceRecords[0]))
                || this.toIsoLocalDate(new Date().toISOString());

            const dateInput = await this.popupService.showDateInput(
                this.t('RES.dlg.selectImportOpDate'),
                this.t('RES.dlg.importOpDateTitle'),
                defaultDateCandidate
            );

            if (dateInput === null) {
                await this.popupService.showInfo(this.t('RES.dlg.importOpSaveCancelled'));
                return;
            }

            const normalizedDateInput = this.toIsoLocalDate(dateInput || defaultDateCandidate);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateInput)) {
                await this.popupService.showWarning(this.t('RES.dlg.invalidOperationDateCancelled'));
                return;
            }

            this.selectedPartnerImportOpDate = normalizedDateInput;
            const overrideDateIso = this.makeIsoDateTime(normalizedDateInput);

            // Convertir les données ECART Partenaire en format ImpactOP
            const impactOPData: ImpactOP[] = sourceRecords.map((record, index) => {
                const getValueWithFallback = (keys: string[]): string => {
                    for (const key of keys) {
                        const originalKey = this.getOriginalKey(record, key);
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

                const getNumberWithFallback = (keys: string[]): number => {
                    const value = getValueWithFallback(keys);
                    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
                    return isNaN(parsed) ? 0 : parsed;
                };

                // Fonction helper pour convertir les numéros de série Excel en dates JavaScript
                const parseExcelDate = (dateValue: string): Date => {
                    // Si la valeur est vide, retourner la date actuelle
                    if (!dateValue || dateValue.trim() === '') {
                        return new Date();
                    }
                    
                    // Si la date contient déjà des caractères de format date, la parser normalement
                    if (dateValue.includes('-') || dateValue.includes('T') || dateValue.includes('/') || /\d{4}/.test(dateValue)) {
                        const parsedDate = new Date(dateValue);
                        if (!isNaN(parsedDate.getTime())) {
                            return parsedDate;
                        }
                    }
                    
                    // Vérifier si c'est un numéro de série Excel pur (nombre décimal)
                    const numValue = parseFloat(dateValue);
                    if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateValue) - numValue) < 0.0001) {
                        // C'est probablement un numéro de série Excel
                        // Excel epoch: 1er janvier 1900 (avec correction pour le bug du 29 février 1900)
                        const excelEpoch = new Date(1900, 0, 1).getTime();
                        const millisecondsPerDay = 86400000;
                        // Soustraire 2 pour corriger le bug Excel (29/02/1900) et l'index qui commence à 1
                        const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
                        return jsDate;
                    }
                    
                    // Si tout échoue, retourner la date actuelle
                    return new Date();
                };
                
                // Construire la date d'opération au format LocalDateTime
                const dateOperationStr = getValueWithFallback(['Date opération', 'dateOperation', 'date_operation', 'Date']);
                const parsedDate = parseExcelDate(dateOperationStr);
                const dateOperation = overrideDateIso || parsedDate.toISOString();

                // Récupérer les valeurs réelles des colonnes ECART Partenaire
                // Type: colonne "Type" dans les données ECART Partenaire
                const typeOperation = getValueWithFallback(['Type', 'type', 'TYPE', 'Type Opération', 'typeOperation', 'type_operation']) || 'DEPOT';
                
                // Agence: colonne "Agence" dans les données ECART Partenaire
                const codeProprietaire = getValueWithFallback(['Agence', 'agence', 'AGENCE', 'agency', 'Code propriétaire', 'Code proprietaire', 'codeProprietaire', 'code_proprietaire']) || 'UNKNOWN';
                
                // Pays/GRX: colonne "Pays" dans les données ECART Partenaire
                const groupeReseau = getValueWithFallback(['Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'groupe de réseau', 'groupeReseau', 'groupe_reseau']) || 'DEFAULT';
                
                // Soldes: colonnes "Solde_avant" et "Solde_Après" dans les données ECART Partenaire
                const soldeAvant = getNumberWithFallback(['Solde_avant', 'Solde_Avant', 'SOLDE_AVANT', 'solde_avant', 'Solde avant', 'soldeAvant']);
                const soldeApres = getNumberWithFallback(['Solde_Après', 'Solde_Apres', 'SOLDE_APRES', 'solde_après', 'Solde après', 'soldeApres', 'Solde aprés']);

                return {
                    id: undefined, // Sera assigné par le backend
                    typeOperation: typeOperation,
                    montant: getNumberWithFallback(['Montant', 'montant', 'amount']),
                    soldeAvant: soldeAvant,
                    soldeApres: soldeApres,
                    codeProprietaire: codeProprietaire,
                    dateOperation: dateOperation,
                    numeroTransGU: getValueWithFallback(['Numéro Trans GU', 'numeroTransGU', 'numero_trans_gu', 'numeroTransGU']) || `GU-${Date.now()}-${index}`,
                    groupeReseau: groupeReseau.length > 10 ? groupeReseau.substring(0, 10) : groupeReseau,
                    statut: 'EN_ATTENTE',
                    commentaire: `Importé depuis ECART Partenaire - ${new Date().toLocaleString('fr-FR')}`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                } as ImpactOP;
            });


            // Sauvegarder via le service Impact OP
            let successCount = 0;
            let errorCount = 0;

            for (const [index, impactOP] of impactOPData.entries()) {
                try {
                    const result = await firstValueFrom(this.impactOPService.createImpactOP(impactOP));
                    successCount++;
                } catch (error: any) {
                    errorCount++;
                }
            }

            if (successCount > 0) {
                this.popupService.showSuccess(this.t('RES.dlg.importOpSuccess', { created: successCount, errors: errorCount }));
            } else {
                this.popupService.showError(this.t('RES.dlg.importOpFailure'));
            }

        } catch (error) {
            
            let errorMessage = this.t('RES.dlg.importOpErrorTitle');
            
            if (error && typeof error === 'object') {
                const apiError = error as ApiError;
                if (apiError.error?.message) {
                    errorMessage += this.t('RES.dlg.errorDetails', { detail: apiError.error.message });
                } else if (apiError.message) {
                    errorMessage += this.t('RES.dlg.errorDetails', { detail: apiError.message });
                } else {
                    errorMessage += this.t('RES.dlg.communicationError');
                }
            } else {
                errorMessage += this.t('RES.dlg.unknownError');
            }
            
            errorMessage += '\n\n' + this.t('RES.dlg.pleaseRetry');
            
            this.popupService.showError(errorMessage);
        } finally {
            this.isSavingEcartPartnerToImpactOP = false;
        }
    }

    constructor(
        private cdr: ChangeDetectorRef, 
        private appStateService: AppStateService, 
        private router: Router,
        private route: ActivatedRoute,
        private reconciliationService: ReconciliationService,
        private ecartSoldeService: EcartSoldeService,
        private trxSfService: TrxSfService,
        private impactOPService: ImpactOPService,
        private http: HttpClient,
        private popupService: PopupService,
        private exportOptimizationService: ExportOptimizationService,
        private reconciliationSummaryService: ReconciliationSummaryService,
        private reconciliationTabsService: ReconciliationTabsService,
        private compteService: CompteService,
        private operationService: OperationService,
        private calculService: ConfigurationCalculService,
        private translate: TranslateService
    ) {}

    /** Raccourci de traduction pour les messages construits hors gabarit. */
    private t(key: string, params?: Record<string, unknown>): string {
        return this.translate.instant(key, params);
    }

    ngOnInit() {
        const initStartTime = performance.now();
        (window as any).pageLoadTime = initStartTime;

        this.magicServiceSummaries = this.appStateService.getMagicServiceSummaries();
        this.magicPartnerFileNames = this.appStateService.getMagicPartnerFileNames();
        this.selectedMagicPartnerFile = this.appStateService.getSelectedMagicPartnerFile()
            || this.magicPartnerFileNames[0]
            || '';
        this.initializeMagicSelection();
        
        // Vérifier si les données sont déjà présentes pour éviter une réinitialisation complète
        const hasExistingData = this.response && (
            (this.response.matches && this.response.matches.length > 0) ||
            (this.response.boOnly && this.response.boOnly.length > 0) ||
            (this.response.partnerOnly && this.response.partnerOnly.length > 0)
        );
        
        if (hasExistingData && this.matchesLoaded && this.boOnlyLoaded && this.partnerOnlyLoaded) {
            this.refreshMagicServicePartitioning();
            const skipInitDuration = performance.now() - initStartTime;
            return;
        }
        
        // Récupérer le jobId depuis les queryParams
        this.subscription.add(
            this.route.queryParams.subscribe(params => {
                const jobIdStartTime = performance.now();
                if (params['jobId']) {
                    this.currentJobId = params['jobId'];
                } else {
                    // Essayer de récupérer depuis le service
                    this.currentJobId = this.reconciliationService.getCurrentJobId();
                }
            })
        );
        
        this.subscription.add(
            this.appStateService.getReconciliationResults().subscribe((response: ReconciliationResponse | null) => {
                const dataReceiveStartTime = performance.now();
                
                // Nouvelle réconciliation : purger les anciens résultats pour afficher les nouveaux
                if (response) {
                    // Purger les données des onglets et caches avant d'afficher les nouveaux résultats
                    this.reconciliationTabsService.clearAllData();
                    this.invalidateCache();
                    const initDataStartTime = performance.now();
                    
                    this.response = this.normalizeReconciliationResponseDates(response);
                    // Conserver la réponse complète (toutes les services/cards) avant que le
                    // lazy-load ne la remplace par la seule card active. Le rapport s'en sert
                    // pour afficher le détail par agence de chaque card sélectionnée.
                    if (!this.appStateService.getMagicFullResponse() && response) {
                        this.appStateService.setMagicFullResponse(response);
                    }
                    this.magicServiceSummaries = this.appStateService.getMagicServiceSummaries();
                    this.magicPartnerFileNames = this.appStateService.getMagicPartnerFileNames();
                    this.selectedMagicPartnerFile = this.appStateService.getSelectedMagicPartnerFile()
                        || this.magicPartnerFileNames[0]
                        || '';
                    this.initializeMagicSelection();
                    
                    // S'assurer que l'onglet actif est bien défini pour afficher les résultats
                    if (!this.activeTab || this.activeTab === 'matches') {
                        this.setActiveTab('matches'); // Onglet par défaut pour afficher les correspondances (déclenche lazy-load)
                    }
                    
                    // La liste des correspondances est masquée par défaut
                    this.showMatchesList = false;
                    
                    const filterStartTime = performance.now();
                    this.initializeFilteredData();
                    const filterDuration = performance.now() - filterStartTime;
                    
                    // Vider le cache quand les données changent
                    const cacheStartTime = performance.now();
                    this.agencyServiceCache.clear();
                    
                    // Initialiser les informations de progression
                    const progressStartTime = performance.now();
                    
                    if (response.executionTimeMs) {
                        this.executionTime = response.executionTimeMs;
                    } else {
                        this.executionTime = 306; // Valeur par défaut
                    }
                    
                    
                    if (response.processedRecords) {
                        this.processedRecords = response.processedRecords;
                    }
                    if (response.progressPercentage) {
                        this.progressPercentage = response.progressPercentage;
                    }
                    
                    // Calculer le total des enregistrements
                    const totalStartTime = performance.now();
                    this.totalRecords = (response.totalBoRecords || 0) + (response.totalPartnerRecords || 0);
                    
                    // Si nous n'avons pas encore de totalRecords et que nous avons des données, les calculer
                    if (this.totalRecords === 0 && this.response) {
                        const boCount = this.response.boOnly ? this.response.boOnly.length : 0;
                        const partnerCount = this.response.partnerOnly ? this.response.partnerOnly.length : 0;
                        const matchesCount = this.response.matches ? this.response.matches.length : 0;
                        this.totalRecords = boCount + partnerCount + matchesCount;
                    }
                    
                    // Calculer et mettre en cache les statistiques immédiatement
                    const statsStartTime = performance.now();
                    this.getTotalTransactions(); // Calcule et met en cache
                    this.getMatchRate(); // Calcule et met en cache
                    
                    // NE PAS précharger automatiquement - Lazy Loading uniquement à l'activation de l'onglet
                    // Cela évite de charger des données inutiles si l'utilisateur ne visite pas tous les onglets
                    
                    // Forcer l'affichage immédiat des résultats après l'initialisation
                    const detectChangesStartTime = performance.now();
                    
                    // Vérifier que les données paginées sont bien initialisées
                    
                    // Forcer le rendu immédiatement (sans attendre requestAnimationFrame)
                    // Avec OnPush, on doit forcer detectChanges() pour garantir le rendu
                    this.cdr.markForCheck();
                    this.cdr.detectChanges();
                    
                    // Utiliser requestAnimationFrame pour un rendu supplémentaire après le cycle actuel
                    requestAnimationFrame(() => {
                        this.cdr.markForCheck();
                        const detectChangesDuration = performance.now() - detectChangesStartTime;
                    });
                    
                    const totalInitDuration = performance.now() - initDataStartTime;
                } else {
                    // Pas de résultats : purger l'affichage des anciens résultats
                    this.response = null;
                    this.filteredMatches = [];
                    this.filteredBoOnly = [];
                    this.filteredPartnerOnly = [];
                    this.matchesLoaded = false;
                    this.boOnlyLoaded = false;
                    this.partnerOnlyLoaded = false;
                    this.reconciliationTabsService.clearAllData();
                    this.invalidateCache();
                    this.cdr.markForCheck();
                    this.cdr.detectChanges();
                }
            })
        );

        // Écouter les changements de progression
        this.subscription.add(
            this.appStateService.getReconciliationProgress().subscribe((showProgress: boolean) => {
                this.showProgress = showProgress;
                if (showProgress) {
                    this.startTime = this.appStateService.getReconciliationStartTime();
                    this.progressPercentage = 0;
                    this.processedRecords = 0;
                    this.listenToRealProgress();
                }
                this.cdr.detectChanges();
            })
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
        this.exportOptimizedProgressSub?.unsubscribe();
        this.exportOptimizedProgressSub = undefined;
    }

    private initializeFilteredData(options: { skipDeferredMagicBootstrap?: boolean } = {}) {
        const startTime = performance.now();

        if (
            !options.skipDeferredMagicBootstrap &&
            this.isMagicServiceView() &&
            this.shouldDeferMagicHeavyFilters()
        ) {
            this.bootstrapMagicFilteredDataForFastDisplay();
            setTimeout(() => this.initializeFilteredData({ skipDeferredMagicBootstrap: true }), 0);
            return;
        }
        
        // Récupérer le jobId depuis le service
        const jobIdStartTime = performance.now();
        this.currentJobId = this.reconciliationService.getCurrentJobId();
        
        // Pour les fichiers volumineux, initialiser les tableaux vides
        // Les données détaillées seront chargées à la demande
        const initArraysStartTime = performance.now();
        this.filteredMatches = [];
        this.filteredBoOnly = [];
        this.filteredPartnerOnly = [];
        
        // Réinitialiser les flags de chargement
        this.matchesLoaded = false;
        this.boOnlyLoaded = false;
        this.partnerOnlyLoaded = false;
        
        // Si les données sont déjà présentes dans la réponse (petits fichiers), les utiliser et mettre en cache
        const filterMatchesStartTime = performance.now();
        if (this.response?.matches && this.response.matches.length > 0) {
            this.filteredMatches = this.getFilteredMatches();
            this.matchesLoaded = true;
            this.setCache('matches', this.filteredMatches);
            this.updateCalculatedProperties(true); // Skip pagedDataUpdate (sera fait à la fin)
        } else {
            this.updateCalculatedProperties(true); // Skip pagedDataUpdate (sera fait à la fin)
        }
        
        const filterBoOnlyStartTime = performance.now();
        if ((this.response?.mismatches && this.response.mismatches.length > 0) || 
            (this.response?.boOnly && this.response.boOnly.length > 0)) {
            const totalBoOnly = (this.response?.mismatches?.length || 0) + (this.response?.boOnly?.length || 0);
            this.filteredBoOnly = this.getFilteredBoOnly();
            this.boOnlyLoaded = true;
            this.setCache('boOnly', this.filteredBoOnly);
            this.updateCalculatedProperties(true); // Skip pagedDataUpdate (sera fait à la fin)
        } else {
            this.updateCalculatedProperties(true); // Skip pagedDataUpdate (sera fait à la fin)
        }
        
        const filterPartnerOnlyStartTime = performance.now();
        if (this.response?.partnerOnly && this.response.partnerOnly.length > 0) {
            this.filteredPartnerOnly = this.getFilteredPartnerOnly();
            this.partnerOnlyLoaded = true;
            this.setCache('partnerOnly', this.filteredPartnerOnly);
            this.updateCalculatedProperties(true); // Skip pagedDataUpdate (sera fait à la fin)
        } else {
            this.updateCalculatedProperties(true); // Skip pagedDataUpdate (sera fait à la fin)
        }
        
        // Partager les données filtrées avec le service pour le rapport
        const shareDataStartTime = performance.now();
        this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
        this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
        this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
        this.reconciliationTabsService.setFilteredMismatches(this.response?.mismatches || []);
        this.syncMagicViewContextToTabsService();
        if (!this.isMagicServiceView() && !this.shouldApplyServicePartition()) {
            this.reconciliationTabsService.setMagicViewContext('', '');
            this.appStateService.setSelectedMagicService('');
        }
        
        const totalDuration = performance.now() - startTime;
        
        // Désactiver le flag d'initialisation
        this.isInitializing = false;
        
        // Invalider les caches de volumes pour forcer le recalcul
        this.cachedTotalVolumeBo = null;
        this.cachedTotalVolumePartner = null;
        this.cachedVolumeDifference = null;
        
        // Invalider les caches de statistiques pour forcer le recalcul
        this.cachedTotalTransactions = null;
        this.cachedMatchRate = null;
        
        // Mettre à jour les données paginées une seule fois à la fin de l'initialisation
        // Pour tous les volumes, différer le calcul du cache des clés pour un affichage instantané
        const updatePagedStartTime = performance.now();
        
        this.updatePagedData(true); // Skip keys cache (sera calculé de manière asynchrone en arrière-plan)
        const updatePagedDuration = performance.now() - updatePagedStartTime;
        
        // Forcer l'affichage immédiat des résultats (sans attendre les calculs de volumes)
        const forceRenderStartTime = performance.now();
        // Forcer le rendu immédiatement (sans attendre requestAnimationFrame)
        this.cdr.markForCheck();
        this.cdr.detectChanges();
        
        // Démarrer le calcul asynchrone des volumes en arrière-plan
        this.calculateVolumesAsync();
        
        // Marquer pour un rendu supplémentaire au prochain cycle (évite un second rendu
        // synchrone redondant qui re-évalue tous les bindings du template).
        requestAnimationFrame(() => {
            this.cdr.markForCheck();
            const forceRenderDuration = performance.now() - forceRenderStartTime;
        });
        
        this.prefetchEcartCountsIfNeeded();
        
        const totalInitDuration = performance.now() - startTime;
    }

    /**
     * Charge les écarts BO/Partenaire en arrière-plan pour aligner les compteurs /results avec /ecart-bo et /ecart-partner.
     */
    private prefetchEcartCountsIfNeeded(): void {
        const sessionId =
            this.response?.progressSessionId ||
            this.currentJobId ||
            this.reconciliationService.getCurrentJobId();
        if (!sessionId) {
            return;
        }

        const expectedBo = this.getResponseBoOnlyTotal();
        const expectedPartner = this.response?.totalPartnerOnly ?? 0;
        const needsBo = !this.boOnlyLoaded && (this.response?.resultsPaginated || expectedBo > 0);
        const needsPartner = !this.partnerOnlyLoaded && (this.response?.resultsPaginated || expectedPartner > 0);
        if (!needsBo && !needsPartner) {
            return;
        }

        void (async () => {
            try {
                if (needsBo) {
                    const ecarts = await this.reconciliationService.loadBoEcartsFromSession(sessionId);
                    if (this.response) {
                        this.response = {
                            ...this.response,
                            boOnly: ecarts.boOnly,
                            mismatches: ecarts.mismatches
                        };
                    }
                    this.filteredBoOnly = this.getFilteredBoOnly();
                    this.boOnlyLoaded = true;
                    this.setCache('boOnly', this.filteredBoOnly);
                    this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
                    this.reconciliationTabsService.setFilteredMismatches(ecarts.mismatches);
                }
                if (needsPartner) {
                    const partnerOnly = await this.reconciliationService.loadPartnerOnlyFromSession(sessionId);
                    if (this.response) {
                        this.response = { ...this.response, partnerOnly };
                    }
                    this.filteredPartnerOnly = this.getFilteredPartnerOnly();
                    this.partnerOnlyLoaded = true;
                    this.setCache('partnerOnly', this.filteredPartnerOnly);
                    this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
                }
                this.updateCalculatedProperties();
                this.cdr.markForCheck();
            } catch {
                // L'écran dédié rechargera à la demande
            }
        })();
    }

    private shouldDeferMagicHeavyFilters(): boolean {
        const matches = this.response?.matches?.length ?? 0;
        const boOnly = (this.response?.boOnly?.length ?? 0) + (this.response?.mismatches?.length ?? 0);
        const partnerOnly = this.response?.partnerOnly?.length ?? 0;
        return matches > 1500 || boOnly > 1500 || partnerOnly > 1500;
    }

    /** Affiche immédiatement les KPI magiques (résumés par service) avant le filtrage complet. */
    private bootstrapMagicFilteredDataForFastDisplay(): void {
        this.currentJobId = this.reconciliationService.getCurrentJobId();
        this.filteredMatches = [];
        this.filteredBoOnly = [];
        this.filteredPartnerOnly = [];
        this.matchesLoaded = false;
        this.boOnlyLoaded = false;
        this.partnerOnlyLoaded = false;

        const summary = this.findActiveMagicSummary();
        if (summary) {
            this.filteredMatchesCount = summary.totalMatches;
            this.filteredBoOnlyCount = summary.totalBoOnly;
            this.filteredPartnerOnlyCount = summary.totalPartnerOnly;
            this.totalMatchesPages = Math.max(1, Math.ceil(this.filteredMatchesCount / this.pageSize));
            this.totalBoOnlyPages = Math.max(1, Math.ceil(this.filteredBoOnlyCount / this.pageSize));
            this.totalPartnerOnlyPages = Math.max(1, Math.ceil(this.filteredPartnerOnlyCount / this.pageSize));
        }

        this.syncMagicViewContextToTabsService();
        this.isInitializing = false;
        this.cachedTotalTransactions = null;
        this.cachedMatchRate = null;
        this.getTotalTransactions();
        this.getMatchRate();
        this.updatePagedData(true);
        this.cdr.markForCheck();
        this.cdr.detectChanges();
        this.calculateVolumesAsync();
    }
    
    /**
     * Génère une clé de cache basée sur les données de réponse
     */
    private generateCacheKey(): string {
        if (!this.response) return '';
        const magicScope = this.isMagicServiceView() || this.getActiveServiceFilter()
            ? `${this.getActiveServiceFilter()}|${this.selectedMagicPartnerFile || ''}`
            : '';
        return `${this.response.totalMatches}_${this.response.totalBoOnly}_${this.response.totalPartnerOnly}_${this.response.totalMismatches}_${magicScope}`;
    }
    
    /**
     * Vérifie si le cache est valide
     */
    private isCacheValid(): boolean {
        const newCacheKey = this.generateCacheKey();
        return this.cacheKey === newCacheKey && 
               this.matchesCache !== null && 
               this.boOnlyCache !== null && 
               this.partnerOnlyCache !== null;
    }
    
    /**
     * Récupère les données depuis le cache si disponible
     */
    private getFromCache(type: 'matches' | 'boOnly' | 'partnerOnly'): any[] | null {
        if (!this.isCacheValid()) {
            return null;
        }
        
        switch (type) {
            case 'matches':
                return this.matchesCache;
            case 'boOnly':
                return this.boOnlyCache;
            case 'partnerOnly':
                return this.partnerOnlyCache;
            default:
                return null;
        }
    }
    
    /**
     * Met en cache les données
     */
    private setCache(type: 'matches' | 'boOnly' | 'partnerOnly', data: any[]): void {
        this.cacheKey = this.generateCacheKey();
        switch (type) {
            case 'matches':
                this.matchesCache = data;
                break;
            case 'boOnly':
                this.boOnlyCache = data;
                break;
            case 'partnerOnly':
                this.partnerOnlyCache = data;
                break;
        }
    }

    onSearch() {
        const searchStartTime = performance.now();
        const searchTerm = this.searchKey.toLowerCase().trim();
        
        if (this.activeTab === 'matches') {
            const base = this.getFilteredMatches();
            this.filteredMatches = searchTerm
                ? base.filter(match => match.key.toLowerCase().includes(searchTerm))
                : base;
            this.matchesPage = 1;
            this.cachedPagedMatches = null;
            this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
        } else if (this.activeTab === 'boOnly') {
            const base = this.getFilteredBoOnly();
            this.filteredBoOnly = searchTerm
                ? base.filter(record =>
                    Object.values(record).some(value =>
                        value.toString().toLowerCase().includes(searchTerm)
                    )
                )
                : base;
            this.boOnlyPage = 1;
            this.cachedPagedBoOnly = null;
            this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
        } else if (this.activeTab === 'partnerOnly') {
            const base = this.getFilteredPartnerOnly();
            this.filteredPartnerOnly = searchTerm
                ? base.filter(record =>
                    Object.values(record).some(value =>
                        value.toString().toLowerCase().includes(searchTerm)
                    )
                )
                : base;
            this.partnerOnlyPage = 1;
            this.cachedPagedPartnerOnly = null;
            this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
        }
        
        // Mettre à jour les propriétés calculées une seule fois à la fin
        this.updateCalculatedProperties();
        
        const searchDuration = performance.now() - searchStartTime;
        this.cdr.markForCheck();
    }

    // Cache pour les pages paginées (évite les recalculs)
    private cachedPagedMatches: Match[] | null = null;
    private cachedPagedBoOnly: Record<string, string>[] | null = null;
    private cachedPagedPartnerOnly: Record<string, string>[] | null = null;
    private cachedMatchesPage: number = -1;
    private cachedBoOnlyPage: number = -1;
    private cachedPartnerOnlyPage: number = -1;

    /** Totaux BO (écarts BO uniquement) depuis la réponse serveur. */
    private getResponseBoOnlyTotal(): number {
        const response = this.response;
        if (!response) {
            return 0;
        }
        if (response.totalBoOnly != null) {
            return response.totalBoOnly ?? 0;
        }
        return (response.boOnly?.length ?? 0);
    }

    /**
     * Compte affiché : tableaux filtrés si chargés, sinon totaux serveur (réponse paginée/tronquée).
     * Ne jamais afficher le total serveur non filtré lorsque le cloisonnement magique est actif.
     */
    private resolveDisplayCount(
        filteredLength: number,
        totalFromResponse: number | undefined | null,
        dataLoaded: boolean
    ): number {
        if (this.shouldPartitionEcarts()) {
            return filteredLength;
        }
        if (dataLoaded || filteredLength > 0) {
            return filteredLength;
        }
        return totalFromResponse ?? 0;
    }
    
    /**
     * Met à jour les propriétés calculées pour éviter les recalculs dans le template
     * @param skipPagedDataUpdate Si true, ne met pas à jour les données paginées (pour éviter les recalculs multiples pendant l'initialisation)
     */
    private updateCalculatedProperties(skipPagedDataUpdate: boolean = false): void {
        const updateStartTime = performance.now();
        
        const step1Start = performance.now();
        if (this.isMagicServiceView()) {
            const summary = this.findActiveMagicSummary();
            this.filteredMatchesCount = this.matchesLoaded ? this.filteredMatches.length : (summary?.totalMatches ?? this.filteredMatches.length);
            this.filteredBoOnlyCount = this.boOnlyLoaded ? this.filteredBoOnly.length : (summary?.totalBoOnly ?? this.filteredBoOnly.length);
            this.filteredPartnerOnlyCount = this.partnerOnlyLoaded ? this.filteredPartnerOnly.length : (summary?.totalPartnerOnly ?? this.filteredPartnerOnly.length);
        } else {
            this.filteredMatchesCount = this.resolveDisplayCount(
                this.filteredMatches.length,
                this.response?.totalMatches,
                this.matchesLoaded
            );
            this.filteredBoOnlyCount = this.resolveDisplayCount(
                this.filteredBoOnly.length,
                this.getResponseBoOnlyTotal(),
                this.boOnlyLoaded
            );
            this.filteredPartnerOnlyCount = this.resolveDisplayCount(
                this.filteredPartnerOnly.length,
                this.response?.totalPartnerOnly,
                this.partnerOnlyLoaded
            );
        }
        const step1Duration = performance.now() - step1Start;
        
        const step2Start = performance.now();
        this.totalMatchesPages = Math.max(1, Math.ceil(this.filteredMatchesCount / this.pageSize));
        this.totalBoOnlyPages = Math.max(1, Math.ceil(this.filteredBoOnlyCount / this.pageSize));
        this.totalPartnerOnlyPages = Math.max(1, Math.ceil(this.filteredPartnerOnlyCount / this.pageSize));
        const step2Duration = performance.now() - step2Start;
        
        // Étape 2.5: Mettre à jour matchRate et totalTransactions
        const step2_5Start = performance.now();
        // Invalider le cache pour forcer le recalcul
        this.cachedMatchRate = null;
        this.cachedTotalTransactions = null;
        // Appeler les méthodes pour calculer et mettre à jour les propriétés
        this.getTotalTransactions();
        this.getMatchRate();
        const step2_5Duration = performance.now() - step2_5Start;
        
        // Mettre à jour les pages paginées uniquement si demandé (évite les recalculs multiples pendant l'initialisation)
        if (!skipPagedDataUpdate && !this.isInitializing) {
            const step3Start = performance.now();
            this.updatePagedData();
            const step3Duration = performance.now() - step3Start;
        } else {
        }
        
        const updateDuration = performance.now() - updateStartTime;
    }
    
    /**
     * Met à jour les données paginées et précalcule les clés pour chaque match
     * @param skipKeysCache Si true, ne calcule pas le cache des clés (pour l'initialisation rapide)
     */
    private updatePagedData(skipKeysCache: boolean = false): void {
        const updateStartTime = performance.now();
        
        // Mettre à jour les pages paginées
        const step1Start = performance.now();
        
        // Initialiser directement les données paginées pour un affichage immédiat
        const matchesStart = (this.matchesPage - 1) * this.pageSize;
        const matchesEnd = matchesStart + this.pageSize;
        this.pagedMatches = (this.filteredMatches || []).slice(matchesStart, matchesEnd);
        this.cachedPagedMatches = this.pagedMatches;
        this.cachedMatchesPage = this.matchesPage;
        
        const boOnlyStart = (this.boOnlyPage - 1) * this.pageSize;
        const boOnlyEnd = boOnlyStart + this.pageSize;
        this.pagedBoOnly = (this.filteredBoOnly || []).slice(boOnlyStart, boOnlyEnd);
        this.cachedPagedBoOnly = this.pagedBoOnly;
        this.cachedBoOnlyPage = this.boOnlyPage;
        
        const partnerOnlyStart = (this.partnerOnlyPage - 1) * this.pageSize;
        const partnerOnlyEnd = partnerOnlyStart + this.pageSize;
        this.pagedPartnerOnly = (this.filteredPartnerOnly || []).slice(partnerOnlyStart, partnerOnlyEnd);
        this.cachedPagedPartnerOnly = this.pagedPartnerOnly;
        this.cachedPartnerOnlyPage = this.partnerOnlyPage;
        
        const step1Duration = performance.now() - step1Start;
        
        // Précalculer les clés pour chaque match de la page actuelle (évite les recalculs dans *ngFor)
        // Pour les gros volumes, différer ce calcul pour ne pas bloquer l'UI
        if (!skipKeysCache && !this.isUpdatingKeysCache) {
            // Utiliser un seul setTimeout pour éviter les appels multiples
            if (!this.keysCacheUpdatePromise) {
                this.isUpdatingKeysCache = true;
                this.keysCacheUpdatePromise = new Promise<void>((resolve) => {
                    setTimeout(async () => {
                        await this.updateKeysCache();
                        this.isUpdatingKeysCache = false;
                        this.keysCacheUpdatePromise = null;
                        resolve();
                    }, 0);
                });
            }
        }
        
        const totalDuration = performance.now() - updateStartTime;
        
        // Forcer le rendu IMMÉDIAT après la mise à jour des données paginées (sans attendre requestAnimationFrame)
        this.cdr.markForCheck();
        this.cdr.detectChanges(); // Forcer immédiatement le rendu
        
        // Marquer pour un rendu supplémentaire au prochain cycle (évite un second rendu
        // synchrone redondant qui re-évalue tous les bindings du template).
        requestAnimationFrame(() => {
            this.cdr.markForCheck();
        });
    }
    
    /**
     * Met à jour le cache des clés pour les matches de la page actuelle
     * Utilise un traitement par chunks pour ne pas bloquer l'UI
     * Prévention des appels multiples avec un flag
     */
    private async updateKeysCache(): Promise<void> {
        // Vérifier si une mise à jour est déjà en cours
        if (this.isUpdatingKeysCache) {
            return;
        }
        
        this.isUpdatingKeysCache = true;
        const cacheStartTime = performance.now();
        
        // Ne pas nettoyer le cache immédiatement, seulement les entrées obsolètes
        const matchesToCache = this.pagedMatches;
        
        // Si pas de matches, ne rien faire
        if (matchesToCache.length === 0) {
            this.isUpdatingKeysCache = false;
            return;
        }
        
        // Nettoyer uniquement les entrées qui ne sont plus dans la page actuelle
        const currentMatchKeys = new Set(matchesToCache.map(m => m.key || JSON.stringify(m.boData)));
        for (const [key] of this.matchKeysCache) {
            if (!currentMatchKeys.has(key)) {
                this.matchKeysCache.delete(key);
            }
        }
        
        const CACHE_CHUNK_SIZE = 5; // Réduire la taille du chunk pour plus de réactivité
        
        try {
            for (let i = 0; i < matchesToCache.length; i += CACHE_CHUNK_SIZE) {
                const chunk = matchesToCache.slice(i, i + CACHE_CHUNK_SIZE);
                
                // Traiter le chunk
                for (const match of chunk) {
                    const matchKey = match.key || JSON.stringify(match.boData);
                    if (!this.matchKeysCache.has(matchKey)) {
                        this.matchKeysCache.set(matchKey, {
                            boKeys: this.getBoKeys(match),
                            partnerKeys: this.getPartnerKeys(match),
                            hasDifferences: this.hasDifferences(match)
                        });
                    }
                }
                
                // Yield au navigateur après chaque chunk pour maintenir la réactivité
                if (i + CACHE_CHUNK_SIZE < matchesToCache.length) {
                    await this.yieldToBrowser();
                }
            }
        } finally {
            this.isUpdatingKeysCache = false;
        }
        
        const cacheDuration = performance.now() - cacheStartTime;
        if (cacheDuration > 1) {
        }
        
        // Marquer pour détection de changement uniquement si nécessaire
        if (matchesToCache.length > 0) {
            requestAnimationFrame(() => {
                this.cdr.markForCheck();
            });
        }
    }
    
    /**
     * Récupère les clés BO depuis le cache
     */
    getCachedBoKeys(match: Match): string[] {
        const matchKey = match.key || JSON.stringify(match.boData);
        const cached = this.matchKeysCache.get(matchKey);
        return cached?.boKeys || this.getBoKeys(match);
    }
    
    /**
     * Récupère les clés Partenaire depuis le cache
     */
    getCachedPartnerKeys(match: Match): string[] {
        const matchKey = match.key || JSON.stringify(match.boData);
        const cached = this.matchKeysCache.get(matchKey);
        return cached?.partnerKeys || this.getPartnerKeys(match);
    }
    
    /**
     * Récupère hasDifferences depuis le cache
     */
    getCachedHasDifferences(match: Match): boolean {
        const matchKey = match.key || JSON.stringify(match.boData);
        const cached = this.matchKeysCache.get(matchKey);
        return cached?.hasDifferences ?? this.hasDifferences(match);
    }
    
    // Modifier les méthodes de pagination pour utiliser les données filtrées avec cache
    getPagedMatches(): Match[] {
        // Vérifier le cache
        if (this.cachedPagedMatches && this.cachedMatchesPage === this.matchesPage) {
            return this.cachedPagedMatches;
        }
        
        const start = (this.matchesPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.cachedPagedMatches = (this.filteredMatches || []).slice(start, end);
        this.cachedMatchesPage = this.matchesPage;
        
        // Log pour debug
        if (this.cachedPagedMatches.length > 0) {
        }
        
        return this.cachedPagedMatches;
    }

    getPagedBoOnly(): Record<string, string>[] {
        // Vérifier le cache
        if (this.cachedPagedBoOnly && this.cachedBoOnlyPage === this.boOnlyPage) {
            return this.cachedPagedBoOnly;
        }
        
        const start = (this.boOnlyPage - 1) * this.pageSize;
        this.cachedPagedBoOnly = this.filteredBoOnly.slice(start, start + this.pageSize);
        this.cachedBoOnlyPage = this.boOnlyPage;
        return this.cachedPagedBoOnly;
    }

    getPagedPartnerOnly(): Record<string, string>[] {
        // Vérifier le cache
        if (this.cachedPagedPartnerOnly && this.cachedPartnerOnlyPage === this.partnerOnlyPage) {
            return this.cachedPagedPartnerOnly;
        }
        
        const start = (this.partnerOnlyPage - 1) * this.pageSize;
        this.cachedPagedPartnerOnly = this.filteredPartnerOnly.slice(start, start + this.pageSize);
        this.cachedPartnerOnlyPage = this.partnerOnlyPage;
        return this.cachedPagedPartnerOnly;
    }
    
    // TrackBy functions pour optimiser *ngFor
    trackByMatchKey(index: number, match: Match): string {
        return match.key || `match-${index}`;
    }
    
    trackByRecordKey(index: number, record: Record<string, string>): string {
        const key = record['IDTransaction'] || record['Référence'] || record['CLE'] || `record-${index}`;
        return key.toString();
    }
    
    trackByString(index: number, item: string): string {
        return item;
    }
    
    trackByAgencyName(index: number, summary: any): string {
        return `${summary.agency}|${summary.service}|${summary.country}`;
    }
    
    trackByServiceName(index: number, service: any): string {
        return service.name;
    }

    getTotalPages(type: 'matches' | 'boOnly' | 'partnerOnly') {
        // Utiliser les propriétés calculées au lieu de recalculer
        switch (type) {
            case 'matches':
                return this.totalMatchesPages;
            case 'boOnly':
                return this.totalBoOnlyPages;
            case 'partnerOnly':
                return this.totalPartnerOnlyPages;
            default:
                return 1;
        }
    }

    setActiveTab(tab: 'matches' | 'boOnly' | 'partnerOnly' | 'agencySummary') {
        const tabSwitchStartTime = performance.now();
        
        const setActiveTabStartTime = performance.now();
        this.activeTab = tab;
        this.agencyPage = 1;
        const setActiveTabDuration = performance.now() - setActiveTabStartTime;
        
        // Lazy Loading : Charger les données uniquement à l'activation de l'onglet
        // Prévention des doublons : vérifier qu'un chargement n'est pas déjà en cours
        if (tab === 'matches' && !this.matchesLoaded && !this.isLoadingMatches) {
            const lazyLoadStartTime = performance.now();
            const cacheKey = 'matches';
            
            const cacheCheckStartTime = performance.now();
            const cachedData = this.getFromCache('matches');
            const cacheCheckDuration = performance.now() - cacheCheckStartTime;
            
            if (cachedData) {
                const cacheLoadStartTime = performance.now();
                this.filteredMatches = cachedData;
                this.matchesLoaded = true;
                
                const updatePropsStartTime = performance.now();
                this.updateCalculatedProperties(); // Mettre à jour les propriétés calculées
                const updatePropsDuration = performance.now() - updatePropsStartTime;
                
                const shareDataStartTime = performance.now();
                this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
                const shareDataDuration = performance.now() - shareDataStartTime;
                
                const cacheLoadDuration = performance.now() - cacheLoadStartTime;
            } else if (!this.loadingPromises.has(cacheKey)) {
                const asyncLoadStartTime = performance.now();
                // Créer une promesse de chargement pour éviter les doublons
                const loadPromise = this.loadMatchesDataLazy();
                this.loadingPromises.set(cacheKey, loadPromise);
                loadPromise.finally(() => {
                    this.loadingPromises.delete(cacheKey);
                    const asyncLoadDuration = performance.now() - asyncLoadStartTime;
                });
            } else {
                this.loadingPromises.get(cacheKey)?.then(() => {
                });
            }
            const lazyLoadDuration = performance.now() - lazyLoadStartTime;
        } else if (tab === 'boOnly' && !this.boOnlyLoaded && !this.isLoadingBoOnly) {
            const lazyLoadStartTime = performance.now();
            const cacheKey = 'boOnly';
            
            const cacheCheckStartTime = performance.now();
            const cachedData = this.getFromCache('boOnly');
            const cacheCheckDuration = performance.now() - cacheCheckStartTime;
            
            if (cachedData) {
                const cacheLoadStartTime = performance.now();
                this.filteredBoOnly = cachedData;
                this.boOnlyLoaded = true;
                
                const updatePropsStartTime = performance.now();
                this.updateCalculatedProperties(); // Mettre à jour les propriétés calculées
                const updatePropsDuration = performance.now() - updatePropsStartTime;
                
                const shareDataStartTime = performance.now();
                this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
                const shareDataDuration = performance.now() - shareDataStartTime;
                
                const cacheLoadDuration = performance.now() - cacheLoadStartTime;
            } else if (!this.loadingPromises.has(cacheKey)) {
                const asyncLoadStartTime = performance.now();
                const loadPromise = this.loadBoOnlyDataLazy();
                this.loadingPromises.set(cacheKey, loadPromise);
                loadPromise.finally(() => {
                    this.loadingPromises.delete(cacheKey);
                    const asyncLoadDuration = performance.now() - asyncLoadStartTime;
                });
            }
            const lazyLoadDuration = performance.now() - lazyLoadStartTime;
        } else if (tab === 'partnerOnly' && !this.partnerOnlyLoaded && !this.isLoadingPartnerOnly) {
            const lazyLoadStartTime = performance.now();
            const cacheKey = 'partnerOnly';
            
            const cacheCheckStartTime = performance.now();
            const cachedData = this.getFromCache('partnerOnly');
            const cacheCheckDuration = performance.now() - cacheCheckStartTime;
            
            if (cachedData) {
                const cacheLoadStartTime = performance.now();
                this.filteredPartnerOnly = cachedData;
                this.partnerOnlyLoaded = true;
                
                const updatePropsStartTime = performance.now();
                this.updateCalculatedProperties(); // Mettre à jour les propriétés calculées
                const updatePropsDuration = performance.now() - updatePropsStartTime;
                
                const shareDataStartTime = performance.now();
                this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
                const shareDataDuration = performance.now() - shareDataStartTime;
                
                const cacheLoadDuration = performance.now() - cacheLoadStartTime;
            } else if (!this.loadingPromises.has(cacheKey)) {
                const asyncLoadStartTime = performance.now();
                const loadPromise = this.loadPartnerOnlyDataLazy();
                this.loadingPromises.set(cacheKey, loadPromise);
                loadPromise.finally(() => {
                    this.loadingPromises.delete(cacheKey);
                    const asyncLoadDuration = performance.now() - asyncLoadStartTime;
                });
            }
            const lazyLoadDuration = performance.now() - lazyLoadStartTime;
        }
        
        const markForCheckStartTime = performance.now();
        // Détection des changements immédiate pour un affichage instantané
        // Avec OnPush, markForCheck() est suffisant et plus rapide
        this.cdr.markForCheck();
        const markForCheckDuration = performance.now() - markForCheckStartTime;
        
        const tabSwitchDuration = performance.now() - tabSwitchStartTime;
    }
    
    /**
     * Charge les données de matches avec lazy loading et traitement par chunks
     */
    private async loadMatchesDataLazy(): Promise<void> {
        const loadStartTime = performance.now();
        
        // Vérifier le cache d'abord
        const cachedData = this.getFromCache('matches');
        if (cachedData) {
            this.filteredMatches = cachedData;
            this.matchesLoaded = true;
            this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
            return;
        }
        
        // Si les données sont déjà dans la réponse (petits fichiers), les utiliser
        if (this.response?.matches && this.response.matches.length > 0) {
            this.filteredMatches = this.getFilteredMatches();
            this.matchesLoaded = true;
            this.setCache('matches', this.filteredMatches);
            this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
            return;
        }
        
        if (!this.currentJobId) {
            this.currentJobId = this.reconciliationService.getCurrentJobId();
        }
        
        if (!this.currentJobId) {
            return;
        }
        
        this.isLoadingMatches = true;
        this.loadingProgress.matches = { current: 0, total: 0, percentage: 0 };
        this.cdr.detectChanges();
        
        try {
            // Charger toutes les pages avec traitement par chunks
            await this.loadAllMatchesChunked(0, [], loadStartTime);
        } catch (error) {
            this.isLoadingMatches = false;
            this.cdr.detectChanges();
        }
    }
    
    /**
     * Charge toutes les matches par pages avec traitement asynchrone par chunks
     */
    private async loadAllMatchesChunked(page: number, accumulatedMatches: Match[], overallStartTime: number): Promise<void> {
        const pageStartTime = performance.now();
        
        return new Promise((resolve, reject) => {
            this.reconciliationService.getMatches(this.currentJobId!, page, this.CHUNK_SIZE).subscribe({
                next: async (response) => {
                    const receiveTime = performance.now();
                    const networkDuration = receiveTime - pageStartTime;
                    
                    // Mettre à jour la progression
                    this.loadingProgress.matches.total = response.total;
                    this.loadingProgress.matches.current = accumulatedMatches.length + response.matches.length;
                    this.loadingProgress.matches.percentage = Math.round((this.loadingProgress.matches.current / this.loadingProgress.matches.total) * 100);
                    
                    // Traitement par chunks avec yield au navigateur
                    const processStartTime = performance.now();
                    await this.processChunked(response.matches, accumulatedMatches, 'matches');
                    const processDuration = performance.now() - processStartTime;
                    
                    
                    // Mettre à jour l'UI périodiquement
                    if (page % 5 === 0 || page + 1 >= response.totalPages) {
                        requestAnimationFrame(() => {
                            this.cdr.markForCheck();
                            this.cdr.detectChanges();
                        });
                    }
                    
                    if (page + 1 < response.totalPages) {
                        // Yield au navigateur avant de charger la page suivante
                        await this.yieldToBrowser();
                        await this.loadAllMatchesChunked(page + 1, accumulatedMatches, overallStartTime);
                        resolve();
                    } else {
                        // Toutes les données sont chargées
                        const finalizeStartTime = performance.now();
                        this.response = {
                            ...this.response!,
                            matches: accumulatedMatches
                        };
                        
                        const filterStartTime = performance.now();
                        this.filteredMatches = this.getFilteredMatches();
                        const filterDuration = performance.now() - filterStartTime;
                        
                        // Mettre en cache
                        this.setCache('matches', this.filteredMatches);
                        
                        this.matchesLoaded = true;
                        this.isLoadingMatches = false;
                        this.updateCalculatedProperties(); // Mettre à jour les propriétés calculées
                        
                        const shareStartTime = performance.now();
                        this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
                        this.appStateService.setReconciliationResults(this.response!);
                        const shareDuration = performance.now() - shareStartTime;
                        
                        const totalDuration = performance.now() - overallStartTime;
                        
                        // Dernière mise à jour UI
                        requestAnimationFrame(() => {
                            this.cdr.markForCheck();
                            this.cdr.detectChanges();
                        });
                        
                        resolve();
                    }
                },
                error: (error) => {
                    const errorDuration = performance.now() - pageStartTime;
                    this.isLoadingMatches = false;
                    this.cdr.detectChanges();
                    reject(error);
                }
            });
        });
    }
    
    /**
     * Traite les données reçues (une page API) en un seul push pour éviter les yields inutiles.
     * Le yield entre pages est déjà géré dans loadAll*Chunked.
     */
    private async processChunked<T>(data: T[], accumulator: T[], _type: 'matches' | 'boOnly' | 'partnerOnly'): Promise<void> {
        if (data.length === 0) return;
        accumulator.push(...data);
        await this.yieldToBrowser();
    }
    
    /**
     * Yield au navigateur pour permettre le rendu
     */
    private yieldToBrowser(): Promise<void> {
        return new Promise(resolve => {
            setTimeout(() => {
                requestAnimationFrame(() => {
                    resolve();
                });
            }, this.YIELD_INTERVAL);
        });
    }
    
    /**
     * Charge toutes les matches par pages
     */
    private loadAllMatches(page: number, accumulatedMatches: Match[], overallStartTime: number): void {
        const pageStartTime = performance.now();
        
        this.reconciliationService.getMatches(this.currentJobId!, page, 1000).subscribe({
            next: (response) => {
                const receiveTime = performance.now();
                const networkDuration = receiveTime - pageStartTime;
                
                const pushStartTime = performance.now();
                accumulatedMatches.push(...response.matches);
                const pushDuration = performance.now() - pushStartTime;
                
                
                if (page + 1 < response.totalPages) {
                    // Charger la page suivante
                    this.loadAllMatches(page + 1, accumulatedMatches, overallStartTime);
                } else {
                    // Toutes les données sont chargées
                    const finalizeStartTime = performance.now();
                    this.response = {
                        ...this.response!,
                        matches: accumulatedMatches
                    };
                    
                    const filterStartTime = performance.now();
                    this.filteredMatches = this.getFilteredMatches();
                    const filterDuration = performance.now() - filterStartTime;
                    
                    this.matchesLoaded = true;
                    this.isLoadingMatches = false;
                    
                    const shareStartTime = performance.now();
                    // Partager les données filtrées
                    this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
                    const shareDuration = performance.now() - shareStartTime;
                    
                    const detectChangesStartTime = performance.now();
                    this.cdr.detectChanges();
                    const detectChangesDuration = performance.now() - detectChangesStartTime;
                    
                    const totalDuration = performance.now() - overallStartTime;
                }
            },
            error: (error) => {
                const errorDuration = performance.now() - pageStartTime;
                this.isLoadingMatches = false;
                this.cdr.detectChanges();
            }
        });
    }
    
    /**
     * Charge les données de boOnly avec lazy loading et traitement par chunks
     */
    private async loadBoOnlyDataLazy(): Promise<void> {
        const loadStartTime = performance.now();
        
        // Vérifier le cache d'abord
        const cachedData = this.getFromCache('boOnly');
        if (cachedData) {
            this.filteredBoOnly = cachedData;
            this.boOnlyLoaded = true;
            this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
            return;
        }
        
        // Si les données sont déjà dans la réponse, les utiliser
        if ((this.response?.mismatches && this.response.mismatches.length > 0) || 
            (this.response?.boOnly && this.response.boOnly.length > 0)) {
            this.filteredBoOnly = this.getFilteredBoOnly();
            this.boOnlyLoaded = true;
            this.setCache('boOnly', this.filteredBoOnly);
            this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
            return;
        }
        
        if (!this.currentJobId) {
            this.currentJobId = this.reconciliationService.getCurrentJobId();
        }
        
        if (!this.currentJobId) {
            return;
        }

        if (this.response?.resultsPaginated) {
            try {
                const ecarts = await this.reconciliationService.loadBoEcartsFromSession(this.currentJobId);
                if (this.response) {
                    this.response = {
                        ...this.response,
                        boOnly: ecarts.boOnly,
                        mismatches: ecarts.mismatches
                    };
                }
                this.filteredBoOnly = this.getFilteredBoOnly();
                this.boOnlyLoaded = true;
                this.setCache('boOnly', this.filteredBoOnly);
                this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
                this.reconciliationTabsService.setFilteredMismatches(ecarts.mismatches);
                this.updateCalculatedProperties();
                return;
            } catch {
                // Repli pagination page par page ci-dessous
            }
        }
        
        this.isLoadingBoOnly = true;
        this.boOnlyChunkedDone = false;
        this.mismatchesChunkedDone = false;
        this.loadingProgress.boOnly = { current: 0, total: 0, percentage: 0 };
        this.cdr.detectChanges();
        
        try {
            // Charger boOnly et mismatches en parallèle avec traitement par chunks
            await Promise.all([
                this.loadAllBoOnlyChunked(0, [], loadStartTime),
                this.loadAllMismatchesChunked(0, [], loadStartTime)
            ]);
        } catch (error) {
            this.isLoadingBoOnly = false;
            this.cdr.detectChanges();
        }
    }
    
    /**
     * Charge toutes les boOnly par pages avec traitement asynchrone par chunks
     */
    private async loadAllBoOnlyChunked(page: number, accumulatedBoOnly: Record<string, string>[], overallStartTime: number): Promise<void> {
        const pageStartTime = performance.now();
        
        return new Promise((resolve, reject) => {
            this.reconciliationService.getBoOnly(this.currentJobId!, page, this.CHUNK_SIZE).subscribe({
                next: async (response) => {
                    const receiveTime = performance.now();
                    const networkDuration = receiveTime - pageStartTime;
                    
                    // Mettre à jour la progression
                    this.loadingProgress.boOnly.total = response.total;
                    this.loadingProgress.boOnly.current = accumulatedBoOnly.length + response.boOnly.length;
                    this.loadingProgress.boOnly.percentage = Math.round((this.loadingProgress.boOnly.current / this.loadingProgress.boOnly.total) * 100);
                    
                    // Traitement par chunks avec yield au navigateur
                    const processStartTime = performance.now();
                    await this.processChunked(response.boOnly, accumulatedBoOnly, 'boOnly');
                    const processDuration = performance.now() - processStartTime;
                    
                    
                    if (page + 1 < response.totalPages) {
                        await this.yieldToBrowser();
                        await this.loadAllBoOnlyChunked(page + 1, accumulatedBoOnly, overallStartTime);
                        resolve();
                    } else {
                        this.response = { ...this.response!, boOnly: accumulatedBoOnly };
                        this.boOnlyChunkedDone = true;
                        this.tryFinalizeBoOnlyLoading(overallStartTime, accumulatedBoOnly.length, 'boOnly');
                        resolve();
                    }
                },
                error: (error) => {
                    const errorDuration = performance.now() - pageStartTime;
                    reject(error);
                }
            });
        });
    }
    
    /**
     * Finalise l'affichage des écarts BO une fois que boOnly et mismatches ont fini de charger.
     */
    private tryFinalizeBoOnlyLoading(overallStartTime: number, count: number, source: 'boOnly' | 'mismatches'): void {
        if (!this.boOnlyChunkedDone || !this.mismatchesChunkedDone) return;
        const filterStartTime = performance.now();
        this.filteredBoOnly = this.getFilteredBoOnly();
        const filterDuration = performance.now() - filterStartTime;
        this.setCache('boOnly', this.filteredBoOnly);
        this.boOnlyLoaded = true;
        this.isLoadingBoOnly = false;
        this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
        const totalDuration = performance.now() - overallStartTime;
        requestAnimationFrame(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
        });
    }
    
    /**
     * Charge toutes les mismatches par pages avec traitement asynchrone par chunks
     */
    private async loadAllMismatchesChunked(page: number, accumulatedMismatches: Record<string, string>[], overallStartTime: number): Promise<void> {
        const pageStartTime = performance.now();
        
        return new Promise((resolve, reject) => {
            this.reconciliationService.getMismatches(this.currentJobId!, page, this.CHUNK_SIZE).subscribe({
                next: async (response) => {
                    const receiveTime = performance.now();
                    const networkDuration = receiveTime - pageStartTime;
                    
                    // Traitement par chunks avec yield au navigateur
                    const processStartTime = performance.now();
                    await this.processChunked(response.mismatches, accumulatedMismatches, 'boOnly');
                    const processDuration = performance.now() - processStartTime;
                    
                    
                    if (page + 1 < response.totalPages) {
                        await this.yieldToBrowser();
                        await this.loadAllMismatchesChunked(page + 1, accumulatedMismatches, overallStartTime);
                        resolve();
                    } else {
                        this.response = { ...this.response!, mismatches: accumulatedMismatches };
                        this.mismatchesChunkedDone = true;
                        this.tryFinalizeBoOnlyLoading(overallStartTime, accumulatedMismatches.length, 'mismatches');
                        resolve();
                    }
                },
                error: (error) => {
                    const errorDuration = performance.now() - pageStartTime;
                    this.mismatchesChunkedDone = true;
                    this.tryFinalizeBoOnlyLoading(performance.now(), 0, 'mismatches');
                    resolve();
                }
            });
        });
    }
    
    /**
     * Charge toutes les boOnly par pages
     */
    private loadAllBoOnly(page: number, accumulatedBoOnly: Record<string, string>[], overallStartTime: number): void {
        const pageStartTime = performance.now();
        
        this.reconciliationService.getBoOnly(this.currentJobId!, page, 1000).subscribe({
            next: (response) => {
                const receiveTime = performance.now();
                const networkDuration = receiveTime - pageStartTime;
                
                const pushStartTime = performance.now();
                accumulatedBoOnly.push(...response.boOnly);
                const pushDuration = performance.now() - pushStartTime;
                
                
                if (page + 1 < response.totalPages) {
                    this.loadAllBoOnly(page + 1, accumulatedBoOnly, overallStartTime);
                } else {
                    // Mettre à jour la réponse avec les boOnly chargés
                    const finalizeStartTime = performance.now();
                    this.response = {
                        ...this.response!,
                        boOnly: accumulatedBoOnly
                    };
                    
                    // Vérifier si les mismatches sont aussi chargés
                    if (this.response.mismatches && this.response.mismatches.length > 0) {
                        const filterStartTime = performance.now();
                        this.filteredBoOnly = this.getFilteredBoOnly();
                        const filterDuration = performance.now() - filterStartTime;
                        
                        this.boOnlyLoaded = true;
                        this.isLoadingBoOnly = false;
                        
                        const shareStartTime = performance.now();
                        this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
                        const shareDuration = performance.now() - shareStartTime;
                        
                        const totalDuration = performance.now() - overallStartTime;
                        
                        // Différer detectChanges pour éviter de bloquer l'UI
                        setTimeout(() => {
                            requestAnimationFrame(() => {
                                const detectChangesStartTime = performance.now();
                                this.cdr.markForCheck();
                                this.cdr.detectChanges();
                                const detectChangesDuration = performance.now() - detectChangesStartTime;
                            });
                        }, 0);
                    }
                }
            },
            error: (error) => {
                const errorDuration = performance.now() - pageStartTime;
                this.isLoadingBoOnly = false;
                this.cdr.detectChanges();
            }
        });
    }
    
    /**
     * Charge toutes les mismatches par pages
     */
    private loadAllMismatches(page: number, accumulatedMismatches: Record<string, string>[], overallStartTime: number): void {
        const pageStartTime = performance.now();
        
        this.reconciliationService.getMismatches(this.currentJobId!, page, 1000).subscribe({
            next: (response) => {
                const receiveTime = performance.now();
                const networkDuration = receiveTime - pageStartTime;
                
                const pushStartTime = performance.now();
                accumulatedMismatches.push(...response.mismatches);
                const pushDuration = performance.now() - pushStartTime;
                
                
                if (page + 1 < response.totalPages) {
                    this.loadAllMismatches(page + 1, accumulatedMismatches, overallStartTime);
                } else {
                    // Mettre à jour la réponse avec les mismatches chargés
                    const finalizeStartTime = performance.now();
                    this.response = {
                        ...this.response!,
                        mismatches: accumulatedMismatches
                    };
                    
                    // Vérifier si les boOnly sont aussi chargés
                    if (this.response.boOnly && this.response.boOnly.length > 0) {
                        const filterStartTime = performance.now();
                        this.filteredBoOnly = this.getFilteredBoOnly();
                        const filterDuration = performance.now() - filterStartTime;
                        
                        this.boOnlyLoaded = true;
                        this.isLoadingBoOnly = false;
                        
                        const shareStartTime = performance.now();
                        this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
                        const shareDuration = performance.now() - shareStartTime;
                        
                        const totalDuration = performance.now() - overallStartTime;
                        
                        // Différer detectChanges pour éviter de bloquer l'UI
                        setTimeout(() => {
                            requestAnimationFrame(() => {
                                const detectChangesStartTime = performance.now();
                                this.cdr.markForCheck();
                                this.cdr.detectChanges();
                                const detectChangesDuration = performance.now() - detectChangesStartTime;
                            });
                        }, 0);
                    }
                }
            },
            error: (error) => {
                const errorDuration = performance.now() - pageStartTime;
                // Continuer même si les mismatches échouent
                if (this.response?.boOnly && this.response.boOnly.length > 0) {
                    this.filteredBoOnly = this.getFilteredBoOnly();
                    this.boOnlyLoaded = true;
                    this.isLoadingBoOnly = false;
                    this.cdr.detectChanges();
                }
            }
        });
    }
    
    /**
     * Charge les données de partnerOnly avec lazy loading et traitement par chunks
     */
    private async loadPartnerOnlyDataLazy(): Promise<void> {
        const loadStartTime = performance.now();
        
        // Vérifier le cache d'abord
        const cachedData = this.getFromCache('partnerOnly');
        if (cachedData) {
            this.filteredPartnerOnly = cachedData;
            this.partnerOnlyLoaded = true;
            this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
            return;
        }
        
        // Si les données sont déjà dans la réponse, les utiliser
        if (this.response?.partnerOnly && this.response.partnerOnly.length > 0) {
            this.filteredPartnerOnly = this.getFilteredPartnerOnly();
            this.partnerOnlyLoaded = true;
            this.setCache('partnerOnly', this.filteredPartnerOnly);
            this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
            return;
        }
        
        if (!this.currentJobId) {
            this.currentJobId = this.reconciliationService.getCurrentJobId();
        }
        
        if (!this.currentJobId) {
            return;
        }

        if (this.response?.resultsPaginated) {
            try {
                const partnerOnly = await this.reconciliationService.loadPartnerOnlyFromSession(this.currentJobId);
                if (this.response) {
                    this.response = { ...this.response, partnerOnly };
                }
                this.filteredPartnerOnly = this.getFilteredPartnerOnly();
                this.partnerOnlyLoaded = true;
                this.setCache('partnerOnly', this.filteredPartnerOnly);
                this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
                this.updateCalculatedProperties();
                return;
            } catch {
                // Repli pagination page par page ci-dessous
            }
        }
        
        this.isLoadingPartnerOnly = true;
        this.loadingProgress.partnerOnly = { current: 0, total: 0, percentage: 0 };
        this.cdr.detectChanges();
        
        try {
            await this.loadAllPartnerOnlyChunked(0, [], loadStartTime);
        } catch (error) {
            this.isLoadingPartnerOnly = false;
            this.cdr.detectChanges();
        }
    }
    
    /**
     * Charge toutes les partnerOnly par pages avec traitement asynchrone par chunks
     */
    private async loadAllPartnerOnlyChunked(page: number, accumulatedPartnerOnly: Record<string, string>[], overallStartTime: number): Promise<void> {
        const pageStartTime = performance.now();
        
        return new Promise((resolve, reject) => {
            this.reconciliationService.getPartnerOnly(this.currentJobId!, page, this.CHUNK_SIZE).subscribe({
                next: async (response) => {
                    const receiveTime = performance.now();
                    const networkDuration = receiveTime - pageStartTime;
                    
                    // Mettre à jour la progression
                    this.loadingProgress.partnerOnly.total = response.total;
                    this.loadingProgress.partnerOnly.current = accumulatedPartnerOnly.length + response.partnerOnly.length;
                    this.loadingProgress.partnerOnly.percentage = Math.round((this.loadingProgress.partnerOnly.current / this.loadingProgress.partnerOnly.total) * 100);
                    
                    // Traitement par chunks avec yield au navigateur
                    const processStartTime = performance.now();
                    await this.processChunked(response.partnerOnly, accumulatedPartnerOnly, 'partnerOnly');
                    const processDuration = performance.now() - processStartTime;
                    
                    
                    // Mettre à jour l'UI périodiquement
                    if (page % 5 === 0 || page + 1 >= response.totalPages) {
                        requestAnimationFrame(() => {
                            this.cdr.markForCheck();
                            this.cdr.detectChanges();
                        });
                    }
                    
                    if (page + 1 < response.totalPages) {
                        // Yield au navigateur avant de charger la page suivante
                        await this.yieldToBrowser();
                        await this.loadAllPartnerOnlyChunked(page + 1, accumulatedPartnerOnly, overallStartTime);
                        resolve();
                    } else {
                        // Toutes les données sont chargées
                        const finalizeStartTime = performance.now();
                        this.response = {
                            ...this.response!,
                            partnerOnly: accumulatedPartnerOnly
                        };
                        
                        const filterStartTime = performance.now();
                        this.filteredPartnerOnly = this.getFilteredPartnerOnly();
                        const filterDuration = performance.now() - filterStartTime;
                        
                        // Mettre en cache
                        this.setCache('partnerOnly', this.filteredPartnerOnly);
                        
                        this.partnerOnlyLoaded = true;
                        this.isLoadingPartnerOnly = false;
                        
                        const shareStartTime = performance.now();
                        this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
                        const shareDuration = performance.now() - shareStartTime;
                        
                        const totalDuration = performance.now() - overallStartTime;
                        
                        // Dernière mise à jour UI
                        requestAnimationFrame(() => {
                            this.cdr.markForCheck();
                            this.cdr.detectChanges();
                        });
                        
                        resolve();
                    }
                },
                error: (error) => {
                    const errorDuration = performance.now() - pageStartTime;
                    this.isLoadingPartnerOnly = false;
                    this.cdr.detectChanges();
                    reject(error);
                }
            });
        });
    }
    
    /**
     * Charge toutes les partnerOnly par pages
     */
    private loadAllPartnerOnly(page: number, accumulatedPartnerOnly: Record<string, string>[], overallStartTime: number): void {
        const pageStartTime = performance.now();
        
        this.reconciliationService.getPartnerOnly(this.currentJobId!, page, 1000).subscribe({
            next: (response) => {
                const receiveTime = performance.now();
                const networkDuration = receiveTime - pageStartTime;
                
                const pushStartTime = performance.now();
                accumulatedPartnerOnly.push(...response.partnerOnly);
                const pushDuration = performance.now() - pushStartTime;
                
                
                if (page + 1 < response.totalPages) {
                    this.loadAllPartnerOnly(page + 1, accumulatedPartnerOnly, overallStartTime);
                } else {
                    // Toutes les données sont chargées
                    const finalizeStartTime = performance.now();
                    this.response = {
                        ...this.response!,
                        partnerOnly: accumulatedPartnerOnly
                    };
                    
                    const filterStartTime = performance.now();
                    this.filteredPartnerOnly = this.getFilteredPartnerOnly();
                    const filterDuration = performance.now() - filterStartTime;
                    
                    this.partnerOnlyLoaded = true;
                    this.isLoadingPartnerOnly = false;
                    
                    const shareStartTime = performance.now();
                    // Partager les données filtrées
                    this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
                    const shareDuration = performance.now() - shareStartTime;
                    
                    const totalDuration = performance.now() - overallStartTime;
                    
                    // Différer detectChanges pour éviter de bloquer l'UI
                    setTimeout(() => {
                        requestAnimationFrame(() => {
                            const detectChangesStartTime = performance.now();
                            this.cdr.markForCheck();
                            this.cdr.detectChanges();
                            const detectChangesDuration = performance.now() - detectChangesStartTime;
                        });
                    }, 0);
                }
            },
            error: (error) => {
                const errorDuration = performance.now() - pageStartTime;
                this.isLoadingPartnerOnly = false;
                this.cdr.detectChanges();
            }
        });
    }

    async openReconciliationReport() {
        // Cloisonnement magique : ne partager que les données de la (les) card(s) (service(s))
        // sélectionnée(s) pour le rapport. Si un groupe est sélectionné, on agrège tous ses services.
        const reportScoped = this.isMagicServiceView() && this.getReportScopeServices().length > 0;
        if (this.isMagicServiceView()) {
            this.syncMagicViewContextToTabsService();
        }

        if (reportScoped) {
            await this.loadAndShareMultiServiceDataForReport();
        } else {
            const scopedMismatches = this.isMagicServiceView()
                ? partitionEcartRecords(this.response?.mismatches || [], this.getEcartPartitionContext())
                : (this.response?.mismatches || []);
            this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
            this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
            this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
            this.reconciliationTabsService.setFilteredMismatches(scopedMismatches);
        }

        // DIAGNOSTIC temporaire : combien de services distincts la réponse results contient-elle ?
        const svcTag = (r: Record<string, string>) => r?._magicService ?? r?.service ?? '';
        const svcOfMatch = (m: any) => m?.boData?._magicService ?? m?.partnerData?._magicService ?? '';
        const distinctSvc = (arr: any[], pick: (r: any) => string) => Array.from(new Set((arr || []).map(pick).filter(Boolean)));
        console.warn('[DIAG-RESULTS] shouldPartitionEcarts=', this.shouldPartitionEcarts(),
            'scopeServices=', this.getReportScopeServices(),
            'response counts=', { m: this.response?.matches?.length, b: this.response?.boOnly?.length, p: this.response?.partnerOnly?.length },
            'distinctSvc=', {
                m: distinctSvc(this.response?.matches, svcOfMatch),
                b: distinctSvc(this.response?.boOnly, svcTag),
                p: distinctSvc(this.response?.partnerOnly, svcTag)
            },
            'magicSummaries=', this.appStateService.getMagicServiceSummaries()?.map(s => s.service));

        // Invalider un résumé cache incomplet (matches=0 alors que totalMatches>0),
        // sinon le rapport affiche Transactions/Correspondances faussees.
        // En vue magique, comparer aux totaux de la card — pas aux totaux globaux (autres patterns).
        const activeMagic = this.isMagicServiceView() ? this.findActiveMagicSummary() : undefined;
        const expectedMatches = activeMagic?.totalMatches ?? this.response?.totalMatches ?? 0;
        const cachedMatches = (this.cachedAgencySummary || [])
            .reduce((sum, row) => sum + (Number(row.matches) || 0), 0);
        if (expectedMatches > 0 && cachedMatches === 0) {
            this.cachedAgencySummary = null;
            this.lastResponseHash = '';
            this.reconciliationSummaryService.clearAgencySummary();
        }

        const currentHash = this.getResponseHash();
        if (this.cachedAgencySummary && this.lastResponseHash === currentHash) {
            this.reconciliationSummaryService.setAgencySummary(
                this.cachedAgencySummary,
                this.lastAgencySummaryMeta
            );
        }

        // Vue magique : forcer un résumé cloisonné (recalculé sur les données de la card sélectionnée)
        // AVANT la navigation pour éviter que le rapport n'affiche d'abord un autre service.
        if (this.isMagicServiceView()) {
            try {
                this.getAgencySummary();
            } catch {
                // Le rapport reconstruira le résumé si besoin
            }
            this.ensureMagicAgencySummaryForReport(activeMagic);
        }

        const queryParams = this.isMagicServiceView()
            ? {
                mode: 'magic',
                magicServices: this.reportSelectedServices.length > 0
                    ? this.reportSelectedServices.join(',')
                    : undefined,
                magicService: this.selectedMagicService || undefined,
                magicPartnerFile: this.selectedMagicPartnerFile || undefined
            }
            : undefined;
        this.router.navigate(['/reconciliation-report'], queryParams ? { queryParams } : undefined);

        if (this.response && (
            this.filteredMatches.length > 0 ||
            this.filteredBoOnly.length > 0 ||
            this.filteredPartnerOnly.length > 0 ||
            (this.response.totalMatches ?? 0) > 0 ||
            (this.response.totalBoOnly ?? 0) > 0 ||
            (this.response.totalPartnerOnly ?? 0) > 0
        )) {
            if (!this.cachedAgencySummary || this.lastResponseHash !== currentHash) {
                queueMicrotask(() => {
                    try {
                        this.getAgencySummary();
                    } catch {
                        // Le rapport reconstruira le résumé si besoin
                    }
                });
            }
        }
    }

    /**
     * Charge les données de chaque service sélectionné depuis le serveur (via leur jobId)
     * et les partage dans les onglets pour que le rapport groupe puisse afficher le détail
     * par agence de chaque card. Chaque ligne reçoit `_magicService` pour le partitionnement.
     */
    private async loadAndShareMultiServiceDataForReport(): Promise<void> {
        const scopeServices = this.getReportScopeServices();
        const summaries = this.appStateService.getMagicServiceSummaries();

        // Associer chaque service sélectionné à son jobId
        const serviceJobs = scopeServices
            .map(svc => summaries.find(s => s.service === svc && s.jobId))
            .filter((s): s is MagicServiceSummary & { jobId: string } => !!s?.jobId);

        if (!serviceJobs.length) {
            // Pas de jobId → fallback sur les données déjà chargées
            this.reconciliationTabsService.setFilteredMatches(this.getReportScopedMatches());
            this.reconciliationTabsService.setFilteredBoOnly(this.getReportScopedBoOnly());
            this.reconciliationTabsService.setFilteredPartnerOnly(this.getReportScopedPartnerOnly());
            this.reconciliationTabsService.setFilteredMismatches(this.getReportScopedMismatches());
            return;
        }

        // Charger chaque service en parallèle depuis le serveur
        const loads = serviceJobs.map(async ({ service, jobId }) => {
            try {
                const [ecarts, partnerOnly] = await Promise.all([
                    this.reconciliationService.loadBoEcartsFromSession(jobId),
                    this.reconciliationService.loadPartnerOnlyFromSession(jobId)
                ]);
                return {
                    service,
                    boOnly: ecarts.boOnly.map(row => ({ ...row, _magicService: service })),
                    mismatches: ecarts.mismatches.map(row => ({ ...row, _magicService: service })),
                    partnerOnly: partnerOnly.map(row => ({ ...row, _magicService: service }))
                };
            } catch (error) {
                console.warn(`[report] Échec chargement données pour ${service}:`, error);
                return { service, boOnly: [] as Record<string, string>[], mismatches: [] as Record<string, string>[], partnerOnly: [] as Record<string, string>[] };
            }
        });

        const results = await Promise.all(loads);

        // Fusionner toutes les données dans les onglets
        const allBoOnly = results.flatMap(r => r.boOnly);
        const allMismatches = results.flatMap(r => r.mismatches);
        const allPartnerOnly = results.flatMap(r => r.partnerOnly);

        this.reconciliationTabsService.setFilteredBoOnly(allBoOnly);
        this.reconciliationTabsService.setFilteredMismatches(allMismatches);
        this.reconciliationTabsService.setFilteredPartnerOnly(allPartnerOnly);
        this.reconciliationTabsService.setFilteredMatches([]);
    }

    nextPage(type: 'matches' | 'boOnly' | 'partnerOnly') {
        const pageStartTime = performance.now();
        
        if (type === 'matches' && this.matchesPage < this.getTotalPages('matches')) {
            const step1Start = performance.now();
            this.matchesPage++;
            this.cachedPagedMatches = null; // Invalider le cache
            const step1Duration = performance.now() - step1Start;
            
            const step2Start = performance.now();
            const start = (this.matchesPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            this.pagedMatches = (this.filteredMatches || []).slice(start, end);
            this.cachedPagedMatches = this.pagedMatches;
            this.cachedMatchesPage = this.matchesPage;
            const step2Duration = performance.now() - step2Start;
            
            const step3Start = performance.now();
            requestAnimationFrame(() => {
                const cacheStart = performance.now();
                this.updateKeysCache();
                const cacheDuration = performance.now() - cacheStart;
            });
            const step3Duration = performance.now() - step3Start;
        }
        if (type === 'boOnly' && this.boOnlyPage < this.getTotalPages('boOnly')) {
            const step1Start = performance.now();
            this.boOnlyPage++;
            this.cachedPagedBoOnly = null;
            const start = (this.boOnlyPage - 1) * this.pageSize;
            this.pagedBoOnly = (this.filteredBoOnly || []).slice(start, start + this.pageSize);
            this.cachedPagedBoOnly = this.pagedBoOnly;
            this.cachedBoOnlyPage = this.boOnlyPage;
            const step1Duration = performance.now() - step1Start;
        }
        if (type === 'partnerOnly' && this.partnerOnlyPage < this.getTotalPages('partnerOnly')) {
            const step1Start = performance.now();
            this.partnerOnlyPage++;
            this.cachedPagedPartnerOnly = null;
            const start = (this.partnerOnlyPage - 1) * this.pageSize;
            this.pagedPartnerOnly = (this.filteredPartnerOnly || []).slice(start, start + this.pageSize);
            this.cachedPagedPartnerOnly = this.pagedPartnerOnly;
            this.cachedPartnerOnlyPage = this.partnerOnlyPage;
            const step1Duration = performance.now() - step1Start;
        }
        const pageDuration = performance.now() - pageStartTime;
        
        const step4Start = performance.now();
        requestAnimationFrame(() => {
            const markStart = performance.now();
            this.cdr.markForCheck();
            const markDuration = performance.now() - markStart;
        });
        const step4Duration = performance.now() - step4Start;
    }

    prevPage(type: 'matches' | 'boOnly' | 'partnerOnly') {
        const pageStartTime = performance.now();
        if (type === 'matches' && this.matchesPage > 1) {
            this.matchesPage--;
            this.cachedPagedMatches = null; // Invalider le cache
            // Mettre à jour directement les données paginées SANS attendre de filtrage
            // Utiliser directement filteredMatches qui est déjà filtré, pas besoin de refiltrer
            const start = (this.matchesPage - 1) * this.pageSize;
            this.pagedMatches = (this.filteredMatches || []).slice(start, start + this.pageSize);
            this.cachedPagedMatches = this.pagedMatches;
            this.cachedMatchesPage = this.matchesPage;
            // Différer la mise à jour du cache des clés pour ne pas bloquer l'UI
            requestAnimationFrame(() => {
                this.updateKeysCache();
            });
        }
        if (type === 'boOnly' && this.boOnlyPage > 1) {
            this.boOnlyPage--;
            this.cachedPagedBoOnly = null; // Invalider le cache
            // Mettre à jour directement sans attendre de filtrage
            const start = (this.boOnlyPage - 1) * this.pageSize;
            this.pagedBoOnly = (this.filteredBoOnly || []).slice(start, start + this.pageSize);
            this.cachedPagedBoOnly = this.pagedBoOnly;
            this.cachedBoOnlyPage = this.boOnlyPage;
        }
        if (type === 'partnerOnly' && this.partnerOnlyPage > 1) {
            this.partnerOnlyPage--;
            this.cachedPagedPartnerOnly = null; // Invalider le cache
            // Mettre à jour directement sans attendre de filtrage
            const start = (this.partnerOnlyPage - 1) * this.pageSize;
            this.pagedPartnerOnly = (this.filteredPartnerOnly || []).slice(start, start + this.pageSize);
            this.cachedPagedPartnerOnly = this.pagedPartnerOnly;
            this.cachedPartnerOnlyPage = this.partnerOnlyPage;
        }
        const pageDuration = performance.now() - pageStartTime;
        if (pageDuration > 1) {
        }
        // Utiliser requestAnimationFrame pour un rendu plus fluide
        requestAnimationFrame(() => {
            this.cdr.markForCheck();
        });
    }

    getBoKeys(match: Match): string[] {
        // Détecter le type de données BO et appliquer le bon filtrage
        return this.getFilteredKeys(match.boData, 'bo');
    }

    getPartnerKeys(match: Match): string[] {
        // Détecter le type de données Partenaire et appliquer le bon filtrage
        return this.getFilteredKeys(match.partnerData, 'partner');
    }

    /**
     * Obtient la valeur BO à partir d'une clé corrigée
     */
    getBoValue(match: Match, correctedKey: string): string {
        const originalKey = this.getOriginalKey(match.boData, correctedKey);
        return match.boData[originalKey] || '';
    }

    /**
     * Obtient la valeur Partenaire à partir d'une clé corrigée
     */
    getPartnerValue(match: Match, correctedKey: string): string {
        const originalKey = this.getOriginalKey(match.partnerData, correctedKey);
        return match.partnerData[originalKey] || '';
    }

    /**
     * Obtient la valeur d'un enregistrement à partir d'une clé corrigée
     */
    getRecordValue(record: Record<string, string>, correctedKey: string): string {
        const originalKey = this.getOriginalKey(record, correctedKey);
        return record[originalKey] || '';
    }

    getRecordKeys(record: Record<string, string>): string[] {
        return Object.keys(record);
    }

    /**
     * Méthode intelligente pour filtrer les colonnes selon le type de données détecté
     * Corrige également les noms de colonnes mal encodés
     */
    getFilteredKeys(record: Record<string, string>, dataType: 'bo' | 'partner'): string[] {
        const cached = this.filteredKeysCache.get(record as object)?.[dataType];
        if (cached) {
            return cached;
        }
        const result = this.computeFilteredKeys(record, dataType);
        const entry = this.filteredKeysCache.get(record as object) || {};
        entry[dataType] = result;
        this.filteredKeysCache.set(record as object, entry);
        return result;
    }

    private computeFilteredKeys(record: Record<string, string>, dataType: 'bo' | 'partner'): string[] {
        const keys = Object.keys(record);
        
        // Corriger les noms de colonnes mal encodés
        const correctedKeys = keys.map(key => fixGarbledCharacters(key));
        
        // Créer un mapping entre les clés originales et corrigées pour l'accès aux données
        const keyMapping = new Map<string, string>();
        keys.forEach((originalKey, index) => {
            keyMapping.set(correctedKeys[index], originalKey);
        });
        
        // Détecter le type de données basé sur les colonnes présentes (avec clés corrigées)
        const isTRXBO = correctedKeys.some(key => ['IDTransaction', 'téléphone client', 'GRX'].includes(key));
        const isOPPART = correctedKeys.some(key => ['ID Opération', 'Type Opération', 'Solde avant', 'Solde aprés'].includes(key));
        const isUSSDPART = correctedKeys.some(key => ['Code service', 'Déstinataire', 'Token', 'SMS Action faite'].includes(key));
        
        // Définir les colonnes autorisées selon le type détecté
        let allowedColumns: string[] = [];
        
        if (isTRXBO) {
            // Colonnes TRXBO autorisées (logique de filtrage originale)
            // Inclure les variations pour gérer les différences d'encodage
            allowedColumns = [
                'ID',
                'IDTransaction',
                'téléphone client',
                'telephone client',
                'montant',
                'Service',
                'Agence',
                'Date',
                'Numéro Trans GU',
                'Numero Trans GU',
                'GRX',
                'Statut'
            ];
        } else if (isOPPART) {
            // Colonnes OPPART autorisées (logique de filtrage originale)
            // Inclure les variations pour gérer les différences d'encodage
            allowedColumns = [
                'ID Opération',
                'ID Operation',
                'Type Opération',
                'Type Operation',
                'Montant',
                'Solde avant',
                'Solde aprés',
                'Solde apres',
                'Code proprietaire',
                'Date opération',
                'Date Opération',
                'Date operation',
                'Numéro Trans GU',
                'Numero Trans GU',
                'groupe de réseau',
                'groupe de reseau'
            ];
        } else if (isUSSDPART) {
            // Colonnes USSDPART autorisées (logique de filtrage originale)
            // Inclure les variations pour gérer les différences d'encodage
            allowedColumns = [
                'ID',
                'Agence',
                'Code service',
                'Numéro Trans GU',
                'Numero Trans GU',
                'Déstinataire',
                'Destinataire',
                'date de création',
                'Etat',
                'Token',
                'SMS Action faite',
                'Montant'
            ];
        } else {
            // Si aucun type n'est détecté, retourner toutes les colonnes corrigées
            return correctedKeys;
        }
        
        // Filtrer les clés corrigées pour ne garder que les colonnes autorisées
        // Utiliser une correspondance flexible pour gérer les variations (avec/sans accents, etc.)
        const filteredKeys = correctedKeys.filter(key => {
            // Vérifier correspondance exacte d'abord
            if (allowedColumns.includes(key)) {
                return true;
            }
            
            // Vérifier correspondance insensible à la casse et aux accents
            const normalizedKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
            const match = allowedColumns.some(allowed => {
                const normalizedAllowed = allowed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
                return normalizedKey === normalizedAllowed;
            });
            
            if (match) {
                return true;
            }
            
            // Correspondance partielle pour gérer les cas comme "Numero Trans GU" vs "Numéro Trans GU"
            // ou "Type Operation" vs "Type Opération"
            return allowedColumns.some(allowed => {
                // Normaliser les deux chaînes pour comparaison
                const keyWords = normalizedKey.split(/\s+/);
                const allowedWords = allowed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/);
                
                // Si les mots principaux correspondent (ignorant les accents)
                if (keyWords.length === allowedWords.length) {
                    return keyWords.every((word, idx) => {
                        const allowedWord = allowedWords[idx];
                        return word === allowedWord || word.includes(allowedWord) || allowedWord.includes(word);
                    });
                }
                
                return false;
            });
        });
        
        return filteredKeys;
    }
    
    /**
     * Obtient la clé originale à partir d'une clé corrigée pour accéder aux données
     */
    private getOriginalKey(record: Record<string, string>, correctedKey: string): string {
        let keyMap = this.originalKeyCache.get(record as object);
        if (!keyMap) {
            keyMap = new Map<string, string>();
            this.originalKeyCache.set(record as object, keyMap);
        }
        const hit = keyMap.get(correctedKey);
        if (hit !== undefined) {
            return hit;
        }
        // Chercher la clé originale qui correspond à la clé corrigée
        const originalKey = Object.keys(record).find(key => fixGarbledCharacters(key) === correctedKey);
        const resolved = originalKey || correctedKey;
        keyMap.set(correctedKey, resolved);
        return resolved;
    }

    getBoOnlyKeys(record: Record<string, string>): string[] {
        // Détecter le type de données BO et appliquer le bon filtrage
        return this.getFilteredKeys(record, 'bo');
    }

    getPartnerOnlyKeys(record: Record<string, string>): string[] {
        // Détecter le type de données Partenaire et appliquer le bon filtrage
        return this.getFilteredKeys(record, 'partner');
    }

    /**
     * Détecter les doublons de clé de réconciliation avec types d'opération spécifiques
     */
    detectTSOPDuplicates(data: any[]): Map<string, any[]> {
        // Vérifier si c'est une réconciliation TRXBO-OPPART
        if (!this.isTRXBOOPPARTReconciliation()) {
            return new Map<string, any[]>();
        }

        const duplicatesMap = new Map<string, any[]>();
        const keyCount = new Map<string, any[]>();

        // Grouper les enregistrements par clé de réconciliation
        data.forEach((record) => {
            // Essayer différents noms de colonnes pour la clé de réconciliation
            const reconciliationKey = this.getReconciliationKey(record);
            const typeOperation = this.getTypeOperation(record);

            if (reconciliationKey && typeOperation) {
                if (!keyCount.has(reconciliationKey)) {
                    keyCount.set(reconciliationKey, []);
                }
                keyCount.get(reconciliationKey)!.push({
                    record: record,
                    typeOperation: typeOperation
                });
            }
        });

        // Identifier les doublons avec les types d'opération spécifiques
        keyCount.forEach((records, key) => {
            const types = records.map(r => r.typeOperation);
            
            // Vérifier si on a les deux types spécifiques
            const hasImpactCompte = types.includes('IMPACT_COMPTIMPACT-COMPTE-GENERAL');
            const hasFraisTransaction = types.includes('FRAIS_TRANSACTION');

            if (records.length >= 2 && hasImpactCompte && hasFraisTransaction) {
                // Cas 1: Doublon TSOP complet (IMPACT + FRAIS)
                duplicatesMap.set(key, records.map(r => ({ ...r, tsopType: 'COMPLETE' })));
            } else if (records.length === 1 && hasImpactCompte && !hasFraisTransaction) {
                // Cas 2: IMPACT seul sans FRAIS (SANS FRAIS)
                duplicatesMap.set(key, records.map(r => ({ ...r, tsopType: 'SANS_FRAIS' })));
            } else if (records.length === 1 && hasFraisTransaction && !hasImpactCompte) {
                // Cas 3: FRAIS_TRANSACTION seul (Régularisation FRAIS)
                duplicatesMap.set(key, records.map(r => ({ ...r, tsopType: 'REGULARISATION_FRAIS' })));
            }
        });
        return duplicatesMap;
    }

    /**
     * Extraire la clé de réconciliation d'un enregistrement
     */
    private getReconciliationKey(record: any): string {
        const possibleKeys = [
            'Service',
            'service',
            'SERVICE',
            'CLE',
            'clé de réconciliation',
            'cle_reconciliation', 
            'reconciliation_key',
            'RECONCILIATION_KEY',
            'Key',
            'key',
            'ID',
            'id'
        ];

        for (const key of possibleKeys) {
            if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                return record[key].toString();
            }
        }
        return '';
    }

    /**
     * Extraire le type d'opération d'un enregistrement
     */
    private getTypeOperation(record: any): string {
        const possibleKeys = [
            'Type Opération',
            'Type Op�ration', // Avec caractères d'encodage
            'type operation',
            'type_operation',
            'typeOperation',
            'TYPE_OPERATION',
            'TypeOperation',
            'Operation',
            'operation'
        ];

        for (const key of possibleKeys) {
            if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                return record[key].toString();
            }
        }
        return '';
    }

    /**
     * Vérifier si un enregistrement est un doublon TSOP
     */
    isTSOPDuplicate(record: any, duplicatesMap: Map<string, any[]>): boolean {
        const reconciliationKey = this.getReconciliationKey(record);
        return reconciliationKey !== '' && duplicatesMap.has(reconciliationKey);
    }

    /**
     * Obtenir la map des doublons TSOP pour l'affichage
     */
    getTSOPDuplicatesMap(): Map<string, any[]> {
        if (!this.response?.partnerOnly) return new Map();
        return this.detectTSOPDuplicates(this.filteredPartnerOnly);
    }

    /**
     * Vérifier si la réconciliation est entre TRXBO et OPPART
     */
    isTRXBOOPPARTReconciliation(): boolean {
        if (!this.response) return false;
        
        // Vérifier les noms de fichiers ou les données pour identifier TRXBO-OPPART
        const boData = this.response.boOnly || [];
        const partnerData = this.response.partnerOnly || [];
        
        // Vérifier si on a des données TRXBO (Back Office) et OPPART (Partenaire)
        const hasTRXBOData = boData.length > 0;
        const hasOPPARTData = partnerData.length > 0;
        
        // Vérifier les types d'opérations caractéristiques de TRXBO-OPPART
        const hasTRXBOOperations = boData.some(record => {
            const type = this.getTypeOperation(record);
            return type && (type.includes('total_cashin') || type.includes('total_paiement') || type.includes('FRAIS_TRANSACTION'));
        });
        
        const hasOPPARTOperations = partnerData.some(record => {
            const type = this.getTypeOperation(record);
            return type && (type.includes('IMPACT_COMPTIMPACT-COMPTE-GENERAL') || type.includes('FRAIS_TRANSACTION'));
        });
        
        return hasTRXBOData && hasOPPARTData && (hasTRXBOOperations || hasOPPARTOperations);
    }

    /**
     * Obtenir le commentaire TSOP pour un enregistrement (écarts Partenaire)
     * Uniquement applicable pour la réconciliation TRXBO-OPPART
     */
    getTSOPComment(record: any): string {
        // Vérifier si c'est une réconciliation TRXBO-OPPART
        if (!this.isTRXBOOPPARTReconciliation()) {
            return '';
        }
        
        const typeOperation = this.getTypeOperation(record);
        
        // Logique selon les spécifications :
        // - IMPACT_COMPTIMPACT-COMPTE-GENERAL sans FRAIS → TSF (jaune)
        // - FRAIS_TRANSACTION → C FRAIS (orange)
        if (typeOperation && typeOperation.includes('FRAIS_TRANSACTION')) {
            return 'C FRAIS';
        } else if (typeOperation && typeOperation.includes('IMPACT_COMPTIMPACT-COMPTE-GENERAL')) {
            return 'TSF';
        }
        
        return '';
    }

    /**
     * Obtenir le type TSOP pour un enregistrement (pour le style CSS)
     * Uniquement applicable pour la réconciliation TRXBO-OPPART
     */
    getTSOPType(record: any): string {
        // Vérifier si c'est une réconciliation TRXBO-OPPART
        if (!this.isTRXBOOPPARTReconciliation()) {
            return '';
        }
        
        const typeOperation = this.getTypeOperation(record);
        
        // Logique selon les spécifications :
        // - FRAIS_TRANSACTION → C FRAIS (orange)
        // - IMPACT_COMPTIMPACT-COMPTE-GENERAL → TSF (jaune)
        if (typeOperation && typeOperation.includes('FRAIS_TRANSACTION')) {
            return 'C_FRAIS';
        } else if (typeOperation && typeOperation.includes('IMPACT_COMPTIMPACT-COMPTE-GENERAL')) {
            return 'TSF';
        }
        
        return '';
    }

    /**
     * Obtenir le commentaire pour un enregistrement ECART BO
     * Uniquement applicable pour la réconciliation TRXBO-OPPART
     */
    getBoOnlyComment(record: any): string {
        // Vérifier si c'est une réconciliation TRXBO-OPPART
        if (!this.isTRXBOOPPARTReconciliation()) {
            return '';
        }
        
        // Utiliser le commentaire ajouté par le backend
        const commentaire = record['Commentaire'] || record['commentaire'] || '';
        
        // Si le backend a ajouté un commentaire, l'utiliser
        if (commentaire === 'TSOP' || commentaire === 'TRXSF') {
            return commentaire;
        }
        
        // Par défaut, TSOP pour les écarts BO
        return 'TSOP';
    }

    /**
     * Obtenir le type pour un enregistrement ECART BO (pour le style CSS)
     * Uniquement applicable pour la réconciliation TRXBO-OPPART
     */
    getBoOnlyType(record: any): string {
        // Vérifier si c'est une réconciliation TRXBO-OPPART
        if (!this.isTRXBOOPPARTReconciliation()) {
            return '';
        }
        
        // Utiliser le commentaire ajouté par le backend
        const commentaire = record['Commentaire'] || record['commentaire'] || '';
        
        // Si le backend a ajouté un commentaire, l'utiliser
        if (commentaire === 'TSOP') {
            return 'TSOP';
        } else if (commentaire === 'TRXSF') {
            return 'TRXSF';
        }
        
        // Par défaut, TSOP pour les écarts BO
        return 'TSOP';
    }

    hasDifferences(match: Match): boolean {
        return match.differences && match.differences.length > 0;
    }

   async exportResults(forceTab?: 'matches' | 'boOnly' | 'partnerOnly' | 'agencySummary') {
    const previousTab = this.activeTab;
    if (forceTab !== undefined) {
        this.activeTab = forceTab;
    }

    try {
        this.isExporting = true;
        this.exportProgress = 0;
        this.cdr.detectChanges();

        // Demander le nom du fichier à l'utilisateur
        const fileName = await this.promptFileName();
        if (!fileName) {
            return;
        }

        const format = /\.csv$/i.test(fileName) ? 'csv' : 'xlsx';
        const { rows, columns } = await this.prepareDataForExport();

        if (format === 'csv') {
            this.exportOptimizationService.exportQuick(rows, columns, fileName, 'csv');
            this.popupService.showSuccess(this.t('RES.dlg.exportSuccess'));
            return;
        }

        // Première étape : Génération des fichiers Excel
        const workbooks = await this.generateExcelFile();

        // Deuxième étape : Téléchargement
        await this.downloadExcelFile(workbooks, fileName);

    } catch (error) {
    } finally {
        this.isExporting = false;
        this.exportProgress = 0;
        if (forceTab !== undefined) {
            this.activeTab = previousTab;
        }
        this.cdr.detectChanges();
    }
}

private async promptFileName(): Promise<string | null> {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    let defaultFileName = 'export.csv';
    
    switch (this.activeTab) {
        case 'matches':
            defaultFileName = `correspondances_${timestamp}.csv`;
            break;
        case 'boOnly':
            defaultFileName = `ecart_bo_${timestamp}.csv`;
            break;
        case 'partnerOnly':
            defaultFileName = `ecart_partenaire_${timestamp}.csv`;
            break;
        case 'agencySummary':
            defaultFileName = `resume_par_agence_${timestamp}.csv`;
            break;
    }
    
    // Par défaut l'export est en CSV ; l'utilisateur peut choisir .xlsx/.xls en le précisant dans le nom.
    const fileName = prompt(this.t('RES.dlg.exportFileNamePrompt', { name: defaultFileName }), defaultFileName);
    
    if (fileName === null) {
        return null; // Utilisateur a annulé
    }
    
    const trimmed = fileName.trim();
    if (trimmed === '') {
        return defaultFileName;
    }
    
    // Respecter l'extension saisie (.csv / .xlsx / .xls), sinon compléter en .csv par défaut.
    if (/\.(csv|xlsx|xls)$/i.test(trimmed)) {
        return trimmed;
    }
    return trimmed + '.csv';
}

private async generateExcelFile(): Promise<ExcelJS.Workbook[]> {
    const workbooks: ExcelJS.Workbook[] = [];
    // SUPPRESSION DE LA LIMITE : on ne découpe plus en plusieurs fichiers
    // const MAX_ROWS_PER_FILE = 50000;

    if (this.activeTab === 'matches') {
        const filteredMatches = this.getFilteredMatches();
        
        if (filteredMatches.length > 0) {
            // Récupérer toutes les clés des données BO et Partenaire
            const allBoKeys = new Set<string>();
            const allPartnerKeys = new Set<string>();
            
            filteredMatches.forEach(match => {
                Object.keys(match.boData).forEach(key => {
                    // Corriger le nom de colonne mal encodé
                    const correctedKey = fixGarbledCharacters(key);
                    allBoKeys.add(correctedKey);
                });
                Object.keys(match.partnerData).forEach(key => {
                    // Corriger le nom de colonne mal encodé
                    const correctedKey = fixGarbledCharacters(key);
                    allPartnerKeys.add(correctedKey);
                });
            });
            
            const boKeysArray = Array.from(allBoKeys);
            const partnerKeysArray = Array.from(allPartnerKeys);
            

            // Styles Excel
            const headerStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
                alignment: { vertical: 'middle' as const, horizontal: 'center' as const },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const dataStyle = {
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            // Créer un seul fichier pour toutes les correspondances
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Correspondances');

            // Définir les colonnes avec des largeurs appropriées
            const columns = [
                { header: 'Clé', key: 'key', width: 20 },
                ...boKeysArray.map(k => ({ header: `BO_${k}`, key: `bo_${k}`, width: 15 })),
                ...partnerKeysArray.map(k => ({ header: `PARTENAIRE_${k}`, key: `partner_${k}`, width: 15 }))
            ];

            worksheet.columns = columns;

            // Ajouter la ligne d'en-tête manuellement
            const headerRow = worksheet.getRow(1);
            headerRow.getCell(1).value = 'Clé';
            
            let colIndex = 2;
            boKeysArray.forEach(key => {
                headerRow.getCell(colIndex).value = `BO_${key}`;
                colIndex++;
            });
            
            partnerKeysArray.forEach(key => {
                headerRow.getCell(colIndex).value = `PARTENAIRE_${key}`;
                colIndex++;
            });

            // Appliquer le style d'en-tête
            headerRow.eachCell((cell, cellNumber) => {
                if (cellNumber <= columns.length) {
                    cell.style = headerStyle;
                }
            });

            // Ajouter toutes les lignes de données
            let currentRow = 2;
            const batchSize = 100;
            for (let i = 0; i < filteredMatches.length; i += batchSize) {
                const batch = filteredMatches.slice(i, i + batchSize);
                batch.forEach(match => {
                    const row = worksheet.getRow(currentRow);
                    row.getCell(1).value = match.key;
                    let cellIndex = 2;
                    const numFmtAmount = '#,##0.00';
                    boKeysArray.forEach(key => {
                        const cell = row.getCell(cellIndex);
                        const value = match.boData[key];
                        cell.value = this.exportAmountValue(key, value);
                        if (this.isAmountColumnForExport(key)) cell.numFmt = numFmtAmount;
                        cellIndex++;
                    });
                    partnerKeysArray.forEach(key => {
                        const cell = row.getCell(cellIndex);
                        const value = match.partnerData[key];
                        cell.value = this.exportAmountValue(key, value);
                        if (this.isAmountColumnForExport(key)) cell.numFmt = numFmtAmount;
                        cellIndex++;
                    });
                    row.eachCell((cell, cellNumber) => {
                        if (cellNumber <= columns.length) {
                            cell.style = dataStyle;
                        }
                    });
                    currentRow++;
                });
                this.exportProgress = Math.round(((i + batch.length) / filteredMatches.length) * 100);
                this.cdr.detectChanges();
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            workbooks.push(workbook);
        }
    } else if (this.activeTab === 'boOnly') {
        const filteredBoOnly = this.getFilteredBoOnly();
        
        if (filteredBoOnly.length > 0) {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('BO Uniquement');
            
            // Détecter les doublons TSOP
            const duplicatesMap = this.detectTSOPDuplicates(filteredBoOnly);
            
            // Récupérer toutes les clés
            const allKeys = new Set<string>();
            filteredBoOnly.forEach(record => {
                Object.keys(record).forEach(key => allKeys.add(key));
            });
            const keysArray = Array.from(allKeys);
            
            // Ajouter la colonne commentaire si elle n'existe pas
            if (!keysArray.includes('Commentaire')) {
                keysArray.push('Commentaire');
            }
            
            // Définir les colonnes
            const columns = keysArray.map(key => ({ header: key, key: key, width: 15 }));
            worksheet.columns = columns;
            
            // Styles Excel
            const headerStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
                alignment: { vertical: 'middle' as const, horizontal: 'center' as const },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const tsorDuplicateStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFF0000' } }, // Rouge
                font: { color: { argb: 'FFFFFFFF' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const trxsfStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF00FF00' } }, // Vert
                font: { color: { argb: 'FF000000' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const tsorSansFraisStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }, // Jaune
                font: { color: { argb: 'FF000000' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const regularisationFraisStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFA500' } }, // Orange
                font: { color: { argb: 'FFFFFFFF' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const dataStyle = {
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };
            
            // Ajouter les données
            filteredBoOnly.forEach((record, index) => {
                const rowData: any = {};
                const boOnlyType = this.getBoOnlyType(record);
                const boOnlyComment = this.getBoOnlyComment(record);
                
                keysArray.forEach(key => {
                    if (key === 'Commentaire') {
                        rowData[key] = boOnlyComment;
                    } else {
                        rowData[key] = this.exportAmountValue(key, record[key]);
                    }
                });
                const row = worksheet.addRow(rowData);
                row.eachCell((cell, colNumber) => {
                    const key = keysArray[colNumber - 1];
                    if (key && this.isAmountColumnForExport(key)) cell.numFmt = '#,##0.00';
                });
                // Appliquer le style selon le type
                if (boOnlyType === 'TSOP') {
                    // Style rouge pour TSOP (écarts BO sans correspondance)
                    row.eachCell(cell => {
                        cell.style = tsorDuplicateStyle;
                    });
                } else if (boOnlyType === 'TRXSF') {
                    // Style vert pour TRXSF (écarts BO avec une seule correspondance)
                    row.eachCell(cell => {
                        cell.style = trxsfStyle;
                    });
                } else {
                    // Style normal
                    row.eachCell(cell => {
                        cell.style = dataStyle;
                    });
                }
            });
            
            // Appliquer les styles d'en-tête
            worksheet.getRow(1).eachCell(cell => {
                cell.style = headerStyle;
            });
            
            workbooks.push(workbook);
        }
    } else if (this.activeTab === 'partnerOnly') {
        const filteredPartnerOnly = this.getFilteredPartnerOnly();
        
        if (filteredPartnerOnly.length > 0) {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Partenaire Uniquement');
            
            // Détecter les doublons TSOP
            const duplicatesMap = this.detectTSOPDuplicates(filteredPartnerOnly);
            
            // Récupérer toutes les clés
            const allKeys = new Set<string>();
            filteredPartnerOnly.forEach(record => {
                Object.keys(record).forEach(key => allKeys.add(key));
            });
            const keysArray = Array.from(allKeys);
            
            // Définir les colonnes
            const columns = keysArray.map(key => ({ header: key, key: key, width: 15 }));
            worksheet.columns = columns;
            
            // Styles Excel
            const headerStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
                alignment: { vertical: 'middle' as const, horizontal: 'center' as const },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const tsorDuplicateStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFF0000' } }, // Rouge
                font: { color: { argb: 'FFFFFFFF' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const tsorSansFraisStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }, // Jaune
                font: { color: { argb: 'FF000000' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const regularisationFraisStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFA500' } }, // Orange
                font: { color: { argb: 'FFFFFFFF' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const trxsfStyle = {
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF00FF00' } }, // Vert
                font: { color: { argb: 'FF000000' }, bold: true },
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };

            const dataStyle = {
                border: {
                    top: { style: 'thin' as const },
                    left: { style: 'thin' as const },
                    bottom: { style: 'thin' as const },
                    right: { style: 'thin' as const }
                }
            };
            
            // Ajouter les données
            filteredPartnerOnly.forEach((record, index) => {
                const rowData: any = {};
                const tsopType = this.getTSOPType(record);
                const commentaire = record['Commentaire'] || record['commentaire'] || '';
                
                keysArray.forEach(key => {
                    rowData[key] = this.exportAmountValue(key, record[key]);
                });
                const row = worksheet.addRow(rowData);
                row.eachCell((cell, colNumber) => {
                    const key = keysArray[colNumber - 1];
                    if (key && this.isAmountColumnForExport(key)) cell.numFmt = '#,##0.00';
                });
                // Appliquer le style selon le type - ÉCARTS PARTENAIRE
                // Priorité: Commentaire du backend (Ecart, TRXSF) > Type Opération (TSF, C_FRAIS)
                if (commentaire === 'Ecart') {
                    // Style orange pour tous les Ecart
                    row.eachCell(cell => {
                        cell.style = regularisationFraisStyle;
                    });
                } else if (commentaire === 'TRXSF') {
                    // Style vert pour TRXSF
                    row.eachCell(cell => {
                        cell.style = trxsfStyle;
                    });
                } else if (tsopType === 'TSF') {
                    // Style jaune pour TSF (IMPACT sans FRAIS)
                    row.eachCell(cell => {
                        cell.style = tsorSansFraisStyle;
                    });
                } else if (tsopType === 'C_FRAIS') {
                    // Style orange pour C FRAIS (FRAIS_TRANSACTION)
                    row.eachCell(cell => {
                        cell.style = regularisationFraisStyle;
                    });
                } else {
                    // Style normal
                    row.eachCell(cell => {
                        cell.style = dataStyle;
                    });
                }
            });
            
            // Appliquer les styles d'en-tête
            worksheet.getRow(1).eachCell(cell => {
                cell.style = {
                    font: { bold: true, color: { argb: 'FFFFFFFF' } },
                    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
                    alignment: { vertical: 'middle' as const, horizontal: 'center' as const }
                };
            });
            
            workbooks.push(workbook);
        }
    } else if (this.activeTab === 'agencySummary') {
        const agencySummary = this.getAgencySummary();
        
        if (agencySummary.length > 0) {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Résumé par Agence');
            
            // Définir les colonnes
            worksheet.columns = [
                { header: 'Agence', key: 'agency', width: 20 },
                { header: 'Service', key: 'service', width: 20 },
                { header: 'Pays', key: 'country', width: 15 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Volume Total', key: 'totalVolume', width: 20 },
                { header: 'Nombre d\'Enregistrements', key: 'recordCount', width: 25 }
            ];
            
            // Ajouter les données (colonnes montant en nombre)
            agencySummary.forEach(item => {
                const row = worksheet.addRow({
                    agency: item.agency,
                    service: item.service,
                    country: item.country,
                    date: item.date,
                    totalVolume: Number(item.totalVolume) || 0,
                    recordCount: Number(item.recordCount) || 0
                });
                row.getCell(5).numFmt = '#,##0.00'; // Volume Total
                row.getCell(6).numFmt = '#,##0';    // Nombre d'enregistrements
            });
            
            // Appliquer les styles à l'en-tête
            worksheet.getRow(1).eachCell(cell => {
                cell.style = {
                    font: { bold: true, color: { argb: 'FFFFFFFF' } },
                    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
                    alignment: { vertical: 'middle' as const, horizontal: 'center' as const }
                };
            });
            
            workbooks.push(workbook);
        }
    }

    // Si aucun workbook n'a été créé, créer un fichier par défaut
    if (workbooks.length === 0) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Aucune Donnée');
        worksheet.addRow(['Aucune donnée disponible pour l\'export']);
        workbooks.push(workbook);
    }

    return workbooks;
}

private async downloadExcelFile(workbooks: ExcelJS.Workbook[], fileName: string): Promise<void> {
    // On ne télécharge qu'un seul fichier
    if (workbooks.length === 0) return;
    const workbook = workbooks[0];
    try {
        const buffer = await workbook.xlsx.writeBuffer({
            useStyles: true,
            useSharedStrings: false
        });
        if (buffer.byteLength === 0) {
            throw new Error(this.t('RES.dlg.bufferEmpty'));
        }
        const blob = new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        if (blob.size === 0) {
            throw new Error(this.t('RES.dlg.blobEmpty'));
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        throw error;
    }
}

    /**
     * Export optimisé rapide (Web Worker pour gros volumes, export direct pour petits volumes).
     * @param forceTab Onglet à exporter : 'matches' | 'boOnly' | 'partnerOnly' | 'agencySummary'. Si fourni, l'export utilise cet onglet sans changer l'onglet affiché.
     */
    async exportResultsOptimized(forceTab?: 'matches' | 'boOnly' | 'partnerOnly' | 'agencySummary') {
        const previousTab = this.activeTab;
        if (forceTab !== undefined) {
            this.activeTab = forceTab;
        }

        try {
            this.isExporting = true;
            this.exportProgressOptimized = {
                current: 0,
                total: 0,
                percentage: 0,
                message: this.t('RES.dlg.optimizedExportStart'),
                isComplete: false
            };
            this.cdr.detectChanges();

            // Demander le nom du fichier à l'utilisateur
            const fileName = await this.promptFileName();
            if (!fileName) {
                this.isExporting = false;
                return;
            }

            // Préparer les données complètes de l'onglet (sans filtre/recherche écran).
            const { rows, columns } = await this.prepareDataForExport();
            
            if (rows.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.noDataForThisExport'));
                this.isExporting = false;
                return;
            }

            // Stratégie : toujours export rapide (exportQuick) pour réactivité ; Web Worker uniquement pour très gros volumes
            const isLargeDataset = rows.length > 15000;
            const format = fileName.endsWith('.csv') ? 'csv' : 'xlsx';
            
            if (isLargeDataset) {
                // Gros volumes : Web Worker pour ne pas bloquer l'UI
                this.exportOptimizedProgressSub?.unsubscribe();
                this.exportOptimizedProgressSub = this.exportOptimizationService.exportProgress$.subscribe(progress => {
                    this.exportProgressOptimized = progress;
                    this.cdr.detectChanges();

                    if (!progress.isComplete) {
                        return;
                    }

                    this.isExporting = false;
                    if (progress.message.includes('✅')) {
                        this.popupService.showSuccess(this.t('RES.dlg.exportSuccess'));
                    } else if (progress.message.toLowerCase().includes('erreur')) {
                        this.popupService.showError(progress.message || this.t('RES.dlg.exportError'));
                    }
                    this.exportOptimizedProgressSub?.unsubscribe();
                    this.exportOptimizedProgressSub = undefined;
                    this.cdr.detectChanges();
                });

                if (format === 'csv') {
                    await this.exportOptimizationService.exportCSVOptimized(
                        rows,
                        columns,
                        fileName,
                        { chunkSize: 5000, useWebWorker: true, enableCompression: true }
                    );
                } else {
                    await this.exportOptimizationService.exportExcelOptimized(
                        rows,
                        columns,
                        fileName,
                        { chunkSize: 3000, useWebWorker: false, enableCompression: true }
                    );
                }
            } else {
                // Export rapide pour volumes petits/moyens (priorité vitesse)
                try {
                    this.exportOptimizationService.exportQuick(rows, columns, fileName, format);
                    this.popupService.showSuccess(this.t('RES.dlg.exportSuccess'));
                } catch (e: any) {
                    this.popupService.showError(e?.message || this.t('RES.dlg.exportError'));
                } finally {
                    this.isExporting = false;
                    this.cdr.detectChanges();
                }
            }
        } catch (error) {
            this.popupService.showError((error as any)?.message || this.t('RES.dlg.optimizedExportError'));
            this.isExporting = false;
            this.cdr.detectChanges();
        } finally {
            if (forceTab !== undefined) {
                this.activeTab = previousTab;
            }
            this.cdr.detectChanges();
        }
    }

    /**
     * Prépare les données pour l'export selon l'onglet actif
     */
    private async prepareDataForExport(): Promise<{ rows: any[], columns: string[] }> {
        let rows: any[] = [];
        let columns: string[] = [];

        switch (this.activeTab) {
            case 'matches': {
                const matches = await this.getUnfilteredMatchesForExport();
                const allBoKeys = new Set<string>();
                const allPartnerKeys = new Set<string>();
                matches.forEach(match => {
                    Object.keys(match.boData || {}).forEach(k => allBoKeys.add(k));
                    Object.keys(match.partnerData || {}).forEach(k => allPartnerKeys.add(k));
                });
                const boKeysArray = Array.from(allBoKeys);
                const partnerKeysArray = Array.from(allPartnerKeys);
                columns = ['Clé', ...boKeysArray.map(k => `BO_${k}`), ...partnerKeysArray.map(k => `PARTENAIRE_${k}`)];
                rows = matches.map(match => {
                    const row: any = { 'Clé': match.key };
                    boKeysArray.forEach(k => { row[`BO_${k}`] = match.boData?.[k] ?? ''; });
                    partnerKeysArray.forEach(k => { row[`PARTENAIRE_${k}`] = match.partnerData?.[k] ?? ''; });
                    return row;
                });
                break;
            }

            case 'boOnly': {
                rows = await this.getUnfilteredBoOnlyForExport();
                const allKeysBo = new Set<string>();
                rows.forEach(record => Object.keys(record).forEach(k => allKeysBo.add(k)));
                columns = Array.from(allKeysBo);
                break;
            }
            case 'partnerOnly': {
                rows = await this.getUnfilteredPartnerOnlyForExport();
                const allKeysPartner = new Set<string>();
                rows.forEach(record => Object.keys(record).forEach(k => allKeysPartner.add(k)));
                columns = Array.from(allKeysPartner);
                break;
            }

            case 'agencySummary':
                // Pour le résumé par agence, on utilise les données existantes
                rows = this.response?.boOnly || [];
                columns = rows.length > 0 ? Object.keys(rows[0]) : [];
                break;

            default:
                rows = [];
                columns = [];
        }

        return { rows, columns };
    }

    private getExportSessionId(): string | null {
        return this.response?.progressSessionId
            || this.currentJobId
            || this.reconciliationService.getCurrentJobId();
    }

    private async ensureAllExportDetailsLoaded(): Promise<void> {
        const sessionId = this.getExportSessionId();
        if (!sessionId || !this.response) {
            return;
        }

        const details = await this.reconciliationService.loadAllDetailResults(sessionId);
        this.response = {
            ...this.response,
            matches: details.matches || [],
            boOnly: details.boOnly || [],
            partnerOnly: details.partnerOnly || [],
            mismatches: details.mismatches || []
        };
    }

    private async getUnfilteredMatchesForExport(): Promise<Match[]> {
        if ((this.response?.matches?.length ?? 0) === 0 && (this.response?.totalMatches ?? 0) > 0) {
            await this.ensureAllExportDetailsLoaded();
        }
        return this.response?.matches || [];
    }

    private async getUnfilteredBoOnlyForExport(): Promise<Record<string, string>[]> {
        const boOnly = this.response?.boOnly || [];
        const expectedBoOnly = this.getResponseBoOnlyTotal();
        if (boOnly.length === 0 && expectedBoOnly > 0) {
            const sessionId = this.getExportSessionId();
            if (sessionId) {
                const ecarts = await this.reconciliationService.loadBoEcartsFromSession(sessionId);
                if (this.response) {
                    this.response = {
                        ...this.response,
                        boOnly: ecarts.boOnly || [],
                        mismatches: ecarts.mismatches || []
                    };
                }
            }
        }
        return this.response?.boOnly || [];
    }

    private async getUnfilteredPartnerOnlyForExport(): Promise<Record<string, string>[]> {
        const partnerOnly = this.response?.partnerOnly || [];
        if (partnerOnly.length === 0 && (this.response?.totalPartnerOnly ?? 0) > 0) {
            const sessionId = this.getExportSessionId();
            if (sessionId) {
                const loaded = await this.reconciliationService.loadPartnerOnlyFromSession(sessionId);
                if (this.response) {
                    this.response = { ...this.response, partnerOnly: loaded || [] };
                }
            }
        }
        return this.response?.partnerOnly || [];
    }

    nouvelleReconciliation() {
        let mode = this.appStateService.getReconciliationLaunchMode();
        if (mode === 'manual' && this.magicServiceSummaries.length > 0) {
            mode = 'magic';
        }

        const entryPath = this.appStateService.getReconciliationEntryPath()
            || this.appStateService.getDefaultEntryPathForMode(mode);

        this.reconciliationSummaryService.clearAgencySummary();
        this.appStateService.resetForNewReconciliation();
        this.reconciliationTabsService.clearAllData();
        this.reconciliationService.clearData();

        const queryParams: { reset: string; mode?: string } = { reset: '1' };
        if (mode === 'magic') {
            queryParams.mode = 'magic';
        } else if (mode === 'assisted') {
            queryParams.mode = 'assisted';
        } else if (entryPath === '/reconciliation-launcher') {
            queryParams.mode = 'manual';
        }

        this.router.navigate([entryPath], { queryParams }).catch(error => {
        });
    }

    private calculateTotalVolumeCallCount = 0;
    calculateTotalVolume(type: 'bo' | 'partner'): number {
        this.calculateTotalVolumeCallCount++;
        const startTime = performance.now();
        if (this.calculateTotalVolumeCallCount <= 5) {
        }
        
        // Utiliser le cache si disponible pour éviter les recalculs coûteux
        if (type === 'bo' && this.cachedTotalVolumeBo !== null) {
            const duration = performance.now() - startTime;
            if (this.calculateTotalVolumeCallCount <= 5) {
            }
            return this.cachedTotalVolumeBo;
        }
        
        if (type === 'partner' && this.cachedTotalVolumePartner !== null) {
            const duration = performance.now() - startTime;
            if (this.calculateTotalVolumeCallCount <= 5) {
            }
            return this.cachedTotalVolumePartner;
        }
        
        // Si pas de cache, retourner 0 temporairement et calculer en arrière-plan
        if (type === 'partner' && !this.isCalculatingVolumes) {
            this.calculateVolumesAsync();
            return 0; // Retourner 0 temporairement pendant le calcul
        }
        
        let result: number;
        if (type === 'partner') {
            // Pour le volume partenaire, inclure les correspondances ET les écarts partenaire
            const matchesVolume = this.calculateTotalVolumePartnerMatches();
            const partnerOnlyVolume = this.calculateTotalVolumePartnerOnly();
            result = matchesVolume + partnerOnlyVolume;
            this.cachedTotalVolumePartner = result; // Mettre en cache
        } else {
            // Pour le volume BO, utiliser la logique originale
            if (!this.filteredMatches || this.filteredMatches.length === 0) {
                result = 0;
            } else {
                const amountColumn = this.findAmountColumn(type);
                if (!amountColumn) {
                    result = 0;
                } else {
                    result = this.filteredMatches.reduce((total, match) => {
                        const amount = parseFloat(match.boData[amountColumn] || '0');
                        return total + (isNaN(amount) ? 0 : amount);
                    }, 0);
                }
            }
            this.cachedTotalVolumeBo = result; // Mettre en cache
        }
        
        const duration = performance.now() - startTime;
        if (duration > 1 || this.calculateTotalVolumeCallCount <= 5) {
        }
        return result;
    }
    
    /**
     * Calcule les volumes de manière asynchrone en arrière-plan pour ne pas bloquer l'affichage
     */
    private calculateVolumesAsync(): void {
        if (this.isCalculatingVolumes) {
            return; // Déjà en cours
        }
        
        this.isCalculatingVolumes = true;
        
        // Calculer en arrière-plan avec yield au navigateur
        setTimeout(async () => {
            const startTime = performance.now();
            
            // Calculer le volume BO (rapide)
            const boStart = performance.now();
            if (!this.filteredMatches || this.filteredMatches.length === 0) {
                this.cachedTotalVolumeBo = 0;
            } else {
                const amountColumn = this.findAmountColumn('bo');
                if (amountColumn) {
                    this.cachedTotalVolumeBo = this.filteredMatches.reduce((total, match) => {
                        const amount = parseFloat(match.boData[amountColumn] || '0');
                        return total + (isNaN(amount) ? 0 : amount);
                    }, 0);
                } else {
                    this.cachedTotalVolumeBo = 0;
                }
            }
            const boDuration = performance.now() - boStart;
            
            // Calculer le volume Partner (lent - par chunks)
            const partnerStart = performance.now();
            const matchesVolume = await this.calculateTotalVolumePartnerMatchesAsync();
            const partnerOnlyVolume = this.calculateTotalVolumePartnerOnly();
            this.cachedTotalVolumePartner = matchesVolume + partnerOnlyVolume;
            const partnerDuration = performance.now() - partnerStart;
            
            // Calculer la différence
            this.cachedVolumeDifference = (this.cachedTotalVolumeBo || 0) - (this.cachedTotalVolumePartner || 0);
            
            // Mettre à jour les propriétés publiques pour le template
            this.totalVolumeBo = this.cachedTotalVolumeBo || 0;
            this.totalVolumePartner = this.cachedTotalVolumePartner || 0;
            this.volumeDifference = this.cachedVolumeDifference;
            
            const totalDuration = performance.now() - startTime;
            
            this.isCalculatingVolumes = false;
            
            // Forcer le rendu pour mettre à jour l'affichage avec les valeurs calculées
            this.cdr.markForCheck();
            this.cdr.detectChanges();
        }, 0);
    }
    
    /**
     * Calcule le volume partenaire des correspondances de manière asynchrone par chunks
     */
    private async calculateTotalVolumePartnerMatchesAsync(): Promise<number> {
        if (!this.filteredMatches || this.filteredMatches.length === 0) return 0;
        
        let total = 0;
        const CHUNK_SIZE = 1000; // Traiter 1000 matches à la fois
        
        for (let i = 0; i < this.filteredMatches.length; i += CHUNK_SIZE) {
            const chunk = this.filteredMatches.slice(i, i + CHUNK_SIZE);
            
            for (const match of chunk) {
                const partnerData = match.partnerData || {};
                let recordTotal = 0;
                
                // Liste exhaustive des colonnes qui peuvent contenir des montants
                const possibleAmountColumns = [
                    'amount', 'Amount', 'AMOUNT',
                    'montant', 'Montant', 'MONTANT',
                    'debit', 'Debit', 'DEBIT', 'débit', 'Débit', 'DÉBIT',
                    'credit', 'Credit', 'CREDIT', 'crédit', 'Crédit', 'CRÉDIT',
                    'valeur', 'Valeur', 'VALEUR',
                    'value', 'Value', 'VALUE',
                    'somme', 'Somme', 'SOMME',
                    'sum', 'Sum', 'SUM',
                    'total', 'Total', 'TOTAL',
                    'montant_credit', 'montant_debit', 'montant_débit', 'montant_crédit',
                    'montant_operation', 'montant_opération', 'montant_transaction',
                    'montant_credit_operation', 'montant_débit_operation',
                    'external_amount', 'External amount', 'EXTERNAL_AMOUNT',
                    'externalAmount', 'ExternalAmount',
                    'balance', 'Balance', 'BALANCE'
                ];
                
                // Parcourir toutes les colonnes et sommer tous les montants trouvés en valeur absolue
                for (const column of Object.keys(partnerData)) {
                    const lowerColumn = column.toLowerCase();
                    if (possibleAmountColumns.some(name => lowerColumn.includes(name.toLowerCase()))) {
                        const amount = parseFloat(partnerData[column] || '0');
                        if (!isNaN(amount)) {
                            recordTotal += Math.abs(amount);
                        }
                    }
                }
                
                total += recordTotal;
            }
            
            // Yield au navigateur après chaque chunk pour ne pas bloquer
            if (i + CHUNK_SIZE < this.filteredMatches.length) {
                await this.yieldToBrowser();
            }
        }
        
        return total;
    }

    /**
     * Calcule le volume partenaire des correspondances en sommant TOUS les montants possibles
     * (Amount, debit, credit, etc.) en valeur absolue
     */
    calculateTotalVolumePartnerMatches(): number {
        if (!this.filteredMatches || this.filteredMatches.length === 0) return 0;
        
        return this.filteredMatches.reduce((total, match) => {
            const partnerData = match.partnerData || {};
            let recordTotal = 0;
            
            // Liste exhaustive des colonnes qui peuvent contenir des montants
            const possibleAmountColumns = [
                'amount', 'Amount', 'AMOUNT',
                'montant', 'Montant', 'MONTANT',
                'debit', 'Debit', 'DEBIT', 'débit', 'Débit', 'DÉBIT',
                'credit', 'Credit', 'CREDIT', 'crédit', 'Crédit', 'CRÉDIT',
                'valeur', 'Valeur', 'VALEUR',
                'value', 'Value', 'VALUE',
                'somme', 'Somme', 'SOMME',
                'sum', 'Sum', 'SUM',
                'total', 'Total', 'TOTAL',
                'montant_credit', 'montant_debit', 'montant_débit', 'montant_crédit',
                'montant_operation', 'montant_opération', 'montant_transaction',
                'montant_credit_operation', 'montant_débit_operation',
                'external_amount', 'External amount', 'EXTERNAL_AMOUNT',
                'externalAmount', 'ExternalAmount',
                'balance', 'Balance', 'BALANCE'
            ];
            
            // Parcourir toutes les colonnes et sommer tous les montants trouvés en valeur absolue
            for (const column of Object.keys(partnerData)) {
                const lowerColumn = column.toLowerCase();
                if (possibleAmountColumns.some(name => lowerColumn.includes(name.toLowerCase()))) {
                    const amount = parseFloat(partnerData[column] || '0');
                    if (!isNaN(amount)) {
                        recordTotal += Math.abs(amount);
                    }
                }
            }
            
            return total + recordTotal;
        }, 0);
    }

    /** Corrige les dates stockées en numéros de série Excel dans la réponse */
    private normalizeReconciliationResponseDates(response: ReconciliationResponse): ReconciliationResponse {
        // Anti-OOM : cloner chaque ligne (~5,5 M de matches/partnerOnly) faisait planter le
        // navigateur. Si le résultat est paginé/slim ou si le volume est énorme, on ne fait
        // AUCUNE copie profonde : les lignes arrivent déjà des sessions client/HTTP et les
        // dates ont été normalisées à la source. Clone uniquement les réponses raisonnables.
        const totalRows = (response?.matches?.length ?? 0)
            + (response?.boOnly?.length ?? 0)
            + (response?.partnerOnly?.length ?? 0)
            + (response?.mismatches?.length ?? 0);
        const isPaginatedOrSlim = response?.resultsPaginated === true;
        if (isPaginatedOrSlim || totalRows > 100000) {
            return {
                ...response,
                matches: response.matches || [],
                boOnly: response.boOnly || [],
                partnerOnly: response.partnerOnly || [],
                mismatches: response.mismatches || []
            };
        }
        return {
            ...response,
            matches: response.matches?.map(m => ({
                ...m,
                boData: normalizeRecordDateFields(m.boData as Record<string, unknown>) as Record<string, string>,
                partnerData: normalizeRecordDateFields(m.partnerData as Record<string, unknown>) as Record<string, string>
            })),
            boOnly: normalizeRecordsDateFields(response.boOnly as Record<string, unknown>[]) as Record<string, string>[],
            partnerOnly: normalizeRecordsDateFields(response.partnerOnly as Record<string, unknown>[]) as Record<string, string>[],
            mismatches: normalizeRecordsDateFields(response.mismatches as Record<string, unknown>[]) as Record<string, string>[]
        };
    }

    /** Indique si une colonne est une colonne montant/volume pour l'export Excel (à écrire en nombre) */
    private isAmountColumnForExport(key: string): boolean {
        const lower = (key || '').toLowerCase();
        const amountKeys = [
            'montant', 'amount', 'valeur', 'value', 'somme', 'sum', 'total', 'volume',
            'credit', 'crédit', 'debit', 'débit', 'montant_credit', 'montant_débit',
            'montant_debit', 'montant_crédit', 'montant_operation', 'montant_opération',
            'montant_transaction', 'montant_credit_operation', 'montant_débit_operation'
        ];
        return amountKeys.some(k => lower === k || lower.includes(k));
    }

    /** Pour l'export Excel : montants en nombre, dates en texte lisible, sinon valeur brute */
    private exportAmountValue(key: string, val: any): any {
        if (val === undefined || val === null || val === '') return '';
        if (this.isAmountColumnForExport(key)) {
            const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
            return !isNaN(num) ? num : val;
        }
        if (isDateColumnName(key)) {
            return formatSpreadsheetDateValue(val);
        }
        return val;
    }

    private findAmountColumn(type: 'bo' | 'partner'): string | null {
        if (!this.filteredMatches || this.filteredMatches.length === 0) return null;
        
        const firstMatch = this.filteredMatches[0];
        const data = type === 'bo' ? firstMatch.boData : firstMatch.partnerData;
        
        // Liste des noms possibles pour la colonne de montant
        const possibleAmountColumns = [
            'montant', 'amount', 'valeur', 'value', 'somme', 'sum', 'total',
            'credit', 'crédit', 'debit', 'débit', 'montant_credit', 'montant_débit',
            'montant_credit', 'montant_debit', 'montant_crédit', 'montant_débit',
            'montant_operation', 'montant_opération', 'montant_transaction',
            'montant_credit_operation', 'montant_débit_operation'
        ];
        
        // Chercher une colonne qui contient un des noms possibles
        for (const column of Object.keys(data)) {
            const lowerColumn = column.toLowerCase();
            if (possibleAmountColumns.some(name => lowerColumn.includes(name))) {
                return column;
            }
        }
        
        return null;
    }

    private calculateVolumeDifferenceCallCount = 0;
    calculateVolumeDifference(): number {
        this.calculateVolumeDifferenceCallCount++;
        const startTime = performance.now();
        if (this.calculateVolumeDifferenceCallCount <= 5) {
        }
        
        // Utiliser le cache si disponible
        if (this.cachedVolumeDifference !== null) {
            const duration = performance.now() - startTime;
            if (this.calculateVolumeDifferenceCallCount <= 5) {
            }
            return this.cachedVolumeDifference;
        }
        
        // Si pas de cache, calculer (mais cela déclenchera le calcul asynchrone)
        const boVolume = this.calculateTotalVolume('bo');
        const partnerVolume = this.calculateTotalVolume('partner');
        const result = boVolume - partnerVolume;
        
        // Mettre en cache si les deux volumes sont calculés
        if (this.cachedTotalVolumeBo !== null && this.cachedTotalVolumePartner !== null) {
            this.cachedVolumeDifference = result;
        }
        
        const duration = performance.now() - startTime;
        if (duration > 1 || this.calculateVolumeDifferenceCallCount <= 5) {
        }
        return result;
    }

    calculateTotalVolumeBoOnly(): number {
        if (!this.filteredBoOnly || this.filteredBoOnly.length === 0) return 0;
        return this.filteredBoOnly.reduce(
            (total, record) => total + extractRecordAmount(record),
            0
        );
    }

    calculateTotalVolumePartnerOnly(): number {
        if (!this.filteredPartnerOnly || this.filteredPartnerOnly.length === 0) return 0;
        
        // Pour OPPART, faire la somme uniquement des lignes IMPACT_COMPTIMPACT-COMPTE-GENERAL
        if (this.isTRXBOOPPARTReconciliation()) {
            return this.filteredPartnerOnly.reduce((total, record) => {
                const typeOperation = this.getTypeOperation(record);
                // Ne sommer que les lignes avec IMPACT_COMPTIMPACT-COMPTE-GENERAL
                if (typeOperation && typeOperation.includes('IMPACT_COMPTIMPACT-COMPTE-GENERAL')) {
                    const amount = this.getPartnerOnlyVolume(record);
                    // Utiliser la valeur absolue pour tous les fichiers partenaire
                    return total + Math.abs(amount);
                }
                return total;
            }, 0);
        }
        
        // Pour les autres cas, utiliser la valeur absolue du montant
        return this.filteredPartnerOnly.reduce((total, record) => {
            const amount = this.getPartnerOnlyVolume(record);
            // Utiliser la valeur absolue pour tous les fichiers partenaire
            return total + Math.abs(amount);
        }, 0);
    }

    getPartnerOnlyVolume(record: Record<string, string>): number {
        const cached = this.partnerOnlyVolumeCache.get(record as object);
        if (cached !== undefined) {
            return cached;
        }
        const value = extractRecordAmount(record);
        this.partnerOnlyVolumeCache.set(record as object, value);
        return value;
    }

    // Cache pour getBoAgencyAndService par match key (évite les recalculs dans le template)
    private boAgencyServiceCacheByKey = new Map<string, { agency: string; service: string; volume: number; date: string; country: string }>();
    
    /**
     * Version optimisée avec cache par clé de match pour le template
     */
    getCachedBoAgencyAndService(match: Match): { agency: string; service: string; volume: number; date: string; country: string } {
        const matchKey = match.key || JSON.stringify(match.boData);
        
        // Vérifier le cache d'abord
        if (this.boAgencyServiceCacheByKey.has(matchKey)) {
            return this.boAgencyServiceCacheByKey.get(matchKey)!;
        }
        
        // Calculer et mettre en cache
        const result = this.getBoAgencyAndService(match);
        this.boAgencyServiceCacheByKey.set(matchKey, result);
        return result;
    }
    
    getBoAgencyAndService(match: Match): { agency: string; service: string; volume: number; date: string; country: string } {
        // Créer une clé de cache basée sur les données du match
        const cacheKey = JSON.stringify(match.boData);
        
        // Vérifier le cache d'abord
        if (this.agencyServiceCache.has(cacheKey)) {
            return this.agencyServiceCache.get(cacheKey)!;
        }
        
        const boData = match.boData;
        
        // Fonction helper pour trouver une valeur avec plusieurs noms de colonnes possibles
        const getValueWithFallback = (possibleKeys: string[]): string => {
            for (const key of possibleKeys) {
                if (boData[key] !== undefined && boData[key] !== null && boData[key] !== '') {
                    return boData[key].toString();
                }
            }
            return '';
        };
        
        const agency = getValueWithFallback(['Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'AGENCY']) || '';
        const service = getValueWithFallback(['Service', 'service', 'SERVICE', 'serv', 'Serv']) || '';
        
        // Recherche de volume/montant avec une liste exhaustive (comme dans calculateTotalVolumePartnerMatches)
        const possibleAmountColumns = [
            'amount', 'Amount', 'AMOUNT',
            'montant', 'Montant', 'MONTANT',
            'debit', 'Debit', 'DEBIT', 'débit', 'Débit', 'DÉBIT',
            'credit', 'Credit', 'CREDIT', 'crédit', 'Crédit', 'CRÉDIT',
            'valeur', 'Valeur', 'VALEUR',
            'value', 'Value', 'VALUE',
            'somme', 'Somme', 'SOMME',
            'sum', 'Sum', 'SUM',
            'total', 'Total', 'TOTAL',
            'volume', 'Volume', 'VOLUME',
            'montant_credit', 'montant_debit', 'montant_débit', 'montant_crédit',
            'montant_operation', 'montant_opération', 'montant_transaction',
            'montant_credit_operation', 'montant_débit_operation',
            'external_amount', 'External amount', 'EXTERNAL_AMOUNT',
            'externalAmount', 'ExternalAmount',
            'balance', 'Balance', 'BALANCE'
        ];
        
        let volume = 0;
        // Parcourir toutes les colonnes et chercher celles qui contiennent des montants
        for (const column of Object.keys(boData)) {
            const lowerColumn = column.toLowerCase();
            if (possibleAmountColumns.some(name => lowerColumn === name.toLowerCase() || lowerColumn.includes(name.toLowerCase()))) {
                const value = boData[column];
                if (value !== undefined && value !== null && value !== '') {
                    // Normaliser le format : remplacer virgule par point, supprimer espaces
                    const normalizedValue = value.toString().trim().replace(/\s/g, '').replace(',', '.');
                    const parsedValue = parseFloat(normalizedValue);
                    if (!isNaN(parsedValue)) {
                        volume += Math.abs(parsedValue);
                    }
                }
            }
        }
        
        // Si aucune colonne trouvée, essayer avec getValueWithFallback pour compatibilité
        if (volume === 0) {
            const volumeStr = getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME']);
            if (volumeStr) {
                const normalizedVolumeStr = volumeStr.toString().trim().replace(/\s/g, '').replace(',', '.');
                volume = parseFloat(normalizedVolumeStr) || 0;
            }
        }
        
        // Debug: log si volume est 0 mais qu'on a des données
        if (volume === 0 && Object.keys(boData).length > 0) {
        }
        
        const date = getValueWithFallback(['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'created', 'Created', 'CREATED']) || '';
        const countryColumn = this.findCountryColumn(boData);
        let country = 'Non spécifié';
        
        if (countryColumn === 'fallback') {
            // Utiliser la logique de fallback pour déterminer le pays
            country = this.determineCountryFromContext(boData) || 'Non spécifié';
        } else if (countryColumn) {
            country = boData[countryColumn] || 'Non spécifié';
        }
        
        const result = { agency, service, volume, date, country };
        
        // Mettre en cache le résultat
        this.agencyServiceCache.set(cacheKey, result);
        
        return result;
    }

    getBoOnlyAgencyAndService(record: Record<string, string>): { agency: string; service: string; volume: number; date: string; country: string } {
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
        
        // Recherche de volume/montant avec une liste exhaustive (comme dans calculateTotalVolumePartnerMatches)
        const possibleAmountColumns = [
            'amount', 'Amount', 'AMOUNT',
            'montant', 'Montant', 'MONTANT',
            'debit', 'Debit', 'DEBIT', 'débit', 'Débit', 'DÉBIT',
            'credit', 'Credit', 'CREDIT', 'crédit', 'Crédit', 'CRÉDIT',
            'valeur', 'Valeur', 'VALEUR',
            'value', 'Value', 'VALUE',
            'somme', 'Somme', 'SOMME',
            'sum', 'Sum', 'SUM',
            'total', 'Total', 'TOTAL',
            'volume', 'Volume', 'VOLUME',
            'montant_credit', 'montant_debit', 'montant_débit', 'montant_crédit',
            'montant_operation', 'montant_opération', 'montant_transaction',
            'montant_credit_operation', 'montant_débit_operation',
            'external_amount', 'External amount', 'EXTERNAL_AMOUNT',
            'externalAmount', 'ExternalAmount',
            'balance', 'Balance', 'BALANCE'
        ];
        
        let volume = 0;
        // Parcourir toutes les colonnes et chercher celles qui contiennent des montants
        for (const column of Object.keys(record)) {
            const lowerColumn = column.toLowerCase();
            if (possibleAmountColumns.some(name => lowerColumn === name.toLowerCase() || lowerColumn.includes(name.toLowerCase()))) {
                const value = record[column];
                if (value !== undefined && value !== null && value !== '') {
                    // Normaliser le format : remplacer virgule par point, supprimer espaces
                    const normalizedValue = value.toString().trim().replace(/\s/g, '').replace(',', '.');
                    const parsedValue = parseFloat(normalizedValue);
                    if (!isNaN(parsedValue)) {
                        volume += Math.abs(parsedValue);
                    }
                }
            }
        }
        
        // Si aucune colonne trouvée, essayer avec getValueWithFallback pour compatibilité
        if (volume === 0) {
            const volumeStr = getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME']);
            if (volumeStr) {
                const normalizedVolumeStr = volumeStr.toString().trim().replace(/\s/g, '').replace(',', '.');
                volume = parseFloat(normalizedVolumeStr) || 0;
            }
        }
        
        // Debug: log si volume est 0 mais qu'on a des données
        if (volume === 0 && Object.keys(record).length > 0) {
        }
        
        // Recherche de date avec plusieurs noms possibles
        const date = getValueWithFallback(['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'created', 'Created', 'CREATED']);
        
        // Recherche de pays
        const countryColumn = this.findCountryColumn(record);
        let country = 'Non spécifié';
        
        if (countryColumn === 'fallback') {
            // Utiliser la logique de fallback pour déterminer le pays
            country = this.determineCountryFromContext(record) || 'Non spécifié';
        } else if (countryColumn) {
            country = record[countryColumn] || 'Non spécifié';
        }


        return { agency, service, volume, date, country };
    }

    getPartnerOnlyAgencyAndService(record: Record<string, string>): { agency: string; service: string; volume: number; date: string; country: string } {
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
        
        // Recherche de volume/montant avec une liste exhaustive (comme dans calculateTotalVolumePartnerMatches)
        const possibleAmountColumns = [
            'amount', 'Amount', 'AMOUNT',
            'montant', 'Montant', 'MONTANT',
            'debit', 'Debit', 'DEBIT', 'débit', 'Débit', 'DÉBIT',
            'credit', 'Credit', 'CREDIT', 'crédit', 'Crédit', 'CRÉDIT',
            'valeur', 'Valeur', 'VALEUR',
            'value', 'Value', 'VALUE',
            'somme', 'Somme', 'SOMME',
            'sum', 'Sum', 'SUM',
            'total', 'Total', 'TOTAL',
            'volume', 'Volume', 'VOLUME',
            'montant_credit', 'montant_debit', 'montant_débit', 'montant_crédit',
            'montant_operation', 'montant_opération', 'montant_transaction',
            'montant_credit_operation', 'montant_débit_operation',
            'external_amount', 'External amount', 'EXTERNAL_AMOUNT',
            'externalAmount', 'ExternalAmount',
            'balance', 'Balance', 'BALANCE'
        ];
        
        let volume = 0;
        // Parcourir toutes les colonnes et chercher celles qui contiennent des montants
        for (const column of Object.keys(record)) {
            const lowerColumn = column.toLowerCase();
            if (possibleAmountColumns.some(name => lowerColumn === name.toLowerCase() || lowerColumn.includes(name.toLowerCase()))) {
                const value = record[column];
                if (value !== undefined && value !== null && value !== '') {
                    // Normaliser le format : remplacer virgule par point, supprimer espaces
                    const normalizedValue = value.toString().trim().replace(/\s/g, '').replace(',', '.');
                    const parsedValue = parseFloat(normalizedValue);
                    if (!isNaN(parsedValue)) {
                        volume += Math.abs(parsedValue);
                    }
                }
            }
        }
        
        // Si aucune colonne trouvée, essayer avec getValueWithFallback pour compatibilité
        if (volume === 0) {
            const volumeStr = getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME']);
            if (volumeStr) {
                const normalizedVolumeStr = volumeStr.toString().trim().replace(/\s/g, '').replace(',', '.');
                volume = parseFloat(normalizedVolumeStr) || 0;
            }
        }
        
        // Debug: log si volume est 0 mais qu'on a des données
        if (volume === 0 && Object.keys(record).length > 0) {
        }
        
        // Recherche de date avec plusieurs noms possibles
        const date = getValueWithFallback(['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'created', 'Created', 'CREATED']);
        
        // Recherche de pays
        const countryColumn = this.findCountryColumn(record);
        let country = 'Non spécifié';
        
        if (countryColumn === 'fallback') {
            // Utiliser la logique de fallback pour déterminer le pays
            country = this.determineCountryFromContext(record) || 'Non spécifié';
        } else if (countryColumn) {
            country = record[countryColumn] || 'Non spécifié';
        }


        return { agency, service, volume, date, country };
    }

    getPartnerOnlyDate(record: Record<string, string>): string {
        const cached = this.partnerOnlyDateCache.get(record as object);
        if (cached !== undefined) {
            return cached;
        }
        const dateColumn = this.findDateColumn(record);
        const value = dateColumn ? record[dateColumn] || 'Non spécifié' : 'Non spécifié';
        this.partnerOnlyDateCache.set(record as object, value);
        return value;
    }

    private findDateColumn(data: Record<string, string>): string | null {
        const dateKeywords = ['date', 'jour', 'day', 'created', 'creation', 'transaction'];
        return this.findColumnByKeywords(data, dateKeywords);
    }

    private findCountryColumn(data: Record<string, string>): string | null {
        const possibleColumns = ['GRX', 'grx', 'GRX', 'Pays', 'PAYS', 'Country', 'COUNTRY', 'paysProvenance', 'Pays provenance', 'PAYS PROVENANCE'];
        for (const column of possibleColumns) {
            if (data[column] && data[column].trim() !== '') {
                return column;
            }
        }
        
        // Si aucune colonne exacte n'est trouvée, chercher les colonnes qui contiennent les mots-clés
        const keywords = ['pays', 'country', 'grx', 'provenance'];
        for (const column of Object.keys(data)) {
            const lowerColumn = column.toLowerCase();
            if (keywords.some(keyword => lowerColumn.includes(keyword))) {
                if (data[column] && data[column].trim() !== '') {
                    return column;
                }
            }
        }
        
        // Fallback : pour les fichiers GRX, essayer de déterminer le pays à partir d'autres informations
        const fallbackCountry = this.determineCountryFromContext(data);
        if (fallbackCountry) {
            return 'fallback';
        }
        
        return null;
    }
    
    /**
     * Détermine le pays à partir du contexte pour les fichiers GRX
     */
    private determineCountryFromContext(data: Record<string, string>): string | null {
        // Pour les fichiers GRX, on peut déterminer le pays à partir de plusieurs sources :
        
        // 1. Vérifier si c'est un fichier GRX (TRXBO)
        const isGrxFile = Object.keys(data).some(key => 
            key.toLowerCase().includes('grx') || 
            key.toLowerCase().includes('pays provenance')
        );
        
        if (isGrxFile) {
            
            // 2. Vérifier la colonne GRX pour déterminer le pays
            const grxValue = data['GRX'];
            if (grxValue && grxValue.trim() !== '') {
                // Pour les fichiers GRX, le pays est généralement déterminé par la valeur GRX
                // ou par défaut, on peut utiliser le pays de l'agence
                return 'GRX'; // ou déterminer le pays réel à partir de la valeur GRX
            }
            
            // 3. Vérifier l'agence pour déterminer le pays
            const agency = data['Agence'];
            if (agency && agency.trim() !== '') {
                // Déterminer le pays à partir du code de l'agence
                if (agency.includes('CM')) {
                    return 'CM'; // Cameroun
                } else if (agency.includes('SN')) {
                    return 'SN'; // Sénégal
                } else if (agency.includes('CI')) {
                    return 'CI'; // Côte d'Ivoire
                } else if (agency.includes('BF')) {
                    return 'BF'; // Burkina Faso
                }
            }
            
            // 4. Par défaut pour les fichiers GRX, utiliser le pays de l'agence ou un pays par défaut
            return 'GRX'; // ou 'CM' selon votre logique métier
        }
        
        return null;
    }

    private findColumnByKeywords(data: Record<string, string>, keywords: string[]): string | null {
        for (const column of Object.keys(data)) {
            const lowerColumn = column.toLowerCase();
            if (keywords.some(keyword => lowerColumn.includes(keyword))) {
                return column;
            }
        }
        return null;
    }

    // Mettre en cache le résumé
    private cachedAgencySummary: AgencySummaryData[] | null = null;
    private lastResponseHash: string = '';

    private getResponseHash(): string {
        if (!this.response) return '';
        // Intégrer le contexte magique (service / fichier partenaire) dans la clé de cache :
        // sans lui, le résumé par agence d'un service précédent resterait en cache quand on
        // en sélectionne un autre (mêmes compteurs bruts) → le rapport affiche le mauvais service.
        const ctx = this.getEcartPartitionContext();
        return JSON.stringify({
            matchesCount: this.response.matches?.length || 0,
            boOnlyCount: this.response.boOnly?.length || 0,
            magicService: ctx.service || '',
            magicPartnerFile: ctx.partnerFile || ''
        });
    }

    getAgencySummary(): AgencySummaryData[] {
        const currentHash = this.getResponseHash();
        if (this.cachedAgencySummary && this.lastResponseHash === currentHash) {
            const expectedMatches = this.response?.totalMatches ?? 0;
            const cachedMatches = this.cachedAgencySummary
                .reduce((sum, row) => sum + (Number(row.matches) || 0), 0);
            // Cache invalide si les correspondances n'avaient pas encore été chargées
            if (!(expectedMatches > 0 && cachedMatches === 0)) {
                return this.cachedAgencySummary;
            }
            this.cachedAgencySummary = null;
        }

        const { summary, meta } = this.calculateAgencySummary();
        this.cachedAgencySummary = summary;
        this.lastResponseHash = currentHash;
        // Version + JSON sérialisé : évite de re-faire JSON.stringify(summary) à chaque
        // détection de changement (getAgencySummaryHash / getTotalVolume / getTotalRecords).
        this.agencySummaryVersion++;
        this.cachedAgencySummarySerialized = JSON.stringify(summary);
        this.reconciliationSummaryService.setAgencySummary(summary, meta);
        return summary;
    }

    private lastAgencySummaryMeta = { totalPartnerOnly: 0, hasPartnerOnlyWithAgencyService: false };

    private calculateAgencySummary(): { summary: AgencySummaryData[]; meta: { totalPartnerOnly: number; hasPartnerOnlyWithAgencyService: boolean } } {
        type SummaryEntry = AgencySummaryData & { matches: number; boOnly: number; partnerOnly: number; mismatches: number };
        const summaryMap = new Map<string, SummaryEntry>();
        let partnerOnlyWithoutAgency = 0;
        let hasPartnerOnlyWithAgencyService = false;

        const normalizeDate = (raw: string): string => {
            if (!raw) {
                return new Date().toISOString().split('T')[0];
            }
            const value = String(raw).trim();
            // dd/MM/yyyy -> yyyy-MM-dd
            const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (dmy) {
                return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
            }
            // dd-MM-yyyy
            const dmyDash = value.match(/^(\d{2})-(\d{2})-(\d{4})/);
            if (dmyDash) {
                return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`;
            }
            // yyyy-MM-dd... (y compris avec heure)
            const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
            if (iso) {
                return iso[1];
            }
            if (value.includes('T')) {
                return value.split('T')[0];
            }
            if (value.includes(' ')) {
                return value.split(' ')[0];
            }
            return value;
        };

        const ensureEntry = (
            agency: string,
            service: string,
            country: string,
            date: string
        ): SummaryEntry => {
            const day = normalizeDate(date);
            // Regrouper par agence + service + pays (tous jours), date affichée = plus récente.
            const key = `${agency}|${service}|${country}`;
            let entry = summaryMap.get(key);
            if (!entry) {
                entry = {
                    agency,
                    service,
                    country,
                    date: day,
                    totalVolume: 0,
                    recordCount: 0,
                    matches: 0,
                    boOnly: 0,
                    partnerOnly: 0,
                    mismatches: 0
                };
                summaryMap.set(key, entry);
            } else if (day && day > (entry.date || '')) {
                entry.date = day;
            }
            return entry;
        };

        const addBo = (
            agency: string,
            service: string,
            country: string,
            date: string,
            volume: number,
            kind: 'matches' | 'boOnly' | 'mismatches'
        ) => {
            const entry = ensureEntry(agency, service, country, date);
            entry.recordCount += 1;
            entry.totalVolume += volume || 0;
            if (kind === 'matches') entry.matches += 1;
            if (kind === 'boOnly') entry.boOnly += 1;
            if (kind === 'mismatches') entry.mismatches += 1;
        };

        this.filteredMatches.forEach(match => {
            const boInfo = this.getBoAgencyAndService(match);
            addBo(boInfo.agency, boInfo.service, boInfo.country, boInfo.date, boInfo.volume, 'matches');
        });

        this.filteredBoOnly.forEach(record => {
            const boInfo = this.getBoOnlyAgencyAndService(record);
            addBo(boInfo.agency, boInfo.service, boInfo.country, boInfo.date, boInfo.volume, 'boOnly');
        });

        // Cloisonnement magique : les incohérences (mismatches) doivent être filtrées par service
        // pour que le résumé ne mélange pas les services entre eux.
        const scopedMismatches = partitionEcartRecords(
            this.response?.mismatches || [],
            this.getEcartPartitionContext()
        );
        scopedMismatches.forEach(record => {
            const info = this.getBoOnlyAgencyAndService(record);
            addBo(info.agency, info.service, info.country, info.date, info.volume || 0, 'mismatches');
        });

        this.filteredPartnerOnly.forEach(record => {
            const partnerInfo = this.getPartnerOnlyAgencyAndService(record);
            if (partnerInfo.agency !== 'Inconnue' && partnerInfo.service !== 'Inconnu') {
                hasPartnerOnlyWithAgencyService = true;
                const entry = ensureEntry(
                    partnerInfo.agency,
                    partnerInfo.service,
                    partnerInfo.country,
                    partnerInfo.date
                );
                // partnerOnly ne doit PAS incrémenter recordCount/totalVolume (transactions BO).
                entry.partnerOnly += 1;
            } else {
                partnerOnlyWithoutAgency += 1;
            }
        });

        const summary = Array.from(summaryMap.values()).sort((a, b) => {
            if (a.agency !== b.agency) {
                return a.agency.localeCompare(b.agency);
            }
            return a.service.localeCompare(b.service);
        });

        const totalPartnerOnly = summary.reduce((n, s) => n + (s.partnerOnly || 0), 0) + partnerOnlyWithoutAgency;
        const meta = { totalPartnerOnly, hasPartnerOnlyWithAgencyService };
        this.lastAgencySummaryMeta = meta;
        return { summary, meta };
    }

    // Cache pour les calculs
    private cachedPagedAgencySummary: Array<{agency: string; service: string; date: string; country: string; totalVolume: number; recordCount: number}> | null = null;
    private cachedTotalVolume: number | null = null;
    private cachedTotalRecords: number | null = null;
    private lastAgencyPage: number = 1;
    private lastAgencySummaryHash: string = '';
    // Sérialisation du résumé calculée une seule fois par reconstruction (évite le
    // JSON.stringify de toute la table à chaque détection de changement).
    private cachedAgencySummarySerialized: string | null = null;
    private agencySummaryVersion: number = 0;
    private volumeSummaryVersion: number = -1;
    private recordsSummaryVersion: number = -1;
    private cachedServiceTotals: Array<{ name: string; volume: number }> | null = null;
    private serviceTotalsVersion: number = -1;

    private getAgencySummaryHash(): string {
        this.getAgencySummary();
        const serialized = this.cachedAgencySummarySerialized ?? '';
        return serialized + '_' + this.agencyPage + '_' + this.agencyPageSize;
    }

    private getPagedAgencySummaryCallCount = 0;
    getPagedAgencySummary(): Array<{agency: string; service: string; date: string; country: string; totalVolume: number; recordCount: number}> {
        this.getPagedAgencySummaryCallCount++;
        const startTime = performance.now();
        if (this.getPagedAgencySummaryCallCount <= 5) {
        }
        
        const currentHash = this.getAgencySummaryHash();
        
        if (this.cachedPagedAgencySummary && this.lastAgencySummaryHash === currentHash) {
            const duration = performance.now() - startTime;
            if (this.getPagedAgencySummaryCallCount <= 5) {
            }
            return this.cachedPagedAgencySummary;
        }
        
        const start = (this.agencyPage - 1) * this.agencyPageSize;
        const summary = this.getAgencySummary();
        this.cachedPagedAgencySummary = summary.slice(start, start + this.agencyPageSize);
        this.lastAgencySummaryHash = currentHash;
        
        const duration = performance.now() - startTime;
        if (duration > 1 || this.getPagedAgencySummaryCallCount <= 5) {
        }
        return this.cachedPagedAgencySummary;
    }

    getTotalVolume(): number {
        const summary = this.getAgencySummary();
        
        if (this.cachedTotalVolume !== null && this.volumeSummaryVersion === this.agencySummaryVersion) {
            return this.cachedTotalVolume;
        }
        
        this.cachedTotalVolume = summary.reduce((total, summary) => total + summary.totalVolume, 0);
        this.volumeSummaryVersion = this.agencySummaryVersion;
        return this.cachedTotalVolume;
    }

    getTotalRecords(): number {
        const summary = this.getAgencySummary();
        
        if (this.cachedTotalRecords !== null && this.recordsSummaryVersion === this.agencySummaryVersion) {
            return this.cachedTotalRecords;
        }
        
        this.cachedTotalRecords = summary.reduce((total, summary) => total + summary.recordCount, 0);
        this.recordsSummaryVersion = this.agencySummaryVersion;
        return this.cachedTotalRecords;
    }

    private getTotalTransactionsCallCount = 0;
    getTotalTransactions(): number {
        // Utiliser le cache si disponible
        if (this.cachedTotalTransactions !== null) {
            return this.cachedTotalTransactions;
        }
        
        this.getTotalTransactionsCallCount++;
        const startTime = performance.now();
        if (this.getTotalTransactionsCallCount <= 5) {
        }
        
        // Nombre de transactions = correspondances + écarts BO
        // CORRECTION: Utiliser directement les données de la réponse au lieu des versions filtrées
        // pour garantir que le nombre total de transactions est toujours correct
        // Nombre de transactions = correspondances + écarts BO (filtré par service en mode magique)
        if (this.isMagicServiceView()) {
            const summary = this.findActiveMagicSummary();
            const result = summary
                ? summary.totalBoRecords
                : (this.filteredMatchesCount + this.filteredBoOnlyCount);
            this.cachedTotalTransactions = result;
            this.totalTransactions = result;
            return result;
        }

        if (this.response?.totalBoRecords != null && this.response.totalBoRecords > 0) {
            const result = this.response.totalBoRecords;
            this.cachedTotalTransactions = result;
            this.totalTransactions = result;
            return result;
        }

        const matches = this.matchesLoaded || (this.filteredMatches.length > 0)
            ? this.filteredMatches.length
            : (this.response?.totalMatches ?? this.response?.matches?.length ?? 0);
        const boMismatches = this.boOnlyLoaded || (this.filteredBoOnly.length > 0)
            ? this.filteredBoOnly.length
            : this.getResponseBoOnlyTotal();
        const result = matches + boMismatches;
        
        // Mettre en cache et mettre à jour la propriété publique
        this.cachedTotalTransactions = result;
        this.totalTransactions = result;
        
        const duration = performance.now() - startTime;
        if (duration > 0.1 || this.getTotalTransactionsCallCount <= 5) {
        }
        return result;
    }

    private getMatchRateCallCount = 0;
    getMatchRate(): number {
        // Utiliser le cache si disponible
        if (this.cachedMatchRate !== null) {
            return this.cachedMatchRate;
        }
        
        this.getMatchRateCallCount++;
        const startTime = performance.now();
        if (this.getMatchRateCallCount <= 5) {
        }
        
        const total = this.getTotalTransactions();
        if (total === 0) {
            const duration = performance.now() - startTime;
            if (this.getMatchRateCallCount <= 5) {
            }
            // Mettre en cache et mettre à jour la propriété publique
            this.cachedMatchRate = 0;
            this.matchRate = 0;
            return 0;
        }
        const matches = this.filteredMatchesCount;
        const result = (matches / total) * 100;
        
        // Mettre en cache et mettre à jour la propriété publique
        this.cachedMatchRate = result;
        this.matchRate = result;
        
        const duration = performance.now() - startTime;
        if (duration > 0.1 || this.getMatchRateCallCount <= 5) {
        }
        return result;
    }

    getTotalVolumeAll(): number {
        // Volume des correspondances (BO)
        const matchesVolume = this.calculateTotalVolume('bo');
        
        // Volume des écarts BO
        const boOnlyVolume = this.calculateTotalVolumeBoOnly();
        
        // Volume des écarts Partenaire
        const partnerOnlyVolume = this.calculateTotalVolumePartnerOnly();
        
        return matchesVolume + boOnlyVolume + partnerOnlyVolume;
    }

    getTotalAgencyPages(): number {
        return Math.max(1, Math.ceil(this.getAgencySummary().length / this.agencyPageSize));
    }

    nextAgencyPage() {
        if (this.agencyPage < this.getTotalAgencyPages()) {
            this.agencyPage++;
            this.invalidateAgencyPageCache();
            this.cdr.detectChanges();
        }
    }

    prevAgencyPage() {
        if (this.agencyPage > 1) {
            this.agencyPage--;
            this.invalidateAgencyPageCache();
            this.cdr.detectChanges();
        }
    }

    /**
     * Invalide uniquement la tranche paginée : le résumé complet (getAgencySummary / volumes /
     * totaux par service) ne dépend pas de la page et reste en cache (plus de reconstruction
     * du résumé + JSON.stringify à chaque clic Précédent/Suivant).
     */
    private invalidateAgencyPageCache(): void {
        this.cachedPagedAgencySummary = null;
        this.lastAgencySummaryHash = '';
    }

    getAgencyTotalsArray(): Array<{name: string, volume: number}> {
        const summary = this.getAgencySummary();
        const agencyTotals = new Map<string, number>();
        summary.forEach(item => {
            agencyTotals.set(item.agency, (agencyTotals.get(item.agency) || 0) + item.totalVolume);
        });
        return Array.from(agencyTotals.entries()).map(([name, volume]) => ({name, volume}));
    }

    getServiceTotalsArray(): Array<{name: string, volume: number}> {
        const summary = this.getAgencySummary();

        // Resultat stable tant que le résumé n'est pas reconstruit : évite de refaire
        // le Map + le tableau à chaque détection de changement (et casse la re-render du *ngFor).
        if (this.cachedServiceTotals && this.serviceTotalsVersion === this.agencySummaryVersion) {
            return this.cachedServiceTotals;
        }

        const serviceTotals = new Map<string, number>();
        summary.forEach(item => {
            serviceTotals.set(item.service, (serviceTotals.get(item.service) || 0) + item.totalVolume);
        });
        this.cachedServiceTotals = Array.from(serviceTotals.entries()).map(([name, volume]) => ({name, volume}));
        this.serviceTotalsVersion = this.agencySummaryVersion;
        return this.cachedServiceTotals;
    }

    private getFilteredMatches(): Match[] {
        const matches = this.response?.matches || [];
        if (!this.shouldPartitionEcarts()) {
            return matches;
        }
        const ctx = this.getEcartPartitionContext();
        const boDataList = matches
            .map(match => match.boData)
            .filter((record): record is Record<string, string> => !!record);
        const magicTaggedDataset = hasMagicPartitionTags(boDataList);
        return matches.filter(match =>
            !!match.boData &&
            recordMatchesMagicPartition(match.boData, ctx.service, ctx.partnerFile, magicTaggedDataset)
        );
    }

    private getFilteredBoOnly(): Record<string, string>[] {
        const boOnly = this.response?.boOnly || [];
        const mismatches = this.response?.mismatches || [];
        const allBoGaps = [...boOnly, ...mismatches];
        if (!this.shouldPartitionEcarts()) {
            return allBoGaps;
        }
        return partitionEcartRecords(allBoGaps, this.getEcartPartitionContext());
    }

    private getFilteredPartnerOnly(): Record<string, string>[] {
        const partnerOnly = this.response?.partnerOnly || [];
        if (!this.shouldPartitionEcarts()) {
            return partnerOnly;
        }
        return partitionEcartRecords(partnerOnly, this.getEcartPartitionContext());
    }

    /** Services à inclure dans le rapport groupé (sinon le service actif unique). */
    private getReportScopeServices(): string[] {
        if (this.reportSelectedServices?.length) {
            return this.reportSelectedServices;
        }
        return this.selectedMagicService ? [this.selectedMagicService] : [];
    }

    /**
     * Fichier partenaire à appliquer au cloisonnement du rapport.
     * En mode mono-card, on clois tonne sur le fichier actif.
     * En mode groupe (plusieurs cards), chaque card garde son propre fichier partenaire :
     * on NE restreint PAS globalement par un seul fichier (sinon on perd les autres cards).
     */
    private getReportScopePartnerFile(): string {
        if (this.reportSelectedServices?.length > 1) {
            return '';
        }
        return this.selectedMagicPartnerFile || '';
    }

    private getReportScopedMatches(): Match[] {
        const matches = this.response?.matches || [];
        if (!this.shouldPartitionEcarts()) {
            return matches;
        }
        const services = this.getReportScopeServices();
        const partnerFile = this.getReportScopePartnerFile();
        if (services.length === 0) {
            return matches;
        }
        return filterMatchBoDataByMagicPartitionMulti(matches, services, partnerFile);
    }

    private getReportScopedBoOnly(): Record<string, string>[] {
        const boOnly = this.response?.boOnly || [];
        if (!this.shouldPartitionEcarts()) {
            return boOnly;
        }
        return filterRecordsByMagicPartitionMulti(boOnly, this.getReportScopeServices(), this.getReportScopePartnerFile());
    }

    private getReportScopedPartnerOnly(): Record<string, string>[] {
        const partnerOnly = this.response?.partnerOnly || [];
        if (!this.shouldPartitionEcarts()) {
            return partnerOnly;
        }
        return filterRecordsByMagicPartitionMulti(partnerOnly, this.getReportScopeServices(), this.getReportScopePartnerFile());
    }

    private getReportScopedMismatches(): Record<string, string>[] {
        const mismatches = this.response?.mismatches || [];
        if (!this.shouldPartitionEcarts()) {
            return mismatches;
        }
        return filterRecordsByMagicPartitionMulti(mismatches, this.getReportScopeServices(), this.getReportScopePartnerFile());
    }

    private invalidateCache() {
        this.cachedPagedAgencySummary = null;
        this.cachedTotalVolume = null;
        this.cachedTotalRecords = null;
        this.lastAgencySummaryHash = '';
        this.cachedAgencySummary = null;
        this.lastResponseHash = '';
        this.clearFilterDataCaches();
    }

    /** Invalide les caches matches / boOnly / partnerOnly (cloisonnement magique inclus). */
    private clearFilterDataCaches(): void {
        this.matchesCache = null;
        this.boOnlyCache = null;
        this.partnerOnlyCache = null;
        this.cacheKey = null;
        this.cachedPagedMatches = null;
        this.cachedPagedBoOnly = null;
        this.cachedPagedPartnerOnly = null;
    }

    /** Réapplique le cloisonnement par service (réconciliation magique) sans recharger toute la page. */
    private refreshMagicServicePartitioning(): void {
        if (!this.response) {
            return;
        }
        this.filteredMatches = this.getFilteredMatches();
        this.filteredBoOnly = this.getFilteredBoOnly();
        this.filteredPartnerOnly = this.getFilteredPartnerOnly();
        this.syncMagicViewContextToTabsService();
        this.reconciliationTabsService.setFilteredMatches(this.filteredMatches);
        this.reconciliationTabsService.setFilteredBoOnly(this.filteredBoOnly);
        this.reconciliationTabsService.setFilteredPartnerOnly(this.filteredPartnerOnly);
        this.clearFilterDataCaches();
        if (this.filteredMatches.length) {
            this.setCache('matches', this.filteredMatches);
        }
        if (this.filteredBoOnly.length || this.response.mismatches?.length || this.response.boOnly?.length) {
            this.setCache('boOnly', this.filteredBoOnly);
        }
        if (this.filteredPartnerOnly.length || this.response.partnerOnly?.length) {
            this.setCache('partnerOnly', this.filteredPartnerOnly);
        }
        this.updateCalculatedProperties();
        this.cdr.markForCheck();
    }

    private syncMagicViewContextToTabsService(): void {
        const service = this.getActiveServiceFilter();
        const partnerFile = this.selectedMagicPartnerFile
            || this.appStateService.getSelectedMagicPartnerFile()
            || '';
        if (service || this.isMagicServiceView()) {
            this.reconciliationTabsService.setMagicViewContext(service || this.selectedMagicService, partnerFile);
            if (service) {
                this.appStateService.setSelectedMagicService(service);
            }
            if (partnerFile) {
                this.appStateService.setSelectedMagicPartnerFile(partnerFile);
            }
        }
    }

    private shouldApplyServicePartition(): boolean {
        return this.shouldPartitionEcarts();
    }

    private shouldPartitionEcarts(): boolean {
        const ctx = this.getEcartPartitionContext();
        return !!(ctx.service || ctx.partnerFile);
    }

    private getEcartPartitionContext(): MagicPartitionContext {
        const partnerFile = this.selectedMagicPartnerFile || this.appStateService.getSelectedMagicPartnerFile() || this.magicPartnerFileNames[0] || '';
        return resolveMagicPartitionContext({
            appStateService: this.appStateService.getSelectedMagicService(),
            appStatePartnerFile: partnerFile,
            tabsContext: this.reconciliationTabsService.getMagicViewContext(),
            fallbackService: this.getActiveServiceFilter(),
            fallbackPartnerFile: partnerFile
        });
    }

    applyServiceFilter() {
        // Appliquer le filtre seulement au clic
        this.matchesPage = 1;
        this.boOnlyPage = 1;
        this.partnerOnlyPage = 1;
        this.agencyPage = 1;
        this.initializeFilteredData();
        this.cdr.detectChanges();
        this.invalidateCache();
    }

    startReconciliation() {
        this.nouvelleReconciliation();
    }

    async saveAgencySummary() {
        if (this.isSaving) return;
        this.isSaving = true;

        try {
            const allSummaries = this.getAgencySummary();
            const selectedSummaries = allSummaries.filter(s => this.selectedAgencySummaries.includes(this.getAgencyKey(s)));
    
            if (selectedSummaries.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.selectAtLeastOneRow'));
                this.isSaving = false;
                return;
            }
    
            const summaryToSave = selectedSummaries.map(item => ({
                ...item,
                date: this.selectedDate
            }));
            
            const response = await this.reconciliationService.saveSelectedSummary(summaryToSave).toPromise();
            
            let message = response.message;
            if (response.saved && response.saved.length > 0) {
                message += this.t('RES.dlg.savedRows', { count: response.saved.length });
            }
            if (response.duplicates && response.duplicates.length > 0) {
                message += this.t('RES.dlg.duplicateRowsIgnored', { count: response.duplicates.length });
            }
            if (response.errors && response.errors.length > 0) {
                message += this.t('RES.dlg.errorsCount', { count: response.errors.length });
            }
            
            this.popupService.showInfo(message);
            
            // Notifier le dashboard seulement quand le résumé est enregistré avec succès
            this.appStateService.notifySummarySaved();
        } catch (error: any) {
            // Affichage détaillé du message d'erreur backend
            let msg = this.t('RES.dlg.dbSaveError');
            if (error && error.error) {
                if (error.error.message) {
                    msg = error.error.message;
                }
                if (error.error.details) {
                    msg += '\n' + error.error.details;
                }
                if (error.error.duplicateRecords) {
                    msg += this.t('RES.dlg.duplicatesDetected');
                    for (const d of error.error.duplicateRecords) {
                        msg += `\n- ${d.message}`;
                    }
                }
                if (error.error.errorRecords && error.error.errorRecords.length > 0) {
                    msg += this.t('RES.dlg.errorsDetected');
                    for (const e of error.error.errorRecords) {
                        msg += `\n- ${e}`;
                    }
                }
            } else if (error && error.message) {
                msg = error.message;
            }
            this.popupService.showInfo(msg);
        } finally {
            this.isSaving = false;
        }
    }

    goToMatches() {
        const buttonClickStartTime = performance.now();
        
        const setActiveTabStartTime = performance.now();
        // Utiliser setActiveTab pour avoir le même comportement que les autres boutons
        // Cela garantit un comportement cohérent et une navigation immédiate
        this.setActiveTab('matches');
        const setActiveTabDuration = performance.now() - setActiveTabStartTime;

        // Cloisonnement magique : partager le contexte et les correspondances filtrées par service
        // pour que l'écran /matches n'affiche que les données de la card sélectionnée.
        if (this.isMagicServiceView() || this.shouldApplyServicePartition()) {
            this.syncMagicViewContextToTabsService();
            this.reconciliationTabsService.setFilteredMatches(this.getFilteredMatches());
        }
        
        const navigateStartTime = performance.now();
        // Navigation immédiate - les données se chargeront en arrière-plan si nécessaire
        this.router.navigate(['/matches']).then(() => {
            const navigateDuration = performance.now() - navigateStartTime;
            const totalDuration = performance.now() - buttonClickStartTime;
        }).catch(err => {
            const navigateDuration = performance.now() - navigateStartTime;
            const totalDuration = performance.now() - buttonClickStartTime;
        });
        
        const beforeReturnDuration = performance.now() - buttonClickStartTime;
    }

    async goToEcartBo() {
        const buttonClickStartTime = performance.now();
        
        const setActiveTabStartTime = performance.now();
        // Utiliser setActiveTab pour avoir le même comportement que les autres boutons
        // Cela garantit un comportement cohérent et une navigation immédiate
        this.setActiveTab('boOnly');
        if (this.isMagicServiceView()) {
            this.syncMagicViewContextToTabsService();
            this.reconciliationTabsService.setFilteredBoOnly(this.getFilteredBoOnly());
        } else if (this.shouldApplyServicePartition()) {
            this.syncMagicViewContextToTabsService();
            this.reconciliationTabsService.setFilteredBoOnly(this.getFilteredBoOnly());
        }
        const setActiveTabDuration = performance.now() - setActiveTabStartTime;
        
        // IMPORTANT: /ecart-bo est un écran séparé. Si les données boOnly sont en lazy-load,
        // une navigation immédiate détruit ce composant et annule le chargement, ce qui rend la page vide.
        // On attend donc la fin du lazy-load si nécessaire.
        try {
            const cacheKey = 'boOnly';
            const pending = this.loadingPromises.get(cacheKey);
            if (pending) {
                await pending;
            } else if (!this.boOnlyLoaded && !this.isLoadingBoOnly) {
                const loadPromise = this.loadBoOnlyDataLazy();
                this.loadingPromises.set(cacheKey, loadPromise);
                await loadPromise.finally(() => this.loadingPromises.delete(cacheKey));
            }
            if (this.response) {
                // Partager un snapshot des résultats pour les écrans dédiés
                this.appStateService.setReconciliationResults(this.response);
            }
            // Toujours republier le dataset filtré après chargement (y compris hors magic view)
            this.reconciliationTabsService.setFilteredBoOnly(this.getFilteredBoOnly());
        } catch (e) {
            // On navigue quand même : l'écran cible affichera "Aucun écart" si pas de données.
            console.warn('goToEcartBo: chargement lazy interrompu', e);
        }

        const navigateStartTime = performance.now();
        // Navigation immédiate - les données se chargeront en arrière-plan si nécessaire
        this.router.navigate(['/ecart-bo']).then(() => {
            const navigateDuration = performance.now() - navigateStartTime;
            const totalDuration = performance.now() - buttonClickStartTime;
        }).catch(err => {
            const navigateDuration = performance.now() - navigateStartTime;
            const totalDuration = performance.now() - buttonClickStartTime;
        });
        
        const beforeReturnDuration = performance.now() - buttonClickStartTime;
    }

    async goToEcartPartner() {
        const buttonClickStartTime = performance.now();
        
        const setActiveTabStartTime = performance.now();
        // Utiliser setActiveTab pour avoir le même comportement que les autres boutons
        // Cela garantit un comportement cohérent et une navigation immédiate
        this.setActiveTab('partnerOnly');
        if (this.isMagicServiceView() || this.shouldApplyServicePartition()) {
            this.syncMagicViewContextToTabsService();
            this.reconciliationTabsService.setFilteredPartnerOnly(this.getFilteredPartnerOnly());
        }
        const setActiveTabDuration = performance.now() - setActiveTabStartTime;
        
        // Même logique que goToEcartBo : attendre le lazy-load PartnerOnly avant de quitter l'écran.
        try {
            const cacheKey = 'partnerOnly';
            const pending = this.loadingPromises.get(cacheKey);
            if (pending) {
                await pending;
            } else if (!this.partnerOnlyLoaded && !this.isLoadingPartnerOnly) {
                const loadPromise = this.loadPartnerOnlyDataLazy();
                this.loadingPromises.set(cacheKey, loadPromise);
                await loadPromise.finally(() => this.loadingPromises.delete(cacheKey));
            }
            if (this.response) {
                this.appStateService.setReconciliationResults(this.response);
            }
            this.reconciliationTabsService.setFilteredPartnerOnly(this.getFilteredPartnerOnly());
        } catch (e) {
            console.warn('goToEcartPartner: chargement lazy interrompu', e);
        }

        const navigateStartTime = performance.now();
        // Navigation immédiate - les données se chargeront en arrière-plan si nécessaire
        this.router.navigate(['/ecart-partner']).then(() => {
            const navigateDuration = performance.now() - navigateStartTime;
            const totalDuration = performance.now() - buttonClickStartTime;
        }).catch(err => {
            const navigateDuration = performance.now() - navigateStartTime;
            const totalDuration = performance.now() - buttonClickStartTime;
        });
        
        const beforeReturnDuration = performance.now() - buttonClickStartTime;
    }

    goToStats() {
        this.router.navigate(['/stats']).then(() => {
        }).catch(error => {
        });
    }

    handleExport() {
        this.exportResultsOptimized('matches');
    }

    formatTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    getElapsedTime(): number {
        if (this.startTime > 0) {
            return Date.now() - this.startTime;
        }
        return 0;
    }

    getProcessingSpeed(): string {
        const elapsedTime = this.getElapsedTime();
        if (elapsedTime > 0 && this.processedRecords > 0) {
            const speed = Math.round((this.processedRecords / elapsedTime) * 1000);
            return speed.toString();
        }
        return '0';
    }

    getProgressStatus(): string {
        if (this.progressPercentage < 10) {
            return this.t('RES.progressInit');
        } else if (this.progressPercentage < 30) {
            return this.t('RES.progressLoadingFiles');
        } else if (this.progressPercentage < 60) {
            return this.t('RES.progressProcessing');
        } else if (this.progressPercentage < 90) {
            return this.t('RES.progressReconciling');
        } else if (this.progressPercentage < 100) {
            return this.t('RES.progressFinalizing');
        } else {
            return this.t('RES.progressDone');
        }
    }

    private listenToRealProgress() {
        
        this.subscription.add(
            this.reconciliationService.getProgress().subscribe((progress) => {
                this.progressPercentage = progress.percentage;
                this.processedRecords = progress.processed;
                this.totalRecords = progress.total;
                
                // Forcer la détection des changements pour mettre à jour l'interface
                this.cdr.detectChanges();
            })
        );
    }

    private simulateProgress() {
        // Méthode de fallback si la progression réelle n'est pas disponible
        const interval = setInterval(() => {
            if (this.progressPercentage < 90 && this.showProgress) {
                this.progressPercentage += Math.random() * 10;
                this.processedRecords = Math.floor((this.progressPercentage / 100) * this.totalRecords);
                this.cdr.detectChanges();
            } else {
                clearInterval(interval);
            }
        }, 500);
    }

    exporterResumeParAgence(data: any[]) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Résumé par agence');

        // Définir les colonnes
        worksheet.columns = [
            { header: 'Agence', key: 'agence', width: 30 },
            { header: 'Nombre', key: 'nombre', width: 15 },
            { header: 'Volume', key: 'volume', width: 20 },
            // Ajoute d'autres colonnes selon tes besoins
        ];

        // Ajouter les données
        data.forEach(item => {
            worksheet.addRow({
                agence: item.agence,
                nombre: item.nombre,
                volume: item.volume,
                // autres champs...
            });
        });

        // Appliquer des couleurs et styles au header
        worksheet.getRow(1).eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFB6D7A8' } // Vert clair, change la couleur si besoin
            };
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Appliquer un style aux lignes (exemple : alternance de couleurs)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: rowNumber % 2 === 0 ? 'FFF9E79F' : 'FFFFFFFF' } // Jaune pâle ou blanc
                    };
                });
            }
        });

        // Générer le fichier et le télécharger
        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            saveAs(blob, 'resume_par_agence.xlsx');
        });
    }



    // Utilisation d'une clé unique pour chaque ligne
    getAgencyKey(summary: any): string {
        return `${summary.agency}__${summary.service}__${summary.country}`;
    }

    /**
     * Génère un rapport regroupé des écarts BO et Partenaire
     */
    generateEcartReport(): any {
        if (!this.response) {
            return null;
        }

        // Fonction pour extraire les données communes d'un enregistrement
        const extractCommonData = (record: any, source: string) => {
            const baseData = {
                Service: this.getValueWithFallback(record, ['Service', 'service', 'SERVICE', 'CLE', 'cle', 'key', 'id', 'Id', 'ID']),
                telephoneClient: this.getValueWithFallback(record, ['téléphone client', 'telephone', 'phone', 'numéro', 'numero']),
                montant: this.getValueWithFallback(record, ['montant', 'amount', 'valeur', 'prix']),
                Agence: this.getValueWithFallback(record, ['Agence', 'agence', 'agency', 'bureau', 'point']),
                Date: this.formatDateForReport(this.getValueWithFallback(record, ['Date', 'date', 'DateTransaction', 'created_at'])),
                SOURCE: source
            };

            // Debug pour les données Partenaire
            if (source === 'PARTENAIRE') {
            }

            // Pour les écarts BO, ajouter les colonnes supplémentaires
            if (source === 'BO') {
                return {
                    ...baseData,
                    numeroTransGU: this.getValueWithFallback(record, ['numéro trans gu', 'numero_trans_gu', 'numéro_trans_gu', 'Numéro Trans GU', 'transaction_number', 'trans_gu']),
                    IDTransaction: this.getValueWithFallback(record, ['IDTransaction', 'id_transaction', 'transaction_id', 'idTransaction'])
                };
            } else {
                // Pour les écarts Partenaire, ajouter l'heure
                const result = {
                    ...baseData,
                    Heure: this.extractTimeFromRecord(record)
                };
                
                if (source === 'PARTENAIRE') {
                }
                
                return result;
            }
        };

        // Regrouper les écarts BO
        const ecartBo = (this.response.boOnly || []).map(record => 
            extractCommonData(record, 'BO')
        );

        // Regrouper les écarts Partenaire
        const ecartPartenaire = (this.response.partnerOnly || []).map(record => 
            extractCommonData(record, 'PARTENAIRE')
        );

        // Debug pour vérifier les données générées

        return {
            ecartBo,
            ecartPartenaire,
            totalEcartBo: ecartBo.length,
            totalEcartPartenaire: ecartPartenaire.length,
            totalEcart: ecartBo.length + ecartPartenaire.length,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Aide pour extraire une valeur avec fallback sur plusieurs clés possibles
     */
    private getValueWithFallback(record: any, keys: string[]): string {
        for (const key of keys) {
            if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                return String(record[key]);
            }
        }
        return '';
    }

    /**
     * Formate la date pour le rapport
     */
    private formatDateForReport(dateValue: string): string {
        if (!dateValue) return '';
        return formatSpreadsheetDateValue(dateValue);
    }

    /**
     * Extrait l'heure d'un enregistrement partenaire
     */
    private extractTimeFromRecord(record: any): string {
        // Chercher une colonne heure spécifique
        const timeValue = this.getValueWithFallback(record, ['HEURE', 'Heure', 'heure', 'time', 'Time']);
        if (timeValue) {
            // Si c'est déjà au format HH:MM:SS
            if (/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
                return timeValue;
            }
            
            // Si c'est dans la date, extraire la partie heure
            const dateValue = this.getValueWithFallback(record, ['Date', 'date', 'DateTransaction']);
            if (dateValue && dateValue.includes(' ')) {
                const timePart = dateValue.split(' ')[1];
                if (timePart && /^\d{2}:\d{2}:\d{2}/.test(timePart)) {
                    return timePart.substring(0, 8); // HH:MM:SS
                }
            }
        }
        
        return '';
    }

    get visibleMagicSummaries(): MagicServiceSummary[] {
        if (!this.selectedMagicPartnerFile) {
            return this.magicServiceSummaries.filter(s => s.service !== 'Tous');
        }
        return this.magicServiceSummaries.filter(
            s => s.service !== 'Tous' && s.partnerFileName === this.selectedMagicPartnerFile
        );
    }

    private initializeMagicSelection(): void {
        const visible = this.visibleMagicSummaries;
        if (visible.length > 0) {
            this.selectedMagicService = visible[0].service;
            this.selectedService = this.selectedMagicService;
            // Par défaut, sélectionner toutes les cards visibles pour le rapport groupé,
            // afin que le rapport affiche chaque service disponible.
            if (!this.reportSelectedServices?.length) {
                this.reportSelectedServices = visible.map(s => s.service);
            }
            // Propager la sélection par défaut au contexte partagé (appState + onglets) pour que
            // le rapport réconciliation soit cloisonné par service dès la navigation, sans
            // qu'il soit nécessaire de re-cliquer sur l'onglet du service.
            this.appStateService.setSelectedMagicService(this.selectedMagicService);
            this.appStateService.setSelectedMagicPartnerFile(this.selectedMagicPartnerFile || '');
            this.reconciliationTabsService.setMagicViewContext(this.selectedMagicService, this.selectedMagicPartnerFile || '');
        }
    }

    isMagicServiceView(): boolean {
        return this.visibleMagicSummaries.length > 0 && !!this.selectedMagicService;
    }

    get displayBoTransactionTotal(): number {
        if (this.isMagicServiceView()) {
            const summary = this.findActiveMagicSummary();
            if (summary) {
                return summary.totalBoRecords;
            }
            return this.filteredMatchesCount + this.filteredBoOnlyCount;
        }
        return this.totalTransactions;
    }

    private findActiveMagicSummary(): MagicServiceSummary | undefined {
        return this.magicServiceSummaries.find(
            s => s.service === this.selectedMagicService &&
                (!this.selectedMagicPartnerFile || s.partnerFileName === this.selectedMagicPartnerFile)
        );
    }

    /**
     * Si les datasets filtrés sont vides (lazy / pagination), le résumé par agence
     * ne reflète pas la card magique sélectionnée. On injecte alors les totaux de la card.
     */
    private ensureMagicAgencySummaryForReport(magic?: MagicServiceSummary): void {
        if (!magic) {
            return;
        }
        const current = this.cachedAgencySummary || this.reconciliationSummaryService.getAgencySummary() || [];
        const currentBo = current.reduce(
            (sum, row) => sum + (Number(row.matches) || 0) + (Number(row.boOnly) || 0),
            0
        );
        const expectedBo = (magic.totalMatches || 0) + (magic.totalBoOnly || 0);
        const looksComplete = current.length > 0 && (expectedBo <= 0 || currentBo >= expectedBo * 0.8);
        if (looksComplete) {
            return;
        }
        const country = this.inferCountryFromMagicPattern(magic.service, magic.partnerFileName);
        const seeded: AgencySummaryData[] = [{
            agency: magic.service,
            service: magic.service,
            country,
            date: new Date().toISOString().split('T')[0],
            totalVolume: 0,
            recordCount: magic.totalBoRecords || expectedBo,
            matches: magic.totalMatches || 0,
            boOnly: magic.totalBoOnly || 0,
            partnerOnly: magic.totalPartnerOnly || 0,
            mismatches: 0
        }];
        this.cachedAgencySummary = seeded;
        this.lastResponseHash = this.getResponseHash();
        this.lastAgencySummaryMeta = {
            totalPartnerOnly: magic.totalPartnerOnly || 0,
            hasPartnerOnlyWithAgencyService: false
        };
        this.reconciliationSummaryService.setAgencySummary(seeded, this.lastAgencySummaryMeta);
    }

    private inferCountryFromMagicPattern(service: string, partnerFile?: string): string {
        const sources = `${service || ''} ${partnerFile || ''}`.toUpperCase();
        const match = sources.match(/\b(CM|CI|SN|BF|ML|BJ|NE|TD|TG|GA|GN|KE|NG)\b/)
            || sources.match(/^(CM|CI|SN|BF|ML|BJ|NE|TD|TG|GA|GN)_/);
        const code = match?.[1] || '';
        return countryNameFromCode(code) || code || '';
    }

    private getActiveServiceFilter(): string {
        if (this.isMagicServiceView()) {
            return this.selectedMagicService;
        }
        return this.selectedService;
    }

    private getMagicServiceTag(record: Record<string, string>): string {
        const magicTag = String(record['_magicService'] || '').trim();
        if (magicTag) {
            return magicTag;
        }
        return (
            record['Service'] ||
            record['service'] ||
            record['TRANS TYPE'] ||
            record['Trans Type'] ||
            record['TYPE'] ||
            record['Type'] ||
            ''
        ).trim();
    }

    private getMagicPartnerTag(record: Record<string, string>): string {
        return (record['_magicPartnerFile'] || '').trim();
    }

    selectMagicPartnerFile(fileName: string): void {
        this.selectedMagicPartnerFile = fileName;
        this.appStateService.setSelectedMagicPartnerFile(fileName);
        const visible = this.visibleMagicSummaries;
        if (visible.length) {
            this.selectMagicService(visible[0].service);
        } else {
            this.initializeFilteredData();
            this.cdr.markForCheck();
        }
    }

    selectMagicService(service: string): void {
        this.selectedMagicService = service;
        this.selectedService = service;
        this.appStateService.setSelectedMagicService(service);
        this.reconciliationTabsService.setMagicViewContext(service, this.selectedMagicPartnerFile || '');
        this.cachedTotalTransactions = null;
        this.cachedMatchRate = null;
        this.matchesPage = 1;
        this.boOnlyPage = 1;
        this.partnerOnlyPage = 1;
        this.initializeFilteredData();
        this.clearFilterDataCaches();
        this.invalidateCache();
        this.cdr.markForCheck();
    }

    isMagicServiceReportSelected(service: string): boolean {
        return this.reportSelectedServices.includes(service);
    }

    toggleMagicServiceReportSelection(service: string): void {
        const idx = this.reportSelectedServices.indexOf(service);
        if (idx >= 0) {
            this.reportSelectedServices = this.reportSelectedServices.filter(s => s !== service);
        } else {
            this.reportSelectedServices = [...this.reportSelectedServices, service];
        }
        this.cdr.markForCheck();
    }

    allMagicServicesReportSelected(): boolean {
        return this.visibleMagicSummaries.length > 0 &&
            this.visibleMagicSummaries.every(s => this.reportSelectedServices.includes(s.service));
    }

    toggleAllMagicReportSelection(event: Event): void {
        const checked = (event.target as HTMLInputElement)?.checked;
        this.reportSelectedServices = checked
            ? this.visibleMagicSummaries.map(s => s.service)
            : [];
        this.cdr.markForCheck();
    }

    getMagicServiceIndex(): number {
        return this.visibleMagicSummaries.findIndex(s => s.service === this.selectedMagicService);
    }

    canSelectPreviousMagicService(): boolean {
        return this.getMagicServiceIndex() > 0;
    }

    canSelectNextMagicService(): boolean {
        const idx = this.getMagicServiceIndex();
        return idx >= 0 && idx < this.visibleMagicSummaries.length - 1;
    }

    selectPreviousMagicService(): void {
        const idx = this.getMagicServiceIndex();
        if (idx > 0) {
            this.selectMagicService(this.visibleMagicSummaries[idx - 1].service);
        }
    }

    selectNextMagicService(): void {
        const idx = this.getMagicServiceIndex();
        if (idx >= 0 && idx < this.visibleMagicSummaries.length - 1) {
            this.selectMagicService(this.visibleMagicSummaries[idx + 1].service);
        }
    }

    /**
     * Ouvre la popup de sélection des colonnes pour l'export
     */
    openColumnSelector(): void {
        // Vérifier s'il y a au moins des écarts BO ou Partenaire
        const hasBoEcart = this.response?.boOnly && this.response.boOnly.length > 0;
        const hasPartnerEcart = this.response?.partnerOnly && this.response.partnerOnly.length > 0;
        
        if (!hasBoEcart && !hasPartnerEcart) {
            this.popupService.showWarning(this.t('RES.dlg.reportNoEcartForExport'));
            return;
        }

        // Extraire uniquement les colonnes disponibles du fichier partenaire en cours
        this.availableColumns = [];
        const allColumns = new Set<string>();
        
        if (hasPartnerEcart) {
            this.response.partnerOnly.forEach(record => {
                Object.keys(record).forEach(key => {
                    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                        // Corriger le nom de colonne mal encodé
                        const correctedKey = fixGarbledCharacters(key);
                        allColumns.add(correctedKey);
                    }
                });
            });
        }

        // Forcer l'inclusion de la colonne SOURCE pour identification d'origine
        allColumns.add('SOURCE');
        this.availableColumns = Array.from(allColumns).sort();
        
        // Initialiser toutes les colonnes comme non sélectionnées par défaut
        this.selectedColumns = {};
        this.availableColumns.forEach(col => {
            // Cocher par défaut les colonnes définies dans defaultColumns
            this.selectedColumns[col] = this.defaultColumns.includes(col);
        });

        // Si pas de colonnes partenaire disponibles, afficher un message informatif
        if (!hasPartnerEcart && hasBoEcart) {
            this.popupService.showInfo(this.t('RES.dlg.reportNoPartnerEcart'));
        }

        this.showColumnSelector = true;
    }

    /**
     * Ferme la popup de sélection des colonnes
     */
    closeColumnSelector(): void {
        this.showColumnSelector = false;
    }

    /**
     * Sélectionne/désélectionne toutes les colonnes
     */
    toggleAllColumns(selected: boolean): void {
        this.availableColumns.forEach(col => {
            this.selectedColumns[col] = selected;
        });
    }

    /**
     * Vérifie si toutes les colonnes sont sélectionnées
     */
    get allColumnsSelected(): boolean {
        return this.availableColumns.every(col => this.selectedColumns[col]);
    }

    /**
     * Vérifie si certaines colonnes sont sélectionnées
     */
    get someColumnsSelected(): boolean {
        return this.availableColumns.some(col => this.selectedColumns[col]) && !this.allColumnsSelected;
    }

    get selectedColumnsCount(): number {
        return this.availableColumns.filter(col => this.selectedColumns[col]).length;
    }

    /**
     * Exporte le rapport des écarts en CSV avec les colonnes sélectionnées
     */
    async exportEcartReport(): Promise<void> {
        try {
            const report = this.generateEcartReport();
            if (!report) {
                this.popupService.showWarning(this.t('RES.dlg.reportNoData'));
                return;
            }

            // Vérifier s'il y a au moins des écarts BO ou Partenaire
            if (report.ecartBo.length === 0 && report.ecartPartenaire.length === 0) {
                this.popupService.showWarning(this.t('RES.dlg.reportNoEcartForExport'));
                return;
            }

            // Créer le contenu CSV avec les deux sections côte à côte
            let csvContent = '';
            
            // Obtenir les colonnes sélectionnées pour les écarts Partenaire
            let selectedPartnerColumns = this.availableColumns.filter(col => this.selectedColumns[col]);
            // Forcer SOURCE en dernière position s'il est sélectionné
            if (selectedPartnerColumns.includes('SOURCE')) {
                selectedPartnerColumns = selectedPartnerColumns.filter(c => c !== 'SOURCE');
                selectedPartnerColumns.push('SOURCE');
            }
            
            // Debug pour vérifier les données
            
            // En-têtes côte à côte
            const boHeader = 'Service;téléphone client;montant;Agence;Date;Numéro Trans GU;IDTransaction;SOURCE';
            const partnerHeader = selectedPartnerColumns.length > 0 ? selectedPartnerColumns.join(';') : '';
            
            // Calculer l'espacement entre les colonnes (2 colonnes vides pour séparer)
            const spacing = ';;';
            
            // Ligne 1: Titre ECART BO centré au-dessus de son tableau
            const boColumnsCount = boHeader.split(';').length;
            const partnerColumnsCount = selectedPartnerColumns.length;
            
            // Centrer le titre ECART BO
            const boTitlePadding = Math.floor((boColumnsCount - 1) / 2);
            const boTitleCells = ';'.repeat(boTitlePadding) + 'ECART BO' + ';'.repeat(boColumnsCount - 1 - boTitlePadding);
            
            // Centrer le titre ECART PARTENAIRE (seulement s'il y a des colonnes sélectionnées)
            const partnerTitlePadding = Math.floor((partnerColumnsCount - 1) / 2);
            const partnerTitleCells = partnerColumnsCount > 0 ? 
                ';'.repeat(partnerTitlePadding) + 'ECART PARTENAIRE' + ';'.repeat(partnerColumnsCount - 1 - partnerTitlePadding) : '';
            
            csvContent += `${boTitleCells}${spacing}${partnerTitleCells}\n`;
            
            // Ligne 2: En-têtes des colonnes
            csvContent += `${boHeader}${spacing}${partnerHeader}\n`;
            
            // Trouver le nombre maximum de lignes entre les deux sections
            const maxRows = Math.max(report.ecartBo.length, report.ecartPartenaire.length);
            
            // Générer les lignes côte à côte
            for (let i = 0; i < maxRows; i++) {
                let boRow = '';
                let partnerRow = '';
                
                // Ligne ECART BO
                if (i < report.ecartBo.length) {
                    const boItem = report.ecartBo[i];
                    boRow = `${boItem.Service || boItem.CLE};${boItem.telephoneClient};${boItem.montant};${boItem.Agence};${boItem.Date};${boItem.numeroTransGU};${boItem.IDTransaction};${boItem.SOURCE}`;
                } else {
                    // Remplir avec des valeurs vides si pas de données
                    boRow = ';'.repeat(boColumnsCount - 1);
                }
                
                // Ligne ECART PARTENAIRE (seulement si des colonnes sont sélectionnées)
                if (i < report.ecartPartenaire.length && selectedPartnerColumns.length > 0) {
                    // Utiliser directement les données originales au lieu des données transformées
                    const originalPartnerRecord = this.response?.partnerOnly?.[i];
                    
                    const row = selectedPartnerColumns.map(col => {
                        let value = '';
                        
                        // Utiliser directement la valeur de la colonne dans les données originales
                        if (originalPartnerRecord && originalPartnerRecord[col] !== undefined && originalPartnerRecord[col] !== null && originalPartnerRecord[col] !== '') {
                            value = String(originalPartnerRecord[col]);
                        } else {
                            // Si pas trouvé, essayer avec les propriétés transformées comme fallback
                            const partnerItem = report.ecartPartenaire[i];
                            switch (col) {
                                case 'CLE': value = partnerItem.CLE || ''; break;
                                case 'téléphone client': value = partnerItem.telephoneClient || ''; break;
                                case 'montant': value = partnerItem.montant || ''; break;
                                case 'Agence': value = partnerItem.Agence || ''; break;
                                case 'Date': value = partnerItem.Date || ''; break;
                                case 'HEURE': value = partnerItem.Heure || ''; break;
                                case 'SOURCE': value = partnerItem.SOURCE || 'PARTENAIRE'; break;
                                default: value = ''; break;
                            }
                        }
                        
                        return value;
                    });
                    partnerRow = row.join(';');
                } else {
                    // Remplir avec des valeurs vides si pas de données ou pas de colonnes sélectionnées
                    partnerRow = partnerColumnsCount > 0 ? ';'.repeat(partnerColumnsCount - 1) : '';
                }
                
                // Ajouter la ligne au CSV (avec ou sans colonnes partenaire)
                if (partnerColumnsCount > 0) {
                    csvContent += `${boRow}${spacing}${partnerRow}\n`;
                } else {
                    csvContent += `${boRow}\n`;
                }
            }

            // Créer et télécharger le fichier Excel avec couleurs
            await this.createExcelReport(report, selectedPartnerColumns, boHeader, partnerHeader);

            const selectedCount = this.availableColumns.filter(col => this.selectedColumns[col]).length;
            const hasPartnerColumns = selectedCount > 0;
            
            let successMessage = this.t('RES.dlg.reportExportSuccess', { boLines: report.totalEcartBo });
            
            if (hasPartnerColumns) {
                successMessage += this.t('RES.dlg.reportPartnerLines', { partnerLines: report.totalEcartPartenaire, selectedCount });
            } else {
                successMessage += this.t('RES.dlg.reportBoOnlyFormat');
            }
            
            successMessage += this.t('RES.dlg.reportTotal', { total: report.totalEcart });
            
            this.popupService.showSuccess(successMessage);
            
            // Fermer la popup après l'export
            this.closeColumnSelector();

        } catch (error) {
            this.popupService.showError(this.t('RES.dlg.reportExportError'));
        }
    }

    /**
     * Confirme l'export avec les colonnes sélectionnées
     */
    confirmExportWithSelectedColumns(): void {
        const selectedCount = this.availableColumns.filter(col => this.selectedColumns[col]).length;
        const report = this.generateEcartReport();
        
        // Vérifier s'il y a des écarts BO (permettre l'export même sans colonnes partenaire)
        const hasBoEcart = report && report.ecartBo && report.ecartBo.length > 0;
        const hasPartnerEcart = report && report.ecartPartenaire && report.ecartPartenaire.length > 0;
        
        if (selectedCount === 0 && !hasBoEcart) {
            this.popupService.showWarning(this.t('RES.dlg.reportSelectColumnWarning'));
            return;
        }
        
        if (hasBoEcart && selectedCount === 0) {
            this.popupService.showInfo(this.t('RES.dlg.reportBoOnlyInfo'));
        }
        
        this.exportEcartReport();
    }

    /**
     * Crée un rapport Excel avec des couleurs
     */
    async createExcelReport(report: any, selectedPartnerColumns: string[], boHeader: string, partnerHeader: string): Promise<void> {
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Rapport Écarts');

            // Définir les styles
            const titleStyle = {
                font: { bold: true, size: 14, color: { argb: 'FFFFFF' } },
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '4472C4' } },
                alignment: { horizontal: 'center' as const, vertical: 'middle' as const }
            };

            const headerStyle = {
                font: { bold: true, size: 11, color: { argb: 'FFFFFF' } },
                fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '4472C4' } },
                alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
                border: {
                    top: { style: 'thin' as const, color: { argb: '000000' } },
                    left: { style: 'thin' as const, color: { argb: '000000' } },
                    bottom: { style: 'thin' as const, color: { argb: '000000' } },
                    right: { style: 'thin' as const, color: { argb: '000000' } }
                }
            };

            const dataStyle = {
                border: {
                    top: { style: 'thin' as const, color: { argb: '000000' } },
                    left: { style: 'thin' as const, color: { argb: '000000' } },
                    bottom: { style: 'thin' as const, color: { argb: '000000' } },
                    right: { style: 'thin' as const, color: { argb: '000000' } }
                },
                alignment: { vertical: 'middle' as const }
            };

            const boColumnsCount = boHeader.split(';').length;
            // Forcer SOURCE en dernière position pour Excel également
            if (selectedPartnerColumns.includes('SOURCE')) {
                selectedPartnerColumns = selectedPartnerColumns.filter(c => c !== 'SOURCE');
                selectedPartnerColumns.push('SOURCE');
            }
            const partnerColumnsCount = selectedPartnerColumns.length;
            const spacing = 2; // 2 colonnes d'espacement
            const topSpacing = 2; // 2 lignes d'espacement en haut

            // Ligne 1-2: Espacement en haut (lignes vides)
            // Pas de contenu sur ces lignes

            // Ligne 3: Titre principal "ECART Réconciliation [Agence] du [Date]"
            const reportTitle = this.generateReportTitle();
            const totalColumns = boColumnsCount + spacing + partnerColumnsCount;
            
            // Centrer le titre en fusionnant toutes les colonnes disponibles
            worksheet.getCell(topSpacing + 1, 1).value = reportTitle;
            worksheet.getCell(topSpacing + 1, 1).style = {
                font: { bold: true, size: 16, color: { argb: '000000' } },
                alignment: { horizontal: 'center' as const, vertical: 'middle' as const }
            };
            
            // Fusionner toutes les colonnes pour centrer parfaitement le titre
            worksheet.mergeCells(topSpacing + 1, 1, topSpacing + 1, totalColumns);

            // Ligne 4: Titres des sections "ECART BO" et "ECART PARTENAIRE"
            const boTitleCol = Math.floor(boColumnsCount / 2);
            const partnerTitleCol = boColumnsCount + spacing + Math.floor(partnerColumnsCount / 2);

            worksheet.getCell(topSpacing + 2, boTitleCol + 1).value = 'ECART BO';
            worksheet.getCell(topSpacing + 2, boTitleCol + 1).style = titleStyle;
            worksheet.mergeCells(topSpacing + 2, boTitleCol + 1, topSpacing + 2, boTitleCol + 1);

            worksheet.getCell(topSpacing + 2, partnerTitleCol + 1).value = 'ECART PARTENAIRE';
            worksheet.getCell(topSpacing + 2, partnerTitleCol + 1).style = titleStyle;
            worksheet.mergeCells(topSpacing + 2, partnerTitleCol + 1, topSpacing + 2, partnerTitleCol + 1);

            // Ligne 5: En-têtes
            const boHeaders = boHeader.split(';');
            const partnerHeaders = partnerHeader ? partnerHeader.split(';') : [];

            boHeaders.forEach((header, index) => {
                const cell = worksheet.getCell(topSpacing + 3, index + 1);
                cell.value = header;
                cell.style = headerStyle;
            });

            partnerHeaders.forEach((header, index) => {
                const cell = worksheet.getCell(topSpacing + 3, boColumnsCount + spacing + index + 1);
                cell.value = header;
                cell.style = headerStyle;
            });

            // Données
            const maxRows = Math.max(report.ecartBo.length, report.ecartPartenaire.length);

            for (let i = 0; i < maxRows; i++) {
                const rowIndex = i + topSpacing + 4; // +topSpacing (2) + 4 car on a le titre principal + titres sections + en-têtes

                // Données BO
                if (i < report.ecartBo.length) {
                    const boItem = report.ecartBo[i];
                    const montantNum = this.exportAmountValue('montant', boItem.montant);
                    const boData = [boItem.Service || boItem.CLE, boItem.telephoneClient, montantNum, boItem.Agence, boItem.Date, boItem.numeroTransGU, boItem.IDTransaction, boItem.SOURCE];
                    
                    boData.forEach((value, colIndex) => {
                        const cell = worksheet.getCell(rowIndex, colIndex + 1);
                        cell.value = value;
                        if (colIndex === 2) cell.numFmt = '#,##0.00'; // colonne montant
                        cell.style = dataStyle;
                    });
                }

                // Données Partenaire
                if (i < report.ecartPartenaire.length && selectedPartnerColumns.length > 0) {
                    // Utiliser directement les données originales au lieu des données transformées
                    const originalPartnerRecord = this.response?.partnerOnly?.[i];
                    
                    selectedPartnerColumns.forEach((col, colIndex) => {
                        let value: any = '';
                        
                        if (originalPartnerRecord && originalPartnerRecord[col] !== undefined && originalPartnerRecord[col] !== null && originalPartnerRecord[col] !== '') {
                            value = originalPartnerRecord[col];
                        } else {
                            const partnerItem = report.ecartPartenaire[i];
                            switch (col) {
                                case 'CLE': value = partnerItem.CLE || ''; break;
                                case 'téléphone client': value = partnerItem.telephoneClient || ''; break;
                                case 'montant': value = partnerItem.montant ?? ''; break;
                                case 'Agence': value = partnerItem.Agence || ''; break;
                                case 'Date': value = partnerItem.Date || ''; break;
                                case 'HEURE': value = partnerItem.Heure || ''; break;
                                case 'SOURCE': value = partnerItem.SOURCE || 'PARTENAIRE'; break;
                                default: value = ''; break;
                            }
                        }
                        
                        const cell = worksheet.getCell(rowIndex, boColumnsCount + spacing + colIndex + 1);
                        cell.value = this.exportAmountValue(col, value);
                        if (this.isAmountColumnForExport(col)) cell.numFmt = '#,##0.00';
                        cell.style = dataStyle;
                    });
                }
            }

            // Ajuster la largeur des colonnes
            for (let i = 1; i <= boColumnsCount + spacing + partnerColumnsCount; i++) {
                worksheet.getColumn(i).width = 15;
            }

            // Télécharger le fichier
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `rapport_ecarts_${new Date().toISOString().split('T')[0]}.xlsx`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            // Fallback vers CSV si Excel échoue
            // S'assurer que SOURCE est en dernière position aussi pour le fallback CSV
            let csvCols = [...selectedPartnerColumns];
            if (csvCols.includes('SOURCE')) {
                csvCols = csvCols.filter(c => c !== 'SOURCE');
                csvCols.push('SOURCE');
            }
            const csvContent = this.generateCsvContent(report, csvCols, boHeader, csvCols.join(';'));
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `rapport_ecarts_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    /**
     * Génère le titre du rapport avec agence et date
     */
    private generateReportTitle(): string {
        let agency = '';
        let date = '';

        // Récupérer l'agence à partir des données BO ou Partenaire
        if (this.response?.boOnly && this.response.boOnly.length > 0) {
            const firstBoRecord = this.response.boOnly[0];
            agency = this.getValueWithFallback(firstBoRecord, ['Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'AGENCY']);
        } else if (this.response?.partnerOnly && this.response.partnerOnly.length > 0) {
            const firstPartnerRecord = this.response.partnerOnly[0];
            agency = this.getValueWithFallback(firstPartnerRecord, ['Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'AGENCY']);
        }

        // Récupérer la date à partir de selectedDate ou date actuelle
        if (this.selectedDate) {
            const dateObj = new Date(this.selectedDate);
            date = dateObj.toLocaleDateString('fr-FR', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
        } else {
            // Utiliser la date actuelle si pas de date sélectionnée
            date = new Date().toLocaleDateString('fr-FR', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
        }

        // Construire le titre
        if (agency && agency.trim() !== '') {
            return `ECART Réconciliation ${agency} du ${date}`;
        } else {
            return `ECART Réconciliation du ${date}`;
        }
    }

    /**
     * Génère le contenu CSV (fallback)
     */
    private generateCsvContent(report: any, selectedPartnerColumns: string[], boHeader: string, partnerHeader: string): string {
        let csvContent = '';
        
        const spacing = ';;';
        const boColumnsCount = boHeader.split(';').length;
        const partnerColumnsCount = selectedPartnerColumns.length;
        const topSpacing = 2; // 2 lignes d'espacement en haut

        // Ajouter l'espacement en haut (2 lignes vides)
        const emptyRow = ';'.repeat(boColumnsCount + 2 + partnerColumnsCount - 1); // -1 car on compte déjà les séparateurs
        csvContent += `${emptyRow}\n`;
        csvContent += `${emptyRow}\n`;

        // Titre principal "ECART Réconciliation [Agence] du [Date]"
        const reportTitle = this.generateReportTitle();
        const totalColumns = boColumnsCount + 2 + partnerColumnsCount;
        
        // Centrer le titre en calculant l'espacement optimal
        const titleLength = reportTitle.length;
        const availableSpace = totalColumns - 1; // -1 car on compte déjà les séparateurs
        const leftPadding = Math.floor((availableSpace - titleLength) / 2);
        const rightPadding = availableSpace - titleLength - leftPadding;
        
        const titleRow = ';'.repeat(Math.max(0, leftPadding)) + reportTitle + ';'.repeat(Math.max(0, rightPadding));
        csvContent += `${titleRow}\n`;

        // Titres centrés
        const boTitlePadding = Math.floor((boColumnsCount - 1) / 2);
        const boTitleCells = ';'.repeat(boTitlePadding) + 'ECART BO' + ';'.repeat(boColumnsCount - 1 - boTitlePadding);

        const partnerTitlePadding = Math.floor((partnerColumnsCount - 1) / 2);
        const partnerTitleCells = ';'.repeat(partnerTitlePadding) + 'ECART PARTENAIRE' + ';'.repeat(partnerColumnsCount - 1 - partnerTitlePadding);

        csvContent += `${boTitleCells}${spacing}${partnerTitleCells}\n`;
        csvContent += `${boHeader}${spacing}${partnerHeader}\n`;

        const maxRows = Math.max(report.ecartBo.length, report.ecartPartenaire.length);

        for (let i = 0; i < maxRows; i++) {
            let boRow = '';
            let partnerRow = '';

            if (i < report.ecartBo.length) {
                const boItem = report.ecartBo[i];
                boRow = `${boItem.Service || boItem.CLE};${boItem.telephoneClient};${boItem.montant};${boItem.Agence};${boItem.Date};${boItem.numeroTransGU};${boItem.IDTransaction};${boItem.SOURCE}`;
            } else {
                boRow = ';'.repeat(boColumnsCount - 1);
            }

            if (i < report.ecartPartenaire.length && selectedPartnerColumns.length > 0) {
                // Utiliser directement les données originales au lieu des données transformées
                const originalPartnerRecord = this.response?.partnerOnly?.[i];
                
                const row = selectedPartnerColumns.map(col => {
                    let value = '';
                    
                    // Utiliser directement la valeur de la colonne dans les données originales
                    if (originalPartnerRecord && originalPartnerRecord[col] !== undefined && originalPartnerRecord[col] !== null && originalPartnerRecord[col] !== '') {
                        value = String(originalPartnerRecord[col]);
                    } else {
                        // Si pas trouvé, essayer avec les propriétés transformées comme fallback
                        const partnerItem = report.ecartPartenaire[i];
                        switch (col) {
                            case 'CLE': value = partnerItem.CLE || ''; break;
                            case 'téléphone client': value = partnerItem.telephoneClient || ''; break;
                            case 'montant': value = partnerItem.montant || ''; break;
                            case 'Agence': value = partnerItem.Agence || ''; break;
                            case 'Date': value = partnerItem.Date || ''; break;
                            case 'HEURE': value = partnerItem.Heure || ''; break;
                            case 'SOURCE': value = partnerItem.SOURCE || 'PARTENAIRE'; break;
                            default: value = ''; break;
                        }
                    }
                    
                    return value;
                });
                partnerRow = row.join(';');
            } else {
                partnerRow = ';'.repeat(partnerColumnsCount - 1);
            }

            csvContent += `${boRow}${spacing}${partnerRow}\n`;
        }

        return csvContent;
    }

    // === Création OP depuis ECART Partenaire ===
    isPartnerRecordEligible(record: Record<string, string>): boolean {
        const rawType = this.getFromRecord(record, ['Type Opération', 'typeOperation', 'type_operation']);
        const t = this.normalizeType(rawType);
        // Mots-clés de classification : règles de calcul (Configuration > Calcul) prioritaires.
        return this.calculService.matchesAny(t, 'BANQUE.TYPES_COMPENSATION', ['compens'])
            || this.calculService.matchesAny(t, 'BANQUE.TYPES_APPROVISIONNEMENT', ['appro'])
            || this.calculService.matchesAny(t, 'BANQUE.TYPES_NIVELLEMENT', ['nivel'])
            || t.includes('regularis');
    }

    async createOperationFromPartnerRecord(record: Record<string, string>) {
        try {
            const rawType = this.getFromRecord(record, ['Type Opération', 'typeOperation', 'type_operation']);
            const normalized = this.normalizeType(rawType);
            // Classification par mots-clés : règles de calcul (Configuration > Calcul) prioritaires,
            // code par défaut en repli.
            const typeOperation = this.calculService.matchesAny(normalized, 'BANQUE.TYPES_COMPENSATION', ['compens']) ? 'Compense_client'
                                  : this.calculService.matchesAny(normalized, 'BANQUE.TYPES_APPROVISIONNEMENT', ['appro']) ? 'Appro_client'
                                  : this.calculService.matchesAny(normalized, 'BANQUE.TYPES_NIVELLEMENT', ['nivel']) ? 'nivellement'
                                  : normalized.includes('regularis') ? 'régularisation_solde'
                                  : rawType || 'ajustement';

            const { agency } = this.getPartnerOnlyAgencyAndService(record);
            const codeProprietaire = (this.getFromRecord(record, ['Agence','agency','Code propriétaire','Code proprietaire','codeProprietaire','code_proprietaire']) || agency || '').trim();
            if (!codeProprietaire) {
                await this.popupService.showWarning(this.t('RES.dlg.ownerCodeNotFound'));
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
                this.t('RES.dlg.createOpDatePrompt'),
                this.t('RES.dlg.createOpDateTitle'),
                defaultDateCandidate
            );

            if (dateInput === null) {
                await this.popupService.showInfo(this.t('RES.dlg.createOpCancelled'));
                return;
            }

            const normalizedDate = this.toIsoLocalDate(dateInput || defaultDateCandidate);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
                await this.popupService.showWarning(this.t('RES.dlg.invalidOpDateCancelled'));
                return;
            }

            this.selectedPartnerImportOpDate = normalizedDate;
            const nomBordereau = this.getFromRecord(record, ['Numéro Trans GU','Numero Trans GU','numeroTransGU','numero_trans_gu']);

            const banqueInput = await this.popupService.showTextInput(this.t('RES.dlg.bankOwnerCode'), this.t('RES.dlg.createOpTitle'), codeProprietaire, this.t('RES.dlg.createOpPlaceholder'));
            const banque = (banqueInput || '').trim();
            if (!banque) {
                await this.popupService.showWarning(this.t('RES.dlg.bankRequired'));
                return;
            }

            // Demander le type de référence (Standard/Cross Border/Nivellement)
            const referenceTypeInput = await this.popupService.showSelectInput(
                this.t('RES.dlg.referenceType'), 
                this.t('RES.dlg.selectType'), 
                ['STANDARD', 'CROSS_BORDER', 'NIVELLEMENT'], 
                'STANDARD'
            );
            const referenceType = referenceTypeInput || 'STANDARD';

            // Si NIVELLEMENT est sélectionné, forcer le type d'opération à "nivellement"
            let finalTypeOperation = typeOperation;
            if (referenceType === 'NIVELLEMENT') {
                finalTypeOperation = 'nivellement';
            }

            const comptes = await this.compteService.getComptesByCodeProprietaire(codeProprietaire).toPromise();
            if (!comptes || !comptes.length) {
                await this.popupService.showError(this.t('RES.dlg.noAccountForOwnerCode', { code: codeProprietaire }));
                return;
            }
            const compteId = comptes[0].id!;

            // Vérification de doublon temporairement désactivée pour éviter les erreurs 400
            /*
            try {
                const day = this.extractIsoDay(dateStr) || this.toIsoLocalDate(dateStr);
                const dateDebut = `${day} 00:00:00`;
                const dateFin = `${day} 23:59:59`;
                const existing = await this.operationService.getOperationsByCompte(codeProprietaire, dateDebut, dateFin, typeOperation).toPromise();
                const hasDuplicate = (existing || []).some(op => (op.nomBordereau || '') === (nomBordereau || ''));
                if (hasDuplicate) {
                    await this.popupService.showWarning('Cette opération existe déjà (doublon détecté)');
                    return;
                }
            } catch (e) {
            }
            */

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
                    next: async () => { await this.popupService.showSuccess(this.t('RES.dlg.operationCreated')); resolve(); },
                    error: async (err) => { console.error(err); await this.popupService.showError(this.t('RES.dlg.operationCreateFailed')); reject(err); }
                });
            });
        } catch (e) {
            await this.popupService.showError(this.t('RES.dlg.operationCreateError'));
        }
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

    private toIsoLocalDate(input: string): string {
        try {
            const d = new Date(input);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch {}
        return input;
    }

    private makeIsoDateTime(datePart: string): string {
        try {
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                return new Date(`${datePart}T00:00:00`).toISOString();
            }
        } catch {}
        return new Date().toISOString();
    }

    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 2 }).format(amount || 0);
    }
} 
