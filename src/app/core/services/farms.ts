import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { CreateFarmRequest, Farm, UpdateFarmRequest } from '../models/farm';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';

/**
 * `/api/farms` - list, create and update need `manage_farms`; DELETE needs
 * `delete_farm`, a code of its own (see remove).
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

  /**
   * Renames a farm / corrects its location. `manage_farms`.
   *
   * Touches nothing else: not its owner, not its members, not a thing inside
   * it. 409 for a name another LIVE farm already has - a deleted farm's name
   * is free again, because the database constraint is a partial index on
   * `is_deleted = false` (V14).
   */
  update(farmId: number, req: UpdateFarmRequest): Observable<Farm> {
    return this.http.put<ApiResponse<Farm>>(`${this.baseUrl}/${farmId}`, req).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }

  /**
   * Deletes a farm — and needs `delete_farm`, NOT `manage_farms`.
   *
   * It is the only call in the API that removes the context everything else
   * hangs from: units, cycles, feeding, water readings. So the backend gives
   * it a permission of its own, and somebody can be trusted to organise farms
   * without being trusted to remove one.
   *
   * REFUSED with 409 + `FARM_IN_USE` while anyone is still a member, naming
   * how many. Soft-delete would otherwise leave their `farm_users` rows
   * pointing at a farm every query hides — a membership with no farm, and
   * nothing on any screen to explain it.
   */
  remove(farmId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/${farmId}`).pipe(
      map(() => undefined),
      restError(this.authErrorHandler),
    );
  }
}
