import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ProgressIndicatorService, ProgressInfo } from '../../services/progress-indicator.service';

@Component({
  selector: 'app-progress-indicator',
  template: `
    <div class="progress-overlay" *ngIf="progressInfo.isVisible">
      <div class="progress-container">
        <div class="progress-header">
          <h3>🔄 Traitement en cours...</h3>
          <div class="file-info" *ngIf="progressInfo.fileName">
            <i class="fas fa-file-excel"></i>
            <span class="file-name">{{ progressInfo.fileName }}</span>
            <span class="file-size" *ngIf="progressInfo.fileSize">
              ({{ formatFileSize(progressInfo.fileSize) }})
            </span>
          </div>
        </div>
        
        <div class="progress-message">
          {{ progressInfo.message }}
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              [style.width.%]="progressInfo.progress"
              [class.animated]="progressInfo.progress > 0 && progressInfo.progress < 100">
            </div>
          </div>
          <div class="progress-percentage">
            {{ progressInfo.progress | number:'1.1-1' }}%
          </div>
        </div>
        
        <div class="progress-tips" *ngIf="progressInfo.progress < 100">
          <p><i class="fas fa-lightbulb"></i> <strong>Conseil:</strong> Les gros fichiers sont traités par chunks pour optimiser les performances.</p>
        </div>
        
        <div class="progress-success" *ngIf="progressInfo.progress === 100">
          <i class="fas fa-check-circle"></i>
          <span>Traitement terminé avec succès !</span>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./progress-indicator.component.scss']
})
export class ProgressIndicatorComponent implements OnInit, OnDestroy {
  progressInfo: ProgressInfo = {
    isVisible: false,
    message: '',
    progress: 0
  };
  
  private subscription: Subscription = new Subscription();

  constructor(private progressIndicatorService: ProgressIndicatorService) {}

  ngOnInit(): void {
    this.subscription = this.progressIndicatorService.progress$.subscribe(
      (progressInfo: ProgressInfo) => {
        this.progressInfo = progressInfo;
      }
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
