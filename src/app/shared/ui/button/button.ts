import { Component, booleanAttribute, input, output } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * The app's buttons, in the "smooth" style of the reference kit
 * (ScreenShoot/button.png): a pale tint of the colour with the colour itself
 * as the text, rather than a solid block with white on it.
 *
 * Smooth is a LOW-emphasis style, which is why the variants below still
 * differ from one another. In the reference it is one of five levels and only
 * reads as "the main action" because the others are quieter. So:
 *
 *   primary   smooth accent  - the one action the screen is for
 *   secondary ghost, bordered - alongside it, clearly not it
 *   ghost     text only       - dismiss, close, cancel in a banner
 *   danger    smooth red      - destructive, and still not shouted
 *
 * Every colour is a token; nothing here is a literal.
 */
@Component({
  selector: 'app-button',
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="'btn btn--' + variant() + (floating() ? ' btn--floating' : '')"
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
    .btn--primary   { background: var(--brand-soft); color: var(--brand-dark); }
    .btn--secondary { background: var(--surface);    color: var(--on-surface); border-color: var(--border); }
    .btn--danger    { background: var(--error-bg);   color: var(--error); }
    .btn--ghost     { background: transparent;       color: var(--on-surface); }

    /* For a button pinned to the page corner (.page-actions): it sits OVER
       the content, and a pale smooth fill has no edge of its own, so the
       shadow is what separates it from whatever scrolls underneath. */
    .btn--floating { box-shadow: 0 12px 24px -10px rgba(15, 35, 60, .45); }

    @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }

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
  /**
   * Adds the shadow a corner-pinned button needs to read over content.
   * `booleanAttribute` so a call site writes the flag bare: `<app-button
   * floating>`.
   */
  floating = input(false, { transform: booleanAttribute });
  clicked = output<MouseEvent>();
}
