import { Component, input, output } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

@Component({
  selector: 'app-button',
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="'btn btn--' + variant()"
      (click)="clicked.emit($event)"
    >
      @if (loading()) {
        <span class="btn__spinner" aria-hidden="true"></span>
      }
      <ng-content></ng-content>
    </button>
  `,
  styles: `
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: .5rem; padding: .625rem 1rem;
      border: 1px solid transparent; border-radius: var(--radius);
      font: inherit; font-weight: 600; cursor: pointer;
      transition: filter .15s ease, opacity .15s ease;
    }
    .btn:disabled { opacity: .6; cursor: not-allowed; }
    .btn:hover:not(:disabled) { filter: brightness(.95); }
    .btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
    .btn--primary   { background: var(--brand);   color: var(--brand-contrast); }
    .btn--secondary { background: var(--surface);  color: var(--on-surface); border-color: var(--border); }
    .btn--danger    { background: var(--error);    color: #fff; }
    .btn--ghost     { background: transparent;     color: var(--on-surface); }
    .btn__spinner {
      width: 1em; height: 1em; border: 2px solid currentColor;
      border-right-color: transparent; border-radius: 50%;
      animation: btn-spin .6s linear infinite;
    }
    @keyframes btn-spin { to { transform: rotate(360deg); } }
  `,
})
export class Button {
  variant = input<ButtonVariant>('primary');
  type = input<'button' | 'submit'>('button');
  disabled = input(false);
  loading = input(false);
  clicked = output<MouseEvent>();
}
