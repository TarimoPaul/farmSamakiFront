/**
 * Profitability, from the GraphQL `cycleProfitability` / `farmProfitability`
 * queries. EVERY FIGURE IS THE BACKEND'S (ProfitabilityService) - the screen
 * formats, it never adds revenue and costs together itself.
 *
 * The whole surface is `view_finance`, so nothing here is null-masked: a null
 * means something real (a cycle still running), never "you may not see this".
 *
 * Every id is a STRING (`ID!`); both queries take their ids as `Int`.
 */

/** One cycle's profit BEFORE feed and whole-farm costs. */
export interface CycleProfitability {
  cycleId: string;
  /** "T1 - Sato (HARVESTED)" - the same text as CycleRef.label. */
  label: string;
  /** ACTIVE / HARVESTED / FAILED. */
  status: string;
  /** YYYY-MM-DD; null while the cycle is running. */
  actualHarvestDate: string | null;
  /** NULL for an ACTIVE cycle - it has no final revenue yet. Not a zero. */
  revenue: number | null;
  /** false = total_revenue was never recorded and is counted as 0. */
  revenueRecorded: boolean;
  fingerlingCost: number;
  /** false = the fingerling cost was never recorded and is counted as 0. */
  fingerlingCostRecorded: boolean;
  /** Operational costs carrying this cycle's id, any date. */
  cycleOperationalCost: number;
  /** NULL for an ACTIVE cycle. FEED IS NOT IN IT. */
  cycleNetProfit: number | null;
}

/** One cost category's total - so "Chakula" can be seen next to the feed line. */
export interface CostCategoryAmount {
  costCategoryId: string;
  name: string;
  amount: number;
}

/**
 * A farm over a period (both dates inclusive).
 *   cycleCosts    = fingerlingCost + cycleOperationalCost
 *   farmCosts     = cycleCosts + feedCost + farmOperationalCost
 *   farmNetProfit = farmRevenue - farmCosts
 * `capitalTotal` is BESIDE all of that, never inside it.
 */
export interface FarmProfitability {
  farmId: string;
  farmName: string;
  fromDate: string;
  toDate: string;
  /** Revenue of CLOSED cycles whose actualHarvestDate is in the period. */
  farmRevenue: number;
  fingerlingCost: number;
  cycleOperationalCost: number;
  cycleOperationalCostByCategory: CostCategoryAmount[];
  cycleCosts: number;
  /** Feed purchases by purchaseDate, reversed ones excluded. */
  feedCost: number;
  reversedFeedPurchasesExcluded: number;
  /** Whole-farm (no cycle) operational costs by costDate. */
  farmOperationalCost: number;
  farmOperationalCostByCategory: CostCategoryAmount[];
  farmCosts: number;
  farmNetProfit: number;
  cycleCount: number;
  /** Cycles whose revenue or fingerling cost was never recorded. */
  incompleteCycleCount: number;
  cycles: CycleProfitability[];
  /** Assets by acquiredDate - INVESTMENT, not in farmCosts nor farmNetProfit. */
  capitalTotal: number;
}
