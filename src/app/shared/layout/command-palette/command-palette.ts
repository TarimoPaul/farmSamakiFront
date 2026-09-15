import {
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { LanguageService } from '../../../core/services/language';
import { SHELL_I18N } from '../app-shell/app-shell.i18n';

/** One screen the palette can open. */
export interface PaletteEntry {
  label: string;
  /** Matched too, never shown: the other language's label and the group's names. */
  keywords: string;
  route: string;
  /** Shown beside the label, so "Uzalishaji" the group and the screen are told apart. */
  group: string | null;
}

/** Lower-case, accents gone - "Tafuta" finds "tafuta", and a stray accent does not break a match. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * How well an entry answers the query. 0 = not at all.
 *
 * The label's START beats a word inside it, which beats anywhere in it, which
 * beats the keywords - so typing "ma" puts "Malisho" above "Katalogi ya
 * Chakula" rather than listing them in nav order.
 */
function score(entry: PaletteEntry, query: string): number {
  if (!query) {
    return 1;
  }
  const label = normalize(entry.label);
  if (label.startsWith(query)) return 4;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 3;
  if (label.includes(query)) return 2;
  if (normalize(entry.keywords).includes(query)) return 1;
  return 0;
}

/**
 * The topbar search: a palette that finds a SCREEN and opens it.
 *
 * It searches screens, not records, and says so ("Tafuta skrini"). That is a
 * deliberate first step, not the whole idea: it needs no backend, and it can
 * never offer a screen the account may not open, because the shell hands it
 * the permission-filtered nav. Units, cycles and people can be added later as
 * further entries without changing how it is opened or driven.
 *
 * Opened by Ctrl/⌘+K from anywhere, by "/" when nothing is being typed, or by
 * the trigger. It is a modal dialog with ONE focusable element - the input -
 * and the options are reached through aria-activedescendant, which is the
 * combobox pattern: arrow keys move, Enter opens, Escape closes and focus goes
 * back to the trigger.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  templateUrl: './command-palette.html',
  styleUrl: './command-palette.scss',
})
export class CommandPalette {
  readonly entries = input<readonly PaletteEntry[]>([]);

  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);

  readonly t = computed(() => SHELL_I18N[this.languageService.lang()]);

  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(0);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  /** What the trigger advertises - the key a Mac user actually presses. */
  readonly shortcut = /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? '')
    ? '⌘K'
    : 'Ctrl K';

  /**
   * The matches, best first. Ties keep nav order, so an empty query lists the
   * screens exactly as the sidebar does.
   */
  readonly results = computed(() => {
    const query = normalize(this.query());
    return this.entries()
      .map((entry, index) => ({ entry, index, score: score(entry, query) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((row) => row.entry);
  });

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  openPalette(): void {
    if (this.open()) {
      return;
    }
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
    afterNextRender(() => this.searchInput()?.nativeElement.focus(), { injector: this.injector });
  }

  close(returnFocus = true): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this.trigger()?.nativeElement.focus();
    }
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    // A new list: the old highlight may point past its end.
    this.active.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.moveTo((this.active() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.moveTo((this.active() - 1 + count) % count);
        break;
      case 'Enter': {
        event.preventDefault();
        const entry = this.results()[this.active()];
        if (entry) this.go(entry);
        break;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;
      case 'Tab':
        // The input is the dialog's only stop; Tab must not wander behind it.
        event.preventDefault();
        break;
    }
  }

  go(entry: PaletteEntry): void {
    this.close(false);
    void this.router.navigateByUrl(entry.route);
  }

  /** Ctrl/⌘+K anywhere; "/" only when it would not have typed a slash somewhere. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.open()) {
        this.close();
      } else {
        this.openPalette();
      }
      return;
    }
    if (event.key === '/' && !this.open() && !isTypingTarget(event.target)) {
      event.preventDefault();
      this.openPalette();
    }
  }

  private moveTo(index: number): void {
    this.active.set(index);
    afterNextRender(
      () =>
        this.list()
          ?.nativeElement.querySelector('.palette__option--active')
          // Not in jsdom - and not needed there.
          ?.scrollIntoView?.({ block: 'nearest' }),
      { injector: this.injector },
    );
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}
