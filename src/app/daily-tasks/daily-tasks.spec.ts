import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { DailyTasks } from './daily-tasks';
import { DAILY_TASKS_I18N } from './daily-tasks.i18n';
import { LanguageService, Lang } from '../core/services/language';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { environment } from '../../environments/environment';

/**
 * Two active cycles in two units, and the point of the fixture is the
 * REPETITION: both cycles produce a "Kulisha - Asubuhi" at 07:00, so the rows
 * are indistinguishable by name alone. Whatever tells them apart on screen is
 * what this screen is for.
 *
 * The fourth task has no unit and no species - `daily_tasks.cycle_id` is
 * nullable, and both labels come from the cycle - which is the case a list
 * built only around tanks would drop on the floor.
 */
const TASKS = {
  data: {
    farmDailyTasks: [
      {
        taskId: '11',
        cycleId: 7,
        taskKind: 'FEEDING',
        feedingLogId: 501,
        closureReason: null,
        closureNote: null,
        unitCode: 'DEV-A1',
        speciesName: 'Sato',
        taskType: 'Kulisha - Asubuhi',
        scheduledTime: '07:00',
        frequency: 'DAILY',
        assignedRoleName: null,
        date: '2026-09-06',
        status: 'DONE',
        done: true,
        completedAt: '2026-09-06T07:14:22',
        completedByName: 'Juma',
        notes: null,
      },
      {
        taskId: '12',
        cycleId: 7,
        taskKind: 'FEEDING',
        feedingLogId: null,
        closureReason: null,
        closureNote: null,
        unitCode: 'DEV-A1',
        speciesName: 'Sato',
        taskType: 'Kulisha - Jioni',
        scheduledTime: '17:00',
        frequency: 'DAILY',
        assignedRoleName: null,
        date: '2026-09-06',
        status: 'OUTSTANDING',
        done: false,
        completedAt: null,
        completedByName: null,
        notes: null,
      },
      {
        taskId: '13',
        cycleId: 8,
        taskKind: 'FEEDING',
        feedingLogId: null,
        closureReason: null,
        closureNote: null,
        unitCode: 'DEV-B2',
        speciesName: 'Kambale',
        taskType: 'Kulisha - Asubuhi',
        scheduledTime: '07:00',
        frequency: 'DAILY',
        assignedRoleName: null,
        date: '2026-09-06',
        status: 'OUTSTANDING',
        done: false,
        completedAt: null,
        completedByName: null,
        notes: null,
      },
      {
        taskId: '14',
        cycleId: null,
        taskKind: 'WATER_QUALITY',
        feedingLogId: null,
        closureReason: null,
        closureNote: null,
        unitCode: null,
        speciesName: null,
        taskType: 'Kuangalia Maji',
        scheduledTime: '09:00',
        frequency: 'DAILY',
        assignedRoleName: null,
        date: '2026-09-06',
        status: 'OUTSTANDING',
        done: false,
        completedAt: null,
        completedByName: null,
        notes: null,
      },
    ],
  },
};

/**
 * The same sheet after task 14 - the WATER check - has been marked. Only a
 * non-feeding task can be ticked; a feeding task is done by recording it.
 */
const TASKS_AFTER_MARK = {
  data: {
    farmDailyTasks: TASKS.data.farmDailyTasks.map((task) =>
      task.taskId === '14'
        ? {
            ...task,
            status: 'DONE',
            done: true,
            completedAt: '2026-09-06T08:02:41',
            completedByName: 'D Worker',
          }
        : task,
    ),
  },
};

/**
 * The backend's refusal of a future completionDate. VALIDATION_ERROR, HTTP
 * 200 with an errors[] entry - the shape every GraphQL failure arrives in.
 */
