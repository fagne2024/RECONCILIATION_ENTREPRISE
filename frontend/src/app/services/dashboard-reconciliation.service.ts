import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Result8RecData {
    id: number;
    date: string;
    agency: string;
    service: string;
    country: string;
    env?: string;
    /** Variante API (snake_case) si présente */
    envCode?: string;
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
    glpiId: string;
    createdAt: string;
}

export interface RecoJ1BlockingComment {
    recoDate: string;
    service: string;
    country: string;
    env: string;
    commentText: string;
    updatedBy?: string;
    updatedAt?: string;
    /** Relance e-mail quotidienne : absente si jamais activée. */
    mailAlertActive?: boolean | null;
    mailRecipients?: string[] | null;
    mailCcRecipients?: string[] | null;
    mailLastSentAt?: string | null;
    mailSendCount?: number | null;
    mailLastError?: string | null;
    /** MANUEL | STATUT_CHANGE | COMMENTAIRE_ABSENT */
    mailStoppedReason?: string | null;
}

export interface RecoJ1MailAlertRequest {
    recoDate: string;
    service: string;
    country: string;
    env: string;
    recipients?: string[];
    ccRecipients?: string[];
}

/**
 * Agrégat d'actions d'audit result8rec (source du « Top 3 des utilisateurs »).
 * Chaque entrée = utilisateur + type d'action + niveau de traitement + nombre.
 */
export interface RecoAuditActionStat {
    username: string;
    actionType: string;
    traitementSnapshot: string | null;
    count: number;
}

export interface ServiceMetricDetails {
    bkRecoBanque: number;
    bkRecoBO: number;
    trxReconNet: number;
    trxReconBrut: number;
    date: string;
    boDiscrepancyRate?: number;
    partnerDiscrepancyRate?: number;
    boDiscrepancyCount?: number;
    partnerDiscrepancyCount?: number;
    totalTransactions?: number;
}

export interface CountryServiceMetrics {
    country: string;
    countryCode: string;
    services: {
        [serviceName: string]: ServiceMetricDetails;
    };
}

export type DashboardStatusFilter = 'encours' | 'traite';

@Injectable({
    providedIn: 'root'
})
export class DashboardReconciliationService {

    constructor(private http: HttpClient) {}

