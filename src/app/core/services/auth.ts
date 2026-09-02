import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from '../models/api-error';
import { ApiResponse } from '../models/api-response';
import { ERROR_CODE } from '../models/error-codes';
import { PERMISSION } from '../models/permissions';
import { CycleSelectionService } from './cycle-selection';
import { FarmSelectionService } from './farm-selection';
import {
  ChangePasswordOutcome,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginOutcome,
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterOutcome,
  RegisterRequest,
  RegistrationResponse,
  ResetPasswordRequest,
  UserSummary,
} from '../models/auth';

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const MUST_CHANGE_KEY = 'samakiFarm.mustChangePassword';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

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
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly cycleSelection = inject(CycleSelectionService);
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

  /**
   * What this user is allowed to do, from `GET /api/auth/me`. THE source for
   * every piece of UI gating - see PERMISSION and hasPermission().
   *
   * Persisted like the token, and for the same reason: on a page refresh the
   * nav and the route guards need an answer immediately, and waiting for /me
   * would mean rendering the app once without its admin entries and again
   * with them. The stored copy is a cache, never the authority - it is
   * refreshed on every login and once per app start, and the backend refuses
   * the call anyway if it is wrong.
   */
  readonly permissions = signal<readonly string[]>(this.readStoredPermissions());

  /**
   * Whether this account may choose a farm it does not belong to - from /me.
   *
   * Persisted alongside the permissions, for the same reason: the switcher
   * has to render correctly on the first paint after a refresh, not one /me
   * later.
   */
  readonly canSelectFarm = signal<boolean>(localStorage.getItem(CAN_SELECT_FARM_KEY) === 'true');

  /** In-flight (or completed) /me call, so concurrent guards ask only once. */
  private mePermissions$: Observable<readonly string[]> | null = null;

  hasPermission(code: string): boolean {
    return this.permissions().includes(code);
  }

  /**
   * Where a signed-in user belongs when no particular screen was asked for.
   *
   * NOT always /dashboard. The dashboard is farm-scoped - `productionUnits`
   * and `cycles` both resolve through the backend's requireFarmScope, which
   * refuses NO_FARM_CONTEXT to anyone holding no farm - and ROOT deliberately
   * holds none (its access comes from the isRoot flag, not from a membership).
   * Landing ROOT on the dashboard therefore opens the app on an explanation
   * rather than on a screen.
   *
   * The branch is on the PERMISSION, never on the role name: whoever
   * administers farms without belonging to one starts on /farms, which is the
   * work they actually have. Someone with no farm and no `manage_farms` still
   * goes to the dashboard - it tells them to ask their administrator, and
   * there is nowhere better for them to be.
   */
  landingUrl(): string {
    const hasFarm = this.currentUser()?.farmId != null;
    return !hasFarm && this.hasPermission(PERMISSION.MANAGE_FARMS) ? '/farms' : '/dashboard';
  }

  /**
   * `GET /api/auth/me` - refreshes both the permission set and the stored user
   * (a role edit or a farm assignment changes what the token's holder can do
   * without the token itself changing).
   */
  loadMe(): Observable<MeResponse> {
    return this.http.get<ApiResponse<MeResponse>>(`${this.baseUrl}/me`).pipe(
      map((res) => res.data!),
      tap((me) => this.storePermissions(me)),
    );
  }

  /**
   * Resolves once permissions are known - immediately if they already are.
   *
   * Route guards use this rather than reading the signal directly: on a hard
   * refresh straight into an admin URL the stored copy may be missing (a
   * session that predates this feature, or cleared site data), and denying the
   * route on a cache miss would bounce a user who is in fact allowed in.
   *
   * The call is shared, so several guards resolving in one navigation make one
   * request.
   *
   * TWO KINDS OF FAILURE, deliberately not treated alike:
   *
   *  - A TRANSIENT one - no network, a 5xx, or a session code AuthErrorHandler
   *    is already acting on - resolves to the cached set. Denying a route on a
   *    cache miss would bounce a user who is in fact allowed in, and the
   *    session-level half is somebody else's job by then.
   *
   *  - A FORBIDDEN does NOT. That is the backend answering authoritatively
   *    that this caller may not even ask who they are, and on a system whose
   *    RBAC is editable at runtime it is exactly how a revoked permission
   *    arrives. Resolving to the cache there would leave the UI granting what
   *    the backend has just refused - the nav still offering admin screens, a
   *    guard still opening one - until something else happened to fail. So the
   *    cached set is dropped and the failure is re-thrown for the caller to
   *    act on (see permissionGuard).
   *
   * A failure of either kind is never memoised: one flaky answer must not pin
   * the session to a stale set until the page is reloaded.
   */
  ensurePermissions(): Observable<readonly string[]> {
    if (!this.mePermissions$) {
      this.mePermissions$ = this.loadMe().pipe(
        map((me) => me.permissions as readonly string[]),
        catchError((err: unknown) => {
          this.mePermissions$ = null;

          if (err instanceof HttpErrorResponse && errorCodeOf(err) === ERROR_CODE.FORBIDDEN) {
            this.clearPermissions();
            // `sessionHandled: false` is true by construction here, not a
            // guess: FORBIDDEN is not one of AuthErrorHandler's session codes,
            // so nothing has signed the user out or navigated away.
            return throwError(() => ApiError.fromHttp(err, false));
          }

          return of(this.permissions());
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.mePermissions$;
  }

  /**
   * Forgets what this session may do, WITHOUT ending the session.
   *
   * Not a log out: the token is still valid and the user stays where they are.
   * It is the honest state after /me itself was refused - "unknown, and
   * certainly not the set we had cached". `canSelectFarm` goes with it because
   * it is granted by the same answer; leaving it behind would keep a farm
   * switcher on screen for a caller the backend just refused.
   */
  private clearPermissions(): void {
    localStorage.removeItem(PERMISSIONS_KEY);
    localStorage.removeItem(CAN_SELECT_FARM_KEY);
    this.permissions.set([]);
    this.canSelectFarm.set(false);
  }

  /**
   * Re-asks /me and replaces the cached answer.
   *
   * ensurePermissions() memoises for the whole session, so this is how a
   * caller says "what /me would answer has changed". Two of them, both real:
   *
   *  - CLEARING THE GATE. While the forced-password-change gate is up nothing
   *    ever asks /me: attemptLogin returns `must-change-password` without
   *    calling it, the start-up initializer runs only when `canUseApp()`, and
   *    permissionGuard redirects to /change-password before it gets that far.
   *    So a session that has only ever been gated holds NO permissions - not a
   *    stale set, an unasked question - and without this the user enters the
   *    app with no nav entries and no landing branch until they happen to
   *    reload the page. (/me itself is NOT refused while gated: JwtAuthFilter
   *    exempts everything under /api/auth/, which is what keeps the way out
   *    reachable.)
   *
   *  - SWITCHING FARM. The answer depends on the X-Farm-Id the switcher now
   *    sends, so the cached one is about a farm the session has left.
   */
  refreshPermissions(): Observable<readonly string[]> {
    this.mePermissions$ = null;
    return this.ensurePermissions();
  }

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
      switchMap((res): Observable<LoginOutcome> => {
        const data = res.data!;
        // Login SUCCEEDS while gated - the token is real and works against
        // /api/auth/change-password. The gate is a routing concern, not a
        // failed login.
        if (data.mustChangePassword) {
          return of({ kind: 'must-change-password', user: data.user });
        }
        // Permissions are fetched BEFORE the caller navigates. Login returns
        // the role name only, and a screen that renders before /me answers
        // would draw its nav without the admin entries and then flicker them
        // in. A failed /me is not a failed login - the app opens with whatever
        // permissions are known and the guards re-ask.
        return this.loadMe().pipe(
          map((): LoginOutcome => ({ kind: 'success', user: data.user })),
          catchError((): Observable<LoginOutcome> => of({ kind: 'success', user: data.user })),
        );
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
        // is wrong" - a field error. It is NOT an expired session, and
        // AuthErrorHandler leaves it alone because the code is not one of the
        // session-level ones.
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
    localStorage.removeItem(PERMISSIONS_KEY);
    localStorage.removeItem(CAN_SELECT_FARM_KEY);
    this.currentUser.set(null);
    this.mustChangePassword.set(false);
    this.permissions.set([]);
    this.canSelectFarm.set(false);
    // A chosen farm belongs to one session. Left behind, the next person to
    // sign in on this browser would send someone else's choice in a header.
    this.farmSelection.clear();
    // And a cycle belongs to a farm, so it cannot outlive the session either
    // - otherwise the next user opens a log screen already pointed at a cycle
    // they have never seen.
    this.cycleSelection.clear();
    // Drop the cached /me: the next session must ask again rather than
    // inherit the previous user's answer.
    this.mePermissions$ = null;
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /** Raised by AuthErrorHandler whenever any call reports MUST_CHANGE_PASSWORD. */
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
    // Same reason as logout: whoever just signed in has chosen nothing yet.
    this.farmSelection.clear();
    this.cycleSelection.clear();

    if (res.data.mustChangePassword) {
      this.raiseGate();
    } else {
      this.clearGate();
    }
  }

  private storePermissions(me: MeResponse): void {
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(me.permissions));
    this.permissions.set(me.permissions);

    // `=== true` rather than a cast: an older backend simply omits the field,
    // and "undefined" must read as "may not", not as a truthy object.
    const canSelectFarm = me.canSelectFarm === true;
    localStorage.setItem(CAN_SELECT_FARM_KEY, String(canSelectFarm));
    this.canSelectFarm.set(canSelectFarm);

    // /me is also the freshest UserSummary we ever get - role and farmId can
    // change under a token that stays valid. farmId in particular is the farm
    // the BACKEND applied, which for ROOT is the answer to "did my selection
    // take effect?".
    const { permissions: _permissions, canSelectFarm: _canSelectFarm, ...user } = me;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private readStoredPermissions(): readonly string[] {
    const raw = localStorage.getItem(PERMISSIONS_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]).filter((p) => typeof p === 'string') : [];
    } catch {
      localStorage.removeItem(PERMISSIONS_KEY);
      return [];
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