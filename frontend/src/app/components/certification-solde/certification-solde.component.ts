import { Component, AfterViewInit, OnDestroy, OnInit, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription, firstValueFrom, filter } from 'rxjs';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { AppStateService } from '../../services/app-state.service';
import {
  CertificationResultat,
  CertificationResultatDetails,
  CertificationResultatFilter,
  CertificationResultatSummary,
  CertificationSoldeComputed,
  CertificationSoldeService,
  EcartAggregateRow,
  EcartCategory,
  EcartDetailLine
} from '../../services/certification-solde.service';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { ReconciliationService } from '../../services/reconciliation.service';
import { PopupService } from '../../services/popup.service';
import { FraisTransactionService } from '../../services/frais-transaction.service';
import { FraisTransaction } from '../../models/frais-transaction.model';
import { CommissionService } from '../../services/commission.service';
import { CommissionTransaction } from '../../models/commission.model';
import { OppartService } from '../../services/oppart.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { Oppart, OPPART_STATUT_OK, OppartLigneVerificationResult } from '../../models/oppart.model';
import { PaysService } from '../../services/pays.service';
import { Pays } from '../../models/pays.model';
import { RECONCILIATION_ENV_OPTIONS } from '../../constants/reconciliation-env-options';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

/** Ligne cible d'une réconciliation fichier (liste = compense ou écarts partenaire hors compense). */
interface RecoLine {
  numeroTransGu: string;
  service: string;
  agence: string;
  montant: number;
  date?: string;
}

interface RecoFileData {
  fileName: string;
  column: string;
  amounts: number[];
  extraColumns: string[];
  extraValues: string[][];
}

/**
 * État d'une réconciliation fichier : montants chargés, sélection, statut OK/KO par ligne cible
 * et totaux (total fichier sélectionné, écart). Même logique de matching qu'avant :
 * un montant du fichier correspond à une seule ligne de la liste, plusieurs montants du fichier
 * pouvant s'additionner pour correspondre à une seule ligne (chaque montant utilisé une seule fois).
 */
class FileReconciliationState {
  loaded = false;
  fileName = '';
  column = '';
  amounts: number[] = [];
  selected: boolean[] = [];
  extraColumns: string[] = [];
  extraValues: string[][] = [];
  private matchedTargets: boolean[] = [];
  private matchedAmounts: boolean[] = [];
  private targetCount = 0;

  get fileTotal(): number {
    return this.amounts.reduce((sum, v, i) => (this.selected[i] ? sum + Math.abs(v) : sum), 0);
  }

  get selectedCount(): number {
    return this.selected.filter(Boolean).length;
  }

  get allSelected(): boolean {
    return this.amounts.length > 0 && this.selected.every(Boolean);
  }

  get okCount(): number {
    return this.matchedTargets.filter(Boolean).length;
  }

  get koCount(): number {
    return Math.max(0, this.targetCount - this.okCount);
  }

  isMatchedAt(index: number): boolean {
    return !!this.matchedTargets[index];
  }

  isAmountMatchedAt(index: number): boolean {
    return !!this.matchedAmounts[index];
  }

  load(data: RecoFileData): void {
    this.loaded = true;
    this.fileName = data.fileName;
    this.column = data.column;
    this.amounts = data.amounts;
    this.selected = data.amounts.map(() => true);
    this.extraColumns = data.extraColumns;
    this.extraValues = data.extraValues;
  }

  reset(): void {
    this.loaded = false;
    this.fileName = '';
    this.column = '';
    this.amounts = [];
    this.selected = [];
    this.extraColumns = [];
    this.extraValues = [];
    this.matchedTargets = [];
    this.matchedAmounts = [];
    this.targetCount = 0;
  }

  toggle(index: number, checked: boolean): void {
    this.selected[index] = checked;
  }

  toggleAll(checked: boolean): void {
    this.selected = this.amounts.map(() => checked);
  }

  /**
   * Reconstruit la réconciliation des lignes cibles.
   * - Un montant du fichier correspond à une seule ligne de la liste (jamais plusieurs).
   * - Plusieurs montants du fichier peuvent s'additionner pour correspondre à une seule ligne
   *   de la liste (chaque montant utilisé une seule fois).
   */
  rebuildMatching(targets: RecoLine[]): void {
    const targetKeys = targets.map(t => this.amountKey(t.montant));
    this.targetCount = targetKeys.length;
    const matchedTargets = new Array<boolean>(targetKeys.length).fill(false);
    const matchedAmounts = new Array<boolean>(this.amounts.length).fill(false);

    const selectedKeys = this.amounts
      .filter((_, i) => this.selected[i])
      .map(a => this.amountKey(a))
      .filter(v => v > 0);

    const markAmount = (valueKey: number, count: number): void => {
      let left = count;
      for (let i = 0; i < this.amounts.length && left > 0; i++) {
        if (!this.selected[i] || matchedAmounts[i]) {
          continue;
        }
        if (this.amountKey(this.amounts[i]) === valueKey) {
          matchedAmounts[i] = true;
          left--;
        }
      }
    };

    if (selectedKeys.length && targetKeys.some(t => t > 0)) {
      // Multiset des montants du fichier encore disponibles.
      const remaining = new Map<number, number>();
      for (const v of selectedKeys) {
        remaining.set(v, (remaining.get(v) ?? 0) + 1);
      }

      // 1) Correspondance directe : 1 montant fichier → 1 ligne liste.
      for (let i = 0; i < targetKeys.length; i++) {
        const t = targetKeys[i];
        if (t <= 0) {
          continue;
        }
        const count = remaining.get(t) ?? 0;
        if (count > 0) {
          remaining.set(t, count - 1);
          matchedTargets[i] = true;
          markAmount(t, 1);
        }
      }

      // 2) Plusieurs montants fichier → 1 ligne liste (subset-sum, sans partage d'un montant).
      for (let i = 0; i < targetKeys.length; i++) {
        const t = targetKeys[i];
        if (matchedTargets[i] || t <= 0) {
          continue;
        }
        const taken = new Map<number, number>();
        if (this.findSubsetSum(t, remaining, taken)) {
          for (const [v, c] of taken) {
            const left = (remaining.get(v) ?? 0) - c;
            if (left <= 0) {
              remaining.delete(v);
            } else {
              remaining.set(v, left);
            }
            markAmount(v, c);
          }
          matchedTargets[i] = true;
        }
      }
    }

    this.matchedTargets = matchedTargets;
    this.matchedAmounts = matchedAmounts;
  }

  private findSubsetSum(target: number, remaining: Map<number, number>, taken: Map<number, number>): boolean {
    if (target === 0) {
      return true;
    }
    for (const [v, count] of remaining) {
      if (v > target || count <= (taken.get(v) ?? 0)) {
        continue;
      }
      taken.set(v, (taken.get(v) ?? 0) + 1);
      if (this.findSubsetSum(target - v, remaining, taken)) {
        return true;
      }
      const used = (taken.get(v) ?? 0) - 1;
      if (used <= 0) {
        taken.delete(v);
      } else {
        taken.set(v, used);
      }
    }
    return false;
  }

  private amountKey(value: number): number {
    return Math.round(Math.abs(value) * 100);
  }
}

