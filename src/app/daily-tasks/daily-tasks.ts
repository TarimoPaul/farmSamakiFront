import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DailyTasksService } from '../core/services/daily-tasks';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { DailyTaskStatus } from '../core/models/daily-task';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { PERMISSION } from '../core/models/permissions';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { HasPermission } from '../shared/directives/has-permission';
import { Button } from '../shared/ui/button/button';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { StatusBadge } from '../shared/ui/status-badge/status-badge';
import { Toast } from '../shared/ui/toast/toast';
import { DAILY_TASKS_I18N } from './daily-tasks.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/**
 * The farm's timezone, and the ONLY definition of "today" this screen uses.
 *
 * Not the browser's. The backend resolves an omitted date to today in
 * Africa/Nairobi - the schema says so outright - so a client that asked "what
 * day is it here?" would disagree with the server for anyone whose laptop is
 * on another timezone, and would disagree by a whole day for a few hours
 * either side of midnight. Both the default date and the future-date test
 * below are computed in the farm's day, so the screen and the API always mean
 * the same thing by "today".
 */
const FARM_TIME_ZONE = 'Africa/Nairobi';

/** One unit's tasks for the day, which is how the list is grouped. */
interface TaskGroup {
  /** unitCode + speciesName - two cycles in one unit are still two groups. */
  key: string;
  unitCode: string | null;
  speciesName: string | null;
  tasks: DailyTaskStatus[];
}

/**
 * Daily Tasks - the farm-wide task sheet for one day.
 *
 * Three things shape it, and each is worth stating because each could
 * plausibly have gone the other way:
 *
 *  1. FARM-WIDE, NOT CYCLE-SCOPED. Unlike Feeding and Water Quality, this
 *     screen holds no cycle selection and ignores the one Production stores.
 *     `farmDailyTasks` answers for every ACTIVE cycle in one round trip,
 *     because the question is "what is there to do today?", not "what is
 *     there to do for this cycle?".
 *  2. THE UNIT NAMES THE TASK, NEVER THE CYCLE ID. On a farm-wide list
 *     "Kulisha - Asubuhi" repeats once per active cycle, so the rows are only
 *     distinguishable by where the fish are. `cycleId` is not even fetched -
 *     see the note on the model.
 *  3. READING AND MARKING ARE DIFFERENT PERMISSIONS, and only the marking is
 *     branched. `view_dashboard` shows everything on this page - the picker,
 *     past days, who completed what and when - because a VIEWER is entitled
 *     to the whole record. `mark_task_done` adds the one button that changes
 *     it.
 */
