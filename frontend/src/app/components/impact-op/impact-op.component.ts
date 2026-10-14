import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, forkJoin, concatMap, delay, of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ImpactOP, ImpactOPFilter, ImpactOPValidationResult } from '../../models/impact-op.model';
import { CompteService } from '../../services/compte.service';
import { OperationService } from '../../services/operation.service';
import { OperationCreateRequest, TypeOperation } from '../../models/operation.model';
import { ImpactOPService } from '../../services/impact-op.service';
import { PopupService } from '../../services/popup.service';
import * as XLSX from 'xlsx';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-impact-op',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './impact-op.component.html',
  styleUrls: ['./impact-op.component.scss']
})
export class ImpactOPComponent implements OnInit, OnDestroy {
  impactOPs: ImpactOP[] = [];
  filteredImpactOPs: ImpactOP[] = [];
  uniqueNumeroTransKeys: Set<string> = new Set();
  isLoading = false;
  isUploading = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  Math = Math; // Pour utiliser Math dans le template
  
  // Filtres
  filterForm: FormGroup;
  codeProprietaires: string[] = [];
  typeOperations: string[] = [];
  groupeReseaux: string[] = [];
  numeroTransGUs: string[] = [];
  statuts = ['EN_ATTENTE', 'TRAITE', 'ERREUR'];
  
  // Upload
  selectedFile: File | null = null;
  uploadMessage: { type: 'success' | 'error', text: string } | null = null;
  fileValidated = false;
  validationResult: ImpactOPValidationResult | null = null;
  uploadError = '';
  
  // Sélection multiple
  selectedItems: Set<number> = new Set();
  isSelectAll = false;
  isSelectionMode = false;
  selectedStatut = 'EN_ATTENTE';
  isUpdatingMultipleStatuts = false;
  
  // Propriétés pour le modal de commentaire
  showCommentModal = false;
  selectedImpactOP: ImpactOP | null = null;
  newStatut = '';
  commentaire = '';
  commentForm: FormGroup;

  // Statistiques
  stats = {
    total: 0,
    enAttente: 0,
    traite: 0,
    erreur: 0,
    montantTotal: 0
  };
  // Statistiques globales (côté serveur, non filtrées)
  globalStats = {
    total: 0,
    enAttente: 0,
    traite: 0,
    erreur: 0,
    montantTotal: 0
  };

  private subscription = new Subscription();

