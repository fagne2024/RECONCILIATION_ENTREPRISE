import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Module } from '../models/module.model';

@Injectable({
  providedIn: 'root'
})
export class ModuleService {
  private apiUrl = '/api/profils/modules';

  constructor(private http: HttpClient) { }

  getAllModules(): Observable<Module[]> {
    return this.http.get<Module[]>(this.apiUrl);
  }

  createModule(module: Module): Observable<Module> {
    return this.http.post<Module>(this.apiUrl, module);
  }

  updateModule(id: number, module: Module): Observable<Module> {
    return this.http.put<Module>(`${this.apiUrl}/${id}`, module);
  }

  deleteModule(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
} 