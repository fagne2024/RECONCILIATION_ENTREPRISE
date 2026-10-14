import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
// Interface pour les données de rapport
interface ReconciliationReportData {
    id?: number;
    date: string;
    agency: string;
    service: string;
    country: string;
    totalTransactions: number;
    totalVolume: number;
    matches: number;
    boOnly: number;
    partnerOnly: number;
    mismatches: number;
    matchRate: number;
    status: string;
    comment: string;
    glpiId?: string;
}
import { ReconciliationService } from '../../services/reconciliation.service';
import { PopupService } from '../../services/popup.service';
import { ModernExcelExportService, ExcelColumn } from '../../services/modern-excel-export.service';
import { ReconciliationReportService, PilotReportFilters } from '../../services/reconciliation-report.service';

@Component({
    selector: 'app-report-dashboard',
    template: `
        <div class="report-dashboard-container">
            <!-- En-tête avec navigation -->
            <div class="dashboard-header">
                <div class="header-content">
                    <h1>📊 Tableau de Bord des Rapports</h1>
                    <p>Analyse avancée des données de réconciliation</p>
                </div>
                <div class="header-actions">
                    <button class="btn btn-back" (click)="goBack()">
                        ← Retour
                    </button>
                </div>
            </div>

            <!-- Filtres avancés -->
            <div class="advanced-filters">
                <div class="filters-header">
                    <h3>🔍 Filtres Avancés</h3>
                </div>
                
                <div class="filters-grid">
                    <!-- Filtre Agence -->
                    <div class="filter-group">
                        <label>🏢 Agence</label>
                        <select 
                            [(ngModel)]="selectedAgency" 
                            (change)="applyFilters()"
                            class="filter-select">
                            <option value="">Toutes les agences</option>
                            <option *ngFor="let agency of availableAgencies" [value]="agency">
                                {{agency}}
                            </option>
                        </select>
                    </div>

                    <!-- Filtre Service -->
                    <div class="filter-group">
                        <label>⚙️ Service</label>
                        <select 
                            [(ngModel)]="selectedService" 
                            (change)="applyFilters()"
                            class="filter-select">
                            <option value="">Tous les services</option>
                            <option *ngFor="let service of availableServices" [value]="service">
                                {{service}}
                            </option>
                        </select>
                    </div>

                    <!-- Filtre Période -->
                    <div class="filter-group">
                        <label>📅 Période</label>
                        <select 
                            [(ngModel)]="selectedPeriod" 
                            (change)="onPeriodChange()"
                            [disabled]="showAllDataReport"
                            class="filter-select">
                            <option value="day">Aujourd'hui</option>
                            <option value="week">Cette semaine</option>
                            <option value="month">Ce mois</option>
                            <option value="lastMonth">Le mois dernier</option>
                            <option value="year">Cette année</option>
                            <option value="custom">Période personnalisée</option>
                        </select>
                    </div>
                    
                    <!-- Bouton Voir plus -->
                    <div class="filter-group">
                        <button type="button" (click)="toggleShowAllDataReport()" class="btn-show-more" [class.active]="showAllDataReport">
                            <i class="fas" [ngClass]="showAllDataReport ? 'fa-eye-slash' : 'fa-eye'"></i>
                            {{ showAllDataReport ? 'Voir moins' : 'Voir plus' }}
                        </button>
                    </div>

                    <!-- Date personnalisée -->
                    <div class="filter-group" *ngIf="selectedPeriod === 'custom'">
                        <label>📆 Date de début</label>
                        <input 
                            type="date" 
                            [(ngModel)]="customStartDate" 
                            (change)="onCustomDateChange()"
                            class="filter-date">
                    </div>
                    <div class="filter-group" *ngIf="selectedPeriod === 'custom'">
                        <label>📆 Date de fin</label>
                        <input 
                            type="date" 
                            [(ngModel)]="customEndDate" 
                            (change)="onCustomDateChange()"
                            class="filter-date">
                    </div>
                </div>

                <!-- Indicateur de période -->
                <div class="period-indicator" *ngIf="selectedPeriod === 'custom' && customStartDate && customEndDate">
                    <div class="indicator-content">
                        <span class="indicator-icon">📅</span>
                        <span class="indicator-text">
                            Période sélectionnée : {{formatDate(customStartDate)}} - {{formatDate(customEndDate)}}
                        </span>
                    </div>
                </div>

                <!-- Actions des filtres -->
                <div class="filter-actions">
                    <button class="btn btn-report" (click)="generatePilotReport()" [disabled]="isGeneratingReport">
                        🧾 {{ isGeneratingReport ? 'Génération...' : 'Générer rapport (Markdown)' }}
                    </button>
                    <button class="btn btn-report-secondary" (click)="downloadPilotReport()" [disabled]="!pilotReportMarkdown">
                        ⬇️ Télécharger (.md)
                    </button>
                    <button class="btn btn-clear" (click)="clearFilters()">
                        🗑️ Effacer les filtres
                    </button>
                    <button class="btn btn-export" (click)="exportReport()" [disabled]="!filteredData.length">
                        📊 Exporter le rapport
                    </button>
                </div>
            
            <!-- Aperçu du rapport -->
            <div class="report-preview" *ngIf="pilotReportMarkdown">
                <div class="preview-header">
                    <div class="preview-title">🧾 Aperçu rapport généré</div>
                    <div class="preview-actions">
                        <button class="btn btn-preview-toggle" (click)="toggleReportPreview()">
                            {{ showPilotReportPreview ? 'Masquer' : 'Afficher' }}
                        </button>
                        <button class="btn btn-preview-copy" (click)="copyPilotReportToClipboard()">
                            📋 Copier
                        </button>
                    </div>
                </div>
                <pre class="preview-body" *ngIf="showPilotReportPreview">{{ pilotReportMarkdown }}</pre>
            </div>
            </div>

            <!-- Métriques principales -->
            <div class="metrics-section">
                <div class="metrics-grid">
                    <div class="metric-card primary" [title]="'Total transactions: ' + (getTotalTransactions() | number)">
                        <div class="metric-icon">📈</div>
                        <div class="metric-content">
                            <div class="metric-title">Total Transactions</div>
                            <div class="metric-value">{{getTotalTransactionsFormatted()}}</div>
                            <div class="metric-subtitle">Sur {{getDateRange()}}</div>
                        </div>
                    </div>
                    
                    <div class="metric-card success" [title]="'Volume total: ' + (getTotalVolume() | number) + ' FCFA'">
                        <div class="metric-icon">💰</div>
                        <div class="metric-content">
                            <div class="metric-title">Volume Total</div>
                            <div class="metric-value">{{getTotalVolumeFormatted()}}</div>
                            <div class="metric-subtitle">Taux global: {{getGlobalMatchRate()}}%</div>
                        </div>
                    </div>
                    
                    <div class="metric-card info">
                        <div class="metric-icon">🏢</div>
                        <div class="metric-content">
                            <div class="metric-title">Agences</div>
                            <div class="metric-value">{{getUniqueAgencies()}}</div>
                            <div class="metric-subtitle">{{getUniqueServices()}} services</div>
                        </div>
                    </div>
                    
                    <div class="metric-card warning">
                        <div class="metric-icon">📊</div>
                        <div class="metric-content">
                            <div class="metric-title">Performance</div>
                            <div class="metric-value">{{getAveragePerformance()}}%</div>
                            <div class="metric-subtitle">Taux moyen</div>
                        </div>
                    </div>
                    
                    <div class="metric-card danger">
                        <div class="metric-icon">⚠️</div>
                        <div class="metric-content">
                            <div class="metric-title">Écarts BO</div>
                            <div class="metric-value">{{getTotalBoOnly() | number}}</div>
                            <div class="metric-subtitle">{{getBoOnlyRate()}}% du total</div>
                        </div>
                    </div>
                    
                    <div class="metric-card danger">
                        <div class="metric-icon">🔴</div>
                        <div class="metric-content">
                            <div class="metric-title">Écarts Partenaire</div>
                            <div class="metric-value">{{getTotalPartnerOnly() | number}}</div>
                            <div class="metric-subtitle">{{getPartnerOnlyRate()}}% du total</div>
                        </div>
                    </div>
                    
                    <div class="metric-card danger">
                        <div class="metric-icon">❌</div>
                        <div class="metric-content">
                            <div class="metric-title">Incohérences</div>
                            <div class="metric-value">{{getTotalMismatches() | number}}</div>
                            <div class="metric-subtitle">{{getMismatchRate()}}% du total</div>
                        </div>
                    </div>
                    
                    <div class="metric-card info">
                        <div class="metric-icon">⏳</div>
                        <div class="metric-content">
                            <div class="metric-title">Lignes EN COURS</div>
                            <div class="metric-value">{{getEnCoursCount() | number}}</div>
                            <div class="metric-subtitle">{{getEnCoursRate()}}% du total</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Graphiques et analyses -->
            <div class="analytics-section">
                <div class="charts-grid">
                    <!-- Répartition par Service -->
                    <div class="chart-container">
                        <div class="chart-header">
                            <h3>📊 Répartition par Service</h3>
                            <div class="chart-controls">
                                <div class="search-box">
                                    <input 
                                        type="text" 
                                        [(ngModel)]="serviceSearchTerm" 
                                        (input)="filterServices()"
                                        placeholder="Rechercher un service..."
                                        class="search-input">
                                </div>
                                <div class="sort-controls">
                                    <select [(ngModel)]="serviceSortBy" (change)="sortServices()" class="sort-select">
                                        <option value="transactions">Trier par transactions</option>
                                        <option value="volume">Trier par volume</option>
                                        <option value="matchRate">Trier par taux de correspondance</option>
                                        <option value="name">Trier par nom</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="service-chart">
                            <div *ngFor="let service of paginatedServices" class="service-item">
                                <div class="service-header">
                                    <span class="service-name">{{service.name}}</span>
                                    <span class="service-rate">{{service.matchRate}}%</span>
                                </div>
                                <div class="service-bar">
                                    <div class="service-progress" [style.width.%]="service.matchRate"></div>
                                </div>
                                <div class="service-stats">
                                    <span>{{service.transactions | number}} transactions</span>
                                    <span>{{service.volume | number}} volume</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Pagination pour les services -->
                        <div class="pagination" *ngIf="totalServicePages > 1">
                            <button 
                                class="pagination-btn" 
                                [disabled]="currentServicePage === 1"
                                (click)="goToServicePage(currentServicePage - 1)">
                                ← Précédent
                            </button>
                            <span class="pagination-info">
                                Page {{currentServicePage}} sur {{totalServicePages}} 
                                ({{filteredServices.length}} service{{filteredServices.length > 1 ? 's' : ''}})
                            </span>
                            <button 
                                class="pagination-btn" 
                                [disabled]="currentServicePage === totalServicePages"
                                (click)="goToServicePage(currentServicePage + 1)">
                                Suivant →
                            </button>
                        </div>
                    </div>

                    <!-- Performance par Agence -->
                    <div class="chart-container">
                        <div class="chart-header">
                            <h3>🏢 Performance par Agence</h3>
                            <div class="chart-controls">
                                <div class="search-box">
                                    <input 
                                        type="text" 
                                        [(ngModel)]="agencySearchTerm" 
                                        (input)="filterAgencies()"
                                        placeholder="Rechercher une agence..."
                                        class="search-input">
                                </div>
                                <div class="sort-controls">
                                    <select [(ngModel)]="agencySortBy" (change)="sortAgencies()" class="sort-select">
                                        <option value="transactions">Trier par transactions</option>
                                        <option value="volume">Trier par volume</option>
                                        <option value="matchRate">Trier par performance</option>
                                        <option value="name">Trier par nom</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="agency-chart">
                            <div *ngFor="let agency of paginatedAgencies" class="agency-item">
                                <div class="agency-header">
                                    <span class="agency-name">{{agency.name}}</span>
                                    <span class="agency-rate rate-{{getRateClass(agency.matchRate)}}">{{agency.matchRate}}%</span>
                                </div>
                                <div class="agency-stats">
                                    <div class="stat">
                                        <span class="stat-label">Transactions:</span>
                                        <span class="stat-value">{{agency.transactions | number}}</span>
                                    </div>
                                    <div class="stat">
                                        <span class="stat-label">Volume:</span>
                                        <span class="stat-value">{{agency.volume | number}}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Pagination pour les agences -->
                        <div class="pagination" *ngIf="totalAgencyPages > 1">
                            <button 
                                class="pagination-btn" 
                                [disabled]="currentAgencyPage === 1"
                                (click)="goToAgencyPage(currentAgencyPage - 1)">
                                ← Précédent
                            </button>
                            <span class="pagination-info">
                                Page {{currentAgencyPage}} sur {{totalAgencyPages}} 
                                ({{filteredAgencies.length}} agence{{filteredAgencies.length > 1 ? 's' : ''}})
                            </span>
                            <button 
                                class="pagination-btn" 
                                [disabled]="currentAgencyPage === totalAgencyPages"
                                (click)="goToAgencyPage(currentAgencyPage + 1)">
                                Suivant →
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Analyse des écarts -->
                <div class="charts-grid">
                    <div class="chart-container">
                        <h3>⚠️ Analyse des Écarts</h3>
                        <div class="gaps-info">
                            <span class="info-icon">ℹ️</span>
                            <span class="info-text">Écarts comptabilisés uniquement pour les lignes avec statut "EN COURS"</span>
                        </div>
                        <div class="gaps-analysis">
                            <div class="gap-item">
                                <div class="gap-header">
                                    <span class="gap-title">Écarts BO</span>
                                    <span class="gap-count danger">{{getTotalBoOnly() | number}}</span>
                                </div>
                                <div class="gap-bar">
                                    <div class="gap-progress bo-gap" [style.width.%]="getBoOnlyRate()"></div>
                                </div>
                                <div class="gap-percentage">{{getBoOnlyRate()}}% du total</div>
                            </div>
                            
                            <div class="gap-item">
                                <div class="gap-header">
                                    <span class="gap-title">Écarts Partenaire</span>
                                    <span class="gap-count danger">{{getTotalPartnerOnly() | number}}</span>
                                </div>
                                <div class="gap-bar">
                                    <div class="gap-progress partner-gap" [style.width.%]="getPartnerOnlyRate()"></div>
                                </div>
                                <div class="gap-percentage">{{getPartnerOnlyRate()}}% du total</div>
                            </div>
                            
                            <div class="gap-item">
                                <div class="gap-header">
                                    <span class="gap-title">Incohérences</span>
                                    <span class="gap-count danger">{{getTotalMismatches() | number}}</span>
                                </div>
                                <div class="gap-bar">
                                    <div class="gap-progress mismatch-gap" [style.width.%]="getMismatchRate()"></div>
                                </div>
                                <div class="gap-percentage">{{getMismatchRate()}}% du total</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <h3>📊 Répartition des Écarts par Service</h3>
                        <div class="gaps-info">
                            <span class="info-icon">ℹ️</span>
                            <span class="info-text">Analyse basée sur les lignes "EN COURS" uniquement</span>
                        </div>
                        <div class="service-gaps-chart">
                            <div *ngFor="let service of getServiceGapsBreakdown()" class="service-gap-item">
                                <div class="service-gap-header">
                                    <span class="service-gap-name">{{service.name}}</span>
                                    <span class="service-gap-rate">{{service.gapRate}}%</span>
                                </div>
                                <div class="service-gap-stats">
                                    <div class="gap-stat">
                                        <span class="gap-stat-label">Écarts BO:</span>
                                        <span class="gap-stat-value">{{service.boOnly | number}}</span>
                                    </div>
                                    <div class="gap-stat">
                                        <span class="gap-stat-label">Écarts Partenaire:</span>
                                        <span class="gap-stat-value">{{service.partnerOnly | number}}</span>
                                    </div>
                                    <div class="gap-stat">
                                        <span class="gap-stat-label">Incohérences:</span>
                                        <span class="gap-stat-value">{{service.mismatches | number}}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    `,
    styles: [`
        .report-dashboard-container {
            min-height: 100vh;
            background: linear-gradient(135deg, var(--theme-primary, #667eea) 0%, var(--theme-accent, #764ba2) 100%);
            padding: 20px;
        }

        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .header-content h1 {
            color: white;
            margin: 0;
            font-size: 2.5rem;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .header-content p {
            color: rgba(255,255,255,0.8);
            margin: 10px 0 0 0;
            font-size: 1.1rem;
        }

        .btn-back {
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .btn-back:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
        }

        .advanced-filters {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .filters-header h3 {
            color: white;
            margin: 0 0 20px 0;
            font-size: 1.3rem;
            font-weight: 600;
        }

        .filters-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .filter-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .filter-group label {
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .filter-select, .filter-date {
            padding: 12px 16px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 1rem;
            backdrop-filter: blur(10px);
        }

        .filter-select:focus, .filter-date:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
        }

        .filter-select option {
            background: #1a1a1a;
            color: white;
        }

        .filter-actions {
            display: flex;
            gap: 15px;
            justify-content: flex-end;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 1rem;
        }
        
        .btn-show-more {
            background: #4CAF50;
            color: white;
            border: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }

        .btn-show-more:hover:not(:disabled) {
            background: #45a049;
            transform: translateY(-2px);
        }

        .btn-show-more.active {
            background: #f44336;
        }

        .btn-show-more.active:hover:not(:disabled) {
            background: #da190b;
        }

        .btn-show-more i {
            margin-right: 4px;
        }

        .btn-clear {
            background: rgba(220,53,69,0.8);
            color: white;
            border: 1px solid rgba(220,53,69,0.3);
        }

        .btn-clear:hover {
            background: rgba(220,53,69,1);
            transform: translateY(-2px);
        }

        .btn-export {
            background: rgba(40,167,69,0.8);
            color: white;
            border: 1px solid rgba(40,167,69,0.3);
        }

        .btn-export:hover {
            background: rgba(40,167,69,1);
            transform: translateY(-2px);
        }

        .btn-export:disabled {
            background: rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.5);
            cursor: not-allowed;
            transform: none;
        }

        .btn-report {
            background: rgba(0,123,255,0.85);
            color: white;
            border: 1px solid rgba(0,123,255,0.35);
        }
        .btn-report:hover:not(:disabled) {
            background: rgba(0,123,255,1);
            transform: translateY(-2px);
        }
        .btn-report:disabled {
            background: rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.5);
            cursor: not-allowed;
            transform: none;
        }
        .btn-report-secondary {
            background: rgba(255,255,255,0.18);
            color: white;
            border: 1px solid rgba(255,255,255,0.28);
        }
        .btn-report-secondary:hover:not(:disabled) {
            background: rgba(255,255,255,0.25);
            transform: translateY(-2px);
        }

        .report-preview {
            margin-top: 18px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.18);
            border-radius: 12px;
            overflow: hidden;
        }
        .preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            background: rgba(0,0,0,0.15);
        }
        .preview-title {
            color: white;
            font-weight: 700;
        }
        .preview-actions {
            display: flex;
            gap: 10px;
        }
        .btn-preview-toggle, .btn-preview-copy {
            padding: 8px 12px;
            background: rgba(255,255,255,0.18);
            color: white;
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        .btn-preview-toggle:hover, .btn-preview-copy:hover {
            background: rgba(255,255,255,0.25);
        }
        .preview-body {
            margin: 0;
            padding: 14px;
            max-height: 520px;
            overflow: auto;
            color: rgba(255,255,255,0.92);
            font-size: 0.85rem;
            line-height: 1.35rem;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .period-indicator {
            background: rgba(40,167,69,0.2);
            border: 1px solid rgba(40,167,69,0.3);
            border-radius: 8px;
            padding: 12px 16px;
            margin: 15px 0;
        }

        .indicator-content {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .indicator-icon {
            font-size: 1.2rem;
        }

        .indicator-text {
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .metrics-section {
            margin-bottom: 30px;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }

        .metric-card {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            display: flex;
            align-items: center;
            gap: 20px;
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            cursor: help;
            position: relative;
        }

        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
        }

        .metric-card.primary { border-left: 5px solid #007bff; }
        .metric-card.success { border-left: 5px solid #28a745; }
        .metric-card.info { border-left: 5px solid #17a2b8; }
        .metric-card.warning { border-left: 5px solid #ffc107; }
        .metric-card.danger { border-left: 5px solid #dc3545; }

        /* Tooltip pour le volume total */
        .metric-card[title]:hover::after {
            content: attr(title);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.9rem;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .metric-card[title]:hover::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 5px solid transparent;
            border-top-color: rgba(0,0,0,0.9);
            z-index: 1000;
            pointer-events: none;
        }

        .metric-icon {
            font-size: 2.5rem;
            opacity: 0.8;
        }

        .metric-content {
            flex: 1;
        }

        .metric-title {
            color: rgba(255,255,255,0.8);
            font-size: 0.9rem;
            margin-bottom: 5px;
        }

        .metric-value {
            color: white;
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 5px;
        }

        .metric-subtitle {
            color: rgba(255,255,255,0.7);
            font-size: 0.8rem;
        }

        .analytics-section {
            margin-bottom: 30px;
        }

        .charts-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }

        .chart-container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .chart-container h3 {
            color: white;
            margin: 0 0 20px 0;
            font-size: 1.2rem;
            font-weight: 600;
        }

        .chart-header {
            margin-bottom: 20px;
        }

        .chart-controls {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .search-box {
            flex: 1;
            min-width: 200px;
        }

        .search-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 6px;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 0.9rem;
            backdrop-filter: blur(10px);
        }

        .search-input::placeholder {
            color: rgba(255,255,255,0.6);
        }

        .search-input:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }

        .sort-controls {
            min-width: 200px;
        }

        .sort-select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 6px;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 0.9rem;
            backdrop-filter: blur(10px);
        }

        .sort-select:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }

        .sort-select option {
            background: #1a1a1a;
            color: white;
        }

        .pagination {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .pagination-btn {
            padding: 8px 16px;
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 0.9rem;
        }

        .pagination-btn:hover:not(:disabled) {
            background: rgba(255,255,255,0.3);
            transform: translateY(-1px);
        }

        .pagination-btn:disabled {
            background: rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.5);
            cursor: not-allowed;
            transform: none;
        }

        .pagination-info {
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .service-chart, .agency-chart {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .service-item, .agency-item {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 15px;
            border-left: 4px solid #007bff;
        }

        .service-header, .agency-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .service-name, .agency-name {
            color: white;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .service-rate, .agency-rate {
            color: white;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .service-bar {
            background: rgba(255,255,255,0.1);
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 10px;
        }

        .service-progress {
            height: 100%;
            background: linear-gradient(90deg, #28a745, #20c997);
            transition: width 0.3s ease;
        }

        .service-stats, .agency-stats {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        .service-stats span, .agency-stats .stat {
            background: rgba(255,255,255,0.1);
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 0.9rem;
            color: white;
        }

        .agency-stats .stat {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .stat-label {
            font-size: 0.8rem;
            opacity: 0.7;
        }

        .stat-value {
            font-weight: 600;
        }

        /* Styles pour l'analyse des écarts */
        .gaps-info {
            background: rgba(23,162,184,0.2);
            border: 1px solid rgba(23,162,184,0.3);
            border-radius: 8px;
            padding: 10px 15px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .info-icon {
            font-size: 1rem;
        }

        .info-text {
            color: white;
            font-size: 0.9rem;
            font-weight: 500;
        }

        .gaps-analysis {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .gap-item {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 15px;
            border-left: 4px solid #dc3545;
        }

        .gap-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .gap-title {
            color: white;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .gap-count {
            color: #dc3545;
            font-weight: 700;
            font-size: 1.2rem;
        }

        .gap-bar {
            background: rgba(255,255,255,0.1);
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .gap-progress {
            height: 100%;
            transition: width 0.3s ease;
        }

        .bo-gap {
            background: linear-gradient(90deg, #dc3545, #ff6b6b);
        }

        .partner-gap {
            background: linear-gradient(90deg, #e74c3c, #ff8a80);
        }

        .mismatch-gap {
            background: linear-gradient(90deg, #c0392b, #ff5252);
        }

        .gap-percentage {
            color: rgba(255,255,255,0.8);
            font-size: 0.9rem;
            font-weight: 600;
        }

        .service-gaps-chart {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .service-gap-item {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 15px;
            border-left: 4px solid #dc3545;
        }

        .service-gap-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .service-gap-name {
            color: white;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .service-gap-rate {
            color: #dc3545;
            font-weight: 700;
            font-size: 1.1rem;
        }

        .service-gap-stats {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        .gap-stat {
            display: flex;
            flex-direction: column;
            gap: 2px;
            background: rgba(255,255,255,0.1);
            padding: 8px 12px;
            border-radius: 5px;
        }

        .gap-stat-label {
            font-size: 0.8rem;
            opacity: 0.7;
            color: white;
        }

        .gap-stat-value {
            font-weight: 600;
            color: white;
        }


        @media (max-width: 768px) {
            .charts-grid {
                grid-template-columns: 1fr;
            }
            
            .metrics-grid {
                grid-template-columns: 1fr;
            }
            
            .filters-grid {
                grid-template-columns: 1fr;
            }
            
            .chart-controls {
                flex-direction: column;
                gap: 10px;
            }
            
            .search-box, .sort-controls {
                min-width: unset;
            }
            
            .pagination {
                flex-direction: column;
                gap: 10px;
                text-align: center;
            }
            
            .pagination-info {
                order: -1;
            }
            
            .metric-value {
                font-size: 1.8rem;
            }
            
            .metric-card {
                padding: 20px;
                gap: 15px;
            }
        }

        @media (max-width: 480px) {
            .metric-value {
                font-size: 1.6rem;
            }
            
            .metric-card {
                padding: 15px;
                gap: 10px;
            }
            
            .metric-icon {
                font-size: 2rem;
            }
        }
    `]
})
export class ReportDashboardComponent implements OnInit, OnDestroy {
    private readonly reportDashboardHeaders = new HttpHeaders({ 'X-Permission-Module': 'Report Dashboard' });
    // Données
    allData: ReconciliationReportData[] = [];
    filteredData: ReconciliationReportData[] = [];
    
