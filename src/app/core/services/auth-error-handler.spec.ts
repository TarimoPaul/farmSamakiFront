import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthErrorHandler } from './auth-error-handler';
import { AuthService } from './auth';
import { ERROR_CODE } from '../models/error-codes';

const TOKEN_KEY = 'samakiFarm.token';
const MUST_CHANGE_KEY = 'samakiFarm.mustChangePassword';

/**
 * A stub Router: the real one would need routes and a browser URL, and what
 * matters here is only WHICH url the handler decided to go to.
 */
function routerStub(currentUrl = '/dashboard') {
  return { url: currentUrl, navigateByUrl: vi.fn().mockResolvedValue(true) };
}

function setup(currentUrl = '/dashboard') {
  const router = routerStub(currentUrl);
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: router }],
  });
  return {
    router,
    handler: TestBed.inject(AuthErrorHandler),
    authService: TestBed.inject(AuthService),
  };
}

describe('AuthErrorHandler', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('session-level codes', () => {
    it('UNAUTHENTICATED signs out and routes to /login', () => {
      localStorage.setItem(TOKEN_KEY, 'stale-token');
      const { handler, router, authService } = setup();

      expect(handler.handle(ERROR_CODE.UNAUTHENTICATED)).toBe(true);

      expect(authService.isLoggedIn()).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('ACCOUNT_DISABLED signs out and routes to /login', () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token-for-a-disabled-account');
      const { handler, router, authService } = setup();

      expect(handler.handle(ERROR_CODE.ACCOUNT_DISABLED)).toBe(true);

      expect(authService.isLoggedIn()).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('MUST_CHANGE_PASSWORD raises the gate and routes to /change-password', () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token');
      const { handler, router, authService } = setup();

      expect(handler.handle(ERROR_CODE.MUST_CHANGE_PASSWORD)).toBe(true);

      // The token stays: it is what /api/auth/change-password authenticates with.
      expect(authService.isLoggedIn()).toBe(true);
      expect(localStorage.getItem(MUST_CHANGE_KEY)).toBe('true');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/change-password');
    });
  });

  describe('codes that belong to the caller', () => {
    it('leaves INVALID_CREDENTIALS alone - it is a wrong password, not a dead session', () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token');
      const { handler, router, authService } = setup();

      expect(handler.handle(ERROR_CODE.INVALID_CREDENTIALS)).toBe(false);

      expect(authService.isLoggedIn()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it.each([
      ERROR_CODE.FORBIDDEN,
      ERROR_CODE.VALIDATION_ERROR,
      ERROR_CODE.CONFLICT,
      ERROR_CODE.NO_FARM_CONTEXT,
      ERROR_CODE.PENDING_APPROVAL,
      ERROR_CODE.TOO_MANY_REQUESTS,
    ])('leaves %s to the calling screen', (code) => {
      const { handler, router } = setup();

      expect(handler.handle(code)).toBe(false);
      expect(handler.isSessionCode(code)).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('does nothing for a missing code', () => {
      const { handler, router } = setup();

      expect(handler.handle(null)).toBe(false);
      expect(handler.handle(undefined)).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('idempotence - both transports may report the same dead session', () => {
    it('redirects once when handled twice in the same tick', () => {
      const { handler, router } = setup();

      handler.handle(ERROR_CODE.UNAUTHENTICATED);
      handler.handle(ERROR_CODE.UNAUTHENTICATED);

      expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    });

    it('does not redirect to the page it is already on', () => {
      const { handler, router } = setup('/login');

      expect(handler.handle(ERROR_CODE.UNAUTHENTICATED)).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });
});
