import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { CreateFarmRequest, Farm } from '../models/farm';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';

/**
 * `/api/farms` - both endpoints need `manage_farms`.
 *
 * Failures leave here as ApiError, so the screen branches on `errorCode`
 * (CONFLICT, VALIDATION_ERROR) exactly as it would for a GraphQL call.
 */
@Injectable({ providedIn: 'root' })
export class FarmsService {
  private readonly http = inject(HttpClient);
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly baseUrl = `${environment.apiUrl}/farms`;

  /**
   * EVERY farm, not just the caller's - that is the backend's deliberate
   * design and the right one here: `manage_farms` is the cross-farm admin
   * capability, and you cannot place people on a farm you cannot see.
   */
  list(): Observable<Farm[]> {
    return this.http.get<ApiResponse<Farm[]>>(this.baseUrl).pipe(
      map((res) => res.data ?? []),
      restError(this.authErrorHandler),
    );
  }

  /** Returns the created farm. `ownerName` is always null - see Farm. */
  create(req: CreateFarmRequest): Observable<Farm> {
    return this.http.post<ApiResponse<Farm>>(this.baseUrl, req).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }
}
