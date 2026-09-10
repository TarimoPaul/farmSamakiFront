import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { CompleteTaskInput, DailyTaskStatus } from '../models/daily-task';

/**
 * The farm's tasks for one day, and the marking of one of them.
 *
 * ONE QUERY, NOT `cycles` + `dailyTasks` PER CYCLE. `farmDailyTasks` answers
 * for every ACTIVE cycle on the farm in a single round trip, which is the
 * whole reason it exists - the schema says as much. There is no farm
 * argument: the farm comes from the token (and, for ROOT, from the X-Farm-Id
 * header the interceptor adds), exactly like every other farm-scoped query.
 *
 * The permissions are split across the two calls: reading is
 * `view_dashboard`, which every role holds, and marking is `mark_task_done`,
 * which a VIEWER does not. That split is enforced by the backend; the screen
 * only mirrors it.
 */
@Injectable({ providedIn: 'root' })
export class DailyTasksService {
  private readonly graphql = inject(GraphqlService);

  /**
   * Every active cycle's tasks for `date` (YYYY-MM-DD).
   *
   * The date is always sent rather than left to the server's default,
   * because the screen always knows which day it is showing - including
   * "today", where the two agree. Sending it keeps one code path, and keeps
   * the answer pinned to the day the user is looking at even if the request
   * crosses midnight.
   */
  farmTasks(date: string): Observable<DailyTaskStatus[]> {
    return this.graphql
      .query<{ farmDailyTasks: DailyTaskStatus[] }>(FARM_DAILY_TASKS, { date })
      .pipe(map((data) => data.farmDailyTasks));
  }

  /**
   * Marks one task done, for one date.
   *
   * `taskId` is converted here rather than at the call site: the type hands
   * out an `ID!` string and the input takes an `Int!`, and burying that in
   * one place is better than making every caller remember it.
   *
   * FUTURE DATES ARE NOT FILTERED HERE. The backend refuses them with
   * VALIDATION_ERROR and names the reason; a client-side rule would only be
   * a second, quieter copy of that decision - and one that could disagree
   * with it when the two clocks differ. The screen disables the control and
   * says why, which is presentation; this stays the plain call.
   */
  complete(input: CompleteTaskInput): Observable<DailyTaskStatus> {
    return this.graphql
      .query<{ completeTask: DailyTaskStatus }>(COMPLETE_TASK, {
        input: { ...input, taskId: Number(input.taskId) },
      })
      .pipe(map((data) => data.completeTask));
  }
}

/**
 * Every field of DailyTaskStatus except `cycleId`, which the UI must not show
 * - see the note on the model. Asking for it anyway would invite exactly the
 * bare-number label the unitCode/speciesName pair exists to prevent.
 */
const TASK_FIELDS = `
  taskId
  unitCode
  speciesName
  taskType
  scheduledTime
  frequency
  assignedRoleName
  date
  status
  done
  completedAt
  completedByName
  notes
`;

const FARM_DAILY_TASKS = `
  query FarmDailyTasks($date: String) {
    farmDailyTasks(date: $date) { ${TASK_FIELDS} }
  }
`;

const COMPLETE_TASK = `
  mutation CompleteTask($input: CompleteTaskInput!) {
    completeTask(input: $input) { ${TASK_FIELDS} }
  }
`;
