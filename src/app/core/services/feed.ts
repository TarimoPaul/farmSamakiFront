import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { FeedStockBalance, FeedTypesForCycle, FeedingLog, LogFeedingInput } from '../models/feed';

/**
 * The feed module: what may be fed, what was fed, and what is left.
 *
 * Three calls, and the interesting relationship is between the first and the
 * second:
 *
 *   feedTypesForCycle(cycleId)  what this cycle's fish may EAT   -> the dropdown
 *   feedStockBalance()          what the farm HAS, per type      -> the panel
 *
 * THEY ARE NOT THE SAME LIST and the dropdown must never be built from the
 * balance. The balance carries every feed type the farm has moved stock for,
 * including pellets made for fish months older than these; offering those is
 * how you choke a tank. The age filtering lives in the backend, which knows
 * the cycle's stocking date, and this service carries its answer through
 * untouched.
 *
 * `feedStockBalance` takes no cycle argument on purpose - stock is the FARM'S,
 * not a cycle's, and the farm comes from the X-Farm-Id header the interceptor
 * adds, exactly as everywhere else.
 */
@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly graphql = inject(GraphqlService);

  /**
   * The feeds this cycle's fish can eat, tagged, plus the cycle's age and the
   * "nothing fits" flag.
   *
   * The server has already dropped anything UNSAFE_HIGHER, so what comes back
   * is safe to offer as-is. It is still tagged, because SAFE_LOWER - feed made
   * for younger fish - is edible but wasteful, and the person choosing it
   * should be told which one they are picking.
   */
  feedTypesForCycle(cycleId: number): Observable<FeedTypesForCycle> {
    return this.graphql
      .query<{ feedTypesForCycle: FeedTypesForCycle }>(FEED_TYPES_FOR_CYCLE, { cycleId })
      .pipe(map((data) => data.feedTypesForCycle));
  }

  /** Remaining kg per feed type, farm-wide. May be empty; entries may be negative. */
  feedStockBalance(): Observable<FeedStockBalance[]> {
    return this.graphql
      .query<{ feedStockBalance: FeedStockBalance[] }>(FEED_STOCK_BALANCE)
      .pipe(map((data) => data.feedStockBalance));
  }

  feedingLogs(cycleId: number): Observable<FeedingLog[]> {
    return this.graphql
      .query<{ feedingLogs: FeedingLog[] }>(FEEDING_LOGS, { cycleId })
      .pipe(map((data) => data.feedingLogs));
  }

  /**
   * Records one feeding.
   *
   * The chosen feed has already been through the backend's own filter on the
   * way IN - it came out of feedTypesForCycle - so a VALIDATION_ERROR here is
   * not expected. It is still handled by the caller, because the write-time
   * check is a separate check on a separate request: the cycle can age past a
   * feed, or an admin can retire a type, between the dropdown being filled and
   * the button being pressed.
   */
  logFeeding(input: LogFeedingInput): Observable<FeedingLog> {
    return this.graphql
      .query<{ logFeeding: FeedingLog }>(LOG_FEEDING, { input })
      .pipe(map((data) => data.logFeeding));
  }
}

/**
 * The whole catalogue row, everywhere a FeedType appears.
 *
 * The age window is not decoration: it is the only thing on the type that
 * explains WHY a feed is EXACT here and SAFE_LOWER in the next pond, and the
 * dropdown and the stock panel both show it. Asking for it once, in one
 * fragment, is what keeps those two from drifting apart.
 */
const FEED_TYPE_FIELDS = `
  feedTypeId
  name
  minAgeMonths
  maxAgeMonths
  active
`;

const FEEDING_LOG_FIELDS = `
  logId
  logDate
  quantityKg
  recordedByName
  feedType { ${FEED_TYPE_FIELDS} }
`;

const FEED_TYPES_FOR_CYCLE = `
  query FeedTypesForCycle($cycleId: Int!) {
    feedTypesForCycle(cycleId: $cycleId) {
      cycleAgeMonths
      noSuitableFeed
      feedTypes {
        suitability
        feedType { ${FEED_TYPE_FIELDS} }
      }
    }
  }
`;

const FEED_STOCK_BALANCE = `
  query FeedStockBalance {
    feedStockBalance {
      quantityKg
      feedType { ${FEED_TYPE_FIELDS} }
    }
  }
`;

const FEEDING_LOGS = `
  query FeedingLogs($cycleId: Int) {
    feedingLogs(cycleId: $cycleId) { ${FEEDING_LOG_FIELDS} }
  }
`;

const LOG_FEEDING = `
  mutation LogFeeding($input: LogFeedingInput!) {
    logFeeding(input: $input) { ${FEEDING_LOG_FIELDS} }
  }
`;
