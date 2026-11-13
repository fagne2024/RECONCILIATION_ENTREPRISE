import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { DataNormalizationService } from './data-normalization.service';
import { PaysService } from './pays.service';
import { ThemeService } from './theme.service';
import { LogoService } from './logo.service';
import { countryNamesFromCodes } from '../utils/country-codes.util';
import { ReconciliationResponse } from '../models/reconciliation-response.model';
import { MagicServiceSummary } from './magic-reconciliation.service';
import {
  APP_NAVIGATION_CATALOG,
  NavigationAccessContext,
  buildNavigationAccessContext,
  findNavigationAccessContextByAccessModuleName,
  findNavigationAccessContextByModuleName,
  findNavigationAccessContextByRoute,
  getAllNavigationAccessContexts,
  groupUsesGranularSubmenuAccess
} from '../constants/app-navigation-catalog';

export type ReconciliationLaunchMode = 'manual' | 'assisted' | 'magic';

const RECONCILIATION_LAUNCH_MODE_KEY = 'reconciliationLaunchMode';
const RECONCILIATION_ENTRY_PATH_KEY = 'reconciliationEntryPath';

export interface ReconciliationState {
    isActive: boolean;
    lastUpdate: Date | null;
    needsRefresh: boolean;
}

export interface UserPaysScope {
  isGlobal: boolean;
  codes: string[] | null;
  names: string[] | null;
}

export interface UserRights {
  profil: string;
  modules: string[];
  permissions: { [module: string]: string[] };
  pays?: UserPaysScope;
  /** Modules actifs pour l'entreprise courante (provenant de /api/modules/active). */
  activeModules?: string[];
}

@Injectable({
    providedIn: 'root'
})
export class AppStateService {
    private readonly postLoginRouteCandidates: Array<{ path: string; module?: string; permissions?: string[] }> = [
        { path: '/reconciliation-launcher', module: 'Réconciliation', permissions: ['consulter'] },
        { path: '/dashboard', module: 'Dashboard', permissions: ['consulter', 'filtrer'] },
        { path: '/results', module: 'Résultats', permissions: ['consulter'] },
        { path: '/stats', module: 'Statistiques', permissions: ['consulter'] },
        { path: '/stats-report', module: 'Statistiques', permissions: ['consulter'] },
        { path: '/stats-report-graph', module: 'Statistiques', permissions: ['consulter'] },
        { path: '/comptes', module: 'Comptes', permissions: ['consulter'] },
        { path: '/operations', module: 'Opérations', permissions: ['consulter'] },
        { path: '/frais', module: 'Frais', permissions: ['consulter'] },
        { path: '/ranking', module: 'Classements', permissions: ['consulter'] },
        { path: '/traitement', module: 'Traitement', permissions: ['consulter'] },
        { path: '/banque', module: 'BANQUE', permissions: ['consulter'] },
        { path: '/etat-reconciliation-bancaire', module: 'BANQUE', permissions: ['consulter'] },
        { path: '/comptabilite', module: 'Comptabilité', permissions: ['consulter'] },
        { path: '/service-references', module: 'Dashboard', permissions: ['consulter'] },
        { path: '/aide' },
        { path: '/user-profile' }
    ];

    private currentStepSubject = new BehaviorSubject<number>(1);
    currentStep$ = this.currentStepSubject.asObservable();

    private statsDataSubject = new BehaviorSubject<any[]>([]);
    statsData$ = this.statsDataSubject.asObservable();

    private selectedServiceSubject = new BehaviorSubject<string>('');
    selectedService$ = this.selectedServiceSubject.asObservable();

    // Données temporaires pour la réconciliation
    private boDataSubject = new BehaviorSubject<Record<string, string>[]>([]);
    boData$ = this.boDataSubject.asObservable();

    private partnerDataSubject = new BehaviorSubject<Record<string, string>[]>([]);
    partnerData$ = this.partnerDataSubject.asObservable();

    // Données des résultats de la réconciliation
    private reconciliationResultSubject = new BehaviorSubject<ReconciliationResponse | null>(null);
    reconciliationResult$ = this.reconciliationResultSubject.asObservable();

    private magicServiceSummariesSubject = new BehaviorSubject<MagicServiceSummary[]>([]);
    magicServiceSummaries$ = this.magicServiceSummariesSubject.asObservable();

    private magicPartnerFileNamesSubject = new BehaviorSubject<string[]>([]);
    magicPartnerFileNames$ = this.magicPartnerFileNamesSubject.asObservable();

    private selectedMagicPartnerFileSubject = new BehaviorSubject<string>('');
    selectedMagicPartnerFile$ = this.selectedMagicPartnerFileSubject.asObservable();

    private selectedMagicServiceSubject = new BehaviorSubject<string>('');
    selectedMagicService$ = this.selectedMagicServiceSubject.asObservable();

    // Response complète multi-services (toutes les cards) posée à la fin de la réconciliation
    // magique. Conservée séparément car le lazy-load par card écrase la réponse courante.
    private magicFullResponseSubject = new BehaviorSubject<ReconciliationResponse | null>(null);
    magicFullResponse$ = this.magicFullResponseSubject.asObservable();

