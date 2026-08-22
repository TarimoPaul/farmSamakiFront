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
      align-items: center;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      cursor: pointer;
    }
    .lang-toggle__opt {
      padding: .3rem .55rem;
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
  `,
})
export class LanguageToggle {
  lang = input<Lang>('sw');
  toggled = output<void>();
}
