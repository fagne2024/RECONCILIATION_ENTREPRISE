import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  TopUsersConfig,
  TopUsersCategoryConfig,
  TopUsersConfigService,
  TopUserLevel,
  DEFAULT_TOP_USERS_CONFIG,
  MAX_TOP_USERS,
  MAX_TOP_USERS_CATEGORIES,
  MIN_TOP_USERS,
  KNOWN_AUDIT_EVENTS,
  KNOWN_TOP_USER_LEVELS,
  BUILTIN_CATEGORY_KEYS,
  cloneTopUsersConfig
} from '../../services/top-users-config.service';
import { PopupService } from '../../services/popup.service';

/**
 * Configuration > Top utilisateurs.
 *
 * <p>Règle l'affichage du bloc « Top des utilisateurs » en tête de l'écran
 * « État des réconciliations » : activation, nombre d'utilisateurs par
 * catégorie, affichage de la variation, et liste libre des catégories
 * (ajout / suppression / libellés / critères d'audit).</p>
 */
@Component({
  selector: 'app-configuration-top-users',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-top-users.component.html',
  styleUrls: ['./configuration-top-users.component.scss']
})
export class ConfigurationTopUsersComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  config: TopUsersConfig = cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG);
  savedConfig: TopUsersConfig = cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG);

  readonly minTopN = MIN_TOP_USERS;
  readonly maxTopN = MAX_TOP_USERS;
  readonly maxCategories = MAX_TOP_USERS_CATEGORIES;
  readonly topNOptions: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly knownEvents = KNOWN_AUDIT_EVENTS;
  readonly knownLevels = KNOWN_TOP_USER_LEVELS;

  loading = false;
  saving = false;

  constructor(
    private topUsersConfigService: TopUsersConfigService,
    private popupService: PopupService,
    private translate: TranslateService,
    private location: Location,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get dirty(): boolean {
    return JSON.stringify(this.config) !== JSON.stringify(this.savedConfig);
  }

  get anyCategoryEnabled(): boolean {
    return this.config.categories.some(c => c.enabled);
  }

  get canAddCategory(): boolean {
    return this.config.categories.length < this.maxCategories;
  }

  trackByCategoryId = (index: number, item: TopUsersCategoryConfig): string => item?.id ?? String(index);

  load(): void {
    this.loading = true;
    this.topUsersConfigService.load(true).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: config => {
        this.config = cloneTopUsersConfig(config);
        this.savedConfig = cloneTopUsersConfig(config);
      },
      error: err => {
        console.error('Erreur chargement configuration Top utilisateurs:', err);
        this.popupService.showError(this.t('CFG.topUsers.loadError', 'Erreur lors du chargement de la configuration'));
      }
    });
  }

  save(): void {
    if (!this.anyCategoryEnabled) {
      this.popupService.showWarning(this.t('CFG.topUsers.noCategory', 'Sélectionnez au moins une catégorie à afficher.'));
      return;
    }
    this.saving = true;
    this.topUsersConfigService.save(this.config).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.saving = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: config => {
        this.config = cloneTopUsersConfig(config);
        this.savedConfig = cloneTopUsersConfig(config);
        this.popupService.showSuccess(this.t('CFG.topUsers.saveSuccess', 'Configuration enregistrée avec succès.'));
      },
      error: err => {
        console.error('Erreur enregistrement configuration Top utilisateurs:', err);
        this.popupService.showError(this.t('CFG.topUsers.saveError', 'Erreur lors de l\'enregistrement de la configuration.'));
      }
    });
  }

  resetDefaults(): void {
    this.config = cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG);
  }

  addCategory(): void {
    if (!this.canAddCategory) {
      return;
    }
    const id = this.uniqueCategoryId('cat');
    this.config.categories = [
      ...this.config.categories,
      { id, title: null, actionLabel: null, events: [], levels: [], enabled: true }
    ];
  }

  removeCategory(index: number): void {
    this.config.categories = this.config.categories.filter((_, i) => i !== index);
  }

  moveCategory(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.config.categories.length) {
      return;
    }
    const categories = [...this.config.categories];
    [categories[index], categories[target]] = [categories[target], categories[index]];
    this.config.categories = categories;
  }

  isEventSelected(category: TopUsersCategoryConfig, event: string): boolean {
    return category.events.includes(event);
  }

  toggleEvent(category: TopUsersCategoryConfig, event: string): void {
    category.events = category.events.includes(event)
      ? category.events.filter(e => e !== event)
      : [...category.events, event];
  }

  isLevelSelected(category: TopUsersCategoryConfig, level: TopUserLevel): boolean {
    return category.levels.includes(level);
  }

  toggleLevel(category: TopUsersCategoryConfig, level: TopUserLevel): void {
    category.levels = category.levels.includes(level)
      ? category.levels.filter(l => l !== level)
      : [...category.levels, level];
  }

  /** Clé i18n du libellé d'un événement d'audit. */
  eventLabelKey(event: string): string {
    return `CFG.topUsers.evt.${event}`;
  }

  /** Clé i18n du libellé d'un niveau de traitement. */
  levelLabelKey(level: TopUserLevel): string {
    return `CFG.topUsers.lvl.${level}`;
  }

  /** Placeholder du titre : traduction par défaut pour les catégories standard. */
  titlePlaceholder(category: TopUsersCategoryConfig): string {
    const builtin = BUILTIN_CATEGORY_KEYS[category.id];
    if (builtin) {
      return this.translate.instant(builtin.titleKey);
    }
    return this.t('CFG.topUsers.titlePlaceholder', 'Nom de la catégorie');
  }

  /** Placeholder du libellé d'action : traduction par défaut pour les catégories standard. */
  actionPlaceholder(category: TopUsersCategoryConfig): string {
    const builtin = BUILTIN_CATEGORY_KEYS[category.id];
    if (builtin) {
      return this.translate.instant(builtin.actionLabelKey);
    }
    return this.t('CFG.topUsers.actionLabelPlaceholder', 'Libellé affiché');
  }

  /** Y a-t-il des critères (sinon la catégorie prend TOUTES les actions) ? */
  hasNoCriteria(category: TopUsersCategoryConfig): boolean {
    return category.events.length === 0 && category.levels.length === 0;
  }

  close(): void {
    this.location.back();
  }

  private uniqueCategoryId(base: string): string {
    const existing = new Set(this.config.categories.map(c => c.id));
    let index = this.config.categories.length + 1;
    let id = `${base}-${index}`;
    while (existing.has(id)) {
      index++;
      id = `${base}-${index}`;
    }
    return id;
  }

  private t(key: string, fallback: string): string {
    const value = this.translate.instant(key);
    return value && value !== key ? value : fallback;
  }
}
