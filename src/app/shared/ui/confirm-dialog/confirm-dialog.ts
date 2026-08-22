import { Component, input, output } from '@angular/core';
import { Button } from '../button/button';

@Component({
  selector: 'app-confirm-dialog',
  imports: [Button],
  template: `
    @if (open()) {
      <div class="overlay" (click)="cancelled.emit()">
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          (click)="$event.stopPropagation()"
        >
          <h2 class="dialog__title">{{ title() }}</h2>
          <p class="dialog__message">{{ message() }}</p>

          <div class="dialog__actions">
            <app-button variant="ghost" (clicked)="cancelled.emit()">{{ cancelLabel() }}</app-button>
            <app-button variant="danger" [loading]="loading()" (clicked)="confirmed.emit()">
              {{ confirmLabel() }}
            </app-button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(0, 0, 0, .45);
    }
    .dialog {
      width: 100%;
      max-width: 400px;
      padding: 1.5rem;
      background: var(--surface);
      color: var(--on-surface);
      border-radius: var(--radius);
      box-shadow: 0 24px 48px -12px rgba(0, 0, 0, .35);
    }
    .dialog__title {
      margin: 0 0 .5rem;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .dialog__message {
      margin: 0 0 1.25rem;
      color: var(--muted);
      font-size: .9rem;
      line-height: 1.5;
    }
    .dialog__actions {
      display: flex;
      justify-content: flex-end;
      gap: .6rem;
    }
  `,
})
export class ConfirmDialog {
  open = input(false);
  title = input('Thibitisha');
  message = input('Una uhakika?');
  confirmLabel = input('Ndiyo, endelea');
  cancelLabel = input('Ghairi');
  loading = input(false);

  confirmed = output<void>();
  cancelled = output<void>();
}