@Component({
  selector: 'app-daily-tasks',
  standalone: true,
  imports: [HasPermission, Button, EmptyState, StatusBadge, Toast],
  templateUrl: './daily-tasks.html',
  styleUrl: './daily-tasks.scss',
})
export class DailyTasks {
  readonly PERMISSION = PERMISSION;

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => DAILY_TASKS_I18N[this.languageService.lang()]);

  private readonly dailyTasksService = inject(DailyTasksService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly router = inject(Router);

  /**
   * Today, in the farm's day. Read once, when the screen is opened.
   *
   * Deliberately not re-derived on every change detection: a tab left open
   * across midnight keeps showing the day it was opened on, which is the
   * lesser of the two surprises - the alternative is a list that silently
   * empties itself while somebody is looking at it. A reload picks up the
   * new day.
   */
  readonly today = farmToday();

  /** The day being shown. Defaults to today; the picker moves it. */
  readonly date = signal(this.today);

  readonly tasks = signal<readonly DailyTaskStatus[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  /** The task currently being marked - so one row spins, not all of them. */
  readonly markingTaskId = signal<string | null>(null);
  readonly markError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /**
   * A day that has not happened yet. String comparison is exact here: both
   * sides are YYYY-MM-DD, which sorts lexicographically as it does
   * chronologically.
   */
  readonly isFuture = computed(() => this.date() > this.today);

  readonly doneCount = computed(() => this.tasks().filter((task) => task.done).length);

  /**
   * The tasks, grouped by the unit they happen in and sorted the way the day
   * runs: unit by unit, and within a unit, earliest time first.
   *
   * Tasks with no unit are a real case, not a defensive one -
   * `daily_tasks.cycle_id` is nullable, and unitCode/speciesName both come
   * from the cycle - so they get a group of their own, last, rather than
   * being dropped or silently labelled as somebody else's tank.
   */
  readonly groups = computed<TaskGroup[]>(() => {
    const groups = new Map<string, TaskGroup>();

    for (const task of this.tasks()) {
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
        });
      }
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
  });

  /**
   * Reloads when the day changes OR when the active farm does. Both are read
   * synchronously, which is what subscribes this effect to them - so ROOT
   * switching farms in the topbar re-asks for that farm's tasks with no
   * refresh, exactly as the other screens behave.
   */
  private readonly load = effect(() => {
    this.farmSelection.selectedFarmId();
    this.date();
    this.fetch();
  });

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.dailyTasksService.farmTasks(this.date()).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.tasks.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * The picker.
   *
   * NOT gated, and not limited to today: a worker checking whether yesterday
   * evening's feed was actually recorded is asking a legitimate question, and
   * so is an owner reading back a week. An empty box - the browser's "clear"
   * - is ignored rather than sent, because there is no such day to ask about.
   */
  onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.markError.set(null);
      this.date.set(value);
    }
  }

  goToToday(): void {
    this.markError.set(null);
    this.date.set(this.today);
  }

  goToProduction(): void {
    void this.router.navigateByUrl('/production');
  }

  /**
   * Marks one task done, ON THE DAY BEING SHOWN.
   *
   * `completionDate` is always sent, today included. The alternative -
   * omitting it and letting the server use its own today - is equivalent only
   * while the picker happens to be on today, and silently wrong the moment it
   * is not: a tick on yesterday's sheet has to land on yesterday.
   *
   * NO CLIENT-SIDE FUTURE CHECK HERE, on purpose. The template disables the
   * button and says why, which is presentation; the rule itself belongs to
   * the backend, which refuses a future date with VALIDATION_ERROR and names
   * the reason in its answer. A second copy of that rule here would be free
   * to disagree with the server when the two clocks differ, and would swallow
   * the very message this screen is meant to show.
   */
  markDone(task: DailyTaskStatus): void {
    if (this.markingTaskId()) {
      return;
    }

    this.markError.set(null);
    this.markingTaskId.set(task.taskId);

    this.dailyTasksService
      .complete({ taskId: Number(task.taskId), completionDate: this.date() })
      .subscribe({
        next: () => {
          this.markingTaskId.set(null);
          this.toastMessage.set(this.t().markedToast);
          // Re-read rather than patch the row in place: the row shows who the
          // backend recorded and at what time, and building that locally
          // would print a name and a clock the server never agreed to.
          this.fetch();
        },
        error: (err: unknown) => {
          this.markingTaskId.set(null);
          this.showMarkError(asApiError(err));
        },
      });
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /** "DONE" -> "Imefanyika". An unmapped value is shown as the backend sent it. */
  statusLabel(task: DailyTaskStatus): string {
    const t = this.t();
    switch (task.status) {
      case 'DONE':
        return t.statusDone;
      case 'OUTSTANDING':
        return t.statusOutstanding;
      case 'PENDING':
        return t.statusPending;
      case 'MISSED':
        return t.statusMissed;
      case 'LATE':
        return t.statusLate;
      default:
        return task.status;
    }
  }

  /**
   * The badge colour. Branches on `done` FIRST, because that is the contract:
   * a DONE record is the only thing that counts as done, and everything else
   * - MISSED included - is work still outstanding.
   */
  statusVariant(task: DailyTaskStatus): 'approved' | 'rejected' | 'pending' {
    if (task.done) {
      return 'approved';
    }
    return task.status === 'MISSED' ? 'rejected' : 'pending';
  }

  /**
   * "imefanywa na Juma, 07:14" - the whole completion line, built here rather
   * than stitched together out of three conditionals in the template.
   *
   * A completion with no name on it is a real answer, not a hole: the record
   * exists and the day is accounted for, so it reads "imefanyika, 07:14"
   * rather than naming nobody.
   */
  completedLine(task: DailyTaskStatus): string {
    const t = this.t();
    const who = task.completedByName ? `${t.doneBy} ${task.completedByName}` : t.doneAnonymous;
    const time = this.completedTime(task);
    return time ? `${who}, ${time}` : who;
  }

  /**
   * The HH:mm out of `completedAt`.
   *
   * Pulled out with a regex rather than parsed into a Date, deliberately: the
   * field is a String on the schema with no stated offset, and handing an
   * offset-less timestamp to `new Date()` would have the browser apply its
   * own timezone and shift the time the server recorded. A string carrying no
   * time at all is shown verbatim rather than blanked.
   */
  completedTime(task: DailyTaskStatus): string | null {
    if (!task.completedAt) {
      return null;
    }
    return /\d{2}:\d{2}/.exec(task.completedAt)?.[0] ?? task.completedAt;
  }

  /**
   * VALIDATION_ERROR and CONFLICT keep the BACKEND'S sentence - on this
   * screen that is the future-date refusal, which names the rule far better
   * than any generic line could. Everything else, FORBIDDEN above all (what a
   * VIEWER gets if they reach the mutation another way), is answered from the
   * shared code map in the UI language.
   */
  private showMarkError(error: ApiError): void {
    const preferBackend =
      error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.errorCode === ERROR_CODE.CONFLICT;
    this.markError.set(this.messageFor(error, preferBackend));
  }

  private messageFor(error: ApiError | null, preferBackendMessage = false): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang(), preferBackendMessage) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

/**
 * Today as YYYY-MM-DD in the farm's timezone - see FARM_TIME_ZONE.
 *
 * Built from `formatToParts` rather than from a formatted string, so the
 * layout is ours and not the runtime's: `toLocaleDateString` with a locale
 * tag would be at the mercy of whichever ICU data the browser ships. If Intl
 * refuses the zone outright, the browser's own day is the honest fallback - a
 * date one day out beats a screen that will not render.
 */
function farmToday(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: FARM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Falls through to the local day below.
  }

  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