    // Gestion de la progression de la réconciliation
private reconciliationProgressSubject = new BehaviorSubject<boolean>(false);
    private reconciliationStartTimeSubject = new BehaviorSubject<number>(0);
    private lastEditedModelIdSubject = new BehaviorSubject<string | null>(null);
    private reconciliationStateSubject = new BehaviorSubject<ReconciliationState>({
        isActive: false,
        lastUpdate: null,
        needsRefresh: false
    });

    private dataUpdateSubject = new BehaviorSubject<boolean>(false);

    private userRights: UserRights | null = null;
    private username: string | null = null;
    private token: string | null = null;
    /** Vrai tant que le backend impose un changement de mot de passe (flag mustChangePassword). */
    private mustChangePassword = false;
    /** Garde anti-reentrance du logout (POST /api/auth/logout unique). */
    private loggingOut = false;
    private normalizedModuleSet = new Set<string>();

    // Gestion des fichiers uploadés
    private uploadedFilesSubject = new BehaviorSubject<{ boFile: File | null; partnerFile: File | null }>({
        boFile: null,
        partnerFile: null
    });
    uploadedFiles$ = this.uploadedFilesSubject.asObservable();



    constructor(
        private http: HttpClient,
        private dataNormalizationService: DataNormalizationService,
        private router: Router,
        private paysService: PaysService,
        private themeService: ThemeService,
        private logoService: LogoService
    ) {
        // Charger l'utilisateur et le token depuis le localStorage au démarrage
        this.loadUserFromStorage();
    }

    setCurrentStep(step: number) {
        this.currentStepSubject.next(step);
    }

    getCurrentStep(): number {
        return this.currentStepSubject.value;
    }

