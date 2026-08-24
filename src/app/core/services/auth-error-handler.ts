import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth';
import { ERROR_CODE } from '../models/error-codes';

/**
 * The failures that end (or gate) the session itself, rather than failing one
 * operation. They are the ones no calling screen should have to handle: what
 * happens next is the same whoever asked, and it is navigation.
 *
 * Everything else - FORBIDDEN, VALIDATION_ERROR, CONFLICT, NO_FARM_CONTEXT,
 * PENDING_APPROVAL, INVALID_CREDENTIALS - belongs to the caller. In
 * particular INVALID_CREDENTIALS is NOT here: it means "the password you just
 * typed is wrong", which is a field error on a form, not an expired session.
 */
const SESSION_ERROR_CODES: readonly string[] = [
  ERROR_CODE.UNAUTHENTICATED,
  ERROR_CODE.ACCOUNT_DISABLED,
  ERROR_CODE.MUST_CHANGE_PASSWORD,
];

/**
 * The single place that turns a session-level `errorCode` into a session
 * action. Both transports call it: the HTTP `authInterceptor` for REST (and
 * for non-2xx answers from /graphql), and GraphqlService for the failures the
 * backend reports inside an HTTP-200 `errors[]` array.
 *
 * That second path is the whole reason this service exists. A resolver-level
 * FORBIDDEN or an expired session inside a GraphQL call arrives as **HTTP
 * 200**, so the interceptor never sees it - the app used to swallow it and
 * show "Failed to load data." while the user sat on a dead session.
 *
 * Keying is on `errorCode` ONLY, never the status: the same code means the
 * same thing at 200 (GraphQL) as at 401/403 (REST).
 */
@Injectable({ providedIn: 'root' })
export class AuthErrorHandler {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * The redirect currently in flight, if any. Both transports may report the
   * same dead session within one tick (a page firing several queries, or the
   * interceptor and GraphqlService both seeing one 401), and navigateByUrl is
   * async - without this, `router.url` would still read the old value and we
   * would start the same navigation twice.
   */
  private redirecting: string | null = null;

  isSessionCode(code: string | null | undefined): boolean {
    return !!code && SESSION_ERROR_CODES.includes(code);
  }

  /**
   * Performs the session action for `code`, if it has one.
   *
   * Returns whether the code was session-level, i.e. whether this call took
   * over. Safe to call for every failure and safe to call twice for the same
   * one - both are the normal case, not an edge case.
   */
  handle(code: string | null | undefined): boolean {
    switch (code) {
      case ERROR_CODE.UNAUTHENTICATED:
      case ERROR_CODE.ACCOUNT_DISABLED:
        // No usable session left either way: the token is gone/expired, or
        // the account behind it has been switched off mid-session.
        this.authService.logout();
        this.redirectTo('/login');
        return true;

      case ERROR_CODE.MUST_CHANGE_PASSWORD:
        // The gate can be raised server-side mid-session (an admin sets the
        // flag while the user is signed in), so it is picked up from any
        // failed call and not only from the login response.
        this.authService.raiseGate();
        this.redirectTo('/change-password');
        return true;

      default:
        return false;
    }
  }

  private redirectTo(url: string): void {
    const currentUrl = this.router.url.split(/[?#]/)[0];
    if (currentUrl === url || this.redirecting === url) {
      return;
    }
    this.redirecting = url;
    void this.router.navigateByUrl(url).finally(() => {
      if (this.redirecting === url) {
        this.redirecting = null;
      }
    });
  }
}