    // Filtres
    selectedAgency = '';
    selectedService = '';
    selectedPeriod = 'month';
    customStartDate = '';
    customEndDate = '';
    showAllDataReport: boolean = false; // Flag pour afficher toutes les données
    
    // Options disponibles
    availableAgencies: string[] = [];
    availableServices: string[] = [];
    
    // Pagination et filtres pour les services
    serviceSearchTerm = '';
    serviceSortBy = 'transactions';
    filteredServices: any[] = [];
    paginatedServices: any[] = [];
    currentServicePage = 1;
    itemsPerPage = 5;
    totalServicePages = 1;
    
    // Pagination et filtres pour les agences
    agencySearchTerm = '';
    agencySortBy = 'transactions';
    filteredAgencies: any[] = [];
    paginatedAgencies: any[] = [];
    currentAgencyPage = 1;
    totalAgencyPages = 1;
    
    private subscription = new Subscription();
    
    // Rapport pilote (Markdown)
    isGeneratingReport = false;
    pilotReportMarkdown = '';
    showPilotReportPreview = true;

    constructor(
        private reconciliationService: ReconciliationService,
        private popupService: PopupService,
        private modernExportService: ModernExcelExportService,
        private router: Router,
        private http: HttpClient,
        private reconciliationReportService: ReconciliationReportService
    ) {}