  constructor(
    private impactOPService: ImpactOPService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private popupService: PopupService,
    private compteService: CompteService,
    private operationService: OperationService
  ) {
    this.filterForm = this.fb.group({
      codeProprietaire: [''],
      typeOperation: [''],
      groupeReseau: [''],
      numeroTransGu: [''],
      uniciteNumero: [''],
      statut: [''],
      dateDebut: [''],
      dateFin: [''],
      montantMin: [''],
      montantMax: ['']
    });

    this.commentForm = this.fb.group({
      commentaire: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadImpactOPs();
    this.loadFilterOptions();
    this.loadStats();
    this.setupFilterListener();
    
    // Test de connectivité API
    this.testApiConnectivity();
    
    // Lire les paramètres de l'URL pour appliquer les filtres automatiquement
    this.subscription.add(
      this.route.queryParams.subscribe(params => {
        if (params['codeProprietaire'] || params['dateDebut'] || params['dateFin']) {
          // Appliquer les filtres automatiquement
          if (params['codeProprietaire']) {
            this.filterForm.patchValue({ codeProprietaire: params['codeProprietaire'] });
          }
          if (params['dateDebut']) {
            // Convertir la date pour le format datetime-local
            const dateDebut = new Date(params['dateDebut']);
            const dateDebutString = dateDebut.toISOString().slice(0, 16); // Format YYYY-MM-DDTHH:mm
            this.filterForm.patchValue({ dateDebut: dateDebutString });
          }
          if (params['dateFin']) {
            // Convertir la date pour le format datetime-local
            const dateFin = new Date(params['dateFin']);
            const dateFinString = dateFin.toISOString().slice(0, 16); // Format YYYY-MM-DDTHH:mm
            this.filterForm.patchValue({ dateFin: dateFinString });
          }
          
          // Appliquer les filtres automatiquement
          this.applyFilters();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  isImpactEligible(impact: ImpactOP): boolean {
    if (!impact) return false;
    const raw = (impact.typeOperation || '').toString();
    const t = this.normalizeType(raw);
    // Large coverage: compense/compensation, appro/approvisionnement, nivellement, regularisation de solde (with/without accents)
    const patterns = ['compens', 'appro', 'nivel', 'regularis'];
    return patterns.some(p => t.includes(p));
  }

  private normalizeType(input: string): string {
    const s = (input || '').trim().toLowerCase();
    // Remove accents
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  async createOperationFromImpact(impact: ImpactOP) {
    if (!this.isImpactEligible(impact)) {
      this.popupService.showWarning(I18nService.t('IOP.opTypeNotEligible'));
      return;
    }
    // Demander la banque (pré-remplie avec code propriétaire)
    const banqueInput = await this.popupService.showTextInput(I18nService.t('MSG.bankLabel'), I18nService.t('MSG.createOpDialogTitle'), (impact.codeProprietaire || '').trim(), 'Ex: CIELCM0001');
    const banque = (banqueInput || '').trim();
    if (!banque) {
      await this.popupService.showWarning(I18nService.t('MSG.bankRequired'));
      return;
    }

    // Demander le type de référence (Standard/Cross Border/Nivellement)
    console.log('🔧 Affichage du popup de sélection du type de référence...');
    const referenceTypeInput = await this.popupService.showSelectInput(
      I18nService.t('MSG.referenceTypeLabel'), 
      I18nService.t('MSG.referenceTypeTitle'), 
      ['STANDARD', 'CROSS_BORDER', 'NIVELLEMENT'], 
      'STANDARD'
    );
    const referenceType = referenceTypeInput || 'STANDARD';
    console.log('✅ Type de référence sélectionné:', referenceType);

    // Résoudre compteId via codeProprietaire
    let compteId: number | undefined;
    let numeroCompte: string | undefined;
    try {
      const comptes = await this.compteService.getComptesByCodeProprietaire(impact.codeProprietaire, 'Impact OP').toPromise();
      if (!comptes || !comptes.length) {
        await this.popupService.showError(I18nService.t('MSG.noAccountForOwnerCode', { code: impact.codeProprietaire }));
        return;
      }
      // On prend le premier pour ce code propriétaire
      compteId = comptes[0].id;
      numeroCompte = comptes[0].numeroCompte;
    } catch (e) {
      console.error(e);
      await this.popupService.showError(I18nService.t('IOP.accountError'));
      return;
    }

    // Type d'opération à utiliser
    let finalTypeOperation = impact.typeOperation as string;
    
    // Si NIVELLEMENT est sélectionné, forcer le type d'opération à "nivellement"
    if (referenceType === 'NIVELLEMENT') {
      finalTypeOperation = 'nivellement';
      console.log('🔄 Type d\'opération changé vers "nivellement" pour utiliser la logique de nivellement');
    }

    const payload: OperationCreateRequest = {
      compteId: compteId!,
      typeOperation: finalTypeOperation,
      montant: Math.abs(Number(String(impact.montant || 0).toString().replace(/[,\s]/g, '')) || 0),
      banque: banque || undefined,
      nomBordereau: impact.numeroTransGU || undefined,
      service: undefined,
      reference: undefined,
      dateOperation: this.toIsoLocalDate(impact.dateOperation),
      referenceType: referenceType
    };

    this.isLoading = true;
    this.subscription.add(
      this.operationService.createOperation(payload, 'Impact OP').subscribe({
        next: async () => {
          await this.popupService.showSuccess(I18nService.t('MSG.operationCreated'));
          // Marquer l'impact comme traité pour éviter multi-validation
          impact.statut = 'TRAITE';
          this.isLoading = false;
        },
        error: async (err) => {
          console.error(err);
          await this.popupService.showError(I18nService.t('MSG.opCreationFailed'));
          this.isLoading = false;
        }
      })
    );
  }

  private toIsoLocalDate(input: string): string {
    // input peut être ISO ou autre; on normalise en YYYY-MM-DD
    try {
      const d = new Date(input);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch {}
    // fallback: renvoyer tel quel si déjà formaté
    return input;
  }

  // Suppression du prompt banque: la banque est déduite automatiquement du code propriétaire

  loadImpactOPs() {
    this.isLoading = true;
    this.subscription.add(
      this.impactOPService.getImpactOPs().subscribe({
        next: (data) => {
          this.impactOPs = data;
          this.filteredImpactOPs = [...data];
          // Calculer/assigner le commentaire selon les règles métier (sans écraser un commentaire existant)
          this.applyComputedComments();
          this.syncSelectionWithFilteredItems();
          this.calculatePagination();
          this.recalculateFilteredStats();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des impacts OP:', error);
          this.isLoading = false;
        }
      })
    );
  }

  loadFilterOptions() {
    this.subscription.add(
      this.impactOPService.getFilterOptions().subscribe({
        next: (data) => {
          this.codeProprietaires = data.codeProprietaires;
          this.typeOperations = data.typeOperations;
          this.groupeReseaux = data.groupeReseaux;
          this.numeroTransGUs = data.numeroTransGUs;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des options de filtres:', error);
        }
      })
    );
  }

  loadStats() {
    this.subscription.add(
      this.impactOPService.getImpactOPStats().subscribe({
        next: (data) => {
          this.globalStats = data;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des statistiques:', error);
        }
      })
    );
  }

  private recalculateFilteredStats(): void {
    const items = this.filteredImpactOPs || [];
    const total = items.length;
    let enAttente = 0;
    let traite = 0;
    let erreur = 0;
    let montantTotal = 0;

    for (const it of items) {
      const statut = (it.statut || 'EN_ATTENTE');
      if (statut === 'EN_ATTENTE') enAttente++;
      else if (statut === 'TRAITE') traite++;
      else if (statut === 'ERREUR') erreur++;
      montantTotal += (it.montant || 0);
    }

    this.stats = { total, enAttente, traite, erreur, montantTotal };

    // Recalculer les Numéro Trans GU uniques à partir de la liste filtrée (normalisés)
    const countMap = new Map<string, number>();
    items.forEach(item => {
      const key = this.normalizeNumeroTrans(this.getNumeroTransRaw(item));
      if (!key) return;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });
    const uniques = new Set<string>();
    countMap.forEach((count, key) => {
      if (count === 1) uniques.add(key);
    });
    this.uniqueNumeroTransKeys = uniques;
  }

  setupFilterListener() {
    this.subscription.add(
      this.filterForm.valueChanges.subscribe(() => {
        this.currentPage = 1;
        this.applyFilters();
      })
    );
  }

  applyFilters() {
    const filterValue = this.filterForm.value;
    const filter: ImpactOPFilter = {};

    if (filterValue.codeProprietaire) {
      filter.codeProprietaire = filterValue.codeProprietaire;
    }
    if (filterValue.typeOperation) {
      filter.typeOperation = filterValue.typeOperation;
    }
    if (filterValue.groupeReseau) {
      filter.groupeReseau = filterValue.groupeReseau;
    }
    if (filterValue.numeroTransGu) {
      filter.numeroTransGu = filterValue.numeroTransGu;
    }
    if (filterValue.statut) {
      filter.statut = filterValue.statut;
    }
    if (filterValue.dateDebut) {
      // Envoyer début de journée au format attendu par l'API (YYYY-MM-DD HH:mm:ss)
      const d = new Date(filterValue.dateDebut);
      d.setHours(0, 0, 0, 0);
      filter.dateDebut = this.formatForApi(d);
    }
    if (filterValue.dateFin) {
      // Envoyer fin de journée (YYYY-MM-DD HH:mm:ss)
      const d = new Date(filterValue.dateFin);
      d.setHours(23, 59, 59, 999);
      filter.dateFin = this.formatForApi(d);
    }
    if (filterValue.montantMin) {
      filter.montantMin = parseFloat(filterValue.montantMin);
    }
    if (filterValue.montantMax) {
      filter.montantMax = parseFloat(filterValue.montantMax);
    }

    this.isLoading = true;
    this.subscription.add(
      this.impactOPService.getImpactOPs(filter).subscribe({
        next: (data) => {
          // Filtre côté client pour l'unicité du Numéro Trans GU si demandé
          let list = data;
          const uniciteMode = filterValue.uniciteNumero?.toString().toUpperCase();
          if (uniciteMode === 'UNIQUE' || uniciteMode === 'DUPLICATE') {
            // Compter les occurrences normalisées de chaque Numéro Trans GU
            const countMap = new Map<string, number>();
            for (const it of list) {
              const key = this.normalizeNumeroTrans(this.getNumeroTransRaw(it));
              if (!key) continue;
              countMap.set(key, (countMap.get(key) || 0) + 1);
            }
            // Filtrer selon le mode
            if (uniciteMode === 'UNIQUE') {
              list = list.filter(it => {
                const key = this.normalizeNumeroTrans(this.getNumeroTransRaw(it));
                return !!key && countMap.get(key) === 1;
              });
            } else if (uniciteMode === 'DUPLICATE') {
              list = list.filter(it => {
                const key = this.normalizeNumeroTrans(this.getNumeroTransRaw(it));
                return !!key && (countMap.get(key) || 0) >= 2;
              });
            }
          }

          this.filteredImpactOPs = list;
          // Recalculer les commentaires après filtrage/chargement
          this.applyComputedComments();
          this.syncSelectionWithFilteredItems();
          this.calculatePagination();
          this.recalculateFilteredStats();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors de l\'application des filtres:', error);
          this.isLoading = false;
        }
      })
    );
  }

  clearFilters() {
    this.filterForm.reset();
    this.applyFilters();
  }

  onDateChange(controlName: 'dateDebut' | 'dateFin') {
    const value: string = this.filterForm.get(controlName)?.value;
    const other: 'dateDebut' | 'dateFin' = controlName === 'dateDebut' ? 'dateFin' : 'dateDebut';
    const otherVal = this.filterForm.get(other)?.value;
    if (value && !otherVal) {
      this.filterForm.patchValue({ [other]: value });
    } else {
      this.applyFilters();
    }
  }

  private pad2(n: number): string { return String(n).padStart(2, '0'); }
  private formatForApi(d: Date): string {
    // YYYY-MM-DD HH:mm:ss (sans fuseau, côté serveur ce format est le plus courant)
    const y = d.getFullYear();
    const m = this.pad2(d.getMonth() + 1);
    const day = this.pad2(d.getDate());
    const h = this.pad2(d.getHours());
    const mi = this.pad2(d.getMinutes());
    const s = this.pad2(d.getSeconds());
    return `${y}-${m}-${day} ${h}:${mi}:${s}`;
  }

  calculatePagination() {
    this.totalPages = Math.ceil(this.filteredImpactOPs.length / this.pageSize);
  }

  get pagedImpactOPs(): ImpactOP[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredImpactOPs.slice(startIndex, endIndex);
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

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.fileValidated = false;
      this.validationResult = null;
      this.uploadMessage = null;
    }
  }

  validateFile() {
    if (!this.selectedFile) return;
    
    this.isUploading = true;
    this.validationResult = null;
    
    this.subscription.add(
      this.impactOPService.validateImpactOPFile(this.selectedFile).subscribe({
        next: (result) => {
          this.validationResult = result;
          this.fileValidated = true;
          this.isUploading = false;
          
          if (result.hasErrors) {
            this.uploadMessage = { 
              type: 'error', 
              text: I18nService.t('ESD.validationDoneErrors', { count: result.errorLines }) 
            };
          } else {
            this.uploadMessage = { 
              type: 'success', 
              text: I18nService.t('ESD.validationOkNew', { count: result.newRecords }) 
            };
          }
        },
        error: (err) => {
          this.uploadMessage = { 
            type: 'error', 
            text: err.error?.error || I18nService.t('IOP.validateError') 
          };
          this.isUploading = false;
        }
      })
    );
  }

  uploadFile() {
    if (!this.selectedFile) return;
    
    this.isUploading = true;
    this.uploadMessage = null;
    this.validationResult = null;

    this.subscription.add(
      this.impactOPService.uploadImpactOPFile(this.selectedFile).subscribe({
        next: (response) => {
          this.uploadMessage = { type: 'success', text: I18nService.t('ESD.uploadOkCount', { message: response.message, count: response.count }) };
          this.selectedFile = null;
          this.fileValidated = false;
          this.validationResult = null;
          this.loadImpactOPs(); // Recharger les données
          this.loadStats(); // Recharger les statistiques
          this.isUploading = false;
        },
        error: (err) => {
          this.uploadMessage = { type: 'error', text: err.error?.error || 'Erreur lors de l\'upload du fichier' };
          this.isUploading = false;
        }
      })
    );
  }

  updateStatut(impactOP: ImpactOP, newStatut: string) {
    if (newStatut === impactOP.statut) return;

    this.subscription.add(
      this.impactOPService.updateImpactOPStatut(impactOP.id!, newStatut).subscribe({
        next: (updatedImpactOP) => {
          // Mettre à jour l'impact OP dans la liste
          const index = this.impactOPs.findIndex(op => op.id === impactOP.id);
          if (index !== -1) {
            this.impactOPs[index] = updatedImpactOP;
          }
          
          const indexFiltered = this.filteredImpactOPs.findIndex(op => op.id === impactOP.id);
          if (indexFiltered !== -1) {
            this.filteredImpactOPs[indexFiltered] = updatedImpactOP;
          }

          this.showTemporaryMessage('success', `${I18nService.t('IOP.statusUpdated')}: ${this.getStatutLabel(newStatut)}`);
          this.loadStats();
          this.recalculateFilteredStats();
        },
        error: (error) => {
          console.error('Erreur lors de la mise à jour du statut:', error);
          this.showTemporaryMessage('error', I18nService.t('IOP.statusUpdateErrorShort'));
        }
      })
    );
  }

  private showTemporaryMessage(type: 'success' | 'error', message: string) {
    this.uploadMessage = { type, text: message };
    setTimeout(() => {
      this.uploadMessage = null;
    }, 3000);
  }

  onStatutChange(impactOP: ImpactOP, event: Event) {
    const target = event.target as HTMLSelectElement;
    const newStatut = target.value;
    
    if (newStatut && newStatut !== impactOP.statut && impactOP.id) {
      // Sauvegarder l'ancien statut pour pouvoir le restaurer en cas d'erreur
      const oldStatut = impactOP.statut;
      
      // Mettre à jour immédiatement l'interface pour une meilleure UX
      impactOP.statut = newStatut as 'EN_ATTENTE' | 'TRAITE' | 'ERREUR';

      console.log(`🔄 Tentative de mise à jour du statut Impact OP: ID=${impactOP.id}, ${oldStatut} → ${newStatut}`);
      
      this.subscription.add(
        this.impactOPService.updateImpactOPStatut(impactOP.id, newStatut).subscribe({
          next: (updatedImpactOP) => {
            // Mettre à jour l'impact OP dans la liste
            const index = this.impactOPs.findIndex(op => op.id === impactOP.id);
            if (index !== -1) {
              this.impactOPs[index] = updatedImpactOP;
            }
            
            const indexFiltered = this.filteredImpactOPs.findIndex(op => op.id === impactOP.id);
            if (indexFiltered !== -1) {
              this.filteredImpactOPs[indexFiltered] = updatedImpactOP;
            }

            console.log(`✅ Statut Impact OP mis à jour avec succès: ${oldStatut} → ${newStatut}`, updatedImpactOP);
            this.showTemporaryMessage('success', `${I18nService.t('IOP.statusUpdated')}: ${this.getStatutLabel(newStatut)}`);
            this.loadStats();
            this.recalculateFilteredStats();
          },
          error: (error) => {
            console.error('❌ Erreur détaillée lors de la mise à jour du statut Impact OP:', error);
            console.error('Détails de l\'erreur:', {
              status: error.status,
              statusText: error.statusText,
              message: error.message,
              error: error.error,
              url: error.url
            });
            
            // Restaurer l'ancien statut en cas d'erreur
            impactOP.statut = oldStatut;
            target.value = oldStatut || 'EN_ATTENTE';
            
            // Message d'erreur plus détaillé
            let errorMessage = I18nService.t('IOP.statusUpdateErrorDetailMsg');
            if (error.status === 404) {
              errorMessage = I18nService.t('IOP.notFound');
            } else if (error.status === 400) {
              errorMessage = I18nService.t('IOP.invalidData');
            } else if (error.status === 500) {
              errorMessage = I18nService.t('IOP.serverError');
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            }
            
            this.showTemporaryMessage('error', errorMessage);
          }
        })
      );
    }
  }

  openCommentModal(impactOP: ImpactOP, newStatut: string) {
    this.selectedImpactOP = impactOP;
    this.newStatut = newStatut;
    this.commentForm.reset();
    this.showCommentModal = true;
  }

  closeCommentModal() {
    this.showCommentModal = false;
    this.selectedImpactOP = null;
    this.newStatut = '';
    this.commentForm.reset();
  }

  confirmStatutChange() {
    if (!this.selectedImpactOP || !this.commentForm.valid) return;

    const commentaire = this.commentForm.get('commentaire')?.value;
    
    this.subscription.add(
      this.impactOPService.updateImpactOPStatut(this.selectedImpactOP.id!, this.newStatut, commentaire).subscribe({
        next: (updatedImpactOP) => {
          // Mettre à jour l'impact OP dans la liste
          const index = this.impactOPs.findIndex(op => op.id === this.selectedImpactOP!.id);
          if (index !== -1) {
            this.impactOPs[index] = updatedImpactOP;
          }
          
          const indexFiltered = this.filteredImpactOPs.findIndex(op => op.id === this.selectedImpactOP!.id);
          if (indexFiltered !== -1) {
            this.filteredImpactOPs[indexFiltered] = updatedImpactOP;
          }

          this.showTemporaryMessage('success', `${I18nService.t('IOP.statusUpdated')}: ${this.getStatutLabel(this.newStatut)}`);
          this.loadStats();
          this.recalculateFilteredStats();
          this.closeCommentModal();
        },
        error: (error) => {
          console.error('Erreur lors de la mise à jour du statut:', error);
          this.showTemporaryMessage('error', I18nService.t('IOP.statusUpdateErrorShort'));
        }
      })
    );
  }

  async deleteImpactOP(id: number): Promise<void> {
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('IOP.confirmDelete'),
      I18nService.t('IOP.confirmDeleteTitle')
    );
    if (!confirmed) {
      return;
    }

    this.subscription.add(
      this.impactOPService.deleteImpactOP(id).subscribe({
        next: (success) => {
          if (success) {
            this.impactOPs = this.impactOPs.filter(op => op.id !== id);
            this.filteredImpactOPs = this.filteredImpactOPs.filter(op => op.id !== id);
            this.calculatePagination();
            this.loadStats();
            this.recalculateFilteredStats();
            this.showTemporaryMessage('success', I18nService.t('IOP.deletedOk'));
          } else {
            this.showTemporaryMessage('error', I18nService.t('IOP.deleteError'));
          }
        },
        error: (error) => {
          console.error('Erreur lors de la suppression:', error);
          this.showTemporaryMessage('error', I18nService.t('IOP.deleteError'));
        }
      })
    );
  }

  async saveImpactOP(impactOP: ImpactOP): Promise<void> {
    if (!impactOP.id) {
      const duplicateInfo = this.findDuplicateImpactOP(impactOP);
      if (duplicateInfo) {
        await this.popupService.showWarning(duplicateInfo, I18nService.t('IOP.duplicateDetected'));
        return;
      }
    }

    this.isLoading = true;

    if (impactOP.id) {
      const updated: ImpactOP = { ...impactOP };
      updated.commentaire = this.computeCommentForSingle(updated, this.impactOPs);
      this.subscription.add(
        this.impactOPService.updateImpactOP(updated.id!, updated).subscribe({
          next: () => {
            this.showTemporaryMessage('success', I18nService.t('IOP.updatedOk'));
            this.loadImpactOPs();
            this.loadStats();
          },
          error: (error) => {
            console.error('Erreur lors de la mise à jour:', error);
            this.showTemporaryMessage('error', I18nService.t('IOP.updateErrorShort'));
          },
          complete: () => {
            this.isLoading = false;
          }
        })
      );
    } else {
      const { id, ...impactWithoutId } = impactOP;
      const toCreate: ImpactOP = { ...impactWithoutId } as ImpactOP;
      toCreate.commentaire = this.computeCommentForSingle(toCreate, [...this.impactOPs, toCreate]);
      this.subscription.add(
        this.impactOPService.createImpactOP(toCreate).subscribe({
          next: () => {
            this.showTemporaryMessage('success', I18nService.t('IOP.createdOk'));
            this.loadImpactOPs();
            this.loadStats();
          },
          error: (error) => {
            console.error('Erreur lors de la création:', error);
            const msg =
              error?.error?.message ||
              error?.message ||
              I18nService.t('IOP.createErrorShort');
            this.popupService.showWarning(msg, I18nService.t('IOP.recordRefused'));
          },
          complete: () => {
            this.isLoading = false;
          }
        })
      );
    }
  }

  /**
   * Détecte un doublon local (même règles que le serveur : max 2 / numéro Trans GU ou ligne identique).
   */
  private findDuplicateImpactOP(impact: ImpactOP, excludeId?: number): string | null {
    const numero = (impact.numeroTransGU || '').trim();
    if (!numero) {
      return null;
    }

    const others = this.impactOPs.filter(
      op => (op.numeroTransGU || '').trim() === numero && (!excludeId || op.id !== excludeId)
    );

    if (others.length >= 2) {
      return I18nService.t('IOP.duplicateTransGu', { numero });
    }

    const dateNorm = this.normalizeImpactDateForCompare(impact.dateOperation);
    const montant = this.roundAmount(impact.montant);
    const soldeAvant = this.roundAmount(impact.soldeAvant);
    const soldeApres = this.roundAmount(impact.soldeApres);
    const comment = (impact.commentaire || '').trim();

    const exact = others.find(op =>
      (op.codeProprietaire || '').trim() === (impact.codeProprietaire || '').trim() &&
      this.normalizeImpactDateForCompare(op.dateOperation) === dateNorm &&
      this.roundAmount(op.montant) === montant &&
      this.roundAmount(op.soldeAvant) === soldeAvant &&
      this.roundAmount(op.soldeApres) === soldeApres &&
      (op.typeOperation || '').trim() === (impact.typeOperation || '').trim() &&
      (op.groupeReseau || '').trim() === (impact.groupeReseau || '').trim() &&
      (op.commentaire || '').trim() === comment
    );

    if (exact) {
      return I18nService.t('IOP.duplicateImpact', { numero });
    }

    return null;
  }

  private normalizeImpactDateForCompare(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 19);
    }
    return dateStr.trim().replace(' ', 'T').slice(0, 19);
  }

  private roundAmount(value: number): number {
    return Math.round((Number(value) || 0) * 1000) / 1000;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('fr-FR');
  }

  formatMontant(montant: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XAF'
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
      case 'EN_ATTENTE': return I18nService.t('TBL.statutEnAttente');
      case 'TRAITE': return I18nService.t('TBL.statutTraite');
      case 'ERREUR': return I18nService.t('TBL.statutErreur');
      default: return statut || '';
    }
  }

  exportImpactOPs(): void {
    const filterValue = this.filterForm.value;
    const filter: ImpactOPFilter = {};

    if (filterValue.codeProprietaire) {
      filter.codeProprietaire = filterValue.codeProprietaire;
    }
    if (filterValue.typeOperation) {
      filter.typeOperation = filterValue.typeOperation;
    }
    if (filterValue.groupeReseau) {
      filter.groupeReseau = filterValue.groupeReseau;
    }
    if (filterValue.statut) {
      filter.statut = filterValue.statut;
    }
    if (filterValue.dateDebut) {
      filter.dateDebut = filterValue.dateDebut;
    }
    if (filterValue.dateFin) {
      filter.dateFin = filterValue.dateFin;
    }
    if (filterValue.montantMin) {
      filter.montantMin = parseFloat(filterValue.montantMin);
    }
    if (filterValue.montantMax) {
      filter.montantMax = parseFloat(filterValue.montantMax);
    }

    this.subscription.add(
      this.impactOPService.exportImpactOPs(filter).subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `impacts-op-${new Date().toISOString().split('T')[0]}.xlsx`;
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Erreur lors de l\'export:', error);
          this.showTemporaryMessage('error', I18nService.t('IOP.exportError'));
        }
      })
    );
  }

  // ===================== Commentaires calculés =====================
  private applyComputedComments(): void {
    if (!this.impactOPs || this.impactOPs.length === 0) {
      return;
    }

    // Grouper par Numéro Trans GU (en respectant la casse d'origine)
    const groups = new Map<string, ImpactOP[]>();
    this.impactOPs.forEach(item => {
      const key = (item.numeroTransGU || '').trim();
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    });

    const hasBothTypes = (items: ImpactOP[]): boolean => {
      const types = new Set(items.map(it => it.typeOperation));
      return types.has('IMPACT_COMPTIMPACT-COMPTE-GENERAL') && types.has('FRAIS_TRANSACTION');
    };

    // 1) Règle prioritaire: si un même Numéro Trans GU contient les deux types,
    //    forcer les commentaires, même s'ils existent déjà côté données.
    groups.forEach((items) => {
      if (items.length >= 2 && hasBothTypes(items)) {
        items.forEach(it => {
          if (it.typeOperation === 'IMPACT_COMPTIMPACT-COMPTE-GENERAL') {
            it.commentaire = 'Impact TRX';
          } else if (it.typeOperation === 'FRAIS_TRANSACTION') {
            it.commentaire = 'Impact FRAIS';
          }
        });
      }
    });

    const computeForItem = (item: ImpactOP, group: ImpactOP[]): string => {
      const size = group.length;
      const type = item.typeOperation;

      if (size >= 2 && hasBothTypes(group)) {
        if (type === 'IMPACT_COMPTIMPACT-COMPTE-GENERAL') return 'Impact TRX';
        if (type === 'FRAIS_TRANSACTION') return 'Impact FRAIS';
        return '';
      }

      if (size === 1) {
        if (type === 'FRAIS_TRANSACTION') return 'REGUL FRAIS';
        if (type === 'IMPACT_COMPTIMPACT-COMPTE-GENERAL') return 'SANS FRAIS';
        return '';
      }

      // Cas non spécifié (plus de 2 éléments sans les deux types)
      return item.commentaire || '';
    };

    // 2) Pour les autres cas, appliquer la règle à TOUTES les lignes
    //    (écraser le commentaire existant si la règle retourne une valeur non vide)
    this.impactOPs.forEach(item => {
      const key = (item.numeroTransGU || '').trim();
      const group = groups.get(key) || [];
      const computed = computeForItem(item, group);
      if (computed) {
        item.commentaire = computed;
      }
    });

    // Aligner la liste filtrée
    this.filteredImpactOPs.forEach(item => {
      const source = this.impactOPs.find(x => x.id === item.id);
      if (source) {
        item.commentaire = source.commentaire;
      } else {
        // Au cas où l'objet diffère (sans id), recalcul local
        const key = (item.numeroTransGU || '').trim();
        const group = groups.get(key) || [];
        const computed = computeForItem(item, group);
        if (computed) {
          item.commentaire = computed;
        }
      }
    });

    // Calculer les Numéro Trans GU uniques sur la liste filtrée (normalisés)
    const countMap = new Map<string, number>();
    this.filteredImpactOPs.forEach(item => {
      const key = this.normalizeNumeroTrans(this.getNumeroTransRaw(item));
      if (!key) return;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });
    const uniques = new Set<string>();
    countMap.forEach((count, key) => {
      if (count === 1) uniques.add(key);
    });
    this.uniqueNumeroTransKeys = uniques;
  }

  isUniqueNumero(item: ImpactOP): boolean {
    const key = this.normalizeNumeroTrans(this.getNumeroTransRaw(item));
    return !!key && this.uniqueNumeroTransKeys.has(key);
  }

  // Helpers de normalisation Numéro Trans GU
  private getNumeroTransRaw(item: ImpactOP): string {
    const anyItem: any = item as any;
    // Tolérer numeroTransGU et numeroTransGu
    return (anyItem?.numeroTransGU ?? anyItem?.numeroTransGu ?? '') as string;
  }

  private normalizeNumeroTrans(value: string): string {
    const raw = (value ?? '').toString().trim();
    if (!raw) return '';
    // Supprimer espaces, tirets, underscores, slashes et mettre en majuscules
    const cleaned = raw.replace(/[\s\-_/]/g, '');
    return cleaned.toUpperCase();
  }

  // Calculer le commentaire pour un élément spécifique en réutilisant la même logique
  private computeCommentForSingle(item: ImpactOP, allItems: ImpactOP[]): string {
    const key = (item.numeroTransGU || '').trim();
    const group = allItems.filter(x => (x.numeroTransGU || '').trim() === key);

    const hasBothTypes = (items: ImpactOP[]): boolean => {
      const types = new Set(items.map(it => it.typeOperation));
      return types.has('IMPACT_COMPTIMPACT-COMPTE-GENERAL') && types.has('FRAIS_TRANSACTION');
    };

    const size = group.length;
    const type = item.typeOperation;

    if (size >= 2 && hasBothTypes(group)) {
      if (type === 'IMPACT_COMPTIMPACT-COMPTE-GENERAL') return 'Impact TRX';
      if (type === 'FRAIS_TRANSACTION') return 'Impact FRAIS';
      return '';
    }

    if (size === 1) {
      if (type === 'FRAIS_TRANSACTION') return 'REGUL FRAIS';
      if (type === 'IMPACT_COMPTIMPACT-COMPTE-GENERAL') return 'SANS FRAIS';
      return '';
    }

    return item.commentaire || '';
  }

  // Méthodes pour la sélection multiple
  toggleSelectionMode(): void {
    this.isSelectionMode = !this.isSelectionMode;
    if (!this.isSelectionMode) {
      this.clearSelection();
    }
  }

  toggleSelectAll(): void {
    if (this.isSelectAll) {
      this.clearSelection();
    } else {
      this.selectAll();
    }
  }

  selectAll(): void {
    this.selectedItems.clear();
    // Sélectionner TOUTES les lignes filtrées, pas seulement celles de la page courante
    this.filteredImpactOPs.forEach(item => {
      if (item.id) {
        this.selectedItems.add(item.id);
      }
    });
    this.isSelectAll = true;
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.isSelectAll = false;
  }

  private syncSelectionWithFilteredItems(): void {
    if (this.selectedItems.size === 0) {
      this.isSelectAll = false;
      return;
    }

    const allowedIds = new Set(
      this.filteredImpactOPs
        .map(item => item.id)
        .filter((id): id is number => typeof id === 'number')
    );

    Array.from(this.selectedItems).forEach(id => {
      if (!allowedIds.has(id)) {
        this.selectedItems.delete(id);
      }
    });

    if (this.selectedItems.size === 0) {
      this.isSelectionMode = false;
    }

    this.updateSelectAllState();
  }

  toggleItemSelection(item: ImpactOP): void {
    if (item.id) {
      if (this.selectedItems.has(item.id)) {
        this.selectedItems.delete(item.id);
      } else {
        this.selectedItems.add(item.id);
      }
      this.updateSelectAllState();
    }
  }

  updateSelectAllState(): void {
    // Vérifier si TOUTES les lignes filtrées sont sélectionnées, pas seulement la page courante
    const allFilteredItems = this.filteredImpactOPs;
    const selectedCount = allFilteredItems.filter(item => item.id && this.selectedItems.has(item.id)).length;
    this.isSelectAll = selectedCount === allFilteredItems.length && allFilteredItems.length > 0;
  }

  getSelectedCount(): number {
    return this.selectedItems.size;
  }

  hasSelection(): boolean {
    return this.selectedItems.size > 0;
  }

  isItemSelected(item: ImpactOP): boolean {
    return item.id ? this.selectedItems.has(item.id) : false;
  }

  updateMultipleStatuts(): void {
    if (this.selectedItems.size === 0) {
      this.popupService.showWarning(I18nService.t('IOP.selectToUpdate'), I18nService.t('IOP.selectionRequired'));
      return;
    }

    this.isUpdatingMultipleStatuts = true;
    const selectedIds = Array.from(this.selectedItems);
    
    // Mise à jour séquentielle simple avec setTimeout
    console.log(`🚀 Début mise à jour SÉQUENTIELLE SIMPLE: ${selectedIds.length} impacts OP vers statut ${this.selectedStatut}`);
    
    let processedCount = 0;
    const results: ImpactOP[] = [];

    const processNextId = (index: number) => {
      if (index >= selectedIds.length) {
        // Tous traités avec succès
        console.log(`🎉 SUCCÈS COMPLET: ${selectedIds.length} impacts OP mis à jour avec le statut ${this.selectedStatut}`, results);
        this.clearSelection();
        this.loadStats();
        this.recalculateFilteredStats();
        this.isUpdatingMultipleStatuts = false;
        this.showTemporaryMessage('success', I18nService.t('IOP.bulkStatusOk', { count: selectedIds.length }));
        return;
      }

      const id = selectedIds[index];
      console.log(`📤 [${index + 1}/${selectedIds.length}] Traitement Impact OP ID: ${id}`);
      
      this.subscription.add(
        this.impactOPService.updateImpactOPStatut(id, this.selectedStatut).subscribe({
          next: (result) => {
            processedCount++;
            results.push(result);
            console.log(`✅ [${processedCount}/${selectedIds.length}] Succès pour ID ${id}:`, result);
            
            // Mettre à jour immédiatement dans la liste
            const mainIndex = this.impactOPs.findIndex(op => op.id === id);
            if (mainIndex !== -1) {
              this.impactOPs[mainIndex] = result;
            }
            
            const filteredIndex = this.filteredImpactOPs.findIndex(op => op.id === id);
            if (filteredIndex !== -1) {
              this.filteredImpactOPs[filteredIndex] = result;
            }
            
            // Passer au suivant après un délai
            setTimeout(() => {
              processNextId(index + 1);
            }, 300);
          },
          error: (error) => {
            console.error(`❌ [${index + 1}/${selectedIds.length}] Erreur pour ID ${id}:`, error);
            this.isUpdatingMultipleStatuts = false;
            this.showTemporaryMessage('error', I18nService.t('IOP.partialBulkUpdate', { done: processedCount, total: selectedIds.length, error: error.message || error.statusText || I18nService.t('IOP.unknownError') }));
          }
        })
      );
    };

    // Démarrer le traitement
    processNextId(0);
  }

  async deleteSelected(): Promise<void> {
    if (this.selectedItems.size === 0) {
      this.popupService.showWarning(I18nService.t('IOP.selectToUpdate'), I18nService.t('IOP.selectionRequired'));
      return;
    }

    const count = this.selectedItems.size;
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('IOP.confirmBulkDelete', { count }),
      I18nService.t('IOP.confirmDeleteTitle')
    );
    if (!confirmed) {
      return;
    }

    const ids = Array.from(this.selectedItems);
    this.isLoading = true;
    this.subscription.add(
      this.impactOPService.deleteImpactOPs(ids).subscribe({
        next: (res) => {
          // Retirer côté client
          this.impactOPs = this.impactOPs.filter(op => !op.id || !this.selectedItems.has(op.id));
          this.filteredImpactOPs = this.filteredImpactOPs.filter(op => !op.id || !this.selectedItems.has(op.id));
          this.clearSelection();
          this.calculatePagination();
          this.loadStats();
          this.recalculateFilteredStats();
          const msg = res?.deletedCount ? I18nService.t('IOP.bulkDeleteDone', { count: res.deletedCount }) : I18nService.t('IOP.bulkDone');
          this.showTemporaryMessage(res?.success ? 'success' : 'error', msg);
        },
        error: (error) => {
          console.error('Erreur suppression en masse Impact OP:', error);
          this.showTemporaryMessage('error', I18nService.t('IOP.bulkDeleteErrorShort'));
        },
        complete: () => {
          this.isLoading = false;
        }
      })
    );
  }

  // Test de connectivité API
  testApiConnectivity() {
    console.log('🧪 Test de connectivité API Impact OP...');
    this.subscription.add(
      this.impactOPService.getImpactOPStats().subscribe({
        next: (stats) => {
          console.log('✅ API Impact OP accessible - Stats récupérées:', stats);
        },
        error: (error) => {
          console.error('❌ API Impact OP inaccessible:', error);
          console.error('Détails de l\'erreur de connectivité:', {
            status: error.status,
            statusText: error.statusText,
            url: error.url,
            message: error.message
          });
        }
      })
    );
  }

  downloadTemplate(): void {
    const templateData = [
      {
        'Type Opération': 'CASH IN',
        'Montant': '50000',
        'Solde avant': '100000',
        'Solde après': '150000',
        'Code propriétaire': 'PROP001',
        'Date opération': '2025-01-15 10:30:00',
        'Numéro Trans GU': 'GU123456789',
        'groupe de réseau': 'ORANGE'
      },
      {
        'Type Opération': 'PAIEMENT',
        'Montant': '25000',
        'Solde avant': '150000',
        'Solde après': '125000',
        'Code propriétaire': 'PROP002',
        'Date opération': '2025-01-15 14:45:00',
        'Numéro Trans GU': 'GU987654321',
        'groupe de réseau': 'MTN'
      }
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Définir la largeur des colonnes
    const columnWidths = [
      { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }
    ];
    worksheet['!cols'] = columnWidths;

    // Styler l'en-tête
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!worksheet[cellAddress]) continue;
      worksheet[cellAddress].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0066CC' } },
        alignment: { horizontal: 'center' }
      };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Modèle Impact OP');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'modele-impact-op.xlsx');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.popupService.showSuccess(I18nService.t('IOP.templateDownloaded'), I18nService.t('IOP.downloadOk'));
  }
} 