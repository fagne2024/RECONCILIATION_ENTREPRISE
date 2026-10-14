import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ExcelConversionService {
  private readonly endpoint = `${environment.apiUrl}/conversion/xls-to-xlsx`;

  constructor(private http: HttpClient) {}

  convertXlsToXlsx(file: File): Observable<Blob> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    const headers = new HttpHeaders({
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    return this.http.post(this.endpoint, formData, {
      headers,
      responseType: 'blob'
    });
  }
}

