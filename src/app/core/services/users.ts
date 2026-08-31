import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { UserSummary } from '../models/auth';
import { AssignMembershipRequest } from '../models/membership';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';

/**
 * `/api/users`.
 *
 * Two DIFFERENT permissions live here, which is the whole reason the
 * Approvals screen splits its controls the way it does:
 *
 *  - `approve_users` — read the pending queue, and approve.
 *  - `manage_users`  — everything that changes what a person can DO:
 *                      listing a farm's members, assigning a membership.
 *
 * Disabling, enabling and deleting a person outright are also `manage_users`
 * and are not built yet.
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

  /**
   * The approval queue: everyone with `status = PENDING_APPROVAL`.
   *
   * Needs `approve_users`. Company-level, NOT farm-scoped — a pending user has
   * no membership at all (`farmId` and `role` both come back null), so there
   * is no farm to scope by. That is why this is the one admin list the
   * two-tier rule does not touch.
   *
   * The backend orders it oldest-first (`findByStatusOrderByCreatedAtAsc`) but
   * does NOT send a timestamp — UserSummary has no `createdAt` field. The
   * screen therefore presents arrival ORDER and cannot print a date; see the
   * note on the queue-position column in approvals.ts.
   */
  listPending(): Observable<UserSummary[]> {
    return this.http.get<ApiResponse<UserSummary[]>>(`${this.baseUrl}/pending`).pipe(
      map((res) => res.data ?? []),
      restError(this.authErrorHandler),
    );
  }

  /**
   * PENDING_APPROVAL -> ACTIVE. Needs `approve_users`.
   *
   * Grants NOTHING else: no farm, no role. The returned UserSummary still
   * carries `farmId: null, role: null` (verified live). Approval and
   * membership are two steps because they are two decisions.
   *
   * Answers 409 when the user is no longer pending — someone else got there
   * first. Note that this conflict arrives with NO `errorCode` (the backend's
   * ConflictException handler omits it), so callers branch on the 409 status;
   * see CONFLICT_STATUS in approvals.ts.
   */
  approve(userId: string): Observable<UserSummary> {
    return this.http
      .post<ApiResponse<UserSummary>>(`${this.baseUrl}/${userId}/approve`, null)
      .pipe(
        map((res) => res.data!),
        restError(this.authErrorHandler),
      );
  }

  /**
   * Puts a user on a farm with a role. Needs `manage_users` AND passes the
   * backend's two-tier farm check.
   *
   * TWO TIERS, decided by permission alone (PermissionChecker.requireSameFarm):
   *
   *  - `manage_farms` (or ROOT) — any farm. The company administrator.
   *  - `manage_users` only      — their OWN farm; any other `farmId` is
   *                               403 FORBIDDEN ("Huruhusiwi kufikia shamba
   *                               hili."), verified live.
   *
   * Returns no body (`ApiResponse<Void>`), so this resolves to void — the
   * caller re-reads the pending list rather than patching from a response
   * that carries nothing.
   */
  assignMembership(userId: string, req: AssignMembershipRequest): Observable<void> {
    return this.http
      .post<ApiResponse<void>>(`${this.baseUrl}/${userId}/memberships`, req)
      .pipe(
        map(() => undefined),
        restError(this.authErrorHandler),
      );
  }

  /**
   * Changes the role someone holds on a farm they are ALREADY on.
   *
   * The farm is in the path, and the body is the same
   * `AssignMembershipRequest` the assign endpoint takes - the backend reuses
   * the DTO (`UserController.changeRole`) and only reads `roleId` off it, but
   * `farmId` is `@NotNull` there, so omitting it is a 400 VALIDATION_ERROR
   * rather than a no-op. Hence both.
   *
   * Same two-tier farm check as assignMembership, and the same
   * `manage_users`. A user who is not on that farm is a 400
   * ("Mtumiaji huyu hayupo kwenye shamba hili."), which the screen shows as
   * the stale-list answer it is.
   */
  changeRole(userId: string, farmId: number, roleId: number | null): Observable<void> {
    return this.http
      .put<ApiResponse<void>>(`${this.baseUrl}/${userId}/memberships/${farmId}/role`, {
        farmId,
        roleId,
      })
      .pipe(
        map(() => undefined),
        restError(this.authErrorHandler),
      );
  }

  /**
   * Takes someone off a farm. Soft-deletes the MEMBERSHIP, not the person -
   * the account survives, with no farm.
   *
   * The backend's one guard rail lives here: a farm's own owner
   * (`farms.owner_id`) cannot be removed from it, and that arrives as
   * **409 with no `errorCode`** - `GlobalExceptionHandler.handleConflict`
   * builds its envelope with the single-argument `ApiResponse.error(message)`.
   * So the screen recognises it by STATUS and shows the backend's sentence;
   * see CONFLICT_STATUS in members.ts.
   */
  removeMembership(userId: string, farmId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<void>>(`${this.baseUrl}/${userId}/memberships/${farmId}`)
      .pipe(
        map(() => undefined),
        restError(this.authErrorHandler),
      );
  }
}
