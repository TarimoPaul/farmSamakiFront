import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { authInterceptor } from './auth-interceptor';
import { ERROR_CODE } from '../models/error-codes';

const TOKEN_KEY = 'samakiFarm.token';
const SELECTED_FARM_KEY = 'samakiFarm.selectedFarmId';
const URL = 'http://localhost:8082/api/farms';

function setup() {
  const router = { url: '/dashboard', navigateByUrl: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: Router, useValue: router },
    ],
  });
  return {
    router,
    http: TestBed.inject(HttpClient),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

/** Fires a GET and resolves once it has settled, either way. */
function get(
  http: HttpClient,
  httpMock: HttpTestingController,
  body: object,
  status: { status: number; statusText: string },
) {
  return new Promise<{ request: ReturnType<HttpTestingController['expectOne']>; error?: unknown }>(
    (resolve) => {
      let request!: ReturnType<HttpTestingController['expectOne']>;
      http.get(URL).subscribe({
        next: () => resolve({ request }),
        error: (error: unknown) => resolve({ request, error }),
      });
      request = httpMock.expectOne(URL);
      request.flush(body, status);
    },
  );
}

describe('authInterceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('attaches the bearer token when there is one', async () => {
    const { http, httpMock } = setup();
    localStorage.setItem(TOKEN_KEY, 'a-real-token');

    const { request } = await get(http, httpMock, { success: true }, { status: 200, statusText: 'OK' });

    expect(request.request.headers.get('Authorization')).toBe('Bearer a-real-token');
  });

  it('sends the chosen farm as X-Farm-Id', async () => {
    // ROOT working inside farm 19. The backend applies it for this request
    // only - see FarmSelectionService.
    const { http, httpMock } = setup();
    localStorage.setItem(TOKEN_KEY, 'a-real-token');
    localStorage.setItem(SELECTED_FARM_KEY, '19');

    const { request } = await get(http, httpMock, { success: true }, { status: 200, statusText: 'OK' });

    expect(request.request.headers.get('X-Farm-Id')).toBe('19');
    expect(request.request.headers.get('Authorization')).toBe('Bearer a-real-token');
  });

  it('sends no X-Farm-Id when no farm has been chosen', async () => {
    // Every other account in the system is in this state, so the header must
    // be absent rather than empty - the backend reads "no selection" from its
    // absence.
    const { http, httpMock } = setup();
    localStorage.setItem(TOKEN_KEY, 'a-real-token');

    const { request } = await get(http, httpMock, { success: true }, { status: 200, statusText: 'OK' });

    expect(request.request.headers.has('X-Farm-Id')).toBe(false);
  });

  it('routes a 401 UNAUTHENTICATED to /login through the shared handler', async () => {
    const { http, httpMock, router } = setup();
    localStorage.setItem(TOKEN_KEY, 'expired-token');

    const { error } = await get(
      http,
      httpMock,
      { success: false, message: 'Hujaingia (login) - token haipo au si sahihi.', errorCode: 'UNAUTHENTICATED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    // Still re-thrown: the caller decides what to display.
    expect(error).toBeTruthy();
  });

  it('routes a 403 MUST_CHANGE_PASSWORD to /change-password', async () => {
    const { http, httpMock, router } = setup();
    localStorage.setItem(TOKEN_KEY, 'valid-but-gated');

    await get(
      http,
      httpMock,
      { success: false, message: 'Lazima ubadilishe password...', errorCode: 'MUST_CHANGE_PASSWORD' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(router.navigateByUrl).toHaveBeenCalledWith('/change-password');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('valid-but-gated');
  });

  it('leaves a 401 INVALID_CREDENTIALS to the form', async () => {
    const { http, httpMock, router } = setup();

    await get(
      http,
      httpMock,
      { success: false, message: 'Namba ya simu au password si sahihi.', errorCode: ERROR_CODE.INVALID_CREDENTIALS },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('leaves a 403 FORBIDDEN to the calling screen', async () => {
    const { http, httpMock, router } = setup();
    localStorage.setItem(TOKEN_KEY, 'valid-token');

    await get(
      http,
      httpMock,
      { success: false, message: 'Huna ruhusa ya kufikia rasilimali hii.', errorCode: ERROR_CODE.FORBIDDEN },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('valid-token');
  });
});
