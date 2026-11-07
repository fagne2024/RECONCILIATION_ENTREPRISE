import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, from } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { OperationBancaire } from '../../models/operation-bancaire.model';
import { OperationBancaireService, OperationCheckResult } from '../../services/operation-bancaire.service';
import { Compte } from '../../models/compte.model';
import { CompteService } from '../../services/compte.service';
import { OperationService } from '../../services/operation.service';
import { OperationServiceApi } from '../../services/operation.service';
import { ReleveBancaireService } from '../../services/releve-bancaire.service';
import { ReleveBancaireRow } from '../../models/releve-bancaire.model';
import { SuiviCompenseOp } from '../../models/suivi-compense-op.model';
import { SuiviCompenseOpService } from '../../services/suivi-compense-op.service';
import { ExportOptimizationService } from '../../services/export-optimization.service';
import { PopupService } from '../../services/popup.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { countryDisplayLabel, countriesMatch, normalizeCountryFilterOptions } from '../../utils/country-codes.util';
import { TranslateModule } from '@ngx-translate/core';
import { DsPaginationComponent } from '../../shared/ui/pagination/ds-pagination.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';

// Interface locale pour les opérations bancaires avec Date
interface OperationBancaireDisplay extends Omit<OperationBancaire, 'dateOperation'> {
  dateOperation: Date;
  /** Origine de la ligne : 'bancaire' (table opérations bancaires) ou autre. */
  source?: string;
}

// Interface pour les filtres
interface FiltresOperation {
  pays: string;
  typeOperation: string;
  statut: string;
  traitement: string;
  dateDebut: string;
  dateFin: string;
  // Colonnes du tableau des opérations
  agence?: string;
  montant?: number | null;
  reference?: string;
  idGlpi?: string;
}

/** Filtre texte « contient », insensible à la casse. */
function containsFilter(value: string | null | undefined, filter: string | null | undefined): boolean {
  if (!filter || !filter.trim()) return true;
  return (value || '').toLowerCase().includes(filter.toLowerCase().trim());
}
// Filtres pour les résultats de réconciliation (opérations/relevé)
interface ReconFilters {
  typeOperation: string;
  statut: string;
  banque: string;
  search: string; // recherche libre (bénéficiaire/référence/libellé/compte)
  montantMin: number | null;
  montantMax: number | null;
}

/**
 * Correspondance entre les en-têtes produits par les modèles de traitement automatique
 * et les en-têtes attendus par l'import des opérations bancaires.
 */
const OPERATION_IMPORT_HEADER_ALIASES: Record<string, string> = {
  pays: 'Pays',
  codepays: 'Code Pays',
  mois: 'Mois',
  dateoperation: 'Date Opération',
  date: 'Date Opération',
  agence: 'Agence',
  typeoperation: 'Type Opération',
  type: 'Type Opération',
  nombeneficiaire: 'Nom Bénéficiaire',
  beneficiaire: 'Nom Bénéficiaire',
  compteadebiter: 'Compte à débiter',
  comptedebiter: 'Compte à débiter',
  numerocompte: 'Compte à débiter',
  compte: 'Compte à débiter',
  montant: 'Montant',
  modepaiement: 'Mode Paiement',
  reference: 'Référence',
  ref: 'Référence',
  numbordereau: 'Référence',
  numerobordereau: 'Référence',
  numerotransgu: 'Référence',
  numerotransactiongu: 'Référence',
  idglpi: 'ID GLPI',
  idticket: 'ID GLPI',
  ticket: 'ID GLPI',
  banque: 'Banque',
  banqueappro: 'Banque',
  bo: 'Banque',
  codeproprietaire: 'Agence',
  codeagence: 'Agence',
  groupedereseau: 'Pays',
  statut: 'Statut',
  status: 'Statut',
  demandeur: 'Demandeur',
  valideur: 'Valideur',
  traitement: 'Traitement',
  banquecorrigee: 'Banque Corrigée',
  // En-têtes anglais
  country: 'Pays',
  countrycode: 'Code Pays',
  agency: 'Agence',
  operationtype: 'Type Opération',
  transactiontype: 'Type Opération',
  amount: 'Montant',
  operationdate: 'Date Opération',
  transactiondate: 'Date Opération',
  month: 'Mois',
  beneficiary: 'Nom Bénéficiaire',
  beneficiaryname: 'Nom Bénéficiaire',
  debitaccount: 'Compte à débiter',
  accounttodebit: 'Compte à débiter',
  paymentmode: 'Mode Paiement',
  paymentmethod: 'Mode Paiement',
  ticketid: 'ID GLPI',
  glpiid: 'ID GLPI',
  correctedbank: 'Banque Corrigée',
  requester: 'Demandeur',
  approver: 'Valideur',
  validator: 'Valideur',
  processing: 'Traitement',
};

/**
 * Correspondance entre les en-têtes produits par les modèles de traitement automatique
 * et les en-têtes attendus par l'import du relevé bancaire.
 */
const RELEVE_IMPORT_HEADER_ALIASES: Record<string, string> = {
  nomcompte: 'Nom du compte',
  nomducompte: 'Nom du compte',
  numerocompte: 'Numéro de compte',
  numerodecompte: 'Numéro de compte',
  compte: 'Numéro de compte',
  datecomptable: 'Date comptable',
  dateoperation: 'Date comptable',
  date: 'Date comptable',
  datevaleur: 'Date valeur',
  datedevaleur: 'Date valeur',
  libelle: 'Libellé',
  narratif: 'Libellé',
  narration: 'Libellé',
  intitule: 'Libellé',
  description: 'Libellé',
  debit: 'Débit',
  dbit: 'Débit',
  debits: 'Débit',
  credit: 'Crédit',
  crdit: 'Crédit',
  credits: 'Crédit',
  montant: 'Montant',
  numerochq: 'Chèque',
  numcheque: 'Chèque',
  cheque: 'Chèque',
  numerochque: 'Chèque',
  numerocheque: 'Chèque',
  devise: 'Devise',
  deviseducompte: 'Devise',
  soldecourant: 'Solde courant',
  soldedisponibledecloture: 'Solde disponible de clôture',
  soldedisponiblealouverture: "Solde disponible à l'ouverture",
  soldecomptabledouverture: "Solde comptable d'ouverture",
  soldecomptabledecloture: 'Solde comptable de clôture',
  depototal: 'Dépôt total',
  depottotal: 'Dépôt total',
  totalretraits: 'Total des retraits',
  totaldesretraits: 'Total des retraits',
  numeroserie: 'Numéro de série',
  numerodeserie: 'Numéro de série',
  banque: 'Banque',
  bankname: 'Banque',
  // En-têtes anglais
  accountnumber: 'Numéro de compte',
  accountno: 'Numéro de compte',
  accountname: 'Nom du compte',
  bank: 'Banque',
  accountingdate: 'Date comptable',
  bookingdate: 'Date comptable',
  valuedate: 'Date valeur',
  labelnarration: 'Libellé',
  libellenarration: 'Libellé',
  label: 'Libellé',
  amount: 'Montant',
  currency: 'Devise',
  accountcurrency: 'Devise',
  chequenumber: 'Chèque',
  checknumber: 'Chèque',
  serialnumber: 'Numéro de série',
  seriesnumber: 'Numéro de série'
};

/**
 * Correspondance entre les en-têtes produits par les modèles de traitement automatique
 * et les en-têtes du suivi des compenses OP.
 */
const SUIVI_COMPENSE_HEADER_ALIASES: Record<string, string> = {
  date: 'Date',
  dateoperation: 'Date',
  datetransaction: 'Date',
  codeagence: 'Code agence',
  agence: 'Code agence',
  codeproprietaire: 'Code agence',
  banque: 'Banque',
  bo: 'Banque',
  banqueappro: 'Banque',
  comptebancaire: 'Compte bancaire',
  compte: 'Compte bancaire',
  numerocompte: 'Compte bancaire',
  compteadebiter: 'Compte bancaire',
  montant: 'Montant',
  modepaiement: 'Mode de paiement',
  modedepaiement: 'Mode de paiement',
  reference: 'Référence',
  ref: 'Référence',
  referencelibelletransactions: 'Référence',
  libelletransactions: 'Référence',
  numbordereau: 'Référence',
  numerotransgu: 'Référence',
  idticket: 'ID ticket',
  ticket: 'ID ticket',
  ticketid: 'ID ticket',
  idglpi: 'ID ticket',
  service: 'Service',
  reseau: 'Réseau',
  groupedereseau: 'Réseau',
  // En-têtes anglais
  transactiondate: 'Date',
  agencycode: 'Code agence',
  agency: 'Code agence',
  bank: 'Banque',
  bankaccount: 'Compte bancaire',
  account: 'Compte bancaire',
  amount: 'Montant',
  paymentmode: 'Mode de paiement',
  paymentmethod: 'Mode de paiement',
  network: 'Réseau'
};

@Component({
  selector: 'app-banque',
  standalone: true,
  imports: [TranslateModule, CommonModule, FormsModule, ReactiveFormsModule, DsPaginationComponent, FileUploadComponent],
  templateUrl: './banque.component.html',
  styleUrls: ['./banque.component.scss']
})
export class BanqueComponent implements OnInit {
  // État d'affichage
  showOperations = false;
  activeSection: 'home' | 'operations' | 'comptes' | 'rapports' | 'securite' | 'traitement' | 'suivi-compense' = 'home';
  
  // Contrôle de visibilité des colonnes Actions
  showActionsColumn = false;
  
  // Contrôle de visibilité de la colonne commentaire
  showCommentColumn = false;

  // Traitement Automatique (Opérations)
  showOpAutoTreatment = false;

  // Traitement Automatique (Relevé)
  showReleveAutoTreatment = false;

  // Traitement Automatique (Suivi compense OP)
  showSuiviCompenseAutoTreatment = false;

  // Création d'opération bancaire
  showCreateOperationPopup = false;
  creatingOperation = false;
  createOperationForm = {
    numeroCompte: '',
    nomCompte: '',
    banque: '',
    dateComptable: '',
    dateValeur: '',
    libelle: '',
    debit: null as number | null,
    credit: null as number | null,
    devise: 'XAF',
    reconStatus: 'KO' as 'OK' | 'KO'
  };

  // Données des opérations
  operations: OperationBancaireDisplay[] = [];
  filteredOperations: OperationBancaireDisplay[] = [];
  pagedOperations: OperationBancaireDisplay[] = [];

  // Filtres
  filters: FiltresOperation = {
    pays: '',
    typeOperation: '',
    statut: '',
    traitement: '',
    dateDebut: '',
    dateFin: ''
  };

  // Listes pour les filtres
  paysList: string[] = ['Côte d\'Ivoire', 'Mali', 'Burkina Faso', 'Sénégal', 'Togo', 'Cameroun'];
  // Types d'opération : ceux présents dans les opérations chargées (liste dynamique, pas de valeur figée)
  private typesCacheSource: OperationBancaireDisplay[] | null = null;
  private typesCacheLength = -1;
  private typesCache: string[] = [];

  get typesOperation(): string[] {
    if (this.typesCacheSource !== this.operations || this.typesCacheLength !== this.operations.length) {
      this.typesCacheSource = this.operations;
      this.typesCacheLength = this.operations.length;
      this.typesCache = Array.from(new Set(
        this.operations.map(op => (op.typeOperation || '').trim()).filter(t => !!t)
      )).sort((a, b) => a.localeCompare(b, 'fr'));
    }
    return this.typesCache;
  }
  statutsList: string[] = ['Validée', 'En attente', 'Rejetée', 'En cours'];
  modesPaiement: string[] = ['Virement bancaire', 'Chèque', 'Espèces', 'Mobile Money'];
  traitementOptions: string[] = ['Niveau reconciliation', 'Niveau Group', 'Terminé'];
  
  // Édition en ligne
  editingOperation: OperationBancaireDisplay | null = null;

  // Mapping codes pays -> noms pays
  private paysCodeToName: Record<string, string> = {
    'CI': "Côte d'Ivoire",
    'CITCH': "Côte d'Ivoire",
    'SN': 'Sénégal',
    'GN': 'Guinée',
    'BF': 'Burkina Faso',
    'GA': 'Gabon',
    'TG': 'Togo',
    'CM': 'Cameroun'
  };

  getPaysDisplay(op: OperationBancaireDisplay): string {
    const raw = (op.pays || op.codePays || '').trim();
    if (!raw) return '-';
    // Si déjà un nom complet, le retourner tel quel
    if (raw.length > 3 || raw.includes(' ')) {
      // Normaliser pour traiter les variantes "Côte d'Ivoire" vs "Cote d'Ivoire"
      const norm = this.normalizeCountryName(raw);
      const entry = Object.entries(this.paysCodeToName).find(([, name]) => this.normalizeCountryName(name) === norm);
      return entry ? entry[1] : raw;
    }
    const code = raw.toUpperCase();
    return this.paysCodeToName[code] || raw;
  }

  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  

  // Popups
  showDetailPopup = false;
  showEditPopup = false;
  selectedOperation: OperationBancaireDisplay | null = null;
  // Popup édition relevé
  showReleveEditPopup = false;
  selectedReleve: (ReleveBancaireRow & { id?: number }) | null = null;
  releveEditForm: any = {
    numeroCompte: '', nomCompte: '', banque: '',
    dateComptable: '', dateValeur: '', libelle: '',
    debit: null as number | null, credit: null as number | null, montant: null as number | null,
    numeroCheque: '', devise: '', commentaire: '', numeroSerie: ''
  };

  // Réconciliation banque
  reconPays: string = '';
  // Par défaut : J-1 (hier, date locale), pour tous les pays.
  reconDate: string = this.yesterdayYmd();
  reconciling = false;

  /** Date d'hier au format YYYY-MM-DD, en heure locale (évite le décalage UTC de minuit). */
  private yesterdayYmd(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  reconPaysOptions: string[] = [];
  reconView: 'operation' | 'releve' | 'corr_operation' | 'corr_releve' = 'operation';
  // Résultats bruts (incluant BOTH/OPERATION/RELEVE) conservés pour la popup correspondance
  reconciliationResults: Array<{
    date: string;
    montant: number;
    banque: string;
    sensIndex: string; // "debit1" | "credit2" ...
    source: 'OPERATION' | 'RELEVE' | 'BOTH';
    suspens?: 'Suspens BO' | 'Suspens Banque' | '';
  }> = [];

  // Lignes de différences pour l'affichage deux colonnes (gauche: OP, droite: RELEVE)
  reconDiffRows: Array<{
    left?: (OperationBancaireDisplay & { key?: string });
    right?: (ReleveBancaireRow & { key?: string });
  }> = [];
  leftOnlyOperations: OperationBancaireDisplay[] = [];
  rightOnlyReleves: ReleveBancaireRow[] = [];
  matchedOperations: OperationBancaireDisplay[] = [];
  matchedReleves: ReleveBancaireRow[] = [];
  reconPagedResults: Array<{
    left?: (OperationBancaireDisplay & { key?: string });
    right?: (ReleveBancaireRow & { key?: string });
  }> = [];
  reconPage = 1;
  reconPageSize = 10;
  reconTotalPages = 1;
  // Filtres et listes filtrées pour l'affichage
  reconFilters: ReconFilters = {
    typeOperation: '',
    statut: '',
    banque: '',
    search: '',
    montantMin: null,
    montantMax: null
  };
  filteredLeftOps: OperationBancaireDisplay[] = [];
  filteredRightReleves: ReleveBancaireRow[] = [];
  filteredMatchedOps: OperationBancaireDisplay[] = [];
  filteredMatchedReleves: ReleveBancaireRow[] = [];
  // Vue séparée
  pagedLeftOps: OperationBancaireDisplay[] = [];
  pagedRightReleves: ReleveBancaireRow[] = [];
  pagedMatchedOps: OperationBancaireDisplay[] = [];
  pagedMatchedReleves: ReleveBancaireRow[] = [];
  reconOpPage = 1;
  reconRevPage = 1;
  reconCorrOpPage = 1;
  reconCorrRevPage = 1;
  reconOpTotalPages = 1;
  reconRevTotalPages = 1;
  reconCorrOpTotalPages = 1;
  reconCorrRevTotalPages = 1;
  // Option d'affichage: inclure les lignes marquées OK
  showOkMarked = false;
  matchedPairs: Array<{
    date: string;
    montant: number;
    banque: string;
    sensIndex: string;
  }> = [];
  showCorrespondancePopup = false;
  correspondanceFilterBanque = '';
  correspondanceFilterMontant: number | null = null;

  // Sélection multiple sur la vue opérations bancaires (reconView==='operation')
  isSelectionModeOps = false;
  selectedOpIds: Set<number> = new Set<number>();
  selectAllOpsOnPage = false;
  isBulkUpdatingOps = false;
  selectedOpsTargetStatut: string = '';

  // Sélection multiple pour actions OK définitif (corr_operation / corr_releve)
  selectedReconKeys: Set<string> = new Set<string>();
  selectAllOnPage = false;

  // Réconciliation: overrides de statut (OK/KO) par clé
  private reconStatusOverrides: Record<string, 'OK' | 'KO'> = {};
  // Index de secours par clé de base (sans index, e.g. debit1->debit)
  private reconStatusBaseOverrides: Record<string, 'OK' | 'KO'> = {};
  // Popup liste des OK définitifs
  showOkListPopup = false;
  okKeysList: string[] = [];

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: any): any => value;

  trackById = (index: number, item: any): any => (item?.key ?? item?.id ?? item?.numeroCompte ?? item?.numeroOperation ?? index);
  okListLoading = false;

  // Ensemble persistant des clés marquées définitivement comme OK (à ignorer)
  private reconOkKeySet: Set<string> = new Set<string>();

  // Group tokens pour les correspondances groupées
  // Clé = clé de réconciliation, Valeur = token de groupe (string)
  private groupTokens: Map<string, string> = new Map<string, string>();

  // Compteur des OK définitifs (clé unique, sans doublons)
  get totalOkDefinitifs(): number {
    try { return this.reconOkKeySet ? this.reconOkKeySet.size : 0; } catch { return 0; }
  }

  // Obtenir le token de groupe pour une clé
  getGroupToken(key: string | undefined): string | null {
    if (!key) return null;
    return this.groupTokens.get(key) || null;
  }

  // Vérifier si une clé est groupée
  isGrouped(key: string | undefined): boolean {
    if (!key) return false;
    return this.groupTokens.has(key);
  }

