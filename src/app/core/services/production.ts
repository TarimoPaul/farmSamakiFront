import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { Cycle, CreateCycleInput } from '../models/cycle';
import { CreateProductionUnitInput, ProductionUnit } from '../models/production-unit';
import { Species } from '../models/species';


@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly graphql = inject(GraphqlService);


  loadContext(): Observable<ProductionContext> {
    return this.graphql.query<ProductionContext>(CONTEXT_QUERY);
  }

 
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
