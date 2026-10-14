import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-autocomplete-input',
  templateUrl: './autocomplete-input.component.html',
  styleUrls: ['./autocomplete-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: AutocompleteInputComponent,
      multi: true
    }
  ]
})
export class AutocompleteInputComponent implements OnInit, ControlValueAccessor {
  @Input() options: string[] = [];
  @Input() placeholder: string = '';
  @Input() label: string = '';
  @Input() disabled: boolean = false;
  @Input() showAllOption: boolean = true;
  @Output() valueChange = new EventEmitter<string>();
  @Output() optionSelected = new EventEmitter<string>();

  value: string = '';

  private onChange = (value: string) => {};
  private onTouched = () => {};

  ngOnInit() {
    // Ajouter l'option "Tous" si activée et si elle n'est pas déjà présente
    if (this.showAllOption && !this.options.includes('Tous')) {
      this.options.unshift('Tous');
    }
  }

  onInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.value = input.value;
    this.onChange(this.value);
    this.valueChange.emit(this.value);
    this.onTouched();
  }

  onBlur() {
    this.onTouched();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
} 