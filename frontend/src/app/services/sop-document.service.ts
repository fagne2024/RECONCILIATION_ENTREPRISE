import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SopDocumentResponse {
  exists: boolean;
  fileName?: string;
  fileType?: string;
  extractedText?: string;
  createdAt?: string;
}

export interface SopDocumentUploadResponse {
  success: boolean;
  message: string;
  documentId?: number;
  fileName?: string;
  extractedText?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SopDocumentService {
  private apiUrl = '/api/sop-documents';
  private guideApiUrl = '/api/guide-documents';

  constructor(private http: HttpClient) {}

  checkDocumentExists(nodeId: string, optionType: string): Observable<{ exists: boolean }> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.get<{ exists: boolean }>(`${this.apiUrl}/exists`, { params });
  }

  getDocumentContent(nodeId: string, optionType: string): Observable<SopDocumentResponse> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.get<SopDocumentResponse>(`${this.apiUrl}/content`, { params });
  }

  uploadDocument(file: File, nodeId: string, optionType: string, extractedText?: string): Observable<SopDocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('nodeId', nodeId);
    formData.append('optionType', optionType);
    if (extractedText) {
      formData.append('extractedText', extractedText);
    }
    return this.http.post<SopDocumentUploadResponse>(`${this.apiUrl}/upload`, formData);
  }

  downloadDocument(nodeId: string, optionType: string): Observable<Blob> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.get(`${this.apiUrl}/download`, { params, responseType: 'blob' });
  }

  updateDocument(nodeId: string, optionType: string, file?: File, extractedText?: string): Observable<SopDocumentUploadResponse> {
    const formData = new FormData();
    formData.append('nodeId', nodeId);
    formData.append('optionType', optionType);
    if (file) {
      formData.append('file', file);
    }
    if (extractedText) {
      formData.append('extractedText', extractedText);
    }
    return this.http.put<SopDocumentUploadResponse>(`${this.apiUrl}/update`, formData);
  }

  deleteDocument(nodeId: string, optionType: string): Observable<{ success: boolean; message: string; error?: string }> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.delete<{ success: boolean; message: string; error?: string }>(`${this.apiUrl}/delete`, { params });
  }

  // Méthodes pour les guides
  checkGuideDocumentExists(nodeId: string, optionType: string): Observable<{ exists: boolean }> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.get<{ exists: boolean }>(`${this.guideApiUrl}/exists`, { params });
  }

  getGuideDocumentContent(nodeId: string, optionType: string): Observable<SopDocumentResponse> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.get<SopDocumentResponse>(`${this.guideApiUrl}/content`, { params });
  }

  uploadGuideDocument(file: File, nodeId: string, optionType: string, extractedText?: string): Observable<SopDocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('nodeId', nodeId);
    formData.append('optionType', optionType);
    if (extractedText) {
      formData.append('extractedText', extractedText);
    }
    return this.http.post<SopDocumentUploadResponse>(`${this.guideApiUrl}/upload`, formData);
  }

  downloadGuideDocument(nodeId: string, optionType: string): Observable<Blob> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.get(`${this.guideApiUrl}/download`, { params, responseType: 'blob' });
  }

  updateGuideDocument(nodeId: string, optionType: string, file?: File, extractedText?: string): Observable<SopDocumentUploadResponse> {
    const formData = new FormData();
    formData.append('nodeId', nodeId);
    formData.append('optionType', optionType);
    if (file) {
      formData.append('file', file);
    }
    if (extractedText) {
      formData.append('extractedText', extractedText);
    }
    return this.http.put<SopDocumentUploadResponse>(`${this.guideApiUrl}/update`, formData);
  }

  deleteGuideDocument(nodeId: string, optionType: string): Observable<{ success: boolean; message: string; error?: string }> {
    const params = new HttpParams()
      .set('nodeId', nodeId)
      .set('optionType', optionType);
    return this.http.delete<{ success: boolean; message: string; error?: string }>(`${this.guideApiUrl}/delete`, { params });
  }
}

