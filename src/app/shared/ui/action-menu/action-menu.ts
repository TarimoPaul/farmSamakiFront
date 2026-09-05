import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';

/** The sheet's own width, in px. Needed up front to right-align it. */
const MENU_WIDTH = 208;

/** Breathing room between the trigger and the sheet. */
const GAP = 6;

/**
 * Roughly how tall a four-item sheet is. Used ONLY to decide whether to open
 * upwards; the placement itself is exact either way (see position()).
 */
const ESTIMATED_HEIGHT = 180;

/**
 * A row's controls, behind one button.
 *
 * ```html
 * <app-action-menu [label]="t().actions">
 *   <button type="button" role="menuitem" (click)="edit(row)">Hariri</button>
 *   <button type="button" role="menuitem" class="is-danger" (click)="remove(row)">Futa</button>
 * </app-action-menu>
 * ```
 *
 * WHY IT EXISTS. A table row can hold two controls comfortably. The Roles
 * screen has four, and side by side they took more width than the data did -
 * the actions column is sized to its content, so every button added squeezed
 * the name, description and status columns instead. One trigger of fixed
 * width gives that space back and keeps every row the same shape however many
 * actions a screen has.
 *
 * POSITION: FIXED, NOT ABSOLUTE, and this is the whole reason the component
 * does its own arithmetic. The sheet is rendered inside a table cell, and
 * DataTable wraps its table in `overflow-x: auto` - which computes the other
 * axis to `auto` as well, so an absolutely-positioned sheet would be clipped
 * by the scroll container the moment it dropped below the last row. Fixed
 * positioning escapes that, at the cost of having to place it by hand from
 * the trigger's rect.
 *
 * The items are PROJECTED rather than configured: a menu item needs the
 * screen's own handler, its own disabled condition and its own permission
 * gating, none of which a `{ label, action }` array could carry. Same
 * reasoning as DataTable's rowActions.
 */
@Component({
  selector: 'app-action-menu',
  template: `
    <button
      type="button"
      class="trigger"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      aria-haspopup="menu"
      (click)="toggle($event)"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
      </svg>
    </button>

    @if (open()) {
      <!-- Closing on click here rather than in each item: whatever the item
           did, the menu has served its purpose. A DISABLED item dispatches no
           click at all, so the sheet correctly stays open under it. -->
      <div
        class="sheet"
        role="menu"
        [class.sheet--flipped]="flipped()"
        [style.top.px]="top()"
        [style.left.px]="left()"
        (click)="open.set(false)"
      >
        <ng-content></ng-content>
      </div>
    }
  `,
  styles: `
    :host {
      display: inline-block;
      position: relative;
    }
    .trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
    }
    .trigger:hover {
      color: var(--on-surface);
      background: var(--surface-alt);
    }
    .trigger:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
    .trigger svg {
      width: 18px;
      height: 18px;
    }

    .sheet {
      position: fixed;
      /* Over the table and the pinned action row (z-index 5), under every
         overlay: confirm-dialog is 100, modal 120, toast 200. */
      z-index: 20;
      width: 208px;
      padding: 0.35rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: 0 18px 36px -12px rgba(15, 35, 60, 0.35);
      text-align: left;
    }
    /* Anchored by its BOTTOM edge when it opens upwards, so the placement is
       exact without ever having measured the sheet. */
    .sheet--flipped {
      transform: translateY(-100%);
    }

    /* The items are projected, so they carry the PARENT component's style
       scope and this component's own selectors cannot reach them - hence
       ::ng-deep, kept inside .sheet so it cannot escape this menu. A screen
       supplies plain <button>s and gets the menu's look for free. */
    .sheet ::ng-deep button {
      display: block;
      width: 100%;
      padding: 0.5rem 0.6rem;
      border: none;
      border-radius: calc(var(--radius) - 2px);
      background: transparent;
      color: var(--on-surface);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .sheet ::ng-deep button:hover:not(:disabled) {
      background: color-mix(in srgb, var(--brand) 10%, transparent);
    }
    .sheet ::ng-deep button:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }
    .sheet ::ng-deep button:disabled {
      color: var(--muted);
      cursor: not-allowed;
    }
    /* The destructive item. Red only on the text, matching the danger button
       variant - a solid red block in a dropdown reads as an error, not as a
       choice. */
    .sheet ::ng-deep button.is-danger {
      color: var(--error);
    }
    .sheet ::ng-deep button.is-danger:hover:not(:disabled) {
      background: var(--error-bg);
    }
    .sheet ::ng-deep hr {
      margin: 0.35rem 0.3rem;
      border: none;
      border-top: 1px solid var(--border);
    }
  `,
})
export class ActionMenu {
  /** Accessible name for the trigger - "Vitendo" / "Actions". */
  label = input('Actions');

  readonly open = signal(false);
  readonly top = signal(0);
  readonly left = signal(0);
  readonly flipped = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    // Scroll does NOT bubble, so a normal listener on document never sees the
    // app's own scrolling containers - and the sheet is fixed, so it would
    // hang in place while the row it belongs to slid away. Capture phase is
    // what catches every scroll, wherever it happens.
    const closeOnScroll = () => this.open.set(false);
    document.addEventListener('scroll', closeOnScroll, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', closeOnScroll, true);
    });
  }

  toggle(event: MouseEvent): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.position(event.currentTarget as HTMLElement);
    this.open.set(true);
  }

  /**
   * Places the sheet from the trigger's viewport rect: right-aligned to it,
   * and above it instead of below when there is not room underneath.
   *
   * The flip decision uses a rough height because the sheet does not exist
   * yet to be measured - but the RESULT is exact either way, because the
   * flipped sheet is anchored by its bottom edge with a transform rather than
   * by a computed top.
   */
  private position(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    const flip = rect.bottom + ESTIMATED_HEIGHT > window.innerHeight;

    this.flipped.set(flip);
    this.top.set(flip ? rect.top - GAP : rect.bottom + GAP);
    // Never off the left edge, however narrow the window is.
    this.left.set(Math.max(GAP, rect.right - MENU_WIDTH));
  }

  /**
   * Any click outside closes it. The trigger and the sheet both live inside
   * the host, so this leaves them alone - which is what lets the trigger keep
   * its own toggle behaviour.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  @HostListener('window:resize')
  onResize(): void {
    // The rect it was placed from is stale; re-measuring on every resize
    // frame is not worth it for a menu that is open for a second.
    this.open.set(false);
  }
}
