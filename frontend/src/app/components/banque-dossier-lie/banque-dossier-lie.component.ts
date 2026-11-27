import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { OperationBancaire } from '../../models/operation-bancaire.model';
import { ReleveBancaireRow } from '../../models/releve-bancaire.model';
import { BanqueDossierLieService } from '../../services/banque-dossier-lie.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';
import {
  DOSSIER_ROLES, DossierCandidat, DossierDetail, DossierLigneDetail, DossierResume, DossierRole,
  DossierSynthese, DossierTypeLigne, devinerRoles, dossierLigneKey, montantCandidat, syntheseDossier
} from '../../utils/banque-dossier-lie.util';

/** Ligne en cours d'édition dans le dossier. */
interface LigneEdition extends DossierCandidat {
  key: string;
  ligneId: number;
  role: DossierRole;
  montant: number;
  /** Dossier (autre que celui édité) auquel la ligne appartient déjà. */
  autreDossier?: DossierResume | null;
}

/** Section du détail : lignes d'un même rôle. */
interface SectionDetail {
  role: DossierRole;
  lignes: DossierLigneDetail[];
  total: number;
}

/**
 * Dossiers liés de la page Banque : création / modification (lignes et rôles), détail complet
 * (appro et contrepartie, frais, remboursement et contrepartie, frais du retour) et liste des dossiers.
 * Piloté par BanqueComponent via openEditor / openDetail / openList.
 */
@Component({
  selector: 'app-banque-dossier-lie',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './banque-dossier-lie.component.html',
  styleUrls: ['./banque-dossier-lie.component.scss']
})
export class BanqueDossierLieComponent implements OnInit {
  /** Opérations bancaires chargées sur la page (recherche de lignes à ajouter). */
  @Input() operations: OperationBancaire[] = [];
  /** Lignes de relevé chargées sur la page (recherche de lignes à ajouter). */
  @Input() releves: ReleveBancaireRow[] = [];
  /** Émis après création, modification ou suppression d'un dossier. */
  @Output() changed = new EventEmitter<void>();

  readonly roles = DOSSIER_ROLES;

  // ----- Édition -----
  showEditor = false;
  editId: number | null = null;
  libelle = '';
  commentaire = '';
  lignes: LigneEdition[] = [];
  recherche = '';
  dossierExistantId: number | null = null;
  saving = false;

  // ----- Détail -----
  showDetail = false;
  detailLoading = false;
  detail: DossierDetail | null = null;
  sections: SectionDetail[] = [];
  exporting = false;

  // ----- Liste -----
  showList = false;
  listFilter = '';

  constructor(public dossierService: BanqueDossierLieService, private popupService: PopupService) {}

  ngOnInit(): void {
    this.reload();
  }

  get dossiers(): DossierResume[] {
    return this.dossierService.dossiers$.value;
  }

  reload(): void {
    this.dossierService.refresh().subscribe({ error: err => console.warn('[DOSSIERS LIES] chargement impossible', err) });
  }

  // =================== Édition ===================

  /** Ouvre la création d'un dossier avec les lignes sélectionnées (rôles proposés automatiquement). */
  openEditor(candidats: DossierCandidat[]): void {
    const uniques = this.dedoublonner(candidats);
    const roles = devinerRoles(uniques);
    this.editId = null;
    this.dossierExistantId = null;
    this.commentaire = '';
    this.recherche = '';
    this.lignes = uniques.map((c, i) => this.toLigne(c, c.role || roles[i]));
    this.libelle = this.libelleSuggere();
    this.showEditor = true;
    this.showList = false;
  }

  /** Ouvre la modification d'un dossier existant (depuis son détail). */
  editDossier(detail: DossierDetail): void {
    const d = detail.dossier;
    this.editId = d.id;
    this.dossierExistantId = null;
    this.libelle = d.libelle;
    this.commentaire = d.commentaire || '';
    this.recherche = '';
    this.lignes = detail.lignes
      .filter(l => l.operation || l.releve)
      .map(l => this.toLigne({ typeLigne: l.typeLigne, op: l.operation, rev: l.releve }, l.role));
    this.showDetail = false;
    this.showEditor = true;
  }

