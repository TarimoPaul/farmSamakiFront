import { Component, input } from '@angular/core';

@Component({
  selector: 'app-form-field',
  template: `
    <div class="form-field">
      @if (label()) {
        <label [for]="for()" class="form-field__label">
          {{ label() }}
          @if (required()) {
            <span class="form-field__required" aria-hidden="true">*</span>
          }
        </label>
      }

      <ng-content></ng-content>

      @if (error()) {
        <p class="form-field__error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .form-field {
      display: flex;
      flex-direction: column;
      gap: .4rem;
    }
    .form-field__label {
      font-size: .85rem;
      font-weight: 600;
      color: var(--on-surface);
    }
    .form-field__required {
      margin-left: .15rem;
      color: var(--error);
    }
    .form-field__error {
      margin: 0;
      font-size: .8rem;
      color: var(--error);
    }
  `,
})
export class FormField {
  label = input('');
  for = input('');
  error = input<string | null>(null);
  required = input(false);
}