const FUTURE_DATE_REFUSED = {
  data: null,
  errors: [
    {
      message: 'Tarehe ya kufanyika haiwezi kuwa ya siku ijayo.',
      path: ['completeTask'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

/** A VIEWER reaching completeTask another way. */
const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'mark_task_done'.",
      path: ['completeTask'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';

/** The same sheet with task 13 closed without a record. */
const TASKS_AFTER_CLOSE = {
  data: {
    farmDailyTasks: TASKS.data.farmDailyTasks.map((task) =>
      task.taskId === '13'
        ? {
            ...task,
            status: 'CLOSED_NO_RECORD',
            done: false,
            completedAt: '2026-09-06T09:30:00',
            completedByName: 'D Worker',
            closureReason: 'FORGOT',
            closureNote: null,
          }
        : task,
    ),
  },
};

const READER = ['view_dashboard'];
const MARKER = ['view_dashboard', 'mark_task_done'];
/** A WORKER: can tick, and can record feedings. */
const FEEDER = ['view_dashboard', 'mark_task_done', 'log_feeding'];

function setup(
  permissions: string[],
  options: { lang?: Lang; queryParams?: Record<string, string> } = {},
) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...(options.queryParams
        ? [
            {
              provide: ActivatedRoute,
              useValue: { snapshot: { queryParamMap: convertToParamMap(options.queryParams) } },
            },
          ]
        : []),
    ],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');
  if (options.queryParams) {
    // The screen strips the params it read, in its constructor - so the spy
    // must exist before the component does.
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  const fixture = TestBed.createComponent(DailyTasks);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

function gql(httpMock: HttpTestingController, operation: string) {
  return httpMock.expectOne(
    (req) =>
      req.url === environment.graphqlUrl &&
      String((req.body as { query: string }).query).includes(operation),
  );
}

function variablesOf(req: { request: { body: unknown } }): Record<string, unknown> {
  return (req.request.body as { variables: Record<string, unknown> }).variables;
}

const text = (fixture: ComponentFixture<DailyTasks>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<DailyTasks>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

const all = (fixture: ComponentFixture<DailyTasks>, testId: string) => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
];

const buttonsIn = (fixture: ComponentFixture<DailyTasks>, selector: string) => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(selector),
];

/** The "Mark done" buttons - non-feeding tasks only; none at all for a VIEWER. */
const markButtons = (fixture: ComponentFixture<DailyTasks>) =>
  buttonsIn(fixture, '[data-testid="mark-done"] button');

/** "Record feeding" - needs log_feeding as well as mark_task_done. */
const recordButtons = (fixture: ComponentFixture<DailyTasks>) =>
  buttonsIn(fixture, '[data-testid="record-feeding"] button');

/** "Close without record" - the escape hatch, mark_task_done only. */
const closeLinks = (fixture: ComponentFixture<DailyTasks>) =>
  buttonsIn(fixture, 'button[data-testid="close-without-record"]');

/** YYYY-MM-DD, `days` away from `date`. Shifted in UTC so no zone can move it. */
function shiftDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** The screen's one load: the effect fires it, the mock answers it. */
async function load(
  fixture: ComponentFixture<DailyTasks>,
  httpMock: HttpTestingController,
  tasks: object = TASKS,
) {
  fixture.detectChanges();
  gql(httpMock, 'FarmDailyTasks').flush(tasks);
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Moves the picker and answers the reload it triggers. */
async function pickDate(
  fixture: ComponentFixture<DailyTasks>,
  httpMock: HttpTestingController,
  date: string,
  tasks: object = TASKS,
) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    '#tasks-date',
  )!;
  input.value = date;
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();

  const req = gql(httpMock, 'FarmDailyTasks');
  req.flush(tasks);
  await fixture.whenStable();
  fixture.detectChanges();
  return req;
}

describe('DailyTasks', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the sheet', () => {
    it('opens on today, farm-wide, in one request', async () => {
      const { fixture, component, httpMock } = setup(READER);

      fixture.detectChanges();
      const req = gql(httpMock, 'FarmDailyTasks');

      // The whole farm in one round trip - no `cycles` call first, and no
      // per-cycle follow-up. And no farm argument: the farm is the token's.
      expect(variablesOf(req)).toEqual({ date: component.today });
      expect(component.date()).toBe(component.today);

      req.flush(TASKS);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(all(fixture, 'task-row').length).toBe(4);
      httpMock.verify();
    });

    it('names every task by its unit and species, never by a cycle id', async () => {
      const { fixture, httpMock } = setup(READER);

      await load(fixture, httpMock);

      const heads = all(fixture, 'group-head').map((el) => (el.textContent ?? '').trim());
      // Both cycles produce "Kulisha - Asubuhi" at 07:00. THIS is what tells
      // the two rows apart.
      expect(heads[0]).toContain('DEV-A1');
      expect(heads[0]).toContain('Sato');
      expect(heads[1]).toContain('DEV-B2');
      expect(heads[1]).toContain('Kambale');
      // The task with no cycle keeps its own group, last, and says so.
      expect(heads[2]).toContain('Bila kitengo');

      const body = text(fixture);
      expect(body).toContain('Kulisha - Asubuhi');
      expect(body).toContain('Kuangalia Maji');
      expect(body).toContain('07:00');
      expect(body).toContain('17:00');
    });

    it('shows who completed a done task, and when', async () => {
      const { fixture, httpMock } = setup(READER);

      await load(fixture, httpMock);

      const by = all(fixture, 'task-by').map((el) => (el.textContent ?? '').trim());
      expect(by).toEqual(['imefanywa na Juma, 07:14']);
      // The done row reads as done, and the count agrees with it.
      expect(text(fixture)).toContain('Imefanyika');
      expect(text(fixture)).toContain('1 / 4');
    });

    it('renders the empty state when the farm has no active cycle', async () => {
      const { fixture, httpMock } = setup(MARKER);

      await load(fixture, httpMock, { data: { farmDailyTasks: [] } });

      expect(panel(fixture, 'empty')).toBeTruthy();
      expect(panel(fixture, 'tasks')).toBeNull();
      expect(text(fixture)).toContain('Hakuna kazi kwa siku hii');
      // Not a dead end: the empty sheet says where cycles come from.
      expect(text(fixture)).toContain('Nenda kwenye Uzalishaji');
    });

    it('shows a load failure with a way to retry', async () => {
      const { fixture, component, httpMock } = setup(READER);

      fixture.detectChanges();
      gql(httpMock, 'FarmDailyTasks').flush({
        data: null,
        errors: [
          {
            message: "Huna ruhusa ya 'view_dashboard'.",
            path: ['farmDailyTasks'],
            extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
          },
        ],
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.loadError()?.errorCode).toBe('FORBIDDEN');
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      expect(text(fixture)).toContain('Jaribu tena');
    });
  });

  describe('the date picker', () => {
    it('is offered to everyone who can see the screen, VIEWER included', async () => {
      const { fixture, httpMock } = setup(READER);

      await load(fixture, httpMock);

      expect(panel(fixture, 'date-bar')).toBeTruthy();
      expect(markButtons(fixture).length).toBe(0);
    });

    it('re-reads the sheet for a past day', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      const yesterday = shiftDays(component.today, -1);
      const req = await pickDate(fixture, httpMock, yesterday);

      expect(variablesOf(req)).toEqual({ date: yesterday });
      expect(component.date()).toBe(yesterday);
      expect(component.isFuture()).toBe(false);
      httpMock.verify();
    });

    it('ignores a cleared box - there is no such day to ask about', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '#tasks-date',
      )!;
      input.value = '';
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(component.date()).toBe(component.today);
      httpMock.verify();
    });
  });

  describe('marking a task done', () => {
    it('sends the PICKED date, not today, and flips the row', async () => {
      const { fixture, component, httpMock } = setup(MARKER);
      await load(fixture, httpMock);

      const yesterday = shiftDays(component.today, -1);
      await pickDate(fixture, httpMock, yesterday);

      // A past day is markable: the button is live, not disabled.
      const buttons = markButtons(fixture);
      expect(buttons.length).toBe(1);
      expect(buttons.every((button) => button.disabled)).toBe(false);

      const task = component.tasks().find((t) => t.taskId === '14')!;
      component.markDone(task);

      const mutation = gql(httpMock, 'CompleteTask');
      expect(variablesOf(mutation)).toEqual({
        // Converted: the type hands out an ID! string, the input takes Int!.
        // And yesterday, because that is the sheet being ticked.
        input: { taskId: 14, completionDate: yesterday },
      });
      mutation.flush({ data: { completeTask: TASKS_AFTER_MARK.data.farmDailyTasks[3] } });
      await fixture.whenStable();
      fixture.detectChanges();

      // The list is re-read, so the row shows the name and time the BACKEND
      // recorded rather than anything built here.
      const refetch = gql(httpMock, 'FarmDailyTasks');
      expect(variablesOf(refetch)).toEqual({ date: yesterday });
      refetch.flush(TASKS_AFTER_MARK);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe('Kazi imewekwa imefanyika.');
      expect(component.doneCount()).toBe(2);
      expect(all(fixture, 'task-by').map((el) => (el.textContent ?? '').trim())).toContain(
        'imefanywa na D Worker, 08:02',
      );
      expect(markButtons(fixture).length).toBe(0);
      httpMock.verify();
    });

    it('offers no button at all to a VIEWER, who still reads the whole sheet', async () => {
      const { fixture, httpMock } = setup(READER);

      await load(fixture, httpMock);

      expect(markButtons(fixture).length).toBe(0);
      expect(recordButtons(fixture).length).toBe(0);
      expect(closeLinks(fixture).length).toBe(0);
      // Read-only, not blinded: the record is all still there.
      expect(all(fixture, 'task-row').length).toBe(4);
      expect(text(fixture)).toContain('imefanywa na Juma, 07:14');
      expect(panel(fixture, 'date-bar')).toBeTruthy();
    });

    it('ticks only non-feeding tasks; outstanding FEEDING tasks get record + close instead', async () => {
      const { fixture, httpMock } = setup(FEEDER);

      await load(fixture, httpMock);

      // Outstanding: 12 and 13 (feeding), 14 (water). 11 is done - nothing.
      expect(markButtons(fixture).length).toBe(1);
      expect(recordButtons(fixture).length).toBe(2);
      expect(closeLinks(fixture).length).toBe(2);
    });

    it('offers only "close without record" on a feeding task to someone without log_feeding', async () => {
      const { fixture, httpMock } = setup(MARKER);

      await load(fixture, httpMock);

      expect(recordButtons(fixture).length).toBe(0);
      expect(closeLinks(fixture).length).toBe(2);
      expect(markButtons(fixture).length).toBe(1);
    });

    it('disables the buttons on a future day, and says why', async () => {
      const { fixture, component, httpMock } = setup(FEEDER);
      await load(fixture, httpMock);

      await pickDate(fixture, httpMock, shiftDays(component.today, 1));

      expect(component.isFuture()).toBe(true);
      expect(panel(fixture, 'future')).toBeTruthy();
      expect(text(fixture)).toContain('Siku hii bado haijafika');

      const buttons = [...markButtons(fixture), ...recordButtons(fixture), ...closeLinks(fixture)];
      expect(buttons.length).toBe(5);
      expect(buttons.every((button) => button.disabled)).toBe(true);
      // The sheet itself is still readable - only the marking is refused.
      expect(all(fixture, 'task-row').length).toBe(4);
      httpMock.verify();
    });

    it("surfaces the backend's own words when a future date is refused", async () => {
      // There is no client-side future rule to swallow this: the disabled
      // button is presentation, and the RULE is the server's. So when the
      // call happens anyway - two clocks disagreeing, a stale page - the
      // reason shown is the one the backend gave.
      const { fixture, component, httpMock } = setup(MARKER);
      await load(fixture, httpMock);

      const tomorrow = shiftDays(component.today, 1);
      await pickDate(fixture, httpMock, tomorrow);

      const task = component.tasks().find((t) => t.taskId === '14')!;
      component.markDone(task);

      const mutation = gql(httpMock, 'CompleteTask');
      expect(variablesOf(mutation)).toEqual({
        input: { taskId: 14, completionDate: tomorrow },
      });
      mutation.flush(FUTURE_DATE_REFUSED);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.markError()).toBe('Tarehe ya kufanyika haiwezi kuwa ya siku ijayo.');
      expect(all(fixture, 'mark-error').length).toBe(1);
      // Nothing was re-read: the sheet did not change.
      expect(component.markingTaskId()).toBeNull();
      httpMock.verify();
    });

    it('answers FORBIDDEN in the UI language, not in backend prose', async () => {
      const { fixture, component, httpMock } = setup(MARKER);
      await load(fixture, httpMock);

      component.markDone(component.tasks().find((t) => t.taskId === '14')!);
      gql(httpMock, 'CompleteTask').flush(FORBIDDEN);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.markError()).toBe(
        'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
      );
      httpMock.verify();
    });
  });

  describe('recording a feeding task', () => {
    it("opens Feeding for the task's cycle, day and task - by URL, not by switching the cycle", async () => {
      const { fixture, component, httpMock } = setup(FEEDER);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const selection = TestBed.inject(CycleSelectionService);
      const select = vi.spyOn(selection, 'select');
      await load(fixture, httpMock);

      const yesterday = shiftDays(component.today, -1);
      await pickDate(fixture, httpMock, yesterday);
      recordButtons(fixture)[1].click(); // DEV-B2's morning feed, task 13
      fixture.detectChanges();

      expect(navigate).toHaveBeenCalledWith(['/feeding'], {
        queryParams: { cycleId: 8, date: yesterday, taskId: '13' },
      });
      // The global selection Production and Water Quality read is untouched.
      expect(select).not.toHaveBeenCalled();
      // And no mutation from here: the record is written by Feeding.
      httpMock.verify();
    });

    it('lands back on the given day with a toast when Feeding sends it back', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, {
        queryParams: { date: '2026-09-06', recorded: '1' },
      });

      fixture.detectChanges();
      const req = gql(httpMock, 'FarmDailyTasks');

      expect(variablesOf(req)).toEqual({ date: '2026-09-06' });
      expect(component.toastMessage()).toBe('Ulishaji umerekodiwa na kazi imekamilika.');
      req.flush(TASKS);
    });
  });

  describe('closing a feeding task without a record', () => {
    async function openCloseFor(taskIndex: number) {
      const ctx = setup(FEEDER);
      await load(ctx.fixture, ctx.httpMock);
      closeLinks(ctx.fixture)[taskIndex].click();
      ctx.fixture.detectChanges();
      return ctx;
    }

    const confirm = (fixture: ComponentFixture<DailyTasks>) => {
      buttonsIn(fixture, '[data-testid="close-confirm"] button')[0].click();
      fixture.detectChanges();
    };

    const pickReason = (fixture: ComponentFixture<DailyTasks>, reason: string) => {
      const radio = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        `input[data-reason="${reason}"]`,
      )!;
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    it('asks for a reason, in words, before anything is sent', async () => {
      const { fixture, httpMock } = await openCloseFor(1);

      expect(panel(fixture, 'close-without-record')).toBeTruthy();
      // Translated reasons - never the stored codes.
      const body = text(fixture);
      expect(body).toContain('Hakukuwa na mtandao');
      expect(body).toContain('Nilisahau kurekodi');
      expect(body).not.toContain('DEVICE_FAILURE');

      confirm(fixture);
      expect(all(fixture, 'close-error')[0].textContent).toContain('Chagua sababu.');
      httpMock.verify();
    });

    it('requires a note for OTHER', async () => {
      const { fixture, httpMock } = await openCloseFor(1);

      pickReason(fixture, 'OTHER');
      confirm(fixture);

      expect(all(fixture, 'close-error')[0].textContent).toContain(
        'Andika maelezo ya sababu nyingine.',
      );
      httpMock.verify();
    });

    it('sends the code and the shown day, then counts the task as CLOSED - not done', async () => {
      const { fixture, component, httpMock } = await openCloseFor(1); // task 13

      pickReason(fixture, 'FORGOT');
      confirm(fixture);

      const mutation = gql(httpMock, 'CloseTaskWithoutRecord');
      expect(variablesOf(mutation)).toEqual({
        input: { taskId: 13, completionDate: component.today, reason: 'FORGOT', note: null },
      });
      mutation.flush({
        data: { closeTaskWithoutRecord: TASKS_AFTER_CLOSE.data.farmDailyTasks[2] },
      });
      await fixture.whenStable();
      gql(httpMock, 'FarmDailyTasks').flush(TASKS_AFTER_CLOSE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe('Kazi imefungwa bila rekodi.');
      // Done 1 · Closed 1 / 4 - closed is NOT progress.
      expect(component.doneCount()).toBe(1);
      expect(component.closedCount()).toBe(1);
      expect(component.outstandingCount()).toBe(2);
      expect(component.progressPercent()).toBe(25);
      expect(all(fixture, 'progress')[0].textContent?.replace(/\s+/g, ' ')).toContain(
        'Zimefanyika: 1 · Zimefungwa 1 / 4',
      );

      // Its own look: a warning sign, an amber badge, never the green done class.
      const row = all(fixture, 'task-row')[2];
      expect(row.classList.contains('task--closed')).toBe(true);
      expect(row.classList.contains('task--done')).toBe(false);
      // An SVG, not the U+26A0 character - phones draw that as an emoji.
      expect(row.querySelector('.task__tick svg[data-icon="warning"]')).not.toBeNull();
      expect(row.querySelector('.task__tick')?.textContent?.trim()).toBe('');
      expect(row.querySelector('.badge--tone-idle')).not.toBeNull();
      expect(row.textContent).toContain('Imefungwa bila rekodi');
      expect(row.textContent).toContain('imefungwa na D Worker, 09:30');
      expect(row.textContent).toContain('Sababu: Nilisahau kurekodi');
      // Nothing left to do on it.
      expect(row.querySelector('.task__action')).toBeNull();
      httpMock.verify();
    });

    it('keeps closed tasks out of both the outstanding and done filters', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock, TASKS_AFTER_CLOSE);

      expect(component.filterOptions().map((o) => o.value)).toContain('closed');

      component.setFilter('outstanding');
      fixture.detectChanges();
      expect(all(fixture, 'task-row').length).toBe(2);

      component.setFilter('done');
      fixture.detectChanges();
      expect(all(fixture, 'task-row').length).toBe(1);

      component.setFilter('closed');
      fixture.detectChanges();
      expect(all(fixture, 'task-row').length).toBe(1);
      // Not late, not next: reminders have stopped for it.
      expect(component.isTimePassed(component.tasks()[2])).toBe(false);
    });

    it("shows the backend's CONFLICT sentence when the task was closed meanwhile", async () => {
      const { fixture, component, httpMock } = await openCloseFor(0);

      pickReason(fixture, 'OFFLINE');
      confirm(fixture);
      gql(httpMock, 'CloseTaskWithoutRecord').flush({
        data: null,
        errors: [
          {
            message: 'Kazi hii tayari imewekwa kuwa imekamilika kwa tarehe 2026-09-06.',
            path: ['closeTaskWithoutRecord'],
            extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
          },
        ],
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.closeError()).toBe(
        'Kazi hii tayari imewekwa kuwa imekamilika kwa tarehe 2026-09-06.',
      );
      expect(component.closingTaskId()).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('reading the sheet at a glance', () => {
    it('draws a real tick and circle, never mojibake', async () => {
      const { fixture, httpMock } = setup(READER);
      await load(fixture, httpMock);

      const ticks = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll('.task__tick'),
      ].map((el) => (el.textContent ?? '').trim());
      expect(ticks).toContain('✓');
      expect(ticks).toContain('○');
      expect(text(fixture)).not.toContain('â');
    });

    it('gives each status its own semantic tone - amber only for closed without a record', async () => {
      const { component, fixture, httpMock } = setup(READER);
      await load(fixture, httpMock);
      const base = component.tasks()[0];
      const tone = (status: string, done = false) =>
        component.statusVariant({ ...base, status, done });

      expect(tone('DONE', true)).toBe('tone-active');
      expect(tone('CLOSED_NO_RECORD')).toBe('tone-idle');
      expect(tone('OUTSTANDING')).toBe('tone-neutral');
      expect(tone('PENDING')).toBe('tone-neutral');
      expect(tone('MISSED')).toBe('tone-danger');
      expect(tone('LATE')).toBe('tone-danger');
    });

    it('titles the card with the day in words, not the ISO date again', async () => {
      const { fixture, component, httpMock } = setup(READER, { lang: 'en' });
      await load(fixture, httpMock);

      const title = all(fixture, 'sheet-date')[0].textContent ?? '';
      expect(title.trim()).toBe(component.displayDate());
      expect(title).not.toContain(component.today);
    });

    it('shows progress as a percentage and per unit', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      // 1 of 4 done.
      expect(component.progressPercent()).toBe(25);
      expect(text(fixture)).toContain('(25%)');
      const counts = all(fixture, 'group-count').map((el) => (el.textContent ?? '').trim());
      expect(counts).toEqual(['1 / 2', '0 / 1', '0 / 1']);
    });

    it('filters to outstanding or done without a new request, and keeps the counts', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      component.setFilter('outstanding');
      fixture.detectChanges();
      expect(all(fixture, 'task-row').length).toBe(3);
      // The heading still counts the whole unit.
      expect((all(fixture, 'group-count')[0].textContent ?? '').trim()).toBe('1 / 2');

      component.setFilter('done');
      fixture.detectChanges();
      expect(all(fixture, 'task-row').length).toBe(1);
      expect(text(fixture)).toContain('Juma');

      httpMock.verify();
    });

    it('says so when a filter leaves nothing to show', async () => {
      const { fixture, component, httpMock } = setup(READER);
      const noneDone = {
        data: {
          farmDailyTasks: TASKS.data.farmDailyTasks.map((task) => ({
            ...task,
            done: false,
            status: 'OUTSTANDING',
            completedAt: null,
            completedByName: null,
          })),
        },
      };
      await load(fixture, httpMock, noneDone);

      component.setFilter('done');
      fixture.detectChanges();

      expect(all(fixture, 'filter-empty').length).toBe(1);
      expect(text(fixture)).toContain(DAILY_TASKS_I18N.sw.filterEmptyDone);
    });

    it('moves one day back and forward with the arrow buttons', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      component.shiftDay(-1);
      fixture.detectChanges();
      const back = gql(httpMock, 'FarmDailyTasks');
      expect(variablesOf(back)).toEqual({ date: shiftDays(component.today, -1) });
      back.flush(TASKS);
      await fixture.whenStable();

      component.shiftDay(1);
      fixture.detectChanges();
      const forward = gql(httpMock, 'FarmDailyTasks');
      expect(variablesOf(forward)).toEqual({ date: component.today });
      forward.flush(TASKS);
      httpMock.verify();
    });

    it('marks every undone task on a past day as time passed, and none that are done', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      await pickDate(fixture, httpMock, shiftDays(component.today, -1));

      expect(all(fixture, 'time-passed').length).toBe(3);
      expect(component.timePassedCount()).toBe(3);
    });

    it('marks a task as time passed today only once its time has gone by', async () => {
      const { fixture, component, httpMock } = setup(READER);
      component.nowTime.set('08:00');
      await load(fixture, httpMock);

      // 07:00 (DEV-B2) is past; 09:00 and 17:00 are not; 07:00 DEV-A1 is done.
      expect(all(fixture, 'time-passed').length).toBe(1);
      // And the next task is the earliest one still ahead.
      expect(component.nextTask()?.task.scheduledTime).toBe('09:00');
    });

    it('marks nothing as time passed on a future day', async () => {
      const { fixture, component, httpMock } = setup(READER);
      await load(fixture, httpMock);

      await pickDate(fixture, httpMock, shiftDays(component.today, 1));

      expect(all(fixture, 'time-passed').length).toBe(0);
    });

    it('summarises the day on the rail', async () => {
      const { fixture, component, httpMock } = setup(READER);
      component.nowTime.set('08:00');
      await load(fixture, httpMock);

      const by = (label: string) => component.summary().find((row) => row.label === label)?.value;
      expect(by('Kazi zote')).toBe('4');
      expect(by('Zimefanyika')).toBe('1');
      expect(by('Hazijafanyika')).toBe('3');
      expect(by('Muda umepita')).toBe('1');

      const rail = (fixture.nativeElement as HTMLElement).querySelector('.module-rail');
      expect(rail?.querySelector('[data-rail="next"]')).toBeTruthy();
      expect(rail?.querySelector('[data-rail="by-unit"]')?.textContent).toContain('DEV-B2');
    });
  });

  describe('copy', () => {
    it('holds the same keys in both languages', () => {
      expect(Object.keys(DAILY_TASKS_I18N.en).sort()).toEqual(
        Object.keys(DAILY_TASKS_I18N.sw).sort(),
      );
    });

    it('words every closure reason code in both languages', () => {
      const codes = ['OFFLINE', 'FORGOT', 'DEVICE_FAILURE', 'OTHER'];
      expect(Object.keys(DAILY_TASKS_I18N.sw.reasons).sort()).toEqual([...codes].sort());
      expect(Object.keys(DAILY_TASKS_I18N.en.reasons).sort()).toEqual([...codes].sort());
    });

    it('renders in English when the UI language is English', async () => {
      const { fixture, httpMock } = setup(MARKER, { lang: 'en' });

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Daily Tasks');
      expect(text(fixture)).toContain('Unit DEV-A1');
      expect(text(fixture)).toContain('done by Juma, 07:14');
      expect(text(fixture)).toContain('Mark done');
      expect(text(fixture)).toContain('Outstanding');
    });
  });
});
