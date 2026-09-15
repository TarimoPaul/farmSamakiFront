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

  /**
   * What the fingerlings cost - optional at stocking. MONEY: null both when
   * it was never recorded AND when the caller lacks `view_finance`, and the
   * two are indistinguishable on the wire. Render null as a dash, never 0.
   */
  fingerlingCost: number | null;

  // ---- Written by closeCycle alone; null while a cycle is running ----
  // Since V25 every one of these is SUMMED from the harvest events at close,
  // not typed in. Cycles closed before V25 keep their hand-entered count and
  // weight, and have mortalityCount/totalRevenue null (no backfill).
  actualHarvestDate: string | null;
  /** Fish that left ALIVE: SOLD + REMOVED. */
  harvestedCount: number | null;
  /** Weight of SOLD + REMOVED, kg. */
  totalWeightKg: number | null;
  /** DIED. Counted in neither harvestedCount nor survival. */
  mortalityCount: number | null;
  /** Sum of saleAmount over SOLD. MONEY: null without `view_finance`. */
  totalRevenue: number | null;
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

  /** Optional; > 0 when given, or VALIDATION_ERROR. NUMERIC(14,2). */
  fingerlingCost?: number | null;
}

/**
 * `closeCycle` arguments. NOT an `input` type in the schema - they are four
 * top-level arguments, which is why this interface is spread across the
 * mutation's variables rather than nested under `input`.
 *
 * THERE IS NO COUNT OR WEIGHT HERE since V25: the backend sums them from the
 * harvest events when the cycle closes. HARVESTED with no SOLD/REMOVED event
 * is refused (VALIDATION_ERROR) - that cycle is FAILED.
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
  /** ISO date, yyyy-MM-dd. Not before stocking, nor before the last event. */
  actualHarvestDate: string;
  notes?: string | null;
}

/**
 * Why fish left the pond. STRINGS in the schema, not an enum - the same shape
 * as `UNIT_TYPES` and `CYCLE_OUTCOMES` - so they travel literally.
 *
 *  - SOLD:    sold; weight AND sale amount required.
 *  - DIED:    mortality; weight optional, no sale amount.
 *  - REMOVED: taken out alive without a sale; weight optional, no sale amount.
 */
export const HARVEST_REASONS = ['SOLD', 'DIED', 'REMOVED'] as const;
export type HarvestReason = (typeof HARVEST_REASONS)[number];

/** One `HarvestEvent` as `harvestEvents` returns it. */
export interface HarvestEvent {
  /** `ID!` - a string. `deleteHarvestEvent` takes it as `Int!`, so convert. */
  harvestEventId: string;
  /** `Int!` on this type, unlike `Cycle.cycleId`. */
  cycleId: number;
  eventDate: string;
  fishCount: number;
  /** Null possible for DIED/REMOVED only. */
  weightKg: number | null;
  reason: string;
  /** SOLD only. MONEY: null without `view_finance`, and always null otherwise. */
  saleAmount: number | null;
}

/**
 * `recordHarvestEvent` arguments - top-level, like closeCycle's. `cycleId` is
 * `Int!`. `saleAmount` must be null for DIED/REMOVED: the backend rejects any
 * non-zero amount on a fish that was not sold.
 */
export interface RecordHarvestEventInput {
  cycleId: number;
  /** ISO date. Not before stocking, not in the future. */
  eventDate: string;
  fishCount: number;
  weightKg: number | null;
  reason: HarvestReason;
  saleAmount: number | null;
}

/**
 * `correctHarvestEvent` arguments. The backend soft-deletes the old event and
 * records this one in ONE transaction, so the answer carries a NEW id. The
 * cycle is the old event's - a correction never moves an event.
 */
export interface CorrectHarvestEventInput extends Omit<RecordHarvestEventInput, 'cycleId'> {
  /** `Int!` - converted from the `ID!` string the list returns. */
  harvestEventId: number;
}
