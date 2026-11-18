import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatePickerCard, isoDate } from './date-picker-card';

/**
 * The week-strip's own tests, and specifically the `today` input.
 *
 * It exists because Daily Tasks resolves dates in the FARM's timezone
 * (Africa/Nairobi) while this component used to ring the browser's day. Those
 * are the same string on a machine that happens to sit in EAT - the one this
 * was written on - so a test comparing the two values there proves nothing.
 * These drive the input to a day that is definitely NOT the browser's and
 * watch the ring move, which discriminates on any machine in any zone.
 */
describe('DatePickerCard', () => {
  let fixture: ComponentFixture<DatePickerCard>;

  /** The Mon..Sun the strip draws for the browser's current week. */
  function weekOnScreen(): Date[] {
    return fixture.componentInstance.weekDates();
  }

  const ringedDay = () =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('.cal__day--today')
      ?.getAttribute('aria-label')
      ?.trim();

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(DatePickerCard);
    fixture.componentRef.setInput('title', 'Pick a date');
    fixture.componentRef.setInput('weekdayLabels', ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
    fixture.componentRef.setInput('selected', isoDate(new Date()));
    fixture.componentRef.setInput('selectLabel', 'Show date');
    fixture.detectChanges();
  });

  it("rings the browser's day when nothing says otherwise", () => {
    // The default, which is what the six callers that predate the input get.
    expect(fixture.componentInstance.today()).toBe(isoDate(new Date()));
    expect(ringedDay()).toContain(isoDate(new Date()));
  });

  it("rings the day it is GIVEN, not the browser's", () => {
    // Two days from the week on screen that are explicitly NOT the browser's
    // day - otherwise, on whichever weekday the suite happens to run, this
    // would pass just as well with the input ignored.
    const browserDay = isoDate(new Date());
    const [first, second] = weekOnScreen()
      .map(isoDate)
      .filter((day) => day !== browserDay);

    fixture.componentRef.setInput('today', first);
    fixture.detectChanges();
    expect(ringedDay()).toContain(first);
    expect(ringedDay()).not.toContain(browserDay);

    // And it MOVES with the input - the ring is not the browser's day pinned
    // at construction, which is what the old `private readonly today` was.
    fixture.componentRef.setInput('today', second);
    fixture.detectChanges();
    expect(ringedDay()).toContain(second);
    expect(ringedDay()).not.toContain(first);
  });

  it('rings nothing when the given day is outside the week on screen', () => {
    const faraway = new Date(weekOnScreen()[0]);
    faraway.setDate(faraway.getDate() - 30);

    fixture.componentRef.setInput('today', isoDate(faraway));
    fixture.detectChanges();

    expect(ringedDay()).toBeUndefined();
  });

  /*
   * A day after the caller's today has nothing to answer: every one of the
   * seven screens on this strip asks "what happened on this date". So a
   * future day is shaded and dead, and the week cannot be paged into one.
   *
   * "Today" is pinned to the WEDNESDAY of the week on screen rather than left
   * at the real one, so Thu-Sun are future on whichever weekday the suite
   * runs, and Mon-Wed are not. Nothing here depends on the machine's date.
   */
  describe('blocking future days', () => {
    const days = () => [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.cal__day'),
    ];
    const arrows = () => [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.cal__arrow'),
    ];
    const previousArrow = () => arrows()[0];
    const nextArrow = () => arrows()[1];

    /** Mon..Sun as ISO, with today pinned to index 2 (Wednesday). */
    function pinToMidweek(): string[] {
      const week = weekOnScreen().map(isoDate);
      fixture.componentRef.setInput('today', week[2]);
      fixture.detectChanges();
      return week;
    }

    /** Every date the strip emits while `run` executes. */
    function emitted(run: () => void): Date[] {
      const seen: Date[] = [];
      const sub = fixture.componentInstance.picked.subscribe((date) => seen.push(date));
      run();
      sub.unsubscribe();
      return seen;
    }

    it('shades and disables every day after today, and only those', () => {
      pinToMidweek();

      const state = days().map((button) => ({
        disabled: button.disabled,
        shaded: button.classList.contains('cal__day--future'),
      }));

      // Mon Tue Wed live; Thu Fri Sat Sun dead.
      expect(state).toEqual([
        { disabled: false, shaded: false },
        { disabled: false, shaded: false },
        { disabled: false, shaded: false },
        { disabled: true, shaded: true },
        { disabled: true, shaded: true },
        { disabled: true, shaded: true },
        { disabled: true, shaded: true },
      ]);
    });

    it('still emits for today and for a past day', () => {
      const week = pinToMidweek();

      const picks = emitted(() => {
        days()[0].click(); // Monday, past
        days()[2].click(); // Wednesday, today
      });

      expect(picks.map(isoDate)).toEqual([week[0], week[2]]);
    });

    it('emits nothing when a future day is clicked - no selection, no fetch', () => {
      pinToMidweek();

      const picks = emitted(() => {
        days()[3].click();
        days()[6].click();
      });

      expect(picks).toEqual([]);
    });

    it('emits nothing when pick() is called directly with a future day', () => {
      pinToMidweek();
      const futureDay = weekOnScreen()[5];

      // The second lock. `[disabled]` stops the button, but the method is
      // reachable from a host or a test, and a future day must never reach
      // the caller by ANY door.
      const picks = emitted(() => fixture.componentInstance.pick(futureDay));

      expect(picks).toEqual([]);
    });

    it('disables the next arrow once the visible week reaches today, and never the previous', () => {
      pinToMidweek();

      // Today is inside the week on screen, so the whole next week is future.
      expect(fixture.componentInstance.nextWeekBlocked()).toBe(true);
      expect(nextArrow().disabled).toBe(true);
      expect(previousArrow().disabled).toBe(false);
    });

    it("re-enables the next arrow on a past week, and paging forward stops at today's", () => {
      const week = pinToMidweek();

      previousArrow().click();
      fixture.detectChanges();

      // A week entirely behind today: forward is open again.
      expect(fixture.componentInstance.nextWeekBlocked()).toBe(false);
      expect(nextArrow().disabled).toBe(false);

      nextArrow().click();
      fixture.detectChanges();

      // Back where we started, and blocked again - not one week further.
      expect(weekOnScreen().map(isoDate)).toEqual(week);
      expect(nextArrow().disabled).toBe(true);
    });

    it('ignores shiftWeek(1) while blocked, whoever calls it', () => {
      const week = pinToMidweek();

      fixture.componentInstance.shiftWeek(1);
      fixture.detectChanges();

      expect(weekOnScreen().map(isoDate)).toEqual(week);
    });

    it("blocks by the CALLER's today, so a farm-day caller shades a different set", () => {
      const week = pinToMidweek();
      expect(days()[3].disabled).toBe(true);

      // One day later - as Africa/Nairobi is, ahead of a browser west of it.
      fixture.componentRef.setInput('today', week[3]);
      fixture.detectChanges();

      expect(days()[3].disabled).toBe(false);
      expect(days()[4].disabled).toBe(true);
    });
  });

  it('pages the week without moving the selected date', () => {
    const selected = fixture.componentInstance.selected();
    const before = weekOnScreen().map(isoDate);

    fixture.componentInstance.shiftWeek(-1);
    fixture.detectChanges();

    // Browsing, not choosing - the caller's date is untouched.
    expect(fixture.componentInstance.selected()).toBe(selected);
    expect(weekOnScreen().map(isoDate)).not.toEqual(before);

    fixture.componentInstance.resetWeek();
    fixture.detectChanges();
    expect(weekOnScreen().map(isoDate)).toEqual(before);
  });
});
