import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
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
import { Assets } from './assets';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth';
import { ASSETS_I18N } from './assets.i18n';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Rows in the shape `schema.graphqls` defines: every id is `ID!` and so a
 * STRING on the wire, `cost` is `Float!`, `sizeLabel` is nullable, and every
 * row carries its `farm` - the register crosses farms.
 *
 * The cents are chosen so a naive float sum would not be exact
 * (0.1 + 0.2), which the cent-based totals must not care about.
 */
const MACHINERY = { assetCategoryId: '5', name: 'Mashine' };
const VEHICLES = { assetCategoryId: '6', name: 'Magari' };

const MBEYA = { farmId: '1', name: 'Shamba la Mbeya' };
const IRINGA = { farmId: '2', name: 'Shamba la Iringa' };
/** The caller's too, but with no assets yet - the farm the old select could not offer. */
const DODOMA = { farmId: '3', name: 'Shamba la Dodoma' };

const GENERATOR = {
  assetId: '11',
  name: 'Jenereta',
  farm: MBEYA,
  assetCategory: MACHINERY,
  cost: 1250000.1,
  sizeLabel: '20HP',
  acquiredDate: '2026-03-01',
};
const MOTORBIKE = {
  assetId: '12',
  name: 'Pikipiki',
  farm: MBEYA,
  assetCategory: VEHICLES,
  cost: 3400000.2,
  sizeLabel: null,
  acquiredDate: '2025-11-20',
};
const TANK = {
  assetId: '13',
  name: 'Tanki la maji',
  farm: IRINGA,
  assetCategory: MACHINERY,
  cost: 800000.25,
  sizeLabel: '5000L',
  acquiredDate: '2024-06-15',
};

const REGISTER = { data: { assets: [GENERATOR, MOTORBIKE, TANK] } };
const EMPTY_REGISTER = { data: { assets: [] } };
const CATEGORIES = { data: { assetCategories: [VEHICLES, MACHINERY] } };
const NO_CATEGORIES = { data: { assetCategories: [] } };
const MY_FARMS = { data: { myFarms: [MBEYA, IRINGA, DODOMA] } };
const NO_FARMS = { data: { myFarms: [] } };

const CREATED_ASSET = {
  data: {
    createAsset: {
      assetId: '20',
      name: 'Pampu',
      farm: MBEYA,
      assetCategory: MACHINERY,
      cost: 1500000,
      sizeLabel: '2HP',
      acquiredDate: '2026-01-15',
    },
  },
};

