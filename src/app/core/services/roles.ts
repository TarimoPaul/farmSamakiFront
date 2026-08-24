import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { Role } from '../models/role';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';

/**
 * `/api/roles`. Only the read the Approvals screen needs; creating roles and
 * editing their permissions belong to the Roles screen.
 *
 * `manage_users` — the SAME permission that gates assigning a membership, and
 * deliberately not the one that opens the Approvals screen. An approve-only
 * caller is refused here (verified live: 403 FORBIDDEN), which is why the
 * screen never asks unless it holds the code.
 */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly baseUrl = `${environment.apiUrl}/roles`;

  list(): Observable<Role[]> {
    return this.http.get<ApiResponse<Role[]>>(this.baseUrl).pipe(
      map((res) => res.data ?? []),
      restError(this.authErrorHandler),
    );
  }
}
