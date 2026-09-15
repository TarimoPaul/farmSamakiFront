import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { MeResponse, UpdateUserRequest } from '../models/auth';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';
import { AuthService } from './auth';

/**
 * The signed-in person's OWN account - `/api/auth/me`.
 *
 * Not on AuthService because AuthErrorHandler already depends on AuthService,
 * and `restError` needs the handler: putting these here keeps the two from
 * injecting each other.
 *
 * NO PERMISSION is involved, unlike `PUT /api/users/{id}` (manage_users). The
 * backend takes the user from the token, so this can only ever touch the
 * caller - which is why it is safe to offer to everyone.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly url = `${environment.apiUrl}/auth/me`;

  /** A fresh /me - the only answer that carries the email. */
  load(): Observable<MeResponse> {
    return this.authService.loadMe().pipe(restError(this.authErrorHandler));
  }

  /**
   * Name, phone, email. Answers with the new /me, which is stored straight
   * away so the sidebar shows the new name without a second request.
   *
   * Refusals worth knowing: 409 for a phone or email already in use (the
   * backend's sentence says which), 400 VALIDATION_ERROR for ROOT trying to
   * change its phone (it is pinned by ROOT_PHONE), and 403
   * MUST_CHANGE_PASSWORD while the password gate is up.
   */
  update(req: UpdateUserRequest): Observable<MeResponse> {
    return this.http.put<ApiResponse<MeResponse>>(this.url, req).pipe(
      map((res) => res.data!),
      tap((me) => this.authService.applyMe(me)),
      restError(this.authErrorHandler),
    );
  }
}
