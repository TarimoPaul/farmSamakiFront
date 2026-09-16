import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/services/auth';
import { DailyTasksService } from '../core/services/daily-tasks';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import {
  CLOSED_NO_RECORD,
  DailyTaskStatus,
  TASK_CLOSURE_REASONS,
  TaskClosureReason,
} from '../core/models/daily-task';
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
  /** Counted over the WHOLE group, so the heading stays true under a filter. */
  done: number;
  /** Closed without a record - never folded into `done`. */
  closed: number;
  total: number;
}

export type TaskFilter = 'all' | 'outstanding' | 'done' | 'closed';

/** Closed without a feeding record: not done, not outstanding. See the model. */
export function isClosedTask(task: DailyTaskStatus): boolean {
  return task.status === CLOSED_NO_RECORD;
}

/** The date heading's locale per UI language. */
const DATE_LOCALE = { sw: 'sw-TZ', en: 'en-GB' } as const;

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
 *     distinguishable by where the fish are. `cycleId` is fetched only to
 *     hand to the Feeding form, never printed - see the note on the model.
 *  3. READING AND MARKING ARE DIFFERENT PERMISSIONS, and only the marking is
 *     branched. `view_dashboard` shows everything on this page - the picker,
 *     past days, who completed what and when - because a VIEWER is entitled
 *     to the whole record. `mark_task_done` adds the one button that changes
 *     it.
 *  4. A FEEDING TASK IS DONE BECAUSE A FEEDING WAS RECORDED (V28). Its button
 *     opens the Feeding form for that cycle, day and task through QUERY
 *     PARAMS - never through CycleSelectionService, which would silently
 *     switch the cycle Production and Water Quality are showing. The backend
 *     writes the log, the stock movement and the DONE together. The only
 *     other way out is "close without record", which is counted apart from
 *     done and never drawn in green.
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
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly CLOSURE_REASONS = TASK_CLOSURE_REASONS;
  readonly isClosed = isClosedTask;

  /**
   * Recording a feeding needs BOTH codes: `mark_task_done` (the row's action
   * slot is gated on it) and `log_feeding`, which the Feeding form and the
   * backend's logFeeding require. Without the second the row still offers
   * "close without record", which is only `mark_task_done`.
   */
  readonly canLogFeeding = computed(() => this.authService.hasPermission(PERMISSION.LOG_FEEDING));

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

  /**
   * The day being shown. Defaults to today; the picker moves it.
   *
   * `?date=` wins when it is a real YYYY-MM-DD: it is how the Feeding form
   * sends somebody back to the sheet they left, which may be yesterday's.
   */
  readonly date = signal(isoDateOrNull(this.route.snapshot.queryParamMap.get('date')) ?? this.today);

  readonly tasks = signal<readonly DailyTaskStatus[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  /** The task currently being marked - so one row spins, not all of them. */
  readonly markingTaskId = signal<string | null>(null);
  readonly markError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('recorded') ? this.t().recordedToast : null,
  );

  /**
   * The "close without record" picker - inline under its row, like Feeding's
   * confirm step, because this is used one-handed at a tank. One open at a time.
   */
  readonly closingTaskId = signal<string | null>(null);
  readonly closeReason = signal<TaskClosureReason | null>(null);
  readonly closeNote = signal('');
  readonly closeError = signal<string | null>(null);
  readonly closeSaving = signal(false);

  constructor() {
    // The params were read above; drop them so a reload or a shared link does
    // not repeat the toast or pin the sheet to that day forever.
    const params = this.route.snapshot.queryParamMap;
    if (params.has('date') || params.has('recorded')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { date: null, recorded: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /**
   * A day that has not happened yet. String comparison is exact here: both
   * sides are YYYY-MM-DD, which sorts lexicographically as it does
   * chronologically.
   */
  readonly isFuture = computed(() => this.date() > this.today);

  readonly doneCount = computed(() => this.tasks().filter((task) => task.done).length);
  readonly closedCount = computed(() => this.tasks().filter(isClosedTask).length);
  /** Neither done nor closed - the only rows reminders still chase. */
  readonly outstandingCount = computed(
    () => this.tasks().length - this.doneCount() - this.closedCount(),
  );

  /** DONE only. A closed task is not progress, so it never moves this number. */
  readonly progressPercent = computed(() => this.percentOf(this.doneCount()));
  /** The closed share, drawn as its own amber segment after the green one. */
  readonly closedPercent = computed(() => this.percentOf(this.closedCount()));

  private percentOf(count: number): number {
    const total = this.tasks().length;
    return total === 0 ? 0 : Math.round((count * 100) / total);
  }

  /**
   * The farm's clock, HH:mm, read when the screen opens - the same "once"
   * rule as `today`. A signal so a test can set it; nothing in the screen
   * writes it.
   */
  readonly nowTime = signal(farmNowTime());

  /** Which rows the list shows. The counts and the rail always use the whole sheet. */
  readonly filter = signal<TaskFilter>('all');

  /** "Jumanne, 15 Septemba 2026" - the ISO date is already in the picker. */
  readonly displayDate = computed(() =>
    formatDay(this.date(), DATE_LOCALE[this.languageService.lang()]),
  );

  /**
   * An outstanding task whose time has gone by: any undone task on a past
   * day, or one on today scheduled before the farm's clock.
   *
   * PRESENTATION ONLY. The backend's status stays what it sent (OUTSTANDING),
   * and the badge still shows it - this is a highlight for the eye, not a
   * second opinion on the record.
   */
  isTimePassed(task: DailyTaskStatus): boolean {
    if (task.done || isClosedTask(task) || this.date() > this.today) {
      return false;
    }
    return this.date() < this.today || task.scheduledTime < this.nowTime();
  }

  readonly timePassedCount = computed(
    () => this.tasks().filter((task) => this.isTimePassed(task)).length,
  );

  readonly filterOptions = computed(() => {
    const t = this.t();
    const options: { value: TaskFilter; label: string; count: number }[] = [
      { value: 'all', label: t.filterAll, count: this.tasks().length },
      { value: 'outstanding', label: t.filterOutstanding, count: this.outstandingCount() },
      { value: 'done', label: t.filterDone, count: this.doneCount() },
    ];
    // Only when there is something to filter to (or it is already chosen): a
    // fourth segment reading "0" every normal day is noise on a phone.
    if (this.closedCount() > 0 || this.filter() === 'closed') {
      options.push({ value: 'closed', label: t.filterClosed, count: this.closedCount() });
    }
    return options;
  });

  readonly summary = computed(() => {
    const t = this.t();
    return [
      { label: t.railAll, value: String(this.tasks().length) },
      { label: t.railDone, value: String(this.doneCount()) },
      { label: t.railClosed, value: String(this.closedCount()) },
      { label: t.railOutstanding, value: String(this.outstandingCount()) },
      { label: t.railTimePassed, value: String(this.timePassedCount()) },
    ];
  });

  /**
   * The next thing to do today: the earliest outstanding task whose time has
   * not passed yet, or - once everything left is late - the earliest late one.
   */
  readonly nextTask = computed(() => {
    const t = this.t();
    const outstanding = this.groups()
      .flatMap((group) => group.tasks.map((task) => ({ task, group })))
      .filter(({ task }) => !task.done && !isClosedTask(task))
      .sort((a, b) => a.task.scheduledTime.localeCompare(b.task.scheduledTime));
    const pick =
      outstanding.find(({ task }) => task.scheduledTime >= this.nowTime()) ?? outstanding[0];
    if (!pick) {
      return null;
    }
    const where = pick.group.unitCode ? `${t.unitLabel} ${pick.group.unitCode}` : t.noUnit;
    return {
      task: pick.task,
      label: `${where} · ${pick.group.speciesName ?? t.noSpecies}`,
    };
  });

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
  });

  /** The groups under the current filter; a group with nothing left to show is dropped. */
  readonly visibleGroups = computed<TaskGroup[]>(() => {
    const filter = this.filter();
    if (filter === 'all') {
      return this.groups();
    }
    return this.groups()
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter((task) => matchesFilter(task, filter)),
      }))
      .filter((group) => group.tasks.length > 0);
  });

  setFilter(filter: TaskFilter): void {
    this.filter.set(filter);
  }

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
      this.moveTo(value);
    }
  }

  goToToday(): void {
    this.moveTo(this.today);
  }

  /** The ‹ / › buttons beside the picker: one day back or forward. */
  shiftDay(days: number): void {
    this.moveTo(shiftIsoDate(this.date(), days));
  }

  /** A different day: an error or an open close-picker was about the old one. */
  private moveTo(date: string): void {
    this.markError.set(null);
    this.cancelClose();
    this.date.set(date);
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

  isFeeding(task: DailyTaskStatus): boolean {
    return task.taskKind === 'FEEDING';
  }

  /**
   * Opens the Feeding form FOR THIS TASK: its cycle, the day on the sheet, and
   * the task id, all as query params.
   *
   * NOT cycleSelection.select(): that is a global choice other screens read,
   * and ticking a task on tank B must not quietly switch what Production and
   * Water Quality are showing. Feeding reads the params, sends `taskId` with
   * the log, and comes back here on success.
   */
  recordFeeding(task: DailyTaskStatus): void {
    if (task.cycleId === null) {
      return;
    }
    void this.router.navigate(['/feeding'], {
      queryParams: { cycleId: task.cycleId, date: this.date(), taskId: task.taskId },
    });
  }

  openClose(task: DailyTaskStatus): void {
    this.markError.set(null);
    this.closeError.set(null);
    this.closeReason.set(null);
    this.closeNote.set('');
    this.closingTaskId.set(task.taskId);
  }

  cancelClose(): void {
    this.closingTaskId.set(null);
    this.closeError.set(null);
    this.closeSaving.set(false);
  }

  onCloseNoteInput(event: Event): void {
    this.closeNote.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Closes a feeding task without a record, ON THE DAY BEING SHOWN.
   *
   * The two client checks only mirror what the form is missing - a reason, and
   * a note for OTHER - so the person is told before a round trip. The backend
   * enforces both (and its database does too).
   */
  submitClose(task: DailyTaskStatus): void {
    if (this.closeSaving()) {
      return;
    }
    const t = this.t();
    const reason = this.closeReason();
    const note = this.closeNote().trim();

    if (!reason) {
      this.closeError.set(t.closeReasonRequired);
      return;
    }
    if (reason === 'OTHER' && !note) {
      this.closeError.set(t.closeNoteRequired);
      return;
    }

    this.closeError.set(null);
    this.closeSaving.set(true);
    this.dailyTasksService
      .closeWithoutRecord({
        taskId: Number(task.taskId),
        completionDate: this.date(),
        reason,
        note: note || null,
      })
      .subscribe({
        next: () => {
          this.cancelClose();
          this.toastMessage.set(this.t().closedToast);
          // Re-read, for the same reason markDone does.
          this.fetch();
        },
        error: (err: unknown) => {
          this.closeSaving.set(false);
          this.closeError.set(this.preferBackendMessage(asApiError(err)));
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
      case CLOSED_NO_RECORD:
        return t.statusClosed;
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
   *
   * CLOSED_NO_RECORD is grey: not the brand's "approved", and not the amber of
   * work still waiting either. The row's warning icon carries the caution.
   */
  statusVariant(task: DailyTaskStatus): 'approved' | 'rejected' | 'pending' | 'neutral' {
    if (task.done) {
      return 'approved';
    }
    if (isClosedTask(task)) {
      return 'neutral';
    }
    return task.status === 'MISSED' ? 'rejected' : 'pending';
  }

  /** "imefungwa na Juma, 07:14" - the closed row's counterpart of completedLine. */
  closedLine(task: DailyTaskStatus): string {
    const t = this.t();
    const who = task.completedByName ? `${t.closedBy} ${task.completedByName}` : t.closedAnonymous;
    const time = this.completedTime(task);
    return time ? `${who}, ${time}` : who;
  }

  /**
   * "Sababu: Nilisahau kurekodi - maelezo". The CODE is translated here and
   * never printed; an unknown code (a newer backend) is shown as sent rather
   * than hidden.
   */
  closureLine(task: DailyTaskStatus): string {
    const t = this.t();
    const code = task.closureReason;
    const reason = code ? (t.reasons[code] ?? code) : '';
    const text = `${t.closeReasonLabel}: ${reason}`;
    return task.closureNote ? `${text} - ${task.closureNote}` : text;
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
    this.markError.set(this.preferBackendMessage(error));
  }

  private preferBackendMessage(error: ApiError): string | null {
    const preferBackend =
      error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.errorCode === ERROR_CODE.CONFLICT;
    return this.messageFor(error, preferBackend);
  }

  private messageFor(error: ApiError | null, preferBackendMessage = false): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang(), preferBackendMessage) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

function matchesFilter(task: DailyTaskStatus, filter: TaskFilter): boolean {
  switch (filter) {
    case 'done':
      return task.done;
    case 'closed':
      return isClosedTask(task);
    case 'outstanding':
      return !task.done && !isClosedTask(task);
    default:
      return true;
  }
}

/** A YYYY-MM-DD from a query param, or null for anything else. */
function isoDateOrNull(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** YYYY-MM-DD moved by `days`. Done in UTC, so no timezone can shift the day. */
function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * A YYYY-MM-DD as words in the UI language. Formatted in UTC from the date's
 * own parts - it is a calendar day, not an instant - and falls back to the
 * ISO string if Intl refuses.
 */
function formatDay(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return date;
  }
}

/** HH:mm now in the farm's timezone - see FARM_TIME_ZONE. */
function farmNowTime(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: FARM_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (hour && minute) {
      return `${hour}:${minute}`;
    }
  } catch {
    // Falls through to the local clock below.
  }
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
