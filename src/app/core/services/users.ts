import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { UserSummary } from '../models/auth';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';

/**
 * `/api/users`. Only the read this screen needs is here; assigning
 * memberships, changing a role, disabling and deleting belong to the Members
 * screen and are deliberately absent.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  /**
   * A farm's members. Needs `manage_users` - a DIFFERENT permission from the
   * one that opens the Farms screen, which is why the panel showing this is
   * gated separately.
   *
   * It is also farm-scoped on the backend: a non-ROOT caller may only ask
   * about the farm they belong to, and gets 403 FORBIDDEN
   * ("Huruhusiwi kufikia shamba hili.") for any other. The screen shows that
   * answer rather than pretending the farm is empty.
   */
  listByFarm(farmId: number): Observable<UserSummary[]> {
    return this.http
      .get<ApiResponse<UserSummary[]>>(this.baseUrl, {
        params: new HttpParams().set('farmId', farmId),
      })
      .pipe(
        map((res) => res.data ?? []),
        restError(this.authErrorHandler),
      );
  }
}
