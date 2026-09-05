import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiPageResponse, ApiResponse } from '../models/api-response';
import { PermissionDefinition } from '../models/permissions';
import { CreateRoleRequest, Role, UpdateRoleRequest } from '../models/role';
import { restError } from '../http/rest-error';
import { AuthErrorHandler } from './auth-error-handler';

/**
 * The backend's own ceiling on a page (`PageableParam.MAX_SIZE`). Asking for
 * more is silently clamped to this, so this is the largest honest request.
 */
const MAX_PAGE_SIZE = 200;

/**
 * `/api/roles` - roles, and the permission catalogue they are built from.
 *
 * EVERY endpoint here is `manage_users`, the same code that opens the Roles
 * and Members screens, so unlike UsersService there is no permission split to
 * respect: a caller who can reach either screen can call all four.
 *
 * `manage_users` is also, deliberately, the ONLY thing standing between a
 * caller and the whole security policy - there is no separate "edit roles"
 * permission on the backend, and roles are global rather than per-farm. So
 * whoever holds it can write a role granting anything and hand it to anyone,
 * including themselves. That is the backend's design, not this service's; the
 * Roles screen says so in as many words rather than pretending otherwise.
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

  /**
   * Creates a role and returns it as the backend now holds it.
   *
   * Two failures worth knowing about, because NEITHER carries a helpful
   * sentence: `roles.name` is `UNIQUE NOT NULL`, and the service applies no
   * bean validation, so a duplicate name AND a missing one both surface as
   * `DataIntegrityViolationException` - 409 CONFLICT with the generic
   * "operesheni imekiuka vikwazo vya database" line. The screen therefore
   * requires a name itself, so that only the duplicate can ever reach here.
   */
  create(req: CreateRoleRequest): Observable<Role> {
    return this.http.post<ApiResponse<Role>>(this.baseUrl, req).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }

  /**
   * Renames a role / rewrites its description. Touches NOTHING else.
   *
   * The name is `UNIQUE` and capped at 50 characters, and the backend now
   * answers both cases specifically — 409 "Nafasi yenye jina hili tayari
   * ipo." and 400 for blank/over-long — rather than letting them fall
   * through to the generic data-integrity sentence.
   *
   * Renaming does NOT disturb anyone holding the role: a membership points
   * at `role_id`, never at the name.
   */
  update(roleId: number, req: UpdateRoleRequest): Observable<Role> {
    return this.http.put<ApiResponse<Role>>(`${this.baseUrl}/${roleId}`, req).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }

  /**
   * Switches a role off or back on — the REVERSIBLE half of retiring one.
   *
   * Off means "not handed to anybody new": the role stays listed, and every
   * person already holding it keeps it along with every permission it grants.
   * Nothing about a signed-in session changes, which is why this needs no
   * /me refresh where a permission edit does.
   *
   * Idempotent on the backend, so a double click is harmless.
   */
  setActive(roleId: number, active: boolean): Observable<Role> {
    const action = active ? 'activate' : 'deactivate';
    return this.http.post<ApiResponse<Role>>(`${this.baseUrl}/${roleId}/${action}`, null).pipe(
      map((res) => res.data!),
      restError(this.authErrorHandler),
    );
  }

  /**
   * Deletes a role — soft on the backend, gone from every list here.
   *
   * REFUSED with 409 + `ROLE_IN_USE` while anyone still holds it, and that
   * refusal is the point rather than an inconvenience: `farm_users.role_id`
   * has no cascade, so removing a held role would strip those people of
   * every permission with nothing on any screen to explain it. The refusal
   * names how many people are in the way, and clears the moment they are
   * moved.
   *
   * Answers no body.
   */
  remove(roleId: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/${roleId}`).pipe(
      map(() => undefined),
      restError(this.authErrorHandler),
    );
  }

  /**
   * REPLACES a role's permissions - the whole set, not a delta. The list sent
   * is the list the role ends up with, and `[]` strips it bare.
   *
   * All-or-nothing on the backend: one unknown id refuses the entire request
   * with 400 VALIDATION_ERROR and a sentence naming the offending ids, and
   * the role is left exactly as it was. So a failure here never means "some
   * of it went through".
   *
   * It also invalidates every signed-in user's cached authorities server-side
   * (`JwtAuthFilter.clearAllUserCache`), which is why the caller re-asks /me
   * afterwards: the person doing the editing may have just changed what they
   * themselves may do.
   */
  updatePermissions(roleId: number, permissionIds: readonly number[]): Observable<Role> {
    return this.http
      .put<ApiResponse<Role>>(`${this.baseUrl}/${roleId}/permissions`, permissionIds)
      .pipe(
        map((res) => res.data!),
        restError(this.authErrorHandler),
      );
  }

  /**
   * The WHOLE permission catalogue, as one list.
   *
   * This endpoint is the one paged list in the API - the backend's own note
   * says permissions were paginated precisely because they grow with every
   * feature, while roles stay few. The editor, though, needs all of them at
   * once: a checkbox grid split across pages would let an admin save a role
   * having seen only half of what they were choosing from.
   *
   * So it pages to exhaustion rather than assuming one page is enough. Today
   * that is a single request for 11 rows; it stays correct on the day the
   * catalogue passes 200.
   */
  listPermissions(): Observable<PermissionDefinition[]> {
    return this.permissionPage(0).pipe(
      expand((page) => (page.hasNext ? this.permissionPage(page.page + 1) : EMPTY)),
      reduce<ApiPageResponse<PermissionDefinition>, PermissionDefinition[]>(
        (all, page) => all.concat(page.data ?? []),
        [],
      ),
    );
  }

  private permissionPage(page: number): Observable<ApiPageResponse<PermissionDefinition>> {
    return this.http
      .get<ApiPageResponse<PermissionDefinition>>(`${this.baseUrl}/permissions`, {
        params: new HttpParams().set('page', page).set('size', MAX_PAGE_SIZE),
      })
      .pipe(restError(this.authErrorHandler));
  }
}
