import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { postFormWithProgress } from '../utils/upload-with-progress.util';

/** Fichier d'un lot, tel que renvoyé par le serveur. */
export interface TraitementLotFichier {
  id: number;
  ordre: number;
  nom: string;
  nbLignes: number;
  colonnes: string[];
}

/** Résumé d'un lot de traitement. */
export interface TraitementLotResume {
  lotId: number;
  uuid: string;
  statut: 'EN_COURS' | 'PRET' | 'ERREUR';
  nbFichiers: number;
  nbLignes: number;
  fichiers: TraitementLotFichier[];
}

/** Une ligne de donnée : valeurs indexées par nom de colonne. */
export interface TraitementLigne {
  numero: number;
  fichierId: number;
  valeurs: Record<string, string | number | null>;
}

export interface TraitementPageLignes {
  lignes: TraitementLigne[];
  curseurSuivant: number | null;
}

export interface TraitementFiltre {
  colonne: string;
  valeurs: string[];
}

import type { OperateurCondition } from '../utils/cross-dedup.util';
export type { OperateurCondition } from '../utils/cross-dedup.util';

export interface TraitementConditionDedoublonnage {
  colonne: string;
  operateur: OperateurCondition;
  valeurs: string[];
}

/** Opération serveur : filtres, dédoublonnage, conversions. Listes optionnelles. */
export interface TraitementOperation {
  filtres?: TraitementFiltre[];
  dedoublonnerSur?: string[];
  /** Deux colonnes A et B : les lignes portant une valeur présente dans les deux sont supprimées. */
  dedoublonnerEntre?: string[];
  /** Côté supprimé par dedoublonnerEntre : 'A' (défaut) ou 'B'. L'autre côté est conservé. */
  supprimerCote?: 'A' | 'B';
  /** Condition sur une autre colonne : seules les lignes qui la remplissent sont dédoublonnées. */
  conditionDedoublonnage?: TraitementConditionDedoublonnage | null;
  colonnesNombre?: string[];
  colonnesDate?: string[];
  formatDate?: string;
}

/** Valeurs distinctes d'une colonne du lot (section « Filtrer les lignes »). */
export interface TraitementValeursColonne {
  colonne: string;
  valeurs: { valeur: string; nb: number }[];
  /** Vrai si la colonne a plus de valeurs distinctes que la limite renvoyée. */
  tronque: boolean;
}

export interface TraitementResultatOperation {
  nouveauLotId: number;
  lignesEntree: number;
  lignesSorties: number;
  lignesFiltrees: number;
  doublonsSupprimes: number;
}

@Injectable({ providedIn: 'root' })
export class TraitementLotService {
  private readonly apiUrl = '/api/traitement/lots';

  constructor(private http: HttpClient) {}

  /** Crée un lot vide pour l'entreprise courante. */
  async creerLot(): Promise<number> {
    const r = await firstValueFrom(this.http.post<{ lotId: number }>(this.apiUrl, {}));
    return r.lotId;
  }

  /** Envoie un fichier au lot. `onProgress` reçoit le pourcentage d'envoi. */
  ajouterFichier(lotId: number, fichier: File, onProgress?: (percent: number) => void): Promise<unknown> {
    const form = new FormData();
    form.append('file', fichier, fichier.name);
    return postFormWithProgress(this.http, `${this.apiUrl}/${lotId}/fichiers`, form, onProgress);
  }

  resume(lotId: number): Promise<TraitementLotResume> {
    return firstValueFrom(this.http.get<TraitementLotResume>(`${this.apiUrl}/${lotId}`));
  }

  /** Page de lignes : `apresNumero` = dernier numéro reçu (0 pour la première page). */
  lignes(lotId: number, apresNumero: number, taille: number): Promise<TraitementPageLignes> {
    return firstValueFrom(this.http.get<TraitementPageLignes>(`${this.apiUrl}/${lotId}/lignes`, {
      params: { apresNumero: String(apresNumero), taille: String(taille) }
    }));
  }

  valeurs(lotId: number, colonne: string): Promise<TraitementValeursColonne> {
    return firstValueFrom(this.http.get<TraitementValeursColonne>(`${this.apiUrl}/${lotId}/valeurs`, {
      params: { colonne }
    }));
  }

  operer(lotId: number, operation: TraitementOperation): Promise<TraitementResultatOperation> {
    return firstValueFrom(this.http.post<TraitementResultatOperation>(`${this.apiUrl}/${lotId}/operations`, operation));
  }

  /** Valeurs distinctes d'une colonne du lot (triées, tronquées au-delà de `max`). */
  valeursDistinctes(lotId: number, colonne: string, max = 2000): Promise<{ valeurs: string[]; tronque: boolean }> {
    return firstValueFrom(this.http.get<{ valeurs: string[]; tronque: boolean }>(`${this.apiUrl}/${lotId}/valeurs`, {
      params: { colonne, max: String(max) }
    }));
  }

  supprimer(lotId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.apiUrl}/${lotId}`));
  }

  /**
   * URL de téléchargement de l'export du lot (CSV ou XLSX). Le navigateur télécharge le fichier
   * directement, sans le charger entier en mémoire.
   */
  urlExport(lotId: number, format: 'csv' | 'xlsx', nom: string): string {
    // En développement (localhost:4200), le téléchargement contourne le proxy vers le backend (8085).
    const { hostname, port } = window.location;
    const base = hostname === 'localhost' && port === '4200' ? 'http://localhost:8085/api/traitement/lots' : this.apiUrl;
    return `${base}/${lotId}/export?format=${encodeURIComponent(format)}&nom=${encodeURIComponent(nom)}`;
  }
}
