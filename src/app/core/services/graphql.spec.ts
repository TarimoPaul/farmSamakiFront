import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { GraphqlService } from './graphql';
import { AuthService } from './auth';
import { ApiError, isApiError } from '../models/api-error';
import { ERROR_CODE } from '../models/error-codes';
import { environment } from '../../../environments/environment';

/**
 * Every payload below was captured verbatim from the running backend
 * (localhost:8082, 2026-08-24) - not invented. The HTTP status on each is the
 * one curl reported, which is the point of the fixture: three of these
 * failures answer **200**.
 */
const REAL = {
  /** No-role member -> `query { productionUnits { unitId code } }`. HTTP 200. */
  forbidden: {
    errors: [
      {
        message: "Huna ruhusa ya 'view_dashboard'.",
        locations: [{ line: 1, column: 9 }],
        path: ['productionUnits'],
        extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
      },
    ],
    data: null,
  },
  /** OWNER -> createProductionUnit with a code that already exists. HTTP 200. */
  conflict: {
    errors: [
      {
        message: 'Operesheni imekiuka vikwazo vya database (mfano: rudufu au uhusiano usiopo).',
        locations: [{ line: 1, column: 12 }],
        path: ['createProductionUnit'],
        extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
      },
    ],
    data: null,
  },
  /** OWNER -> createProductionUnit with type "SPACESHIP". HTTP 200. */
  validation: {
    errors: [
      {
        message: 'Aina ya kitengo si sahihi. Chagua: TANK, POND, BWAWA.',
        locations: [{ line: 1, column: 12 }],
        path: ['createProductionUnit'],
        extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
      },
    ],
    data: null,
  },
  /** ROOT (no farm) -> productionUnits. HTTP 200. */
  noFarmContext: {
    errors: [
      {
        message: 'ROOT hana shamba; tumia akaunti ya shamba husika.',
        locations: [{ line: 1, column: 9 }],
        path: ['productionUnits'],
        extensions: { errorCode: 'NO_FARM_CONTEXT', classification: 'FORBIDDEN' },
      },
    ],
    data: null,
  },
  /** No token at all -> /graphql. HTTP **401**, REST envelope, no errors[]. */
  unauthenticated: {
    success: false,
    message: 'Hujaingia (login) - token haipo au si sahihi.',
    errorCode: 'UNAUTHENTICATED',
  },
  /** Gated account -> /graphql, refused in the filter chain. HTTP **403**. */
  mustChangePassword: {
    success: false,
    message: 'Lazima ubadilishe password kabla ya kuendelea kutumia mfumo.',
    errorCode: 'MUST_CHANGE_PASSWORD',
  },
  /** Disabled mid-session -> /graphql. HTTP **403**. */
  accountDisabled: {
    success: false,
    message: 'Akaunti yako imezuiwa. Wasiliana na msimamizi.',
    errorCode: 'ACCOUNT_DISABLED',
  },
  /** OWNER -> productionUnits, nothing created yet. HTTP 200. */
  success: { data: { productionUnits: [] } },
};

const QUERY = 'query { productionUnits { unitId } }';
const TOKEN_KEY = 'samakiFarm.token';
const MUST_CHANGE_KEY = 'samakiFarm.mustChangePassword';

/**
 * NOTE: authInterceptor is deliberately NOT registered here. Non-200 answers
 * from /graphql must reach the shared handler through GraphqlService itself,
 * not only because an interceptor happens to be wired up in app.config.
 */
function setup() {
  const router = { url: '/dashboard', navigateByUrl: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Router, useValue: router },
    ],
  });
  return {
    router,
    service: TestBed.inject(GraphqlService),
    httpMock: TestBed.inject(HttpTestingController),
    authService: TestBed.inject(AuthService),
  };
}

/** Runs a query and resolves with whatever came back - value or error. */
function run<T>(
  service: GraphqlService,
  httpMock: HttpTestingController,
  body: object,
  status?: { status: number; statusText: string },
): Promise<{ data?: T; error?: unknown }> {
  return new Promise((resolve) => {
    service.query<T>(QUERY).subscribe({
      next: (data) => resolve({ data }),
      error: (error: unknown) => resolve({ error }),
    });
    const req = httpMock.expectOne(environment.graphqlUrl);
    expect(req.request.method).toBe('POST');
    req.flush(body, status);
  });
}

