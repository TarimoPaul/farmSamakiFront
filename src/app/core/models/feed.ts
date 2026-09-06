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
 * One purchase line, as returned to THIS caller.
 *
 * THE TWO COST FIELDS ARE NULLABLE, and that is the whole point of this
 * type. `unitCost` and `totalCost` are `Float` (not `Float!`) in the schema
 * because the BACKEND MASKS THEM: a caller without `view_feed_cost` gets
 * every operational field - date, feed type, quantity, supplier - and null
 * for both prices. The schema's own note explains why the fields had to be
 * loosened rather than the rows dropped: a non-null field returning null
 * would collapse the WHOLE LIST, since graphql-java propagates the null up
 * to the nearest nullable parent.
 *
 * SO THE UI MUST NOT RE-DERIVE THIS FROM A PERMISSION. The masking happened
 * on the server, before the number left it, and that is deliberate - a
 * column hidden by the client still shipped the price inside the JSON, where
 * DevTools or a direct /graphql call would find it. The screen's only job is
 * to render null honestly (an em-dash), never as 0, "null" or NaN.
 *
 * `totalCost` is DB-generated (`GENERATED ALWAYS AS quantity_kg * unit_cost
 * STORED`, V1), so it is never an input and never computed here.
 *
 * `supplier` is genuinely optional data - null means nobody recorded who
 * sold it, which is different from a price being withheld.
 */
export interface FeedPurchase {
  purchaseId: string;
  /** ISO date, yyyy-MM-dd. */
  purchaseDate: string;
  feedType: FeedType;
  quantityKg: number;
  /** null = masked for this caller, NOT "no price was entered". */
  unitCost: number | null;
  /** null = masked. Otherwise quantityKg * unitCost, computed by the database. */
  totalCost: number | null;
  supplier: string | null;
  /**
   * Cancelled by a correcting entry, rather than deleted.
   *
   * A purchase is never removed: it wrote kilos into the stock ledger, and
   * the ledger is append-only. Undoing one writes an OUT movement for the
   * same kilos, so the balance returns to where it was while the history
   * still says both things happened. The row therefore stays in this list,
   * flagged.
   *
   * READ FROM THE LEDGER, not from a column on the purchase - there is no
   * `reversed_at`, deliberately, because it would be a copy of a fact the
   * ledger already holds and copies drift.
   *
   * NOT MASKED by `view_feed_cost`: being reversed is not a price. Somebody
   * planning a feeding needs to know these sacks are not in the store, even
   * if they may not know what they cost.
   */
  reversed: boolean;
}

/**
 * `recordFeedPurchase` input.
 *
 * `feedTypeId` IS `Int!`, not `ID!` - the same split `LogFeedingInput` has,
 * and the same trap: `FeedType.feedTypeId` is read back as `ID!`, so it
 * arrives as a string and must be converted on the way into this input.
 *
 * `unitCost` is `Float!` here even though it is nullable on the way out.
 * There is no contradiction: the person buying is the one who types the
 * price, so it is always known at write time. What is optional is another
 * person's permission to READ it later.
 *
 * There is no `totalCost` field, and there cannot be - the database computes
 * it.
 */
export interface RecordFeedPurchaseInput {
  /** ISO date, yyyy-MM-dd. */
  purchaseDate: string;
  feedTypeId: number;
  quantityKg: number;
  unitCost: number;
  supplier: string | null;
}

/**
 * What `createFeedType` is called with.
 *
 * NOT an `Input` type, and the name says so on purpose: the schema declares
 * three named arguments - `createFeedType(name: String!, minAgeMonths: Int!,
 * maxAgeMonths: Int!)` - rather than the input object every other mutation in
 * this app takes. The backend's own note gives the reason: the catalogue has
 * exactly three writable columns, and `active` is not chosen at creation. So
 * this interface is the CLIENT'S grouping of three variables, and the service
 * spreads it back out into three GraphQL variables.
 *
 * Both ages are whole months and both are INCLUSIVE ends of the window, the
 * same convention `FeedType` is read back with. `maxAgeMonths` below
 * `minAgeMonths` is refused by the backend with VALIDATION_ERROR, in a
 * sentence that names both numbers.
 */
export interface CreateFeedTypeArgs {
  name: string;
  minAgeMonths: number;
  maxAgeMonths: number;
}

/**
 * What `updateFeedType` is called with.
 *
 * The same three writable columns as CreateFeedTypeArgs plus the id, and
 * flat arguments for the same reason - the backend deliberately kept the two
 * mutations the same shape, so that two operations writing the same thing do
 * not look different for no reason.
 *
 * IT DOES NOT CARRY `active`. Enabling and disabling is `setFeedTypeActive`,
 * a separate mutation, so that somebody fixing a typo in a name is never one
 * misplaced field away from retiring a feed - the same split the Roles screen
 * makes between renaming and editing permissions.
 */
export interface UpdateFeedTypeArgs extends CreateFeedTypeArgs {
  feedTypeId: number;
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

/**
 * What a farm loses if one feed type is switched off - `feedTypeDeactivationImpact`.
 *
 * A WARNING, NEVER A BLOCK, and the schema states that outright:
 * `setFeedTypeActive` disables without consulting these numbers at all.
 * Leftover kilos are the usual REASON for retiring a feed, not a reason to
 * refuse; and the switch is reversible by the same mutation. So this query is
 * read BEFORE the confirmation, so the person deciding has the numbers in
 * front of them - and the decision stays theirs.
 *
 * FARM-SCOPED, unlike the catalogue itself. `feed_types` has no farm column,
 * but stock and cycles do, so these two numbers answer for the caller's farm
 * (the X-Farm-Id header) while the type being switched off is system-wide.
 *
 * WRITES NOTHING. It is `manage_feed_stock` - the same code as the action it
 * precedes - so a caller who may see this answer is a caller who could act on
 * it anyway.
 */
export interface FeedTypeDeactivationImpact {
  /**
   * This type's remaining stock in the caller's store, in kg - the SAME total
   * `feedStockBalance` shows on its line for the type.
   *
   * CAN BE NEGATIVE (the ledger reports, it does not judge) and is ZERO, not
   * null, for a type this farm has never moved. So the warning is gated on
   * `> 0`: a negative balance is a discrepancy for another screen to explain,
   * not kilos that would be stranded by disabling.
   */
  remainingKg: number;

  /**
   * ACTIVE cycles for which this type is, at today's age, their ONLY exact
   * feed - disable it and they are left with nothing made for their age.
   *
   * A cycle with any other option - another EXACT, or a SAFE_LOWER their fish
   * will still eat - IS NOT COUNTED. The schema is explicit about why: a
   * warning that fires for a cycle that still has something to eat is a
   * warning people learn to click past.
   */
  dependentActiveCycleCount: number;
}
