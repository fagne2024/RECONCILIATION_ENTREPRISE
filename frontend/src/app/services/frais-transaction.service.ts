import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FraisTransaction, FraisTransactionRequest } from '../models/frais-transaction.model';

@Injectable({
    providedIn: 'root'
})
export class FraisTransactionService {
    private apiUrl = '/api/frais-transaction';

    constructor(private http: HttpClient) {}

    private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
        return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
    }

    // Récupérer tous les frais de transaction
    getAllFraisTransactions(): Observable<FraisTransaction[]> {
        return this.http.get<FraisTransaction[]>(this.apiUrl);
    }

    // Récupérer tous les frais de transaction actifs
    getAllFraisTransactionsActifs(moduleContext?: string): Observable<FraisTransaction[]> {
        return this.http.get<FraisTransaction[]>(`${this.apiUrl}/actifs`, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    // Récupérer un frais de transaction par ID
    getFraisTransactionById(id: number): Observable<FraisTransaction> {
        return this.http.get<FraisTransaction>(`${this.apiUrl}/${id}`);
    }

    // Récupérer les frais de transaction par service
    getFraisTransactionsByService(service: string): Observable<FraisTransaction[]> {
        return this.http.get<FraisTransaction[]>(`${this.apiUrl}/service/${service}`);
    }

    // Récupérer les frais de transaction par agence
    getFraisTransactionsByAgence(agence: string): Observable<FraisTransaction[]> {
        return this.http.get<FraisTransaction[]>(`${this.apiUrl}/agence/${agence}`);
    }

    // Récupérer le frais applicable pour un service et une agence
    getFraisApplicable(service: string, agence: string): Observable<FraisTransaction> {
        return this.http.get<FraisTransaction>(`${this.apiUrl}/applicable?service=${service}&agence=${agence}`);
    }

    // Récupérer tous les services uniques
    getAllServices(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/services`);
    }

    // Récupérer toutes les agences uniques
    getAllAgences(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/agences`);
    }

    // Exporter tous les frais de transaction
    exportFraisTransactions(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/export`);
    }

    // Créer un nouveau frais de transaction
    createFraisTransaction(frais: FraisTransactionRequest): Observable<FraisTransaction> {
        return this.http.post<FraisTransaction>(this.apiUrl, frais);
    }

    // Mettre à jour un frais de transaction
    updateFraisTransaction(id: number, frais: FraisTransactionRequest): Observable<FraisTransaction> {
        return this.http.put<FraisTransaction>(`${this.apiUrl}/${id}`, frais);
    }

    // Supprimer un frais de transaction
    deleteFraisTransaction(id: number): Observable<boolean> {
        return this.http.delete<boolean>(`${this.apiUrl}/${id}`);
    }

    // Activer/désactiver un frais de transaction
    toggleFraisTransaction(id: number): Observable<boolean> {
        return this.http.put<boolean>(`${this.apiUrl}/${id}/toggle`, {});
    }

    // Tester le calcul des frais
    testFraisCalculation(params: any): Observable<any> {
        const queryParams = new URLSearchParams();
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                queryParams.append(key, params[key].toString());
            }
        });
        return this.http.get<any>(`${this.apiUrl}/test-calculation?${queryParams.toString()}`);
    }

    // Filtrer les frais de transaction selon plusieurs critères
    filterFraisTransactions(filters: any): Observable<FraisTransaction[]> {
        return this.http.post<FraisTransaction[]>(`${this.apiUrl}/filter`, filters);
    }
} 