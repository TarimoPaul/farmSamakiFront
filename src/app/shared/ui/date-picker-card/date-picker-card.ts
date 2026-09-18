import { Component, computed, input, output, signal } from '@angular/core';

/** YYYY-MM-DD in LOCAL time - toISOString() would shift the day. */
export function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The week strip, as a rail card: pick a date and the screen answers for it.
 *
 * ONE implementation, shared. The dashboard had it first; Production asked for
 * the same thing, and a second copy of a calendar is how two screens end up
 * disagreeing about which day a week starts on.
 *
 * IT OWNS THE WEEK, NOT THE DATE. Paging the strip is browsing - it must not
 * change what the screen is showing - so `weekAnchor` lives here while the
 * selected date is the caller's, passed in and emitted back. The screen is the
 * only thing that knows what fetching a date costs.
 */
@Component({
  selector: 'app-date-picker-card',
  // NO .side-card wrapper in the template below.
  //
  // Angular scopes a component's styles to its OWN template, so a side-card
  // class written here would never be matched by the rules in production.scss
  // or dashboard.scss - it rendered as plain text on the canvas with no card
  // around it at all. The CALLER wraps this in the card instead, where the
  // class and the rule live in the same template, and nothing has to be
  // duplicated to make it work.
  template: `
    <div class="cal__head">
      <h3>{{ title() }}</h3>
      <span class="cal__nav">
        <button
          type="button"
          class="cal__arrow"
          [attr.aria-label]="previousLabel()"
          [attr.title]="previousLabel()"
          (click)="shiftWeek(-1)"
        >
          ‹
        </button>
        <button
          type="button"
          class="cal__arrow"
          [attr.aria-label]="nextLabel()"
          [attr.title]="nextLabel()"
          [disabled]="nextWeekBlocked()"
          (click)="shiftWeek(1)"
        >
          ›
        </button>
      </span>
    </div>

    <div class="cal">
      @for (day of weekDates(); track day.getTime(); let i = $index) {
        <button
          type="button"
          class="cal__day"
          [class.cal__day--today]="isToday(day)"
          [class.cal__day--selected]="isSelected(day)"
          [class.cal__day--future]="isFuture(day)"
          [disabled]="isFuture(day)"
          [attr.aria-pressed]="isSelected(day)"
          [attr.aria-label]="selectLabel() + ' ' + isoOf(day)"
          (click)="pick(day)"
        >
          <span class="cal__weekday">{{ weekdayLabels()[i] }}</span>
          <span class="cal__date">{{ day.getDate() }}</span>
        </button>
      }
    </div>

    <!-- Only away from today: on today there is nothing to explain, the
           numbers are the live ones. -->
    @if (state(); as line) {
      <p class="cal__state">
        {{ line }}
        <button type="button" class="cal__back" (click)="back.emit()">{{ backLabel() }}</button>
      </p>
    }
  `,
  styles: `
    /* The host sits INSIDE the caller's .side-card, so it has to be a block
       for the strip below it to lay out at the card's full width. */
    :host {
      display: block;
    }

    .cal__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .cal__nav {
      display: flex;
      gap: 0.15rem;
    }
    .cal__arrow {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1;
      cursor: pointer;
    }
    .cal__arrow:hover:not(:disabled) {
      color: var(--brand-dark);
      border-color: var(--brand);
    }
    .cal__arrow:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 1px;
    }
    /* Nowhere forward to go: the next week is entirely future. Shaded rather
       than hidden, so the control keeps its place and the strip does not
       change width when it comes back. */
    .cal__arrow:disabled {
      background: var(--surface-alt);
      color: var(--muted);
      cursor: not-allowed;
    }

    .cal {
      display: flex;
      justify-content: space-between;
      gap: 0.3rem;
    }

    /* A button, not a div: this is the control that changes the whole screen,
       so it has to be reachable by keyboard and announce its state. */
    .cal__day {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      padding: 0.5rem 0.2rem;
      border: 1px solid transparent;
      border-radius: 10px;
      background: none;
      font: inherit;
      cursor: pointer;
    }
    .cal__day:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 1px;
    }
    .cal__day--today {
      background: var(--brand-soft);
    }
    .cal__day--today .cal__date {
      color: var(--brand-dark);
    }
    /* The date being SHOWN, which on a past date is NOT today - the two are on
       screen at once and must not look the same. */
    .cal__day--selected {
      border-color: var(--brand);
    }

    /* A day that has not happened. Shaded and not clickable: every screen on
       this strip answers "what happened on this day", and no day after the
       caller's today has an answer. Both themes get this from tokens - the
       card's own --surface-alt behind the number, the label colour for the
       number itself - so the day reads as switched off on white and on slate
       without a value of its own. */
    .cal__day--future {
      background: var(--surface-alt);
      cursor: not-allowed;
    }
    .cal__day--future .cal__date,
    .cal__day--future .cal__weekday {
      color: var(--muted);
    }

    .cal__weekday {
      font-size: 0.68rem;
      color: var(--muted);
    }
    .cal__date {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--on-surface);
    }

    .cal__state {
      margin: 0.7rem 0 0;
      font-size: 0.74rem;
      line-height: 1.45;
      color: var(--muted);
    }
    .cal__back {
      margin-left: 0.35rem;
      padding: 0;
      border: none;
      background: none;
      color: var(--brand-dark);
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
})
export class DatePickerCard {
  title = input.required<string>();
  /** Mon..Sun, in the caller's language. */
  weekdayLabels = input.required<readonly string[]>();
  /** The date being shown, as YYYY-MM-DD. */
  selected = input.required<string>();
  previousLabel = input('');
  nextLabel = input('');
  selectLabel = input('');
  backLabel = input('');
  /** The line under the strip. Null hides it, which is what today looks like. */
  state = input<string | null>(null);

  /**
   * Which day the strip rings as "today", as YYYY-MM-DD.
   *
   * Defaults to the BROWSER's day, which is what every caller meant before
   * this input existed. Daily Tasks passes the FARM's day instead: it resolves
   * dates in Africa/Nairobi because the backend does, and a laptop in another
   * timezone - or anyone's laptop for a few hours either side of midnight -
   * would otherwise have the strip ringing one day while the screen's own
   * "is this today?" checks meant another.
   */
  today = input(isoDate(new Date()));

  picked = output<Date>();
  back = output<void>();

  private readonly weekAnchor = signal(new Date());

  readonly weekDates = computed(() => {
    const start = new Date(this.weekAnchor());
    const day = start.getDay(); // 0 = Sunday
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  });

  /**
   * A day that has not happened yet, by the CALLER's today.
   *
   * String comparison, because both sides are YYYY-MM-DD and that sorts
   * chronologically - the same test every screen on this strip already makes
   * against its own date fields.
   */
  isFuture(date: Date): boolean {
    return isoDate(date) > this.today();
  }

  /**
   * There is nowhere forward to go: every day of the next week is future.
   *
   * Keyed on the visible week's SUNDAY. Once that reaches today, paging
   * forward could only land on days nothing can be asked about. `‹` is never
   * blocked - the past is always readable.
   */
  readonly nextWeekBlocked = computed(() => isoDate(this.weekDates()[6]) >= this.today());

  /**
   * Browsing, not choosing: the shown date does not move with the strip.
   *
   * A forward move while blocked is a no-op rather than a silent jump into
   * an all-future week. The `›` button is disabled, so this only fires if
   * something calls it directly - and the rule should hold at whichever door
   * it is entered by.
   */
  shiftWeek(weeks: number): void {
    if (weeks > 0 && this.nextWeekBlocked()) {
      return;
    }
    const moved = new Date(this.weekAnchor());
    moved.setDate(moved.getDate() + weeks * 7);
    this.weekAnchor.set(moved);
  }

  /**
   * The click, guarded.
   *
   * `[disabled]` already stops the button, so this is the second lock: the
   * template could be changed, and `pick` is reachable from a test or a
   * host. A future day must never reach the caller - emitting one would have
   * the screen fetch a day it is about to refuse to draw.
   */
  pick(date: Date): void {
    if (this.isFuture(date)) {
      return;
    }
    this.picked.emit(date);
  }

  /** Brings the strip back to today's week - called when the screen resets. */
  resetWeek(): void {
    this.weekAnchor.set(new Date());
  }

  isToday(date: Date): boolean {
    return isoDate(date) === this.today();
  }

  isSelected(date: Date): boolean {
    return isoDate(date) === this.selected();
  }

  isoOf(date: Date): string {
    return isoDate(date);
  }
}
