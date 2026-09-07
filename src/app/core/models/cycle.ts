export interface Cycle {
  cycleId: string;
  unit: { unitId: string; code: string; type: string };
  speciesName: string;
  stockingDate: string;
  fingerlingsCount: number;

  /**
   * The fish's age in months ON THE DAY THEY WERE STOCKED. 0 means
   * fingerlings, which is the default and the state of every cycle written
   * before the column existed - so this is `Int!`, never null.
   */
  stockingAgeMonths: number;

  /**
   * The ESTIMATE made on stocking day (0.85 if none was given). It never
   * changes afterwards - explicitly NOT at harvest. Compare it with
   * `actualSurvivalRate`; the whole reason both exist is that the estimate
   * is the plan and the actual is what happened, and merging them would
   * destroy the only comparison a farmer can learn from.
   */
  survivalRateEstimate: number;

  /**
   * A PREDICTION: stockingDate + (species growthMonthsAvg - stockingAgeMonths).
   *
   * When this date arrives NOTHING HAPPENS. No scheduler reads it, no status
   * flips. It exists to show and to remind - "they are nearly ready" - and
   * closing a cycle is a person's job (`closeCycle`). Anything on this screen
   * that keys off it must be read-only for exactly that reason.
   */
  expectedHarvestDate: string | null;

  // ---- Written by closeCycle alone; null while a cycle is running ----
  actualHarvestDate: string | null;
  harvestedCount: number | null;
  totalWeightKg: number | null;
  harvestNotes: string | null;

  /**
   * WHAT HAPPENED: harvestedCount / fingerlingsCount, computed by the
   * database. It is accepted as input NOWHERE - no mutation carries a field
   * for it - which is why `CloseCycleInput` below has no survival rate.
   */
  actualSurvivalRate: number | null;

  /** ACTIVE / HARVESTED / FAILED. */
  status: string;
}

/**
 * The two outcomes `closeCycle` accepts. ACTIVE is deliberately absent:
 * closing is what the mutation is for, and "closing by leaving it open" is
 * not a thing (CycleService.requireClosingOutcome).
 *
 * They are STRINGS in the schema, not an enum - the same shape as
 * `UNIT_TYPES` - so they travel literally. A value outside this set comes
 * back as VALIDATION_ERROR naming the whole list.
 */
export const CYCLE_OUTCOMES = ['HARVESTED', 'FAILED'] as const;
export type CycleOutcome = (typeof CYCLE_OUTCOMES)[number];

/** A cycle that has not been closed. The only state `closeCycle` accepts. */
export const CYCLE_ACTIVE = 'ACTIVE';

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

  /**
   * Optional; omitted means 0. It is what makes `expectedHarvestDate` right
   * for fish that were NOT stocked as fingerlings - six-month-old stock has
   * six fewer months to grow, and without this the prediction would be six
   * months late. Must be below the species' growthMonthsAvg, or
   * VALIDATION_ERROR.
   */
  stockingAgeMonths?: number | null;
}

/**
 * `closeCycle` arguments. NOT an `input` type in the schema - they are six
 * top-level arguments, which is why this interface is spread across the
 * mutation's variables rather than nested under `input`.
 *
 * `cycleId` is `Int!`, not `ID!` - unlike every id on `CreateCycleInput`. It
 * has to be converted from the string the queries return, the same
 * conversion `feedTypeId` needs.
 *
 * `outcome` is `String!`: "HARVESTED" or "FAILED", sent literally.
 *
 * THERE IS NO SURVIVAL RATE HERE, on purpose: `actualSurvivalRate` is
 * computed by the database from `harvestedCount`, and Postgres refuses to be
 * told it.
 */
export interface CloseCycleInput {
  cycleId: number;
  outcome: CycleOutcome;
  /** ISO date, yyyy-MM-dd. Cannot precede the cycle's stockingDate. */
  actualHarvestDate: string;
  /** Above zero for HARVESTED; zero is allowed for FAILED. */
  harvestedCount: number;
  /** Same rule as the count, for the same reason. */
  totalWeightKg: number;
  notes?: string | null;
}
