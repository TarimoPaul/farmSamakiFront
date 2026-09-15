/** `GET /api/farms` / `POST /api/farms` — mirrors the backend's FarmSummary. */
export interface Farm {
  farmId: number;
  name: string;
  /** Optional on the backend (`location` is nullable). */
  location: string | null;
  /**
   * Null for a farm with no owner yet. Ownership comes from MEMBERSHIP, not
   * from creating the farm - a farm created by an admin has no owner until
   * someone is given the OWNER role on it.
   */
  ownerName: string | null;
}

/**
 * `GET /api/auth/my-farms` - a farm the farm switcher may offer.
 *
 * ROOT gets every farm; anyone else gets the farms they are a member of,
 * which are exactly the ones the backend will apply from `X-Farm-Id`. The
 * switcher used to read `GET /api/farms`, which needs `manage_farms` - a
 * member of two farms could never have loaded it.
 */
export interface MyFarm {
  farmId: number;
  name: string;
  /** Their role on that farm; null with no role, and always null for ROOT. */
  role: string | null;
}

export interface CreateFarmRequest {
  name: string;
  location: string;
}

/**
 * `PUT /api/farms/{farmId}` — name and location.
 *
 * The OWNER is deliberately absent: ownership comes from a membership
 * (`FarmUserService`), and a second way to set it with different rules is
 * how two versions of the same fact end up disagreeing.
 */
export interface UpdateFarmRequest {
  name: string;
  location: string;
}
