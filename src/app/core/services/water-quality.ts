import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { LogWaterQualityInput, WaterQualityLog } from '../models/water-quality';

/**
 * Water-quality readings: the ones already recorded for a cycle, and the one
 * being recorded now.
 *
 * The asymmetry between the two calls is the backend's, and worth stating
 * because it looks like a mistake otherwise:
 *
 *   READ  by `cycleId` - the backend resolves it to the unit that cycle runs
 *         in, which is exactly the question the screen is asking.
 *   WRITE by `unitId`  - the reading is the TANK'S, not the fish's, and
 *         `water_quality_logs` has no cycle_id column at all.
 *
 * So the screen reads with the cycle it holds and writes with that cycle's
 * unit. Both are farm-scoped by the backend; neither takes a farm argument.
 */
@Injectable({ providedIn: 'root' })
export class WaterQualityService {
  private readonly graphql = inject(GraphqlService);

  logsForCycle(cycleId: number): Observable<WaterQualityLog[]> {
    return this.graphql
      .query<{ waterQualityLogs: WaterQualityLog[] }>(LOGS_FOR_CYCLE, { cycleId })
      .pipe(map((data) => data.waterQualityLogs));
  }

  /**
   * Records one reading.
   *
   * NOTHING IS VALIDATED HERE, and that is deliberate: dissolved oxygen at
   * 0.8, pH at 4.2, ammonia at 0.9 are the readings worth having - they are
   * why anyone measures - and a client that refused them would hide the
   * emergency it exists to report. The backend agrees: it rejects only what
   * cannot be a measurement at all (pH outside 0-14, negative oxygen or
   * ammonia), and that answer arrives as VALIDATION_ERROR for the form to
   * show.
   */
  log(input: LogWaterQualityInput): Observable<WaterQualityLog> {
    return this.graphql
      .query<{ logWaterQuality: WaterQualityLog }>(LOG_READING, { input })
      .pipe(map((data) => data.logWaterQuality));
  }
}

const READING_FIELDS = `
  logId
  logDate
  ph
  temperature
  oxygen
  ammonia
  notes
  recordedByName
  unit {
    unitId
    code
  }
`;

const LOGS_FOR_CYCLE = `
  query WaterQualityLogs($cycleId: Int) {
    waterQualityLogs(cycleId: $cycleId) { ${READING_FIELDS} }
  }
`;

const LOG_READING = `
  mutation LogWaterQuality($input: LogWaterQualityInput!) {
    logWaterQuality(input: $input) { ${READING_FIELDS} }
  }
`;
