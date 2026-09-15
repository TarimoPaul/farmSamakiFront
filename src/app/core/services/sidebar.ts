import { Injectable, signal } from '@angular/core';

export type SidebarState = 'expanded' | 'collapsed';

const STORAGE_KEY = 'samakiFarm.sidebar';

/**
 * Below this width the shell starts COLLAPSED unless the user has said
 * otherwise - a 1366px laptop keeps the labels, a 1200px window does not.
 * It only ever supplies the FIRST value; a stored preference outranks it.
 */
const AUTO_COLLAPSE_QUERY = '(max-width: 1180px)';

/**
 * The sidebar's own state: the desktop rail/labels preference, and the mobile
 * drawer.
 *
 * A root service rather than a signal on AppShell. That was forced when every
 * screen rendered its own `<app-shell>`: component state snapped back to
 * "expanded" on every click. The shell is a layout route now and would hold
 * the state fine - but this stays where it is, because the preference outlives
 * the shell too. It is written to localStorage and has to be read back before
 * the first shell exists, and a reload must not lose it.
 */
@Injectable({ providedIn: 'root' })
export class SidebarService {
  /** Desktop: rail (76px, icons only) vs labels (240px). Remembered. */
  readonly state = signal<SidebarState>(this.readInitialState());

  /**
   * Mobile: the off-canvas drawer.
   *
   * DELIBERATELY not persisted. The rail preference is a working style worth
   * remembering; a drawer left open is just a screen nobody closed, and
   * restoring it would hide the content behind a scrim on first paint.
   */
  readonly drawerOpen = signal(false);

  readonly collapsed = () => this.state() === 'collapsed';

  /**
   * Written HERE, on a real choice - not by an effect on every value.
   *
   * An effect also stored the auto-collapsed FIRST value, which is a guess from
   * the window width. So one visit on a phone wrote "collapsed", and the same
   * browser on a desktop then opened as a rail nobody had asked for. Only a
   * click is a preference.
   */
  toggle(): void {
    this.state.set(this.state() === 'collapsed' ? 'expanded' : 'collapsed');
    localStorage.setItem(STORAGE_KEY, this.state());
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  private readInitialState(): SidebarState {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'collapsed' || stored === 'expanded') {
      return stored;
    }
    return window.matchMedia?.(AUTO_COLLAPSE_QUERY).matches ? 'collapsed' : 'expanded';
  }
}
