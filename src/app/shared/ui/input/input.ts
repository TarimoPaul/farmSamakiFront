import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

type InputType = 'text' | 'email' | 'password';

@Component({
  selector: 'app-input',
  template: `
    <div class="input" [class.input--invalid]="invalid()">
      <input
        [id]="id()"
        [type]="resolvedType()"
        [placeholder]="placeholder()"
        [disabled]="isDisabled()"
        [value]="value()"
        [attr.aria-invalid]="invalid() || null"
        (input)="onInput($event)"
        (blur)="onTouched()"
      />

      @if (type() === 'password') {
        <button
          type="button"
          class="input__toggle"
          (click)="showPassword.set(!showPassword())"
          [attr.aria-label]="showPassword() ? 'Ficha nywila' : 'Onyesha nywila'"
        >
          @if (showPassword()) {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          } @else {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .input {
      position: relative;
      display: flex;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    .input:focus-within {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 16%, transparent);
    }
    .input--invalid {
      border-color: var(--error);
    }
    .input input {
      flex: 1 1 auto;
      min-width: 0;
      border: none;
      background: transparent;
      outline: none;
      padding: .625rem .75rem;
      font: inherit;
      color: var(--on-surface);
    }
    .input input::placeholder {
      color: var(--muted);
    }
    .input input:disabled {
      opacity: .6;
      cursor: not-allowed;
    }
    .input__toggle {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      margin-right: .15rem;
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      border-radius: calc(var(--radius) - 4px);
    }
    .input__toggle svg {
      width: 18px;
      height: 18px;
    }
    .input__toggle:hover {
      color: var(--brand);
    }
    .input__toggle:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Input),
      multi: true,
    },
  ],
})
export class Input implements ControlValueAccessor {
  type = input<InputType>('text');
  placeholder = input('');
  id = input('');
  disabled = input(false);
  invalid = input(false);

  protected readonly value = signal('');
  protected readonly showPassword = signal(false);

  private readonly disabledState = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.disabledState());
  protected readonly resolvedType = computed(() =>
    this.type() === 'password' && this.showPassword() ? 'text' : this.type(),
  );

  private onChangeFn: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChangeFn(value);
  }
}
