import { CLOSED_NO_RECORD, DailyTaskStatus } from './models/daily-task';

/**
 * The rules for reading one day's task sheet, shared by the Daily Tasks
 * screen and the Dashboard's "Leo" card. They lived in the screen until the
 * card needed them: two copies of "which task is next?" would have told a
 * worker two different things.
 */

/** Closed without a feeding record: not done, not outstanding. See the model. */
export function isClosedTask(task: DailyTaskStatus): boolean {
  return task.status === CLOSED_NO_RECORD;
}

/** Neither done nor closed - the only rows reminders still chase. */
export function isOutstandingTask(task: DailyTaskStatus): boolean {
  return !task.done && !isClosedTask(task);
}

/** One unit's tasks for the day, which is how the sheet is grouped. */
export interface TaskGroup {
  /** unitCode + speciesName - two cycles in one unit are still two groups. */
  key: string;
  unitCode: string | null;
  speciesName: string | null;
  tasks: DailyTaskStatus[];
  /** Counted over the WHOLE group, so the heading stays true under a filter. */
  done: number;
  /** Closed without a record - never folded into `done`. */
  closed: number;
  total: number;
}

/**
 * The tasks, grouped by the unit they happen in and sorted the way the day
 * runs: unit by unit, and within a unit, earliest time first.
 *
 * Tasks with no unit are a real case, not a defensive one -
 * `daily_tasks.cycle_id` is nullable, and unitCode/speciesName both come
 * from the cycle - so they get a group of their own, last, rather than
 * being dropped or silently labelled as somebody else's tank.
 */
export function groupTasksByUnit(tasks: readonly DailyTaskStatus[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const key = `${task.unitCode ?? ''}|${task.speciesName ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(key, {
        key,
        unitCode: task.unitCode,
        speciesName: task.speciesName,
        tasks: [task],
        done: 0,
        closed: 0,
        total: 0,
      });
    }
  }

  for (const group of groups.values()) {
    group.total = group.tasks.length;
    group.done = group.tasks.filter((task) => task.done).length;
    group.closed = group.tasks.filter(isClosedTask).length;
  }

  const ordered = [...groups.values()].sort((a, b) => {
    // Unit-less groups last: they are the exception, and burying the
    // exception under the tanks is the right way round for a work sheet.
    if (a.unitCode === null || b.unitCode === null) {
      return a.unitCode === b.unitCode ? 0 : a.unitCode === null ? 1 : -1;
    }
    return (
      a.unitCode.localeCompare(b.unitCode) ||
      (a.speciesName ?? '').localeCompare(b.speciesName ?? '')
    );
  });

  for (const group of ordered) {
    group.tasks.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  }

  return ordered;
}

/**
 * The next thing to do: the earliest outstanding task whose time has not
 * passed yet, or - once everything left is late - the earliest late one.
 * Null when nothing is outstanding. Ties go to the unit order of `groups`.
 */
export function nextOutstandingTask(
  groups: readonly TaskGroup[],
  nowTime: string,
): { task: DailyTaskStatus; group: TaskGroup } | null {
  const outstanding = groups
    .flatMap((group) => group.tasks.map((task) => ({ task, group })))
    .filter(({ task }) => isOutstandingTask(task))
    .sort((a, b) => a.task.scheduledTime.localeCompare(b.task.scheduledTime));
  return outstanding.find(({ task }) => task.scheduledTime >= nowTime) ?? outstanding[0] ?? null;
}
