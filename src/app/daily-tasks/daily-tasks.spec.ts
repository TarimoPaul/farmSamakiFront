import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DailyTasks } from './daily-tasks';
import { DAILY_TASKS_I18N } from './daily-tasks.i18n';
import { LanguageService, Lang } from '../core/services/language';
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

/** The same sheet after task 13 has been marked: the row the test watches flip. */
const TASKS_AFTER_MARK = {
  data: {
    farmDailyTasks: TASKS.data.farmDailyTasks.map((task) =>
      task.taskId === '13'
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

const READER = ['view_dashboard'];
const MARKER = ['view_dashboard', 'mark_task_done'];

function setup(permissions: string[], options: { lang?: Lang } = {}) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

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

/** The mark buttons actually on the page - none at all for a VIEWER. */
const markButtons = (fixture: ComponentFixture<DailyTasks>) => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
    '.task__action button',
  ),
];

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
      expect(buttons.length).toBe(3);
      expect(buttons.every((button) => button.disabled)).toBe(false);

      const task = component.tasks().find((t) => t.taskId === '13')!;
      component.markDone(task);

      const mutation = gql(httpMock, 'CompleteTask');
      expect(variablesOf(mutation)).toEqual({
        // Converted: the type hands out an ID! string, the input takes Int!.
        // And yesterday, because that is the sheet being ticked.
        input: { taskId: 13, completionDate: yesterday },
      });
      mutation.flush({ data: { completeTask: TASKS_AFTER_MARK.data.farmDailyTasks[2] } });
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
      expect(markButtons(fixture).length).toBe(2);
      httpMock.verify();
    });

    it('offers no button at all to a VIEWER, who still reads the whole sheet', async () => {
      const { fixture, httpMock } = setup(READER);

      await load(fixture, httpMock);

      expect(markButtons(fixture).length).toBe(0);
      // Read-only, not blinded: the record is all still there.
      expect(all(fixture, 'task-row').length).toBe(4);
      expect(text(fixture)).toContain('imefanywa na Juma, 07:14');
      expect(panel(fixture, 'date-bar')).toBeTruthy();
    });

    it('is offered on every outstanding task, and on no done one', async () => {
      const { fixture, httpMock } = setup(MARKER);

      await load(fixture, httpMock);

      // Three outstanding of four. The done row has nothing to mark.
      expect(markButtons(fixture).length).toBe(3);
    });

    it('disables the button on a future day, and says why', async () => {
      const { fixture, component, httpMock } = setup(MARKER);
      await load(fixture, httpMock);

      await pickDate(fixture, httpMock, shiftDays(component.today, 1));

      expect(component.isFuture()).toBe(true);
      expect(panel(fixture, 'future')).toBeTruthy();
      expect(text(fixture)).toContain('Siku hii bado haijafika');

      const buttons = markButtons(fixture);
      expect(buttons.length).toBe(3);
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

      const task = component.tasks().find((t) => t.taskId === '13')!;
      component.markDone(task);

      const mutation = gql(httpMock, 'CompleteTask');
      expect(variablesOf(mutation)).toEqual({
        input: { taskId: 13, completionDate: tomorrow },
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

      component.markDone(component.tasks().find((t) => t.taskId === '13')!);
      gql(httpMock, 'CompleteTask').flush(FORBIDDEN);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.markError()).toBe(
        'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
      );
      httpMock.verify();
    });
  });

  describe('copy', () => {
    it('holds the same keys in both languages', () => {
      expect(Object.keys(DAILY_TASKS_I18N.en).sort()).toEqual(
        Object.keys(DAILY_TASKS_I18N.sw).sort(),
      );
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
