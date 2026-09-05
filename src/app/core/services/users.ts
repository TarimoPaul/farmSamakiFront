import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { CreateUserRequest, UpdateUserRequest, UserSummary } from '../models/auth';
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
 *  - `manage_users`  — everything else: listing a farm's members, creating a
 *                      person, assigning or changing a membership, blocking
 *                      an account, and deleting one.
 *
 * The one thing NOT here is setting somebody else's password. A person
 * changes their own through `/api/auth/change-password`; an admin can set
 * only the FIRST one, when the account is created. There is no reset.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  /**
   * Creates a person outright. Needs `manage_users`.
   *
   * They come back ACTIVE and with NO farm (`farmId: null, role: null`), so a
   * screen that wants them on a farm must follow this with
   * `assignMembership` - the same two steps the Approvals screen makes, minus
   * the waiting.
   *
   * 409 for a phone or email already registered, and the backend's sentence
   * names which one; there is no code to branch on, so that sentence is worth
   * showing as it comes.
   */
  create(req: CreateUserRequest): Observable<UserSummary> {
    return this.http.post<ApiResponse<UserSummary>>(this.baseUrl, req).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }

  /**
   * Corrects who somebody IS: name, phone, email. Needs `manage_users`.
   *
   * Nothing else moves. Their role, their farm, whether the account is
   * blocked - all untouched, each with its own call. Before this endpoint
   * existed a mistyped phone number could only be fixed by deleting the
   * person and creating them again, which threw away their membership and
   * their history with it.
   *
   * Works on YOURSELF too, unlike blocking and deleting: changing your own
   * name or number does not lock you out of anything.
   *
   * 409 for a phone or email already in use - including one belonging to a
   * deleted account, since the column is unique across the whole table - and
   * the sentence names which of the two.
   */
  update(userId: string, req: UpdateUserRequest): Observable<UserSummary> {
    return this.http.put<ApiResponse<UserSummary>>(`${this.baseUrl}/${userId}`, req).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }

  /**
   * Blocks or restores an ACCOUNT. Needs `manage_users`.
   *
   * Account-wide, NOT farm-wide: a disabled person cannot sign in at all, on
   * any farm they belong to. That is a bigger act than removing them from one
   * farm, and the screen says so rather than letting the two read alike.
   *
   * Disabling YOURSELF is refused - 400 VALIDATION_ERROR, "Huwezi kujizuia
   * mwenyewe." The screen does not offer it, because unlike the owner rule
   * this one is knowable here: the signed-in user's id is on hand.
   *
   * The backend clears the person's cached authorities, so a disabled user's
   * token stops working immediately rather than at the next cache expiry.
   */
  setEnabled(userId: string, enabled: boolean): Observable<UserSummary> {
    const action = enabled ? 'enable' : 'disable';
    return this.http
      .post<ApiResponse<UserSummary>>(`${this.baseUrl}/${userId}/${action}`, null)
      .pipe(
        map((res) => res.data!),
        restError(this.authErrorHandler),
      );
  }

  /**
   * Deletes the PERSON, not a membership. Needs `manage_users`.
   *
   * Soft on the backend - feeding logs and task completions still point at
   * them, so the row stays for history - but they are gone from every list
   * and can never sign in again. This is the one irreversible control on the
   * Members screen.
   *
   * Two refusals, both 409 with the generic CONFLICT code and a sentence that
   * says which: a farm's owner cannot be deleted ("Mmiliki wa shamba hawezi
   * kufutwa."), and deleting yourself is refused as 400 VALIDATION_ERROR
   * ("Huwezi kujifuta mwenyewe.") - the latter never reaches the API, because
   * the screen does not offer the control on your own row.
   */
  remove(userId: string): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/${userId}`).pipe(
      map(() => undefined),
      restError(this.authErrorHandler),
    );
  }

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
    return this.http.post<ApiResponse<UserSummary>>(`${this.baseUrl}/${userId}/approve`, null).pipe(
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
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/${userId}/memberships`, req).pipe(
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