@Component({
  selector: 'app-certification-solde',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './certification-solde.component.html',
  styleUrls: ['./certification-solde.component.scss']
})
export class CertificationSoldeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pdfExportContent') pdfExportContentRef?: ElementRef<HTMLDivElement>;
  @ViewChild('aggregatesPanel') aggregatesPanelRef?: ElementRef<HTMLDivElement>;
  @ViewChild('directCompenseTables') directCompenseTablesRef?: ElementRef<HTMLDivElement>;
  @ViewChild('savedDocContent') savedDocContentRef?: ElementRef<HTMLDivElement>;

  response: ReconciliationResponse | null = null;
  computed: CertificationSoldeComputed | null = null;

  soldeOuverture: number | null = null;
  soldeCloture: number | null = null;
  soldeOuvertureSaisi = false;
  soldeClotureSaisi = false;
  variation: number | null = null;
  ecartCertification: number | null = null;

  readonly Math = Math;

  numeroCompte = '';
  /** Environnement et pays enregistrés avec la certification (facultatifs, servent aux filtres). */
  env = '';
  pays = '';
  readonly envOptions: readonly string[] = RECONCILIATION_ENV_OPTIONS;
  paysOptions: Pays[] = [];
  /** Popup « Enregistrer » : saisie de l'environnement et du pays avant la sauvegarde. */
  showSaveMetaModal = false;
  saveMetaEnv = '';
  saveMetaPays = '';
  /** Création d'un pays depuis le popup de sauvegarde ('save') ou des certifications enregistrées ('saved'). */
  paysFormTarget: 'save' | 'saved' | null = null;
  paysFormCode = '';
  paysFormNom = '';
  isCreatingPays = false;
  /** Pays sélectionné dans la fiche d'une certification enregistrée (modifiable). */
  savedPaysDraft = '';
  isSavingSavedPays = false;
  dateCertificationDe = '';
  dateCertificationAu = '';
  /** Heures de borne du solde d'ouverture / de clôture (modifiables, sans recalcul). */
  heureOuverture = '00:00:00';
  heureCloture = '23:59:59';
  commentaire = '';
  reconciliationTitle = 'Réconciliation TRXBO / OPPART';
  isSaving = false;
  isLoadingSoldes = false;
  isExportingExcel = false;
  isExportingPdf = false;
  isExportingAggregates = false;
  isExportingAggregatesPdf = false;
  isLoadingDetail = false;
  pdfLogoDataUrl: string | null = null;
  showPdfPreview = false;
  pdfPreviewUrl: string | null = null;
  pdfPreviewFileName = '';
  pdfPreviewLoading = true;

  compenseRecon = new FileReconciliationState();
  ecartRecon = new FileReconciliationState();
  compenseSectionVisible = true;
  /** Mode accès direct : ouverture depuis /certification-solde/upload vers la réconciliation des compenses. */
  directCompenseMode = false;
  /** Liste des compenses chargée par fichier Excel ou depuis OPPART (sinon la liste calculée est utilisée). */
  compenseListeLoaded = false;
  compenseListeFileName = '';
  compenseListeSource: 'file' | 'oppart' | '' = '';
  isLoadingOppartCompenses = false;
  isVerifyingCompenses = false;
  isLinkingCompenses = false;
  compenseListeFiltered = false;
  verifCompenses: OppartLigneVerificationResult[] = [];
  verifCompensesOk = 0;
  verifCompensesEnCours = 0;
  verifCompensesIntrouvables = 0;
  compenseFileSource: 'file' | 'oppart' | '' = '';
  isLoadingOppartCompenseFile = false;
  private loadedCompenseLines: RecoLine[] = [];
  /** Liste des lignes d'écart chargée par fichier Excel (sinon liste calculée utilisée). */
  ecartListeLoaded = false;
  ecartListeFileName = '';
  private loadedEcartLines: RecoLine[] = [];

  /** Consultation des certifications enregistrées. */
  showSavedPanel = false;
  savedFilter: Required<CertificationResultatFilter> = CertificationSoldeComponent.emptySavedFilter();
  savedList: CertificationResultatSummary[] = [];
  readonly savedPageSizeOptions = [10, 20, 50];
  savedPage = 0;
  savedPageSize = 20;
  savedTotalElements = 0;
  savedTotalPages = 0;
  isLoadingSaved = false;
  savedResultat: CertificationResultat | null = null;
  savedDetails: CertificationResultatDetails | null = null;
  isExportingSavedPdf = false;
  /** Export de la liste des certifications enregistrées (toutes les pages du filtre courant). */
  isExportingSavedListPdf = false;
  isExportingSavedListExcel = false;
  private fraisConfigs: FraisTransaction[] = [];
  private commissionConfigs: CommissionTransaction[] = [];
  private subscription = new Subscription();
  private routerSubscription = new Subscription();
  private detailSessionLoaded: string | null = null;
  private pdfLogoPromise: Promise<string | null> | null = null;
  private pdfPreviewBlob: Blob | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private appState: AppStateService,
    private reconciliationService: ReconciliationService,
    private certificationService: CertificationSoldeService,
    private fraisTransactionService: FraisTransactionService,
    private commissionService: CommissionService,
    private popupService: PopupService,
    private sanitizer: DomSanitizer,
    private oppartService: OppartService,
    private calculService: ConfigurationCalculService,
    private paysService: PaysService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef
  ) {}

  private static emptySavedFilter(): Required<CertificationResultatFilter> {
    return { numeroCompte: '', env: '', pays: '', dateDebut: '', dateFin: '' };
  }

  ngOnInit(): void {
    const today = this.formatDateInput(new Date());
    this.dateCertificationDe = today;
    this.dateCertificationAu = today;
    this.directCompenseMode = this.route.snapshot.queryParamMap.get('focus') === 'compense'
      || this.route.snapshot.data['certificationCompenseMode'] === true;
    this.loadFraisConfigs();
    this.loadCommissionConfigs();
    this.loadPaysOptions();
    this.calculService.loadRules().subscribe(() => {
      this.recalculateDerived();
      this.cdr.markForCheck();
    });
    this.subscription.add(
      this.appState.reconciliationResult$.subscribe(result => {
        this.response = result;
        this.applyPeriodeFromOppart();
        this.refreshComputed();
        void this.loadPaginatedDetailIfNeeded();
      })
    );

    // Raccourci « Liste des compenses » : suit les navigations affectant le mode
    // (`?focus=compense` ou route `/certification-solde/compenses`).
    this.routerSubscription.add(
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe(() => {
          this.directCompenseMode = this.route.snapshot.queryParamMap.get('focus') === 'compense'
            || this.route.snapshot.data['certificationCompenseMode'] === true;
          this.cdr.markForCheck();
        })
    );
  }

  ngAfterViewInit(): void {
    if (this.directCompenseMode) {
      setTimeout(() => {
        const el = document.getElementById('compense-reconciliation-panel');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }

  /**
   * Quand les résultats sont paginés côté serveur, les tableaux matches/boOnly/partnerOnly/mismatches
   * sont vides (seuls les totaux sont fournis). On recharge le détail complet depuis la session pour
   * alimenter les agrégats des écarts (nombre + volume + frais) et la synthèse.
   */
  private async loadPaginatedDetailIfNeeded(): Promise<void> {
    if (!this.response) {
      return;
    }

    const needsDetail =
      this.response.resultsPaginated === true ||
      ((this.response.totalMatches ?? 0) > 0 && !(this.response.matches?.length)) ||
      ((this.response.totalBoOnly ?? 0) > 0 && !(this.response.boOnly?.length)) ||
      ((this.response.totalPartnerOnly ?? 0) > 0 && !(this.response.partnerOnly?.length));

    if (!needsDetail) {
      return;
    }

    const jobId = this.reconciliationService.getCurrentJobId();
    if (!jobId) {
      return;
    }

    if (this.detailSessionLoaded === jobId) {
      return;
    }

    this.isLoadingDetail = true;
    this.cdr.markForCheck();
    try {
      const detail = await this.reconciliationService.loadAllDetailResults(jobId, 5000);
      if (!this.response) {
        return;
      }
      this.response = {
        ...this.response,
        matches: detail.matches,
        boOnly: detail.boOnly,
        partnerOnly: detail.partnerOnly,
        mismatches: detail.mismatches,
        resultsPaginated: false
      };
      this.detailSessionLoaded = jobId;
      this.refreshComputed();
    } catch (e) {
      console.error('Erreur lors du chargement du détail des agrégats:', e);
    } finally {
      this.isLoadingDetail = false;
      this.cdr.markForCheck();
    }
  }

  private loadFraisConfigs(): void {
    this.subscription.add(
      this.fraisTransactionService.getAllFraisTransactionsActifs('TRX SF').subscribe({
        next: configs => {
          this.fraisConfigs = configs || [];
          this.refreshComputed();
        },
        error: () => {
          this.fraisConfigs = [];
          this.refreshComputed();
        }
      })
    );
  }

  private loadCommissionConfigs(): void {
    this.subscription.add(
      this.commissionService.getAllCommissionsActifs('TRX SF').subscribe({
        next: configs => {
          this.commissionConfigs = configs || [];
          this.refreshComputed();
        },
        error: () => {
          this.commissionConfigs = [];
          this.refreshComputed();
        }
      })
    );
  }

  hasRegularisationDetails(row: EcartAggregateRow): boolean {
    return this.certificationService.hasRegularisationDetails(row);
  }

  /**
   * Pagination indépendante par partie d'agrégat (une page par code : MATCHES, TSOP,
   * RGFRAIS, TRXSF_PARTNER, ...). 5 lignes par page par défaut.
   */
  readonly aggregatePageSize = 5;
  aggregatePages: Record<string, number> = {};
  exportingAggregateCode: string | null = null;

  getAggregatePageCount(row: EcartAggregateRow): number {
    const total = row.details?.length ?? 0;
    return Math.max(1, Math.ceil(total / this.aggregatePageSize));
  }

  getAggregatePage(row: EcartAggregateRow): number {
    const requested = this.aggregatePages[row.code] ?? 1;
    return Math.min(Math.max(1, requested), this.getAggregatePageCount(row));
  }

  getAggregateVisibleDetails(row: EcartAggregateRow): EcartDetailLine[] {
    const details = row.details ?? [];
    const page = this.getAggregatePage(row);
    const start = (page - 1) * this.aggregatePageSize;
    return details.slice(start, start + this.aggregatePageSize);
  }

  getAggregateRangeLabel(row: EcartAggregateRow): string {
    const total = row.details?.length ?? 0;
    if (!total) {
      return '0 ligne';
    }
    const page = this.getAggregatePage(row);
    const start = (page - 1) * this.aggregatePageSize + 1;
    const end = Math.min(page * this.aggregatePageSize, total);
    return `${start}-${end} sur ${total}`;
  }

  setAggregatePage(row: EcartAggregateRow, page: number): void {
    this.aggregatePages[row.code] = Math.min(Math.max(1, page), this.getAggregatePageCount(row));
    this.cdr.markForCheck();
  }

  private resetAggregatePages(): void {
    this.aggregatePages = {};
  }

  /** Libellé de période lisible, utilisé dans les en-têtes d'export. */
  private formatPeriodeLibelle(): string {
    const de = this.dateCertificationDe;
    const au = this.dateCertificationAu;
    if (de && au) {
      return de === au ? de : `${de} au ${au}`;
    }
    return de ? `à partir du ${de}` : (au ? `jusqu'au ${au}` : 'non renseignée');
  }

  /** Export Excel d'une seule partie d'agrégat, avec toutes ses lignes de détail. */
  async exportAggregatePart(row: EcartAggregateRow): Promise<void> {
    const details = row.details ?? [];
    if (!details.length || this.exportingAggregateCode) {
      return;
    }
    this.exportingAggregateCode = row.code;
    this.cdr.markForCheck();
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Certification de solde';
      const ws = workbook.addWorksheet(row.label.slice(0, 31));

      // Titre : partie auditée, période, contexte d'export.
      const titre = `Certification de solde — ${row.label}`;
      this.styleExcelHeaderRow(ws.addRow([titre]));
      ws.mergeCells('A1:I1');
      ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

      const contexte: string[] = [];
      contexte.push(`Période : ${this.formatPeriodeLibelle()}`);
      if (this.numeroCompte) {
        contexte.push(`Compte : ${this.numeroCompte}`);
      }
      contexte.push(`${details.length} ligne(s)`);
      contexte.push(`Export du ${this.formatExportTimestamp()}`);

      ws.addRow([contexte.join('  ·  ')]);
      ws.mergeCells('A2:I2');
      ws.getCell('A2').font = { size: 10, color: { argb: 'FF5D6D7E' } };

      ws.addRow([]);
      this.styleExcelHeaderRow(ws.addRow([
        'N° Trans GU', 'Service', 'Agence', 'Date',
        'Montant OPPART', 'Montant TRXBO', 'Frais', 'À régulariser', 'Commentaire'
      ]));

      for (const d of details) {
        const r = ws.addRow([
          d.numeroTransGu || '—',
          d.service || '—',
          d.agence || '—',
          d.date || '—',
          d.montant,
          d.montantBo ?? '',
          d.frais || '',
          d.montantARegulariser,
          d.commentaire || '—'
        ]);
        r.getCell(5).numFmt = '#,##0';
        r.getCell(6).numFmt = '#,##0';
        r.getCell(7).numFmt = '#,##0';
        r.getCell(8).numFmt = '#,##0';
      }

      const totalRow = ws.addRow([
        `Total ${row.label}`, '', '', '',
        row.volume, '', row.frais || '', row.montantARegulariser || '', `${details.length} ligne(s)`
      ]);
      totalRow.font = { bold: true };
      totalRow.getCell(5).numFmt = '#,##0';
      totalRow.getCell(7).numFmt = '#,##0';
      totalRow.getCell(8).numFmt = '#,##0';

      ws.columns = [
        { width: 22 }, { width: 30 }, { width: 18 }, { width: 14 },
        { width: 16 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 28 }
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `${this.buildEcartAggregatesFileBase()}_${row.code}.xlsx`;
      saveAs(new Blob([buffer]), fileName);
      await this.popupService.showSuccess(
        `${row.label} : ${details.length} ligne(s) exportée(s) dans ${fileName}.`,
        'Export ' + row.label
      );
    } catch (e: any) {
      console.error('Erreur export partie agrégat:', e);
      await this.popupService.showError(e?.message || `Erreur lors de l'export de ${row.label}.`, 'Erreur d\'export');
    } finally {
      this.exportingAggregateCode = null;
      this.cdr.markForCheck();
    }
  }

  get regularisationAggregates(): EcartAggregateRow[] {
    if (!this.computed) {
      return [];
    }
    // L'agrégat Écart partenaire est déjà restreint au périmètre de régularisation
    // (IMPACT_COMPTE_GENERAL / FRAIS_TRANSACTION / VERSEMENT_COMMISSION, hors compense).
    return this.computed.aggregates.filter(a => this.hasRegularisationDetails(a));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.routerSubscription.unsubscribe();
    if (this.pdfPreviewUrl) {
      URL.revokeObjectURL(this.pdfPreviewUrl);
      this.pdfPreviewUrl = null;
    }
  }

  get pdfPreviewSafeUrl(): SafeResourceUrl | null {
    if (!this.pdfPreviewUrl) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfPreviewUrl);
  }

  get hasResults(): boolean {
    return !!this.response;
  }

  get canExport(): boolean {
    return this.hasResults && !!this.computed;
  }

  /** Écart de certification basé uniquement sur l'écart mouvement (Variation − Mouvement net OPPART). */
  get ecartMouvement(): number | null {
    return this.ecartCertification;
  }

  /**
   * Écart frais : |Frais attendu| − |Frais facturé| (OPPART), négatif si facturé > attendu.
   * La formule configurée dans Configuration > Calcul est prioritaire ; en son absence
   * (règle supprimée ou désactivée), le code conserve cette formule par défaut.
   */
  get ecartFrais(): number | null {
    if (!this.computed || this.computed.fraisAttendu == null) {
      return null;
    }
    const facture = this.computed.oppartOperationBreakdown.frais;
    const attendu = this.computed.fraisAttendu;
    return this.calculService.evaluate(
      'CERTIF.ECART_FRAIS',
      { FRAIS_FACTURE: facture, FRAIS_ATTENDU: attendu },
      Math.abs(attendu) - Math.abs(facture)
    );
  }

  /** Écart de certification synthèse : Écart mouvement + Total à régulariser (hors Écart frais). */
  get ecartCertificationSynthese(): number {
    const mouvement = this.ecartMouvement ?? 0;
    const regularisation = this.computed?.totalRegularisation ?? 0;
    return this.calculService.evaluate(
      'CERTIF.ECART_CERTIFICATION',
      { ECART_MOUVEMENT: mouvement, TOTAL_REGULARISATION: regularisation },
      mouvement + regularisation
    );
  }

  /** Solde de clôture théorique : Solde de clôture + Écart de certification. */
  get soldeClotureTheorique(): number | null {
    if (this.soldeCloture == null || !this.computed) {
      return null;
    }
    return this.calculService.evaluate(
      'CERTIF.SOLDE_CLOTURE_THEORIQUE',
      { SOLDE_CLOTURE: this.soldeCloture, ECART_CERTIFICATION: this.ecartCertificationSynthese },
      this.soldeCloture + this.ecartCertificationSynthese
    );
  }

  /** Écart partenaire à régulariser : IMPACT_COMPTE_GENERAL + FRAIS_TRANSACTION + VERSEMENT_COMMISSION. */
  get totalEcartPartenaire(): number {
    return this.computed?.montantEcartPartenaire ?? 0;
  }

  get totalRgFrais(): number {
    return this.sumAggregatesByCategory('RGFRAIS', 'volume');
  }

  get totalTsop(): number {
    return this.sumAggregatesByCategory('TSOP', 'montantARegulariser');
  }

  get totalTrxSf(): number {
    return this.sumAggregatesByCategory('TRXSF', 'montantARegulariser');
  }

  private sumAggregatesByCategory(category: EcartCategory, field: 'volume' | 'montantARegulariser'): number {
    return (this.computed?.aggregates ?? [])
      .filter(a => a.category === category)
      .reduce((sum, a) => sum + (a[field] ?? 0), 0);
  }

  /** Lignes de compense : liste chargée par fichier si fournie, sinon calculée. */
  get compenseLines(): RecoLine[] {
    if (this.loadedCompenseLines.length) {
      return this.loadedCompenseLines;
    }
    return (this.computed?.compenseDetails ?? []).map(d => ({
      numeroTransGu: d.numeroTransGu,
      service: d.service,
      agence: d.agence,
      montant: d.montant,
      date: d.date
    }));
  }

  /** Compense agrégée par agence (pour les exports). */
  get compenseParAgence(): { agence: string; montant: number }[] {
    const map = new Map<string, number>();
    for (const line of this.compenseLines) {
      const key = line.agence || '—';
      map.set(key, (map.get(key) ?? 0) + line.montant);
    }
    return Array.from(map.entries())
      .map(([agence, montant]) => ({ agence, montant }))
      .sort((a, b) => a.agence.localeCompare(b.agence));
  }

  /**
   * Lignes du fichier des montants (partie partenaire) : code agence, ID Transaction
   * et montant. Seules les lignes sélectionnées sont reprises, pour que le total du
   * tableau corresponde au total partenaire affiché.
   */
  get compensePartnerLines(): { agence: string; idTransaction: string; montant: number; statut: boolean }[] {
    if (!this.compenseRecon.loaded) {
      return [];
    }
    const idIndex = this.findExtraColumnIndex(['idtransaction', 'transactionid', 'idtrans']);
    const agenceIndex = this.findExtraColumnIndex(['agence', 'agency', 'client', 'codeproprietaire']);
    const lines: { agence: string; idTransaction: string; montant: number; statut: boolean }[] = [];
    for (let i = 0; i < this.compenseRecon.amounts.length; i++) {
      if (!this.compenseRecon.selected[i]) {
        continue;
      }
      const extras = this.compenseRecon.extraValues[i] || [];
      lines.push({
        agence: agenceIndex != null ? String(extras[agenceIndex] ?? '').trim() : '',
        idTransaction: idIndex != null ? String(extras[idIndex] ?? '').trim() : '',
        montant: Math.abs(Number(this.compenseRecon.amounts[i]) || 0),
        statut: this.compenseRecon.isAmountMatchedAt(i)
      });
    }
    return lines;
  }

  /** Index de la première colonne supplémentaire dont le libellé correspond (exact puis partiel). */
  private findExtraColumnIndex(candidates: string[]): number | null {
    const columns = this.compenseRecon.extraColumns.map(c => this.normalizeHeader(c));
    for (const candidate of candidates) {
      const exact = columns.indexOf(candidate);
      if (exact >= 0) {
        return exact;
      }
    }
    for (const candidate of candidates) {
      const partial = columns.findIndex(c => c.includes(candidate));
      if (partial >= 0) {
        return partial;
      }
    }
    return null;
  }

  get compenseListeAbsTotal(): number {
    return Math.abs(this.compenseLines.reduce((s, d) => s + d.montant, 0));
  }

  get compenseFileTotal(): number {
    return this.compenseRecon.fileTotal;
  }

  get compenseFileEcart(): number {
    return Math.abs(this.compenseListeAbsTotal - this.compenseFileTotal);
  }

  /** Libellé de l'écart compense : Écart BO si total liste > total fichier, sinon Écart partenaire. */
  get compenseEcartLabel(): string {
    return this.compenseListeAbsTotal > this.compenseFileTotal ? 'Écart BO' : 'Écart partenaire';
  }

  get selectedCompenseAmountCount(): number {
    return this.compenseRecon.selectedCount;
  }

  get allCompenseAmountsSelected(): boolean {
    return this.compenseRecon.allSelected;
  }

  get compenseOkCount(): number {
    return this.compenseRecon.loaded ? this.compenseRecon.okCount : 0;
  }

  get compenseKoCount(): number {
    return this.compenseRecon.loaded ? this.compenseRecon.koCount : 0;
  }

  /** Nombre de lignes de compense affichées (liste chargée par fichier, sinon liste calculée). */
  get compenseLinesCount(): number {
    return this.compenseLines.length;
  }

  /** Écart total en valeur : pertinent uniquement une fois le fichier des montants chargé. */
  get compenseEcartTotal(): number {
    return this.compenseRecon.loaded ? this.compenseFileEcart : 0;
  }

  /** Rapprochement complet : toutes les lignes de compense sont OK. */
  get compenseFullyMatched(): boolean {
    return this.compenseRecon.loaded
      && this.compenseLinesCount > 0
      && this.compenseOkCount === this.compenseLinesCount;
  }

  /** Taux de rapprochement en %, ou null tant que le fichier des montants n'est pas chargé. */
  get compenseMatchRate(): number | null {
    if (!this.compenseRecon.loaded || this.compenseLinesCount === 0) {
      return null;
    }
    return (this.compenseOkCount / this.compenseLinesCount) * 100;
  }

  isCompenseMontantMatchedAt(index: number): boolean {
    return this.compenseRecon.isMatchedAt(index);
  }

  isCompenseFileAmountMatchedAt(index: number): boolean {
    return this.compenseRecon.isAmountMatchedAt(index);
  }

  /** Lignes d'écart partenaire hors compense : liste chargée par fichier si fournie, sinon calculée. */
  get ecartPartenaireLines(): RecoLine[] {
    if (this.loadedEcartLines.length) {
      return this.loadedEcartLines;
    }
    return (this.computed?.ecartPartenaireDetails ?? []).map(d => ({
      numeroTransGu: d.numeroTransGu,
      service: d.service,
      agence: d.agence,
      montant: d.montant,
      date: d.date
    }));
  }

  get ecartListeTotal(): number {
    return this.ecartPartenaireLines.reduce((s, d) => s + Math.abs(d.montant), 0);
  }

  get ecartFileTotal(): number {
    return this.ecartRecon.fileTotal;
  }

  get ecartFileEcart(): number {
    return Math.abs(this.ecartListeTotal - this.ecartFileTotal);
  }

  /** Libellé de l'écart lignes d'écart : Écart BO si total liste > total fichier, sinon Écart partenaire. */
  get ecartEcartLabel(): string {
    return this.ecartListeTotal > this.ecartFileTotal ? 'Écart BO' : 'Écart partenaire';
  }

  get ecartOkCount(): number {
    return this.ecartRecon.okCount;
  }

  get ecartKoCount(): number {
    return this.ecartPartenaireLines.length - this.ecartOkCount;
  }

  get selectedEcartAmountCount(): number {
    return this.ecartRecon.selectedCount;
  }

  get allEcartAmountsSelected(): boolean {
    return this.ecartRecon.allSelected;
  }

  isEcartMontantMatchedAt(index: number): boolean {
    return this.ecartRecon.isMatchedAt(index);
  }

  /** Écarts partenaire hors compense agrégés par agence (pour les exports). */
  get ecartParAgence(): { agence: string; montant: number }[] {
    const map = new Map<string, number>();
    for (const line of this.ecartPartenaireLines) {
      const key = line.agence || '—';
      map.set(key, (map.get(key) ?? 0) + line.montant);
    }
    return Array.from(map.entries())
      .map(([agence, montant]) => ({ agence, montant }))
      .sort((a, b) => a.agence.localeCompare(b.agence));
  }

  async exportToExcel(): Promise<void> {
    if (!this.canExport || !this.computed) {
      await this.popupService.showWarning('Aucune donnée de certification à exporter.', 'Export impossible');
      return;
    }

    this.isExportingExcel = true;
    this.cdr.markForCheck();
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ReconciliApp';
      workbook.created = new Date();

      const wsCert = workbook.addWorksheet('Certification');
      this.styleExcelHeaderRow(wsCert.addRow([this.reconciliationTitle]));
      wsCert.mergeCells('A1:B1');
      wsCert.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

      wsCert.addRow([]);
      this.addExcelKeyValueRows(wsCert, [
        ['Numéro de compte', this.numeroCompte || '—'],
        ['Date export', this.formatExportTimestamp()],
        ['Solde d\'ouverture', this.soldeOuverture],
        ['Solde de clôture', this.soldeCloture],
        ['Suggestion OPPART ouverture', this.computed.soldeOuvertureOppart],
        ['Suggestion OPPART clôture', this.computed.soldeClotureOppart],
        ['Variation', this.variation],
        ['Mouvement net OPPART', this.computed.mouvementNetOppart],
        ['Frais attendu', this.computed.fraisAttendu ?? ''],
        ['Total Débit', this.computed.totalDebit],
        ['Total Crédit', this.computed.totalCredit],
        ['Écart mouvement', this.ecartCertification],
        ['Solde de clôture théorique', this.soldeClotureTheorique]
      ]);

      wsCert.getColumn(1).width = 32;
      wsCert.getColumn(2).width = 22;

      if (this.regularisationAggregates.length) {
        const wsDetail = workbook.addWorksheet('Détail régularisation');
        const detailHeader = wsDetail.addRow(['Type', 'Nombre', 'Montant', 'Frais', 'À régulariser']);
        this.styleExcelHeaderRow(detailHeader);
        for (const row of this.regularisationAggregates) {
          const r = wsDetail.addRow([
            row.label,
            row.count,
            row.volume,
            row.frais || '',
            row.montantARegulariser || ''
          ]);
          r.getCell(3).numFmt = '#,##0';
          r.getCell(4).numFmt = '#,##0';
          r.getCell(5).numFmt = '#,##0';
        }
        wsDetail.columns = [
          { width: 36 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 16 }
        ];
      }

      if (this.compenseLines.length) {
        const wsCompense = workbook.addWorksheet('Compense');
        const compenseHeader = wsCompense.addRow(['Agence', 'Total montant']);
        this.styleExcelHeaderRow(compenseHeader);
        for (const row of this.compenseParAgence) {
          const r = wsCompense.addRow([row.agence, row.montant]);
          r.getCell(2).numFmt = '#,##0';
        }
        if (this.compenseRecon.loaded) {
          const partenaireRow = wsCompense.addRow(['Partenaire', this.compenseFileTotal]);
          partenaireRow.getCell(1).font = { bold: true };
          partenaireRow.getCell(2).font = { bold: true };
          partenaireRow.getCell(2).numFmt = '#,##0';
          const ecartRow = wsCompense.addRow([this.compenseEcartLabel, this.compenseFileEcart]);
          ecartRow.getCell(1).font = { bold: true, color: { argb: 'FFC0392B' } };
          ecartRow.getCell(2).font = { bold: true, color: { argb: 'FFC0392B' } };
          ecartRow.getCell(2).numFmt = '#,##0';
        }
        wsCompense.columns = [
          { width: 28 }, { width: 18 }
        ];
      }

      if (this.ecartPartenaireLines.length) {
        const wsEcart = workbook.addWorksheet('Lignes d\'écart');
        this.styleExcelHeaderRow(wsEcart.addRow([this.reconciliationTitle]));
        wsEcart.mergeCells('A1:E1');
        wsEcart.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

        wsEcart.addRow([]);
        const scopeRow = wsEcart.addRow([
          'Réconciliation des lignes d\'écart partenaire (hors compense)',
          '',
          '',
          '',
          this.ecartListeLoaded ? this.ecartListeFileName : 'Liste calculée'
        ]);
        scopeRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FFA04000' } };
        scopeRow.getCell(5).font = { italic: true, size: 10, color: { argb: 'FF888888' } };
        this.styleExcelHeaderRow(wsEcart.addRow(['N° Trans GU', 'Service', 'Agence', 'Montant', 'Statut']));

        for (let i = 0; i < this.ecartPartenaireLines.length; i++) {
          const line = this.ecartPartenaireLines[i];
          const r = wsEcart.addRow([
            line.numeroTransGu || '—',
            line.service || '—',
            line.agence || '—',
            line.montant,
            this.ecartRecon.loaded ? (this.ecartRecon.isMatchedAt(i) ? 'OK' : 'KO') : '—'
          ]);
          r.getCell(4).numFmt = '#,##0';
        }

        const totalRow = wsEcart.addRow(['Total liste', '', '', this.ecartListeTotal, '']);
        totalRow.getCell(1).font = { bold: true };
        totalRow.getCell(4).font = { bold: true };
        totalRow.getCell(4).numFmt = '#,##0';

        if (this.ecartRecon.loaded) {
          const fichierRow = wsEcart.addRow(['Total fichier sélectionné', '', '', this.ecartFileTotal, '']);
          fichierRow.getCell(1).font = { bold: true };
          fichierRow.getCell(4).font = { bold: true };
          fichierRow.getCell(4).numFmt = '#,##0';
          const ecartRow = wsEcart.addRow([this.ecartEcartLabel, '', '', this.ecartFileEcart, '']);
          ecartRow.getCell(1).font = { bold: true, color: { argb: 'FFC0392B' } };
          ecartRow.getCell(4).font = { bold: true, color: { argb: 'FFC0392B' } };
          ecartRow.getCell(4).numFmt = '#,##0';
          const okKoRow = wsEcart.addRow(['OK', this.ecartOkCount, 'KO', this.ecartKoCount, '']);
          okKoRow.getCell(1).font = { bold: true, color: { argb: 'FF1E8449' } };
          okKoRow.getCell(2).font = { bold: true, color: { argb: 'FF1E8449' } };
          okKoRow.getCell(3).font = { bold: true, color: { argb: 'FFC0392B' } };
          okKoRow.getCell(4).font = { bold: true, color: { argb: 'FFC0392B' } };
        }

        wsEcart.columns = [
          { width: 22 }, { width: 30 }, { width: 18 }, { width: 16 }, { width: 10 }
        ];
      }

      const wsSynth = workbook.addWorksheet('Synthèse réconciliation');
      this.addExcelKeyValueRows(wsSynth, [
        ['Lignes BO (TRXBO)', this.computed.totals.totalBoRecords],
        ['Lignes Partenaire (OPPART)', this.computed.totals.totalPartnerRecords],
        ['Correspondances', this.computed.totals.matches],
        ['Montant écarts BO', this.computed.volumeEcartBo],
        ['Montant écarts Partenaire', this.computed.volumeEcartPartner]
      ]);
      const certRow = wsSynth.addRow(['Écart de certification', this.ecartCertificationSynthese]);
      certRow.getCell(1).font = { bold: true, color: { argb: 'FF1E8449' } };
      certRow.getCell(2).font = { bold: true, color: { argb: 'FF1E8449' } };
      certRow.getCell(2).numFmt = '#,##0';

      if (this.computed.oppartOperationBreakdown.hasData) {
        const oppart = this.computed.oppartOperationBreakdown;
        wsSynth.addRow([]);
        wsSynth.addRow(["Types d'opérations"]);
        wsSynth.getRow(wsSynth.rowCount).getCell(1).font = { bold: true, color: { argb: 'FF282E5E' }, size: 11 };
        const rFrais = wsSynth.addRow(['Frais (FRAIS_TRANSACTION)', oppart.frais]);
        rFrais.getCell(2).numFmt = '#,##0';
        if (this.computed.fraisAttendu != null) {
          // Même source que l'écran : la formule configurée dans Configuration > Calcul
          // est prioritaire, le code conserve sa formule par défaut.
          const ecartFraisExcel = this.ecartFrais ?? 0;
          const rEcartFrais = wsSynth.addRow(['Écart frais (attendu − facturé)', ecartFraisExcel]);
          rEcartFrais.getCell(2).numFmt = '#,##0';
          rEcartFrais.getCell(1).font = { bold: true, color: { argb: 'FFC0392B' } };
          rEcartFrais.getCell(2).font = { bold: true, color: { argb: 'FFC0392B' } };
        }
        if (oppart.otherTypes.length) {
          wsSynth.addRow(['Autres types', '']);
          wsSynth.getRow(wsSynth.rowCount).getCell(1).font = { bold: true, italic: true, color: { argb: 'FF444444' }, size: 10 };
        }
        for (const t of oppart.otherTypes) {
          const r = wsSynth.addRow([t.type, t.volume]);
          r.getCell(2).numFmt = '#,##0';
        }
      }

      if (this.computed.trxboServiceBreakdown.hasData) {
        const trxbo = this.computed.trxboServiceBreakdown;
        wsSynth.addRow([]);
        wsSynth.addRow(['TRXBO par service et client']);
        wsSynth.getRow(wsSynth.rowCount).getCell(1).font = { bold: true, color: { argb: 'FF282E5E' }, size: 11 };
        wsSynth.addRow(['Service', 'Client', 'Nombre', 'Volume', 'Frais', 'Montant frais']).font = { bold: true };
        for (const s of trxbo.rows) {
          const r = wsSynth.addRow([s.service, s.agence, s.count, s.volume, s.frais || '', s.montantFrais || '']);
          r.getCell(3).numFmt = '#,##0';
          r.getCell(4).numFmt = '#,##0';
          r.getCell(5).numFmt = '#,##0.00';
          r.getCell(6).numFmt = '#,##0';
        }
        if (trxbo.rows.length > 1) {
          const r = wsSynth.addRow(['Total', '', trxbo.totalCount, trxbo.totalVolume, '', trxbo.totalMontantFrais]);
          r.getCell(3).numFmt = '#,##0';
          r.getCell(4).numFmt = '#,##0';
          r.getCell(6).numFmt = '#,##0';
          r.font = { bold: true };
        }
      }

      wsSynth.getColumn(1).width = 34;
      wsSynth.getColumn(2).width = 18;
      wsSynth.getColumn(3).width = 18;
      wsSynth.getColumn(4).width = 14;
      wsSynth.getColumn(5).width = 16;

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `${this.buildExportFileBase()}.xlsx`;
      saveAs(new Blob([buffer]), fileName);
      await this.popupService.showSuccess(`Le fichier ${fileName} a été téléchargé.`, 'Export Excel');
    } catch (e: any) {
      console.error('Erreur export Excel certification:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export Excel.', 'Erreur d\'export');
    } finally {
      this.isExportingExcel = false;
      this.cdr.markForCheck();
    }
  }

  async exportCompenseListExcel(): Promise<void> {
    if (!this.compenseLines.length) {
      await this.popupService.showWarning('Aucune ligne dans la liste des compenses à exporter.', 'Export impossible');
      return;
    }

    this.isExportingExcel = true;
    this.cdr.markForCheck();
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ReconciliApp';
      workbook.created = new Date();

      const wsComp = workbook.addWorksheet('Liste des compenses');
      this.styleExcelHeaderRow(wsComp.addRow(['Liste des compenses - Compense']));
      wsComp.mergeCells('A1:E1');
      wsComp.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

      wsComp.addRow([]);
      wsComp.addRow([`Total : ${this.formatNumber(this.compenseListeAbsTotal)}`]);
      wsComp.getRow(wsComp.rowCount).getCell(1).font = { bold: true };

      wsComp.addRow([]);
      this.styleExcelHeaderRow(wsComp.addRow(['N° Trans GU', 'Date', 'Agence', 'Montant', this.compenseRecon.loaded ? 'Statut' : '']));
      for (let i = 0; i < this.compenseLines.length; i++) {
        const line = this.compenseLines[i];
        const row = this.compenseRecon.loaded
          ? wsComp.addRow([
              line.numeroTransGu || '—',
              line.date || '—',
              line.agence || '—',
              line.montant,
              this.compenseRecon.isMatchedAt(i) ? 'OK' : 'KO'
            ])
          : wsComp.addRow([
              line.numeroTransGu || '—',
              line.date || '—',
              line.agence || '—',
              line.montant
            ]);
        row.getCell(4).numFmt = '#,##0';
      }

      const totalRow = this.compenseRecon.loaded
        ? wsComp.addRow(['Total liste', '', '', this.compenseListeAbsTotal, ''])
        : wsComp.addRow(['Total liste', '', '', this.compenseListeAbsTotal]);
      totalRow.getCell(1).font = { bold: true };
      totalRow.getCell(4).font = { bold: true };
      totalRow.getCell(4).numFmt = '#,##0';

      wsComp.getColumn(1).width = 24;
      wsComp.getColumn(2).width = 18;
      wsComp.getColumn(3).width = 18;
      wsComp.getColumn(4).width = 18;
      wsComp.getColumn(5).width = 12;

      const buffer = await workbook.xlsx.writeBuffer();
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const fileName = `Liste-Compense-${ts}.xlsx`;
      saveAs(new Blob([buffer]), fileName);
      await this.popupService.showSuccess(`Le fichier ${fileName} a été téléchargé.`, 'Export Excel');
    } catch (e: any) {
      console.error('Erreur export liste des compenses:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export.', 'Erreur d\'export');
    } finally {
      this.isExportingExcel = false;
      this.cdr.markForCheck();
    }
  }

  async exportCompenseRecoExcel(): Promise<void> {
    if (!this.compenseLines.length && !this.compenseRecon.loaded) {
      await this.popupService.showWarning('Chargez une liste des compenses ou un fichier de montants avant d\'exporter.', 'Export impossible');
      return;
    }

    this.isExportingExcel = true;
    this.cdr.markForCheck();
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ReconciliApp';
      workbook.created = new Date();

      const wsComp = workbook.addWorksheet('Compense');
      this.styleExcelHeaderRow(wsComp.addRow(['Réconciliation des compenses']));
      wsComp.mergeCells('A1:E1');
      wsComp.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

      wsComp.addRow([]);
      this.addExcelKeyValueRows(wsComp, [
        ['Total liste', this.compenseListeAbsTotal],
        ['Total fichier sélectionné', this.compenseFileTotal],
        [this.compenseEcartLabel, this.compenseFileEcart],
        ['OK', this.compenseOkCount],
        ['KO', this.compenseKoCount]
      ]);

      wsComp.addRow([]);
      if (this.compenseLines.length) {
        wsComp.addRow(['Liste des compenses']);
        wsComp.getRow(wsComp.rowCount).getCell(1).font = { bold: true, color: { argb: 'FFA04000' }, size: 11 };
        this.styleExcelHeaderRow(wsComp.addRow(['N° Trans GU', 'Date', 'Agence', 'Montant', 'Statut']));
        for (let i = 0; i < this.compenseLines.length; i++) {
          const line = this.compenseLines[i];
          const r = wsComp.addRow([
            line.numeroTransGu || '—',
            line.date || '—',
            line.agence || '—',
            line.montant,
            this.compenseRecon.loaded ? (this.compenseRecon.isMatchedAt(i) ? 'OK' : 'KO') : '—'
          ]);
          r.getCell(4).numFmt = '#,##0';
        }
        const totalRow = wsComp.addRow(['Total liste', '', '', this.compenseListeAbsTotal, '']);
        totalRow.getCell(1).font = { bold: true };
        totalRow.getCell(4).font = { bold: true };
        totalRow.getCell(4).numFmt = '#,##0';
        wsComp.addRow([]);
      }

      if (this.compenseRecon.loaded && this.compenseRecon.amounts.length) {
        const extra = this.compenseRecon.extraColumns;
        wsComp.addRow(['Fichier des montants — ' + (this.compenseRecon.fileName || '')]);
        wsComp.getRow(wsComp.rowCount).getCell(1).font = { bold: true, color: { argb: 'FFA04000' }, size: 11 };
        const fichierHeader = wsComp.addRow(['N°', 'Montant', ...extra, 'Statut']);
        this.styleExcelHeaderRow(fichierHeader);
        for (let i = 0; i < this.compenseRecon.amounts.length; i++) {
          const r = wsComp.addRow([
            i + 1,
            this.compenseRecon.amounts[i],
            ...extra.map((_, c) => this.compenseRecon.extraValues[i][c] ?? '—'),
            this.compenseRecon.isAmountMatchedAt(i) ? 'OK' : 'KO'
          ]);
          r.getCell(2).numFmt = '#,##0';
        }
        const totalFichier = wsComp.addRow(['Total', this.compenseRecon.fileTotal, ...extra.map(() => ''), '']);
        totalFichier.getCell(1).font = { bold: true };
        totalFichier.getCell(2).font = { bold: true };
        totalFichier.getCell(2).numFmt = '#,##0';
      }

      wsComp.getColumn(1).width = 22;
      wsComp.getColumn(2).width = 16;
      wsComp.getColumn(3).width = 16;
      wsComp.getColumn(4).width = 16;
      wsComp.getColumn(5).width = 12;

      const buffer = await workbook.xlsx.writeBuffer();
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const fileName = `Reconciliation-Compense-${ts}.xlsx`;
      saveAs(new Blob([buffer]), fileName);
      await this.popupService.showSuccess(`Le fichier ${fileName} a été téléchargé.`, 'Export Excel');
    } catch (e: any) {
      console.error('Erreur export réconciliation des compenses:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export.', 'Erreur d\'export');
    } finally {
      this.isExportingExcel = false;
      this.cdr.markForCheck();
    }
  }

  async exportCompenseRecoPdf(): Promise<void> {
    if (!this.compenseLines.length && !this.compenseRecon.loaded) {
      await this.popupService.showWarning('Chargez une liste des compenses ou un fichier de montants avant d\'exporter.', 'Export impossible');
      return;
    }

    const element = this.directCompenseTablesRef?.nativeElement;
    if (!element) {
      await this.popupService.showError('Section réconciliation des compenses introuvable.', 'Erreur d\'export');
      return;
    }

    this.isExportingPdf = true;
    this.cdr.markForCheck();
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 150));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth
      });

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableW = pageW - 2 * margin;
      const usableH = pageH - 2 * margin;

      const ratio = usableW / canvas.width;
      const pageCanvasH = usableH / ratio;

      let position = 0;
      let firstPage = true;
      while (position < canvas.height) {
        const h = Math.min(pageCanvasH, canvas.height - position);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = h;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, position, canvas.width, h, 0, 0, canvas.width, h);
        }
        if (!firstPage) {
          pdf.addPage();
        }
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, usableW, h * ratio);
        position += h;
        firstPage = false;
      }

      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const fileName = `Reconciliation-Compense-${ts}.pdf`;
      const blob = pdf.output('blob');
      this.pdfPreviewBlob = blob;
      this.pdfPreviewFileName = fileName;
      if (this.pdfPreviewUrl) {
        URL.revokeObjectURL(this.pdfPreviewUrl);
      }
      this.pdfPreviewUrl = URL.createObjectURL(blob);
      this.showPdfPreview = true;
      this.cdr.markForCheck();
    } catch (e: any) {
      console.error('Erreur export PDF réconciliation des compenses:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export PDF.', 'Erreur d\'export');
    } finally {
      this.isExportingPdf = false;
      this.cdr.markForCheck();
    }
  }

  async exportEcartAggregates(): Promise<void> {
    if (!this.canExport || !this.computed) {
      await this.popupService.showWarning('Aucune donnée d’agrégats des écarts à exporter.', 'Export impossible');
      return;
    }

    this.isExportingAggregates = true;
    this.cdr.markForCheck();
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ReconciliApp';
      workbook.created = new Date();

      const wsAgg = workbook.addWorksheet('Agrégats des écarts');
      this.styleExcelHeaderRow(wsAgg.addRow([this.reconciliationTitle]));
      wsAgg.mergeCells('A1:E1');
      wsAgg.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

      wsAgg.addRow([]);
      this.styleExcelHeaderRow(wsAgg.addRow(['Type', 'Nombre', 'Variation', 'Frais', 'À régulariser']));

      for (const row of this.computed.aggregates) {
        const r = wsAgg.addRow([
          row.label,
          row.count,
          row.volume,
          row.frais || '',
          row.montantARegulariser || ''
        ]);
        r.getCell(3).numFmt = '#,##0';
        r.getCell(4).numFmt = '#,##0';
        r.getCell(5).numFmt = '#,##0';
      }

      wsAgg.addRow([]);
      const controlHeader = wsAgg.addRow(['Contrôle : Total à régulariser = Écart partenaire (IMPACT_COMPTE_GENERAL, FRAIS_TRANSACTION, VERSEMENT_COMMISSION) + RGFRAIS + TSOP + TRX SF']);
      controlHeader.getCell(1).font = { bold: true, size: 11, color: { argb: 'FFA04000' } };

      for (const part of [
        { label: 'Écart partenaire (IMPACT_COMPTE_GENERAL, FRAIS_TRANSACTION, VERSEMENT_COMMISSION)', value: this.totalEcartPartenaire },
        { label: 'RGFRAIS', value: this.totalRgFrais },
        { label: 'TSOP', value: this.totalTsop },
        { label: 'TRX SF', value: this.totalTrxSf }
      ]) {
        const partRow = wsAgg.addRow([part.label, '', '', '', part.value]);
        partRow.getCell(5).numFmt = '#,##0';
      }
      const totalRow = wsAgg.addRow(['Total à régulariser', '', '', '', this.computed.totalRegularisation]);
      totalRow.getCell(1).font = { bold: true };
      totalRow.getCell(5).font = { bold: true };
      totalRow.getCell(5).numFmt = '#,##0';

      wsAgg.columns = [
        { width: 38 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 18 }
      ];

      const wsDetail = workbook.addWorksheet('Détail régularisation');
      this.styleExcelHeaderRow(wsDetail.addRow([this.reconciliationTitle]));
      wsDetail.mergeCells('A1:I1');
      wsDetail.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };

      wsDetail.addRow([]);
      this.styleExcelHeaderRow(wsDetail.addRow([
        'Type', 'N° Trans GU', 'Service', 'Agence', 'Date',
        'Montant OPPART', 'Montant TRXBO', 'Frais', 'À régulariser'
      ]));

      const details = this.computed.regularisationDetails;
      if (!details.length) {
        wsDetail.addRow(['Aucune ligne de détail.']);
      }
      for (const d of details) {
        const r = wsDetail.addRow([
          d.type,
          d.numeroTransGu || '—',
          d.service || '—',
          d.agence || '—',
          d.date || '—',
          d.montant,
          d.montantBo ?? '',
          d.frais || '',
          d.montantARegulariser
        ]);
        r.getCell(6).numFmt = '#,##0';
        r.getCell(7).numFmt = '#,##0';
        r.getCell(8).numFmt = '#,##0';
        r.getCell(9).numFmt = '#,##0';
      }

      wsDetail.columns = [
        { width: 18 }, { width: 22 }, { width: 30 }, { width: 18 }, { width: 14 },
        { width: 16 }, { width: 16 }, { width: 14 }, { width: 18 }
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `${this.buildEcartAggregatesFileBase()}.xlsx`;
      saveAs(new Blob([buffer]), fileName);
      await this.popupService.showSuccess(`Le fichier ${fileName} a été téléchargé.`, 'Export Agrégats');
    } catch (e: any) {
      console.error('Erreur export agrégats des écarts:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export des agrégats.', 'Erreur d\'export');
    } finally {
      this.isExportingAggregates = false;
      this.cdr.markForCheck();
    }
  }

  async exportEcartAggregatesPdf(): Promise<void> {
    if (!this.canExport || !this.computed) {
      await this.popupService.showWarning('Aucune donnée d’agrégats à exporter en PDF.', 'Export impossible');
      return;
    }

    const element = this.aggregatesPanelRef?.nativeElement;
    if (!element) {
      await this.popupService.showError('Section Agrégats des écarts introuvable.', 'Erreur d\'export');
      return;
    }

    this.isExportingAggregatesPdf = true;
    this.cdr.markForCheck();
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 150));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableW = pageW - 2 * margin;
      const usableH = pageH - 2 * margin;

      const ratio = usableW / canvas.width;
      const pageCanvasH = usableH / ratio;

      let position = 0;
      let firstPage = true;
      while (position < canvas.height) {
        const h = Math.min(pageCanvasH, canvas.height - position);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = h;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, position, canvas.width, h, 0, 0, canvas.width, h);
        }
        if (!firstPage) {
          pdf.addPage();
        }
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, usableW, h * ratio);
        position += h;
        firstPage = false;
      }

      const fileName = `${this.buildEcartAggregatesFileBase()}.pdf`;
      const blob = pdf.output('blob');
      this.pdfPreviewBlob = blob;
      this.pdfPreviewFileName = fileName;
      if (this.pdfPreviewUrl) {
        URL.revokeObjectURL(this.pdfPreviewUrl);
      }
      this.pdfPreviewUrl = URL.createObjectURL(blob);
      this.showPdfPreview = true;
      this.cdr.markForCheck();
    } catch (e: any) {
      console.error('Erreur export PDF agrégats des écarts:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export PDF des agrégats.', 'Erreur d\'export');
    } finally {
      this.isExportingAggregatesPdf = false;
      this.cdr.markForCheck();
    }
  }

  async exportToPdf(): Promise<void> {
    if (!this.canExport || !this.computed) {
      await this.popupService.showWarning('Aucune donnée de certification à exporter.', 'Export impossible');
      return;
    }

    const element = this.pdfExportContentRef?.nativeElement;
    if (!element) {
      await this.popupService.showError('Zone d\'export PDF introuvable.', 'Erreur d\'export');
      return;
    }

    this.isExportingPdf = true;
    this.cdr.markForCheck();
    await Promise.all([
      new Promise<void>(resolve => setTimeout(resolve, 150)),
      this.ensurePdfLogo()
    ]);

    try {
      const blob = await this.buildCertificationPdfBlob(element);
      this.showPdfBlobPreview(blob, `${this.buildExportFileBase()}.pdf`);
    } catch (e: any) {
      console.error('Erreur export PDF certification:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export PDF.', 'Erreur d\'export');
    } finally {
      this.isExportingPdf = false;
      this.cdr.markForCheck();
    }
  }

  private showPdfBlobPreview(blob: Blob, fileName: string): void {
    this.pdfPreviewBlob = blob;
    this.pdfPreviewFileName = fileName;
    if (this.pdfPreviewUrl) {
      URL.revokeObjectURL(this.pdfPreviewUrl);
    }
    this.pdfPreviewUrl = URL.createObjectURL(blob);
    this.showPdfPreview = true;
    this.cdr.markForCheck();
  }

  /**
   * PDF A4 portrait d'un document de certification : en-tête, bandeau et sections
   * (`.pdf-export-header`, `.pdf-solde-banner`, `.pdf-export-section`) réduits pour tenir sur une page.
   */
  private async buildCertificationPdfBlob(element: HTMLElement): Promise<Blob> {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const marginX = 16;
    const marginY = 6;
    const pageW = pdfW - 2 * marginX;
    const contentPerPage = pdfH - 2 * marginY;
    const gapBetweenBlocks = 2;

    const blocks: HTMLElement[] = [];
    const headerEl = element.querySelector<HTMLElement>('.pdf-export-header');
    const bannerEl = element.querySelector<HTMLElement>('.pdf-solde-banner');
    if (headerEl) {
      blocks.push(headerEl);
    }
    if (bannerEl) {
      blocks.push(bannerEl);
    }
    blocks.push(...Array.from(element.querySelectorAll<HTMLElement>('.pdf-export-section')));

    const rendered: { canvas: HTMLCanvasElement; heightPx: number; ratio: number }[] = [];
    for (const block of blocks) {
      const blockCanvas = await html2canvas(block, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      rendered.push({
        canvas: blockCanvas,
        heightPx: blockCanvas.height,
        ratio: pageW / blockCanvas.width
      });
    }

    const sumBlockHeightsMm = rendered.reduce((sum, b) => sum + b.heightPx * b.ratio, 0);
    const minGapsMm = gapBetweenBlocks * Math.max(0, rendered.length - 1);
    const totalWithMinGaps = sumBlockHeightsMm + minGapsMm;
    const fitScale = totalWithMinGaps > contentPerPage ? contentPerPage / totalWithMinGaps : 1;

    // Ajuste au contenu réel : espacement fixe entre les blocs, aucun étirement
    // pour occuper toute la hauteur de la page (le reste reste en bas de page).
    const gapMm = rendered.length > 1 ? gapBetweenBlocks * fitScale : 0;

    let y = marginY;
    for (const block of rendered) {
      const blockHeightMm = block.heightPx * block.ratio * fitScale;
      const blockWidthMm = pageW * fitScale;
      const x = marginX + (pageW - blockWidthMm) / 2;
      pdf.addImage(block.canvas.toDataURL('image/png'), 'PNG', x, y, blockWidthMm, blockHeightMm);
      y += blockHeightMm + gapMm;
    }

    return pdf.output('blob');
  }

  downloadPdfPreview(): void {
    if (!this.pdfPreviewBlob) {
      return;
    }
    saveAs(this.pdfPreviewBlob, this.pdfPreviewFileName);
    void this.popupService.showSuccess(`Le fichier ${this.pdfPreviewFileName} a été téléchargé.`, 'Export PDF');
  }

  closePdfPreview(): void {
    this.showPdfPreview = false;
    if (this.pdfPreviewUrl) {
      URL.revokeObjectURL(this.pdfPreviewUrl);
      this.pdfPreviewUrl = null;
    }
    this.pdfPreviewBlob = null;
    this.cdr.markForCheck();
  }

  private async ensurePdfLogo(): Promise<string | null> {
    if (this.pdfLogoDataUrl) {
      return this.pdfLogoDataUrl;
    }
    if (!this.pdfLogoPromise) {
      this.pdfLogoPromise = this.loadPdfLogoAsDataUrl().then(dataUrl => {
        this.pdfLogoDataUrl = dataUrl;
        return dataUrl;
      });
    }
    return this.pdfLogoPromise;
  }

  private async loadPdfLogoAsDataUrl(): Promise<string | null> {
    try {
      const response = await fetch('assets/point-touch-logo.png');
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      return await new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  private buildExportFileBase(): string {
    const compte = (this.numeroCompte || 'compte').replace(/[^\w-]+/g, '-');
    const dateDe = (this.dateCertificationDe || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const dateAu = (this.dateCertificationAu || dateDe).replace(/-/g, '');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `Certification-Solde-${compte}-${dateDe}-${dateAu}-${ts}`;
  }

  private buildEcartAggregatesFileBase(): string {
    const compte = (this.numeroCompte || 'compte').replace(/[^\w-]+/g, '-');
    const dateDe = (this.dateCertificationDe || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const dateAu = (this.dateCertificationAu || dateDe).replace(/-/g, '');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `Agregats-Ecarts-${compte}-${dateDe}-${dateAu}-${ts}`;
  }

  private styleExcelHeaderRow(row: ExcelJS.Row): void {
    row.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF282E5E' }
      };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  }

  private addExcelKeyValueRows(
    worksheet: ExcelJS.Worksheet,
    rows: Array<[string, string | number | null | undefined]>
  ): void {
    for (const [label, value] of rows) {
      const row = worksheet.addRow([label, value ?? '—']);
      row.getCell(1).font = { bold: true, color: { argb: 'FF555555' } };
      if (typeof value === 'number') {
        row.getCell(2).numFmt = '#,##0';
      }
    }
  }

  refreshComputed(): void {
    this.resetAggregatePages();
    if (!this.response) {
      this.computed = null;
      this.variation = null;
      this.ecartCertification = null;
      return;
    }

    const partnerData = this.appState.getPartnerData() ?? [];
    const boData = this.appState.getBoData() ?? [];

    this.computed = this.certificationService.compute({
      response: this.response,
      partnerData,
      boData,
      fraisConfigs: this.fraisConfigs,
      commissionConfigs: this.commissionConfigs,
      dateDe: this.dateCertificationDe,
      dateAu: this.dateCertificationAu
    });

    if (!this.soldeOuvertureSaisi) {
      this.soldeOuverture = this.computed.soldeOuvertureOppart;
    }
    if (!this.soldeClotureSaisi) {
      this.soldeCloture = this.computed.soldeClotureOppart;
    }

    this.recalculateDerived();
  }

  onSoldeOuvertureChange(): void {
    this.soldeOuvertureSaisi = true;
    this.recalculateDerived();
  }

  onSoldeClotureChange(): void {
    this.soldeClotureSaisi = true;
    this.recalculateDerived();
  }

  onDateRangeChange(): void {
    this.normalizeDateRange();
    this.refreshComputed();
  }

  /**
   * Modification des bornes (date / heure d'ouverture et de clôture) : on ne
   * déclenche AUCUN recalcul. Les valeurs servent au libellé et à
   * l'enregistrement ; le recalcul reste à la main via {@link recalculerPeriode}.
   */
  onBoundaryChange(): void {
    this.normalizeDateRange();
  }

  /** Recalcul explicite de la période (agrégats / suggestions OPPART). */
  recalculerPeriode(): void {
    this.onDateRangeChange();
  }

  private applyPeriodeFromOppart(): void {
    const periode = this.certificationService.extractPeriodeOppart(this.appState.getPartnerData() ?? []);
    if (!periode) {
      return;
    }
    this.dateCertificationDe = periode.dateDe;
    this.dateCertificationAu = periode.dateAu;
    this.normalizeDateRange();
  }

  private normalizeDateRange(): void {
    if (this.dateCertificationDe && this.dateCertificationAu && this.dateCertificationDe > this.dateCertificationAu) {
      this.dateCertificationAu = this.dateCertificationDe;
    }
  }

  private isDateRangeValid(): boolean {
    return !!(this.dateCertificationDe && this.dateCertificationAu && this.dateCertificationDe <= this.dateCertificationAu);
  }

  recalculateDerived(): void {
    this.variation = this.certificationService.computeVariation(this.soldeOuverture, this.soldeCloture);
    if (!this.computed) {
      this.ecartCertification = null;
      return;
    }
    this.ecartCertification = this.certificationService.computeEcartCertification(
      this.variation,
      this.computed.mouvementNetOppart
    );
  }

  async loadSavedSoldes(): Promise<void> {
    if (!this.numeroCompte?.trim() || !this.isDateRangeValid()) {
      await this.popupService.showWarning('Renseignez le numéro de compte et la période (du / au).', 'Champs requis');
      return;
    }
    this.isLoadingSoldes = true;
    try {
      const [ouverture, cloture] = await Promise.all([
        this.certificationService.loadSoldeOuverture(this.numeroCompte.trim(), this.dateCertificationDe),
        this.certificationService.loadSoldeCloture(this.numeroCompte.trim(), this.dateCertificationAu)
      ]);
      if (ouverture != null) {
        this.soldeOuverture = ouverture;
        this.soldeOuvertureSaisi = true;
      }
      if (cloture != null) {
        this.soldeCloture = cloture;
        this.soldeClotureSaisi = true;
      }
      this.recalculateDerived();
      await this.popupService.showSuccess('Soldes chargés depuis la base.', 'Chargement');
    } finally {
      this.isLoadingSoldes = false;
    }
  }

  applyOppartSuggestedSoldes(): void {
    if (!this.computed) return;
    this.soldeOuvertureSaisi = false;
    this.soldeClotureSaisi = false;
    if (this.computed.soldeOuvertureOppart != null) {
      this.soldeOuverture = this.computed.soldeOuvertureOppart;
    }
    if (this.computed.soldeClotureOppart != null) {
      this.soldeCloture = this.computed.soldeClotureOppart;
    }
    this.recalculateDerived();
  }

  async saveCertification(): Promise<void> {
    if (!this.numeroCompte?.trim() || !this.isDateRangeValid()) {
      await this.popupService.showWarning('Renseignez le numéro de compte et la période (du / au) pour sauvegarder.', 'Champs requis');
      return;
    }
    if (this.soldeOuverture == null || this.soldeCloture == null) {
      await this.popupService.showWarning('Renseignez le solde d\'ouverture et de clôture.', 'Soldes requis');
      return;
    }

    if (!this.computed) {
      await this.popupService.showWarning('Aucun résultat de certification à enregistrer.', 'Sauvegarde');
      return;
    }

    this.saveMetaEnv = this.env;
    this.saveMetaPays = this.pays;
    this.cancelCreatePaysForm();
    this.showSaveMetaModal = true;
    this.cdr.markForCheck();
  }

  get canConfirmSaveMeta(): boolean {
    return !!this.saveMetaEnv && (!!this.saveMetaPays || !this.paysOptions.length);
  }

  closeSaveMetaModal(): void {
    this.showSaveMetaModal = false;
    this.cancelCreatePaysForm();
    this.cdr.markForCheck();
  }

  async confirmSaveMeta(): Promise<void> {
    if (!this.canConfirmSaveMeta || this.isSaving) {
      return;
    }
    this.env = this.saveMetaEnv;
    this.pays = this.saveMetaPays;
    this.showSaveMetaModal = false;
    await this.persistCertification();
  }

  private async persistCertification(): Promise<void> {
    const resultat = this.buildResultatSnapshot();
    if (!resultat || this.soldeOuverture == null || this.soldeCloture == null) {
      await this.popupService.showWarning('Aucun résultat de certification à enregistrer.', 'Sauvegarde');
      return;
    }

    this.isSaving = true;
    try {
      await Promise.all([
        firstValueFrom(this.certificationService.saveSoldeOuverture(
          this.numeroCompte.trim(),
          this.dateCertificationDe,
          this.soldeOuverture
        )),
        firstValueFrom(this.certificationService.saveSoldeCloture(
          this.numeroCompte.trim(),
          this.dateCertificationAu,
          this.soldeCloture
        )),
        firstValueFrom(this.certificationService.saveResultat(resultat))
      ]);
      await this.popupService.showSuccess(
        'Certification de solde enregistrée. Elle est consultable via « Certifications enregistrées ».',
        'Sauvegarde'
      );
    } catch (e: any) {
      await this.popupService.showError(e?.error?.message || e?.message || 'Erreur lors de la sauvegarde.', 'Erreur');
    } finally {
      this.isSaving = false;
    }
  }

  /** Instantané du document PDF de certification (chiffres clés + tableaux). */
  private buildResultatSnapshot(): CertificationResultat | null {
    const c = this.computed;
    if (!c) {
      return null;
    }
    const ecartLoaded = this.ecartRecon.loaded;
    const details: CertificationResultatDetails = {
      regularisation: this.regularisationAggregates.map(r => ({
        label: r.label,
        count: r.count,
        volume: r.volume,
        frais: r.frais,
        montantARegulariser: r.montantARegulariser
      })),
      compense: this.compenseLines.length
        ? {
            parAgence: this.compenseParAgence,
            totalPartenaire: this.compenseRecon.loaded ? this.compenseFileTotal : null,
            ecartLabel: this.compenseRecon.loaded ? this.compenseEcartLabel : null,
            ecart: this.compenseRecon.loaded ? this.compenseFileEcart : null
          }
        : null,
      ecartPartenaire: this.ecartPartenaireLines.length
        ? {
            parAgence: this.ecartParAgence,
            totalListe: this.ecartListeTotal,
            totalFichier: ecartLoaded ? this.ecartFileTotal : null,
            ecartLabel: ecartLoaded ? this.ecartEcartLabel : null,
            ecart: ecartLoaded ? this.ecartFileEcart : null,
            lignes: ecartLoaded
              ? this.ecartPartenaireLines.map((l, i) => ({
                  numeroTransGu: l.numeroTransGu,
                  service: l.service,
                  agence: l.agence,
                  montant: l.montant,
                  statut: this.ecartRecon.isMatchedAt(i) ? 'OK' as const : 'KO' as const
                }))
              : [],
            okCount: ecartLoaded ? this.ecartOkCount : null,
            koCount: ecartLoaded ? this.ecartKoCount : null
          }
        : null,
      typesOperations: c.oppartOperationBreakdown.hasData
        ? c.oppartOperationBreakdown.otherTypes.map(t => ({ type: t.type, volume: t.volume }))
        : [],
      trxboParService: c.trxboServiceBreakdown.hasData
        ? {
            rows: c.trxboServiceBreakdown.rows.map(s => ({
              service: s.service,
              agence: s.agence,
              count: s.count,
              volume: s.volume,
              frais: s.frais,
              montantFrais: s.montantFrais
            })),
            totalCount: c.trxboServiceBreakdown.totalCount,
            totalVolume: c.trxboServiceBreakdown.totalVolume,
            totalMontantFrais: c.trxboServiceBreakdown.totalMontantFrais
          }
        : null
    };
    const fraisFactures = c.oppartOperationBreakdown.hasData ? c.oppartOperationBreakdown.frais : null;

    return {
      numeroCompte: this.numeroCompte.trim(),
      dateDebut: this.dateCertificationDe,
      dateFin: this.dateCertificationAu,
      env: this.env || null,
      pays: this.pays || null,
      heureOuverture: this.normalizeTime(this.heureOuverture, '00:00:00'),
      heureCloture: this.normalizeTime(this.heureCloture, '23:59:59'),
      titre: this.reconciliationTitle,
      soldeOuverture: this.soldeOuverture,
      soldeCloture: this.soldeCloture,
      totalDebit: c.totalDebit,
      totalCredit: c.totalCredit,
      variation: this.variation,
      mouvementNetOppart: c.mouvementNetOppart,
      fraisAttendu: c.fraisAttendu,
      fraisFactures,
      ecartFrais: fraisFactures != null ? this.ecartFrais : null,
      ecartMouvement: this.ecartCertification,
      totalRegularisation: c.totalRegularisation,
      ecartCertification: this.ecartCertificationSynthese,
      soldeClotureTheorique: this.soldeClotureTheorique,
      volumeEcartBo: c.volumeEcartBo,
      volumeEcartPartenaire: c.volumeEcartPartner,
      nbLignesBo: c.totals.totalBoRecords,
      nbLignesPartenaire: c.totals.totalPartnerRecords,
      nbCorrespondances: c.totals.matches,
      commentaire: this.commentaire?.trim() || null,
      detailsJson: JSON.stringify(details)
    };
  }

  openSavedCertifications(): void {
    this.showSavedPanel = true;
    this.savedResultat = null;
    this.savedDetails = null;
    this.savedPaysDraft = '';
    this.cancelCreatePaysForm();
    if (!this.savedFilter.numeroCompte && this.numeroCompte?.trim()) {
      this.savedFilter.numeroCompte = this.numeroCompte.trim();
    }
    void this.searchSavedCertifications();
  }

  closeSavedPanel(): void {
    this.showSavedPanel = false;
    this.savedResultat = null;
    this.savedDetails = null;
    this.savedPaysDraft = '';
    this.cancelCreatePaysForm();
    this.cdr.markForCheck();
  }

  /** Nouvelle recherche : repart de la première page. */
  searchSavedCertifications(): Promise<void> {
    this.savedPage = 0;
    return this.loadSavedCertifications();
  }

  goToSavedPage(page: number): void {
    if (page < 0 || page >= this.savedTotalPages || page === this.savedPage || this.isLoadingSaved) {
      return;
    }
    this.savedPage = page;
    void this.loadSavedCertifications();
  }

  onSavedPageSizeChange(): void {
    void this.searchSavedCertifications();
  }

  get savedRangeStart(): number {
    return this.savedTotalElements ? this.savedPage * this.savedPageSize + 1 : 0;
  }

  get savedRangeEnd(): number {
    return Math.min((this.savedPage + 1) * this.savedPageSize, this.savedTotalElements);
  }

  paysLabel(code: string | null | undefined): string {
    if (!code) return '—';
    const p = this.paysOptions.find(o => o.code === code);
    return p ? `${p.code} - ${p.nom}` : code;
  }

  /** Ouvre (ou referme) le formulaire de création d'un pays pour le popup indiqué. */
  toggleCreatePaysForm(target: 'save' | 'saved'): void {
    if (this.paysFormTarget === target) {
      this.cancelCreatePaysForm();
      return;
    }
    this.paysFormTarget = target;
    this.paysFormCode = '';
    this.paysFormNom = '';
    this.cdr.markForCheck();
  }

  cancelCreatePaysForm(): void {
    this.paysFormTarget = null;
    this.paysFormCode = '';
    this.paysFormNom = '';
    this.cdr.markForCheck();
  }

  /** Crée un pays dans le référentiel et le sélectionne dans le popup d'origine. */
  async createPays(): Promise<void> {
    if (this.isCreatingPays) {
      return;
    }
    const code = (this.paysFormCode || '').trim().toUpperCase();
    const nom = (this.paysFormNom || '').trim();
    if (!code || !nom) {
      await this.popupService.showWarning(this.translate.instant('CS.saved.countryRequired'), 'Pays');
      return;
    }
    if (this.paysOptions.some(p => (p.code || '').toUpperCase() === code)) {
      await this.popupService.showWarning(`Le pays ${code} existe déjà.`, 'Pays');
      return;
    }
    const target = this.paysFormTarget;
    this.isCreatingPays = true;
    this.cdr.markForCheck();
    try {
      const created = await firstValueFrom(this.paysService.createPays({ code, nom }));
      const pays: Pays = {
        id: created?.id,
        code: (created?.code || code).toUpperCase(),
        nom: created?.nom || nom
      };
      this.paysOptions = [...this.paysOptions.filter(p => p.code !== pays.code), pays]
        .sort((a, b) => a.code.localeCompare(b.code));
      if (target === 'saved') {
        this.savedPaysDraft = pays.code;
      } else {
        this.saveMetaPays = pays.code;
      }
      this.cancelCreatePaysForm();
      await this.popupService.showSuccess(this.translate.instant('CS.saved.countryCreated'), 'Pays');
    } catch (e: any) {
      await this.popupService.showError(
        e?.error?.message || e?.message || 'Erreur lors de la création du pays.',
        'Pays'
      );
    } finally {
      this.isCreatingPays = false;
      this.cdr.markForCheck();
    }
  }

  /** Enregistre le pays affecté à la certification consultée. */
  async saveSavedPays(): Promise<void> {
    if (!this.savedResultat?.id || this.isSavingSavedPays) {
      return;
    }
    const id = this.savedResultat.id;
    const pays = (this.savedPaysDraft || '').trim() || null;
    this.isSavingSavedPays = true;
    this.cdr.markForCheck();
    try {
      const updated = await firstValueFrom(this.certificationService.updateResultatPays(id, pays));
      if (this.savedResultat?.id === id) {
        this.savedResultat = { ...this.savedResultat, pays: updated?.pays ?? pays };
      }
      this.savedList = this.savedList.map(row => (row.id === id ? { ...row, pays: updated?.pays ?? pays } : row));
      await this.popupService.showSuccess(this.translate.instant('CS.saved.countrySaved'), 'Pays');
    } catch (e: any) {
      await this.popupService.showError(
        e?.error?.message || e?.message || 'Impossible de mettre à jour le pays.',
        'Pays'
      );
    } finally {
      this.isSavingSavedPays = false;
      this.cdr.markForCheck();
    }
  }

  private loadPaysOptions(): void {
    this.subscription.add(
      this.paysService.getPays().subscribe({
        next: pays => {
          this.paysOptions = [...(pays ?? [])].sort((a, b) => a.code.localeCompare(b.code));
          this.cdr.markForCheck();
        },
        error: () => {
          this.paysOptions = [];
        }
      })
    );
  }

  async loadSavedCertifications(): Promise<void> {
    this.isLoadingSaved = true;
    this.cdr.markForCheck();
    try {
      const page = await firstValueFrom(
        this.certificationService.listResultats(this.savedFilter, this.savedPage, this.savedPageSize)
      );
      this.savedList = page?.content ?? [];
      this.savedTotalElements = page?.totalElements ?? 0;
      this.savedTotalPages = page?.totalPages ?? 0;
      // Page devenue vide (ex. dernière ligne supprimée) : on revient à la dernière page existante.
      if (!this.savedList.length && this.savedPage > 0 && this.savedTotalPages > 0) {
        this.savedPage = this.savedTotalPages - 1;
        await this.loadSavedCertifications();
        return;
      }
    } catch (e: any) {
      this.savedList = [];
      this.savedTotalElements = 0;
      this.savedTotalPages = 0;
      await this.popupService.showError(
        e?.error?.message || e?.message || 'Impossible de charger les certifications enregistrées.',
        'Certifications enregistrées'
      );
    } finally {
      this.isLoadingSaved = false;
      this.cdr.markForCheck();
    }
  }

  resetSavedFilter(): void {
    this.savedFilter = CertificationSoldeComponent.emptySavedFilter();
    void this.searchSavedCertifications();
  }

  async consultSaved(row: CertificationResultatSummary): Promise<void> {
    this.isLoadingSaved = true;
    this.cdr.markForCheck();
    try {
      const resultat = await firstValueFrom(this.certificationService.getResultat(row.id));
      this.savedDetails = this.parseSavedDetails(resultat.detailsJson);
      this.savedResultat = resultat;
      this.savedPaysDraft = resultat.pays || '';
      this.cancelCreatePaysForm();
    } catch (e: any) {
      await this.popupService.showError(
        e?.error?.message || e?.message || 'Impossible de charger cette certification.',
        'Certifications enregistrées'
      );
    } finally {
      this.isLoadingSaved = false;
      this.cdr.markForCheck();
    }
  }

  backToSavedList(): void {
    this.savedResultat = null;
    this.savedDetails = null;
    this.savedPaysDraft = '';
    this.cancelCreatePaysForm();
    this.cdr.markForCheck();
  }

  async deleteSaved(row: CertificationResultatSummary): Promise<void> {
    const periode = this.formatPeriodeFr(row.dateDebut, row.dateFin);
    const confirmed = await this.popupService.showConfirm(
      `Supprimer la certification du compte ${row.numeroCompte} (${periode}) ? Cette action est définitive.`,
      'Supprimer la certification'
    );
    if (!confirmed) {
      return;
    }
    try {
      await firstValueFrom(this.certificationService.deleteResultat(row.id));
      if (this.savedResultat?.id === row.id) {
        this.backToSavedList();
      }
      await this.loadSavedCertifications();
    } catch (e: any) {
      await this.popupService.showError(e?.error?.message || e?.message || 'Erreur lors de la suppression.', 'Erreur');
    }
  }

  async exportSavedPdf(): Promise<void> {
    const element = this.savedDocContentRef?.nativeElement;
    if (!this.savedResultat || !element || this.isExportingSavedPdf) {
      return;
    }
    this.isExportingSavedPdf = true;
    this.cdr.markForCheck();
    try {
      await this.ensurePdfLogo();
      this.cdr.detectChanges();
      const blob = await this.buildCertificationPdfBlob(element);
      const r = this.savedResultat;
      const compte = (r.numeroCompte || 'compte').replace(/[^\w-]+/g, '-');
      const fileName = `Certification-Solde-${compte}-${r.dateDebut.replace(/-/g, '')}-${r.dateFin.replace(/-/g, '')}.pdf`;
      this.showPdfBlobPreview(blob, fileName);
    } catch (e: any) {
      console.error('Erreur export PDF certification enregistrée:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export PDF.', 'Erreur d\'export');
    } finally {
      this.isExportingSavedPdf = false;
      this.cdr.markForCheck();
    }
  }

  savedSoldeBanner(r: CertificationResultat): string {
    return this.buildSoldeBanner(r.dateDebut, r.dateFin, r.numeroCompte, r.soldeCloture);
  }

  /** Exporte la liste des certifications enregistrées (filtre courant, toutes les pages) en PDF. */
  async exportSavedListPdf(): Promise<void> {
    if (this.isExportingSavedListPdf) {
      return;
    }
    this.isExportingSavedListPdf = true;
    this.cdr.markForCheck();
    try {
      const rows = await this.fetchAllSavedForExport();
      if (!rows.length) {
        await this.popupService.showWarning('Aucune certification à exporter.', 'Export impossible');
        return;
      }
      const pdf = this.buildSavedListPdf(rows);
      const fileName = `Certifications-enregistrees-${this.buildSavedListTimestamp()}.pdf`;
      this.showPdfBlobPreview(pdf.output('blob'), fileName);
    } catch (e: any) {
      console.error('Erreur export PDF liste des certifications enregistrées:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export PDF.', 'Erreur d\'export');
    } finally {
      this.isExportingSavedListPdf = false;
      this.cdr.markForCheck();
    }
  }

  /** Exporte la liste des certifications enregistrées (filtre courant, toutes les pages) en Excel. */
  async exportSavedListExcel(): Promise<void> {
    if (this.isExportingSavedListExcel) {
      return;
    }
    this.isExportingSavedListExcel = true;
    this.cdr.markForCheck();
    try {
      const rows = await this.fetchAllSavedForExport();
      if (!rows.length) {
        await this.popupService.showWarning('Aucune certification à exporter.', 'Export impossible');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ReconciliApp';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Certifications');
      const headers = [
        'Compte', 'Environnement', 'Pays', 'Période du', 'Période au',
        'Solde ouverture', 'Solde clôture', 'Écart mouvement', 'Écart certification',
        'Solde clôture théorique', 'Commentaire', 'Enregistrée le', 'Enregistrée par'
      ];
      const colCount = headers.length;

      ws.addRow([`Certifications enregistrées`]);
      ws.mergeCells(1, 1, 1, colCount);
      const titleCell = ws.getCell(1, 1);
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF282E5E' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      ws.getRow(1).height = 22;

      ws.addRow([this.buildSavedListExportSubtitle(rows.length)]);
      ws.mergeCells(2, 1, 2, colCount);
      const subtitleCell = ws.getCell(2, 1);
      subtitleCell.font = { italic: true, size: 9, color: { argb: 'FF666666' } };

      ws.addRow([]);
      const headerRow = ws.addRow(headers);
      this.styleExcelHeaderRow(headerRow);

      for (const row of rows) {
        const excelRow = ws.addRow([
          row.numeroCompte || '—',
          row.env || '—',
          row.pays || '—',
          row.dateDebut ? this.formatDateFr(row.dateDebut) : '—',
          row.dateFin ? this.formatDateFr(row.dateFin) : '—',
          row.soldeOuverture,
          row.soldeCloture,
          row.ecartMouvement,
          row.ecartCertification,
          row.soldeClotureTheorique,
          row.commentaire || '',
          this.formatDateTimeFr(row.updatedAt),
          row.updatedBy || row.createdBy || '—'
        ]);
        for (const col of [6, 7, 8, 9, 10]) {
          excelRow.getCell(col).numFmt = '#,##0';
        }
        if (row.ecartCertification != null && row.ecartCertification !== 0) {
          excelRow.getCell(9).font = { bold: true, color: { argb: 'FFC0392B' } };
        }
      }

      const sum = (pick: (r: CertificationResultatSummary) => number | null): number =>
        rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
      const totalRow = ws.addRow([
        `TOTAL (${rows.length})`, '', '', '', '',
        sum(r => r.soldeOuverture),
        sum(r => r.soldeCloture),
        sum(r => r.ecartMouvement),
        sum(r => r.ecartCertification),
        sum(r => r.soldeClotureTheorique),
        '', '', ''
      ]);
      totalRow.font = { bold: true };
      totalRow.eachCell(cell => {
        cell.border = { top: { style: 'thin', color: { argb: 'FF282E5E' } } };
      });
      for (const col of [6, 7, 8, 9, 10]) {
        totalRow.getCell(col).numFmt = '#,##0';
      }

      ws.columns = [
        { width: 22 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 12 },
        { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 },
        { width: 20 }, { width: 32 }, { width: 20 }, { width: 18 }
      ];
      ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
      ws.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: colCount }
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `Certifications-enregistrees-${this.buildSavedListTimestamp()}.xlsx`;
      saveAs(new Blob([buffer]), fileName);
      await this.popupService.showSuccess(
        `${rows.length} certification(s) exportée(s) dans ${fileName}.`,
        'Export Excel'
      );
    } catch (e: any) {
      console.error('Erreur export Excel liste des certifications enregistrées:', e);
      await this.popupService.showError(e?.message || 'Erreur lors de l\'export Excel.', 'Erreur d\'export');
    } finally {
      this.isExportingSavedListExcel = false;
      this.cdr.markForCheck();
    }
  }

  /** Charge toutes les lignes correspondant au filtre courant (le backend limite chaque page à 100). */
  private async fetchAllSavedForExport(): Promise<CertificationResultatSummary[]> {
    const size = 100;
    const maxPages = 200;
    const all: CertificationResultatSummary[] = [];
    let page = 0;
    let totalPages = 1;
    do {
      const result = await firstValueFrom(
        this.certificationService.listResultats(this.savedFilter, page, size)
      );
      all.push(...(result?.content ?? []));
      totalPages = result?.totalPages ?? 0;
      page++;
    } while (page < totalPages && page < maxPages);
    return all;
  }

  /** Résumé des filtres appliqués, affiché en sous-titre des exports. */
  private buildSavedListExportSubtitle(count: number): string {
    const f = this.savedFilter;
    const parts: string[] = [];
    if (f.numeroCompte?.trim()) {
      parts.push(`compte ${f.numeroCompte.trim()}`);
    }
    if (f.env) {
      parts.push(`environnement ${f.env}`);
    }
    if (f.pays) {
      parts.push(`pays ${this.paysLabel(f.pays)}`);
    }
    if (f.dateDebut || f.dateFin) {
      const du = f.dateDebut ? this.formatDateFr(f.dateDebut) : '…';
      const au = f.dateFin ? this.formatDateFr(f.dateFin) : '…';
      parts.push(`période ${du} → ${au}`);
    }
    const filters = parts.length ? `Filtres : ${parts.join(' · ')}` : 'Tous les enregistrements';
    const plural = count > 1 ? 's' : '';
    return `${filters} — ${count} certification${plural} — export du ${this.formatExportTimestamp()}`;
  }

  private buildSavedListTimestamp(): string {
    return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  /**
   * PDF paysage de la liste des certifications enregistrées : tableau multi-pages,
   * en-tête répété, cellules multi-lignes (pas de troncature), totaux et pagination.
   */
  private buildSavedListPdf(rows: CertificationResultatSummary[]): jsPDF {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentW = pageW - margin * 2;
    const pageBottom = pageH - 11;

    const bodyFont = 8;
    const headerFont = 7.8;
    const padX = 2.4;
    const lineH = 4.2;
    const headerLineH = 3.6;

    const columns: {
      label: string;
      weight: number;
      align: 'left' | 'right';
      value: (r: CertificationResultatSummary) => string;
      ecart?: boolean;
    }[] = [
      { label: 'Compte', weight: 30, align: 'left', value: r => r.numeroCompte || '—' },
      { label: 'Env.', weight: 11, align: 'left', value: r => r.env || '—' },
      { label: 'Pays', weight: 11, align: 'left', value: r => r.pays || '—' },
      { label: 'Période', weight: 36, align: 'left', value: r => this.formatPeriodeFr(r.dateDebut, r.dateFin) },
      { label: 'Solde ouverture', weight: 26, align: 'right', value: r => this.formatNumber(r.soldeOuverture) },
      { label: 'Solde clôture', weight: 26, align: 'right', value: r => this.formatNumber(r.soldeCloture) },
      { label: 'Écart certification', weight: 26, align: 'right', value: r => this.formatNumber(r.ecartCertification), ecart: true },
      { label: 'Enregistrée le', weight: 30, align: 'left', value: r => this.formatDateTimeFr(r.updatedAt) },
      { label: 'Par', weight: 28, align: 'left', value: r => r.updatedBy || r.createdBy || '—' }
    ];
    const totalWeight = columns.reduce((s, c) => s + c.weight, 0);
    const widths = columns.map(c => (c.weight / totalWeight) * contentW);

    const drawTableHeader = (top: number): number => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(headerFont);
      const lines = columns.map((column, i) =>
        pdf.splitTextToSize(column.label, widths[i] - padX * 2) as string[]
      );
      const maxLines = lines.reduce((max, cellLines) => Math.max(max, cellLines.length), 1);
      const height = maxLines * headerLineH + 4.8;

      pdf.setFillColor(40, 46, 94);
      pdf.rect(margin, top, contentW, height, 'F');
      pdf.setTextColor(255, 255, 255);

      let x = margin;
      lines.forEach((cellLines, i) => {
        const offset = (height - cellLines.length * headerLineH) / 2 + 2.7;
        cellLines.forEach((line, li) => {
          const tx = columns[i].align === 'right' ? x + widths[i] - padX : x + padX;
          pdf.text(line, tx, top + offset + li * headerLineH, { align: columns[i].align });
        });
        x += widths[i];
      });

      pdf.setTextColor(35, 35, 40);
      return top + height;
    };

    /** Prépare les lignes de chaque cellule : le texte est renvoyé à la ligne, jamais tronqué. */
    const prepareRow = (row: CertificationResultatSummary): { cells: string[][]; height: number } => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(bodyFont);
      const cells = columns.map((column, i) => {
        const raw = this.pdfSafeText(column.value(row)) || '—';
        return this.wrapPdfText(pdf, raw, widths[i] - padX * 2);
      });
      const maxLines = cells.reduce((max, cellLines) => Math.max(max, cellLines.length), 1);
      return { cells, height: Math.max(7.8, maxLines * lineH + 3.6) };
    };

    const drawRow = (
      row: CertificationResultatSummary,
      prepared: { cells: string[][]; height: number },
      top: number,
      index: number
    ): number => {
      if (index % 2 === 1) {
        pdf.setFillColor(246, 246, 250);
        pdf.rect(margin, top, contentW, prepared.height, 'F');
      }
      pdf.setDrawColor(226, 228, 235);
      pdf.setLineWidth(0.1);
      pdf.line(margin, top + prepared.height, margin + contentW, top + prepared.height);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(bodyFont);

      let x = margin;
      prepared.cells.forEach((cellLines, i) => {
        const danger = columns[i].ecart && row.ecartCertification != null && row.ecartCertification !== 0;
        pdf.setTextColor(danger ? 192 : 35, danger ? 57 : 35, danger ? 43 : 40);
        const offset = (prepared.height - cellLines.length * lineH) / 2 + 2.9;
        cellLines.forEach((line, li) => {
          const tx = columns[i].align === 'right' ? x + widths[i] - padX : x + padX;
          pdf.text(line, tx, top + offset + li * lineH, { align: columns[i].align });
        });
        x += widths[i];
      });

      pdf.setTextColor(35, 35, 40);
      return top + prepared.height;
    };

    // Bloc de titre
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(40, 46, 94);
    pdf.text('Certifications enregistrées', margin, 15);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 120);
    pdf.text(
      this.fitPdfText(pdf, this.pdfSafeText(this.buildSavedListExportSubtitle(rows.length)), contentW),
      margin,
      21
    );
    pdf.setDrawColor(210, 212, 220);
    pdf.setLineWidth(0.2);
    pdf.line(margin, 24, pageW - margin, 24);
    pdf.setTextColor(35, 35, 40);

    // Bandeau de synthèse : sa hauteur est réservée dès la dernière ligne du tableau
    // pour éviter une page ne contenant que le bandeau.
    const bandH = 10;
    const bandGap = 4;

    let top = drawTableHeader(27);

    rows.forEach((row, index) => {
      const prepared = prepareRow(row);
      const isLast = index === rows.length - 1;
      const needed = prepared.height + (isLast ? bandGap + bandH : 0);
      if (top + needed > pageBottom) {
        pdf.addPage();
        top = drawTableHeader(12);
      }
      top = drawRow(row, prepared, top, index);
    });

    // Bandeau de synthèse
    const totalEcart = rows.reduce((acc, r) => acc + (r.ecartCertification ?? 0), 0);
    let bandTop = top + bandGap;
    if (bandTop + bandH > pageBottom) {
      pdf.addPage();
      bandTop = 14;
    }

    pdf.setFillColor(232, 235, 246);
    pdf.rect(margin, bandTop, contentW, bandH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(40, 46, 94);
    const label = `Total : ${rows.length} certification${rows.length > 1 ? 's' : ''}`;
    pdf.text(this.pdfSafeText(label), margin + padX, bandTop + 6.4);
    pdf.text(
      this.pdfSafeText(`Écart certification cumulé : ${this.formatNumber(totalEcart)}`),
      margin + contentW - padX,
      bandTop + 6.4,
      { align: 'right' }
    );

    // Pied de page (numérotation + rappel du titre)
    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 155);
      pdf.text(`Page ${p} / ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
      pdf.text(
        this.pdfSafeText(`Certifications enregistrées — ${new Date().toLocaleDateString('fr-FR')}`),
        margin,
        pageH - 6
      );
    }
    pdf.setTextColor(0, 0, 0);
    return pdf;
  }

  /**
   * Normalise un texte pour les polices standard de jsPDF (WinAnsi) :
   * espaces fines/insécables produites par Intl, signe moins typographique,
   * flèches (non encodables, elles corrompent toute la chaîne) et caractères hors WinAnsi.
   */
  private pdfSafeText(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value
      .replace(/[\u202F\u00A0\u2009\u2007]/g, ' ')
      .replace(/\u2212/g, '-')
      .replace(/\u2192/g, '->')
      .replace(/\u2190/g, '<-')
      .replace(/\u2264/g, '<=')
      .replace(/\u2265/g, '>=')
      .replace(
        /[^\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g,
        '?'
      )
      .trim();
  }

  /** Tronque un texte pour qu'il tienne dans la largeur donnée (police courante du PDF). */
  private fitPdfText(pdf: jsPDF, text: string, maxWidth: number): string {
    if (!text) {
      return '';
    }
    if (pdf.getTextWidth(text) <= maxWidth) {
      return text;
    }
    let truncated = text;
    while (truncated.length > 1 && pdf.getTextWidth(`${truncated}…`) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}…`;
  }

  /**
   * Découpe un texte en lignes pour une largeur donnée en privilégiant les séparateurs
   * naturels (espaces, points, tirets, slashs) avant de couper un mot caractère par
   * caractère. Évite les coupures du type « yamar.ndao.admini / strateur ».
   */
  private wrapPdfText(pdf: jsPDF, text: string, maxWidth: number): string[] {
    const direct = pdf.splitTextToSize(text, maxWidth) as string[];
    if (direct.length <= 1) {
      return direct;
    }

    const tokens = text.match(/[^\s.\-_/]+[\s.\-_/]*|[.\-_/]+/g) ?? [text];
    const lines: string[] = [];
    let current = '';

    for (const token of tokens) {
      const candidate = current + token;
      if (!current || pdf.getTextWidth(candidate.trimEnd()) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current.trimEnd());
        current = token;
      }
    }
    if (current.trim()) {
      lines.push(current.trimEnd());
    }

    // Un jeton plus large que la colonne (ex. un très long numéro de compte) est coupé.
    return lines.flatMap(line =>
      pdf.getTextWidth(line) <= maxWidth ? [line] : (pdf.splitTextToSize(line, maxWidth) as string[])
    );
  }

  formatPeriodeFr(dateDe: string, dateAu: string): string {
    if (!dateDe || !dateAu) return '—';
    return dateDe === dateAu
      ? this.formatDateFr(dateDe)
      : `${this.formatDateFr(dateDe)} au ${this.formatDateFr(dateAu)}`;
  }

  formatDateTimeFr(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('fr-FR');
  }

  private parseSavedDetails(json: string | null): CertificationResultatDetails | null {
    if (!json) {
      return null;
    }
    try {
      return JSON.parse(json) as CertificationResultatDetails;
    } catch {
      return null;
    }
  }

  startNewCertification(): void {
    this.router.navigate(['/certification-solde/upload']);
  }

  /** Raccourci « Liste des compenses » : ouvre directement la réconciliation des compenses. */
  goToCompenseReconciliation(): void {
    this.router.navigate(['/certification-solde'], { queryParams: { focus: 'compense' } });
  }

  goToEcartBo(): void {
    this.router.navigate(['/ecart-bo']);
  }

  goToEcartPartner(): void {
    this.router.navigate(['/ecart-partner']);
  }

  goToMatches(): void {
    this.router.navigate(['/matches']);
  }

  formatNumber(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
  }

  formatExportTimestamp(): string {
    return new Date().toLocaleString('fr-FR');
  }

  formatDateFr(date: string): string {
    if (!date) return '—';
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) return date;
    return `${d}/${m}/${y}`;
  }

  formatDateTimeDe(): string {
    return this.dateCertificationDe
      ? `${this.formatDateFr(this.dateCertificationDe)} ${this.normalizeTime(this.heureOuverture, '00:00:00')}`
      : '';
  }

  formatDateTimeAu(): string {
    return this.dateCertificationAu
      ? `${this.formatDateFr(this.dateCertificationAu)} ${this.normalizeTime(this.heureCloture, '23:59:59')}`
      : '';
  }

  /** Normalise une heure en `HH:mm:ss` (une valeur vide reprend le défaut). */
  private normalizeTime(value: string | null | undefined, fallback: string): string {
    const raw = (value || '').trim();
    if (!raw) {
      return fallback;
    }
    const parts = raw.split(':');
    const h = (parts[0] || '00').padStart(2, '0');
    const m = (parts[1] || '00').padStart(2, '0');
    const s = (parts[2] || '00').padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  formatDateRangeLabel(): string {
    if (!this.dateCertificationDe || !this.dateCertificationAu) return '—';
    return `${this.formatDateFr(this.dateCertificationDe)} au ${this.formatDateFr(this.dateCertificationAu)}`;
  }

  private formatDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatPdfSoldeBanner(): string {
    return this.buildSoldeBanner(this.dateCertificationDe, this.dateCertificationAu, this.numeroCompte, this.soldeCloture);
  }

  private buildSoldeBanner(dateDe: string, dateAu: string, numeroCompte: string, soldeCloture: number | null): string {
    if (!dateDe || !dateAu) return '';
    const [yDe, mDe, dDe] = dateDe.split('-').map(Number);
    const [yAu, mAu, dAu] = dateAu.split('-').map(Number);
    const months = [
      'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
      'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'
    ];

    const firstDayOfMonth = dDe === 1 && mDe === mAu && yDe === yAu;
    const lastDays: Record<number, number> = {
      1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
      7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31
    };
    const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    if (mDe === 2 && isLeap(yDe)) lastDays[2] = 29;
    const lastDayOfMonth = dAu === lastDays[mAu] && mDe === mAu && yDe === yAu;

    const isFullYear = dDe === 1 && mDe === 1 && dAu === 31 && mAu === 12 && yDe === yAu;

    let label: string;
    if (isFullYear) {
      label = `SOLDE DE L'ANNÉE ${yDe}`;
    } else if (firstDayOfMonth && lastDayOfMonth) {
      label = `SOLDE DU MOIS DE ${months[mDe - 1]} ${yDe}`;
    } else {
      label = `SOLDE AU ${this.formatDateFr(dateAu)}`;
    }

    const compte = numeroCompte || '—';
    const solde = this.formatNumber(soldeCloture);
    return `${label} — COMPTE ${compte} — ${solde}`;
  }

  async onCompenseFileSelected(event: Event): Promise<void> {
    const data = await this.readReconFile(event.target as HTMLInputElement, 'Réconciliation Compense');
    if (!data) {
      return;
    }
    this.compenseRecon.load(data);
    this.compenseFileSource = 'file';
    this.rebuildCompenseMatching();
    this.cdr.markForCheck();
  }

  /** Charge la liste des compenses depuis un fichier Excel/CSV (sinon la liste calculée est utilisée). */
  async onCompenseListeFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    try {
      const rows = await this.readCompenseFileRows(file);
      const detected = this.detectCompenseColumns(rows);
      if (!detected) {
        await this.popupService.showWarning(
          'Aucune colonne de montant trouvée dans la liste (Montant, Amount, transaction Montant…).',
          'Liste Compense'
        );
        return;
      }
      const headerRow = rows[detected.headerRowIndex] || [];
      const guIndex = this.findHeaderIndex(headerRow, ['transgu']);
      const serviceIndex = this.findHeaderIndex(headerRow, ['service']);
      const agenceIndex = this.findHeaderIndex(headerRow, ['agence']);
      const dateIndex = this.findHeaderIndex(headerRow, ['date', 'fecha']);

      const lines: RecoLine[] = [];
      for (let r = detected.headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const montant = this.parseAmountValue(row[detected.amountColumnIndex]);
        if (montant == null) {
          continue;
        }
        lines.push({
          numeroTransGu: guIndex != null ? String(row[guIndex] ?? '').trim() : '',
          service: serviceIndex != null ? String(row[serviceIndex] ?? '').trim() : '',
          agence: agenceIndex != null ? String(row[agenceIndex] ?? '').trim() : '',
          montant,
          date: dateIndex != null ? this.formatDateCell(row[dateIndex]) : ''
        });
      }

      this.loadedCompenseLines = lines;
      this.compenseListeLoaded = true;
      this.compenseListeFileName = file.name;
      this.compenseListeSource = 'file';
      this.rebuildCompenseMatching();
      this.cdr.markForCheck();
    } catch (e: any) {
      console.error('Erreur chargement liste compense:', e);
      await this.popupService.showError(e?.message || 'Impossible de lire la liste.', 'Liste Compense');
    } finally {
      input.value = '';
    }
  }

  /** Ouvre le popup OPPART : récupère les compenses, affiche la liste des lignes avec cases à cocher, puis charge les lignes sélectionnées. */
  async openOppartLoadDialog(): Promise<void> {
    if (this.isLoadingOppartCompenses || this.isLoadingOppartCompenseFile) {
      return;
    }
    this.isLoadingOppartCompenses = true;
    this.cdr.markForCheck();
    let compenses: Oppart[] = [];
    // Fenêtre de recherche OPPART : la période de certification augmentée du mois
    // précédent et du mois suivant. Les dates d'opération OPPART et partenaire peuvent
    // différer d'un mois (ligne créée/saisie plus tard), d'où cette marge.
    const rechercheDe = this.dateCertificationDe
      ? (this.firstDayOfMonthOffset(this.dateCertificationDe, -1) || this.dateCertificationDe)
      : '';
    const rechercheAu = this.dateCertificationAu
      ? (this.lastDayOfMonthOffset(this.dateCertificationAu, 1) || this.dateCertificationAu)
      : '';
    let dateFilterFrom = rechercheDe;
    let dateFilterTo = rechercheAu;
    let horsPeriode = false;
    /** Compenses trouvées uniquement grâce à la marge (hors période stricte). */
    let horsCertification = 0;
    try {
      // Filtrage serveur sur le type : seules les compensations sont transférées.
      const periode: any = { typeOpContains: 'compens' };
      if (rechercheDe) periode.dateDebut = rechercheDe;
      if (rechercheAu) periode.dateFin = rechercheAu;
      compenses = (await firstValueFrom(this.oppartService.getOpparts(periode)) || [])
        .filter(op => this.isCompenseOppart(op.typeOp));

      if (!compenses.length) {
        // Toujours rien malgré la marge : on cherche alors toutes périodes confondues.
        const toutes = (await firstValueFrom(this.oppartService.getOpparts({ typeOpContains: 'compens' })) || [])
          .filter(op => this.isCompenseOppart(op.typeOp));
        if (!toutes.length) {
          await this.popupService.showWarning(
            `Aucune ligne de compense dans OPPART pour la période ${this.dateCertificationDe || '—'} → `
            + `${this.dateCertificationAu || '—'} (marge d'un mois avant/après incluse : `
            + `${rechercheDe || '—'} → ${rechercheAu || '—'}). Aucune ligne de type COMPENSE dans la table `
            + 'OPPART, toutes périodes confondues.',
            'OPPART'
          );
          this.cdr.markForCheck();
          return;
        }
        compenses = toutes;
        horsPeriode = true;
        const jours = compenses.map(op => this.toIsoDay(op.dateOperation)).filter(d => !!d).sort();
        // On ne borne le popup que si toutes les lignes ont une date exploitable.
        dateFilterFrom = jours.length === compenses.length ? (jours[0] || '') : '';
        dateFilterTo = jours.length === compenses.length ? (jours[jours.length - 1] || '') : '';
        await this.popupService.showWarning(
          `Aucune ligne de compense dans OPPART entre le ${rechercheDe || '—'} et le ${rechercheAu || '—'} `
          + `(période de certification ${this.dateCertificationDe || '—'} → ${this.dateCertificationAu || '—'} `
          + 'augmentée du mois précédent et du mois suivant). '
          + `${compenses.length} ligne(s) existent toutefois à d'autres dates `
          + `(${dateFilterFrom || '—'} → ${dateFilterTo || '—'}) : elles sont proposées ci-dessous.`,
          'OPPART'
        );
      } else {
        // Compte les compenses trouvées uniquement grâce à la marge avant/après.
        horsCertification = compenses.filter(op => {
          const jour = this.toIsoDay(op.dateOperation);
          return !!jour
            && ((!!this.dateCertificationDe && jour < this.dateCertificationDe)
              || (!!this.dateCertificationAu && jour > this.dateCertificationAu));
        }).length;
      }
    } catch (e: any) {
      console.error('Erreur chargement compenses depuis OPPART:', e);
      await this.popupService.showError(
        e?.message || 'Impossible de charger les compenses depuis OPPART.',
        'OPPART'
      );
      this.isLoadingOppartCompenses = false;
      this.cdr.markForCheck();
      return;
    }
    this.isLoadingOppartCompenses = false;
    this.cdr.markForCheck();

    const result = await this.popupService.showSelectableListPopup({
      title: 'Charger depuis OPPART',
      message: `${compenses.length} compense(s) trouvée(s) dans OPPART`
        + (horsCertification > 0
          ? ` dont ${horsCertification} hors de la période de certification (marge d'un mois avant/après)`
          : '')
        + (horsPeriode
          ? ' (toutes périodes)'
          : ` — recherche du ${rechercheDe || '—'} au ${rechercheAu || '—'}`)
        + '. Ajustez la période ou filtrez par texte, puis sélectionnez les lignes à charger :',
      columns: ['N° Trans GU', 'Type_OP', 'Client', 'Montant', 'Date'],
      rows: compenses.map(op => ({
        key: String(op.id),
        date: this.toIsoDay(op.dateOperation),
        cells: [
          (op.idTransaction || ''),
          (op.typeOp || ''),
          (op.client || op.pays || ''),
          String(Math.abs(Number(op.montant) || 0)),
          op.dateOperation ? this.formatDateCell(op.dateOperation) : ''
        ]
      })),
      dateFilter: { from: dateFilterFrom, to: dateFilterTo },
      options: [
        { key: 'liste', label: 'Charger dans la liste des compenses', hint: `${compenses.length} ligne(s) sélectionnée(s) utilisée(s) comme liste`, checked: true },
        { key: 'fichier', label: 'Charger dans la réconciliation fichier (montants)', hint: 'Les montants des lignes sélectionnées servent au matching', checked: true }
      ],
      confirmLabel: 'Charger',
      requireSelection: true
    });

    if (!result) {
      return;
    }

    const perimeePopup = result.dateFilter || { from: '', to: '' };
    if (!horsPeriode && this.periodeElargieHorsChargement(perimeePopup, rechercheDe, rechercheAu)) {
      await this.popupService.showWarning(
        'La période choisie dans le popup déborde la période chargée depuis OPPART (période de certification '
        + '+ mois précédent et mois suivant) : seules les lignes déjà chargées dans le popup sont disponibles.',
        'Période'
      );
    }

    const selectedKeys = new Set(result.selectedKeys);
    const selectedOpparts = compenses.filter(op => selectedKeys.has(String(op.id)));

    if (result.options.liste && selectedOpparts.length) {
      await this.loadCompensesFromOppart(selectedOpparts);
    }
    if (result.options.fichier && selectedOpparts.length) {
      await this.loadCompenseFileFromOppart(selectedOpparts);
    }
    this.cdr.markForCheck();
  }

  /**
   * Vrai si la période saisie dans le popup est plus large que la période réellement
   * chargée depuis OPPART (période de certification + mois précédent et suivant).
   */
  private periodeElargieHorsChargement(
    periode: { from: string; to: string },
    borneDe: string,
    borneAu: string
  ): boolean {
    const { from, to } = periode || { from: '', to: '' };
    const avant = borneDe && from && from < borneDe;
    const apres = borneAu && to && to > borneAu;
    return !!avant || !!apres;
  }

  /** Premier jour du mois situé `deltaMois` mois après le jour ISO fourni. */
  private firstDayOfMonthOffset(isoDay: string, deltaMois: number): string {
    const jour = this.parseIsoDay(isoDay);
    if (!jour) {
      return '';
    }
    return this.formatIsoDay(new Date(jour.getFullYear(), jour.getMonth() + deltaMois, 1));
  }

  /** Dernier jour du mois situé `deltaMois` mois après le jour ISO fourni. */
  private lastDayOfMonthOffset(isoDay: string, deltaMois: number): string {
    const jour = this.parseIsoDay(isoDay);
    if (!jour) {
      return '';
    }
    // Jour 0 du mois suivant = dernier jour du mois visé.
    return this.formatIsoDay(new Date(jour.getFullYear(), jour.getMonth() + deltaMois + 1, 0));
  }

  /** Parse un jour ISO (yyyy-MM-dd) en date locale, sans décalage de fuseau. */
  private parseIsoDay(isoDay: string): Date | null {
    const m = String(isoDay || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
      return null;
    }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  private formatIsoDay(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Verifie les lignes concernees de la liste des compenses chargee, sans toucher au
   * reste du tableau : une seule requete cote backend, et un bilan par statut.
   */
  async verifierLignesCompenses(): Promise<void> {
    if (this.isVerifyingCompenses) {
      return;
    }
    const lignes = this.loadedCompenseLines || [];
    if (!lignes.length) {
      await this.popupService.showWarning(
        'Chargez d’abord la liste des compenses (fichier ou OPPART) avant de vérifier les lignes concernées.',
        'Compenses'
      );
      return;
    }
    this.isVerifyingCompenses = true;
    this.cdr.markForCheck();
    try {
      const requete = lignes.map(l => ({
        numeroTransGu: (l.numeroTransGu || '').trim(),
        montant: l.montant != null ? Math.abs(Number(l.montant)) : null,
        date: this.toIsoDay(l.date),
        client: (l.agence || '').trim()
      }));
      const resultats = await firstValueFrom(this.oppartService.verifierLignes(requete));
      this.verifCompenses = resultats || [];
      this.verifCompensesOk = this.verifCompenses.filter(r => r.trouve && r.statut === OPPART_STATUT_OK).length;
      this.verifCompensesEnCours = this.verifCompenses.filter(r => r.trouve && r.statut !== OPPART_STATUT_OK).length;
      this.verifCompensesIntrouvables = this.verifCompenses.filter(r => !r.trouve).length;

      const gardes = this.verifCompenses
        .map((r, i) => r.trouve && r.statut === OPPART_STATUT_OK ? lignes[i] : null)
        .filter((l): l is RecoLine => !!l);

      if (!gardes.length) {
        await this.popupService.showWarning(
          'Aucune des lignes concernées n’est au statut OK dans OPPART : la liste est conservée telle quelle.',
          'Vérification'
        );
        return;
      }

      const exclues = lignes.length - gardes.length;
      this.loadedCompenseLines = gardes;
      this.compenseListeFiltered = true;
      this.rebuildCompenseMatching();
      if (exclues > 0) {
        await this.popupService.showWarning(
          `${gardes.length} ligne(s) conservée(s) au statut OK, ${exclues} exclue(s) : statut différent ou introuvable dans OPPART.`,
          'Vérification'
        );
      }
    } catch (e: any) {
      console.error('Erreur verification des lignes concernees:', e);
      await this.popupService.showError(
        e?.message || 'Impossible de vérifier les lignes concernées dans OPPART.',
        'OPPART'
      );
    } finally {
      this.isVerifyingCompenses = false;
      this.cdr.markForCheck();
    }
  }

  /** Lie les compenses dans OPPART : pour chaque N° Trans GU de la liste, lie la ligne BO et la ligne Partenaire. */
  async lierCompensesDansOppart(): Promise<void> {
    if (this.isLinkingCompenses) {
      return;
    }
    const lignes = this.loadedCompenseLines || [];
    if (!lignes.length) {
      await this.popupService.showWarning(
        'Aucune liste des compenses chargée depuis OPPART.',
        'Compenses'
      );
      return;
    }
    if (this.compenseListeSource !== 'oppart') {
      await this.popupService.showWarning(
        'Cette action n\'est disponible que lorsque la liste des compenses a été chargée depuis OPPART.',
        'Compenses'
      );
      return;
    }

    const transGus = lignes
      .map(l => (l.numeroTransGu || '').trim())
      .filter(t => t.length > 0);

    if (!transGus.length) {
      await this.popupService.showWarning(
        'Aucun N° Trans GU valide dans la liste des compenses.',
        'Compenses'
      );
      return;
    }

    const confirmed = await this.popupService.showConfirmDialog(
      `Lier ${transGus.length} compense(s) dans OPPART ?\n\n` +
      `Cela va :\n` +
      `• Retrouver pour chaque N° Trans GU la ligne BO (COMPENSE_BO) et la ligne Partenaire (COMPENSE_PART/*PARTNER*)\n` +
      `• Les lier par un token commun (statut → OK)\n\n` +
      `Les lignes déjà liées seront ignorées.`,
      'Confirmer la liaison des compenses'
    );
    if (!confirmed) {
      return;
    }

    this.isLinkingCompenses = true;
    this.cdr.markForCheck();

    try {
      const result = await firstValueFrom(this.oppartService.linkCompensesByTransGu(transGus));
      if (!result.success) {
        await this.popupService.showError(result.details?.[0]?.message || 'Échec de la liaison.', 'OPPART');
        return;
      }

      // Afficher le résumé
      const details = result.details || [];
      const linked = details.filter(d => d.status === 'LINKED').length;
      const already = details.filter(d => d.status === 'ALREADY_LINKED').length;
      const skipped = details.filter(d => d.status === 'INCOMPLETE_PAIR' || d.status === 'NOT_FOUND').length;

      let msg = `✅ ${linked} compense(s) liée(s) avec succès.`;
      if (already) msg += `\n⏭ ${already} déjà liées (ignorées).`;
      if (skipped) msg += `\n⚠ ${skipped} ignorées (paire BO/Partenaire introuvable ou incomplète).`;

      await this.popupService.showSuccess(msg, 'OPPART');

      // Recharger la liste depuis OPPART pour voir les statuts OK + tokens
      // On réouvre le popup de chargement OPPART pour rafraîchir
      await this.openOppartLoadDialog();

    } catch (e: any) {
      console.error('Erreur liaison compenses dans OPPART:', e);
      await this.popupService.showError(
        e?.message || 'Impossible de lier les compenses dans OPPART.',
        'OPPART'
      );
    } finally {
      this.isLinkingCompenses = false;
      this.cdr.markForCheck();
    }
  }

  get verifCompensesProblemes(): OppartLigneVerificationResult[] {
    return this.verifCompenses.filter(r => !r.trouve || r.statut !== OPPART_STATUT_OK);
  }

  private toIsoDay(value: string | undefined | null): string {
    if (!value) {
      return '';
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return m[1] + '-' + m[2] + '-' + m[3];
    }
    const fr = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (fr) {
      return fr[3] + '-' + fr[2].padStart(2, '0') + '-' + fr[1].padStart(2, '0');
    }
    return '';
  }

  /** Charge la liste des compenses depuis les lignes OPPART fournies (déjà filtrées/sélectionnées). */
  async loadCompensesFromOppart(selectedOpparts: Oppart[] = []): Promise<void> {
    if (this.isLoadingOppartCompenses) {
      return;
    }
    this.isLoadingOppartCompenses = true;
    this.cdr.markForCheck();
    try {
      const lines: RecoLine[] = (selectedOpparts || [])
        .filter(op => this.isCompenseOppart(op.typeOp))
        .map(op => ({
          numeroTransGu: (op.idTransaction || '').trim(),
          service: (op.typeOp || '').trim(),
          agence: (op.client || op.pays || '').trim(),
          montant: Math.abs(Number(op.montant) || 0),
          date: op.dateOperation ? this.formatDateCell(op.dateOperation) : ''
        }));
      if (!lines.length) {
        await this.popupService.showWarning(
          'Aucune ligne de compense trouvée dans OPPART pour la période indiquée.',
          'OPPART'
        );
        return;
      }
      this.loadedCompenseLines = lines;
      this.compenseListeLoaded = true;
      this.compenseListeFileName = 'OPPART';
      this.compenseListeSource = 'oppart';
      this.compenseFileSource = 'oppart';
      this.rebuildCompenseMatching();
      this.cdr.markForCheck();
      await this.popupService.showSuccess(
        `✅ ${lines.length} compense(s) chargée(s) dans la liste depuis OPPART.`,
        'OPPART'
      );
    } catch (e: any) {
      console.error('Erreur chargement compenses depuis OPPART:', e);
      await this.popupService.showError(
        e?.message || 'Impossible de charger les compenses depuis OPPART.',
        'OPPART'
      );
    } finally {
      this.isLoadingOppartCompenses = false;
      this.cdr.markForCheck();
    }
  }

  private isCompenseOppart(typeOp: string): boolean {
    const n = (typeOp || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return n.includes('compens');
  }

  /** Charge la réconciliation fichier (montants) depuis les lignes OPPART fournies. */
  async loadCompenseFileFromOppart(selectedOpparts: Oppart[] = []): Promise<void> {
    if (this.isLoadingOppartCompenseFile) {
      return;
    }
    this.isLoadingOppartCompenseFile = true;
    this.cdr.markForCheck();
    try {
      const amounts: number[] = [];
      const extras: string[][] = [];
      (selectedOpparts || [])
        .filter(op => this.isCompenseOppart(op.typeOp))
        .forEach(op => {
          const montant = Math.abs(Number(op.montant) || 0);
          if (montant > 0) {
            amounts.push(montant);
            extras.push([
              (op.idTransaction || '').trim(),
              (op.typeOp || '').trim(),
              (op.client || op.pays || '').trim(),
              op.dateOperation ? this.formatDateCell(op.dateOperation) : ''
            ]);
          }
        });
      if (!amounts.length) {
        await this.popupService.showWarning(
          'Aucun montant de compense trouvé dans OPPART pour la période indiquée.',
          'OPPART'
        );
        return;
      }
      this.compenseRecon.load({
        fileName: 'OPPART',
        column: 'Montant OPPART',
        amounts,
        extraColumns: ['ID Transaction', 'Type_OP', 'Client', 'Date'],
        extraValues: extras
      });
      this.compenseFileSource = 'oppart';
      this.rebuildCompenseMatching();
      this.cdr.markForCheck();
      await this.popupService.showSuccess(
        `✅ ${amounts.length} montant(s) de réconciliation chargé(s) depuis OPPART.`,
        'OPPART'
      );
    } catch (e: any) {
      console.error('Erreur chargement réconciliation fichier depuis OPPART:', e);
      await this.popupService.showError(
        e?.message || 'Impossible de charger les montants depuis OPPART.',
        'OPPART'
      );
    } finally {
      this.isLoadingOppartCompenseFile = false;
      this.cdr.markForCheck();
    }
  }

  /** Revient à la liste calculée (compense) si une liste fichier a été chargée. */
  resetCompenseListe(): void {
    this.loadedCompenseLines = [];
    this.compenseListeLoaded = false;
    this.compenseListeFileName = '';
    this.compenseListeSource = '';
    this.compenseListeFiltered = false;
    this.verifCompenses = [];
    this.verifCompensesOk = 0;
    this.verifCompensesEnCours = 0;
    this.verifCompensesIntrouvables = 0;
    this.rebuildCompenseMatching();
    this.cdr.markForCheck();
  }

  async onEcartFileSelected(event: Event): Promise<void> {
    const data = await this.readReconFile(event.target as HTMLInputElement, 'Réconciliation Lignes d’écart');
    if (!data) {
      return;
    }
    this.ecartRecon.load(data);
    this.rebuildEcartMatching();
    this.cdr.markForCheck();
  }

  /** Charge la liste des lignes d'écart (hors compense) depuis un fichier Excel/CSV. */
  async onEcartListeFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    try {
      const rows = await this.readCompenseFileRows(file);
      const detected = this.detectCompenseColumns(rows);
      if (!detected) {
        await this.popupService.showWarning(
          'Aucune colonne de montant trouvée dans la liste (Montant, Amount, transaction Montant…).',
          'Liste lignes d’écart'
        );
        return;
      }
      const headerRow = rows[detected.headerRowIndex] || [];
      const guIndex = this.findHeaderIndex(headerRow, ['transgu']);
      const serviceIndex = this.findHeaderIndex(headerRow, ['service']);
      const agenceIndex = this.findHeaderIndex(headerRow, ['agence']);
      const dateIndex = this.findHeaderIndex(headerRow, ['date', 'fecha']);

      const lines: RecoLine[] = [];
      for (let r = detected.headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const montant = this.parseAmountValue(row[detected.amountColumnIndex]);
        if (montant == null) {
          continue;
        }
        lines.push({
          numeroTransGu: guIndex != null ? String(row[guIndex] ?? '').trim() : '',
          service: serviceIndex != null ? String(row[serviceIndex] ?? '').trim() : '',
          agence: agenceIndex != null ? String(row[agenceIndex] ?? '').trim() : '',
          montant,
          date: dateIndex != null ? this.formatDateCell(row[dateIndex]) : ''
        });
      }

      this.loadedEcartLines = lines;
      this.ecartListeLoaded = true;
      this.ecartListeFileName = file.name;
      this.rebuildEcartMatching();
      this.cdr.markForCheck();
    } catch (e: any) {
      console.error('Erreur chargement liste lignes d\'écart:', e);
      await this.popupService.showError(e?.message || 'Impossible de lire la liste.', 'Liste lignes d’écart');
    } finally {
      input.value = '';
    }
  }

  /** Revient à la liste calculée (hors compense) si une liste fichier a été chargée. */
  resetEcartListe(): void {
    this.loadedEcartLines = [];
    this.ecartListeLoaded = false;
    this.ecartListeFileName = '';
    this.rebuildEcartMatching();
    this.cdr.markForCheck();
  }

  /** Retrouve l'index d'une colonne d'en-tête contenant un des mots-clés normalisés. */
  private findHeaderIndex(headerRow: any[], keywords: string[]): number | null {
    for (let c = 0; c < headerRow.length; c++) {
      const n = this.normalizeHeader(String(headerRow[c] ?? '').trim());
      if (n && keywords.some(k => n.includes(k))) {
        return c;
      }
    }
    return null;
  }

  resetCompenseFile(): void {
    this.compenseRecon.reset();
    this.compenseFileSource = '';
    this.cdr.markForCheck();
  }

  resetEcartFile(): void {
    this.ecartRecon.reset();
    this.cdr.markForCheck();
  }

  toggleCompenseSection(): void {
    this.compenseSectionVisible = !this.compenseSectionVisible;
    this.cdr.markForCheck();
  }

  onCompenseAmountToggle(index: number, event: Event): void {
    this.compenseRecon.toggle(index, (event.target as HTMLInputElement).checked);
    this.rebuildCompenseMatching();
    this.cdr.markForCheck();
  }

  onEcartAmountToggle(index: number, event: Event): void {
    this.ecartRecon.toggle(index, (event.target as HTMLInputElement).checked);
    this.rebuildEcartMatching();
    this.cdr.markForCheck();
  }

  toggleAllCompenseAmounts(event: Event): void {
    this.compenseRecon.toggleAll((event.target as HTMLInputElement).checked);
    this.rebuildCompenseMatching();
    this.cdr.markForCheck();
  }

  toggleAllEcartAmounts(event: Event): void {
    this.ecartRecon.toggleAll((event.target as HTMLInputElement).checked);
    this.rebuildEcartMatching();
    this.cdr.markForCheck();
  }

  /** Reconstruit la réconciliation des compenses (même logique de matching partagée). */
  private rebuildCompenseMatching(): void {
    this.compenseRecon.rebuildMatching(this.recoTargets(this.compenseLines));
  }

  /** Reconstruit la réconciliation des lignes d'écart partenaire hors compense. */
  private rebuildEcartMatching(): void {
    this.ecartRecon.rebuildMatching(this.recoTargets(this.ecartPartenaireLines));
  }

  private recoTargets(details: EcartDetailLine[] | RecoLine[]): RecoLine[] {
    return details.map(d => ({
      numeroTransGu: d.numeroTransGu,
      service: d.service,
      agence: d.agence,
      montant: d.montant
    }));
  }

  /** Lit un fichier Excel/CSV et extrait le montant (absolu) + colonnes d'info détectées. */
  private async readReconFile(input: HTMLInputElement, contextTitle: string): Promise<RecoFileData | null> {
    const file = input?.files?.[0];
    if (!file) {
      return null;
    }
    try {
      const rows = await this.readCompenseFileRows(file);
      const detected = this.detectCompenseColumns(rows);
      if (!detected) {
        await this.popupService.showWarning(
          'Aucune colonne de montant trouvée (Montant, Amount, transaction Montant, transaction Amount…).',
          contextTitle
        );
        return null;
      }
      const amounts: number[] = [];
      const extras: string[][] = [];
      for (let r = detected.headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const value = this.parseAmountValue(row[detected.amountColumnIndex]);
        if (value != null) {
          amounts.push(Math.abs(value));
          extras.push(detected.extraColumns.map(c => String(row[c.index] ?? '').trim()));
        }
      }
      return {
        fileName: file.name,
        column: detected.amountLabel,
        amounts,
        extraColumns: detected.extraColumns.map(c => c.label),
        extraValues: extras
      };
    } catch (e: any) {
      console.error('Erreur réconciliation fichier:', e);
      await this.popupService.showError(e?.message || 'Impossible de lire le fichier.', contextTitle);
      return null;
    } finally {
      input.value = '';
    }
  }

  private async readCompenseFileRows(file: File): Promise<any[][]> {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let workbook: any;
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
      const text = await this.readFileAsText(file);
      workbook = ext === 'tsv'
        ? XLSX.read(text, { type: 'string', FS: '\t' })
        : XLSX.read(text, { type: 'string' });
    } else {
      const buffer = await this.readFileAsArrayBuffer(file);
      workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
    }
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return [];
    }
    return (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as any[][]) ?? [];
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  private detectCompenseColumns(rows: any[][]): {
    amountColumnIndex: number;
    headerRowIndex: number;
    amountLabel: string;
    extraColumns: { index: number; label: string }[];
  } | null {
    let best: { columnIndex: number; headerRowIndex: number; label: string; score: number } | null = null;
    const maxRows = Math.min(rows.length, 15);
    for (let r = 0; r < maxRows; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const label = String(row[c] ?? '').trim();
        const score = this.scoreCompenseAmountHeader(label);
        if (score > 0 && (!best || score > best.score)) {
          best = { columnIndex: c, headerRowIndex: r, label, score };
        }
      }
    }
    if (!best) {
      return null;
    }
    const headerRow = rows[best.headerRowIndex] || [];
    const extraColumns: { index: number; label: string }[] = [];
    for (let c = 0; c < headerRow.length; c++) {
      if (c === best.columnIndex) {
        continue;
      }
      const label = String(headerRow[c] ?? '').trim();
      if (this.isTypeOrNameColumn(label)) {
        extraColumns.push({ index: c, label: label || `Colonne ${c + 1}` });
      }
    }
    return {
      amountColumnIndex: best.columnIndex,
      headerRowIndex: best.headerRowIndex,
      amountLabel: best.label,
      extraColumns
    };
  }

  private isTypeOrNameColumn(label: string): boolean {
    const n = this.normalizeHeader(label);
    if (!n) {
      return false;
    }
    return n.includes('type') || n.includes('name') || n.includes('nom') || n.includes('date')
      || n.includes('agence') || n.includes('agency') || n.includes('client')
      || n.includes('idtransaction') || n.includes('transactionid') || n.includes('transgu');
  }

  /** Formate une cellule date (objet Date Excel ou chaîne) pour affichage jj/mm/aaaa. */
  private formatDateCell(value: any): string {
    if (value == null || value === '') {
      return '';
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
      const d = value;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    const s = String(value).trim();
    if (!s) {
      return '';
    }
    const matched = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (matched) {
      const day = matched[1].padStart(2, '0');
      const month = matched[2].padStart(2, '0');
      return `${day}/${month}/${matched[3]}`;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return `${iso[3]}/${iso[2]}/${iso[1]}`;
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      }
    }
    return s;
  }

  private scoreCompenseAmountHeader(label: string): number {
    const n = this.normalizeHeader(label);
    if (!n) {
      return 0;
    }
    const hasMontant = n.includes('montant');
    const hasAmount = n.includes('amount');
    if (!hasMontant && !hasAmount) {
      return 0;
    }
    const hasTransaction = n.includes('transaction') || n.includes('transact');
    let score = 10;
    if (hasTransaction) {
      score += 30;
    }
    if (n === 'montant' || n === 'amount') {
      score += 45;
    }
    if (n === 'transactionmontant' || n === 'transactionamount') {
      score += 50;
    }
    if (n.includes('oppart')) {
      score += 25;
    }
    return score;
  }

  private normalizeHeader(label: string): string {
    return (label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private parseAmountValue(value: any): number | null {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    let s = String(value).trim();
    if (!s) {
      return null;
    }
    const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/[^0-9.,-]/g, '');
    if (!s || s === '-') {
      return null;
    }
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(/,/g, '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (lastComma > -1) {
      const decimals = s.length - lastComma - 1;
      if (decimals === 1 || decimals === 2) {
        s = s.slice(0, lastComma).replace(/,/g, '') + '.' + s.slice(lastComma + 1);
      } else {
        s = s.replace(/,/g, '');
      }
    } else if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, '');
    }
    const num = parseFloat(s);
    if (!Number.isFinite(num)) {
      return null;
    }
    return negative && num > 0 ? -num : num;
  }
}
