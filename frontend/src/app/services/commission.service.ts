import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CommissionTransaction, CommissionRequest } from '../models/commission.model';

@Injectable({
    providedIn: 'root'
})
export class CommissionService {
    private apiUrl = '/api/commission';

    constructor(private http: HttpClient) {}

    private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
        return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
    }

    getAllCommissions(): Observable<CommissionTransaction[]> {
        return this.http.get<CommissionTransaction[]>(this.apiUrl);
    }

    getAllCommissionsActifs(moduleContext?: string): Observable<CommissionTransaction[]> {
        return this.http.get<CommissionTransaction[]>(`${this.apiUrl}/actifs`, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    getCommissionById(id: number): Observable<CommissionTransaction> {
        return this.http.get<CommissionTransaction>(`${this.apiUrl}/${id}`);
    }

    getCommissionsByService(service: string): Observable<CommissionTransaction[]> {
        return this.http.get<CommissionTransaction[]>(`${this.apiUrl}/service/${service}`);
    }

    getCommissionsByAgence(agence: string): Observable<CommissionTransaction[]> {
        return this.http.get<CommissionTransaction[]>(`${this.apiUrl}/agence/${agence}`);
    }

    getCommissionApplicable(service: string, agence: string): Observable<CommissionTransaction> {
        return this.http.get<CommissionTransaction>(`${this.apiUrl}/applicable?service=${service}&agence=${agence}`);
    }

    createCommission(commission: CommissionRequest): Observable<CommissionTransaction> {
        return this.http.post<CommissionTransaction>(this.apiUrl, commission);
    }

    updateCommission(id: number, commission: CommissionRequest): Observable<CommissionTransaction> {
        return this.http.put<CommissionTransaction>(`${this.apiUrl}/${id}`, commission);
    }

    deleteCommission(id: number): Observable<boolean> {
        return this.http.delete<boolean>(`${this.apiUrl}/${id}`);
    }

    toggleCommission(id: number): Observable<boolean> {
        return this.http.put<boolean>(`${this.apiUrl}/${id}/toggle`, {});
    }
}
