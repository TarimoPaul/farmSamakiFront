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

export interface CreateFarmRequest {
  name: string;
  location: string;
}
