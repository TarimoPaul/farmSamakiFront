import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth';
import { AuthErrorHandler } from '../services/auth-error-handler';
import { FarmSelectionService } from '../services/farm-selection';
import { ApiResponse } from '../models/api-response';

/**
 * Attaches the bearer token, and hands every failed response's `errorCode` to
 * AuthErrorHandler, which owns what a session-level failure does.
 *
 * The session logic used to live here as two inline `if` blocks. It moved out
 * because GraphQL needs exactly the same behaviour and cannot reuse an
 * interceptor: a resolver failure comes back as HTTP **200** with an
 * `errors[]` array, so this catchError never runs for it. One copy of the
 * rule, two callers - see AuthErrorHandler.
 *
 * Keying is on `errorCode`, NOT on the status code, and that distinction is
 * load-bearing:
 *
 *  - 401 UNAUTHENTICATED = no valid session -> sign out, go to /login.
 *  - 401 INVALID_CREDENTIALS = a wrong password was typed into a form
 *    (login, or the current-password field on change-password). Signing the
 *    user out for that would be wrong, so the handler deliberately ignores
 *    it and it falls through to the component as a field error.
 *
 * Errors are re-thrown either way - the caller still decides what to show.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const authErrorHandler = inject(AuthErrorHandler);
  const token = authService.getToken();
  const farmId = inject(FarmSelectionService).selectedFarmId();

  // X-Farm-Id is ROOT's "work in this farm for this request" (see
  // FarmSelectionService). It goes on EVERY call, REST and GraphQL alike:
  // both transports run through this interceptor, and the backend needs the
  // farm on the request that reads the data as much as on /me, which reports
  // back which farm was applied.
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (farmId !== null) {
    headers['X-Farm-Id'] = String(farmId);
  }

  const request = Object.keys(headers).length > 0 ? req.clone({ setHeaders: headers }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const code = (err.error as ApiResponse<unknown> | undefined)?.errorCode ?? null;
      authErrorHandler.handle(code);
      return throwError(() => err);
    }),
  );
};
