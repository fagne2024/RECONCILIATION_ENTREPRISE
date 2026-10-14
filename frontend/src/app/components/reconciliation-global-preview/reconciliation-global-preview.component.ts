import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import ChartDataLabels from 'chartjs-plugin-datalabels';

export interface ReconciliationReportData {
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
    traitement?: string;
}

interface PartnerData {
    partner: string;
    amount: number;
    matches: number;
    discrepancies: number;
    pendingDiscrepancies: number;
    resolvedDiscrepancies: number;
    rate: number;
    status: string;
}

@Component({
    selector: 'app-reconciliation-global-preview',
    templateUrl: './reconciliation-global-preview.component.html',
    styleUrls: ['./reconciliation-global-preview.component.scss']
})
export class ReconciliationGlobalPreviewComponent implements OnInit, OnDestroy {
    @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
    ChartDataLabels = ChartDataLabels;
    
    loading = true;
    error: string | null = null;
    private subscription = new Subscription();
    
    reportData: ReconciliationReportData[] = [];
    filteredReportData: ReconciliationReportData[] = [];
    currentDate = new Date().toLocaleDateString('fr-FR');
    
    // Filtres
    showFilters = true;
    selectedService: string = '';
    selectedCountry: string = '';
    selectedAgency: string = '';
    selectedDateStart: string = '';
    selectedDateEnd: string = '';
    
    // Listes pour les filtres
    uniqueServices: string[] = [];
    uniqueCountries: string[] = [];
    uniqueAgencies: string[] = [];
    
    // KPIs
    totalAmount = 0;
    totalMatches = 0;
    totalDiscrepancies = 0;
    pendingDiscrepancies = 0;
    resolvedDiscrepancies = 0;
    successRate = 0;
    
    // Données pour graphiques
    topPartners: PartnerData[] = [];
    statusData: { name: string; value: number; color: string }[] = [];
    discrepancyData: { partner: string; 'En cours': number; 'Résolus': number }[] = [];
    