describe('GraphqlService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('returns data unchanged on success', async () => {
    const { service, httpMock, router } = setup();

    const { data, error } = await run<{ productionUnits: unknown[] }>(
      service,
      httpMock,
      REAL.success,
    );

    expect(error).toBeUndefined();
    expect(data).toEqual({ productionUnits: [] });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  describe('failures inside an HTTP 200 (errors[])', () => {
    it('surfaces FORBIDDEN as a typed error carrying the code', async () => {
      const { service, httpMock, router } = setup();

      const { data, error } = await run(service, httpMock, REAL.forbidden);

      expect(data).toBeUndefined();
      expect(isApiError(error)).toBe(true);

      const apiError = error as ApiError;
      expect(apiError.errorCode).toBe(ERROR_CODE.FORBIDDEN);
      expect(apiError.classification).toBe('FORBIDDEN');
      expect(apiError.path).toEqual(['productionUnits']);
      expect(apiError.message).toBe("Huna ruhusa ya 'view_dashboard'.");
      expect(apiError.status).toBe(200);
      expect(apiError.source).toBe('graphql');

      // Not a session failure: the user stays exactly where they are.
      expect(apiError.sessionHandled).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('surfaces VALIDATION_ERROR with the backend message a form can show on a field', async () => {
      const { service, httpMock } = setup();

      const { error } = await run(service, httpMock, REAL.validation);

      const apiError = error as ApiError;
      expect(apiError.errorCode).toBe(ERROR_CODE.VALIDATION_ERROR);
      expect(apiError.classification).toBe('BAD_REQUEST');
      expect(apiError.path).toEqual(['createProductionUnit']);
      expect(apiError.message).toBe('Aina ya kitengo si sahihi. Chagua: TANK, POND, BWAWA.');
    });

    it('surfaces CONFLICT with the code, not just a message', async () => {
      const { service, httpMock } = setup();

      const { error } = await run(service, httpMock, REAL.conflict);

      expect((error as ApiError).errorCode).toBe(ERROR_CODE.CONFLICT);
    });

    it('surfaces NO_FARM_CONTEXT without touching the session', async () => {
      const { service, httpMock, router } = setup();

      const { error } = await run(service, httpMock, REAL.noFarmContext);

      expect((error as ApiError).errorCode).toBe(ERROR_CODE.NO_FARM_CONTEXT);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('treats a session code inside errors[] exactly like the REST 401', async () => {
      const { service, httpMock, router, authService } = setup();
      localStorage.setItem(TOKEN_KEY, 'expired-token');

      const { error } = await run(service, httpMock, {
        errors: [
          {
            message: 'Hujaingia (login) - token haipo au si sahihi.',
            path: ['productionUnits'],
            extensions: { errorCode: 'UNAUTHENTICATED', classification: 'UNAUTHORIZED' },
          },
        ],
        data: null,
      });

      expect((error as ApiError).errorCode).toBe(ERROR_CODE.UNAUTHENTICATED);
      expect((error as ApiError).sessionHandled).toBe(true);
      expect(authService.isLoggedIn()).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('does not return partial data when a response carries both data and errors', async () => {
      const { service, httpMock } = setup();

      const { data, error } = await run(service, httpMock, {
        data: { productionUnits: [{ unitId: '27' }] },
        errors: [
          {
            message: "Huna ruhusa ya 'view_dashboard'.",
            path: ['cycles'],
            extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
          },
        ],
      });

      expect(data).toBeUndefined();
      expect((error as ApiError).errorCode).toBe(ERROR_CODE.FORBIDDEN);
    });

    it('picks the session failure when several errors come back together', async () => {
      const { service, httpMock, router } = setup();

      const { error } = await run(service, httpMock, {
        data: null,
        errors: [
          {
            message: 'Aina ya kitengo si sahihi.',
            extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
          },
          {
            message: 'Hujaingia (login) - token haipo au si sahihi.',
            extensions: { errorCode: 'UNAUTHENTICATED', classification: 'UNAUTHORIZED' },
          },
        ],
      });

      expect((error as ApiError).errorCode).toBe(ERROR_CODE.UNAUTHENTICATED);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });
  });

  describe('HTTP-level failures on the GraphQL endpoint', () => {
    it('401 UNAUTHENTICATED clears the session and routes to /login', async () => {
      const { service, httpMock, router, authService } = setup();
      localStorage.setItem(TOKEN_KEY, 'expired-token');

      const { error } = await run(service, httpMock, REAL.unauthenticated, {
        status: 401,
        statusText: 'Unauthorized',
      });

      const apiError = error as ApiError;
      expect(isApiError(error)).toBe(true);
      expect(apiError.errorCode).toBe(ERROR_CODE.UNAUTHENTICATED);
      expect(apiError.status).toBe(401);
      expect(apiError.source).toBe('http');
      expect(apiError.sessionHandled).toBe(true);
      expect(authService.isLoggedIn()).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('403 MUST_CHANGE_PASSWORD raises the gate and routes to /change-password', async () => {
      const { service, httpMock, router, authService } = setup();
      localStorage.setItem(TOKEN_KEY, 'valid-but-gated');

      const { error } = await run(service, httpMock, REAL.mustChangePassword, {
        status: 403,
        statusText: 'Forbidden',
      });

      expect((error as ApiError).errorCode).toBe(ERROR_CODE.MUST_CHANGE_PASSWORD);
      expect(localStorage.getItem(MUST_CHANGE_KEY)).toBe('true');
      expect(authService.isLoggedIn()).toBe(true);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/change-password');
    });

    it('403 ACCOUNT_DISABLED clears the session and routes to /login', async () => {
      const { service, httpMock, router, authService } = setup();
      localStorage.setItem(TOKEN_KEY, 'token-of-a-disabled-account');

      const { error } = await run(service, httpMock, REAL.accountDisabled, {
        status: 403,
        statusText: 'Forbidden',
      });

      expect((error as ApiError).errorCode).toBe(ERROR_CODE.ACCOUNT_DISABLED);
      expect(authService.isLoggedIn()).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('reports a dead connection as an ApiError with no code', async () => {
      const { service, httpMock, router } = setup();

      const error = await new Promise<unknown>((resolve) => {
        service.query(QUERY).subscribe({ error: resolve });
        httpMock
          .expectOne(environment.graphqlUrl)
          .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      });

      expect(isApiError(error)).toBe(true);
      expect((error as ApiError).errorCode).toBeNull();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });
});
