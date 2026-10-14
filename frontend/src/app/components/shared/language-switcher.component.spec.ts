import { Component } from '@angular/core';
import { render, screen, fireEvent } from '@testing-library/angular';
import { Observable, of } from 'rxjs';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { I18nService, AvailableLanguage } from '../../services/i18n/i18n.service';
import { TranslateModule } from '@ngx-translate/core';

// Mock I18nService
const mockLanguages: AvailableLanguage[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' }
];

class MockI18nService {
  languages = mockLanguages;
  lang$ = of('fr');
  use = jest.fn();
}

describe('LanguageSwitcherComponent', () => {
  const renderComponent = (overrides: { compact?: boolean; currentLang?: string } = {}) => {
    const mockI18n = new MockI18nService();
    mockI18n.lang$ = of(overrides.currentLang || 'fr');

    return render(LanguageSwitcherComponent, {
      componentProperties: {
        compact: overrides.compact || false
      },
      providers: [
        { provide: I18nService, useValue: mockI18n }
      ],
      imports: [
        TranslateModule.forRoot()
      ]
    });
  };

  it('should render two language buttons', async () => {
    await renderComponent();

    expect(screen.getByText('FR')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('should apply compact class when compact input is true', async () => {
    const { container } = await renderComponent({ compact: true });

    const switcher = container.querySelector('.i18n-switch');
    expect(switcher).toHaveClass('i18n-switch--login');
  });

  it('should not apply compact class when compact input is false', async () => {
    const { container } = await renderComponent({ compact: false });

    const switcher = container.querySelector('.i18n-switch');
    expect(switcher).not.toHaveClass('i18n-switch--login');
  });

  it('should mark current language as active', async () => {
    await renderComponent({ currentLang: 'fr' });

    const frButton = screen.getByText('FR');
    expect(frButton).toHaveAttribute('aria-pressed', 'true');

    const enButton = screen.getByText('EN');
    expect(enButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('should call i18n.use when language button is clicked', async () => {
    const { fixture } = await renderComponent();
    const mockI18n = fixture.debugElement.injector.get(I18nService);

    const enButton = screen.getByText('EN');
    fireEvent.click(enButton);

    expect(mockI18n.use).toHaveBeenCalledWith('en');
  });

  it('should have correct accessibility attributes', async () => {
    await renderComponent();

    const switcher = screen.getByRole('group');
    expect(switcher).toHaveAttribute('aria-label', 'LANGUE');

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('lang');
      expect(button).toHaveAttribute('title');
    });
  });

  it('should display language codes in uppercase', async () => {
    await renderComponent();

    expect(screen.getByText('FR')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.queryByText('fr')).not.toBeInTheDocument();
    expect(screen.queryByText('en')).not.toBeInTheDocument();
  });
});