import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, takeUntil, finalize } from 'rxjs';
import { PopupService } from '../../services/popup.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import {
  CALCULATION_MODULE_LABELS,
  CALCULATION_SUBMODULE_LABELS,
  CALCULATION_VARIABLES,
  CalculationFormulaTerm,
  CalculationRule,
  CalculationRuleType
} from '../../models/calculation-rule.model';

interface RuleForm {
  id?: number;
  code: string;
  module: string;
  sousModule: string;
  libelle: string;
  description: string;
  type: CalculationRuleType;
  terms: CalculationFormulaTerm[];
  values: string[];
  valeur: number | null;
  unite: string;
  ordre: number;
  actif: boolean;
  systeme: boolean;
}

interface SubModuleGroup {
  code: string;
  label: string;
  rules: CalculationRule[];
}

interface ModuleGroup {
  module: string;
  label: string;
  sousModules: SubModuleGroup[];
}

interface FormulaPart {
  kind: 'op' | 'var';
  text: string;
}

@Component({
  selector: 'app-configuration-calcul',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-calcul.component.html',
  styleUrls: ['./configuration-calcul.component.scss']
})
export class ConfigurationCalculComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  rules: CalculationRule[] = [];
  groups: ModuleGroup[] = [];
  searchTerm = '';
  moduleFilter = '';
  subModuleFilter = '';
  availableSubModules: { code: string; label: string }[] = [];
  typeFilter: '' | CalculationRuleType = '';
  collapsed: Record<string, boolean> = {};

  loading = false;
  saving = false;

  showModal = false;
  isNew = false;

  readonly moduleOptions = Object.keys(CALCULATION_MODULE_LABELS);
  readonly subModuleOptions = Object.keys(CALCULATION_SUBMODULE_LABELS);
  readonly types: CalculationRuleType[] = ['FORMULE', 'LISTE', 'PARAMETRE'];
  readonly variables = CALCULATION_VARIABLES;

  form: RuleForm = this.emptyForm();

  constructor(
    private calculService: ConfigurationCalculService,
    private popupService: PopupService,
    private translate: TranslateService,
    private location: Location,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const requested = this.route.snapshot.queryParamMap.get('module');
    this.moduleFilter = (requested && this.moduleOptions.includes(requested))
      ? requested
      : (this.moduleOptions[0] || '');
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ------------------------------------------------------------------
  // Chargement / groupement
  // ------------------------------------------------------------------

  load(): void {
    this.loading = true;
    this.calculService.list().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: rules => {
        this.rules = rules || [];
        this.calculService.loadRules(true).subscribe();
        this.refreshSubModuleOptions();
        this.buildGroups();
      },
      error: err => {
        console.error('Erreur chargement règles de calcul:', err);
        this.popupService.showError(this.t('CFG.calcul.loadError', 'Erreur lors du chargement des règles de calcul'));
      }
    });
  }

  buildGroups(): void {
    const term = this.searchTerm.toLowerCase().trim();
    const filtered = this.rules.filter(r => {
      if (this.moduleFilter && r.module !== this.moduleFilter) {
        return false;
      }
      if (this.subModuleFilter && (r.sousModule || '') !== this.subModuleFilter) {
        return false;
      }
      if (this.typeFilter && r.type !== this.typeFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (r.code || '').toLowerCase().includes(term)
        || (r.libelle || '').toLowerCase().includes(term)
        || (r.description || '').toLowerCase().includes(term)
        || (r.sousModule || '').toLowerCase().includes(term);
    });

    const modules = new Map<string, ModuleGroup>();
    for (const rule of filtered) {
      const moduleKey = rule.module;
      if (!modules.has(moduleKey)) {
        modules.set(moduleKey, {
          module: moduleKey,
          label: CALCULATION_MODULE_LABELS[moduleKey] || moduleKey,
          sousModules: []
        });
      }
      const group = modules.get(moduleKey)!;
      const subKey = rule.sousModule || 'AUTRE';
      let sub = group.sousModules.find(s => s.code === subKey);
      if (!sub) {
        sub = { code: subKey, label: CALCULATION_SUBMODULE_LABELS[subKey] || subKey, rules: [] };
        group.sousModules.push(sub);
      }
      sub.rules.push(rule);
    }

    this.groups = [...modules.values()];
    this.cdr.markForCheck();
  }

  onFilterChange(): void {
    this.buildGroups();
  }

  onModuleChange(): void {
    this.subModuleFilter = '';
    this.refreshSubModuleOptions();
    this.buildGroups();
  }

  onSubModuleChange(): void {
    this.buildGroups();
  }

  setTypeFilter(type: '' | CalculationRuleType): void {
    this.typeFilter = type;
    this.buildGroups();
  }

  typeCount(type: '' | CalculationRuleType): number {
    return this.rules.filter(r => !type || r.type === type).length;
  }

  groupKey(group: ModuleGroup, sub: SubModuleGroup): string {
    return `${group.module}::${sub.code}`;
  }

  isClosed(key: string): boolean {
    return !!this.collapsed[key];
  }

  toggleGroup(key: string): void {
    this.collapsed[key] = !this.collapsed[key];
  }

  get displayedCount(): number {
    return this.groups.reduce(
      (total, group) => total + group.sousModules.reduce((n, sub) => n + sub.rules.length, 0),
      0
    );
  }

  get activeCount(): number {
    return this.groups.reduce(
      (total, group) => total + group.sousModules.reduce(
        (n, sub) => n + sub.rules.filter(rule => rule.actif !== false).length,
        0
      ),
      0
    );
  }

  close(): void {
    this.location.back();
  }

  moduleLabel(moduleKey: string): string {
    return CALCULATION_MODULE_LABELS[moduleKey] || moduleKey;
  }

  subModuleLabel(subKey: string): string {
    return CALCULATION_SUBMODULE_LABELS[subKey] || subKey;
  }

  private refreshSubModuleOptions(): void {
    const source = this.rules.filter(r => !this.moduleFilter || r.module === this.moduleFilter);
    const seen = new Map<string, string>();
    for (const rule of source) {
      const key = rule.sousModule || '';
      if (key && !seen.has(key)) {
        seen.set(key, CALCULATION_SUBMODULE_LABELS[key] || key);
      }
    }
    this.availableSubModules = [...seen.entries()].map(([code, label]) => ({ code, label }));
  }

  // ------------------------------------------------------------------
  // Modale création / édition
  // ------------------------------------------------------------------

  openCreate(): void {
    this.isNew = true;
    this.form = this.emptyForm();
    this.showModal = true;
  }

  openEdit(rule: CalculationRule): void {
    this.isNew = false;
    this.form = {
      id: rule.id,
      code: rule.code,
      module: rule.module,
      sousModule: rule.sousModule || '',
      libelle: rule.libelle,
      description: rule.description || '',
      type: rule.type,
      terms: this.calculService.parseTerms(rule.expression),
      values: this.calculService.parseValues(rule.valeurs),
      valeur: rule.valeur != null ? rule.valeur : null,
      unite: rule.unite || '',
      ordre: rule.ordre != null ? rule.ordre : 0,
      actif: rule.actif !== false,
      systeme: !!rule.systeme
    };
    if (this.form.type === 'FORMULE' && this.form.terms.length === 0) {
      this.addTerm();
    }
    if (this.form.type === 'LISTE' && this.form.values.length === 0) {
      this.addValue();
    }
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  onTypeChange(): void {
    if (this.form.type === 'FORMULE' && this.form.terms.length === 0) {
      this.addTerm();
    }
    if (this.form.type === 'LISTE' && this.form.values.length === 0) {
      this.addValue();
    }
  }

  get formulaVariables() {
    const module = this.form?.module;
    const forModule = this.variables.filter(v => !module || v.module === module);
    return forModule.length ? forModule : this.variables;
  }

  addTerm(): void {
    this.form.terms.push({ signe: '+', coefficient: 1, variable: this.formulaVariables[0]?.code || '', absolue: false });
  }

  removeTerm(index: number): void {
    this.form.terms.splice(index, 1);
  }

  addValue(): void {
    this.form.values.push('');
  }

  removeValue(index: number): void {
    this.form.values.splice(index, 1);
  }

  save(): void {
    if (!this.validateForm()) {
      return;
    }
    const payload: CalculationRule = {
      code: this.form.code.trim(),
      module: this.form.module,
      sousModule: this.form.sousModule?.trim() || null as any,
      libelle: this.form.libelle.trim(),
      description: this.form.description?.trim() || null as any,
      type: this.form.type,
      expression: this.form.type === 'FORMULE' ? this.calculService.serializeTerms(this.form.terms) : null as any,
      valeurs: this.form.type === 'LISTE' ? this.calculService.serializeValues(this.form.values) : null as any,
      valeur: this.form.type === 'PARAMETRE' ? Number(this.form.valeur) : null as any,
      unite: this.form.unite?.trim() || null as any,
      ordre: Number(this.form.ordre) || 0,
      actif: this.form.actif
    };

    this.saving = true;
    const request$ = this.isNew
      ? this.calculService.create(payload)
      : this.calculService.update(this.form.id!, payload);

    request$.pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.saving = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: () => {
        this.showModal = false;
        this.popupService.showSuccess(this.t('CFG.calcul.saveSuccess', 'Règle enregistrée avec succès'));
        this.load();
      },
      error: err => {
        console.error('Erreur sauvegarde règle:', err);
        const msg = err?.error?.message || err?.error || this.t('CFG.calcul.saveError', 'Erreur lors de l\'enregistrement');
        this.popupService.showError(String(msg));
      }
    });
  }

  private validateForm(): boolean {
    if (!this.form.libelle?.trim()) {
      this.popupService.showWarning(this.t('CFG.calcul.validLabel', 'Le libellé est obligatoire'));
      return false;
    }
    if (this.isNew && !this.form.code?.trim()) {
      this.popupService.showWarning(this.t('CFG.calcul.validCode', 'Le code est obligatoire'));
      return false;
    }
    if (this.form.type === 'FORMULE' && this.form.terms.filter(t => !!t.variable).length === 0) {
      this.popupService.showWarning(this.t('CFG.calcul.validFormula', 'Ajoutez au moins un terme à la formule'));
      return false;
    }
    if (this.form.type === 'LISTE' && this.form.values.filter(v => !!v && v.trim()).length === 0) {
      this.popupService.showWarning(this.t('CFG.calcul.validList', 'Ajoutez au moins une valeur'));
      return false;
    }
    if (this.form.type === 'PARAMETRE' && (this.form.valeur === null || this.form.valeur === undefined || isNaN(Number(this.form.valeur)))) {
      this.popupService.showWarning(this.t('CFG.calcul.validValue', 'Renseignez une valeur numérique'));
      return false;
    }
    return true;
  }

  toggleActif(rule: CalculationRule): void {
    const updated: CalculationRule = { ...rule, actif: rule.actif === false };
    this.calculService.update(rule.id!, updated).pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        rule.actif = saved.actif;
        this.calculService.loadRules(true).subscribe();
        this.cdr.markForCheck();
      },
      error: err => {
        console.error('Erreur mise à jour statut:', err);
        rule.actif = !rule.actif;
        this.popupService.showError(this.t('CFG.calcul.saveError', 'Erreur lors de l\'enregistrement'));
        this.cdr.markForCheck();
      }
    });
  }

  confirmDelete(rule: CalculationRule): void {
    if (rule.systeme) {
      this.popupService.showWarning(this.t('CFG.calcul.systemLocked', 'Une règle système ne peut pas être supprimée ; désactivez-la à la place.'));
      return;
    }
    this.popupService.showConfirm(
      this.t('CFG.calcul.deleteConfirm', 'Supprimer définitivement cette règle de calcul ?'),
      this.t('CFG.calcul.deleteTitle', 'Suppression')
    ).then(confirmed => {
      if (!confirmed || rule.id == null) {
        return;
      }
      this.calculService.delete(rule.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.popupService.showSuccess(this.t('CFG.calcul.deleteSuccess', 'Règle supprimée'));
          this.load();
        },
        error: err => {
          console.error('Erreur suppression règle:', err);
          this.popupService.showError(this.t('CFG.calcul.deleteError', 'Erreur lors de la suppression'));
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // Affichage
  // ------------------------------------------------------------------

  formulaPreview(rule: CalculationRule): string {
    const terms = this.calculService.parseTerms(rule.expression);
    if (!terms.length) {
      return '—';
    }
    return terms.map((term, index) => {
      const variable = CALCULATION_VARIABLES.find(v => v.code === term.variable)?.code || term.variable;
      const abs = term.absolue ? `|${variable}|` : variable;
      const coef = term.coefficient !== 1 ? `${term.coefficient}×` : '';
      const termStr = `${coef}${abs}`;
      if (index === 0) {
        return term.signe === '-' ? `−${termStr}` : termStr;
      }
      return term.signe === '-' ? ` − ${termStr}` : ` + ${termStr}`;
    }).join('');
  }

  formulaParts(rule: CalculationRule): FormulaPart[] {
    const terms = this.calculService.parseTerms(rule.expression);
    const parts: FormulaPart[] = [];
    terms.forEach((term, index) => {
      const variable = term.variable || '';
      const abs = term.absolue ? `|${variable}|` : variable;
      const coef = term.coefficient !== 1 ? `${term.coefficient}×` : '';
      if (index > 0 || term.signe === '-') {
        parts.push({ kind: 'op', text: term.signe === '-' ? '−' : '+' });
      }
      parts.push({ kind: 'var', text: `${coef}${abs}` });
    });
    return parts;
  }

  listPreview(rule: CalculationRule): string[] {
    return this.calculService.parseValues(rule.valeurs);
  }

  typeLabel(type: CalculationRuleType): string {
    switch (type) {
      case 'FORMULE': return this.t('CFG.calcul.typeFormule', 'Formule');
      case 'LISTE': return this.t('CFG.calcul.typeListe', 'Liste de valeurs');
      case 'PARAMETRE': return this.t('CFG.calcul.typeParametre', 'Paramètre');
      default: return type;
    }
  }

  trackByRule(_index: number, rule: CalculationRule): number | string {
    return rule.id ?? rule.code;
  }

  private emptyForm(): RuleForm {
    return {
      code: '',
      module: this.moduleOptions[0],
      sousModule: '',
      libelle: '',
      description: '',
      type: 'FORMULE',
      terms: [{ signe: '+', coefficient: 1, variable: this.formulaVariables[0]?.code || '', absolue: false }],
      values: [''],
      valeur: null,
      unite: '',
      ordre: 0,
      actif: true,
      systeme: false
    };
  }

  private t(key: string, fallback: string): string {
    const value = this.translate.instant(key);
    return value && value !== key ? value : fallback;
  }
}
