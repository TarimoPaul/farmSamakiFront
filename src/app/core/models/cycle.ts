export interface Cycle {
  cycleId: string;
  unit: { unitId: string; code: string; type: string };
  speciesName: string;
  stockingDate: string;
  fingerlingsCount: number;
  survivalRateEstimate: number;
  expectedHarvestDate: string | null;
  actualHarvestDate: string | null;
  status: string;
}

/**
 * `createCycle` input - the stocking event itself. There is no separate
 * stocking record: date, count and species ARE the cycle's opening columns.
 *
 * `unitId` and `speciesId` are `ID!` in the schema, so they travel as strings
 * exactly as they arrive from the corresponding queries.
 *
 * `expectedHarvestDate` is deliberately absent: the backend computes it from
 * the species' `growthMonthsAvg`, and a client-supplied value would be
 * ignored. `status` is absent for the same reason - a new cycle is ACTIVE.
 *
 * `survivalRateEstimate` left out means the backend's own default (0.85).
 */
export interface CreateCycleInput {
  unitId: string;
  speciesId: string;
  /** ISO date, yyyy-MM-dd. */
  stockingDate: string;
  fingerlingsCount: number;
  survivalRateEstimate?: number | null;
}
