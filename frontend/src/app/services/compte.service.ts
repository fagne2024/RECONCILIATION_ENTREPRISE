import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Compte, CompteCreateRequest, CompteUpdateRequest, CompteFilter, CompteSoldeCloture } from '../models/compte.model';

@Injectable({
    providedIn: 'root'
})
export class CompteService {
    private apiUrl = '/api/comptes';

    constructor(private http: HttpClient) {}

    private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
        return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
    }

    // Récupérer tous les comptes
    getAllComptes(moduleContext?: string): Observable<Compte[]> {
        return this.http.get<Compte[]>(this.apiUrl, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    // Récupérer un compte par ID
    getCompteById(id: number): Observable<Compte> {
        return this.http.get<Compte>(`${this.apiUrl}/${id}`);
    }

    // Récupérer un compte par numéro
    getCompteByNumero(numeroCompte: string): Observable<Compte> {
        return this.http.get<Compte>(`${this.apiUrl}/numero/${numeroCompte}`);
    }

    // Récupérer les comptes par pays
    getComptesByPays(pays: string): Observable<Compte[]> {
        return this.http.get<Compte[]>(`${this.apiUrl}/pays/${pays}`);
    }

    // Récupérer les comptes par code propriétaire
    getComptesByCodeProprietaire(codeProprietaire: string, moduleContext?: string): Observable<Compte[]> {
        return this.http.get<Compte[]>(`${this.apiUrl}/code-proprietaire/${codeProprietaire}`, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    // Récupérer les comptes par agence
    getComptesByAgency(agency: string): Observable<Compte[]> {
        return this.http.get<Compte[]>(`${this.apiUrl}/agency/${agency}`);
    }

    // Récupérer les comptes par service
    getComptesByService(service: string): Observable<Compte[]> {
        return this.http.get<Compte[]>(`${this.apiUrl}/service/${service}`);
    }

    // Récupérer un compte par agence et service
    getCompteByAgencyAndService(agency: string, service: string): Observable<Compte> {
        return this.http.get<Compte>(`${this.apiUrl}/agency/${agency}/service/${service}`);
    }

    // Récupérer les comptes avec un solde supérieur à un seuil
    getComptesBySoldeSuperieurA(soldeMin: number): Observable<Compte[]> {
        return this.http.get<Compte[]>(`${this.apiUrl}/solde/${soldeMin}`);
    }

    // Créer un nouveau compte
    createCompte(compte: CompteCreateRequest): Observable<Compte> {
        return this.http.post<Compte>(this.apiUrl, compte);
    }

    // Mettre à jour un compte
    updateCompte(id: number, compte: CompteUpdateRequest): Observable<Compte> {
        return this.http.put<Compte>(`${this.apiUrl}/${id}`, compte);
    }

    // Mettre à jour le solde d'un compte
    updateSolde(id: number, nouveauSolde: number): Observable<boolean> {
        return this.http.put<boolean>(`${this.apiUrl}/${id}/solde`, nouveauSolde);
    }

    // Supprimer un compte
    deleteCompte(id: number): Observable<{success: boolean, message: string}> {
        return this.http.delete<{success: boolean, message: string}>(`${this.apiUrl}/${id}`);
    }

    // Vérifier si un compte existe
    checkCompteExists(numeroCompte: string): Observable<boolean> {
        return this.http.get<boolean>(`${this.apiUrl}/exists/${numeroCompte}`);
    }

    // Filtrer les comptes avec des paramètres
    filterComptes(filter: CompteFilter, moduleContext?: string): Observable<Compte[]> {
        let params = new HttpParams();

        const appendArrayParam = (key: string, values: string[] | string | undefined) => {
            if (!values) {
                return;
            }
            if (Array.isArray(values)) {
                values
                    .filter((v) => v != null && String(v).trim() !== '')
                    .forEach((v) => {
                        params = params.append(key, v);
                    });
            } else if (String(values).trim() !== '') {
                params = params.set(key, values);
            }
        };

        appendArrayParam('pays', filter.pays);
        appendArrayParam('codeProprietaire', filter.codeProprietaire);
        appendArrayParam('categorie', filter.categorie);
        appendArrayParam('type', filter.type);

        if (filter.dateDebut) {
            params = params.set('dateDebut', filter.dateDebut);
        }
        if (filter.dateFin) {
            params = params.set('dateFin', filter.dateFin);
        }

        return this.http.get<Compte[]>(`${this.apiUrl}/filter`, {
            params,
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    // Récupérer les statistiques des comptes
    getComptesStats(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/stats`);
    }

    // Récupérer la liste des pays uniques
    getDistinctPays(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/pays/list`);
    }

    // Récupérer la liste des codes propriétaires uniques
    getDistinctCodeProprietaire(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/code-proprietaire/list`);
    }

    // Récupérer la liste des agences uniques
    getDistinctAgencies(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/agency/list`);
    }

    // Récupérer la liste des services uniques
    getDistinctServices(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/service/list`);
    }

    // Solde de clôture BO historique
    setSoldeBo(numeroCompte: string, dateSolde: string, soldeBo: number) {
        return this.http.post('/api/compte-solde-bo/set', { numeroCompte, dateSolde, soldeBo });
    }

    getSoldeBo(numeroCompte: string, dateSolde: string) {
        return this.http.get<number>('/api/compte-solde-bo/get', { params: { numeroCompte, dateSolde } });
    }

    listSoldesBo(numeroCompte: string, dateDebut?: string, dateFin?: string) {
        let params = new HttpParams().set('numeroCompte', numeroCompte);
        if (dateDebut) params = params.set('dateDebut', dateDebut);
        if (dateFin) params = params.set('dateFin', dateFin);
        return this.http.get<Array<{ dateSolde: string; soldeBo: number }>>('/api/compte-solde-bo/list', { params });
    }

    // Soldes de clôture manuels
    setSoldeClotureManuel(numeroCompte: string, dateSolde: string, soldeCloture: number) {
        return this.http.post('/api/compte-solde-cloture/set', { numeroCompte, dateSolde, soldeCloture });
    }

    getSoldeClotureManuel(numeroCompte: string, dateSolde: string) {
        return this.http.get<number>('/api/compte-solde-cloture/get', { params: { numeroCompte, dateSolde } });
    }

    deleteSoldeClotureManuel(numeroCompte: string, dateSolde: string) {
        return this.http.delete('/api/compte-solde-cloture/delete', { params: { numeroCompte, dateSolde } });
    }

    listSoldesClotureManuels(numeroCompte: string, dateDebut?: string, dateFin?: string) {
        let params = new HttpParams().set('numeroCompte', numeroCompte);
        if (dateDebut) params = params.set('dateDebut', dateDebut);
        if (dateFin) params = params.set('dateFin', dateFin);
        return this.http.get<CompteSoldeCloture[]>('/api/compte-solde-cloture/list', { params });
    }
} 