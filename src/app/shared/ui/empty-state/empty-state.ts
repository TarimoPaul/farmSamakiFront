import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty-state">
      <p class="empty-state__title">{{ title() }}</p>

      @if (message()) {
        <p class="empty-state__message">{{ message() }}</p>
      }

      <ng-content></ng-content>
    </div>
  `,
  styles: `
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: var(--muted);
    }
    .empty-state__title {
      margin: 0;
      font-weight: 700;
      font-size: .95rem;
      color: var(--on-surface);
    }
    .empty-state__message {
      margin: 0;
      font-size: .85rem;
    }
  `,
})
export class EmptyState {
  title = input('Hakuna data bado');
  message = input<string | null>(null);
}
