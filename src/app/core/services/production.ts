import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { Cycle, CreateCycleInput } from '../models/cycle';
import { CreateProductionUnitInput, ProductionUnit } from '../models/production-unit';
import { Species } from '../models/species';

/**
 * Production units, cycles and the species catalogue - the cycle CONTEXT the
 * log screens need before they can record anything.
 *
 * Everything here is farm-scoped by the BACKEND, never by an argument: each
 * query resolves through `requireFarmScope`, which reads the caller's
 * membership or the `X-Farm-Id` header the interceptor attaches. So there is
 * no `farmId` parameter to get wrong, and switching farm changes what these
 * calls answer without a single line of this service knowing.
 *
 * Failures leave here as ApiError with `errorCode` intact - GraphqlService
 * has already done that work, including for the failures that arrive as HTTP
 * 200 inside `errors[]`.
 */
@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly graphql = inject(GraphqlService);

  /**
   * Units, cycles and species in ONE round trip.
   *
   * One operation rather than three because the Production screen needs all
   * three at once to be useful at all: the cycles table names units, and the
   * "new cycle" form cannot be opened without both the unit list and the
   * species catalogue. It also means one thing to wait for and one thing to
   * fail - and GraphqlService refuses partial data anyway, so three calls
   * would only have given three ways to be half-loaded.
   */
  loadContext(): Observable<ProductionContext> {
    return this.graphql.query<ProductionContext>(CONTEXT_QUERY);
  }

  /**
   * Just the cycles - what a logging screen needs to turn a stored cycle id
   * into the cycle (and therefore the UNIT) it is about.
   *
   * Separate from loadContext because those screens have no use for the unit
   * list or the species catalogue, and because this query takes no cycle
   * argument: it asks the backend what THIS farm has, which is precisely how
   * a stale selection is caught without ever sending it anywhere.
   */
  listCycles(): Observable<Cycle[]> {
    return this.graphql
      .query<{ cycles: Cycle[] }>(CYCLES_QUERY)
      .pipe(map((data) => data.cycles));
  }

  createUnit(input: CreateProductionUnitInput): Observable<ProductionUnit> {
    return this.graphql
      .query<{ createProductionUnit: ProductionUnit }>(CREATE_UNIT, { input })
      .pipe(map((data) => data.createProductionUnit));
  }

  createCycle(input: CreateCycleInput): Observable<Cycle> {
    return this.graphql
      .query<{ createCycle: Cycle }>(CREATE_CYCLE, { input })
      .pipe(map((data) => data.createCycle));
  }
}

export interface ProductionContext {
  productionUnits: ProductionUnit[];
  cycles: Cycle[];
  species: Species[];
}

const UNIT_FIELDS = `
  unitId
  code
  type
  sizeM3
  waterSource
  status
`;

const CYCLE_FIELDS = `
  cycleId
  speciesName
  stockingDate
  fingerlingsCount
  survivalRateEstimate
  expectedHarvestDate
  actualHarvestDate
  status
  unit {
    unitId
    code
    type
  }
`;

const CONTEXT_QUERY = `
  query ProductionContext {
    productionUnits { ${UNIT_FIELDS} }
    cycles { ${CYCLE_FIELDS} }
    species {
      speciesId
      name
      growthMonthsAvg
      avgHarvestWeightKg
    }
  }
`;

const CYCLES_QUERY = `
  query Cycles {
    cycles { ${CYCLE_FIELDS} }
  }
`;

const CREATE_UNIT = `
  mutation CreateProductionUnit($input: CreateProductionUnitInput!) {
    createProductionUnit(input: $input) { ${UNIT_FIELDS} }
  }
`;

const CREATE_CYCLE = `
  mutation CreateCycle($input: CreateCycleInput!) {
    createCycle(input: $input) { ${CYCLE_FIELDS} }
  }
`;