    ngOnInit() {
        this.loadData();
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    loadData() {
        // Données de test correspondant exactement à l'image du dashboard
        // Total Transactions: 2,864 | Volume: 446,469 | Agences: 1 | Services: 4
        // Performance: 99.82% | Écarts BO: 10 (0.35%) | Écarts Partenaire: 0 (0%) | Incohérences: 0 (0%) | EN COURS: 2 (9.52%)
        const testData: ReconciliationReportData[] = [
            {
                id: 1,
                date: '2025-09-22',
                agency: 'Agence Principale',
                service: 'Service Mobile',
                country: 'CI',
                totalTransactions: 1200,
                totalVolume: 180000,
                matches: 1195,
                boOnly: 3,
                partnerOnly: 0,
                mismatches: 0,
                matchRate: 99.58,
                status: 'EN COURS',
                comment: 'Traitement en cours',
                glpiId: 'GLPI001'
            },
            {
                id: 2,
                date: '2025-09-23',
                agency: 'Agence Principale',
                service: 'Service Transfert',
                country: 'CI',
                totalTransactions: 800,
                totalVolume: 150000,
                matches: 798,
                boOnly: 2,
                partnerOnly: 0,
                mismatches: 0,
                matchRate: 99.75,
                status: 'EN COURS',
                comment: 'Traitement en cours',
                glpiId: 'GLPI002'
            },
            {
                id: 3,
                date: '2025-09-24',
                agency: 'Agence Principale',
                service: 'Service Paiement',
                country: 'CI',
                totalTransactions: 600,
                totalVolume: 90000,
                matches: 600,
                boOnly: 0,
                partnerOnly: 0,
                mismatches: 0,
                matchRate: 100.00,
                status: 'OK',
                comment: 'Traitement terminé',
                glpiId: 'GLPI003'
            },
            {
                id: 4,
                date: '2025-09-25',
                agency: 'Agence Principale',
                service: 'Service Retrait',
                country: 'CI',
                totalTransactions: 264,
                totalVolume: 26469,
                matches: 264,
                boOnly: 5,
                partnerOnly: 0,
                mismatches: 0,
                matchRate: 100.00,
                status: 'OK',
                comment: 'Traitement terminé',
                glpiId: 'GLPI004'
            }
        ];

        // Utiliser les données de test
        this.allData = testData;
        this.extractAvailableOptions();
        this.applyFilters();

        // Essayer de charger les vraies données en arrière-plan
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ymd = yesterday.toISOString().slice(0, 10);
        this.http
          .get<any[]>('/api/result8rec', {
            headers: this.reportDashboardHeaders,
            params: {
              startDate: ymd,
              endDate: ymd,
              fields: 'slim',
              _t: String(Date.now())
            }
          })
        .subscribe({
            next: (rows: any[]) => {
                if (Array.isArray(rows) && rows.length > 0) {
                    console.log('Données réelles chargées, remplacement des données de test');
                    this.allData = rows.map(row => ({
                        id: row.id,
                        date: row.date,
                        agency: row.agency,
                        service: row.service,
                        country: row.country,
                        totalTransactions: row.totalTransactions || 0,
                        totalVolume: row.totalVolume || 0,
                        matches: row.matches || 0,
                        boOnly: row.boOnly || 0,
                        partnerOnly: row.partnerOnly || 0,
                        mismatches: row.mismatches || 0,
                        matchRate: row.matchRate || 0,
                        status: row.status || 'INCONNU',
                        comment: row.comment || '',
                        glpiId: row.glpiId
                    }));
                    
                    this.extractAvailableOptions();
                    this.applyFilters();
                }
            },
            error: (err: HttpErrorResponse) => {
                console.log('Utilisation des données de test (API non disponible)');
            }
        });
    }

    extractAvailableOptions() {
        this.availableAgencies = [...new Set(this.allData.map(item => item.agency))].sort();
        this.availableServices = [...new Set(this.allData.map(item => item.service))].sort();
    }

    onPeriodChange() {
        if (this.selectedPeriod !== 'custom') {
            this.customStartDate = '';
            this.customEndDate = '';
        }
        this.showAllDataReport = false; // Réinitialiser le flag "Voir plus" quand on change la période
        this.applyFilters();
    }
    
    toggleShowAllDataReport() {
        this.showAllDataReport = !this.showAllDataReport;
        if (this.showAllDataReport) {
            // Désactiver les filtres de date
            this.selectedPeriod = 'month'; // Garder la valeur mais ne pas l'utiliser
            this.customStartDate = '';
            this.customEndDate = '';
        }
        this.applyFilters();
    }

    onCustomDateChange() {
        // Validation des dates personnalisées
        if (this.customStartDate && this.customEndDate) {
            const startDate = new Date(this.customStartDate);
            const endDate = new Date(this.customEndDate);
            
            if (startDate > endDate) {
                this.popupService.showError('Erreur de dates', 'La date de début doit être antérieure à la date de fin');
                this.customEndDate = '';
                return;
            }
        }
        
        console.log('🔍 Debug filtre personnalisé:', {
            selectedPeriod: this.selectedPeriod,
            customStartDate: this.customStartDate,
            customEndDate: this.customEndDate,
            totalData: this.allData.length
        });
        
        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.allData];
        
        console.log('🔍 Debug applyFilters - Données avant filtrage:', {
            totalData: this.allData.length,
            sampleData: this.allData.slice(0, 3).map(item => ({
                agency: item.agency,
                service: item.service,
                status: item.status,
                boOnly: item.boOnly,
                partnerOnly: item.partnerOnly,
                mismatches: item.mismatches
            }))
        });

        // Filtre par agence
        if (this.selectedAgency) {
            filtered = filtered.filter(item => item.agency === this.selectedAgency);
        }

        // Filtre par service
        if (this.selectedService) {
            filtered = filtered.filter(item => item.service === this.selectedService);
        }

        // Filtre par période
        // Si showAllDataReport est activé, ne pas filtrer par date
        if (!this.showAllDataReport && this.selectedPeriod !== 'custom') {
            const now = new Date();
            let startDate: Date;
            let endDate: Date | null = null;

            switch (this.selectedPeriod) {
                case 'day':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    const dayOfWeek = now.getDay();
                    startDate = new Date(now.getTime() - (dayOfWeek * 24 * 60 * 60 * 1000));
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'lastMonth':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    startDate = new Date(0);
            }

            filtered = filtered.filter(item => {
                const itemDate = new Date(item.date);
                if (endDate) {
                    return itemDate >= startDate && itemDate <= endDate;
                }
                return itemDate >= startDate;
            });
        } else if (this.selectedPeriod === 'custom' && this.customStartDate && this.customEndDate) {
            // Normaliser les dates pour la comparaison (ignorer l'heure)
            const startDate = new Date(this.customStartDate);
            startDate.setHours(0, 0, 0, 0);
            
            const endDate = new Date(this.customEndDate);
            endDate.setHours(23, 59, 59, 999);
            
            console.log('🔍 Debug filtre personnalisé - Dates:', {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                dataAvantFiltre: filtered.length
            });
            
            filtered = filtered.filter(item => {
                const itemDate = new Date(item.date);
                // Normaliser la date de l'item (ignorer l'heure)
                const normalizedItemDate = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
                const normalizedStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                const normalizedEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                
                const isInRange = normalizedItemDate >= normalizedStartDate && normalizedItemDate <= normalizedEndDate;
                
                if (isInRange) {
                    console.log('✅ Item inclus:', {
                        date: item.date,
                        normalizedDate: normalizedItemDate.toISOString(),
                        agency: item.agency,
                        service: item.service
                    });
                }
                
                return isInRange;
            });
            
            console.log('🔍 Debug filtre personnalisé - Résultat:', {
                dataApresFiltre: filtered.length,
                periode: `${this.customStartDate} - ${this.customEndDate}`
            });
        }

        this.filteredData = filtered;
        
        // Initialiser les filtres et la pagination
        this.filterServices();
        this.filterAgencies();
        
        console.log('🔍 Debug applyFilters - Données après filtrage:', {
            filteredCount: this.filteredData.length,
            statusCounts: {
                'EN COURS': this.filteredData.filter(item => item.status === 'EN COURS').length,
                'OK': this.filteredData.filter(item => item.status === 'OK').length,
                'NOK': this.filteredData.filter(item => item.status === 'NOK').length,
                'Autres': this.filteredData.filter(item => !['EN COURS', 'OK', 'NOK'].includes(item.status)).length
            },
            allStatuses: [...new Set(this.filteredData.map(item => item.status))],
            sampleStatuses: this.filteredData.slice(0, 5).map(item => ({
                agency: item.agency,
                service: item.service,
                status: item.status,
                boOnly: item.boOnly,
                partnerOnly: item.partnerOnly,
                mismatches: item.mismatches
            })),
            enCoursData: this.filteredData.filter(item => item.status === 'EN COURS').map(item => ({
                agency: item.agency,
                service: item.service,
                status: item.status,
                boOnly: item.boOnly,
                partnerOnly: item.partnerOnly,
                mismatches: item.mismatches
            }))
        });
    }

