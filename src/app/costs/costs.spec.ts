import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpRequest, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  GuardResult,
  Route,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { isObservable, firstValueFrom, of } from 'rxjs';
import { Costs } from './costs';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth';
import { COSTS_I18N } from './costs.i18n';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Rows in the shape `schema.graphqls` defines: every id is `ID!` and so a
 * STRING on the wire, `amount` is `Float!`, and `cycle` is NULLABLE - null is
 * a whole-farm cost. The cents are chosen so a naive float sum would drift.
 */
const ELECTRICITY_CAT = { costCategoryId: '5', name: 'Umeme' };
const FINGERLINGS_CAT = { costCategoryId: '6', name: 'Vifaranga' };
const MEDICINE_CAT = { costCategoryId: '7', name: 'Dawa' };
const RENT_CAT = { costCategoryId: '8', name: 'Kodi' };

const MBEYA = { farmId: '1', name: 'Shamba la Mbeya' };
const IRINGA = { farmId: '2', name: 'Shamba la Iringa' };
const DODOMA = { farmId: '3', name: 'Shamba la Dodoma' };

const T1 = { cycleId: '7', label: 'T1 - Sato (ACTIVE)', status: 'ACTIVE' };
/** Closed, and still a valid target: bills arrive after the harvest. */
const T2 = { cycleId: '8', label: 'T2 - Kambale (HARVESTED)', status: 'HARVESTED' };
const P1 = { cycleId: '9', label: 'P1 - Sato (ACTIVE)', status: 'ACTIVE' };

const ELECTRICITY = {
  costId: '101',
  farm: MBEYA,
  cycle: null,
  costCategory: ELECTRICITY_CAT,
  amount: 150000.1,
  costDate: '2026-08-31',
  description: 'LUKU ya Agosti',
};
const FINGERLINGS = {
  costId: '102',
  farm: MBEYA,
  cycle: T1,
  costCategory: FINGERLINGS_CAT,
  amount: 300000.2,
  costDate: '2026-07-01',
  description: null,
};
const MEDICINE = {
  costId: '103',
  farm: MBEYA,
  cycle: T2,
  costCategory: MEDICINE_CAT,
  amount: 45000.25,
  costDate: '2026-08-15',
  description: 'Baada ya mavuno',
};
const RENT = {
  costId: '104',
  farm: IRINGA,
  cycle: null,
  costCategory: RENT_CAT,
  amount: 200000,
  costDate: '2026-09-01',
  description: null,
};
const IRINGA_FINGERLINGS = {
  costId: '105',
  farm: IRINGA,
  cycle: P1,
  costCategory: FINGERLINGS_CAT,
  amount: 80000.5,
  costDate: '2026-06-10',
  description: null,
};

const REGISTER = {
  data: { costs: [ELECTRICITY, FINGERLINGS, MEDICINE, RENT, IRINGA_FINGERLINGS] },
};
const EMPTY_REGISTER = { data: { costs: [] } };
const CATEGORIES = {
  data: { costCategories: [ELECTRICITY_CAT, FINGERLINGS_CAT, MEDICINE_CAT, RENT_CAT] },
};
const NO_CATEGORIES = { data: { costCategories: [] } };
const MY_FARMS = { data: { myFarms: [MBEYA, IRINGA, DODOMA] } };
const NO_FARMS = { data: { myFarms: [] } };
const MBEYA_CYCLES = { data: { farmCycles: [T1, T2] } };
const IRINGA_CYCLES = { data: { farmCycles: [P1] } };
const NO_CYCLES = { data: { farmCycles: [] } };

const CREATED = { data: { createCost: { ...ELECTRICITY, costId: '200' } } };

