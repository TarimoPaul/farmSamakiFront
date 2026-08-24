import { Component, input, output } from '@angular/core';

/**
 * A dialog with a title, projected body and projected actions.
 *
 * ConfirmDialog stays separate on purpose: it is a fixed question with two
 * fixed answers, while this holds whatever a screen needs - here a form. The
 * two share look, not behaviour.
 *
 * ```html
 * <app-modal [open]="open()" [title]="'…'" (dismissed)="close()">
 *   <form …></form>
 *   <div slot="actions">…</div>
 * </app-modal>
 * ```
 */
@Component({
  selector: 'app-modal',
  template: `
    @if (open()) {
      <div class="overlay" (click)="dismissed.emit()">
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          (click)="$event.stopPropagation()"
        >
          <header class="modal__head">
            <h2 class="modal__title">{{ title() }}</h2>
            <button
              type="button"
              class="modal__close"
              (click)="dismissed.emit()"
              [attr.aria-label]="closeLabel()"
            >
              ×
            </button>
          </header>

          <div class="modal__body">
            <ng-content></ng-content>
          </div>

          <div class="modal__actions">
            <ng-content select="[slot=actions]"></ng-content>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(0, 0, 0, .45);
    }
    .modal {
      width: 100%;
      max-width: 440px;
      background: var(--surface);
      color: var(--on-surface);
      border-radius: var(--radius);
      box-shadow: 0 24px 48px -12px rgba(0, 0, 0, .35);
    }
    .modal__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.5rem .75rem;
    }
    .modal__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
    }
    .modal__close {
      flex: none;
      padding: 0 .25rem;
      border: none;
      background: transparent;
      color: var(--muted);
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;
    }
    .modal__close:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
    .modal__body {
      padding: 0 1.5rem;
    }
    .modal__actions {
      display: flex;
      justify-content: flex-end;
      gap: .5rem;
      padding: 1.25rem 1.5rem 1.5rem;
    }
  `,
})
export class Modal {
  open = input(false);
  title = input('');
  closeLabel = input('Funga');
  /** Overlay click or the × - the screen decides whether that closes it. */
  dismissed = output<void>();
}
