import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CycleSelectionService } from './cycle-selection';
import { AuthService } from './auth';

const SELECTED_CYCLE_KEY = 'samakiFarm.selectedCycleId';
const TOKEN_KEY = 'samakiFarm.token';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(CycleSelectionService);
}

describe('CycleSelectionService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts with nothing selected', () => {
    expect(setup().selectedCycleId()).toBeNull();
  });

  it('records a pick in the signal and in storage', () => {
    const service = setup();

    service.select(9);

    expect(service.selectedCycleId()).toBe(9);
    expect(localStorage.getItem(SELECTED_CYCLE_KEY)).toBe('9');
  });

  it('survives a page reload - which is the reason it is persisted at all', () => {
    localStorage.setItem(SELECTED_CYCLE_KEY, '9');

    // A fresh injector is a fresh page: the service reads storage on
    // construction, exactly as it would after F5 mid-way through recording.
    expect(setup().selectedCycleId()).toBe(9);
  });

  it('clears both the signal and the stored value', () => {
    const service = setup();
    service.select(9);

    service.clear();

    expect(service.selectedCycleId()).toBeNull();
    expect(localStorage.getItem(SELECTED_CYCLE_KEY)).toBeNull();
  });

  it('drops a corrupt stored value instead of carrying it into a request', () => {
    // A hand-edited or legacy value. Sending "abc" as a cycleId would be a
    // GraphQL type error the user could not possibly explain.
    localStorage.setItem(SELECTED_CYCLE_KEY, 'abc');

    const service = setup();

    expect(service.selectedCycleId()).toBeNull();
    expect(localStorage.getItem(SELECTED_CYCLE_KEY)).toBeNull();
  });

  it('is cleared by logging out - a cycle belongs to a farm, and a farm to a session', () => {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    const service = setup();
    service.select(9);

    TestBed.inject(AuthService).logout();

    expect(service.selectedCycleId()).toBeNull();
    expect(localStorage.getItem(SELECTED_CYCLE_KEY)).toBeNull();
  });
});
