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
  /**
   * The read permission for the whole farm side of the API: production units,
   * cycles, species, feed, water-quality readings. Every GraphQL query is
   * gated on this one code, so a screen that only reads needs nothing else.
   */
  VIEW_DASHBOARD: 'view_dashboard',
  /** Start a cycle in a unit. Gates the "new cycle" control on Production. */
  EDIT_CYCLE: 'edit_cycle',
  /** Create a tank/pond. Gates the "new unit" control on Production. */
  MANAGE_UNITS: 'manage_units',
  MARK_TASK_DONE: 'mark_task_done',
  VIEW_FINANCE: 'view_finance',
  /**
   * Record a water-quality reading. Gates the log form on the Water Quality
   * screen - VIEWER holds `view_dashboard` and reads the readings, but has no
   * form at all.
   *
   * Seeded by the backend's V10 migration and granted to OWNER, FARM_MANAGER
   * and WORKER: measuring the water is field work, like feeding.
   */
  LOG_WATER_QUALITY: 'log_water_quality',
  /** Create/assign/disable/delete people. Gates the members panel. */
  MANAGE_USERS: 'manage_users',
  /**
   * List, create and RENAME farms. Gates the Farms screen and its nav entry.
   *
   * Deliberately not enough to delete one - see DELETE_FARM.
   */
  MANAGE_FARMS: 'manage_farms',
  /**
   * Delete a farm. A code of its own, and the only place in this app where a
   * delete is split off from the capability that creates and edits.
   *
   * The reason is the blast radius: a farm is the context that units, cycles,
   * feeding and water readings all hang from, so removing one is unlike
   * removing anything else. Someone can be trusted to organise farms without
   * being trusted to remove one. Seeded by V15 and granted to OWNER.
   */
  DELETE_FARM: 'delete_farm',
  APPROVE_USERS: 'approve_users',
  LOG_FEEDING: 'log_feeding',
  MANAGE_FEED_STOCK: 'manage_feed_stock',
  /**
   * SEE how much feed is left, per type. Gates the stock panel on the Feeding
   * screen - and nothing else on it.
   *
   * Split from MANAGE_FEED_STOCK (which is what RECORDS a purchase) because
   * the two answer different questions about the same person: a worker who
   * feeds the fish needs to know a sack is nearly empty, and giving them the
   * ability to write purchases in order to tell them that would be the wrong
   * trade. A feeder without this code gets the feeding form and no panel -
   * which is the plain case this screen is built around, not an edge one.
   */
  VIEW_FEED_STOCK: 'view_feed_stock',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

/**
 * One row of the permission CATALOGUE - `GET /api/roles/permissions`, which
 * sends the backend's `Permission` entity verbatim.
 *
 * Distinct from the codes above, and both are needed. The codes are what the
 * UI gates on and are known at compile time; this is the RUNTIME list the
 * Roles screen edits, and it carries the numeric `permissionId` that
 * `PUT /api/roles/{roleId}/permissions` takes. No constant can supply that id
 * - it is a database key, and the catalogue grows with every new feature.
 *
 * `module` and `groupName` exist for exactly one purpose, which the backend
 * entity states outright: laying the checkboxes out hierarchically
 * (module -> group). `description` is Swahili prose from the seed CSV whatever
 * the UI language is, like every other string the backend sends.
 */
export interface PermissionDefinition {
  permissionId: number;
  code: string;
  module: string;
  /** Nullable on the backend (`permissions.group_name`). */
  groupName: string | null;
  description: string | null;
}
