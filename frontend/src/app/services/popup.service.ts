import { Injectable } from '@angular/core';
import { ModernPopupComponent } from '../components/modern-popup/modern-popup.component';
import { I18nService } from './i18n/i18n.service';

@Injectable({
  providedIn: 'root'
})
export class PopupService {

  constructor() { }

  /**
   * Affiche un popup d'information
   */
  showInfo(message: string, title: string = I18nService.t('POPUP.info')): Promise<void> {
    return ModernPopupComponent.showInfo(message, title);
  }

  /**
   * Affiche un popup de succès
   */
  showSuccess(message: string, title: string = I18nService.t('POPUP.success')): Promise<void> {
    return ModernPopupComponent.showSuccess(message, title);
  }

  /**
   * Affiche un popup d'avertissement
   */
  showWarning(message: string, title: string = I18nService.t('POPUP.warning')): Promise<void> {
    return ModernPopupComponent.showWarning(message, title);
  }

  /**
   * Affiche un popup d'erreur
   */
  showError(message: string, title: string = I18nService.t('POPUP.error')): Promise<void> {
    return ModernPopupComponent.showError(message, title);
  }

  /**
   * Affiche un popup de confirmation
   */
  showConfirm(message: string, title: string = I18nService.t('POPUP.confirm')): Promise<boolean> {
    return ModernPopupComponent.showConfirm(message, title);
  }

  /**
   * Affiche un popup de sauvegarde avec le nombre de lignes sauvegardées
   */
  showSaveSuccess(linesSaved: number = 1): Promise<void> {
    return ModernPopupComponent.showSaveSuccess(linesSaved);
  }

  /**
   * Remplace les anciens alert() par des popups modernes
   */
  showAlert(message: string, type: 'success' | 'danger' | 'warning' | 'info' = 'info'): Promise<void> {
    const title = this.getTitleForType(type);
    const popupType = this.mapType(type);
    
    return ModernPopupComponent.showPopup({
      title,
      message,
      type: popupType
    });
  }

  /**
   * Remplace les anciens confirm() par des popups modernes
   */
  showConfirmDialog(message: string, title: string = I18nService.t('POPUP.confirm')): Promise<boolean> {
    return ModernPopupComponent.showConfirm(message, title);
  }

  /**
   * Affiche un popup avec un champ texte et retourne la saisie (ou null si annulé)
   */
  showTextInput(message: string, title: string = I18nService.t('POPUP.input'), defaultValue: string = '', placeholder: string = ''): Promise<string | null> {
    return ModernPopupComponent.showTextInput(message, title, defaultValue, placeholder);
  }

  showDateInput(message: string, title: string = I18nService.t('POPUP.date'), defaultValue: string = ''): Promise<string | null> {
    return ModernPopupComponent.showDateInput(message, title, defaultValue);
  }

  showSelectInput(message: string, title: string = I18nService.t('POPUP.select'), options: string[] = [], defaultValue: string = ''): Promise<string | null> {
    return ModernPopupComponent.showSelectInput(message, title, options, defaultValue);
  }

  showAutocompleteInput(message: string, title: string = I18nService.t('POPUP.select'), options: string[] = [], defaultValue: string = ''): Promise<string | null> {
    return ModernPopupComponent.showAutocompleteInput(message, title, options, defaultValue);
  }

  /**
   * Popup de choix multiple (checkboxes) avec validation.
   * Retourne un objet { key: boolean } pour chaque option, ou null si annulé.
   */
  showChoicePopup(config: {
    title: string;
    message: string;
    options: { key: string; label: string; checked?: boolean; hint?: string }[];
    confirmLabel?: string;
    cancelLabel?: string;
    requireSelection?: boolean;
  }): Promise<Record<string, boolean> | null> {
    return ModernPopupComponent.showChoicePopup(config);
  }

  /**
   * Popup de sélection de lignes : liste (cases à cocher) + choix de destinations, avec filtre.
   * Retourne les lignes sélectionnées et les destinations cochées, ou null si annulé.
   */
  showSelectableListPopup(config: {
    title: string;
    message: string;
    columns: string[];
    rows: { key: string; cells: string[]; date?: string }[];
    options: { key: string; label: string; checked?: boolean; hint?: string }[];
    confirmLabel?: string;
    cancelLabel?: string;
    requireSelection?: boolean;
    dateFilter?: { from?: string | null; to?: string | null };
  }): Promise<{ options: Record<string, boolean>; selectedKeys: string[]; dateFilter: { from: string; to: string } } | null> {
    return ModernPopupComponent.showSelectableListPopup(config);
  }

  private getTitleForType(type: string): string {
    switch (type) {
      case 'success': return I18nService.t('POPUP.success');
      case 'danger': return I18nService.t('POPUP.error');
      case 'warning': return I18nService.t('POPUP.warning');
      case 'info':
      default: return I18nService.t('POPUP.info');
    }
  }

  private mapType(type: string): 'info' | 'success' | 'warning' | 'error' | 'confirm' {
    switch (type) {
      case 'success': return 'success';
      case 'danger': return 'error';
      case 'warning': return 'warning';
      case 'info': 
      default: return 'info';
    }
  }
}
