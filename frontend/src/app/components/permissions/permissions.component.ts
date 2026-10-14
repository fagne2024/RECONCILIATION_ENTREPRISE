import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PermissionService } from '../../services/permission.service';
import { Permission } from '../../models/permission.model';
import { HttpClient } from '@angular/common/http';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-permissions',
  templateUrl: './permissions.component.html',
  styleUrls: ['./permissions.component.scss']
})
export class PermissionsComponent implements OnInit {
  permissions: Permission[] = [];
  filteredPermissions: Permission[] = [];
  pagedPermissions: Permission[] = [];
  permissionsByModule: { [key: string]: Permission[] } = {};
  filteredPermissionsByModule: { [key: string]: Permission[] } = {};
  expandedModules: Set<string> = new Set();
  showAddForm = false;
  isAdding = false;
  isLoading = false;
  isGenerating = false;
  addForm: FormGroup;
  showEditForm = false;
  isEditing = false;
  editingPermission: Permission | null = null;
  editForm: FormGroup;
  generationResult: any = null;
  searchTerm = '';
  
  // Propriétés pour l'analyse des actions
  showActionsAnalysis = false;
  isAnalyzing = false;
  actionsAnalysis: any = null;
  selectedModule: string | null = null;
  moduleActions: any[] = [];
  isLoadingModuleActions = false;

  // Propriétés pour la pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;

  constructor(
    private permissionService: PermissionService,
    private formBuilder: FormBuilder,
    private http: HttpClient,
    private popupService: PopupService
  ) {
    this.addForm = this.formBuilder.group({
      nom: ['', [Validators.required, Validators.minLength(2)]]
    });

    this.editForm = this.formBuilder.group({
      nom: ['', [Validators.required, Validators.minLength(2)]]
    });
  }

  ngOnInit(): void {
    this.loadPermissions();
  }

  loadPermissions(): void {
    this.isLoading = true;
    this.permissionService.getPermissionsGroupedByModule().subscribe({
      next: (permissionsByModule) => {
        this.permissionsByModule = permissionsByModule;
        // Aplatir toutes les permissions pour la liste complète
        this.permissions = Object.values(permissionsByModule).flat();
        // Développer tous les modules par défaut
        this.expandedModules = new Set(Object.keys(permissionsByModule));
        this.applyFilters();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des permissions:', error);
        this.isLoading = false;
        
        // Gestion d'erreur plus explicite
        if (error.status === 0) {
          this.popupService.showError(
            I18nService.t('PRM.msg.backendUnreachable'),
            I18nService.t('PRM.popup.connectionErrorTitle')
          );
        } else if (error.status === 404) {
          this.popupService.showWarning(
            I18nService.t('PRM.msg.endpointNotFound'),
            I18nService.t('PRM.popup.endpointNotFoundTitle')
          );
        } else {
          this.popupService.showError(
            I18nService.t('PRM.msg.loadError', {
              error: error.message || I18nService.t('PRM.msg.unknownError')
            }),
            I18nService.t('POPUP.error')
          );
        }
      }
    });
  }

  applyFilters(): void {
    // Filtrer les permissions
    this.filteredPermissions = this.permissions.filter(permission => {
      const matchesSearch = !this.searchTerm || 
        permission.nom.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchesSearch;
    });
    
    // Filtrer et regrouper par module
    this.filteredPermissionsByModule = {};
    for (const [moduleName, permissions] of Object.entries(this.permissionsByModule)) {
      const filtered = permissions.filter(permission => {
        const matchesSearch = !this.searchTerm || 
          permission.nom.toLowerCase().includes(this.searchTerm.toLowerCase());
        return matchesSearch;
      });
      if (filtered.length > 0) {
        this.filteredPermissionsByModule[moduleName] = filtered;
      }
    }
    
    this.updatePagination();
  }

  /**
   * Toggle l'expansion d'un module
   */
  toggleModule(moduleName: string): void {
    if (this.expandedModules.has(moduleName)) {
      this.expandedModules.delete(moduleName);
    } else {
      this.expandedModules.add(moduleName);
    }
  }

  /**
   * Vérifie si un module est développé
   */
  isModuleExpanded(moduleName: string): boolean {
    return this.expandedModules.has(moduleName);
  }

  /**
   * Obtient les noms des modules triés
   */
  getModuleNames(): string[] {
    return Object.keys(this.filteredPermissionsByModule).sort();
  }

