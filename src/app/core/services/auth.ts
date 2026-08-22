import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import {
  ForgotPasswordRequest,
  LoginOutcome,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  SignupRequest,
  UserSummary,
} from '../models/auth';

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  readonly currentUser = signal<UserSummary | null>(this.readStoredUser());

  constructor(private readonly http: HttpClient) {}

  login(req: LoginRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.baseUrl}/login`, req)
      .pipe(tap((res) => this.handleAuthSuccess(res)));
  }

  /**
   * Login form-friendly wrapper: accepts a single identifier (email au phone
   * - decided by presence of "@"), and never errors - every outcome (success,
   * bad credentials, pending approval, disabled account, network failure) is
   * mapped to a typed result so the component can render the right message.
   *
   * `pending-approval`/`account-disabled` only surface once the backend
   * starts returning `errorCode: 'PENDING_APPROVAL' | 'ACCOUNT_DISABLED'` on
   * a 403 - today's API only distinguishes success vs 401, so those branches
   * are forward-compatible scaffolding rather than reachable today.
   */
  attemptLogin(identifier: string, password: string): Observable<LoginOutcome> {
    const req: LoginRequest = identifier.includes('@')
      ? { email: identifier, password }
      : { phone: identifier, password };

    return this.login(req).pipe(
      map((res): LoginOutcome => ({ kind: 'success', user: res.data!.user })),
      catchError((err: HttpErrorResponse): Observable<LoginOutcome> => {
        if (err.status === 0) {
          return of({ kind: 'network-error' });
        }
        const body = err.error as ApiResponse<unknown> | undefined;
        if (err.status === 403 && body?.errorCode === 'PENDING_APPROVAL') {
          return of({ kind: 'pending-approval' });
        }
        if (err.status === 403 && body?.errorCode === 'ACCOUNT_DISABLED') {
          return of({ kind: 'account-disabled' });
        }
        if (err.status === 401) {
          return of({ kind: 'invalid-credentials' });
        }
        return of({ kind: 'network-error' });
      }),
    );
  }

  signup(req: SignupRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.baseUrl}/signup`, req)
      .pipe(tap((res) => this.handleAuthSuccess(res)));
  }

  forgotPassword(req: ForgotPasswordRequest): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/forgot-password`, req);
  }

  resetPassword(req: ResetPasswordRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.baseUrl}/reset-password`, req)
      .pipe(tap((res) => this.handleAuthSuccess(res)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private handleAuthSuccess(res: ApiResponse<LoginResponse>): void {
    if (!res.success || !res.data) {
      return;
    }
    localStorage.setItem(TOKEN_KEY, res.data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    this.currentUser.set(res.data.user);
  }

  private readStoredUser(): UserSummary | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserSummary) : null;
  }
}
