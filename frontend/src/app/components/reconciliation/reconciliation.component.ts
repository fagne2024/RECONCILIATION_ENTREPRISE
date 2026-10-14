import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ReconciliationRequest } from '../../models/reconciliation-request.model';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { ReconciliationService, ReconciliationConfig, ProgressUpdate } from '../../services/reconciliation.service';
import { AppStateService } from '../../services/app-state.service';
import { I18nService } from '../../services/i18n/i18n.service';
import { OrangeMoneyUtilsService } from '../../services/orange-money-utils.service';
import { Subject, takeUntil } from 'rxjs';
import * as Papa from 'papaparse';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';

@Component({
    selector: 'app-reconciliation',
    templateUrl: './reconciliation.component.html',
    styleUrls: ['./reconciliation.component.scss']
})
export class ReconciliationComponent implements OnInit, OnDestroy {
    reconciliationRequest: ReconciliationRequest | null = null;
    reconciliationResponse: ReconciliationResponse | null = null;
    isLoading = false;
    error: string | null = null;
    
    // Propriétés pour la progression en temps réel
    showProgress = false;
    progressPercentage = 0;
    processedRecords = 0;
    totalRecords = 0;
    executionTime = 0;
    startTime = 0;
    currentStep = 'Initialisation...';
    estimatedTimeRemaining = 0;

    // Popup de performance
    showPerformancePopup = false;
    progressStep: string = '';
    progressCurrentFile: number = 0;
    progressTotalFiles: number = 0;
    
    // Informations détaillées de progression
    currentBoChunk: number = 0;
    totalBoChunks: number = 0;
    matchesCount: number = 0;
    boOnlyCount: number = 0;
    partnerRemaining: number = 0;

    // Gestion des jobs
    currentJobId: string | null = null;
    private destroy$ = new Subject<void>();

    // Propriétés pour le mode magique
    isMagicMode = false;
    magicResults: any = null;
    detectedKeys: any[] = [];
    appliedTransformations: any[] = [];
    magicConfidence = 0;

    constructor(
        private reconciliationService: ReconciliationService,
        private appStateService: AppStateService,
        private orangeMoneyUtilsService: OrangeMoneyUtilsService,
        private cd: ChangeDetectorRef,
        private router: Router
    ) {}

    ngOnInit(): void {
        console.log('🚀 ReconciliationComponent initialisé');
        
        // Vérifier si on est en mode magique
        this.checkMagicMode();
        
        // Mode API classique activé
        console.log('✅ Mode API classique activé');
        
        // S'abonner aux mises à jour de progression détaillées
        this.reconciliationService.progress$
            .pipe(takeUntil(this.destroy$))
            .subscribe((progress) => {
                if (progress.currentBoChunk !== undefined) {
                    this.currentBoChunk = progress.currentBoChunk;
                }
                if (progress.totalBoChunks !== undefined) {
                    this.totalBoChunks = progress.totalBoChunks;
                }
                if (progress.matchesCount !== undefined) {
                    this.matchesCount = progress.matchesCount;
                }
                if (progress.boOnlyCount !== undefined) {
                    this.boOnlyCount = progress.boOnlyCount;
                }
                if (progress.partnerRemaining !== undefined) {
                    this.partnerRemaining = progress.partnerRemaining;
                }
                // Mettre à jour aussi les propriétés de base
                if (progress.percentage !== undefined) {
                    this.progressPercentage = progress.percentage;
                }
                if (progress.step) {
                    this.progressStep = progress.step;
                }
                this.cd.detectChanges();
            });
    }

    /**
     * Vérifie si on est en mode magique et initialise l'affichage
     */
    private checkMagicMode(): void {
        // Récupérer les paramètres de l'URL
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const jobId = urlParams.get('jobId');
        
        if (mode === 'magic' && jobId) {
            console.log('🪄 Mode magique détecté - Job ID:', jobId);
            this.isMagicMode = true;
            // Démarrer directement le suivi de progression du job
            this.startProgressTracking(jobId);
        } else {
            console.log('⚠️ Mode magique non détecté ou Job ID manquant');
        }
    }



    /**
     * Retourne la classe CSS pour l'affichage de la confiance
     */
    getConfidenceClass(confidence: number): string {
        if (confidence >= 0.8) return 'high-confidence';
        if (confidence >= 0.6) return 'medium-confidence';
        if (confidence >= 0.4) return 'low-confidence';
        return 'very-low-confidence';
    }

