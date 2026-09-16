/**
 * One task, for one day - the `DailyTaskStatus` type of the GraphQL schema.
 *
 * It is NOT a row of a table. `daily_tasks` holds the schedule ("feed the
 * fish in this cycle at 07:00, every day"); a completion is a separate row
 * keyed by (task_id, date). This type is the JOIN of the two for a single
 * date, which is why every field about the doing - `done`, `completedAt`,
 * `completedByName`, `notes` - is nullable or false for a day nobody has
 * touched yet.
 *
 * THE CONTRACT, in the schema's own words:
 *
 *     done = there is a (task_id, date) record with status DONE
 *
 * Everything else is outstanding - INCLUDING a PENDING/MISSED/LATE record,
 * because a task that was missed is still a task that was not done. So the
 * screen branches on `done`, never on `status`; `status` is shown, not
 * reasoned about.
 *
 * THE ONE EXCEPTION (V28): `CLOSED_NO_RECORD`. It is NOT done - `done` stays
 * false - but it is not outstanding either: somebody closed it and said why,
 * and reminders stop. So the screen counts it on its own, and never in green.
 */
export type TaskKind = 'FEEDING' | 'WATER_QUALITY' | 'OTHER';

/** Stable codes stored by the backend; the words live in daily-tasks.i18n.ts. */
export type TaskClosureReason = 'OFFLINE' | 'FORGOT' | 'DEVICE_FAILURE' | 'OTHER';

export const TASK_CLOSURE_REASONS: readonly TaskClosureReason[] = [
  'OFFLINE',
  'FORGOT',
  'DEVICE_FAILURE',
  'OTHER',
];

/** The status a task closed without a record carries. */
export const CLOSED_NO_RECORD = 'CLOSED_NO_RECORD';

export interface DailyTaskStatus {
  /**
   * `ID!` on the type, so it arrives as a STRING - but `CompleteTaskInput`
   * takes `taskId: Int!`. Anything sending this back must convert; see
   * DailyTasksService.complete.
   */
  taskId: string;
  /**
   * `Int` (nullable): `daily_tasks.cycle_id` is nullable in the schema.
   *
   * Fetched so a feeding task can open the Feeding form for its cycle, but
   * DELIBERATELY NOT SHOWN ANYWHERE. On the farm-wide list the same
   * "Kulisha - Asubuhi" appears once per active cycle, and a cycle number is
   * not something the person holding the bucket knows - the tank is. That is
   * what unitCode and speciesName are for.
   */
  cycleId: number | null;
  /** The tank/pond, e.g. "DEV-A1". Null when the task has no cycle. */
  unitCode: string | null;
  /** The fish in it, e.g. "Sato". Null when the task has no cycle. */
  speciesName: string | null;
  /** "Kulisha - Asubuhi" / "Kulisha - Jioni" / "Kuangalia Maji". */
  taskType: string;
  /** Time of day, HH:mm. */
  scheduledTime: string;
  frequency: string;
  /**
   * The role the task is assigned to. Null for ALL existing data -
   * CycleService.createDefaultTasks does not set assigned_role_id - so any
   * UI reading it must treat null as the normal case, not the exception.
   */
  assignedRoleName: string | null;
  /** The date asked for (or today), YYYY-MM-DD. */
  date: string;
  /**
   * DONE / PENDING / MISSED / LATE / CLOSED_NO_RECORD when a record exists;
   * OUTSTANDING when none does.
   */
  status: string;
  /** The single unambiguous flag. See the contract above. */
  done: boolean;
  completedAt: string | null;
  completedByName: string | null;
  notes: string | null;
  /**
   * What the task IS, and so what its button does: a FEEDING task is closed by
   * recording the feeding, never by a bare tick. Branch on this, never on the
   * words in `taskType`.
   */
  taskKind: TaskKind;
  /** The feeding log that closed this task, when it was closed that way. */
  feedingLogId: number | null;
  /** Set only when `status` is CLOSED_NO_RECORD. */
  closureReason: TaskClosureReason | null;
  closureNote: string | null;
}

/**
 * `closeTaskWithoutRecord` input. `note` is required by the backend when
 * `reason` is OTHER; `completionDate` is always sent, for the same reason
 * CompleteTaskInput's is.
 */
export interface CloseTaskWithoutRecordInput {
  taskId: number;
  completionDate: string;
  reason: TaskClosureReason;
  note?: string | null;
}

/**
 * `completeTask` input.
 *
 * `taskId` is an `Int!` here, unlike the `ID!` on DailyTaskStatus - the same
 * asymmetry LogWaterQualityInput has with unitId, and callers must convert.
 *
 * `completionDate` left out means today. This screen always sends it: the
 * date being marked is the one in the picker, and a task ticked while
 * reviewing yesterday must be recorded against yesterday, not against the
 * moment of the click.
 */
export interface CompleteTaskInput {
  taskId: number;
  completionDate?: string;
  notes?: string | null;
}
