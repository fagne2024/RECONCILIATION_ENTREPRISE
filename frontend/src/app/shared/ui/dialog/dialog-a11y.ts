/**
 * Accessibilité des dialogues construits à la main (hors injecteur Angular,
 * donc sans le FocusTrap du CDK) : rôle, nom accessible, piège du focus
 * et restitution du focus à la fermeture.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export interface DialogA11yOptions {
  /** Élément portant le rôle `dialog` ; par défaut `.modern-popup` dans l'overlay. */
  panel?: HTMLElement | null;
  /** Nom accessible du bouton de fermeture s'il n'en a pas. */
  closeLabel?: string;
  /** `alertdialog` pour les confirmations et les erreurs. */
  role?: 'dialog' | 'alertdialog';
}

export interface DialogA11yHandle {
  release(): void;
}

const openDialogs: DialogA11yHandle[] = [];
let idSequence = 0;

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => !el.closest('.hidden, [hidden]') && getComputedStyle(el).display !== 'none');
}

function ensureId(el: Element, prefix: string): string {
  if (!el.id) {
    el.id = `${prefix}-${++idSequence}`;
  }
  return el.id;
}

export function attachDialogA11y(overlay: HTMLElement, options: DialogA11yOptions = {}): DialogA11yHandle {
  const panel = options.panel || overlay.querySelector<HTMLElement>('.modern-popup') || overlay;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  panel.setAttribute('role', options.role || 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('tabindex', '-1');

  const title = panel.querySelector('.popup-title');
  if (title) {
    panel.setAttribute('aria-labelledby', ensureId(title, 'ds-dialog-title'));
  }
  const message = panel.querySelector('.popup-message');
  if (message && message.textContent && message.textContent.trim()) {
    panel.setAttribute('aria-describedby', ensureId(message, 'ds-dialog-desc'));
  }
  const closeButton = panel.querySelector('.popup-close');
  if (closeButton && options.closeLabel && !closeButton.hasAttribute('aria-label')) {
    closeButton.setAttribute('aria-label', options.closeLabel);
  }

  let released = false;

  const onKeydown = (event: KeyboardEvent) => {
    if (!overlay.isConnected) {
      handle.release();
      return;
    }
    if (event.key !== 'Tab' || openDialogs[openDialogs.length - 1] !== handle) {
      return;
    }
    const focusables = focusableIn(panel);
    if (focusables.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && panel.contains(active);
    if (event.shiftKey && (!inside || active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  const handle: DialogA11yHandle = {
    release(): void {
      if (released) {
        return;
      }
      released = true;
      document.removeEventListener('keydown', onKeydown, true);
      const index = openDialogs.indexOf(handle);
      if (index >= 0) {
        openDialogs.splice(index, 1);
      }
      const active = document.activeElement;
      const focusLost = !active || active === document.body || panel.contains(active) || !overlay.isConnected;
      if (focusLost && previouslyFocused && previouslyFocused.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }
  };

  openDialogs.push(handle);
  document.addEventListener('keydown', onKeydown, true);

  // Laisse les dialogues qui placent eux-mêmes le focus (champ de saisie) le faire d'abord.
  // Avec un bouton Annuler, c'est lui qui reçoit le focus : Entrée ne doit pas confirmer par mégarde.
  setTimeout(() => {
    if (released || panel.contains(document.activeElement)) {
      return;
    }
    const initial = panel.querySelector<HTMLElement>('.popup-btn-cancel')
      || panel.querySelector<HTMLElement>('.popup-btn-primary, .popup-btn-confirm');
    (initial || focusableIn(panel)[0] || panel).focus();
  }, 0);

  return handle;
}
