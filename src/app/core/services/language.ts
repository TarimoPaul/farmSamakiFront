import { Injectable, effect, signal } from '@angular/core';

export type Lang = 'sw' | 'en';

const STORAGE_KEY = 'samakiFarm.lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang = signal<Lang>(this.readInitialLang());

  constructor() {
    effect(() => {
      const lang = this.lang();
      document.documentElement.setAttribute('lang', lang);
      localStorage.setItem(STORAGE_KEY, lang);
    });
  }

  toggle(): void {
    this.lang.set(this.lang() === 'sw' ? 'en' : 'sw');
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
  }

  private readInitialLang(): Lang {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'sw' ? stored : 'sw';
  }
}
