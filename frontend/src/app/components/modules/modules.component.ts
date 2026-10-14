import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModuleService } from '../../services/module.service';
import { ProfilService } from '../../services/profil.service';
import { Module } from '../../models/module.model';
import { Profil } from '../../models/profil.model';
import { ProfilPermission } from '../../models/profil-permission.model';
import { I18nService } from '../../services/i18n/i18n.service';
import { NavigationVisibilityService } from '../../services/navigation-visibility.service';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { APP_NAVIGATION_CATALOG, AppNavigationGroup, AppNavigationSubmenu } from '../../constants/app-navigation-catalog';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss']
})
export class ModulesComponent implements OnInit {
  modules: Module[] = [];
  filteredModules: Module[] = [];
  pagedModules: Module[] = [];
  profils: Profil[] = [];
  profilPermissions: ProfilPermission[] = [];
  showAddForm = false;
  isAdding = false;
  isLoading = false;
  addForm: FormGroup;
  showEditForm = false;
  isEditing = false;
  editingModule: Module | null = null;
  editForm: FormGroup;
  showProfilsModal = false;
  selectedModule: Module | null = null;
  isSavingProfils = false;
  searchTerm = '';

  // Gestion visibilité sous-menus
  showSubmenuVisibilityModal = false;
  selectedModuleForSubmenu: Module | null = null;
  moduleSubmenus: AppNavigationSubmenu[] = [];
  isSavingSubmenuVisibility = false;

  // Propriétés pour la pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;

  // Liste de tous les menus de l'application
  appMenus = [
    'Dashboard',
    'Traitement',
    'Réconciliation',
    'Résultats',
    'Statistiques',
    'Classements',
    'Comptes',
    'Opérations',
    'Frais',
    'Commission',
    'TSOP',
    'Impact OP',
    'TRX SF',
    'BANQUE',
    'Comptabilité',
    'Modèles',
    'Utilisateur',
    'Profil',
    'Module',
    'Permission',
    'Log utilisateur',
    'Configuration',
    'AIDE'
  ];

  constructor(
    private moduleService: ModuleService,
    private profilService: ProfilService,
    private formBuilder: FormBuilder,
    private navVisibility: NavigationVisibilityService,
    private appState: AppStateService,
    private popup: PopupService
  ) {
    this.addForm = this.formBuilder.group({
      nom: ['', [Validators.required]],
      visible: [true]
    });

    this.editForm = this.formBuilder.group({
      nom: ['', [Validators.required]],
      visible: [true]
    });
  }

  ngOnInit(): void {
    this.loadModules();
    this.loadProfils();
  }

