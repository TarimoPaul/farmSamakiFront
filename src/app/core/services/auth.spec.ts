import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { FarmSelectionService } from './farm-selection';
import { UserSummary } from '../models/auth';
import { environment } from '../../../environments/environment';

const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const TOKEN_KEY = 'samakiFarm.token';
const SELECTED_FARM_KEY = 'samakiFarm.selectedFarmId';

/**
 * ROOT as `GET /api/auth/me` actually reports it: no farm at all (its access
 * is the isRoot flag, not a membership) and every permission code, because
 * describeCurrentUser expands the flag into the whole permission table.
 */
const ROOT: UserSummary = {
  id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
  name: 'Root',
  phone: '0700000000',
  status: 'ACTIVE',
  farmId: null,
  role: 'ROOT',
};

const FARM_OWNER: UserSummary = { ...ROOT, name: 'F Admin', farmId: 19, role: 'OWNER' };
const FARMLESS_MEMBER: UserSummary = { ...ROOT, name: 'D4 Norole', role: null };

function setup(user: UserSummary, permissions: string[]) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(AuthService);
}

/**
 * ROOT after picking farm 19: /me reports the farm the backend APPLIED, plus
 * the capability that says the switcher stays on screen.
 */
const ME_ROOT_ON_FARM_19 = {
  success: true,
  data: {
    id: ROOT.id,
    name: ROOT.name,
    phone: ROOT.phone,
    status: 'ACTIVE',
    farmId: 19,
    role: 'ROOT',
    permissions: ['manage_farms', 'view_dashboard'],
    canSelectFarm: true,
  },
};

function setupSession() {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    authService: TestBed.inject(AuthService),
    farmSelection: TestBed.inject(FarmSelectionService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AuthService and the chosen farm', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('learns canSelectFarm from /me, and reports the farm the backend applied', async () => {
    const { authService, httpMock } = setupSession();

    const loaded = firstValueFrom(authService.loadMe());
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush(ME_ROOT_ON_FARM_19);
    await loaded;

    expect(authService.canSelectFarm()).toBe(true);
    // farmId is the EFFECTIVE farm - proof the selection took effect.
    expect(authService.currentUser()?.farmId).toBe(19);
    // The capability is not smuggled into the stored user summary.
    expect(JSON.parse(localStorage.getItem(USER_KEY) ?? '{}')).not.toHaveProperty('canSelectFarm');
    httpMock.verify();
  });

  it('reads a missing canSelectFarm as "may not", not as truthy', async () => {
    // An older backend simply omits the field.
    const { authService, httpMock } = setupSession();
    const { canSelectFarm: _omitted, ...withoutTheField } = ME_ROOT_ON_FARM_19.data;

    const loaded = firstValueFrom(authService.loadMe());
    httpMock
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ success: true, data: withoutTheField });
    await loaded;

    expect(authService.canSelectFarm()).toBe(false);
  });

  it('drops the chosen farm on log out', () => {
    // It belongs to one session: left behind, the next person signing in on
    // this browser would send someone else's choice in a header.
    const { authService, farmSelection } = setupSession();
    farmSelection.select(19);

    authService.logout();

    expect(farmSelection.selectedFarmId()).toBeNull();
    expect(localStorage.getItem(SELECTED_FARM_KEY)).toBeNull();
    expect(authService.canSelectFarm()).toBe(false);
  });
});

describe('AuthService.landingUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('sends a farm administrator with no farm to /farms', () => {
    // The dashboard is farm-scoped, so ROOT landing there would open the app
    // on NO_FARM_CONTEXT rather than on a screen.
    const authService = setup(ROOT, ['manage_farms', 'approve_users', 'view_dashboard']);

    expect(authService.landingUrl()).toBe('/farms');
  });

  it('sends anyone who has a farm to /dashboard, permission or not', () => {
    const authService = setup(FARM_OWNER, ['manage_farms', 'manage_users', 'view_dashboard']);

    expect(authService.landingUrl()).toBe('/dashboard');
  });

  it('leaves a farmless member on /dashboard - there is nowhere better', () => {
    // They cannot manage farms, so /farms would only be refused by its guard.
    // The dashboard tells them to ask their administrator.
    const authService = setup(FARMLESS_MEMBER, ['view_dashboard']);

    expect(authService.landingUrl()).toBe('/dashboard');
  });

  it('does not fall over when there is no stored session at all', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    expect(TestBed.inject(AuthService).landingUrl()).toBe('/dashboard');
  });
});
