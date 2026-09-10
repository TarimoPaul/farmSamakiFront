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
 */
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
  /** DONE / PENDING / MISSED / LATE when a record exists; OUTSTANDING when none does. */
  status: string;
  /** The single unambiguous flag. See the contract above. */
  done: boolean;
  completedAt: string | null;
  completedByName: string | null;
  notes: string | null;
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
