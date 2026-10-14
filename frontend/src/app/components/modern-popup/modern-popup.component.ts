import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { I18nService } from '../../services/i18n/i18n.service';

export interface PopupConfig {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  showCancelButton?: boolean;
  cancelText?: string;
  confirmText?: string;
  linesSaved?: number;
}

@Component({
  selector: 'app-modern-popup',
  templateUrl: './modern-popup.component.html',
  styleUrls: ['./modern-popup.component.scss']
})
export class ModernPopupComponent implements OnInit, OnDestroy {
  @Input() config: PopupConfig;
  @Input() isVisible: boolean = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  constructor() { }

  ngOnInit(): void {
    // Empêcher le scroll du body quand le popup est ouvert
    if (this.isVisible) {
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy(): void {
    // Restaurer le scroll du body
    document.body.style.overflow = 'auto';
  }

  private static escapeHtml(text: string | undefined | null): string {
    if (text == null || text === '') {
      return '';
    }
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  onConfirm(): void {
    this.confirm.emit();
    this.closePopup();
  }

  onCancel(): void {
    this.cancel.emit();
    this.closePopup();
  }

  onClose(): void {
    this.close.emit();
    this.closePopup();
  }

  /** Laisse le navigateur fermer le popup avant de reprendre le traitement lourd. */
  private static scheduleAfterPopupClose<T>(value: T, resolve: (v: T) => void): void {
    requestAnimationFrame(() => setTimeout(() => resolve(value), 0));
  }

  private closePopup(): void {
    this.isVisible = false;
    document.body.style.overflow = 'auto';
  }

  // Méthode statique pour afficher un popup d'information
  static showInfo(message: string, title: string = I18nService.t('POPUP.info')): Promise<void> {
    return this.showPopup({
      title,
      message,
      type: 'info'
    });
  }

  // Méthode statique pour afficher un popup de succès
  static showSuccess(message: string, title: string = I18nService.t('POPUP.success')): Promise<void> {
    return this.showPopup({
      title,
      message,
      type: 'success'
    });
  }

  // Méthode statique pour afficher un popup d'avertissement
  static showWarning(message: string, title: string = I18nService.t('POPUP.warning')): Promise<void> {
    return this.showPopup({
      title,
      message,
      type: 'warning'
    });
  }

  // Méthode statique pour afficher un popup d'erreur
  static showError(message: string, title: string = I18nService.t('POPUP.error')): Promise<void> {
    return this.showPopup({
      title,
      message,
      type: 'error'
    });
  }

  // Méthode statique pour afficher un popup de confirmation
  static showConfirm(message: string, title: string = I18nService.t('POPUP.confirm')): Promise<boolean> {
    return this.showPopup({
      title,
      message,
      type: 'confirm',
      showCancelButton: true,
      cancelText: I18nService.t('COMMON.actions.cancel'),
      confirmText: I18nService.t('COMMON.actions.confirm')
    });
  }

  // Méthode statique pour afficher un popup de sauvegarde
  static showSaveSuccess(linesSaved: number = 1): Promise<void> {
    return this.showPopup({
      title: I18nService.t('POPUP.saved'),
      message: I18nService.t('POPUP.savedMessage'),
      type: 'success',
      linesSaved
    });
  }

  public static showPopup(config: PopupConfig): Promise<any> {
    return new Promise((resolve) => {
      const title = ModernPopupComponent.escapeHtml(config.title || I18nService.t('POPUP.notification'));
      const message = ModernPopupComponent.escapeHtml(config.message);
      const cancelLabel = ModernPopupComponent.escapeHtml(config.cancelText || I18nService.t('COMMON.actions.cancel'));
      const confirmLabel = ModernPopupComponent.escapeHtml(config.confirmText || I18nService.t('COMMON.actions.ok'));

      // Créer un élément popup dynamiquement
      const popupElement = document.createElement('div');
      popupElement.className = 'modern-popup-overlay';
      popupElement.innerHTML = `
        <div class="modern-popup">
          <div class="popup-accent"></div>
          <div class="popup-header">
            <h3 class="popup-title">${title}</h3>
            <button type="button" class="popup-close" aria-label="${I18nService.t('COMMON.actions.close')}">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${message}</p>
            ${config.linesSaved ? `<p class="popup-lines-saved">${I18nService.t('POPUP.savedLines', { count: config.linesSaved })}</p>` : ''}
          </div>
          <div class="popup-actions">
            ${config.showCancelButton ? `<button type="button" class="popup-btn popup-btn-cancel">${cancelLabel}</button>` : ''}
            <button type="button" class="popup-btn popup-btn-primary popup-btn-${config.type || 'info'}">${confirmLabel}</button>
          </div>
        </div>
      `;

      // Styles alignés ReconciliApp / référentiel services (Sora, navy, tons chauds)
      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(26, 37, 53, 0.42);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          animation: mp-fadeIn 0.25s ease-out;
          font-family: 'Sora', 'Segoe UI', system-ui, sans-serif;
        }

        .modern-popup {
          background: #FAFAF8;
          border-radius: 18px;
          border: 1px solid #E4E0D8;
          box-shadow: 0 8px 40px rgba(26, 23, 20, 0.14), 0 2px 16px rgba(26, 23, 20, 0.08);
          max-width: 440px;
          width: 92%;
          animation: mp-slideIn 0.28s cubic-bezier(0.22, 1, 0.36, 1);
          overflow: hidden;
        }

        .popup-accent {
          height: 3px;
          background: linear-gradient(90deg, #1A2535 0%, #2E6B47 55%, #5A9E74 100%);
        }

        .popup-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 18px 22px 0 22px;
        }

        .popup-title {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 600;
          color: #1A2535;
          letter-spacing: -0.02em;
          line-height: 1.35;
        }

        .popup-close {
          flex-shrink: 0;
          background: rgba(26, 23, 20, 0.06);
          border: none;
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
          color: #5C5650;
          padding: 0;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          transition: background 0.2s, color 0.2s;
        }

        .popup-close:hover {
          background: rgba(139, 38, 53, 0.1);
          color: #8B2635;
        }

        .popup-content {
          padding: 14px 22px 8px 22px;
        }

        .popup-message {
          margin: 0;
          color: #5C5650;
          line-height: 1.55;
          font-size: 0.95rem;
        }

        .popup-lines-saved {
          margin: 12px 0 0 0;
          color: #9B9489;
          font-size: 0.875rem;
        }

        .popup-actions {
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 10px;
          padding: 16px 22px 22px 22px;
        }

        .popup-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 11px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
          transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
          min-width: 88px;
          font-family: inherit;
        }

        .popup-btn:active {
          transform: scale(0.98);
        }

        .popup-btn-cancel {
          background: #F2F0EB;
          color: #5C5650;
          border: 1px solid #E4E0D8;
        }

        .popup-btn-cancel:hover {
          background: #E4E0D8;
          color: #1A1714;
        }

        .popup-btn-primary {
          color: #fff;
          box-shadow: 0 2px 8px rgba(26, 37, 53, 0.2);
        }

        .popup-btn-primary.popup-btn-info {
          background: linear-gradient(180deg, #243044 0%, #1A2535 100%);
        }

        .popup-btn-primary.popup-btn-info:hover {
          box-shadow: 0 4px 14px rgba(26, 37, 53, 0.28);
        }

        .popup-btn-primary.popup-btn-success {
          background: linear-gradient(180deg, #5A9E74 0%, #2E6B47 100%);
        }

        .popup-btn-primary.popup-btn-success:hover {
          box-shadow: 0 4px 14px rgba(46, 107, 71, 0.35);
        }

        .popup-btn-primary.popup-btn-warning {
          background: linear-gradient(180deg, #D4915A 0%, #A85F1E 100%);
          color: #fff;
        }

        .popup-btn-primary.popup-btn-warning:hover {
          box-shadow: 0 4px 14px rgba(168, 95, 30, 0.35);
        }

        .popup-btn-primary.popup-btn-error {
          background: linear-gradient(180deg, #C4566A 0%, #8B2635 100%);
        }

        .popup-btn-primary.popup-btn-error:hover {
          box-shadow: 0 4px 14px rgba(139, 38, 53, 0.35);
        }

        .popup-btn-primary.popup-btn-confirm {
          background: linear-gradient(180deg, #243044 0%, #1A2535 100%);
        }

        .popup-btn-primary.popup-btn-confirm:hover {
          box-shadow: 0 4px 14px rgba(26, 37, 53, 0.28);
        }

        @keyframes mp-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes mp-slideIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(popupElement);

      // Empêcher le scroll du body
      document.body.style.overflow = 'hidden';

      // Nettoyer les styles après fermeture
      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      };

      // Ajouter les event listeners pour la fermeture
      popupElement.addEventListener('click', (e) => {
        if (e.target === popupElement) {
          popupElement.remove();
          cleanup();
          resolve(false);
        }
      });

      // Ajouter les event listeners pour les boutons
      const closeButton = popupElement.querySelector('.popup-close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          popupElement.remove();
          cleanup();
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        });
      }

      const cancelButton = popupElement.querySelector('.popup-btn-cancel');
      if (cancelButton) {
        cancelButton.addEventListener('click', () => {
          popupElement.remove();
          cleanup();
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        });
      }

      const confirmButton = popupElement.querySelector('.popup-btn-primary');
      if (confirmButton) {
        confirmButton.addEventListener('click', () => {
          popupElement.remove();
          cleanup();
          document.removeEventListener('keydown', handleEscape);
          ModernPopupComponent.scheduleAfterPopupClose(true, resolve);
        });
      }

      // Gérer la fermeture avec Escape
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          popupElement.remove();
          cleanup();
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }

  // Popup avec champ texte (input)
  static showTextInput(message: string, title: string = 'Saisie', defaultValue: string = '', placeholder: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      overlay.innerHTML = `
        <div class="modern-popup">
          <div class="popup-header">
            <h3 class="popup-title">${title}</h3>
            <button class="popup-close">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${message}</p>
            <input type="text" class="popup-input" placeholder="${placeholder || ''}" value="${defaultValue || ''}" />
          </div>
          <div class="popup-actions">
            <button class="popup-btn popup-btn-cancel">Annuler</button>
            <button class="popup-btn popup-btn-confirm popup-btn-info">Valider</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999; animation: fadeIn .3s ease-out;
        }
        .modern-popup { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 420px; width: 92%; animation: slideIn .3s ease-out; }
        .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 0 20px; }
        .popup-title { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
        .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all .2s; }
        .popup-close:hover { background: #f5f5f5; color: #666; }
        .popup-content { padding: 20px; }
        .popup-message { margin: 0 0 10px 0; color: #555; line-height: 1.5; }
        .popup-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 20px 20px; }
        .popup-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all .2s; min-width: 80px; }
        .popup-btn-cancel { background: #f5f5f5; color: #666; }
        .popup-btn-cancel:hover { background: #e5e5e5; }
        .popup-btn-info { background: #007bff; color: #fff; }
        .popup-btn-info:hover { background: #0056b3; }
        .popup-input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .popup-input:focus { outline: none; border-color: var(--theme-info, #3498db); box-shadow: 0 0 0 2px rgba(var(--theme-info-rgb),.2); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) style.parentNode.removeChild(style);
      };

      const close = (result: string | null) => {
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        resolve(result);
      };

      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onEsc);

      const input = overlay.querySelector('.popup-input') as HTMLInputElement | null;
      const okBtn = overlay.querySelector('.popup-btn-confirm');
      const cancelBtn = overlay.querySelector('.popup-btn-cancel');
      const closeBtn = overlay.querySelector('.popup-close');

      if (input) setTimeout(() => input.focus(), 0);
      if (okBtn) okBtn.addEventListener('click', () => close(input ? input.value : ''));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (closeBtn) closeBtn.addEventListener('click', () => close(null));
      if (input) input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') close(input!.value); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  static showDateInput(message: string, title: string = I18nService.t('POPUP.date'), defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const effectiveDefault = (() => {
        const candidate = (defaultValue || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
          return candidate;
        }
        const parsed = new Date(candidate);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0];
      })();

      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      overlay.innerHTML = `
        <div class="modern-popup">
          <div class="popup-header">
            <h3 class="popup-title">${title}</h3>
            <button class="popup-close">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${message}</p>
            <input type="date" class="popup-input" value="${effectiveDefault}" />
          </div>
          <div class="popup-actions">
            <button class="popup-btn popup-btn-cancel">Annuler</button>
            <button class="popup-btn popup-btn-confirm popup-btn-info">Valider</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999; animation: fadeIn .3s ease-out;
        }
        .modern-popup { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 420px; width: 92%; animation: slideIn .3s ease-out; }
        .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 0 20px; }
        .popup-title { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
        .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all .2s; }
        .popup-close:hover { background: #f5f5f5; color: #666; }
        .popup-content { padding: 20px; }
        .popup-message { margin: 0 0 10px 0; color: #555; line-height: 1.5; }
        .popup-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 20px 20px; }
        .popup-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all .2s; min-width: 80px; }
        .popup-btn-cancel { background: #f5f5f5; color: #666; }
        .popup-btn-cancel:hover { background: #e5e5e5; }
        .popup-btn-info { background: #007bff; color: #fff; }
        .popup-btn-info:hover { background: #0056b3; }
        .popup-input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .popup-input:focus { outline: none; border-color: var(--theme-info, #3498db); box-shadow: 0 0 0 2px rgba(var(--theme-info-rgb),.2); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) style.parentNode.removeChild(style);
      };

      const close = (result: string | null) => {
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        resolve(result);
      };

      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onEsc);

      const input = overlay.querySelector('.popup-input') as HTMLInputElement | null;
      const okBtn = overlay.querySelector('.popup-btn-confirm');
      const cancelBtn = overlay.querySelector('.popup-btn-cancel');
      const closeBtn = overlay.querySelector('.popup-close');

      if (input) setTimeout(() => input.focus(), 0);
      if (okBtn) okBtn.addEventListener('click', () => close(input ? (input.value || '').trim() || effectiveDefault : effectiveDefault));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (closeBtn) closeBtn.addEventListener('click', () => close(null));
      if (input) input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') close((input.value || '').trim() || effectiveDefault); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  // Popup avec sélection (select)
  static showSelectInput(message: string, title: string = I18nService.t('POPUP.select'), options: string[] = [], defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      
      const optionsHtml = options.map(option => 
        `<option value="${option}" ${option === defaultValue ? 'selected' : ''}>${option}</option>`
      ).join('');
      
      overlay.innerHTML = `
        <div class="modern-popup">
          <div class="popup-header">
            <h3 class="popup-title">${title}</h3>
            <button class="popup-close">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${message}</p>
            <select class="popup-select">
              ${optionsHtml}
            </select>
          </div>
          <div class="popup-actions">
            <button class="popup-btn popup-btn-cancel">Annuler</button>
            <button class="popup-btn popup-btn-confirm popup-btn-info">Valider</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999; animation: fadeIn .3s ease-out;
        }
        .modern-popup { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 420px; width: 92%; animation: slideIn .3s ease-out; }
        .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 0 20px; }
        .popup-title { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
        .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all .2s; }
        .popup-close:hover { background: #f5f5f5; color: #666; }
        .popup-content { padding: 20px; }
        .popup-message { margin: 0 0 10px 0; color: #555; line-height: 1.5; }
        .popup-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 20px 20px; }
        .popup-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all .2s; min-width: 80px; }
        .popup-btn-cancel { background: #f5f5f5; color: #666; }
        .popup-btn-cancel:hover { background: #e5e5e5; }
        .popup-btn-info { background: #007bff; color: #fff; }
        .popup-btn-info:hover { background: #0056b3; }
        .popup-select { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; background: white; }
        .popup-select:focus { outline: none; border-color: var(--theme-info, #3498db); box-shadow: 0 0 0 2px rgba(var(--theme-info-rgb),.2); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) style.parentNode.removeChild(style);
      };

      const close = (result: string | null) => {
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        resolve(result);
      };

      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onEsc);

      const select = overlay.querySelector('.popup-select') as HTMLSelectElement | null;
      const okBtn = overlay.querySelector('.popup-btn-confirm');
      const cancelBtn = overlay.querySelector('.popup-btn-cancel');
      const closeBtn = overlay.querySelector('.popup-close');

      if (okBtn) okBtn.addEventListener('click', () => {
        const value = select ? select.value : '';
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        ModernPopupComponent.scheduleAfterPopupClose(value, resolve);
      });
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (closeBtn) closeBtn.addEventListener('click', () => close(null));
      if (select) select.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') close(select!.value); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  // Popup avec autocomplétion (input avec suggestions)
  static showAutocompleteInput(message: string, title: string = I18nService.t('POPUP.select'), options: string[] = [], defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      
      overlay.innerHTML = `
        <div class="modern-popup autocomplete-popup">
          <div class="popup-header">
            <h3 class="popup-title">${title}</h3>
            <button class="popup-close">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${message}</p>
            <div class="autocomplete-wrapper">
              <input type="text" class="popup-input autocomplete-input" placeholder="Tapez pour rechercher..." value="${defaultValue || ''}" autocomplete="off" />
              <ul class="autocomplete-list"></ul>
            </div>
          </div>
          <div class="popup-actions">
            <button class="popup-btn popup-btn-cancel">Annuler</button>
            <button class="popup-btn popup-btn-confirm popup-btn-info">Valider</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999; animation: fadeIn .3s ease-out;
        }
        .modern-popup { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 420px; width: 92%; animation: slideIn .3s ease-out; }
        .autocomplete-popup { overflow: visible; }
        .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 0 20px; }
        .popup-title { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
        .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all .2s; }
        .popup-close:hover { background: #f5f5f5; color: #666; }
        .popup-content { padding: 20px; overflow: visible; }
        .popup-message { margin: 0 0 10px 0; color: #555; line-height: 1.5; }
        .popup-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 20px 20px; }
        .popup-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all .2s; min-width: 80px; }
        .popup-btn-cancel { background: #f5f5f5; color: #666; }
        .popup-btn-cancel:hover { background: #e5e5e5; }
        .popup-btn-info { background: #007bff; color: #fff; }
        .popup-btn-info:hover { background: #0056b3; }
        .autocomplete-wrapper { position: relative; }
        .autocomplete-input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .autocomplete-input:focus { outline: none; border-color: var(--theme-info, #3498db); box-shadow: 0 0 0 2px rgba(var(--theme-info-rgb),.2); }
        .autocomplete-list { position: relative; margin: 6px 0 0 0; background: white; border: 1px solid #ddd; border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 2; padding: 0; list-style: none; box-shadow: 0 4px 6px rgba(0,0,0,.1); }
        .autocomplete-list li { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; }
        .autocomplete-list li:hover { background: #f5f5f5; }
        .autocomplete-list li.selected { background: #e3f2fd; }
        .autocomplete-list li:last-child { border-bottom: none; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) style.parentNode.removeChild(style);
      };

      const close = (result: string | null) => {
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        resolve(result);
      };

      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onEsc);

      const input = overlay.querySelector('.autocomplete-input') as HTMLInputElement | null;
      const list = overlay.querySelector('.autocomplete-list') as HTMLUListElement | null;
      const okBtn = overlay.querySelector('.popup-btn-confirm');
      const cancelBtn = overlay.querySelector('.popup-btn-cancel');
      const closeBtn = overlay.querySelector('.popup-close');
      
      let selectedIndex = -1;
      let filteredOptions: string[] = [...options];

      const updateList = () => {
        if (!list || !input) return;
        const searchTerm = (input.value || '').toLowerCase().trim();
        filteredOptions = options.filter(opt => 
          opt.toLowerCase().includes(searchTerm)
        );
        
        list.innerHTML = '';
        if (filteredOptions.length === 0 && searchTerm) {
          list.innerHTML = '<li style="color: #999; cursor: default;">Aucun résultat</li>';
        } else {
          filteredOptions.forEach((option, index) => {
            const li = document.createElement('li');
            li.textContent = option;
            li.addEventListener('click', () => {
              input.value = option;
              list.innerHTML = '';
              input.focus();
            });
            list.appendChild(li);
          });
        }
        selectedIndex = -1;
      };

      const selectItem = (index: number) => {
        if (index >= 0 && index < filteredOptions.length) {
          if (input) {
            input.value = filteredOptions[index];
            list.innerHTML = '';
            input.focus();
          }
        }
      };

      if (input) {
        input.addEventListener('input', updateList);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (input.value.trim()) {
              close(input.value.trim());
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
            const items = list?.querySelectorAll('li');
            items?.forEach((li, idx) => {
              li.classList.toggle('selected', idx === selectedIndex);
            });
            if (selectedIndex >= 0 && filteredOptions[selectedIndex]) {
              input.value = filteredOptions[selectedIndex];
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            const items = list?.querySelectorAll('li');
            items?.forEach((li, idx) => {
              li.classList.toggle('selected', idx === selectedIndex);
            });
            if (selectedIndex >= 0 && filteredOptions[selectedIndex]) {
              input.value = filteredOptions[selectedIndex];
            } else if (selectedIndex < 0) {
              input.value = '';
            }
          }
        });
        input.addEventListener('focus', updateList);
        setTimeout(() => input.focus(), 0);
      }

      if (okBtn) okBtn.addEventListener('click', () => {
        const value = input ? input.value.trim() : '';
        if (value) close(value);
      });
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (closeBtn) closeBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { 
        if (e.target === overlay) close(null);
      });
      
      // Fermer la liste si on clique ailleurs
      document.addEventListener('click', (e) => {
        if (!overlay.contains(e.target as Node) && list) {
          list.innerHTML = '';
        }
      }, true);
    });
  }

  /**
   * Popup de choix multiple (checkboxes) avec validation.
   * Retourne un objet { key: boolean } pour chaque option, ou null si annulé.
   */
  static showChoicePopup(config: {
    title: string;
    message: string;
    options: { key: string; label: string; checked?: boolean; hint?: string }[];
    confirmLabel?: string;
    cancelLabel?: string;
    requireSelection?: boolean;
  }): Promise<Record<string, boolean> | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';

      const optionsHtml = config.options.map((option, index) => `
        <label class="choice-option" data-key="${option.key}">
          <input type="checkbox" class="choice-checkbox" ${option.checked ? 'checked' : ''} data-index="${index}" />
          <span class="choice-label">
            <strong>${option.label}</strong>
            ${option.hint ? `<em>${option.hint}</em>` : ''}
          </span>
        </label>
      `).join('');

      overlay.innerHTML = `
        <div class="modern-popup choice-popup">
          <div class="popup-header">
            <h3 class="popup-title">${config.title}</h3>
            <button class="popup-close">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${config.message}</p>
            <div class="choice-list">${optionsHtml}</div>
            <p class="choice-error" style="display:none; color:#e74c3c; font-size:13px; margin:10px 0 0 0;">Veuillez sélectionner au moins une option.</p>
          </div>
          <div class="popup-actions">
            <button class="popup-btn popup-btn-cancel">${config.cancelLabel || 'Annuler'}</button>
            <button class="popup-btn popup-btn-confirm popup-btn-info">${config.confirmLabel || 'Valider'}</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999; animation: fadeIn .3s ease-out;
        }
        .modern-popup { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 440px; width: 92%; animation: slideIn .3s ease-out; }
        .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 0 20px; }
        .popup-title { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
        .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all .2s; }
        .popup-close:hover { background: #f5f5f5; color: #666; }
        .popup-content { padding: 20px; }
        .popup-message { margin: 0 0 14px 0; color: #555; line-height: 1.5; }
        .popup-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 20px 20px; }
        .popup-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all .2s; min-width: 80px; }
        .popup-btn-cancel { background: #f5f5f5; color: #666; }
        .popup-btn-cancel:hover { background: #e5e5e5; }
        .popup-btn-info { background: #007bff; color: #fff; }
        .popup-btn-info:hover { background: #0056b3; }
        .choice-list { display: flex; flex-direction: column; gap: 10px; }
        .choice-option { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all .2s; }
        .choice-option:hover { border-color: var(--theme-info, #3498db); background: #f8fbff; }
        .choice-option.has-check { border-color: var(--theme-info, #3498db); background: #eef6ff; }
        .choice-checkbox { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--theme-info, #3498db); cursor: pointer; }
        .choice-label { display: flex; flex-direction: column; gap: 2px; }
        .choice-label strong { font-size: 14px; color: #333; }
        .choice-label em { font-size: 12px; color: #888; font-style: normal; }
        .choice-error { color: #e74c3c; font-size: 13px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) style.parentNode.removeChild(style);
      };

      const collectResult = (): Record<string, boolean> | null => {
        const result: Record<string, boolean> = {};
        overlay.querySelectorAll('.choice-option').forEach((el) => {
          const key = (el as HTMLElement).dataset['key'] || '';
          const checkbox = el.querySelector('.choice-checkbox') as HTMLInputElement | null;
          result[key] = checkbox ? checkbox.checked : false;
        });
        return result;
      };

      const close = (result: Record<string, boolean> | null) => {
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        resolve(result);
      };

      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onEsc);

      const checkboxes = Array.from(overlay.querySelectorAll('.choice-checkbox'));
      checkboxes.forEach((cb) => {
        cb.addEventListener('change', () => {
          const option = (cb as HTMLInputElement).closest('.choice-option');
          if (option) option.classList.toggle('has-check', (cb as HTMLInputElement).checked);
          const err = overlay.querySelector('.choice-error') as HTMLElement | null;
          if (err) err.style.display = 'none';
        });
      });

      const okBtn = overlay.querySelector('.popup-btn-confirm');
      const cancelBtn = overlay.querySelector('.popup-btn-cancel');
      const closeBtn = overlay.querySelector('.popup-close');

      const validate = () => {
        const result = collectResult();
        const anySelected = Object.values(result || {}).some(Boolean);
        if (config.requireSelection && !anySelected) {
          const err = overlay.querySelector('.choice-error') as HTMLElement | null;
          if (err) err.style.display = 'block';
          return;
        }
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        ModernPopupComponent.scheduleAfterPopupClose(result, resolve);
      };

      if (okBtn) okBtn.addEventListener('click', validate);
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (closeBtn) closeBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  /**
   * Popup de sélection de lignes : affiche une liste (cases à cocher) + choix de destinations,
   * avec filtre et « tout sélectionner ». Valide et retourne les lignes sélectionnées.
   */
  static showSelectableListPopup(config: {
    title: string;
    message: string;
    columns: string[];
    rows: { key: string; cells: string[]; date?: string }[];
    options: { key: string; label: string; checked?: boolean; hint?: string }[];
    confirmLabel?: string;
    cancelLabel?: string;
    requireSelection?: boolean;
    /** Bornes de date proposées à l'ouverture, au format yyyy-MM-dd. */
    dateFilter?: { from?: string | null; to?: string | null };
  }): Promise<{ options: Record<string, boolean>; selectedKeys: string[]; dateFilter: { from: string; to: string } } | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';

      const optionsHtml = config.options.map((option) => `
        <label class="choice-option" data-key="${option.key}">
          <input type="checkbox" class="choice-checkbox" ${option.checked ? 'checked' : ''} />
          <span class="choice-label">
            <strong>${option.label}</strong>
            ${option.hint ? `<em>${option.hint}</em>` : ''}
          </span>
        </label>
      `).join('');

      const escapeHtml = (value: string): string => String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      const theadHtml = config.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
      const tbodyHtml = config.rows.map((row, index) => `
        <tr data-key="${escapeHtml(row.key)}" data-date="${escapeHtml(row.date || '')}">
          <td class="row-check"><input type="checkbox" class="row-checkbox" checked /></td>
          ${row.cells.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}
        </tr>
      `).join('');

      const dateFilterHtml = config.dateFilter === undefined ? '' : `
        <div class="list-dates">
          <span class="list-dates-label">${I18nService.t('POPUP.dateRange')}</span>
          <label class="list-date">${I18nService.t('POPUP.dateFrom')} <input type="date" class="list-date-from" value="${escapeHtml(config.dateFilter.from || '')}" /></label>
          <label class="list-date">${I18nService.t('POPUP.dateTo')} <input type="date" class="list-date-to" value="${escapeHtml(config.dateFilter.to || '')}" /></label>
        </div>
      `;

      overlay.innerHTML = `
        <div class="modern-popup list-popup">
          <div class="popup-header">
            <h3 class="popup-title">${config.title}</h3>
            <button class="popup-close">×</button>
          </div>
          <div class="popup-content">
            <p class="popup-message">${config.message}</p>
            <div class="list-options">${optionsHtml}</div>
            ${dateFilterHtml}
            <div class="list-toolbar">
              <input type="text" class="list-filter" placeholder="🔍 Filtrer…" />
              <span class="list-counts">0 / ${config.rows.length} sélectionnée(s)</span>
              <button type="button" class="list-select-all">Tout sélectionner</button>
              <button type="button" class="list-select-none">Tout désélectionner</button>
            </div>
            <div class="list-wrapper">
              <table class="list-table">
                <thead><tr><th class="row-check"></th>${theadHtml}</tr></thead>
                <tbody>${tbodyHtml}</tbody>
              </table>
            </div>
            <p class="choice-error" style="display:none;">Veuillez sélectionner au moins une ligne.</p>
          </div>
          <div class="popup-actions">
            <button class="popup-btn popup-btn-cancel">${config.cancelLabel || 'Annuler'}</button>
            <button class="popup-btn popup-btn-confirm popup-btn-info">${config.confirmLabel || 'Valider'}</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .modern-popup-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999; animation: fadeIn .3s ease-out;
        }
        .modern-popup { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 720px; width: 94%; animation: slideIn .3s ease-out; }
        .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 0 20px; }
        .popup-title { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
        .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all .2s; }
        .popup-close:hover { background: #f5f5f5; color: #666; }
        .popup-content { padding: 20px; }
        .popup-message { margin: 0 0 14px 0; color: #555; line-height: 1.5; }
        .popup-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 20px 20px; }
        .popup-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all .2s; min-width: 80px; }
        .popup-btn-cancel { background: #f5f5f5; color: #666; }
        .popup-btn-cancel:hover { background: #e5e5e5; }
        .popup-btn-info { background: #007bff; color: #fff; }
        .popup-btn-info:hover { background: #0056b3; }
        .choice-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all .2s; margin-bottom: 8px; }
        .choice-option:hover { border-color: var(--theme-info, #3498db); background: #f8fbff; }
        .choice-option.has-check { border-color: var(--theme-info, #3498db); background: #eef6ff; }
        .choice-checkbox { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--theme-info, #3498db); cursor: pointer; }
        .choice-label strong { font-size: 14px; color: #333; }
        .choice-label em { font-size: 12px; color: #888; font-style: normal; display: block; margin-top: 2px; }
        .list-toolbar { display: flex; align-items: center; gap: 10px; margin: 14px 0 10px 0; flex-wrap: wrap; }
        .list-dates { display: flex; align-items: center; gap: 10px; margin: 12px 0 0 0; flex-wrap: wrap; }
        .list-dates-label { font-size: 12px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: .04em; }
        .list-date { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #555; }
        .list-date input { padding: 7px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-family: inherit; }
        .list-date input:focus { outline: none; border-color: var(--theme-info, #3498db); box-shadow: 0 0 0 2px rgba(var(--theme-info-rgb),.2); }
        .list-filter { flex: 1; min-width: 160px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
        .list-filter:focus { outline: none; border-color: var(--theme-info, #3498db); box-shadow: 0 0 0 2px rgba(var(--theme-info-rgb),.2); }
        .list-counts { font-size: 13px; font-weight: 600; color: #555; white-space: nowrap; }
        .list-select-all, .list-select-none { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 7px 10px; font-size: 12px; cursor: pointer; color: #555; }
        .list-select-all:hover, .list-select-none:hover { background: #e8f0fe; color: #1a73e8; border-color: #c1d5f5; }
        .list-wrapper { max-height: 260px; overflow: auto; border: 1px solid #e0e0e0; border-radius: 8px; }
        .list-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .list-table thead th { position: sticky; top: 0; background: #f1f3f5; padding: 8px 10px; text-align: left; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #d0d3d6; white-space: nowrap; z-index: 1; }
        .list-table tbody td { padding: 6px 10px; border-bottom: 1px solid #f1f3f5; white-space: nowrap; color: #333; }
        .list-table tbody tr:hover { background: #f8f9fa; }
        .list-table .row-check { width: 36px; text-align: center; }
        .row-checkbox { width: 15px; height: 15px; accent-color: var(--theme-info, #3498db); cursor: pointer; }
        .list-table tbody tr.hidden { display: none; }
        .list-table tbody tr.row-selected { background: #eef6ff; }
        .list-empty { text-align: center; color: #999; padding: 20px; font-style: italic; }
        .choice-error { color: #e74c3c; font-size: 13px; margin: 10px 0 0 0; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
        document.body.style.overflow = 'auto';
        if (style.parentNode) style.parentNode.removeChild(style);
      };

      const updateCounts = () => {
        const all = overlay.querySelectorAll('.list-table tbody tr');
        const selected = overlay.querySelectorAll('.row-checkbox:checked').length;
        const countEl = overlay.querySelector('.list-counts');
        if (countEl) {
          const visible = Array.from(all).filter(tr => !tr.classList.contains('hidden')).length;
          countEl.textContent = lastFilterActive
            ? `${selected} / ${visible} sélectionnée(s) (filtrées sur ${config.rows.length})`
            : `${selected} / ${config.rows.length} sélectionnée(s)`;
        }
        all.forEach((tr) => {
          const cb = tr.querySelector('.row-checkbox') as HTMLInputElement | null;
          if (cb) tr.classList.toggle('row-selected', cb.checked);
        });
      };

      const setAll = (checked: boolean) => {
        overlay.querySelectorAll('.row-checkbox').forEach((cb) => {
          (cb as HTMLInputElement).checked = checked;
        });
        updateCounts();
      };

      let lastFilterActive = false;
      const filterRows = () => {
        const input = overlay.querySelector('.list-filter') as HTMLInputElement | null;
        const q = (input?.value || '').toLowerCase().trim();
        const from = (overlay.querySelector('.list-date-from') as HTMLInputElement | null)?.value || '';
        const to = (overlay.querySelector('.list-date-to') as HTMLInputElement | null)?.value || '';
        const active = q !== '';
        const dateActive = !!from || !!to;
        const rows = Array.from(overlay.querySelectorAll('.list-table tbody tr')) as HTMLElement[];
        let visible = 0;
        rows.forEach((tr) => {
          const textMatch = !active || (tr.textContent || '').toLowerCase().includes(q);
          const date = (tr as HTMLElement).dataset['date'] || '';
          const dateMatch = !dateActive
            || ((!from || (!!date && date >= from)) && (!to || (!!date && date <= to)));
          const match = textMatch && dateMatch;
          tr.classList.toggle('hidden', !match);
          if (active || dateActive) {
            const cb = tr.querySelector('.row-checkbox') as HTMLInputElement | null;
            if (cb) cb.checked = match;
          }
          if (match) visible++;
        });
        if ((active || dateActive) && visible === 0) {
          rows.forEach((tr) => {
            const cb = tr.querySelector('.row-checkbox') as HTMLInputElement | null;
            if (cb) cb.checked = false;
          });
        } else if (!active && !dateActive && lastFilterActive) {
          rows.forEach((tr) => {
            const cb = tr.querySelector('.row-checkbox') as HTMLInputElement | null;
            if (cb) cb.checked = true;
          });
        }
        lastFilterActive = active || dateActive;
        const emptyRow = overlay.querySelector('.list-empty');
        if (emptyRow) emptyRow.remove();
        if (!visible) {
          const wrapper = overlay.querySelector('.list-wrapper');
          const empty = document.createElement('div');
          empty.className = 'list-empty';
          empty.textContent = 'Aucune ligne ne correspond au filtre.';
          if (wrapper) wrapper.appendChild(empty);
        }
        updateCounts();
      };

      overlay.querySelectorAll('.choice-checkbox').forEach((cb) => {
        cb.addEventListener('change', () => {
          const option = (cb as HTMLInputElement).closest('.choice-option');
          if (option) option.classList.toggle('has-check', (cb as HTMLInputElement).checked);
        });
      });
      overlay.querySelectorAll('.row-checkbox').forEach((cb) => {
        cb.addEventListener('change', updateCounts);
      });
      const filterInput = overlay.querySelector('.list-filter') as HTMLInputElement | null;
      const dateFromInput = overlay.querySelector('.list-date-from') as HTMLInputElement | null;
      const dateToInput = overlay.querySelector('.list-date-to') as HTMLInputElement | null;
      const selectAllBtn = overlay.querySelector('.list-select-all');
      const selectNoneBtn = overlay.querySelector('.list-select-none');
      if (filterInput) filterInput.addEventListener('input', filterRows);
      if (dateFromInput) {
        dateFromInput.addEventListener('input', filterRows);
        dateFromInput.addEventListener('change', filterRows);
      }
      if (dateToInput) {
        dateToInput.addEventListener('input', filterRows);
        dateToInput.addEventListener('change', filterRows);
      }
      if (selectAllBtn) selectAllBtn.addEventListener('click', () => setAll(true));
      if (selectNoneBtn) selectNoneBtn.addEventListener('click', () => setAll(false));

      if (dateFromInput || dateToInput) {
        filterRows();
      } else {
        updateCounts();
      }

      const close = (result: { options: Record<string, boolean>; selectedKeys: string[]; dateFilter: { from: string; to: string } } | null) => {
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        resolve(result);
      };

      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onEsc);

      const okBtn = overlay.querySelector('.popup-btn-confirm');
      const cancelBtn = overlay.querySelector('.popup-btn-cancel');
      const closeBtn = overlay.querySelector('.popup-close');

      const validate = () => {
        const options: Record<string, boolean> = {};
        overlay.querySelectorAll('.choice-option').forEach((el) => {
          const key = (el as HTMLElement).dataset['key'] || '';
          const cb = el.querySelector('.choice-checkbox') as HTMLInputElement | null;
          options[key] = cb ? cb.checked : false;
        });
        const selectedKeys: string[] = [];
        overlay.querySelectorAll('.list-table tbody tr').forEach((tr) => {
          const cb = tr.querySelector('.row-checkbox') as HTMLInputElement | null;
          if (cb && cb.checked) {
            const key = (tr as HTMLElement).dataset['key'] || '';
            if (key) selectedKeys.push(key);
          }
        });
        if (!selectedKeys.length && config.requireSelection) {
          const err = overlay.querySelector('.choice-error') as HTMLElement | null;
          if (err) err.style.display = 'block';
          return;
        }
        overlay.remove();
        cleanup();
        document.removeEventListener('keydown', onEsc);
        ModernPopupComponent.scheduleAfterPopupClose({
          options,
          selectedKeys,
          dateFilter: {
            from: (overlay.querySelector('.list-date-from') as HTMLInputElement | null)?.value || '',
            to: (overlay.querySelector('.list-date-to') as HTMLInputElement | null)?.value || ''
          }
        }, resolve);
      };

      if (okBtn) okBtn.addEventListener('click', validate);
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (closeBtn) closeBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }
}
