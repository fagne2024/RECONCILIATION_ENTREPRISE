import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface SopNode {
  id: string;
  label: string;
  children?: SopNode[];
  route?: string;
  description?: string;
}

export interface SopStructureResponse {
  success: boolean;
  structure?: SopNode;
  error?: string;
}

export interface SopNodeResponse {
  success: boolean;
  message?: string;
  nodeId?: string;
  label?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SopNodeService {
  private apiUrl = '/api/sop-nodes';
  private guideApiUrl = '/api/guide-nodes';

  constructor(private http: HttpClient) {}

  getStructure(): Observable<SopStructureResponse> {
    return this.http.get<SopStructureResponse>(`${this.apiUrl}/structure`);
  }

  getGuideStructure(): Observable<SopStructureResponse> {
    return this.http.get<SopStructureResponse>(`${this.guideApiUrl}/structure`);
  }

  createNode(nodeId: string, label: string, parentNodeId?: string, displayOrder?: number): Observable<SopNodeResponse> {
    let params = new HttpParams()
      .set('nodeId', nodeId)
      .set('label', label);
    
    if (parentNodeId) {
      params = params.set('parentNodeId', parentNodeId);
    }
    if (displayOrder !== undefined) {
      params = params.set('displayOrder', displayOrder.toString());
    }
    
    return this.http.post<SopNodeResponse>(`${this.apiUrl}/create`, null, { params });
  }

  updateNode(nodeId: string, label?: string, route?: string, description?: string): Observable<SopNodeResponse> {
    let params = new HttpParams().set('nodeId', nodeId);
    
    if (label) {
      params = params.set('label', label);
    }
    if (route) {
      params = params.set('route', route);
    }
    if (description) {
      params = params.set('description', description);
    }
    
    // Essayer d'abord avec PUT, puis POST en fallback
    return this.http.put<SopNodeResponse>(`${this.apiUrl}/update`, null, { params }).pipe(
      // Si PUT échoue avec 404, essayer POST
      catchError((error) => {
        if (error.status === 404) {
          console.warn('PUT échoué avec 404, tentative avec POST...');
          return this.http.post<SopNodeResponse>(`${this.apiUrl}/update`, null, { params });
        }
        throw error;
      })
    );
  }

  deleteNode(nodeId: string): Observable<SopNodeResponse> {
    const params = new HttpParams().set('nodeId', nodeId);
    return this.http.delete<SopNodeResponse>(`${this.apiUrl}/delete`, { params });
  }

  // Méthodes pour les guides
  createGuideNode(nodeId: string, label: string, parentNodeId?: string, displayOrder?: number): Observable<SopNodeResponse> {
    let params = new HttpParams()
      .set('nodeId', nodeId)
      .set('label', label);
    
    if (parentNodeId) {
      params = params.set('parentNodeId', parentNodeId);
    }
    if (displayOrder !== undefined) {
      params = params.set('displayOrder', displayOrder.toString());
    }
    
    return this.http.post<SopNodeResponse>(`${this.guideApiUrl}/create`, null, { params });
  }

  updateGuideNode(nodeId: string, label?: string, route?: string, description?: string): Observable<SopNodeResponse> {
    let params = new HttpParams().set('nodeId', nodeId);
    
    if (label) {
      params = params.set('label', label);
    }
    if (route) {
      params = params.set('route', route);
    }
    if (description) {
      params = params.set('description', description);
    }
    
    return this.http.put<SopNodeResponse>(`${this.guideApiUrl}/update`, null, { params }).pipe(
      catchError((error) => {
        if (error.status === 404) {
          console.warn('PUT échoué avec 404, tentative avec POST...');
          return this.http.post<SopNodeResponse>(`${this.guideApiUrl}/update`, null, { params });
        }
        throw error;
      })
    );
  }

  deleteGuideNode(nodeId: string): Observable<SopNodeResponse> {
    const params = new HttpParams().set('nodeId', nodeId);
    return this.http.delete<SopNodeResponse>(`${this.guideApiUrl}/delete`, { params });
  }
}