    async setStatsData(data: any) {
        if (!data) {
            return;
        }
        try {
            // Utiliser les données directement sans normalisation
            const normalizedData = data;

            // Formatage des données pour le backend
            const formattedData = normalizedData.map((item: any) => {
                // Conversion des valeurs numériques
                const totalVolume = typeof item.totalVolume === 'string' 
                    ? parseFloat(item.totalVolume.replace(/,/g, '')) 
                    : Number(item.totalVolume);
                
                const recordCount = typeof item.recordCount === 'string'
                    ? parseInt(item.recordCount.replace(/,/g, ''))
                    : Number(item.recordCount);

                // Formatage de la date
                const date = item.date ? new Date(item.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

                const formatted = {
                    agency: item.agency || '',
                    service: item.service || '',
                    date: date,
                    totalVolume: totalVolume || 0,
                    recordCount: recordCount || 0
                };
                return formatted;
            });

            const response = await this.http.post('/api/statistics/save', formattedData).toPromise();
            this.statsDataSubject.next(normalizedData);
        } catch (error) {
            throw error;
        }
    }

    getStatsData(): Observable<any[]> {
        return this.statsData$;
    }

    clearStatsData() {
        this.statsDataSubject.next([]);
    }

    startReconciliation(service: string) {
        this.selectedServiceSubject.next(service);
        this.setCurrentStep(2);
        this.reconciliationStateSubject.next({
            isActive: true,
            lastUpdate: null,
            needsRefresh: false // Ne pas rafraîchir automatiquement au début
        });
    }

    getSelectedService(): string {
        return this.selectedServiceSubject.value;
    }

    // Méthodes pour les données de réconciliation
    setReconciliationData(boData: Record<string, string>[], partnerData: Record<string, string>[]) {
        this.boDataSubject.next(boData);
        this.partnerDataSubject.next(partnerData);
    }

    setReconciliationType(type: '1-1' | '1-2' | '1-3' | '1-4' | '1-5') {
        // Stocker dans localStorage pour persistance
        localStorage.setItem('reconciliationType', type);
    }

    getReconciliationType(): '1-1' | '1-2' | '1-3' | '1-4' | '1-5' {
        const type = localStorage.getItem('reconciliationType') as '1-1' | '1-2' | '1-3' | '1-4' | '1-5';
        return type || '1-1'; // Par défaut 1-1
    }

    setReconciliationLaunchMode(mode: ReconciliationLaunchMode): void {
        try {
            localStorage.setItem(RECONCILIATION_LAUNCH_MODE_KEY, mode);
        } catch {
            // ignore quota errors
        }
    }

    getReconciliationLaunchMode(): ReconciliationLaunchMode {
        const stored = localStorage.getItem(RECONCILIATION_LAUNCH_MODE_KEY);
        if (stored === 'manual' || stored === 'assisted' || stored === 'magic') {
            return stored;
        }
        return 'manual';
    }

    setReconciliationEntryPath(path: string): void {
        try {
            localStorage.setItem(RECONCILIATION_ENTRY_PATH_KEY, path);
        } catch {
            // ignore
        }
    }

    getReconciliationEntryPath(): string {
        return localStorage.getItem(RECONCILIATION_ENTRY_PATH_KEY) || '';
    }

    getDefaultEntryPathForMode(mode: ReconciliationLaunchMode): string {
        switch (mode) {
            case 'assisted':
                return '/upload-assisted';
            case 'magic':
                return '/reconciliation-launcher';
            default:
                return '/upload';
        }
    }

    /** Réinitialise l'état d'une réconciliation terminée (conserve le mode utilisé). */
    resetForNewReconciliation(): void {
        this.clearReconciliationResults();
        this.clearReconciliationData();
        this.clearUploadedFiles();
        this.setCurrentStep(1);
    }

    getBoData(): Record<string, string>[] {
        return this.boDataSubject.value;
    }

    getPartnerData(): Record<string, string>[] {
        return this.partnerDataSubject.value;
    }

    clearReconciliationData() {
        this.boDataSubject.next([]);
        this.partnerDataSubject.next([]);
    }

    clearUploadedFiles() {
        this.uploadedFilesSubject.next({ boFile: null, partnerFile: null });
    }

    // Méthodes pour les résultats de la réconciliation
    setReconciliationResults(results: ReconciliationResponse) {
        this.reconciliationResultSubject.next(results);
    }

    getReconciliationResults(): Observable<ReconciliationResponse | null> {
        return this.reconciliationResult$;
    }

    getCurrentReconciliationResults(): ReconciliationResponse | null {
        return this.reconciliationResultSubject.value;
    }

    clearReconciliationResults() {
        this.reconciliationResultSubject.next(null);
        this.magicServiceSummariesSubject.next([]);
        this.magicPartnerFileNamesSubject.next([]);
        this.selectedMagicPartnerFileSubject.next('');
        this.selectedMagicServiceSubject.next('');
        this.magicFullResponseSubject.next(null);
    }

    setMagicServiceSummaries(summaries: MagicServiceSummary[]) {
        this.magicServiceSummariesSubject.next(summaries);
    }

    getMagicServiceSummaries(): MagicServiceSummary[] {
        return this.magicServiceSummariesSubject.value;
    }

    setMagicFullResponse(response: ReconciliationResponse | null) {
        this.magicFullResponseSubject.next(response);
    }

    getMagicFullResponse(): ReconciliationResponse | null {
        return this.magicFullResponseSubject.value;
    }

    setMagicPartnerFileNames(fileNames: string[]) {
        this.magicPartnerFileNamesSubject.next(fileNames);
    }

    getMagicPartnerFileNames(): string[] {
        return this.magicPartnerFileNamesSubject.value;
    }

    setSelectedMagicPartnerFile(fileName: string) {
        this.selectedMagicPartnerFileSubject.next(fileName);
    }

    getSelectedMagicPartnerFile(): string {
        return this.selectedMagicPartnerFileSubject.value;
    }

    setSelectedMagicService(service: string) {
        this.selectedMagicServiceSubject.next(service || '');
    }

    getSelectedMagicService(): string {
        return this.selectedMagicServiceSubject.value;
    }

    // Gestion de la progression de la réconciliation
    setReconciliationProgress(show: boolean) {
        this.reconciliationProgressSubject.next(show);
        if (show) {
            this.reconciliationStartTimeSubject.next(Date.now());
        }
    }

    getReconciliationProgress(): Observable<boolean> {
        return this.reconciliationProgressSubject.asObservable();
    }

    getReconciliationStartTime(): number {
        return this.reconciliationStartTimeSubject.value;
    }

    setLastEditedModelId(modelId: string | null) {
        this.lastEditedModelIdSubject.next(modelId);
    }

    getLastEditedModelId(): string | null {
        return this.lastEditedModelIdSubject.value;
    }

    getLastEditedModelId$(): Observable<string | null> {
        return this.lastEditedModelIdSubject.asObservable();
    }

    // Observable pour les changements d'état de réconciliation
    get reconciliationState$(): Observable<ReconciliationState> {
        return this.reconciliationStateSubject.asObservable();
    }

    // Observable pour les mises à jour de données
    get dataUpdate$(): Observable<boolean> {
        return this.dataUpdateSubject.asObservable();
    }

    // Méthodes pour gérer l'état de réconciliation
    completeReconciliation() {
        this.reconciliationStateSubject.next({
            isActive: false,
            lastUpdate: new Date(),
            needsRefresh: false // Ne pas rafraîchir automatiquement
        });
    }

    // Notifier quand le résumé est enregistré avec succès
    notifySummarySaved() {
        this.reconciliationStateSubject.next({
            isActive: false,
            lastUpdate: new Date(),
            needsRefresh: true
        });
        
        // Notifier que les données ont été mises à jour
        this.notifyDataUpdate();
    }

    // Notifier une mise à jour de données
    notifyDataUpdate() {
        this.dataUpdateSubject.next(true);
    }

    // Marquer que les données ont été rafraîchies
    markDataRefreshed() {
        const currentState = this.reconciliationStateSubject.value;
        this.reconciliationStateSubject.next({
            ...currentState,
            needsRefresh: false
        });
    }

    // Obtenir l'état actuel
    getCurrentState(): ReconciliationState {
        return this.reconciliationStateSubject.value;
    }

    setUserRights(rights: UserRights, username?: string, token?: string) {
        const permissionModules = Object.keys(rights.permissions ?? {});
        const mergedModules = Array.from(new Set([...(rights.modules ?? []), ...permissionModules]));
        const deduplicatedModules: string[] = [];
        const seen = new Set<string>();
        mergedModules.forEach(moduleName => {
            const normalized = this.normalizeModuleName(moduleName);
            if (!normalized || seen.has(normalized)) {
                return;
            }
            seen.add(normalized);
            deduplicatedModules.push(moduleName);
        });

        this.userRights = {
            ...rights,
            modules: deduplicatedModules,
            pays: rights.pays ? this.normalizePaysScope(rights.pays) : rights.pays
        };
        this.rebuildNormalizedModuleSet(deduplicatedModules);
        if (username) this.username = username;
        if (token && token !== 'cookie') {
            this.token = token;
        } else {
            this.token = 'cookie';
        }
        localStorage.setItem('userRights', JSON.stringify(this.userRights));
        if (username) localStorage.setItem('username', username);
        localStorage.removeItem('auth_token');
    }

    setUserPaysScope(scope: UserPaysScope): void {
        if (!this.userRights) {
            return;
        }
        this.userRights = { ...this.userRights, pays: scope };
        localStorage.setItem('userRights', JSON.stringify(this.userRights));
    }

    /**
     * Définit si l'utilisateur DOIT changer son mot de passe (flag du backend
     * `mustChangePassword`, ex. mot de passe provisoire du SUPER_ADMIN).
     * L'AuthGuard bloque l'accès au reste de l'application tant que c'est vrai.
     */
    setMustChangePassword(required: boolean): void {
        this.mustChangePassword = required === true;
        localStorage.setItem('mustChangePassword', this.mustChangePassword ? '1' : '0');
    }

    isMustChangePassword(): boolean {
        return this.mustChangePassword;
    }

    /** Lève l'obligation de changement (appelé après un changement réussi). */
    clearMustChangePassword(): void {
        this.setMustChangePassword(false);
    }

    getUserPaysScope(): UserPaysScope | null {
        return this.userRights?.pays ?? null;
    }

    getProfileCountryNames(): string[] {
        const scope = this.getUserPaysScope();
        if (!scope || scope.isGlobal) {
            return [];
        }
        const fromScope = (scope.names ?? []).filter((name) => !!name && name.trim().length > 0);
        if (fromScope.length) {
            return fromScope;
        }
        return countryNamesFromCodes(scope.codes);
    }

    private isPaysScopeComplete(scope: UserPaysScope | null): boolean {
        if (!scope) {
            return false;
        }
        if (scope.isGlobal) {
            return true;
        }
        return !!(scope.codes && scope.codes.length > 0);
    }

    private normalizePaysScope(scope: UserPaysScope): UserPaysScope {
        if (scope.isGlobal) {
            return scope;
        }
        const codes = scope.codes ?? [];
        const namesFromScope = (scope.names ?? []).filter((name) => !!name && name.trim().length > 0);
        const names = namesFromScope.length ? namesFromScope : countryNamesFromCodes(codes);
        return { isGlobal: false, codes, names };
    }

    /**
     * Charge le périmètre pays du profil (login ou API) avant d'afficher les écrans filtrés par pays.
     */
    ensureUserPaysScope(forceRefresh = false): Observable<UserPaysScope> {
        const cached = !forceRefresh ? this.getUserPaysScope() : null;
        if (cached && this.isPaysScopeComplete(cached)) {
            const normalized = this.normalizePaysScope(cached);
            if (normalized !== cached) {
                this.setUserPaysScope(normalized);
            }
            return of(normalized);
        }

        const username = this.getUsername();
        if (!username || username === 'admin') {
            const globalScope: UserPaysScope = { isGlobal: true, codes: null, names: null };
            this.setUserPaysScope(globalScope);
            return of(globalScope);
        }

        return this.paysService.getAllowedPaysCodesForCurrentUser().pipe(
            map((response) => {
                if (response.isGlobal) {
                    return { isGlobal: true, codes: null, names: null } as UserPaysScope;
                }
                const codes = response.codes ?? [];
                const namesFromApi = (response.names ?? []).filter((name) => !!name && name.trim().length > 0);
                const names = namesFromApi.length ? namesFromApi : countryNamesFromCodes(codes);
                return { isGlobal: false, codes, names } as UserPaysScope;
            }),
            catchError(() => {
                const fallback: UserPaysScope = { isGlobal: false, codes: [], names: [] };
                return of(fallback);
            }),
            tap((scope) => this.setUserPaysScope(scope))
        );
    }

    setToken(token: string) {
        this.token = token === 'cookie' ? 'cookie' : token;
        localStorage.removeItem('auth_token');
    }

    getToken(): string | null {
        return this.token;
    }

    private loadUserFromStorage() {
        localStorage.removeItem('auth_token');
        const rightsStr = localStorage.getItem('userRights');
        const username = localStorage.getItem('username');
        if (rightsStr && username) {
            try {
                this.userRights = JSON.parse(rightsStr);
                this.username = username;
                this.token = 'cookie';
                this.mustChangePassword = localStorage.getItem('mustChangePassword') === '1';
                this.rebuildNormalizedModuleSet();
            } catch (e) {
                localStorage.removeItem('userRights');
                localStorage.removeItem('username');
                localStorage.removeItem('auth_token');
                localStorage.removeItem('mustChangePassword');
            }
        }
    }

    logout() {
        // Anti-reentrance : logout() peut être rappelé par l'intercepteur (401
        // reçu sur /api/auth/logout) ; on n'exécute qu'une seule requête.
        if (this.loggingOut) {
            return;
        }
        this.loggingOut = true;
        this.http.post('/api/auth/logout', {}, { withCredentials: true }).subscribe({
            complete: () => { this.loggingOut = false; },
            error: () => { /* cookie déjà expirée ou backend indisponible */ this.loggingOut = false; }
        });
        this.userRights = null;
        this.username = null;
        this.token = null;
        this.mustChangePassword = false;
        this.normalizedModuleSet.clear();
        localStorage.removeItem('userRights');
        localStorage.removeItem('username');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('mustChangePassword');
        // La marque (logo + thème) est propre à l'entreprise : on repasse aux
        // valeurs par défaut de l'application pour ne jamais laisser « fuiter »
        // le thème d'une entreprise vers un autre compte (ex. SUPER_ADMIN).
        this.themeService.useDefaults();
        this.logoService.useDefaults();
    }

    isAuthenticated(): boolean {
        return !!(this.username && this.userRights);
    }

    getUserRights(): UserRights | null {
        return this.userRights;
    }

    getUsername(): string | null {
        return this.username;
    }

    isAdmin(): boolean {
        // Vérifier si l'utilisateur est admin par son nom d'utilisateur OU par son profil
        if (this.username === 'admin') {
            return true;
        }
        // Vérifier si le profil est ADMIN, ADMINISTRATEUR, ou Admin (insensible à la casse)
        const profil = this.userRights?.profil;
        if (!profil) {
            return false;
        }
        const profilUpper = profil.toUpperCase();
        // Vérifier toutes les variations possibles : ADMIN, ADMINISTRATEUR, Admin
        return profilUpper === 'ADMIN' || profilUpper === 'ADMINISTRATEUR';
    }

    /** Vrai si l'utilisateur connecté est un SUPER_ADMIN de la plateforme. */
    isSuperAdmin(): boolean {
        return this.username === 'superadmin' || this.getUserRights()?.profil === 'SUPER_ADMIN';
    }

    /** Modules actifs pour l'entreprise courante (dès que /api/modules/active a été appelé). */
    getActiveModules(): string[] {
        return this.userRights?.activeModules ?? [];
    }

    /** Définit les modules actifs (appelé après /api/modules/active). */
    setActiveModules(modules: string[]): void {
        if (this.userRights) {
            this.userRights = { ...this.userRights, activeModules: modules };
            localStorage.setItem('userRights', JSON.stringify(this.userRights));
        }
    }

    /** Vérifie si un module est actif pour l'entreprise courante. */
    isModuleActive(module: string): boolean {
        const activeModules = this.getActiveModules();
        if (!activeModules.length) {
            return false;
        }
        const normalizedTarget = this.normalizeModuleName(module);
        return activeModules.some(m => this.normalizeModuleName(m) === normalizedTarget);
    }

    /** Profil métier « Contrôle Interne » (sans inclure l'admin). */
    isControleInterneProfil(): boolean {
        const token = this.normalizeProfilToken(this.userRights?.profil);
        if (!token) {
            return false;
        }
        return token === 'CONTROLEINTERNE'
            || (token.includes('CONTROLE') && token.includes('INTERNE'));
    }

    private readonly controleInterneAccessModule =
        'Résultats · Contrôle interne BO vs Partenaire';

    /** Action cochée sur un sous-menu navigation (module d'accès granulaire). */
    hasCheckedAction(accessModuleName: string, action: string): boolean {
        return this.hasGranularModulePermission(accessModuleName, action);
    }

    /** Action cochée pour une route de navigation. */
    hasRouteAction(route: string, action: string): boolean {
        const context = findNavigationAccessContextByRoute(route);
        if (!context) {
            return false;
        }
        if (context.usesGranularAccess) {
            return this.hasGranularModulePermission(context.accessModuleName, action);
        }
        return this.hasModulePermission(context.apiModuleName, action);
    }

    /** Validation contrôle interne BO vs Partenaire : action « valider_controle_interne » cochée. */
    canValidateControleInterneBoPartenaire(): boolean {
        return this.hasCheckedAction(this.controleInterneAccessModule, 'valider_controle_interne');
    }

    /** Annulation validation : réservée aux administrateurs uniquement. */
    canRevokeControleInterneBoPartenaire(): boolean {
        return this.isAdmin();
    }

    canConsultCommentaireControleInterneBoPartenaire(): boolean {
        return this.hasCheckedAction(this.controleInterneAccessModule, 'consulter_commentaire_controle_interne');
    }

    canModifyCommentaireControleInterneBoPartenaire(): boolean {
        return this.hasCheckedAction(this.controleInterneAccessModule, 'modifier_commentaire_controle_interne');
    }

    canSendEmailControleInterneBoPartenaire(): boolean {
        return this.hasCheckedAction(this.controleInterneAccessModule, 'envoyer_email_controle_interne');
    }

    private normalizeProfilToken(profil?: string | null): string {
        if (!profil) {
            return '';
        }
        return profil
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
    }

    isModuleAllowed(module: string): boolean {
        const normalized = this.normalizeModuleName(module);
        if (!normalized) {
            return false;
        }
        return this.normalizedModuleSet.has(normalized);
    }

    hasModulePermission(module: string, permission: string): boolean {
        const normalizedModule = this.normalizeModuleName(module);
        const normalizedPermission = this.normalizePermissionName(permission);

        if (!normalizedModule || !normalizedPermission) {
            return false;
        }

        if (this.isAdmin()) {
            return true;
        }

        const navContext = findNavigationAccessContextByModuleName(module);
        if (navContext?.usesGranularAccess) {
            return this.hasGranularModulePermission(navContext.accessModuleName, permission);
        }

        if (this.hasGrantedSubmenuForParentModule(module, permission)) {
            return true;
        }

        const granted = this.getGrantedPermissionsForModule(normalizedModule);
        if (!granted.length) {
            if (this.isModuleAllowed(module) && this.isReadPermission(normalizedPermission)) {
                return true;
            }
            return false;
        }

        if (granted.includes(normalizedPermission)) {
            return true;
        }

        return this.isPermissionSatisfiedByGrantedActions(normalizedPermission, granted, normalizedModule);
    }

    /** Permission d'action sur un sous-menu (nom d'accès navigation). */
    hasGranularModulePermission(accessModuleName: string, permission: string): boolean {
        if (this.isAdmin()) {
            return true;
        }
        if (!this.hasSubmenuNavigationGrant(accessModuleName)) {
            return this.hasParentModuleFallbackPermission(accessModuleName, permission);
        }
        const normalizedPermission = this.normalizePermissionName(permission);
        if (!normalizedPermission) {
            return false;
        }
        const granted = this.getGrantedPermissionsForModule(this.normalizeModuleName(accessModuleName) ?? '');
        if (!granted.length) {
            return this.isReadPermission(normalizedPermission);
        }
        if (granted.includes(normalizedPermission)) {
            return true;
        }
        return this.isPermissionSatisfiedByGrantedActions(
            normalizedPermission,
            granted,
            this.normalizeModuleName(accessModuleName) ?? ''
        );
    }

    /**
     * Repli sur les droits du module parent quand le profil n'a coché aucun
     * sous-menu du groupe (cf. {@link hasNavigationAccess}).
     */
    private hasParentModuleFallbackPermission(accessModuleName: string, permission: string): boolean {
        const context = findNavigationAccessContextByAccessModuleName(accessModuleName ?? '');
        if (!context?.usesGranularAccess || !this.hasNavigationAccess(context)) {
            return false;
        }
        const normalizedPermission = this.normalizePermissionName(permission);
        const normalizedModule = this.normalizeModuleName(context.apiModuleName);
        if (!normalizedPermission || !normalizedModule) {
            return false;
        }
        const granted = this.getGrantedPermissionsForModule(normalizedModule);
        if (!granted.length) {
            return this.isReadPermission(normalizedPermission);
        }
        return granted.includes(normalizedPermission)
            || this.isPermissionSatisfiedByGrantedActions(normalizedPermission, granted, normalizedModule);
    }

    /** Sous-menu coché dans le profil (au moins une permission enregistrée). */
    hasSubmenuNavigationGrant(accessModuleName: string): boolean {
        if (this.isAdmin()) {
            return true;
        }
        if (!accessModuleName?.trim()) {
            return false;
        }
        const direct = (this.userRights?.permissions?.[accessModuleName] ?? []).filter(Boolean);
        if (direct.length > 0) {
            return true;
        }
        const normalizedTarget = this.normalizeModuleName(accessModuleName);
        if (!normalizedTarget) {
            return false;
        }
        for (const [moduleName, perms] of Object.entries(this.userRights?.permissions ?? {})) {
            if (this.normalizeModuleName(moduleName) === normalizedTarget && (perms?.length ?? 0) > 0) {
                return true;
            }
        }
        return this.isModuleAllowed(accessModuleName);
    }

    private getGrantedPermissionsForModule(normalizedModule: string): string[] {
        const permissions = this.userRights?.permissions ?? {};
        for (const [moduleName, modulePermissions] of Object.entries(permissions)) {
            if (this.normalizeModuleName(moduleName) !== normalizedModule) {
                continue;
            }
            return (modulePermissions || [])
                .map(candidate => this.normalizePermissionName(candidate))
                .filter((candidate): candidate is string => !!candidate && candidate !== 'module_associe');
        }
        return [];
    }

    private isPermissionSatisfiedByGrantedActions(
        requiredPermission: string,
        grantedPermissions: string[],
        normalizedModule: string
    ): boolean {
        if (this.isReadPermission(requiredPermission)) {
            if (grantedPermissions.some(permission => this.isReadPermission(permission))) {
                return true;
            }
            if (normalizedModule === 'reconciliation'
                && grantedPermissions.some(permission => this.isReconciliationReadEquivalent(permission))) {
                return true;
            }
        }

        if (normalizedModule === 'reconciliation'
            && grantedPermissions.some(permission => this.isReconciliationWriteEquivalent(permission))) {
            if (requiredPermission.startsWith('lancer_')
                || requiredPermission.startsWith('executer_')
                || requiredPermission.startsWith('modifier')
                || requiredPermission.startsWith('marquer_ok')
                || requiredPermission.startsWith('enregistrer_statut')
                || requiredPermission === 'creer'
                || requiredPermission.startsWith('creer_')) {
                return true;
            }
        }

        if (requiredPermission.startsWith('marquer_ok')) {
            return grantedPermissions.some(permission => permission.startsWith('marquer_ok'));
        }

        if (requiredPermission.startsWith('modifier')) {
            return grantedPermissions.some(permission => permission.startsWith('modifier'));
        }

        if (requiredPermission.startsWith('creer')) {
            return grantedPermissions.some(permission => permission === 'creer' || permission.startsWith('creer_'));
        }

        const requiredBase = requiredPermission.split('_')[0];
        return grantedPermissions.some(granted =>
            granted === requiredBase
            || granted.startsWith(`${requiredBase}_`)
            || requiredPermission.startsWith(`${granted}_`)
        );
    }

    /**
     * Vrai si le profil a au moins un sous-menu coché du module parent
     * (ex. « Réconciliation · Mode Manuel » pour « Réconciliation »).
     * Sert aux pages hors menu (ex. /column-selection, /reconciliation) protégées
     * par le module parent seul.
     */
    hasAnyGrantedSubmenuForModule(parentModule: string): boolean {
        const normalizedParent = this.normalizeModuleName(parentModule);
        if (!normalizedParent) {
            return false;
        }
        return getAllNavigationAccessContexts().some(context =>
            context.usesGranularAccess
            && this.normalizeModuleName(context.apiModuleName) === normalizedParent
            && this.hasSubmenuNavigationGrant(context.accessModuleName)
        );
    }

    /**
     * Accès à une page protégée par le module parent pour un profil configuré par
     * sous-menu : au moins un sous-menu coché ; la lecture (« consulter ») est alors
     * acquise, toute autre permission doit être donnée sur un sous-menu coché.
     */
    canAccessModuleViaSubmenu(parentModule: string, permissions: string[]): boolean {
        if (!this.hasAnyGrantedSubmenuForModule(parentModule)) {
            return false;
        }
        return (permissions || []).every(permission => {
            const normalized = this.normalizePermissionName(permission);
            if (!normalized) {
                return false;
            }
            return this.isReadPermission(normalized)
                || this.hasGrantedSubmenuForParentModule(parentModule, permission);
        });
    }

    private hasGrantedSubmenuForParentModule(parentModule: string, permission: string): boolean {
        const normalizedParent = this.normalizeModuleName(parentModule);
        if (!normalizedParent) {
            return false;
        }
        for (const context of getAllNavigationAccessContexts()) {
            if (!context.usesGranularAccess) {
                continue;
            }
            if (this.normalizeModuleName(context.apiModuleName) !== normalizedParent) {
                continue;
            }
            if (!this.hasSubmenuNavigationGrant(context.accessModuleName)) {
                continue;
            }
            if (this.hasGranularModulePermission(context.accessModuleName, permission)) {
                return true;
            }
        }
        return false;
    }

    private isReadPermission(permission: string): boolean {
        return permission === 'consulter'
            || permission.startsWith('consulter_')
            || permission === 'filtrer'
            || permission.startsWith('filtrer_');
    }

    private isReconciliationReadEquivalent(permission: string): boolean {
        return permission === 'lancer_reconciliation'
            || permission === 'executer_reconciliation_magique'
            || permission.startsWith('consulter_')
            || permission === 'consulter';
    }

    private isReconciliationWriteEquivalent(permission: string): boolean {
        return permission === 'lancer_reconciliation'
            || permission === 'executer_reconciliation_magique'
            || permission === 'modifier'
            || permission.startsWith('modifier_')
            || permission.startsWith('marquer_ok')
            || permission.startsWith('enregistrer_statut');
    }

    hasAllModulePermissions(module: string, permissions: string[]): boolean {
        return (permissions || []).every(permission => this.hasModulePermission(module, permission));
    }

    hasGranularNavigationAccessForGroup(groupKey: string): boolean {
        const group = APP_NAVIGATION_CATALOG.find(item => item.key === groupKey);
        if (!group || !groupUsesGranularSubmenuAccess(group) || !group.children?.length) {
            return false;
        }
        return group.children.some(sub => {
            const context = buildNavigationAccessContext(group, sub);
            return context ? this.hasNavigationAccess(context) : false;
        });
    }

    hasNavigationAccess(context: NavigationAccessContext): boolean {
        if (this.isAdmin()) {
            return true;
        }

        // Menus de la plateforme : réservés au SUPER_ADMIN, indépendamment des
        // modules métier (le compte plateforme n'a aucun module actif).
        if (this.isSuperAdmin()
            && (context.submenu?.superAdminOnly || context.group?.superAdminOnly)) {
            return true;
        }

        if (context.usesGranularAccess) {
            if (this.hasSubmenuNavigationGrant(context.accessModuleName)) {
                return true;
            }
            // Profil sans choix par sous-menu dans ce groupe (droits donnés au seul
            // module parent, ex. « Résultats ») : tous les sous-menus du module sont
            // accessibles. Dès qu'un sous-menu du groupe est coché, seuls les
            // sous-menus cochés restent visibles.
            return !this.groupHasSubmenuGrant(context)
                && this.isModuleAllowed(context.apiModuleName);
        }

        return this.isModuleAllowed(context.accessModuleName);
    }

    /** Vrai si au moins un sous-menu du même module, dans le groupe, est coché. */
    private groupHasSubmenuGrant(context: NavigationAccessContext): boolean {
        const group = context.group;
        if (!group?.children?.length) {
            return false;
        }
        return group.children
            .filter(sub => sub.moduleName === context.apiModuleName)
            .map(sub => buildNavigationAccessContext(group, sub))
            .some(sibling => !!sibling
                && sibling.usesGranularAccess
                && this.hasSubmenuNavigationGrant(sibling.accessModuleName));
    }

    canAccessNavigationRoute(route: string | null | undefined): boolean {
        if (!route) {
            return false;
        }
        if (this.isAdmin()) {
            return true;
        }

        const navContext = findNavigationAccessContextByRoute(route);
        if (!navContext) {
            return true;
        }

        return this.hasNavigationAccess(navContext);
    }

    isNavigationGroupVisible(groupKey: string): boolean {
        if (this.isAdmin()) {
            return true;
        }

        const group = APP_NAVIGATION_CATALOG.find(item => item.key === groupKey);
        if (!group) {
            return false;
        }

        if (group.children?.length) {
            return group.children.some(sub => {
                const context = buildNavigationAccessContext(group, sub);
                return context ? this.hasNavigationAccess(context) : false;
            });
        }

        const context = buildNavigationAccessContext(group);
        return context ? this.hasNavigationAccess(context) : !!group.moduleName && this.isModuleAllowed(group.moduleName);
    }

    canAccessRoute(route: string | null | undefined): boolean {
        if (!route) {
            return false;
        }

        if (this.isAdmin()) {
            return true;
        }

        const normalizedRoute = this.normalizeRoutePath(route);
        const navContext = findNavigationAccessContextByRoute(normalizedRoute);
        if (navContext) {
            return this.hasNavigationAccess(navContext);
        }

        const candidate = this.postLoginRouteCandidates.find(item => item.path === normalizedRoute);
        if (!candidate?.module) {
            return true;
        }

        return this.isModuleAllowed(candidate.module)
            && this.hasAllModulePermissions(candidate.module, candidate.permissions ?? []);
    }

    getNavigationAccessModuleForRoute(route?: string | null): string | null {
        const normalizedRoute = this.normalizeRoutePath(route ?? this.router.url);
        const navContext = findNavigationAccessContextByRoute(normalizedRoute);
        if (!navContext || !this.hasNavigationAccess(navContext)) {
            return null;
        }
        return navContext.accessModuleName;
    }

    resolvePermissionModuleContext(fallbackModule?: string): string | undefined {
        const navigationModule = this.getNavigationAccessModuleForRoute();
        if (navigationModule) {
            return navigationModule;
        }
        return fallbackModule || undefined;
    }

    resolveAccessibleRoute(preferredRoute?: string | null): string {
        const normalizedPreferredRoute = this.normalizeRoutePath(preferredRoute);
        if (normalizedPreferredRoute && this.canAccessRoute(normalizedPreferredRoute)) {
            const trimmed = (preferredRoute ?? '').trim();
            return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        }

        for (const context of getAllNavigationAccessContexts()) {
            if (this.canAccessRoute(context.route)) {
                return context.route;
            }
        }

        return '/aide';
    }

    private rebuildNormalizedModuleSet(modules?: string[]) {
        const fromRights = modules ?? this.userRights?.modules ?? [];
        const fromPermissions = Object.keys(this.userRights?.permissions ?? {});
        const source = [...fromRights, ...fromPermissions];
        this.normalizedModuleSet = new Set(
            source
                .map(name => this.normalizeModuleName(name))
                .filter((name): name is string => !!name)
        );
    }

    private normalizeModuleName(name?: string | null): string | null {
        if (!name) {
            return null;
        }
        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    private normalizePermissionName(name?: string | null): string | null {
        if (!name) {
            return null;
        }

        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    private normalizeRoutePath(route?: string | null): string | null {
        if (!route) {
            return null;
        }

        const trimmedRoute = route.trim();
        if (!trimmedRoute) {
            return null;
        }

        const [path] = trimmedRoute.split('?');
        return path || null;
    }

    // Méthodes pour gérer les fichiers uploadés
    setUploadedFiles(files: { boFile: File | null; partnerFile: File | null }) {
        this.uploadedFilesSubject.next(files);
    }

    getUploadedFiles(): { boFile: File | null; partnerFile: File | null } {
        return this.uploadedFilesSubject.value;
    }

    // Méthodes pour gérer les données parsées
    setBoData(data: Record<string, string>[]) {
        this.boDataSubject.next(data);
    }

    setPartnerData(data: Record<string, string>[]) {
        this.partnerDataSubject.next(data);
    }

    clearData() {
        this.boDataSubject.next([]);
        this.partnerDataSubject.next([]);
        this.uploadedFilesSubject.next({ boFile: null, partnerFile: null });
    }
} 