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
import { FeedCatalog } from './feed-catalog';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth';
import { FEED_CATALOG_I18N } from './feed-catalog.i18n';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Catalogue rows in the shape `schema.graphqls` defines: `feedTypeId` is `ID!`
 * and therefore a STRING on the wire, both ages are `Int!`, and `active` is a
 * real field rather than something inferred from the row's presence.
 *
 * The window ends are inclusive, which is why fry feed is 0-0 rather than 0-1.
 */
const FRY_FEED = {
  feedTypeId: '1',
  name: 'Pellet 1mm',
  minAgeMonths: 0,
  maxAgeMonths: 0,
  active: true,
};
const GROWER_FEED = {
  feedTypeId: '3',
  name: 'Pellet 3mm',
  minAgeMonths: 2,
  maxAgeMonths: 4,
  active: true,
};
/** A retired type. It is still in the catalogue - old feedings point at it. */
const RETIRED_FEED = {
  feedTypeId: '7',
  name: 'Pellet 9mm',
  minAgeMonths: 12,
  maxAgeMonths: 24,
  active: false,
};

const CATALOG = { data: { feedTypes: [FRY_FEED, GROWER_FEED, RETIRED_FEED] } };
const EMPTY_CATALOG = { data: { feedTypes: [] } };

const CREATED = {
  data: {
    createFeedType: {
      feedTypeId: '9',
      name: 'Pellet 5mm',
      minAgeMonths: 5,
      maxAgeMonths: 8,
      active: true,
    },
  },
};

/**
 * A duplicate name. The column is `VARCHAR(80) NOT NULL UNIQUE`, so the
 * refusal is a database integrity violation, which
 * `GraphQlExceptionResolver` maps to CONFLICT with its OWN generic sentence -
 * the backend never names the field. That is exactly why the screen has to
 * supply the copy, and why this fixture's message is the generic one.
 */
const DUPLICATE_NAME = {
  data: null,
  errors: [
    {
      message: 'Taarifa hizi zinagongana na zilizopo tayari.',
      path: ['createFeedType'],
      extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
    },
  ],
};

/**
 * The backend's own max<min refusal, which NAMES BOTH NUMBERS. The form
 * normally catches this first; this is the path for when it does not, and the
 * point of the test is that the specific sentence survives rather than being
 * replaced by a generic line.
 */
