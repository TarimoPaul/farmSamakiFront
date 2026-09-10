/**
 * The asset register, from the GraphQL `assets` / `assetCategories` queries.
 *
 * COMPANY-WIDE, NOT FARM-SCOPED - the one read in the schema that crosses
 * farms. `assets` answers for EVERY farm the caller is a member or owner of,
 * not the farm in the X-Farm-Id header, which is why every row carries its
 * own `farm`: without it the list could be neither grouped nor totalled.
 *
 * Every id here is a STRING, because the schema types them `ID!` - while
 * `createAsset` takes `farmId: Int!` and `assetCategoryId: Int!`. Anything
 * sending one back has to convert (see CreateAssetArgs).
 */
export interface Asset {
  assetId: string;
  name: string;
  farm: AssetFarm;
  assetCategory: AssetCategory;
  /**
   * Purchase price, `NUMERIC(14,2)` on the backend and `Float!` on the wire.
   * Always > 0. Summed client-side in whole cents - there is no aggregation
   * endpoint, deliberately (see AssetResolver).
   */
  cost: number;
  /** Optional free text: "5000L", "ekari 2", "20HP". A label, not a measure. */
  sizeLabel: string | null;
  /** YYYY-MM-DD. Never in the future. */
  acquiredDate: string;
}

/**
 * A farm as a LABEL on an asset - id and name only. Also what `myFarms`
 * returns, so each farm-select option is exactly the `farm` the registered
 * asset will carry. Farms themselves are managed over REST (/api/farms).
 */
export interface AssetFarm {
  farmId: string;
  name: string;
}

/**
 * An asset category. A SYSTEM catalogue with no farm column, like Species and
 * FeedType - but user-created rather than an enum, so the register can start
 * empty. Its name is UNIQUE including soft-deleted rows, so a removed
 * category's name stays taken (CONFLICT).
 */
export interface AssetCategory {
  assetCategoryId: string;
  name: string;
}

/**
 * What `createAsset` is called with - the client's grouping of SIX FLAT
 * ARGUMENTS, not an input object.
 *
 * The two ids are NUMBERS here because the mutation declares them `Int!`,
 * even though the same ids arrive as `ID!` strings on the rows they came
 * from. `sizeLabel` is null for "no label", never an empty string.
 */
export interface CreateAssetArgs {
  name: string;
  farmId: number;
  cost: number;
  acquiredDate: string;
  sizeLabel: string | null;
  assetCategoryId: number;
}
