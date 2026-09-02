/**
 * One water-quality reading, from the GraphQL `waterQualityLogs` query.
 *
 * A reading belongs to a UNIT, not to a cycle: `water_quality_logs.unit_id`
 * is the only link, because the water is the tank's, not the fish's. The
 * query still accepts `cycleId` as a convenience - the backend resolves it to
 * the unit that cycle runs in - which is what lets a cycle-scoped screen ask
 * for "the readings for this cycle" without knowing that detail.
 *
 * EVERY MEASUREMENT IS NULLABLE, and that is the design, not an oversight:
 * somebody holding only a pH meter records pH and leaves the rest blank,
 * which is more honest than writing zeros.
 */
export interface WaterQualityLog {
  logId: string;
  unit: { unitId: string; code: string };
  logDate: string;
  /** 0.0 - 14.0 */
  ph: number | null;
  /** Degrees Celsius */
  temperature: number | null;
  /** Dissolved oxygen, mg/L */
  oxygen: number | null;
  /** Total ammonia (NH3 + NH4+), mg/L. 0.02 is safe; 0.25 kills slowly. */
  ammonia: number | null;
  notes: string | null;
  recordedByName: string | null;
}

/**
 * `logWaterQuality` input.
 *
 * `unitId` is an `Int!` here (not an `ID!` as on the ProductionUnit type), so
 * callers holding a unit's string id must convert it.
 *
 * `logDate` is omitted by the form on purpose - left out, the backend records
 * today, which is the only date somebody standing at the tank can mean.
 */
export interface LogWaterQualityInput {
  unitId: number;
  ph?: number | null;
  temperature?: number | null;
  oxygen?: number | null;
  ammonia?: number | null;
  notes?: string | null;
}
