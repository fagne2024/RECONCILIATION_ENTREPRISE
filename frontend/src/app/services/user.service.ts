import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { Profil } from '../models/profil.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = '/api/users';

  constructor(private http: HttpClient) { }

  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl);
  }

  getUserById(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/${id}`);
  }

  createUser(user: User): Observable<User> {
    return this.http.post<User>(this.apiUrl, user);
  }

  updateUser(id: number, user: User): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/${id}`, user);
  }

  deleteUser(id: number): Observable<boolean> {
    return this.http.delete<boolean>(`${this.apiUrl}/${id}`);
  }

  checkAdminExists(): Observable<boolean> {
    return this.http.get<boolean>(`${this.apiUrl}/check-admin`);
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/me`);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/me/password`, {
      currentPassword,
      newPassword
    });
  }

  getMyPhoto(): Observable<{ photo: string | null }> {
    return this.http.get<{ photo: string | null }>(`${this.apiUrl}/me/photo`);
  }

  uploadMyPhoto(photo: string): Observable<{ message: string; photo: string }> {
    return this.http.post<{ message: string; photo: string }>(`${this.apiUrl}/me/photo`, { photo });
  }

  deleteMyPhoto(): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/me/photo`);
  }

  /**
   * Photos de profil (data URL, ou null) des utilisateurs demandés, dans le
   * périmètre de l'entreprise de l'utilisateur connecté.
   * Utilisé par le « Top 3 des utilisateurs » de l'État des réconciliations.
   */
  getUserPhotos(usernames: string[]): Observable<Record<string, string | null>> {
    let params = new HttpParams();
    usernames
      .filter(u => !!u)
      .forEach(u => {
        params = params.append('usernames', u);
      });
    return this.http.get<Record<string, string | null>>(`${this.apiUrl}/photos`, { params });
  }

  resetPassword(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/reset-password`, {});
  }

  setUserEnabled(id: number, enabled: boolean): Observable<{ message: string; user: User }> {
    return this.http.post<{ message: string; user: User }>(`${this.apiUrl}/${id}/set-enabled`, { enabled });
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPasswordWithToken(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-password`, { token, newPassword });
  }
} 