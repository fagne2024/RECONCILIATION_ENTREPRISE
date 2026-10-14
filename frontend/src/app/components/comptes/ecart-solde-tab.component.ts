import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { EcartSoldeService } from '../../services/ecart-solde.service';
import { EcartSolde } from '../../models/ecart-solde.model';
import { Subscription } from 'rxjs';
import { PopupService } from '../../services/popup.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-ecart-solde-tab',
  templateUrl: './ecart-solde-tab.component.html',
  styleUrls: ['./ecart-solde-tab.component.scss']
})
export class EcartSoldeTabComponent implements OnInit, OnDestroy, OnChanges {
  @Input() agence: string = '';
  @Input() dateTransaction: string = '';
  @Input() revenuJournalierData: { date: string; totalCashin: number; totalPaiement: number; fraisCashin: number; fraisPaiement: number; revenuTotal: number; ecartFrais: number }[] = [];
  
  ecartSoldes: EcartSolde[] = [];
  filteredEcartSoldes: EcartSolde[] = [];
  revenuJournalierRows: { date: string; totalCashin: number; totalPaiement: number; fraisCashin: number; fraisPaiement: number; revenuTotal: number; ecartFrais: number }[] = [];
  combinedRows: any[] = [];
  isLoading = false;
  error: string | null = null;
  
