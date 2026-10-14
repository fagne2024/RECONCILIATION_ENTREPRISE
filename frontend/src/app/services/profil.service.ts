import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Profil } from '../models/profil.model';
import { Module } from '../models/module.model';
import { Permission } from '../models/permission.model';
import { ProfilPermission } from '../models/profil-permission.model';

@Injectable({ providedIn: 'root' })
export class ProfilService {
  private apiUrl = '/api/profils';

  constructor(private http: HttpClient) {}

  // Profils
  getProfils(): Observable<Profil[]> {
    return this.http.get<Profil[]>(this.apiUrl);
  }
  createProfil(profil: Profil): Observable<Profil> {
    return this.http.post<Profil>(this.apiUrl, profil);
  }
  updateProfil(id: number, profil: Profil): Observable<Profil> {
    return this.http.put<Profil>(`${this.apiUrl}/${id}`, profil);
  }
  deleteProfil(id: number): Observable<any> {
    console.log('🚀 Envoi de la requête DELETE vers:', `${this.apiUrl}/${id}`);
    return this.http.delete<{message: string, id: string}>(`${this.apiUrl}/${id}`);
  }

  // Modules
  getModules(): Observable<Module[]> {
    return this.http.get<Module[]>(`${this.apiUrl}/modules`);
  }
  createModule(module: Module): Observable<Module> {
    return this.http.post<Module>(`${this.apiUrl}/modules`, module);
  }

  // Permissions
  getPermissions(): Observable<Permission[]> {
    return this.http.get<Permission[]>(`${this.apiUrl}/permissions`);
  }
  createPermission(permission: Permission): Observable<Permission> {
    return this.http.post<Permission>(`${this.apiUrl}/permissions`, permission);
  }

  getPermissionsForModule(moduleId: number): Observable<Permission[]> {
    return this.http.get<Permission[]>(`${this.apiUrl}/modules/${moduleId}/permissions`);
  }

  // Droits d’un profil
  getProfilPermissions(profilId: number): Observable<ProfilPermission[]> {
    return this.http.get<ProfilPermission[]>(`${this.apiUrl}/${profilId}/droits`);
  }
  addPermissionToProfil(profilId: number, moduleId: number, permissionId: number): Observable<ProfilPermission> {
    return this.http.post<ProfilPermission>(`${this.apiUrl}/${profilId}/droits?moduleId=${moduleId}&permissionId=${permissionId}`, {});
  }
  addMultiplePermissionsToProfil(profilId: number, moduleId: number, permissionIds: number[]): Observable<ProfilPermission[]> {
    return this.http.post<ProfilPermission[]>(`${this.apiUrl}/${profilId}/droits/batch?moduleId=${moduleId}`, permissionIds);
  }
  removePermissionFromProfil(profilPermissionId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/droits/${profilPermissionId}`);
  }

  syncModuleActions(moduleName: string): Observable<{ moduleName: string; actionsCount: number; permissionsCreated: number; message: string }> {
    return this.http.post<{ moduleName: string; actionsCount: number; permissionsCreated: number; message: string }>(
      `${this.apiUrl}/modules/${encodeURIComponent(moduleName)}/sync-actions`,
      {}
    );
  }

  syncSubmenuModuleActions(
    accessModuleName: string,
    parentModule: string,
    prefixes: string[]
  ): Observable<{ moduleName: string; actionsCount: number; permissionsCreated: number; message: string }> {
    return this.http.post<{ moduleName: string; actionsCount: number; permissionsCreated: number; message: string }>(
      `${this.apiUrl}/modules/${encodeURIComponent(accessModuleName)}/sync-submenu-actions`,
      { parentModule, prefixes }
    );
  }
} 