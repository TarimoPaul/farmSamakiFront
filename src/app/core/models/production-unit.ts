export interface ProductionUnit {
  unitId: string;
  code: string;
  type: string;
  sizeM3: number | null;
  waterSource: string | null;
  status: string;
}

/**
 * The unit types the backend's CHECK constraint and `UnitType` enum allow.
 *
 * Kept here so the form offers exactly what the server accepts. A value
 * outside this set comes back as VALIDATION_ERROR naming the whole list
 * ("Aina ya kitengo si sahihi. Chagua: TANK, POND, BWAWA."), which is the
 * message the form shows if this ever drifts from the backend.
 */
export const UNIT_TYPES = ['TANK', 'POND', 'BWAWA'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * `createProductionUnit` input. The farm is NOT a field: the backend takes it
 * from the caller's scope (requireFarmScope), so a unit can only ever be
 * created in the farm the session is working in.
 *
 * A new unit is always created `IDLE`; it becomes ACTIVE when a cycle is
 * started in it.
 */
export interface CreateProductionUnitInput {
  code: string;
  type: string;
  sizeM3?: number | null;
  waterSource?: string | null;
}
