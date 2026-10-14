import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ProgressInfo {
  isVisible: boolean;
  message: string;
  progress: number; // 0-100
  fileName?: string;
  fileSize?: number;
  estimatedTime?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProgressIndicatorService {
  private progressSubject = new BehaviorSubject<ProgressInfo>({
    isVisible: false,
    message: '',
    progress: 0
  });

  public progress$: Observable<ProgressInfo> = this.progressSubject.asObservable();

  /**
   * Affiche l'indicateur de progression avec un message
   */
  showProgress(message: string, fileName?: string, fileSize?: number): void {
    this.progressSubject.next({
      isVisible: true,
      message,
      progress: 0,
      fileName,
      fileSize
    });
  }

  /**
   * Met à jour le pourcentage de progression
   */
  updateProgress(progress: number, message?: string): void {
    const current = this.progressSubject.value;
    this.progressSubject.next({
      ...current,
      progress: Math.min(100, Math.max(0, progress)),
      message: message || current.message
    });
  }

  /**
   * Met à jour le message de progression
   */
  updateMessage(message: string): void {
    const current = this.progressSubject.value;
    this.progressSubject.next({
      ...current,
      message
    });
  }

  /**
   * Masque l'indicateur de progression
   */
  hideProgress(): void {
    this.progressSubject.next({
      isVisible: false,
      message: '',
      progress: 0
    });
  }

  /**
   * Calcule le temps estimé restant basé sur la progression
   */
  calculateEstimatedTime(startTime: number, progress: number): string {
    if (progress <= 0) return '';
    
    const elapsed = Date.now() - startTime;
    const estimatedTotal = elapsed / (progress / 100);
    const remaining = estimatedTotal - elapsed;
    
    if (remaining < 1000) return '< 1s';
    if (remaining < 60000) return `${Math.round(remaining / 1000)}s`;
    
    const minutes = Math.round(remaining / 60000);
    return `${minutes}min`;
  }

  /**
   * Formate la taille de fichier en unités lisibles
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
