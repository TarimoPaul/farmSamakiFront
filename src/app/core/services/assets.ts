import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { Asset, AssetCategory, AssetFarm, CreateAssetArgs } from '../models/asset';

/**
 * The asset register and its category catalogue.
 *
 * EVERY CALL BUT `myFarms` IS `manage_assets` (V22 - OWNER and FARM_MANAGER),
 * the read as well as the writes, so there is no read-only version of anything
 * here. `myFarms` needs only a login.
 *
 * NOT FARM-SCOPED, and not in the way the catalogues are either: the
 * X-Farm-Id header the interceptor adds does not narrow `assets`, which
 * answers for every farm the caller belongs to or owns. The one exception is
 * ROOT, which holds no membership and so sees only the farm it has selected.
 */
@Injectable({ providedIn: 'root' })
export class AssetsService {
  private readonly graphql = inject(GraphqlService);

  /** Every asset across the caller's farms, newest acquisition first. */
  list(): Observable<Asset[]> {
    return this.graphql.query<{ assets: Asset[] }>(ASSETS).pipe(map((data) => data.assets));
  }

  /**
   * The caller's OWN farms - owned or a member of - for the form's farm
   * select. Unlike `/api/farms` (manage_farms, every farm in the company)
   * this is login-only and scoped to the caller; a caller with no farm gets
   * an empty list, not an error.
   */
  myFarms(): Observable<AssetFarm[]> {
    return this.graphql
      .query<{ myFarms: AssetFarm[] }>(MY_FARMS)
      .pipe(map((data) => data.myFarms));
  }

  /** The whole category catalogue, by name. */
  categories(): Observable<AssetCategory[]> {
    return this.graphql
      .query<{ assetCategories: AssetCategory[] }>(ASSET_CATEGORIES)
      .pipe(map((data) => data.assetCategories));
  }

  /**
   * Registers an asset.
   *
   * Refused with FORBIDDEN for a farm the caller neither belongs to nor owns,
   * and with VALIDATION_ERROR - in a sentence naming the field - for a blank
   * name, a cost at or below zero, a future acquiredDate, or an over-long
   * label.
   */
  create(args: CreateAssetArgs): Observable<Asset> {
    return this.graphql
      .query<{ createAsset: Asset }>(CREATE_ASSET, {
        name: args.name,
        farmId: args.farmId,
        cost: args.cost,
        acquiredDate: args.acquiredDate,
        sizeLabel: args.sizeLabel,
        assetCategoryId: args.assetCategoryId,
      })
      .pipe(map((data) => data.createAsset));
  }

  /**
   * Adds a category. CONFLICT for a name already taken - soft-deleted
   * categories included, since their rows still hold the UNIQUE name.
   */
  createCategory(name: string): Observable<AssetCategory> {
    return this.graphql
      .query<{ createAssetCategory: AssetCategory }>(CREATE_ASSET_CATEGORY, { name })
      .pipe(map((data) => data.createAssetCategory));
  }
}

const CATEGORY_FIELDS = `
  assetCategoryId
  name
`;

const ASSET_FIELDS = `
  assetId
  name
  farm { farmId name }
  assetCategory { ${CATEGORY_FIELDS} }
  cost
  sizeLabel
  acquiredDate
`;

const ASSETS = `
  query Assets {
    assets { ${ASSET_FIELDS} }
  }
`;

const MY_FARMS = `
  query MyFarms {
    myFarms { farmId name }
  }
`;

const ASSET_CATEGORIES = `
  query AssetCategories {
    assetCategories { ${CATEGORY_FIELDS} }
  }
`;

// FLAT ARGUMENTS. Both ids are `Int!` here although the rows carry them as
// `ID!`; `cost` is `Float!`; `sizeLabel` is the only optional one.
const CREATE_ASSET = `
  mutation CreateAsset(
    $name: String!
    $farmId: Int!
    $cost: Float!
    $acquiredDate: String!
    $sizeLabel: String
    $assetCategoryId: Int!
  ) {
    createAsset(
      name: $name
      farmId: $farmId
      cost: $cost
      acquiredDate: $acquiredDate
      sizeLabel: $sizeLabel
      assetCategoryId: $assetCategoryId
    ) { ${ASSET_FIELDS} }
  }
`;

const CREATE_ASSET_CATEGORY = `
  mutation CreateAssetCategory($name: String!) {
    createAssetCategory(name: $name) { ${CATEGORY_FIELDS} }
  }
`;
