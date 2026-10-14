import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Service de logging sécurisé
 * Les logs ne sont affichés qu'en mode développement
 * En production, tous les logs sont désactivés pour ne pas divulguer d'informations
 */
@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private readonly isDevelopment = !environment.production;

  /**
   * Log d'information (uniquement en développement)
   */
  log(...args: any[]): void {
    if (this.isDevelopment) {
      console.log(...args);
    }
  }

  /**
   * Log d'avertissement (uniquement en développement)
   */
  warn(...args: any[]): void {
    if (this.isDevelopment) {
      console.warn(...args);
    }
  }

  /**
   * Log d'erreur (toujours actif, mais sanitizé en production)
   */
  error(...args: any[]): void {
    if (this.isDevelopment) {
      console.error(...args);
    } else {
      // En production, log générique sans détails sensibles
      console.error('Une erreur est survenue');
    }
  }

  /**
   * Log de debug (uniquement en développement)
   */
  debug(...args: any[]): void {
    if (this.isDevelopment) {
      console.debug(...args);
    }
  }

  /**
   * Log d'information générale (toujours actif)
   */
  info(...args: any[]): void {
    if (this.isDevelopment) {
      console.info(...args);
    }
  }

  /**
   * Log de table (uniquement en développement)
   */
  table(data: any): void {
    if (this.isDevelopment) {
      console.table(data);
    }
  }

  /**
   * Groupement de logs (uniquement en développement)
   */
  group(label: string): void {
    if (this.isDevelopment) {
      console.group(label);
    }
  }

  /**
   * Fin de groupement de logs (uniquement en développement)
   */
  groupEnd(): void {
    if (this.isDevelopment) {
      console.groupEnd();
    }
  }

  /**
   * Mesure de performance (uniquement en développement)
   */
  time(label: string): void {
    if (this.isDevelopment) {
      console.time(label);
    }
  }

  /**
   * Fin de mesure de performance (uniquement en développement)
   */
  timeEnd(label: string): void {
    if (this.isDevelopment) {
      console.timeEnd(label);
    }
  }
}









