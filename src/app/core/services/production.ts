import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import {
  Cycle,
  CloseCycleInput,
  CorrectHarvestEventInput,
  CreateCycleInput,
  HarvestEvent,
  RecordHarvestEventInput,
} from '../models/cycle';
import { CreateProductionUnitInput, ProductionUnit } from '../models/production-unit';
import { Species } from '../models/species';

@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly graphql = inject(GraphqlService);

  loadContext(): Observable<ProductionContext> {
    return this.graphql.query<ProductionContext>(CONTEXT_QUERY);
  }

  listCycles(): Observable<Cycle[]> {
    return this.graphql.query<{ cycles: Cycle[] }>(CYCLES_QUERY).pipe(map((data) => data.cycles));
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

  /**
   * Closes a cycle - BY HAND, always. Nothing else in the app calls this and
   * nothing schedules it: `expectedHarvestDate` passing is a prediction
   * coming true, not a trigger.
   *
   * The arguments are spread rather than wrapped, because `closeCycle` takes
   * four top-level arguments and has no `input` type - see CloseCycleInput.
   * No count or weight travels: the backend sums them from the events.
   */
  closeCycle(input: CloseCycleInput): Observable<Cycle> {
    return this.graphql
      .query<{ closeCycle: Cycle }>(CLOSE_CYCLE, {
        cycleId: input.cycleId,
        outcome: input.outcome,
        actualHarvestDate: input.actualHarvestDate,
        notes: input.notes ?? null,
      })
      .pipe(map((data) => data.closeCycle));
  }

  /** One cycle's harvest events, newest first - running AND closed cycles. */
  harvestEvents(cycleId: number): Observable<HarvestEvent[]> {
    return this.graphql
      .query<{ harvestEvents: HarvestEvent[] }>(HARVEST_EVENTS_QUERY, { cycleId })
      .pipe(map((data) => data.harvestEvents));
  }

  recordHarvestEvent(input: RecordHarvestEventInput): Observable<HarvestEvent> {
    return this.graphql
      .query<{ recordHarvestEvent: HarvestEvent }>(RECORD_HARVEST_EVENT, {
        cycleId: input.cycleId,
        eventDate: input.eventDate,
        fishCount: input.fishCount,
        weightKg: input.weightKg,
        reason: input.reason,
        saleAmount: input.saleAmount,
      })
      .pipe(map((data) => data.recordHarvestEvent));
  }

  /** Soft-delete. `harvestEventId` is `Int!` here though the type returns `ID!`. */
  deleteHarvestEvent(harvestEventId: number): Observable<boolean> {
    return this.graphql
      .query<{ deleteHarvestEvent: boolean }>(DELETE_HARVEST_EVENT, { harvestEventId })
      .pipe(map((data) => data.deleteHarvestEvent));
  }

  /** Replaces an event in one transaction; returns the NEW event (new id). */
  correctHarvestEvent(input: CorrectHarvestEventInput): Observable<HarvestEvent> {
    return this.graphql
      .query<{ correctHarvestEvent: HarvestEvent }>(CORRECT_HARVEST_EVENT, {
        harvestEventId: input.harvestEventId,
        eventDate: input.eventDate,
        fishCount: input.fishCount,
        weightKg: input.weightKg,
        reason: input.reason,
        saleAmount: input.saleAmount,
      })
      .pipe(map((data) => data.correctHarvestEvent));
  }

  /** The stocked count, corrected - ACTIVE cycles only, `edit_cycle`. */
  correctFingerlingsCount(cycleId: number, fingerlingsCount: number): Observable<Cycle> {
    return this.graphql
      .query<{ correctFingerlingsCount: Cycle }>(CORRECT_FINGERLINGS, { cycleId, fingerlingsCount })
      .pipe(map((data) => data.correctFingerlingsCount));
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
  stockingAgeMonths
  survivalRateEstimate
  expectedHarvestDate
  fingerlingCost
  actualHarvestDate
  harvestedCount
  totalWeightKg
  mortalityCount
  totalRevenue
  harvestNotes
  actualSurvivalRate
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

// `cycleId` is Int! here, NOT ID! as it is on CreateCycleInput - the caller
// converts. `outcome` is String!, so "HARVESTED"/"FAILED" travel literally.
const CLOSE_CYCLE = `
  mutation CloseCycle(
    $cycleId: Int!
    $outcome: String!
    $actualHarvestDate: String!
    $notes: String
  ) {
    closeCycle(
      cycleId: $cycleId
      outcome: $outcome
      actualHarvestDate: $actualHarvestDate
      notes: $notes
    ) { ${CYCLE_FIELDS} }
  }
`;

const HARVEST_EVENT_FIELDS = `
  harvestEventId
  cycleId
  eventDate
  fishCount
  weightKg
  reason
  saleAmount
`;

const HARVEST_EVENTS_QUERY = `
  query CycleHarvestEvents($cycleId: Int!) {
    harvestEvents(cycleId: $cycleId) { ${HARVEST_EVENT_FIELDS} }
  }
`;

// `reason` is String!, not an enum: SOLD/DIED/REMOVED travel literally.
const RECORD_HARVEST_EVENT = `
  mutation RecordHarvestEvent(
    $cycleId: Int!
    $eventDate: String!
    $fishCount: Int!
    $weightKg: Float
    $reason: String!
    $saleAmount: Float
  ) {
    recordHarvestEvent(
      cycleId: $cycleId
      eventDate: $eventDate
      fishCount: $fishCount
      weightKg: $weightKg
      reason: $reason
      saleAmount: $saleAmount
    ) { ${HARVEST_EVENT_FIELDS} }
  }
`;

const DELETE_HARVEST_EVENT = `
  mutation DeleteHarvestEvent($harvestEventId: Int!) {
    deleteHarvestEvent(harvestEventId: $harvestEventId)
  }
`;

const CORRECT_HARVEST_EVENT = `
  mutation CorrectHarvestEvent(
    $harvestEventId: Int!
    $eventDate: String!
    $fishCount: Int!
    $weightKg: Float
    $reason: String!
    $saleAmount: Float
  ) {
    correctHarvestEvent(
      harvestEventId: $harvestEventId
      eventDate: $eventDate
      fishCount: $fishCount
      weightKg: $weightKg
      reason: $reason
      saleAmount: $saleAmount
    ) { ${HARVEST_EVENT_FIELDS} }
  }
`;

const CORRECT_FINGERLINGS = `
  mutation CorrectFingerlingsCount($cycleId: Int!, $fingerlingsCount: Int!) {
    correctFingerlingsCount(cycleId: $cycleId, fingerlingsCount: $fingerlingsCount) {
      ${CYCLE_FIELDS}
    }
  }
`;
