import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError, GraphQlErrorEntry } from '../models/api-error';
import { AuthErrorHandler } from './auth-error-handler';

interface GraphQlResponse<T> {
  data: T | null;
  errors?: GraphQlErrorEntry[];
}

/**
 * The GraphQL transport, with the same error contract as REST.
 *
 * Two things about GraphQL make this more than a thin wrapper:
 *
 *  1. A failed operation still answers **HTTP 200**, with the failure in an
 *     `errors[]` array. Nothing in the HTTP stack - interceptors included -
 *     treats that as an error, so this service is the only place that can
 *     notice it.
 *  2. The code lives in `extensions.errorCode`, not in the REST envelope.
 *
 * This used to be `throw new Error(messages.join('; '))`, which lost the code
 * and left a dead session looking identical to a validation failure. Now every
 * failure leaves here as an ApiError carrying `errorCode`, and session-level
 * codes go through the same AuthErrorHandler the REST interceptor uses.
 */
@Injectable({ providedIn: 'root' })
export class GraphqlService {
  private readonly http = inject(HttpClient);
  private readonly authErrorHandler = inject(AuthErrorHandler);

  query<T>(query: string, variables?: Record<string, unknown>): Observable<T> {
    return this.http
      .post<GraphQlResponse<T>>(environment.graphqlUrl, { query, variables })
      .pipe(
        map((res) => {
          const failure = this.readFailure(res);
          if (failure) {
            throw failure;
          }
          return res.data as T;
        }),
        catchError((err: unknown) => throwError(() => this.toApiError(err))),
      );
  }

  /**
   * An `errors[]` entry means the operation failed - even when `data` is also
   * present. Our resolvers do not return partial data, and half a dashboard
   * rendered as if it were whole is worse than an error, so any entry is
   * treated as a failure rather than silently dropped.
   */
  private readFailure<T>(res: GraphQlResponse<T>): ApiError | null {
    const entries = res.errors ?? [];
    if (entries.length === 0) {
      return null;
    }

    // Every code is offered to the session handler before anything is thrown:
    // if one entry says the session is gone, that outranks the rest.
    let sessionHandled = false;
    for (const entry of entries) {
      sessionHandled = this.authErrorHandler.handle(entry.extensions?.errorCode) || sessionHandled;
    }

    // The entry the caller gets is the one it can act on: a session failure
    // first, then any entry carrying a code, then simply the first (a schema
    // or parse error, which has no errorCode).
    const primary =
      entries.find((e) => this.authErrorHandler.isSessionCode(e.extensions?.errorCode)) ??
      entries.find((e) => !!e.extensions?.errorCode) ??
      entries[0];

    return ApiError.fromGraphQl(primary, sessionHandled);
  }

  /**
   * Non-200 answers from /graphql - a token that is missing, expired or
   * belongs to a disabled account is refused in the backend's filter chain,
   * before any resolver runs, so it comes back as the REST envelope with a
   * real status. Those must not be swallowed: they are routed through the
   * same handler, so a dead session behaves identically whichever API noticed.
   *
   * The interceptor has usually acted on this already (it runs first, on the
   * same response). Calling twice is harmless by design - `handle` is
   * idempotent - and it keeps this service correct on its own rather than
   * silently depending on an interceptor being registered.
   */
  private toApiError(err: unknown): unknown {
    if (err instanceof ApiError) {
      return err;
    }
    if (err instanceof HttpErrorResponse) {
      const code = (err.error as { errorCode?: string | null } | null | undefined)?.errorCode ?? null;
      return ApiError.fromHttp(err, this.authErrorHandler.handle(code));
    }
    return err;
  }
}