    clearFilters() {
        this.selectedAgency = '';
        this.selectedService = '';
        this.selectedPeriod = 'month';
        this.customStartDate = '';
        this.customEndDate = '';
        this.pilotReportMarkdown = '';
        this.applyFilters();
    }

    // Métriques
    getTotalTransactions(): number {
        return this.filteredData.reduce((sum, item) => sum + item.totalTransactions, 0);
    }

    getTotalTransactionsFormatted(): string {
        const totalTransactions = this.getTotalTransactions();
        if (totalTransactions >= 1000000) {
            return (totalTransactions / 1000000).toFixed(1) + 'M';
        } else if (totalTransactions >= 1000) {
            return (totalTransactions / 1000).toFixed(0) + 'K';
        }
        return totalTransactions.toString();
    }

    getTotalVolume(): number {
        return this.filteredData.reduce((sum, item) => sum + item.totalVolume, 0);
    }

    getTotalVolumeFormatted(): string {
        const totalVolume = this.getTotalVolume();
        if (totalVolume >= 1000000) {
            return (totalVolume / 1000000).toFixed(1) + 'M';
        } else if (totalVolume >= 1000) {
            return (totalVolume / 1000).toFixed(0) + 'K';
        }
        return totalVolume.toString();
    }

    getGlobalMatchRate(): number {
        if (this.filteredData.length === 0) return 0;
        const totalTransactions = this.getTotalTransactions();
        const totalMatches = this.filteredData.reduce((sum, item) => sum + item.matches, 0);
        return totalTransactions > 0 ? Math.round((totalMatches / totalTransactions) * 100 * 100) / 100 : 0;
    }