  /** Rattache les lignes en cours à un dossier existant (ses lignes sont ajoutées à la liste). */
  async onDossierExistantChange(id: number | null): Promise<void> {
    this.dossierExistantId = id;
    if (id == null) { this.editId = null; this.refreshConflits(); return; }
    try {
      const detail = await firstValueFrom(this.dossierService.detail(id));
      this.editId = id;
      this.libelle = detail.dossier.libelle;
      this.commentaire = detail.dossier.commentaire || '';
      const deja = new Set(this.lignes.map(l => l.key));
      detail.lignes.filter(l => l.operation || l.releve).forEach(l => {
        const key = dossierLigneKey(l.typeLigne, l.ligneId);
        if (!deja.has(key)) this.lignes.push(this.toLigne({ typeLigne: l.typeLigne, op: l.operation, rev: l.releve }, l.role));
      });
      this.refreshConflits();
    } catch {
      this.popupService.showError(I18nService.t('BQDL.chargementImpossible'));
    }
  }

  closeEditor(): void {
    this.showEditor = false;
    this.lignes = [];
  }

  removeLigne(l: LigneEdition): void {
    this.lignes = this.lignes.filter(x => x.key !== l.key);
  }

  addCandidat(c: DossierCandidat): void {
    const role = devinerRoles([...this.lignes, c])[this.lignes.length];
    this.lignes = [...this.lignes, this.toLigne(c, role)];
    this.recherche = '';
  }

  /** Lignes de la page correspondant à la recherche (référence, libellé, bénéficiaire, montant…), hors lignes déjà ajoutées. */
  get resultatsRecherche(): DossierCandidat[] {
    const q = this.normaliser(this.recherche);
    if (q.length < 2) return [];
    const deja = new Set(this.lignes.map(l => l.key));
    const res: DossierCandidat[] = [];
    for (const op of this.operations || []) {
      if (op.id == null || (op as any).source === 'generale' || deja.has(dossierLigneKey('OPERATION', op.id))) continue;
      const txt = this.normaliser(`${op.reference || ''} ${op.typeOperation || ''} ${op.agence || ''} ${op.nomBeneficiaire || ''} ${op.bo || ''} ${op.idGlpi || ''} ${Math.abs(op.montant || 0)}`);
      if (txt.includes(q)) res.push({ typeLigne: 'OPERATION', op });
      if (res.length >= 15) break;
    }
    let nbRev = 0;
    for (const rev of this.releves || []) {
      if (rev.id == null || deja.has(dossierLigneKey('RELEVE', rev.id))) continue;
      const txt = this.normaliser(`${rev.libelle || ''} ${rev.numeroCompte || ''} ${rev.banque || ''} ${rev.debit || ''} ${rev.credit || ''} ${rev.montant || ''}`);
      if (txt.includes(q)) { res.push({ typeLigne: 'RELEVE', rev }); if (++nbRev >= 15) break; }
    }
    return res;
  }

  get syntheseEdition(): DossierSynthese {
    return syntheseDossier(this.lignes);
  }

  get nbConflits(): number {
    return this.lignes.filter(l => l.autreDossier).length;
  }

  async save(): Promise<void> {
    const libelle = this.libelle.trim();
    if (!libelle) { this.popupService.showWarning(I18nService.t('BQDL.libelleObligatoire')); return; }
    if (this.lignes.length < 2) { this.popupService.showWarning(I18nService.t('BQDL.deuxLignesMin')); return; }
    let deplacer = false;
    if (this.nbConflits > 0) {
      deplacer = await this.popupService.showConfirm(
        I18nService.t('BQDL.deplacerConfirm', { p0: this.nbConflits }), I18nService.t('BQDL.titreEdition'));
      if (!deplacer) return;
    }
    this.saving = true;
    try {
      await firstValueFrom(this.dossierService.save(this.editId, {
        libelle,
        commentaire: this.commentaire.trim() || null,
        lignes: this.lignes.map(l => ({ typeLigne: l.typeLigne, ligneId: l.ligneId, role: l.role })),
        deplacer
      }));
      await firstValueFrom(this.dossierService.refresh());
      this.popupService.showSuccess(I18nService.t('BQDL.enregistre', { p0: libelle, p1: this.lignes.length }));
      this.closeEditor();
      this.changed.emit();
    } catch (err: any) {
      this.popupService.showError(err?.error?.message || I18nService.t('BQDL.enregistrementImpossible'));
    } finally {
      this.saving = false;
    }
  }

  // =================== Détail ===================

