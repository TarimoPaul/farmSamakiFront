import { Component, computed, inject, input, output } from '@angular/core';
import { Cycle, CYCLE_ACTIVE } from '../../../core/models/cycle';
import { LanguageService } from '../../../core/services/language';

const LABELS = {
  sw: {
    label: 'Mzunguko',
    placeholder: 'Chagua mzunguko…',
    unit: 'Kitengo',
    stocked: 'imepandwa',
    closed: 'umefungwa',
  },
  en: {
    label: 'Cycle',
    placeholder: 'Choose a cycle…',
    unit: 'Unit',
    stocked: 'stocked',
    closed: 'closed',
  },
} as const;

const LOCALE = { sw: 'sw-TZ', en: 'en-GB' } as const;

/**
 * Which cycle a logging screen is recording against, chosen ON that screen.
 *
 * It used to be chosen on Production only, and a feeder who opened Feeding
 * from the tab bar met "No cycle selected - go to Production, pick one, come
 * back": five taps before the first word of the log. The user asked for the
 * choice where the work is (2026-09-19), at every width.
 *
 * A plain native <select>, so the phone's own picker opens - the fastest
 * thing a thumb can use. Each cycle is named the way a worker knows it: the
 * unit, the fish, and when they went in ("Kitengo P1 · Kambale · imepandwa
 * 15 Sep"), which also tells two cycles of the same fish in one tank apart.
 *
 * It only REPORTS the pick; the screen writes it to CycleSelectionService,
 * the one selection Production and every logging screen share.
 */
@Component({
  selector: 'app-cycle-picker',
  template: `
    <label class="cycle-picker">
      <span class="cycle-picker__label">{{ words().label }}</span>
      <select
        class="cycle-picker__select"
        data-testid="cycle-picker"
        (change)="onChange($event)"
      >
        <!-- Also when the stored id is not in this farm's list (another
             farm's, or deleted): the control must not appear to name the
             first cycle when nothing on the page is about it. -->
        @if (!hasSelection()) {
          <option value="" selected disabled>{{ words().placeholder }}</option>
        }
        @for (cycle of options(); track cycle.cycleId) {
          <option [value]="cycle.cycleId" [selected]="isSelected(cycle)">
            {{ nameOf(cycle) }}
          </option>
        }
      </select>
    </label>
  `,
  styles: `
    .cycle-picker {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
    .cycle-picker__label {
      flex: none;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--on-surface);
    }
    /* Wide enough for "Kitengo P1 · Kambale · imepandwa 15 Sep" on a desk;
       the whole row on a phone. */
    /* The screens' .text-input look, restated: that class lives in each
       screen's own encapsulated styles and does not reach in here. */
    .cycle-picker__select {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 28rem;
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--on-surface);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .cycle-picker__select:focus {
      outline: none;
      border-color: var(--brand);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 16%, transparent);
    }
    @media (max-width: 640px) {
      .cycle-picker {
        flex-direction: column;
        align-items: stretch;
        gap: 0.35rem;
      }
      .cycle-picker__select {
        max-width: none;
        min-height: 44px;
      }
    }
  `,
})
export class CyclePicker {
  /** Every cycle the farm has; the picker offers the running ones. */
  readonly cycles = input.required<readonly Cycle[]>();
  readonly selectedId = input<number | null>(null);
  readonly picked = output<number>();

  private readonly languageService = inject(LanguageService);
  readonly words = computed(() => LABELS[this.languageService.lang()]);

  /**
   * The running cycles, unit by unit and oldest first - plus the selected one
   * if it has since closed, so the control never names a cycle it does not
   * list.
   */
  readonly options = computed(() =>
    this.cycles()
      .filter((cycle) => cycle.status === CYCLE_ACTIVE || this.isSelected(cycle))
      .slice()
      .sort(
        (a, b) =>
          a.unit.code.localeCompare(b.unit.code) || a.stockingDate.localeCompare(b.stockingDate),
      ),
  );

  readonly hasSelection = computed(() => this.options().some((cycle) => this.isSelected(cycle)));

  isSelected(cycle: Cycle): boolean {
    return Number(cycle.cycleId) === this.selectedId();
  }

  nameOf(cycle: Cycle): string {
    const w = this.words();
    const closed = cycle.status === CYCLE_ACTIVE ? '' : ` (${w.closed})`;
    return `${w.unit} ${cycle.unit.code} · ${cycle.speciesName} · ${w.stocked} ${this.day(cycle.stockingDate)}${closed}`;
  }

  onChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isInteger(value) && value > 0) {
      this.picked.emit(value);
    }
  }

  /** "15 Sep" - a calendar day, formatted in UTC from its own parts. */
  private day(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    try {
      return new Intl.DateTimeFormat(LOCALE[this.languageService.lang()], {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
      }).format(new Date(Date.UTC(year, month - 1, day)));
    } catch {
      return date;
    }
  }
}
