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
import { SpeciesScreen } from './species';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth';
import { SPECIES_I18N } from './species.i18n';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Catalogue rows in the shape `schema.graphqls` defines: `speciesId` is `ID!`
 * and therefore a STRING on the wire, while both numbers are `Float!` - not
 * Int - which is what lets `growthMonthsAvg` carry a half-month.
 */
const TILAPIA = {
  speciesId: '1',
  name: 'Sato',
  growthMonthsAvg: 6,
  avgHarvestWeightKg: 0.45,
};
/**
 * The fixture that matters most on this screen: NUMERIC(4,1) keeps the tenth,
 * and a species that takes six and a half months is an ordinary case, not an
 * edge one.
 */
const CATFISH = {
  speciesId: '2',
  name: 'Kambale',
  growthMonthsAvg: 6.5,
  avgHarvestWeightKg: 1.25,
};

const CATALOG = { data: { species: [TILAPIA, CATFISH] } };
const EMPTY_CATALOG = { data: { species: [] } };

const CREATED = {
  data: {
    createSpecies: {
      speciesId: '9',
      name: 'Perege',
      growthMonthsAvg: 6.5,
      avgHarvestWeightKg: 0.8,
    },
  },
};

/**
 * A duplicate name. Unlike the feed catalogue's, this CONFLICT is raised by
 * `SpeciesService.requireAvailableName` rather than by a database integrity
 * violation, so the sentence is specific - but it still does not mention the
 * part that confuses people, which is why the screen supplies its own copy:
 * the count includes SOFT-DELETED rows, so a name that was used and removed
 * is still taken.
 */
const DUPLICATE_NAME = {
  data: null,
  errors: [
    {
      message: 'Aina ya samaki yenye jina hili tayari ipo.',
      path: ['createSpecies'],
      extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
    },
  ],
};

/**
 * The backend's own >0 refusal, which NAMES THE FIELD. The form normally
 * catches this first; this is the path for when it does not, and the point of
 * the test is that the specific sentence survives rather than being replaced
 * by a generic line.
 */
