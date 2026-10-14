import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ExcelTypeDetectionService, ExcelFileAnalysis, ExcelColumnInfo, ExcelFormattingRecommendation } from '../../services/excel-type-detection.service';

@Component({
  selector: 'app-excel-analysis',
  templateUrl: './excel-analysis.component.html',
  styleUrls: ['./excel-analysis.component.scss']
})
export class ExcelAnalysisComponent implements OnInit, OnChanges {

  @Input() data: any[] = [];
  @Input() fileName: string = '';
  
  analysis: ExcelFileAnalysis | null = null;
  selectedColumn: ExcelColumnInfo | null = null;
  loading = false;
  error: string | null = null;

  constructor(
    private excelTypeDetectionService: ExcelTypeDetectionService
  ) {}

  ngOnInit(): void {
    if (this.data && this.data.length > 0 && this.fileName) {
      this.analyzeExcelFile();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['fileName']) {
      if (this.data && this.data.length > 0 && this.fileName) {
        this.analyzeExcelFile();
      }
    }
  }

  private analyzeExcelFile(): void {
    this.loading = true;
    this.error = null;

    try {
      console.log('🔍 Début de l\'analyse Excel pour:', this.fileName);
      this.analysis = this.excelTypeDetectionService.analyzeExcelFile(this.data, this.fileName);
      console.log('✅ Analyse Excel terminée:', this.analysis);
    } catch (error) {
      console.error('❌ Erreur lors de l\'analyse Excel:', error);
      this.error = 'Erreur lors de l\'analyse du fichier Excel';
    } finally {
      this.loading = false;
    }
  }

  selectColumn(column: ExcelColumnInfo): void {
    this.selectedColumn = column;
  }

  getTypeColor(type: string): string {
    switch (type) {
      case 'date': return '#4CAF50';
      case 'amount': return '#2196F3';
      case 'number': return '#FF9800';
      case 'text': return '#9C27B0';
      case 'boolean': return '#607D8B';
      default: return '#757575';
    }
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return '#4CAF50';
    if (confidence >= 0.6) return '#FF9800';
    return '#F44336';
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return '#F44336';
      case 'medium': return '#FF9800';
      case 'low': return '#4CAF50';
      default: return '#757575';
    }
  }

  formatValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      return value.toLocaleString('fr-FR');
    }
    return String(value);
  }

  getQualityColor(quality: number): string {
    if (quality >= 0.8) return '#4CAF50';
    if (quality >= 0.6) return '#FF9800';
    return '#F44336';
  }

  applyRecommendation(recommendation: ExcelFormattingRecommendation): void {
    console.log('🔧 Application de la recommandation:', recommendation);
    // Ici on pourrait implémenter l'application automatique des recommandations
    // Pour l'instant, on affiche juste un message
    alert(`Recommandation appliquée: ${recommendation.description}`);
  }

  getRecommendationIcon(type: string): string {
    switch (type) {
      case 'format': return 'format_paint';
      case 'validate': return 'verified';
      case 'transform': return 'transform';
      case 'clean': return 'cleaning_services';
      default: return 'info';
    }
  }

  // Méthodes utilitaires pour gérer les valeurs null
  getAnalysis(): ExcelFileAnalysis | null {
    return this.analysis;
  }

  getSelectedColumn(): ExcelColumnInfo | null {
    return this.selectedColumn;
  }

  hasAnalysis(): boolean {
    return this.analysis !== null;
  }

  hasSelectedColumn(): boolean {
    return this.selectedColumn !== null;
  }
} 