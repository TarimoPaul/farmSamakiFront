import { HttpErrorResponse } from '@angular/common/http';
import { MonoTypeOperatorFunction, catchError, throwError } from 'rxjs';
import { ApiError } from '../models/api-error';
import { ApiResponse } from '../models/api-response';
import { AuthErrorHandler } from '../services/auth-error-handler';

/**
 * Turns a failed REST call into the same ApiError a failed GraphQL call
 * produces, so a screen has ONE error shape to branch on whichever API it
 * happens to be talking to.
 *
 * It does not act on the failure - `authInterceptor` has already handed the
 * code to AuthErrorHandler by the time this runs. The handler is passed in
 * only to ask whether the code WAS session-level, which is what tells a screen
 * to stay quiet because it is already being navigated away from.
 *
 * ```ts
 * this.http.get<ApiResponse<Farm[]>>(url).pipe(map(…), restError(this.authErrorHandler))
 * ```
 */
export function restError<T>(authErrorHandler: AuthErrorHandler): MonoTypeOperatorFunction<T> {
  return catchError((err: unknown) => {
    if (err instanceof HttpErrorResponse) {
      const code = (err.error as ApiResponse<unknown> | null | undefined)?.errorCode ?? null;
      return throwError(() => ApiError.fromHttp(err, authErrorHandler.isSessionCode(code)));
    }
    return throwError(() => err);
  });
}