  loadModules(): void {
    this.isLoading = true;
    this.moduleService.getAllModules().subscribe({
      next: (modules) => {
        this.modules = modules;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('❌ Erreur lors du chargement des modules:', error);
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    this.filteredModules = this.modules.filter(module => {
      const matchesSearch = !this.searchTerm || 
        module.nom.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchesSearch;
    });
    this.updatePagination();
  }

  // Méthodes de pagination
  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredModules.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = 1;
    }
    this.updatePagedModules();
  }

  updatePagedModules(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.pagedModules = this.filteredModules.slice(startIndex, endIndex);
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagedModules();
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
    return Math.min(endIndex, this.filteredModules.length);
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

  loadProfils(): void {
    this.profilService.getProfils().subscribe({
      next: (profils) => {
        this.profils = profils;
        // Charger les associations après avoir chargé les profils
        this.loadProfilPermissions();
      },
      error: (error) => {
        console.error('❌ Erreur lors du chargement des profils:', error);
      }
    });
  }

  loadProfilPermissions(): void {
    // Réinitialiser les associations seulement si les profils sont chargés
    if (this.profils.length === 0) {
      return;
    }
    
    // Réinitialiser les associations
    this.profilPermissions = [];
    // Charger toutes les associations profil-permission-module
    this.profils.forEach(profil => {
      if (profil.id) {
        this.profilService.getProfilPermissions(profil.id).subscribe({
          next: (pp) => {
            this.profilPermissions.push(...pp);
          },
          error: (error) => {
            console.error(`❌ Erreur lors du chargement des permissions pour le profil ${profil.id}:`, error);
          }
        });
      }
    });
  }

  createModule(): void {
    if (this.addForm.valid) {
      this.isAdding = true;
      const moduleData = this.addForm.value;
      
      this.moduleService.createModule(moduleData).subscribe({
        next: (module) => {
          console.log('✅ Module créé avec succès:', module);
          this.addForm.reset();
          this.showAddForm = false;
          this.isAdding = false;
          this.loadModules();
          this.loadProfilPermissions();
          this.applyFilters();
          // Notifier la sidebar pour la visibilité du nouveau module
          this.navVisibility.setModuleVisibility(module.nom, module.visible !== false);
        },
        error: (error) => {
          console.error('❌ Erreur lors de la création du module:', error);
          this.isAdding = false;
          alert(I18nService.t('MOD.alert.createError'));
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

  editModule(module: Module): void {
    this.editingModule = module;
    this.editForm.patchValue({
      nom: module.nom,
      visible: module.visible !== false
    });
    this.showEditForm = true;
  }

  updateModule(): void {
    if (this.editForm.valid && this.editingModule) {
      const wantsVisible = this.editForm.value.visible !== false;
      // Impossible d'activer (rendre visible) un module non activé par le SUPER_ADMIN.
      if (wantsVisible && this.editingModule.visible === false && !this.isModuleActiveForCompany(this.editingModule)) {
        this.warnModuleNotActivated(this.editingModule.nom);
        return;
      }
      this.isEditing = true;
      const moduleData = { ...this.editingModule, ...this.editForm.value };
      
      this.moduleService.updateModule(moduleData.id!, moduleData).subscribe({
        next: (module) => {
          console.log('✅ Module mis à jour avec succès:', module);
          this.editForm.reset();
          this.showEditForm = false;
          this.isEditing = false;
          this.editingModule = null;
          this.loadModules();
          this.loadProfilPermissions();
          this.applyFilters();
          // Notifier la sidebar avec la visibilité réellement enregistrée
          this.navVisibility.setModuleVisibility(moduleData.nom, moduleData.visible !== false);
        },
        error: (error) => {
          console.error('❌ Erreur lors de la mise à jour du module:', error);
          this.isEditing = false;
          alert(I18nService.t('MOD.alert.updateError'));
        }
      });
    }
  }

  cancelEdit(): void {
    this.editForm.reset();
    this.showEditForm = false;
    this.editingModule = null;
  }

  deleteModule(module: Module): void {
    if (module.id) {
      const confirmed = confirm(I18nService.t('MOD.confirm.deleteModule', { module: module.nom }));
      if (confirmed) {
        this.moduleService.deleteModule(module.id).subscribe({
          next: () => {
            console.log('✅ Module supprimé avec succès');
            this.loadModules();
            this.loadProfilPermissions();
            this.applyFilters();
            // Recharger les visibilités et reconstruire la sidebar
            this.navVisibility.invalidateCache();
          },
          error: (error) => {
            console.error('❌ Erreur lors de la suppression du module:', error);
            alert(I18nService.t('MOD.alert.deleteError'));
          }
        });
      }
    }
  }

  // Gestion des associations modules-profils
  getProfilsForModule(module: Module): Profil[] {
    if (!module.id) return [];
    const moduleProfils = this.profilPermissions
      .filter(pp => pp.module.id === module.id)
      .map(pp => pp.profil);
    // Retourner les profils uniques
    return Array.from(new Map(moduleProfils.map(p => [p.id, p])).values());
  }

  isModuleAssociatedToProfil(module: Module, profil: Profil): boolean {
    if (!module.id || !profil.id) return false;
    return this.profilPermissions.some(
      pp => pp.module.id === module.id && pp.profil.id === profil.id
    );
  }

  openProfilsModal(module: Module): void {
    this.selectedModule = module;
    this.showProfilsModal = true;
  }

  closeProfilsModal(): void {
    this.showProfilsModal = false;
    this.selectedModule = null;
  }

  toggleProfilAssociation(profil: Profil, event: Event): void {
    if (!this.selectedModule || !this.selectedModule.id || !profil.id) return;
    
    const checked = (event.target as HTMLInputElement).checked;
    
    if (checked) {
      // Associer le module au profil en ajoutant seulement ses permissions
      this.associateModuleToProfil(this.selectedModule, profil);
    } else {
      // Désassocier le module du profil en supprimant seulement ses permissions
      this.disassociateModuleFromProfil(this.selectedModule, profil);
    }
  }

  associateModuleToProfil(module: Module, profil: Profil): void {
    if (!module.id || !profil.id) return;
    
    this.isSavingProfils = true;

    this.profilService.getPermissionsForModule(module.id).subscribe({
      next: (modulePermissions) => {
        const permissionIds = modulePermissions
          .filter(permission => permission.id)
          .map(permission => permission.id!);

        if (permissionIds.length === 0) {
          console.log(`⚠️ Aucune permission disponible pour le module ${module.nom}`);
          this.isSavingProfils = false;
          return;
        }

        // Associer uniquement les permissions réellement disponibles sur ce module
        this.profilService.addMultiplePermissionsToProfil(profil.id!, module.id!, permissionIds).subscribe({
          next: (profilPermissions) => {
            profilPermissions.forEach(pp => {
              if (!this.profilPermissions.some(existing => existing.id === pp.id)) {
                this.profilPermissions.push(pp);
              }
            });
            console.log(`✅ Module ${module.nom} associé au profil ${profil.nom} (${profilPermissions.length} permission(s))`);
            this.isSavingProfils = false;
          },
          error: (error) => {
            console.error(`❌ Erreur lors de l'association:`, error);
            this.isSavingProfils = false;
          }
        });
      },
      error: (error) => {
        console.error(`❌ Erreur lors du chargement des permissions du module ${module.nom}:`, error);
        this.isSavingProfils = false;
      }
    });
  }

  disassociateModuleFromProfil(module: Module, profil: Profil): void {
    if (!module.id || !profil.id) return;
    
    this.isSavingProfils = true;
    const modulePermissions = this.profilPermissions.filter(
      pp => pp.module.id === module.id && pp.profil.id === profil.id
    );
    
    if (modulePermissions.length === 0) {
      this.isSavingProfils = false;
      return;
    }
    
    let removedCount = 0;
    const totalToRemove = modulePermissions.length;
    
    modulePermissions.forEach(pp => {
      if (pp.id) {
        this.profilService.removePermissionFromProfil(pp.id).subscribe({
          next: () => {
            const index = this.profilPermissions.findIndex(p => p.id === pp.id);
            if (index > -1) {
              this.profilPermissions.splice(index, 1);
            }
            removedCount++;
            if (removedCount === totalToRemove) {
              console.log(`✅ Module ${module.nom} désassocié du profil ${profil.nom}`);
              this.isSavingProfils = false;
            }
          },
          error: (error) => {
            console.error(`❌ Erreur lors de la désassociation:`, error);
            removedCount++;
            if (removedCount === totalToRemove) {
              this.isSavingProfils = false;
            }
          }
        });
      }
    });
  }

  toggleModuleVisibility(module: Module, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const visible = checkbox.checked;
    if (!module.id) return;

    // Un module non activé côté plateforme (SUPER_ADMIN) ne peut pas être rendu
    // visible depuis cette page : on prévient clairement l'utilisateur.
    if (visible && !this.isModuleActiveForCompany(module)) {
      checkbox.checked = false;
      this.warnModuleNotActivated(module.nom);
      return;
    }

    const updatedModule = { ...module, visible };
    this.moduleService.updateModule(module.id, updatedModule).subscribe({
      next: (updated) => {
        module.visible = updated.visible;
        console.log(`✅ Module ${module.nom} visibility updated to ${updated.visible}`);
        // Mettre à jour le cache de visibilité pour refresh immédiat du slide
        this.navVisibility.setModuleVisibility(module.nom, module.visible !== false);
      },
      error: (error) => {
        console.error(`❌ Erreur lors de la mise à jour de la visibilité:`, error);
        checkbox.checked = !visible;
      }
    });
  }

  /**
   * Un module n'est activable ici que s'il a été activé pour l'entreprise
   * courante par le SUPER_ADMIN (via /api/modules/active). Un SUPER_ADMIN n'a
   * pas de périmètre entreprise : on ne bloque jamais son action.
   */
  isModuleActiveForCompany(module: Module): boolean {
    if (this.appState.isSuperAdmin()) {
      return true;
    }
    return this.appState.isModuleActive(module.nom);
  }

  /** Message clair lorsqu'un module n'est pas activé côté plateforme. */
  private warnModuleNotActivated(moduleName: string): void {
    this.popup.showWarning(
      I18nService.t('MOD.notActivated.message', { module: moduleName }),
      I18nService.t('MOD.notActivated.title')
    );
  }

  // === GESTION VISIBILITÉ SOUS-MENUS ===

  openSubmenuVisibilityModal(module: Module): void {
    this.selectedModuleForSubmenu = module;
    // Trouver les sous-menus associés à ce module
    this.moduleSubmenus = this.getSubmenusForModule(module.nom);
    this.showSubmenuVisibilityModal = true;
  }

  closeSubmenuVisibilityModal(): void {
    this.showSubmenuVisibilityModal = false;
    this.selectedModuleForSubmenu = null;
    this.moduleSubmenus = [];
  }

  getSubmenusForModule(moduleName: string): AppNavigationSubmenu[] {
    const submenus: AppNavigationSubmenu[] = [];
    for (const group of APP_NAVIGATION_CATALOG) {
      if (group.children) {
        for (const submenu of group.children) {
          if (submenu.moduleName === moduleName) {
            submenus.push(submenu);
          }
        }
      }
    }
    return submenus;
  }

  isSubmenuVisible(submenu: AppNavigationSubmenu): boolean {
    return submenu.visible !== false;
  }

  toggleSubmenuVisibility(submenu: AppNavigationSubmenu, event: Event): void {
    const visible = (event.target as HTMLInputElement).checked;
    submenu.visible = visible;
    this.navVisibility.invalidateCache();
    console.log(`✅ Sous-menu ${submenu.label} visibility updated to ${visible}`);
  }

  saveSubmenuVisibility(): void {
    if (!this.selectedModuleForSubmenu) return;
    this.isSavingSubmenuVisibility = true;
    
    // Note: La persistance côté backend nécessiterait un endpoint dédié
    // Pour l'instant, on invalide le cache et on met à jour l'UI
    this.navVisibility.invalidateCache();
    this.isSavingSubmenuVisibility = false;
    this.closeSubmenuVisibilityModal();
  }
} 