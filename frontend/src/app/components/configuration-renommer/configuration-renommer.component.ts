import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil, forkJoin, of } from 'rxjs';
import { catchError, map, finalize } from 'rxjs/operators';
import { NavigationLabelsService, NavigationLabel, NavigationLabelAudit } from '../../services/navigation-labels.service';
import { PopupService } from '../../services/popup.service';
import { APP_NAVIGATION_CATALOG, AppNavigationGroup, AppNavigationSubmenu } from '../../constants/app-navigation-catalog';

interface RenameableEntity {
  id: string;
  module: string;
  entityType: string;
  entityId: string | number;
  currentTitle: string;
  currentLabel?: string;
  currentComment?: string;
  currentDescription?: string;
  newTitle?: string;
  newLabel?: string;
  newComment?: string;
  newDescription?: string;
  hasChanges: boolean;
}

interface ModuleConfig {
  key: string;
  label: string;
  apiEndpoint: string;
  idField: string;
  titleField: string;
  labelField?: string;
  commentField?: string;
  descriptionField?: string;
  icon: string;
}

type ViewMode = 'data' | 'navigation';

@Component({
  selector: 'app-configuration-renommer',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-renommer.component.html',
  styleUrls: ['./configuration-renommer.component.scss']
})
export class ConfigurationRenommerComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Mode d'affichage
  viewMode: ViewMode = 'data';
  
  // Mode données (existant)
  selectedModule: string = '';
  searchTerm: string = '';
  entities: RenameableEntity[] = [];
  filteredEntities: RenameableEntity[] = [];
  pagedEntities: RenameableEntity[] = [];
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 20;
  totalPages = 1;
  
  // Mode navigation (nouveau)
  navSearchTerm: string = '';
  navItems: NavigationLabel[] = [];
  filteredNavItems: NavigationLabel[] = [];
  navGroups: AppNavigationGroup[] = [];
  
  // Commun
  isLoading = false;
  isSaving = false;
  saveResults: { success: number; errors: number } = { success: 0, errors: 0 };
  showResults = false;

  // Historique / Audit
  showHistory = false;
  historyItems: any[] = [];
  selectedHistoryLabelId: string = '';
  historyLabelType: string = '';
  historyGroupKey: string = '';
  historyTypeLabel: string = '';

  modulesConfig: ModuleConfig[] = [
    {
      key: 'services',
      label: 'Services',
      apiEndpoint: '/api/services',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-cogs'
    },
    {
      key: 'comptes',
      label: 'Comptes',
      apiEndpoint: '/api/comptes',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-wallet'
    },
    {
      key: 'operations',
      label: 'Opérations',
      apiEndpoint: '/api/operations',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-exchange-alt'
    },
    {
      key: 'frais',
      label: 'Frais',
      apiEndpoint: '/api/frais',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-money-bill-wave'
    },
    {
      key: 'commissions',
      label: 'Commissions',
      apiEndpoint: '/api/commission',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-hand-holding-usd'
    },
    {
      key: 'banque',
      label: 'Banque',
      apiEndpoint: '/api/banque',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-university'
    },
    {
      key: 'redevance',
      label: 'Redevance Loterie',
      apiEndpoint: '/api/redevance/config',
      idField: 'id',
      titleField: 'nom',
      labelField: 'libelle',
      commentField: 'commentaire',
      descriptionField: 'description',
      icon: 'fa-ticket-alt'
    },
    {
      key: 'niveaux-validation',
      label: 'Niveaux Validation',
      apiEndpoint: '/api/config/niveaux-validation',
      idField: 'id',
      titleField: 'valeur',
      labelField: 'description',
      commentField: 'statutAssocie',
      descriptionField: 'description',
      icon: 'fa-list-ol'
    }
  ];

  constructor(
    private http: HttpClient,
    private navLabels: NavigationLabelsService,
    private popupService: PopupService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Charger les labels de navigation au démarrage
    this.navLabels.loadLabels().subscribe(() => {
      this.loadNavigationItems();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== MODE NAVIGATION =====
  loadNavigationItems(): void {
    this.navItems = this.navLabels.getAllRenamableItems();
    this.navGroups = APP_NAVIGATION_CATALOG;
    this.applyNavFilter();
  }

  applyNavFilter(): void {
    if (!this.navSearchTerm.trim()) {
      this.filteredNavItems = [...this.navItems];
      return;
    }
    const term = this.navSearchTerm.toLowerCase().trim();
    this.filteredNavItems = this.navItems.filter(item =>
      item.label.toLowerCase().includes(term) ||
      item.originalLabel.toLowerCase().includes(term) ||
      item.groupKey.toLowerCase().includes(term) ||
      (item.submenuKey && item.submenuKey.toLowerCase().includes(term)) ||
      (item.nestedKey && item.nestedKey.toLowerCase().includes(term))
    );
  }

  onNavFieldChange(item: NavigationLabel): void {
    item.hasChanges = item.label !== item.originalLabel;
  }

  getNavItemsWithChanges(): NavigationLabel[] {
    return this.navItems.filter(e => e.hasChanges);
  }

  hasAnyNavChanges(): boolean {
    return this.navItems.some(e => e.hasChanges);
  }

  saveNavChanges(): void {
    const toSave = this.getNavItemsWithChanges();
    if (toSave.length === 0) return;

    this.isSaving = true;
    this.saveResults = { success: 0, errors: 0 };
    this.showResults = false;

    // Sauvegarder via le service de labels
    this.navLabels.saveLabels(this.navItems).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving = false;
        this.showResults = true;
        // Recharger pour mettre à jour les labels originaux
        this.loadNavigationItems();
      })
    ).subscribe({
      next: () => {
        this.saveResults.success = toSave.length;
        // Le sidebar se met à jour automatiquement via le BehaviorSubject
      },
      error: (err) => {
        console.error('Erreur sauvegarde labels navigation:', err);
        this.saveResults.errors = toSave.length;
      }
    });
  }

  discardNavChanges(item: NavigationLabel): void {
    item.label = item.originalLabel;
    item.hasChanges = false;
  }

  discardAllNav(): void {
    this.popupService.showConfirm(
      this.translate.instant('CFG.RENOMMER.DISCARD_ALL_CONFIRM') || 'Êtes-vous sûr de vouloir annuler toutes les modifications de navigation ?',
      this.translate.instant('CFG.RENOMMER.DISCARD_ALL_TITLE') || 'Annuler les modifications'
    ).then(confirmed => {
      if (confirmed) {
        this.navItems.forEach(e => this.discardNavChanges(e));
      }
    });
  }

  // ===== HISTORIQUE / AUDIT =====

  /** Ouvre l'historique pour un label spécifique */
  openHistory(item: NavigationLabel): void {
    this.selectedHistoryLabelId = item.id;
    this.historyLabelType = item.type;
    this.historyGroupKey = item.groupKey;
    this.showHistory = true;
    this.loadHistory(item.id);
  }

  /** Charge l'historique pour un label */
  loadHistory(labelId: string): void {
    this.navLabels.getHistoryForLabel(labelId).subscribe(history => {
      this.historyItems = this.transformHistoryItems(history);
      this.updateHistoryTypeLabel();
    });
  }

  /** Charge tout l'historique (pour la vue globale) */
  loadAllHistory(): void {
    this.navLabels.getAllHistory().subscribe(history => {
      this.historyItems = this.transformHistoryItems(history);
      this.updateHistoryTypeLabel();
    });
  }

  /** Charge l'historique pour un groupe */
  loadGroupHistory(groupKey: string): void {
    this.navLabels.getHistoryForGroup(groupKey).subscribe(history => {
      this.historyItems = this.transformHistoryItems(history);
      this.updateHistoryTypeLabel();
    });
  }

  /** Transforme les items d'historique pour ajouter les propriétés calculées */
  private transformHistoryItems(items: NavigationLabelAudit[]): any[] {
    return items.map(item => ({
      ...item,
      actionLabel: this.getActionLabel(item.actionType),
      formattedDate: this.formatDate(item.createdAt)
    }));
  }

  /** Met à jour le label du type d'historique affiché */
  private updateHistoryTypeLabel(): void {
    this.historyTypeLabel = this.getNavItemTypeLabel({ type: this.historyLabelType } as any);
  }

  /** Restaure une version spécifique */
  restoreVersion(versionIndex: number): void {
    if (versionIndex >= 0 && versionIndex < this.historyItems.length) {
      const version = this.historyItems[versionIndex];
      this.popupService.showConfirm(
        this.translate.instant('CFG.RENOMMER.HISTORY_RESTORE_CONFIRM') || `Restaurer la version du ${version.formattedDate} ? Cette action écrasera les modifications actuelles.`,
        this.translate.instant('CFG.RENOMMER.HISTORY_RESTORE_TITLE') || 'Restaurer cette version'
      ).then(confirmed => {
        if (confirmed) {
          this.navLabels.restoreVersion(this.selectedHistoryLabelId, versionIndex).subscribe({
            next: () => {
              this.showToast('Version restaurée avec succès', 'success');
              this.loadHistory(this.selectedHistoryLabelId);
              this.loadNavigationItems();
            },
            error: (err) => {
              console.error('Erreur restauration:', err);
              this.showToast('Erreur lors de la restauration', 'error');
            }
          });
        }
      });
    }
  }

  /** Ferme le panneau d'historique */
  closeHistory(): void {
    this.showHistory = false;
    this.historyItems = [];
    this.selectedHistoryLabelId = '';
  }

  /** Formate la date pour l'affichage */
  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /** Retourne le libellé du type d'action */
  getActionLabel(actionType: string): string {
    const labels: Record<string, string> = {
      'UPDATE': 'Modification',
      'RESTORE': 'Restauration',
      'CREATE': 'Création',
      'DELETE': 'Suppression'
    };
    return labels[actionType] || actionType;
  }

  // ===== MODE DONNÉES (EXISTANT) =====
  onModuleChange(): void {
    if (this.selectedModule) {
      this.loadEntities();
    } else {
      this.entities = [];
      this.filteredEntities = [];
    }
  }

  loadEntities(): void {
    if (!this.selectedModule) return;

    this.isLoading = true;
    this.entities = [];
    this.filteredEntities = [];

    this.http.get<any[]>(`/api/renommer/${this.selectedModule}`).pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        console.error(`Erreur chargement module ${this.selectedModule}:`, err);
        const msg = err.status === 404 
          ? `Module non trouvé: ${this.selectedModule}`
          : err.status === 403
            ? 'Accès refusé'
            : `Erreur ${err.status}: ${err.message || 'Erreur serveur'}`;
        this.showToast(msg, 'error');
        return of([]);
      }),
      finalize(() => this.isLoading = false)
    ).subscribe(data => {
      console.log(`Module ${this.selectedModule}: ${data.length} éléments chargés`);
      this.entities = data.map(item => {
        // Mapper les champs selon le module
        const title = this.getTitleField(item, this.selectedModule);
        const label = this.getLabelField(item, this.selectedModule);
        const comment = this.getCommentField(item, this.selectedModule);
        const description = this.getDescriptionField(item, this.selectedModule);
        
        return {
          id: `${item.module || this.selectedModule}-${item.id}`,
          module: item.module || this.selectedModule,
          entityType: item.entityType || this.getModuleLabel(this.selectedModule),
          entityId: item.id,
          currentTitle: title,
          currentLabel: label,
          currentComment: comment,
          currentDescription: description,
          newTitle: title,
          newLabel: label || '',
          newComment: comment || '',
          newDescription: description || '',
          hasChanges: false
        };
      });
      // Appliquer le filtre (initialise filteredEntities et pagedEntities)
      this.applyFilter();
    });
  }

  private getTitleField(item: any, moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return item.nom || '';
      case 'comptes': return item.numeroCompte || '';
      case 'operations': return item.service || '';
      case 'frais':
      case 'commissions': return item.service || '';
      case 'banque': return item.pays || '';
      case 'redevance': return item.agence || '';
      case 'niveaux-validation': return item.valeur || '';
      default: return item.nom || item.numeroCompte || item.valeur || item.service || '';
    }
  }

  private getLabelField(item: any, moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return item.libelle || '';
      case 'comptes': return item.libelle || '';
      case 'operations': return item.typeOperation || '';
      case 'frais':
      case 'commissions': return item.description || '';
      case 'banque': return item.agence || '';
      case 'redevance': return item.tauxRedevancePourcentage?.toString() || '';
      case 'niveaux-validation': return item.description || '';
      default: return item.libelle || '';
    }
  }

  private getCommentField(item: any, moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return item.commentaire || '';
      case 'comptes': return item.type || item.categorie || '';
      case 'operations': return item.statut || item.pays || '';
      case 'frais':
      case 'commissions': return item.typeCalcul || '';
      case 'banque': return item.statut || item.reconStatus || item.traitement || '';
      case 'redevance': return item.retenueSurGainsPourcentage?.toString() || '';
      case 'niveaux-validation': return item.statutAssocie || '';
      default: return item.commentaire || '';
    }
  }

  private getDescriptionField(item: any, moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return item.description || '';
      case 'comptes': return item.categorie || item.type || '';
      case 'operations': return item.nomBordereau || item.banque || item.reference || '';
      case 'frais':
      case 'commissions': return item.description || '';
      case 'banque': return item.nomBeneficiaire || item.traitement || item.reference || '';
      case 'redevance': return item.retenueSurGainsSeuil?.toString() || '';
      case 'niveaux-validation': return item.description || '';
      default: return item.description || '';
    }
  }

  /** Noms des champs backend (JPA) pour le titre selon le module */
  private getTitleFieldName(moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return 'serviceLabel';
      case 'comptes': return 'numeroCompte';
      case 'operations': return 'service';
      case 'frais':
      case 'commissions': return 'service';
      case 'banque': return 'pays';
      case 'redevance': return 'agence';
      case 'niveaux-validation': return 'valeur';
      default: return 'title';
    }
  }

  /** Noms des champs backend (JPA) pour le libellé selon le module */
  private getLabelFieldName(moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return 'serviceLabel';
      case 'comptes': return 'categorie';
      case 'operations': return 'typeOperation';
      case 'frais':
      case 'commissions': return 'description';
      case 'banque': return 'agence';
      case 'redevance': return 'tauxRedevancePourcentage';
      case 'niveaux-validation': return 'description';
      default: return 'libelle';
    }
  }

  /** Noms des champs backend (JPA) pour le commentaire selon le module */
  private getCommentFieldName(moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return 'motif';
      case 'comptes': return 'type';
      case 'operations': return 'statut';
      case 'frais':
      case 'commissions': return 'typeCalcul';
      case 'banque': return 'statut';
      case 'redevance': return 'retenueSurGainsPourcentage';
      case 'niveaux-validation': return 'statutAssocie';
      default: return 'commentaire';
    }
  }

  /** Noms des champs backend (JPA) pour la description selon le module */
  private getDescriptionFieldName(moduleKey: string): string {
    switch (moduleKey) {
      case 'services': return 'motif';
      case 'comptes': return 'type';
      case 'operations': return 'nomBordereau';
      case 'frais':
      case 'commissions': return 'description';
      case 'banque': return 'nomBeneficiaire';
      case 'redevance': return 'retenueSurGainsSeuil';
      case 'niveaux-validation': return 'description';
      default: return 'description';
    }
  }

  private getModuleLabel(moduleKey: string): string {
    const config = this.modulesConfig.find(m => m.key === moduleKey);
    return config?.label || moduleKey;
  }

  applyFilter(): void {
    if (!this.searchTerm.trim()) {
      this.filteredEntities = [...this.entities];
    } else {
      const term = this.searchTerm.toLowerCase().trim();
      this.filteredEntities = this.entities.filter(e =>
        e.currentTitle.toLowerCase().includes(term) ||
        (e.currentLabel && e.currentLabel.toLowerCase().includes(term)) ||
        (e.currentComment && e.currentComment.toLowerCase().includes(term)) ||
        (e.currentDescription && e.currentDescription.toLowerCase().includes(term))
      );
    }
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredEntities.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages) {
      this.currentPage = Math.max(1, this.totalPages);
    }
    this.updatePagedEntities();
  }

  updatePagedEntities(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.pagedEntities = this.filteredEntities.slice(startIndex, endIndex);
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagedEntities();
    }
  }

  onItemsPerPageChange(): void {
    this.currentPage = 1;
    this.updatePagination();
  }

  /** Calcule l'index de fin pour l'affichage de la pagination de façon sécurisée */
  getPaginationEnd(): number {
    if (!this.filteredEntities || this.filteredEntities.length === 0) {
      return 0;
    }
    return Math.min(this.currentPage * this.itemsPerPage, this.filteredEntities.length);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    if (this.totalPages <= maxVisible) {
      for (let i = 1; i <= this.totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
      let end = Math.min(this.totalPages, start + maxVisible - 1);
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  }

  resetPagination(): void {
    this.currentPage = 1;
    this.updatePagination();
  }

  onFieldChange(entity: RenameableEntity): void {
    entity.hasChanges = 
      entity.newTitle !== entity.currentTitle ||
      (entity.newLabel !== undefined && entity.newLabel !== entity.currentLabel) ||
      (entity.newComment !== undefined && entity.newComment !== entity.currentComment) ||
      (entity.newDescription !== undefined && entity.newDescription !== entity.currentDescription);
  }

  getEntitiesWithChanges(): RenameableEntity[] {
    return this.entities.filter(e => e.hasChanges);
  }

  hasAnyChanges(): boolean {
    return this.entities.some(e => e.hasChanges);
  }

  saveAll(): void {
    const toSave = this.getEntitiesWithChanges();
    if (toSave.length === 0) return;

    this.isSaving = true;
    this.saveResults = { success: 0, errors: 0 };
    this.showResults = false;

    const saveRequests = toSave.map(entity => {
      const updateData: any = {};
      // Mapper les champs selon le module (noms exacts des champs JPA)
      const moduleKey = entity.module;
      
      if (entity.newTitle !== entity.currentTitle) {
        updateData[this.getTitleFieldName(moduleKey)] = entity.newTitle;
      }
      if (entity.newLabel !== entity.currentLabel) {
        updateData[this.getLabelFieldName(moduleKey)] = entity.newLabel;
      }
      if (entity.newComment !== entity.currentComment) {
        updateData[this.getCommentFieldName(moduleKey)] = entity.newComment;
      }
      if (entity.newDescription !== entity.currentDescription) {
        updateData[this.getDescriptionFieldName(moduleKey)] = entity.newDescription;
      }

      if (Object.keys(updateData).length === 0) return of({ success: true });

      return this.http.put(`/api/renommer/${entity.module}/${entity.entityId}`, updateData).pipe(
        map(() => ({ success: true })),
        catchError(err => {
          console.error(`Erreur sauvegarde ${entity.id}:`, err);
          return of({ success: false, error: err });
        })
      );
    });

    forkJoin(saveRequests).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving = false;
        this.showResults = true;
        if (this.saveResults.success > 0) {
          this.loadEntities();
        }
      })
    ).subscribe(results => {
      results.forEach(r => {
        if (r.success) this.saveResults.success++;
        else this.saveResults.errors++;
      });

      // Notification popup après sauvegarde
      if (this.saveResults.success > 0 && this.saveResults.errors === 0) {
        this.popupService.showSuccess(
          this.translate.instant('CFG.RENOMMER.SAVE_SUCCESS', { count: this.saveResults.success }) || 
          `${this.saveResults.success} élément(s) sauvegardé(s) avec succès`
        );
      } else if (this.saveResults.success > 0 && this.saveResults.errors > 0) {
        this.popupService.showWarning(
          this.translate.instant('CFG.RENOMMER.SAVE_PARTIAL', { 
            success: this.saveResults.success, 
            errors: this.saveResults.errors 
          }) || 
          `${this.saveResults.success} sauvegardé(s), ${this.saveResults.errors} erreur(s)`
        );
      } else if (this.saveResults.errors > 0) {
        this.popupService.showError(
          this.translate.instant('CFG.RENOMMER.SAVE_ERROR', { count: this.saveResults.errors }) || 
          `${this.saveResults.errors} erreur(s) lors de la sauvegarde`
        );
      }
    });
  }

  discardChanges(entity: RenameableEntity): void {
    entity.newTitle = entity.currentTitle;
    entity.newLabel = entity.currentLabel || '';
    entity.newComment = entity.currentComment || '';
    entity.newDescription = entity.currentDescription || '';
    entity.hasChanges = false;
  }

  discardAll(): void {
    this.popupService.showConfirm(
      this.translate.instant('CFG.RENOMMER.DISCARD_ALL_CONFIRM') || 'Êtes-vous sûr de vouloir annuler toutes les modifications ?',
      this.translate.instant('CFG.RENOMMER.DISCARD_ALL_TITLE') || 'Annuler les modifications'
    ).then(confirmed => {
      if (confirmed) {
        this.entities.forEach(e => this.discardChanges(e));
      }
    });
  }

  getConfig(): ModuleConfig | undefined {
    return this.modulesConfig.find(m => m.key === this.selectedModule);
  }

  hasLabelField(): boolean {
    return !!this.getConfig()?.labelField;
  }

  hasCommentField(): boolean {
    return !!this.getConfig()?.commentField;
  }

  hasDescriptionField(): boolean {
    return !!this.getConfig()?.descriptionField;
  }

  // ===== UTILITAIRES NAVIGATION =====
  getNavItemTypeLabel(item: NavigationLabel): string {
    switch (item.type) {
      case 'group': return 'Groupe';
      case 'submenu': return 'Sous-menu';
      case 'nested': return 'Sous-menu (3e niveau)';
      default: return item.type;
    }
  }

  getNavItemGroupLabel(item: NavigationLabel): string {
    const group = this.navGroups.find(g => g.key === item.groupKey);
    return group?.label || item.groupKey;
  }

  getNavItemSubmenuLabel(item: NavigationLabel): string {
    if (!item.submenuKey) return '';
    const group = this.navGroups.find(g => g.key === item.groupKey);
    const submenu = group?.children?.find(s => s.key === item.submenuKey);
    return submenu?.label || item.submenuKey;
  }

  getNavItemNestedLabel(item: NavigationLabel): string {
    if (!item.nestedKey) return '';
    const group = this.navGroups.find(g => g.key === item.groupKey);
    const submenu = group?.children?.find(s => s.key === item.submenuKey);
    const nested = submenu?.children?.find(n => n.key === item.nestedKey);
    return nested?.label || item.nestedKey;
  }

  getNavItemPath(item: NavigationLabel): string {
    const parts = [this.getNavItemGroupLabel(item)];
    if (item.submenuKey) parts.push(this.getNavItemSubmenuLabel(item));
    if (item.nestedKey) parts.push(this.getNavItemNestedLabel(item));
    return parts.join(' > ');
  }

  private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
    // Utiliser le PopupService si disponible, sinon console.log
    console.log(`[${type.toUpperCase()}] ${message}`);
    // TODO: Intégrer avec un service de notification existant
  }

  /** Retourne l'icône pour un type d'action */
  getActionIcon(actionType: string): string {
    const icons: Record<string, string> = {
      'UPDATE': 'fa-edit',
      'RESTORE': 'fa-rotate-left',
      'CREATE': 'fa-plus',
      'DELETE': 'fa-trash'
    };
    return icons[actionType] || 'fa-info';
  }
}