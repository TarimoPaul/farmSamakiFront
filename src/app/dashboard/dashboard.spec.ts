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
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Dashboard);
  return {
    router: { navigateByUrl },
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
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
            type: 'POND',
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
            type: 'POND',
            sizeM3: 10,
            waterSource: null,
            status: 'IDLE',
          },
        ],
        cycles: [],
      },
    });
    await fixture.whenStable();

    expect(component.error()).toBeNull();
    expect(component.errorMessage()).toBeNull();
    expect(component.totalUnits()).toBe(1);
    expect(component.loading()).toBe(false);
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

  const DASHBOARD_DATA = {
    data: {
      productionUnits: [
        { unitId: '1', code: 'T1', type: 'TANK', sizeM3: 10, waterSource: null, status: 'ACTIVE' },
        { unitId: '2', code: 'T2', type: 'TANK', sizeM3: 5, waterSource: null, status: 'IDLE' },
      ],
      cycles: [],
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
          cyclesRunning: 4,
          cyclesStarted: 0,
          cyclesClosed: 0,
          fingerlingsRunning: 900,
          fingerlingsStocked: 0,
          members: 6,
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
    request.flush(dayResponse(ctx.component.selectedDate()));
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

    expect(ctx.component.dayHasHistory()).toBe(false);
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