    getUniqueAgencies(): number {
        return new Set(this.filteredData.map(item => item.agency)).size;
    }

    getUniqueServices(): number {
        return new Set(this.filteredData.map(item => item.service)).size;
    }

    getAveragePerformance(): number {
        if (this.filteredData.length === 0) return 0;
        const totalRate = this.filteredData.reduce((sum, item) => sum + item.matchRate, 0);
        return Math.round((totalRate / this.filteredData.length) * 100) / 100;
    }

    getTotalBoOnly(): number {
        const enCoursData = this.filteredData.filter(item => 
            item.status && item.status.trim().toUpperCase().startsWith('EN COURS')
        );
        const totalBoOnly = enCoursData.reduce((sum, item) => sum + item.boOnly, 0);
        
        console.log('🔍 Debug getTotalBoOnly:', {
            totalFilteredData: this.filteredData.length,
            enCoursCount: enCoursData.length,
            enCoursData: enCoursData.map(item => ({
                agency: item.agency,
                service: item.service,
                status: item.status,
                boOnly: item.boOnly,
                partnerOnly: item.partnerOnly,
                mismatches: item.mismatches
            })),
            totalBoOnly: totalBoOnly
        });
        
        return totalBoOnly;
    }

    getTotalPartnerOnly(): number {
        const enCoursData = this.filteredData.filter(item => 
            item.status && item.status.trim().toUpperCase().startsWith('EN COURS')
        );
        const totalPartnerOnly = enCoursData.reduce((sum, item) => sum + item.partnerOnly, 0);
        
        console.log('🔍 Debug getTotalPartnerOnly:', {
            enCoursCount: enCoursData.length,
            totalPartnerOnly: totalPartnerOnly
        });
        
        return totalPartnerOnly;
    }

