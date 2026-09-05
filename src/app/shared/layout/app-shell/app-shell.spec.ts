import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AppShell } from './app-shell';
import { AuthService } from '../../../core/services/auth';
import { FarmSelectionService } from '../../../core/services/farm-selection';
import { environment } from '../../../../environments/environment';

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

/** Two farms, as `GET /api/farms` returns them to a manage_farms holder. */
const FARMS_RESPONSE = {
  success: true,
  data: [
    { farmId: 1, name: 'Test Farm E2E', location: 'Mbeya', ownerName: null },
    { farmId: 2, name: 'Shamba la Majaribio', location: 'Iringa', ownerName: null },
  ],
};

/** ROOT before it has picked anything: every permission, and no farm. */
function signIn(options: { canSelectFarm: boolean; farmId: number | null }) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
  localStorage.setItem(CAN_SELECT_FARM_KEY, String(options.canSelectFarm));
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
      name: 'System Root',
      phone: '0700000000',
      status: 'ACTIVE',
      farmId: options.farmId,
      role: 'ROOT',
    }),
  );
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(AppShell);
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AppShell farm switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('is hidden - and costs no request - for an account that may not select a farm', () => {
    // Everyone except ROOT. They work in their own farm and have nothing to switch.
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();

    expect(element.querySelector('.dash-farm__select')).toBeNull();
    httpMock.expectNone(`${environment.apiUrl}/farms`);
  });

  it('offers every farm, with none chosen yet', () => {
    signIn({ canSelectFarm: true, farmId: null });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/farms`).flush(FARMS_RESPONSE);
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select');
    expect(select).not.toBeNull();
    expect(Array.from(select!.options).map((o) => o.textContent?.trim())).toEqual([
      'Chagua shamba…', // Swahili is the app default
      'Test Farm E2E',
      'Shamba la Majaribio',
    ]);
    // Nothing picked: the placeholder is the selected option.
    expect(select!.value).toBe('');
    httpMock.verify();
  });

  it('records the pick and re-asks /me for the farm the backend applied', () => {
    signIn({ canSelectFarm: true, farmId: null });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/farms`).flush(FARMS_RESPONSE);
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(TestBed.inject(FarmSelectionService).selectedFarmId()).toBe(2);
    expect(localStorage.getItem('samakiFarm.selectedFarmId')).toBe('2');

    // /me is what turns a request into a fact: its farmId is the farm the
    // backend actually applied.
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      success: true,
      data: {
        id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
        name: 'System Root',
        phone: '0700000000',
        status: 'ACTIVE',
        farmId: 2,
        role: 'ROOT',
        permissions: ['manage_farms', 'view_dashboard'],
        canSelectFarm: true,
      },
    });
    fixture.detectChanges();

    expect(TestBed.inject(AuthService).currentUser()?.farmId).toBe(2);
    // The switcher shows what the backend applied, so it stays visible and
    // now names farm 2.
    expect(element.querySelector<HTMLSelectElement>('.dash-farm__select')!.value).toBe('2');
    httpMock.verify();
  });

  it('falls back to "no farm chosen" when the backend refuses the pick', () => {
    // A farm that has since been deleted: the header is ignored, /me still
    // answers farmId null, and the control must not claim farm 2 is in use.
    signIn({ canSelectFarm: true, farmId: null });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/farms`).flush(FARMS_RESPONSE);
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      success: true,
      data: {
        id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
        name: 'System Root',
        phone: '0700000000',
        status: 'ACTIVE',
        farmId: null,
        role: 'ROOT',
        permissions: ['manage_farms', 'view_dashboard'],
        canSelectFarm: true,
      },
    });
    fixture.detectChanges();

    expect(element.querySelector<HTMLSelectElement>('.dash-farm__select')!.value).toBe('');
    httpMock.verify();
  });
});

/**
 * The Feed Catalogue entry, which is the first feed-related nav item to carry
 * a permission at all.
 *
 * It matters because the two feed screens sit next to each other and are gated
 * differently: Feeding is a read screen every role reaches, while both
 * catalogue endpoints are `manage_feed_stock` on the backend. An entry offered
 * to a feeder would land them on a guard, so the nav must not offer it.
 */
describe('AppShell nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function navLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers the Feed Catalogue to a manage_feed_stock holder', () => {
    const labels = navLabels(['view_dashboard', 'log_feeding', 'manage_feed_stock']);

    expect(labels).toContain('Katalogi ya Chakula');
    expect(labels).toContain('Malisho');
  });

  it('hides it from a feeder, who still gets Feeding', () => {
    // `view_feed_stock` SEES the stock panel; it does not write the catalogue.
    const labels = navLabels(['view_dashboard', 'log_feeding', 'view_feed_stock']);

    expect(labels).not.toContain('Katalogi ya Chakula');
    expect(labels).toContain('Malisho');
  });
});
