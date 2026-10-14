import { NgModule, LOCALE_ID, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import localeEn from '@angular/common/locales/en';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { NgChartsModule } from 'ng2-charts';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { AppComponent } from './app.component';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { ReconciliationComponent } from './components/reconciliation/reconciliation.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ComptesComponent } from './components/comptes/comptes.component';
import { FraisComponent } from './components/frais/frais.component';
import { CommissionComponent } from './components/commission/commission.component';
import { AutocompleteInputComponent } from './components/shared/autocomplete-input.component';
import { UsersComponent } from './components/users/users.component';
import { AppRoutingModule } from './app-routing.module';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ReconciliationService } from './services/reconciliation.service';
import { Observable, of } from 'rxjs';
import { LoginComponent } from './login/login.component';
import { TraitementComponent } from './components/traitement/traitement.component';
import { ProfilComponent } from './components/profil/profil.component';
import { SoldesComponent } from './components/soldes/soldes.component';
import { ModulesComponent } from './components/modules/modules.component';
import { PermissionsComponent } from './components/permissions/permissions.component';
import { EcartSoldeTabComponent } from './components/comptes/ecart-solde-tab.component';
import { ImpactOPTabComponent } from './components/comptes/impact-op-tab.component';
import { ServiceBalanceService } from './services/service-balance.service';
import { ExportOptimizationService } from './services/export-optimization.service';
import { ModernExcelExportService } from './services/modern-excel-export.service';
import { ReconciliationSummaryService } from './services/reconciliation-summary.service';
import { ReconciliationTabsService } from './services/reconciliation-tabs.service';
import { DashboardReconciliationService } from './services/dashboard-reconciliation.service';


import { ExcelAnalysisComponent } from './components/excel-analysis/excel-analysis.component';
import { ModernPopupComponent } from './components/modern-popup/modern-popup.component';
import { ProgressIndicatorComponent } from './components/progress-indicator/progress-indicator.component';
import { ReportDashboardComponent } from './components/report-dashboard/report-dashboard.component';
import { DashboardReconciliationComponent } from './components/dashboard-reconciliation/dashboard-reconciliation.component';
import { ReconciliationGlobalPreviewComponent } from './components/reconciliation-global-preview/reconciliation-global-preview.component';
import { UserLogComponent } from './components/user-log/user-log.component';
import { PredictionsComponent } from './components/predictions/predictions.component';
import { PredictionsNewComponent } from './components/predictions/predictions-new.component';
import { TwoFactorAuthComponent } from './components/two-factor-auth/two-factor-auth.component';
import { User2FADialogComponent } from './components/users/user-2fa-dialog.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { ServiceReferencesDashboardPanelComponent } from './components/service-references/service-references-dashboard-panel.component';
import { AideComponent } from './components/aide/aide.component';
import { SopOperationComponent } from './components/sop-operation/sop-operation.component';
import { SopReconciliationTrxComponent } from './components/sop-reconciliation-trx/sop-reconciliation-trx.component';
import { GuideUtilisationComponent } from './components/guide-utilisation/guide-utilisation.component';
import { PartnerMatchesTableComponent } from './components/partner-matches-table/partner-matches-table.component';
import { EcartBoComponent } from './components/ecart-bo/ecart-bo.component';
import { EcartPartenaireComponent } from './components/ecart-partenaire/ecart-partenaire.component';
import { RapportReconciliationBoPartenaireComponent } from './components/rapport-reconciliation-bo-partenaire/rapport-reconciliation-bo-partenaire.component';
import { ControleInterneBoPartenaireComponent } from './components/controle-interne-bo-partenaire/controle-interne-bo-partenaire.component';
import { TraitementJobBannerComponent } from './components/traitement-job-banner/traitement-job-banner.component';
import { LanguageSwitcherComponent } from './components/shared/language-switcher.component';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslationsLoader } from './services/i18n/translations-loader';
import { DEFAULT_LANGUAGE, I18nService } from './services/i18n/i18n.service';
import { SharedUiModule } from './shared/shared-ui.module';

registerLocaleData(localeFr, 'fr');
registerLocaleData(localeEn, 'en');

@NgModule({
    declarations: [
        AppComponent,
        FileUploadComponent,

        ReconciliationComponent,
        DashboardComponent,
        ComptesComponent,
        FraisComponent,
        CommissionComponent,
        SidebarComponent,
        AutocompleteInputComponent,
        UsersComponent,
        LoginComponent,
        TraitementComponent,
        ProfilComponent,
        SoldesComponent,
        ModulesComponent,
        PermissionsComponent,
        EcartSoldeTabComponent,
        ImpactOPTabComponent,

        ExcelAnalysisComponent,
        ModernPopupComponent,
        ProgressIndicatorComponent,
        TraitementJobBannerComponent,

        ReportDashboardComponent,
        DashboardReconciliationComponent,
        ReconciliationGlobalPreviewComponent,
        UserLogComponent,
        PredictionsComponent,
        PredictionsNewComponent,
        TwoFactorAuthComponent,
        User2FADialogComponent,
        UserProfileComponent,
        ServiceReferencesDashboardPanelComponent,
        AideComponent,
        SopOperationComponent,
        SopReconciliationTrxComponent,
        GuideUtilisationComponent,
        PartnerMatchesTableComponent,
        RapportReconciliationBoPartenaireComponent,
        ControleInterneBoPartenaireComponent,
        EcartBoComponent,
        EcartPartenaireComponent,
        LanguageSwitcherComponent
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        HttpClientModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatTableModule,
        MatPaginatorModule,
        AppRoutingModule,
        MatAutocompleteModule,
        ReactiveFormsModule,
        MatProgressSpinnerModule,
        NgChartsModule,
        MatSelectModule,
        MatOptionModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatTooltipModule,
        MatCheckboxModule,
        MatCardModule,
        MatExpansionModule,
        NgxMatSelectSearchModule,
        DragDropModule,
        SharedUiModule,
        TranslateModule.forRoot({
            loader: {
                provide: TranslateLoader,
                useClass: TranslationsLoader
            },
            // Une clé absente en anglais retombe sur le français plutôt que
            // d'afficher la clé brute à l'écran.
            useDefaultLang: true,
            defaultLanguage: DEFAULT_LANGUAGE
        })
    ],
    providers: [
        ReconciliationService,
        ServiceBalanceService,
        ExportOptimizationService,
        ModernExcelExportService,
        ReconciliationSummaryService,
        ReconciliationTabsService,
        DashboardReconciliationService,
        I18nService,
        {
            // La locale Angular suit la langue choisie, pour que les pipes date/number
            // utilisent les formats appropriés dès le premier rendu.
            provide: LOCALE_ID,
            useFactory: () => I18nService.bootstrapLanguage
        },
        {
            provide: HTTP_INTERCEPTORS,
            useClass: AuthInterceptor,
            multi: true
        },
        {
            // Attend le chargement du catalogue de traductions avant le premier
            // rendu. Sans cela, les liaisons sont évaluées avec un dictionnaire
            // vide puis changent à l'arrivée de la réponse HTTP, ce que le mode
            // développement signale par NG0100.
            provide: APP_INITIALIZER,
            useFactory: (i18n: I18nService) => () => i18n.whenReady(),
            deps: [I18nService],
            multi: true
        }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
