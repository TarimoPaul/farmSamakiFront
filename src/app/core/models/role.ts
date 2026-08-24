/**
 * `GET /api/roles` — mirrors the backend's RoleSummary.
 *
 * `permissions` is the role's own bundle of codes. The Approvals screen does
 * not read it: what the SIGNED-IN user may do comes from `/api/auth/me`, and
 * what a role grants the person being assigned is the backend's business. It
 * is modelled because the endpoint sends it and the Roles screen will need it.
 */
export interface Role {
  roleId: number;
  name: string;
  /** Nullable on the backend (`roles.description`). */
  description: string | null;
  permissions: string[];
}
