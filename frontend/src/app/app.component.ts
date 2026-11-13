import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AppStateService } from './services/app-state.service';
import { UserLogService } from './services/user-log.service';
import { I18nService } from './services/i18n/i18n.service';
import { ThemeService } from './services/theme.service';
import { LogoService } from './services/logo.service';
import { BrandingContextService } from './services/branding-context.service';

@Component({
    selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  showSidebar = true;
  isLoginPage = false;
  isFullWidthPage = false;
  isFlushPage = false;
  title = 'reconciliation-app';

  /** Pages rendues en plein ecran, sans sidebar (ex: login). */
  private readonly fullWidthRoutes: string[] = ['/login', '/reset-password'];

  /** Pages dont le contenu doit occuper toute la largeur du container. */
  private readonly flushRoutes: string[] = ['/reconciliation-launcher'];


  /** Clés de traduction des libellés de page, résolues au moment de la journalisation. */
  private readonly routeLabels: { [path: string]: string } = {
    '/reconciliation-launcher': 'ROUTE.reconciliationLauncher',
    '/reconciliation': 'ROUTE.reconciliation',
    '/upload-assisted': 'ROUTE.uploadAssisted',
    '/upload': 'ROUTE.upload',
    '/column-selection': 'ROUTE.columnSelection',
    '/stats': 'ROUTE.stats',
    '/results': 'ROUTE.results',
    '/matches': 'ROUTE.matches',
    '/ecart-bo': 'ROUTE.ecartBo',
    '/ecart-partner': 'ROUTE.ecartPartner',
    '/dashboard': 'ROUTE.dashboard',
    '/comptes': 'ROUTE.comptes',
    '/operations': 'ROUTE.operations',
    '/frais': 'ROUTE.frais',
    '/commission': 'ROUTE.commission',
    '/users': 'ROUTE.users',
    '/ranking': 'ROUTE.ranking',
    '/traitement': 'ROUTE.traitement',
    '/profils': 'ROUTE.profils',
    '/modules': 'ROUTE.modules',
    '/permissions': 'ROUTE.permissions',
    '/ecart-solde': 'ROUTE.ecartSolde',
    '/trx-sf': 'ROUTE.trxSf',
    '/impact-op': 'ROUTE.impactOp',
    '/service-balance': 'ROUTE.serviceBalance',
    '/service-references': 'ROUTE.serviceReferences',
    '/auto-processing-models': 'ROUTE.autoProcessingModels',
    '/banque': 'ROUTE.banque',
    '/etat-reconciliation-bancaire': 'ROUTE.etatReconciliationBancaire',
    '/comptabilite': 'ROUTE.comptabilite',
    '/reconciliation-report': 'ROUTE.reconciliationReport',
    '/rapport-reconciliation-bo-partenaire': 'ROUTE.rapportBoPartenaire',
    '/controle-interne-bo-partenaire': 'ROUTE.controleInterne',
    '/report-dashboard': 'ROUTE.reportDashboard',
    '/reconciliation-dashboard': 'ROUTE.reconciliationDashboard',
    '/reconciliation-global-preview': 'ROUTE.globalPreview',
    '/log-utilisateur': 'ROUTE.userLog',
    '/platform/comptes': 'ROUTE.comptes',
    '/predictions': 'ROUTE.predictions',
    '/two-factor-auth': 'ROUTE.twoFactorAuth',
    '/user-profile': 'ROUTE.userProfile',
    '/aide': 'ROUTE.aide',
    '/sop-operation': 'ROUTE.sopOperation',
    '/sop-reconciliation-trx': 'ROUTE.sopReconciliationTrx',
    '/guide-utilisation': 'ROUTE.guideUtilisation',
    '/ecart-bo-summary': 'ROUTE.ecartBoSummary',
    '/certification-solde': 'ROUTE.certificationSolde',
    '/redevance-loterie': 'ROUTE.redevanceLoterie'
  };

  constructor(
    private router: Router,
    private appState: AppStateService,
    private userLogService: UserLogService,
    // Injecté pour garantir l'initialisation du sélecteur de langue au
    // démarrage : ModernPopupComponent utilise I18nService.t() depuis des
    // méthodes statiques, qui exige que l'instance existe déjà.
    private i18n: I18nService,
    private themeService: ThemeService,
    private logoService: LogoService,
    private brandingContext: BrandingContextService
  ) {}

    ngOnInit() {
    // Entreprise à mettre en avant AVANT connexion (sous-domaine / ?entreprise=CODE).
    // Un compte SUPER_ADMIN repassera aux couleurs par défaut après connexion.
    const entrepriseCode = this.brandingContext.resolveEntrepriseCode();

    // Charger le design (thème issu des couleurs du logo) dès le démarrage
    this.themeService.init(entrepriseCode);

    // Charger le logo applicatif dès le démarrage (sidebar, login, rapports…)
    this.logoService.load(entrepriseCode);


    // Vérifier l'URL initiale pour masquer le sidebar si on est sur la page de login
    this.updateSidebarVisibility(this.router.url);
    
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event) => {
      this.updateSidebarVisibility(event.urlAfterRedirects);
      this.logPageView(event.urlAfterRedirects);
      // Forcer le recalcul du layout après navigation (corrige le bug d'affichage trop large)
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    });
  }

  private logPageView(url: string): void {
    if (url === '/login' || url.startsWith('/login')) return;
    const username = this.appState.getUsername();
    if (!username) return;
    const basePath = url.split('?')[0];
    const labelKey = this.routeLabels[basePath];
    const label = labelKey ? I18nService.t(labelKey) : basePath;
    this.userLogService.logActivity('vue_page', 'Navigation', username, `Page: ${label} (${basePath})`);
  }

  private updateSidebarVisibility(url: string): void {
    const basePath = url.split('?')[0];
    this.isLoginPage = basePath === '/login';
    this.isFullWidthPage = this.fullWidthRoutes.includes(basePath);
    this.isFlushPage = this.flushRoutes.includes(basePath);
    this.showSidebar = !this.isFullWidthPage;
  }

  get showSidebarToggle(): boolean {
    return !this.isFullWidthPage;
  }

  toggleSidebar() {
    this.showSidebar = !this.showSidebar;
    // Forcer le recalcul du layout après toggle
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  }

  // Les méthodes de navigation ne sont plus nécessaires ici
  // car elles sont gérées par les routerLink dans la sidebar.
} 