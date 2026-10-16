import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, catchError, of, switchMap } from 'rxjs';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

interface ModuleItem {
  moduleId: number;
  nom: string;
  parent: string | null;
  visible: boolean;
  actif: boolean;
}

interface EntrepriseModules {
  entrepriseId: number;
  code: string;
  nom: string;
  modulesActives: number;
  modules: ModuleItem[];
}

interface EntrepriseOption {
  id: number;
  code: string;
  nom: string;
}

interface UpdateModulesRequest {
  activeModuleIds: number[];
}

@Component({
  selector: 'app-platform-modules',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './platform-modules.component.html',
  styleUrls: ['./platform-modules.component.scss']
})
export class PlatformModulesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  entrepriseId: number | null = null;
  entreprise: EntrepriseModules | null = null;
  entreprises: EntrepriseOption[] = [];
  loading = false;
  saving = false;
  error: string | null = null;
  searchText = '';
  showOnlyActive = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private appState: AppStateService,
    private popup: PopupService
  ) {}

  ngOnInit(): void {
    if (!this.appState.isSuperAdmin()) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadEntreprises();
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params['entrepriseId'];
      if (id) {
        this.entrepriseId = +id;
        this.loadEntrepriseModules();
      } else {
        this.entrepriseId = null;
        this.entreprise = null;
        this.selectDefaultEntreprise();
      }
    });
  }

  private loadEntreprises(): void {
    this.http.get<EntrepriseOption[]>('/api/platform/entreprises', this.getAuthHeaders())
      .pipe(takeUntil(this.destroy$), catchError(() => of([] as EntrepriseOption[])))
      .subscribe(list => {
        this.entreprises = list ?? [];
        this.selectDefaultEntreprise();
      });
  }

  private selectDefaultEntreprise(): void {
    if (!this.entrepriseId && this.entreprises.length) {
      this.onEntrepriseChange(this.entreprises[0].id, true);
    }
  }

  onEntrepriseChange(id: number | string | null, replaceUrl = false): void {
    if (!id) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { entrepriseId: +id },
      replaceUrl
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEntrepriseModules(): void {
    if (!this.entrepriseId) return;
    this.loading = true;
    this.error = null;
    this.http.get<any>(`/api/platform/entreprises/${this.entrepriseId}/modules`, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          this.error = this.apiMessage(err, 'PLT.mod.errLoad');
          return of(null);
        })
      )
      .subscribe(response => {
        this.loading = false;
        if (response) {
          this.entreprise = response;
        }
      });
  }

  private getAuthHeaders(): { withCredentials: true } {
    return { withCredentials: true };
  }

  private apiMessage(err: any, fallbackKey: string): string {
    return err?.error?.message || err?.error?.error || I18nService.t(fallbackKey);
  }

  saveModules(): void {
    if (!this.entrepriseId || !this.entreprise) return;
    this.saving = true;
    const activeModuleIds = this.entreprise.modules
      .filter(m => m.actif)
      .map(m => m.moduleId);
    const request: UpdateModulesRequest = { activeModuleIds };
    this.http.put<any>(`/api/platform/entreprises/${this.entrepriseId}/modules`, request, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.saving = false;
          const message = this.apiMessage(err, 'PLT.mod.errSave');
          this.error = message;
          this.popup.showError(message);
          this.loadEntrepriseModules(); // Recharger pour annuler les changements locaux
          return of(null);
        })
      )
      .subscribe(response => {
        this.saving = false;
        if (response) {
          this.popup.showSuccess(I18nService.t('PLT.mod.okSave', { active: response.activees, inactive: response.desactivees }), I18nService.t('PLT.mod.okSaveTitle'));
          this.entreprise = response;
        }
      });
  }

  toggleModule(module: ModuleItem): void {
    module.actif = !module.actif;
  }

  filteredModules(): ModuleItem[] {
    if (!this.entreprise) return [];
    let modules = this.entreprise.modules;
    if (this.showOnlyActive) {
      modules = modules.filter(m => m.actif);
    }
    if (this.searchText.trim()) {
      const search = this.searchText.toLowerCase().trim();
      modules = modules.filter(m =>
        m.nom.toLowerCase().includes(search) ||
        (m.parent?.toLowerCase().includes(search) ?? false)
      );
    }
    return modules;
  }

  isParent(module: ModuleItem): boolean {
    return !module.parent;
  }

  trackByModuleId(index: number, module: ModuleItem): number {
    return module.moduleId;
  }

  get parents(): ModuleItem[] {
    const visible = this.filteredModules();
    return (this.entreprise?.modules ?? []).filter(m =>
      this.isParent(m) && (visible.includes(m) || visible.some(c => c.parent === m.nom))
    );
  }

  get standaloneModules(): ModuleItem[] {
    const parentNames = new Set((this.entreprise?.modules ?? []).filter(m => this.isParent(m)).map(m => m.nom));
    return this.filteredModules().filter(m => !this.isParent(m) && !parentNames.has(m.parent!));
  }

  getChildren(parent: ModuleItem): ModuleItem[] {
    return this.filteredModules().filter(m => m.parent === parent.nom);
  }

  getAllChildren(parent: ModuleItem): ModuleItem[] {
    return this.entreprise?.modules.filter(m => m.parent === parent.nom) ?? [];
  }

  getChildrenCount(parent: ModuleItem): number {
    return this.getAllChildren(parent).length;
  }

  getActiveChildrenCount(parent: ModuleItem): number {
    return this.getAllChildren(parent).filter(c => c.actif).length;
  }

  get totalCount(): number {
    return this.entreprise?.modules.length ?? 0;
  }

  get activeCount(): number {
    return this.entreprise?.modules.filter(m => m.actif).length ?? 0;
  }

  checkAllChildren(parent: ModuleItem, checked: boolean): void {
    const children = this.getAllChildren(parent);
    children.forEach(child => child.actif = checked);
  }

  goBack(): void {
    this.router.navigate(['/platform/entreprises']);
  }
}