import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { I18nService } from './i18n/i18n.service';
import { NiveauxValidationConfigService } from './niveaux-validation-config.service';
import { PopupService } from './popup.service';

/** Contexte de l'e-mail : écarts de réconciliation (transactions) ou opération bancaire en suspens. */
export type TicketEmailContext = 'transaction' | 'banque';

export interface TicketEmailProposal {
  context: TicketEmailContext;
  /** Code ou libellé pays : choisit les destinataires configurés (Niveaux de validation). */
  pays?: string;
  subject: string;
  body: string;
}

const ENDPOINTS: Record<TicketEmailContext, string> = {
  transaction: '/api/reconciliation-report/send-ticket-email',
  banque: '/api/operations-bancaires/send-ticket-email'
};

/**
 * Après la saisie (validation) d'un ID ticket : propose un e-mail pré-rempli
 * (destinataires + copie de la configuration des niveaux de validation du pays,
 * à défaut les dernières adresses utilisées) que l'utilisateur relit avant l'envoi.
 */
@Injectable({ providedIn: 'root' })
export class TicketEmailService {
  private configLoaded = false;

  constructor(
    private http: HttpClient,
    private popupService: PopupService,
    private niveauxConfig: NiveauxValidationConfigService
  ) {}

  async propose(proposal: TicketEmailProposal): Promise<boolean> {
    const defaults = await this.defaultRecipients(proposal.context, proposal.pays);
    const saisie = await this.popupService.showEmailCompose({
      title: I18nService.t(proposal.context === 'banque' ? 'MAIL.titleBanque' : 'MAIL.titleTransaction'),
      intro: I18nService.t('MAIL.intro'),
      to: defaults.to,
      cc: defaults.cc,
      subject: proposal.subject,
      body: proposal.body
    });
    if (!saisie) {
      return false;
    }
    this.rememberRecipients(proposal.context, saisie.to, saisie.cc);
    try {
      const res = await firstValueFrom(this.http.post<{ envoyes?: number }>(
        ENDPOINTS[proposal.context],
        { destinataires: saisie.to, copie: saisie.cc, objet: saisie.subject, message: saisie.body }
      ));
      await this.popupService.showSuccess(
        I18nService.t('MAIL.sent', { p0: res?.envoyes ?? saisie.to.length + saisie.cc.length }),
        I18nService.t('MAIL.sentTitle')
      );
      return true;
    } catch (e) {
      console.error('Erreur envoi e-mail ticket', e);
      this.popupService.showError(I18nService.t('MAIL.sendFailed'), I18nService.t('MAIL.sentTitle'));
      return false;
    }
  }

  private async defaultRecipients(context: TicketEmailContext, pays?: string): Promise<{ to: string[]; cc: string[] }> {
    if (!this.configLoaded) {
      try { await firstValueFrom(this.niveauxConfig.loadFromApi()); } catch { /* configuration locale */ }
      this.configLoaded = true;
    }
    const to: string[] = [];
    const cc: string[] = [];
    try {
      const config = this.niveauxConfig.getConfigForPaysSync((pays || '').trim() || 'GNL');
      to.push(...(config.destinatairesEmail || []));
      cc.push(...(config.copieEmail || []));
      (config.niveauxTraitement || []).filter(n => n.actif !== false).forEach(n => {
        to.push(...(n.destinatairesEmail || []));
        cc.push(...(n.copieEmail || []));
      });
    } catch { /* pas de configuration */ }
    let dedupTo = this.dedup(to);
    let dedupCc = this.dedup(cc).filter(m => !dedupTo.some(t => t.toLowerCase() === m.toLowerCase()));
    if (!dedupTo.length) {
      const last = this.lastRecipients(context);
      dedupTo = last.to;
      if (!dedupCc.length) dedupCc = last.cc;
    }
    return { to: dedupTo, cc: dedupCc };
  }

  private dedup(list: string[]): string[] {
    const seen = new Set<string>();
    return list.map(m => (m || '').trim()).filter(m => {
      const k = m.toLowerCase();
      if (!m.includes('@') || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private storageKey(context: TicketEmailContext): string {
    return `ticket_email_recipients_${context}`;
  }

  private lastRecipients(context: TicketEmailContext): { to: string[]; cc: string[] } {
    try {
      const raw = localStorage.getItem(this.storageKey(context));
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        to: Array.isArray(parsed?.to) ? parsed.to.filter((m: unknown) => typeof m === 'string') : [],
        cc: Array.isArray(parsed?.cc) ? parsed.cc.filter((m: unknown) => typeof m === 'string') : []
      };
    } catch {
      return { to: [], cc: [] };
    }
  }

  private rememberRecipients(context: TicketEmailContext, to: string[], cc: string[]): void {
    try {
      localStorage.setItem(this.storageKey(context), JSON.stringify({ to, cc }));
    } catch { /* stockage indisponible */ }
  }
}