/** CostService's own future-date refusal: IllegalArgumentException -> VALIDATION_ERROR. */
const FUTURE_DATE_REFUSAL = {
  data: null,
  errors: [
    {
      message: 'Tarehe ya gharama haiwezi kuwa ya baadaye (2026-09-11). Leo ni 2026-09-10.',
      path: ['createCost'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

/** CostService's ConflictException - counts soft-deleted rows. */
const DUPLICATE_CATEGORY = {
  data: null,
  errors: [
    {
      message: 'Aina ya gharama yenye jina hili tayari ipo.',
      path: ['createCostCategory'],
      extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

const COST_KEEPER = ['view_dashboard', 'manage_costs'];

function setup(
  permissions: string[],
  options: { lang?: Lang; farmId?: number | null; canSelectFarm?: boolean } = {},
) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  localStorage.setItem(CAN_SELECT_FARM_KEY, String(options.canSelectFarm ?? false));
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: 'u-1',
      name: 'Mmiliki',
      phone: '0700000001',
      status: 'ACTIVE',
      farmId: options.farmId === undefined ? 1 : options.farmId,
      role: 'OWNER',
    }),
  );

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

  const fixture = TestBed.createComponent(Costs);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

const isOp = (operation: string) => (req: HttpRequest<unknown>) =>
  req.url === environment.graphqlUrl &&
  String((req.body as { query: string }).query).includes(operation);

function gql(httpMock: HttpTestingController, operation: string) {
  return httpMock.expectOne(isOp(operation));
}

const variables = (req: { request: { body: unknown } }) =>
  (req.request.body as { variables: unknown }).variables;

const text = (fixture: ComponentFixture<Costs>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<Costs>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

const testIds = (fixture: ComponentFixture<Costs>, id: string, root?: Element) => [
  ...(root ?? (fixture.nativeElement as HTMLElement)).querySelectorAll(`[data-testid="${id}"]`),
];

/** The table row that mentions `needle`, inside `root`. */
const rowWith = (root: Element, needle: string) =>
  [...root.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(needle));

const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function settle(fixture: ComponentFixture<Costs>) {
  await fixture.whenStable();
  fixture.detectChanges();
}

/**
 * Opens the screen. The three reads come first; the preselected farm (the
 * caller's own, farm 1 by default) then asks `farmCycles` for itself.
 */
async function load(
  fixture: ComponentFixture<Costs>,
  httpMock: HttpTestingController,
  opts: { register?: object; categories?: object; farms?: object; cycles?: object } = {},
) {
  fixture.detectChanges();
  gql(httpMock, 'query Costs').flush(opts.register ?? REGISTER);
  gql(httpMock, 'query CostCategories').flush(opts.categories ?? CATEGORIES);
  gql(httpMock, 'query MyFarms').flush(opts.farms ?? MY_FARMS);
  for (const req of httpMock.match(isOp('query FarmCycles'))) {
    req.flush(opts.cycles ?? MBEYA_CYCLES);
  }
  await settle(fixture);
}

function fill(
  fixture: ComponentFixture<Costs>,
  values: Partial<{
    farmId: string;
    attribution: '' | 'cycle' | 'farm';
    cycleId: string;
    costCategoryId: string;
    amount: number | string;
    costDate: string;
    description: string;
  }>,
) {
  fixture.componentInstance.form.patchValue(values as Record<string, string>);
  fixture.detectChanges();
}

describe('Costs', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the register', () => {
    it('groups by farm, with per-farm totals and a company grand total', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      const groups = component.groups();
      // Farms in name order: Iringa before Mbeya.
      expect(groups.map((g) => g.farmName)).toEqual(['Shamba la Iringa', 'Shamba la Mbeya']);
      expect(groups.map((g) => g.costs.length)).toEqual([2, 3]);
      // Whole cents: 150000.10 + 300000.20 + 45000.25 is exactly 495000.55.
      expect(groups.map((g) => g.totalCents)).toEqual([28000050, 49500055]);
      expect(component.grandTotalCents()).toBe(77500105);

      const farmTotals = testIds(fixture, 'farm-total').map((el) => el.textContent ?? '');
      expect(farmTotals[0]).toContain(money(280000.5));
      expect(farmTotals[1]).toContain(money(495000.55));
      expect(testIds(fixture, 'grand-total')[0].textContent).toContain(money(775001.05));

      const [iringa, mbeya] = testIds(fixture, 'farm-group');
      expect(iringa.textContent).toContain('Kodi');
      expect(iringa.textContent).not.toContain('LUKU ya Agosti');
      expect(mbeya.textContent).toContain('LUKU ya Agosti');
      expect(mbeya.textContent).not.toContain('Kodi');
      httpMock.verify();
    });

    it('keeps whole-farm and per-cycle costs apart inside a farm', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      const mbeya = component.groups()[1];
      expect(mbeya.wholeFarm).toEqual({
        cycleId: null,
        label: null,
        count: 1,
        totalCents: 15000010,
      });
      // One line per cycle, in label order - the closed T2 included.
      expect(mbeya.cycles.map((c) => [c.label, c.totalCents])).toEqual([
        ['T1 - Sato (ACTIVE)', 30000020],
        ['T2 - Kambale (HARVESTED)', 4500025],
      ]);

      const mbeyaEl = testIds(fixture, 'farm-group')[1];
      const wholeFarm = testIds(fixture, 'whole-farm-subtotal', mbeyaEl);
      expect(wholeFarm.length).toBe(1);
      expect(wholeFarm[0].textContent).toContain(COSTS_I18N.sw.wholeFarmSubtotal);
      expect(wholeFarm[0].textContent).toContain(money(150000.1));
      const cycles = testIds(fixture, 'cycle-subtotal', mbeyaEl).map((el) => el.textContent ?? '');
      expect(cycles.length).toBe(2);
      expect(cycles[0]).toContain('T1 - Sato (ACTIVE)');
      expect(cycles[0]).toContain(money(300000.2));
      expect(cycles[1]).toContain('T2 - Kambale (HARVESTED)');
      expect(cycles[1]).toContain(money(45000.25));
      httpMock.verify();
    });

    it('marks a null-cycle cost "Shamba zima", and a cycle cost with its label', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      const mbeya = testIds(fixture, 'farm-group')[1];
      const electricityRow = rowWith(mbeya, 'LUKU ya Agosti');
      expect(electricityRow?.textContent).toContain(COSTS_I18N.sw.wholeFarm);
      expect(electricityRow?.textContent).not.toContain('T1');

      const fingerlingsRow = rowWith(mbeya, 'Vifaranga');
      expect(fingerlingsRow?.textContent).toContain('T1 - Sato (ACTIVE)');
      expect(fingerlingsRow?.textContent).not.toContain(COSTS_I18N.sw.wholeFarm);
      // Its missing description is a dash, not the word "null".
      expect(fingerlingsRow?.textContent).not.toContain('null');
      httpMock.verify();
    });

    it('shows the whole-farm marker in English too', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER, { lang: 'en' });
      await load(fixture, httpMock);

      const iringa = testIds(fixture, 'farm-group')[0];
      expect(rowWith(iringa, 'Kodi')?.textContent).toContain('Whole farm');
      httpMock.verify();
    });

    it('shows the empty state for an empty register - and no total, so no NaN', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock, { register: EMPTY_REGISTER });

      expect(testIds(fixture, 'costs-empty').length).toBe(1);
      expect(text(fixture)).toContain(COSTS_I18N.sw.emptyTitle);
      expect(text(fixture)).toContain(COSTS_I18N.sw.emptyMessage);
      expect(testIds(fixture, 'grand-total').length).toBe(0);
      expect(component.grandTotalCents()).toBe(0);
      expect(text(fixture)).not.toContain('NaN');
      expect(panel(fixture, 'cost-form')).toBeTruthy();
      httpMock.verify();
    });

    it('surfaces a failed load with a retry', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER);
      fixture.detectChanges();
      gql(httpMock, 'query Costs').flush({
        data: null,
        errors: [
          {
            message: "Huna ruhusa ya 'manage_costs'.",
            path: ['costs'],
            extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
          },
        ],
      });
      httpMock.match((r) => r.url === environment.graphqlUrl);
      await settle(fixture);

      expect(testIds(fixture, 'load-error').length).toBe(1);
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      expect(panel(fixture, 'register')).toBeNull();
    });
  });

  describe('the cycle picker', () => {
    it('loads the preselected farm cycles, as an Int', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      fixture.detectChanges();
      gql(httpMock, 'query Costs').flush(REGISTER);
      gql(httpMock, 'query CostCategories').flush(CATEGORIES);
      gql(httpMock, 'query MyFarms').flush(MY_FARMS);

      const req = gql(httpMock, 'query FarmCycles');
      expect(variables(req)).toEqual({ farmId: 1 });
      req.flush(MBEYA_CYCLES);
      await settle(fixture);

      expect(component.form.getRawValue().farmId).toBe('1');
      expect(component.cycleOptions()).toEqual([T1, T2]);
      httpMock.verify();
    });

    it('is hidden until "specific cycle" is chosen, and lists closed cycles too', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      // Nothing preselected: the attribution is an explicit choice.
      expect(fixture.componentInstance.form.getRawValue().attribution).toBe('');
      expect(testIds(fixture, 'cycle-picker').length).toBe(0);

      fill(fixture, { attribution: 'cycle' });
      const options = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
          '#cost-cycle option',
        ),
      ].map((o) => o.textContent?.trim());
      expect(options).toEqual([
        COSTS_I18N.sw.fieldCyclePlaceholder,
        'T1 - Sato (ACTIVE)',
        'T2 - Kambale (HARVESTED)',
      ]);

      fill(fixture, { attribution: 'farm' });
      expect(testIds(fixture, 'cycle-picker').length).toBe(0);
      httpMock.verify();
    });

    it('reloads farmCycles for a new farm and clears the picked cycle', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, { attribution: 'cycle', cycleId: T1.cycleId });
      expect(component.form.getRawValue().cycleId).toBe('7');

      fill(fixture, { farmId: IRINGA.farmId });
      // Cleared at once - not when the new list arrives.
      expect(component.form.getRawValue().cycleId).toBe('');
      expect(component.cycleOptions()).toEqual([]);

      const req = gql(httpMock, 'query FarmCycles');
      expect(variables(req)).toEqual({ farmId: 2 });
      req.flush(IRINGA_CYCLES);
      await settle(fixture);

      expect(component.cycleOptions()).toEqual([P1]);
      const options = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
          '#cost-cycle option',
        ),
      ].map((o) => o.textContent?.trim());
      expect(options).toEqual([COSTS_I18N.sw.fieldCyclePlaceholder, 'P1 - Sato (ACTIVE)']);
      httpMock.verify();
    });

    it('drops a slower answer for a farm already moved away from', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, { farmId: IRINGA.farmId });
      const iringaReq = gql(httpMock, 'query FarmCycles');
      fill(fixture, { farmId: DODOMA.farmId });
      const dodomaReq = gql(httpMock, 'query FarmCycles');

      expect(iringaReq.cancelled).toBe(true);
      expect(variables(dodomaReq)).toEqual({ farmId: 3 });
      dodomaReq.flush(NO_CYCLES);
      await settle(fixture);

      expect(component.cycleOptions()).toEqual([]);
      httpMock.verify();
    });

    it('with no cycles on the farm, points to recording it as whole-farm', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock, { cycles: NO_CYCLES });

      fill(fixture, { attribution: 'cycle' });
      expect(testIds(fixture, 'no-cycles').length).toBe(1);
      expect(text(fixture)).toContain(COSTS_I18N.sw.cyclesEmpty);
      httpMock.verify();
    });
  });

  describe('recording a cost', () => {
    it('with a cycle: sends every id as a number and refreshes the register', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        attribution: 'cycle',
        cycleId: T2.cycleId,
        costCategoryId: MEDICINE_CAT.costCategoryId,
        amount: 45000.25,
        costDate: '2026-08-15',
        description: '  Baada ya mavuno  ',
      });
      component.submit();

      const req = gql(httpMock, 'mutation CreateCost(');
      expect(variables(req)).toEqual({
        farmId: 1,
        cycleId: 8,
        costCategoryId: 7,
        amount: 45000.25,
        costDate: '2026-08-15',
        description: 'Baada ya mavuno',
      });
      req.flush(CREATED);
      await settle(fixture);

      gql(httpMock, 'query Costs').flush(REGISTER);
      await settle(fixture);

      expect(component.toastMessage()).toBe(COSTS_I18N.sw.createdToast);
      expect(component.form.getRawValue().amount).toBe('');
      // Farm, attribution and cycle are kept for the next bill.
      expect(component.form.getRawValue().farmId).toBe('1');
      expect(component.form.getRawValue().attribution).toBe('cycle');
      expect(component.form.getRawValue().cycleId).toBe('8');
      expect(component.form.getRawValue().costDate).toBe(component.today);
      httpMock.verify();
    });

    it('whole-farm: sends cycleId null - even with a cycle picked earlier', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, { attribution: 'cycle', cycleId: T1.cycleId });
      fill(fixture, {
        attribution: 'farm',
        costCategoryId: ELECTRICITY_CAT.costCategoryId,
        amount: '150000.1',
        costDate: '2026-08-31',
        description: '   ',
      });
      component.submit();

      const req = gql(httpMock, 'mutation CreateCost(');
      expect(variables(req)).toEqual({
        farmId: 1,
        cycleId: null,
        costCategoryId: 5,
        amount: 150000.1,
        costDate: '2026-08-31',
        description: null,
      });
      req.flush(CREATED);
      await settle(fixture);
      gql(httpMock, 'query Costs').flush(REGISTER);
      httpMock.verify();
    });

    it('whole-farm needs no cycle at all, on a farm that has none', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER, { farmId: 3 });
      await load(fixture, httpMock, { cycles: NO_CYCLES });

      expect(component.form.getRawValue().farmId).toBe('3');
      fill(fixture, {
        attribution: 'farm',
        costCategoryId: RENT_CAT.costCategoryId,
        amount: 200000,
        costDate: '2026-09-01',
      });
      component.submit();

      const req = gql(httpMock, 'mutation CreateCost(');
      expect(variables(req)).toMatchObject({ farmId: 3, cycleId: null, costCategoryId: 8 });
      req.flush(CREATED);
      await settle(fixture);
      gql(httpMock, 'query Costs').flush(REGISTER);
      httpMock.verify();
    });

    it('asks for the attribution rather than guessing one', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, { costCategoryId: '5', amount: 1000, costDate: '2026-09-01' });
      component.submit();
      fixture.detectChanges();

      expect(component.attributionError()).toBe(COSTS_I18N.sw.errorAttributionRequired);
      expect(text(fixture)).toContain(COSTS_I18N.sw.errorAttributionRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('refuses "specific cycle" with no cycle picked', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        attribution: 'cycle',
        costCategoryId: '5',
        amount: 1000,
        costDate: '2026-09-01',
      });
      component.submit();

      expect(component.cycleError()).toBe(COSTS_I18N.sw.errorCycleRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('names every missing or bad field at once, and sends nothing', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER, { farmId: null });
      await load(fixture, httpMock);

      fill(fixture, { farmId: '', attribution: 'farm', costCategoryId: '', amount: 0 });
      component.submit();

      const t = COSTS_I18N.sw;
      expect(component.farmError()).toBe(t.errorFarmRequired);
      expect(component.categoryError()).toBe(t.errorCategoryRequired);
      expect(component.amountError()).toBe(t.errorAmountPositive);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('defaults the date to today in the farm day, and caps the picker there', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      expect(component.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(component.form.getRawValue().costDate).toBe(component.today);
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '#cost-date',
      );
      expect(input?.max).toBe(component.today);
      httpMock.verify();
    });

    it('refuses a future cost date before spending a request', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        attribution: 'farm',
        costCategoryId: '5',
        amount: 1000,
        costDate: '2999-01-01',
      });
      component.submit();
      fixture.detectChanges();

      expect(component.dateError()).toBe(COSTS_I18N.sw.errorDateFuture);
      expect(text(fixture)).toContain(COSTS_I18N.sw.errorDateFuture);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('surfaces the backend refusal of a future date in its own words', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        attribution: 'farm',
        costCategoryId: '5',
        amount: 1000,
        costDate: component.today,
      });
      component.submit();
      gql(httpMock, 'mutation CreateCost(').flush(FUTURE_DATE_REFUSAL);
      await settle(fixture);

      expect(component.formError()).toBe(FUTURE_DATE_REFUSAL.errors[0].message);
      expect(testIds(fixture, 'form-error')[0].textContent).toContain('haiwezi kuwa ya baadaye');
      httpMock.verify();
    });
  });

  describe('empty states', () => {
    it('with no categories, guides to create one first and hides the form', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock, { register: EMPTY_REGISTER, categories: NO_CATEGORIES });

      expect(panel(fixture, 'needs-category')).toBeTruthy();
      expect(panel(fixture, 'cost-form')).toBeNull();
      expect(testIds(fixture, 'no-categories').length).toBe(1);
      expect(text(fixture)).toContain(COSTS_I18N.sw.emptyMessageNoCategories);
      httpMock.verify();
    });

    it('guides a caller with no farm at all instead of showing the form', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER, { farmId: null });
      await load(fixture, httpMock, { register: EMPTY_REGISTER, farms: NO_FARMS });

      expect(panel(fixture, 'no-farm')).toBeTruthy();
      expect(panel(fixture, 'cost-form')).toBeNull();
      expect(text(fixture)).toContain(COSTS_I18N.sw.noFarmMessage);
      httpMock.verify();
    });
  });

  describe('categories', () => {
    it('creates a category, re-reads the catalogue, and selects it in the form', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock, { register: EMPTY_REGISTER, categories: NO_CATEGORIES });

      component.categoryForm.setValue({ name: '  Umeme  ' });
      component.submitCategory();

      const req = gql(httpMock, 'mutation CreateCostCategory(');
      expect(variables(req)).toEqual({ name: 'Umeme' });
      req.flush({ data: { createCostCategory: ELECTRICITY_CAT } });
      await settle(fixture);

      gql(httpMock, 'query CostCategories').flush({ data: { costCategories: [ELECTRICITY_CAT] } });
      await settle(fixture);

      expect(component.toastMessage()).toBe(COSTS_I18N.sw.categoryCreatedToast);
      expect(component.form.getRawValue().costCategoryId).toBe('5');
      expect(panel(fixture, 'needs-category')).toBeNull();
      expect(panel(fixture, 'cost-form')).toBeTruthy();
      httpMock.verify();
    });

    it('names a duplicate with our "jina limechukuliwa" copy', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER);
      await load(fixture, httpMock);

      component.categoryForm.setValue({ name: 'Umeme' });
      component.submitCategory();
      gql(httpMock, 'mutation CreateCostCategory(').flush(DUPLICATE_CATEGORY);
      await settle(fixture);

      expect(component.categoryNameError()).toBe(COSTS_I18N.sw.errorCategoryTaken);
      expect(text(fixture).toLowerCase()).toContain('jina limechukuliwa');
      httpMock.verify();
    });

    it('says the duplicate in English too', async () => {
      const { fixture, component, httpMock } = setup(COST_KEEPER, { lang: 'en' });
      await load(fixture, httpMock);

      component.categoryForm.setValue({ name: 'Umeme' });
      component.submitCategory();
      gql(httpMock, 'mutation CreateCostCategory(').flush(DUPLICATE_CATEGORY);
      await settle(fixture);

      expect(component.categoryNameError()).toBe(COSTS_I18N.en.errorCategoryTaken);
      httpMock.verify();
    });
  });

  /** Against the REAL route table - the wiring is what is being checked. */
  describe('the route gate', () => {
    const costsRoute = (): Route => {
      // Flattened: the screens are CHILDREN of the shell's layout route now, so a
      // top-level ind would miss them - and missing them would look exactly
      // like the guard being gone.
      const route = routes
        .flatMap((r) => [r, ...(r.children ?? [])])
        .find((r) => r.path === 'costs');
      if (!route) {
        throw new Error('costs is not in the route table');
      }
      return route;
    };

    async function runGuard(permissions: string[]): Promise<GuardResult> {
      localStorage.setItem(TOKEN_KEY, 'a-token');
      localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });

      const authService = TestBed.inject(AuthService);
      authService.ensurePermissions = () => of(authService.permissions());

      const guard = costsRoute().canActivate?.[0] as CanActivateFn | undefined;
      if (typeof guard !== 'function') {
        throw new Error('costs has no CanActivateFn');
      }
      const result = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return firstValueFrom(isObservable(result) ? result : of(result));
    }

    it('lets a manage_costs holder in', async () => {
      expect(await runGuard(COST_KEEPER)).toBe(true);
    });

    it('turns away anyone without manage_costs - manage_assets is not enough', async () => {
      const result = await runGuard(['view_dashboard', 'manage_assets', 'manage_species']);

      expect(result).not.toBe(true);
      expect(result).toEqual(TestBed.inject(Router).parseUrl('/dashboard'));
    });
  });

  describe('language', () => {
    it('renders in English when that is the UI language', async () => {
      const { fixture, httpMock } = setup(COST_KEEPER, { lang: 'en' });
      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Operational Costs');
      expect(text(fixture)).toContain('Company total (all farms)');
      expect(text(fixture)).toContain('3 costs');
      expect(text(fixture)).toContain('Whole-farm costs');
      httpMock.verify();
    });

    it('carries exactly the same keys in both languages', () => {
      const sw = Object.keys(COSTS_I18N.sw).sort();
      const en = Object.keys(COSTS_I18N.en).sort();
      expect(en).toEqual(sw);
    });
  });
});

