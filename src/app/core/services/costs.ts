import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { Cost, CostCategory, CreateCostArgs, CycleRef } from '../models/cost';

/**
 * The operational-cost register, its category catalogue, and the cycle picker.
 *
 * EVERY CALL HERE IS `manage_costs` (V24 - OWNER and FARM_MANAGER), the reads
 * as well as the writes. The farm select's `myFarms` is login-only and lives
 * on AssetsService, which already owns it.
 *
 * NOT FARM-SCOPED: `costs` answers for every farm the caller belongs to or
 * owns, whatever X-Farm-Id says, and `farmCycles` takes its farm as an
 * argument - any of the caller's farms, not only the selected one.
 */
@Injectable({ providedIn: 'root' })
export class CostsService {
  private readonly graphql = inject(GraphqlService);

  /** Every cost across the caller's farms, in the backend's order. */
  list(): Observable<Cost[]> {
    return this.graphql.query<{ costs: Cost[] }>(COSTS).pipe(map((data) => data.costs));
  }

  categories(): Observable<CostCategory[]> {
    return this.graphql
      .query<{ costCategories: CostCategory[] }>(COST_CATEGORIES)
      .pipe(map((data) => data.costCategories));
  }

  /**
   * One farm's cycles, active AND closed, each with its ready-made label.
   * FORBIDDEN for a farm that is not the caller's.
   */
  farmCycles(farmId: number): Observable<CycleRef[]> {
    return this.graphql
      .query<{ farmCycles: CycleRef[] }>(FARM_CYCLES, { farmId })
      .pipe(map((data) => data.farmCycles));
  }

  /**
   * Records a cost. `cycleId: null` is a WHOLE-FARM cost. VALIDATION_ERROR -
   * in a sentence naming the field - for a cycle not on that farm, an amount
   * at or below zero, or a future costDate; FORBIDDEN for a farm not the caller's.
   */
  create(args: CreateCostArgs): Observable<Cost> {
    return this.graphql
      .query<{ createCost: Cost }>(CREATE_COST, {
        farmId: args.farmId,
        cycleId: args.cycleId,
        costCategoryId: args.costCategoryId,
        amount: args.amount,
        costDate: args.costDate,
        description: args.description,
      })
      .pipe(map((data) => data.createCost));
  }

  /** CONFLICT for a name already taken - soft-deleted categories included. */
  createCategory(name: string): Observable<CostCategory> {
    return this.graphql
      .query<{ createCostCategory: CostCategory }>(CREATE_COST_CATEGORY, { name })
      .pipe(map((data) => data.createCostCategory));
  }
}

const CATEGORY_FIELDS = `
  costCategoryId
  name
`;

const CYCLE_FIELDS = `
  cycleId
  label
  status
`;

const COST_FIELDS = `
  costId
  farm { farmId name }
  cycle { ${CYCLE_FIELDS} }
  costCategory { ${CATEGORY_FIELDS} }
  amount
  costDate
  description
`;

const COSTS = `
  query Costs {
    costs { ${COST_FIELDS} }
  }
`;

const COST_CATEGORIES = `
  query CostCategories {
    costCategories { ${CATEGORY_FIELDS} }
  }
`;

const FARM_CYCLES = `
  query FarmCycles($farmId: Int!) {
    farmCycles(farmId: $farmId) { ${CYCLE_FIELDS} }
  }
`;

// FLAT ARGUMENTS. The ids are `Int` here although the rows carry them as
// `ID!`; `cycleId` and `description` are the optional ones.
const CREATE_COST = `
  mutation CreateCost(
    $farmId: Int!
    $cycleId: Int
    $costCategoryId: Int!
    $amount: Float!
    $costDate: String!
    $description: String
  ) {
    createCost(
      farmId: $farmId
      cycleId: $cycleId
      costCategoryId: $costCategoryId
      amount: $amount
      costDate: $costDate
      description: $description
    ) { ${COST_FIELDS} }
  }
`;

const CREATE_COST_CATEGORY = `
  mutation CreateCostCategory($name: String!) {
    createCostCategory(name: $name) { ${CATEGORY_FIELDS} }
  }
`;
