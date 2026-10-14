import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Match } from '../models/reconciliation-response.model';
import { filterRecordsByMagicPartition } from '../utils/magic-partition.util';

@Injectable({
    providedIn: 'root'
})
export class ReconciliationTabsService {
    // Données filtrées des onglets
    private filteredMatchesSubject = new BehaviorSubject<Match[]>([]);
    private filteredBoOnlySubject = new BehaviorSubject<Record<string, string>[]>([]);
    private filteredPartnerOnlySubject = new BehaviorSubject<Record<string, string>[]>([]);
    private filteredMismatchesSubject = new BehaviorSubject<Record<string, string>[]>([]);

    /** Contexte réconciliation magique (service / fichier partenaire actifs). */
    private magicServiceFilter = '';
    private magicPartnerFileFilter = '';

    // Observables
    public filteredMatches$ = this.filteredMatchesSubject.asObservable();
    public filteredBoOnly$ = this.filteredBoOnlySubject.asObservable();
    public filteredPartnerOnly$ = this.filteredPartnerOnlySubject.asObservable();
    public filteredMismatches$ = this.filteredMismatchesSubject.asObservable();

    // Méthodes pour mettre à jour les données filtrées
    setFilteredMatches(matches: Match[]) {
        this.filteredMatchesSubject.next(matches);
    }

    setFilteredBoOnly(boOnly: Record<string, string>[]) {
        this.filteredBoOnlySubject.next(boOnly);
    }

    setMagicViewContext(service: string, partnerFile: string = ''): void {
        this.magicServiceFilter = (service || '').trim();
        this.magicPartnerFileFilter = (partnerFile || '').trim();
    }

    getMagicViewContext(): { service: string; partnerFile: string } {
        return {
            service: this.magicServiceFilter,
            partnerFile: this.magicPartnerFileFilter
        };
    }

    /** Filtre les écarts BO/Partenaire selon le contexte magique (_magicService / _magicPartnerFile). */
    filterRecordsByMagicView(records: Record<string, string>[]): Record<string, string>[] {
        const { service, partnerFile } = this.getMagicViewContext();
        return filterRecordsByMagicPartition(records, service, partnerFile);
    }

    filterBoEcartsByMagicView(records: Record<string, string>[]): Record<string, string>[] {
        return this.filterRecordsByMagicView(records);
    }

    setFilteredPartnerOnly(partnerOnly: Record<string, string>[]) {
        this.filteredPartnerOnlySubject.next(partnerOnly);
    }

    setFilteredMismatches(mismatches: Record<string, string>[]) {
        this.filteredMismatchesSubject.next(mismatches);
    }

    // Méthodes pour récupérer les données actuelles
    getFilteredMatches(): Match[] {
        return this.filteredMatchesSubject.value;
    }

    getFilteredBoOnly(): Record<string, string>[] {
        return this.filteredBoOnlySubject.value;
    }

    getFilteredPartnerOnly(): Record<string, string>[] {
        return this.filteredPartnerOnlySubject.value;
    }

    getFilteredMismatches(): Record<string, string>[] {
        return this.filteredMismatchesSubject.value;
    }

    // Méthode pour vider toutes les données
    clearAllData() {
        this.filteredMatchesSubject.next([]);
        this.filteredBoOnlySubject.next([]);
        this.filteredPartnerOnlySubject.next([]);
        this.filteredMismatchesSubject.next([]);
        this.magicServiceFilter = '';
        this.magicPartnerFileFilter = '';
    }
}

