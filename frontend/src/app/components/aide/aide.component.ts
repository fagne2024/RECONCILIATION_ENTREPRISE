import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { I18nService } from '../../services/i18n/i18n.service';

type HelpSectionKey = 'procedures' | 'collaboration';

interface HelpOption {
  id: string;
  section: HelpSectionKey;
  nameKey: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  tagKey: string;
  accent: string;
  accentLight: string;
  actionKey: string;
  route?: string;
  badgeKey?: string;
  keywords?: string[];
}

interface HelpSection {
  key: HelpSectionKey;
  labelKey: string;
}

@Component({
  selector: 'app-aide',
  templateUrl: './aide.component.html',
  styleUrls: ['./aide.component.scss']
})
export class AideComponent implements OnInit {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  searchQuery = '';
  shortcutHint = 'Ctrl K';

  readonly sections: HelpSection[] = [
    { key: 'procedures', labelKey: 'AIDE.sections.procedures' },
    { key: 'collaboration', labelKey: 'AIDE.sections.collaboration' }
  ];

  helpOptions: HelpOption[] = [
    {
      id: 'sop-operation',
      section: 'procedures',
      nameKey: 'AIDE.cards.sopOperation.name',
      titleKey: 'AIDE.cards.sopOperation.title',
      descriptionKey: 'AIDE.cards.sopOperation.description',
      icon: 'fas fa-tasks',
      tagKey: 'AIDE.cards.sopOperation.tag',
      accent: 'var(--blue)',
      accentLight: 'var(--blue-l)',
      actionKey: 'AIDE.action.access',
      route: '/sop-operation',
      keywords: ['sop', 'opération', 'operation', 'back office', 'procédure', 'procedure']
    },
    {
      id: 'sop-reconciliation-trx',
      section: 'procedures',
      nameKey: 'AIDE.cards.sopReconciliationTrx.name',
      titleKey: 'AIDE.cards.sopReconciliationTrx.title',
      descriptionKey: 'AIDE.cards.sopReconciliationTrx.description',
      icon: 'fas fa-sync-alt',
      tagKey: 'AIDE.cards.sopReconciliationTrx.tag',
      accent: 'var(--teal)',
      accentLight: 'var(--teal-l)',
      actionKey: 'AIDE.action.access',
      route: '/sop-reconciliation-trx',
      keywords: ['trx', 'transaction', 'réconciliation', 'reconciliation', 'écart', 'discrepancy']
    },
    {
      id: 'reconciliation-banque',
      section: 'procedures',
      nameKey: 'AIDE.cards.reconciliationBanque.name',
      titleKey: 'AIDE.cards.reconciliationBanque.title',
      descriptionKey: 'AIDE.cards.reconciliationBanque.description',
      icon: 'fas fa-university',
      tagKey: 'AIDE.cards.reconciliationBanque.tag',
      accent: 'var(--violet)',
      accentLight: 'var(--violet-l)',
      actionKey: 'AIDE.action.access',
      route: '/banque',
      keywords: ['banque', 'bank', 'relevé', 'statement', 'solde', 'balance', 'rapprochement']
    },
    {
      id: 'messages',
      section: 'collaboration',
      nameKey: 'AIDE.cards.messages.name',
      titleKey: 'AIDE.cards.messages.title',
      descriptionKey: 'AIDE.cards.messages.description',
      icon: 'fas fa-comments',
      tagKey: 'AIDE.cards.messages.tag',
      accent: 'var(--rose)',
      accentLight: 'var(--rose-l)',
      actionKey: 'AIDE.action.soon',
      badgeKey: 'AIDE.cards.messages.badge',
      keywords: ['message', 'communication', 'notification', 'support']
    },
    {
      id: 'equipe',
      section: 'collaboration',
      nameKey: 'AIDE.cards.equipe.name',
      titleKey: 'AIDE.cards.equipe.title',
      descriptionKey: 'AIDE.cards.equipe.description',
      icon: 'fas fa-users',
      tagKey: 'AIDE.cards.equipe.tag',
      accent: 'var(--green)',
      accentLight: 'var(--green-l)',
      actionKey: 'AIDE.action.access',
      route: '/users',
      keywords: ['équipe', 'team', 'utilisateur', 'user', 'rôle', 'role', 'admin']
    },
    {
      id: 'guide',
      section: 'collaboration',
      nameKey: 'AIDE.cards.guide.name',
      titleKey: 'AIDE.cards.guide.title',
      descriptionKey: 'AIDE.cards.guide.description',
      icon: 'fas fa-book-open',
      tagKey: 'AIDE.cards.guide.tag',
      accent: 'var(--amber)',
      accentLight: 'var(--amber-l)',
      actionKey: 'AIDE.action.read',
      route: '/guide-utilisation',
      keywords: ['guide', 'documentation', 'manuel', 'manual', 'aide', 'help']
    }
  ];

  constructor(
    private location: Location,
    private router: Router
  ) {
    if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) {
      this.shortcutHint = '⌘ K';
    }
  }

  ngOnInit(): void {
  }

  get filteredSections(): Array<HelpSection & { options: HelpOption[] }> {
    return this.sections
      .map((section) => ({
        ...section,
        options: this.helpOptions.filter((option) =>
          option.section === section.key && this.matchesSearch(option)
        )
      }))
      .filter((section) => section.options.length > 0);
  }

  get hasResults(): boolean {
    return this.filteredSections.length > 0;
  }

  openOption(option: HelpOption): void {
    if (!option.route) {
      return;
    }

    this.router.navigateByUrl(option.route);
  }

  focusSearch(): void {
    this.searchInput?.nativeElement.focus();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.focusSearch();
  }

  goToGuide(): void {
    this.router.navigate(['/guide-utilisation']);
  }

  trackByOption(_: number, option: HelpOption): string {
    return option.id;
  }

  @HostListener('window:keydown', ['$event'])
  handleSearchShortcut(event: KeyboardEvent): void {
    const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';

    if (!isSearchShortcut) {
      return;
    }

    event.preventDefault();
    this.focusSearch();
  }

  private matchesSearch(option: HelpOption): boolean {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const searchableText = [
      I18nService.t(option.nameKey),
      I18nService.t(option.titleKey),
      I18nService.t(option.descriptionKey),
      I18nService.t(option.tagKey),
      ...(option.keywords ?? [])
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(query);
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