    /**
     * Démarre le suivi de progression pour un job
     * Optimisé pour fonctionner à distance avec latence réseau
     */
    private startProgressTracking(jobId: string): void {
        console.log('📊 Démarrage du suivi de progression pour le job:', jobId);
        
        let isCompleted = false; // Flag pour éviter les appels répétés
        let consecutiveErrors = 0; // Compteur d'erreurs consécutives
        let pollInterval = 3000; // Intervalle initial de 3 secondes (plus fréquent au début)
        let pollTimeoutId: any = null;
        const maxConsecutiveErrors = 5; // Tolérer plus d'erreurs consécutives avant d'abandonner
        const basePollInterval = 3000; // 3 secondes de base
        const maxPollInterval = 15000; // Maximum 15 secondes entre les polls
        const maxTotalTime = 3600000; // 60 minutes maximum pour la réconciliation complète
        const startTime = Date.now();

        const clearScheduledPoll = () => {
            if (pollTimeoutId) {
                clearTimeout(pollTimeoutId);
                pollTimeoutId = null;
            }
        };

        const scheduleNextPoll = () => {
            if (isCompleted) {
                return;
            }
            clearScheduledPoll();
            pollTimeoutId = setTimeout(() => {
                pollProgress();
            }, pollInterval);
        };
        
        // Fonction de polling avec retry exponentiel adaptatif
        const pollProgress = () => {
            if (isCompleted) {
                return;
            }
            
            // Vérifier le timeout global
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime > maxTotalTime) {
                console.log('⏰ Timeout global atteint (60 minutes), arrêt du polling');
                isCompleted = true;
                clearScheduledPoll();
                this.showProgress = false;
                this.isLoading = false;
                this.error = `Délai d'attente dépassé pour la réconciliation (60 minutes). Le processus prend plus de temps que prévu. Veuillez réessayer avec des fichiers plus petits ou contacter le support technique.`;
                this.cd.detectChanges();
                return;
            }
            
            this.reconciliationService.getJobProgress(jobId).subscribe({
                next: (progress: any) => {
                    // Réinitialiser le compteur d'erreurs en cas de succès
                    consecutiveErrors = 0;
                    
                    // Réduire l'intervalle de polling après un succès (backoff inverse)
                    pollInterval = Math.max(basePollInterval, pollInterval * 0.8);
                    
                    console.log('📊 Progression reçue:', progress);
                    console.log('📊 Progress value:', progress.progress, 'Step:', progress.step);
                    
                    if (progress) {
                        this.progressPercentage = progress.progress || 0;
                        this.progressStep = progress.step || 'Traitement en cours...';
                        
                        // Si la réconciliation est terminée ou a échoué
                        if (progress.progress >= 100 || progress.step.includes('Échec') || progress.step.includes('Terminé')) {
                            console.log('✅ Réconciliation terminée, arrêt du polling');
                            isCompleted = true;
                            clearScheduledPoll();
                            this.showProgress = false;
                            
                            if (progress.step.includes('Échec')) {
                                this.error = progress.step;
                                this.isLoading = false;
                            } else {
                                console.log('📋 Chargement des résultats...');
                                this.isLoading = false; // Important : mettre isLoading à false
                                this.loadReconciliationResults(jobId);
                            }
                            this.cd.detectChanges();
                        } else {
                            this.cd.detectChanges();
                            scheduleNextPoll();
                        }
                    }
                },
                error: (error) => {
                    consecutiveErrors++;
                    console.error(`❌ Erreur lors du suivi de progression (${consecutiveErrors}/${maxConsecutiveErrors}):`, error);
                    
                    // Si c'est une erreur 404, c'est normal pendant le traitement initial
                    if (error.status === 404) {
                        console.log('⚠️ Job en cours de traitement (404 normal), continuation du polling...');
                        // Ne pas compter les 404 comme erreurs
                        consecutiveErrors = Math.max(0, consecutiveErrors - 1);
                        this.cd.detectChanges();
                        return;
                    }
                    
                    // Augmenter l'intervalle de polling en cas d'erreur (backoff exponentiel)
                    pollInterval = Math.min(maxPollInterval, pollInterval * 1.5);
                    console.log(`⏱️ Intervalle de polling ajusté à ${pollInterval}ms après erreur`);
                    
                    // Si trop d'erreurs consécutives, arrêter le polling
                    if (consecutiveErrors >= maxConsecutiveErrors) {
                        console.log(`⚠️ ${maxConsecutiveErrors} erreurs consécutives atteintes, arrêt du processus`);
                        isCompleted = true;
                        clearScheduledPoll();
                        this.showProgress = false;
                        this.isLoading = false;
                        
                        // Message d'erreur adaptatif selon le type d'erreur
                        let errorMessage = `Impossible de suivre la progression de la réconciliation après ${maxConsecutiveErrors} tentatives. `;
                        if (error.status === 0 || error.message?.includes('network') || error.message?.includes('Network')) {
                            errorMessage += `Problème de connexion réseau détecté. Vérifiez votre connexion et réessayez. `;
                        } else if (error.status >= 500) {
                            errorMessage += `Erreur serveur (${error.status}). Le serveur peut être temporairement indisponible. `;
                        } else {
                            errorMessage += `Erreur: ${error.status || I18nService.t('COMMON.errors.unknownStatus')} - ${error.message || I18nService.t('COMMON.errors.unknown')}. `;
                        }
                        errorMessage += `Veuillez contacter le support technique si le problème persiste.`;
                        this.error = errorMessage;
                        this.cd.detectChanges();
                    } else {
                        console.log(`⚠️ Erreur ${consecutiveErrors}/${maxConsecutiveErrors}, nouvelle tentative dans ${pollInterval}ms`);
                        this.cd.detectChanges();
                        scheduleNextPoll();
                    }
                }
            });
        };
        
        // Premier appel immédiat
        pollProgress();
        