    getTotalMismatches(): number {
        const enCoursData = this.filteredData.filter(item => 
            item.status && item.status.trim().toUpperCase().startsWith('EN COURS')
        );
        const totalMismatches = enCoursData.reduce((sum, item) => sum + item.mismatches, 0);
        
        console.log('🔍 Debug getTotalMismatches:', {
            enCoursCount: enCoursData.length,
            totalMismatches: totalMismatches
        });
        
        return totalMismatches;
    }

    getBoOnlyRate(): number {
        const totalTransactions = this.getTotalTransactions();
        if (totalTransactions === 0) return 0;
        return Math.round((this.getTotalBoOnly() / totalTransactions) * 100 * 100) / 100;
    }

    getPartnerOnlyRate(): number {
        const totalTransactions = this.getTotalTransactions();
        if (totalTransactions === 0) return 0;
        return Math.round((this.getTotalPartnerOnly() / totalTransactions) * 100 * 100) / 100;
    }

    getMismatchRate(): number {
        const totalTransactions = this.getTotalTransactions();
        if (totalTransactions === 0) return 0;
        return Math.round((this.getTotalMismatches() / totalTransactions) * 100 * 100) / 100;
    }

    getEnCoursCount(): number {
        return this.filteredData.filter(item => 
            item.status && item.status.trim().toUpperCase().startsWith('EN COURS')
        ).length;
    }