/**
 * Rail ya muhtasari.
 *
 * Kalenda HAIGHARIMU OMBI: kila gharama ina `costDate` yake.
 *
 * Kadi ya MGAWANYO ndiyo hoja ya skrini hii ikiwa kwenye namba moja: fedha za
 * mizunguko dhidi ya fedha za shamba zima. Pamoja na kadi ya aina, inahesabu
 * DAFTARI ZIMA na si tarehe iliyochaguliwa - sura ya matumizi ni swali la
 * miezi, si la Jumanne moja.
 */
describe('Costs summary rail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('counts the register and totals its amount', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock);

    const by = (label: string) => component.summary().find((row) => row.label === label)?.value;

    expect(by('Gharama zote')).toBe('5');
    // 150,000.10 + 300,000.20 + 45,000.25 + 200,000 + 80,000.50.
    expect(by('Kiasi chote')).toBe(money(775001.05));
    httpMock.verify();
  });

  it('filters to the selected date without asking the backend', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock);

    component.selectDate(new Date(2026, 8, 1)); // 2026-09-01, kodi ya Iringa
    fixture.detectChanges();

    const by = (label: string) => component.summary().find((row) => row.label === label)?.value;
    expect(by('Za tarehe hii')).toBe('1');
    expect(by('Kiasi cha tarehe hii')).toBe(money(200000));
    httpMock.verify();
  });

  it('splits cycle money from whole-farm money, and the two add up', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock);

    const by = (label: string) =>
      component.attributionSplit().find((row) => row.label === label)?.value;

    // Vifaranga T1 + Dawa T2 + Vifaranga P1.
    expect(by('Za mizunguko')).toBe(money(425000.95));
    // Umeme + Kodi - zote mbili hazina mzunguko.
    expect(by('Za shamba zima')).toBe(money(350000.1));
    // Jumla ya mistari miwili ni daftari zima: hakuna gharama inayoanguka
    // katikati ya mgawanyo huu.
    expect(425000.95 + 350000.1).toBe(775001.05);
    httpMock.verify();
  });

  it('keeps the split on the whole register when a past date is selected', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock);

    component.selectDate(new Date(2026, 8, 1));
    fixture.detectChanges();

    // Muhtasari umefuata tarehe, mgawanyo haujafuata - ndiyo tofauti
    // iliyokusudiwa.
    expect(component.summary().find((row) => row.label === 'Za tarehe hii')?.value).toBe('1');
    expect(component.attributionSplit().find((row) => row.label === 'Za mizunguko')?.value).toBe(
      money(425000.95),
    );
    httpMock.verify();
  });

  it('ranks the categories by money, biggest first', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock);

    const rows = component.topCategories().rows;
    // Vifaranga (300,000.20 + 80,000.50) inaongoza ingawa hakuna gharama moja
    // yake iliyo kubwa kuliko Kodi - ndiyo maana ni jumla, si safu moja.
    expect(rows.map((row) => row.name)).toEqual(['Vifaranga', 'Kodi', 'Umeme', 'Dawa']);
    expect(rows[0].value).toBe(money(380000.7));
    // Aina nne tu: hakuna kilichokatwa, hivyo hakuna mstari wa "na nyingine".
    expect(component.topCategories().remaining).toBe(0);
    expect(testIds(fixture, 'categories-more').length).toBe(0);
    httpMock.verify();
  });

  it('caps the categories at five and counts the rest rather than dropping them', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    // Aina saba, kila moja na gharama moja, kiasi kikishuka - ili mpangilio
    // ujulikane na mbili za mwisho ziwe ndizo zinazokatwa.
    const many = Array.from({ length: 7 }, (_, index) => ({
      costId: `90${index}`,
      farm: MBEYA,
      cycle: null,
      costCategory: { costCategoryId: `${90 + index}`, name: `Aina ${index + 1}` },
      amount: (7 - index) * 1000,
      costDate: '2026-08-01',
      description: null,
    }));
    await load(fixture, httpMock, { register: { data: { costs: many } } });

    const capped = component.topCategories();
    expect(capped.rows.map((row) => row.name)).toEqual([
      'Aina 1',
      'Aina 2',
      'Aina 3',
      'Aina 4',
      'Aina 5',
    ]);
    expect(capped.remaining).toBe(2);
    expect(testIds(fixture, 'categories-more')[0]?.textContent).toContain('2');
    httpMock.verify();
  });

  it('says so rather than showing an empty list when nothing is recorded', async () => {
    const { fixture, component, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock, { register: EMPTY_REGISTER });

    expect(component.topCategories().rows.length).toBe(0);
    const rail = (fixture.nativeElement as HTMLElement).querySelector('.module-rail')!;
    expect(rail.textContent).toContain('Hakuna gharama iliyorekodiwa bado.');
    // Daftari tupu: mgawanyo ni 0.00 mbili zilizoandikwa, si NaN.
    expect(component.attributionSplit().map((row) => row.value)).toEqual([money(0), money(0)]);
    httpMock.verify();
  });

  it('renders the rail beside the work', async () => {
    const { fixture, httpMock } = setup(COST_KEEPER);
    await load(fixture, httpMock);

    const rail = (fixture.nativeElement as HTMLElement).querySelector('.module-rail')!;
    expect(rail.parentElement?.classList.contains('module-layout')).toBe(true);
    // Maelezo, kalenda, muhtasari, mgawanyo, aina.
    expect(rail.querySelectorAll('.side-card').length).toBe(5);
    expect(rail.querySelector('app-date-picker-card')).toBeTruthy();
  });

  it('carries exactly the same rail keys in both languages', () => {
    const sw = Object.keys(COSTS_I18N.sw).sort();
    const en = Object.keys(COSTS_I18N.en).sort();
    expect(en).toEqual(sw);
  });
});
