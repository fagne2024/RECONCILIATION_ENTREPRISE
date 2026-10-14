import { Injectable } from '@angular/core';
import { ReconciliationRequest } from '../../models/reconciliation-request.model';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';

export interface MatchedPartnerKeyCounts {
    [key: string]: number;
}

export interface ConsumedPartnerKey {
    key: string;
    count: number;
}

@Injectable({ providedIn: 'root' })
export class ReconciliationKeyAnalysisService {
    /**
     * Normalise une clé de réconciliation côté backend (trim + retrait suffixe "_CM")
     * Replique la normalisation appliquée par le backend (CsvReconciliationService.applyColumnProcessingRules)
     */
    normalizeBackendKey(rawKey: any, column?: string): string {
        if (rawKey === null || rawKey === undefined) return '';
        let key = String(rawKey).trim();
        if ((column === 'IDTransaction' || column === 'Numéro Trans GU') && key.endsWith('_CM')) {
            key = key.substring(0, key.length - 3).trim();
        }
        return key;
    }

    /**
     * Pour un match, retourne les paires (clé partenaire, nombre de lignes à retirer du pool partenaire).
     */
    getConsumedPartnerKeyCountsForMatch(
        match: any,
        boKeyColumn: string,
        partnerKeyColumn: string
    ): Array<[string, number]> {
        const list = match?.partnerDataList;
        if (Array.isArray(list) && list.length > 0) {
            const perKey = new Map<string, number>();
            for (const row of list) {
                const raw = row?.[partnerKeyColumn];
                if (raw === null || raw === undefined) continue;
                const key = this.normalizeBackendKey(raw, partnerKeyColumn);
                if (!key) continue;
                perKey.set(key, (perKey.get(key) || 0) + 1);
            }
            return Array.from(perKey.entries());
        }

        const pd = match?.partnerData;
        if (pd && typeof pd === 'object' && !Array.isArray(pd)) {
            const keys = Object.keys(pd);
            const isCombined = keys.some(k => k.includes('_PARTNER_'));
            if (isCombined) {
                const k1 = pd[`${partnerKeyColumn}_PARTNER_1`];
                if (k1 !== null && k1 !== undefined && String(k1).trim() !== '') {
                    const key = this.normalizeBackendKey(k1, partnerKeyColumn);
                    const k2 = pd[`${partnerKeyColumn}_PARTNER_2`];
                    const count = k2 !== null && k2 !== undefined && String(k2).trim() !== '' ? 2 : 1;
                    return [[key, count]];
                }
            }
            const direct = pd[partnerKeyColumn];
            if (direct !== null && direct !== undefined && String(direct).trim() !== '') {
                return [[this.normalizeBackendKey(direct, partnerKeyColumn), 1]];
            }
        }

        const boVal = match?.boData?.[boKeyColumn] ?? match?.key;
        if (boVal !== null && boVal !== undefined && String(boVal).trim() !== '') {
            return [[this.normalizeBackendKey(boVal, boKeyColumn), 1]];
        }
        return [];
    }

    /**
     * Agrège, par clé de réconciliation partenaire, le nombre de lignes OPPART consommées
     * par les matches d'un chunk (supporte le format fusionné TRXBO/OPPART avec colonnes
     * suffixées _PARTNER_1 / _PARTNER_2).
     */
    buildMatchedPartnerKeyCountsFromChunkResponse(
        matches: any[] | undefined,
        boKeyColumn: string,
        partnerKeyColumn: string
    ): Map<string, number> {
        const counts = new Map<string, number>();
        if (!matches || matches.length === 0) {
            return counts;
        }
        for (const match of matches) {
            for (const [key, n] of this.getConsumedPartnerKeyCountsForMatch(match, boKeyColumn, partnerKeyColumn)) {
                counts.set(key, (counts.get(key) || 0) + n);
            }
        }
        return counts;
    }

    /**
     * Récupère les colonnes candidates pour un type de fichier
     */
    getCandidateColumns(fileType: 'bo' | 'partner', request: ReconciliationRequest): string[] {
        if (fileType === 'bo') {
            return [request.boKeyColumn, ...(request.additionalKeys?.map(k => k.boColumn) || [])];
        } else {
            return [request.partnerKeyColumn, ...(request.additionalKeys?.map(k => k.partnerColumn) || [])];
        }
    }

    /**
     * Filtre les données partenaire pour ne garder que les candidates
     * (celles dont la clé primaire existe parmi les clés du chunk BO courant)
     */
    filterPartnerCandidates(
        boChunk: any[],
        partnerData: any[],
        request: ReconciliationRequest,
        enableFilter: boolean
    ): any[] {
        if (!enableFilter) {
            return partnerData;
        }

        const boKeySet = new Set<string>();
        for (const boRow of boChunk) {
            const rawKey = boRow?.[request.boKeyColumn];
            if (rawKey === null || rawKey === undefined) continue;
            const key = this.normalizeBackendKey(rawKey, request.boKeyColumn);
            if (key) boKeySet.add(key);
        }

        if (boKeySet.size === 0) return [];

        return partnerData.filter(partnerRow => {
            const rawKey = partnerRow?.[request.partnerKeyColumn];
            if (rawKey === null || rawKey === undefined) return false;
            const key = this.normalizeBackendKey(rawKey, request.partnerKeyColumn);
            return key ? boKeySet.has(key) : false;
        });
    }

    /**
     * Vérifie si le filtrage candidat est activé
     */
    isCandidateFilterEnabled(request: ReconciliationRequest): boolean {
        return !request.modelId
            && !(request.additionalKeys && request.additionalKeys.length > 0)
            && !(request.boColumnFilters || []).some(filter => filter.modelId);
    }
}