  /**
   * Obtient le nombre de permissions pour un module
   */
  getPermissionCountForModule(moduleName: string): number {
    return this.filteredPermissionsByModule[moduleName]?.length || 0;
  }

  // Méthodes de pagination
  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredPermissions.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = 1;
    }
    this.updatePagedPermissions();
  }

  updatePagedPermissions(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.pagedPermissions = this.filteredPermissions.slice(startIndex, endIndex);
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagedPermissions();
    }
  }

  onItemsPerPageChange(): void {
    this.currentPage = 1;
    this.updatePagination();
  }

  getStartIndex(): number {
    return (this.currentPage - 1) * this.itemsPerPage;
  }

  getEndIndex(): number {
    const endIndex = this.currentPage * this.itemsPerPage;
    return Math.min(endIndex, this.filteredPermissions.length);
  }

  getVisiblePages(): number[] {
    const maxVisible = 5;
    const pages: number[] = [];
    
    if (this.totalPages <= maxVisible) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, this.currentPage - 2);
      let end = Math.min(this.totalPages, start + maxVisible - 1);
      
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.applyFilters();
  }

  createPermission(): void {
    if (this.addForm.valid) {
      this.isAdding = true;
      const permissionData = this.addForm.value;
      
      this.permissionService.createPermission(permissionData).subscribe({
        next: (permission) => {
          console.log('✅ Permission créée avec succès:', permission);
          this.popupService.showSuccess(
            I18nService.t('PRM.msg.createSuccess', { permission: permission.nom }),
            I18nService.t('PRM.popup.createdTitle')
          );
          this.addForm.reset();
          this.showAddForm = false;
          this.isAdding = false;
          this.loadPermissions();
          this.applyFilters();
        },
        error: (error) => {
          console.error('❌ Erreur lors de la création de la permission:', error);
          this.isAdding = false;
          this.popupService.showError(
            I18nService.t('PRM.msg.createError'),
            I18nService.t('PRM.popup.createErrorTitle')
          );
        }
      });
    }
  }

  cancelAdd(): void {
    this.addForm.reset();
    this.showAddForm = false;
  }

  closeAddModal(): void {
    this.showAddForm = false;
  }

  editPermission(permission: Permission): void {
    this.editingPermission = permission;
    this.editForm.patchValue({
      nom: permission.nom
    });
    this.showEditForm = true;
  }

  updatePermission(): void {
    if (this.editForm.valid && this.editingPermission) {
      this.isEditing = true;
      const permissionData = { ...this.editingPermission, ...this.editForm.value };
      
      this.permissionService.updatePermission(permissionData.id!, permissionData).subscribe({
        next: (permission) => {
          console.log('✅ Permission mise à jour avec succès:', permission);
          this.popupService.showSuccess(
            I18nService.t('PRM.msg.updateSuccess', { permission: permission.nom }),
            I18nService.t('PRM.popup.updatedTitle')
          );
          this.editForm.reset();
          this.showEditForm = false;
          this.isEditing = false;
          this.editingPermission = null;
          this.loadPermissions();
          this.applyFilters();
        },
        error: (error) => {
          console.error('❌ Erreur lors de la mise à jour de la permission:', error);
          this.isEditing = false;
          this.popupService.showError(
            I18nService.t('PRM.msg.updateError'),
            I18nService.t('PRM.popup.updateErrorTitle')
          );
        }
      });
    }
  }

  cancelEdit(): void {
    this.editForm.reset();
    this.showEditForm = false;
    this.editingPermission = null;
  }

  async deletePermission(permission: Permission): Promise<void> {
    if (permission.id) {
      const confirmed = await this.popupService.showConfirm(
        I18nService.t('PRM.confirm.delete', { permission: permission.nom }),
        I18nService.t('PRM.popup.deleteConfirmTitle')
      );
      if (confirmed) {
        this.permissionService.deletePermission(permission.id).subscribe({
          next: () => {
            console.log('✅ Permission supprimée avec succès');
            this.popupService.showSuccess(
              I18nService.t('PRM.msg.deleteSuccess', { permission: permission.nom }),
              I18nService.t('PRM.popup.deletedTitle')
            );
            this.loadPermissions();
            this.applyFilters();
          },
          error: (error) => {
            console.error('❌ Erreur lors de la suppression de la permission:', error);
            console.error('❌ Structure de l\'erreur:', {
              error: error.error,
              status: error.status,
              statusText: error.statusText,
              message: error.message
            });
            
            // Extraire le message d'erreur du backend si disponible
            let errorMessage = I18nService.t('PRM.msg.deleteError');
            
            // Essayer différentes structures de réponse
            if (error.error) {
              if (typeof error.error === 'object') {
                // Structure: { error: "message" }
                if (error.error.error) {
                  errorMessage = error.error.error;
                } else if (error.error.message) {
                  errorMessage = error.error.message;
                } else if (Object.keys(error.error).length > 0) {
                  // Prendre la première valeur de l'objet
                  errorMessage = Object.values(error.error)[0] as string;
                }
              } else if (typeof error.error === 'string') {
                errorMessage = error.error;
              }
            } else if (error.message) {
              errorMessage = error.message;
            }
            
            this.popupService.showError(errorMessage, I18nService.t('PRM.popup.deleteErrorTitle'));
          }
        });
      }
    }
  }

  async generatePermissions(): Promise<void> {
    const confirmed = await this.popupService.showConfirm(
      I18nService.t('PRM.confirm.generate'),
      I18nService.t('PRM.popup.generateTitle')
    );
    if (confirmed) {
      this.isGenerating = true;
      this.generationResult = null;
      
      this.permissionService.generatePermissions().subscribe({
        next: (result) => {
          console.log('✅ Génération des permissions terminée:', result);
          this.generationResult = result;
          this.isGenerating = false;
          // Recharger les permissions après génération
          this.loadPermissions();
          this.applyFilters();
        },
        error: (error) => {
          console.error('❌ Erreur lors de la génération des permissions:', error);
          this.isGenerating = false;
          let errorMessage = I18nService.t('PRM.msg.generateError');
          if (error.error && error.error.error) {
            errorMessage = error.error.error;
          } else if (error.error && typeof error.error === 'string') {
            errorMessage = error.error;
          }
          this.popupService.showError(errorMessage, I18nService.t('PRM.popup.generateErrorTitle'));
        }
      });
    }
  }

  /**
   * Analyse toutes les actions disponibles par module
   */
  analyzeModuleActions(): void {
    this.isAnalyzing = true;
    this.actionsAnalysis = null;
    this.showActionsAnalysis = true;
    
    this.permissionService.analyzeAllModuleActions().subscribe({
      next: (result) => {
        console.log('✅ Analyse des actions terminée:', result);
        this.actionsAnalysis = result;
        this.isAnalyzing = false;
      },
      error: (error) => {
        console.error('❌ Erreur lors de l\'analyse des actions:', error);
        this.isAnalyzing = false;
        let errorMessage = I18nService.t('PRM.msg.analyzeError');
        if (error.error && error.error.error) {
          errorMessage = error.error.error;
        } else if (error.error && typeof error.error === 'string') {
          errorMessage = error.error;
        }
        this.popupService.showError(errorMessage, I18nService.t('PRM.popup.analyzeErrorTitle'));
      }
    });
  }

  /**
   * Charge les actions d'un module spécifique
   */
  loadModuleActions(moduleName: string): void {
    this.selectedModule = moduleName;
    this.isLoadingModuleActions = true;
    this.moduleActions = [];
    
    this.permissionService.getActionsForModule(moduleName).subscribe({
      next: (actions) => {
        console.log(`✅ Actions chargées pour le module ${moduleName}:`, actions);
        this.moduleActions = actions;
        this.isLoadingModuleActions = false;
      },
      error: (error) => {
        console.error(`❌ Erreur lors du chargement des actions pour ${moduleName}:`, error);
        this.isLoadingModuleActions = false;
        this.popupService.showError(
          I18nService.t('PRM.msg.loadActionsError', { module: moduleName }),
          I18nService.t('PRM.popup.loadErrorTitle')
        );
      }
    });
  }

  /**
   * Ferme l'analyse des actions
   */
  closeActionsAnalysis(): void {
    this.showActionsAnalysis = false;
    this.actionsAnalysis = null;
    this.selectedModule = null;
    this.moduleActions = [];
  }

  /**
   * Retourne les modules disponibles dans l'analyse
   */
  getAvailableModules(): string[] {
    if (!this.actionsAnalysis || !this.actionsAnalysis.modules) {
      return [];
    }
    return Object.keys(this.actionsAnalysis.modules);
  }

  /**
   * Retourne le nombre d'actions pour un module
   */
  getActionCountForModule(moduleName: string): number {
    if (!this.actionsAnalysis || !this.actionsAnalysis.actionCounts) {
      return 0;
    }
    return this.actionsAnalysis.actionCounts[moduleName] || 0;
  }
} 