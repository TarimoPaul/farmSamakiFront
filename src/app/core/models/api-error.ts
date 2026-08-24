import { HttpErrorResponse } from '@angular/common/http';
import { ApiResponse } from './api-response';

/**
 * Which transport the failure arrived on.
 *
 * `graphql` means it came out of a `errors[]` entry - an HTTP **200** that is
 * nevertheless a failure. `http` means a real non-2xx response carrying the
 * REST envelope (this includes calls to /graphql that were refused in the
 * backend's filter chain, before any resolver ran).
 */
export type ApiErrorSource = 'graphql' | 'http';

/** One GraphQL `errors[]` entry, as the backend actually sends it. */
export interface GraphQlErrorEntry {
  message: string;
  path?: (string | number)[];
  locations?: { line: number; column: number }[];
  extensions?: {
    /** The shared vocabulary - see ERROR_CODE. Absent on a schema/parse error. */
    errorCode?: string | null;
    /** graphql-java's own bucket: FORBIDDEN, BAD_REQUEST, INTERNAL_ERROR... */
    classification?: string | null;
    [key: string]: unknown;
  };
}

/**
 * A backend failure with its `errorCode` intact.
 *
 * The point of this class is what it does NOT do: it never collapses the
 * failure into a message string. GraphqlService used to throw
 * `new Error(messages.join('; '))`, which threw away `extensions.errorCode`
 * and left callers with Swahili prose to pattern-match on. A screen can now
 * branch on `errorCode` exactly as it does for REST.
 */
export class ApiError extends Error {
  /** The shared code, or null when the backend sent none (transport errors). */
  readonly errorCode: string | null;
  readonly classification: string | null;
  /** GraphQL field path, e.g. ['productionUnits']. Null for REST failures. */
  readonly path: readonly (string | number)[] | null;
  /** HTTP status. 200 for a GraphQL `errors[]` entry; 0 for a network failure. */
  readonly status: number;
  readonly source: ApiErrorSource;
  /**
   * True when AuthErrorHandler recognised this as a session-level failure and
   * has already signed the user out / redirected. Callers can use it to stay
   * quiet instead of flashing an error on a screen that is being replaced.
   */
  readonly sessionHandled: boolean;

  constructor(init: {
    message: string;
    errorCode: string | null;
    classification?: string | null;
    path?: readonly (string | number)[] | null;
    status: number;
    source: ApiErrorSource;
    sessionHandled?: boolean;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.errorCode = init.errorCode;
    this.classification = init.classification ?? null;
    this.path = init.path ?? null;
    this.status = init.status;
    this.source = init.source;
    this.sessionHandled = init.sessionHandled ?? false;
  }

  /** A GraphQL `errors[]` entry - always HTTP 200, never a thrown HttpErrorResponse. */
  static fromGraphQl(entry: GraphQlErrorEntry, sessionHandled: boolean): ApiError {
    return new ApiError({
      message: entry.message,
      errorCode: entry.extensions?.errorCode ?? null,
      classification: entry.extensions?.classification ?? null,
      path: entry.path ?? null,
      status: 200,
      source: 'graphql',
      sessionHandled,
    });
  }

  /**
   * A non-2xx response. The body is the REST envelope for anything the
   * backend refused deliberately; for a dead connection (status 0) there is
   * no envelope at all, so the code stays null and callers fall back to the
   * generic "connection" copy.
   */
  static fromHttp(err: HttpErrorResponse, sessionHandled: boolean): ApiError {
    const envelope = err.error as ApiResponse<unknown> | null | undefined;
    return new ApiError({
      message: envelope?.message ?? err.message,
      errorCode: envelope?.errorCode ?? null,
      status: err.status,
      source: 'http',
      sessionHandled,
    });
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