  async openDetail(id: number): Promise<void> {
    this.showDetail = true;
    this.showList = false;
    this.detailLoading = true;
    this.detail = null;
    this.sections = [];
    try {
      const d = await firstValueFrom(this.dossierService.detail(id));
      this.detail = d;
      this.sections = DOSSIER_ROLES
        .map(role => ({ role, lignes: d.lignes.filter(l => l.role === role), total: d.totauxParRole?.[role] || 0 }))
        .filter(s => s.lignes.length);
    } catch {
      this.showDetail = false;
      this.popupService.showError(I18nService.t('BQDL.chargementImpossible'));
    } finally {
      this.detailLoading = false;
    }
  }

  closeDetail(): void {
    this.showDetail = false;
    this.detail = null;
  }

  /**
   * Export Excel du dossier affiché : feuille « Synthèse » (dossier, indicateurs, totaux par rôle)
   * et feuille « Lignes » (une ligne par opération / relevé, avec son rôle).
   */
  async exportDetail(): Promise<void> {
    const d = this.detail;
    if (!d || this.exporting) return;
    this.exporting = true;
    try {
      const ExcelJS: any = await import('exceljs');
      const wb = new (ExcelJS.Workbook || ExcelJS.default.Workbook)();
      const t = (k: string, p?: Record<string, unknown>) => I18nService.t(k, p);
      const titreFont = { bold: true, size: 14, color: { argb: 'FF1F2A44' } };
      const headFont = { bold: true, size: 10, color: { argb: 'FF3A4356' } };
      const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FB' } };
      const border = { bottom: { style: 'thin', color: { argb: 'FFE3E6EB' } } };
      const numFmt = '# ##0.##;-# ##0.##';
      const fmtDate = (v: any, heure = false): string => {
        if (!v) return '';
        const dt = v instanceof Date ? v : new Date(v);
        if (isNaN(dt.getTime())) return String(v);
        const p = (n: number) => String(n).padStart(2, '0');
        const jour = `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
        return heure ? `${jour} ${p(dt.getHours())}:${p(dt.getMinutes())}` : jour;
      };

      // ----- Feuille Synthèse -----
      const ws1 = wb.addWorksheet(t('BQDL.exportFeuilleSynthese'));
      ws1.getCell('A1').value = d.dossier.libelle;
      ws1.getCell('A1').font = titreFont;
      const s = d.synthese;
      const infos: Array<[string, string | number]> = [
        [t('BQDL.libelle'), d.dossier.libelle],
        [t('BQDL.commentaire'), d.dossier.commentaire || ''],
        [t('BQDL.exportCreePar'), d.dossier.createdBy || ''],
        [t('BQDL.creeLe'), fmtDate(d.dossier.createdAt, true)],
        [t('BQDL.exportModifiePar'), d.dossier.updatedBy || ''],
        [t('BQDL.exportModifieLe'), fmtDate(d.dossier.updatedAt, true)],
        ['', ''],
        [t('BQDL.roles.APPRO'), s.appro],
        [t('BQDL.roles.APPRO_CONTREPARTIE'), s.approContrepartie],
        [`${t('BQDL.ecart')} ${t('BQDL.roles.APPRO')}`, s.ecartAppro],
        [t('BQDL.roles.FRAIS_APPRO'), s.fraisAppro],
        [t('BQDL.roles.REMBOURSEMENT'), s.remboursement],
        [t('BQDL.roles.REMBOURSEMENT_CONTREPARTIE'), s.remboursementContrepartie],
        [`${t('BQDL.ecart')} ${t('BQDL.roles.REMBOURSEMENT')}`, s.ecartRemboursement],
        [t('BQDL.roles.FRAIS_REMBOURSEMENT'), s.fraisRemboursement],
        [`${t('BQDL.totalFrais')} (${t('BQDL.roles.FRAIS_REMBOURSEMENT')})`, s.totalFrais],
        [t('BQDL.exportFraisPrevus'), s.fraisAppro],
        [t('BQDL.exportEcartFrais'), s.ecartFrais],
        [t('BQDL.montantUtilise'), s.montantUtilise]
      ];
      infos.forEach(([label, val], i) => {
        const row = ws1.getRow(3 + i);
        row.getCell(1).value = label;
        row.getCell(1).font = headFont;
        row.getCell(2).value = val;
        if (typeof val === 'number') row.getCell(2).numFmt = numFmt;
      });
      let r = 3 + infos.length + 1;
      const totHead = ws1.getRow(r++);
      [t('BQDL.role'), t('BQDL.exportNbLignes'), t('TBL.amount')].forEach((h, i) => {
        const c = totHead.getCell(i + 1);
        c.value = h; c.font = headFont; c.fill = headFill; c.border = border;
      });
      this.sections.forEach(sec => {
        const row = ws1.getRow(r++);
        row.getCell(1).value = t('BQDL.roles.' + sec.role);
        row.getCell(2).value = sec.lignes.length;
        row.getCell(3).value = sec.total;
        row.getCell(3).numFmt = numFmt;
      });
      ws1.getColumn(1).width = 34;
      ws1.getColumn(2).width = 30;
      ws1.getColumn(3).width = 18;

      // ----- Feuille Lignes -----
      const ws2 = wb.addWorksheet(t('BQDL.exportFeuilleLignes'));
      const headers = [
        t('BQDL.role'), t('BQDL.type'), 'ID', t('TBL.date'), t('TBL.valueDate'), t('TBL.amount'), t('BQDL.exportSens'),
        t('BQDL.description'), t('TBL.agency'), t('BQDL.pays'), t('TBL.reference'), t('BQDL.beneficiaire'),
        t('BQDL.compte'), t('TBL.bank'), t('BQDL.devise'), t('BQDL.numeroCheque'), t('BQDL.modePaiement'),
        t('BQDL.idGlpi'), t('BQDL.statut'), t('BQDL.reconciliation'), t('BQDL.commentaire')
      ];
      const hRow = ws2.getRow(1);
      headers.forEach((h, i) => {
        const c = hRow.getCell(i + 1);
        c.value = h; c.font = headFont; c.fill = headFill; c.border = border;
      });
      let ri = 2;
      for (const sec of this.sections) {
        for (const l of sec.lignes) {
          const o = l.operation;
          const rv = l.releve;
          const type = t(l.typeLigne === 'OPERATION' ? 'BQDL.operation' : 'BQDL.releve');
          let vals: Array<string | number | null>;
          if (o) {
            vals = [
              t('BQDL.roles.' + sec.role), type, o.id ?? l.ligneId, fmtDate(o.dateOperation, true), '',
              l.montant ?? o.montant ?? null, '', o.typeOperation || '', o.agence || '', o.pays || '',
              o.reference || '', o.nomBeneficiaire || '', o.compteADebiter || '',
              [o.bo, o.banqueCorrigee].filter(Boolean).join(' → '), '', '', o.modePaiement || '',
              o.idGlpi || '', [o.statut, o.traitement].filter(Boolean).join(' · '), o.reconStatus || '', o.commentaire || ''
            ];
          } else if (rv) {
            vals = [
              t('BQDL.roles.' + sec.role), type, rv.id ?? l.ligneId, fmtDate(rv.dateComptable), fmtDate(rv.dateValeur),
              l.montant ?? null, t(this.sensReleve(rv) === 'debit' ? 'BQ.ReconResultDebit' : 'BQ.ReconResultCredit'),
              rv.libelle || '', '', rv.pays || '', '', '', [rv.numeroCompte, rv.nomCompte].filter(Boolean).join(' · '),
              rv.banque || '', rv.devise || '', rv.numeroCheque || '', '', '', '', rv.reconStatus || '', rv.commentaire || ''
            ];
          } else {
            vals = [t('BQDL.roles.' + sec.role), type, l.ligneId, '', '', l.montant ?? null, '',
              t('BQDL.exportLigneSupprimee'), '', '', '', '', '', '', '', '', '', '', '', '', ''];
          }
          const row = ws2.getRow(ri++);
          vals.forEach((v, i) => {
            const c = row.getCell(i + 1);
            c.value = v;
            c.border = border;
            if (i === 5 && typeof v === 'number') c.numFmt = numFmt;
          });
        }
      }
      [26, 12, 9, 17, 13, 15, 9, 40, 16, 8, 22, 26, 26, 18, 8, 13, 16, 12, 20, 14, 40]
        .forEach((w, i) => ws2.getColumn(i + 1).width = w);
      ws2.views = [{ state: 'frozen', ySplit: 1 }];
      ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const nom = (d.dossier.libelle || `dossier-${d.dossier.id}`).replace(/[\\/:*?"<>|]+/g, '_').trim();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nom}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('[DOSSIERS LIES] export impossible', err);
      this.popupService.showError(I18nService.t('BQDL.exportImpossible'));
    } finally {
      this.exporting = false;
    }
  }

  async deleteDossier(d: DossierResume): Promise<void> {
    const ok = await this.popupService.showConfirm(I18nService.t('BQDL.supprimerConfirm', { p0: d.libelle }), I18nService.t('BQDL.titreDetail'));
    if (!ok) return;
    try {
      await firstValueFrom(this.dossierService.delete(d.id));
      await firstValueFrom(this.dossierService.refresh());
      this.closeDetail();
      this.popupService.showSuccess(I18nService.t('BQDL.supprime'));
      this.changed.emit();
    } catch {
      this.popupService.showError(I18nService.t('BQDL.suppressionImpossible'));
    }
  }

  // =================== Liste ===================

  openList(): void {
    this.listFilter = '';
    this.showList = true;
    this.reload();
  }

  closeList(): void {
    this.showList = false;
  }

  get dossiersFiltres(): DossierResume[] {
    const q = this.normaliser(this.listFilter);
    return q ? this.dossiers.filter(d => this.normaliser(`${d.libelle} ${d.commentaire || ''} ${d.createdBy || ''}`).includes(q)) : this.dossiers;
  }

  compter(d: DossierResume, type: DossierTypeLigne): number {
    return (d.lignes || []).filter(l => l.typeLigne === type).length;
  }

  // =================== Utilitaires ===================

  trackByKey = (_: number, l: { key: string }) => l.key;

  candidatKey(c: DossierCandidat): string {
    return dossierLigneKey(c.typeLigne, c.typeLigne === 'OPERATION' ? c.op?.id : c.rev?.id);
  }

  candidatMontant(c: DossierCandidat): number {
    return montantCandidat(c);
  }

  candidatDate(c: DossierCandidat): any {
    return c.typeLigne === 'OPERATION' ? c.op?.dateOperation : (c.rev?.dateValeur || c.rev?.dateComptable);
  }

  candidatDescription(c: DossierCandidat): string {
    if (c.typeLigne === 'OPERATION') {
      const o = c.op;
      return [o?.typeOperation, o?.agence, o?.reference, o?.nomBeneficiaire].filter(Boolean).join(' · ');
    }
    const r = c.rev;
    return [r?.libelle, r?.numeroCompte, r?.banque].filter(Boolean).join(' · ');
  }

  sensReleve(r: ReleveBancaireRow | null | undefined): 'debit' | 'credit' {
    return (r?.debit || 0) > 0 ? 'debit' : 'credit';
  }

  private toLigne(c: DossierCandidat, role: DossierRole): LigneEdition {
    const ligneId = (c.typeLigne === 'OPERATION' ? c.op?.id : c.rev?.id) as number;
    const key = dossierLigneKey(c.typeLigne, ligneId);
    return { ...c, key, ligneId, role, montant: montantCandidat(c), autreDossier: this.autreDossier(c.typeLigne, ligneId) };
  }

  private autreDossier(type: DossierTypeLigne, id: number): DossierResume | null {
    const d = this.dossierService.dossierOf(type, id);
    return d && d.id !== this.editId ? d : null;
  }

  private refreshConflits(): void {
    this.lignes.forEach(l => (l.autreDossier = this.autreDossier(l.typeLigne, l.ligneId)));
  }

  private dedoublonner(candidats: DossierCandidat[]): DossierCandidat[] {
    const vus = new Set<string>();
    return (candidats || []).filter(c => {
      const id = c.typeLigne === 'OPERATION' ? c.op?.id : c.rev?.id;
      if (id == null) return false;
      const k = dossierLigneKey(c.typeLigne, id);
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  }

  /** « Préfinancement <référence ou bénéficiaire> » à partir de l'appro, sinon de la première opération. */
  private libelleSuggere(): string {
    const appro = this.lignes.find(l => l.role === 'APPRO' && l.op) || this.lignes.find(l => l.op);
    if (!appro?.op) return '';
    const o = appro.op;
    const ref = o.reference || o.nomBeneficiaire || o.agence || '';
    const prefixe = appro.role === 'APPRO' ? I18nService.t('BQDL.libellePrefinancement') : (o.typeOperation || '');
    return `${prefixe} ${ref}`.trim();
  }

  private normaliser(s: string | null | undefined): string {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
}
