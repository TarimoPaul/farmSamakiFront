import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth';
import { ApiResponse } from '../models/api-response';
import { ERROR_CODE } from '../models/error-codes';

/**
 * Attaches the bearer token, and turns the two session-level failures into
 * navigation so no individual component has to handle them.
 *
 * Both branches key on `errorCode`, NOT on the status code, and that
 * distinction is load-bearing:
 *
 *  - 401 UNAUTHENTICATED = no valid session -> sign out, go to /login.
 *  - 401 INVALID_CREDENTIALS = a wrong password was typed into a form
 *    (login, or the current-password field on change-password). Signing the
 *    user out for that would be wrong, so it is deliberately left to fall
 *    through to the component as a field error.
 *
 * Errors are re-thrown either way - the caller still decides what to show.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const code = (err.error as ApiResponse<unknown> | undefined)?.errorCode ?? null;

      if (err.status === 401 && code === ERROR_CODE.UNAUTHENTICATED) {
        authService.logout();
        router.navigateByUrl('/login');
      }

      if (err.status === 403 && code === ERROR_CODE.MUST_CHANGE_PASSWORD) {
        // The gate can be raised server-side mid-session (an admin sets the
        // flag while the user is signed in), so it is picked up here and not
        // only from the login response.
        authService.raiseGate();
        router.navigateByUrl('/change-password');
      }

      return throwError(() => err);
    }),
  );
};