  // Pagination
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
    private ecartSoldeService: EcartSoldeService,
    private popupService: PopupService
  ) {}

  ngOnInit(): void {
    this.loadEcartSoldes();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['revenuJournalierData'] && !changes['revenuJournalierData'].firstChange) {
      // Re-filtrer les données si revenuJournalierData change
      if (this.filteredEcartSoldes.length > 0 || this.revenuJournalierData.length > 0) {
        this.filterEcartSoldes();
      }
    }
    if (changes['agence'] || changes['dateTransaction']) {
      // Re-filtrer si agence ou dateTransaction change
      this.filterEcartSoldes();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadEcartSoldes(): void {
    if (!this.agence) {
      this.error = 'Agence non spécifiée';
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.subscription.add(
      this.ecartSoldeService.getEcartSoldes().subscribe({
        next: (ecartSoldes: EcartSolde[]) => {
          this.ecartSoldes = ecartSoldes;
          this.filterEcartSoldes();
          this.isLoading = false;
        },
        error: (err: any) => {
          this.error = 'Erreur lors du chargement des écarts de solde: ' + err.message;
          this.isLoading = false;
        }
      })
    );
  }

  filterEcartSoldes(): void {
    if (!this.agence) {
      this.filteredEcartSoldes = [];
      this.combinedRows = [];
      return;
    }

    // Filtrer par agence
    let filtered = this.ecartSoldes.filter(ecart => 
      ecart.agence === this.agence
    );

    // Filtrer par statut (EN_ATTENTE et TRAITE uniquement)
    filtered = filtered.filter(ecart => 
      ecart.statut === 'EN_ATTENTE' || ecart.statut === 'TRAITE'
    );

    // Filtrer par date de transaction si spécifiée
    let targetDateString = '';
    if (this.dateTransaction) {
      const targetDate = new Date(this.dateTransaction);
      targetDateString = targetDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
      
      filtered = filtered.filter(ecart => {
        if (!ecart.dateTransaction) return false;
        const ecartDate = new Date(ecart.dateTransaction);
        const ecartDateString = ecartDate.toISOString().split('T')[0];
        return ecartDateString === targetDateString;
      });
    }

    // Trier par date décroissante (du plus récent au plus ancien)
    filtered.sort((a, b) => new Date(b.dateTransaction).getTime() - new Date(a.dateTransaction).getTime());

    this.filteredEcartSoldes = filtered;

    // Filtrer les lignes de revenu journalier pour la même date où ecartFrais n'est pas null
    this.revenuJournalierRows = [];
    if (this.revenuJournalierData && this.revenuJournalierData.length > 0) {
      this.revenuJournalierRows = this.revenuJournalierData.filter(revenu => {
        // Vérifier que ecartFrais n'est pas null et non zéro
        if (revenu.ecartFrais === null || revenu.ecartFrais === undefined || revenu.ecartFrais === 0) {
          return false;
        }
        
        // Si une date de transaction est spécifiée, filtrer par date
        if (targetDateString) {
          const revenuDate = new Date(revenu.date);
          const revenuDateString = revenuDate.toISOString().split('T')[0];
          return revenuDateString === targetDateString;
        }
        
        return true;
      });
    }

    // Combiner les écarts de solde et les lignes de revenu journalier
    this.combineRows();
    this.calculatePagination();
  }

  combineRows(): void {
    this.combinedRows = [];
    
    // Ajouter les écarts de solde
    this.filteredEcartSoldes.forEach(ecart => {
      this.combinedRows.push({
        type: 'ecart-solde',
        data: ecart
      });
    });
    
    // Ajouter les lignes de revenu journalier
    this.revenuJournalierRows.forEach(revenu => {
      this.combinedRows.push({
        type: 'revenu-journalier',
        data: revenu
      });
    });
    
    // Trier par date décroissante
    this.combinedRows.sort((a, b) => {
      let dateA: Date;
      let dateB: Date;
      
      if (a.type === 'ecart-solde') {
        dateA = new Date(a.data.dateTransaction);
      } else {
        dateA = new Date(a.data.date);
      }
      
      if (b.type === 'ecart-solde') {
        dateB = new Date(b.data.dateTransaction);
      } else {
        dateB = new Date(b.data.date);
      }
      
      return dateB.getTime() - dateA.getTime();
    });
  }

  calculatePagination(): void {
    const totalItems = this.combinedRows.length;
    this.totalPages = Math.ceil(totalItems / this.pageSize);
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages || 1;
    }
  }

  get pagedEcartSoldes(): EcartSolde[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredEcartSoldes.slice(start, end);
  }

  get pagedCombinedRows(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.combinedRows.slice(start, end);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number): void {
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

  isRevenuJournalierRow(row: any): boolean {
    return row && row.type === 'revenu-journalier';
  }

  isEcartSoldeRow(row: any): boolean {
    return row && row.type === 'ecart-solde';
  }

  getStatutClass(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE': return 'status-attente';
      case 'TRAITE': return 'status-traite';
      case 'ERREUR': return 'status-erreur';
      default: return 'status-default';
    }
  }

  formatMontant(montant: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(montant) + ' F CFA';
  }

  formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  formatMontantFrais(montant: number): string {
    if (montant === null || montant === undefined) return '0,00 F CFA';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(montant) + ' F CFA';
  }

  getFraisTypeClass(typeCalcul: string): string {
    switch (typeCalcul) {
      case 'POURCENTAGE': return 'frais-type-percentage';
      case 'NOMINAL': return 'frais-type-nominal';
      default: return 'frais-type-default';
    }
  }

  getFraisTypeLabel(typeCalcul: string): string {
    switch (typeCalcul) {
      case 'POURCENTAGE': return 'Pourcentage';
      case 'NOMINAL': return 'Fixe';
      default: return 'Standard';
    }
  }

  calculateTotalEcart(): number {
    let totalEcart = 0;
    
    // Total : montant + frais (frais ≤ 0, convention écart-solde)
    this.filteredEcartSoldes.forEach(ecart => {
      const montant = ecart.montant || 0;
      const frais = ecart.fraisAssocie?.montant || 0;
      totalEcart += montant + frais;
    });
    
    // Soustraire les montants ecartFrais des lignes de revenu journalier
    this.revenuJournalierRows.forEach(revenu => {
      const ecartFrais = revenu.ecartFrais || 0;
      totalEcart -= ecartFrais;
    });
    
    return totalEcart;
  }

  formatTotalEcart(): string {
    const total = this.calculateTotalEcart();
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(total) + ' F CFA';
  }

  calculateEcart(ecart: EcartSolde): number {
    const montant = ecart.montant || 0;
    const frais = ecart.fraisAssocie ? ecart.fraisAssocie.montant : 0;
    return montant + frais;
  }

  async validateEcartSolde(ecart: EcartSolde): Promise<void> {
    if (!ecart.id) {
      await this.popupService.showError('ID de l\'écart de solde manquant');
      return;
    }

    const confirmed = await this.popupService.showConfirmDialog(
      `Êtes-vous sûr de vouloir valider cet écart de solde ?\n\nID Transaction: ${ecart.idTransaction}\nMontant: ${this.formatMontant(ecart.montant)}\nService: ${ecart.service || 'N/A'}`,
      'Confirmation de validation'
    );

    if (confirmed) {
      this.isLoading = true;
      
      this.subscription.add(
        this.ecartSoldeService.updateStatut(ecart.id, 'TRAITE').subscribe({
          next: (response: any) => {
            // Mettre à jour le statut localement
            ecart.statut = 'TRAITE';
            this.isLoading = false;
            this.popupService.showSuccess('Écart de solde validé avec succès');
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
  isItemSelected(ecart: EcartSolde): boolean {
    return ecart.id ? this.selectedItems.has(ecart.id) : false;
  }

  toggleItemSelection(ecart: EcartSolde): void {
    if (!ecart.id || ecart.statut === 'TRAITE') return;
    
    if (this.selectedItems.has(ecart.id)) {
      this.selectedItems.delete(ecart.id);
    } else {
      this.selectedItems.add(ecart.id);
    }
    this.updateSelectAllState();
  }

  toggleSelectAll(): void {
    if (this.isSelectAll) {
      this.selectedItems.clear();
    } else {
      // Sélectionner tous les éléments EN_ATTENTE
      this.filteredEcartSoldes.forEach(ecart => {
        if (ecart.id && ecart.statut === 'EN_ATTENTE') {
          this.selectedItems.add(ecart.id);
        }
      });
    }
    this.updateSelectAllState();
  }

  updateSelectAllState(): void {
    const eligibleItems = this.filteredEcartSoldes.filter(ecart => 
      ecart.id && ecart.statut === 'EN_ATTENTE'
    );
    this.isSelectAll = eligibleItems.length > 0 && 
      eligibleItems.every(ecart => ecart.id && this.selectedItems.has(ecart.id));
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.isSelectAll = false;
  }

  async validateSelectedEcartSoldes(): Promise<void> {
    if (this.selectedItems.size === 0) {
      await this.popupService.showError('Aucun élément sélectionné');
      return;
    }

    const selectedEcartSoldes = this.filteredEcartSoldes.filter(ecart => 
      ecart.id && this.selectedItems.has(ecart.id)
    );

    const confirmed = await this.popupService.showConfirmDialog(
      `Êtes-vous sûr de vouloir valider ${selectedEcartSoldes.length} écart(s) de solde sélectionné(s) ?`,
      'Confirmation de validation en masse'
    );

    if (confirmed) {
      this.isValidatingMass = true;
      let successCount = 0;
      let errorCount = 0;

      // Traiter les validations en parallèle
      const validationPromises = selectedEcartSoldes.map(ecart => 
        this.ecartSoldeService.updateStatut(ecart.id!, 'TRAITE').toPromise()
          .then(() => {
            ecart.statut = 'TRAITE';
            successCount++;
          })
          .catch(() => {
            errorCount++;
          })
      );

      try {
        await Promise.all(validationPromises);
        
        if (successCount > 0) {
          this.popupService.showSuccess(`${successCount} écart(s) de solde validé(s) avec succès`);
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

  exportEcartSoldes(): void {
    if (this.filteredEcartSoldes.length === 0) {
      alert('Aucune donnée à exporter');
      return;
    }

    // Préparer les données pour l'export
    const exportData: any[] = this.filteredEcartSoldes.map(ecart => ({
      'ID Transaction': ecart.idTransaction,
      'Téléphone Client': ecart.telephoneClient || '',
      'Montant': ecart.montant,
      'Frais': ecart.fraisAssocie ? ecart.fraisAssocie.montant : 0,
      'Écart': this.calculateEcart(ecart),
      'Service': ecart.service || '',
      'Agence': ecart.agence || '',
      'Date Transaction': ecart.dateTransaction ? new Date(ecart.dateTransaction).toLocaleDateString('fr-FR') : '',
      'Numéro Trans GU': ecart.numeroTransGu || '',
      'Pays': ecart.pays || '',
      'Statut': ecart.statut || 'EN_ATTENTE',
      'Type Frais': ecart.fraisAssocie ? this.getFraisTypeLabel(ecart.fraisAssocie.typeCalcul) : '',
      'Pourcentage Frais': ecart.fraisAssocie?.pourcentage || '',
      'Commentaire': ecart.commentaire || '',
      'Date Import': ecart.dateImport ? new Date(ecart.dateImport).toLocaleDateString('fr-FR') : ''
    }));

    // Ajouter une ligne pour le total d'écart
    const totalEcart = this.calculateTotalEcart();
    exportData.push({
      'ID Transaction': '',
      'Téléphone Client': '',
      'Montant': '',
      'Service': '',
      'Agence': '',
      'Date Transaction': '',
      'Numéro Trans GU': '',
      'Pays': '',
      'Statut': '',
      'Frais': '',
      'Type Frais': '',
      'Pourcentage Frais': '',
      'Date Import': ''
    });
    exportData.push({
      'ID Transaction': '',
      'Téléphone Client': '',
      'Montant': '',
      'Service': '',
      'Agence': '',
      'Date Transaction': '',
      'Numéro Trans GU': '',
      'Pays': '',
      'Statut': 'ÉCART TOTAL',
      'Frais': totalEcart,
      'Type Frais': '',
      'Pourcentage Frais': '',
      'Date Import': ''
    });

    // Créer un fichier Excel avec des couleurs
    this.createExcelWithColors(exportData);
  }

  private createExcelWithColors(data: any[]): void {
    // Créer un workbook Excel
    const workbook = XLSX.utils.book_new();
    
    // Préparer les données pour l'export
    const exportData = data.map(row => ({
      'ID Transaction': row['ID Transaction'],
      'Téléphone Client': row['Téléphone Client'],
      'Montant': row['Montant'],
      'Frais': row['Frais'],
      'Écart': row['Écart'],
      'Service': row['Service'],
      'Agence': row['Agence'],
      'Date Transaction': row['Date Transaction'],
      'Numéro Trans GU': row['Numéro Trans GU'],
      'Pays': row['Pays'],
      'Statut': row['Statut'],
      'Type Frais': row['Type Frais'],
      'Pourcentage Frais': row['Pourcentage Frais'],
      'Commentaire': row['Commentaire'],
      'Date Import': row['Date Import']
    }));

    // Créer la feuille de calcul
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Définir les largeurs de colonnes
    const columnWidths = [
      { wch: 15 }, // ID Transaction
      { wch: 15 }, // Téléphone Client
      { wch: 12 }, // Montant
      { wch: 12 }, // Frais
      { wch: 12 }, // Écart
      { wch: 12 }, // Service
      { wch: 12 }, // Agence
      { wch: 15 }, // Date Transaction
      { wch: 15 }, // Numéro Trans GU
      { wch: 10 }, // Pays
      { wch: 12 }, // Statut
      { wch: 12 }, // Type Frais
      { wch: 15 }, // Pourcentage Frais
      { wch: 20 }, // Commentaire
      { wch: 15 }  // Date Import
    ];
    worksheet['!cols'] = columnWidths;

    // Ajouter des styles conditionnels
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellAddress]) continue;
        
        const cell = worksheet[cellAddress];
        const header = exportData[0] ? Object.keys(exportData[0])[C] : '';
        const value = cell.v;
        
        // Styles pour l'en-tête
        if (R === 0) {
          cell.s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '2C3E50' } },
            alignment: { horizontal: 'center' }
          };
        } else {
          // Styles conditionnels pour les données
          let style: any = {
            font: { size: 11 },
            alignment: { horizontal: 'left' }
          };

          if (header === 'Montant' && typeof value === 'number') {
            style.font = { ...style.font, bold: true, color: { rgb: '28A745' } };
            style.fill = { fgColor: { rgb: 'D4EDDA' } };
          } else if (header === 'Écart' && typeof value === 'number') {
            // Style pour l'écart : bleu si positif ou zéro, rouge si négatif
            if (value >= 0) {
              style.font = { ...style.font, bold: true, color: { rgb: '0066CC' } };
              style.fill = { fgColor: { rgb: 'E6F2FF' } };
            } else {
              style.font = { ...style.font, bold: true, color: { rgb: 'CC0000' } };
              style.fill = { fgColor: { rgb: 'FFE6E6' } };
            }
          } else if (header === 'Statut') {
            if (value === 'EN_ATTENTE') {
              style.fill = { fgColor: { rgb: 'FFF3CD' } };
              style.font = { ...style.font, color: { rgb: '856404' } };
            } else if (value === 'TRAITE') {
              style.fill = { fgColor: { rgb: 'D4EDDA' } };
              style.font = { ...style.font, color: { rgb: '155724' } };
            } else if (value === 'ERREUR') {
              style.fill = { fgColor: { rgb: 'F8D7DA' } };
              style.font = { ...style.font, color: { rgb: '721C24' } };
            } else if (value === 'ÉCART TOTAL') {
              style.font = { ...style.font, bold: true, size: 14, color: { rgb: 'FFFFFF' } };
              style.fill = { fgColor: { rgb: 'FF6B6B' } };
              style.alignment = { horizontal: 'center' };
            }
          } else if (header === 'Frais' && typeof value === 'number' && value !== 0) {
            style.font = { ...style.font, bold: true, color: { rgb: 'DC3545' } };
            style.fill = { fgColor: { rgb: 'FFF5F5' } };
          } else if (header === 'Service') {
            style.font = { ...style.font, bold: true, color: { rgb: '6F42C1' } };
          } else if (header === 'Agence') {
            style.font = { ...style.font, bold: true, color: { rgb: 'FD7E14' } };
          } else if (header === 'Commentaire' && value) {
            style.font = { ...style.font, italic: true, color: { rgb: '007BFF' } };
            style.fill = { fgColor: { rgb: 'E8F4FD' } };
          }

          cell.s = style;
        }
      }
    }

    // Ajouter la feuille au workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Écarts de Solde');

    // Générer et télécharger le fichier
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ecarts-solde-${this.agence}-${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
} 