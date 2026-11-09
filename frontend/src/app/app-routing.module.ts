import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DESIGN_SYSTEM_ROUTES } from './design-system.routes';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ComptesComponent } from './components/comptes/comptes.component';
import { FraisComponent } from './components/frais/frais.component';
import { CommissionComponent } from './components/commission/commission.component';
import { UsersComponent } from './components/users/users.component';
import { LoginComponent } from './login/login.component';
import { TraitementComponent } from './components/traitement/traitement.component';
import { ProfilComponent } from './components/profil/profil.component';
import { ProfilDetailComponent } from './components/profil-detail/profil-detail.component';
import { ModulesComponent } from './components/modules/modules.component';
import { PermissionsComponent } from './components/permissions/permissions.component';
import { UserLogComponent } from './components/user-log/user-log.component';
import { PredictionsComponent } from './components/predictions/predictions.component';
import { PredictionsNewComponent } from './components/predictions/predictions-new.component';


import { ReconciliationComponent } from './components/reconciliation/reconciliation.component';
import { ReportDashboardComponent } from './components/report-dashboard/report-dashboard.component';
import { DashboardReconciliationComponent } from './components/dashboard-reconciliation/dashboard-reconciliation.component';
import { ReconciliationGlobalPreviewComponent } from './components/reconciliation-global-preview/reconciliation-global-preview.component';
import { TwoFactorAuthComponent } from './components/two-factor-auth/two-factor-auth.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { AideComponent } from './components/aide/aide.component';
import { SopOperationComponent } from './components/sop-operation/sop-operation.component';
import { SopReconciliationTrxComponent } from './components/sop-reconciliation-trx/sop-reconciliation-trx.component';
import { GuideUtilisationComponent } from './components/guide-utilisation/guide-utilisation.component';
import { RapportReconciliationBoPartenaireComponent } from './components/rapport-reconciliation-bo-partenaire/rapport-reconciliation-bo-partenaire.component';
import { ControleInterneBoPartenaireComponent } from './components/controle-interne-bo-partenaire/controle-interne-bo-partenaire.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { ModuleAccessGuard } from './guards/module-access.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';

