/**
 * The permission codes the backend seeds (`permissions` table, V7).
 *
 * UI gating branches on THESE, never on the role name. Roles are editable at
 * runtime through `PUT /api/roles/{id}/permissions`, so "if role is WORKER,
 * hide X" is stale the first time somebody edits a role - a screen would keep
 * hiding a control the user is now allowed to use, or worse, keep showing one
 * they are not. The codes are the contract; the roles are just bundles of them.
 *
 * They come from `GET /api/auth/me`, which is the only place the frontend can
 * learn them - the login response carries the role NAME only.
 */
export const PERMISSION = {
  VIEW_DASHBOARD: 'view_dashboard',
  EDIT_CYCLE: 'edit_cycle',
  MANAGE_UNITS: 'manage_units',
  MARK_TASK_DONE: 'mark_task_done',
  VIEW_FINANCE: 'view_finance',
  /** Create/assign/disable/delete people. Gates the members panel. */
  MANAGE_USERS: 'manage_users',
  /** List and create farms. Gates the Farms screen and its nav entry. */
  MANAGE_FARMS: 'manage_farms',
  APPROVE_USERS: 'approve_users',
  LOG_FEEDING: 'log_feeding',
  MANAGE_FEED_STOCK: 'manage_feed_stock',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];
