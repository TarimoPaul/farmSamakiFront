import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { CycleProfitability, FarmProfitability } from '../models/profitability';

/**
 * The profit report. Both queries are `view_finance` (OWNER and FARM_MANAGER),
 * and both check real membership of the farm - FORBIDDEN for a farm, or a
 * cycle on a farm, that is not the caller's.
 *
 * NOT FARM-SCOPED by the header: the farm is an argument, so any of the
 * caller's farms can be asked about, not only the selected one.
 */
@Injectable({ providedIn: 'root' })
export class ProfitabilityService {
  private readonly graphql = inject(GraphqlService);

  /** Null revenue and profit, status ACTIVE, for a running cycle - not an error. */
  cycle(cycleId: number): Observable<CycleProfitability> {
    return this.graphql
      .query<{ cycleProfitability: CycleProfitability }>(CYCLE_PROFITABILITY, { cycleId })
      .pipe(map((data) => data.cycleProfitability));
  }

  /** VALIDATION_ERROR when fromDate is after toDate, or a date is not YYYY-MM-DD. */
  farm(farmId: number, fromDate: string, toDate: string): Observable<FarmProfitability> {
    return this.graphql
      .query<{ farmProfitability: FarmProfitability }>(FARM_PROFITABILITY, {
        farmId,
        fromDate,
        toDate,
      })
      .pipe(map((data) => data.farmProfitability));
  }
}

const CYCLE_FIELDS = `
  cycleId
  label
  status
  actualHarvestDate
  revenue
  revenueRecorded
  fingerlingCost
  fingerlingCostRecorded
  cycleOperationalCost
  cycleNetProfit
`;

const CATEGORY_AMOUNT_FIELDS = `
  costCategoryId
  name
  amount
`;

const CYCLE_PROFITABILITY = `
  query CycleProfitability($cycleId: Int!) {
    cycleProfitability(cycleId: $cycleId) { ${CYCLE_FIELDS} }
  }
`;

const FARM_PROFITABILITY = `
  query FarmProfitability($farmId: Int!, $fromDate: String!, $toDate: String!) {
    farmProfitability(farmId: $farmId, fromDate: $fromDate, toDate: $toDate) {
      farmId
      farmName
      fromDate
      toDate
      farmRevenue
      fingerlingCost
      cycleOperationalCost
      cycleOperationalCostByCategory { ${CATEGORY_AMOUNT_FIELDS} }
      cycleCosts
      feedCost
      reversedFeedPurchasesExcluded
      farmOperationalCost
      farmOperationalCostByCategory { ${CATEGORY_AMOUNT_FIELDS} }
      farmCosts
      farmNetProfit
      cycleCount
      incompleteCycleCount
      cycles { ${CYCLE_FIELDS} }
      capitalTotal
    }
  }
`;
