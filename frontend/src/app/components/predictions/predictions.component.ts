import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PredictionService, PredictionRequest, PredictionResponse, PredictionType } from '../../services/prediction.service';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-predictions',
  templateUrl: './predictions.component.html',
  styleUrls: ['./predictions.component.scss']
})
export class PredictionsComponent implements OnInit {
  predictionForm: FormGroup;
  availableTypes: PredictionType[] = [];
  predictionResponse: PredictionResponse | null = null;
  isLoading: boolean = false;
  errorMessage: string | null = null;
  chart: any = null;

  // Options de méthode de prédiction
  methodesPrediction = [
    { value: 'moyenne', label: 'Moyenne Simple' },
    { value: 'tendance', label: 'Tendance Linéaire' },
    { value: 'saisonnier', label: 'Saisonnier (Jour de la semaine)' }
  ];

  constructor(
    private fb: FormBuilder,
    private predictionService: PredictionService,
    private router: Router
  ) {
    this.predictionForm = this.fb.group({
      typeOperation: ['', Validators.required],
      horizonJours: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
      periodeAnalyseJours: [90, [Validators.required, Validators.min(7), Validators.max(730)]],
      methodePrediction: ['tendance', Validators.required],
      codeProprietaire: [''],
      service: [''],
      pays: ['']
    });
  }

  async ngOnInit() {
    await this.loadAvailableTypes();
  }

  /**
   * Retour à la page des comptes
   */
  goBack() {
    this.router.navigate(['/comptes']);
  }

  /**
   * Charge les types d'opérations disponibles
   */
  async loadAvailableTypes() {
    try {
      this.availableTypes = await this.predictionService.getAvailableTypes().toPromise() || [];
    } catch (error: any) {
      console.error('Erreur lors du chargement des types:', error);
      this.errorMessage = 'Erreur lors du chargement des types d\'opérations';
    }
  }

  /**
   * Génère une prédiction
   */
  async generatePrediction() {
    if (this.predictionForm.invalid) {
      this.markFormGroupTouched(this.predictionForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.predictionResponse = null;

    try {
      const request: PredictionRequest = {
        typeOperation: this.predictionForm.value.typeOperation,
        horizonJours: this.predictionForm.value.horizonJours,
        periodeAnalyseJours: this.predictionForm.value.periodeAnalyseJours,
        methodePrediction: this.predictionForm.value.methodePrediction,
        codeProprietaire: this.predictionForm.value.codeProprietaire || undefined,
        service: this.predictionForm.value.service || undefined,
        pays: this.predictionForm.value.pays || undefined
      };

      this.predictionResponse = await this.predictionService.predict(request).toPromise() || null;

      if (this.predictionResponse) {
        this.createChart();
      }
    } catch (error: any) {
      console.error('Erreur lors de la génération de la prédiction:', error);
      this.errorMessage = error.error?.message || error.message || 'Erreur lors de la génération de la prédiction';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Crée un graphique pour visualiser les prédictions
   */
  createChart() {
    if (!this.predictionResponse || !this.predictionResponse.predictionsParJour) {
      return;
    }

    const ctx = document.getElementById('predictionChart') as HTMLCanvasElement;
    if (!ctx) {
      return;
    }

    // Détruire le graphique existant
    if (this.chart) {
      this.chart.destroy();
    }

    const labels = this.predictionResponse.predictionsParJour.map(p => {
      const date = new Date(p.date);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    });

    const montants = this.predictionResponse.predictionsParJour.map(p => p.montantPrediction);
    const confiances = this.predictionResponse.predictionsParJour.map(p => p.confiance);

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Montant Prédit',
            data: montants,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Confiance',
            data: confiances.map(c => c * 1000), // Multiplier pour l'échelle
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.4,
            yAxisID: 'y1',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: `Prédictions - ${this.getTypeOperationLabel(this.predictionResponse.typeOperation)}`
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                if (context.datasetIndex === 0) {
                  return `Montant: ${context.parsed.y.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}`;
                } else {
                  return `Confiance: ${(context.parsed.y / 1000 * 100).toFixed(1)}%`;
                }
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Montant (XOF)'
            },
            ticks: {
              callback: (value: any) => {
                return value.toLocaleString('fr-FR') + ' XOF';
              }
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Confiance (%)'
            },
            ticks: {
              callback: (value: any) => {
                return (value / 10).toFixed(0) + '%';
              }
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  /**
   * Retourne le label d'un type d'opération
   */
  getTypeOperationLabel(type: string): string {
    const typeObj = this.availableTypes.find(t => t.value === type);
    return typeObj ? typeObj.label : type;
  }

  /**
   * Formate un nombre en format monétaire
   */
  formatCurrency(value: number): string {
    return value.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });
  }

  /**
   * Formate un pourcentage
   */
  formatPercent(value: number): string {
    return (value * 100).toFixed(1) + '%';
  }

  /**
   * Marque tous les champs du formulaire comme touchés
   */
  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  /**
   * Exporte les prédictions en CSV
   */
  exportToCSV() {
    if (!this.predictionResponse) {
      return;
    }

    const csv = [
      ['Date', 'Jour de la Semaine', 'Montant Prédit', 'Nombre d\'Opérations', 'Confiance'],
      ...this.predictionResponse.predictionsParJour.map(p => [
        p.date,
        p.jourSemaine,
        p.montantPrediction.toFixed(2),
        p.nombreOperationsPredites.toString(),
        (p.confiance * 100).toFixed(2) + '%'
      ])
    ].map(row => row.join(';')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `predictions_${this.predictionResponse.typeOperation}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