const NOT_POSITIVE = {
  data: null,
  errors: [
    {
      message: "Thamani ya 'Muda wa kukua (miezi)' lazima iwe zaidi ya sifuri.",
      path: ['createSpecies'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

/**
 * The column ceiling - `NUMERIC(4,1)` ends at 999.9. The screen deliberately
 * does NOT check this itself: the backend's sentence carries the exact limit,
 * and a second copy of the number here would be one more thing to keep in
 * sync.
 */
const OUT_OF_RANGE = {
  data: null,
  errors: [
    {
      message: "Thamani ya 'Muda wa kukua (miezi)' haiwezi kuzidi 999.9.",
      path: ['createSpecies'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

/** A caller reaching the list without a session's read permission. HTTP 200 + errors[]. */
const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'view_dashboard'.",
      path: ['species'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';

/** What the screen is built for: the read AND the write. */
const SPECIES_MANAGER = ['view_dashboard', 'manage_species'];

function setup(permissions: string[], options: { lang?: Lang } = {}) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

  const fixture = TestBed.createComponent(SpeciesScreen);
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

const text = (fixture: ComponentFixture<SpeciesScreen>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<SpeciesScreen>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

const testId = (fixture: ComponentFixture<SpeciesScreen>, id: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

/** The same locale formatting the screen uses, so assertions are not en-US only. */
const dec = (value: number, digits: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

async function load(
  fixture: ComponentFixture<SpeciesScreen>,
  httpMock: HttpTestingController,
  response: object = CATALOG,
) {
  fixture.detectChanges();
  gql(httpMock, 'query Species').flush(response);
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Fills the form the way the DOM does - both number boxes are `type="number"`. */
function fill(
  fixture: ComponentFixture<SpeciesScreen>,
  values: {
    name: string;
    growthMonthsAvg: number | string;
    avgHarvestWeightKg: number | string;
  },
) {
  fixture.componentInstance.form.setValue({
    name: values.name,
    // Cast because the controls are DECLARED string while NumberValueAccessor
    // actually writes a number - the same split the component's parseDecimal
    // exists to absorb. Driving them with real numbers is what makes this
    // resemble the browser rather than the type.
    growthMonthsAvg: values.growthMonthsAvg as string,
    avgHarvestWeightKg: values.avgHarvestWeightKg as string,
  });
  fixture.detectChanges();
}

describe('SpeciesScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the list', () => {
    it('renders every species with its growth months and harvest weight', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);

      await load(fixture, httpMock);

      expect(component.species().length).toBe(2);
      const body = text(fixture);
      expect(body).toContain('Sato');
      expect(body).toContain('Kambale');
      expect(body).toContain(SPECIES_I18N.sw.colGrowthMonths);
      expect(body).toContain(`miezi ${dec(6, 1)}`);
      expect(body).toContain(dec(0.45, 2));
      httpMock.verify();
    });

    it('SHOWS the half-month rather than rounding it into the column', async () => {
      const { fixture, httpMock } = setup(SPECIES_MANAGER);

      await load(fixture, httpMock);

      // 6.5 is the value the backend stored and the value that computes every
      // expectedHarvestDate for this species. A column printing "7" would be
      // telling the farmer a fortnight it does not have.
      expect(text(fixture)).toContain(`miezi ${dec(6.5, 1)}`);
      // And a whole number is not padded to "6.0" either.
      expect(text(fixture)).not.toContain('6.0');
      httpMock.verify();
    });

    it('shows the empty state, and it points at the form below', async () => {
      const { fixture, httpMock } = setup(SPECIES_MANAGER);

      await load(fixture, httpMock, EMPTY_CATALOG);

      expect(text(fixture)).toContain(SPECIES_I18N.sw.emptyTitle);
      // The form is still there: an empty catalogue is the case it exists for.
      expect(panel(fixture, 'create-form')).toBeTruthy();
      httpMock.verify();
    });

    it('surfaces a failed load with a retry that re-asks', async () => {
      const { fixture, httpMock } = setup(SPECIES_MANAGER);

      await load(fixture, httpMock, FORBIDDEN);

      expect(testId(fixture, 'load-error')).toBeTruthy();
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      // The list is gone with the failure, and so is the form - there is
      // nothing to add to a catalogue that could not be read.
      expect(panel(fixture, 'species-list')).toBeNull();

      fixture.componentInstance.fetch();
      fixture.detectChanges();
      gql(httpMock, 'query Species').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Kambale');
      httpMock.verify();
    });
  });

  describe('registering a species', () => {
    it('sends the three arguments the schema declares, and refreshes on success', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: '  Perege  ', growthMonthsAvg: 6.5, avgHarvestWeightKg: 0.8 });
      component.submit();

      const req = gql(httpMock, 'mutation CreateSpecies');
      // FLAT VARIABLES, not an `input` object: `createSpecies(name:,
      // growthMonthsAvg:, avgHarvestWeightKg:)` is what schema.graphqls
      // declares, and an input object here would fail at the server every time.
      //
      // AND 6.5 IS STILL 6.5. This is the assertion the whole screen exists
      // around: the argument is `Float!`, the column is NUMERIC(4,1), and a
      // client that rounded here would move the species' every predicted
      // harvest date by a fortnight before the backend ever saw the number.
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        name: 'Perege',
        growthMonthsAvg: 6.5,
        avgHarvestWeightKg: 0.8,
      });
      req.flush(CREATED);
      await fixture.whenStable();
      fixture.detectChanges();

      // The list is re-read rather than patched: the backend is the authority
      // on what the catalogue now holds.
      gql(httpMock, 'query Species').flush({
        data: { species: [TILAPIA, CATFISH, CREATED.data.createSpecies] },
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.form.getRawValue().name).toBe('');
      expect(component.form.getRawValue().growthMonthsAvg).toBe('');
      expect(component.form.getRawValue().avgHarvestWeightKg).toBe('');
      expect(component.toastMessage()).toBe(SPECIES_I18N.sw.createdToast);
      expect(text(fixture)).toContain('Perege');
      httpMock.verify();
    });

    it('keeps a two-decimal harvest weight, which is what NUMERIC(6,2) holds', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Kambale mkubwa', growthMonthsAvg: 10, avgHarvestWeightKg: 1.25 });
      component.submit();

      const req = gql(httpMock, 'mutation CreateSpecies');
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        name: 'Kambale mkubwa',
        growthMonthsAvg: 10,
        avgHarvestWeightKg: 1.25,
      });
      req.flush(CREATED);
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query Species').flush(CATALOG);
      httpMock.verify();
    });
  });

  describe('what the form refuses before spending a request', () => {
    it('blocks an empty name, and says so on the name field', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: '   ', growthMonthsAvg: 6.5, avgHarvestWeightKg: 0.8 });
      component.submit();
      fixture.detectChanges();

      expect(component.nameError()).toBe(SPECIES_I18N.sw.errorNameRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks growth months of zero', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      // Zero months is not a fast species, it is a species no cycle could ever
      // use: CycleService refuses to compute a harvest date from it.
      fill(fixture, { name: 'Perege', growthMonthsAvg: 0, avgHarvestWeightKg: 0.8 });
      component.submit();
      fixture.detectChanges();

      expect(component.growthError()).toBe(SPECIES_I18N.sw.errorGrowthPositive);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a negative growth month', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Perege', growthMonthsAvg: -6.5, avgHarvestWeightKg: 0.8 });
      component.submit();
      fixture.detectChanges();

      expect(component.growthError()).toBe(SPECIES_I18N.sw.errorGrowthPositive);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a harvest weight of zero, on its own field', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Perege', growthMonthsAvg: 6.5, avgHarvestWeightKg: 0 });
      component.submit();
      fixture.detectChanges();

      expect(component.weightError()).toBe(SPECIES_I18N.sw.errorWeightPositive);
      // The months were fine, so nothing is said about them.
      expect(component.growthError()).toBeNull();
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks an empty number box rather than sending null', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Perege', growthMonthsAvg: '', avgHarvestWeightKg: 0.8 });
      component.submit();
      fixture.detectChanges();

      expect(component.growthError()).toBe(SPECIES_I18N.sw.errorGrowthRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('accepts a fraction - it is a decimal field, not a count of months', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      // The mirror of the feed catalogue's whole-months rule, and the contrast
      // is the point: there `minAgeMonths` is `Int!`, so a fraction cannot
      // travel; here the column is NUMERIC(4,1) and a fraction is the value.
      fill(fixture, { name: 'Perege', growthMonthsAvg: 6.5, avgHarvestWeightKg: 0.8 });
      component.submit();

      expect(component.growthError()).toBeNull();
      gql(httpMock, 'mutation CreateSpecies').flush(CREATED);
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query Species').flush(CATALOG);
      httpMock.verify();
    });
  });

  describe('what the backend refuses', () => {
    it('names the duplicate on the name field, and says a deleted name is still taken', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Sato', growthMonthsAvg: 6, avgHarvestWeightKg: 0.45 });
      component.submit();
      gql(httpMock, 'mutation CreateSpecies').flush(DUPLICATE_NAME);
      await fixture.whenStable();
      fixture.detectChanges();

      // OUR copy, not the backend's: the backend's sentence is specific but
      // leaves out the soft-delete, which is the case somebody staring at a
      // catalogue that plainly does not contain the name is hitting.
      expect(component.nameError()).toBe(SPECIES_I18N.sw.errorNameTaken);
      expect(text(fixture)).toContain('Hata aina iliyofutwa inabaki na jina lake');
      // Nothing was re-read: the catalogue did not change.
      httpMock.verify();
    });

    it('keeps the backend sentence for a >0 refusal, because it names the field', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      // Reaching the mutation with a non-positive number takes bypassing the
      // form's own check - which is the case this handles.
      fill(fixture, { name: 'Perege', growthMonthsAvg: 6.5, avgHarvestWeightKg: 0.8 });
      component.submit();
      gql(httpMock, 'mutation CreateSpecies').flush(NOT_POSITIVE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toBe(
        "Thamani ya 'Muda wa kukua (miezi)' lazima iwe zaidi ya sifuri.",
      );
      expect(testId(fixture, 'form-error')).toBeTruthy();
      httpMock.verify();
    });

    it('keeps the backend sentence for a range refusal, because it names the limit', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      // 1000 months is over NUMERIC(4,1). The screen does not check the
      // ceiling itself - the backend's line carries the actual number.
      fill(fixture, { name: 'Perege', growthMonthsAvg: 1000, avgHarvestWeightKg: 0.8 });
      component.submit();
      gql(httpMock, 'mutation CreateSpecies').flush(OUT_OF_RANGE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toContain('999.9');
      expect(component.nameError()).toBeNull();
      httpMock.verify();
    });

    it('falls back to the shared copy for anything else', async () => {
      const { fixture, component, httpMock } = setup(SPECIES_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Perege', growthMonthsAvg: 6.5, avgHarvestWeightKg: 0.8 });
      component.submit();
      gql(httpMock, 'mutation CreateSpecies').flush({
        data: null,
        errors: [
          {
            message: "Huna ruhusa ya 'manage_species'.",
            path: ['createSpecies'],
            extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
          },
        ],
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toContain('Huna ruhusa');
      expect(component.nameError()).toBeNull();
      httpMock.verify();
    });
  });

  /**
   * The route gate, run against the REAL route table rather than a guard built
   * in the test - what is being checked is the wiring, and a guard constructed
   * here would pass whatever app.routes.ts actually says.
   */
  describe('the route gate', () => {
    const speciesRoute = (): Route => {
      const route = routes.find((r) => r.path === 'species');
      if (!route) {
        throw new Error('species is not in the route table');
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
      // Already loaded this session, so the guard needs no /me.
      authService.ensurePermissions = () => of(authService.permissions());

      const guard = speciesRoute().canActivate?.[0] as CanActivateFn | undefined;
      if (typeof guard !== 'function') {
        throw new Error('species has no CanActivateFn');
      }
      const result = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return firstValueFrom(isObservable(result) ? result : of(result));
    }

    it('lets a manage_species holder in', async () => {
      expect(await runGuard(SPECIES_MANAGER)).toBe(true);
    });

    it('turns away a role that can only READ the catalogue', async () => {
      // The line this screen is built on: `species` is `view_dashboard`, so a
      // WORKER genuinely reads the list - on Production, where they pick from
      // it. What they do not hold is the write, and this screen is the write.
      const result = await runGuard(['view_dashboard', 'edit_cycle', 'log_feeding']);

      expect(result).not.toBe(true);
      expect(result).toEqual(TestBed.inject(Router).parseUrl('/dashboard'));
    });
  });

  describe('language', () => {
    it('renders in English when that is the UI language', async () => {
      const { fixture, httpMock } = setup(SPECIES_MANAGER, { lang: 'en' });

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Fish Species');
      expect(text(fixture)).toContain(`months ${dec(6.5, 1)}`);
      httpMock.verify();
    });

    it('carries exactly the same keys in both languages', () => {
      // A key in one and not the other renders as `undefined` on somebody's
      // screen, and nothing in the build would notice.
      const sw = Object.keys(SPECIES_I18N.sw).sort();
      const en = Object.keys(SPECIES_I18N.en).sort();
      expect(en).toEqual(sw);
    });
  });
});