    // Configuration des graphiques
    barChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            datalabels: {
                color: '#000000',
                font: { size: 11, weight: 'bold' },
                formatter: (value: number) => value != null ? value.toFixed(1) + 'K' : ''
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        return `${context.parsed.y.toFixed(1)}K CM`;
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#000000',
                    font: { size: 11, weight: 'bold' }
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#000000',
                    font: { size: 11, weight: 'bold' },
                    callback: function(value) {
                        return value + 'K';
                    }
                }
            }
        }
    };
    
    barChartType: ChartType = 'bar';
    barChartData: ChartData<'bar'> = {
        labels: [],
        datasets: [{
            label: 'Montant (K CM)',
            data: [],
            backgroundColor: '#3b82f6',
            borderRadius: 8
        }]
    };
    
    pieChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#000000',
                    font: { size: 12, weight: 'bold' }
                }
            },
            datalabels: {
                color: '#000000',
                font: { size: 12, weight: 'bold' },
                formatter: (value: number, ctx: any) => {
                    const total = (ctx.dataset?.data as number[]).reduce((a, b) => a + b, 0);
                    const pct = total ? ((value / total) * 100).toFixed(1) : '0';
                    return value + ' (' + pct + '%)';
                }
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a: any, b: any) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        }
    };
    
    pieChartType: ChartType = 'pie';
    pieChartData: ChartData<'pie'> = {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: []
        }]
    };
    
    stackedBarChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#000000',
                    font: { size: 12, weight: 'bold' }
                }
            },
            datalabels: {
                color: '#000000',
                font: { size: 10, weight: 'bold' },
                formatter: (value: number) => value != null && value !== 0 ? value : ''
            },
            tooltip: {
                mode: 'index',
                intersect: false
            }
        },
        scales: {
            x: {
                stacked: true,
                ticks: {
                    color: '#000000',
                    font: { size: 11, weight: 'bold' }
                }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                ticks: {
                    color: '#000000',
                    font: { size: 11, weight: 'bold' }
                }
            }
        }
    };
    
    stackedBarChartType: ChartType = 'bar';
    stackedBarChartData: ChartData<'bar'> = {
        labels: [],
        datasets: [
            {
                label: 'En cours',
                data: [],
                backgroundColor: '#f59e0b',
                borderRadius: 8
            },
            {
                label: 'Résolus',
                data: [],
                backgroundColor: '#3b82f6',
                borderRadius: 8
            }
        ]
    };
    
    
    constructor(
        private router: Router,
        private http: HttpClient
    ) {}
    
    ngOnInit() {
        this.loadReportData();
    }
    
    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
    
    private loadReportData() {
        this.loading = true;
        this.error = null;
        
        const headers = new HttpHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Permission-Module': 'Résultats'
        });
        
        // Ne charger qu'une journee (evite GET /api/result8rec sans filtre massif)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ymd = yesterday.toISOString().slice(0, 10);
        const cacheBuster = new Date().getTime();
        const url = `/api/result8rec?startDate=${ymd}&endDate=${ymd}&fields=slim&_t=${cacheBuster}`;
        
        this.subscription.add(
            this.http.get<any[]>(url, { headers }).subscribe({
                next: (rows: any[]) => {
                    if (!Array.isArray(rows) || rows.length === 0) {
                        this.error = 'Aucune donnée disponible';
                        this.loading = false;
                        return;
                    }
                    
                    this.reportData = rows.map(r => ({
                        id: r.id,
                        date: r.date,
                        agency: r.agency,
                        service: r.service,
                        country: r.country,
                        totalTransactions: r.totalTransactions || r.recordCount || 0,
                        totalVolume: r.totalVolume || 0,
                        matches: r.matches || 0,
                        boOnly: Number(r.boOnly || r.bo_only) || 0,
                        partnerOnly: Number(r.partnerOnly || r.partner_only) || 0,
                        mismatches: r.mismatches || 0,
                        matchRate: r.matchRate || 0,
                        status: r.status || '',
                        comment: r.comment || '',
                        traitement: r.traitement
                    }));
                    
                    this.extractUniqueValues();
                    this.applyFilters();
                    this.loading = false;
                },
                error: (error) => {
                    console.error('Erreur lors du chargement des données:', error);
                    this.error = 'Erreur lors du chargement des données';
                    this.loading = false;
                }
            })
        );
    }
    
    private calculateMetrics() {
        // Grouper par service (partenaire) - les agences sont les clients
        const partnerMap = new Map<string, PartnerData>();
        
        // Utiliser les données filtrées
        this.filteredReportData.forEach(item => {
            // Le partenaire est le service, pas l'agence
            const partnerKey = item.service;
            
            if (!partnerMap.has(partnerKey)) {
                partnerMap.set(partnerKey, {
                    partner: partnerKey,
                    amount: 0,
                    matches: 0,
                    discrepancies: 0,
                    pendingDiscrepancies: 0,
                    resolvedDiscrepancies: 0,
                    rate: 0,
                    status: 'OK'
                });
            }
            
            const partner = partnerMap.get(partnerKey)!;
            partner.amount += item.totalVolume;
            partner.matches += item.matches;
            
            const totalDiscrepancies = item.boOnly + item.partnerOnly + item.mismatches;
            partner.discrepancies += totalDiscrepancies;
            
            // Calculer les écarts en cours vs résolus
            if (item.status === 'OK' || item.traitement === 'Terminé') {
                partner.resolvedDiscrepancies += totalDiscrepancies;
            } else {
                partner.pendingDiscrepancies += totalDiscrepancies;
            }
        });
        
        // Calculer les taux et statuts
        partnerMap.forEach(partner => {
            const totalTransactions = partner.matches + partner.discrepancies;
            partner.rate = totalTransactions > 0 ? (partner.matches / totalTransactions) * 100 : 0;
            partner.status = partner.pendingDiscrepancies > 0 ? 'ÉCART' : partner.resolvedDiscrepancies > 0 ? 'ÉCART BO' : 'OK';
        });
        
        // Convertir en array et trier par montant
        this.topPartners = Array.from(partnerMap.values())
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 8);
        
        // Calculer les KPIs globaux
        this.totalAmount = Array.from(partnerMap.values()).reduce((sum, p) => sum + p.amount, 0);
        this.totalMatches = Array.from(partnerMap.values()).reduce((sum, p) => sum + p.matches, 0);
        this.totalDiscrepancies = Array.from(partnerMap.values()).reduce((sum, p) => sum + p.discrepancies, 0);
        
        // Écarts en cours : toutes les lignes avec écarts (boOnly + partnerOnly + mismatches > 0) ET dont le statut n'est PAS 'OK'
        this.pendingDiscrepancies = this.filteredReportData
            .filter(item => {
                const totalEcarts = item.boOnly + item.partnerOnly + item.mismatches;
                return totalEcarts > 0 && item.status !== 'OK';
            })
            .reduce((sum, item) => sum + item.boOnly + item.partnerOnly + item.mismatches, 0);
        
        // Écarts résolus : tous les écarts extraits des commentaires ET dont le statut est 'OK'
        this.resolvedDiscrepancies = this.filteredReportData
            .filter(item => item.status === 'OK')
            .reduce((sum, item) => {
                const discrepancies = this.extractDiscrepanciesFromComment(item.comment);
                return sum + discrepancies.boCount + discrepancies.partnerCount;
            }, 0);
        
        // Taux de réussite basé sur les correspondances (matches) / total transactions
        const totalTransactions = this.totalMatches + this.totalDiscrepancies;
        this.successRate = totalTransactions > 0 ? (this.totalMatches / totalTransactions) * 100 : 0;
    }
    
    private extractUniqueValues() {
        // Extraire les valeurs uniques pour les filtres
        this.uniqueServices = [...new Set(this.reportData.map(item => item.service))].sort();
        this.uniqueCountries = [...new Set(this.reportData.map(item => item.country))].sort();
        this.uniqueAgencies = [...new Set(this.reportData.map(item => item.agency))].sort();
    }
    
    onFilterChange() {
        this.applyFilters();
    }
    
    resetFilters() {
        this.selectedService = '';
        this.selectedCountry = '';
        this.selectedAgency = '';
        this.selectedDateStart = '';
        this.selectedDateEnd = '';
        this.applyFilters();
    }
    
    private applyFilters() {
        this.filteredReportData = this.reportData.filter(item => {
            // Filtre par service
            if (this.selectedService && !item.service.toLowerCase().includes(this.selectedService.toLowerCase())) {
                return false;
            }
            
            // Filtre par pays
            if (this.selectedCountry && !item.country?.toLowerCase().includes(this.selectedCountry.toLowerCase())) {
                return false;
            }
            
            // Filtre par agence
            if (this.selectedAgency && !item.agency.toLowerCase().includes(this.selectedAgency.toLowerCase())) {
                return false;
            }
            
            // Filtre par date de début
            if (this.selectedDateStart) {
                const itemDate = new Date(item.date);
                const startDate = new Date(this.selectedDateStart);
                if (itemDate < startDate) {
                    return false;
                }
            }
            
            // Filtre par date de fin
            if (this.selectedDateEnd) {
                const itemDate = new Date(item.date);
                const endDate = new Date(this.selectedDateEnd);
                endDate.setHours(23, 59, 59, 999); // Inclure toute la journée
                if (itemDate > endDate) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Recalculer les métriques avec les données filtrées
        this.calculateMetrics();
        this.prepareChartData();
    }
    
    private prepareChartData() {
        // Graphique en barres - Top partenaires
        this.barChartData = {
            labels: this.topPartners.map(p => p.partner),
            datasets: [{
                label: 'Montant (K CM)',
                data: this.topPartners.map(p => p.amount / 1000),
                backgroundColor: '#3b82f6',
                borderRadius: 8
            }]
        };
        
        // Graphique en secteurs - Statut basé sur les correspondances
        // OK = correspondances (matches)
        // Écarts en cours = écarts non résolus
        // Écarts résolus = écarts résolus
        this.statusData = [
            { name: 'OK', value: this.totalMatches, color: '#10b981' },
            { name: 'Écarts en cours', value: this.pendingDiscrepancies, color: '#f59e0b' },
            { name: 'Écarts résolus', value: this.resolvedDiscrepancies, color: '#3b82f6' }
        ];
        
        this.pieChartData = {
            labels: this.statusData.map(d => d.name),
            datasets: [{
                data: this.statusData.map(d => d.value),
                backgroundColor: this.statusData.map(d => d.color)
            }]
        };
        
        // Graphique en barres empilées - Écarts par partenaire (service)
        // Grouper par service (partenaire), pas par agence (client)
        const groupedDiscrepancies = new Map<string, { 'En cours': number; 'Résolus': number }>();
        
        // Utiliser les données filtrées
        this.filteredReportData.forEach(item => {
            const partnerKey = item.service; // Le partenaire est le service
            
            if (!groupedDiscrepancies.has(partnerKey)) {
                groupedDiscrepancies.set(partnerKey, { 'En cours': 0, 'Résolus': 0 });
            }
            
            const group = groupedDiscrepancies.get(partnerKey)!;
            
            // Pour les écarts résolus : extraire depuis les commentaires avec statut OK
            if (item.status === 'OK') {
                const discrepancies = this.extractDiscrepanciesFromComment(item.comment);
                const totalEcartsResolus = (discrepancies.boCount || 0) + (discrepancies.partnerCount || 0);
                group['Résolus'] += totalEcartsResolus;
            } else {
                // Pour les écarts en cours : utiliser les valeurs réelles des écarts
                const totalEcarts = item.boOnly + item.partnerOnly + item.mismatches;
                if (totalEcarts > 0) {
                    group['En cours'] += totalEcarts;
                }
            }
        });
        
        const groupedArray = Array.from(groupedDiscrepancies.entries());
        
        this.stackedBarChartData = {
            labels: groupedArray.map(([partner]) => partner),
            datasets: [
                {
                    label: 'En cours',
                    data: groupedArray.map(([, data]) => data['En cours']),
                    backgroundColor: '#f59e0b',
                    borderRadius: 8
                },
                {
                    label: 'Résolus',
                    data: groupedArray.map(([, data]) => data['Résolus']),
                    backgroundColor: '#3b82f6',
                    borderRadius: 8
                }
            ]
        };
        
        // Mettre à jour les graphiques
        if (this.chart) {
            this.chart.update();
        }
    }
    
    goBack() {
        this.router.navigate(['/reconciliation-dashboard']);
    }
    
    formatAmount(amount: number): string {
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(2).replace('.', ',') + 'M';
        }
        return (amount / 1000).toFixed(1).replace('.', ',') + 'K';
    }
    
    formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace('.', ',') + ' millions';
        }
        return num.toLocaleString('fr-FR');
    }
    
    getPercentage(value: number): string {
        const total = this.statusData.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return '0.0';
        return ((value / total) * 100).toFixed(1);
    }
    
    /**
     * Extrait les écarts (BO et Partenaire) depuis les commentaires
     */
    private extractDiscrepanciesFromComment(comment?: string): { boCount: number; partnerCount: number } {
        if (!comment || !comment.trim()) {
            return { boCount: 0, partnerCount: 0 };
        }

        // Normaliser le commentaire pour gérer les accents et variations
        const normalized = comment.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        
        // Patterns pour extraire les écarts BO (plusieurs variantes possibles)
        const boPatterns = [
            /(\d+)\s*ecart\(s\)\s*bo/i,           // "X écart(s) BO"
            /(\d+)\s*ecart\(s\)\s*back\s*office/i, // "X écart(s) Back Office"
            /(\d+)\s*ecarts?\s*bo/i,              // "X écart(s) bo" (sans parenthèses)
            /bo[:\s]+(\d+)\s*ecart\(s\)/i,        // "BO: X écart(s)"
        ];
        
        // Patterns pour extraire les écarts Partenaire (plusieurs variantes possibles)
        const partnerPatterns = [
            /(\d+)\s*ecart\(s\)\s*partenaire/i,   // "X écart(s) Partenaire"
            /(\d+)\s*ecarts?\s*partenaire/i,      // "X écart(s) partenaire" (sans parenthèses)
            /partenaire[:\s]+(\d+)\s*ecart\(s\)/i, // "Partenaire: X écart(s)"
            /part[.:\s]+(\d+)\s*ecart\(s\)/i,     // "Part.: X écart(s)"
        ];

        let boCount = 0;
        let partnerCount = 0;

        // Chercher les écarts BO avec tous les patterns
        for (const pattern of boPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                boCount = Math.max(boCount, parseInt(match[1], 10) || 0);
            }
        }

        // Chercher les écarts Partenaire avec tous les patterns
        for (const pattern of partnerPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                partnerCount = Math.max(partnerCount, parseInt(match[1], 10) || 0);
            }
        }

        return { boCount, partnerCount };
    }
}
