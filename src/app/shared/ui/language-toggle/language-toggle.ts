import { Component, input, output } from '@angular/core';

type Lang = 'sw' | 'en';

@Component({
  selector: 'app-language-toggle',
  template: `
    <button
      type="button"
      class="lang-toggle"
      (click)="toggled.emit()"
      [attr.aria-label]="lang() === 'sw' ? 'Switch to English' : 'Badilisha kwenda Kiswahili'"
    >
      <span [class.lang-toggle__opt--active]="lang() === 'sw'" class="lang-toggle__opt">SW</span>
      <span [class.lang-toggle__opt--active]="lang() === 'en'" class="lang-toggle__opt">EN</span>
    </button>
  `,
  styles: `
    .lang-toggle {
      display: inline-flex;
      align-items: stretch;
      gap: 2px;
      height: var(--control-h, 36px);
      padding: 3px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      cursor: pointer;
    }
    .lang-toggle:hover {
      border-color: var(--brand);
    }
    .lang-toggle__opt {
      display: flex;
      align-items: center;
      padding: 0 .55rem;
      border-radius: calc(var(--radius) - 4px);
      font-size: .72rem;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: .02em;
    }
    .lang-toggle__opt--active {
      background: var(--brand);
      color: var(--brand-contrast);
    }
    .lang-toggle:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
    /* Narrower on a phone, where the topbar has no width to spare. */
    @media (max-width: 480px) {
      .lang-toggle__opt {
        padding: 0 .4rem;
      }
    }
  `,
})
export class LanguageToggle {
  lang = input<Lang>('sw');
  toggled = output<void>();
}