    getEnCoursRate(): number {
        if (this.filteredData.length === 0) return 0;
        return Math.round((this.getEnCoursCount() / this.filteredData.length) * 100 * 100) / 100;
    }

    getServiceGapsBreakdown(): any[] {
        const serviceMap = new Map();
        
        // Filtrer seulement les lignes "EN COURS"
        const enCoursData = this.filteredData.filter(item => 
            item.status && item.status.trim().toUpperCase().startsWith('EN COURS')
        );
        
        enCoursData.forEach(item => {
            const service = item.service;
            if (!serviceMap.has(service)) {
                serviceMap.set(service, {
                    name: service,
                    transactions: 0,
                    boOnly: 0,
                    partnerOnly: 0,
                    mismatches: 0,
                    gapRate: 0
                });
            }
            
            const serviceData = serviceMap.get(service);
            serviceData.transactions += item.totalTransactions;
            serviceData.boOnly += item.boOnly;
            serviceData.partnerOnly += item.partnerOnly;
            serviceData.mismatches += item.mismatches;
        });
        
        // Calculer les taux d'écarts
        serviceMap.forEach(service => {
            const totalGaps = service.boOnly + service.partnerOnly + service.mismatches;
            service.gapRate = service.transactions > 0 
                ? Math.round((totalGaps / service.transactions) * 100 * 100) / 100 
                : 0;
        });
        
        return Array.from(serviceMap.values()).sort((a, b) => b.gapRate - a.gapRate);
    }

    getDateRange(): string {
        if (this.filteredData.length === 0) return 'Aucune donnée';
        
        const dates = this.filteredData.map(item => new Date(item.date));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        return `${this.formatDate(minDate)} - ${this.formatDate(maxDate)}`;
    }

    getServiceBreakdown(): any[] {
        const serviceMap = new Map();
        
        this.filteredData.forEach(item => {
            const service = item.service;
            if (!serviceMap.has(service)) {
                serviceMap.set(service, {
                    name: service,
                    transactions: 0,
                    volume: 0,
                    matches: 0,
                    matchRate: 0
                });
            }
            
            const serviceData = serviceMap.get(service);
            serviceData.transactions += item.totalTransactions;
            serviceData.volume += item.totalVolume;
            serviceData.matches += item.matches;
        });
        
        serviceMap.forEach(service => {
            service.matchRate = service.transactions > 0 
                ? Math.round((service.matches / service.transactions) * 100 * 100) / 100 
                : 0;
        });
        
        return Array.from(serviceMap.values()).sort((a, b) => b.transactions - a.transactions);
    }

    // Méthodes pour la pagination et les filtres des services
    filterServices() {
        const allServices = this.getServiceBreakdown();
        this.filteredServices = allServices.filter(service => 
            service.name.toLowerCase().includes(this.serviceSearchTerm.toLowerCase())
        );
        this.sortServices();
    }

    sortServices() {
        this.filteredServices.sort((a, b) => {
            switch (this.serviceSortBy) {
                case 'transactions':
                    return b.transactions - a.transactions;
                case 'volume':
                    return b.volume - a.volume;
                case 'matchRate':
                    return b.matchRate - a.matchRate;
                case 'name':
                    return a.name.localeCompare(b.name);
                default:
                    return b.transactions - a.transactions;
            }
        });
        this.updateServicePagination();
    }

