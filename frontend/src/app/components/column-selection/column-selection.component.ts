import { Component, Input, Output, EventEmitter, OnDestroy, OnChanges, SimpleChanges, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ColumnComparison } from '../../models/column-comparison.model';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import { KeySuggestionService, KeySuggestion, KeyAnalysisResult } from '../../services/key-suggestion.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { PopupService } from '../../services/popup.service';
import { Subscription } from 'rxjs';
import { ReconciliationRequest } from '../../models/reconciliation-request.model';

@Component({
    selector: 'app-column-selection',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="column-selection-container">
            <h2>📊 Sélection des colonnes</h2>
            <p class="description">Sélectionnez les colonnes clés pour la réconciliation</p>

            <!-- Option pour désactiver l'analyse automatique (seulement en mode assisté) -->
            <div class="section analysis-options-section" *ngIf="!disableAutoAnalysis">
                <h3>⚙️ Options d'analyse</h3>
                <div class="analysis-toggle">
                    <label class="toggle-label">
                        <input type="checkbox" class="ds-checkbox"
                               [(ngModel)]="disableAutoAnalysis" 
                               (ngModelChange)="onAnalysisToggleChange($event)">
                        <span class="toggle-text">Désactiver l'analyse automatique des clés</span>
                    </label>
                    <p class="toggle-description">
                        Si activé, vous devrez sélectionner manuellement toutes les colonnes sans suggestions automatiques
                    </p>
                </div>
            </div>

            <!-- Message pour le mode manuel -->
            <div class="section manual-mode-section" *ngIf="disableAutoAnalysis">
                <h3>🖐️ Mode Manuel</h3>
                <p class="manual-mode-description">
                    Vous êtes en mode manuel. Sélectionnez manuellement les colonnes clés sans analyse automatique.
                </p>
            </div>

            <!-- Suggestions automatiques -->
            <div class="section suggestions-section" *ngIf="showSuggestions && !disableAutoAnalysis">
                <h3>🤖 Suggestions Automatiques</h3>
                <p class="section-description">Le système a analysé vos données et suggère les meilleures clés de réconciliation</p>
                
                <div class="confidence-indicator">
                    <div class="confidence-bar">
                        <div class="confidence-fill" [style.width.%]="overallConfidence * 100"></div>
                    </div>
                    <span class="confidence-text">Confiance globale: {{ (overallConfidence * 100) | number:'1.0-0' }}%</span>
                </div>

                <div class="suggestions-list">
                    <div class="suggestion-item" *ngFor="let suggestion of keySuggestions; let i = index">
                        <div class="suggestion-header">
                            <span class="suggestion-rank">#{{ i + 1 }}</span>
                            <span class="suggestion-confidence">{{ (suggestion.confidence * 100) | number:'1.0-0' }}%</span>
                        </div>
                        <div class="suggestion-pair">
                            <span class="bo-column">{{ suggestion.boColumn }}</span>
                            <span class="arrow">↔</span>
                            <span class="partner-column">{{ suggestion.partnerColumn }}</span>
                        </div>
                        <div class="suggestion-reason">{{ suggestion.reason }}</div>
                        <div class="suggestion-samples" *ngIf="suggestion.sampleValues.length > 0">
                            <small>Exemples: {{ suggestion.sampleValues.join(', ') }}</small>
                        </div>
                    </div>
                </div>

                <div class="auto-apply-section">
                    <button type="button" class="auto-apply-btn ds-btn ds-btn--primary" (click)="applyTopSuggestions()" 
                            [disabled]="keySuggestions.length === 0">
                        ✅ Appliquer les suggestions automatiquement
                    </button>
                    <p class="auto-apply-note">Les meilleures suggestions seront appliquées automatiquement</p>
                </div>
            </div>

            <!-- Indicateur d'analyse -->
            <div class="section" *ngIf="isAnalyzing">
                <div class="analyzing-indicator">
                    <div class="spinner"></div>
                    <p>🔍 Analyse des données en cours...</p>
                </div>
            </div>

            <!-- Colonnes clés -->
            <div class="section">
                <h3>🔑 Colonnes clés</h3>
                <p class="section-description">Sélectionnez les colonnes qui serviront à identifier les enregistrements correspondants</p>
                
                <div class="key-columns">
                    <div class="column-group">
                        <label>Colonne clé BO</label>
                        <select class="ds-select"
                            [(ngModel)]="selectedBoKeyColumn"
                            (ngModelChange)="onBoKeyColumnChange($event)">
                            <option value="">Sélectionnez une colonne</option>
                            <option *ngFor="let column of boColumns" [ngValue]="column">
                                {{column}}
                            </option>
                        </select>
                    </div>

                    <div class="column-group">
                        <label>Colonne clé Partenaire</label>
                        <select class="ds-select"
                            [(ngModel)]="selectedPartnerKeyColumn"
                            (ngModelChange)="onPartnerKeyColumnChange($event)">
                            <option value="">Sélectionnez une colonne</option>
                            <option *ngFor="let column of partnerColumns" [ngValue]="column">
                                {{column}}
                            </option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Clés supplémentaires -->
            <div class="section" *ngIf="additionalKeys.length > 0">
                <h3>🔑 Clés supplémentaires (optionnel)</h3>
                <p class="section-description">Ajoutez des clés supplémentaires pour une réconciliation plus précise</p>
                
                <div class="additional-keys">
                    <div class="additional-key-pair" *ngFor="let keyPair of additionalKeys; let i = index">
                        <div class="key-columns-wrapper">
                            <div class="column-group">
                                <label>Colonne clé BO</label>
                                <select class="ds-select"
                                    [(ngModel)]="keyPair.boColumn"
                                    (ngModelChange)="onAdditionalBoKeyChange($event, i)">
                                    <option value="">Sélectionnez une colonne</option>
                                    <option *ngFor="let column of boColumns" [ngValue]="column">
                                        {{column}}
                                    </option>
                                </select>
                            </div>

                            <div class="column-group">
                                <label>Colonne clé Partenaire</label>
                                <select class="ds-select"
                                    [(ngModel)]="keyPair.partnerColumn"
                                    (ngModelChange)="onAdditionalPartnerKeyChange($event, i)">
                                    <option value="">Sélectionnez une colonne</option>
                                    <option *ngFor="let column of partnerColumns" [ngValue]="column">
                                        {{column}}
                                    </option>
                                </select>
                            </div>
                        </div>
                        
                        <button type="button" class="remove-key-btn ds-btn ds-btn--ghost ds-btn--sm" (click)="removeAdditionalKey(i)" title="Supprimer cette clé">
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>

                <button type="button" class="add-btn ds-btn ds-btn--secondary ds-btn--sm" (click)="addAdditionalKey()">
                    ➕ Ajouter une clé supplémentaire
                </button>
            </div>
            
            <!-- Bouton pour ajouter la première clé supplémentaire -->
            <div class="section" *ngIf="additionalKeys.length === 0">
                <h3>🔑 Clés supplémentaires (optionnel)</h3>
                <p class="section-description">Ajoutez des clés supplémentaires pour une réconciliation plus précise</p>
                <button type="button" class="add-btn ds-btn ds-btn--secondary ds-btn--sm" (click)="addAdditionalKey()">
                    ➕ Ajouter une clé supplémentaire
                </button>
            </div>

            <!-- Barre de progression -->
            <div class="reconciliation-progress" *ngIf="isReconciliationInProgress">
                <div class="progress-card">
                    <div class="progress-header">
                        <h3>🔄 Réconciliation en cours...</h3>
                        <span class="progress-percentage">{{ reconciliationProgress }}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" [style.width.%]="reconciliationProgress"></div>
                    </div>
                    <div class="progress-status">
                        <span class="status-text">{{ reconciliationStatus }}</span>
                        <span class="status-time" *ngIf="reconciliationStartTime">
                            Temps écoulé : {{ getElapsedTime() }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Bouton de validation -->
            <div class="validation-section">
                <button type="button" 
                    class="validate-btn ds-btn ds-btn--primary" 
                    [disabled]="!isValid"
                    [class.processing]="isReconciliationActive()"
                    (click)="proceedWithReconciliation()">
                    <span *ngIf="!isReconciliationActive()">🚀 Lancer la réconciliation</span>
                    <span *ngIf="isReconciliationActive()">⏳ Réconciliation en cours — voir la progression</span>
                </button>
            </div>
        </div>
    `,
    styles: [`
        .column-selection-container {
            padding: 20px;
        }

        h2 {
            color: var(--color-info-solid);
            margin-bottom: 10px;
        }

        .description {
            color: var(--color-text-muted);
            margin-bottom: 30px;
        }

        .section {
            background: var(--color-surface-sunken);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }

        h3 {
            color: var(--color-accent-hover);
            margin-bottom: 10px;
        }

        .section-description {
            color: var(--color-text-muted);
            margin-bottom: 20px;
            font-size: 0.9em;
        }

        .key-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .column-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        label {
            color: var(--color-text-primary);
            font-weight: 500;
        }

        select {
            padding: 10px;
            border: 1px solid var(--color-border);
            border-radius: 4px;
            background: var(--color-surface);
            font-size: 1em;
        }

        .comparison-columns {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
        }

        .comparison-row {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 15px;
            align-items: end;
        }

        .remove-btn {
            background: none;
            border: none;
            color: var(--color-error);
            font-size: 1.2em;
            cursor: pointer;
            padding: 10px;
            line-height: 1;
        }

        .add-btn {
            background: var(--color-info-bg);
            border: 1px solid var(--color-info-solid);
            color: var(--color-info-solid);
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
            transition: all 0.3s ease;
        }

        .add-btn:hover {
            background: var(--color-info-solid);
            color: var(--color-accent-contrast);
        }

        /* Styles pour les clés supplémentaires */
        .additional-keys {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin-bottom: 20px;
        }

        .additional-key-pair {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 15px;
            background: var(--color-surface);
            border-radius: 8px;
            border: 1px solid var(--color-border);
        }

        .key-columns-wrapper {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .remove-key-btn {
            background: var(--color-surface)3f3;
            border: 1px solid var(--color-error);
            color: var(--color-error);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            transition: all 0.3s ease;
            align-self: flex-start;
        }

        .remove-key-btn:hover {
            background: var(--color-error);
            color: var(--color-accent-contrast);
        }

        /* Styles pour les suggestions automatiques */
        .suggestions-section {
            background: linear-gradient(135deg, var(--color-info-bg) 0%, var(--color-duplicate-bg) 100%);
            border: 2px solid var(--color-info-solid);
        }

        .confidence-indicator {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: var(--color-surface);
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .confidence-bar {
            flex: 1;
            height: 20px;
            background: var(--color-border);
            border-radius: 10px;
            overflow: hidden;
        }

        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--color-success-solid), var(--color-success-solid));
            transition: width 0.5s ease;
        }

        .confidence-text {
            font-weight: bold;
            color: var(--color-accent-hover);
            min-width: 150px;
        }

        .suggestions-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
        }

        .suggestion-item {
            background: var(--color-surface);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid var(--color-info-solid);
        }

        .suggestion-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .suggestion-rank {
            background: var(--color-info-solid);
            color: var(--color-accent-contrast);
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
        }

        .suggestion-confidence {
            font-weight: bold;
            color: var(--color-info-solid);
            font-size: 14px;
            margin-left: 10px;
        }

        .confidence-display {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .confidence-bar-small {
            width: 60px;
            height: 8px;
            background: var(--color-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .confidence-fill-small {
            height: 100%;
            background: linear-gradient(90deg, var(--color-error-solid), var(--color-warning-solid), var(--color-success-solid));
            border-radius: 4px;
            transition: width 0.3s ease;
        }

        .suggestion-transformation {
            margin: 8px 0;
        }

        .transformation-badge {
            background: linear-gradient(135deg, var(--color-warning-solid), var(--color-error-solid));
            color: var(--color-accent-contrast);
            padding: 6px 12px;
            border-radius: 15px;
            font-size: 0.85em;
            font-weight: 500;
            display: inline-block;
            box-shadow: 0 2px 4px rgba(255, 152, 0, 0.3);
        }

        .suggestion-pair {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
            font-weight: 500;
        }

        .bo-column {
            background: var(--color-info-bg);
            padding: 4px 8px;
            border-radius: 4px;
            color: var(--color-accent-hover);
        }

        .arrow {
            color: var(--color-text-muted);
            font-size: 1.2em;
        }

        .partner-column {
            background: var(--color-duplicate-bg);
            padding: 4px 8px;
            border-radius: 4px;
            color: var(--color-duplicate);
        }

        .suggestion-reason {
            color: var(--color-text-muted);
            font-size: 0.9em;
            margin-bottom: 5px;
        }

        .suggestion-samples {
            color: var(--color-text-muted);
            font-size: 0.8em;
        }

        .auto-apply-section {
            text-align: center;
            padding: 20px;
            background: var(--color-surface);
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .auto-apply-btn {
            background: linear-gradient(135deg, var(--color-success-solid), var(--color-success-solid));
            color: var(--color-accent-contrast);
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 1em;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 10px;
        }

        .auto-apply-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }

        .auto-apply-btn:disabled {
            background: var(--color-border-emphasis);
            cursor: not-allowed;
        }

        .auto-apply-note {
            color: var(--color-text-muted);
            font-size: 0.9em;
        }

        .analyzing-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            padding: 30px;
            background: var(--color-surface);
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .spinner {
            width: 30px;
            height: 30px;
            border: 3px solid var(--color-border);
            border-top: 3px solid var(--color-info-solid);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .validation-section {
            text-align: center;
            margin-top: 30px;
        }

        .validate-btn {
            background: linear-gradient(45deg, var(--color-info-solid), var(--color-accent-hover));
            color: var(--color-accent-contrast);
            border: none;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 1.1em;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .validate-btn:disabled {
            background: var(--color-border-emphasis);
            cursor: not-allowed;
        }

        .validate-btn:not(:disabled):hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(33, 150, 243, 0.3);
        }

        .validate-btn.processing {
            opacity: 0.7;
            cursor: progress;
        }

        .reconciliation-progress {
            margin: 20px 0;
        }

        .progress-card {
            background: linear-gradient(135deg, var(--color-success-bg) 0%, var(--color-success-bg) 100%);
            border: 2px solid var(--color-success);
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.15);
        }

        .progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .progress-percentage {
            font-weight: bold;
            font-size: 1.4em;
            color: #1b5e20;
        }

        .progress-bar {
            width: 100%;
            height: 20px;
            background: var(--color-border);
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 12px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--color-success), var(--color-success-solid));
            border-radius: 10px;
            transition: width 0.3s ease;
        }

        .progress-status {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.95em;
            color: #2e7d32;
        }

        .status-text {
            font-weight: 500;
        }

        .status-time {
            font-style: italic;
        }

        /* Styles pour les options d'analyse */
        .analysis-options-section {
            background: linear-gradient(135deg, var(--color-surface-sunken) 0%, var(--color-border) 100%);
            border: 2px solid var(--color-text-muted);
        }

        .analysis-toggle {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .toggle-label {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            font-weight: 500;
            color: var(--color-text-muted);
        }

        .toggle-label input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .toggle-text {
            font-size: 1em;
            color: var(--color-text-muted);
        }

        .toggle-description {
            color: var(--color-text-muted);
            font-size: 0.9em;
            margin: 0;
            padding-left: 28px;
        }

        /* Styles pour le mode manuel */
        .manual-mode-section {
            background: linear-gradient(135deg, var(--color-surface)3cd 0%, var(--color-warning-bg) 100%);
            border: 2px solid var(--color-warning-solid);
        }

        .manual-mode-description {
            color: var(--color-warning-text);
            font-size: 1em;
            margin: 0;
            padding: 15px;
            background: rgba(255, 255, 255, 0.7);
            border-radius: 6px;
            border-left: 4px solid var(--color-warning-solid);
        }
    `]
})
export class ColumnSelectionComponent implements OnDestroy, OnChanges, OnInit {
    @Input() boData: Record<string, string>[] = [];
    @Input() partnerData: Record<string, string>[] = [];
    @Input() disableAutoAnalysis: boolean = false; // Nouvelle propriété pour désactiver l'analyse automatique
    @Output() selectionComplete = new EventEmitter<{
        boKeyColumn: string;
        partnerKeyColumn: string;
        comparisonColumns: { boColumn: string, partnerColumn: string }[];
        additionalKeys: { boColumn: string, partnerColumn: string }[];
    }>();

    boColumns: string[] = [];
    partnerColumns: string[] = [];
    selectedBoKeyColumn: string = '';
    selectedPartnerKeyColumn: string = '';

    additionalKeys: { boColumn: string, partnerColumn: string }[] = [];
    comparisonColumns: { boColumn: string, partnerColumn: string }[] = [];
    isValid: boolean = false;
    private subscription: Subscription = new Subscription();

    // Variables pour la réconciliation
    isReconciliationInProgress: boolean = false;
    reconciliationProgress: number = 0;
    reconciliationStatus: string = '';
    reconciliationStartTime: number | null = null;

    // Optimisations pour gros volumes de données
    private compressedBoData: any[] = [];
    private compressedPartnerData: any[] = [];
    private dataLoaded = false;
    private loadingInProgress = false;
    private readonly CHUNK_SIZE = 1000; // Traiter par chunks de 1000 lignes
    private readonly SAMPLE_SIZE = 1000; // Échantillon pour l'analyse des clés

    // Propriétés pour les suggestions de clés
    keySuggestions: KeySuggestion[] = [];
    overallConfidence = 0;
    recommendedKeys: string[] = [];
    showSuggestions = false;
    isAnalyzing = false;

    constructor(
        private reconciliationService: ReconciliationService,
        private appStateService: AppStateService,
        private keySuggestionService: KeySuggestionService,
        private router: Router,
        private cdr: ChangeDetectorRef,
        private popupService: PopupService,
        private calculService: ConfigurationCalculService
    ) {}

    ngOnChanges(changes: SimpleChanges) {
        if (changes['boData'] || changes['partnerData']) {
            this.initializeColumns();
        }
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    ngOnInit() {
        this.calculService.loadRules().subscribe();
        // Détecter automatiquement le mode manuel depuis l'URL
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        
        // Si on est en mode manuel (pas de paramètre mode ou mode = 'manual'), désactiver l'analyse automatique
        if (!mode || mode === 'manual') {
            this.disableAutoAnalysis = true;
        } else {
            this.disableAutoAnalysis = false;
        }
        
        // Suivre la progression temps réel de la réconciliation
        this.subscription.add(
            this.reconciliationService.progress$.subscribe(progress => {
                if (!progress) {
                    return;
                }

                this.reconciliationProgress = Math.round(progress.percentage || 0);

                if (progress.step) {
                    this.reconciliationStatus = progress.step;
                }

                this.cdr.detectChanges();
            })
        );

        if (this.reconciliationService.isReconciliationRunning()) {
            this.isReconciliationInProgress = true;
            this.appStateService.setReconciliationProgress(true);
        }

        this.loadDataFromService();
    }

    /**
     * Charge les données depuis le service avec optimisation
     */
    private loadDataFromService(): void {
        
        // Récupérer les données directement depuis le service
        this.boData = this.appStateService.getBoData();
        this.partnerData = this.appStateService.getPartnerData();
        
        
        // Permettre de charger les colonnes même si un seul fichier est disponible
        if ((this.boData?.length > 0 || this.partnerData?.length > 0)) {
            if (this.boData?.length > 0 && this.partnerData?.length > 0) {
                this.optimizeAndLoadData(this.boData, this.partnerData);
            } else {
                // Charger au moins les colonnes disponibles même si un fichier manque
                this.loadAvailableColumns();
            }
        } else {
            this.tryAutoParseFiles();
        }
    }
    
    /**
     * Charge les colonnes disponibles même si un seul fichier est disponible
     */
    private loadAvailableColumns(): void {
        
        // Extraire les colonnes disponibles
        if (this.boData?.length > 0) {
            this.boColumns = Object.keys(this.boData[0]);
        } else {
            this.boColumns = [];
        }
        
        if (this.partnerData?.length > 0) {
            this.partnerColumns = Object.keys(this.partnerData[0]);
        } else {
            this.partnerColumns = [];
        }
        
        // Si on a au moins un fichier avec des colonnes, on peut continuer
        if (this.boColumns.length > 0 || this.partnerColumns.length > 0) {
            // Ne pas lancer l'analyse automatique si les deux fichiers ne sont pas disponibles
            if (this.boData?.length === 0 || this.partnerData?.length === 0) {
                this.disableAutoAnalysis = true;
            }
        } else {
            this.router.navigate(['/upload']);
        }
    }

    /**
     * Tente de parser automatiquement les fichiers uploadés
     */
    private async tryAutoParseFiles(): Promise<void> {
        
        // Récupérer les fichiers uploadés
        const uploadedFiles = this.appStateService.getUploadedFiles();
        
        if (!uploadedFiles.boFile || !uploadedFiles.partnerFile) {
            this.router.navigate(['/upload']);
            return;
        }
        
        try {
            
            // Parser les fichiers CSV
            const boData = await this.parseCsvFile(uploadedFiles.boFile);
            const partnerData = await this.parseCsvFile(uploadedFiles.partnerFile);
            
            // Sauvegarder les données parsées dans le service
            this.appStateService.setBoData(boData);
            this.appStateService.setPartnerData(partnerData);
            
            
            // Charger les données parsées
            this.boData = boData;
            this.partnerData = partnerData;
            this.optimizeAndLoadData(boData, partnerData);
            
        } catch (error) {
            this.router.navigate(['/upload']);
        }
    }

    /**
     * Parse un fichier CSV
     */
    private parseCsvFile(file: File): Promise<Record<string, string>[]> {
        return new Promise((resolve, reject) => {
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    
                    const lines = content.split('\n');
                    
                    if (lines.length < 2) {
                        reject(new Error('Fichier CSV invalide: au moins 2 lignes requises (en-tête + données)'));
                        return;
                    }
                    
                    // Détecter le séparateur (virgule ou point-virgule)
                    const firstLine = lines[0];
                    const commaCount = (firstLine.match(/,/g) || []).length;
                    const semicolonCount = (firstLine.match(/;/g) || []).length;
                    const separator = semicolonCount > commaCount ? ';' : ',';
                    
                    
                    // Parser l'en-tête
                    const headers = lines[0].split(separator).map(h => h.trim());
                    
                    const data: Record<string, string>[] = [];
                    
                    // Parser les données (limitées à 10000 lignes pour l'analyse des clés)
                    const maxLines = Math.min(lines.length - 1, 10000);
                    
                    for (let i = 1; i <= maxLines; i++) {
                        if (lines[i].trim().length === 0) continue;
                        
                        const values = lines[i].split(separator).map(v => v.trim());
                        const row: Record<string, string> = {};
                        
                        for (let j = 0; j < Math.min(headers.length, values.length); j++) {
                            row[headers[j]] = values[j];
                        }
                        
                        data.push(row);
                    }
                    
                    if (data.length > 0) {
                    }
                    resolve(data);
                    
                } catch (error) {
                    reject(new Error(`Erreur lors du parsing du fichier ${file.name}: ${error}`));
                }
            };
            
            reader.onerror = (error) => {
                reject(new Error(`Erreur lors de la lecture du fichier ${file.name}`));
            };
            
            reader.readAsText(file, 'UTF-8');
        });
    }

    /**
     * Optimise et charge les données par chunks
     */
    private optimizeAndLoadData(boData: any[], partnerData: any[]): void {
        if (this.loadingInProgress) return;
        
        this.loadingInProgress = true;
        
        // Traiter les données par chunks pour éviter le blocage
        setTimeout(() => {
            this.processDataInChunks(boData, partnerData);
        }, 10);
    }

    /**
     * Traite les données par chunks
     */
    private processDataInChunks(boData: any[], partnerData: any[]): void {
        const totalBoRows = boData.length;
        const totalPartnerRows = partnerData.length;
        
        
        // Utiliser un échantillon pour l'initialisation rapide
        const boSample = this.getDataSample(boData, this.SAMPLE_SIZE);
        const partnerSample = this.getDataSample(partnerData, this.SAMPLE_SIZE);
        
        // Initialiser les colonnes avec l'échantillon
        this.initializeColumnsWithSample(boSample, partnerSample);
        
        // Traiter le reste des données en arrière-plan
        this.processRemainingData(boData, partnerData);
    }

    /**
     * Obtient un échantillon des données
     */
    private getDataSample(data: any[], sampleSize: number): any[] {
        if (data.length <= sampleSize) return data;
        
        const step = Math.floor(data.length / sampleSize);
        const sample: any[] = [];
        
        for (let i = 0; i < sampleSize; i++) {
            sample.push(data[i * step]);
        }
        
        return sample;
    }

    /**
     * Initialise les colonnes avec un échantillon
     */
    private initializeColumnsWithSample(boSample: any[], partnerSample: any[]): void {
        
        if (boSample.length > 0) {
            this.boColumns = Object.keys(boSample[0]);
        }
        
        if (partnerSample.length > 0) {
            this.partnerColumns = Object.keys(partnerSample[0]);
        }
        
        this.dataLoaded = true;
        this.loadingInProgress = false;
        
        // Analyser et suggérer les clés automatiquement (seulement si pas désactivée)
        this.launchKeyAnalysis();
        
        this.cdr.detectChanges();
    }

    /**
     * Analyse les données et suggère les meilleures clés
     */
    private analyzeAndSuggestKeys(): void {
        if (!this.boData || !this.partnerData || this.boData.length === 0 || this.partnerData.length === 0) {
            return;
        }

        this.isAnalyzing = true;
        this.showSuggestions = false;
        
        // Utiliser un timeout pour éviter de bloquer l'interface
        setTimeout(() => {
            try {
                // Vérifications supplémentaires
                if (!Array.isArray(this.boData) || !Array.isArray(this.partnerData)) {
                    throw new Error('Les données ne sont pas des tableaux valides');
                }
                
                if (this.boData.length === 0 || this.partnerData.length === 0) {
                    throw new Error('Les données sont vides');
                }
                
                // Vérifier que les premières lignes ont des propriétés
                if (!this.boData[0] || typeof this.boData[0] !== 'object') {
                    throw new Error('La première ligne BO n\'est pas un objet valide');
                }
                
                if (!this.partnerData[0] || typeof this.partnerData[0] !== 'object') {
                    throw new Error('La première ligne Partner n\'est pas un objet valide');
                }
                
                const result = this.keySuggestionService.analyzeAndSuggestKeys(this.boData, this.partnerData);
                
                this.keySuggestions = result.suggestions;
                this.overallConfidence = result.overallConfidence;
                this.recommendedKeys = result.recommendedKeys;
                this.showSuggestions = true;
                
                
                // Appliquer automatiquement les meilleures suggestions
                this.applyTopSuggestions();
                
            } catch (error) {
                this.showSuggestions = false;
                this.keySuggestions = [];
                this.overallConfidence = 0;
            } finally {
                this.isAnalyzing = false;
                this.cdr.detectChanges();
            }
        }, 100);
    }

    /**
     * Gère le changement de l'option d'analyse automatique
     */
    onAnalysisToggleChange(disabled: boolean): void {
        
        if (disabled) {
            // Désactiver les suggestions automatiques
            this.showSuggestions = false;
            this.keySuggestions = [];
            this.overallConfidence = 0;
        } else {
            // Relancer l'analyse automatique
            this.launchKeyAnalysis();
        }
        
        this.cdr.detectChanges();
    }

    /**
     * Lance l'analyse automatique des clés (seulement si pas désactivée)
     */
    private launchKeyAnalysis(): void {
        // Vérifier si l'analyse automatique est désactivée
        if (this.disableAutoAnalysis) {
            this.showSuggestions = false;
            this.isAnalyzing = false;
            return;
        }

        this.isAnalyzing = true;
        this.cdr.detectChanges();

        // Délai pour permettre l'affichage de l'indicateur de chargement
        setTimeout(() => {
            try {
                // Vérifications de sécurité
                if (!this.boData || this.boData.length === 0) {
                    throw new Error('Données BO manquantes ou vides');
                }
                
                if (!this.partnerData || this.partnerData.length === 0) {
                    throw new Error('Données Partner manquantes ou vides');
                }
                
                // Vérifier que les premières lignes ont des propriétés
                if (!this.boData[0] || typeof this.boData[0] !== 'object') {
                    throw new Error('La première ligne BO n\'est pas un objet valide');
                }
                
                if (!this.partnerData[0] || typeof this.partnerData[0] !== 'object') {
                    throw new Error('La première ligne Partner n\'est pas un objet valide');
                }
                
                const result = this.keySuggestionService.analyzeAndSuggestKeys(this.boData, this.partnerData);
                
                this.keySuggestions = result.suggestions;
                this.overallConfidence = result.overallConfidence;
                this.recommendedKeys = result.recommendedKeys;
                this.showSuggestions = true;
                
                
                // Appliquer automatiquement les meilleures suggestions
                this.applyTopSuggestions();
                
            } catch (error) {
                this.showSuggestions = false;
                this.keySuggestions = [];
                this.overallConfidence = 0;
            } finally {
                this.isAnalyzing = false;
                this.cdr.detectChanges();
            }
        }, 100);
    }

    /**
     * Applique automatiquement les meilleures suggestions (clés principales uniquement)
     */
    applyTopSuggestions(): void {
        if (this.keySuggestions.length === 0) return;
        
        // Appliquer la première suggestion comme clé principale
        const topSuggestion = this.keySuggestions[0];
        const seuilConfiance = this.calculService.getNumber('COLUMNSELECTION.SEUIL_CONFIANCE', 0.7);
        if (topSuggestion.confidence > seuilConfiance) {
            this.selectedBoKeyColumn = topSuggestion.boColumn;
            this.selectedPartnerKeyColumn = topSuggestion.partnerColumn;
        }
        
        // Ne pas appliquer de clés supplémentaires
        this.additionalKeys = [];
    }

    /**
     * Traite les données restantes en arrière-plan
     */
    private processRemainingData(boData: any[], partnerData: any[]): void {
        // Compresser les données en arrière-plan
        setTimeout(() => {
            this.compressData(boData, partnerData);
        }, 100);
    }

    /**
     * Compresse les données pour économiser la mémoire
     */
    private compressData(boData: any[], partnerData: any[]): void {
        
        // Compresser les données BO
        this.compressedBoData = this.compressDataset(boData);
        
        // Compresser les données Partner
        this.compressedPartnerData = this.compressDataset(partnerData);
        
    }

    /**
     * Compresse un dataset en supprimant les doublons et valeurs vides
     */
    private compressDataset(data: any[]): any[] {
        if (data.length === 0) return data;
        
        const compressed: any[] = [];
        const seen = new Set();
        
        for (const row of data) {
            // Créer une clé unique pour détecter les doublons
            const key = JSON.stringify(row);
            
            if (!seen.has(key)) {
                seen.add(key);
                
                // Supprimer les valeurs vides pour économiser l'espace
                const cleanRow: any = {};
                Object.keys(row).forEach(col => {
                    if (row[col] !== null && row[col] !== undefined && row[col] !== '') {
                        cleanRow[col] = row[col];
                    }
                });
                
                compressed.push(cleanRow);
            }
        }
        
        return compressed;
    }

    private initializeColumns() {

        if (this.boData.length > 0) {
            this.boColumns = Object.keys(this.boData[0]);
        } else {
        }
        
        if (this.partnerData.length > 0) {
            this.partnerColumns = Object.keys(this.partnerData[0]);
        } else {
        }
        
    }

    onBoKeyColumnChange(value: string) {
        
        this.selectedBoKeyColumn = value;
        this.isValid = this.validateSelection();
        
        
        // Afficher quelques exemples de valeurs pour aider au debug
        if (value && this.boData.length > 0) {
            const sampleValues = this.boData.slice(0, 5).map(row => row[value]).filter(val => val !== undefined && val !== null);
        }
    }

    onPartnerKeyColumnChange(value: string) {
        this.selectedPartnerKeyColumn = value;
        this.isValid = this.validateSelection();
        
        // Afficher quelques exemples de valeurs pour aider au debug
        if (value && this.partnerData.length > 0) {
            const sampleValues = this.partnerData.slice(0, 5).map(row => row[value]).filter(val => val !== undefined && val !== null);
        }
    }

    onBoComparisonColumnChange(value: string, index: number) {
        this.comparisonColumns[index].boColumn = value;
        this.isValid = this.validateSelection();
    }

    onPartnerComparisonColumnChange(value: string, index: number) {
        this.comparisonColumns[index].partnerColumn = value;
        this.isValid = this.validateSelection();
    }

    addComparisonColumn() {
        this.comparisonColumns.push({ boColumn: '', partnerColumn: '' });
        this.isValid = this.validateSelection();
    }

    removeComparisonColumn(index: number) {
        this.comparisonColumns.splice(index, 1);
        this.isValid = this.validateSelection();
    }

    addAdditionalKey() {
        this.additionalKeys.push({ boColumn: '', partnerColumn: '' });
        this.isValid = this.validateSelection();
    }

    removeAdditionalKey(index: number) {
        this.additionalKeys.splice(index, 1);
        this.isValid = this.validateSelection();
    }

    onAdditionalBoKeyChange(value: string, index: number) {
        this.additionalKeys[index].boColumn = value;
        this.isValid = this.validateSelection();
    }

    onAdditionalPartnerKeyChange(value: string, index: number) {
        this.additionalKeys[index].partnerColumn = value;
        this.isValid = this.validateSelection();
    }

    validateSelection(): boolean {
        const hasBoKey = Boolean(this.selectedBoKeyColumn && this.selectedBoKeyColumn.trim() !== '');
        const hasPartnerKey = Boolean(this.selectedPartnerKeyColumn && this.selectedPartnerKeyColumn.trim() !== '');
        
        // Les colonnes de comparaison sont optionnelles - on vérifie seulement celles qui sont remplies
        const hasValidComparisonColumns = this.comparisonColumns.every(col => 
            !col.boColumn || !col.partnerColumn || // Si vide, c'est OK
            (Boolean(col.boColumn && col.boColumn.trim() !== '' && 
            col.partnerColumn && col.partnerColumn.trim() !== ''))
        );
        
        // Les clés supplémentaires sont optionnelles - on vérifie seulement celles qui sont remplies
        const hasValidAdditionalKeys = this.additionalKeys.every(key => 
            !key.boColumn || !key.partnerColumn || // Si vide, c'est OK
            (Boolean(key.boColumn && key.boColumn.trim() !== '' && 
            key.partnerColumn && key.partnerColumn.trim() !== ''))
        );
        
        // Seules les colonnes clés principales sont obligatoires
        this.isValid = hasBoKey && hasPartnerKey && hasValidComparisonColumns && hasValidAdditionalKeys;
        
        
        return this.isValid;
    }

    /**
     * Optimisé pour les gros volumes de données
     */
    logKeyStatistics() {
        if (!this.selectedBoKeyColumn || !this.selectedPartnerKeyColumn) {
            return;
        }

        
        // Utiliser les données compressées si disponibles
        const boDataToAnalyze = this.compressedBoData.length > 0 ? this.compressedBoData : this.boData;
        const partnerDataToAnalyze = this.compressedPartnerData.length > 0 ? this.compressedPartnerData : this.partnerData;
        
        // Analyser par échantillons pour les gros volumes
        const boSample = this.getDataSample(boDataToAnalyze, 1000);
        const partnerSample = this.getDataSample(partnerDataToAnalyze, 1000);
        
        const boValues = boSample.map(row => row[this.selectedBoKeyColumn]).filter(val => val !== null && val !== undefined);
        const partnerValues = partnerSample.map(row => row[this.selectedPartnerKeyColumn]).filter(val => val !== null && val !== undefined);
        
        const boUnique = new Set(boValues);
        const partnerUnique = new Set(partnerValues);
        
        
        // Analyser les correspondances potentielles
        const commonValues = [...boUnique].filter(value => partnerUnique.has(value));
    }

    isReconciliationActive(): boolean {
        return this.isReconciliationInProgress || this.reconciliationService.isReconciliationRunning();
    }

    proceedWithReconciliation() {
        if (this.isReconciliationActive()) {
            this.isReconciliationInProgress = true;
            this.appStateService.setReconciliationProgress(true);
            this.cdr.detectChanges();
            return;
        }

        if (!this.validateSelection()) {
            return;
        }

        
        // Utiliser les données compressées si disponibles
        let boDataToReconcile = this.compressedBoData.length > 0 ? this.compressedBoData : this.boData;
        const partnerDataToReconcile = this.compressedPartnerData.length > 0 ? this.compressedPartnerData : this.partnerData;
        
        // Appliquer la transformation détectée si elle existe pour la paire de clés sélectionnée
        const selectedSuggestion = this.keySuggestions?.find(s => 
            s.boColumn === this.selectedBoKeyColumn && 
            s.partnerColumn === this.selectedPartnerKeyColumn
        );
        
        if (selectedSuggestion?.transformation) {
            
            // Créer une copie des données BO avec la transformation appliquée
            boDataToReconcile = boDataToReconcile.map(row => {
                const transformedRow = { ...row };
                const originalValue = transformedRow[this.selectedBoKeyColumn];
                
                if (originalValue && typeof originalValue === 'string') {
                    let transformedValue = originalValue;
                    
                    // Appliquer la transformation selon le type
                    switch (selectedSuggestion.transformation.type) {
                        case 'remove_suffix':
                            const suffix = selectedSuggestion.transformation.pattern;
                            if (originalValue.endsWith(suffix)) {
                                transformedValue = originalValue.slice(0, -suffix.length);
                            }
                            break;
                        case 'remove_prefix':
                            const prefix = selectedSuggestion.transformation.pattern;
                            if (originalValue.startsWith(prefix)) {
                                transformedValue = originalValue.slice(prefix.length);
                            }
                            break;
                        case 'remove_pattern':
                            const pattern = new RegExp(selectedSuggestion.transformation.pattern + '$');
                            transformedValue = originalValue.replace(pattern, '');
                            break;
                    }
                    
                    transformedRow[this.selectedBoKeyColumn] = transformedValue;
                }
                
                return transformedRow;
            });
            
        }
        

        // Préparer les paramètres de réconciliation
        const reconciliationParams = {
            boFileContent: boDataToReconcile,
            partnerFileContent: partnerDataToReconcile,
            boKeyColumn: this.selectedBoKeyColumn,
            partnerKeyColumn: this.selectedPartnerKeyColumn,
            comparisonColumns: this.comparisonColumns.filter(col => 
                col.boColumn && col.partnerColumn
            ),
            additionalKeys: this.additionalKeys.filter(key => 
                key.boColumn && key.partnerColumn
            )
        };

        // Vérifier si le traitement par chunks sera utilisé
        const willUseChunks = this.willUseChunkedProcessing(boDataToReconcile, partnerDataToReconcile);
        if (willUseChunks) {
            this.popupService.showInfo(
                'Gros fichier détecté ! Le système utilisera un traitement par chunks optimisé pour éviter les erreurs de mémoire. Le traitement peut prendre plus de temps mais sera plus stable.',
                'Traitement Optimisé'
            );
            
            // Pour les très gros fichiers, utiliser directement le traitement par chunks
            this.launchChunkedReconciliation(reconciliationParams);
            return;
        }
        
        // Log des échantillons de données transformées
        if (selectedSuggestion?.transformation) {
            const boSample = boDataToReconcile.slice(0, 3).map(row => row[this.selectedBoKeyColumn]);
            const partnerSample = partnerDataToReconcile.slice(0, 3).map(row => row[this.selectedPartnerKeyColumn]);
        }


        // Démarrer la réconciliation avec progression
        this.startReconciliationProgress();
        
        // Lancer la réconciliation avec gestion d'erreur
        this.reconciliationService.reconcile(reconciliationParams).subscribe({
            next: (result: any) => {
                
                this.finishReconciliationProgress();
                
                this.rememberReconciliationLaunchContext();
                this.appStateService.setReconciliationResults(result);
                
                // Naviguer vers la page des résultats avec un délai pour voir la progression
                setTimeout(() => {
                    this.router.navigate(['/results']);
                }, 2000); // 2 secondes de délai pour voir la progression
            },
            error: (error: any) => {
                this.finishReconciliationProgress();
                
                // Afficher l'erreur à l'utilisateur
                this.popupService.showError(`Erreur lors de la réconciliation: ${error.message || 'Erreur inconnue'}`, 'Erreur de Réconciliation');
            }
        });
    }

    /**
     * Lance directement le traitement par chunks pour éviter l'erreur de sérialisation
     */
    private launchChunkedReconciliation(reconciliationParams: any): void {
        
        // Démarrer la progression
        this.startReconciliationProgress();
        
        // Créer une requête simplifiée pour le traitement par chunks
        const chunkedRequest = {
            boFileContent: reconciliationParams.boFileContent,
            partnerFileContent: reconciliationParams.partnerFileContent,
            boKeyColumn: reconciliationParams.boKeyColumn,
            partnerKeyColumn: reconciliationParams.partnerKeyColumn,
            comparisonColumns: reconciliationParams.comparisonColumns,
            additionalKeys: reconciliationParams.additionalKeys
        };
        
        // Lancer la réconciliation par chunks
        this.reconciliationService.reconcile(chunkedRequest).subscribe({
            next: (result: any) => {
                
                this.finishReconciliationProgress();
                
                this.rememberReconciliationLaunchContext();
                this.appStateService.setReconciliationResults(result);
                
                // Naviguer vers la page des résultats avec un délai pour voir la progression
                setTimeout(() => {
                    this.router.navigate(['/results']);
                }, 2000); // 2 secondes de délai pour voir la progression
            },
            error: (error: any) => {
                this.finishReconciliationProgress();
                
                // Afficher l'erreur à l'utilisateur
                this.popupService.showError(`Erreur lors de la réconciliation par chunks: ${error.message || 'Erreur inconnue'}`, 'Erreur de Réconciliation');
            }
        });
    }

    /**
     * Détermine si le traitement par chunks sera utilisé
     */
    private willUseChunkedProcessing(boData: any[], partnerData: any[]): boolean {
        // Désactiver le traitement par chunks frontend pour forcer l'utilisation du backend
        // Le backend est plus optimisé pour les gros volumes et la logique de correspondance
        return false;
    }

    // Méthodes pour gérer la progression
    private startReconciliationProgress(): void {
        this.isReconciliationInProgress = true;
        this.reconciliationProgress = 0;
        this.reconciliationStatus = 'Initialisation...';
        this.reconciliationStartTime = Date.now();
        
        // Déclencher l'affichage de la progression globale
        this.appStateService.setReconciliationProgress(true);
        
        
        // Forcer la détection de changement
        this.cdr.detectChanges();
        
        // Vérifier si l'élément DOM existe après un délai
        setTimeout(() => {
            const progressElement = document.querySelector('.reconciliation-progress');
            if (progressElement) {
            } else {
            }
        }, 100);
    }

    private updateProgressStatus(): void {
        if (this.reconciliationProgress < 20) {
            this.reconciliationStatus = 'Analyse des données...';
        } else if (this.reconciliationProgress < 40) {
            this.reconciliationStatus = 'Indexation des enregistrements...';
        } else if (this.reconciliationProgress < 60) {
            this.reconciliationStatus = 'Traitement parallèle...';
        } else if (this.reconciliationProgress < 80) {
            this.reconciliationStatus = 'Comparaison des enregistrements...';
        } else if (this.reconciliationProgress < 95) {
            this.reconciliationStatus = 'Finalisation...';
        } else {
            this.reconciliationStatus = 'Terminé !';
        }
        
        // Forcer la détection de changement
        this.cdr.detectChanges();
    }

    private finishReconciliationProgress(): void {
        this.reconciliationProgress = 100;
        this.reconciliationStatus = 'Réconciliation terminée !';
        // Ne pas masquer immédiatement la barre
        // this.isReconciliationInProgress = false;
        
        // Arrêter la progression globale
        this.appStateService.setReconciliationProgress(false);
        
        // Forcer la détection de changement
        this.cdr.detectChanges();
        
        // Masquer la barre après 3 secondes pour voir le résultat
        setTimeout(() => {
            this.isReconciliationInProgress = false;
            this.cdr.detectChanges();
        }, 3000);
    }

    getElapsedTime(): string {
        if (!this.reconciliationStartTime) return '';
        
        const elapsed = Date.now() - this.reconciliationStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    }

    // Méthode de test pour afficher la barre de progression
    testProgressBar(): void {
        this.isReconciliationInProgress = true;
        this.reconciliationProgress = 50;
        this.reconciliationStatus = 'Test en cours...';
        this.reconciliationStartTime = Date.now();
        this.cdr.detectChanges();
        
        // Masquer après 3 secondes
        setTimeout(() => {
            this.isReconciliationInProgress = false;
            this.cdr.detectChanges();
        }, 3000);
    }

    private rememberReconciliationLaunchContext(): void {
        const urlMode = new URLSearchParams(window.location.search).get('mode');
        if (urlMode === 'assisted') {
            this.appStateService.setReconciliationLaunchMode('assisted');
            this.appStateService.setReconciliationEntryPath('/reconciliation-launcher');
            return;
        }
        if (urlMode === 'manual') {
            this.appStateService.setReconciliationLaunchMode('manual');
            this.appStateService.setReconciliationEntryPath('/reconciliation-launcher');
            return;
        }
        this.appStateService.setReconciliationLaunchMode('manual');
        this.appStateService.setReconciliationEntryPath('/upload');
    }
} 