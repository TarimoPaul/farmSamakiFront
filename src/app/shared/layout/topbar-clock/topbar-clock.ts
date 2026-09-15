import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LanguageService } from '../../../core/services/language';

/**
 * EAT, for everyone, whatever the device says.
 *
 * The backend counts "today" in this zone (farmDailyTasks: Africa/Nairobi), so
 * a clock in any other zone could show a date the task sheet disagrees with -
 * a phone set to the wrong zone, or somebody opening the app abroad.
 */
export const FARM_TIME_ZONE = 'Africa/Nairobi';

const LOCALE = { sw: 'sw-TZ', en: 'en-GB' } as const;

/**
 * The topbar's time and date - "16:42 · Jumapili, 13 Septemba 2026".
 *
 * A read-out, not a control, which is why it sits on the canvas grey rather
 * than in a bordered box like the buttons beside it.
 *
 * It ticks ON the minute, not every 60 seconds from whenever it was built:
 * started at 16:42:50, a plain interval would show 16:42 until 16:43:50. And a
 * tab left in the background has its timers throttled by the browser, so it
 * also re-reads the clock the moment the tab is visible again.
 *
 * On a phone the date is hidden - there is no width for it - and a tap on the
 * time shows it. It stays in the accessibility tree either way.
 */
@Component({
  selector: 'app-topbar-clock',
  template: `
    <time
      class="clock"
      tabindex="0"
      [class.clock--open]="open()"
      [attr.datetime]="now().toISOString()"
      [attr.title]="dateLabel()"
      (click)="open.set(!open())"
      (keydown.enter)="open.set(!open())"
      (blur)="open.set(false)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span class="clock__time">{{ timeLabel() }}</span>
      <span class="clock__date">{{ dateLabel() }}</span>
    </time>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex: none;
    }
    .clock {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      height: var(--control-h, 36px);
      padding: 0 0.75rem;
      border-radius: var(--radius);
      background: var(--surface-alt);
      color: var(--on-surface);
      font-size: 0.82rem;
      white-space: nowrap;
      /* Digits of one width, so the row does not shuffle as the minutes change. */
      font-variant-numeric: tabular-nums;
    }
    .clock svg {
      width: 16px;
      height: 16px;
      flex: none;
      color: var(--muted);
    }
    .clock__time {
      font-weight: 800;
    }
    .clock__date {
      padding-left: 0.5rem;
      border-left: 1px solid var(--border);
      color: var(--muted);
    }
    .clock:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }

    /* Phone: the time alone. The date is clipped, not removed, so a screen
       reader still hears it - and a tap opens it under the clock. */
    @media (max-width: 640px) {
      .clock {
        padding: 0 0.6rem;
        cursor: pointer;
      }
      .clock__date {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .clock--open .clock__date {
        top: calc(100% + 6px);
        right: 0;
        z-index: 20;
        width: auto;
        height: auto;
        padding: 0.45rem 0.7rem;
        overflow: visible;
        clip-path: none;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--on-surface);
        box-shadow: 0 12px 24px -12px rgba(15, 35, 60, 0.35);
      }
    }
    @media (max-width: 400px) {
      .clock svg {
        display: none;
      }
    }
  `,
})
export class TopbarClock {
  private readonly languageService = inject(LanguageService);

  readonly now = signal(new Date());
  readonly open = signal(false);

  readonly timeLabel = computed(() =>
    new Intl.DateTimeFormat(LOCALE[this.languageService.lang()], {
      timeZone: FARM_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(this.now()),
  );

  readonly dateLabel = computed(() =>
    new Intl.DateTimeFormat(LOCALE[this.languageService.lang()], {
      timeZone: FARM_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(this.now()),
  );

  constructor() {
    const tick = () => this.now.set(new Date());

    // EAT is a whole-hour offset, so a UTC minute boundary is an EAT one.
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