    updateServicePagination() {
        this.totalServicePages = Math.ceil(this.filteredServices.length / this.itemsPerPage);
        this.currentServicePage = Math.min(this.currentServicePage, this.totalServicePages || 1);
        
        const startIndex = (this.currentServicePage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        this.paginatedServices = this.filteredServices.slice(startIndex, endIndex);
    }

    goToServicePage(page: number) {
        if (page >= 1 && page <= this.totalServicePages) {
            this.currentServicePage = page;
            this.updateServicePagination();
        }
    }

    getAgencyPerformance(): any[] {
        const agencyMap = new Map();
        
        this.filteredData.forEach(item => {
            const agency = item.agency;
            if (!agencyMap.has(agency)) {
                agencyMap.set(agency, {
                    name: agency,
                    transactions: 0,
                    volume: 0,
                    matches: 0,
                    matchRate: 0
                });
            }
            
            const agencyData = agencyMap.get(agency);
            agencyData.transactions += item.totalTransactions;
            agencyData.volume += item.totalVolume;
            agencyData.matches += item.matches;
        });
        
        agencyMap.forEach(agency => {
            agency.matchRate = agency.transactions > 0 
                ? Math.round((agency.matches / agency.transactions) * 100 * 100) / 100 
                : 0;
        });
        
        return Array.from(agencyMap.values()).sort((a, b) => b.transactions - a.transactions);
    }

    // Méthodes pour la pagination et les filtres des agences
    filterAgencies() {
        const allAgencies = this.getAgencyPerformance();
        this.filteredAgencies = allAgencies.filter(agency => 
            agency.name.toLowerCase().includes(this.agencySearchTerm.toLowerCase())
        );
        this.sortAgencies();
    }

    sortAgencies() {
        this.filteredAgencies.sort((a, b) => {
            switch (this.agencySortBy) {
                case 'transactions':
                    return b.transactions - a.transactions;
                case 'volume':
                    return b.volume - a.volume;
                case 'matchRate':
                    return b.matchRate - a.matchRate;
                case 'name':
                    return a.name.localeCompare(b.name);
                default:
                    return b.transactions - a.transactions;
            }
        });
        this.updateAgencyPagination();
    }

    updateAgencyPagination() {
        this.totalAgencyPages = Math.ceil(this.filteredAgencies.length / this.itemsPerPage);
        this.currentAgencyPage = Math.min(this.currentAgencyPage, this.totalAgencyPages || 1);
        
        const startIndex = (this.currentAgencyPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        this.paginatedAgencies = this.filteredAgencies.slice(startIndex, endIndex);
    }

    goToAgencyPage(page: number) {
        if (page >= 1 && page <= this.totalAgencyPages) {
            this.currentAgencyPage = page;
            this.updateAgencyPagination();
        }
    }

    getRateClass(rate: number): string {
        if (rate >= 95) return 'rate-excellent';
        if (rate >= 85) return 'rate-good';
        if (rate >= 70) return 'rate-average';
        return 'rate-poor';
    }

    formatDate(date: Date | string): string {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('fr-FR');
    }

    trackByItem(index: number, item: ReconciliationReportData): any {
        return item.agency + item.service + item.date;
    }

    async exportReport() {
        if (this.filteredData.length === 0) {
            this.popupService.showError('Erreur', 'Aucune donnée à exporter');
            return;
        }

        try {
            // Confirmation avant export
            const confirmed = await this.popupService.showConfirm(
                `Exporter ${this.filteredData.length} ligne(s) vers Excel ?`, 
                'Confirmation d\'export'
            );
            if (!confirmed) return;

            // Générer le nom de fichier avec la période
            const periodSuffix = this.getPeriodSuffix();
            const fileName = `rapport_avance_${periodSuffix}_${new Date().toISOString().slice(0,10)}`;

            // Créer les données pour l'export
            const exportData = this.prepareExportData();
            
            // Exporter avec le service moderne
            this.modernExportService.exportCompleteReport(
                exportData,
                `${fileName}.xlsx`,
                true // Inclure le résumé
            );

            this.popupService.showSuccess('Export réussi', 'Le fichier Excel a été généré avec succès');
        } catch (error) {
            console.error('Erreur export:', error);
            this.popupService.showError('Erreur d\'export', 'Impossible de générer le fichier Excel');
        }
    }

    private getPeriodSuffix(): string {
        switch (this.selectedPeriod) {
            case 'day': return 'aujourd_hui';
            case 'week': return 'cette_semaine';
            case 'month': return 'ce_mois';
            case 'lastMonth': return 'le_mois_dernier';
            case 'year': return 'cette_annee';
            case 'custom': return 'periode_personnalisee';
            default: return 'filtre';
        }
    }

    private prepareExportData(): any[] {
        return this.filteredData.map(item => ({
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
            'Taux de Correspondance': `${item.matchRate.toFixed(2)}%`,
            'Statut': item.status,
            'Commentaire': item.comment,
            'ID GLPI': item.glpiId || ''
        }));
    }

    private getExportColumns(): string[] {
        return [
            'Date', 'Agence', 'Service', 'Pays', 'Transactions', 'Volume', 
            'Correspondances', 'Écarts BO', 'Écarts Partenaire', 'Incohérences', 
            'Taux de Correspondance', 'Statut', 'Commentaire', 'ID GLPI'
        ];
    }

    goBack() {
        this.router.navigate(['/reconciliation-report']);
    }

    toggleReportPreview() {
        this.showPilotReportPreview = !this.showPilotReportPreview;
    }

    private toYearMonth(dateStr: string): string | null {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    private buildPilotReportFilters(): PilotReportFilters {
        // start/end par défaut: borne min/max des données filtrées (si dispo)
        const dates = this.filteredData
            .map(x => x.date)
            .filter(Boolean)
            .map(s => new Date(s))
            .filter(d => !isNaN(d.getTime()))
            .map(d => d.toISOString().slice(0, 10));

        let startYm: string | undefined;
        let endYm: string | undefined;
        if (dates.length > 0) {
            dates.sort();
            startYm = this.toYearMonth(dates[0]) || undefined;
            endYm = this.toYearMonth(dates[dates.length - 1]) || undefined;
        }

        // si période custom, on force startYm/endYm sur la sélection
        if (this.selectedPeriod === 'custom' && this.customStartDate && this.customEndDate) {
            startYm = this.toYearMonth(this.customStartDate) || startYm;
            endYm = this.toYearMonth(this.customEndDate) || endYm;
        }

        const filters: PilotReportFilters = {
            startYm,
            endYm
        };

        // map UI -> API (service)
        if (this.selectedService) {
            filters.service = this.selectedService;
        }
        // country/env: non disponibles dans ce dashboard (on peut les ajouter plus tard)
        return filters;
    }

    generatePilotReport() {
        this.isGeneratingReport = true;
        const filters = this.buildPilotReportFilters();
        this.reconciliationReportService.getPilotReportMarkdown(filters).subscribe({
            next: (md: string) => {
                this.pilotReportMarkdown = md || '';
                this.showPilotReportPreview = true;
                this.popupService.showSuccess('Rapport généré', 'Le rapport Markdown a été généré avec succès');
                this.isGeneratingReport = false;
            },
            error: (err: any) => {
                console.error('Erreur génération rapport:', err);
                this.popupService.showError('Erreur', 'Impossible de générer le rapport');
                this.isGeneratingReport = false;
            }
        });
    }

    downloadPilotReport() {
        if (!this.pilotReportMarkdown) return;
        const filters = this.buildPilotReportFilters();
        const suffix = `${filters.startYm || 'debut'}_${filters.endYm || 'fin'}`;
        const fileName = `rapport_pilote_reconciliation_${suffix}.md`;

        const blob = new Blob([this.pilotReportMarkdown], { type: 'text/markdown;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    async copyPilotReportToClipboard() {
        try {
            if (!this.pilotReportMarkdown) return;
            await navigator.clipboard.writeText(this.pilotReportMarkdown);
            this.popupService.showSuccess('Copié', 'Le rapport a été copié dans le presse-papiers');
        } catch (e) {
            this.popupService.showError('Erreur', 'Copie impossible (droits navigateur)');
        }
    }
}