    private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
        return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
    }

    private buildScopedParams(startDate?: string, endDate?: string): HttpParams {
        let params = new HttpParams().set('_t', String(Date.now()));
        if (startDate) {
            params = params.set('startDate', startDate);
        }
        if (endDate) {
            params = params.set('endDate', endDate);
        }
        return params;
    }

    /**
     * Récupère les données result8rec sur une plage de dates (inclusif).
     */
    getResult8RecDataScoped(
        startDate?: string,
        endDate?: string,
        moduleContext?: string
    ): Observable<Result8RecData[]> {
        return this.http.get<Result8RecData[]>('/api/result8rec', {
            headers: this.buildContextHeaders(moduleContext),
            params: this.buildScopedParams(startDate, endDate)
        });
    }

    /**
     * Récupère les données result8rec pour une date unique.
     */
    getResult8RecDataForDate(date: string, moduleContext?: string): Observable<Result8RecData[]> {
        return this.getResult8RecDataScoped(date, date, moduleContext);
    }

    /**
     * Dates distinctes triées DESC dans une plage (inclusif).
     */
    getResult8RecDates(
        startDate?: string,
        endDate?: string,
        moduleContext?: string
    ): Observable<string[]> {
        return this.http.get<string[]>('/api/result8rec/dates', {
            headers: this.buildContextHeaders(moduleContext),
            params: this.buildScopedParams(startDate, endDate)
        });
    }

    /**
     * Agrégat des actions d'audit sur une période et un périmètre donnés.
     * Source du classement « Top 3 des utilisateurs » de l'État des réconciliations.
     */
    getAuditActionsSummary(
        startDate: string,
        endDate: string,
        opts?: { country?: string; service?: string; env?: string },
        moduleContext?: string
    ): Observable<RecoAuditActionStat[]> {
        let params = new HttpParams()
            .set('startDate', startDate)
            .set('endDate', endDate)
            .set('_t', String(Date.now()));
        if (opts?.country) {
            params = params.set('country', opts.country);
        }
        if (opts?.service) {
            params = params.set('service', opts.service);
        }
        if (opts?.env) {
            params = params.set('env', opts.env);
        }
        return this.http.get<RecoAuditActionStat[]>('/api/result8rec/audit-actions-summary', {
            headers: this.buildContextHeaders(moduleContext),
            params
        });
    }

    /**
     * Exécute une requête avec un retry simple en cas de 429 (rate limiting) :
     * attend le délai `Retry-After` (ou 5 s par défaut) puis réessaie (2 max).
     */
    private async requestWith429Retry<T>(factory: () => Observable<T>): Promise<T> {
        const maxRetries = 2;
        for (let attempt = 0; ; attempt++) {
            try {
                return await firstValueFrom(factory());
            } catch (err) {
                const is429 = err instanceof HttpErrorResponse && err.status === 429;
                if (!is429 || attempt >= maxRetries) {
                    throw err;
                }
                const retryAfterHeader = err.headers?.get('Retry-After');
                const retryAfterSec = Number(retryAfterHeader);
                const delayMs = (Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec : 5) * 1000;
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    /**
     * Charge result8rec sur une plage pour un affichage progressif :
     * d'abord la journée la plus récente, puis le reste de la plage en une
     * seule requête (3 requêtes maximum au total, compatible rate limiting).
     */
    async loadResult8RecProgressive(
        startDate: string,
        endDate: string,
        onBatch: (accumulated: Result8RecData[], isFirst: boolean, isComplete: boolean) => void,
        moduleContext?: string,
        isCancelled?: () => boolean
    ): Promise<Result8RecData[]> {
        if (startDate === endDate) {
            const rows = await this.requestWith429Retry(() => this.getResult8RecDataForDate(startDate, moduleContext));
            const data = Array.isArray(rows) ? rows : [];
            if (!isCancelled?.()) {
                onBatch(data, true, true);
            }
            return data;
        }

        const datesRaw = await this.requestWith429Retry(() => this.getResult8RecDates(startDate, endDate, moduleContext));
        const dates = Array.isArray(datesRaw) ? datesRaw.filter(d => !!d) : [];
        if (!dates.length) {
            if (!isCancelled?.()) {
                onBatch([], true, true);
            }
            return [];
        }

        const byId = new Map<number, Result8RecData>();
        const withoutId: Result8RecData[] = [];

        const mergeRows = (rows: Result8RecData[]) => {
            for (const row of rows) {
                if (row?.id != null) {
                    byId.set(row.id, row);
                } else if (row) {
                    withoutId.push(row);
                }
            }
        };

        const snapshot = (): Result8RecData[] => [...byId.values(), ...withoutId];

        // 1) Affichage progressif : on charge d'abord la journée la plus récente (1 requête).
        const firstDate = dates[0];
        const firstRows = await this.requestWith429Retry(() => this.getResult8RecDataForDate(firstDate, moduleContext));
        mergeRows(Array.isArray(firstRows) ? firstRows : []);
        if (isCancelled?.()) {
            return snapshot();
        }
        onBatch(snapshot(), true, dates.length === 1);
        if (dates.length === 1) {
            return snapshot();
        }

        // 2) Le reste de la plage en UNE seule requête de plage.
        //    (Une requête par date générait des dizaines de requêtes en rafale et
        //     déclenchait le 429 Too Many Requests du rate limiting backend.)
        //    Les dates sont triées DESC : dates[0] (la plus récente) est déjà chargée,
        //    la plage restante va de la plus ancienne (dates[len-1]) à dates[1].
        const rangeStart = dates[dates.length - 1];
        const rangeEnd = dates[1];
        const restRows = await this.requestWith429Retry(() => this.getResult8RecDataScoped(rangeStart, rangeEnd, moduleContext));
        mergeRows(Array.isArray(restRows) ? restRows : []);
        if (!isCancelled?.()) {
            onBatch(snapshot(), false, true);
        }

        return snapshot();
    }

    /**
     * Récupère toutes les données de la table result8rec
     */
    getResult8RecData(moduleContext?: string): Observable<Result8RecData[]> {
        return this.http.get<Result8RecData[]>('/api/result8rec', {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    /**
     * Calcule les métriques de réconciliation par pays et service
     */
    getDashboardMetrics(
        statusFilter: DashboardStatusFilter = 'encours',
        startDate?: Date | null,
        endDate?: Date | null,
        moduleContext?: string
    ): Observable<CountryServiceMetrics[]> {
        return this.getResult8RecData(moduleContext).pipe(
            map(data => {
                // Filtrer les données par date si des dates sont fournies
                let filteredData = data;
                if (startDate || endDate) {
                    filteredData = this.filterDataByDate(data, startDate, endDate);
                }
                return this.calculateMetrics(filteredData, statusFilter);
            })
        );
    }

    /**
     * Filtre les données par intervalle de dates
     */
    private filterDataByDate(
        data: Result8RecData[],
        startDate?: Date | null,
        endDate?: Date | null
    ): Result8RecData[] {
        if (!startDate && !endDate) {
            return data;
        }

        // Normaliser les dates de filtrage
        let normalizedStart: Date | null = null;
        let normalizedEnd: Date | null = null;

        if (startDate) {
            normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            normalizedStart.setHours(0, 0, 0, 0);
        }

        if (endDate) {
            normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            normalizedEnd.setHours(23, 59, 59, 999);
        }

        return data.filter(item => {
            if (!item.date) {
                return false; // Exclure les éléments sans date si un filtre de date est actif
            }

            // Extraire et normaliser la date de l'élément
            const dateStr = item.date.split(' ')[0]; // Prendre seulement la partie date
            let itemDate: Date;

            // Parser la date selon le format
            if (dateStr.includes('-')) {
                // Format ISO: YYYY-MM-DD
                const [year, month, day] = dateStr.split('-').map(Number);
                itemDate = new Date(year, month - 1, day);
            } else if (dateStr.includes('/')) {
                // Format avec slash: DD/MM/YYYY ou MM/DD/YYYY
                const parts = dateStr.split('/').map(Number);
                // Supposer format DD/MM/YYYY (format français)
                itemDate = new Date(parts[2], parts[1] - 1, parts[0]);
            } else {
                // Essayer de parser directement
                itemDate = new Date(dateStr);
            }

            // Vérifier que la date est valide
            if (isNaN(itemDate.getTime())) {
                return false;
            }

            itemDate.setHours(0, 0, 0, 0);

            // Vérifier la date de début
            if (normalizedStart && itemDate < normalizedStart) {
                return false;
            }

            // Vérifier la date de fin
            if (normalizedEnd && itemDate > normalizedEnd) {
                return false;
            }

            return true;
        });
    }

    /**
     * Calcule les métriques à partir des données brutes
     */
    private calculateMetrics(data: Result8RecData[], statusFilter: DashboardStatusFilter): CountryServiceMetrics[] {
        console.log('📊 Calcul des métriques à partir des données result8rec:', data);

        const filteredData = statusFilter === 'traite'
            ? data.filter(item => (item.status || '').trim().toUpperCase() === 'OK')
            : data;

        if (!filteredData || filteredData.length === 0) {
            return [];
        }
        
        // Grouper les données par pays et service
        const countryMap = new Map<string, CountryServiceMetrics>();

        filteredData.forEach(item => {
            // Ignorer les entrées sans service valide
            if (!item.service || item.service.trim() === '') {
                console.log('⚠️ Entrée ignorée - service manquant:', item);
                return;
            }

            const countryCode = this.extractCountryCode(item.country || item.agency);
            
            if (!countryMap.has(countryCode)) {
                countryMap.set(countryCode, {
                    country: item.country || 'Inconnu',
                    countryCode: countryCode,
                    services: {}
                });
            }

            const countryData = countryMap.get(countryCode)!;
            
            if (!countryData.services[item.service]) {
                countryData.services[item.service] = {
                    bkRecoBanque: 0,
                    bkRecoBO: 0,
                    trxReconNet: 0,
                    trxReconBrut: 0,
                    date: item.date,
                    boDiscrepancyCount: 0,
                    partnerDiscrepancyCount: 0,
                    totalTransactions: 0
                };
            }

            // Calculer les métriques basées sur les vraies données
            const metrics = this.calculateServiceMetrics(item);
            
            // Agréger les données (moyenne pondérée par le nombre de transactions)
            const existingMetrics = countryData.services[item.service];
            const totalWeight = existingMetrics.bkRecoBanque === 0 ? 1 : 2; // Poids pour la moyenne
            
            countryData.services[item.service] = {
                bkRecoBanque: this.calculateWeightedAverage(existingMetrics.bkRecoBanque, metrics.bkRecoBanque, totalWeight),
                bkRecoBO: this.calculateWeightedAverage(existingMetrics.bkRecoBO, metrics.bkRecoBO, totalWeight),
                trxReconNet: this.calculateWeightedAverage(existingMetrics.trxReconNet, metrics.trxReconNet, totalWeight),
                trxReconBrut: this.calculateWeightedAverage(existingMetrics.trxReconBrut, metrics.trxReconBrut, totalWeight),
                date: item.date, // Préserver la date la plus récente
                boDiscrepancyCount: countryData.services[item.service].boDiscrepancyCount,
                partnerDiscrepancyCount: countryData.services[item.service].partnerDiscrepancyCount,
                totalTransactions: (countryData.services[item.service].totalTransactions || 0) + (item.totalTransactions || 0)
            };

            if (statusFilter === 'traite') {
                // Extraire les écarts depuis les commentaires pour les écarts traités
                // (comme dans le rapport: statut OK avec répartition des écarts dans les commentaires)
                const status = (item.status || '').trim().toUpperCase();
                const isOk = status === 'OK';
                if (isOk) {
                    // Extraire les comptes d'écarts depuis les commentaires
                    const discrepancies = this.extractDiscrepanciesFromComment(item.comment);
                    const boCount = discrepancies.boCount || 0;
                    const partnerCount = discrepancies.partnerCount || 0;
                    // Ne compter que si au moins un écart existe
                    if (boCount > 0 || partnerCount > 0) {
                        countryData.services[item.service].boDiscrepancyCount = (countryData.services[item.service].boDiscrepancyCount || 0) + boCount;
                        countryData.services[item.service].partnerDiscrepancyCount = (countryData.services[item.service].partnerDiscrepancyCount || 0) + partnerCount;
                    }
                }
            }
        });

        if (statusFilter === 'traite') {
            countryMap.forEach(country => {
                Object.values(country.services).forEach(service => {
                    const boCount = service.boDiscrepancyCount || 0;
                    const partnerCount = service.partnerDiscrepancyCount || 0;
                    const totalTransactions = service.totalTransactions || 0;

                    if (totalTransactions > 0) {
                        service.boDiscrepancyRate = Math.round((boCount / totalTransactions) * 10000) / 100;
                        service.partnerDiscrepancyRate = Math.round((partnerCount / totalTransactions) * 10000) / 100;
                    } else {
                        service.boDiscrepancyRate = 0;
                        service.partnerDiscrepancyRate = 0;
                    }
                });
            });
        }

        const result = Array.from(countryMap.values());
        console.log('📊 Métriques calculées avec vrais services:', result);
        
        // Afficher les services trouvés pour debug
        result.forEach(country => {
            const services = Object.keys(country.services);
            console.log(`📊 Pays ${country.countryCode}: Services trouvés:`, services);
        });
        
        // Trier les pays par nombre de services décroissant
        const sortedResult = result.sort((a, b) => {
            const servicesCountA = Object.keys(a.services).length;
            const servicesCountB = Object.keys(b.services).length;
            return servicesCountB - servicesCountA; // Décroissant
        });
        
        console.log('📊 Pays triés par nombre de services:', sortedResult.map(c => ({
            country: c.countryCode,
            servicesCount: Object.keys(c.services).length
        })));
        
        return sortedResult;
    }

    /**
     * Calcule les métriques pour un service spécifique
     */
    private calculateServiceMetrics(item: Result8RecData) {
        const totalTransactions = item.totalTransactions || 0;
        const matches = item.matches || 0;
        const boOnly = item.boOnly || 0;
        const partnerOnly = item.partnerOnly || 0;
        const mismatches = item.mismatches || 0;

        // Bk_Reco_Banque : Taux de correspondance global (utilise le matchRate de la base)
        const bkRecoBanque = item.matchRate || 0;

        // Bk_Reco_BO : Taux de réconciliation Back Office
        // (matches + boOnly) / totalTransactions * 100
        const bkRecoBO = totalTransactions > 0 ? ((matches + boOnly) / totalTransactions) * 100 : 0;

        // Trx_Recon_net : Taux de réconciliation nette
        // matches / (matches + boOnly + mismatches) * 100
        const totalReconciled = matches + boOnly + mismatches;
        const trxReconNet = totalReconciled > 0 ? (matches / totalReconciled) * 100 : 0;

        // Trx_Recon_brut : Taux de réconciliation brute
        // matches / totalTransactions * 100
        const trxReconBrut = totalTransactions > 0 ? (matches / totalTransactions) * 100 : 0;

        return {
            bkRecoBanque: Math.round(bkRecoBanque * 100) / 100,
            bkRecoBO: Math.round(bkRecoBO * 100) / 100,
            trxReconNet: Math.round(trxReconNet * 100) / 100,
            trxReconBrut: Math.round(trxReconBrut * 100) / 100
        };
    }

    /**
     * Calcule une moyenne pondérée
     */
    private calculateWeightedAverage(existing: number, newValue: number, weight: number): number {
        if (existing === 0) return newValue;
        return Math.round(((existing + newValue) / weight) * 100) / 100;
    }

    /**
     * Extrait le code pays depuis le nom du pays ou de l'agence
     */
    private extractCountryCode(countryOrAgency: string): string {
        if (!countryOrAgency) return 'XX';
        
        const normalizedName = countryOrAgency.trim().toUpperCase();
        
        // Gérer les variantes spéciales comme "CITCH" qui signifie "CI" (Côte d'Ivoire)
        if (normalizedName === 'CITCH' || normalizedName.startsWith('CITCH')) {
            return 'CI';
        }
        
        // Mapping des codes pays
        const countryMap: {[key: string]: string} = {
            'BURKINA FASO': 'BF',
            'BURKINA': 'BF',
            'BÉNIN': 'BJ',
            'BENIN': 'BJ',
            'CÔTE D\'IVOIRE': 'CI',
            'COTE D\'IVOIRE': 'CI',
            'COTE DIVOIRE': 'CI',
            'CÔTE DIVOIRE': 'CI',
            'CAMEROUN': 'CM',
            'CAMEROON': 'CM',
            'GABON': 'GA',
            'GUINÉE': 'GN',
            'GUINEE': 'GN',
            'KENYA': 'KE',
            'MALI': 'ML',
            'MOZAMBIQUE': 'MZ',
            'NIGERIA': 'NG',
            'SÉNÉGAL': 'SN',
            'SENEGAL': 'SN',
            'TOGO': 'TG',
            'NIGER': 'NE',
            'TCHAD': 'TD'
        };

        // Chercher d'abord dans le mapping (insensible à la casse)
        for (const [country, code] of Object.entries(countryMap)) {
            if (normalizedName.includes(country.toUpperCase())) {
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

        // Extraire le code depuis le nom de l'agence si possible
        const codes = ['BF', 'BJ', 'CI', 'CM', 'GA', 'GN', 'KE', 'ML', 'MZ', 'NG', 'SN', 'TG', 'NE', 'TD'];
        
        for (const code of codes) {
            if (normalizedName.includes(code)) {
                return code;
            }
        }
        
        // Si c'est déjà un code (2 lettres), le retourner tel quel
        if (normalizedName.length === 2) {
            return normalizedName;
        }
        
        // Si c'est un code de 4-5 lettres qui commence par un code pays connu, extraire les 2 premières lettres
        if (normalizedName.length >= 4) {
            const firstTwo = normalizedName.substring(0, 2);
            if (codes.includes(firstTwo)) {
                return firstTwo;
            }
        }

        return 'XX';
    }

    private extractDiscrepanciesFromComment(comment?: string) {
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
                boCount = parseInt(match[1], 10) || 0;
                break; // Prendre le premier match trouvé
            }
        }

        // Chercher les écarts Partenaire avec tous les patterns
        for (const pattern of partnerPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                partnerCount = parseInt(match[1], 10) || 0;
                break; // Prendre le premier match trouvé
            }
        }

        return { boCount, partnerCount };
    }

    getJ1BlockingComments(
        startDate: string,
        endDate: string,
        moduleContext?: string
    ): Observable<RecoJ1BlockingComment[]> {
        const params = new HttpParams()
            .set('startDate', startDate)
            .set('endDate', endDate);
        return this.http.get<RecoJ1BlockingComment[]>('/api/reco-j1-blocking-comments', {
            headers: this.buildContextHeaders(moduleContext),
            params
        });
    }

    saveJ1BlockingComment(
        payload: RecoJ1BlockingComment,
        moduleContext?: string
    ): Observable<RecoJ1BlockingComment> {
        return this.http.put<RecoJ1BlockingComment>('/api/reco-j1-blocking-comments', payload, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    /** Envoie l'e-mail immédiatement puis chaque jour tant que le statut de la réconciliation ne change pas. */
    activateJ1MailAlert(payload: RecoJ1MailAlertRequest, moduleContext?: string): Observable<RecoJ1BlockingComment> {
        return this.http.put<RecoJ1BlockingComment>('/api/reco-j1-blocking-comments/mail-alert', payload, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    stopJ1MailAlert(payload: RecoJ1MailAlertRequest, moduleContext?: string): Observable<RecoJ1BlockingComment> {
        return this.http.put<RecoJ1BlockingComment>('/api/reco-j1-blocking-comments/mail-alert/stop', payload, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }
}
