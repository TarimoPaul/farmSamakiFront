/**
 * A fish species, from the GraphQL `species` query.
 *
 * A SYSTEM catalogue, not farm data: the table has no `farm_id`, every farm
 * sees the same rows, and there is deliberately no create/edit mutation
 * (see the backend's SpeciesService). It is read for one reason - a cycle
 * cannot be created without a `speciesId`.
 *
 * `speciesId` is a string because the schema types it `ID!`, which GraphQL
 * serialises as a string even though the column is an integer. Anything
 * sending it back as an `Int` argument has to convert.
 */
export interface Species {
  speciesId: string;
  name: string;
  /** Average months to harvest - what the backend uses to compute expectedHarvestDate. */
  growthMonthsAvg: number;
  avgHarvestWeightKg: number;
}
