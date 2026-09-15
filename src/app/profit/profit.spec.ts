import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpRequest, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  GuardResult,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { Profit } from './profit';
import { PROFIT_I18N } from './profit.i18n';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Shapes as `schema.graphqls` defines them: ids are `ID!` (strings), money is
 * `Float`, and `revenue` / `cycleNetProfit` are NULLABLE - null for a running
 * cycle. Every total is the backend's; the fixtures are internally consistent
 * only so the screen's figures are recognisable.
 */
const MBEYA = { farmId: '1', name: 'Shamba la Mbeya' };
const IRINGA = { farmId: '2', name: 'Shamba la Iringa' };

const T2 = {
  cycleId: '8',
  label: 'T2 - Kambale (HARVESTED)',
  status: 'HARVESTED',
  actualHarvestDate: '2026-06-30',
  revenue: 2500000,
  revenueRecorded: true,
  fingerlingCost: 300000,
  fingerlingCostRecorded: true,
  cycleOperationalCost: 45000.25,
  cycleNetProfit: 2154999.75,
};
/** Closed with neither revenue nor fingerling cost recorded - both counted as 0. */
const T3 = {
  cycleId: '9',
  label: 'T3 - Sato (FAILED)',
  status: 'FAILED',
  actualHarvestDate: '2026-07-15',
  revenue: 0,
  revenueRecorded: false,
  fingerlingCost: 0,
  fingerlingCostRecorded: false,
  cycleOperationalCost: 20000,
  cycleNetProfit: -20000,
};
const ACTIVE_CYCLE = {
  cycleId: '7',
  label: 'T1 - Sato (ACTIVE)',
  status: 'ACTIVE',
  actualHarvestDate: null,
  revenue: null,
  revenueRecorded: false,
  fingerlingCost: 150000,
  fingerlingCostRecorded: true,
  cycleOperationalCost: 10000,
  cycleNetProfit: null,
};

const REPORT = {
  farmId: '1',
  farmName: 'Shamba la Mbeya',
  fromDate: '2026-01-01',
  toDate: '2026-09-14',
  farmRevenue: 2500000,
  fingerlingCost: 300000,
  cycleOperationalCost: 65000.25,
  cycleOperationalCostByCategory: [{ costCategoryId: '7', name: 'Dawa', amount: 65000.25 }],
  cycleCosts: 365000.25,
  feedCost: 800000,
  reversedFeedPurchasesExcluded: 2,
  farmOperationalCost: 230000,
  farmOperationalCostByCategory: [
    { costCategoryId: '5', name: 'Umeme', amount: 150000 },
    { costCategoryId: '9', name: 'Chakula', amount: 80000 },
  ],
  farmCosts: 1395000.25,
  farmNetProfit: 1104999.75,
  cycleCount: 2,
  incompleteCycleCount: 1,
  cycles: [T2, T3],
  capitalTotal: 4200000,
};

const LOSS_REPORT = {
  ...REPORT,
  farmRevenue: 100000,
  farmNetProfit: -1295000.25,
  incompleteCycleCount: 0,
  reversedFeedPurchasesExcluded: 0,
  cycles: [T2],
};

const MY_FARMS = { data: { myFarms: [MBEYA, IRINGA] } };
const farmReport = (report: object) => ({ data: { farmProfitability: report } });
const cycleReport = (cycle: object) => ({ data: { cycleProfitability: cycle } });
const FARM_CYCLES = {
  data: {
    farmCycles: [
      { cycleId: '7', label: 'T1 - Sato (ACTIVE)', status: 'ACTIVE' },
      { cycleId: '8', label: 'T2 - Kambale (HARVESTED)', status: 'HARVESTED' },
    ],
  },
};

