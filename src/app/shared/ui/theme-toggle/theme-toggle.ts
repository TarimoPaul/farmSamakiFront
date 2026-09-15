import { Component, computed, inject, input, output } from '@angular/core';
import { LanguageService } from '../../../core/services/language';

type Theme = 'light' | 'dark';

/** Named in the app's language - it used to say Swahili in English mode too. */
const LABELS = {
  sw: { toLight: 'Tumia mandhari ya mwanga', toDark: 'Tumia mandhari ya giza' },
  en: { toLight: 'Switch to light theme', toDark: 'Switch to dark theme' },
} as const;

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      class="theme-toggle"
      (click)="toggled.emit()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      [attr.aria-pressed]="theme() === 'dark'"
    >
      @if (theme() === 'dark') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
        </svg>
      } @else {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      }
    </button>
  `,
  styles: `
    .theme-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--control-h, 36px);
      height: var(--control-h, 36px);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--on-surface);
      cursor: pointer;
    }
    .theme-toggle svg {
      width: 18px;
      height: 18px;
    }
    .theme-toggle:hover {
      color: var(--brand);
      border-color: var(--brand);
    }
    .theme-toggle:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
  `,
})
export class ThemeToggle {
  theme = input<Theme>('light');
  toggled = output<void>();

  private readonly languageService = inject(LanguageService);

  readonly label = computed(() => {
    const labels = LABELS[this.languageService.lang()];
    return this.theme() === 'dark' ? labels.toLight : labels.toDark;
  });
}
