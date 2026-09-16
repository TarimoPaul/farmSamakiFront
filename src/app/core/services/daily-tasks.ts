import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import {
  CloseTaskWithoutRecordInput,
  CompleteTaskInput,
  DailyTaskStatus,
} from '../models/daily-task';

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

  /**
   * One cycle's tasks for `date` - used by Feeding to name the task it is
   * recording for ("Kulisha - Jioni", not just "a feeding task").
   */
  cycleTasks(cycleId: number, date: string): Observable<DailyTaskStatus[]> {
    return this.graphql
      .query<{ dailyTasks: DailyTaskStatus[] }>(CYCLE_DAILY_TASKS, { cycleId, date })
      .pipe(map((data) => data.dailyTasks));
  }

  /**
   * Closes a FEEDING task WITHOUT a feeding record - the escape hatch, not the
   * normal path. Touches no feeding log and no stock; the task stays not-done
   * but stops being reminded. The normal path is logFeeding with a taskId.
   */
  closeWithoutRecord(input: CloseTaskWithoutRecordInput): Observable<DailyTaskStatus> {
    return this.graphql
      .query<{ closeTaskWithoutRecord: DailyTaskStatus }>(CLOSE_TASK_WITHOUT_RECORD, {
        input: { ...input, taskId: Number(input.taskId) },
      })
      .pipe(map((data) => data.closeTaskWithoutRecord));
  }
}

/**
 * Every field of DailyTaskStatus.
 *
 * `cycleId` is fetched to be PASSED ON, never shown: a feeding task opens the
 * Feeding form for its own cycle, and that id is the only thing the form
 * needs. The label on screen is still unitCode/speciesName - see the model.
 */
const TASK_FIELDS = `
  taskId
  cycleId
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
  taskKind
  feedingLogId
  closureReason
  closureNote
`;

const CYCLE_DAILY_TASKS = `
  query CycleDailyTasks($cycleId: Int!, $date: String) {
    dailyTasks(cycleId: $cycleId, date: $date) { ${TASK_FIELDS} }
  }
`;

const CLOSE_TASK_WITHOUT_RECORD = `
  mutation CloseTaskWithoutRecord($input: CloseTaskWithoutRecordInput!) {
    closeTaskWithoutRecord(input: $input) { ${TASK_FIELDS} }
  }
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
