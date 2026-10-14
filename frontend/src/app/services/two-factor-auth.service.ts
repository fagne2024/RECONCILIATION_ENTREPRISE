import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  otpAuthUrl: string;
  message: string;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  hasSecret: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TwoFactorAuthService {
  private apiUrl = '/api/auth/2fa';

  constructor(private http: HttpClient) {}

  /**
   * Génère une clé secrète et un QR code pour activer le 2FA
   */
  setup2FA(username: string): Observable<TwoFactorSetupResponse> {
    return this.http.post<TwoFactorSetupResponse>(`${this.apiUrl}/setup`, { username });
  }

  /**
   * Active le 2FA après validation d'un code
   */
  enable2FA(username: string, code: string): Observable<{ message: string; enabled: boolean }> {
    return this.http.post<{ message: string; enabled: boolean }>(`${this.apiUrl}/enable`, {
      username,
      code
    });
  }

  /**
   * Active le 2FA directement sans validation de code (pour les admins)
   */
  activate2FA(username: string): Observable<{ message: string; enabled: boolean; qrCode: string; otpAuthUrl: string; secret: string; usingExistingSecret?: boolean }> {
    return this.http.post<{ message: string; enabled: boolean; qrCode: string; otpAuthUrl: string; secret: string; usingExistingSecret?: boolean }>(`${this.apiUrl}/activate`, {
      username
    });
  }

  /**
   * Désactive le 2FA pour un utilisateur
   */
  disable2FA(username: string): Observable<{ message: string; enabled: boolean }> {
    return this.http.post<{ message: string; enabled: boolean }>(`${this.apiUrl}/disable`, {
      username
    });
  }

  /**
   * Vérifie le statut du 2FA pour un utilisateur
   */
  get2FAStatus(username: string): Observable<TwoFactorStatusResponse> {
    return this.http.get<TwoFactorStatusResponse>(`${this.apiUrl}/status?username=${username}`);
  }

  /**
   * Réinitialise le 2FA pour un utilisateur (génère une nouvelle clé secrète mais garde le 2FA actif)
   */
  reset2FA(username: string): Observable<{ message: string; enabled: boolean; qrCode: string; otpAuthUrl: string; secret: string }> {
    return this.http.post<{ message: string; enabled: boolean; qrCode: string; otpAuthUrl: string; secret: string }>(`${this.apiUrl}/reset`, {
      username
    });
  }
}