  // Basculer le statut groupé pour une clé
  toggleGrouped(key: string | undefined): void {
    if (!key) return;
    
    if (this.groupTokens.has(key)) {
      // Supprimer le groupement
      this.groupTokens.delete(key);
    } else {
      // Créer un nouveau token de groupe
      const token = `GRP-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
      this.groupTokens.set(key, token);
    }
  }

  // Obtenir toutes les clés partageant le même token de groupe
  getGroupMembers(key: string | undefined): string[] {
    if (!key) return [];
    const token = this.groupTokens.get(key);
    if (!token) return [];
    
    const members: string[] = [];
    this.groupTokens.forEach((value, k) => {
      if (value === token) {
        members.push(k);
      }
    });
    return members;
  }

  // Appliquer le même token à plusieurs clés (groupement multiple)
  setGroupTokenForKeys(keys: string[], token?: string): void {
    if (!keys.length) return;
    const groupToken = token || `GRP-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    keys.forEach(k => this.groupTokens.set(k, groupToken));
  }

  // Helpers sélection multi (vue opérations)
  toggleSelectionModeOps() {
    this.isSelectionModeOps = !this.isSelectionModeOps;
    if (!this.isSelectionModeOps) {
      this.selectedOpIds.clear();
      this.selectAllOpsOnPage = false;
      this.selectedOpsTargetStatut = '';
    }
  }

  isOpSelected(op: OperationBancaireDisplay): boolean {
    return !!op && typeof (op as any).id === 'number' && this.selectedOpIds.has((op as any).id);
  }

  toggleOpSelection(op: OperationBancaireDisplay) {
    const id = (op as any).id as number | undefined;
    if (typeof id !== 'number') return;
    if (this.selectedOpIds.has(id)) this.selectedOpIds.delete(id); else this.selectedOpIds.add(id);
  }

  selectAllOpsCurrentPage() {
    // Sélectionner toutes les opérations filtrées (pas seulement celles de la page courante)
    (this.operations || []).forEach(op => {
      const id = (op as any).id as number | undefined;
      if (typeof id === 'number') this.selectedOpIds.add(id);
    });
    this.selectAllOpsOnPage = true;
    console.log(`✅ ${this.selectedOpIds.size} opérations bancaires sélectionnées (filtrées)`);
  }

  deselectAllOps() {
    this.selectedOpIds.clear();
    this.selectAllOpsOnPage = false;
  }

  get hasSelectedOps(): boolean {
    return this.selectedOpIds.size > 0;
  }

  async bulkChangeSelectedOpsStatus() {
    if (!this.hasSelectedOps) { this.popupService.showWarning('Aucune opération sélectionnée'); return; }
    if (!this.selectedOpsTargetStatut) { this.popupService.showWarning('Choisissez un statut cible'); return; }
    const count = this.selectedOpIds.size;
    const ok = await this.popupService.showConfirm(
      `Changer le statut de ${count} opération(s) vers "${this.selectedOpsTargetStatut}" ?`,
      'Confirmation changement de statut'
    );
    if (!ok) return;
    try {
      this.isBulkUpdatingOps = true;
      const ids = Array.from(this.selectedOpIds.values());
      const updated = await this.operationBancaireService.bulkUpdateStatut(ids, this.selectedOpsTargetStatut).toPromise();
      const total = ids.length;
      const failed = Math.max(0, total - (updated || 0));
      const msg = `Statut cible: "${this.selectedOpsTargetStatut}"\nMises à jour: ${updated}/${total}${failed > 0 ? `\nEchecs: ${failed}` : ''}`;
      this.popupService.showSuccess(msg, 'Changement de statut (bulk)');
      // reset
      this.selectedOpIds.clear();
      this.selectAllOpsOnPage = false;
      this.selectedOpsTargetStatut = '';
      this.isSelectionModeOps = false;
      // reload
      this.loadOperations();
      this.updatePagedReconciliationResults();
    } catch (e) {
      this.popupService.showError('❌ Erreur lors de la mise à jour en masse des statuts');
    } finally {
      this.isBulkUpdatingOps = false;
    }
  }

  quickBulkOps(status: string) {
    this.selectedOpsTargetStatut = status;
    this.bulkChangeSelectedOpsStatus();
  }

  // Sélection multiple sur la liste principale (hors réconciliation)
  isSelectionModeMain = false;
  selectedMainOpIds: Set<number> = new Set<number>();
  selectAllMainOnPage = false;
  isBulkUpdatingMain = false;
  selectedMainTargetStatut: string = '';

  toggleSelectionModeMain() {
    this.isSelectionModeMain = !this.isSelectionModeMain;
    if (!this.isSelectionModeMain) {
      this.selectedMainOpIds.clear();
      this.selectAllMainOnPage = false;
      this.selectedMainTargetStatut = '';
    }
  }

  isMainOpSelected(op: OperationBancaireDisplay): boolean {
    return !!op && typeof (op as any).id === 'number' && this.selectedMainOpIds.has((op as any).id);
  }

  toggleMainOpSelection(op: OperationBancaireDisplay) {
    const id = (op as any).id as number | undefined;
    if (typeof id !== 'number') return;
    if (this.selectedMainOpIds.has(id)) this.selectedMainOpIds.delete(id); else this.selectedMainOpIds.add(id);
  }

  private areAllMainOnPageSelected(): boolean {
    try {
      const page = this.pagedOperations || [];
      if (!page.length) return false;
      return page.every(op => typeof (op as any).id === 'number' && this.selectedMainOpIds.has((op as any).id));
    } catch { return false; }
  }

  toggleSelectAllMainHeader() {
    const allSelected = this.areAllMainOnPageSelected();
    if (allSelected) {
      (this.pagedOperations || []).forEach(op => {
        const id = (op as any).id as number | undefined;
        if (typeof id === 'number') this.selectedMainOpIds.delete(id);
      });
      this.selectAllMainOnPage = false;
    } else {
      (this.pagedOperations || []).forEach(op => {
        const id = (op as any).id as number | undefined;
        if (typeof id === 'number') this.selectedMainOpIds.add(id);
      });
      this.selectAllMainOnPage = true;
    }
  }

  deselectAllMain() {
    this.selectedMainOpIds.clear();
    this.selectAllMainOnPage = false;
  }

  get hasSelectedMainOps(): boolean { return this.selectedMainOpIds.size > 0; }

  async bulkChangeSelectedMainStatus() {
    if (!this.hasSelectedMainOps) { this.popupService.showWarning('Aucune opération sélectionnée'); return; }
    if (!this.selectedMainTargetStatut) { this.popupService.showWarning('Choisissez un statut cible'); return; }
    const count = this.selectedMainOpIds.size;
    const ok = await this.popupService.showConfirm(
      `Changer le statut de ${count} opération(s) vers "${this.selectedMainTargetStatut}" ?`,
      'Confirmation changement de statut'
    );
    if (!ok) return;
    try {
      this.isBulkUpdatingMain = true;
      const ids = Array.from(this.selectedMainOpIds.values());
      const updated = await this.operationBancaireService.bulkUpdateStatut(ids, this.selectedMainTargetStatut).toPromise();
      const total = ids.length;
      const failed = Math.max(0, total - (updated || 0));
      const msg = `Statut cible: "${this.selectedMainTargetStatut}"\nMises à jour: ${updated}/${total}${failed > 0 ? `\nEchecs: ${failed}` : ''}`;
      this.popupService.showSuccess(msg, 'Changement de statut (bulk)');
      // reset + reload
      this.selectedMainOpIds.clear();
      this.selectAllMainOnPage = false;
      this.selectedMainTargetStatut = '';
      this.isSelectionModeMain = false;
      this.loadOperations();
    } catch (e) {
      this.popupService.showError('Erreur lors de la mise à jour en masse des statuts', 'Erreur');
    } finally {
      this.isBulkUpdatingMain = false;
    }
  }

  quickBulkMain(status: string) {
    this.selectedMainTargetStatut = status;
    this.bulkChangeSelectedMainStatus();
  }

  // Filtres Statut Réconciliation (UI)
  reconStatusFilter: '' | 'OK' | 'KO' = '';
  releveStatusFilter: '' | 'OK' | 'KO' = '';
  operationsReconStatusFilter: '' | 'OK' | 'KO' = '';

  private loadReconOkKeys() {
    try {
      const raw = localStorage.getItem('recon.ok.keys');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) this.reconOkKeySet = new Set(arr as string[]);
      }
    } catch {}
  }

  private saveReconOkKeys() {
    try {
      localStorage.setItem('recon.ok.keys', JSON.stringify(Array.from(this.reconOkKeySet)));
    } catch {}
  }

  // Vérifie s'il existe une clé marquée OK définitif correspondant à une clé de base (sans index)
  private hasOkByBase(baseKey: string): boolean {
    try {
      const target = this.toBaseReconKey(baseKey);
      for (const k of Array.from(this.reconOkKeySet)) {
        if (this.toBaseReconKey(k) === target) return true;
      }
    } catch {}
    return false;
  }

  private applyOkStatusesToOpAndRev() {
    try {
      const keyToOp: Record<string, any> = (this as any).keyToOp || {};
      const keyToRev: Record<string, any> = (this as any).keyToRev || {};
      // 1) Appliquer les OK définitifs
      this.reconOkKeySet.forEach(k => {
        const op = keyToOp[k];
        if (op && op.id !== undefined) this.opStatusOverrides[String(op.id)] = 'OK';
        const rev = keyToRev[k];
        if (rev && rev.id !== undefined) this.releveStatusOverrides[String(rev.id)] = 'OK';
      });
      // 2) Appliquer les statuts persistés (OK/KO) issus du backend
      Object.entries(this.reconStatusOverrides || {}).forEach(([k, v]) => {
        const status = v === 'OK' ? 'OK' : 'KO';
        const op = keyToOp[k];
        if (op && op.id !== undefined) this.opStatusOverrides[String(op.id)] = status;
        const rev = keyToRev[k];
        if (rev && rev.id !== undefined) this.releveStatusOverrides[String(rev.id)] = status;
      });
    } catch {}
  }

  // Liste des OK définitifs (popup)
  openOkList() {
    this.showOkListPopup = true;
    this.loadOkKeysList();
  }

  closeOkList() {
    this.showOkListPopup = false;
  }

  private loadOkKeysList() {
    this.okListLoading = true;
    this.operationApi.getOkKeys('BANQUE').subscribe({
      next: (keys) => {
        this.okKeysList = Array.isArray(keys) ? keys.slice().sort() : [];
        this.okListLoading = false;
      },
      error: () => {
        this.okKeysList = [];
        this.okListLoading = false;
      }
    });
  }

  unmarkOkFromList(key: string) {
    if (!key) return;
    this.operationApi.unmarkOk(key).subscribe({
      next: () => {
        this.reconOkKeySet.delete(key);
        this.saveReconOkKeys();
        this.okKeysList = this.okKeysList.filter(k => k !== key);
        this.updatePagedReconciliationResults();
      },
      error: () => {
        this.reconOkKeySet.delete(key);
        this.saveReconOkKeys();
        this.okKeysList = this.okKeysList.filter(k => k !== key);
        this.updatePagedReconciliationResults();
      }
    });
  }

  markAsOkPermanentByKey(key?: string) {
    if (!key) return;
    this.operationApi.markOk(key).subscribe({
      next: () => {
        this.reconOkKeySet.add(key);
        this.saveReconOkKeys();
        this.applyOkStatusesToOpAndRev();
        try { this.operationApi.saveReconStatus(key, 'OK').subscribe(); } catch {}
        this.updateEntityStatusesForKey(key, 'OK');
        this.updatePagedReconciliationResults();
        // Persister reconStatus sur opération et relevé si connus
        // Persistance côté base au niveau des résultats seulement (clé mark-ok déjà enregistrée)
      },
      error: () => {
        this.reconOkKeySet.add(key);
        this.saveReconOkKeys();
        this.applyOkStatusesToOpAndRev();
        try { this.operationApi.saveReconStatus(key, 'OK').subscribe(); } catch {}
        this.updateEntityStatusesForKey(key, 'OK');
        this.updatePagedReconciliationResults();
        // Persistance côté base au niveau des résultats seulement (clé mark-ok déjà enregistrée)
      }
    });
  }

  unmarkOkByKey(key?: string) {
    if (!key) return;
    this.operationApi.unmarkOk(key).subscribe({
      next: () => {
        this.reconOkKeySet.delete(key);
        this.saveReconOkKeys();
        this.applyOkStatusesToOpAndRev();
        this.updatePagedReconciliationResults();
      },
      error: () => {
        this.reconOkKeySet.delete(key);
        this.saveReconOkKeys();
        this.applyOkStatusesToOpAndRev();
        this.updatePagedReconciliationResults();
      }
    });
  }

  // Statuts pour tableau Opérations (indexés par id)
  private opStatusOverrides: Record<string, 'OK' | 'KO'> = {};
  
  getTraitementClass(traitement?: string): string {
    if (!traitement) return 'badge-traitement-empty';
    switch (traitement) {
      case 'Niveau reconciliation':
        return 'badge-traitement-support';
      case 'Niveau Group':
        return 'badge-traitement-group';
      case 'Terminé':
        return 'badge-traitement-termine';
      default:
        return 'badge-traitement-default';
    }
  }

  startEditTraitement(operation: OperationBancaireDisplay) {
    this.editingOperation = operation;
  }

  stopEditTraitement() {
    this.editingOperation = null;
  }

  onTraitementChange(operation: OperationBancaireDisplay) {
    if (!operation.id) return;
    
    const updateData = {
      traitement: operation.traitement || undefined
    };
    
    this.operationBancaireService.updateOperationBancaire(operation.id, updateData).subscribe({
      next: (updatedOperation) => {
        console.log('Traitement mis à jour avec succès');
        // Mettre à jour l'opération dans la liste
        const index = this.operations.findIndex(op => op.id === operation.id);
        if (index !== -1) {
          this.operations[index].traitement = updatedOperation.traitement;
        }
        const filteredIndex = this.filteredOperations.findIndex(op => op.id === operation.id);
        if (filteredIndex !== -1) {
          this.filteredOperations[filteredIndex].traitement = updatedOperation.traitement;
        }
        this.stopEditTraitement();
      },
      error: (err) => {
        console.error('Erreur lors de la mise à jour du traitement', err);
        // Restaurer la valeur précédente en cas d'erreur
        const originalOp = this.operations.find(op => op.id === operation.id);
        if (originalOp) {
          operation.traitement = originalOp.traitement;
        }
      }
    });
  }
  
  getOperationReconStatus(op: OperationBancaireDisplay): 'OK' | 'KO' {
    const key = op && (op as any).id !== undefined ? String((op as any).id) : '';
    // 1) override direct par id
    const direct = key ? this.opStatusOverrides[key] : undefined;
    if (direct) return direct;
    // 2) priorité aux OK définitifs par base
    const base = this.buildBaseReconKeyForOperation(op);
    if (this.hasOkByBase(base)) {
      try { console.debug('[RECON][DBG][OP] OK via OK-def base', { id: (op as any).id, base }); } catch {}
      return 'OK';
    }
    // 3) fallback: statuts persistés
    const status = this.reconStatusBaseOverrides[base] || 'KO';
    try { console.debug('[RECON][DBG][OP] status via persisted map/base', { id: (op as any).id, base, status }); } catch {}
    return status;
  }
  // Désactivé: la modification doit se faire uniquement dans Correspondances
  toggleOperationReconStatus(op: OperationBancaireDisplay) { return; }

  // Statuts pour tableau Relevé (indexés par id)
  private releveStatusOverrides: Record<string, 'OK' | 'KO'> = {};
  getReleveReconStatus(row: ReleveBancaireRow): 'OK' | 'KO' {
    const key = row && (row as any).id !== undefined ? String((row as any).id) : '';
    // 1) override direct par id
    const direct = key ? this.releveStatusOverrides[key] : undefined;
    if (direct) return direct;
    // 2) priorité aux OK définitifs par base (date valeur puis date comptable)
    const base = this.buildBaseReconKeyForReleve(row);
    if (this.hasOkByBase(base)) { try { console.debug('[RECON][DBG][RV] OK via OK-def baseValue', { id: (row as any).id, base }); } catch {} return 'OK'; }
    const altBase = this.buildBaseReconKeyForReleveUsingDateComptable(row);
    if (this.hasOkByBase(altBase)) { try { console.debug('[RECON][DBG][RV] OK via OK-def baseComptable', { id: (row as any).id, altBase }); } catch {} return 'OK'; }
    // 3) fallback via statuts persistés
    const status = this.reconStatusBaseOverrides[base];
    if (status) { try { console.debug('[RECON][DBG][RV] status via persisted baseValue', { id: (row as any).id, base, status }); } catch {} return status; }
    const altStatus = this.reconStatusBaseOverrides[altBase] || 'KO';
    try { console.debug('[RECON][DBG][RV] status via persisted baseComptable', { id: (row as any).id, altBase, status: altStatus }); } catch {}
    return altStatus;
    }
  // Désactivé: la modification doit se faire uniquement dans Correspondances
  toggleReleveReconStatus(row: ReleveBancaireRow) { return; }

  getReconStatusByKey(key: string | undefined, defaultStatus: 'OK' | 'KO'): 'OK' | 'KO' {
    if (!key) return defaultStatus;
    // Priorité: si la base de cette clé est marquée OK définitif, retourner OK
    try { const baseKey = this.toBaseReconKey(key); if (this.hasOkByBase(baseKey)) { try { console.debug('[RECON][DBG][KEY] OK via OK-def base', { key, baseKey }); } catch {} return 'OK'; } } catch {}
    const direct = this.reconStatusOverrides[key];
    if (direct) return direct;
    // fallback: utiliser la clé de base (sans le suffixe numérique)
    const baseKey = this.toBaseReconKey(key);
    const status = this.reconStatusBaseOverrides[baseKey] || defaultStatus;
    try { console.debug('[RECON][DBG][KEY] status via persisted/base', { key, baseKey, status }); } catch {}
    return status;
  }

  private toBaseReconKey(key: string): string {
    // format: yyyymmdd<montant><BANQUE><debit|credit><index>
    // on retire les chiffres de fin après debit/credit
    const m = key.match(/(debit|credit)\d+$/i);
    if (!m) return key;
    return key.replace(/(debit|credit)\d+$/i, (s) => s.replace(/\d+$/, ''));
  }

  // Dériver une clé de base pour une opération, sans index en fin
  private buildBaseReconKeyForOperation(op: OperationBancaireDisplay): string {
    const date = this.normalizeDateToYmd(op.dateOperation);
    const montantAbs = Math.abs(op.montant || 0);
    const banque = ((op.bo || '').trim() || '').toUpperCase().replace(/[\s-]/g, '');
    const sens = this.determineOperationSens(op as OperationBancaireDisplay); // 'debit' | 'credit'
    const dateNoDash = (date || '').replace(/-/g, '');
    const montantDigits = String(montantAbs).replace(/\D/g, '');
    return `${dateNoDash}${montantDigits}${banque}${sens}`;
  }

  // Dériver une clé de base pour une ligne de relevé, sans index
  private buildBaseReconKeyForReleve(r: ReleveBancaireRow): string {
    const dateRaw: any = r.dateValeur || r.dateComptable || '';
    const date = this.normalizeDateToYmd(dateRaw as any);
    // IMPORTANT: la clé côté relevé doit s'appuyer sur Débit/Crédit (absolu),
    // pas sur le champ Montant éventuel (qui peut inclure des frais ou un signe)
    const debit = (r.debit || 0) > 0 ? Math.abs(r.debit as number) : 0;
    const credit = (r.credit || 0) > 0 ? Math.abs(r.credit as number) : 0;
    const amount = debit > 0 ? debit : (credit > 0 ? credit : 0);
    try { console.debug('[RECON][DBG][RV][BASE] amount used for key', { id: (r as any).id, debit, credit, amount }); } catch {}
    const banque = ((r.banque || '').trim() || '').toUpperCase().replace(/[\s-]/g, '');
    const sens: 'debit' | 'credit' = (r.debit && r.debit > 0) ? 'debit' : 'credit';
    const dateNoDash = (date || '').replace(/-/g, '');
    const montantDigits = String(amount).replace(/\D/g, '');
    return `${dateNoDash}${montantDigits}${banque}${sens}`;
  }

  // Variante: construire la clé de base en forçant l'utilisation de la date comptable
  private buildBaseReconKeyForReleveUsingDateComptable(r: ReleveBancaireRow): string {
    const date = this.normalizeDateToYmd(r.dateComptable as any);
    const debit = (r.debit || 0) > 0 ? Math.abs(r.debit as number) : 0;
    const credit = (r.credit || 0) > 0 ? Math.abs(r.credit as number) : 0;
    const amount = debit > 0 ? debit : (credit > 0 ? credit : 0);
    try { console.debug('[RECON][DBG][RV][BASE-ALT] amount used for key', { id: (r as any).id, debit, credit, amount }); } catch {}
    const banque = ((r.banque || '').trim() || '').toUpperCase().replace(/[\s-]/g, '');
    const sens: 'debit' | 'credit' = (r.debit && r.debit > 0) ? 'debit' : 'credit';
    const dateNoDash = (date || '').replace(/-/g, '');
    const montantDigits = String(amount).replace(/\D/g, '');
    return `${dateNoDash}${montantDigits}${banque}${sens}`;
  }

  toggleReconStatusByKey(key: string | undefined, defaultStatus: 'OK' | 'KO') {
    if (!key) return;
    const current = this.getReconStatusByKey(key, defaultStatus);
    const next: 'OK' | 'KO' = current === 'OK' ? 'KO' : 'OK';
    console.log('[RECON] toggle status', { key, current, next, defaultStatus });
    // Ne stocker que si différent du défaut
    if (next === defaultStatus) {
      delete this.reconStatusOverrides[key];
    } else {
      this.reconStatusOverrides[key] = next;
    }
    // Propager aux tableaux Op/Relevé si présents
    const opAny: any = (this as any).keyToOp && (this as any).keyToOp[key];
    if (opAny && opAny.id !== undefined) {
      const opId = String(opAny.id);
      this.opStatusOverrides[opId] = next;
    }
    const revAny: any = (this as any).keyToRev && (this as any).keyToRev[key];
    if (revAny && revAny.id !== undefined) {
      const revId = String(revAny.id);
      this.releveStatusOverrides[revId] = next;
    }
    // Persister statut correspondance
    try {
      this.operationApi.saveReconStatus(key, next).subscribe({
        next: () => console.log('[RECON] status saved', { key, next }),
        error: (err) => console.warn('[RECON] status save failed', { key, next, err })
      });
    } catch (e) { console.warn('[RECON] status save threw', e); }

    // Persister recon_status au niveau des entités liées (si présents)
    try { this.updateEntityStatusesForKey(key, next); } catch (e) { try { console.warn('[RECON] entity status update threw', e); } catch {} }

    // Mettre à jour le total des suspens KO après bascule
    this.updateTotalSuspensKO();
  }

  // Gestion sélection multi
  toggleSelectKey(key?: string) {
    if (!key) return;
    if (this.selectedReconKeys.has(key)) this.selectedReconKeys.delete(key); else this.selectedReconKeys.add(key);
  }

  isKeySelected(key?: string): boolean {
    return !!key && this.selectedReconKeys.has(key);
  }

  toggleSelectAllCurrentPage() {
    const list = this.reconView === 'corr_operation' ? this.pagedMatchedOps : this.pagedMatchedReleves;
    const keys = list.map((it: any) => it.key).filter((k: any) => !!k);
    const allSelected = keys.every((k: string) => this.selectedReconKeys.has(k));
    if (allSelected) {
      keys.forEach(k => this.selectedReconKeys.delete(k));
      this.selectAllOnPage = false;
    } else {
      keys.forEach(k => this.selectedReconKeys.add(k));
      this.selectAllOnPage = true;
    }
  }

  clearSelection() {
    this.selectedReconKeys.clear();
    this.selectAllOnPage = false;
  }

  // Actions bulk: marquer OK définitif et annuler
  bulkMarkOkDefinitif() {
    const keys = Array.from(this.selectedReconKeys);
    if (!keys.length) { this.popupService.showWarning('Sélectionnez au moins une ligne.'); return; }
    this.operationApi.markOkBulk(keys).subscribe({
      next: () => {
        keys.forEach(k => this.reconOkKeySet.add(k));
        this.saveReconOkKeys();
        try {
          const entries = keys.map(k => ({ key: k, status: 'OK' as const }));
          this.operationApi.saveReconStatusBulk(entries).subscribe();
        } catch {}
        this.applyOkStatusesToOpAndRev();
        // Mettre à jour le recon_status des entités liées (opération & relevé) si identifiants connus
        try { keys.forEach(k => this.updateEntityStatusesForKey(k, 'OK')); } catch {}
        this.updatePagedReconciliationResults();
        this.clearSelection();
      },
      error: () => {
        keys.forEach(k => this.reconOkKeySet.add(k));
        this.saveReconOkKeys();
        try {
          const entries = keys.map(k => ({ key: k, status: 'OK' as const }));
          this.operationApi.saveReconStatusBulk(entries).subscribe();
        } catch {}
        this.applyOkStatusesToOpAndRev();
        try { keys.forEach(k => this.updateEntityStatusesForKey(k, 'OK')); } catch {}
        this.updatePagedReconciliationResults();
        this.clearSelection();
      }
    });
  }

  // Mettre à jour le recon_status des entités côté base si l'identifiant est disponible
  private updateEntityStatusesForKey(key: string, status: 'OK' | 'KO') {
    try {
      const opAny: any = (this as any).keyToOp && (this as any).keyToOp[key];
      if (opAny && opAny.id !== undefined) {
        this.operationBancaireService.updateReconStatus(opAny.id, status).subscribe({ next: () => {}, error: () => {} });
      }
    } catch {}
    try {
      const revAny: any = (this as any).keyToRev && (this as any).keyToRev[key];
      if (revAny && revAny.id !== undefined) {
        this.releveService.updateReconStatus(revAny.id, status).subscribe({ next: () => {}, error: () => {} });
      }
    } catch {}
  }

  bulkUnmarkOk() {
    const keys = Array.from(this.selectedReconKeys);
    if (!keys.length) { this.popupService.showWarning('Sélectionnez au moins une ligne.'); return; }
    this.operationApi.unmarkOkBulk(keys).subscribe({
      next: () => {
        keys.forEach(k => this.reconOkKeySet.delete(k));
        this.saveReconOkKeys();
        this.applyOkStatusesToOpAndRev();
        this.updatePagedReconciliationResults();
        this.clearSelection();
      },
      error: () => {
        keys.forEach(k => this.reconOkKeySet.delete(k));
        this.saveReconOkKeys();
        this.applyOkStatusesToOpAndRev();
        this.updatePagedReconciliationResults();
        this.clearSelection();
      }
    });
  }

  // Formulaire d'édition
  editForm: any = {
    dateOperation: '',
    agence: '',
    typeOperation: '',
    montant: 0,
    reference: '',
    idGlpi: '',
    bo: '',
    banqueCorrigee: '',
    statut: '',
    traitement: '',
    demandeur: '',
    valideur: ''
  };

  constructor(
    private router: Router,
    private operationBancaireService: OperationBancaireService,
    private compteService: CompteService,
    private operationService: OperationService,
    private releveService: ReleveBancaireService,
    private operationApi: OperationServiceApi,
    private exportOptimizationService: ExportOptimizationService,
    private popupService: PopupService,
    private calculService: ConfigurationCalculService
  ) { }

  private normalizeCountryName(input: string): string {
    return (input || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[’']/g, '') // remove apostrophes variants
      .replace(/\s+/g, ' ');
  }

  private resolveDisplayCountryName(input: string): string {
    return countryDisplayLabel(input) || input.trim();
  }

  ngOnInit(): void {
    console.log('Composant BANQUE initialisé');
    this.calculService.loadRules().subscribe();
    this.loadReconOkKeys();
    // Charger aussi les clés OK depuis le backend (si disponibles)
    try {
      this.operationApi.getOkKeys('BANQUE').subscribe({
        next: (keys) => {
          if (Array.isArray(keys)) {
            keys.forEach(k => this.reconOkKeySet.add(k));
            this.saveReconOkKeys();
            console.log('[RECON] OK keys loaded:', keys.length, keys.slice(0, 10));
          }
        },
        error: (err) => console.warn('[RECON] OK keys load failed:', err)
      });
      // Charger les statuts recon persistés en base et les appliquer
      this.operationApi.listReconStatus('BANQUE').subscribe({
        next: (map) => {
          console.log('[RECON] Status map loaded:', map);
          if (map && typeof map === 'object') {
            this.reconStatusOverrides = {} as any;
            this.reconStatusBaseOverrides = {} as any;
            Object.entries(map).forEach(([k, v]) => {
              const val = (v as any) === 'OK' ? 'OK' : 'KO';
              this.reconStatusOverrides[k] = val;
              const base = this.toBaseReconKey(k);
              // ne pas écraser un OK par KO si plusieurs clés mappent sur la même base
              if (!this.reconStatusBaseOverrides[base] || this.reconStatusBaseOverrides[base] === 'KO') {
                this.reconStatusBaseOverrides[base] = val;
              }
            });
            this.updatePagedReconciliationResults();
          }
        },
        error: (err) => console.warn('[RECON] Status map load failed:', err)
      });
    } catch (e) { console.warn('[RECON] init load threw', e); }
    this.loadOperations();
    this.loadComptesBanque();
    this.loadDashboardStats();
    this.loadLatestReleveBatch();
  }

  onReconPaysChange() {
    try {
      const code = this.getReconCountryCode();
      console.log('[RECON][DBG] Country changed', { reconPays: this.reconPays, reconCode: code });
    } catch {}
  }

  // Comptes de catégorie Banque (section Informations)
  comptesBanque: Compte[] = [];
  loadingComptesBanque = false;
  comptesBanqueError = '';
  comptesSearch = '';
  // Pagination liste des comptes
  comptesListPage = 1;
  comptesListPageSize = 5;
  get comptesListTotalPages(): number {
    const total = this.comptesBanqueDisplayed.length;
    return Math.ceil(total / this.comptesListPageSize) || 1;
  }
  
  get comptesListStartIndex(): number {
    return ((this.comptesListPage - 1) * this.comptesListPageSize) + 1;
  }
  
  get comptesListEndIndex(): number {
    return Math.min(this.comptesListPage * this.comptesListPageSize, this.comptesBanqueDisplayed.length);
  }
  comptesListFirstPage() {
    this.comptesListPage = 1;
  }
  comptesListPrevPage() {
    if (this.comptesListPage > 1) this.comptesListPage--;
  }
  comptesListNextPage() {
    if (this.comptesListPage < this.comptesListTotalPages) this.comptesListPage++;
  }
  comptesListLastPage() {
    this.comptesListPage = this.comptesListTotalPages;
  }
  onComptesListPageSizeChange() {
    this.comptesListPage = 1;
  }
  selectedCompteNumero: string | null = null;
  // Popup opérations du compte
  showCompteOpsPopup = false;
  compteOpsNumero: string | null = null;
  compteOpsAll: OperationBancaireDisplay[] = [];
  compteOpsFiltered: OperationBancaireDisplay[] = [];
  compteOpsPaged: OperationBancaireDisplay[] = [];
  compteOpsPage = 1;
  compteOpsPageSize = 10;
  compteOpsTotalPages = 1;
  compteOpsDateFrom = '';
  compteOpsDateTo = '';
  // Soldes relevé pour le compte affiché (si disponibles depuis relevé importé)
  compteReleveSoldeOuverture: number | null = null;
  compteReleveSoldeCloture: number | null = null;

  loadComptesBanque() {
    this.loadingComptesBanque = true;
    this.comptesBanqueError = '';
    this.compteService.filterComptes({ categorie: ['Banque'] }, 'BANQUE').subscribe({
      next: (comptes) => {
        this.comptesBanque = (comptes || []).sort((a, b) => (a.codeProprietaire || '').localeCompare(b.codeProprietaire || ''));
        // Construire la table de correspondance compte -> pays
        const map: Record<string, string> = {};
        (this.comptesBanque || []).forEach(c => {
          const num = (c.numeroCompte || '').trim();
          const pays = (c.pays || '').trim();
          if (num && pays) map[num] = pays;
        });
        this.accountCountryMap = map;
        this.loadingComptesBanque = false;
      },
      error: (err) => {
        console.error('Erreur chargement comptes Banque', err);
        this.comptesBanqueError = 'Erreur lors du chargement des comptes Banque';
        this.loadingComptesBanque = false;
      }
    });
  }

  // Dashboard stats
  totalSoldeComptes = 0;
  totalOperations = 0;
  totalComptes = 0;
  totalEnAttente = 0;
  totalReleveLignes = 0; // Nombre de lignes de relevé (tous lots)
  totalTicketsACreer = 0; // Opérations bancaires sans ID TICKET
  // Suspens (écarts) comptage global
  totalSuspensBO = 0;
  totalSuspensBanque = 0;
  totalSuspens = 0;

  // Mapping numéro de compte -> pays pour cloisonnement par pays sur relevés
  private accountCountryMap: Record<string, string> = {};

  loadDashboardStats() {
    // Comptes Banque uniquement
    this.compteService.filterComptes({ categorie: 'Banque' }, 'BANQUE').subscribe({
      next: (comptes) => {
        const list = comptes || [];
        this.totalComptes = list.length;
        this.totalSoldeComptes = list.reduce((sum, c) => sum + (c.solde || 0), 0);
      }
    });

    // Opérations bancaires uniquement
    this.operationBancaireService.getAllOperationsBancaires('BANQUE').subscribe({
      next: (ops) => {
        const list = ops || [];
        this.totalOperations = list.length;
        this.totalEnAttente = list.filter(o => (o.statut || '').toLowerCase() === 'en attente' || (o.statut || '').toLowerCase() === 'en cours').length;
        // Compter les tickets à créer : 
        // - opérations sans ID TICKET (undefined, null ou vide) OU
        // - opérations dont ID TICKET contient "créer" (pas case-sensitive)
        // - mais exclure celles dont ID TICKET contient "modifier" (pas case-sensitive)
        // - avec statut "en attente" ou "en cours"
        this.totalTicketsACreer = list.filter(o => {
          const idGlpiStr = (o.idGlpi || '').trim();
          const idGlpiLower = idGlpiStr.toLowerCase();
          
          // Exclure les tickets qui contiennent "modifier"
          if (idGlpiLower.includes('modifier')) {
            return false;
          }
          
          // Compter si : vide/null/undefined OU contient "créer"
          const hasNoIdGlpi = idGlpiStr === '';
          const containsCreer = idGlpiLower.includes('créer');
          
          const isEnAttenteOuEnCours = ((o.statut || '').toLowerCase() === 'en attente') || ((o.statut || '').toLowerCase() === 'en cours');
          
          return (hasNoIdGlpi || containsCreer) && isEnAttenteOuEnCours;
        }).length;
        console.log('[DASHBOARD] Tickets à créer:', this.totalTicketsACreer, 'sur', this.totalOperations, 'opérations');
      }
    });
  }

  // Calcul du nombre de suspens : une ligne est KO si elle n'est dans aucune correspondance (même règle que la réconciliation)
  private updateTotalSuspensKO() {
    try {
      const matchedOpIds = new Set((this.matchedOperations || []).map(op => op.id));
      const matchedReleveIds = new Set((this.matchedReleves || []).map(r => r.id));
      // Suspens BO : opérations hors correspondance
      const koOps = (this.operations || []).filter(op => !matchedOpIds.has(op.id)).length;
      // Suspens relevé : lignes du batch courant hors correspondance
      const koReleves = (this.releveRows || []).filter(r => !matchedReleveIds.has(r.id)).length;
      this.totalSuspensBO = koOps;
      this.totalSuspensBanque = koReleves;
      this.totalSuspens = koOps + koReleves;
    } catch {
      this.totalSuspensBO = 0;
      this.totalSuspensBanque = 0;
      this.totalSuspens = 0;
    }
  }

  get comptesBanqueDisplayed(): Compte[] {
    const term = (this.comptesSearch || '').toLowerCase().trim();
    if (!term) return this.comptesBanque;
    return this.comptesBanque.filter(c =>
      (c.numeroCompte || '').toLowerCase().includes(term) ||
      (c.codeProprietaire || '').toLowerCase().includes(term) ||
      (c.pays || '').toLowerCase().includes(term) ||
      (c.type || '').toLowerCase().includes(term) ||
      (c.categorie || '').toLowerCase().includes(term)
    );
  }

  copyToClipboard(value: string | undefined) {
    if (!value) return;
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(() => {
        console.log('Copié:', value);
      });
    }
  }

  toggleCompte(compte: Compte) {
    const num = compte.numeroCompte;
    this.selectedCompteNumero = this.selectedCompteNumero === num ? null : num;
  }

  openCompteRelevePopup(compte: Compte) {
    const numero = compte?.numeroCompte || '';
    this.compteOpsNumero = numero;
    // Filtrer toutes les opérations par numéro de compte
    this.compteOpsAll = (this.operations || []).filter(op => (op.compteADebiter || '') === numero)
      .sort((a, b) => (b.dateOperation as any).getTime() - (a.dateOperation as any).getTime());
    // Reset filtres et pagination
    this.compteOpsDateFrom = '';
    this.compteOpsDateTo = '';
    this.compteOpsPageSize = 10;
    this.compteOpsPage = 1;
    this.applyCompteOpsFilters();
    // Calculer solde d'ouverture / de clôture à partir des lignes de relevé importées
    try {
      const normalizeAcc = (s: string) => (s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().trim();
      const target = normalizeAcc(numero);
      const rowsForAccount = (this.releveRows || []).filter(r => normalizeAcc(r.numeroCompte || '') === target);
      const firstNonNull = (...vals: Array<number | null | undefined>) => {
        for (const v of vals) { if (typeof v === 'number' && !isNaN(v)) return v; }
        return null;
      };
      let ouverture: number | null = null;
      let cloture: number | null = null;
      for (const r of rowsForAccount) {
        if (ouverture === null) {
          ouverture = firstNonNull(r.soldeDisponibleOuverture as any, r.soldeComptableOuverture as any);
        }
        if (cloture === null) {
          cloture = firstNonNull(r.soldeDisponibleCloture as any, r.soldeComptableCloture as any, r.soldeCourant as any);
        }
        if (ouverture !== null && cloture !== null) break;
      }
      // Fallback: si aucun relevé n'a de solde, utiliser le solde du compte comme clôture
      if (cloture === null && typeof compte.solde === 'number') cloture = compte.solde as any;
      this.compteReleveSoldeOuverture = ouverture;
      this.compteReleveSoldeCloture = cloture;
    } catch {}
    this.showCompteOpsPopup = true;
  }

  closeCompteRelevePopup() {
    this.showCompteOpsPopup = false;
  }

  applyCompteOpsFilters() {
    const from = this.compteOpsDateFrom ? new Date(this.compteOpsDateFrom) : null;
    const to = this.compteOpsDateTo ? new Date(this.compteOpsDateTo) : null;
    this.compteOpsFiltered = (this.compteOpsAll || []).filter(op => {
      let ok = true;
      if (from) ok = ok && (op.dateOperation >= from);
      if (to) ok = ok && (op.dateOperation <= to);
      return ok;
    });
    this.compteOpsPage = 1;
    this.updateCompteOpsPaged();
  }

  onCompteOpsPageSizeChange() {
    this.compteOpsPage = 1;
    this.updateCompteOpsPaged();
  }

  updateCompteOpsPaged() {
    const total = this.compteOpsFiltered.length;
    this.compteOpsTotalPages = Math.ceil(total / this.compteOpsPageSize) || 1;
    const start = (this.compteOpsPage - 1) * this.compteOpsPageSize;
    this.compteOpsPaged = this.compteOpsFiltered.slice(start, start + this.compteOpsPageSize);
  }

  compteOpsNextPage() {
    if (this.compteOpsPage < this.compteOpsTotalPages) {
      this.compteOpsPage++;
      this.updateCompteOpsPaged();
    }
  }

  compteOpsPrevPage() {
    if (this.compteOpsPage > 1) {
      this.compteOpsPage--;
      this.updateCompteOpsPaged();
    }
  }

  compteOpsGoToPage(page: number) {
    if (page >= 1 && page <= this.compteOpsTotalPages) {
      this.compteOpsPage = page;
      this.updateCompteOpsPaged();
    }
  }

  getCompteOpsVisiblePages(): number[] {
    const maxVisible = 5;
    const pages: number[] = [];
    const total = this.compteOpsTotalPages;
    const current = this.compteOpsPage;
    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      let start = Math.max(1, current - 2);
      let end = Math.min(total, start + maxVisible - 1);
      if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  }

  // =========================
  // Débit/Crédit affichage (règles métier)
  // =========================
  private banqueTypeMatches(rawType: string | null | undefined, tokens: string[]): boolean {
    const normalized = (rawType || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return tokens.some(token => normalized.includes(token));
  }

  private getOperationDirection(op: OperationBancaireDisplay): 'debit' | 'credit' {
    const appro = this.calculService.getList('BANQUE.TYPES_APPROVISIONNEMENT', ['APPRO']);
    const comp = this.calculService.getList('BANQUE.TYPES_COMPENSATION', ['COMPENS', 'COMPENSE']);
    const nivel = this.calculService.getList('BANQUE.TYPES_NIVELLEMENT', ['NIVEL', 'NIVELLEMENT']);
    if (this.banqueTypeMatches(op.typeOperation, appro)) return 'credit';
    if (this.banqueTypeMatches(op.typeOperation, comp)) return 'debit';
    if (this.banqueTypeMatches(op.typeOperation, nivel)) return (op.montant || 0) < 0 ? 'debit' : 'credit';
    return (op.montant || 0) < 0 ? 'debit' : 'credit';
  }

  getDebitForOperation(op: OperationBancaireDisplay): number | null {
    const dir = this.getOperationDirection(op);
    if (dir === 'debit') return Math.abs(op.montant || 0);
    return null;
  }

  getCreditForOperation(op: OperationBancaireDisplay): number | null {
    const dir = this.getOperationDirection(op);
    if (dir === 'credit') return Math.abs(op.montant || 0);
    return null;
  }

  async exportCompteOps() {
    const rows = this.compteOpsFiltered || [];
    const account = this.compteOpsNumero || '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `releve_compte_${account || 'NA'}_${ts}.xlsx`;

    const formatDate = (d: Date) => {
      if (!d) return '';
      const dd = pad(d.getDate());
      const mm = pad(d.getMonth()+1);
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const header = [
      'Compte', 'Date', 'Type', 'Agence', 'Bénéficiaire', 'Débit', 'Crédit', 'Référence', 'Statut'
    ];
    const aoa: any[] = [];
    aoa.push(header);
    rows.forEach(op => {
      const debit = this.getDebitForOperation(op);
      const credit = this.getCreditForOperation(op);
      aoa.push([
        account,
        formatDate(op.dateOperation as Date),
        op.typeOperation || '',
        op.agence || '',
        op.nomBeneficiaire || '',
        debit !== null ? debit : '',
        credit !== null ? credit : '',
        op.reference || '',
        op.statut || ''
      ]);
    });

    // Ajouter un résumé des soldes en bas si disponibles
    aoa.push([]);
    if (this.compteReleveSoldeOuverture !== null || this.compteReleveSoldeCloture !== null) {
      aoa.push(['Solde d\'ouverture', this.compteReleveSoldeOuverture !== null ? this.compteReleveSoldeOuverture : '']);
      aoa.push(['Solde de clôture', this.compteReleveSoldeCloture !== null ? this.compteReleveSoldeCloture : '']);
    }

    const XLSX: any = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Largeur des colonnes
    (ws['!cols'] as any) = [
      { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }
    ];

    // Styles en-tête
    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { fill: { fgColor: { rgb: 'D9E1F2' } }, font: { bold: true } };
    }
    // Zebra rows + formats
    for (let r = 1; r < aoa.length; r++) {
      const isAlt = r % 2 === 1;
      for (let c = 0; c < header.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const style: any = {};
        if (isAlt) style.fill = { fgColor: { rgb: 'F8F9FA' } };
        if (c === 5 || c === 6) {
          style.numFmt = '#,##0';
          style.alignment = { horizontal: 'right' };
        }
        // Appliquer style cumulatif si déjà présent
        cell.s = Object.assign({}, cell.s || {}, style);
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Relevé compte');
    XLSX.writeFile(wb, filename);
  }

  // Export des opérations bancaires filtrées (Excel)
  async exportOperations() {
    const rows = this.filteredOperations || [];
    if (!rows.length) return;

    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `operations_bancaires_${ts}.xlsx`;

    const formatDate = (d: Date) => {
      if (!d) return '';
      const dd = pad(d.getDate());
      const mm = pad(d.getMonth()+1);
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const header = [
      'Pays', 'Code Pays', 'Mois', 'Date Opération', 'Agence', 'Type Opération',
      'Nom du Bénéficiaire', 'Compte', 'Montant', 'Mode de Paiement', 'Référence',
      'ID TICKET', 'Banque', 'Banque Corrigée', 'Statut'
    ];

    const aoa: any[] = [];
    aoa.push(header);
    rows.forEach(op => {
      aoa.push([
        this.getPaysDisplay(op),
        op.codePays || '',
        op.mois || '',
        formatDate(op.dateOperation as Date),
        op.agence || '',
        op.typeOperation || '',
        op.nomBeneficiaire || '',
        op.compteADebiter || '',
        op.montant ?? '',
        op.modePaiement || '',
        op.reference || '',
        op.idGlpi || '',
        op.bo || '',
        op.banqueCorrigee || '',
        op.statut || ''
      ]);
    });

    const XLSX: any = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Largeur des colonnes
    (ws['!cols'] as any) = [
      { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 22 },
      { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 }
    ];

    // En-têtes colorés
    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { fill: { fgColor: { rgb: 'D9E1F2' } }, font: { bold: true } };
    }

    // Mise en forme
    for (let r = 1; r < aoa.length; r++) {
      // Montant en colonne 8 (index 8)
      const addr = XLSX.utils.encode_cell({ r, c: 8 });
      const cell = ws[addr];
      if (cell) cell.s = Object.assign({}, cell.s || {}, { numFmt: '#,##0', alignment: { horizontal: 'right' } });
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Opérations');
    XLSX.writeFile(wb, filename);
  }

  // Export des comptes de banque (Excel)
  async exportComptesBanque() {
    const rows = this.comptesBanqueDisplayed || [];
    if (!rows.length) return;

    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `comptes_banque_${ts}.xlsx`;

    const formatDate = (d: Date | string) => {
      if (!d) return '';
      const date = typeof d === 'string' ? new Date(d) : d;
      const dd = pad(date.getDate());
      const mm = pad(date.getMonth()+1);
      const yyyy = date.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const header = [
      'Numéro de Compte', 'Code Propriétaire', 'Pays', 'Catégorie', 'Type', 
      'Solde', 'Date Dernière MAJ'
    ];

    const aoa: any[] = [];
    aoa.push(header);
    rows.forEach(compte => {
      aoa.push([
        compte.numeroCompte || '',
        compte.codeProprietaire || '',
        compte.pays || '',
        compte.categorie || '',
        compte.type || '',
        compte.solde ?? '',
        formatDate(compte.dateDerniereMaj)
      ]);
    });

    const XLSX: any = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Largeur des colonnes
    (ws['!cols'] as any) = [
      { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, 
      { wch: 15 }, { wch: 18 }
    ];

    // En-têtes colorés avec dégradé vert
    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) {
        cell.s = { 
          fill: { fgColor: { rgb: '2E7D32' } }, 
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '1B5E20' } },
            bottom: { style: 'thin', color: { rgb: '1B5E20' } },
            left: { style: 'thin', color: { rgb: '1B5E20' } },
            right: { style: 'thin', color: { rgb: '1B5E20' } }
          }
        };
      }
    }

    // Mise en forme des données avec couleurs alternées
    for (let r = 1; r < aoa.length; r++) {
      const isEvenRow = r % 2 === 0;
      const rowColor = isEvenRow ? 'F8FFFE' : 'FFFFFF';
      
      // Couleur de fond pour toute la ligne
      for (let c = 0; c < header.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell) {
          cell.s = Object.assign({}, cell.s || {}, {
            fill: { fgColor: { rgb: rowColor } },
            border: {
              top: { style: 'thin', color: { rgb: 'E8F5E8' } },
              bottom: { style: 'thin', color: { rgb: 'E8F5E8' } },
              left: { style: 'thin', color: { rgb: 'E8F5E8' } },
              right: { style: 'thin', color: { rgb: 'E8F5E8' } }
            }
          });
        }
      }
      
      // Solde en colonne 5 (index 5) avec couleur conditionnelle
      const soldeAddr = XLSX.utils.encode_cell({ r, c: 5 });
      const soldeCell = ws[soldeAddr];
      if (soldeCell) {
        const solde = parseFloat(aoa[r][5]) || 0;
        const soldeColor = solde >= 0 ? 'E8F5E8' : 'FFEBEE';
        const textColor = solde >= 0 ? '2E7D32' : 'C62828';
        
        soldeCell.s = Object.assign({}, soldeCell.s || {}, {
          numFmt: '#,##0.00',
          alignment: { horizontal: 'right', vertical: 'center' },
          fill: { fgColor: { rgb: soldeColor } },
          font: { bold: true, color: { rgb: textColor } }
        });
      }
      
      // Code Propriétaire en colonne 1 (index 1) avec couleur bleue
      const ownerAddr = XLSX.utils.encode_cell({ r, c: 1 });
      const ownerCell = ws[ownerAddr];
      if (ownerCell) {
        ownerCell.s = Object.assign({}, ownerCell.s || {}, {
          fill: { fgColor: { rgb: 'E3F2FD' } },
          font: { color: { rgb: '1565C0' }, bold: true }
        });
      }
      
      // Pays en colonne 2 (index 2) avec couleur verte
      const countryAddr = XLSX.utils.encode_cell({ r, c: 2 });
      const countryCell = ws[countryAddr];
      if (countryCell) {
        countryCell.s = Object.assign({}, countryCell.s || {}, {
          fill: { fgColor: { rgb: 'E8F5E8' } },
          font: { color: { rgb: '2E7D32' }, bold: true }
        });
      }
      
      // Catégorie en colonne 3 (index 3) avec couleur orange
      const categoryAddr = XLSX.utils.encode_cell({ r, c: 3 });
      const categoryCell = ws[categoryAddr];
      if (categoryCell) {
        categoryCell.s = Object.assign({}, categoryCell.s || {}, {
          fill: { fgColor: { rgb: 'FFF3E0' } },
          font: { color: { rgb: 'E65100' }, bold: true }
        });
      }
      
      // Type en colonne 4 (index 4) avec couleur violette
      const typeAddr = XLSX.utils.encode_cell({ r, c: 4 });
      const typeCell = ws[typeAddr];
      if (typeCell) {
        typeCell.s = Object.assign({}, typeCell.s || {}, {
          fill: { fgColor: { rgb: 'F3E5F5' } },
          font: { color: { rgb: '7B1FA2' }, bold: true }
        });
      }
      
      // Date en colonne 6 (index 6) avec couleur violette
      const dateAddr = XLSX.utils.encode_cell({ r, c: 6 });
      const dateCell = ws[dateAddr];
      if (dateCell) {
        dateCell.s = Object.assign({}, dateCell.s || {}, {
          fill: { fgColor: { rgb: 'E8EAF6' } },
          font: { color: { rgb: '3F51B5' }, bold: true },
          alignment: { horizontal: 'center' }
        });
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Comptes Banque');
    XLSX.writeFile(wb, filename);
  }

  // Navigation
  showOperationsTable() {
    this.showOperations = true;
    this.activeSection = 'operations';
  }

  hideOperationsTable() {
    this.showOperations = false;
    this.activeSection = 'home';
  }

  // Contrôle de visibilité des colonnes Actions
  toggleActionsColumn() {
    this.showActionsColumn = !this.showActionsColumn;
  }

  // Contrôle de visibilité de la colonne commentaire
  toggleCommentColumn() {
    this.showCommentColumn = !this.showCommentColumn;
  }

  // Traitement Automatique (Opérations)
  toggleOpAutoTreatment() {
    this.showOpAutoTreatment = !this.showOpAutoTreatment;
  }

  onOpAutoTreatmentProgress(message: string) {
    console.log('[OP AUTO TREATMENT] Progress:', message);
  }

  onOpAutoTreatmentResult(event: { rows: Record<string, any>[]; outputName: string; lineCount: number; modelName: string }) {
    console.log('[OP AUTO TREATMENT] Result:', event);
    void this.promptLoadTreatedData(event, 'operations');
  }

  // Traitement Automatique (Suivi compense OP) — masqué par défaut
  toggleSuiviCompenseAutoTreatment() {
    this.showSuiviCompenseAutoTreatment = !this.showSuiviCompenseAutoTreatment;
  }

  // Traitement Automatique (Relevé)
  toggleReleveAutoTreatment() {
    this.showReleveAutoTreatment = !this.showReleveAutoTreatment;
  }

  onReleveAutoTreatmentProgress(message: string) {
    console.log('[RELEVE AUTO TREATMENT] Progress:', message);
  }

  onReleveAutoTreatmentResult(event: { rows: Record<string, any>[]; outputName: string; lineCount: number; modelName: string }) {
    console.log('[RELEVE AUTO TREATMENT] Result:', event);
    void this.promptLoadTreatedData(event, 'releve');
  }

  // Suivi compense OP : traitement automatique (résultat chargé directement dans le suivi)
  onSuiviCompenseAutoTreatmentProgress(message: string) {
    console.log('[SUIVI COMPENSE AUTO TREATMENT] Progress:', message);
  }

  onSuiviCompenseAutoTreatmentResult(event: { rows: Record<string, any>[]; outputName: string; lineCount: number; modelName: string }) {
    console.log('[SUIVI COMPENSE AUTO TREATMENT] Result:', event);
    void this.importTreatedSuiviCompense(event);
  }

  private async importTreatedSuiviCompense(
    event: { rows: Record<string, any>[]; outputName: string; lineCount: number; modelName: string }
  ): Promise<void> {
    const rows = Array.isArray(event?.rows) ? event.rows : [];
    if (!rows.length) {
      await this.popupService.showWarning(
        'Le traitement automatique n’a produit aucune ligne exploitable.',
        'Suivi compense OP'
      );
      return;
    }
    try {
      const file = await this.buildTreatedRowsFile(rows, 'suivi', event.outputName);
      const res: any = await firstValueFrom(this.suiviCompenseService.upload(file));
      const saved = Number(res?.saved ?? 0);
      const totalRead = Number(res?.totalRead ?? rows.length);
      const duplicates = Number(res?.duplicatesIgnored ?? 0);
      if (!saved) {
        await this.popupService.showWarning(
          `Aucune ligne n’a été enregistrée (${totalRead.toLocaleString('fr-FR')} ligne(s) lue(s)).\n` +
          'Vérifiez que les colonnes du modèle correspondent au suivi compense OP.',
          'Suivi compense OP'
        );
        return;
      }
      await this.popupService.showSuccess(
        `${saved.toLocaleString('fr-FR')} ligne(s) chargée(s) sur ${totalRead.toLocaleString('fr-FR')} lue(s)` +
        `${duplicates ? ` — ${duplicates} doublon(s) ignoré(s)` : ''}.`,
        'Suivi compense OP'
      );
      this.loadSuiviCompense();
    } catch (err: any) {
      console.error('[SUIVI COMPENSE AUTO TREATMENT] Import failed', err);
      await this.popupService.showError(
        `Impossible de charger les données traitées : ${err?.error?.error || err?.message || 'erreur inconnue'}`,
        'Suivi compense OP'
      );
    }
  }

  // Traitement Automatique unifié (page Banque)
  openAutoTreatment() {
    this.activeSection = 'traitement';
    this.showOperations = false;
    setTimeout(() => {
      const el = document.querySelector('.auto-treatment-unified');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  onBankAutoTreatmentProgress(message: string) {
    console.log('[BANK AUTO TREATMENT] Progress:', message);
  }

  onBankAutoTreatmentResult(event: { rows: Record<string, any>[]; outputName: string; lineCount: number; modelName: string }) {
    console.log('[BANK AUTO TREATMENT] Result:', event);
    void this.promptLoadTreatedData(event, 'operations');
  }

  /**
   * Après le traitement automatique : demande à l'utilisateur où charger les données
   * (opérations bancaires ou relevé bancaire), puis lance l'import correspondant.
   */
  private async promptLoadTreatedData(
    event: { rows: Record<string, any>[]; outputName: string; lineCount: number; modelName: string },
    defaultDestination: 'operations' | 'releve'
  ): Promise<void> {
    const rows = Array.isArray(event?.rows) ? event.rows : [];
    if (!rows.length) {
      await this.popupService.showWarning(
        'Le traitement automatique n’a produit aucune ligne exploitable.',
        'Traitement automatique'
      );
      return;
    }

    const operationsLabel = 'Opérations bancaires';
    const releveLabel = 'Relevé bancaire';
    const defaultLabel = defaultDestination === 'releve' ? releveLabel : operationsLabel;
    const lineCount = event.lineCount || rows.length;

    const choice = await this.popupService.showSelectInput(
      `${lineCount.toLocaleString('fr-FR')} ligne(s) traitée(s) avec le modèle « ${event.modelName} ».\n\n` +
      'Où souhaitez-vous charger ces données ?',
      'Charger les données traitées',
      [operationsLabel, releveLabel],
      defaultLabel
    );

    if (!choice) {
      return;
    }

    const destination: 'operations' | 'releve' = choice === releveLabel ? 'releve' : 'operations';
    await this.importTreatedRows(rows, destination, event.outputName);
  }

  private async importTreatedRows(
    rows: Record<string, any>[],
    destination: 'operations' | 'releve',
    outputName: string
  ): Promise<void> {
    try {
      const file = await this.buildTreatedRowsFile(rows, destination, outputName);

      if (destination === 'operations') {
        const res: any = await firstValueFrom(this.operationBancaireService.upload(file));
        const saved = Number(res?.saved ?? 0);
        const totalRead = Number(res?.totalRead ?? rows.length);
        const opbDuplicates = Number(res?.duplicatesIgnored ?? 0);
        const errors = Array.isArray(res?.errors) ? res.errors.length : 0;

        if (!saved) {
          const errorDetails = Array.isArray(res?.errors) && res.errors.length
            ? `\n\nDétail :\n${res.errors.slice(0, 5).join('\n')}`
            : '';
          const receivedColumns = Object.keys(rows[0] || {});
          const columnsInfo = receivedColumns.length
            ? `\n\nColonnes reçues du traitement : ${receivedColumns.join(', ')}`
            : '';
          await this.popupService.showWarning(
            `Aucune opération n’a été enregistrée (${totalRead.toLocaleString('fr-FR')} ligne(s) lue(s)).\n` +
            'Vérifiez que les colonnes du modèle de traitement correspondent au format d’import des opérations.' +
            errorDetails + columnsInfo,
            'Chargement des opérations'
          );
          return;
        }

        await this.popupService.showSuccess(
          `${saved.toLocaleString('fr-FR')} opération(s) bancaire(s) chargée(s) sur ${totalRead.toLocaleString('fr-FR')} lue(s)` +
          `${errors ? ` — ${errors} avertissement(s)` : ''}` +
          `${opbDuplicates ? ` — ${opbDuplicates} doublon(s) ignoré(s)` : ''}.`,
          'Opérations chargées'
        );
        this.showOperations = true;
        this.activeSection = 'operations';
        this.loadOperations();
        this.loadDashboardStats();
        return;
      }

      const res: any = await firstValueFrom(this.releveService.upload(file));
      const saved = Number(res?.count ?? 0);
      const totalRead = Number(res?.totalRead ?? rows.length);
      const duplicates = Number(res?.duplicatesIgnored ?? 0);

      if (!saved) {
        const unmapped = Array.isArray(res?.unmappedHeaders) && res.unmappedHeaders.length
          ? `\nColonnes non reconnues : ${res.unmappedHeaders.join(', ')}`
          : '';
        await this.popupService.showWarning(
          `Aucune ligne de relevé n’a été enregistrée (${totalRead.toLocaleString('fr-FR')} ligne(s) lue(s)).` +
          `${duplicates ? ` ${duplicates} doublon(s) ignoré(s).` : ''}${unmapped}\n` +
          'Vérifiez que les colonnes du modèle de traitement correspondent au format d’import du relevé.',
          'Chargement du relevé'
        );
        return;
      }

      await this.popupService.showSuccess(
        `${saved.toLocaleString('fr-FR')} ligne(s) de relevé chargée(s) sur ${totalRead.toLocaleString('fr-FR')} lue(s)` +
        `${duplicates ? ` — ${duplicates} doublon(s) ignoré(s)` : ''}.`,
        'Relevé chargé'
      );
      this.showOperations = false;
      this.activeSection = 'rapports';
      this.loadLatestReleveBatch();
    } catch (err: any) {
      console.error('[BANK AUTO TREATMENT] Import failed', err);
      await this.popupService.showError(
        `Impossible de charger les données traitées : ${err?.error?.message || err?.message || 'erreur inconnue'}`,
        'Chargement des données'
      );
    }
  }

  /**
   * Construit un fichier Excel (.xlsx) à partir des lignes traitées, avec des en-têtes
   * normalisés vers le format attendu par l'import (opérations ou relevé).
   */
  private async buildTreatedRowsFile(
    rows: Record<string, any>[],
    destination: 'operations' | 'releve' | 'suivi',
    outputName: string
  ): Promise<File> {
    const XLSX: any = await import('xlsx');
    const mappedRows = rows.map(row => this.mapTreatedRowHeaders(row, destination));

    const headers: string[] = [];
    const seen = new Set<string>();
    for (const row of mappedRows) {
      Object.keys(row).forEach(key => {
        if (key && !seen.has(key)) {
          seen.add(key);
          headers.push(key);
        }
      });
    }

    if (!headers.length) {
      throw new Error('Aucune colonne exploitable dans les données traitées.');
    }

    const aoa = [
      headers,
      ...mappedRows.map(row => headers.map(header => row[header] ?? ''))
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, destination === 'releve' ? 'Releve' : destination === 'suivi' ? 'Suivi' : 'Operations');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const base = (outputName || 'donnees-traitees').replace(/\.[^.]+$/, '');
    const suffix = destination === 'releve' ? 'releve' : destination === 'suivi' ? 'suivi-compense' : 'operations';
    return new File(
      [buffer],
      `${base}-${suffix}.xlsx`,
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
  }

  private mapTreatedRowHeaders(row: Record<string, any>, destination: 'operations' | 'releve' | 'suivi'): Record<string, any> {
    const aliases = destination === 'releve'
      ? RELEVE_IMPORT_HEADER_ALIASES
      : destination === 'suivi'
        ? SUIVI_COMPENSE_HEADER_ALIASES
        : OPERATION_IMPORT_HEADER_ALIASES;
    const mapped: Record<string, any> = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const normalized = this.normalizeTreatedHeader(key);
      const header = aliases[normalized] || key;
      if (!header) return;
      mapped[header] = this.coerceTreatedValue(header, value);
    });
    return mapped;
  }

  private normalizeTreatedHeader(label: string): string {
    return (label || '')
      // Le traitement produit parfois « é » sous forme de caractère de remplacement (« op�ration »)
      .replace(/�/g, 'e')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Convertit les valeurs texte du modèle en types exploitables par l'import backend
   * (notamment les montants formatés « 2,455,108 » ou « 139 474,44 »).
   */
  private coerceTreatedValue(header: string, value: any): any {
    if (value === null || value === undefined || value === '') {
      return value;
    }

    const numericHeaders = new Set([
      'montant',
      'debit',
      'credit',
      'soldecourant',
      'soldedisponibledecloture',
      'soldedisponiblealouverture',
      'soldecomptabledouverture',
      'soldecomptabledecloture',
      'depottotal',
      'totaldesretraits',
      'totalretraits'
    ]);

    if (numericHeaders.has(this.normalizeTreatedHeader(header))) {
      const parsed = this.parseTreatedNumber(value);
      if (parsed !== null) {
        return parsed;
      }
    }

    return value;
  }

  private parseTreatedNumber(raw: any): number | null {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : null;
    }

    let text = String(raw).trim();
    if (!text) {
      return null;
    }

    // Retire les espaces, espaces insécables, apostrophes et symboles monétaires.
    text = text
      .replace(/[\s\u00A0\u202F']/g, '')
      .replace(/[^0-9.,+\-]/g, '');

    if (!text) {
      return null;
    }

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // Format 1.234,56 : le point sépare les milliers, la virgule les décimales.
        text = text.replace(/\./g, '').replace(',', '.');
      } else {
        // Format 1,234.56 : la virgule sépare les milliers, le point les décimales.
        text = text.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      const parts = text.split(',');
      const isThousands = parts.length > 1 && parts.slice(1).every(part => /^\d{3}$/.test(part));
      text = isThousands ? text.replace(/,/g, '') : text.replace(',', '.');
    } else if (lastDot !== -1) {
      const parts = text.split('.');
      const isThousands = parts.length > 1 && parts.slice(1).every(part => /^\d{3}$/.test(part));
      if (isThousands) {
        text = text.replace(/\./g, '');
      }
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  openCreateOperation() {
    this.showCreateOperationPopup = true;
    this.createOperationForm = {
      numeroCompte: '',
      nomCompte: '',
      banque: '',
      dateComptable: new Date().toISOString().split('T')[0], // Date du jour
      dateValeur: '',
      libelle: '',
      debit: null,
      credit: null,
      devise: 'XAF',
      reconStatus: 'KO' as 'OK' | 'KO'
    };
  }

  closeCreateOperationPopup() {
    this.showCreateOperationPopup = false;
  }

  /**
   * Génère la référence selon le format: YYYYMMDD-AGENCE_PREFIX-AMOUNT
   * Exemple: 20261102-ONUF6-2455108
   */
  generateReference(typeOperation: string, agence: string, dateComptable: string, montant?: number): string {
    if (!agence || !dateComptable) return '';
    
    // Formater la date: YYYYMMDD
    const date = new Date(dateComptable);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Agence: prendre les 6 premiers caractères
    const agencePrefix = agence.substring(0, 6);
    
    // Montant: sans virgules, sans décimales
    const amountStr = montant ? Math.abs(montant).toString().replace(/[,.]/g, '') : '';
    
    // Format: YYYYMMDD-AGENCE_PREFIX-AMOUNT
    return `${dateStr}-${agencePrefix}-${amountStr}`;
  }

  get createOperationMontant(): number {
    const debit = Number(this.createOperationForm.debit) || 0;
    const credit = Number(this.createOperationForm.credit) || 0;
    return credit - debit;
  }

  isCreateOperationFormValid(): boolean {
    const f = this.createOperationForm;
    const debit = Number(f.debit) || 0;
    const credit = Number(f.credit) || 0;
    // Une seule colonne renseignée (Débit ou Crédit), comme dans le relevé
    return !!(f.numeroCompte && f.dateComptable && f.libelle && ((debit > 0) !== (credit > 0)));
  }

  saveCreateOperation() {
    if (!this.isCreateOperationFormValid()) {
      this.popupService.showError('❌ Veuillez remplir tous les champs obligatoires');
      return;
    }

    this.creatingOperation = true;
    const f = this.createOperationForm;
    const debit = Number(f.debit) || 0;
    const credit = Number(f.credit) || 0;

    // Champs alignés sur le tableau du relevé bancaire
    const operationData = {
      numeroCompte: f.numeroCompte.trim(),
      nomCompte: f.nomCompte,
      banque: f.banque,
      dateComptable: f.dateComptable,
      dateValeur: f.dateValeur || f.dateComptable,
      libelle: f.libelle,
      debit: debit || null,
      credit: credit || null,
      montant: Math.abs(this.createOperationMontant),
      devise: f.devise,
      reconStatus: f.reconStatus
    };

    console.log('💾 Création d\'opération bancaire:', operationData);

    // Seule écriture : une ligne de relevé (releve_bancaire). Un doublon est refusé.
    this.releveService.create(operationData).subscribe({
      next: () => this.onReleveLineCreated(),
      error: (err) => this.onReleveCreateError(err)
    });
  }

  private onReleveLineCreated() {
    this.creatingOperation = false;
    this.closeCreateOperationPopup();
    // Afficher la ligne ajoutée : toutes les lignes du relevé, page 1
    this.releveSelectedBatchId = 'ALL';
    this.refreshRelevesFromApiWithFilters();
    this.popupService.showSuccess('✅ Ligne ajoutée au relevé bancaire.');
  }

  private onReleveCreateError(err: any) {
    console.error('❌ Erreur lors de la création de la ligne de relevé:', err);
    const detail = typeof err?.error === 'string' ? err.error : (err?.message || '');
    const message = err?.status === 409
      ? '❌ Cette ligne de relevé existe déjà (doublon).'
      : '❌ Erreur lors de l\'ajout de la ligne au relevé' + (detail ? ' : ' + detail : '');
    this.popupService.showError(message);
    this.creatingOperation = false;
  }

  goToComptes() {
    this.activeSection = 'comptes';
    this.showOperations = false;
    this.router.navigate(['/comptes'], { queryParams: { filterCategorie: 'Banque' } });
  }

  openRapports() {
    this.activeSection = 'rapports';
    this.showOperations = false;
    this.loadLatestReleveBatch();
  }

  openSecurite() {
    this.activeSection = 'securite';
    this.showOperations = false;
    this.loadLatestReleveBatch();
    // Forcer la mise à jour de l'affichage des relevés filtrés
    setTimeout(() => {
      this.applyReleveFilters();
    }, 100);
  }

  // ----- Filtres Relevé Bancaire -----
  releveFilterNumeroCompte: string = '';
  releveFilterBanque: string = '';
  releveFilterReconStatus: '' | 'OK' | 'KO' = '' as any;
  releveFilterDateDebut: string = '';
  releveFilterDateFin: string = '';
  releveFilterDateField: 'comptable' | 'valeur' = 'comptable';
  // Colonne montant du tableau relevé
  releveFilterMontantMin: number | null = null;
  releveFilterMontantMax: number | null = null;

  // Méthode pour extraire le code pays des 2 dernières lettres de la banque
  private extractCountryCodeFromBank(banque: string): string {
    if (!banque || typeof banque !== 'string') return '';
    
    // Nettoyer le nom de la banque et extraire les 2 dernières lettres
    const cleanBanque = banque.trim().toUpperCase();
    if (cleanBanque.length < 2) return '';
    
    // Extraire les 2 dernières lettres
    const countryCode = cleanBanque.slice(-2);
    
    console.log('[RECON][DEBUG] extractCountryCodeFromBank:', {
      banque: banque,
      cleanBanque: cleanBanque,
      countryCode: countryCode
    });
    
    return countryCode;
  }

  applyReleveFilters() {
    // Si on a déjà des données, juste appliquer le filtre local
    if (this.releveAllRows && this.releveAllRows.length > 0) {
      this.releveRows = this.getFilteredRelevesByStatusAndBatch();
      this.updatePagedReconciliationResults();
      console.log('[RECON][DEBUG] applyReleveFilters - local filter applied:', {
        totalRows: this.releveAllRows.length,
        filteredRows: this.releveRows.length,
        filter: this.releveFilterReconStatus
      });
    } else {
      // Sinon, recharger depuis l'API
      this.refreshRelevesFromApiWithFilters();
    }
  }

  resetReleveFilters() {
    this.releveFilterMontantMin = null;
    this.releveFilterMontantMax = null;
    this.releveFilterNumeroCompte = '';
    this.releveFilterBanque = '';
    this.releveFilterReconStatus = '' as any;
    this.releveFilterDateDebut = '';
    this.releveFilterDateFin = '';
    this.releveFilterDateField = 'comptable';
    this.refreshRelevesFromApiWithFilters();
  }

  private buildReleveFilterPayload(): any {
    const filter: any = {};
    const add = (k: string, v: any) => { if (v !== undefined && v !== null && String(v).trim() !== '') filter[k] = v; };
    if (this.releveSelectedBatchId && this.releveSelectedBatchId !== 'ALL') add('batchId', this.releveSelectedBatchId);
    add('numeroCompte', this.releveFilterNumeroCompte);
    add('banque', this.releveFilterBanque);
    add('reconStatus', this.releveFilterReconStatus);
    add('dateDebut', this.releveFilterDateDebut);
    add('dateFin', this.releveFilterDateFin);
    add('dateField', this.releveFilterDateField);
    return filter;
  }

  private refreshRelevesFromApiWithFilters() {
    const filter = this.buildReleveFilterPayload();
    this.releveService.list(filter, 'BANQUE').subscribe({
      next: (rows) => {
        const all = Array.isArray(rows) ? rows : [];
        this.releveAllRows = all;
        // Reappliquer sélection de lot si ALL choisi, sinon conserver l’option en cours
        this.updateReleveBatchOptionsFromRows(all);
        this.releveRows = this.getFilteredRelevesByStatusAndBatch();
        this.updatePagedReconciliationResults();
      },
      error: () => {}
    });
  }

  private updateReleveBatchOptionsFromRows(rows: any[]) {
    const groups: Record<string, any[]> = {};
    rows.forEach((r: any) => {
      const bid = r.batchId || 'default';
      if (!groups[bid]) groups[bid] = [];
      groups[bid].push(r);
    });
    this.releveBatchOptions = Object.keys(groups).map(k => ({ id: k, label: k, count: groups[k].length }));
    if (!this.releveSelectedBatchId || !this.releveBatchOptions.some(o => o.id === this.releveSelectedBatchId)) {
      this.releveSelectedBatchId = 'ALL';
    }
  }

  getFilteredRelevesByStatusAndBatch() {
    // Source: tous les relevés puis filtrage par lot
    let base = this.releveAllRows || [];
    if (this.releveSelectedBatchId && this.releveSelectedBatchId !== 'ALL') {
      base = base.filter((r: any) => (r && (r as any).batchId) === this.releveSelectedBatchId);
    }
    
    // Appliquer tous les filtres
    let filtered = base;
    
    // Filtre par numéro de compte
    if (this.releveFilterNumeroCompte && this.releveFilterNumeroCompte.trim()) {
      const searchTerm = this.releveFilterNumeroCompte.toLowerCase().trim();
      filtered = filtered.filter((r: any) => 
        (r.numeroCompte || '').toLowerCase().includes(searchTerm)
      );
    }
    
    // Filtre par banque
    if (this.releveFilterBanque && this.releveFilterBanque.trim()) {
      const searchTerm = this.releveFilterBanque.toLowerCase().trim();
      filtered = filtered.filter((r: any) => 
        (r.banque || '').toLowerCase().includes(searchTerm)
      );
    }
    
    // Filtre par dates
    if (this.releveFilterDateDebut || this.releveFilterDateFin) {
      filtered = filtered.filter((r: any) => {
        const dateField = this.releveFilterDateField === 'valeur' ? r.dateValeur : r.dateComptable;
        if (!dateField) return false;
        
        const itemDate = new Date(dateField);
        if (isNaN(itemDate.getTime())) return false;
        
        if (this.releveFilterDateDebut) {
          const startDate = new Date(this.releveFilterDateDebut);
          if (itemDate < startDate) return false;
        }
        
        if (this.releveFilterDateFin) {
          const endDate = new Date(this.releveFilterDateFin);
          endDate.setHours(23, 59, 59, 999); // Inclure toute la journée
          if (itemDate > endDate) return false;
        }
        
        return true;
      });
    }
    
    // Filtre par statut de réconciliation
    if (this.releveFilterReconStatus) {
      filtered = filtered.filter(r => this.getReleveReconStatus(r) === this.releveFilterReconStatus);
    }

    // Colonne montant du tableau (valeur absolue)
    filtered = filtered.filter((r: any) =>
      (this.releveFilterMontantMin == null || Math.abs(Number(r.montant ?? 0)) >= Number(this.releveFilterMontantMin))
      && (this.releveFilterMontantMax == null || Math.abs(Number(r.montant ?? 0)) <= Number(this.releveFilterMontantMax))
    );

    return filtered;
  }

  // Met en avant et reste sur la liste des comptes Banque dans la page Banque
  highlightBankAccounts() {
    // Reste sur la page Banque et affiche la section Comptes de Banque
    this.activeSection = 'home';
    this.showOperations = false;
    // Si la liste est vide, charger; sinon, faire un petit scroll
    if (!this.comptesBanque || this.comptesBanque.length === 0) {
      this.loadComptesBanque();
    }
    setTimeout(() => {
      const el = document.querySelector('.section-header h2');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  // Relevé bancaire import
  releveSelectedFile: File | null = null;
  releveUploading = false;
  releveBatchId: string | null = null;
  releveRows: ReleveBancaireRow[] = [];
  // Tous les relevés (tous lots)
  releveAllRows: ReleveBancaireRow[] = [];
  // Liste des lots disponibles
  releveBatchOptions: Array<{ id: string; label: string; count: number }> = [];
  // Filtre de lot sélectionné (ALL = tous les lots)
  releveSelectedBatchId: string = 'ALL';
  // Pagination Relevé
  relevePage = 1;
  relevePageSize = 10;
  releveMessage: string | null = null;
  releveMessageKind: 'info' | 'success' | 'error' = 'info';

  // Total pages calculé pour la pagination de l'aperçu
  get releveTotalPages(): number {
    const size = this.relevePageSize || 10;
    const total = (this.filteredReleveRowsForImport || []).length;
    const pages = Math.ceil(total / size);
    return pages > 0 ? pages : 1;
  }

  onReleveFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.releveSelectedFile = input.files && input.files.length ? input.files[0] : null;
    if (this.releveSelectedFile) {
      this.releveMessageKind = 'info';
      this.releveMessage = `Fichier sélectionné: ${this.releveSelectedFile.name}`;
    }
  }

  /** Pop-up de chargement manuel : avancement de l'envoi, traitement, puis notification de fin. */
  importPopup: { visible: boolean; title: string; phase: 'upload' | 'server' | 'success' | 'error'; percent: number; message: string } =
    { visible: false, title: '', phase: 'upload', percent: 0, message: '' };

  private openImportPopup(title: string): void {
    this.importPopup = { visible: true, title, phase: 'upload', percent: 0, message: '' };
  }

  private onImportUploadProgress(percent: number): void {
    this.importPopup = { ...this.importPopup, percent, phase: percent >= 100 ? 'server' : 'upload' };
  }

  private finishImportPopup(message: string, kind: string): void {
    this.importPopup = { ...this.importPopup, phase: kind === 'error' ? 'error' : 'success', percent: 100, message };
  }

  closeImportPopup(): void {
    this.importPopup = { ...this.importPopup, visible: false };
  }

  uploadReleve() {
    if (!this.releveSelectedFile) return;
    this.releveUploading = true;
    this.releveBatchId = null;
    this.releveRows = [];
    this.releveMessageKind = 'info';
    this.releveMessage = 'Import en cours...';
    this.openImportPopup('Import du relevé bancaire');
    from(this.releveService.uploadWithProgress(this.releveSelectedFile, pct => this.onImportUploadProgress(pct)))
      .pipe(finalize(() => this.finishImportPopup(this.releveMessage, this.releveMessageKind)))
      .subscribe({
      next: (res) => {
        this.releveBatchId = res.batchId;
        this.releveRows = (res.rows || []).map(r => ({
          ...r,
          dateComptable: r.dateComptable ? new Date(r.dateComptable as any) : undefined,
          dateValeur: r.dateValeur ? new Date(r.dateValeur as any) : undefined
        }));
        this.releveUploading = false;
        this.releveMessageKind = 'success';
        const baseMsg = `Fichier importé avec succès (${res.count} lignes).`;
        const dupMsg = res.duplicatesIgnored ? ` ${res.duplicatesIgnored} doublon(s) ignoré(s).` : '';
        this.releveMessage = `${baseMsg}${dupMsg} Batch: ${this.releveBatchId}`;
        // Mettre à jour le compteur des lignes de relevé (batch importé)
        this.totalReleveLignes = this.releveRows.length;
        // Alerts
        const msgs: string[] = [];
        if (res.duplicatesIgnored) msgs.push(`${res.duplicatesIgnored} doublon(s) ignoré(s)`);
        if (res.unmappedHeaders && res.unmappedHeaders.length) msgs.push(`Colonnes non reconnues: ${res.unmappedHeaders.join(', ')}`);
        if (res.totalRead && res.count !== undefined) msgs.push(`Lues: ${res.totalRead}, conservées: ${res.count}`);
        if (msgs.length) {
          this.releveMessage += ` | ${msgs.join(' | ')}`;
        }
      },
      error: () => {
        this.releveUploading = false;
        this.releveMessageKind = 'error';
        this.releveMessage = 'Import du relevé bancaire échoué';
        this.totalReleveLignes = 0;
      }
    });
  }

  // Suivi compense OP
  private suiviCompenseService = inject(SuiviCompenseOpService);
  suiviCompenseRows: SuiviCompenseOp[] = [];
  suiviCompenseSelectedFile: File | null = null;
  suiviCompenseUploading = false;
  suiviCompenseLoading = false;
  suiviCompenseMessage: string | null = null;
  suiviCompenseMessageKind: 'info' | 'success' | 'error' = 'info';
  // Pagination du suivi compense OP
  suiviCompensePage = 1;
  suiviCompensePageSize = 10;

  // Filtres alignés sur les colonnes du tableau du suivi compense OP
  suiviFilters: {
    dateDebut: string;
    dateFin: string;
    codeAgence: string;
    banque: string;
    compteBancaire: string;
    montant: number | null;
    modePaiement: string;
    reference: string;
    idTicket: string;
    service: string;
    reseau: string;
  } = {
    dateDebut: '', dateFin: '', codeAgence: '', banque: '', compteBancaire: '', montant: null,
    modePaiement: '', reference: '', idTicket: '', service: '', reseau: ''
  };

  get filteredSuiviCompenseRows(): SuiviCompenseOp[] {
    const f = this.suiviFilters;
    const debut = f.dateDebut ? new Date(f.dateDebut).getTime() : null;
    const fin = f.dateFin ? new Date(f.dateFin + 'T23:59:59').getTime() : null;
    return this.suiviCompenseRows.filter(r => {
      if (debut !== null || fin !== null) {
        const t = r.dateOperation ? new Date(r.dateOperation as any).getTime() : NaN;
        if (isNaN(t)) return false;
        if (debut !== null && t < debut) return false;
        if (fin !== null && t > fin) return false;
      }
      return containsFilter(r.codeAgence, f.codeAgence)
        && containsFilter(r.banque, f.banque)
        && containsFilter(r.compteBancaire, f.compteBancaire)
        && containsFilter(r.modePaiement, f.modePaiement)
        && containsFilter(r.reference, f.reference)
        && containsFilter(r.idTicket, f.idTicket)
        && containsFilter(r.service, f.service)
        && containsFilter(r.reseau, f.reseau)
        && (f.montant == null || Number(r.montant) === Number(f.montant));
    });
  }

  onSuiviFilterChange() {
    this.suiviCompensePage = 1;
  }

  resetSuiviFilters() {
    this.suiviFilters = {
      dateDebut: '', dateFin: '', codeAgence: '', banque: '', compteBancaire: '', montant: null,
      modePaiement: '', reference: '', idTicket: '', service: '', reseau: ''
    };
    this.suiviCompensePage = 1;
  }

  get suiviCompenseTotalPages(): number {
    const pages = Math.ceil(this.filteredSuiviCompenseRows.length / this.suiviCompensePageSize);
    return pages > 0 ? pages : 1;
  }

  get pagedSuiviCompenseRows(): SuiviCompenseOp[] {
    const start = (this.suiviCompensePage - 1) * this.suiviCompensePageSize;
    return this.filteredSuiviCompenseRows.slice(start, start + this.suiviCompensePageSize);
  }

  goToSuiviCompensePage(page: number) {
    this.suiviCompensePage = Math.min(Math.max(1, page), this.suiviCompenseTotalPages);
  }

  onSuiviCompensePageSizeChange(size: number) {
    this.suiviCompensePageSize = size;
    this.suiviCompensePage = 1;
  }

  openSuiviCompense() {
    this.activeSection = 'suivi-compense';
    this.showOperations = false;
    this.loadSuiviCompense();
  }

  loadSuiviCompense() {
    this.suiviCompenseLoading = true;
    this.suiviCompenseService.list().subscribe({
      next: (rows) => {
        this.suiviCompenseRows = rows || [];
        this.suiviCompenseLoading = false;
        this.goToSuiviCompensePage(this.suiviCompensePage);
      },
      error: () => {
        this.suiviCompenseLoading = false;
        this.popupService.showError('Impossible de charger le suivi compense OP');
      }
    });
  }

  onSuiviCompenseFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.suiviCompenseSelectedFile = input.files && input.files.length ? input.files[0] : null;
    if (this.suiviCompenseSelectedFile) {
      this.suiviCompenseMessageKind = 'info';
      this.suiviCompenseMessage = `Fichier sélectionné: ${this.suiviCompenseSelectedFile.name}`;
    }
  }

  uploadSuiviCompense() {
    if (!this.suiviCompenseSelectedFile) return;
    this.suiviCompenseUploading = true;
    this.suiviCompenseMessageKind = 'info';
    this.suiviCompenseMessage = 'Import en cours...';
    this.openImportPopup('Import du suivi compense OP');
    from(this.suiviCompenseService.uploadWithProgress(this.suiviCompenseSelectedFile, pct => this.onImportUploadProgress(pct)))
      .pipe(finalize(() => this.finishImportPopup(this.suiviCompenseMessage, this.suiviCompenseMessageKind)))
      .subscribe({
      next: (res) => {
        this.suiviCompenseUploading = false;
        this.suiviCompenseMessageKind = 'success';
        const suiviDup = Number(res?.duplicatesIgnored ?? 0);
        this.suiviCompenseMessage = `Fichier importé (${res.saved} ligne(s) sur ${res.totalRead} lue(s))${suiviDup ? `, ${suiviDup} doublon(s) ignoré(s)` : ''}.`;
        this.suiviCompenseSelectedFile = null;
        this.loadSuiviCompense();
      },
      error: (err) => {
        this.suiviCompenseUploading = false;
        this.suiviCompenseMessageKind = 'error';
        this.suiviCompenseMessage = err?.error?.error || 'Import du suivi compense OP échoué';
      }
    });
  }

  downloadSuiviCompenseTemplate() {
    this.suiviCompenseService.downloadTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modele-suivi-compense-op.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.popupService.showError('Impossible de télécharger le modèle du suivi compense OP');
      }
    });
  }

  deleteSuiviCompense(row: SuiviCompenseOp) {
    if (!row.id) return;
    const id = row.id;
    this.popupService.showConfirmDialog('Supprimer cette ligne du suivi compense OP ?', 'Confirmation').then(confirmed => {
      if (!confirmed) return;
      this.suiviCompenseService.delete(id).subscribe({
        next: () => this.loadSuiviCompense(),
        error: () => this.popupService.showError('Suppression impossible')
      });
    });
  }

  downloadReleveTemplate() {
    this.releveService.downloadTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modele-releve-bancaire.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.popupService.showError('Impossible de télécharger le modèle de relevé');
      }
    });
  }

  // Export CSV des relevés (séparateur ;) selon le lot et filtre de statut courants
  exportReleveCSV() {
    const rows = this.filteredReleveRowsForImport || [];
    if (!rows.length) {
      this.popupService.showWarning('Aucune ligne de relevé à exporter.');
      return;
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const lot = (this.releveSelectedBatchId && this.releveSelectedBatchId !== 'ALL') ? this.releveSelectedBatchId : 'ALL';
    const filename = `releve_bancaire_${lot}_${ts}.csv`;

    const columns = [
      'batchId',
      'banque',
      'numeroCompte',
      'nomCompte',
      'dateComptable',
      'dateValeur',
      'libelle',
      'debit',
      'credit',
      'montant',
      'numeroCheque',
      'devise',
      'numeroSerie',
      'soldeCourant',
      'soldeDisponibleOuverture',
      'soldeDisponibleCloture',
      'soldeComptableOuverture',
      'soldeComptableCloture',
      'reconStatus'
    ];

    const exportRows = rows.map((r: any) => ({
      batchId: r.batchId || this.releveBatchId || '',
      banque: r.banque || '',
      numeroCompte: r.numeroCompte || '',
      nomCompte: r.nomCompte || '',
      dateComptable: this.normalizeDateToYmd(r.dateComptable as any),
      dateValeur: this.normalizeDateToYmd(r.dateValeur as any),
      libelle: r.libelle || '',
      debit: typeof r.debit === 'number' ? r.debit : '',
      credit: typeof r.credit === 'number' ? r.credit : '',
      montant: typeof r.montant === 'number' ? r.montant : '',
      numeroCheque: r.numeroCheque || '',
      devise: r.devise || '',
      soldeCourant: typeof r.soldeCourant === 'number' ? r.soldeCourant : '',
      soldeDisponibleOuverture: typeof r.soldeDisponibleOuverture === 'number' ? r.soldeDisponibleOuverture : '',
      soldeDisponibleCloture: typeof r.soldeDisponibleCloture === 'number' ? r.soldeDisponibleCloture : '',
      soldeComptableOuverture: typeof r.soldeComptableOuverture === 'number' ? r.soldeComptableOuverture : '',
      soldeComptableCloture: typeof r.soldeComptableCloture === 'number' ? r.soldeComptableCloture : '',
      reconStatus: this.getReleveReconStatus(r)
    }));

    const isLargeDataset = exportRows.length > 10000;
    if (isLargeDataset) {
      this.exportOptimizationService.exportCSVOptimized(exportRows, columns, filename, {
        chunkSize: 5000,
        useWebWorker: true
      });
    } else {
      this.exportOptimizationService.exportQuick(exportRows, columns, filename, 'csv');
    }
  }

  // Relevé Import: lignes filtrées par Statut Réconciliation (OK/KO)
  get filteredReleveRowsForImport(): ReleveBancaireRow[] {
    // Utiliser la même logique de filtrage que getFilteredRelevesByStatusAndBatch
    return this.getFilteredRelevesByStatusAndBatch();
  }

  loadLatestReleveBatch() {
    // Charger depuis l’API en appliquant éventuellement le batchId sélectionné
    const filter: any = {};
    if (this.releveSelectedBatchId && this.releveSelectedBatchId !== 'ALL') filter.batchId = this.releveSelectedBatchId;
    this.releveService.list(filter, 'BANQUE').subscribe({
      next: (all) => {
        const rows = Array.isArray(all) ? all : [];
        if (!rows.length) { this.releveRows = []; this.releveAllRows = []; this.totalReleveLignes = 0; this.releveBatchId = null; this.releveBatchOptions = []; this.releveSelectedBatchId = 'ALL'; return; }
        // Grouper par batchId
        const groups: Record<string, any[]> = {};
        rows.forEach((r: any) => {
          const bid = r.batchId || 'default';
          if (!groups[bid]) groups[bid] = [];
          groups[bid].push(r);
        });
        // Trouver le batch le plus récent, avec fallback si uploadedAt manquant
        const hasUploadedAt = rows.some((it: any) => !!it.uploadedAt);
        let bestBatchId = Object.keys(groups)[0];
        let bestScore = -Infinity;
        Object.entries(groups).forEach(([bid, items]) => {
          const maxDate = items.reduce((max: Date, it: any) => {
            const cur = it.uploadedAt ? new Date(it.uploadedAt) : new Date(0);
            return cur > max ? cur : max;
          }, new Date(0));
          const maxId = items.reduce((m: number, it: any) => {
            const id = typeof it.id === 'number' ? it.id : 0;
            return id > m ? id : m;
          }, 0);
          const score = (hasUploadedAt ? maxDate.getTime() : 0) + maxId;
          if (score > bestScore) { bestScore = score; bestBatchId = bid; }
        });
        this.releveBatchId = bestBatchId;
        // Construire options de lot
        this.releveBatchOptions = Object.keys(groups).map(bid => ({ id: bid, label: `${bid} (${groups[bid].length})`, count: groups[bid].length }));
        // Convertir vers modèle d'affichage: TOUTES les lignes, en conservant batchId
        this.releveAllRows = Object.entries(groups).flatMap(([bid, list]) => list.map((it: any) => ({
          id: it.id,
          numeroCompte: it.numeroCompte,
          ['nomCompte']: it.nomCompte,
          banque: it.banque,
          dateComptable: it.dateComptable ? new Date(it.dateComptable) : undefined,
          dateValeur: it.dateValeur ? new Date(it.dateValeur) : undefined,
          libelle: it.libelle,
          debit: it.debit,
          credit: it.credit,
          montant: it.montant,
          numeroCheque: it.numeroCheque,
          devise: it.devise,
          soldeCourant: it.soldeCourant,
          soldeDisponibleCloture: it.soldeDisponibleCloture,
          soldeDisponibleOuverture: it.soldeDisponibleOuverture,
          commentaire: it.commentaire,
          // Conserver le batchId pour filtrer
          ...( { batchId: bid } as any )
        } as ReleveBancaireRow & any )));
        // Par défaut, afficher tous les lots
        this.releveSelectedBatchId = 'ALL';
        // Compat: releveRows = dernier lot (pour usages hérités au besoin)
        this.releveRows = this.releveAllRows.filter((r: any) => r.batchId === bestBatchId);
        this.relevePage = 1;
        this.totalReleveLignes = this.releveAllRows.length;
        this.updateTotalSuspensKO();
      },
      error: (err) => {
        // Afficher un message explicite en cas d'échec
        try {
          this.releveMessageKind = 'error';
          this.releveMessage = 'Impossible de charger les relevés. Vérifiez la connexion à l\'API.';
        } catch {}
        console.warn('Erreur chargement /releve-bancaire/list', err);
        this.releveRows = [];
        this.releveAllRows = [];
        this.totalReleveLignes = 0;
        this.releveBatchOptions = [];
        this.releveSelectedBatchId = 'ALL';
      }
    });
  }

  openReleveEdit(row: ReleveBancaireRow) {
    if (!row || !row.id) {
      this.popupService.showError('Cette ligne ne peut pas être modifiée car son identifiant est manquant. Réimportez si nécessaire.');
      return;
    }
    this.selectedReleve = row;
    const toInput = (d: any) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return '';
      const y = dt.getFullYear();
      const m = String(dt.getMonth()+1).padStart(2,'0');
      const dd = String(dt.getDate()).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    };
    this.releveEditForm = {
      numeroCompte: row.numeroCompte || '',
      nomCompte: row.nomCompte || '',
      banque: row.banque || '',
      dateComptable: toInput(row.dateComptable as any),
      dateValeur: toInput(row.dateValeur as any),
      libelle: row.libelle || '',
      debit: row.debit ?? null,
      credit: row.credit ?? null,
      montant: row.montant ?? null,
      numeroCheque: row.numeroCheque || '',
      devise: row.devise || '',
      commentaire: row.commentaire || '',
      numeroSerie: row.numeroSerie || ''
    };
    this.showReleveEditPopup = true;
  }

  closeReleveEdit() {
    this.showReleveEditPopup = false;
    this.selectedReleve = null;
  }

  saveReleveEdit() {
    if (!this.selectedReleve || !this.selectedReleve.id) return;
    const payload: any = {
      numeroCompte: this.releveEditForm.numeroCompte || null,
      nomCompte: this.releveEditForm.nomCompte || null,
      banque: this.releveEditForm.banque || null,
      dateComptable: this.releveEditForm.dateComptable || null,
      dateValeur: this.releveEditForm.dateValeur || null,
      libelle: this.releveEditForm.libelle || null,
      debit: this.releveEditForm.debit,
      credit: this.releveEditForm.credit,
      montant: this.releveEditForm.montant,
      numeroCheque: this.releveEditForm.numeroCheque || null,
      devise: this.releveEditForm.devise || null,
      commentaire: this.releveEditForm.commentaire || null,
      numeroSerie: this.releveEditForm.numeroSerie || null
    };
    
    console.log('💾 Sauvegarde relevé avec commentaire:', {
      id: this.selectedReleve.id,
      commentaire: this.releveEditForm.commentaire,
      payload: payload
    });
    
    this.releveService.update(this.selectedReleve.id, payload).subscribe({
      next: () => {
        this.closeReleveEdit();
        this.loadLatestReleveBatch();
        this.popupService.showSuccess('✅ Ligne de relevé mise à jour');
      },
      error: (err) => {
        console.error('Erreur MAJ relevé', err);
        this.popupService.showError('❌ Échec de la mise à jour du relevé');
      }
    });
  }

  // Sauvegarde des commentaires
  saveComment(releveId: number, comment: string) {
    if (!releveId) return;
    
    const payload: Partial<ReleveBancaireRow> = {
      commentaire: comment || undefined
    };
    
    this.releveService.update(releveId, payload).subscribe({
      next: () => {
        // Mettre à jour le commentaire localement
        const releve = this.releveRows.find(r => r.id === releveId);
        if (releve) {
          releve.commentaire = comment;
        }
        console.log('✅ Commentaire sauvegardé');
      },
      error: (err) => {
        console.error('Erreur sauvegarde commentaire', err);
        this.popupService.showError('❌ Échec de la sauvegarde du commentaire');
      }
    });
  }

  // Suppression d'une ligne de relevé
  deleteReleveRow(row: ReleveBancaireRow) {
    if (!row.id) {
      this.popupService.showError('❌ Impossible de supprimer cette ligne');
      return;
    }

    this.popupService.showConfirmDialog('⚠️ Êtes-vous sûr de vouloir supprimer cette ligne de relevé ?\n\nCette action est irréversible.', 'Confirmation de suppression').then(confirmed => {
      if (confirmed) {
      console.log('🗑️ Suppression relevé:', { id: row.id, row: row });
      
      this.releveService.delete(row.id).subscribe({
        next: () => {
          // Supprimer la ligne de la liste locale
          const index = this.releveRows.findIndex(r => r.id === row.id);
          if (index > -1) {
            this.releveRows.splice(index, 1);
          }
          
          // Mettre à jour la liste filtrée
          this.loadLatestReleveBatch();
          
          this.popupService.showSuccess('✅ Ligne de relevé supprimée');
        },
        error: (err) => {
          console.error('Erreur suppression relevé', err);
          this.popupService.showError('❌ Échec de la suppression du relevé');
        }
      });
      }
    });
  }

  // Chargement des données
  /** Pop-up Check : choix du type, puis résultats (validation seulement pour la compensation). */
  checkPopup: {
    visible: boolean;
    step: 'types' | 'loading' | 'results' | 'error';
    types: string[];
    type: string;
    result: OperationCheckResult | null;
    applying: boolean;
    message: string;
  } = { visible: false, step: 'types', types: [], type: '', result: null, applying: false, message: '' };

  get checkMatchedRows() {
    return (this.checkPopup.result?.rows ?? []).filter(r => r.status === 'MATCH');
  }

  openCheckPopup(): void {
    const types = [...new Set(this.operations
      .filter(o => o.source === 'bancaire' && o.typeOperation)
      .map(o => o.typeOperation as string))].sort();
    this.checkPopup = {
      visible: true, step: 'types', types, type: '', result: null, applying: false,
      message: types.length ? '' : 'Aucune opération bancaire à contrôler.'
    };
  }

  closeCheckPopup(): void {
    this.checkPopup = { ...this.checkPopup, visible: false };
  }

  backToCheckTypes(): void {
    this.checkPopup = { ...this.checkPopup, step: 'types', result: null, message: '' };
  }

  runCheck(type: string): void {
    this.checkPopup = { ...this.checkPopup, step: 'loading', type, result: null, message: '' };
    this.operationBancaireService.check(type).subscribe({
      next: (result) => { this.checkPopup = { ...this.checkPopup, step: 'results', result }; },
      error: () => { this.checkPopup = { ...this.checkPopup, step: 'error', message: 'Le check a échoué.' }; }
    });
  }

  validateCheckMatches(): void {
    const items = this.checkMatchedRows.map(r => ({ operationId: r.operationId, banque: r.banque, reference: r.reference }));
    if (!items.length) return;
    this.checkPopup = { ...this.checkPopup, applying: true, message: '' };
    this.operationBancaireService.applyCheck(items).subscribe({
      next: (res) => {
        // Les lignes validées sortent du pop-up : elles ne seront plus proposées.
        const validatedIds = new Set(items.map(i => i.operationId));
        const current = this.checkPopup.result;
        const rows = (current?.rows ?? []).filter(r => !validatedIds.has(r.operationId));
        const result = current ? {
          ...current,
          total: rows.length,
          matched: rows.filter(r => r.status === 'MATCH').length,
          gaps: rows.filter(r => r.status !== 'MATCH').length,
          rows
        } : null;
        this.checkPopup = { ...this.checkPopup, applying: false, result,
          message: `${res.updated} opération(s) validée(s) : banque et référence reportées.` };
        this.loadOperations();
      },
      error: () => { this.checkPopup = { ...this.checkPopup, applying: false, message: 'La validation a échoué.' }; }
    });
  }

  loadOperations(onLoaded?: () => void) {
    // Charger les opérations bancaires (table operations_bancaires)
    this.operationBancaireService.getAllOperationsBancaires('BANQUE').subscribe({
      next: (operationsBancaires) => {
        // Convertir les dates string en objets Date
        const opsBancaires = operationsBancaires.map(op => ({
          ...op,
          dateOperation: new Date(op.dateOperation),
          source: 'bancaire'
        }));

        // Charger aussi les opérations générales (table operations) créées via le formulaire
        this.operationService.getAllOperations().subscribe({
          next: (operationsGenerales) => {
            // Convertir les opérations générales au format OperationBancaireDisplay
            const opsGenerales = operationsGenerales
              .filter(op => op.typeOperation && ['VIREMENT', 'RETRAIT', 'DEPOT', 'FRAIS', 'COMMISSION', 'AUTRE', 'APPROVISIONNEMENT', 'COMPENSATION', 'NIVELLEMENT', 'PAIEMENT'].includes(op.typeOperation))
              .map(op => ({
                id: op.id,
                pays: op.pays || '',
                codePays: '',
                mois: '',
                dateOperation: new Date(op.dateOperation),
                agence: op.service || '',
                typeOperation: op.typeOperation,
                nomBeneficiaire: op.nomBordereau || '',
                compteADebiter: op.codeProprietaire || '',
                montant: op.montant,
                modePaiement: '',
                reference: op.reference || '',
                idGlpi: '',
                bo: op.banque || '',
                statut: op.statut || 'En attente',
                operationId: op.id,
                reconStatus: undefined,
                impactApplique: undefined,
                traitement: '',
                demandeur: '',
                valideur: '',
                source: 'generale'
              }));

            // Fusionner les deux sources
            // Plus récentes en premier : une opération nouvellement créée apparaît en page 1
            this.operations = [...opsBancaires, ...opsGenerales].sort(
              (a, b) => (new Date(b.dateOperation as any).getTime() || 0) - (new Date(a.dateOperation as any).getTime() || 0)
            );
            this.filteredOperations = [...this.operations];
            
            const rawPays = (this.operations || []).map(o => {
              if (o.pays && String(o.pays).trim()) {
                return String(o.pays);
              }
              const code = (o as any).codePays ? String((o as any).codePays).toUpperCase().trim() : '';
              return code || '';
            });
            this.paysList = normalizeCountryFilterOptions(rawPays);
            this.reconPaysOptions = [...this.paysList];
            if (!this.reconPays && this.reconPaysOptions.length === 1) {
              this.reconPays = this.reconPaysOptions[0];
            }
            if (this.reconPays && !this.reconPaysOptions.some(p => countriesMatch(p, this.reconPays))) {
              const mapped = countryDisplayLabel(this.reconPays);
              const match = mapped ? this.reconPaysOptions.find(p => countriesMatch(p, mapped)) : undefined;
              if (match) {
                this.reconPays = match;
              } else if ((this.reconPays || '').trim().length <= 5) {
                this.reconPays = '';
              }
            }
            if (this.filters.pays) {
              const match = this.paysList.find(p => countriesMatch(p, this.filters.pays));
              if (match) {
                this.filters.pays = match;
              }
            }
            this.updatePagedOperations();
            this.updateTotalSuspensKO();
            console.log('Opérations bancaires chargées:', this.operations.length, '(bancaire:', opsBancaires.length, ', generale:', opsGenerales.length + ')');
            onLoaded?.();
          },
          error: (error) => {
            console.error('Erreur lors du chargement des opérations générales:', error);
            // En cas d'erreur, utiliser seulement les opérations bancaires
            this.operations = opsBancaires;
            this.filteredOperations = [...this.operations];
            this.updatePagedOperations();
            this.updateTotalSuspensKO();
            console.log('Opérations bancaires chargées (fallback):', this.operations.length);
            onLoaded?.();
          }
        });
      },
      error: (error) => {
        console.error('Erreur lors du chargement des opérations bancaires:', error);
        this.operations = [];
        this.filteredOperations = [];
        this.updatePagedOperations();
        this.updateTotalSuspensKO();
        onLoaded?.();
      }
    });
  }

  // =========================
  // Import Opérations Bancaires (Excel/CSV)
  // =========================
  opbSelectedFile: File | null = null;
  opbUploading = false;
  opbMessage: string | null = null;
  opbMessageKind: 'info' | 'success' | 'error' = 'info';

  onOpbFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.opbSelectedFile = input.files && input.files.length ? input.files[0] : null;
    if (this.opbSelectedFile) {
      this.opbMessageKind = 'info';
      this.opbMessage = `Fichier sélectionné: ${this.opbSelectedFile.name}`;
    }
  }

  uploadOpb() {
    if (!this.opbSelectedFile) return;
    this.opbUploading = true;
    this.opbMessageKind = 'info';
    this.opbMessage = 'Import des opérations en cours...';
    this.openImportPopup('Import des opérations bancaires');
    from(this.operationBancaireService.uploadWithProgress(this.opbSelectedFile, pct => this.onImportUploadProgress(pct)))
      .pipe(finalize(() => this.finishImportPopup(this.opbMessage, this.opbMessageKind)))
      .subscribe({
      next: (res) => {
        this.opbUploading = false;
        const errs = (res && Array.isArray(res.errors)) ? res.errors.length : 0;
        this.opbMessageKind = 'success';
        const opbDup = Number(res?.duplicatesIgnored ?? 0);
        this.opbMessage = `Import terminé. Lues: ${res.totalRead || 0}, enregistrées: ${res.saved || 0}${opbDup ? `, doublons ignorés: ${opbDup}` : ''}${errs ? `, erreurs: ${errs}` : ''}`;
        this.loadOperations();
      },
      error: () => {
        this.opbUploading = false;
        this.opbMessageKind = 'error';
        this.opbMessage = 'Échec de l\'import des opérations bancaires';
      }
    });
  }

  downloadOpbTemplate() {
    this.operationBancaireService.downloadTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modele-operations-bancaires.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.popupService.showError('Impossible de télécharger le modèle');
      }
    });
  }

  // Filtrage
  applyFilters() {
    this.filteredOperations = this.operations.filter(operation => {
      const matchPays = !this.filters.pays || countriesMatch(operation.pays, this.filters.pays);
      const matchType = !this.filters.typeOperation || operation.typeOperation === this.filters.typeOperation;
      const matchStatut = !this.filters.statut || operation.statut === this.filters.statut;
      const matchTraitement = !this.filters.traitement || operation.traitement === this.filters.traitement;
      const matchReconStatut = !this.operationsReconStatusFilter || this.getOperationReconStatus(operation) === this.operationsReconStatusFilter;
      const f = this.filters;
      const matchColonnes =
        containsFilter(operation.agence, f.agence) &&
        containsFilter(operation.reference, f.reference) &&
        containsFilter(operation.idGlpi, f.idGlpi) &&
        (f.montant == null || Number(operation.montant) === Number(f.montant));

      let matchDate = true;
      if (this.filters.dateDebut) {
        const dateDebut = new Date(this.filters.dateDebut);
        matchDate = matchDate && operation.dateOperation >= dateDebut;
      }
      if (this.filters.dateFin) {
        const dateFin = new Date(this.filters.dateFin);
        matchDate = matchDate && operation.dateOperation <= dateFin;
      }

      return matchPays && matchType && matchStatut && matchTraitement && matchDate && matchReconStatut && matchColonnes;
    });

    this.currentPage = 1;
    this.updatePagedOperations();
  }

  clearFilters() {
    this.filters = {
      pays: '',
      typeOperation: '',
      statut: '',
      traitement: '',
      dateDebut: '',
      dateFin: '',
      agence: '',
      montant: null,
      reference: '',
      idGlpi: ''
    };
    this.operationsReconStatusFilter = '';
    this.filteredOperations = [...this.operations];
    this.currentPage = 1;
    this.updatePagedOperations();
  }

  // Pagination
  updatePagedOperations() {
    this.totalPages = Math.ceil(this.filteredOperations.length / this.pageSize);
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.pagedOperations = this.filteredOperations.slice(startIndex, startIndex + this.pageSize);
  }
  
  get operationsStartIndex(): number {
    return ((this.currentPage - 1) * this.pageSize) + 1;
  }
  
  get operationsEndIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredOperations.length);
  }

  onPageSizeChange() {
    this.currentPage = 1; // Retour à la première page lors du changement de taille
    this.updatePagedOperations();
  }
  
  onOperationsReconStatusFilterChange() {
    this.currentPage = 1; // Retour à la première page lors du changement de filtre
    this.applyOperationsFilters();
  }
  
  applyOperationsFilters() {
    let filtered = [...this.operations];
    
    // Filtre par statut de réconciliation
    if (this.operationsReconStatusFilter) {
      filtered = filtered.filter(op => {
        // Ici, vous pouvez ajouter la logique pour déterminer le statut de réconciliation
        // Pour l'instant, on simule avec le statut de l'opération
        const reconStatus = this.getOperationReconStatus(op);
        return reconStatus === this.operationsReconStatusFilter;
      });
    }
    
    this.filteredOperations = filtered;
    this.updatePagedOperations();
  }
  

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagedOperations();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagedOperations();
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagedOperations();
    }
  }

  getVisiblePages(): number[] {
    const maxVisible = 5;
    const pages: number[] = [];
    
    if (this.totalPages <= maxVisible) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, this.currentPage - 2);
      let end = Math.min(this.totalPages, start + maxVisible - 1);
      
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  // Actions sur les opérations
  viewOperation(operation: OperationBancaireDisplay) {
    this.selectedOperation = operation;
    this.showDetailPopup = true;
  }

  // =========================
  // Réconciliation - Helpers
  // =========================
  private parseToDate(input: Date | string | number | undefined | null): Date | null {
    if (!input) return null;
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    if (typeof input === 'number') {
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    }
    const s = String(input).trim();
    // ISO-like format
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    // dd/MM/yyyy
    const frMatch = s.match(/^(\d{2})[\/](\d{2})[\/](\d{4})$/);
    if (frMatch) {
      const day = parseInt(frMatch[1], 10);
      const month = parseInt(frMatch[2], 10) - 1;
      const year = parseInt(frMatch[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private normalizeDateToYmd(d: Date | string | number | undefined | null): string {
    const date = this.parseToDate(d);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Derive 2-letter country code from banque field with robust heuristics
  private deriveCountryCodeFromBanque(banque?: string | null): string {
    const raw = (banque || '').toString().trim();
    if (!raw) return '';
    const norm = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .toLowerCase();

    // Explicit name detection
    const nameToCode: Array<[string | RegExp, string]> = [
      [/cote\s*\s*d\s*ivoire|cote d ivoire|cote d'ivoire|cotedivoire/, 'CI'],
      ['cameroun', 'CM'],
      ['senegal', 'SN'],
      ['burkina', 'BF'],
      ['gabon', 'GA'],
      ['guinee', 'GN'],
      ['togo', 'TG']
    ];
    for (const [needle, code] of nameToCode) {
      if (typeof needle === 'string') {
        if (norm.includes(needle)) return code;
      } else {
        if (needle.test(norm)) return code;
      }
    }

    // Try to detect a trailing 2-letter code token (e.g., "/CI", "-SN", "(BF)")
    const tokenMatch = norm.match(/(^|[^a-z])([a-z]{2})([^a-z]|$)/);
    if (tokenMatch) {
      const candidate = tokenMatch[2].toUpperCase();
      if (this.paysCodeToName[candidate]) return candidate;
    }

    // Fallback: keep only letters, take last two
    const letters = raw.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 2) {
      const tail = letters.slice(-2).toUpperCase();
      if (this.paysCodeToName[tail]) return tail;
    }
    return '';
  }

  // Normalize selected recon country (may be code or full name) to 2-letter code
  private getReconCountryCode(): string {
    const val = (this.reconPays || '').trim();
    if (!val) return '';
    // If it's already a short code (<=3), assume code
    if (val.length <= 3) return val.toUpperCase();
    // Try reverse lookup from mapping with normalization (accents/apostrophes)
    const normVal = this.normalizeCountryName(val);
    const entry = Object.entries(this.paysCodeToName).find(([, name]) => this.normalizeCountryName(name) === normVal);
    if (entry) return entry[0].toUpperCase();
    return val.toUpperCase();
  }

  private determineSensFromAmount(amount: number | undefined | null): 'debit' | 'credit' {
    if (!amount) return 'credit';
    return amount < 0 ? 'debit' : 'credit';
  }

  private determineOperationSens(op: OperationBancaireDisplay): 'debit' | 'credit' {
    const appro = this.calculService.getList('BANQUE.TYPES_APPROVISIONNEMENT', ['APPRO']);
    const comp = this.calculService.getList('BANQUE.TYPES_COMPENSATION', ['COMPENS', 'COMPENSE']);
    const nivel = this.calculService.getList('BANQUE.TYPES_NIVELLEMENT', ['NIVEL', 'NIVELLEMENT']);
    if (this.banqueTypeMatches(op.typeOperation, comp)) {
      return 'debit';
    }
    if (this.banqueTypeMatches(op.typeOperation, appro)) { // Approvisionnement
      return 'credit';
    }
    if (this.banqueTypeMatches(op.typeOperation, nivel)) { // Nivellement
      return this.determineSensFromAmount(op.montant);
    }
    return this.determineSensFromAmount(op.montant);
  }

  // Resolve a display country name from arbitrary text (banque field), using robust heuristics
  private deriveCountryNameFromBanque(banque?: string | null): string {
    const raw = (banque || '').toString().trim();
    if (!raw) return '';
    const norm = this.normalizeCountryName(raw);
    const normSimple = norm.replace(/\s+/g, '');
    // 1) Try to match known display names by inclusion
    for (const [, displayName] of Object.entries(this.paysCodeToName)) {
      const dn = this.normalizeCountryName(displayName);
      const dnSimple = dn.replace(/\s+/g, '');
      if (normSimple.includes(dnSimple)) return displayName;
    }
    // 2) Try to extract a 2-letter code token and map to name
    const tokenMatch = norm.match(/(^|[^a-z])([a-z]{2})([^a-z]|$)/);
    if (tokenMatch) {
      const code = tokenMatch[2].toUpperCase();
      const name = this.paysCodeToName[code];
      if (name) return name;
    }
    // 3) Fallback: last-two-letters as code
    const lettersOnly = raw.replace(/[^A-Za-z]/g, '');
    if (lettersOnly.length >= 2) {
      const code = lettersOnly.slice(-2).toUpperCase();
      const name = this.paysCodeToName[code];
      if (name) return name;
    }
    return '';
  }

  getReleveMontant(r: ReleveBancaireRow): number {
    if (!r) return 0;
    if (typeof r.montant === 'number') return r.montant;
    if (typeof r.debit === 'number' && r.debit > 0) return r.debit;
    if (typeof r.credit === 'number' && r.credit > 0) return r.credit;
    return 0;
  }

  getOperationMontantAbs(op?: OperationBancaireDisplay): number {
    if (!op) return 0;
    return Math.abs(op.montant || 0);
  }

  getReleveMontantAbs(r?: ReleveBancaireRow): number {
    if (!r) return 0;
    return Math.abs(this.getReleveMontant(r));
  }

  private buildKeysWithIndexes<T>(items: T[], getBase: (it: T) => { date: string; montantAbs: number; banque: string; sens: 'debit' | 'credit'; }): Array<T & { key: string; sensIndex: string; }> {
    const counters = new Map<string, number>();
    return items.map(it => {
      const base = getBase(it);
      const groupKey = `${base.date}|${base.montantAbs}|${base.banque}|${base.sens}`;
      const current = (counters.get(groupKey) || 0) + 1;
      counters.set(groupKey, current);
      const sensIndex = `${base.sens}${current}`;
      // Construire la clé d'affichage sans séparateurs, sans espaces ni tirets
      const dateNoDash = (base.date || '').replace(/-/g, '');
      const montantDigits = String(base.montantAbs).replace(/\D/g, '');
      const banqueCompact = (base.banque || '').toUpperCase().replace(/[\s-]/g, '');
      const key = `${dateNoDash}${montantDigits}${banqueCompact}${sensIndex}`;
      const augmented: any = Object.assign({}, it as any, { key, sensIndex });
      return augmented;
    });
  }

  // =========================
  // Réconciliation - Actions
  // =========================
  reconcile() {
    console.log('[RECON][DEBUG] reconcile() called with:', {
      reconPays: this.reconPays,
      reconDate: this.reconDate,
      operationsCount: this.operations?.length || 0,
      relevesCount: this.releveAllRows?.length || 0
    });
    
    if (!this.reconPays) {
      this.popupService.showWarning('Veuillez choisir un pays. La date est optionnelle.');
      return;
    }
    if (!this.operations || !this.operations.length) {
      this.popupService.showWarning('Aucune opération bancaire disponible.');
      return;
    }
    if (!this.releveRows || !this.releveRows.length) {
      this.popupService.showWarning('Aucun relevé bancaire importé. Veuillez importer un relevé.');
      return;
    }

    this.reconciling = true;

    // Préparer les opérations filtrées (par pays + date)
    const ymd = this.reconDate || '';
    try {
      const reconCodeDbg = this.getReconCountryCode();
      console.log('[RECON][DBG] Inputs', {
        reconPays: this.reconPays,
        reconCode: reconCodeDbg,
        reconDate: ymd || '(all)',
        selectedBatch: this.releveSelectedBatchId || 'ALL',
        opsCount: (this.operations || []).length,
        releveAllCount: (this.releveAllRows || []).length
      });
      const opsCountryCounts: Record<string, number> = {};
      (this.operations || []).forEach(op => {
        const name = this.resolveDisplayCountryName((op.pays as any) || (op as any).codePays || '');
        if (!name) return;
        opsCountryCounts[name] = (opsCountryCounts[name] || 0) + 1;
      });
      console.log('[RECON][DBG] Ops by country', opsCountryCounts);
      const revCountryCounts: Record<string, number> = {};
      ((this.releveAllRows || []) as any[]).forEach(r => {
        const nm = this.deriveCountryNameFromBanque((r as any).banque);
        const cd = this.deriveCountryCodeFromBanque((r as any).banque);
        const key = nm || (cd ? `code:${cd}` : 'unknown');
        revCountryCounts[key] = (revCountryCounts[key] || 0) + 1;
      });
      console.log('[RECON][DBG] Releves by country/name', revCountryCounts);
    } catch {}
    const opsFiltered = this.operations.filter(op => {
      // Déterminer le nom de pays à afficher depuis les opérations (comme pour le Cameroun qui fonctionne)
      const opName = (() => {
        const rawPays = (op.pays || '').toString().trim();
        if (rawPays) return this.resolveDisplayCountryName(rawPays);
        const code = (op as any).codePays ? String((op as any).codePays).toUpperCase().trim() : '';
        return code && this.paysCodeToName[code] ? this.paysCodeToName[code] : '';
      })();
      const matchCountry = countriesMatch(opName, this.reconPays);
      const matchDate = !ymd || this.normalizeDateToYmd(op.dateOperation) === ymd;
      return matchCountry && matchDate;
    });
    const opsWithKey = this.buildKeysWithIndexes(opsFiltered, (op) => {
      const date = this.normalizeDateToYmd(op.dateOperation);
      const montantAbs = Math.abs(op.montant || 0);
      const banque = ((op.bo || '').trim() || '').toUpperCase();
      const sens = this.determineOperationSens(op as OperationBancaireDisplay);
      return { date, montantAbs, banque, sens };
    });

    // Préparer les lignes de relevé filtrées (source: tous lots, filtre lot optionnel), puis pays/date
    const reconCode = this.getReconCountryCode();
    const baseReleves: Array<ReleveBancaireRow & any> = (this.releveAllRows || []) as any;
    const sourceReleves = (this.releveSelectedBatchId && this.releveSelectedBatchId !== 'ALL')
      ? baseReleves.filter(r => r && r.batchId === this.releveSelectedBatchId)
      : baseReleves;
    try {
      console.log('[RECON][DBG] Base/source releves counts', {
        base: baseReleves.length,
        source: sourceReleves.length,
        selectedBatch: this.releveSelectedBatchId || 'ALL'
      });
    } catch {}
    const relevéFiltered = sourceReleves.filter(r => {
      // Faire correspondre par nom pays affiché comme pour le Cameroun
      const rowDisplayName = this.deriveCountryNameFromBanque(r.banque);
      const matchCountry = rowDisplayName
        ? countriesMatch(rowDisplayName, this.reconPays)
        : (() => {
        const rowCode = this.deriveCountryCodeFromBanque(r.banque);
        const expectedCode = reconCode;
        return !expectedCode || rowCode === expectedCode;
      })();
      if (!matchCountry) return false;
      // Filtre date (optionnel)
      if (!ymd) return true;
      const dateToUse = r.dateValeur ? r.dateValeur : r.dateComptable;
      return this.normalizeDateToYmd(dateToUse as any) === ymd;
    });

    try {
      console.log('[RECON][DBG] Filtered counts', {
        opsFiltered: opsFiltered.length,
        relevesFiltered: relevéFiltered.length,
        view: this.reconView
      });
    } catch {}
    const revWithKey = this.buildKeysWithIndexes(relevéFiltered, (r) => {
      const dateToUse = r.dateValeur ? r.dateValeur : r.dateComptable;
      const date = this.normalizeDateToYmd(dateToUse as any);
      const debit = r.debit || 0;
      const credit = r.credit || 0;
      const sens: 'debit' | 'credit' = debit > 0 ? 'debit' : 'credit';
      const montantAbs = debit > 0 ? Math.abs(debit) : Math.abs(credit || (r.montant || 0));
      const banque = ((r.banque || '').trim() || '').toUpperCase();
      return { date, montantAbs, banque, sens };
    });

    const opMap = new Map<string, { op: OperationBancaireDisplay & { key: string; sensIndex: string } }>();
    opsWithKey.forEach(o => opMap.set((o as any).key, { op: o as any }));

    const revMap = new Map<string, { row: ReleveBancaireRow & { key: string; sensIndex: string } }>();
    revWithKey.forEach(r => revMap.set((r as any).key, { row: r as any }));

    const allKeys = new Set<string>([...opMap.keys(), ...revMap.keys()]);
    try {
      console.log('[RECON][DBG] opMap/ revMap sizes', { opMap: opMap.size, revMap: revMap.size, allKeys: allKeys.size });
    } catch {}
    const results: Array<{ date: string; montant: number; banque: string; sensIndex: string; source: 'OPERATION'|'RELEVE'|'BOTH'; suspens?: 'Suspens BO'|'Suspens Banque'|''; }> = [];
    const pairs: Array<{ key: string; date: string; montant: number; banque: string; sensIndex: string; }> = [];

    allKeys.forEach(key => {
      const opEntry = opMap.get(key);
      const revEntry = revMap.get(key);
      const inOp = !!opEntry;
      const inRev = !!revEntry;

      // Reconstituer les attributs d'affichage depuis la source disponible
      let date = '';
      let montantAbs = 0;
      let banque = '';
      let sensIndex = '';

      if (opEntry) {
        const op = opEntry.op as OperationBancaireDisplay & { sensIndex: string };
        date = this.normalizeDateToYmd(op.dateOperation);
        montantAbs = Math.abs(op.montant || 0);
        banque = ((op.bo || '').trim() || '').toUpperCase();
        sensIndex = op.sensIndex;
      } else if (revEntry) {
        const r = revEntry.row as ReleveBancaireRow & { sensIndex: string };
        const dateToUse = r.dateValeur ? r.dateValeur : r.dateComptable;
        date = this.normalizeDateToYmd(dateToUse as any);
        const debit = r.debit || 0;
        const credit = r.credit || 0;
        montantAbs = debit > 0 ? Math.abs(debit) : Math.abs(credit || (r.montant || 0));
        banque = ((r.banque || '').trim() || '').toUpperCase();
        sensIndex = r.sensIndex;
      }

      if (inOp && inRev) {
        results.push({ date, montant: montantAbs, banque, sensIndex, source: 'BOTH', suspens: '' });
        pairs.push({ key, date, montant: montantAbs, banque, sensIndex });
      } else if (inOp && !inRev) {
        results.push({ date, montant: montantAbs, banque, sensIndex, source: 'OPERATION', suspens: 'Suspens BO' });
      } else if (!inOp && inRev) {
        results.push({ date, montant: montantAbs, banque, sensIndex, source: 'RELEVE', suspens: 'Suspens Banque' });
      }
    });

    // Trier pour lisibilité
    results.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.banque !== b.banque) return a.banque.localeCompare(b.banque);
      if (a.montant !== b.montant) return a.montant - b.montant;
      return a.sensIndex.localeCompare(b.sensIndex);
    });

    this.reconciliationResults = results;
    try {
      const counts = results.reduce((acc, it) => { acc[it.source] = (acc[it.source] || 0) + 1; return acc; }, {} as any);
      console.log('[RECON][DBG] result counts by source', counts);
    } catch {}
    // Construire les lignes d'écarts: gauche = opérations seules, droite = relevé seul
    const diffs: Array<{ left?: (OperationBancaireDisplay & { key?: string }); right?: (ReleveBancaireRow & { key?: string }) }> = [];
    const allKeysForDiff = new Set<string>([...opMap.keys(), ...revMap.keys()]);
    allKeysForDiff.forEach(k => {
      const opEntry = opMap.get(k);
      const revEntry = revMap.get(k);
      if (opEntry && !revEntry) {
        const op = opEntry.op as any;
        diffs.push({ left: op });
      } else if (!opEntry && revEntry) {
        const row = revEntry.row as any;
        diffs.push({ right: row });
      }
    });
    // Trier par date (gauche puis droite, avec relevé: dateValeur si dispo sinon dateComptable), banque puis montant si disponibles
    diffs.sort((a, b) => {
      const aRightDate = a.right?.dateValeur ? new Date(a.right.dateValeur as any).getTime() : (a.right?.dateComptable ? new Date(a.right.dateComptable as any).getTime() : 0);
      const bRightDate = b.right?.dateValeur ? new Date(b.right.dateValeur as any).getTime() : (b.right?.dateComptable ? new Date(b.right.dateComptable as any).getTime() : 0);
      const aDate = a.left?.dateOperation ? new Date(a.left.dateOperation).getTime() : aRightDate;
      const bDate = b.left?.dateOperation ? new Date(b.left.dateOperation).getTime() : bRightDate;
      if (aDate !== bDate) return aDate - bDate;
      const aBanque = (a.left?.bo || a.right?.banque || '').toString();
      const bBanque = (b.left?.bo || b.right?.banque || '').toString();
      if (aBanque !== bBanque) return aBanque.localeCompare(bBanque);
      const aMont = (a.left?.montant ?? a.right?.montant ?? 0) as number;
      const bMont = (b.left?.montant ?? b.right?.montant ?? 0) as number;
      return (aMont - bMont);
    });
    this.reconDiffRows = diffs;
    this.leftOnlyOperations = diffs.filter(d => !!d.left).map(d => d.left!) as OperationBancaireDisplay[];
    this.rightOnlyReleves = diffs.filter(d => !!d.right).map(d => d.right!) as ReleveBancaireRow[];

    console.log('[RECON][DEBUG] reconcile() results:', {
      totalDiffs: diffs.length,
      leftOnlyOperations: this.leftOnlyOperations.length,
      rightOnlyReleves: this.rightOnlyReleves.length,
      sampleLeftOps: this.leftOnlyOperations.slice(0, 2).map(op => ({
        key: (op as any).key,
        typeOperation: op.typeOperation,
        montant: op.montant
      })),
      sampleRightReleves: this.rightOnlyReleves.slice(0, 2).map(r => ({
        key: (r as any).key,
        banque: r.banque,
        montant: r.montant
      }))
    });

    // Correspondances complètes (toutes colonnes)
    const bothKeys = Array.from(allKeys).filter(k => opMap.has(k) && revMap.has(k));
    this.matchedOperations = bothKeys.map(k => opMap.get(k)!.op);
    this.matchedReleves = bothKeys.map(k => revMap.get(k)!.row);
    // Tableau de bord : suspens = lignes hors correspondance (KO), après mise à jour des correspondances
    this.updateTotalSuspensKO();

    console.log('[RECON][DEBUG] matched results:', {
      matchedOperations: this.matchedOperations.length,
      matchedReleves: this.matchedReleves.length,
      sampleMatchedOps: this.matchedOperations.slice(0, 2).map(op => ({
        key: (op as any).key,
        typeOperation: op.typeOperation,
        montant: op.montant
      }))
    });
    // Index pour action rapide
    (this as any).keyToOp = {};
    (this as any).keyToRev = {};
    bothKeys.forEach(k => { (this as any).keyToOp[k] = opMap.get(k)!.op; (this as any).keyToRev[k] = revMap.get(k)!.row; });
    // Appliquer statuts OK aux tableaux d'affichage (synchronisation)
    this.applyOkStatusesToOpAndRev();
    // Paires correspondantes pour affichage synthétique
    this.matchedPairs = pairs.filter(p => bothKeys.includes(p.key)).map(p => ({ date: p.date, montant: p.montant, banque: p.banque, sensIndex: p.sensIndex }));
    try {
      console.log('[RECON][DBG] matchedPairs length', this.matchedPairs.length);
    } catch {}

    // Choisir la vue par défaut selon la présence d'écarts
    if (this.leftOnlyOperations.length > 0) {
      this.reconView = 'operation';
    } else if (this.rightOnlyReleves.length > 0) {
      this.reconView = 'releve';
    } else {
      this.reconView = 'operation';
    }

    this.reconciling = false;

    // Pagination init
    this.reconPage = 1;
    this.reconOpPage = 1;
    this.reconRevPage = 1;
    this.reconCorrOpPage = 1;
    this.reconCorrRevPage = 1;
    this.updatePagedReconciliationResults();
  }

  openCorrespondance() {
    if (!this.matchedPairs.length) {
      this.popupService.showWarning('Aucune correspondance trouvée.');
      return;
    }
    this.showCorrespondancePopup = true;
  }

  // Affichage: convertir 'debit1' -> 'Débit1', 'credit2' -> 'Crédit2'
  formatSensIndex(sensIndex: string): string {
    if (!sensIndex) return '';
    if (sensIndex.startsWith('debit')) return 'Débit' + sensIndex.replace('debit', '');
    if (sensIndex.startsWith('credit')) return 'Crédit' + sensIndex.replace('credit', '');
    return sensIndex;
  }

  // Etiquette (sans index)
  formatSensSimple(sensIndex?: string | null): string {
    if (!sensIndex) return '-';
    if (sensIndex.startsWith('debit')) return 'Débit';
    if (sensIndex.startsWith('credit')) return 'Crédit';
    return '-';
  }

  sensBadgeClass(sensIndex?: string | null): any {
    if (!sensIndex) return {};
    return {
      'sens-debit': sensIndex.startsWith('debit'),
      'sens-credit': sensIndex.startsWith('credit'),
    };
  }

  closeCorrespondance() {
    this.showCorrespondancePopup = false;
  }

  get filteredMatchedPairs() {
    let pairs = this.matchedPairs;
    if (this.correspondanceFilterBanque && this.correspondanceFilterBanque.trim()) {
      const b = this.correspondanceFilterBanque.trim().toUpperCase();
      pairs = pairs.filter(p => (p.banque || '').toUpperCase().includes(b));
    }
    if (this.correspondanceFilterMontant !== null && this.correspondanceFilterMontant !== undefined) {
      pairs = pairs.filter(p => p.montant === this.correspondanceFilterMontant);
    }
    return pairs;
  }

  // =========================
  // Réconciliation - Pagination
  // =========================
  updatePagedReconciliationResults() {
    try {
      console.log('[RECON][DBG] updatePagedReconciliationResults', {
        reconView: this.reconView,
        reconPays: this.reconPays,
        reconCode: this.getReconCountryCode(),
        reconDate: this.reconDate || '(all)'
      });
    } catch {}
    // Appliquer les filtres recon avant pagination
    const f = this.reconFilters;

    const matchAmount = (amount: number | undefined | null) => {
      const a = typeof amount === 'number' ? amount : 0;
      if (f.montantMin !== null && a < f.montantMin) return false;
      if (f.montantMax !== null && a > f.montantMax) return false;
      return true;
    };

    const matchText = (text: string | undefined | null) => {
      const q = (f.search || '').trim().toLowerCase();
      if (!q) return true;
      return (text || '').toLowerCase().includes(q);
    };

    const matchBanque = (banque: string | undefined | null) => {
      const b = (f.banque || '').trim().toLowerCase();
      if (!b) return true;
      return (banque || '').toLowerCase().includes(b);
    };

    // Opérations (écarts seulement gauche)
    this.filteredLeftOps = (this.leftOnlyOperations || []).filter(op => {
      const isMarkedOk = (op as any).key && this.reconOkKeySet.has((op as any).key);
      if (!this.showOkMarked && isMarkedOk) {
        console.log('[RECON][DEBUG] Excluding OK marked operation:', (op as any).key, op);
        return false; // ignorer marqués OK
      }
      const okType = !f.typeOperation || (op.typeOperation || '') === f.typeOperation;
      const okStatut = !f.statut || (op.statut || '') === f.statut;
      const okBanque = matchBanque(op.bo);
      const okAmount = matchAmount(Math.abs(op.montant || 0));
      const okSearch = [op.nomBeneficiaire, op.reference, op.compteADebiter, op.agence]
        .some(v => matchText(v || ''));
      const result = okType && okStatut && okBanque && okAmount && okSearch;
      if (result) {
        console.log('[RECON][DEBUG] Including operation:', (op as any).key, 'marked OK:', isMarkedOk, 'showOkMarked:', this.showOkMarked);
      }
      return result;
    });

    // Relevés (écarts seulement droite)
    this.filteredRightReleves = (this.rightOnlyReleves || []).filter(r => {
      const isMarkedOk = (r as any).key && this.reconOkKeySet.has((r as any).key);
      if (!this.showOkMarked && isMarkedOk) {
        console.log('[RECON][DEBUG] Excluding OK marked releve:', (r as any).key, r);
        return false; // ignorer marqués OK
      }
      const amount = this.getReleveMontantAbs(r);
      const okBanque = matchBanque(r.banque);
      const okAmount = matchAmount(amount);
      const okSearch = [r.libelle, r.numeroCompte, r.nomCompte, r.numeroCheque]
        .some(v => matchText(v || ''));
      const result = okBanque && okAmount && okSearch;
      if (result) {
        console.log('[RECON][DEBUG] Including releve:', (r as any).key, 'marked OK:', isMarkedOk, 'showOkMarked:', this.showOkMarked);
      }
      return result;
    });

    // Correspondances opérations
    this.filteredMatchedOps = (this.matchedOperations || []).filter(op => {
      const isMarkedOk = (op as any).key && this.reconOkKeySet.has((op as any).key);
      if (!this.showOkMarked && isMarkedOk) {
        console.log('[RECON][DEBUG] Excluding OK marked matched operation:', (op as any).key, op);
        return false; // ignorer marqués OK
      }
      const okType = !f.typeOperation || (op.typeOperation || '') === f.typeOperation;
      const okStatut = !f.statut || (op.statut || '') === f.statut;
      const okBanque = matchBanque(op.bo);
      const okAmount = matchAmount(Math.abs(op.montant || 0));
      const okSearch = [op.nomBeneficiaire, op.reference, op.compteADebiter, op.agence]
        .some(v => matchText(v || ''));
      const result = okType && okStatut && okBanque && okAmount && okSearch;
      if (result) {
        console.log('[RECON][DEBUG] Including matched operation:', (op as any).key, 'marked OK:', isMarkedOk, 'showOkMarked:', this.showOkMarked);
      }
      return result;
    });

    // Correspondances relevé
    this.filteredMatchedReleves = (this.matchedReleves || []).filter(r => {
      const isMarkedOk = (r as any).key && this.reconOkKeySet.has((r as any).key);
      if (!this.showOkMarked && isMarkedOk) {
        console.log('[RECON][DEBUG] Excluding OK marked matched releve:', (r as any).key, r);
        return false; // ignorer marqués OK
      }
      const amount = this.getReleveMontantAbs(r);
      const okBanque = matchBanque(r.banque);
      const okAmount = matchAmount(amount);
      const okSearch = [r.libelle, r.numeroCompte, r.nomCompte, r.numeroCheque]
        .some(v => matchText(v || ''));
      const result = okBanque && okAmount && okSearch;
      if (result) {
        console.log('[RECON][DEBUG] Including matched releve:', (r as any).key, 'marked OK:', isMarkedOk, 'showOkMarked:', this.showOkMarked);
      }
      return result;
    });

    // Logs de débogage pour les totaux
    console.log('[RECON][DEBUG] Filtering results:', {
      showOkMarked: this.showOkMarked,
      totalOkKeys: this.reconOkKeySet.size,
      leftOnlyOperations: (this.leftOnlyOperations || []).length,
      filteredLeftOps: this.filteredLeftOps.length,
      rightOnlyReleves: (this.rightOnlyReleves || []).length,
      filteredRightReleves: this.filteredRightReleves.length,
      matchedOperations: (this.matchedOperations || []).length,
      filteredMatchedOps: this.filteredMatchedOps.length,
      matchedReleves: (this.matchedReleves || []).length,
      filteredMatchedReleves: this.filteredMatchedReleves.length,
      reconPays: this.reconPays,
      hasReconciliationData: !!(this.leftOnlyOperations?.length || this.rightOnlyReleves?.length || this.matchedOperations?.length || this.matchedReleves?.length)
    });

    // Avertissement si pas de données de réconciliation
    if (!this.reconPays) {
      console.log('[RECON][WARNING] Aucune réconciliation lancée - reconPays est vide');
    } else if (!(this.leftOnlyOperations?.length || this.rightOnlyReleves?.length || this.matchedOperations?.length || this.matchedReleves?.length)) {
      console.log('[RECON][WARNING] Réconciliation lancée mais aucune donnée trouvée pour', this.reconPays);
    } else {
      console.log('[RECON][INFO] Réconciliation active avec données:', {
        reconPays: this.reconPays,
        leftOnlyOperations: this.leftOnlyOperations?.length || 0,
        rightOnlyReleves: this.rightOnlyReleves?.length || 0,
        matchedOperations: this.matchedOperations?.length || 0,
        matchedReleves: this.matchedReleves?.length || 0,
        showOkMarked: this.showOkMarked,
        totalOkKeys: this.reconOkKeySet.size
      });
      
      // Logs détaillés pour chaque catégorie
      if (this.leftOnlyOperations?.length > 0) {
        console.log('[RECON][DEBUG] leftOnlyOperations sample:', this.leftOnlyOperations.slice(0, 3).map(op => ({
          key: (op as any).key,
          isMarkedOk: (op as any).key && this.reconOkKeySet.has((op as any).key),
          typeOperation: op.typeOperation,
          montant: op.montant
        })));
      }
      
      if (this.rightOnlyReleves?.length > 0) {
        console.log('[RECON][DEBUG] rightOnlyReleves sample:', this.rightOnlyReleves.slice(0, 3).map(r => ({
          key: (r as any).key,
          isMarkedOk: (r as any).key && this.reconOkKeySet.has((r as any).key),
          banque: r.banque,
          montant: r.montant
        })));
      }
      
      if (this.matchedOperations?.length > 0) {
        console.log('[RECON][DEBUG] matchedOperations sample:', this.matchedOperations.slice(0, 3).map(op => ({
          key: (op as any).key,
          isMarkedOk: (op as any).key && this.reconOkKeySet.has((op as any).key),
          typeOperation: op.typeOperation,
          montant: op.montant
        })));
      }
    }

    // Global (legacy, non affiché directement ici)
    this.reconTotalPages = Math.ceil(this.reconDiffRows.length / this.reconPageSize) || 1;
    const startIndex = (this.reconPage - 1) * this.reconPageSize;
    this.reconPagedResults = this.reconDiffRows.slice(startIndex, startIndex + this.reconPageSize);

    // View: operations only
    this.reconOpTotalPages = Math.ceil(this.filteredLeftOps.length / this.reconPageSize) || 1;
    const opStart = (this.reconOpPage - 1) * this.reconPageSize;
    this.pagedLeftOps = this.filteredLeftOps.slice(opStart, opStart + this.reconPageSize);

    // View: bank statement only
    this.reconRevTotalPages = Math.ceil(this.filteredRightReleves.length / this.reconPageSize) || 1;
    const revStart = (this.reconRevPage - 1) * this.reconPageSize;
    this.pagedRightReleves = this.filteredRightReleves.slice(revStart, revStart + this.reconPageSize);

    // View: correspondances operations
    this.reconCorrOpTotalPages = Math.ceil(this.filteredMatchedOps.length / this.reconPageSize) || 1;
    const copStart = (this.reconCorrOpPage - 1) * this.reconPageSize;
    this.pagedMatchedOps = this.filteredMatchedOps.slice(copStart, copStart + this.reconPageSize);

    // View: correspondances relevé
    this.reconCorrRevTotalPages = Math.ceil(this.filteredMatchedReleves.length / this.reconPageSize) || 1;
    const crevStart = (this.reconCorrRevPage - 1) * this.reconPageSize;
    this.pagedMatchedReleves = this.filteredMatchedReleves.slice(crevStart, crevStart + this.reconPageSize);
  }

  applyReconFilters() {
    // Revenir à la première page pour chaque vue filtrée
    this.reconOpPage = 1;
    this.reconRevPage = 1;
    this.reconCorrOpPage = 1;
    this.reconCorrRevPage = 1;
    this.updatePagedReconciliationResults();
  }

  clearReconFilters() {
    this.reconFilters = {
      typeOperation: '',
      statut: '',
      banque: '',
      search: '',
      montantMin: null,
      montantMax: null
    };
    this.applyReconFilters();
  }

  // ---- Pagination unifiée (composant ds-pagination, comme Suivi compense OP) ----
  get reconCurrentPage(): number {
    switch (this.reconView) {
      case 'operation': return this.reconOpPage;
      case 'releve': return this.reconRevPage;
      case 'corr_operation': return this.reconCorrOpPage;
      default: return this.reconCorrRevPage;
    }
  }

  get reconCurrentTotalPages(): number {
    switch (this.reconView) {
      case 'operation': return this.reconOpTotalPages;
      case 'releve': return this.reconRevTotalPages;
      case 'corr_operation': return this.reconCorrOpTotalPages;
      default: return this.reconCorrRevTotalPages;
    }
  }

  get reconCurrentTotalItems(): number {
    switch (this.reconView) {
      case 'operation': return this.filteredLeftOps.length;
      case 'releve': return this.filteredRightReleves.length;
      case 'corr_operation': return this.filteredMatchedOps.length;
      default: return this.filteredMatchedReleves.length;
    }
  }

  reconSetPageSize(size: number) {
    this.reconPageSize = size;
    this.onReconPageSizeChange();
  }

  releveSetPage(page: number) {
    this.relevePage = Math.min(Math.max(1, page), this.releveTotalPages);
  }

  releveSetPageSize(size: number) {
    this.relevePageSize = size;
    this.relevePage = 1;
  }

  comptesGoToPage(page: number) {
    this.comptesListPage = Math.min(Math.max(1, page), this.comptesListTotalPages);
  }

  comptesSetPageSize(size: number) {
    this.comptesListPageSize = size;
    this.onComptesListPageSizeChange();
  }

  compteOpsSetPageSize(size: number) {
    this.compteOpsPageSize = size;
    this.onCompteOpsPageSizeChange();
  }

  onReconPageSizeChange() {
    this.reconPage = 1;
    this.reconOpPage = 1;
    this.reconRevPage = 1;
    this.reconCorrOpPage = 1;
    this.reconCorrRevPage = 1;
    this.updatePagedReconciliationResults();
  }

  reconNextPage() {
    if (this.reconView === 'operation') {
      if (this.reconOpPage < this.reconOpTotalPages) {
        this.reconOpPage++;
        this.updatePagedReconciliationResults();
      }
    } else if (this.reconView === 'releve') {
      if (this.reconRevPage < this.reconRevTotalPages) {
        this.reconRevPage++;
        this.updatePagedReconciliationResults();
      }
    } else if (this.reconView === 'corr_operation') {
      if (this.reconCorrOpPage < this.reconCorrOpTotalPages) {
        this.reconCorrOpPage++;
        this.updatePagedReconciliationResults();
      }
    } else {
      if (this.reconCorrRevPage < this.reconCorrRevTotalPages) {
        this.reconCorrRevPage++;
        this.updatePagedReconciliationResults();
      }
    }
  }

  reconPrevPage() {
    if (this.reconView === 'operation') {
      if (this.reconOpPage > 1) {
        this.reconOpPage--;
        this.updatePagedReconciliationResults();
      }
    } else if (this.reconView === 'releve') {
      if (this.reconRevPage > 1) {
        this.reconRevPage--;
        this.updatePagedReconciliationResults();
      }
    } else if (this.reconView === 'corr_operation') {
      if (this.reconCorrOpPage > 1) {
        this.reconCorrOpPage--;
        this.updatePagedReconciliationResults();
      }
    } else {
      if (this.reconCorrRevPage > 1) {
        this.reconCorrRevPage--;
        this.updatePagedReconciliationResults();
      }
    }
  }

  // Navigation avancée pour la pagination
  reconGoToFirstPage() {
    if (this.reconView === 'operation') {
      this.reconOpPage = 1;
    } else if (this.reconView === 'releve') {
      this.reconRevPage = 1;
    } else if (this.reconView === 'corr_operation') {
      this.reconCorrOpPage = 1;
    } else if (this.reconView === 'corr_releve') {
      this.reconCorrRevPage = 1;
    }
    this.updatePagedReconciliationResults();
  }

  reconGoToLastPage() {
    if (this.reconView === 'operation') {
      this.reconOpPage = this.reconOpTotalPages;
    } else if (this.reconView === 'releve') {
      this.reconRevPage = this.reconRevTotalPages;
    } else if (this.reconView === 'corr_operation') {
      this.reconCorrOpPage = this.reconCorrOpTotalPages;
    } else if (this.reconView === 'corr_releve') {
      this.reconCorrRevPage = this.reconCorrRevTotalPages;
    }
    this.updatePagedReconciliationResults();
  }

  // Générateur de numéros de page pour l'affichage
  getReconPageNumbers(): number[] {
    let currentPage = 1;
    let totalPages = 1;

    if (this.reconView === 'operation') {
      currentPage = this.reconOpPage;
      totalPages = this.reconOpTotalPages;
    } else if (this.reconView === 'releve') {
      currentPage = this.reconRevPage;
      totalPages = this.reconRevTotalPages;
    } else if (this.reconView === 'corr_operation') {
      currentPage = this.reconCorrOpPage;
      totalPages = this.reconCorrOpTotalPages;
    } else if (this.reconView === 'corr_releve') {
      currentPage = this.reconCorrRevPage;
      totalPages = this.reconCorrRevTotalPages;
    }

    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    // Toujours afficher au moins la page 1
    if (totalPages === 0) {
      totalPages = 1;
    }
    
    if (totalPages <= maxVisiblePages) {
      // Afficher toutes les pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Logique de pagination avec ellipses
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  // Informations de pagination détaillées
  getReconPaginationInfo(): string {
    let currentPage = 1;
    let totalPages = 1;
    let totalItems = 0;
    let pageSize = this.reconPageSize;

    if (this.reconView === 'operation') {
      currentPage = this.reconOpPage;
      totalPages = this.reconOpTotalPages;
      totalItems = this.filteredLeftOps.length;
    } else if (this.reconView === 'releve') {
      currentPage = this.reconRevPage;
      totalPages = this.reconRevTotalPages;
      totalItems = this.filteredRightReleves.length;
    } else if (this.reconView === 'corr_operation') {
      currentPage = this.reconCorrOpPage;
      totalPages = this.reconCorrOpTotalPages;
      totalItems = this.filteredMatchedOps.length;
    } else if (this.reconView === 'corr_releve') {
      currentPage = this.reconCorrRevPage;
      totalPages = this.reconCorrRevTotalPages;
      totalItems = this.filteredMatchedReleves.length;
    }

    if (totalItems === 0) {
      return 'Aucun résultat - Prêt pour la réconciliation';
    }

    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);
    
    return `Affichage de ${startItem} à ${endItem} sur ${totalItems} résultat${totalItems > 1 ? 's' : ''}`;
  }

  reconGoToPage(page: number) {
    if (this.reconView === 'operation') {
      if (page >= 1 && page <= this.reconOpTotalPages) {
        this.reconOpPage = page;
        this.updatePagedReconciliationResults();
      }
    } else if (this.reconView === 'releve') {
      if (page >= 1 && page <= this.reconRevTotalPages) {
        this.reconRevPage = page;
        this.updatePagedReconciliationResults();
      }
    } else if (this.reconView === 'corr_operation') {
      if (page >= 1 && page <= this.reconCorrOpTotalPages) {
        this.reconCorrOpPage = page;
        this.updatePagedReconciliationResults();
      }
    } else {
      if (page >= 1 && page <= this.reconCorrRevTotalPages) {
        this.reconCorrRevPage = page;
        this.updatePagedReconciliationResults();
      }
    }
  }

  getReconVisiblePages(): number[] {
    const maxVisible = 5;
    const pages: number[] = [];
    const total = this.reconView === 'operation' ? this.reconOpTotalPages : (this.reconView === 'releve' ? this.reconRevTotalPages : (this.reconView === 'corr_operation' ? this.reconCorrOpTotalPages : this.reconCorrRevTotalPages));
    const current = this.reconView === 'operation' ? this.reconOpPage : (this.reconView === 'releve' ? this.reconRevPage : (this.reconView === 'corr_operation' ? this.reconCorrOpPage : this.reconCorrRevPage));
    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      let start = Math.max(1, current - 2);
      let end = Math.min(total, start + maxVisible - 1);
      if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  }

  setReconView(view: 'operation' | 'releve') {
    if (this.reconView !== view) {
      this.reconView = view;
      this.updatePagedReconciliationResults();
    }
  }

  closeDetailPopup() {
    this.showDetailPopup = false;
    this.selectedOperation = null;
  }

  /** Banques existantes (colonne bo des opérations) proposées pour « Banque corrigée ». */
  banquesList: string[] = [];

  private banquesRequestPays = '';

  /** Valeurs de filtre d'un pays : son nom et ses codes (les opérations peuvent stocker l'un ou l'autre). */
  private paysFilterValues(paysName: string): string[] {
    const name = (paysName || '').trim();
    if (!name) return [];
    const codes = Object.entries(this.paysCodeToName)
      .filter(([, n]) => this.normalizeCountryName(n) === this.normalizeCountryName(name))
      .map(([code]) => code);
    return Array.from(new Set([name, ...codes]));
  }

  /** Recharge les banques du pays choisi ; sans pays, la liste reste vide. */
  loadBanquesList(paysName: string): void {
    const values = this.paysFilterValues(paysName);
    const requested = values.join('|');
    this.banquesRequestPays = requested;
    if (!values.length) {
      this.banquesList = [];
      return;
    }
    this.operationBancaireService.getDistinctBanques(values).subscribe({
      next: (banques) => {
        // Ignore une réponse arrivée après un changement de pays.
        if (this.banquesRequestPays !== requested) return;
        this.banquesList = Array.isArray(banques) ? banques : [];
      },
      error: () => {
        if (this.banquesRequestPays === requested) this.banquesList = [];
      }
    });
  }

  /** Options du select Type : types des opérations chargées, plus le type courant s'il n'y figure pas. */
  get editTypeOptions(): string[] {
    const current = this.editForm?.typeOperation;
    const list = [...this.typesOperation];
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  }

  /** Nom de pays tel qu'affiché dans le tableau (code résolu en nom), aligné sur la liste du formulaire. */
  private paysForForm(op: OperationBancaireDisplay): string {
    const display = this.getPaysDisplay(op);
    if (!display || display === '-') return '';
    const norm = this.normalizeCountryName(display);
    return this.paysList.find(p => this.normalizeCountryName(p) === norm) || display;
  }

  onEditPaysChange(pays: string): void {
    this.editForm.pays = pays;
    this.loadBanquesList(pays);
  }

  editOperation(operation: OperationBancaireDisplay) {
    this.selectedOperation = operation;
    const pays = this.paysForForm(operation);
    this.loadBanquesList(pays);
    // Pré-remplir le formulaire
    this.editForm = {
      pays,
      codePays: operation.codePays || '',
      dateOperation: this.formatDateForInput(operation.dateOperation),
      agence: operation.agence || '',
      compteADebiter: operation.compteADebiter || '',
      typeOperation: operation.typeOperation || '',
      montant: operation.montant || 0,
      reference: operation.reference || '',
      idGlpi: operation.idGlpi || '',
      bo: operation.bo || '',
      banqueCorrigee: operation.banqueCorrigee || '',
      statut: operation.statut || 'En attente',
      traitement: operation.traitement || '',
      demandeur: operation.demandeur || '',
      valideur: operation.valideur || ''
    };
    this.showEditPopup = true;
  }

  closeEditPopup() {
    this.showEditPopup = false;
    this.selectedOperation = null;
  }

  saveOperation() {
    if (!this.selectedOperation || !this.selectedOperation.id) return;

    const updateData = {
      pays: this.editForm.pays,
      codePays: this.editForm.codePays,
      dateOperation: this.editForm.dateOperation,
      agence: this.editForm.agence,
      compteADebiter: this.editForm.compteADebiter,
      typeOperation: this.editForm.typeOperation,
      montant: this.editForm.montant,
      reference: this.editForm.reference,
      idGlpi: this.editForm.idGlpi,
      bo: this.editForm.bo,
      banqueCorrigee: this.editForm.banqueCorrigee,
      statut: this.editForm.statut,
      traitement: this.editForm.traitement,
      demandeur: this.editForm.demandeur,
      valideur: this.editForm.valideur
    };

    this.operationBancaireService.updateOperationBancaire(this.selectedOperation.id, updateData).subscribe({
      next: (updatedOperation) => {
        console.log('Opération bancaire modifiée avec succès');
        
        // Vérifier si le statut passe à "Validée" pour ajouter l'info d'impact
        const previousStatut = this.selectedOperation.statut || '';
        const newStatut = this.editForm.statut || '';
        let message = '✅ Opération bancaire modifiée avec succès';
        
        if (!previousStatut.toLowerCase().includes('validée') && newStatut.toLowerCase().includes('validée')) {
          const type = (this.editForm.typeOperation || '').toLowerCase();
          const montant = this.editForm.montant || 0;
          const compte = this.editForm.compteADebiter || '';
          
          // Vérifier si l'impact a déjà été appliqué (depuis l'opération mise à jour)
          if (updatedOperation.impactApplique) {
            message += `\n\n⚠️ Impact déjà appliqué sur le solde du compte ${compte} (évite le double impact)`;
          } else if (this.banqueTypeMatches(type, this.calculService.getList('BANQUE.TYPES_APPROVISIONNEMENT', ['APPRO']))) {
            message += `\n\n💰 Impact sur le solde du compte ${compte}:\n+${montant} FCFA (Approvisionnement)`;
          } else if (this.banqueTypeMatches(type, this.calculService.getList('BANQUE.TYPES_COMPENSATION', ['COMPENS', 'COMPENSE']))) {
            message += `\n\n💰 Impact sur le solde du compte ${compte}:\n-${montant} FCFA (Compensation)`;
          } else if (this.banqueTypeMatches(type, this.calculService.getList('BANQUE.TYPES_NIVELLEMENT', ['NIVEL', 'NIVELLEMENT']))) {
            const signe = montant >= 0 ? '+' : '';
            message += `\n\n💰 Impact sur le solde du compte ${compte}:\n${signe}${montant} FCFA (Nivellement)`;
          }
        }
        
        this.loadOperations();
        this.loadDashboardStats(); // Mettre à jour le compteur de tickets
        this.closeEditPopup();
        this.popupService.showSuccess(message);
      },
      error: (error) => {
        console.error('Erreur lors de la modification:', error);
        this.popupService.showError('❌ Erreur lors de la modification de l\'opération bancaire');
      }
    });
  }

  validateOperation(operation: any) {
    if (!operation || !operation.id) return;

    // Confirmation avant validation
    this.popupService.showConfirmDialog(
      `Êtes-vous sûr de vouloir valider cette opération bancaire ?\n\nType: ${operation.typeOperation}\nAgence: ${operation.agence}\nMontant: ${operation.montant} FCFA`,
      'Confirmation de validation'
    ).then(confirmed => {
      if (!confirmed) return;

      // Préparer les données de mise à jour avec le statut "Validée"
      const updateData = {
        pays: operation.pays,
        codePays: operation.codePays,
        mois: operation.mois,
        dateOperation: operation.dateOperation,
        agence: operation.agence,
        typeOperation: operation.typeOperation,
        nomBeneficiaire: operation.nomBeneficiaire,
        compteADebiter: operation.compteADebiter,
        montant: operation.montant,
        modePaiement: operation.modePaiement,
        reference: operation.reference,
        idGlpi: operation.idGlpi,
        bo: operation.bo,
        banqueCorrigee: operation.banqueCorrigee,
        statut: 'Validée' // Changer le statut à "Validée"
      };

      // Mettre à jour l'opération avec le nouveau statut
      this.operationBancaireService.updateOperationBancaire(operation.id, updateData).subscribe({
        next: (updatedOperation) => {
          console.log('Opération bancaire validée avec succès');
          
          // Ajouter l'info d'impact dans le message
          const type = (operation.typeOperation || '').toLowerCase();
          const montant = operation.montant || 0;
          const compte = operation.compteADebiter || '';
          let message = '✅ Opération bancaire validée avec succès';
          
          // Vérifier si l'impact a déjà été appliqué (depuis l'opération mise à jour)
          if (updatedOperation.impactApplique) {
            message += `\n\n⚠️ Impact déjà appliqué sur le solde du compte ${compte} (évite le double impact)`;
          } else if (this.banqueTypeMatches(type, this.calculService.getList('BANQUE.TYPES_APPROVISIONNEMENT', ['APPRO']))) {
            message += `\n\n💰 Impact sur le solde du compte ${compte}:\n+${montant} FCFA (Approvisionnement)`;
          } else if (this.banqueTypeMatches(type, this.calculService.getList('BANQUE.TYPES_COMPENSATION', ['COMPENS', 'COMPENSE']))) {
            message += `\n\n💰 Impact sur le solde du compte ${compte}:\n-${montant} FCFA (Compensation)`;
          } else if (this.banqueTypeMatches(type, this.calculService.getList('BANQUE.TYPES_NIVELLEMENT', ['NIVEL', 'NIVELLEMENT']))) {
            const signe = montant >= 0 ? '+' : '';
            message += `\n\n💰 Impact sur le solde du compte ${compte}:\n${signe}${montant} FCFA (Nivellement)`;
          }
          
          this.loadOperations();
          this.loadDashboardStats(); // Mettre à jour le compteur de tickets
          this.popupService.showSuccess(message);
        },
        error: (error) => {
          console.error('Erreur lors de la validation:', error);
          this.popupService.showError('❌ Erreur lors de la validation de l\'opération bancaire');
        }
      });
    });
  }

  deleteOperation(operation: OperationBancaireDisplay) {
    const id = operation.id;
    const confirmMessage = `Êtes-vous sûr de vouloir supprimer cette opération bancaire ?\n\nType: ${operation.typeOperation}\nAgence: ${operation.agence}\nMontant: ${operation.montant} FCFA`;

    this.popupService.showConfirmDialog(confirmMessage, 'Confirmation de suppression').then(confirmed => {
      if (confirmed) {
      // Chaque ligne est supprimée dans sa propre table : les identifiants des deux tables peuvent se confondre.
      const request$ = operation.source === 'generale'
        ? this.operationService.deleteOperation(id)
        : this.operationBancaireService.deleteOperationBancaire(id);
      request$.subscribe({
        next: (success) => {
          if (success) {
            console.log('Opération bancaire supprimée avec succès');
            this.loadOperations();
            this.loadDashboardStats(); // Mettre à jour le compteur de tickets
            this.popupService.showSuccess('✅ Opération bancaire supprimée avec succès');
          }
        },
        error: (error) => {
          console.error('Erreur lors de la suppression de l\'opération bancaire:', error);
          this.popupService.showError('❌ Erreur lors de la suppression de l\'opération bancaire');
        }
      });
      }
    });
  }

  // Helper pour formater la date pour l'input
  private formatDateForInput(date: Date): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Ouvrir GLPI pour créer un nouveau ticket
  openGlpiCreate() {
    const glpiCreateUrl = 'https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php';
    window.open(glpiCreateUrl, '_blank', 'noopener,noreferrer');
  }

  // Obtenir l'URL du ticket GLPI avec l'ID
  getGlpiTicketUrl(idGlpi: string): string {
    return `https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php?id=${idGlpi}`;
  }

  getBometierTicketUrl(idGlpi: string): string {
    return `https://bometier.gutouch.net/details-ticket/${idGlpi}`;
  }

  // Ouvrir BOMETIER pour créer un nouveau ticket
  openBometierCreate() {
    const bometierCreateUrl = 'https://bometier.gutouch.net/';
    window.open(bometierCreateUrl, '_blank', 'noopener,noreferrer');
  }

  /** Retourne true si l'idGlpi indique qu'il faut créer un ticket (vide, "créer", "creer", etc.) */
  isCreateTicketCase(idGlpi: string | undefined | null): boolean {
    const s = (idGlpi || '').trim();
    if (!s) return true;
    const lower = s.toLowerCase();
    return lower.includes('créer') || lower.includes('creer');
  }

  // Afficher un popup pour choisir entre GLPI et BOMETIER (ouvrir un ticket existant)
  showTicketOptionsPopup(ticketId: string): void {
    const message = `Choisissez la plateforme pour ouvrir le ticket ${ticketId}:`;
    const title = 'Ouvrir le ticket';
    this.showTicketChoiceOverlay(title, message, () => this.openGlpiTicket(ticketId), () => this.openBometierTicket(ticketId));
  }

  // Afficher un popup pour choisir où créer un nouveau ticket (GLPI ou BOMETIER)
  showTicketCreateOptionsPopup(): void {
    const message = 'Choisissez la plateforme pour créer un nouveau ticket :';
    const title = 'Créer un ticket';
    this.showTicketChoiceOverlay(title, message, () => this.openGlpiCreate(), () => this.openBometierCreate());
  }

  private showTicketChoiceOverlay(title: string, message: string, onGlpi: () => void, onBometier: () => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'modern-popup-overlay';
    overlay.innerHTML = `
      <div class="modern-popup popup-type-info">
        <div class="popup-header">
          <div class="popup-title-wrapper">
            <span class="popup-icon">🎫</span>
            <h3 class="popup-title">${title}</h3>
          </div>
          <button class="popup-close" aria-label="Fermer">×</button>
        </div>
        <div class="popup-content">
          <p class="popup-message">${message}</p>
        </div>
        <div class="popup-actions popup-actions-two-buttons">
          <button class="popup-btn popup-btn-glpi">🔵 GLPI</button>
          <button class="popup-btn popup-btn-bometier">🟢 BOMETIER</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .modern-popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); display: flex;
        justify-content: center; align-items: center; z-index: var(--z-modal);
        animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
      .modern-popup { background: white; border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
        max-width: 450px; width: 90%; overflow: hidden; border-top: 4px solid #007bff; }
      .popup-header { display: flex; justify-content: space-between; align-items: center;
        padding: 24px 24px 16px 24px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); }
      .popup-title-wrapper { display: flex; align-items: center; gap: 12px; }
      .popup-icon { font-size: 24px; }
      .popup-title { margin: 0; font-size: 20px; font-weight: 700; color: #212529; }
      .popup-close { background: rgba(0, 0, 0, 0.05); border: none; font-size: 22px; cursor: pointer;
        color: #6c757d; padding: 0; width: 32px; height: 32px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; }
      .popup-close:hover { background: rgba(0, 0, 0, 0.1); color: #212529; }
      .popup-content { padding: 20px 24px; }
      .popup-message { margin: 0; color: #495057; line-height: 1.6; font-size: 15px; }
      .popup-actions-two-buttons { display: flex; justify-content: center; gap: 12px;
        padding: 16px 24px 24px 24px; background: #f8f9fa; border-top: 1px solid #e9ecef; }
      .popup-btn { padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer;
        font-weight: 600; font-size: 14px; min-width: 140px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
      .popup-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15); }
      .popup-btn-glpi { background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; }
      .popup-btn-glpi:hover { background: linear-gradient(135deg, #0056b3 0%, #004085 100%); }
      .popup-btn-bometier { background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); color: white; }
      .popup-btn-bometier:hover { background: linear-gradient(135deg, #1e7e34 0%, #155724 100%); }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
      document.body.style.overflow = 'auto';
      if (style.parentNode) style.parentNode.removeChild(style);
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup();
    };

    overlay.querySelector('.popup-close')?.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    document.addEventListener('keydown', handleEscape);

    overlay.querySelector('.popup-btn-glpi')?.addEventListener('click', () => { cleanup(); onGlpi(); });
    overlay.querySelector('.popup-btn-bometier')?.addEventListener('click', () => { cleanup(); onBometier(); });
  }

  openGlpiTicket(ticketId: string): void {
    window.open(this.getGlpiTicketUrl(ticketId), '_blank', 'noopener,noreferrer');
  }

  openBometierTicket(ticketId: string): void {
    window.open(this.getBometierTicketUrl(ticketId), '_blank', 'noopener,noreferrer');
  }
} 