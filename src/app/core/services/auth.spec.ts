import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { FarmSelectionService } from './farm-selection';
import { UserSummary } from '../models/auth';
import { ApiError, isApiError } from '../models/api-error';
import { environment } from '../../../environments/environment';

const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const TOKEN_KEY = 'samakiFarm.token';
const SELECTED_FARM_KEY = 'samakiFarm.selectedFarmId';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

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

/**
 * The two failures ensurePermissions must tell apart.
 *
 * Both were captured from the running backend: the 403 is the envelope
 * `GlobalExceptionHandler.handleAccessDenied` builds (message + FORBIDDEN),
 * and the transport failure is what the browser reports with nothing serving
 * :8082 at all.
 */
const ME_FORBIDDEN = {
  success: false,
  message: 'Huna ruhusa ya kufikia rasilimali hii.',
  errorCode: 'FORBIDDEN',
};

const CACHED = ['manage_users', 'view_dashboard'];

/** A signed-in session whose cached permission set is already populated. */
function setupWithCache() {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(CACHED));
  localStorage.setItem(CAN_SELECT_FARM_KEY, 'true');
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    authService: TestBed.inject(AuthService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AuthService.ensurePermissions when /me fails', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('does NOT keep stale permissions when /me answers FORBIDDEN', async () => {
    // The whole point: RBAC is editable at runtime, so a revoked permission
    // arrives exactly like this. Resolving to the cached set here would leave
    // the nav offering admin screens the backend has just refused.
    const { authService, httpMock } = setupWithCache();
    expect(authService.hasPermission('manage_users')).toBe(true);

    const failure = firstValueFrom(authService.ensurePermissions()).catch(
      (err: unknown) => err,
    );
    httpMock
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush(ME_FORBIDDEN, { status: 403, statusText: 'Forbidden' });
    const error = await failure;

    // It threw rather than resolving to the cache...
    expect(isApiError(error)).toBe(true);
    expect((error as ApiError).errorCode).toBe('FORBIDDEN');
    expect((error as ApiError).status).toBe(403);
    // ...and the stale set is gone, in memory and in storage.
    expect(authService.permissions()).toEqual([]);
    expect(authService.hasPermission('manage_users')).toBe(false);
    expect(localStorage.getItem(PERMISSIONS_KEY)).toBeNull();
    // Granted by the same refused answer, so it goes with them.
    expect(authService.canSelectFarm()).toBe(false);
    httpMock.verify();
  });

  it('is not a log out - the session survives an authoritative refusal', async () => {
    const { authService, httpMock } = setupWithCache();

    const failure = firstValueFrom(authService.ensurePermissions()).catch(() => null);
    httpMock
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush(ME_FORBIDDEN, { status: 403, statusText: 'Forbidden' });
    await failure;

    // Signing the user out is AuthErrorHandler's job, and FORBIDDEN is
    // deliberately not one of its session codes.
    expect(authService.isLoggedIn()).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('a-token');
  });

  it('KEEPS the cached set when /me fails on the network', async () => {
    // Nothing authoritative was said: denying every guarded route because the
    // wifi dropped would lock out an admin who is perfectly entitled.
    const { authService, httpMock } = setupWithCache();

    const resolved = firstValueFrom(authService.ensurePermissions());
    httpMock
      .expectOne(`${environment.apiUrl}/auth/me`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(await resolved).toEqual(CACHED);
    expect(authService.permissions()).toEqual(CACHED);
    expect(authService.hasPermission('manage_users')).toBe(true);
    expect(localStorage.getItem(PERMISSIONS_KEY)).toBe(JSON.stringify(CACHED));
    httpMock.verify();
  });

  it('keeps the cached set for a session code, which the shared handler owns', async () => {
    // MUST_CHANGE_PASSWORD refuses /me while the gate is up. AuthErrorHandler
    // is already redirecting; this must not also wipe the session's cache.
    const { authService, httpMock } = setupWithCache();

    const resolved = firstValueFrom(authService.ensurePermissions());
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush(
      {
        success: false,
        message: 'Lazima ubadilishe password kabla ya kuendelea kutumia mfumo.',
        errorCode: 'MUST_CHANGE_PASSWORD',
      },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(await resolved).toEqual(CACHED);
    expect(authService.permissions()).toEqual(CACHED);
  });

  it('re-asks after a failure instead of replaying it for the whole session', async () => {
    // The answer is memoised; a FAILURE must not be, or one bad moment would
    // pin the session to it until the page is reloaded.
    const { authService, httpMock } = setupWithCache();

    const failure = firstValueFrom(authService.ensurePermissions()).catch(() => null);
    httpMock
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush(ME_FORBIDDEN, { status: 403, statusText: 'Forbidden' });
    await failure;

    // A second call makes a second request rather than replaying the error.
    const retried = firstValueFrom(authService.ensurePermissions());
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      success: true,
      data: { ...ME_ROOT_ON_FARM_19.data, permissions: ['view_dashboard'] },
    });

    expect(await retried).toEqual(['view_dashboard']);
    expect(authService.hasPermission('view_dashboard')).toBe(true);
    httpMock.verify();
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
