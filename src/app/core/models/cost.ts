import { AssetFarm } from './asset';

/**
 * Operational costs, from the GraphQL `costs` / `costCategories` /
 * `farmCycles` queries.
 *
 * COMPANY-WIDE, like the asset register: `costs` answers for every farm the
 * caller belongs to or owns, so every row carries its own `farm`. What this
 * register has that assets do not is an OPTIONAL cycle - a cost either belongs
 * to one cycle or to the farm as a whole, and the screen keeps the two apart.
 *
 * Every id here is a STRING (`ID!`), while `createCost` takes `farmId`,
 * `cycleId` and `costCategoryId` as `Int`. See CreateCostArgs.
 */
export interface Cost {
  costId: string;
  /** The same `{ farmId, name }` label as `Asset.farm` and `myFarms`. */
  farm: AssetFarm;
  /**
   * The cycle this cost belongs to, or NULL for a WHOLE-FARM cost - electricity,
   * rent, a guard's wage. Null is a kind of cost, not missing data.
   */
  cycle: CycleRef | null;
  costCategory: CostCategory;
  /** `NUMERIC(14,2)` on the backend, `Float!` on the wire. Always > 0. */
  amount: number;
  /** YYYY-MM-DD. Never in the future. */
  costDate: string;
  description: string | null;
}

/** A cost category. A user-created SYSTEM catalogue; the name is UNIQUE, deleted rows included. */
export interface CostCategory {
  costCategoryId: string;
  name: string;
}

/**
 * A cycle as a LABEL - the backend builds "T1 - Sato (ACTIVE)" from three
 * tables, so the picker and the saved row read the same text. `farmCycles`
 * includes CLOSED cycles on purpose: bills arrive after the harvest.
 */
export interface CycleRef {
  cycleId: string;
  label: string;
  /** ACTIVE / HARVESTED / FAILED - already inside `label`. */
  status: string;
}

/**
 * What `createCost` is called with - six FLAT arguments, not an input object.
 *
 * The ids are NUMBERS because the mutation declares them `Int`. `cycleId` is
 * null for a whole-farm cost; `description` is null for "none", never ''.
 */
export interface CreateCostArgs {
  farmId: number;
  cycleId: number | null;
  costCategoryId: number;
  amount: number;
  costDate: string;
  description: string | null;
}
