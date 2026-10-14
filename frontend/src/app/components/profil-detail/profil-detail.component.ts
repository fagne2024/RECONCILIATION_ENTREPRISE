import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProfilService } from '../../services/profil.service';
import { PaysService } from '../../services/pays.service';
import { Profil } from '../../models/profil.model';
import { Module } from '../../models/module.model';
import { Permission } from '../../models/permission.model';
import { ProfilPermission } from '../../models/profil-permission.model';
import { Pays, ProfilPays } from '../../models/pays.model';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, timer, throwError } from 'rxjs';
import { retryWhen, mergeMap, finalize } from 'rxjs/operators';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';
import {
  APP_NAVIGATION_CATALOG,
  AppNavigationGroup,
  AppNavigationSubmenu,
  NavigationAccessContext,
  buildNavigationAccessContext,
  findNavigationAccessContextByAccessModuleName,
  getNavigationCatalogModuleNames,
  groupUsesGranularSubmenuAccess
} from '../../constants/app-navigation-catalog';
import { PermissionService } from '../../services/permission.service';
import {
  ActionCategoryGroup,
  ModuleActionDetail,
  deduplicateModuleActions,
  getActionLabel,
  getHttpMethodClass,
  groupActionsByCategory,
  matchesActionSearch,
  normalizeActionName
} from '../../utils/permission-action.util';

type ToastType = 'success' | 'error' | 'info' | 'warning';

@Component({
  selector: 'app-profil-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './profil-detail.component.html',
  styleUrls: ['./profil-detail.component.scss']
})
export class ProfilDetailComponent implements OnInit {
  profil: Profil | null = null;
  profilId: number | null = null;
  modules: Module[] = [];
  permissions: Permission[] = [];
  profilPermissions: ProfilPermission[] = [];
  allProfilPermissions: ProfilPermission[] = [];
  
  // Suivi des requêtes en cours pour éviter les doublons
  loadingModulePermissionsSet: Set<number> = new Set();
  modulePermissionsCache: { [moduleId: number]: Permission[] } = {};
  
  // Arbre menus / sous-menus (aligné sidebar)
  readonly navigationCatalog = APP_NAVIGATION_CATALOG;
  expandedNavGroups = new Set<string>(APP_NAVIGATION_CATALOG.map(group => group.key));
  expandedSubmenuActions = new Set<string>();
  expandedInactiveSubmenuGroups = new Set<string>();
  showLegacyModuleGrid = false;
  navMenuSearch = '';
  moduleActionsCache: { [moduleName: string]: ModuleActionDetail[] } = {};
  loadingModuleActionsSet = new Set<string>();
  syncingModuleActionsSet = new Set<string>();
  private autoSyncedModuleActionsSet = new Set<string>();
  actionSearchByModule: { [moduleName: string]: string } = {};
  
  // Propriétés pour la gestion des pays
  pays: Pays[] = [];
  profilPays: ProfilPays[] = [];
  showPaysModal = false;
  isSavingPays = false;
  selectedProfilForPays: Profil | null = null;

  // Suivi des modifications en attente
  pendingPermissionChanges: Array<{
    moduleId: number;
    permissionId: number;
    action: 'add' | 'remove';
    module?: Module;
    permission?: Permission;
  }> = [];
  isSavingPermissions = false;

  get hasPendingChanges(): boolean {
    return this.pendingPermissionChanges.length > 0;
  }
  
  get pendingChangesCount(): number {
    return this.pendingPermissionChanges.length;
  }

