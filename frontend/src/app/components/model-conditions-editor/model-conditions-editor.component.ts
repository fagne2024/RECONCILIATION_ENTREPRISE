import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { OPERATEURS_CONDITION, OperateurCondition } from '../../utils/cross-dedup.util';
import { ModelCondition } from '../../utils/model-conditions.util';

let nextEditorId = 0;

/**
 * Éditeur de conditions multiples d'une option du traitement des modèles : chaque condition porte
 * sur une autre colonne (égal / différent / contient l'une des valeurs, vide, non vide) ; toutes
 * doivent être remplies. Les valeurs connues de la colonne sont proposées en un clic.
 */
@Component({
  selector: 'app-model-conditions-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './model-conditions-editor.component.html',
  styleUrls: ['./model-conditions-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.Default
})
export class ModelConditionsEditorComponent {
  /** Conditions éditées (le tableau est créé au premier ajout et renvoyé par conditionsChange). */
  @Input() conditions: ModelCondition[] | undefined;
  @Output() conditionsChange = new EventEmitter<ModelCondition[] | undefined>();
  /** Colonnes proposées. */
  @Input() columns: string[] = [];
  /** Valeurs connues d'une colonne (exemples du fichier modèle, valeurs déjà utilisées dans le modèle). */
  @Input() valueSuggestions: ((column: string) => string[]) | null = null;
  /** Titre affiché (par défaut « Conditions »). */
  @Input() label = '';

  readonly operators: OperateurCondition[] = OPERATEURS_CONDITION;
  readonly editorId = `model-conditions-${nextEditorId++}`;
  private readonly rawValues = new WeakMap<ModelCondition, string>();

  add(): void {
    const list = this.conditions ?? [];
    list.push({ column: '', operator: 'EGAL', values: [] });
    this.conditions = list;
    this.conditionsChange.emit(list);
  }

  remove(index: number): void {
    if (!this.conditions) {
      return;
    }
    this.conditions.splice(index, 1);
    const list = this.conditions.length ? this.conditions : undefined;
    this.conditions = list;
    this.conditionsChange.emit(list);
  }

  needsValues(condition: ModelCondition): boolean {
    return condition.operator !== 'VIDE' && condition.operator !== 'NON_VIDE';
  }

  valuesText(condition: ModelCondition): string {
    return this.rawValues.get(condition) ?? (condition.values ?? []).join(', ');
  }

  setValuesText(condition: ModelCondition, text: string): void {
    this.rawValues.set(condition, text);
    condition.values = (text || '').split(/[;,\n]/).map(value => value.trim()).filter(value => value !== '');
  }

  suggestions(condition: ModelCondition): string[] {
    if (!condition.column || !this.valueSuggestions) {
      return [];
    }
    return this.valueSuggestions(condition.column).slice(0, 40);
  }

  isSelected(condition: ModelCondition, value: string): boolean {
    const wanted = value.trim().toLowerCase();
    return (condition.values ?? []).some(v => v.trim().toLowerCase() === wanted);
  }

  /** Ajoute ou retire une valeur proposée. */
  toggleValue(condition: ModelCondition, value: string): void {
    const values = condition.values ?? [];
    condition.values = this.isSelected(condition, value)
      ? values.filter(v => v.trim().toLowerCase() !== value.trim().toLowerCase())
      : [...values, value];
    this.rawValues.set(condition, condition.values.join(', '));
  }

  trackByIndex(index: number): number {
    return index;
  }
}
