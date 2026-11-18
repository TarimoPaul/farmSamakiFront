import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Dashboard } from './dashboard';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { ERROR_CODE } from '../core/models/error-codes';
import { environment } from '../../environments/environment';
import { Observable, of, throwError } from 'rxjs';
import { DailyTasksService } from '../core/services/daily-tasks';
import { DailyTaskStatus } from '../core/models/daily-task';

/** Captured from the running backend: a no-role member querying the dashboard. */
const FORBIDDEN_RESPONSE = {
  errors: [
    {
      message: "Huna ruhusa ya 'view_dashboard'.",
      locations: [{ line: 1, column: 9 }],
      path: ['productionUnits'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
  data: null,
};

/** Captured from the running backend: ROOT (or any farmless account) querying it. */
const NO_FARM_RESPONSE = {
  errors: [
    {
      message: 'ROOT hana shamba; tumia akaunti ya shamba husika.',
      path: ['productionUnits'],
      extensions: { errorCode: 'NO_FARM_CONTEXT', classification: 'FORBIDDEN' },
    },
  ],
  data: null,
};

const PERMISSIONS_KEY = 'samakiFarm.permissions';

// The real Router, because the screen's own links use routerLink (and
// therefore ActivatedRoute). The shell's nav used to be the reason - back when
// this screen rendered its own <app-shell> - but the shell is a layout route
// now and is no part of this component. Only navigateByUrl is stubbed; that is
// the one thing these tests assert about.
//
// DailyTasksService is FAKED: the "Leo" card makes its own request, and the
// real one would be a second pending GraphQL call beside every
// `expectOne(graphqlUrl)` below. By default today has no tasks; the card's
// own tests hand in a sheet, or a failure, through `todayTasks`.
function setup(todayTasks: Observable<DailyTaskStatus[]> = of([])) {
  const farmTasks = vi.fn((_date: string) => todayTasks);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: DailyTasksService, useValue: { farmTasks } },
    ],
  });
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Dashboard);
  return {
    router: { navigateByUrl },
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
    farmTasks,
  };
}