/** The backend's own future-date refusal: IllegalArgumentException -> VALIDATION_ERROR. */
const FUTURE_DATE_REFUSAL = {
  data: null,
  errors: [
    {
      message: 'Tarehe ya kupata mali haiwezi kuwa ya baadaye (2026-09-11). Leo ni 2026-09-10.',
      path: ['createAsset'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

/**
 * A duplicate category - raised by AssetService itself as ConflictException,
 * counting soft-deleted rows. The screen supplies its own copy for it.
 */
const DUPLICATE_CATEGORY = {
  data: null,
  errors: [
    {
      message: 'Aina ya mali yenye jina hili tayari ipo.',
      path: ['createAssetCategory'],
      extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

const ASSET_KEEPER = ['view_dashboard', 'manage_assets'];

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

  const fixture = TestBed.createComponent(Assets);
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

const variables = (req: { request: { body: unknown } }) =>
  (req.request.body as { variables: unknown }).variables;

const text = (fixture: ComponentFixture<Assets>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<Assets>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

const testIds = (fixture: ComponentFixture<Assets>, id: string) => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${id}"]`),
];

/** The screen's own money format, so assertions are not tied to one locale. */
const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function settle(fixture: ComponentFixture<Assets>) {
  await fixture.whenStable();
  fixture.detectChanges();
}

async function load(
  fixture: ComponentFixture<Assets>,
  httpMock: HttpTestingController,
  register: object = REGISTER,
  categories: object = CATEGORIES,
  farms: object = MY_FARMS,
) {
  fixture.detectChanges();
  gql(httpMock, 'query Assets').flush(register);
  gql(httpMock, 'query AssetCategories').flush(categories);
  gql(httpMock, 'query MyFarms').flush(farms);
  await settle(fixture);
}

function fill(
  fixture: ComponentFixture<Assets>,
  values: Partial<{
    name: string;
    farmId: string;
    assetCategoryId: string;
    cost: number | string;
    acquiredDate: string;
    sizeLabel: string;
  }>,
) {
  // `cost` cast because NumberValueAccessor writes a number into a control
  // declared as string - the split parseDecimal absorbs.
  fixture.componentInstance.form.patchValue(values as Record<string, string>);
  fixture.detectChanges();
}

describe('Assets', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the register', () => {
    it('groups by farm, with per-farm totals and a company grand total', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      const groups = component.groups();
      // Farms in name order: Iringa before Mbeya.
      expect(groups.map((g) => g.farmName)).toEqual(['Shamba la Iringa', 'Shamba la Mbeya']);
      expect(groups.map((g) => g.assets.length)).toEqual([1, 2]);
      // Whole cents, so 1250000.10 + 3400000.20 is exactly 4650000.30.
      expect(groups.map((g) => g.totalCents)).toEqual([80000025, 465000030]);
      expect(component.grandTotalCents()).toBe(545000055);

      const farmTotals = testIds(fixture, 'farm-total').map((el) => el.textContent ?? '');
      expect(farmTotals[0]).toContain(money(800000.25));
      expect(farmTotals[1]).toContain(money(4650000.3));
      expect(testIds(fixture, 'grand-total')[0].textContent).toContain(money(5450000.55));

      // Each farm's rows sit under that farm, not in one flat list.
      const [iringa, mbeya] = testIds(fixture, 'farm-group');
      expect(iringa.textContent).toContain('Tanki la maji');
      expect(iringa.textContent).not.toContain('Jenereta');
      expect(mbeya.textContent).toContain('Jenereta');
      expect(mbeya.textContent).toContain('Pikipiki');
      // Size shown where present; the category travels on each row.
      expect(mbeya.textContent).toContain('20HP');
      expect(mbeya.textContent).toContain('Magari');
      httpMock.verify();
    });

    it('shows the empty state for an empty register - and no total, so no NaN', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock, EMPTY_REGISTER);

      expect(testIds(fixture, 'assets-empty').length).toBe(1);
      expect(text(fixture)).toContain(ASSETS_I18N.sw.emptyTitle);
      expect(text(fixture)).toContain(ASSETS_I18N.sw.emptyMessage);
      expect(testIds(fixture, 'grand-total').length).toBe(0);
      expect(component.grandTotalCents()).toBe(0);
      expect(text(fixture)).not.toContain('NaN');
      // The form is still there: an empty register is the case it exists for.
      expect(panel(fixture, 'asset-form')).toBeTruthy();
      httpMock.verify();
    });

    it('surfaces a failed load with a retry', async () => {
      const { fixture, httpMock } = setup(ASSET_KEEPER);
      fixture.detectChanges();
      gql(httpMock, 'query Assets').flush({
        data: null,
        errors: [
          {
            message: "Huna ruhusa ya 'manage_assets'.",
            path: ['assets'],
            extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
          },
        ],
      });
      // forkJoin cancels the sibling on the first failure.
      httpMock.match((r) => r.url === environment.graphqlUrl);
      await settle(fixture);

      expect(testIds(fixture, 'load-error').length).toBe(1);
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      expect(panel(fixture, 'register')).toBeNull();
    });
  });

  describe('registering an asset', () => {
    it('sends the ids as numbers, trims the label, and refreshes the register', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        name: '  Pampu  ',
        farmId: '1',
        assetCategoryId: '5',
        cost: 1500000,
        acquiredDate: '2026-01-15',
        sizeLabel: ' 2HP ',
      });
      component.submit();

      const req = gql(httpMock, 'mutation CreateAsset(');
      // farmId and assetCategoryId are `Int!` on the mutation, although the
      // rows they were picked from carry them as `ID!` strings.
      expect(variables(req)).toEqual({
        name: 'Pampu',
        farmId: 1,
        cost: 1500000,
        acquiredDate: '2026-01-15',
        sizeLabel: '2HP',
        assetCategoryId: 5,
      });
      req.flush(CREATED_ASSET);
      await settle(fixture);

      // Only the register is re-read - the categories did not change.
      gql(httpMock, 'query Assets').flush({
        data: { assets: [CREATED_ASSET.data.createAsset, GENERATOR, MOTORBIKE, TANK] },
      });
      await settle(fixture);

      expect(component.toastMessage()).toBe(ASSETS_I18N.sw.createdToast);
      expect(component.form.getRawValue().name).toBe('');
      // Farm and category are kept for the next entry; the date goes back to today.
      expect(component.form.getRawValue().farmId).toBe('1');
      expect(component.form.getRawValue().acquiredDate).toBe(component.today);
      expect(text(fixture)).toContain('Pampu');
      httpMock.verify();
    });

    it('sends a blank size label as null, not as an empty string', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        name: 'Boti',
        farmId: '2',
        assetCategoryId: '6',
        cost: '250000.5',
        acquiredDate: '2025-01-01',
        sizeLabel: '   ',
      });
      component.submit();

      const req = gql(httpMock, 'mutation CreateAsset(');
      expect(variables(req)).toMatchObject({ farmId: 2, assetCategoryId: 6, cost: 250000.5 });
      expect((variables(req) as { sizeLabel: unknown }).sizeLabel).toBeNull();
      req.flush(CREATED_ASSET);
      await settle(fixture);
      gql(httpMock, 'query Assets').flush(REGISTER);
      httpMock.verify();
    });

    it('defaults the date to today in the farm day, and caps the picker there', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      expect(component.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(component.form.getRawValue().acquiredDate).toBe(component.today);
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '#asset-date',
      );
      expect(input?.max).toBe(component.today);
      httpMock.verify();
    });

    it('refuses a future acquired date before spending a request', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      fill(fixture, {
        name: 'Trekta',
        farmId: '1',
        assetCategoryId: '6',
        cost: 9000000,
        acquiredDate: '2999-01-01',
      });
      component.submit();
      fixture.detectChanges();

      expect(component.dateError()).toBe(ASSETS_I18N.sw.errorDateFuture);
      expect(text(fixture)).toContain(ASSETS_I18N.sw.errorDateFuture);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('surfaces the backend refusal of a future date in its own words', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      // The client thinks this is today; the server's clock disagrees.
      fill(fixture, {
        name: 'Trekta',
        farmId: '1',
        assetCategoryId: '6',
        cost: 9000000,
        acquiredDate: component.today,
      });
      component.submit();
      gql(httpMock, 'mutation CreateAsset(').flush(FUTURE_DATE_REFUSAL);
      await settle(fixture);

      expect(component.formError()).toBe(FUTURE_DATE_REFUSAL.errors[0].message);
      expect(testIds(fixture, 'form-error')[0].textContent).toContain('haiwezi kuwa ya baadaye');
      // Nothing was re-read: the register did not change.
      httpMock.verify();
    });

    it('names every missing or bad field at once, and sends nothing', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER, { farmId: null });
      await load(fixture, httpMock);

      fill(fixture, {
        name: ' ',
        farmId: '',
        assetCategoryId: '',
        cost: 0,
        sizeLabel: 'x'.repeat(81),
      });
      component.submit();

      const t = ASSETS_I18N.sw;
      expect(component.nameError()).toBe(t.errorNameRequired);
      expect(component.farmError()).toBe(t.errorFarmRequired);
      expect(component.categoryError()).toBe(t.errorCategoryRequired);
      expect(component.costError()).toBe(t.errorCostPositive);
      expect(component.sizeError()).toBe(t.errorSizeTooLong);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });
  });

  describe('the farm select', () => {
    it('offers every myFarms farm in order, and preselects the caller current farm', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER, { farmId: 2 });
      await load(fixture, httpMock);

      expect(component.farmOptions()).toEqual([MBEYA, IRINGA, DODOMA]);
      expect(component.form.getRawValue().farmId).toBe('2');
      const options = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
          '#asset-farm option',
        ),
      ].map((o) => o.textContent?.trim());
      expect(options).toEqual([
        ASSETS_I18N.sw.fieldFarmPlaceholder,
        'Shamba la Mbeya',
        'Shamba la Iringa',
        'Shamba la Dodoma',
      ]);
      httpMock.verify();
    });

    it('registers the first asset of a farm that has none yet, farmId as a number', async () => {
      // manage_farms held, and /api/farms STILL not asked: myFarms is the only source.
      const { fixture, component, httpMock } = setup([...ASSET_KEEPER, 'manage_farms']);
      await load(fixture, httpMock);

      expect(component.groups().some((g) => g.farmId === DODOMA.farmId)).toBe(false);
      fill(fixture, {
        name: 'Boti',
        farmId: DODOMA.farmId,
        assetCategoryId: '6',
        cost: 500000,
        acquiredDate: '2026-01-01',
      });
      component.submit();

      const req = gql(httpMock, 'mutation CreateAsset(');
      expect(variables(req)).toMatchObject({ farmId: 3 });
      req.flush({
        data: { createAsset: { ...CREATED_ASSET.data.createAsset, farm: DODOMA } },
      });
      await settle(fixture);
      gql(httpMock, 'query Assets').flush(REGISTER);
      httpMock.expectNone(`${environment.apiUrl}/farms`);
      httpMock.verify();
    });

    it('preselects the only farm when the /me farm is not one of them', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER, { farmId: 9 });
      await load(fixture, httpMock, EMPTY_REGISTER, CATEGORIES, {
        data: { myFarms: [DODOMA] },
      });

      expect(component.farmOptions()).toEqual([DODOMA]);
      expect(component.form.getRawValue().farmId).toBe('3');
      httpMock.verify();
    });

    it('guides a caller with no farm at all instead of showing the form', async () => {
      const { fixture, httpMock } = setup(ASSET_KEEPER, { farmId: null });
      await load(fixture, httpMock, EMPTY_REGISTER, CATEGORIES, NO_FARMS);

      expect(panel(fixture, 'no-farm')).toBeTruthy();
      expect(panel(fixture, 'asset-form')).toBeNull();
      expect(text(fixture)).toContain(ASSETS_I18N.sw.noFarmMessage);
      httpMock.verify();
    });
  });

  describe('categories', () => {
    it('with none yet, guides to create one first and hides the asset form', async () => {
      const { fixture, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock, EMPTY_REGISTER, NO_CATEGORIES);

      expect(panel(fixture, 'needs-category')).toBeTruthy();
      expect(panel(fixture, 'asset-form')).toBeNull();
      expect(panel(fixture, 'categories')).toBeTruthy();
      expect(testIds(fixture, 'no-categories').length).toBe(1);
      // The register's own empty state points at categories first, too.
      expect(text(fixture)).toContain(ASSETS_I18N.sw.emptyMessageNoCategories);
      httpMock.verify();
    });

    it('creates a category, re-reads the catalogue, and selects it in the form', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock, EMPTY_REGISTER, NO_CATEGORIES);

      component.categoryForm.setValue({ name: '  Majengo  ' });
      component.submitCategory();

      const req = gql(httpMock, 'mutation CreateAssetCategory(');
      expect(variables(req)).toEqual({ name: 'Majengo' });
      req.flush({ data: { createAssetCategory: { assetCategoryId: '9', name: 'Majengo' } } });
      await settle(fixture);

      gql(httpMock, 'query AssetCategories').flush({
        data: { assetCategories: [{ assetCategoryId: '9', name: 'Majengo' }] },
      });
      await settle(fixture);

      expect(component.toastMessage()).toBe(ASSETS_I18N.sw.categoryCreatedToast);
      expect(component.form.getRawValue().assetCategoryId).toBe('9');
      // The guidance is gone and the form is there.
      expect(panel(fixture, 'needs-category')).toBeNull();
      expect(panel(fixture, 'asset-form')).toBeTruthy();
      httpMock.verify();
    });

    it('names a duplicate with our "jina limechukuliwa" copy', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      component.categoryForm.setValue({ name: 'Mashine' });
      component.submitCategory();
      gql(httpMock, 'mutation CreateAssetCategory(').flush(DUPLICATE_CATEGORY);
      await settle(fixture);

      expect(component.categoryNameError()).toBe(ASSETS_I18N.sw.errorCategoryTaken);
      expect(text(fixture).toLowerCase()).toContain('jina limechukuliwa');
      // Nothing re-read: the catalogue did not change.
      httpMock.verify();
    });

    it('says the duplicate in English too', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER, { lang: 'en' });
      await load(fixture, httpMock);

      component.categoryForm.setValue({ name: 'Mashine' });
      component.submitCategory();
      gql(httpMock, 'mutation CreateAssetCategory(').flush(DUPLICATE_CATEGORY);
      await settle(fixture);

      expect(component.categoryNameError()).toBe(ASSETS_I18N.en.errorCategoryTaken);
      httpMock.verify();
    });

    it('refuses a blank category name without a request', async () => {
      const { fixture, component, httpMock } = setup(ASSET_KEEPER);
      await load(fixture, httpMock);

      component.categoryForm.setValue({ name: '   ' });
      component.submitCategory();

      expect(component.categoryNameError()).toBe(ASSETS_I18N.sw.errorCategoryNameRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });
  });

  /** Against the REAL route table - the wiring is what is being checked. */
  describe('the route gate', () => {
    const assetsRoute = (): Route => {
      const route = routes.find((r) => r.path === 'assets');
      if (!route) {
        throw new Error('assets is not in the route table');
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

      const guard = assetsRoute().canActivate?.[0] as CanActivateFn | undefined;
      if (typeof guard !== 'function') {
        throw new Error('assets has no CanActivateFn');
      }
      const result = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return firstValueFrom(isObservable(result) ? result : of(result));
    }

    it('lets a manage_assets holder in', async () => {
      expect(await runGuard(ASSET_KEEPER)).toBe(true);
    });

    it('turns away anyone without manage_assets', async () => {
      // No manage_farms here: a farmless holder of that lands on /farms
      // instead (AuthService.landingUrl), which is not what this pins.
      const result = await runGuard(['view_dashboard', 'manage_species', 'manage_feed_stock']);

      expect(result).not.toBe(true);
      expect(result).toEqual(TestBed.inject(Router).parseUrl('/dashboard'));
    });
  });

  describe('language', () => {
    it('renders in English when that is the UI language', async () => {
      const { fixture, httpMock } = setup(ASSET_KEEPER, { lang: 'en' });
      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Asset Register');
      expect(text(fixture)).toContain('Company total (all farms)');
      expect(text(fixture)).toContain('2 assets');
      httpMock.verify();
    });

    it('carries exactly the same keys in both languages', () => {
      const sw = Object.keys(ASSETS_I18N.sw).sort();
      const en = Object.keys(ASSETS_I18N.en).sort();
      expect(en).toEqual(sw);
    });
  });
});