  toastMessage: string = '';
  toastType: ToastType = 'success';
  private toastTimeout: any;
  isLoading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private profilService: ProfilService,
    private permissionService: PermissionService,
    private paysService: PaysService,
    private cd: ChangeDetectorRef,
    private popupService: PopupService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      if (id) {
        this.profilId = id;
        this.loadProfilDetail(id);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  loadProfilDetail(id: number): void {
    this.isLoading = true;
    
    // Charger le profil
    this.profilService.getProfils().subscribe({
      next: (profils) => {
        this.profil = profils.find(p => p.id === id) || null;
        if (!this.profil) {
          this.showToast('Profil non trouvé', 'error');
          this.router.navigate(['/profils']);
          return;
        }
        
        // Charger les permissions du profil
        this.loadProfilPermissions(id);
        this.loadModules();
        this.loadPermissions();
        this.loadPays();
        this.loadAllProfilPays();
      },
      error: (error) => {
        console.error('Erreur chargement profil:', error);
        this.showToast('Erreur lors du chargement du profil', 'error');
        this.isLoading = false;
      }
    });
  }

  loadProfilPermissions(profilId: number): void {
    this.withRetry(this.profilService.getProfilPermissions(profilId)).subscribe({
      next: (pp) => {
        this.profilPermissions = pp;
        this.preloadModulePermissions();
        this.preloadNavigationModulePermissions();
        this.isLoading = false;
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error('Erreur chargement permissions:', error);
        this.isLoading = false;
      }
    });
  }

  loadModules() {
    this.withRetry(this.profilService.getModules()).subscribe({
      next: (m) => this.modules = m,
      error: (err) => console.error('Erreur chargement modules:', err)
    });
  }

  loadPermissions() {
    this.withRetry(this.profilService.getPermissions()).subscribe({
      next: (a) => this.permissions = a,
      error: (err) => console.error('Erreur chargement permissions:', err)
    });
  }

  loadPays() {
    this.paysService.getPays().subscribe({
      next: (p) => this.pays = p,
      error: (err) => console.error('Erreur chargement pays:', err)
    });
  }

  loadAllProfilPays() {
    if (!this.profil) return;
    this.paysService.getPaysForProfil(this.profil.id!).subscribe({
      next: (pp) => this.profilPays = pp,
      error: (err) => console.error('Erreur chargement pays profil:', err)
    });
  }

  preloadModulePermissions(): void {
    if (!this.profil) return;
    const associatedModules = this.getAssociatedModules();
    associatedModules.forEach(module => {
      if (module.id && !this.modulePermissionsCache[module.id] && !this.loadingModulePermissionsSet.has(module.id)) {
        this.loadModulePermissionsForDisplay(module);
      }
    });
  }

  preloadNavigationModulePermissions(): void {
    for (const moduleName of getNavigationCatalogModuleNames()) {
      const module = this.findModuleByName(moduleName);
      if (module?.id && !this.modulePermissionsCache[module.id] && !this.loadingModulePermissionsSet.has(module.id)) {
        this.loadModulePermissionsForDisplay(module);
      }
    }
  }

  loadModulePermissionsForDisplay(module: Module): void {
    if (!module.id) return;
    if (this.loadingModulePermissionsSet.has(module.id)) return;
    
    this.loadingModulePermissionsSet.add(module.id);
    this.profilService.getPermissionsForModule(module.id).subscribe({
      next: (permissions) => {
        this.modulePermissionsCache[module.id] = permissions;
        this.loadingModulePermissionsSet.delete(module.id);
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error(`Erreur chargement permissions module ${module.nom}:`, error);
        this.modulePermissionsCache[module.id] = [];
        this.loadingModulePermissionsSet.delete(module.id);
      }
    });
  }

  isModulePermissionsLoading(module: Module): boolean {
    return module.id ? this.loadingModulePermissionsSet.has(module.id) : false;
  }

  getDisplayedPermissions(module: Module): Permission[] {
    if (!module.id) return [];
    const cache = this.modulePermissionsCache[module.id] || [];
    return cache.filter(p => p.nom !== 'module_associé' && p.nom !== 'module_associe' && p.nom !== 'aucune');
  }

  getModulePermissionsCount(module: Module): number {
    if (!module.id) return 0;
    return this.getDisplayedPermissions(module).length;
  }

  hasPermission(module: Module, permission: Permission): boolean {
    return this.profilPermissions.some(pp =>
      pp.module && pp.module.id && pp.permission && pp.permission.id &&
      pp.module.id === module.id && pp.permission.id === permission.id
    );
  }

  isModuleAssociated(module: Module): boolean {
    return this.profilPermissions.some(pp => 
      pp.module?.id === module.id && pp.profil?.id === this.profil?.id
    );
  }

  togglePermission(module: Module, permission: Permission, event: Event): void {
    if (!this.profil || !module.id || !permission.id) return;
    
    const checked = (event.target as HTMLInputElement).checked;
    const existing = this.profilPermissions.find(pp =>
      pp.module && pp.module.id && pp.permission && pp.permission.id &&
      pp.profil && pp.profil.id &&
      pp.module.id === module.id && 
      pp.permission.id === permission.id &&
      pp.profil.id === this.profil.id
    );
    
    const pendingIndex = this.pendingPermissionChanges.findIndex(pc => 
      pc.moduleId === module.id && pc.permissionId === permission.id
    );
    
    if (checked && !existing) {
      if (pendingIndex >= 0) {
        this.pendingPermissionChanges.splice(pendingIndex, 1);
      } else {
        this.pendingPermissionChanges.push({
          moduleId: module.id,
          permissionId: permission.id,
          action: 'add',
          module,
          permission
        });
      }
      const tempPp: ProfilPermission = {
        id: -Date.now(),
        profil: this.profil,
        module,
        permission
      } as ProfilPermission;
      this.profilPermissions.push(tempPp);
      this.cd.detectChanges();
      
    } else if (!checked && existing) {
      if (pendingIndex >= 0) {
        this.pendingPermissionChanges.splice(pendingIndex, 1);
        if (existing.id < 0) {
          this.profilPermissions = this.profilPermissions.filter(pp => pp.id !== existing.id);
        }
      } else if (existing.id > 0) {
        this.pendingPermissionChanges.push({
          moduleId: module.id,
          permissionId: permission.id,
          action: 'remove',
          module,
          permission
        });
        this.profilPermissions = this.profilPermissions.filter(pp => pp.id !== existing.id);
      }
      this.cd.detectChanges();
    }
  }

  savePendingChanges(): void {
    if (!this.profil || !this.hasPendingChanges || this.isSavingPermissions) return;
    
    this.isSavingPermissions = true;
    const profilId = this.profil.id!;
    
    const additions = this.pendingPermissionChanges.filter(pc => pc.action === 'add');
    const removals = this.pendingPermissionChanges.filter(pc => pc.action === 'remove');
    
    let completed = 0;
    const total = additions.length + removals.length;
    let hasError = false;
    
    // Garde-fou : si rien à faire, reset immédiatement
    if (total === 0) {
      this.isSavingPermissions = false;
      return;
    }
    
    const checkComplete = () => {
      completed++;
      if (completed >= total) {
        this.isSavingPermissions = false;
        if (!hasError) {
          this.pendingPermissionChanges = [];
          this.showToast('Modifications sauvegardées avec succès', 'success');
          this.loadProfilPermissions(profilId);
        }
      }
    };
    
    const additionsByModule = new Map<number, number[]>();
    additions.forEach(pc => {
      const arr = additionsByModule.get(pc.moduleId) || [];
      arr.push(pc.permissionId);
      additionsByModule.set(pc.moduleId, arr);
    });
    
    additionsByModule.forEach((permissionIds, moduleId) => {
      this.withRetry(this.profilService.addMultiplePermissionsToProfil(profilId, moduleId, permissionIds)).subscribe({
        next: () => checkComplete(),
        error: (error) => {
          console.error('Erreur batch ajout permissions:', error);
          hasError = true;
          this.showToast(this.extractErrorMessage(error, 'Erreur lors de la sauvegarde des ajouts'), 'error');
          checkComplete();
        }
      });
    });
    
    removals.forEach(pc => {
      const existing = this.profilPermissions.find(pp => 
        pp.module?.id === pc.moduleId && pp.permission?.id === pc.permissionId && pp.id > 0
      );
      if (existing?.id) {
        this.profilService.removePermissionFromProfil(existing.id).subscribe({
          next: () => checkComplete(),
          error: (error) => {
            console.error('Erreur suppression permission:', error);
            hasError = true;
            this.showToast(this.extractErrorMessage(error, 'Erreur lors de la sauvegarde des suppressions'), 'error');
            checkComplete();
          }
        });
      } else {
        checkComplete();
      }
    });
  }

  discardPendingChanges(): void {
    if (this.profil) {
      this.loadProfilPermissions(this.profil.id!);
    }
    this.pendingPermissionChanges = [];
  }

  goBack(): void {
    if (this.hasPendingChanges) {
      const confirmed = confirm('Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter ?');
      if (!confirmed) return;
    }
    this.router.navigate(['/profils']);
  }

  // Navigation tree methods
  isNavGroupExpanded(groupKey: string): boolean {
    return this.expandedNavGroups.has(groupKey);
  }

  toggleNavGroup(groupKey: string): void {
    if (this.expandedNavGroups.has(groupKey)) {
      this.expandedNavGroups.delete(groupKey);
    } else {
      this.expandedNavGroups.add(groupKey);
    }
  }

  isSubmenuActionsExpanded(submenuKey: string): boolean {
    return this.expandedSubmenuActions.has(submenuKey);
  }

  toggleSubmenuActions(submenuKey: string, accessContext?: NavigationAccessContext): void {
    if (this.expandedSubmenuActions.has(submenuKey)) {
      this.expandedSubmenuActions.delete(submenuKey);
      return;
    }
    this.expandedSubmenuActions.add(submenuKey);
    if (accessContext) {
      this.loadModuleActionsForNavigationContext(accessContext);
    }
  }

  getNavigationContext(group: AppNavigationGroup, submenu?: AppNavigationSubmenu): NavigationAccessContext | null {
    return buildNavigationAccessContext(group, submenu);
  }

  loadModuleActionsForNavigationContext(context: NavigationAccessContext): void {
    const moduleName = context.accessModuleName;
    this.resolveModuleForName(moduleName, module => {
      this.loadModuleActionsForDisplay(moduleName, module, context);
    });
  }

  loadModuleActionsForDisplay(moduleName: string, module?: Module, accessContext?: NavigationAccessContext): void {
    if (module?.id) {
      this.loadModulePermissionsForDisplay(module);
    }
    if (Object.prototype.hasOwnProperty.call(this.moduleActionsCache, moduleName)) {
      return;
    }
    if (this.loadingModuleActionsSet.has(moduleName)) {
      return;
    }
    this.loadingModuleActionsSet.add(moduleName);
    const actionPathPrefixes = accessContext?.actionPathPrefixes;
    this.permissionService.getActionsForModule(moduleName, actionPathPrefixes).subscribe({
      next: (actions) => {
        this.moduleActionsCache[moduleName] = deduplicateModuleActions(actions || []);
        this.loadingModuleActionsSet.delete(moduleName);
        if (
          (actions || []).length === 0
          && accessContext?.usesGranularAccess
          && !this.syncingModuleActionsSet.has(moduleName)
          && !this.autoSyncedModuleActionsSet.has(moduleName)
        ) {
          this.autoSyncedModuleActionsSet.add(moduleName);
          this.syncModuleActions(moduleName, accessContext);
        }
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error(`Erreur chargement actions pour ${moduleName}:`, error);
        this.moduleActionsCache[moduleName] = [];
        this.loadingModuleActionsSet.delete(moduleName);
        this.cd.detectChanges();
      }
    });
  }

  isModuleActionsLoading(moduleName: string): boolean {
    return this.loadingModuleActionsSet.has(moduleName);
  }

  isModuleActionsSyncing(moduleName: string): boolean {
    return this.syncingModuleActionsSet.has(moduleName);
  }

  getSubmenuActionDetails(moduleName: string): ModuleActionDetail[] {
    const fromApi = this.moduleActionsCache[moduleName];
    if (fromApi?.length) {
      return fromApi;
    }
    const module = this.findModuleByName(moduleName);
    if (!module?.id) {
      return [];
    }
    return deduplicateModuleActions(
      this.getDisplayedPermissions(module)
        .filter(permission => permission.nom && permission.nom !== 'module_associé')
        .map(permission => ({
          action: normalizeActionName(permission.nom!),
          httpMethod: '',
          path: ''
        }))
    );
  }

  getFilteredSubmenuActionDetails(moduleName: string): ModuleActionDetail[] {
    const search = this.actionSearchByModule[moduleName] || '';
    return this.getSubmenuActionDetails(moduleName).filter(action => matchesActionSearch(action, search));
  }

  getGroupedSubmenuActions(moduleName: string): ActionCategoryGroup[] {
    return groupActionsByCategory(this.getFilteredSubmenuActionDetails(moduleName));
  }

  getSubmenuActionsSummary(moduleName: string): { granted: number; total: number } {
    const module = this.findModuleByName(moduleName);
    const actions = this.getSubmenuActionDetails(moduleName);
    if (!module?.id || actions.length === 0) {
      return { granted: 0, total: 0 };
    }
    const granted = actions.filter(action => this.hasActionForModuleName(moduleName, action.action)).length;
    return { granted, total: actions.length };
  }

  hasSubmenuActionsToShow(accessModuleName: string): boolean {
    return this.getSubmenuActionsSummary(accessModuleName).total > 0;
  }

  getSubmenuActionsSummaryLabel(accessModuleName: string): string {
    const summary = this.getSubmenuActionsSummary(accessModuleName);
    return `${summary.granted}/${summary.total}`;
  }

  hasUnsyncedActions(moduleName: string): boolean {
    const module = this.findModuleByName(moduleName);
    if (!module?.id) {
      return this.getSubmenuActionDetails(moduleName).length > 0;
    }
    return this.getSubmenuActionDetails(moduleName).some(
      action => !this.findPermissionForAction(module, action.action)
    );
  }

  syncModuleActions(moduleName: string, accessContext?: NavigationAccessContext): void {
    if (this.syncingModuleActionsSet.has(moduleName)) {
      return;
    }
    this.syncingModuleActionsSet.add(moduleName);
    const request$ = accessContext?.usesGranularAccess
      ? this.profilService.syncSubmenuModuleActions(
          accessContext.accessModuleName,
          accessContext.apiModuleName,
          accessContext.actionPathPrefixes
        )
      : this.profilService.syncModuleActions(moduleName);

    request$.subscribe({
      next: (result) => {
        const module = this.findModuleByName(moduleName);
        if (module?.id) {
          delete this.modulePermissionsCache[module.id];
          this.loadModulePermissionsForDisplay(module);
        }
        delete this.moduleActionsCache[moduleName];
        if (accessContext) {
          this.loadModuleActionsForNavigationContext(accessContext);
        } else {
          this.loadModuleActionsForDisplay(moduleName, module);
        }
        this.syncingModuleActionsSet.delete(moduleName);
        this.showToast(result.message || 'Actions synchronisées', 'success');
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error(`Erreur synchronisation actions ${moduleName}:`, error);
        this.syncingModuleActionsSet.delete(moduleName);
        this.showToast('Impossible de synchroniser les actions', 'error');
      }
    });
  }

  getActionSearchTerm(moduleName: string): string {
    return this.actionSearchByModule[moduleName] || '';
  }

  setActionSearchTerm(moduleName: string, value: string): void {
    this.actionSearchByModule[moduleName] = value;
  }

  clearActionSearch(moduleName: string): void {
    this.actionSearchByModule[moduleName] = '';
  }

  getActionLabel(action: string): string {
    return getActionLabel(action);
  }

  getHttpMethodClass(httpMethod: string): string {
    return getHttpMethodClass(httpMethod);
  }

  findPermissionForAction(module: Module | undefined, actionName: string): Permission | undefined {
    if (!module?.id) {
      return undefined;
    }
    const normalized = normalizeActionName(actionName);
    const fromModuleCache = (this.modulePermissionsCache[module.id] || []).find(
      permission => normalizeActionName(permission.nom || '') === normalized
    );
    if (fromModuleCache) {
      return fromModuleCache;
    }
    return this.permissions.find(
      permission => normalizeActionName(permission.nom || '') === normalized
    );
  }

  isActionAssignable(moduleName: string, actionName: string): boolean {
    const module = this.findModuleByName(moduleName);
    return !!this.findPermissionForAction(module, actionName);
  }

  hasActionForModuleName(moduleName: string, actionName: string): boolean {
    const module = this.findModuleByName(moduleName);
    const permission = module ? this.findPermissionForAction(module, actionName) : undefined;
    if (!module || !permission) {
      return false;
    }
    return this.hasPermission(module, permission);
  }

  toggleActionForModuleName(moduleName: string, actionName: string, event: Event): void {
    const module = this.findModuleByName(moduleName);
    if (!module) {
      return;
    }
    const permission = this.findPermissionForAction(module, actionName);
    if (!permission?.id) {
      this.showToast(`L'action "${this.getActionLabel(actionName)}" n'est pas encore enregistrée`, 'error');
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.togglePermission(module, permission, event);
  }

  selectAllSubmenuActions(moduleName: string): void {
    const context = findNavigationAccessContextByAccessModuleName(moduleName);
    this.ensureAllSubmenuActionsGranted(moduleName, context);
  }

  private ensureAllSubmenuActionsGranted(moduleName: string, accessContext?: NavigationAccessContext): void {
    const module = this.findModuleByName(moduleName);
    if (!module?.id || !this.profil?.id) {
      return;
    }

    const applySelection = () => {
      const permissionIds = this.getSubmenuActionDetails(moduleName)
        .map(action => this.findPermissionForAction(module, action.action))
        .filter((permission): permission is Permission => !!permission?.id && !this.hasPermission(module, permission))
        .map(permission => permission.id!);

      if (permissionIds.length === 0) {
        this.revealSubmenuActions(accessContext);
        return;
      }

      this.withRetry(
        this.profilService.addMultiplePermissionsToProfil(this.profil!.id!, module.id!, permissionIds)
      ).subscribe({
        next: (added) => {
          for (const pp of added) {
            if (!this.profilPermissions.some(existing =>
              existing.id === pp.id
              || (existing.module?.id === pp.module?.id
                && existing.permission?.id === pp.permission?.id
                && existing.profil?.id === pp.profil?.id)
            )) {
              this.profilPermissions.push(pp);
            }
          }
          this.refreshAllProfilPermissionsForProfil(this.profil!.id!);
          this.revealSubmenuActions(accessContext);
          this.cd.detectChanges();
        },
        error: (error) => {
          console.error(`Erreur sélection de toutes les actions pour ${moduleName}:`, error);
          this.loadProfilPermissions(this.profil!.id!);
        }
      });
    };

    if (this.hasUnsyncedActions(moduleName)) {
      if (this.syncingModuleActionsSet.has(moduleName)) {
        return;
      }
      this.syncingModuleActionsSet.add(moduleName);
      const request$ = accessContext?.usesGranularAccess
        ? this.profilService.syncSubmenuModuleActions(
            accessContext.accessModuleName,
            accessContext.apiModuleName,
            accessContext.actionPathPrefixes
          )
        : this.profilService.syncModuleActions(moduleName);

      request$.subscribe({
        next: () => {
          delete this.modulePermissionsCache[module.id!];
          this.loadModulePermissionsForDisplay(module);
          delete this.moduleActionsCache[moduleName];
          if (accessContext) {
            this.loadModuleActionsForNavigationContext(accessContext);
          } else {
            this.loadModuleActionsForDisplay(moduleName, module);
          }
          this.syncingModuleActionsSet.delete(moduleName);
          setTimeout(() => applySelection(), 300);
        },
        error: () => {
          this.syncingModuleActionsSet.delete(moduleName);
          this.showToast('Synchronisation requise avant la sélection', 'error');
        }
      });
      return;
    }

    applySelection();
  }

  findModuleByName(moduleName: string): Module | undefined {
    const normalized = moduleName.trim().toLowerCase();
    return this.modules.find(module => (module.nom || '').trim().toLowerCase() === normalized);
  }

  getNavGroupGrantedCount(group: AppNavigationGroup): { granted: number; total: number } {
    if (group.children?.length) {
      const granted = group.children.filter(sub => {
        const context = this.getNavigationContext(group, sub);
        return context ? this.hasSubmenuAccessGranted(context.accessModuleName) : false;
      }).length;
      return { granted, total: group.children.length };
    }
    const context = this.getNavigationContext(group);
    if (context) {
      return {
        granted: this.hasNavigationAccess(context) ? 1 : 0,
        total: 1
      };
    }
    if (group.moduleName) {
      return {
        granted: this.hasSubmenuModuleAccess(group.moduleName) ? 1 : 0,
        total: 1
      };
    }
    return { granted: 0, total: 0 };
  }

  hasGranularNavigationAccessForGroup(group: AppNavigationGroup): boolean {
    if (!groupUsesGranularSubmenuAccess(group) || !group.children?.length) {
      return false;
    }
    return group.children.some(sub => {
      const context = this.getNavigationContext(group, sub);
      return !!context?.usesGranularAccess && this.hasSubmenuAccessGranted(context.accessModuleName);
    });
  }

  hasNavigationAccess(context: NavigationAccessContext): boolean {
    return this.hasSubmenuAccessGranted(context.accessModuleName);
  }

  hasSubmenuModuleAccess(moduleName: string): boolean {
    const module = this.findModuleByName(moduleName);
    if (!module?.id || !this.profil) {
      return false;
    }
    return this.profilPermissions.some(pp =>
      pp.profil?.id === this.profil!.id
      && pp.module?.id === module.id
      && pp.permission?.nom
      && pp.permission.nom !== 'module_associé'
    );
  }

  hasSubmenuAccessGranted(moduleName: string): boolean {
    const module = this.findModuleByName(moduleName);
    if (!module?.id || !this.profil) {
      return false;
    }
    return this.profilPermissions.some(pp =>
      pp.profil?.id === this.profil!.id
      && pp.module?.id === module.id
      && !!pp.permission?.nom
    );
  }

  isSubmenuPermissionsLoading(moduleName: string): boolean {
    if (this.isModuleActionsLoading(moduleName)) {
      return true;
    }
    const module = this.findModuleByName(moduleName);
    return module ? this.isModulePermissionsLoading(module) : false;
  }

  onSubmenuAccessChange(accessModuleName: string, event: Event): void {
    if (!this.profil) {
      return;
    }
    const checked = (event.target as HTMLInputElement).checked;
    const context = findNavigationAccessContextByAccessModuleName(accessModuleName);
    this.resolveModuleForName(accessModuleName, module => {
      if (checked) {
        this.grantSubmenuAccess(module, context);
      } else {
        this.revokeSubmenuAccess(module);
      }
    });
  }

  onNavigationAccessChange(context: NavigationAccessContext, event: Event): void {
    this.onSubmenuAccessChange(context.accessModuleName, event);
  }

  onSingleMenuAccessChange(group: AppNavigationGroup, event: Event): void {
    const context = this.getNavigationContext(group);
    if (!context) {
      return;
    }
    this.onNavigationAccessChange(context, event);
  }

  private resolveModuleForName(moduleName: string, onReady: (module: Module) => void): void {
    const existing = this.findModuleByName(moduleName);
    if (existing) {
      onReady(existing);
      return;
    }
    this.profilService.createModule({ nom: moduleName }).subscribe({
      next: (created) => {
        if (!this.modules.some(module => module.id === created.id)) {
          this.modules = [...this.modules, created].sort((a, b) =>
            (a.nom || '').localeCompare(b.nom || '', 'fr')
          );
        }
        onReady(created);
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error(`Impossible de créer le module « ${moduleName} »:`, error);
        this.showToast(`Le module « ${moduleName} » est introuvable`, 'error');
      }
    });
  }

  private grantSubmenuAccess(module: Module, accessContext?: NavigationAccessContext): void {
    if (!this.profil?.id || !module.id) {
      return;
    }
    const moduleName = (module.nom || accessContext?.accessModuleName || '').trim();
    if (!moduleName) {
      return;
    }
    this.ensureModuleAssociationMarker(module);
  }

  private ensureModuleAssociationMarker(module: Module): void {
    if (!this.profil?.id || !module.id || this.isModuleAssociated(module)) {
      return;
    }
    const marker = this.permissions.find(p =>
      p.nom === 'module_associé' || p.nom === 'aucune' || p.nom === 'module_associe'
    );
    if (!marker?.id) {
      return;
    }
    this.withRetry(
      this.profilService.addPermissionToProfil(this.profil.id, module.id, marker.id)
    ).subscribe({
      next: (pp) => {
        if (!this.profilPermissions.some(existing => existing.id === pp.id)) {
          this.profilPermissions.push(pp);
        }
        this.cd.detectChanges();
      },
      error: (error) => console.error('Association navigation sous-menu:', error)
    });
  }

  private revokeSubmenuAccess(module: Module): void {
    if (!module.id) {
      return;
    }
    const context = findNavigationAccessContextByAccessModuleName((module.nom || '').trim());
    if (context?.key) {
      this.expandedSubmenuActions.delete(context.key);
    }
    this.deselectAllPermissions(module);
  }

  togglePermissionForModuleName(moduleName: string, permission: Permission, event: Event): void {
    const module = this.findModuleByName(moduleName);
    if (!module) {
      return;
    }
    this.togglePermission(module, permission, event);
  }

  hasPermissionForModuleName(moduleName: string, permission: Permission): boolean {
    const module = this.findModuleByName(moduleName);
    if (!module) {
      return false;
    }
    return this.hasPermission(module, permission);
  }

  deselectAllSubmenuActions(moduleName: string): void {
    const module = this.findModuleByName(moduleName);
    if (module) {
      this.deselectAllPermissions(module);
    }
  }

  trackNavGroup(_index: number, group: AppNavigationGroup): string {
    return group.key;
  }

  trackNavSubmenu(_index: number, submenu: AppNavigationSubmenu): string {
    return submenu.key;
  }

  private submenuMatchesNavSearch(submenu: AppNavigationSubmenu, query: string): boolean {
    if (!query) {
      return true;
    }
    const normalized = query.toLowerCase();
    return submenu.label.toLowerCase().includes(normalized)
      || submenu.moduleName.toLowerCase().includes(normalized)
      || submenu.route.toLowerCase().includes(normalized);
  }

  getGrantedSubmenusForGroup(group: AppNavigationGroup): AppNavigationSubmenu[] {
    if (!group.children?.length) {
      return [];
    }
    const query = this.navMenuSearch.trim();
    return group.children.filter(sub => {
      const context = this.getNavigationContext(group, sub);
      if (!context || !this.hasNavigationAccess(context)) {
        return false;
      }
      return this.submenuMatchesNavSearch(sub, query);
    });
  }

  getUngrantedSubmenusForGroup(group: AppNavigationGroup): AppNavigationSubmenu[] {
    if (!group.children?.length) {
      return [];
    }
    const query = this.navMenuSearch.trim();
    return group.children.filter(sub => {
      const context = this.getNavigationContext(group, sub);
      if (!context || this.hasNavigationAccess(context)) {
        return false;
      }
      return this.submenuMatchesNavSearch(sub, query);
    });
  }

  isInactiveSubmenusVisible(groupKey: string): boolean {
    return this.expandedInactiveSubmenuGroups.has(groupKey) || !!this.navMenuSearch.trim();
  }

  toggleInactiveSubmenus(groupKey: string): void {
    if (this.expandedInactiveSubmenuGroups.has(groupKey)) {
      this.expandedInactiveSubmenuGroups.delete(groupKey);
    } else {
      this.expandedInactiveSubmenuGroups.add(groupKey);
    }
  }

  hasGrantedStandaloneMenu(group: AppNavigationGroup): boolean {
    if (group.children?.length) {
      return false;
    }
    const context = this.getNavigationContext(group);
    return !!context && this.hasNavigationAccess(context);
  }

  hasUngrantedStandaloneMenu(group: AppNavigationGroup): boolean {
    if (group.children?.length || !group.moduleName) {
      return false;
    }
    const context = this.getNavigationContext(group);
    return !!context && !this.hasNavigationAccess(context);
  }

  private revealSubmenuActions(context?: NavigationAccessContext): void {
    if (!context?.key) {
      return;
    }
    this.expandedSubmenuActions.add(context.key);
    this.loadModuleActionsForNavigationContext(context);
    this.cd.detectChanges();
  }

  get filteredNavigationCatalog(): AppNavigationGroup[] {
    const query = this.navMenuSearch.trim().toLowerCase();
    if (!query) {
      return this.navigationCatalog;
    }
    return this.navigationCatalog
      .map(group => {
        const groupMatch =
          group.label.toLowerCase().includes(query)
          || (group.moduleName || '').toLowerCase().includes(query);
        if (groupMatch) {
          return group;
        }
        const children = group.children?.filter(sub =>
          sub.label.toLowerCase().includes(query)
          || sub.moduleName.toLowerCase().includes(query)
          || sub.route.toLowerCase().includes(query)
        );
        if (children?.length) {
          return { ...group, children };
        }
        return null;
      })
      .filter((group): group is AppNavigationGroup => group !== null);
  }

  get totalNavAccessStats(): { granted: number; total: number } {
    let granted = 0;
    let total = 0;
    for (const group of this.navigationCatalog) {
      const stats = this.getNavGroupGrantedCount(group);
      granted += stats.granted;
      total += stats.total;
    }
    return { granted, total };
  }

  get totalNavAccessPercent(): number {
    const { granted, total } = this.totalNavAccessStats;
    if (total === 0) {
      return 0;
    }
    return Math.round((granted / total) * 100);
  }

  getNavGroupProgressPercent(group: AppNavigationGroup): number {
    const { granted, total } = this.getNavGroupGrantedCount(group);
    if (total === 0) {
      return 0;
    }
    return Math.round((granted / total) * 100);
  }

  getNavGroupStatusClass(group: AppNavigationGroup): string {
    const { granted, total } = this.getNavGroupGrantedCount(group);
    if (total === 0 || granted === 0) {
      return 'status-none';
    }
    if (granted >= total) {
      return 'status-full';
    }
    return 'status-partial';
  }

  onNavMenuSearchChange(): void {
    if (!this.navMenuSearch.trim()) {
      return;
    }
    for (const group of this.filteredNavigationCatalog) {
      this.expandedNavGroups.add(group.key);
    }
  }

  clearNavMenuSearch(): void {
    this.navMenuSearch = '';
  }

  expandAllNavGroups(): void {
    for (const group of this.filteredNavigationCatalog) {
      this.expandedNavGroups.add(group.key);
    }
  }

  collapseAllNavGroups(): void {
    for (const group of this.filteredNavigationCatalog) {
      this.expandedNavGroups.delete(group.key);
    }
  }

  collapseAllSubmenuActions(): void {
    this.expandedSubmenuActions.clear();
  }

  getAssociatedModules(): Module[] {
    if (!this.profil) return [];
    const pps = this.profilPermissions.filter(
      pp => pp.profil && pp.profil.id === this.profil!.id && pp.module && pp.module.id
    );
    const associatedModuleIds = new Set(pps.map(pp => pp.module!.id!));
    const fromModules = this.modules.filter(m => m.id && associatedModuleIds.has(m.id));
    if (fromModules.length > 0) return fromModules;
    const seen = new Set<number>();
    return pps
      .map(pp => pp.module!)
      .filter(m => {
        if (!m.id || seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
  }

  getAssociatedModulesForProfil(profil: Profil): Module[] {
    const pps = this.allProfilPermissions.filter(
      pp => pp.profil && pp.profil.id === profil.id && pp.module && pp.module.id
    );
    const associatedModuleIds = new Set(pps.map(pp => pp.module!.id!));
    const fromModules = this.modules.filter(m => m.id && associatedModuleIds.has(m.id));
    if (fromModules.length > 0) return fromModules;
    const seen = new Set<number>();
    return pps
      .map(pp => pp.module!)
      .filter(m => {
        if (!m.id || seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
  }

  selectAllPermissions(module: Module) {
    if (!this.profil || !module || !module.id) return;
    const toAdd = this.modulePermissionsCache[module.id];
    if (!toAdd || toAdd.length === 0) {
      this.profilService.getPermissionsForModule(module.id).subscribe(permissions => {
        this.modulePermissionsCache[module.id] = permissions;
        this.cd.detectChanges();
        this.selectAllPermissions(module);
      });
      return;
    }
    toAdd.forEach(permission => {
      if (!this.hasPermission(module, permission) && permission.id) {
        const mockEvent = { target: { checked: true } } as unknown as Event;
        this.togglePermission(module, permission, mockEvent);
      }
    });
  }

  deselectAllPermissions(module: Module) {
    if (!module || !module.id) return;
    const modulePermissions = this.profilPermissions.filter(pp => pp.module && pp.module.id === module.id);
    
    modulePermissions.forEach(pp => {
      if (pp.permission?.id && pp.id > 0) {
        const mockEvent = { target: { checked: false } } as unknown as Event;
        this.togglePermission(module, pp.permission, mockEvent);
      } else if (pp.id < 0) {
        const pendingIndex = this.pendingPermissionChanges.findIndex(pc => 
          pc.moduleId === module.id && pc.permissionId === pp.permission?.id
        );
        if (pendingIndex >= 0) {
          this.pendingPermissionChanges.splice(pendingIndex, 1);
        }
        this.profilPermissions = this.profilPermissions.filter(p => p.id !== pp.id);
        this.cd.detectChanges();
      }
    });
  }

  refreshAllProfilPermissionsForProfil(profilId: number): void {
    this.withRetry(this.profilService.getProfilPermissions(profilId)).subscribe({
      next: (pp) => {
        this.allProfilPermissions = this.allProfilPermissions.filter(existing =>
          !(existing.profil && existing.profil.id === profilId)
        );
        this.allProfilPermissions.push(...pp);
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error('Erreur rafraîchissement permissions:', error);
      }
    });
  }

  private withRetry<T>(obs: Observable<T>, maxRetries = 3, delayMs = 500): Observable<T> {
    return obs.pipe(
      retryWhen(errors =>
        errors.pipe(
          mergeMap((error, i) => {
            if (i >= maxRetries) return throwError(() => error);
            return timer(delayMs * Math.pow(2, i));
          })
        )
      )
    );
  }

  private showToast(message: string, type: ToastType = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const httpError = error as HttpErrorResponse;
    let message = fallback;
    if (httpError?.error) {
      if (typeof httpError.error === 'string') {
        message = httpError.error;
      } else if (httpError.error.error) {
        message = String(httpError.error.error);
      } else if (httpError.error.message) {
        message = String(httpError.error.message);
      }
    } else if (httpError?.message) {
      message = httpError.message;
    }
    return message;
  }

  // Pays management
  openPaysModal(profil: Profil): void {
    this.selectedProfilForPays = profil;
    this.loadAllProfilPays();
    this.showPaysModal = true;
  }

  closePaysModal(): void {
    this.showPaysModal = false;
    this.selectedProfilForPays = null;
  }

  isPaysAssociated(paysCode: string): boolean {
    if (!this.selectedProfilForPays) return false;
    return this.profilPays.some(pp => pp.profil?.id === this.selectedProfilForPays!.id && pp.pays?.code === paysCode);
  }

  togglePaysAssociation(paysCode: string, event: Event): void {
    if (!this.selectedProfilForPays) return;
    const checked = (event.target as HTMLInputElement).checked;
    const pays = this.pays.find(p => p.code === paysCode);
    if (!pays?.id) return;
    
    if (checked) {
      this.paysService.associatePaysToProfil(this.selectedProfilForPays.id!, pays.id).subscribe({
        next: () => this.loadAllProfilPays(),
        error: (err) => {
          console.error('Erreur association pays:', err);
          this.showToast('Erreur lors de l\'association du pays', 'error');
          (event.target as HTMLInputElement).checked = false;
        }
      });
    } else {
      this.paysService.disassociatePaysFromProfil(this.selectedProfilForPays.id!, pays.id).subscribe({
        next: () => this.loadAllProfilPays(),
        error: (err) => {
          console.error('Erreur dissociation pays:', err);
          this.showToast('Erreur lors de la dissociation du pays', 'error');
          (event.target as HTMLInputElement).checked = true;
        }
      });
    }
  }

  getProfilPaysLabel(): string {
    if (!this.selectedProfilForPays) return '';
    const count = this.profilPays.filter(pp => pp.profil?.id === this.selectedProfilForPays!.id).length;
    if (count === 0) return 'Aucun pays';
    if (count === this.pays.length) return 'Tous les pays';
    const codes = this.profilPays
      .filter(pp => pp.profil?.id === this.selectedProfilForPays!.id)
      .map(pp => pp.pays?.code)
      .filter((c): c is string => !!c)
      .join(', ');
    return codes.length > 50 ? codes.substring(0, 50) + '...' : codes;
  }

  get profilPaysCount(): number {
    return this.profilPays.filter(pp => pp.profil?.id === this.profil?.id).length;
  }

  hasAnyPermission(module: Module): boolean {
    if (!module || !module.id) return false;
    return this.profilPermissions.some(pp =>
      pp.module && pp.module.id === module.id && pp.permission && pp.permission.id
    );
  }

  hasAllPermissions(module: Module): boolean {
    if (!module || !module.id) return false;
    const displayed = this.modulePermissionsCache[module.id] || [];
    if (displayed.length === 0) return false;
    return displayed.every(p => this.hasPermission(module, p));
  }

  // Utility for template
  get hasProfil(): boolean {
    return !!this.profil;
  }
}