describe('Dashboard error surface', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows the mapped FORBIDDEN message, not a generic failure line', async () => {
    const { fixture, component, httpMock, router } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges(); // triggers ngOnInit -> the dashboard query
    httpMock.expectOne(environment.graphqlUrl).flush(FORBIDDEN_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()?.errorCode).toBe(ERROR_CODE.FORBIDDEN);
    expect(component.errorMessage()).toBe(
      'You do not have permission to view this. Ask your farm administrator.',
    );
    expect(component.errorMessage()).not.toBe('Failed to load data.');
    expect(component.loading()).toBe(false);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('You do not have permission to view this.');

    // FORBIDDEN is an operation failure, not a session one - nobody is signed out.
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows the mapped message in Swahili too', async () => {
    const { fixture, component, httpMock } = setup();
    TestBed.inject(LanguageService).setLang('sw');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(FORBIDDEN_RESPONSE);
    await fixture.whenStable();

    expect(component.errorMessage()).toBe(
      'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
    );
  });

  it('offers a farm administrator the way to /farms, not a failure line', async () => {
    // ROOT, or anyone else who manages farms without belonging to one. ROOT
    // is handed every permission code by /me (AuthService.describeCurrentUser).
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
    const { fixture, component, httpMock, router } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(NO_FARM_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()?.errorCode).toBe(ERROR_CODE.NO_FARM_CONTEXT);
    expect(component.noFarm()).toBe(true);

    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';
    expect(text).toContain('No farm selected');
    // The old line blamed the account for a state ROOT can never leave.
    expect(text).not.toContain('Your account is not assigned to a farm yet.');

    expect(
      element.querySelector<HTMLAnchorElement>('.dash-notice__action')?.getAttribute('href'),
    ).toBe('/farms');

    // Still an operation failure, not a session one - nobody is signed out.
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('tells a farmless member to ask an administrator, and offers no way out', async () => {
    // An approved user not yet placed on a farm. Nothing in the UI can fix
    // this for them, so the panel carries no action.
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard']));
    const { fixture, component, httpMock } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(NO_FARM_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.noFarm()).toBe(true);
    expect(component.canManageFarms()).toBe(false);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent ?? '').toContain('Ask your administrator to assign you to one');
    expect(element.querySelector('.dash-notice__action')).toBeNull();
  });

  it('reloads when the selected farm changes', async () => {
    // ROOT picks a farm from the switcher: the header the query travels with
    // has changed, so the numbers on screen are about a farm nobody is
    // looking at any more.
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
    const { fixture, component, httpMock } = setup();

    fixture.detectChanges();
    // `manage_farms` is granted here and nowhere else in this file, so this is
    // the one test where the rail's org-counts effect fires and asks
    // GET /api/farms - see Dashboard.loadOrgCounts. It is a side panel and
    // irrelevant to what is being asserted, but it has to be CLAIMED: the
    // graphql expectOne below matches by URL and would step over it, leaving
    // it open for verify() to report at the end.
    httpMock.expectOne(`${environment.apiUrl}/farms`).flush({ success: true, data: [] });
    httpMock.expectOne(environment.graphqlUrl).flush(NO_FARM_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.noFarm()).toBe(true);

    // Only ONE farms call, not one per selection: loadOrgCounts depends on
    // activeFarmId - the farm /me says the backend APPLIED - which no
    // switcher click can move on its own. What the selection does move is the
    // dashboard query below, which is the effect this test is about.
    TestBed.inject(FarmSelectionService).select(19);
    fixture.detectChanges();

    httpMock.expectOne(environment.graphqlUrl).flush({
      data: {
        productionUnits: [
          {
            unitId: '27',
            code: 'D4-A',
            type: 'POND_EARTHEN',
            sizeM3: 10,
            waterSource: null,
            status: 'ACTIVE',
          },
        ],
        cycles: [],
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.noFarm()).toBe(false);
    expect(component.totalUnits()).toBe(1);
    httpMock.verify();
  });

  it('renders data and no error on success', async () => {
    const { fixture, component, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush({
      data: {
        productionUnits: [
          {
            unitId: '27',
            code: 'D4-A',
            type: 'POND_EARTHEN',
            sizeM3: 10,
            waterSource: null,
            status: 'IDLE',
          },
        ],
        cycles: [],
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()).toBeNull();
    expect(component.errorMessage()).toBeNull();
    expect(component.totalUnits()).toBe(1);
    expect(component.loading()).toBe(false);

    // The type chart speaks words, not enum codes.
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.type-list__row'),
    );
    expect(rows.map((row) => row.querySelector('.type-list__label')?.textContent?.trim())).toEqual([
      'Tangi',
      'Bwawa la kuchimbwa',
      'Bwawa la kujengwa',
    ]);

    // Only the populated type is drawn as data; the empty ones are muted and
    // their bars hold nothing.
    expect(rows.map((row) => row.classList.contains('type-list__row--zero'))).toEqual([
      true,
      false,
      true,
    ]);
    expect(
      rows.map((row) => row.querySelector<HTMLElement>('.type-list__fill')?.style.width),
    ).toEqual(['0%', '100%', '0%']);
  });
});

/**
 * Kalenda inayobofyeka.
 *
 * Kanuni mbili zinabanwa hapa, na zote mbili ni za uaminifu wa namba:
 *
 *  1. LEO HAIPITII `dashboardOnDate`. Dashibodi tayari imejibu kwa leo; kuuliza
 *     tena kwa njia ya pili ndiyo jinsi skrini inavyoishia kuonyesha namba
 *     mbili tofauti za siku moja.
 *  2. Tarehe isiyo na rekodi HAIONYESHI sifuri. Sifuri hapo ingesomeka
 *     "shamba lilikuwa tupu", jambo ambalo ni madai tofauti kabisa na
 *     "hatuna rekodi ya siku hiyo".
 */
describe('Dashboard date picker', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** A cycle row as both DASHBOARD_QUERY and DAY_QUERY select it. */
  function cycleRow(cycleId: string, unitCode: string, status = 'ACTIVE') {
    return {
      cycleId,
      speciesName: 'Sato',
      stockingDate: '2026-01-10',
      fingerlingsCount: 500,
      survivalRateEstimate: 0.85,
      expectedHarvestDate: '2026-07-10',
      status,
      unit: { unitId: '1', code: unitCode, type: 'TANK' },
    };
  }

  const DASHBOARD_DATA = {
    data: {
      productionUnits: [
        { unitId: '1', code: 'T1', type: 'TANK', sizeM3: 10, waterSource: null, status: 'ACTIVE' },
        { unitId: '2', code: 'T2', type: 'TANK', sizeM3: 5, waterSource: null, status: 'IDLE' },
      ],
      // TODAY's one running cycle. Every table test below proves it never
      // appears on another date.
      cycles: [cycleRow('100', 'LIVE-T1')],
    },
  };

  /** Jibu la `dashboardOnDate` kwa siku yenye rekodi. */
  function dayResponse(date: string, overrides: Record<string, unknown> = {}) {
    return {
      data: {
        dashboardOnDate: {
          date,
          unitsExisting: 7,
          unitsActive: 4,
          unitsIdle: 3,
          totalVolumeM3: 70,
          cyclesRunning: 0,
          cycles: [],
          cyclesStarted: 0,
          cyclesClosed: 0,
          fingerlingsRunning: 900,
          fingerlingsStocked: 0,
          members: 6,
          unitsByType: [],
          historyStartsOn: '2020-01-01',
          historyComplete: true,
          ...overrides,
        },
      },
    };
  }

  async function loaded() {
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard']));
    const ctx = setup();
    ctx.fixture.detectChanges();
    ctx.httpMock.expectOne(environment.graphqlUrl).flush(DASHBOARD_DATA);
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();
    return ctx;
  }

  it('shows the live numbers on today, and asks the backend for nothing more', async () => {
    const ctx = await loaded();

    expect(ctx.component.viewingToday()).toBe(true);
    expect(ctx.component.shownTotalUnits()).toBe(2);
    expect(ctx.component.shownActiveUnits()).toBe(1);
    // The whole point: today is NOT re-asked through dashboardOnDate.
    ctx.httpMock.verify();
  });

  it('switches every card to the chosen date', async () => {
    const ctx = await loaded();

    const past = new Date();
    past.setDate(past.getDate() - 3);
    ctx.component.selectDate(past);

    const request = ctx.httpMock.expectOne(environment.graphqlUrl);
    expect(request.request.body.variables.date).toBe(ctx.component.selectedDate());
    request.flush(dayResponse(ctx.component.selectedDate(), { cyclesRunning: 4 }));
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();

    expect(ctx.component.viewingToday()).toBe(false);
    // Every card moved together - the live values were 2 and 1.
    expect(ctx.component.shownTotalUnits()).toBe(7);
    expect(ctx.component.shownActiveUnits()).toBe(4);
    expect(ctx.component.shownCyclesRunning()).toBe(4);
    expect(ctx.component.shownVolumeM3()).toBe(70);
    expect(ctx.component.shownMembers()).toBe(6);
    expect(ctx.component.shownActivePercent()).toBe(57);
  });

  it('shows the fingerlings that were IN the running cycles, not that day intake', async () => {
    const ctx = await loaded();

    const past = new Date();
    past.setDate(past.getDate() - 3);
    ctx.component.selectDate(past);
    ctx.httpMock.expectOne(environment.graphqlUrl).flush(
      dayResponse(ctx.component.selectedDate(), {
        fingerlingsRunning: 900,
        fingerlingsStocked: 40,
      }),
    );
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();

    // The tile has always meant "fish currently stocked". Swapping in the
    // day's intake would leave the same label over a different measure.
    expect(ctx.component.shownFingerlings()).toBe(900);
  });

  it('says there is no record rather than reporting an empty farm', async () => {
    const ctx = await loaded();

    const longAgo = new Date();
    longAgo.setFullYear(longAgo.getFullYear() - 5);
    ctx.component.selectDate(longAgo);
    ctx.httpMock.expectOne(environment.graphqlUrl).flush(
      dayResponse(ctx.component.selectedDate(), {
        unitsExisting: 0,
        unitsActive: 0,
        unitsIdle: 0,
        totalVolumeM3: 0,
        cyclesRunning: 0,
        fingerlingsRunning: 0,
        members: 0,
        historyComplete: false,
      }),
    );
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();

    expect(ctx.component.dayViewState()).toBe('noHistory');
    const text = (ctx.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Hakuna rekodi ya tarehe hii');
  });

  it('returns to the live numbers, and to this week, on "back to today"', async () => {
    const ctx = await loaded();

    const past = new Date();
    past.setDate(past.getDate() - 10);
    ctx.component.selectDate(past);
    ctx.httpMock.expectOne(environment.graphqlUrl).flush(dayResponse(ctx.component.selectedDate()));
    await ctx.fixture.whenStable();

    ctx.component.backToToday();
    ctx.fixture.detectChanges();

    expect(ctx.component.viewingToday()).toBe(true);
    expect(ctx.component.shownTotalUnits()).toBe(2);
    expect(ctx.component.weekDates().some((d) => ctx.component.isToday(d))).toBe(true);
    ctx.httpMock.verify();
  });

  it('pages the strip without changing the numbers', async () => {
    const ctx = await loaded();
    const before = ctx.component.selectedDate();

    ctx.component.shiftWeek(-1);
    ctx.fixture.detectChanges();

    // Looking for a date is not choosing one: nothing was fetched and the
    // screen still shows today.
    expect(ctx.component.selectedDate()).toBe(before);
    expect(ctx.component.weekDates().some((d) => ctx.component.isToday(d))).toBe(false);
    ctx.httpMock.verify();
  });

  describe('Active Cycles table follows the selected date', () => {
    const rows = (ctx: { fixture: { nativeElement: HTMLElement } }) =>
      Array.from(
        ctx.fixture.nativeElement.querySelectorAll<HTMLElement>('[data-testid="cycle-row"]'),
      );
    const tableText = (ctx: { fixture: { nativeElement: HTMLElement } }) =>
      ctx.fixture.nativeElement.querySelector('.table-card')?.textContent ?? '';

    function pastDate(daysAgo: number): Date {
      const past = new Date();
      past.setDate(past.getDate() - daysAgo);
      return past;
    }

    it("lists today's running cycles on today", async () => {
      const ctx = await loaded();

      expect(rows(ctx).map((r) => r.textContent)).toEqual([expect.stringContaining('LIVE-T1')]);
    });

    it("lists the cycles that were running on a past date - never today's", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          cyclesRunning: 2,
          cycles: [cycleRow('7', 'OLD-A'), cycleRow('8', 'OLD-B', 'HARVESTED')],
        }),
      );
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(rows(ctx)).toHaveLength(2);
      expect(tableText(ctx)).toContain('OLD-A');
      expect(tableText(ctx)).toContain('OLD-B');
      expect(tableText(ctx)).not.toContain('LIVE-T1');
      // Tile and table are one answer.
      expect(ctx.component.shownCyclesRunning()).toBe(rows(ctx).length);
    });

    it('offers no "Ona zote" when every cycle already fits the phone preview', async () => {
      const ctx = await loaded();

      expect(rows(ctx)).toHaveLength(1);
      expect(ctx.fixture.nativeElement.querySelector('[data-testid="cycles-toggle"]')).toBeNull();
    });

    it('holds rows past the first three for "Ona zote", counts them, and opens them in place', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          cyclesRunning: 5,
          cycles: ['A', 'B', 'C', 'D', 'E'].map((code, i) => cycleRow(String(i), `OLD-${code}`)),
        }),
      );
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // Every row is in the DOM - the phone hides the extras with CSS - so
      // the count on the button and the rows behind it are one list.
      expect(rows(ctx)).toHaveLength(5);
      expect(rows(ctx).map((r) => r.classList.contains('cycle-row--extra'))).toEqual([
        false,
        false,
        false,
        true,
        true,
      ]);

      const element = ctx.fixture.nativeElement as HTMLElement;
      const toggle = element.querySelector<HTMLButtonElement>('[data-testid="cycles-toggle"]')!;
      const card = element.querySelector('.table-card')!;
      expect(toggle.textContent?.trim()).toBe('Ona zote (5) ›');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(card.classList.contains('table-card--expanded')).toBe(false);

      toggle.click();
      ctx.fixture.detectChanges();

      expect(card.classList.contains('table-card--expanded')).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.textContent?.trim()).toBe('Onyesha chache');
    });

    it('shows a since-harvested cycle as Active on a date it was running', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          cyclesRunning: 1,
          cycles: [cycleRow('8', 'OLD-B', 'HARVESTED')],
        }),
      );
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      const pill = rows(ctx)[0].querySelector('.pill');
      expect(pill?.classList.contains('pill--active')).toBe(true);
      expect(pill?.textContent?.trim()).toBe(ctx.component.t().statusActive);
    });

    it("shows the empty message on a past date with no cycles, not today's rows", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate(), { cyclesRunning: 0, cycles: [] }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(rows(ctx)).toHaveLength(0);
      expect(
        ctx.fixture.nativeElement.querySelector('[data-testid="cycles-empty"]'),
      ).not.toBeNull();
      expect(tableText(ctx)).not.toContain('LIVE-T1');
    });

    it('shows no rows while a past date is loading', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.fixture.detectChanges();

      expect(ctx.component.dayLoading()).toBe(true);
      expect(rows(ctx)).toHaveLength(0);
      expect(
        ctx.fixture.nativeElement.querySelector('[data-testid="cycles-loading"]'),
      ).not.toBeNull();
      expect(tableText(ctx)).not.toContain('LIVE-T1');
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
    });

    it("does not show the previous date's rows while the next date loads", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          cyclesRunning: 1,
          cycles: [cycleRow('7', 'OLD-A')],
        }),
      );
      await ctx.fixture.whenStable();

      ctx.component.selectDate(pastDate(5));
      ctx.fixture.detectChanges();

      expect(rows(ctx)).toHaveLength(0);
      expect(tableText(ctx)).not.toContain('OLD-A');
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
    });

    it('shows no rows after a past date fails to load', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(2));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush({
          errors: [{ message: 'nope', extensions: { errorCode: 'FORBIDDEN' } }],
          data: null,
        });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(rows(ctx)).toHaveLength(0);
      expect(
        ctx.fixture.nativeElement.querySelector('[data-testid="cycles-failed"]'),
      ).not.toBeNull();
      expect(tableText(ctx)).not.toContain('LIVE-T1');
    });

    it('says there is no record in the table for a date before our records', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(2000));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate(), { historyComplete: false }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(rows(ctx)).toHaveLength(0);
      expect(
        ctx.fixture.nativeElement.querySelector('[data-testid="cycles-no-history"]'),
      ).not.toBeNull();
      expect(tableText(ctx)).not.toContain('LIVE-T1');
    });

    it('goes back to today\'s rows on "back to today"', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
      await ctx.fixture.whenStable();

      ctx.component.backToToday();
      ctx.fixture.detectChanges();

      expect(tableText(ctx)).toContain('LIVE-T1');
    });
  });

  describe('Units by Type chart follows the selected date', () => {
    type Ctx = { fixture: { nativeElement: HTMLElement } };
    const bars = (ctx: Ctx) =>
      Array.from(ctx.fixture.nativeElement.querySelectorAll<HTMLElement>('.type-list__row')).map(
        (row) => ({
          count: row.querySelector('.type-list__count')?.textContent?.trim(),
          width: row.querySelector<HTMLElement>('.type-list__fill')?.style.width,
          zero: row.classList.contains('type-list__row--zero'),
        }),
      );
    const has = (ctx: Ctx, testId: string) =>
      ctx.fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) !== null;

    function pastDate(daysAgo: number): Date {
      const past = new Date();
      past.setDate(past.getDate() - daysAgo);
      return past;
    }

    // Live fixture: two TANKs, nothing else - TANK 2 (100%), the ponds 0.
    const LIVE_BARS = [
      { count: '2', width: '100%', zero: false },
      { count: '0', width: '0%', zero: true },
      { count: '0', width: '0%', zero: true },
    ];

    it("draws today's live counts on today", async () => {
      const ctx = await loaded();

      expect(bars(ctx)).toEqual(LIVE_BARS);
    });

    it("draws the selected date's counts, against THAT date's max, filling omitted types with 0", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      // No TANK row: the backend leaves out a type with no unit that day.
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          unitsByType: [
            { type: 'POND_LINED', count: 1 },
            { type: 'POND_EARTHEN', count: 4 },
          ],
        }),
      );
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // Always three rows in UNIT_TYPES order; 4 is the max that day, so
      // POND_LINED is 25% - not measured against today's TANK count.
      expect(bars(ctx)).toEqual([
        { count: '0', width: '0%', zero: true },
        { count: '4', width: '100%', zero: false },
        { count: '1', width: '25%', zero: false },
      ]);
    });

    it('draws three muted 0 rows on a date with records but no units', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate(), { unitsExisting: 0, unitsByType: [] }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(bars(ctx)).toEqual([
        { count: '0', width: '0%', zero: true },
        { count: '0', width: '0%', zero: true },
        { count: '0', width: '0%', zero: true },
      ]);
    });

    it('draws no bars while a past date is loading', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.fixture.detectChanges();

      expect(bars(ctx)).toEqual([]);
      expect(has(ctx, 'types-loading')).toBe(true);
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
    });

    it("does not keep the previous date's bars while the next date loads", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          unitsByType: [{ type: 'POND_EARTHEN', count: 4 }],
        }),
      );
      await ctx.fixture.whenStable();

      ctx.component.selectDate(pastDate(5));
      ctx.fixture.detectChanges();

      expect(bars(ctx)).toEqual([]);
      expect(has(ctx, 'types-loading')).toBe(true);
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
    });

    it('draws no bars after a past date fails to load', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(2));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush({
          errors: [{ message: 'nope', extensions: { errorCode: 'FORBIDDEN' } }],
          data: null,
        });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(bars(ctx)).toEqual([]);
      expect(has(ctx, 'types-failed')).toBe(true);
    });

    it('draws no bars for a date before our records', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(2000));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate(), { historyComplete: false }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(bars(ctx)).toEqual([]);
      expect(has(ctx, 'types-no-history')).toBe(true);
    });

    it('asks the backend for unitsByType on a past date', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      const request = ctx.httpMock.expectOne(environment.graphqlUrl);
      expect(request.request.body.query).toMatch(/unitsByType\s*\{\s*type\s+count\s*\}/);
      request.flush(dayResponse(ctx.component.selectedDate()));
    });

    it('goes back to today\'s bars on "back to today"', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          unitsByType: [{ type: 'POND_LINED', count: 3 }],
        }),
      );
      await ctx.fixture.whenStable();

      ctx.component.backToToday();
      ctx.fixture.detectChanges();

      expect(bars(ctx)).toEqual(LIVE_BARS);
    });
  });

  /*
   * Tiles, summary, ring and status bars - the eight `shown*` values that were
   * still written `day()?.x ?? live`.
   *
   * That fallback reads as "the dated number, or the live one", but `day()` is
   * ALSO empty while a date loads and after one fails, so it quietly answered
   * with the wrong day: the previous date's numbers mid-load, today's after a
   * failure. The table and the chart were fixed by keying on dayViewState;
   * these assert the same of every single-number slot, which cannot say
   * "Loading this date…" and so shows a skeleton or a dash instead.
   */
  describe('Tiles, summary and Units by Status follow the selected date', () => {
    type Ctx = { fixture: { nativeElement: HTMLElement } };

    /** A number slot: what it reads, and which of the three shapes it is in. */
    const slot = (ctx: Ctx, testId: string) => {
      const el = ctx.fixture.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      return {
        text: (el?.textContent ?? '').trim(),
        loading: el?.querySelector('.day-skeleton') !== null,
        blank: el?.querySelector('.day-blank') !== null,
      };
    };

    const TILES = [
      'tile-total-units',
      'tile-active-units',
      'tile-cycles-running',
      'tile-fingerlings',
    ];
    const SUMMARY = ['side-total-units', 'side-active-units', 'side-volume'];

    const statusBars = (ctx: Ctx) =>
      Array.from(
        ctx.fixture.nativeElement.querySelectorAll<HTMLElement>(
          '[data-testid="units-by-status"] .mini-bars__row',
        ),
      ).map((row) => ({
        count: row.querySelector('.mini-bars__count')?.textContent?.trim(),
        width: row.querySelector<HTMLElement>('.mini-bars__fill')?.style.width,
      }));

    function pastDate(daysAgo: number): Date {
      const past = new Date();
      past.setDate(past.getDate() - daysAgo);
      return past;
    }

    const GRAPHQL_FAILURE = {
      errors: [{ message: 'nope', extensions: { errorCode: 'FORBIDDEN' } }],
      data: null,
    };

    // The live fixture: 2 units, 1 ACTIVE / 1 IDLE, one running cycle of 500.
    const LIVE_TILES = ['2', '1', '1', '500'];
    const LIVE_BARS = [
      { count: '1', width: '100%' },
      { count: '1', width: '100%' },
      { count: '0', width: '0%' },
    ];
    const BLANK_BARS = [
      { count: '—', width: '0%' },
      { count: '—', width: '0%' },
      { count: '—', width: '0%' },
    ];

    it("shows today's live numbers on today", async () => {
      const ctx = await loaded();

      expect(TILES.map((id) => slot(ctx, id).text)).toEqual(LIVE_TILES);
      expect(SUMMARY.map((id) => slot(ctx, id).text)).toEqual(['2', '1', '15']);
      expect(slot(ctx, 'ring-value').text).toBe('50%');
      expect(statusBars(ctx)).toEqual(LIVE_BARS);
    });

    it('switches every slot to the chosen date', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate(), { cyclesRunning: 4 }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // 7 existing, 4 active, 4 running, 900 stocked - none of them the live 2.
      expect(TILES.map((id) => slot(ctx, id).text)).toEqual(['7', '4', '4', '900']);
      expect(SUMMARY.map((id) => slot(ctx, id).text)).toEqual(['7', '4', '70']);
      expect(slot(ctx, 'ring-value').text).toBe('57%');
      expect(statusBars(ctx)).toEqual([
        { count: '4', width: '100%' },
        { count: '3', width: '75%' },
        { count: '0', width: '0%' },
      ]);
    });

    it("shows a skeleton, not the previous date's numbers, while the next date loads", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate(), { unitsExisting: 7 }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      ctx.component.selectDate(pastDate(5));
      ctx.fixture.detectChanges();

      for (const id of [...TILES, ...SUMMARY, 'ring-value']) {
        expect(slot(ctx, id)).toEqual({ text: '', loading: true, blank: false });
      }
      // The gauge empties too - a 57% arc is a claim about the old date.
      const ring = (ctx.fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ring');
      expect(ring?.style.getPropertyValue('--percent')).toBe('0');
      expect(statusBars(ctx)).toEqual(BLANK_BARS);

      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
    });

    it("shows a dash, not today's numbers, after a past date fails", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(2));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(GRAPHQL_FAILURE);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      for (const id of [...TILES, ...SUMMARY, 'ring-value']) {
        expect(slot(ctx, id)).toEqual({ text: '—', loading: false, blank: true });
      }
      expect(statusBars(ctx)).toEqual(BLANK_BARS);
    });

    it('shows a dash rather than zeros for a date before our records', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(2000));
      ctx.httpMock.expectOne(environment.graphqlUrl).flush(
        dayResponse(ctx.component.selectedDate(), {
          unitsExisting: 0,
          unitsActive: 0,
          unitsIdle: 0,
          totalVolumeM3: 0,
          historyComplete: false,
        }),
      );
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // A zero here would claim the farm was empty. We simply have no record.
      for (const id of [...TILES, ...SUMMARY, 'ring-value']) {
        expect(slot(ctx, id)).toEqual({ text: '—', loading: false, blank: true });
      }
      expect(statusBars(ctx)).toEqual(BLANK_BARS);
    });

    it("ignores a stale answer: A's response landing after B's leaves B on screen", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      const dateA = ctx.component.selectedDate();
      ctx.component.selectDate(pastDate(5));
      const dateB = ctx.component.selectedDate();

      const pending = ctx.httpMock.match(environment.graphqlUrl);
      expect(pending.length).toBe(2);

      // B answers first...
      pending[1].flush(dayResponse(dateB, { unitsExisting: 55 }));
      await ctx.fixture.whenStable();
      // ...then A's slower answer arrives for a date nobody is looking at.
      pending[0].flush(dayResponse(dateA, { unitsExisting: 99 }));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(ctx.component.selectedDate()).toBe(dateB);
      expect(slot(ctx, 'tile-total-units').text).toBe('55');
    });

    it("ignores a stale FAILURE: A's error does not blank out the date that loaded", async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.component.selectDate(pastDate(5));
      const dateB = ctx.component.selectedDate();

      const pending = ctx.httpMock.match(environment.graphqlUrl);
      pending[1].flush(dayResponse(dateB, { unitsExisting: 55 }));
      await ctx.fixture.whenStable();
      pending[0].flush(GRAPHQL_FAILURE);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(ctx.component.dayError()).toBeNull();
      expect(slot(ctx, 'tile-total-units').text).toBe('55');
    });

    it('restores the live numbers on "back to today"', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      ctx.component.backToToday();
      ctx.fixture.detectChanges();

      expect(TILES.map((id) => slot(ctx, id).text)).toEqual(LIVE_TILES);
      expect(SUMMARY.map((id) => slot(ctx, id).text)).toEqual(['2', '1', '15']);
      expect(slot(ctx, 'ring-value').text).toBe('50%');
      expect(statusBars(ctx)).toEqual(LIVE_BARS);
    });

    it('keeps the strip line agreeing with the cards it explains', async () => {
      const ctx = await loaded();

      ctx.component.selectDate(pastDate(3));
      ctx.fixture.detectChanges();

      // Mid-load the line must not read "Showing <date>" over skeletons.
      const line = () =>
        ctx.fixture.nativeElement.querySelector('.mini-cal__state')?.textContent ?? '';
      expect(line()).toContain('Inapakia tarehe hii');
      expect(slot(ctx, 'tile-total-units').loading).toBe(true);

      ctx.httpMock
        .expectOne(environment.graphqlUrl)
        .flush(dayResponse(ctx.component.selectedDate()));
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(line()).toContain('Unaona tarehe');
      expect(slot(ctx, 'tile-total-units').text).toBe('7');
    });
  });

  it('keeps the date selected when its fetch fails', async () => {
    const ctx = await loaded();

    const past = new Date();
    past.setDate(past.getDate() - 2);
    ctx.component.selectDate(past);
    const chosen = ctx.component.selectedDate();
    ctx.httpMock
      .expectOne(environment.graphqlUrl)
      .flush({ errors: [{ message: 'nope', extensions: { errorCode: 'FORBIDDEN' } }], data: null });
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();

    // Dropping back to today would leave the strip highlighting a day the
    // numbers on screen are not about.
    expect(ctx.component.selectedDate()).toBe(chosen);
    expect(ctx.component.dayError()).not.toBeNull();
    expect(ctx.component.day()).toBeNull();
  });
});

