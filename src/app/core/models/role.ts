/**
 * `GET /api/roles` — mirrors the backend's RoleSummary.
 *
 * `permissions` is the role's own bundle of codes. The Approvals screen does
 * not read it: what the SIGNED-IN user may do comes from `/api/auth/me`, and
 * what a role grants the person being assigned is the backend's business. It
 * is modelled because the endpoint sends it and the Roles screen needs it.
 */
export interface Role {
  roleId: number;
  name: string;
  /** Nullable on the backend (`roles.description`). */
  description: string | null;
  /**
   * May this role still be GIVEN to someone?
   *
   * Not the same as existing. A deactivated role is still listed — the Roles
   * screen is the only place that can switch it back on, so hiding it there
   * would strand it — but the backend refuses to attach it to a new
   * membership (`FarmUserService.resolveRole`). People who already hold it
   * keep it, and keep every permission it grants.
   *
   * So a picker that ASSIGNS a role must filter on this; a screen that
   * ADMINISTERS roles must not.
   */
  active: boolean;
  permissions: string[];
}

/**
 * `POST /api/roles`.
 *
 * `permissionIds`, NOT codes - the endpoint takes database keys, so the Roles
 * screen has to join the codes it knows against the catalogue before it can
 * write anything (see RolesService.listPermissions).
 *
 * An EMPTY list is deliberately legal: `RoleService.resolvePermissions`
 * documents it as the way to hold a role with no permissions at all.
 */
export interface CreateRoleRequest {
  name: string;
  description: string | null;
  permissionIds: number[];
}

/**
 * `PUT /api/roles/{roleId}` — name and description only.
 *
 * Permissions are deliberately absent: they have their own endpoint with its
 * own all-or-nothing rule, and a rename must not be able to touch them. The
 * backend's DTO has the same shape for the same reason.
 */
export interface UpdateRoleRequest {
  name: string;
  description: string | null;
}
