import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import {
  CreateFeedTypeArgs,
  FeedStockBalance,
  FeedType,
  FeedTypesForCycle,
  FeedingLog,
  LogFeedingInput,
  UpdateFeedTypeArgs,
} from '../models/feed';

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

  /**
   * The catalogue itself, for the screen that manages it.
   *
   * NOT the same call as `feedTypesForCycle`, and not interchangeable with it:
   * this is the whole system catalogue, unfiltered by any cycle's age, and it
   * must never fill a feeding dropdown.
   *
   * `activeOnly` defaults to active-only on the backend when omitted. The
   * catalogue screen passes `false` deliberately - it renders an active/
   * disabled column, and a column that could only ever say "active" would be
   * a column about nothing.
   *
   * Gated on `manage_feed_stock` by the backend (FeedService.listFeedTypes),
   * which is a stricter gate than the `view_dashboard` the other feed reads
   * use - this is administration, not a farm read.
   */
  feedTypes(activeOnly?: boolean): Observable<FeedType[]> {
    return this.graphql
      .query<{ feedTypes: FeedType[] }>(FEED_TYPES, { activeOnly })
      .pipe(map((data) => data.feedTypes));
  }

  /**
   * Adds a type to the catalogue.
   *
   * THREE VARIABLES, not one input object - see CreateFeedTypeArgs. The
   * backend refuses two things with VALIDATION_ERROR, both naming what was
   * wrong: an age below zero, and a window whose top is under its bottom. A
   * duplicate name is a database unique constraint, so it arrives as CONFLICT
   * with the generic data-integrity sentence and the caller supplies the copy.
   *
   * The new type is created ACTIVE; `active` is not a field this can set.
   */
  createFeedType(args: CreateFeedTypeArgs): Observable<FeedType> {
    return this.graphql
      .query<{ createFeedType: FeedType }>(CREATE_FEED_TYPE, {
        name: args.name,
        minAgeMonths: args.minAgeMonths,
        maxAgeMonths: args.maxAgeMonths,
      })
      .pipe(map((data) => data.createFeedType));
  }

  /**
   * Edits an existing type's name and age window. Does NOT touch `active`.
   *
   * CHANGING THE WINDOW CHANGES TOMORROW'S ANSWERS, not yesterday's records:
   * a feeding points at the type by id, so history is untouched, but
   * `feedTypesForCycle` will classify differently from now on - a type that
   * was EXACT for a cycle can become SAFE_LOWER, or stop being offered at
   * all. The backend applies the same window rules as the create.
   */
  updateFeedType(args: UpdateFeedTypeArgs): Observable<FeedType> {
    return this.graphql
      .query<{ updateFeedType: FeedType }>(UPDATE_FEED_TYPE, {
        feedTypeId: args.feedTypeId,
        name: args.name,
        minAgeMonths: args.minAgeMonths,
        maxAgeMonths: args.maxAgeMonths,
      })
      .pipe(map((data) => data.updateFeedType));
  }

  /**
   * Retires a type, or brings it back.
   *
   * THE INTENDED WAY to stop using a feed, and V16 says so in as many words:
   * a type that is no longer used is disabled, not deleted, because old
   * purchases and feedings point at it. A disabled type stays in the
   * catalogue and stays readable everywhere it was used; what it loses is its
   * place in `feedTypesForCycle`, so nobody can pick it for a new feeding.
   *
   * Idempotent on the backend - disabling an already-disabled type is fine.
   */
  setFeedTypeActive(feedTypeId: number, active: boolean): Observable<FeedType> {
    return this.graphql
      .query<{ setFeedTypeActive: FeedType }>(SET_FEED_TYPE_ACTIVE, { feedTypeId, active })
      .pipe(map((data) => data.setFeedTypeActive));
  }

  /**
   * Removes a type from the catalogue - and is REFUSED while anything points
   * at it, with FEED_TYPE_IN_USE.
   *
   * The refusal is not a formality. The delete is soft, `FeedType` carries a
   * `@SQLRestriction`, and `FeedingLog.feedType` is `FeedType!`, so a type
   * hidden while still referenced does not hide one row - it makes the whole
   * feeding history fail to load. The backend proves this in its own test
   * suite rather than asserting it.
   *
   * So this is for a type registered by mistake. For one that has been used,
   * the answer is `setFeedTypeActive(id, false)`, and the backend's refusal
   * message says exactly that.
   */
  deleteFeedType(feedTypeId: number): Observable<boolean> {
    return this.graphql
      .query<{ deleteFeedType: boolean }>(DELETE_FEED_TYPE, { feedTypeId })
      .pipe(map((data) => data.deleteFeedType));
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

// `query FeedTypes(` is deliberately distinct from `query FeedTypesForCycle(`
// as a STRING, because the tests match operations by substring - the two are
// different questions and must never be matched for one another.
const FEED_TYPES = `
  query FeedTypes($activeOnly: Boolean) {
    feedTypes(activeOnly: $activeOnly) { ${FEED_TYPE_FIELDS} }
  }
`;

const CREATE_FEED_TYPE = `
  mutation CreateFeedType($name: String!, $minAgeMonths: Int!, $maxAgeMonths: Int!) {
    createFeedType(name: $name, minAgeMonths: $minAgeMonths, maxAgeMonths: $maxAgeMonths) {
      ${FEED_TYPE_FIELDS}
    }
  }
`;

const UPDATE_FEED_TYPE = `
  mutation UpdateFeedType($feedTypeId: Int!, $name: String!, $minAgeMonths: Int!, $maxAgeMonths: Int!) {
    updateFeedType(
      feedTypeId: $feedTypeId
      name: $name
      minAgeMonths: $minAgeMonths
      maxAgeMonths: $maxAgeMonths
    ) {
      ${FEED_TYPE_FIELDS}
    }
  }
`;

const SET_FEED_TYPE_ACTIVE = `
  mutation SetFeedTypeActive($feedTypeId: Int!, $active: Boolean!) {
    setFeedTypeActive(feedTypeId: $feedTypeId, active: $active) { ${FEED_TYPE_FIELDS} }
  }
`;

// Returns Boolean, not a FeedType: after the delete there is no type to hand
// back - every query hides it - so `true` is the whole of the answer. A
// failure arrives as an error, never as `false`.
const DELETE_FEED_TYPE = `
  mutation DeleteFeedType($feedTypeId: Int!) {
    deleteFeedType(feedTypeId: $feedTypeId)
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