        // Nettoyer l'intervalle lors de la destruction du composant
        this.destroy$.subscribe({
            next: () => {
                clearScheduledPoll();
            }
        });
    }

    /**
     * Charge les résultats de la réconciliation
     * Optimisé pour les connexions distantes avec retry automatique
     */
    private loadReconciliationResults(jobId: string): void {
        console.log('📋 Chargement des résultats pour le job:', jobId);
        
        let retryCount = 0;
        const maxRetries = 3;
        
        const attemptLoad = () => {
            this.reconciliationService.getJobResults(jobId).subscribe({
                next: (results: any) => {
                    console.log('📊 Résultats reçus du backend:', results);
                    
                    // Extraire les résultats de la réponse
                    let reconciliationResult;
                    if (results && results.result) {
                        reconciliationResult = results.result;
                    } else if (results && results.matches !== undefined) {
                        reconciliationResult = results;
                    } else {
                        console.error('❌ Aucun résultat valide reçu du backend');
                        this.error = 'Aucun résultat de réconciliation valide reçu du serveur';
                        this.isLoading = false;
                        this.cd.detectChanges();
                        return;
                    }
                    
                    // Traitement universel des résultats (magique et manuel)
                    this.reconciliationResponse = {
                        totalMatches: reconciliationResult.totalMatches || 0,
                        totalMismatches: reconciliationResult.totalMismatches || 0,
                        totalBoOnly: reconciliationResult.totalBoOnly || 0,
                        totalPartnerOnly: reconciliationResult.totalPartnerOnly || 0,
                        totalBoRecords: reconciliationResult.totalBoRecords || 0,
                        totalPartnerRecords: reconciliationResult.totalPartnerRecords || 0,
                        matches: reconciliationResult.matches || [],
                        mismatches: reconciliationResult.mismatches || [],
                        boOnly: reconciliationResult.boOnly || [],
                        partnerOnly: reconciliationResult.partnerOnly || []
                    };
                    
                    this.executionTime = reconciliationResult.executionTime || 0;
                    this.processedRecords = reconciliationResult.processedRecords || 0;
                    
                    console.log('✅ Résultats chargés:', this.reconciliationResponse);
                    
                    // Stocker les résultats dans AppStateService
                    this.appStateService.setReconciliationResults(this.reconciliationResponse);
                    
                    // Rediriger vers la page des résultats
                    this.router.navigate(['/results'], { queryParams: { jobId } });
                    
                    this.cd.detectChanges();
                },
                error: (error) => {
                    console.error(`❌ Erreur lors du chargement des résultats (tentative ${retryCount + 1}/${maxRetries + 1}):`, error);
                    
                    retryCount++;
                    
                    // Si c'est une erreur 404 et qu'on n'a pas encore atteint le max, retry après un délai
                    if (error.status === 404 && retryCount <= maxRetries) {
                        const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 8000); // Backoff exponentiel : 2s, 4s, 8s
                        console.log(`⏳ Résultats pas encore disponibles (404), retry dans ${delay}ms...`);
                        setTimeout(() => {
                            attemptLoad();
                        }, delay);
                        return;
                    }
                    
                    // Pour les autres erreurs réseau, retry aussi
                    if ((error.status === 0 || error.status >= 500) && retryCount <= maxRetries) {
                        const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 8000);
                        console.log(`⏳ Erreur réseau (${error.status}), retry dans ${delay}ms...`);
                        setTimeout(() => {
                            attemptLoad();
                        }, delay);
                        return;
                    }
                    
                    // Après maxRetries tentatives, afficher l'erreur
                    let errorMessage = `Impossible de récupérer les résultats de la réconciliation après ${retryCount} tentative(s). `;
                    if (error.status === 0 || error.message?.includes('network') || error.message?.includes('Network')) {
                        errorMessage += `Problème de connexion réseau détecté. Vérifiez votre connexion et réessayez. `;
                    } else if (error.status === 404) {
                        errorMessage += `Les résultats ne sont pas encore disponibles. Le job est peut-être toujours en cours de traitement. `;
                    } else if (error.status >= 500) {
                        errorMessage += `Erreur serveur (${error.status}). Le serveur peut être temporairement indisponible. `;
                    } else {
                        errorMessage += `Erreur: ${error.status || I18nService.t('COMMON.errors.unknownStatus')} - ${error.message || I18nService.t('COMMON.errors.unknown')}. `;
                    }
                    errorMessage += `Veuillez réessayer dans quelques instants ou contacter le support technique.`;
                    this.error = errorMessage;
                    this.isLoading = false;
                    this.cd.detectChanges();
                }
            });
        };
        
        // Démarrer le chargement
        attemptLoad();
    }



    /**
     * Navigation vers le mode assisté
     */
    goToAssistedMode(): void {
        this.router.navigate(['/column-selection'], { queryParams: { mode: 'assisted' } });
    }

    /**
     * Navigation vers le mode manuel
     */
    goToManualMode(): void {
        this.router.navigate(['/column-selection']);
    }

    /**
     * Démarre le mode assisté
     */
    async startAssistedMode(): Promise<void> {
        console.log('🔍 Démarrage du mode assisté...');
        
        // Vérifier si des fichiers sont disponibles dans l'état
        const uploadedFiles = this.appStateService.getUploadedFiles();
        console.log('📁 Fichiers récupérés:', {
            boFile: uploadedFiles.boFile?.name,
            partnerFile: uploadedFiles.partnerFile?.name,
            boFileExists: !!uploadedFiles.boFile,
            partnerFileExists: !!uploadedFiles.partnerFile
        });
        
        if (!uploadedFiles.boFile || !uploadedFiles.partnerFile) {
            console.log('⚠️ Aucun fichier disponible, redirection vers le launcher...');
            // Rediriger vers le launcher pour permettre l'upload des fichiers
            this.router.navigate(['/reconciliation-launcher'], { queryParams: { mode: 'assisted' } });
            return;
        }
        
        const startTime = performance.now();
        try {
            console.log('🔄 [START_ASSISTED] Début du parsing des fichiers...');
            console.log('📊 [START_ASSISTED] Fichiers reçus:', {
                boFile: {
                    name: uploadedFiles.boFile.name,
                    size: uploadedFiles.boFile.size,
                    sizeMB: (uploadedFiles.boFile.size / (1024 * 1024)).toFixed(2),
                    type: uploadedFiles.boFile.type
                },
                partnerFile: {
                    name: uploadedFiles.partnerFile.name,
                    size: uploadedFiles.partnerFile.size,
                    sizeMB: (uploadedFiles.partnerFile.size / (1024 * 1024)).toFixed(2),
                    type: uploadedFiles.partnerFile.type
                }
            });
            
            // Afficher l'indicateur de progression pour les fichiers volumineux
            const isLargeBoFile = uploadedFiles.boFile.size > 10 * 1024 * 1024;
            const isLargePartnerFile = uploadedFiles.partnerFile.size > 10 * 1024 * 1024;
            console.log(`🔍 [START_ASSISTED] Fichiers volumineux: BO=${isLargeBoFile}, Partner=${isLargePartnerFile}`);
            
            if (isLargeBoFile || isLargePartnerFile) {
                console.log('📊 [START_ASSISTED] Affichage de l\'indicateur de progression');
                this.showProgress = true;
                this.currentStep = 'Parsing des fichiers CSV...';
                this.cd.detectChanges();
            }
            
            // Parser les fichiers CSV
            console.log('📊 [START_ASSISTED] Début du parsing du fichier BO:', uploadedFiles.boFile.name);
            const boParseStartTime = performance.now();
            let boData: Record<string, string>[];
            try {
                boData = await this.parseCsvFile(uploadedFiles.boFile);
                const boParseDuration = ((performance.now() - boParseStartTime) / 1000).toFixed(2);
                console.log(`✅ [START_ASSISTED] Fichier BO parsé en ${boParseDuration}s: ${boData.length} enregistrements`);
            } catch (error) {
                const boParseDuration = ((performance.now() - boParseStartTime) / 1000).toFixed(2);
                console.error(`❌ [START_ASSISTED] Erreur lors du parsing du fichier BO après ${boParseDuration}s:`, error);
                console.error(`❌ [START_ASSISTED] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
                throw error;
            }
            
            console.log('📊 [START_ASSISTED] Début du parsing du fichier Partner:', uploadedFiles.partnerFile.name);
            const partnerParseStartTime = performance.now();
            let partnerData: Record<string, string>[];
            try {
                partnerData = await this.parseCsvFile(uploadedFiles.partnerFile);
                const partnerParseDuration = ((performance.now() - partnerParseStartTime) / 1000).toFixed(2);
                console.log(`✅ [START_ASSISTED] Fichier Partner parsé en ${partnerParseDuration}s: ${partnerData.length} enregistrements`);
            } catch (error) {
                const partnerParseDuration = ((performance.now() - partnerParseStartTime) / 1000).toFixed(2);
                console.error(`❌ [START_ASSISTED] Erreur lors du parsing du fichier Partner après ${partnerParseDuration}s:`, error);
                console.error(`❌ [START_ASSISTED] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
                throw error;
            }
            
            // Masquer l'indicateur de progression
            if (isLargeBoFile || isLargePartnerFile) {
                console.log('📊 [START_ASSISTED] Masquage de l\'indicateur de progression');
                this.showProgress = false;
                this.cd.detectChanges();
            }
            
            console.log('💾 [START_ASSISTED] Sauvegarde des données dans le service...');
            const saveStartTime = performance.now();
            // Sauvegarder les données parsées dans le service
            try {
                this.appStateService.setBoData(boData);
                this.appStateService.setPartnerData(partnerData);
                const saveDuration = ((performance.now() - saveStartTime) / 1000).toFixed(2);
                console.log(`✅ [START_ASSISTED] Données sauvegardées en ${saveDuration}s`);
            } catch (error) {
                console.error(`❌ [START_ASSISTED] Erreur lors de la sauvegarde:`, error);
                throw error;
            }
            
            console.log('✅ [START_ASSISTED] Fichiers parsés et données sauvegardées:', {
                boRecords: boData.length,
                partnerRecords: partnerData.length
            });
            
            // Vérifier que les données sont bien sauvegardées
            const verifyStartTime = performance.now();
            const savedBoData = this.appStateService.getBoData();
            const savedPartnerData = this.appStateService.getPartnerData();
            const verifyDuration = ((performance.now() - verifyStartTime) / 1000).toFixed(2);
            console.log('🔍 [START_ASSISTED] Vérification de la sauvegarde:', {
                savedBoRecords: savedBoData.length,
                savedPartnerRecords: savedPartnerData.length,
                verificationDuration: `${verifyDuration}s`
            });
            
            const totalDuration = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ [START_ASSISTED] Processus complet terminé en ${totalDuration}s`);
            console.log('🚀 [START_ASSISTED] Redirection vers la page de sélection de colonnes...');
            // Rediriger vers la page de sélection de colonnes
            this.router.navigate(['/column-selection'], { queryParams: { mode: 'assisted' } });
            
        } catch (error) {
            const errorTime = performance.now();
            const errorDuration = ((errorTime - startTime) / 1000).toFixed(2);
            console.error(`❌ [START_ASSISTED] Erreur lors du parsing des fichiers après ${errorDuration}s:`, error);
            console.error(`❌ [START_ASSISTED] Détails de l'erreur:`, {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'N/A',
                name: error instanceof Error ? error.name : 'N/A'
            });
            this.error = 'Erreur lors de la lecture des fichiers: ' + (error instanceof Error ? error.message : I18nService.t('COMMON.errors.unknown'));
            this.cd.detectChanges();
        }
    }

    /**
     * Parse un fichier CSV avec détection robuste des colonnes
     */
    private parseCsvFile(file: File): Promise<Record<string, string>[]> {
        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            console.log(`📖 [PARSE_CSV] Début de la lecture du fichier: ${file.name}`);
            console.log(`📊 [PARSE_CSV] Taille du fichier: ${fileSizeMB} MB (${file.size} bytes)`);
            console.log(`📊 [PARSE_CSV] Type MIME: ${file.type || 'non spécifié'}`);
            
            // Détecter si le fichier est volumineux (> 10 MB)
            const isLargeFile = file.size > 10 * 1024 * 1024;
            console.log(`🔍 [PARSE_CSV] Fichier volumineux? ${isLargeFile} (seuil: 10 MB)`);
            
            if (isLargeFile) {
                console.log('📦 [PARSE_CSV] Fichier volumineux détecté, utilisation du parsing optimisé par chunks');
                this.parseLargeCsvFile(file)
                    .then((data) => {
                        const endTime = performance.now();
                        const duration = ((endTime - startTime) / 1000).toFixed(2);
                        console.log(`✅ [PARSE_CSV] Parsing terminé en ${duration}s: ${data.length} enregistrements`);
                        resolve(data);
                    })
                    .catch((error) => {
                        const endTime = performance.now();
                        const duration = ((endTime - startTime) / 1000).toFixed(2);
                        console.error(`❌ [PARSE_CSV] Erreur après ${duration}s:`, error);
                        reject(error);
                    });
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const loadStartTime = performance.now();
                try {
                    console.log(`📥 [PARSE_CSV] FileReader.onload déclenché pour ${file.name}`);
                    let content = e.target?.result as string;
                    const contentSizeMB = (content.length / (1024 * 1024)).toFixed(2);
                    console.log(`📄 [PARSE_CSV] Contenu chargé: ${contentSizeMB} MB (${content.length} caractères)`);
                    
                    // Nettoyer le BOM UTF-8 si présent
                    if (content.charCodeAt(0) === 0xFEFF) {
                        content = content.slice(1);
                        console.log('🔧 [PARSE_CSV] BOM UTF-8 détecté et supprimé');
                    }
                    
                    // Normaliser les retours à la ligne
                    const normalizeStartTime = performance.now();
                    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    const normalizeDuration = ((performance.now() - normalizeStartTime) / 1000).toFixed(2);
                    console.log(`🔧 [PARSE_CSV] Normalisation des retours à la ligne: ${normalizeDuration}s`);
                    
                    // Détecter le délimiteur de manière robuste
                    const delimiterStartTime = performance.now();
                    const delimiter = this.detectCsvDelimiter(content);
                    const delimiterDuration = ((performance.now() - delimiterStartTime) / 1000).toFixed(2);
                    console.log(`🔍 [PARSE_CSV] Délimiteur détecté: "${delimiter}" (${delimiterDuration}s)`);
                    
                    // Compter les lignes approximatives
                    const lineCount = content.split('\n').length;
                    console.log(`📊 [PARSE_CSV] Nombre approximatif de lignes: ${lineCount}`);
                    
                    // Parser avec PapaParse avec streaming pour les gros fichiers
                    const parseStartTime = performance.now();
                    const data: Record<string, string>[] = [];
                    let headers: string[] = [];
                    let isFirstRow = true;
                    let rowCount = 0;
                    console.log(`🔄 [PARSE_CSV] Début du parsing avec PapaParse (mode step)`);
                    
                    Papa.parse(content, {
                        header: false,
                        delimiter: delimiter,
                        skipEmptyLines: true,
                        step: (results, parser) => {
                            rowCount++;
                            // Traiter ligne par ligne pour éviter de bloquer l'UI
                            if (isFirstRow) {
                                // Première ligne = headers
                                const headerStartTime = performance.now();
                                headers = (results.data as string[]).map(header => this.normalizeColumnName(header));
                                const headerDuration = ((performance.now() - headerStartTime) / 1000).toFixed(3);
                                console.log(`📋 [PARSE_CSV] Headers détectés (${headers.length} colonnes):`, headers);
                                console.log(`⏱️ [PARSE_CSV] Normalisation des headers: ${headerDuration}s`);
                                isFirstRow = false;
                            } else {
                                // Lignes de données
                                const row: Record<string, string> = {};
                                const values = results.data as string[];
                                headers.forEach((header, index) => {
                                    row[header] = this.normalizeCsvValue(values[index] || '');
                                });
                                data.push(row);
                                
                                // Logger tous les 10000 enregistrements pour suivre la progression
                                if (rowCount % 10000 === 0) {
                                    const progress = ((rowCount / lineCount) * 100).toFixed(1);
                                    console.log(`📊 [PARSE_CSV] Progression: ${progress}% (${rowCount} lignes traitées, ${data.length} enregistrements)`);
                                }
                            }
                        },
                        complete: () => {
                            try {
                                const parseDuration = ((performance.now() - parseStartTime) / 1000).toFixed(2);
                                const totalDuration = ((performance.now() - loadStartTime) / 1000).toFixed(2);
                                console.log(`✅ [PARSE_CSV] Fichier ${file.name} parsé avec succès`);
                                console.log(`📊 [PARSE_CSV] Statistiques: ${data.length} enregistrements, ${rowCount} lignes traitées`);
                                console.log(`⏱️ [PARSE_CSV] Durée parsing: ${parseDuration}s, Durée totale: ${totalDuration}s`);
                                
                                if (data.length === 0) {
                                    console.warn('⚠️ [PARSE_CSV] Aucune donnée trouvée dans le fichier');
                                    reject(new Error('Fichier CSV vide ou invalide'));
                                    return;
                                }
                                
                                // Vérifier que les colonnes sont valides
                                const firstRow = data[0];
                                const columns = Object.keys(firstRow);
                                console.log(`🏷️ [PARSE_CSV] Colonnes détectées (${columns.length}):`, columns);
                                
                                if (columns.length === 0 || columns.every(col => !col || col.startsWith('field'))) {
                                    console.warn('⚠️ [PARSE_CSV] Colonnes invalides détectées, tentative de re-parsing sans header');
                                    // Réessayer sans header
                                    this.parseCsvWithoutHeader(content, delimiter)
                                        .then(resolve)
                                        .catch(reject);
                                    return;
                                }
                                
                                if (data.length > 0) {
                                    console.log(`📊 [PARSE_CSV] Exemple de données (première ligne):`, data[0]);
                                }
                                
                                const endTime = performance.now();
                                const totalDurationFinal = ((endTime - startTime) / 1000).toFixed(2);
                                console.log(`✅ [PARSE_CSV] Parsing complet en ${totalDurationFinal}s`);
                                resolve(data);
                            } catch (error) {
                                const errorTime = performance.now();
                                const errorDuration = ((errorTime - loadStartTime) / 1000).toFixed(2);
                                console.error(`❌ [PARSE_CSV] Erreur lors du traitement des résultats après ${errorDuration}s:`, error);
                                console.error(`❌ [PARSE_CSV] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
                                reject(new Error(`Erreur lors du traitement des résultats: ${error}`));
                            }
                        },
                        error: (error) => {
                            const errorTime = performance.now();
                            const errorDuration = ((errorTime - loadStartTime) / 1000).toFixed(2);
                            console.error(`❌ [PARSE_CSV] Erreur PapaParse après ${errorDuration}s:`, error);
                            console.error(`❌ [PARSE_CSV] Détails de l'erreur:`, {
                                message: error.message,
                                code: error.code,
                                type: error.type,
                                row: error.row
                            });
                            reject(new Error(`Erreur lors du parsing CSV: ${error.message}`));
                        }
                    });
                    
                } catch (error) {
                    console.error(`❌ Erreur lors du parsing du fichier ${file.name}:`, error);
                    reject(new Error(`Erreur lors du parsing du fichier ${file.name}: ${error}`));
                }
            };
            
            reader.onerror = (error) => {
                const errorTime = performance.now();
                const errorDuration = ((errorTime - startTime) / 1000).toFixed(2);
                console.error(`❌ [PARSE_CSV] Erreur FileReader après ${errorDuration}s pour ${file.name}:`, error);
                console.error(`❌ [PARSE_CSV] Détails de l'erreur FileReader:`, {
                    error: error,
                    target: (error.target as FileReader)?.error
                });
                reject(new Error(`Erreur lors de la lecture du fichier ${file.name}`));
            };
            
            // Lire avec UTF-8 (le plus courant), avec fallback automatique si nécessaire
            console.log(`📥 [PARSE_CSV] Démarrage de FileReader.readAsText avec encodage UTF-8`);
            try {
                reader.readAsText(file, 'UTF-8');
                console.log(`✅ [PARSE_CSV] FileReader.readAsText appelé avec succès`);
            } catch (error) {
                console.error(`❌ [PARSE_CSV] Erreur lors de l'appel à readAsText:`, error);
                reject(new Error(`Erreur lors de la lecture du fichier ${file.name}: ${error}`));
            }
        });
    }
    
    /**
     * Parse un fichier CSV volumineux par chunks pour éviter de bloquer l'UI
     */
    private parseLargeCsvFile(file: File): Promise<Record<string, string>[]> {
        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            console.log(`📦 [PARSE_LARGE] Parsing optimisé pour fichier volumineux: ${file.name}`);
            console.log(`📊 [PARSE_LARGE] Taille du fichier: ${fileSizeMB} MB (${file.size} bytes)`);
            
            const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB par chunk (plus petit pour éviter de bloquer)
            const chunkSizeMB = (CHUNK_SIZE / (1024 * 1024)).toFixed(2);
            const estimatedChunks = Math.ceil(file.size / CHUNK_SIZE);
            console.log(`📊 [PARSE_LARGE] Configuration: ${chunkSizeMB} MB par chunk, ~${estimatedChunks} chunks estimés`);
            
            const reader = new FileReader();
            let offset = 0;
            let allData: Record<string, string>[] = [];
            let headers: string[] = [];
            let isFirstChunk = true;
            let delimiter = ';';
            let remainingLine = ''; // Pour gérer les lignes qui s'étendent sur plusieurs chunks
            let chunkNumber = 0;
            
            const readChunk = () => {
                chunkNumber++;
                const chunkStartTime = performance.now();
                
                if (offset >= file.size) {
                    // Traiter la dernière ligne restante
                    if (remainingLine.trim()) {
                        console.log(`📝 [PARSE_LARGE] Traitement de la dernière ligne restante`);
                        const values = remainingLine.split(delimiter);
                        const row: Record<string, string> = {};
                        headers.forEach((header, index) => {
                            row[header] = this.normalizeCsvValue(values[index] || '');
                        });
                        allData.push(row);
                    }
                    const endTime = performance.now();
                    const totalDuration = ((endTime - startTime) / 1000).toFixed(2);
                    console.log(`✅ [PARSE_LARGE] Parsing terminé en ${totalDuration}s`);
                    console.log(`📊 [PARSE_LARGE] Statistiques finales: ${allData.length} enregistrements, ${chunkNumber} chunks traités`);
                    resolve(allData);
                    return;
                }
                
                const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
                const chunkSize = chunkEnd - offset;
                const chunkSizeMB = (chunkSize / (1024 * 1024)).toFixed(2);
                const progress = ((offset / file.size) * 100).toFixed(1);
                console.log(`📦 [PARSE_LARGE] Chunk ${chunkNumber}/${estimatedChunks}: ${chunkSizeMB} MB (offset: ${offset}, progress: ${progress}%)`);
                
                const chunk = file.slice(offset, chunkEnd);
                try {
                    reader.readAsText(chunk, 'UTF-8');
                } catch (error) {
                    console.error(`❌ [PARSE_LARGE] Erreur lors de la lecture du chunk ${chunkNumber}:`, error);
                    reject(new Error(`Erreur lors de la lecture du chunk ${chunkNumber}: ${error}`));
                }
            };
            
            reader.onload = (e) => {
                const chunkProcessStartTime = performance.now();
                try {
                    console.log(`📥 [PARSE_LARGE] Chunk ${chunkNumber} chargé`);
                    let content = e.target?.result as string;
                    const contentSizeMB = (content.length / (1024 * 1024)).toFixed(2);
                    console.log(`📄 [PARSE_LARGE] Chunk ${chunkNumber} contenu: ${contentSizeMB} MB (${content.length} caractères)`);
                    
                    // Nettoyer le BOM UTF-8 seulement sur le premier chunk
                    if (isFirstChunk && content.charCodeAt(0) === 0xFEFF) {
                        content = content.slice(1);
                        console.log(`🔧 [PARSE_LARGE] BOM UTF-8 détecté et supprimé sur le premier chunk`);
                    }
                    
                    // Normaliser les retours à la ligne
                    const normalizeStartTime = performance.now();
                    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    const normalizeDuration = ((performance.now() - normalizeStartTime) / 1000).toFixed(3);
                    console.log(`🔧 [PARSE_LARGE] Chunk ${chunkNumber} normalisation: ${normalizeDuration}s`);
                    
                    // Ajouter la ligne restante du chunk précédent
                    if (remainingLine) {
                        console.log(`📝 [PARSE_LARGE] Chunk ${chunkNumber} ajout de la ligne restante (${remainingLine.length} caractères)`);
                        content = remainingLine + content;
                        remainingLine = '';
                    }
                    
                    // Détecter le délimiteur sur le premier chunk
                    if (isFirstChunk) {
                        const delimiterStartTime = performance.now();
                        delimiter = this.detectCsvDelimiter(content);
                        const delimiterDuration = ((performance.now() - delimiterStartTime) / 1000).toFixed(3);
                        console.log(`🔍 [PARSE_LARGE] Délimiteur détecté: "${delimiter}" (${delimiterDuration}s)`);
                    }
                    
                    // Parser le chunk ligne par ligne
                    const splitStartTime = performance.now();
                    const lines = content.split('\n');
                    const splitDuration = ((performance.now() - splitStartTime) / 1000).toFixed(3);
                    console.log(`📊 [PARSE_LARGE] Chunk ${chunkNumber} divisé en ${lines.length} lignes (${splitDuration}s)`);
                    
                    const chunkData: Record<string, string>[] = [];
                    
                    // Si ce n'est pas le dernier chunk, la dernière ligne peut être incomplète
                    const isLastChunk = offset + CHUNK_SIZE >= file.size;
                    const linesToProcess = isLastChunk ? lines.length : lines.length - 1;
                    console.log(`📊 [PARSE_LARGE] Chunk ${chunkNumber} traitement: ${linesToProcess} lignes (dernier chunk: ${isLastChunk})`);
                    
                    // Sauvegarder la dernière ligne si elle est incomplète
                    if (!isLastChunk && lines.length > 0) {
                        remainingLine = lines[lines.length - 1];
                        console.log(`📝 [PARSE_LARGE] Chunk ${chunkNumber} ligne incomplète sauvegardée (${remainingLine.length} caractères)`);
                    }
                    
                    const parseStartTime = performance.now();
                    for (let i = 0; i < linesToProcess; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        // Détecter les headers sur la première ligne du premier chunk
                        if (isFirstChunk && i === 0) {
                            const headerStartTime = performance.now();
                            headers = line.split(delimiter).map(header => this.normalizeColumnName(header));
                            const headerDuration = ((performance.now() - headerStartTime) / 1000).toFixed(3);
                            console.log(`📋 [PARSE_LARGE] Headers détectés (${headers.length} colonnes):`, headers);
                            console.log(`⏱️ [PARSE_LARGE] Normalisation des headers: ${headerDuration}s`);
                            isFirstChunk = false;
                            continue;
                        }
                        
                        // Parser la ligne de données
                        const values = line.split(delimiter);
                        const row: Record<string, string> = {};
                        headers.forEach((header, index) => {
                            row[header] = this.normalizeCsvValue(values[index] || '');
                        });
                        chunkData.push(row);
                    }
                    const parseDuration = ((performance.now() - parseStartTime) / 1000).toFixed(3);
                    console.log(`⏱️ [PARSE_LARGE] Chunk ${chunkNumber} parsing: ${parseDuration}s (${chunkData.length} enregistrements)`);
                    
                    allData.push(...chunkData);
                    isFirstChunk = false;
                    
                    // Mettre à jour la progression
                    const progress = Math.min(100, (offset / file.size) * 100);
                    this.progressPercentage = Math.round(progress);
                    this.processedRecords = allData.length;
                    this.currentStep = `Parsing de ${file.name}: ${allData.length} lignes traitées`;
                    this.cd.detectChanges();
                    
                    const chunkProcessDuration = ((performance.now() - chunkProcessStartTime) / 1000).toFixed(2);
                    console.log(`📊 [PARSE_LARGE] Chunk ${chunkNumber} terminé en ${chunkProcessDuration}s`);
                    console.log(`📊 [PARSE_LARGE] Progression globale: ${Math.round(progress)}% (${allData.length} enregistrements, ${chunkNumber}/${estimatedChunks} chunks)`);
                    
                    // Lire le chunk suivant après une petite pause pour permettre à l'UI de se mettre à jour
                    offset += CHUNK_SIZE;
                    setTimeout(() => {
                        readChunk();
                    }, 100); // Pause plus longue pour permettre à l'UI de se mettre à jour
                    
                } catch (error) {
                    const errorTime = performance.now();
                    const errorDuration = ((errorTime - startTime) / 1000).toFixed(2);
                    console.error(`❌ [PARSE_LARGE] Erreur lors du parsing du chunk ${chunkNumber} après ${errorDuration}s:`, error);
                    console.error(`❌ [PARSE_LARGE] Détails de l'erreur:`, {
                        chunkNumber: chunkNumber,
                        offset: offset,
                        fileSize: file.size,
                        allDataLength: allData.length,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : 'N/A'
                    });
                    reject(new Error(`Erreur lors du parsing du chunk ${chunkNumber}: ${error}`));
                }
            };
            
            reader.onerror = (error) => {
                const errorTime = performance.now();
                const errorDuration = ((errorTime - startTime) / 1000).toFixed(2);
                console.error(`❌ [PARSE_LARGE] Erreur FileReader pour le chunk ${chunkNumber} après ${errorDuration}s:`, error);
                console.error(`❌ [PARSE_LARGE] Détails de l'erreur FileReader:`, {
                    chunkNumber: chunkNumber,
                    offset: offset,
                    fileSize: file.size,
                    error: (error.target as FileReader)?.error
                });
                reject(new Error(`Erreur lors de la lecture du chunk ${chunkNumber}: ${error}`));
            };
            
            // Démarrer la lecture du premier chunk
            console.log(`🚀 [PARSE_LARGE] Démarrage du parsing par chunks`);
            readChunk();
        });
    }
    
    /**
     * Détecte le délimiteur CSV de manière robuste
     */
    private detectCsvDelimiter(content: string): string {
        const firstLines = content.split('\n').slice(0, 5).filter(line => line.trim().length > 0);
        if (firstLines.length === 0) return ';'; // Délimiteur par défaut
        
        const delimiters = [';', ',', '\t', '|'];
        const delimiterScores: { [key: string]: number } = {};
        
        // Initialiser les scores
        delimiters.forEach(d => delimiterScores[d] = 0);
        
        // Analyser les premières lignes
        firstLines.forEach(line => {
            delimiters.forEach(delimiter => {
                // Compter les occurrences du délimiteur
                const count = (line.match(new RegExp('\\' + delimiter, 'g')) || []).length;
                delimiterScores[delimiter] += count;
                
                // Bonus si le délimiteur est entouré de guillemets (indique un CSV bien formaté)
                const quotedPattern = new RegExp(`"[^"]*"\\${delimiter}`, 'g');
                const quotedMatches = (line.match(quotedPattern) || []).length;
                delimiterScores[delimiter] += quotedMatches * 2;
            });
        });
        
        // Trouver le délimiteur avec le meilleur score
        let bestDelimiter = ';'; // Délimiteur par défaut
        let bestScore = 0;
        
        for (const delimiter of delimiters) {
            const score = delimiterScores[delimiter];
            if (score > bestScore) {
                bestScore = score;
                bestDelimiter = delimiter;
            }
        }
        
        console.log(`🔍 Scores des délimiteurs:`, delimiterScores);
        return bestDelimiter;
    }
    
    /**
     * Normalise un nom de colonne en corrigeant l'encodage et en nettoyant les caractères
     */
    private normalizeColumnName(header: string): string {
        if (!header) return '';
        
        // Corriger les caractères mal encodés (é, è, à, etc.)
        let normalized = fixGarbledCharacters(header);
        
        // Nettoyer les espaces
        normalized = normalized.trim();
        
        // Supprimer les guillemets
        if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
            (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.slice(1, -1);
        }
        
        // Nettoyer les caractères invisibles
        normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        // Remplacer les espaces multiples par un seul
        normalized = normalized.replace(/\s+/g, ' ');
        
        return normalized.trim();
    }
    
    /**
     * Normalise une valeur CSV
     */
    private normalizeCsvValue(value: string): string {
        if (value === null || value === undefined) return '';
        
        let normalized = String(value).trim();
        
        // Supprimer les guillemets inutiles
        if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
            (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.slice(1, -1);
        }
        
        return normalized;
    }
    
    /**
     * Parse un CSV sans header (fallback)
     */
    private parseCsvWithoutHeader(content: string, delimiter: string): Promise<Record<string, string>[]> {
        return new Promise((resolve, reject) => {
            Papa.parse(content, {
                header: false,
                delimiter: delimiter,
                skipEmptyLines: true,
                complete: (results) => {
                    const rawRows = results.data as any[][];
                    
                    if (rawRows.length === 0) {
                        reject(new Error('Aucune donnée trouvée'));
                        return;
                    }
                    
                    // Utiliser la première ligne comme header
                    const headers = (rawRows[0] || []).map((h: any) => 
                        this.normalizeColumnName(String(h || '')) || `Colonne_${rawRows[0].indexOf(h) + 1}`
                    );
                    
                    // Créer les objets de données
                    const data: Record<string, string>[] = [];
                    for (let i = 1; i < rawRows.length; i++) {
                        const row: Record<string, string> = {};
                        const values = rawRows[i] || [];
                        
                        headers.forEach((header, index) => {
                            row[header] = this.normalizeCsvValue(values[index] || '');
                        });
                        
                        data.push(row);
                    }
                    
                    console.log(`✅ CSV parsé sans header: ${data.length} enregistrements`);
                    resolve(data);
                },
                error: (error) => {
                    reject(new Error(`Erreur lors du parsing: ${error.message}`));
                }
            });
        });
    }

    /**
     * Démarre le mode magique avec flux robuste en deux étapes
     */
    async startMagicMode(): Promise<void> {
        console.log('🪄 Démarrage du mode magique (flux robuste)...');
        
        // Vérifier si des fichiers sont disponibles dans l'état
        const uploadedFiles = this.appStateService.getUploadedFiles();
        
        if (!uploadedFiles.boFile || !uploadedFiles.partnerFile) {
            console.log('⚠️ Aucun fichier disponible, redirection vers le launcher...');
            this.router.navigate(['/reconciliation-launcher'], { queryParams: { mode: 'magic' } });
            return;
        }
        
        // Afficher l'état de chargement
        this.isLoading = true;
        this.error = null;
        
        try {
            // Créer un FormData avec les fichiers disponibles
            const formData = new FormData();
            formData.append('boFile', uploadedFiles.boFile);
            formData.append('partnerFile', uploadedFiles.partnerFile);
            
            // Étape 1: Analyse des clés de réconciliation
            console.log('🔍 Étape 1: Analyse des clés de réconciliation...');
            const analysisResponse = await this.reconciliationService.analyzeReconciliationKeys(formData).toPromise();
            
            if (!analysisResponse || !analysisResponse.suggestions || analysisResponse.suggestions.length === 0) {
                throw new Error('Aucune suggestion de clé trouvée lors de l\'analyse');
            }
            
            // Trouver la suggestion avec le plus haut score de confiance
            const bestSuggestion = analysisResponse.suggestions.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
            );
            
            console.log('🎯 Meilleure suggestion trouvée:', bestSuggestion);
            
            // Étape 2: Décision basée sur le seuil de confiance
            if (bestSuggestion.confidence > 0.90) {
                console.log('✅ Confiance élevée détectée, lancement de la réconciliation...');
                
                // Créer la configuration de réconciliation
                const config: ReconciliationConfig = {
                    boFile: uploadedFiles.boFile,
                    partnerFile: uploadedFiles.partnerFile,
                    boReconciliationKey: bestSuggestion.boColumn,
                    partnerReconciliationKey: bestSuggestion.partnerColumn,
                    additionalKeys: bestSuggestion.additionalKeys || [],
                    tolerance: 0.01 // Tolérance par défaut
                };
                
                // Lancer la réconciliation
                const reconciliationResponse = await this.reconciliationService.executeReconciliation(config).toPromise();
                
                if (reconciliationResponse) {
                    console.log('✅ Réconciliation terminée:', reconciliationResponse);
                    // La réconciliation est déjà terminée avec l'API /reconcile, 
                    // on peut directement charger les résultats
                    this.loadReconciliationResults(null);
                } else {
                    throw new Error('Aucune réponse reçue lors de la réconciliation');
                }
            } else {
                console.warn('⚠️ Confiance insuffisante:', bestSuggestion.confidence);
                this.error = `Échec de la détection automatique : Confiance insuffisante (${(bestSuggestion.confidence * 100).toFixed(1)}%). Veuillez utiliser le Mode Assisté pour choisir les clés manuellement.`;
                this.isLoading = false;
            }
            
        } catch (error) {
            console.error('❌ Erreur lors du démarrage du mode magique:', error);
            this.error = 'Erreur lors du démarrage du mode magique: ' + (error instanceof Error ? error.message : I18nService.t('COMMON.errors.unknown'));
            this.isLoading = false;
        } finally {
            this.cd.detectChanges();
        }
    }

    ngOnDestroy(): void {
        console.log('🧹 Nettoyage du ReconciliationComponent');
        this.destroy$.next();
        this.destroy$.complete();
        
        // Annuler la réconciliation en cours si nécessaire
        if (this.currentJobId && this.isLoading) {
            this.cancelReconciliation();
        }
    }


    /**
     * Met à jour la progression avec les vraies données
     */
    private updateProgress(progress: ProgressUpdate): void {
        this.progressPercentage = progress.percentage;
        this.processedRecords = progress.processed;
        this.totalRecords = progress.total;
        this.currentStep = progress.step;
        this.estimatedTimeRemaining = progress.estimatedTimeRemaining || 0;
        
        if (progress.currentFile !== undefined) {
            this.progressCurrentFile = progress.currentFile;
        }
        if (progress.totalFiles !== undefined) {
            this.progressTotalFiles = progress.totalFiles;
        }

        console.log(`📈 Progression: ${progress.percentage}% - ${progress.step}`);
        this.cd.detectChanges();
    }

    /**
     * Gère la fin de réconciliation
     */
    private handleReconciliationComplete(payload: any): void {
        console.log('✅ Réconciliation terminée:', payload);
        
        this.reconciliationResponse = payload.result || payload;
        this.isLoading = false;
        this.showProgress = false;
        this.executionTime = Date.now() - this.startTime;
        
        // Mettre à jour avec les vraies données de performance
        if (payload.executionTimeMs) {
            this.executionTime = payload.executionTimeMs;
        }
        if (payload.processedRecords) {
            this.processedRecords = payload.processedRecords;
        }
        if (payload.progressPercentage) {
            this.progressPercentage = payload.progressPercentage;
        }
        
        // Notifier la fin de la réconciliation
        this.appStateService.completeReconciliation();
        
        // Afficher la popup de performance
        this.showPerformancePopup = true;
        
        // Réinitialiser le jobId
        this.currentJobId = null;
        
        this.cd.detectChanges();
    }

    /**
     * Gère les erreurs de réconciliation
     */
    private handleReconciliationError(payload: any): void {
        console.error('❌ Erreur de réconciliation:', payload);
        
        this.error = payload.error || 'Une erreur est survenue lors de la réconciliation';
        this.isLoading = false;
        this.showProgress = false;
        
        // Notifier la fin de la réconciliation même en cas d'erreur
        this.appStateService.completeReconciliation();
        
        // Réinitialiser le jobId
        this.currentJobId = null;
        
        this.cd.detectChanges();
    }

    /**
     * Démarre la réconciliation avec la nouvelle architecture
     */
    startReconciliation(config: ReconciliationConfig) {
        console.log('🚀 Démarrage de la réconciliation avec config:', config);
        console.log('✅ Mode HTTP classique activé');

        // Réinitialiser l'état
        this.reconciliationRequest = null;
        this.reconciliationResponse = null;
        this.isLoading = true;
        this.error = null;
        this.showProgress = true;
        this.startTime = Date.now();
        this.progressPercentage = 0;
        this.processedRecords = 0;
        this.totalRecords = 0;
        this.currentStep = 'Préparation des fichiers...';
        this.showPerformancePopup = false;

        // Notifier le début de la réconciliation
        this.appStateService.startReconciliation('reconciliation');

        // Démarrer la réconciliation via le service
        this.reconciliationService.startReconciliation(config)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    console.log('📤 Réconciliation démarrée, jobId:', response.jobId);
                    this.currentJobId = response.jobId;
                    this.currentStep = 'Réconciliation en cours...';
                    this.cd.detectChanges();
                },
                error: (error) => {
                    console.error('❌ Erreur lors du démarrage de la réconciliation:', error);
                    this.handleError('Erreur lors du démarrage de la réconciliation: ' + error.message);
                }
            });
    }

    /**
     * Annule la réconciliation en cours
     */
    cancelReconciliation(): void {
        if (this.currentJobId && this.isLoading) {
            console.log('❌ Annulation de la réconciliation...');
            
            this.reconciliationService.cancelReconciliation(this.currentJobId)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (response) => {
                        console.log('✅ Réconciliation annulée:', response);
                        this.isLoading = false;
                        this.showProgress = false;
                        this.currentJobId = null;
                        this.appStateService.completeReconciliation();
                        this.cd.detectChanges();
                    },
                    error: (error) => {
                        console.error('❌ Erreur lors de l\'annulation:', error);
                        this.handleError('Erreur lors de l\'annulation: ' + error.message);
                    }
                });
        }
    }

    /**
     * Gère les erreurs
     */
    private handleError(message: string): void {
        this.error = message;
        this.isLoading = false;
        this.showProgress = false;
        this.currentJobId = null;
        this.appStateService.completeReconciliation();
        this.cd.detectChanges();
    }

    /**
     * Ferme la popup de performance
     */
    closePerformancePopup(): void {
        this.showPerformancePopup = false;
    }

    /**
     * Formate le temps d'exécution
     */
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

    /**
     * Obtient le temps écoulé
     */
    getElapsedTime(): number {
        return this.startTime > 0 ? Date.now() - this.startTime : 0;
    }

    /**
     * Obtient une valeur sécurisée
     */
    getSafeValue(value: number | null | undefined): number {
        return value || 0;
    }

    /**
     * Obtient les valeurs spécifiques pour un champ donné
     */
    getFieldValues(fieldName: string, fileName?: string): string[] {
        return this.orangeMoneyUtilsService.getFieldValues(fieldName, fileName);
    }

    /**
     * Vérifie si la réconciliation peut être annulée
     */
    canCancelReconciliation(): boolean {
        return this.isLoading && this.currentJobId !== null;
    }

    /**
     * Obtient le statut de connexion pour l'affichage
     */
    getConnectionStatusText(): string {
        return 'Connecté (HTTP)';
    }

    /**
     * Obtient la classe CSS pour le statut de connexion
     */
    getConnectionStatusClass(): string {
        return 'connected';
    }



    private createRealisticMockData(): any[] {
        // Créer des données simulées réalistes basées sur vos fichiers CSV
        const mockData = [];
        
        // Générer 10 correspondances réalistes
        for (let i = 1; i <= 10; i++) {
            const key = `CLE${i.toString().padStart(3, '0')}`;
            const amount = (1000000 + i * 50000).toString();
            const date = `2024-01-${(15 + i).toString().padStart(2, '0')}`;
            const agency = `Agence ${String.fromCharCode(65 + (i % 5))}`;
            const service = `Service ${(i % 3) + 1}`;
            
            mockData.push({
                key: key,
                boData: {
                    'CLE': key,
                    'montant': amount,
                    'Date': date,
                    'Agence': agency,
                    'Service': service,
                    'IDTransaction': `${key}_CM`,
                    'Type': 'Transaction'
                },
                partnerData: {
                    'CLE': key,
                    'montant': amount,
                    'Date': date,
                    'Agence': agency,
                    'Service': service,
                    'Id': key,
                    'Type': 'Transaction'
                },
                differences: []
            });
        }
        
        return mockData;
    }
} 