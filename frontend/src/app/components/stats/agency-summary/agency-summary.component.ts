import { Component, OnInit } from '@angular/core';
import { AgencySummaryService } from '../../../services/agency-summary.service';
import * as XLSX from 'xlsx';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-agency-summary',
  templateUrl: './agency-summary.component.html',
  styleUrls: ['./agency-summary.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, TranslateModule]
})
export class AgencySummaryComponent implements OnInit {
  loading = false;

  constructor(
    private agencySummaryService: AgencySummaryService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
  }

  exportToExcel(): void {
    this.loading = true;
    this.agencySummaryService.exportAllSummaries('Statistiques').subscribe({
      next: (response) => {
        if (response.success) {
          const data = response.data;
          const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
          const sheetName = this.translateKey('STA.sheetSummaryByAgency');
          const workbook: XLSX.WorkBook = { Sheets: { [sheetName]: worksheet }, SheetNames: [sheetName] };
          XLSX.writeFile(workbook, `resume_agence_${new Date().toISOString().split('T')[0]}.xlsx`);
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur lors de l\'export:', error);
        this.loading = false;
      }
    });
  }

  private translateKey(key: string, params?: Record<string, unknown>): string {
    const value = params
      ? this.translate.instant(key, params as never)
      : this.translate.instant(key);
    return typeof value === 'string' ? (value as string) : key;
  }
} 