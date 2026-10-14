import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ImpactOP } from '../../models/impact-op.model';
import { ImpactOPService } from '../../services/impact-op.service';
import { PopupService } from '../../services/popup.service';

@Component({
  selector: 'app-impact-op-tab',
  templateUrl: './impact-op-tab.component.html',
  styleUrls: ['./impact-op-tab.component.scss']
})
export class ImpactOPTabComponent implements OnInit, OnDestroy {
  @Input() agence: string = '';
  @Input() dateTransaction: string = '';

  impactOPs: ImpactOP[] = [];
  isLoading = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  Math = Math;

  // Sélection multiple
  selectedItems: Set<number> = new Set();
  isSelectAll = false;
  isValidatingMass = false;

  private subscription = new Subscription();

  constructor(
    private impactOPService: ImpactOPService,
    private popupService: PopupService
  ) {}

  ngOnInit() {
    this.loadImpactOPs();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loadImpactOPs() {
    if (!this.agence || !this.dateTransaction) return;

    this.isLoading = true;
    
    // Formater la date correctement pour le filtrage précis
    // La date du relevé est au format "YYYY-MM-DD", on doit la convertir en format datetime
    const dateDebut = this.dateTransaction + ' 00:00:00';
    const dateFin = this.dateTransaction + ' 23:59:59';
    
    // Créer les filtres pour la date et l'agence
    const filter = {
      codeProprietaire: this.agence,
      dateDebut: dateDebut,
      dateFin: dateFin
    };

    console.log('Filtrage Impact OP:', filter); // Debug

    this.subscription.add(
      this.impactOPService.getImpactOPs(filter).subscribe({
        next: (impacts) => {
          console.log('Impacts OP récupérés:', impacts.length); // Debug
          this.impactOPs = impacts;
          this.calculatePagination();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des impacts OP:', error);
          this.isLoading = false;
        }
      })
    );
  }

  calculatePagination() {
    this.totalPages = Math.ceil(this.impactOPs.length / this.pageSize);
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages || 1;
    }
  }

  get pagedImpactOPs(): ImpactOP[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.impactOPs.slice(start, end);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(this.totalPages, start + maxVisible - 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatMontant(montant: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 2
    }).format(montant);
  }

  getStatutClass(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE':
        return 'statut-en-attente';
      case 'TRAITE':
        return 'statut-traite';
      case 'ERREUR':
        return 'statut-erreur';
      default:
        return '';
    }
  }

  getStatutLabel(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE':
        return 'En attente';
      case 'TRAITE':
        return 'Traité';
      case 'ERREUR':
        return 'Erreur';
      default:
        return statut;
    }
  }

  calculateTotalMontant(): number {
    return this.impactOPs.reduce((total, impact) => total + (impact.montant || 0), 0);
  }

  formatTotalMontant(): string {
    return this.formatMontant(this.calculateTotalMontant());
  }

  async validateImpactOP(impact: ImpactOP): Promise<void> {
    if (!impact.id) {
      await this.popupService.showError('ID de l\'impact OP manquant');
      return;
    }

    const confirmed = await this.popupService.showConfirmDialog(
      `Êtes-vous sûr de vouloir valider cet impact OP ?\n\nType: ${impact.typeOperation}\nMontant: ${this.formatMontant(impact.montant)}`,
      'Confirmation de validation'
    );

    if (confirmed) {
      this.isLoading = true;
      
      this.subscription.add(
        this.impactOPService.updateImpactOPStatut(impact.id, 'TRAITE').subscribe({
          next: (response: any) => {
            // Mettre à jour le statut localement
            impact.statut = 'TRAITE';
            this.isLoading = false;
            this.popupService.showSuccess('Impact OP validé avec succès');
          },
          error: (err: any) => {
            this.isLoading = false;
            this.popupService.showError('Erreur lors de la validation: ' + err.message);
          }
        })
      );
    }
  }

  // Méthodes de sélection multiple
  isItemSelected(impact: ImpactOP): boolean {
    return impact.id ? this.selectedItems.has(impact.id) : false;
  }

  toggleItemSelection(impact: ImpactOP): void {
    if (!impact.id || impact.statut === 'TRAITE') return;
    
    if (this.selectedItems.has(impact.id)) {
      this.selectedItems.delete(impact.id);
    } else {
      this.selectedItems.add(impact.id);
    }
    this.updateSelectAllState();
  }

  toggleSelectAll(): void {
    if (this.isSelectAll) {
      this.selectedItems.clear();
    } else {
      // Sélectionner tous les éléments EN_ATTENTE
      this.impactOPs.forEach(impact => {
        if (impact.id && impact.statut === 'EN_ATTENTE') {
          this.selectedItems.add(impact.id);
        }
      });
    }
    this.updateSelectAllState();
  }

  updateSelectAllState(): void {
    const eligibleItems = this.impactOPs.filter(impact => 
      impact.id && impact.statut === 'EN_ATTENTE'
    );
    this.isSelectAll = eligibleItems.length > 0 && 
      eligibleItems.every(impact => impact.id && this.selectedItems.has(impact.id));
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.isSelectAll = false;
  }

  async validateSelectedImpactOPs(): Promise<void> {
    if (this.selectedItems.size === 0) {
      await this.popupService.showError('Aucun élément sélectionné');
      return;
    }

    const selectedImpactOPs = this.impactOPs.filter(impact => 
      impact.id && this.selectedItems.has(impact.id)
    );

    const confirmed = await this.popupService.showConfirmDialog(
      `Êtes-vous sûr de vouloir valider ${selectedImpactOPs.length} impact(s) OP sélectionné(s) ?`,
      'Confirmation de validation en masse'
    );

    if (confirmed) {
      this.isValidatingMass = true;
      let successCount = 0;
      let errorCount = 0;

      // Traiter les validations en parallèle
      const validationPromises = selectedImpactOPs.map(impact => 
        this.impactOPService.updateImpactOPStatut(impact.id!, 'TRAITE').toPromise()
          .then(() => {
            impact.statut = 'TRAITE';
            successCount++;
          })
          .catch(() => {
            errorCount++;
          })
      );

      try {
        await Promise.all(validationPromises);
        
        if (successCount > 0) {
          this.popupService.showSuccess(`${successCount} impact(s) OP validé(s) avec succès`);
        }
        if (errorCount > 0) {
          this.popupService.showError(`${errorCount} erreur(s) lors de la validation`);
        }
        
        this.clearSelection();
      } catch (error) {
        this.popupService.showError('Erreur lors de la validation en masse');
      } finally {
        this.isValidatingMass = false;
      }
    }
  }
} 