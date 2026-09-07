/**
 * A fish species, from the GraphQL `species` query.
 *
 * A SYSTEM catalogue, not farm data: the table has no `farm_id` and every farm
 * sees the same rows - the same shape as the feed catalogue, and the reason
 * neither screen reads the farm selection or reloads when it changes.
 *
 * READ AND WRITE ARE DIFFERENT PERMISSIONS, unlike the feed catalogue where
 * both halves are one code. The list is `view_dashboard`, because a WORKER
 * choosing a species while starting a cycle has to see it; the create is
 * `manage_species` (V20, OWNER and FARM_MANAGER only), because what is written
 * here appears on every farm at once.
 *
 * THERE IS STILL NO `updateSpecies`, and that is a decision rather than a gap.
 * `growthMonthsAvg` computes `expectedHarvestDate` for EVERY cycle pointing at
 * the species, including ones already running - so editing it would silently
 * move harvest dates a farmer has already been shown. A misspelt species is
 * added again under the right name.
 *
 * `speciesId` is a string because the schema types it `ID!`, which GraphQL
 * serialises as a string even though the column is an integer. Anything
 * sending it back as an `Int` argument has to convert.
 */
export interface Species {
  speciesId: string;
  name: string;
  /**
   * Average months to harvest - what the backend uses to compute
   * expectedHarvestDate.
   *
   * A DECIMAL, not a count of whole months: the column is `NUMERIC(4,1)` and
   * 6.5 is a legitimate value that the backend deliberately preserves. Half a
   * month is roughly a fortnight of a farmer's planning, and rounding it away
   * client-side would move every predicted harvest date for the species.
   */
  growthMonthsAvg: number;
  /** Average harvest weight in kg - `NUMERIC(6,2)`, so two decimals survive. */
  avgHarvestWeightKg: number;
}

/**
 * What `createSpecies` is called with.
 *
 * NOT an `Input` type, and the name says so on purpose: the schema declares
 * three named arguments - `createSpecies(name: String!, growthMonthsAvg:
 * Float!, avgHarvestWeightKg: Float!)` - the same flat shape as
 * `createFeedType` rather than the input object most mutations in this app
 * take. So this interface is the CLIENT'S grouping of three variables, and the
 * service spreads it back out into three GraphQL variables.
 *
 * BOTH NUMBERS ARE `Float!` AND ARE SENT AS TYPED. The backend refuses
 * anything at or below zero with VALIDATION_ERROR, and refuses a value too
 * small to survive its column's scale (0.04 months is `0.0` in `NUMERIC(4,1)`,
 * which would be a species no cycle could ever use) with a sentence naming the
 * smallest value that fits. Rounding here would either hide that refusal or
 * commit a number the person never typed.
 *
 * A duplicate name is refused with CONFLICT - and by `SpeciesService` itself,
 * not by a database constraint, so the sentence is specific rather than the
 * generic integrity-violation prose. It counts SOFT-DELETED rows too: a name
 * that was used and removed is still taken.
 */
export interface CreateSpeciesArgs {
  name: string;
  growthMonthsAvg: number;
  avgHarvestWeightKg: number;
}
