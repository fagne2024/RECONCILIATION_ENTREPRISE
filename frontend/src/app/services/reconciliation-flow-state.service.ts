import { Injectable } from '@angular/core';

/** Écran de chargement concerné par un instantané (une route = un parcours). */
export type UploadFlowKind = 'manual' | 'assisted' | 'certification';

/**
 * Instantané opaque de l'écran de chargement (fichiers, données parsées, filtres
 * agence/service/statut/paiement et historique des étapes). Le contenu est géré
 * par FileUploadComponent : le service ne fait que le conserver entre deux pages.
 */
export interface UploadFlowSnapshot {
    kind: UploadFlowKind;
    savedAt: number;
    state: Record<string, unknown>;
}

export interface ColumnPair {
    boColumn: string;
    partnerColumn: string;
}

/** Choix faits sur la page de sélection des colonnes (clés, comparaisons). */
export interface ColumnSelectionSnapshot {
    boColumns: string[];
    partnerColumns: string[];
    selectedBoKeyColumn: string;
    selectedPartnerKeyColumn: string;
    additionalKeys: ColumnPair[];
    comparisonColumns: ColumnPair[];
    disableAutoAnalysis: boolean;
}

/**
 * Mémoire du parcours de réconciliation (manuel et assisté) permettant de revenir
 * en arrière sur chaque étape sans perdre ce qui a été chargé ou choisi :
 * résultats → sélection des colonnes → filtres → fichiers.
 *
 * Les données restent en mémoire uniquement (jamais en localStorage : volumes
 * importants et données métier). Elles sont purgées à chaque nouvelle
 * réconciliation et à la déconnexion.
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationFlowStateService {
    private uploadSnapshots = new Map<UploadFlowKind, UploadFlowSnapshot>();
    private columnSelection: ColumnSelectionSnapshot | null = null;

    saveUploadSnapshot(kind: UploadFlowKind, state: Record<string, unknown>): void {
        this.uploadSnapshots.set(kind, { kind, savedAt: Date.now(), state });
    }

    getUploadSnapshot(kind: UploadFlowKind): UploadFlowSnapshot | null {
        return this.uploadSnapshots.get(kind) ?? null;
    }

    clearUploadSnapshot(kind?: UploadFlowKind): void {
        if (kind) {
            this.uploadSnapshots.delete(kind);
        } else {
            this.uploadSnapshots.clear();
        }
    }

    saveColumnSelection(snapshot: ColumnSelectionSnapshot): void {
        this.columnSelection = {
            ...snapshot,
            boColumns: [...snapshot.boColumns],
            partnerColumns: [...snapshot.partnerColumns],
            additionalKeys: snapshot.additionalKeys.map(k => ({ ...k })),
            comparisonColumns: snapshot.comparisonColumns.map(c => ({ ...c }))
        };
    }

    /**
     * Restitue la sélection mémorisée si elle porte sur les mêmes colonnes que
     * les données actuelles (sinon les fichiers ou filtres ont changé : on repart
     * d'une sélection vierge).
     */
    getColumnSelectionFor(boColumns: string[], partnerColumns: string[]): ColumnSelectionSnapshot | null {
        const snapshot = this.columnSelection;
        if (!snapshot) {
            return null;
        }
        const sameColumns = (a: string[], b: string[]) =>
            a.length === b.length && a.every(col => b.includes(col));
        if (!sameColumns(snapshot.boColumns, boColumns) || !sameColumns(snapshot.partnerColumns, partnerColumns)) {
            return null;
        }
        return {
            ...snapshot,
            additionalKeys: snapshot.additionalKeys.map(k => ({ ...k })),
            comparisonColumns: snapshot.comparisonColumns.map(c => ({ ...c }))
        };
    }

    clearColumnSelection(): void {
        this.columnSelection = null;
    }

    /** Purge tout le parcours (nouvelle réconciliation, déconnexion). */
    clearAll(): void {
        this.uploadSnapshots.clear();
        this.columnSelection = null;
    }
}
