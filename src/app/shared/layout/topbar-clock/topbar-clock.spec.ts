import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopbarClock } from './topbar-clock';
import { LanguageService } from '../../../core/services/language';

/**
 * 13:42:30 UTC - which is 16:42:30 in EAT, a Sunday.
 *
 * Stated in UTC on purpose: the clock must show EAT whatever zone the machine
 * running the test is in, and a local-time fixture would hide exactly that.
 */
const NOW = new Date('2026-09-13T13:42:30Z');

function setup() {
  const fixture = TestBed.createComponent(TopbarClock);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    element,
    time: () => element.querySelector('.clock__time')!.textContent!.trim(),
    date: () => element.querySelector('.clock__date')!.textContent!.trim(),
  };
}

describe('TopbarClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the time in EAT, 24-hour, whatever zone the device is in', () => {
    const { element, time } = setup();

    expect(time()).toBe('16:42');
    expect(element.querySelector('time')!.getAttribute('datetime')).toBe(NOW.toISOString());
  });

  it('writes the date in Swahili by default, with the year', () => {
    const { date } = setup();

    expect(date()).toContain('Jumapili');
    expect(date()).toContain('Septemba');
    expect(date()).toContain('13');
    expect(date()).toContain('2026');
  });

  it('follows the language', () => {
    const { fixture, date } = setup();

    TestBed.inject(LanguageService).setLang('en');
    fixture.detectChanges();

    expect(date()).toContain('Sunday');
    expect(date()).toContain('September');
    expect(date()).toContain('2026');
  });

  it('moves on the minute boundary, not a minute after it was built', () => {
    const { fixture, time } = setup();

    // Built at :30 - thirty seconds later it is already 16:43.
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();
    expect(time()).toBe('16:43');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(time()).toBe('16:44');
  });

  it('opens the date on a tap, for the phone layout that hides it', () => {
    const { fixture, element } = setup();
    const clock = element.querySelector<HTMLElement>('time')!;

    clock.click();
    fixture.detectChanges();
    expect(clock.classList.contains('clock--open')).toBe(true);

    clock.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(clock.classList.contains('clock--open')).toBe(false);
  });
});