const routes: Routes = [
  // Route de login accessible sans authentification
  { path: 'login', component: LoginComponent },
  {
    path: 'reset-password',
    loadComponent: () => import('./reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  
  // Toutes les autres routes nécessitent une authentification
  // Note: La route de redirection n'a pas besoin de canActivate car la route de destination est protégée
  { path: '', redirectTo: '/reconciliation-launcher', pathMatch: 'full' },
  {
    path: 'reconciliation-launcher',
    loadComponent: () => import('./components/reconciliation-launcher/reconciliation-launcher.component').then(m => m.ReconciliationLauncherComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'] }
  },
  {
    path: 'reconciliation',
    component: ReconciliationComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'] }
  },
  {
    path: 'upload',
    component: FileUploadComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'], manualOnly: true }
  },
  {
    path: 'upload-assisted',
    component: FileUploadComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'], assistedOnly: true }
  },
  {
    path: 'certification-solde/upload',
    component: FileUploadComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'], assistedOnly: true, certificationMode: true }
  },
  {
    path: 'certification-solde',
    loadComponent: () => import('./components/certification-solde/certification-solde.component').then(m => m.CertificationSoldeComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'] }
  },
  {
    // Raccourci « Liste des compenses » : même niveau de page, focale sur la réconciliation des compenses.
    path: 'certification-solde/compenses',
    loadComponent: () => import('./components/certification-solde/certification-solde.component').then(m => m.CertificationSoldeComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'], certificationCompenseMode: true }
  },
  {
    path: 'column-selection',
    loadComponent: () => import('./components/column-selection/column-selection.component').then(m => m.ColumnSelectionComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Réconciliation', permissions: ['consulter'] }
  },
  {
    path: 'stats',
    loadComponent: () => import('./components/stats/stats.component').then(m => m.StatsComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Statistiques', permissions: ['consulter'] }
  },
  {
    path: 'stats-report',
    loadComponent: () => import('./components/stats-report/stats-report.component').then(m => m.StatsReportComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Statistiques', permissions: ['consulter'] }
  },
  {
    path: 'stats-report-graph',
    loadComponent: () => import('./components/stats-report-graph/stats-report-graph.component').then(m => m.StatsReportGraphComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Statistiques', permissions: ['consulter'] }
  },
  { path: 'agency-summary', redirectTo: '/stats', pathMatch: 'full' },
  {
    path: 'results',
    loadComponent: () => import('./components/reconciliation-results/reconciliation-results.component').then(m => m.ReconciliationResultsComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'matches',
    loadComponent: () => import('./components/matches-table/matches-table.component').then(m => m.MatchesTableComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'ecart-bo',
    loadComponent: () => import('./components/ecart-bo-table/ecart-bo-table.component').then(m => m.EcartBoTableComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'ecart-partner',
    loadComponent: () => import('./components/ecart-partner-table/ecart-partner-table.component').then(m => m.EcartPartnerTableComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Dashboard', permissions: ['consulter', 'filtrer'] }
  },
  {
    path: 'comptes',
    component: ComptesComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Comptes', permissions: ['consulter'] }
  },
  {
    path: 'redevance-loterie',
    loadComponent: () => import('./components/redevance-loterie/redevance-loterie.component').then(m => m.RedevanceLoterieComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Comptes', permissions: ['consulter'] }
  },
  {
    path: 'operations',
    loadComponent: () => import('./components/operations/operations.component').then(m => m.OperationsComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Opérations', permissions: ['consulter'] }
  },
  {
    path: 'frais',
    component: FraisComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Frais', permissions: ['consulter'] }
  },
  { path: 'commission', component: CommissionComponent, canActivate: [AuthGuard] },
  { path: 'users', component: UsersComponent, canActivate: [AuthGuard, AdminGuard] },
  {
    path: 'ranking',
    loadComponent: () => import('./components/ranking/ranking.component').then(m => m.RankingComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Classements', permissions: ['consulter'] }
  },
  {
    path: 'traitement',
    component: TraitementComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Traitement', permissions: ['consulter'] }
  },
  { path: 'profils', component: ProfilComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'profils/:id', component: ProfilDetailComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'modules', component: ModulesComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'configuration', redirectTo: 'configuration/logo', pathMatch: 'full' },
  { path: 'configuration/niveaux-validation-reco', loadComponent: () => import('./components/niveaux-validation-reco/niveaux-validation-reco.component').then(m => m.NiveauxValidationRecoComponent), canActivate: [AuthGuard, ModuleAccessGuard] },
  { path: 'configuration/renommer', loadComponent: () => import('./components/configuration-renommer/configuration-renommer.component').then(m => m.ConfigurationRenommerComponent), canActivate: [AuthGuard, AdminGuard] },
  { path: 'configuration/logo', loadComponent: () => import('./components/configuration-logo/configuration-logo.component').then(m => m.ConfigurationLogoComponent), canActivate: [AuthGuard, AdminGuard] },
  { path: 'configuration/calcul', loadComponent: () => import('./components/configuration-calcul/configuration-calcul.component').then(m => m.ConfigurationCalculComponent), canActivate: [AuthGuard, AdminGuard] },
  { path: 'configuration/top-users', loadComponent: () => import('./components/configuration-top-users/configuration-top-users.component').then(m => m.ConfigurationTopUsersComponent), canActivate: [AuthGuard, AdminGuard] },
  { path: 'permissions', component: PermissionsComponent, canActivate: [AuthGuard, AdminGuard] },

  // Routes Administration plateforme (SUPER_ADMIN uniquement)
  {
    path: 'platform/entreprises',
    loadComponent: () => import('./components/platform-entreprises/platform-entreprises.component').then(m => m.PlatformEntreprisesComponent),
    canActivate: [AuthGuard, SuperAdminGuard]
  },
  {
    path: 'platform/modules',
    loadComponent: () => import('./components/platform-modules/platform-modules.component').then(m => m.PlatformModulesComponent),
    canActivate: [AuthGuard, SuperAdminGuard]
  },
  {
    path: 'platform/audit',
    loadComponent: () => import('./components/platform-audit/platform-audit.component').then(m => m.PlatformAuditComponent),
    canActivate: [AuthGuard, SuperAdminGuard]
  },
  {
    path: 'platform/comptes',
    loadComponent: () => import('./components/platform-comptes/platform-comptes.component').then(m => m.PlatformComptesComponent),
    canActivate: [AuthGuard, SuperAdminGuard]
  },

  {
    path: 'ecart-solde',
    loadComponent: () => import('./components/ecart-solde/ecart-solde.component').then(m => m.EcartSoldeComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'TSOP', permissions: ['consulter'] }
  },
  {
    path: 'trx-sf',
    loadComponent: () => import('./components/trx-sf/trx-sf.component').then(m => m.TrxSfComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'TRX SF', permissions: ['consulter'] }
  },
  {
    path: 'impact-op',
    loadComponent: () => import('./components/impact-op/impact-op.component').then(m => m.ImpactOPComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Impact OP', permissions: ['consulter'] }
  },
  {
    path: 'oppart',
    loadComponent: () => import('./components/oppart-list/oppart-list.component').then(m => m.OppartListComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Impact OP', permissions: ['consulter'] }
  },
  {
    path: 'service-balance',
    loadComponent: () => import('./components/service-balance/service-balance.component').then(m => m.ServiceBalanceComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Comptes', permissions: ['consulter'] }
  },
  {
    path: 'service-references',
    loadComponent: () => import('./components/service-references/service-references.component').then(m => m.ServiceReferencesComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Dashboard', permissions: ['consulter'] }
  },
  {
    path: 'auto-processing-models',
    loadComponent: () => import('./components/auto-processing-models/auto-processing-models.component').then(m => m.AutoProcessingModelsComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Modèles', permissions: ['consulter'] }
  },
  {
    path: 'banque',
    loadComponent: () => import('./components/banque/banque.component').then(m => m.BanqueComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'BANQUE', permissions: ['consulter'] }
  },
  {
    path: 'comptabilite',
    loadComponent: () => import('./components/comptabilite/comptabilite.component').then(m => m.ComptabiliteComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Comptabilité', permissions: ['consulter'] }
  },
  {
    path: 'reconciliation-report',
    loadComponent: () => import('./components/reconciliation-report/reconciliation-report.component').then(m => m.ReconciliationReportComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'etat-reconciliations',
    loadComponent: () => import('./components/etat-reconciliations/etat-reconciliations.component').then(m => m.EtatReconciliationsComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'rapport-reconciliation-bo-partenaire',
    component: RapportReconciliationBoPartenaireComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'controle-interne-bo-partenaire',
    component: ControleInterneBoPartenaireComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'report-dashboard',
    component: ReportDashboardComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Report Dashboard', permissions: ['consulter'] }
  },
  {
    path: 'reconciliation-dashboard',
    component: DashboardReconciliationComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'reconciliation-global-preview',
    component: ReconciliationGlobalPreviewComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  { path: 'log-utilisateur', component: UserLogComponent, canActivate: [AuthGuard, AdminGuard] },
  {
    path: 'predictions',
    component: PredictionsNewComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Comptes', permissions: ['consulter'] }
  },
  {
    path: 'predictions-old',
    component: PredictionsComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Comptes', permissions: ['consulter'] }
  }, // Ancien système gardé pour référence
  { path: 'two-factor-auth', component: TwoFactorAuthComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'user-profile', component: UserProfileComponent, canActivate: [AuthGuard] },
  {
    // Changement de mot de passe obligatoire (mot de passe provisoire, ex. SUPER_ADMIN) :
    // l'AuthGuard y redirige tant que le flag mustChangePassword est actif.
    path: 'change-password',
    loadComponent: () => import('./components/password-change-required/password-change-required.component').then(m => m.PasswordChangeRequiredComponent),
    canActivate: [AuthGuard]
  },
  { path: 'aide', component: AideComponent, canActivate: [AuthGuard] },
  { path: 'sop-operation', component: SopOperationComponent, canActivate: [AuthGuard] },
  { path: 'sop-reconciliation-trx', component: SopReconciliationTrxComponent, canActivate: [AuthGuard] },
  { path: 'guide-utilisation', component: GuideUtilisationComponent, canActivate: [AuthGuard] },
  {
    path: 'ecart-bo-summary',
    loadComponent: () => import('./components/ecart-bo-summary/ecart-bo-summary.component').then(m => m.EcartBoSummaryComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  {
    path: 'suivi-trx-a-annuler',
    loadComponent: () => import('./components/suivi-trx-a-annuler/suivi-trx-a-annuler.component').then(m => m.SuiviTrxAAnnulerComponent),
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'Résultats', permissions: ['consulter'] }
  },
  ...DESIGN_SYSTEM_ROUTES
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { } 
