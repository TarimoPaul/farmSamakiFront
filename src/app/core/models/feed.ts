/**
 * The feed module's read/write shapes.
 *
 * Written against `schema.graphqls` directly (the Feed section, post
 * V16__feed_type_catalog.sql), not against the older audit doc: `feedType`
 * used to be free text on purchases and feedings, and `feedStockBalance` used
 * to be a single `Float!` for the whole farm. Both changed for the same
 * reason, which the schema states outright - free text could not answer the
 * question that decides every meal ("what age of fish is this feed for?"), and
 * one farm-wide number let +50kg of fry feed cancel -50kg of grower feed to
 * zero, showing an empty store that was full.
 *
 * ONE THING MAKES THIS UNLIKE water-quality: the backend does not hand the
 * screen a bare catalogue and let it choose. It answers
 * `feedTypesForCycle(cycleId)` with the types that suit the AGE OF THE FISH IN
 * THAT CYCLE, already filtered and sorted, each tagged with why it qualified.
 * That judgement is the backend's - `FeedService.classify` - and the screen's
 * whole job is to render the tag honestly.
 */

/**
 * How well a feed fits the fish in the selected cycle.
 *
 * The wire type is `String!`, not a GraphQL enum, so this union is the
 * frontend's own narrowing of it - a value outside these three would be a
 * backend change, and typing it as a union is what makes that a compile-time
 * conversation instead of a silently mis-rendered option.
 *
 * `UNSAFE_HIGHER` is in the vocabulary but is NEVER RENDERED: the schema is
 * explicit that feed for fish older than these is not returned at all, on the
 * grounds that anything in a list of choices will be chosen by somebody
 * eventually.
 */
export type FeedSuitability = 'EXACT' | 'SAFE_LOWER' | 'UNSAFE_HIGHER';

/**
 * One entry in the feed catalogue.
 *
 * A SYSTEM catalogue, like Species - no `farmId`, every farm reads the same
 * rows - which is why a feed type is identified the same way across farms and
 * why retiring one flips `active` rather than deleting it: old feedings still
 * point at it.
 *
 * `minAgeMonths`/`maxAgeMonths` are the age window the feed is made for, in
 * months, BOTH ENDS INCLUSIVE. Fry feed is [0, 0], which is a real window and
 * not a missing value.
 *
 * There is no pellet size on this type. The catalogue is organised by the age
 * it feeds, not by the size of the granule, so the age window is what the UI
 * shows next to a name.
 */
export interface FeedType {
  feedTypeId: string;
  name: string;
  minAgeMonths: number;
  maxAgeMonths: number;
  active: boolean;
}

/**
 * A catalogue entry together with the REASON it qualified for this cycle.
 *
 * The suitability sits beside the feed type rather than on it, because it is
 * not a property of the feed: the same sack is EXACT for one pond and
 * SAFE_LOWER for the pond next to it. It is a fact about this pairing.
 */
export interface SuitableFeedType {
  feedType: FeedType;
  suitability: FeedSuitability;
}

/**
 * `feedTypesForCycle`'s answer.
 *
 * `noSuitableFeed` is NOT `feedTypes.length === 0` inferred by the client, and
 * the schema says so in as many words: an empty list here is a real gap in the
 * catalogue that somebody has to close, not an ordinary state to render
 * quietly.
 *
 * `cycleAgeMonths` is whole months since stocking, floored, never below zero.
 * The backend returns it so the client can EXPLAIN the decision without
 * recomputing it - and a client that recomputed it would eventually disagree
 * with the server that did the filtering.
 *
 * `feedTypes` arrives sorted: EXACT first, then SAFE_LOWER, and by name within
 * each band. The screen preserves that order rather than sorting again.
 */
export interface FeedTypesForCycle {
  cycleAgeMonths: number;
  noSuitableFeed: boolean;
  feedTypes: SuitableFeedType[];
}

/**
 * Remaining stock for ONE feed type.
 *
 * `quantityKg` CAN BE NEGATIVE, and that is not a bug to clamp away - the
 * schema's own comment on it is that the ledger reports, it does not judge. A
 * feeding is recorded whether or not a purchase was entered first, so a
 * negative balance is the system saying somebody fed from a sack nobody wrote
 * down. Clamping it at zero would hide exactly the discrepancy the number
 * exists to surface.
 */
export interface FeedStockBalance {
  feedType: FeedType;
  quantityKg: number;
}

/** One recorded feeding, from `feedingLogs(cycleId)`. */
export interface FeedingLog {
  logId: string;
  logDate: string;
  /** `FeedType!` - non-null since V16; a feeding that named no feed could not decrement any type's stock. */
  feedType: FeedType;
  quantityKg: number;
  recordedByName: string | null;
}

/**
 * `logFeeding` input.
 *
 * BOTH IDS ARE `Int!` HERE. That is worth stating because it contradicts the
 * types they are read back as: `FeedType.feedTypeId` and `Cycle.cycleId` are
 * both `ID!` and arrive as strings, so both have to be converted on the way
 * into this input. The same split the water-quality mutation has with
 * `unitId`.
 *
 * `logDate` is optional in the schema (omitted means today) but the form
 * always sends it: feeding is routinely written up at the end of a shift or
 * the next morning, so the date is a thing the person knows and the form must
 * let them say.
 *
 * The server re-checks `feedTypeId` against the cycle's age using the SAME
 * rule as `feedTypesForCycle`, and rejects exactly two things with
 * VALIDATION_ERROR: feed for fish OLDER than these (`minAgeMonths` above the
 * cycle's age), and a retired type. SAFE_LOWER is deliberately allowed
 * through - feeding growers on fry feed is a legitimate decision when the
 * store is down to its last bag, so warning about it is the UI's job and
 * blocking it is nobody's.
 */
export interface LogFeedingInput {
  cycleId: number;
  feedTypeId: number;
  quantityKg: number;
  /** ISO date, yyyy-MM-dd. */
  logDate: string;
}
