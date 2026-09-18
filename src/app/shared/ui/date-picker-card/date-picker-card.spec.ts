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