/** ProfitabilityService's own refusal: IllegalArgumentException -> VALIDATION_ERROR. */
const RANGE_REFUSAL = {
  data: null,
  errors: [
    {
      message:
        'Tarehe ya mwanzo (2026-09-01) haiwezi kuwa baada ya tarehe ya mwisho (2026-08-01).',
      path: ['farmProfitability'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

/** OWNER / FARM_MANAGER: finance and the cost register. */
const MANAGER = ['view_dashboard', 'view_finance', 'manage_costs'];
/** view_finance alone - no `farmCycles`, so no picker. */
const FINANCE_ONLY = ['view_dashboard', 'view_finance'];

function setup(permissions: string[], options: { lang?: Lang } = {}) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: 'u-1',
      name: 'Mmiliki',
      phone: '0700000001',
      status: 'ACTIVE',
      farmId: 1,
      role: 'OWNER',
    }),
  );

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

  const fixture = TestBed.createComponent(Profit);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

const isOp = (operation: string) => (req: HttpRequest<unknown>) =>
  req.url === environment.graphqlUrl &&
  String((req.body as { query: string }).query).includes(operation);

const gql = (httpMock: HttpTestingController, operation: string) =>
  httpMock.expectOne(isOp(operation));

const variables = (req: { request: { body: unknown } }) =>
  (req.request.body as { variables: Record<string, unknown> }).variables;

const el = (fixture: ComponentFixture<Profit>) => fixture.nativeElement as HTMLElement;

const byId = (fixture: ComponentFixture<Profit>, id: string, root?: Element) => [
  ...(root ?? el(fixture)).querySelectorAll(`[data-testid="${id}"]`),
];

const one = (fixture: ComponentFixture<Profit>, id: string) => {
  const found = byId(fixture, id);
  if (found.length !== 1) {
    throw new Error(`expected one [data-testid="${id}"], found ${found.length}`);
  }
  return found[0];
};

const squash = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ');

const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function settle(fixture: ComponentFixture<Profit>) {
  await fixture.whenStable();
  fixture.detectChanges();
}

/**
 * Opens the screen: `myFarms`, then the preselected farm (the caller's farm 1)
 * runs the report once, and - for a manage_costs holder - reads its cycles.
 */
async function load(
  fixture: ComponentFixture<Profit>,
  httpMock: HttpTestingController,
  opts: { report?: object } = {},
) {
  fixture.detectChanges();
  gql(httpMock, 'query MyFarms').flush(MY_FARMS);
  const reportReq = gql(httpMock, 'query FarmProfitability');
  reportReq.flush(farmReport(opts.report ?? REPORT));
  for (const req of httpMock.match(isOp('query FarmCycles'))) {
    req.flush(FARM_CYCLES);
  }
  await settle(fixture);
  return reportReq;
}

describe('Profit', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the farm report', () => {
    it('asks for the preselected farm over this year, with Int id and ISO dates', async () => {
      const { fixture, component, httpMock } = setup(MANAGER);
      const req = await load(fixture, httpMock);

      expect(variables(req)).toEqual({
        farmId: 1,
        fromDate: `${component.today.slice(0, 4)}-01-01`,
        toDate: component.today,
      });
      httpMock.verify();
    });

    it('renders revenue, total costs and net profit in the headline', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      expect(squash(one(fixture, 'head-revenue'))).toContain(money(2500000));
      expect(squash(one(fixture, 'head-costs'))).toContain(money(1395000.25));
      const net = one(fixture, 'net-profit');
      expect(squash(net)).toContain(money(1104999.75));
      expect(net.getAttribute('data-loss')).toBe('false');
      expect(squash(one(fixture, 'net-kind'))).toContain(PROFIT_I18N.sw.netProfit);
      httpMock.verify();
    });

    it('breaks costs down by SOURCE - cycle, feed and farm operational on separate lines', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      const sw = PROFIT_I18N.sw;
      expect(squash(one(fixture, 'src-cycle-costs'))).toContain(sw.srcCycleCosts);
      expect(squash(one(fixture, 'src-cycle-costs'))).toContain(money(365000.25));
      expect(squash(one(fixture, 'src-fingerling'))).toContain(money(300000));
      expect(squash(one(fixture, 'src-cycle-operational'))).toContain(money(65000.25));
      expect(squash(one(fixture, 'src-feed'))).toContain(sw.srcFeed);
      expect(squash(one(fixture, 'src-feed'))).toContain(money(800000));
      expect(squash(one(fixture, 'src-farm-operational'))).toContain(money(230000));
      expect(squash(one(fixture, 'src-total'))).toContain(money(1395000.25));
      httpMock.verify();
    });

    it('lists whole-farm categories, so a "Chakula" line sits next to the feed line', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      const farmCategories = byId(fixture, 'farm-category').map(squash);
      expect(farmCategories.length).toBe(2);
      expect(farmCategories[0]).toContain('Umeme');
      expect(farmCategories[0]).toContain(money(150000));
      expect(farmCategories[1]).toContain('Chakula');
      expect(farmCategories[1]).toContain(money(80000));

      // Chakula and the feed-purchase line are both on screen, neither merged in.
      const breakdown = el(fixture).querySelector('[data-panel="breakdown"]');
      expect(squash(breakdown)).toContain(PROFIT_I18N.sw.srcFeed);
      expect(byId(fixture, 'cycle-category').map(squash)[0]).toContain('Dawa');
      httpMock.verify();
    });

    it('shows capitalTotal in its own card, outside the headline and the cost breakdown', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      const capital = one(fixture, 'capital');
      expect(squash(capital)).toContain(PROFIT_I18N.sw.capitalTitle);
      expect(squash(capital)).toContain(money(4200000));

      const headline = el(fixture).querySelector('[data-panel="headline"]');
      const breakdown = el(fixture).querySelector('[data-panel="breakdown"]');
      expect(squash(headline)).not.toContain(money(4200000));
      expect(squash(breakdown)).not.toContain(money(4200000));
      expect(capital.closest('[data-panel="breakdown"]')).toBeNull();
      httpMock.verify();
    });

    it('warns about incomplete cycles, and notes excluded reversed purchases', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      expect(squash(one(fixture, 'incomplete-notice'))).toContain(
        PROFIT_I18N.sw.incompleteNotice(1),
      );
      expect(squash(one(fixture, 'reversed-note'))).toContain(PROFIT_I18N.sw.reversedNote(2));
      httpMock.verify();
    });

    it('shows neither notice when both counts are zero', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock, { report: LOSS_REPORT });

      expect(byId(fixture, 'incomplete-notice').length).toBe(0);
      expect(byId(fixture, 'reversed-note').length).toBe(0);
      httpMock.verify();
    });

    it('shows a negative net profit as a LOSS, minus sign and all', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock, { report: LOSS_REPORT });

      const net = one(fixture, 'net-profit');
      expect(net.getAttribute('data-loss')).toBe('true');
      expect(net.classList).toContain('stat--loss');
      expect(squash(one(fixture, 'net-kind'))).toContain(PROFIT_I18N.sw.netLoss);
      expect(squash(net)).toContain(money(-1295000.25));
      expect(squash(net)).toContain('-');
      httpMock.verify();
    });

    it('renders a real zero as 0.00, not a dash or a blank', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock, { report: { ...REPORT, farmRevenue: 0 } });

      expect(squash(one(fixture, 'head-revenue'))).toContain(money(0));
      httpMock.verify();
    });
  });

  describe('the per-cycle breakdown', () => {
    it('has a row per cycle with revenue, costs and net - flagged where data is missing', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      const rows = byId(fixture, 'cycle-row');
      expect(rows.length).toBe(2);

      const [t2, t3] = rows;
      expect(squash(t2)).toContain('T2 - Kambale (HARVESTED)');
      expect(squash(t2)).toContain(money(2500000));
      expect(squash(t2)).toContain(money(300000));
      expect(squash(t2)).toContain(money(45000.25));
      expect(squash(t2)).toContain(money(2154999.75));
      expect(byId(fixture, 'flag-revenue', t2).length).toBe(0);
      expect(byId(fixture, 'flag-fingerling', t2).length).toBe(0);

      expect(byId(fixture, 'flag-revenue', t3).length).toBe(1);
      expect(byId(fixture, 'flag-fingerling', t3).length).toBe(1);
      expect(byId(fixture, 'flag-revenue', t3)[0].getAttribute('aria-label')).toBe(
        PROFIT_I18N.sw.flagRevenueMissing,
      );
      // A cycle's own loss is coloured as one too.
      expect(byId(fixture, 'cycle-row-net', t3)[0].classList).toContain('money--loss');
      httpMock.verify();
    });

    it('labels the per-cycle profit column as before feed', async () => {
      const { fixture, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      const table = el(fixture).querySelector('[data-panel="cycles"] thead');
      expect(squash(table)).toContain(PROFIT_I18N.sw.colNet);
      httpMock.verify();
    });
  });

  describe('date-range validation', () => {
    it('refuses fromDate after toDate before any request', async () => {
      const { fixture, component, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      component.form.patchValue({ fromDate: '2026-09-01', toDate: '2026-08-01' });
      component.runReport();
      await settle(fixture);

      expect(component.fromError()).toBe(PROFIT_I18N.sw.errorDateRange);
      expect(squash(el(fixture))).toContain(PROFIT_I18N.sw.errorDateRange);
      httpMock.expectNone(isOp('query FarmProfitability'));
      httpMock.verify();
    });

    it("surfaces the backend's VALIDATION_ERROR sentence when it refuses the range", async () => {
      const { fixture, component, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      component.form.patchValue({ fromDate: '2026-08-01', toDate: '2026-08-31' });
      component.runReport();
      gql(httpMock, 'query FarmProfitability').flush(RANGE_REFUSAL);
      await settle(fixture);

      expect(squash(one(fixture, 'report-error'))).toContain(
        'haiwezi kuwa baada ya tarehe ya mwisho',
      );
      expect(byId(fixture, 'net-profit').length).toBe(0);
      httpMock.verify();
    });

    it('answers FORBIDDEN with the shared copy', async () => {
      const { fixture, component, httpMock } = setup(MANAGER, { lang: 'en' });
      await load(fixture, httpMock);

      component.runReport();
      gql(httpMock, 'query FarmProfitability').flush({
        data: null,
        errors: [{ message: 'Huna ruhusa', extensions: { errorCode: 'FORBIDDEN' } }],
      });
      await settle(fixture);

      expect(squash(one(fixture, 'report-error'))).toContain(
        'You do not have permission to view this.',
      );
      httpMock.verify();
    });
  });

  describe('one cycle', () => {
    it('labels a closed cycle\'s profit "before feed", not as the farm\'s profit', async () => {
      const { fixture, component, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      component.viewCycle('8');
      const req = gql(httpMock, 'query CycleProfitability');
      expect(variables(req)).toEqual({ cycleId: 8 });
      req.flush(cycleReport(T2));
      await settle(fixture);

      const net = one(fixture, 'cycle-net');
      expect(squash(net)).toContain(PROFIT_I18N.sw.cycleBeforeFeedLabel);
      expect(squash(net)).toContain(money(2154999.75));
      expect(squash(one(fixture, 'cycle-revenue'))).toContain(money(2500000));
      expect(squash(one(fixture, 'cycle-fingerling'))).toContain(money(300000));
      expect(squash(one(fixture, 'cycle-operational'))).toContain(money(45000.25));
      expect(squash(one(fixture, 'cycle-before-feed-note'))).toContain(
        PROFIT_I18N.sw.cycleBeforeFeedNote,
      );
      httpMock.verify();
    });

    it('uses the English "before feed" label too', async () => {
      const { fixture, component, httpMock } = setup(MANAGER, { lang: 'en' });
      await load(fixture, httpMock);

      component.viewCycle('8');
      gql(httpMock, 'query CycleProfitability').flush(cycleReport(T2));
      await settle(fixture);

      expect(squash(one(fixture, 'cycle-net'))).toContain(
        'Profit before farm-level feed & shared costs',
      );
      httpMock.verify();
    });

    it('says an ACTIVE cycle is still running - and shows no zero profit', async () => {
      const { fixture, component, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      component.cycleForm.controls.cycleId.setValue('7');
      gql(httpMock, 'query CycleProfitability').flush(cycleReport(ACTIVE_CYCLE));
      await settle(fixture);

      const detail = one(fixture, 'cycle-detail');
      expect(squash(one(fixture, 'cycle-active'))).toContain(PROFIT_I18N.sw.cycleActive);
      expect(byId(fixture, 'cycle-net').length).toBe(0);
      expect(squash(detail)).not.toContain(money(0));
      httpMock.verify();
    });

    it('flags a closed cycle whose revenue and fingerling cost were never recorded', async () => {
      const { fixture, component, httpMock } = setup(MANAGER);
      await load(fixture, httpMock);

      component.viewCycle('9');
      gql(httpMock, 'query CycleProfitability').flush(cycleReport(T3));
      await settle(fixture);

      const detail = one(fixture, 'cycle-detail');
      expect(byId(fixture, 'flag-revenue', detail).length).toBe(1);
      expect(byId(fixture, 'flag-fingerling', detail).length).toBe(1);
      expect(one(fixture, 'cycle-net').classList).toContain('money--loss');
      httpMock.verify();
    });

    it('offers the cycle picker only with manage_costs - farmCycles is that code', async () => {
      const manager = setup(MANAGER);
      await load(manager.fixture, manager.httpMock);
      expect(byId(manager.fixture, 'cycle-picker').length).toBe(1);
      manager.httpMock.verify();

      localStorage.clear();
      TestBed.resetTestingModule();

      const finance = setup(FINANCE_ONLY);
      await load(finance.fixture, finance.httpMock);
      expect(byId(finance.fixture, 'cycle-picker').length).toBe(0);
      finance.httpMock.expectNone(isOp('query FarmCycles'));
      // The per-cycle table still reaches a cycle.
      finance.component.viewCycle('8');
      finance.httpMock.expectOne(isOp('query CycleProfitability')).flush(cycleReport(T2));
      await settle(finance.fixture);
      expect(byId(finance.fixture, 'cycle-net').length).toBe(1);
      finance.httpMock.verify();
    });
  });

  describe('the route gate', () => {
    async function runGuard(permissions: string[]): Promise<GuardResult> {
      localStorage.setItem(TOKEN_KEY, 'a-token');
      localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      const authService = TestBed.inject(AuthService);
      authService.ensurePermissions = () => of(authService.permissions());

      const route = routes
        .flatMap((r) => [r, ...(r.children ?? [])])
        .find((r) => r.path === 'profit');
      const guard = route?.canActivate?.[0] as CanActivateFn | undefined;
      if (typeof guard !== 'function') {
        throw new Error('profit has no CanActivateFn');
      }
      const result = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return firstValueFrom(isObservable(result) ? result : of(result));
    }

    it('lets a view_finance holder in', async () => {
      expect(await runGuard(FINANCE_ONLY)).toBe(true);
    });

    it('turns away anyone without view_finance - manage_costs is not enough', async () => {
      const result = await runGuard(['view_dashboard', 'manage_costs', 'manage_assets']);
      expect(result).toEqual(TestBed.inject(Router).parseUrl('/dashboard'));
    });
  });

  describe('language', () => {
    it('carries exactly the same keys in both languages', () => {
      expect(Object.keys(PROFIT_I18N.en).sort()).toEqual(Object.keys(PROFIT_I18N.sw).sort());
    });
  });
});
