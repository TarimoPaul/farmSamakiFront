import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  GuardResult,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { isObservable, firstValueFrom, of } from 'rxjs';
import { permissionGuard } from './auth-guard';
import { AuthService } from '../services/auth';
import { PERMISSION } from '../models/permissions';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const MUST_CHANGE_KEY = 'samakiFarm.mustChangePassword';

/** Captured from the running backend: GET /api/auth/me for the FARMS_ONLY role. */
const ME_FARMS_ONLY = {
  success: true,
  data: {
    id: '756444a2-68eb-46b4-9d12-07a04567f469',
    name: 'F FarmsOnly',
    phone: '0788200222',
    status: 'ACTIVE',
    farmId: 19,
    role: 'FARMS_ONLY',
    permissions: ['manage_farms', 'view_dashboard'],
  },
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  return {
    router: TestBed.inject(Router),
    authService: TestBed.inject(AuthService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

/** Guards run in an injection context and may answer synchronously or async. */
async function run(permission: string): Promise<GuardResult> {
  const result = TestBed.runInInjectionContext(() =>
    permissionGuard(permission)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return firstValueFrom(isObservable(result) ? result : of(result));
}

describe('permissionGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('lets a holder of the code through', async () => {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
    const { authService } = setup();
    // Already loaded this session, so no /me is needed.
    authService.ensurePermissions = () => of(authService.permissions());

    expect(await run(PERMISSION.MANAGE_FARMS)).toBe(true);
  });

  it('sends someone without the code to /dashboard, not to /login', async () => {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard', 'log_feeding']));
    const { authService, router } = setup();
    authService.ensurePermissions = () => of(authService.permissions());

    const result = await run(PERMISSION.MANAGE_FARMS);

    expect(result).toEqual(router.parseUrl('/dashboard'));
  });

  it('sends a signed-out visitor to /login', async () => {
    const { router } = setup();

    expect(await run(PERMISSION.MANAGE_FARMS)).toEqual(router.parseUrl('/login'));
  });

  it('sends a gated user to /change-password, permission or not', async () => {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(MUST_CHANGE_KEY, 'true');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms']));
    const { router } = setup();

    expect(await run(PERMISSION.MANAGE_FARMS)).toEqual(router.parseUrl('/change-password'));
  });

  it('asks /me when the stored permissions are missing, instead of denying', async () => {
    // A session that predates this feature, or cleared site data: the token is
    // good, the cache is empty. Denying here would lock out a real admin.
    localStorage.setItem(TOKEN_KEY, 'a-token');
    const { httpMock } = setup();

    const decision = run(PERMISSION.MANAGE_FARMS);
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush(ME_FARMS_ONLY);

    expect(await decision).toBe(true);
    httpMock.verify();
  });

  it('shares one /me across guards resolving together', async () => {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    const { httpMock } = setup();

    const first = run(PERMISSION.MANAGE_FARMS);
    const second = run(PERMISSION.MANAGE_FARMS);
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush(ME_FARMS_ONLY);

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    // expectOne above already proves there was exactly one.
    httpMock.verify();
  });
});
