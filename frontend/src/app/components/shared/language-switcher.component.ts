import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { AvailableLanguage, I18nService } from '../../services/i18n/i18n.service';

/**
 * Sélecteur de langue FR / EN.
 *
 * Utilisable à deux endroits : la barre latérale (application connectée) et la
 * page de connexion (avant toute authentification). Le style est porté par les
 * classes `i18n-switch` / `i18n-switch--login` définies dans styles.scss, ce
 * qui évite d'embarquer de SCSS dans ce composant.
 */
@Component({
  selector: 'app-language-switcher',
  template: `
    <div
      class="i18n-switch"
      role="group"
      [class.i18n-switch--login]="compact"
      [attr.aria-label]="('LANGUE' | translate)">
      <button
        *ngFor="let lang of languages"
        type="button"
        class="i18n-switch__btn"
        [class.is-active]="(lang$ | async) === lang.code"
        [attr.aria-pressed]="(lang$ | async) === lang.code"
        [attr.lang]="lang.code"
        [title]="lang.label"
        (click)="select(lang.code)">
        {{ lang.code | uppercase }}
      </button>
    </div>
  `
})
export class LanguageSwitcherComponent {
  readonly languages: AvailableLanguage[];
  readonly lang$: Observable<string>;

  /** `true` pour la variante compacte utilisée sur la page de connexion. */
  @Input() compact = false;

  constructor(private readonly i18n: I18nService) {
    this.languages = this.i18n.languages;
    this.lang$ = this.i18n.lang$;
  }

  select(code: string): void {
    this.i18n.use(code);
  }
}
