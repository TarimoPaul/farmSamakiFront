import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { ERROR_CODE } from '../models/error-codes';
import {
  ChangePasswordOutcome,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginOutcome,
  LoginRequest,
  LoginResponse,
  RegisterOutcome,
  RegisterRequest,
  RegistrationResponse,
  ResetPasswordRequest,
  UserSummary,
} from '../models/auth';

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const MUST_CHANGE_KEY = 'samakiFarm.mustChangePassword';

/** Reads ApiResponse.errorCode off a failed HttpErrorResponse, if present. */
function errorCodeOf(err: HttpErrorResponse): string | null {
  return (err.error as ApiResponse<unknown> | undefined)?.errorCode ?? null;
}

function messageOf(err: HttpErrorResponse, fallback: string): string {
  return (err.error as ApiResponse<unknown> | undefined)?.message ?? fallback;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  readonly currentUser = signal<UserSummary | null>(this.readStoredUser());

  /**
   * The forced-password-change gate.
   *
   * Persisted rather than kept in memory only: the user holds a *valid*
   * token while gated, so a page refresh would otherwise look like a normal
   * signed-in session and let them straight into the app - until the first
   * API call came back 403. The interceptor also sets this, so a gate raised
   * server-side mid-session is picked up too.
   */
  readonly mustChangePassword = signal<boolean>(localStorage.getItem(MUST_CHANGE_KEY) === 'true');

  /** Signed in AND past the gate - the condition for reaching the app itself. */
  readonly canUseApp = computed(() => this.isLoggedIn() && !this.mustChangePassword());

  login(req: LoginRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.baseUrl}/login`, req)
      .pipe(tap((res) => this.storeSession(res)));
  }

  /**
   * Login without exceptions: every outcome is mapped to a typed result so
   * the component renders the right message instead of guessing from a
   * status code.
   *
   * The identifier is treated as an email when it contains "@", otherwise as
   * a phone number - the backend takes one or the other, never both.
   */
  attemptLogin(identifier: string, password: string): Observable<LoginOutcome> {
    const req: LoginRequest = identifier.includes('@')
      ? { email: identifier, password }
      : { phone: identifier, password };

    return this.login(req).pipe(
      map((res): LoginOutcome => {
        const data = res.data!;
        // Login SUCCEEDS while gated - the token is real and works against
        // /api/auth/change-password. The gate is a routing concern, not a
        // failed login.
        return data.mustChangePassword
          ? { kind: 'must-change-password', user: data.user }
          : { kind: 'success', user: data.user };
      }),
      catchError((err: HttpErrorResponse): Observable<LoginOutcome> => {
        if (err.status === 0) {
          return of({ kind: 'network-error' });
        }
        switch (errorCodeOf(err)) {
          case ERROR_CODE.PENDING_APPROVAL:
            return of({ kind: 'pending-approval' });
          case ERROR_CODE.ACCOUNT_DISABLED:
            return of({ kind: 'account-disabled' });
          case ERROR_CODE.TOO_MANY_REQUESTS:
            return of({ kind: 'too-many-requests' });
          case ERROR_CODE.INVALID_CREDENTIALS:
            return of({ kind: 'invalid-credentials' });
          default:
            return of({ kind: 'network-error' });
        }
      }),
    );
  }

  /**
   * POST /api/auth/register - creates a PENDING_APPROVAL person and nothing
   * else: no farm, no membership, and NO token. Deliberately does not touch
   * the session; signing up must not sign you in.
   */
  register(req: RegisterRequest): Observable<ApiResponse<RegistrationResponse>> {
    return this.http.post<ApiResponse<RegistrationResponse>>(`${this.baseUrl}/register`, req);
  }

  attemptRegister(req: RegisterRequest): Observable<RegisterOutcome> {
    return this.register(req).pipe(
      map((): RegisterOutcome => ({ kind: 'pending' })),
      catchError((err: HttpErrorResponse): Observable<RegisterOutcome> => {
        if (err.status === 0) {
          return of({ kind: 'network-error' });
        }
        if (errorCodeOf(err) === ERROR_CODE.TOO_MANY_REQUESTS) {
          return of({ kind: 'too-many-requests' });
        }
        // 409 - phone or email already registered. The backend names which.
        if (err.status === 409) {
          return of({ kind: 'already-registered', message: messageOf(err, '') });
        }
        // 400 - bean validation (short password, bad email, missing field).
        if (err.status === 400) {
          return of({ kind: 'invalid', message: messageOf(err, '') });
        }
        return of({ kind: 'network-error' });
      }),
    );
  }

  /**
   * POST /api/auth/change-password - authenticated by the current token plus
   * the current password. NO OTP/SMS is involved, which is what makes this
   * usable as the way out of the forced-change gate even where SMS is not
   * configured.
   *
   * The token is NOT reissued: it carries nothing about the password, so it
   * stays valid and the request that was being blocked succeeds immediately.
   */
  changePassword(req: ChangePasswordRequest): Observable<ApiResponse<void>> {
    return this.http
      .post<ApiResponse<void>>(`${this.baseUrl}/change-password`, req)
      .pipe(tap(() => this.clearGate()));
  }

  attemptChangePassword(req: ChangePasswordRequest): Observable<ChangePasswordOutcome> {
    return this.changePassword(req).pipe(
      map((): ChangePasswordOutcome => ({ kind: 'success' })),
      catchError((err: HttpErrorResponse): Observable<ChangePasswordOutcome> => {
        if (err.status === 0) {
          return of({ kind: 'network-error' });
        }
        // 401 INVALID_CREDENTIALS here means "the current password you typed
        // is wrong" - a field error. It is NOT an expired session, and the
        // interceptor leaves it alone because the code is not UNAUTHENTICATED.
        if (errorCodeOf(err) === ERROR_CODE.INVALID_CREDENTIALS) {
          return of({ kind: 'wrong-current-password' });
        }
        // 400 - new password too short, or identical to the current one.
        if (err.status === 400) {
          return of({ kind: 'rejected', message: messageOf(err, '') });
        }
        return of({ kind: 'network-error' });
      }),
    );
  }

  forgotPassword(req: ForgotPasswordRequest): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/forgot-password`, req);
  }

  /** Reset via OTP also clears must_change_password server-side. */
  resetPassword(req: ResetPasswordRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.baseUrl}/reset-password`, req)
      .pipe(tap((res) => this.storeSession(res)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MUST_CHANGE_KEY);
    this.currentUser.set(null);
    this.mustChangePassword.set(false);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /** Raised by the interceptor when any call answers 403 MUST_CHANGE_PASSWORD. */
  raiseGate(): void {
    localStorage.setItem(MUST_CHANGE_KEY, 'true');
    this.mustChangePassword.set(true);
  }

  private clearGate(): void {
    localStorage.removeItem(MUST_CHANGE_KEY);
    this.mustChangePassword.set(false);
  }

  private storeSession(res: ApiResponse<LoginResponse>): void {
    if (!res.success || !res.data) {
      return;
    }
    localStorage.setItem(TOKEN_KEY, res.data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    this.currentUser.set(res.data.user);

    if (res.data.mustChangePassword) {
      this.raiseGate();
    } else {
      this.clearGate();
    }
  }

  private readStoredUser(): UserSummary | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as UserSummary;
    } catch {
      // Corrupt/legacy payload - treat as signed out rather than crashing
      // the app on boot.
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }
}