const MAX_BELOW_MIN = {
  data: null,
  errors: [
    {
      message: 'Umri wa juu (2) hauwezi kuwa chini ya umri wa chini (6).',
      path: ['createFeedType'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

const UPDATED = {
  data: {
    updateFeedType: {
      feedTypeId: '3',
      name: 'Pellet 3mm XL',
      minAgeMonths: 2,
      maxAgeMonths: 9,
      active: true,
    },
  },
};

const DISABLED = {
  data: { setFeedTypeActive: { ...GROWER_FEED, active: false } },
};

const DELETED = { data: { deleteFeedType: true } };

/**
 * The delete refusal. The message is the BACKEND'S and it breaks the count
 * down by kind - that breakdown is the only thing telling an admin whether
 * the type is genuinely in service, so the screen shows it verbatim.
 */
const IN_USE = {
  data: null,
  errors: [
    {
      message:
        'Aina hii inatumika kwenye rekodi 8 (ulishaji 3, manunuzi 1, leja 4). ' +
        'Haiwezi kufutwa - izime badala yake.',
      path: ['deleteFeedType'],
      extensions: { errorCode: 'FEED_TYPE_IN_USE', classification: 'BAD_REQUEST' },
    },
  ],
};

/** A caller without `manage_feed_stock` reaching the list. HTTP 200 + errors[]. */
const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'manage_feed_stock'.",
      path: ['feedTypes'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';

const CATALOG_MANAGER = ['view_dashboard', 'manage_feed_stock'];

function setup(permissions: string[], options: { lang?: Lang } = {}) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

  const fixture = TestBed.createComponent(FeedCatalog);
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

const text = (fixture: ComponentFixture<FeedCatalog>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<FeedCatalog>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

const testId = (fixture: ComponentFixture<FeedCatalog>, id: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

async function load(
  fixture: ComponentFixture<FeedCatalog>,
  httpMock: HttpTestingController,
  response: object = CATALOG,
) {
  fixture.detectChanges();
  gql(httpMock, 'query FeedTypes(').flush(response);
  await fixture.whenStable();
  fixture.detectChanges();
}

/**
 * Opens one row's action menu and returns its items as text.
 *
 * The sheet is rendered only while open (see ActionMenu), so reading the
 * labels means clicking the trigger, exactly as a user does.
 */
function openMenu(fixture: ComponentFixture<FeedCatalog>, rowIndex: number): string {
  const menus = (fixture.nativeElement as HTMLElement).querySelectorAll('app-action-menu');
  const trigger = menus[rowIndex].querySelector('button') as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
  return (menus[rowIndex].textContent ?? '').replace(/\s+/g, ' ');
}

/** Fills the form the way the DOM does - the age boxes are `type="number"`. */
function fill(
  fixture: ComponentFixture<FeedCatalog>,
  values: { name: string; minAgeMonths: number | string; maxAgeMonths: number | string },
) {
  fixture.componentInstance.form.setValue({
    name: values.name,
    // Cast because the control is DECLARED string while
    // NumberValueAccessor actually writes a number - the same split the
    // component's parseAge exists to absorb. Driving it with real numbers is
    // what makes this test resemble the browser rather than the type.
    minAgeMonths: values.minAgeMonths as string,
    maxAgeMonths: values.maxAgeMonths as string,
  });
  fixture.detectChanges();
}

describe('FeedCatalog', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the list', () => {
    it('renders every type with its age window and status', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);

      await load(fixture, httpMock);

      expect(component.feedTypes().length).toBe(3);
      const body = text(fixture);
      expect(body).toContain('Pellet 1mm');
      expect(body).toContain('Pellet 3mm');
      // The window, both ends inclusive, exactly as the task asks it be shown.
      expect(body).toContain('miezi 0-0');
      expect(body).toContain('miezi 2-4');
      httpMock.verify();
    });

    it('asks for the WHOLE catalogue, retired types included', async () => {
      const { fixture, httpMock } = setup(CATALOG_MANAGER);

      fixture.detectChanges();
      const req = gql(httpMock, 'query FeedTypes(');

      // `activeOnly: false` is the argument that makes the status column mean
      // something. Omitting it would return active types only, and the column
      // could then only ever say "active".
      expect(
        (req.request.body as { variables: { activeOnly: boolean } }).variables.activeOnly,
      ).toBe(false);

      req.flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Pellet 9mm');
      expect(text(fixture)).toContain('Imezimwa');
    });

    it('shows the empty state, and it points at the form below', async () => {
      const { fixture, httpMock } = setup(CATALOG_MANAGER);

      await load(fixture, httpMock, EMPTY_CATALOG);

      expect(text(fixture)).toContain(FEED_CATALOG_I18N.sw.emptyTitle);
      // The form is still there: an empty catalogue is the case it exists for.
      expect(panel(fixture, 'create-form')).toBeTruthy();
      httpMock.verify();
    });

    it('surfaces a failed load with a retry that re-asks', async () => {
      const { fixture, httpMock } = setup(CATALOG_MANAGER);

      await load(fixture, httpMock, FORBIDDEN);

      expect(testId(fixture, 'load-error')).toBeTruthy();
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      // The list is gone with the failure, and so is the form - there is
      // nothing to add to a catalogue that could not be read.
      expect(panel(fixture, 'catalog-list')).toBeNull();

      fixture.componentInstance.fetch();
      fixture.detectChanges();
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Pellet 3mm');
      httpMock.verify();
    });
  });

  describe('registering a type', () => {
    it('sends the three arguments the schema declares, and refreshes on success', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: '  Pellet 5mm  ', minAgeMonths: 5, maxAgeMonths: 8 });
      component.submit();

      const req = gql(httpMock, 'mutation CreateFeedType');
      // FLAT VARIABLES, not an `input` object: `createFeedType(name:,
      // minAgeMonths:, maxAgeMonths:)` is what schema.graphqls declares, and
      // an input object here would fail at the server every time.
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        name: 'Pellet 5mm',
        minAgeMonths: 5,
        maxAgeMonths: 8,
      });
      req.flush(CREATED);
      await fixture.whenStable();
      fixture.detectChanges();

      // The list is re-read rather than patched: the backend is the authority
      // on what the catalogue now holds.
      gql(httpMock, 'query FeedTypes(').flush({
        data: { feedTypes: [FRY_FEED, GROWER_FEED, RETIRED_FEED, CREATED.data.createFeedType] },
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.form.getRawValue().name).toBe('');
      expect(component.toastMessage()).toBe(FEED_CATALOG_I18N.sw.createdToast);
      expect(text(fixture)).toContain('Pellet 5mm');
      httpMock.verify();
    });

    it('accepts a 0-0 window - fry feed is a real entry, not a blank form', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Crumble', minAgeMonths: 0, maxAgeMonths: 0 });
      component.submit();

      const req = gql(httpMock, 'mutation CreateFeedType');
      expect((req.request.body as { variables: { minAgeMonths: number } }).variables).toEqual({
        name: 'Crumble',
        minAgeMonths: 0,
        maxAgeMonths: 0,
      });
      req.flush(CREATED);
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      httpMock.verify();
    });
  });

  describe('what the form refuses before spending a request', () => {
    it('blocks an empty name, and says so on the name field', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: '   ', minAgeMonths: 2, maxAgeMonths: 4 });
      component.submit();
      fixture.detectChanges();

      expect(component.nameError()).toBe(FEED_CATALOG_I18N.sw.errorNameRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a window whose top is below its bottom', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Pellet 5mm', minAgeMonths: 6, maxAgeMonths: 2 });
      component.submit();
      fixture.detectChanges();

      expect(component.ageError()).toBe(FEED_CATALOG_I18N.sw.errorMaxBelowMin);
      expect(testId(fixture, 'age-error')).toBeTruthy();
      // The rule the catalogue rests on, so it is worth NOT spending a round
      // trip to be told: an inverted window fits no fish of any age.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a negative age and a fractional one, each in its own words', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Pellet 5mm', minAgeMonths: -1, maxAgeMonths: 4 });
      component.submit();
      expect(component.ageError()).toBe(FEED_CATALOG_I18N.sw.errorAgeNegative);

      fill(fixture, { name: 'Pellet 5mm', minAgeMonths: 2.5, maxAgeMonths: 4 });
      component.submit();
      // `minAgeMonths` is `Int!`, so a fraction is not a value the mutation
      // could carry at all.
      expect(component.ageError()).toBe(FEED_CATALOG_I18N.sw.errorAgeInteger);

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks an empty age box rather than reading it as zero', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      // An untouched `input[type=number]` hands over null, which must not be
      // silently registered as a feed for newborn fish.
      fill(fixture, {
        name: 'Pellet 5mm',
        minAgeMonths: null as unknown as number,
        maxAgeMonths: 4,
      });
      component.submit();
      fixture.detectChanges();

      expect(component.ageError()).toBe(FEED_CATALOG_I18N.sw.errorAgeRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });
  });

  describe('what the backend refuses', () => {
    it('names the duplicate on the name field, in the UI language', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Pellet 3mm', minAgeMonths: 2, maxAgeMonths: 4 });
      component.submit();
      gql(httpMock, 'mutation CreateFeedType').flush(DUPLICATE_NAME);
      await fixture.whenStable();
      fixture.detectChanges();

      // OUR copy, not the backend's: the unique constraint arrives as a
      // generic CONFLICT that never mentions which field clashed.
      expect(component.nameError()).toBe(FEED_CATALOG_I18N.sw.errorNameTaken);
      expect(text(fixture)).toContain('tayari ipo kwenye katalogi');
      // Nothing was re-read: the catalogue did not change.
      httpMock.verify();
    });

    it('keeps the backend sentence for max<min, because it names both numbers', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      // Reaching the mutation with an inverted window takes bypassing the
      // form's own check - which is the case this handles.
      fill(fixture, { name: 'Pellet 5mm', minAgeMonths: 6, maxAgeMonths: 8 });
      component.submit();
      gql(httpMock, 'mutation CreateFeedType').flush(MAX_BELOW_MIN);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.ageError()).toBe('Umri wa juu (2) hauwezi kuwa chini ya umri wa chini (6).');
      httpMock.verify();
    });

    it('falls back to the shared copy for anything else', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      fill(fixture, { name: 'Pellet 5mm', minAgeMonths: 5, maxAgeMonths: 8 });
      component.submit();
      gql(httpMock, 'mutation CreateFeedType').flush({
        data: null,
        errors: [
          {
            message: "Huna ruhusa ya 'manage_feed_stock'.",
            path: ['createFeedType'],
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

  describe('the actions column', () => {
    it('gives every row an actions menu', async () => {
      const { fixture, httpMock } = setup(CATALOG_MANAGER);

      await load(fixture, httpMock);

      const triggers = (fixture.nativeElement as HTMLElement).querySelectorAll('app-action-menu');
      expect(triggers.length).toBe(3);
      httpMock.verify();
    });

    it('labels the toggle from the row own state', async () => {
      const { fixture, httpMock } = setup(CATALOG_MANAGER);

      await load(fixture, httpMock);

      // The sheet only renders while it is open, so each row's menu has to be
      // opened to read its items - the same as using it.
      const activeRow = openMenu(fixture, 0);
      // One item, both directions: the label is the action available on THIS
      // row, so an active type offers Zima...
      expect(activeRow).toContain(FEED_CATALOG_I18N.sw.deactivate);
      expect(activeRow).not.toContain(FEED_CATALOG_I18N.sw.activate);

      // ...and a retired one offers Rudisha, from the same single item.
      const retiredRow = openMenu(fixture, 2);
      expect(retiredRow).toContain(FEED_CATALOG_I18N.sw.activate);

      // Both rows offer the rest of the CRUD either way.
      expect(retiredRow).toContain(FEED_CATALOG_I18N.sw.edit);
      expect(retiredRow).toContain(FEED_CATALOG_I18N.sw.delete);
      httpMock.verify();
    });
  });

  describe('editing a type', () => {
    it('opens seeded from the row, and sends updateFeedType', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.openEdit(GROWER_FEED);
      fixture.detectChanges();

      // Seeded from the row, not left blank.
      expect(component.form.getRawValue().name).toBe('Pellet 3mm');
      expect(component.form.getRawValue().minAgeMonths).toBe('2');

      fill(fixture, { name: 'Pellet 3mm XL', minAgeMonths: 2, maxAgeMonths: 9 });
      component.submit();

      const req = gql(httpMock, 'mutation UpdateFeedType');
      // Flat variables again, with the id alongside - and NO `active`:
      // enabling/disabling is a separate mutation on purpose.
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        feedTypeId: 3,
        name: 'Pellet 3mm XL',
        minAgeMonths: 2,
        maxAgeMonths: 9,
      });
      req.flush(UPDATED);
      await fixture.whenStable();
      fixture.detectChanges();

      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.editTarget()).toBeNull();
      expect(component.toastMessage()).toBe(FEED_CATALOG_I18N.sw.savedToast);
      httpMock.verify();
    });

    it('applies the SAME validation the register form does', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.openEdit(GROWER_FEED);
      fill(fixture, { name: 'Pellet 3mm', minAgeMonths: 9, maxAgeMonths: 2 });
      component.submit();
      fixture.detectChanges();

      // One form, one set of rules - the point of sharing the controls.
      expect(component.ageError()).toBe(FEED_CATALOG_I18N.sw.errorMaxBelowMin);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('names a duplicate on the name field and keeps the modal open', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.openEdit(GROWER_FEED);
      fill(fixture, { name: 'Pellet 1mm', minAgeMonths: 2, maxAgeMonths: 4 });
      component.submit();
      gql(httpMock, 'mutation UpdateFeedType').flush(DUPLICATE_NAME);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.nameError()).toBe(FEED_CATALOG_I18N.sw.errorNameTaken);
      // Stays open, so the name can be fixed where it was typed.
      expect(component.editTarget()).not.toBeNull();
      httpMock.verify();
    });

    it('closing clears the form so the register form is not left dirty', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.openEdit(GROWER_FEED);
      component.closeEdit();
      fixture.detectChanges();

      expect(component.editTarget()).toBeNull();
      expect(component.form.getRawValue().name).toBe('');
      httpMock.verify();
    });
  });

  describe('disabling and enabling', () => {
    it('sends setFeedTypeActive(false) and refreshes, with no confirmation', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.toggleActive(GROWER_FEED);

      const req = gql(httpMock, 'mutation SetFeedTypeActive');
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        feedTypeId: 3,
        active: false,
      });
      req.flush(DISABLED);
      await fixture.whenStable();
      fixture.detectChanges();

      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe(FEED_CATALOG_I18N.sw.deactivatedToast);
      httpMock.verify();
    });

    it('sends active: true for a row that is already disabled', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.toggleActive(RETIRED_FEED);

      const req = gql(httpMock, 'mutation SetFeedTypeActive');
      expect((req.request.body as { variables: { active: boolean } }).variables.active).toBe(true);
      req.flush({ data: { setFeedTypeActive: { ...RETIRED_FEED, active: true } } });
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe(FEED_CATALOG_I18N.sw.activatedToast);
      httpMock.verify();
    });
  });

  describe('deleting a type', () => {
    it('asks first, then sends deleteFeedType and refreshes', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.askDelete(FRY_FEED);
      fixture.detectChanges();
      // Nothing is sent on merely asking.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);

      component.confirmDelete();
      const req = gql(httpMock, 'mutation DeleteFeedType');
      expect((req.request.body as { variables: unknown }).variables).toEqual({ feedTypeId: 1 });
      req.flush(DELETED);
      await fixture.whenStable();
      fixture.detectChanges();

      gql(httpMock, 'query FeedTypes(').flush({ data: { feedTypes: [GROWER_FEED, RETIRED_FEED] } });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.deleteTarget()).toBeNull();
      expect(component.toastMessage()).toBe(FEED_CATALOG_I18N.sw.deletedToast);
      expect(text(fixture)).not.toContain('Pellet 1mm');
      httpMock.verify();
    });

    it('surfaces FEED_TYPE_IN_USE verbatim, because it names the breakdown', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.askDelete(GROWER_FEED);
      component.confirmDelete();
      gql(httpMock, 'mutation DeleteFeedType').flush(IN_USE);
      await fixture.whenStable();
      fixture.detectChanges();

      // The backend own sentence - the per-kind counts are the whole value of
      // it, and no generic line could carry them.
      expect(component.actionErrorMessage()).toContain('ulishaji 3, manunuzi 1, leja 4');
      expect(component.actionErrorMessage()).toContain('izime');
      expect(testId(fixture, 'action-error')).toBeTruthy();

      // The dialog closed: the refusal is a DIFFERENT question, not a retry of
      // the same one, so it belongs in the banner.
      expect(component.deleteTarget()).toBeNull();
      // Nothing was re-read - the catalogue did not change.
      httpMock.verify();
    });

    it('dismisses the refusal banner on request', async () => {
      const { fixture, component, httpMock } = setup(CATALOG_MANAGER);
      await load(fixture, httpMock);

      component.askDelete(GROWER_FEED);
      component.confirmDelete();
      gql(httpMock, 'mutation DeleteFeedType').flush(IN_USE);
      await fixture.whenStable();
      fixture.detectChanges();

      component.dismissActionError();
      fixture.detectChanges();

      expect(testId(fixture, 'action-error')).toBeNull();
      httpMock.verify();
    });
  });

  /**
   * The route gate, run against the REAL route table rather than a guard built
   * in the test - what is being checked is the wiring, and a guard constructed
   * here would pass whatever app.routes.ts actually says.
   */
  describe('the route gate', () => {
    const feedCatalogRoute = (): Route => {
      const route = routes.find((r) => r.path === 'feed-catalog');
      if (!route) {
        throw new Error('feed-catalog is not in the route table');
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

      // `canActivate` is typed as the union of the functional and the legacy
      // class guard. This route uses the functional form (permissionGuard
      // returns one), and the cast says so rather than pretending the class
      // form is handled here.
      const guard = feedCatalogRoute().canActivate?.[0] as CanActivateFn | undefined;
      if (typeof guard !== 'function') {
        throw new Error('feed-catalog has no CanActivateFn');
      }
      const result = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return firstValueFrom(isObservable(result) ? result : of(result));
    }

    it('lets a manage_feed_stock holder in', async () => {
      expect(await runGuard(CATALOG_MANAGER)).toBe(true);
    });

    it('turns a feeder away - view_feed_stock is not enough', async () => {
      // The permission that SEES the stock panel is not the one that writes
      // the catalogue, and this is the line between them: a feeder holding
      // both feed codes still has no business here.
      const result = await runGuard(['view_dashboard', 'log_feeding', 'view_feed_stock']);

      expect(result).not.toBe(true);
      expect(result).toEqual(TestBed.inject(Router).parseUrl('/dashboard'));
    });
  });

  describe('language', () => {
    it('renders in English when that is the UI language', async () => {
      const { fixture, httpMock } = setup(CATALOG_MANAGER, { lang: 'en' });

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Feed Catalogue');
      expect(text(fixture)).toContain('months 2-4');
      httpMock.verify();
    });

    it('carries exactly the same keys in both languages', () => {
      // A key in one and not the other renders as `undefined` on somebody's
      // screen, and nothing in the build would notice.
      const sw = Object.keys(FEED_CATALOG_I18N.sw).sort();
      const en = Object.keys(FEED_CATALOG_I18N.en).sort();
      expect(en).toEqual(sw);
    });
  });
});
