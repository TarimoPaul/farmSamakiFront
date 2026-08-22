import { Component, effect, input, output } from '@angular/core';

type ToastVariant = 'success' | 'error' | 'info';

@Component({
  selector: 'app-toast',
  template: `
    @if (open()) {
      <div class="toast" [class]="'toast--' + variant()" role="status" aria-live="polite">
        <span class="toast__message">{{ message() }}</span>
        <button type="button" class="toast__close" (click)="closed.emit()" aria-label="Funga">×</button>
      </div>
    }
  `,
  styles: `
    .toast {
      position: fixed;
      right: 1.5rem;
      bottom: 1.5rem;
      z-index: 200;
      display: flex;
      align-items: center;
      gap: .75rem;
      max-width: 360px;
      padding: .85rem 1rem;
      border-radius: var(--radius);
      border-left: 4px solid var(--muted);
      background: var(--surface);
      color: var(--on-surface);
      box-shadow: 0 16px 32px -12px rgba(0, 0, 0, .25);
      font-size: .88rem;
    }
    .toast--success {
      border-left-color: var(--brand);
    }
    .toast--error {
      border-left-color: var(--error);
    }
    .toast--info {
      border-left-color: var(--notice);
    }
    .toast__message {
      flex: 1;
    }
    .toast__close {
      flex: none;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    .toast__close:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
  `,
})
export class Toast {
  open = input(false);
  variant = input<ToastVariant>('info');
  message = input('');
  duration = input(4000);
  closed = output<void>();

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }
      const timer = setTimeout(() => this.closed.emit(), this.duration());
      onCleanup(() => clearTimeout(timer));
    });
  }
}