describe('Dashboard "Leo" card', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function task(
    taskId: string,
    scheduledTime: string,
    extra: Partial<DailyTaskStatus> = {},
  ): DailyTaskStatus {
    return {
      taskId,
      cycleId: 1,
      unitCode: 'P1',
      speciesName: 'Sato',
      taskType: 'Kulisha',
      scheduledTime,
      frequency: 'DAILY',
      assignedRoleName: null,
      date: '2026-09-19',
      status: 'OUTSTANDING',
      done: false,
      completedAt: null,
      completedByName: null,
      notes: null,
      taskKind: 'FEEDING',
      feedingLogId: null,
      closureReason: null,
      closureNote: null,
      ...extra,
    };
  }

  const EMPTY_DASHBOARD = { data: { productionUnits: [], cycles: [] } };

  async function open(todayTasks: Observable<DailyTaskStatus[]>, nowTime = '12:00') {
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard']));
    const ctx = setup(todayTasks);
    ctx.fixture.detectChanges();
    ctx.httpMock.expectOne(environment.graphqlUrl).flush(EMPTY_DASHBOARD);
    await ctx.fixture.whenStable();
    ctx.component.todayNowTime.set(nowTime);
    ctx.fixture.detectChanges();
    const element = ctx.fixture.nativeElement as HTMLElement;
    const card = element.querySelector('[data-testid="today-card"]');
    const text = (selector: string) =>
      (card?.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { ...ctx, element, card, text };
  }

  it('asks for the farm\'s today, and counts done, closed and overdue apart', async () => {
    const ctx = await open(
      of([
        task('1', '07:00', { done: true, status: 'DONE' }),
        task('2', '08:00'), // outstanding, before 12:00: overdue
        task('3', '17:00'), // outstanding, still ahead: next
        task('4', '09:00', { status: 'CLOSED_NO_RECORD' }),
      ]),
    );

    expect(ctx.farmTasks).toHaveBeenCalledTimes(1);
    expect(ctx.farmTasks.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Done only is progress; closed is its own number.
    expect(ctx.text('[data-testid="today-count"]')).toBe('1 / 4');
    expect(ctx.text('[data-testid="today-meta"]')).toBe(
      '1 zimefanyika · 1 zimefungwa · 1 muda umepita',
    );
    expect(ctx.component.todayPercent()).toBe(25);
  });

  it('names the same next task Daily Tasks would: the earliest still ahead', async () => {
    const ctx = await open(
      of([task('2', '08:00'), task('3', '17:00'), task('5', '14:00', { unitCode: 'T2' })]),
    );

    expect(ctx.text('[data-testid="today-next"] strong')).toBe('Kulisha · 14:00');
    expect(ctx.text('.today-card__next-where')).toBe('Kitengo T2 · Sato');
  });

  it('falls back to the earliest late one once nothing is ahead', async () => {
    const ctx = await open(of([task('2', '08:00'), task('3', '10:00')]), '20:00');

    expect(ctx.text('[data-testid="today-next"]')).toContain('Kulisha · 08:00');
  });

  it('says so when every task has been dealt with', async () => {
    const ctx = await open(
      of([
        task('1', '07:00', { done: true, status: 'DONE' }),
        task('4', '09:00', { status: 'CLOSED_NO_RECORD' }),
      ]),
    );

    expect(ctx.card?.querySelector('[data-testid="today-next"]')).toBeNull();
    expect(ctx.card?.textContent).toContain('Kazi zote za leo zimeshughulikiwa.');
  });

  it('says there is nothing today, with no count, on an empty day', async () => {
    const ctx = await open(of([]));

    expect(ctx.card?.textContent).toContain('Hakuna kazi zilizopangwa leo.');
    expect(ctx.card?.querySelector('[data-testid="today-count"]')).toBeNull();
  });

  it('opens Daily Tasks', async () => {
    const ctx = await open(of([task('3', '17:00')]));

    expect(ctx.card?.querySelector('a.today-card__open')?.getAttribute('href')).toBe(
      '/daily-tasks',
    );
  });

  it('is simply absent when its own request fails - the dashboard carries on', async () => {
    const ctx = await open(throwError(() => new Error('refused')));

    expect(ctx.card).toBeNull();
    expect(ctx.element.querySelector('.stat-grid')).not.toBeNull();
  });
});
