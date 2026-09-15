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
import { FeedPurchases } from './feed-purchases';
import { FEED_PURCHASES_I18N } from './feed-purchases.i18n';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Catalogue rows as `schema.graphqls` defines them - `feedTypeId` is `ID!`,
 * so it is a STRING on the wire. That matters here more than anywhere: the
 * purchase input takes `feedTypeId: Int!`, so the string has to be converted
 * on the way out, and one of the tests below is about exactly that.
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

const CATALOG = { data: { feedTypes: [FRY_FEED, GROWER_FEED] } };
const EMPTY_CATALOG = { data: { feedTypes: [] } };

/**
 * Purchases as seen by somebody WITH `view_feed_cost`: both money fields
 * carry numbers, and `totalCost` is the database's own product of the other
 * two rather than anything the client computed.
 */
const PURCHASES = {
  data: {
    feedPurchases: [
      {
        purchaseId: '11',
        purchaseDate: '2026-09-02',
        quantityKg: 50,
        unitCost: 1200,
        totalCost: 60000,
        supplier: 'Duka la Mjini',
        reversed: false,
        feedType: GROWER_FEED,
      },
      {
        purchaseId: '12',
        purchaseDate: '2026-09-01',
        quantityKg: 25,
        unitCost: 1500,
        totalCost: 37500,
        supplier: null,
        reversed: false,
        feedType: FRY_FEED,
      },
    ],
  },
};

/**
 * The SAME rows as seen by somebody WITHOUT `view_feed_cost`.
 *
 * This is what the backend actually sends - it masks in
 * FeedService.listPurchases, before the numbers leave the server - and the
 * operational fields are deliberately untouched. The row is not withheld;
 * knowing that sacks arrived is field work, their price is not.
 */
const MASKED_PURCHASES = {
  data: {
    feedPurchases: [
      {
        purchaseId: '11',
        purchaseDate: '2026-09-02',
        quantityKg: 50,
        unitCost: null,
        totalCost: null,
        supplier: 'Duka la Mjini',
        reversed: false,
        feedType: GROWER_FEED,
      },
    ],
  },
};

const EMPTY_PURCHASES = { data: { feedPurchases: [] } };

/** The mutation's answer, which the backend does NOT mask - see the service. */
const RECORDED = {
  data: {
    recordFeedPurchase: {
      purchaseId: '13',
      purchaseDate: '2026-09-05',
      quantityKg: 40,
      unitCost: 900,
      totalCost: 36000,
      supplier: 'Duka la Mjini',
      reversed: false,
      feedType: GROWER_FEED,
    },
  },
};

/** The same purchase after a correcting entry - still listed, flagged. */
const REVERSED_PURCHASE = {
  purchaseId: '11',
  purchaseDate: '2026-09-02',
  quantityKg: 50,
  unitCost: 1200,
  totalCost: 60000,
  supplier: 'Duka la Mjini',
  reversed: true,
  feedType: GROWER_FEED,
};

const PURCHASES_WITH_REVERSED = {
  data: { feedPurchases: [REVERSED_PURCHASE, PURCHASES.data.feedPurchases[1]] },
};

const REVERSED = { data: { reverseFeedPurchase: REVERSED_PURCHASE } };

const CORRECTED = {
  data: {
    correctFeedPurchase: {
      purchaseId: '14',
      purchaseDate: '2026-09-02',
      quantityKg: 35,
      unitCost: 1300,
      totalCost: 45500,
      supplier: 'Duka la Mjini',
      reversed: false,
      feedType: GROWER_FEED,
    },
  },
};

/**
 * A second reversal. Not a retryable failure - the purchase is already done
 * with - which is why the screen shows the sentence rather than a retry.
 */
const ALREADY_REVERSED = {
  data: null,
  errors: [
    {
      message: 'Ununuzi huu tayari umebatilishwa. Hauwezi kubatilishwa wala kurekebishwa tena.',
      path: ['reverseFeedPurchase'],
      extensions: { errorCode: 'PURCHASE_ALREADY_REVERSED', classification: 'BAD_REQUEST' },
    },
  ],
};

const VALIDATION = {
  data: null,
  errors: [
    {
      message: 'Kiasi cha chakula lazima kiwe zaidi ya sifuri.',
      path: ['recordFeedPurchase'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'manage_feed_stock'.",
      path: ['feedPurchases'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';

/** Holds the write code, and is also shown costs. */
const BUYER = ['view_dashboard', 'manage_feed_stock', 'view_feed_cost'];
/** Holds the write code but is NOT shown costs - the masking case. */
const BUYER_NO_COST = ['view_dashboard', 'manage_feed_stock'];

function setup(permissions: string[], options: { lang?: Lang } = {}) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

  const fixture = TestBed.createComponent(FeedPurchases);
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

const text = (fixture: ComponentFixture<FeedPurchases>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<FeedPurchases>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

const testId = (fixture: ComponentFixture<FeedPurchases>, id: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

/** The list and the catalogue go out together (forkJoin). */
async function load(
  fixture: ComponentFixture<FeedPurchases>,
  httpMock: HttpTestingController,
  responses: { purchases?: object; feedTypes?: object } = {},
) {
  fixture.detectChanges();
  gql(httpMock, 'query FeedPurchases').flush(responses.purchases ?? PURCHASES);
  gql(httpMock, 'query FeedTypes(').flush(responses.feedTypes ?? CATALOG);
  await fixture.whenStable();
  fixture.detectChanges();
}

/**
 * Opens one row's action menu and returns its contents as text.
 *
 * The sheet renders only while open (see ActionMenu), so reading it means
 * clicking the trigger - the same as using it.
 */
function openMenu(fixture: ComponentFixture<FeedPurchases>, rowIndex: number): string {
  const menus = (fixture.nativeElement as HTMLElement).querySelectorAll('app-action-menu');
  const trigger = menus[rowIndex].querySelector('button') as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
  return (menus[rowIndex].textContent ?? '').replace(/\s+/g, ' ');
}

/** Fills the form the way the DOM does - three of the boxes are `type="number"`. */
function fill(
  fixture: ComponentFixture<FeedPurchases>,
  values: {
    feedTypeId: string;
    quantityKg: number | string | null;
    unitCost: number | string | null;
    supplier?: string;
    purchaseDate?: string;
  },
) {
  fixture.componentInstance.form.setValue({
    feedTypeId: values.feedTypeId,
    // Cast because the controls are DECLARED string while
    // NumberValueAccessor actually writes numbers - the split numberOrNull
    // exists to absorb. Driving them with real numbers is what makes this
    // resemble the browser rather than the type.
    quantityKg: values.quantityKg as string,
    unitCost: values.unitCost as string,
    supplier: values.supplier ?? '',
    purchaseDate: values.purchaseDate ?? '2026-09-05',
  });
  fixture.detectChanges();
}

describe('FeedPurchases', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the list', () => {
    it('renders every column, costs included, for a caller who is shown them', async () => {
      const { fixture, component, httpMock } = setup(BUYER);

      await load(fixture, httpMock);

      expect(component.purchases().length).toBe(2);
      const body = text(fixture);
      expect(body).toContain('2026-09-02');
      expect(body).toContain('Pellet 3mm');
      expect(body).toContain('Duka la Mjini');
      // Grouped by the browser's locale, so the assertion goes through the
      // same formatter rather than hardcoding separators.
      expect(body).toContain((60000).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      httpMock.verify();
    });

    it('asks for feedPurchases with NO arguments - the farm is the header', async () => {
      const { fixture, httpMock } = setup(BUYER);

      fixture.detectChanges();
      const req = gql(httpMock, 'query FeedPurchases');

      // There is no farm argument to get wrong: the backend scopes to the
      // caller's own farm, so this query cannot ask about another one.
      const body = req.request.body as { query: string; variables?: unknown };
      expect(body.query).not.toContain('farmId');
      expect(body.variables ?? {}).toEqual({});

      req.flush(PURCHASES);
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();
      httpMock.verify();
    });

    it('renders an em-dash - never 0, null or NaN - when the server masked the cost', async () => {
      const { fixture, component, httpMock } = setup(BUYER_NO_COST);

      await load(fixture, httpMock, { purchases: MASKED_PURCHASES });

      const body = text(fixture);
      // The dash itself.
      expect(body).toContain(FEED_PURCHASES_I18N.sw.costHidden);
      // And none of the three ways of getting this wrong.
      expect(body).not.toContain('NaN');
      expect(body).not.toContain('null');
      expect(body).not.toContain('undefined');

      // The operational half of the row is untouched - the row was not
      // withheld, only its prices.
      expect(body).toContain('Pellet 3mm');
      expect(body).toContain('Duka la Mjini');
      expect(body).toContain('50');
      httpMock.verify();
    });

    it('renders the dash through the same helper the table uses', async () => {
      const { fixture, component, httpMock } = setup(BUYER_NO_COST);
      await load(fixture, httpMock, { purchases: MASKED_PURCHASES });

      // A masked price stops at cost(), which is what makes it impossible for
      // any code path to hand a null to the number formatter.
      expect(component.cost(null)).toBe(FEED_PURCHASES_I18N.sw.costHidden);
      expect(component.cost(0)).not.toBe(FEED_PURCHASES_I18N.sw.costHidden);
      httpMock.verify();
    });

    it('shows the empty state when the farm has bought nothing yet', async () => {
      const { fixture, httpMock } = setup(BUYER);

      await load(fixture, httpMock, { purchases: EMPTY_PURCHASES });

      expect(text(fixture)).toContain(FEED_PURCHASES_I18N.sw.emptyTitle);
      // The form is still there - an empty list is the case it exists for.
      expect(panel(fixture, 'purchase-form')).toBeTruthy();
      httpMock.verify();
    });

    it('surfaces a failed load with a retry that re-asks both queries', async () => {
      const { fixture, httpMock } = setup(BUYER);

      fixture.detectChanges();
      // The catalogue is answered FIRST on purpose: forkJoin cancels its
      // siblings the moment one errors, so flushing the failure first would
      // leave the other request cancelled and unflushable. Answering the
      // healthy one first is also the realistic order - two requests that
      // went out together rarely fail together.
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      gql(httpMock, 'query FeedPurchases').flush(FORBIDDEN);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(testId(fixture, 'load-error')).toBeTruthy();
      expect(panel(fixture, 'purchases-list')).toBeNull();

      fixture.componentInstance.fetch();
      fixture.detectChanges();
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      gql(httpMock, 'query FeedPurchases').flush(PURCHASES);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Pellet 3mm');
      httpMock.verify();
    });
  });

  describe('recording a purchase', () => {
    it('sends a NUMERIC feedTypeId and refreshes the list', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, {
        feedTypeId: '3',
        quantityKg: 40,
        unitCost: 900,
        supplier: '  Duka la Mjini  ',
        purchaseDate: '2026-09-05',
      });
      component.submit();

      const req = gql(httpMock, 'mutation RecordFeedPurchase');
      const variables = (req.request.body as { variables: { input: Record<string, unknown> } })
        .variables;
      // `feedTypeId: Int!` on the input while `FeedType.feedTypeId` is `ID!`
      // on the way out - so the dropdown's string MUST be converted. This is
      // the assertion that catches it going out as "3".
      expect(variables.input['feedTypeId']).toBe(3);
      expect(typeof variables.input['feedTypeId']).toBe('number');
      // And no totalCost: the database generates it, it is not an input.
      expect(variables.input).toEqual({
        purchaseDate: '2026-09-05',
        feedTypeId: 3,
        quantityKg: 40,
        unitCost: 900,
        supplier: 'Duka la Mjini',
      });

      req.flush(RECORDED);
      await fixture.whenStable();
      fixture.detectChanges();

      gql(httpMock, 'query FeedPurchases').flush(PURCHASES);
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe(FEED_PURCHASES_I18N.sw.savedRecordToast);
      // The type and amounts clear; the DATE is kept, because purchases are
      // entered in a batch off one delivery note.
      expect(component.form.getRawValue().feedTypeId).toBe('');
      expect(component.form.getRawValue().purchaseDate).toBe('2026-09-05');
      httpMock.verify();
    });

    it('sends null for an empty supplier, not an empty string', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, { feedTypeId: '1', quantityKg: 10, unitCost: 500, supplier: '   ' });
      component.submit();

      const req = gql(httpMock, 'mutation RecordFeedPurchase');
      const input = (req.request.body as { variables: { input: Record<string, unknown> } })
        .variables.input;
      // The column is nullable, and "" would print as a supplier whose name
      // says nothing.
      expect(input['supplier']).toBeNull();
      req.flush(RECORDED);
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query FeedPurchases').flush(PURCHASES);
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      httpMock.verify();
    });

    it('shows the total back as confirmation, from the unmasked mutation answer', async () => {
      const { fixture, component, httpMock } = setup(BUYER_NO_COST);
      await load(fixture, httpMock, { purchases: MASKED_PURCHASES });

      fill(fixture, { feedTypeId: '3', quantityKg: 40, unitCost: 900 });
      component.submit();
      gql(httpMock, 'mutation RecordFeedPurchase').flush(RECORDED);
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query FeedPurchases').flush(MASKED_PURCHASES);
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      // THE POINT OF THIS TEST: this buyer is masked in the LIST above, yet
      // still sees their own total here - the mutation's answer is not
      // masked, because they are the person who just typed the price.
      expect(panel(fixture, 'purchase-confirm')).toBeTruthy();
      const confirmed = testId(fixture, 'confirm-total')?.textContent ?? '';
      expect(confirmed).toContain((36000).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      expect(confirmed).not.toContain(FEED_PURCHASES_I18N.sw.costHidden);
      httpMock.verify();
    });
  });

  describe('what the form refuses before spending a request', () => {
    it('blocks a missing feed type', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, { feedTypeId: '', quantityKg: 10, unitCost: 500 });
      component.submit();
      fixture.detectChanges();

      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorFeedTypeRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a quantity that is empty, zero or negative', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, { feedTypeId: '3', quantityKg: null, unitCost: 500 });
      component.submit();
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorQuantityRequired);

      fill(fixture, { feedTypeId: '3', quantityKg: 0, unitCost: 500 });
      component.submit();
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorQuantityPositive);

      fill(fixture, { feedTypeId: '3', quantityKg: -5, unitCost: 500 });
      component.submit();
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorQuantityPositive);

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a unit cost that is empty, zero or negative', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, { feedTypeId: '3', quantityKg: 10, unitCost: null });
      component.submit();
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorUnitCostRequired);

      fill(fixture, { feedTypeId: '3', quantityKg: 10, unitCost: 0 });
      component.submit();
      // Free feed is not a purchase to record, and zero would poison the
      // per-type ledger's arithmetic silently.
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorUnitCostPositive);

      fill(fixture, { feedTypeId: '3', quantityKg: 10, unitCost: -1 });
      component.submit();
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorUnitCostPositive);

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('blocks a missing date', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, { feedTypeId: '3', quantityKg: 10, unitCost: 500, purchaseDate: '' });
      component.submit();

      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorDateRequired);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('keeps the backend sentence for VALIDATION_ERROR', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      fill(fixture, { feedTypeId: '3', quantityKg: 10, unitCost: 500 });
      component.submit();
      gql(httpMock, 'mutation RecordFeedPurchase').flush(VALIDATION);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toBe('Kiasi cha chakula lazima kiwe zaidi ya sifuri.');
      httpMock.verify();
    });
  });

  describe('an empty catalogue', () => {
    it('replaces the form with a message pointing at the catalogue screen', async () => {
      const { fixture, component, httpMock } = setup(BUYER);

      await load(fixture, httpMock, { feedTypes: EMPTY_CATALOG, purchases: EMPTY_PURCHASES });

      expect(component.noFeedTypes()).toBe(true);
      expect(panel(fixture, 'no-feed-types')).toBeTruthy();
      expect(text(fixture)).toContain(FEED_PURCHASES_I18N.sw.noFeedTypesTitle);
      expect(text(fixture)).toContain(FEED_PURCHASES_I18N.sw.goToFeedCatalog);
      // The form is GONE, not merely disabled: a purchase needs a type, and
      // this screen must never grow a second way to create one.
      expect(panel(fixture, 'purchase-form')).toBeNull();
      httpMock.verify();
    });

    it('links to /feed-catalog', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock, { feedTypes: EMPTY_CATALOG, purchases: EMPTY_PURCHASES });

      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      component.goToFeedCatalog();

      expect(navigate).toHaveBeenCalledWith('/feed-catalog');
      httpMock.verify();
    });

    it('sends nothing even if submit is reached anyway', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock, { feedTypes: EMPTY_CATALOG, purchases: EMPTY_PURCHASES });

      component.form.patchValue({ feedTypeId: '3', quantityKg: '10', unitCost: '500' });
      component.submit();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('does NOT show the dead end while the answer is still in flight', async () => {
      const { fixture, component, httpMock } = setup(BUYER);

      fixture.detectChanges();

      // Mid-load the catalogue signal is empty, but that is not a dead end -
      // sending somebody to another screen for it would be wrong.
      expect(component.noFeedTypes()).toBe(false);
      expect(panel(fixture, 'no-feed-types')).toBeNull();

      gql(httpMock, 'query FeedPurchases').flush(EMPTY_PURCHASES);
      gql(httpMock, 'query FeedTypes(').flush(EMPTY_CATALOG);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.noFeedTypes()).toBe(true);
    });
  });

  describe('the actions column', () => {
    it('offers Rekebisha and Batilisha on a live purchase', async () => {
      const { fixture, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      const menu = openMenu(fixture, 0);

      expect(menu).toContain(FEED_PURCHASES_I18N.sw.edit);
      expect(menu).toContain(FEED_PURCHASES_I18N.sw.reverse);
      httpMock.verify();
    });

    it('offers NEITHER on a reversed purchase, and says why', async () => {
      const { fixture, httpMock } = setup(BUYER);
      await load(fixture, httpMock, { purchases: PURCHASES_WITH_REVERSED });

      const menu = openMenu(fixture, 0);

      // Not two disabled buttons - an explanation. Reversing twice would take
      // the kilos out of the balance twice.
      expect(menu).toContain(FEED_PURCHASES_I18N.sw.alreadyReversedNotice);
      expect(menu).not.toContain(FEED_PURCHASES_I18N.sw.reverse);
      expect(testId(fixture, 'already-reversed')).toBeTruthy();
      httpMock.verify();
    });

    it('shows the reversed status in its own column', async () => {
      const { fixture, httpMock } = setup(BUYER);

      await load(fixture, httpMock, { purchases: PURCHASES_WITH_REVERSED });

      expect(text(fixture)).toContain(FEED_PURCHASES_I18N.sw.statusReversed);
      httpMock.verify();
    });

    it('refuses to open either action for a reversed row even if called directly', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock, { purchases: PURCHASES_WITH_REVERSED });

      component.openEdit(REVERSED_PURCHASE);
      component.askReverse(REVERSED_PURCHASE);

      expect(component.editTarget()).toBeNull();
      expect(component.reverseTarget()).toBeNull();
      httpMock.verify();
    });
  });

  describe('reversing a purchase', () => {
    it('asks first, then sends reverseFeedPurchase and re-reads the list', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      component.askReverse(PURCHASES.data.feedPurchases[0]);
      fixture.detectChanges();
      // Nothing is sent on merely asking - the kilos have not moved yet.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);

      component.confirmReverse();
      const req = gql(httpMock, 'mutation ReverseFeedPurchase');
      // `Int!`, so the `ID!` string is converted - the same trap as
      // feedTypeId on the record path.
      expect((req.request.body as { variables: unknown }).variables).toEqual({ purchaseId: 11 });
      req.flush(REVERSED);
      await fixture.whenStable();
      fixture.detectChanges();

      // The BALANCE moved, so the list is re-read rather than patched.
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      gql(httpMock, 'query FeedPurchases').flush(PURCHASES_WITH_REVERSED);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.reverseTarget()).toBeNull();
      expect(component.toastMessage()).toBe(FEED_PURCHASES_I18N.sw.reversedToast);
      // The row is STILL THERE - reversing is not deleting.
      expect(component.purchases().length).toBe(2);
      expect(text(fixture)).toContain(FEED_PURCHASES_I18N.sw.statusReversed);
      httpMock.verify();
    });

    it('surfaces PURCHASE_ALREADY_REVERSED verbatim and closes the dialog', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      component.askReverse(PURCHASES.data.feedPurchases[0]);
      component.confirmReverse();
      gql(httpMock, 'mutation ReverseFeedPurchase').flush(ALREADY_REVERSED);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.actionErrorMessage()).toContain('tayari umebatilishwa');
      expect(testId(fixture, 'action-error')).toBeTruthy();
      // Closed, because retrying cannot help - it is a different answer, not
      // the same question again.
      expect(component.reverseTarget()).toBeNull();
      // And nothing was re-read: the ledger did not move.
      httpMock.verify();
    });
  });

  describe('correcting a purchase', () => {
    it('opens seeded from the row and sends ONE correctFeedPurchase', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      component.openEdit(PURCHASES.data.feedPurchases[0]);
      fixture.detectChanges();

      // Seeded from the row, not left blank.
      expect(component.form.getRawValue().quantityKg).toBe('50');
      expect(component.form.getRawValue().unitCost).toBe('1200');
      expect(component.form.getRawValue().feedTypeId).toBe('3');

      fill(fixture, {
        feedTypeId: '3',
        quantityKg: 35,
        unitCost: 1300,
        supplier: 'Duka la Mjini',
        purchaseDate: '2026-09-02',
      });
      component.submit();

      // ONE mutation, not reverse-then-record: two calls could leave the farm
      // having lost the kilos with no purchase to restore them.
      httpMock.expectNone((r) =>
        String((r.body as { query: string }).query).includes('mutation ReverseFeedPurchase'),
      );
      const req = gql(httpMock, 'mutation CorrectFeedPurchase');
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        purchaseId: 11,
        input: {
          purchaseDate: '2026-09-02',
          feedTypeId: 3,
          quantityKg: 35,
          unitCost: 1300,
          supplier: 'Duka la Mjini',
        },
      });
      req.flush(CORRECTED);
      await fixture.whenStable();
      fixture.detectChanges();

      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      gql(httpMock, 'query FeedPurchases').flush(PURCHASES_WITH_REVERSED);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.editTarget()).toBeNull();
      expect(component.toastMessage()).toBe(FEED_PURCHASES_I18N.sw.savedToast);
      httpMock.verify();
    });

    it('confirms the NEW total back, from the unmasked mutation answer', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      component.openEdit(PURCHASES.data.feedPurchases[0]);
      fill(fixture, { feedTypeId: '3', quantityKg: 35, unitCost: 1300 });
      component.submit();
      gql(httpMock, 'mutation CorrectFeedPurchase').flush(CORRECTED);
      await fixture.whenStable();
      fixture.detectChanges();
      gql(httpMock, 'query FeedTypes(').flush(CATALOG);
      gql(httpMock, 'query FeedPurchases').flush(PURCHASES_WITH_REVERSED);
      await fixture.whenStable();
      fixture.detectChanges();

      const confirmed = testId(fixture, 'confirm-total')?.textContent ?? '';
      expect(confirmed).toContain((45500).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      httpMock.verify();
    });

    it('leaves the price box EMPTY when it was masked, rather than guessing 0', async () => {
      const { fixture, component, httpMock } = setup(BUYER_NO_COST);
      await load(fixture, httpMock, { purchases: MASKED_PURCHASES });

      component.openEdit(MASKED_PURCHASES.data.feedPurchases[0]);
      fixture.detectChanges();

      // This reader was never sent the price, so it cannot be pre-filled -
      // and 0 would post a purchase worth nothing.
      expect(component.form.getRawValue().unitCost).toBe('');
      // The operational fields it WAS sent are seeded normally.
      expect(component.form.getRawValue().quantityKg).toBe('50');
      httpMock.verify();
    });

    it('applies the SAME validation the record form does', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      component.openEdit(PURCHASES.data.feedPurchases[0]);
      fill(fixture, { feedTypeId: '3', quantityKg: 0, unitCost: 1300 });
      component.submit();
      fixture.detectChanges();

      // One form, one set of rules - the point of sharing the controls.
      expect(component.formError()).toBe(FEED_PURCHASES_I18N.sw.errorQuantityPositive);
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('closing clears the form so the record form is not left dirty', async () => {
      const { fixture, component, httpMock } = setup(BUYER);
      await load(fixture, httpMock);

      component.openEdit(PURCHASES.data.feedPurchases[0]);
      component.closeEdit();
      fixture.detectChanges();

      expect(component.editTarget()).toBeNull();
      expect(component.form.getRawValue().feedTypeId).toBe('');
      expect(component.form.getRawValue().quantityKg).toBe('');
      httpMock.verify();
    });
  });

  /**
   * The route gate, run against the REAL route table rather than a guard
   * built in the test - what is being checked is the wiring.
   */
  describe('the route gate', () => {
    const purchasesRoute = (): Route => {
      // Flattened: the screens are CHILDREN of the shell's layout route now, so a
      // top-level ind would miss them - and missing them would look exactly
      // like the guard being gone.
      const route = routes
        .flatMap((r) => [r, ...(r.children ?? [])])
        .find((r) => r.path === 'feed-purchases');
      if (!route) {
        throw new Error('feed-purchases is not in the route table');
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

      const guard = purchasesRoute().canActivate?.[0] as CanActivateFn | undefined;
      if (typeof guard !== 'function') {
        throw new Error('feed-purchases has no CanActivateFn');
      }
      const result = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      return firstValueFrom(isObservable(result) ? result : of(result));
    }

    it('lets a manage_feed_stock holder in', async () => {
      expect(await runGuard(BUYER_NO_COST)).toBe(true);
    });

    it('turns away a feeder, even one who may see costs', async () => {
      // `view_feed_cost` decides whether prices are SHOWN, never whether the
      // screen may be opened - the two are independent, and this is the line.
      const result = await runGuard(['view_dashboard', 'log_feeding', 'view_feed_cost']);

      expect(result).not.toBe(true);
      expect(result).toEqual(TestBed.inject(Router).parseUrl('/dashboard'));
    });
  });

  describe('language', () => {
    it('renders in English when that is the UI language', async () => {
      const { fixture, httpMock } = setup(BUYER, { lang: 'en' });

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Feed Purchases');
      expect(text(fixture)).toContain('Price per kg');
      httpMock.verify();
    });

    it('carries exactly the same keys in both languages', () => {
      // A key in one and not the other renders as `undefined` on somebody's
      // screen, and nothing in the build would notice.
      const sw = Object.keys(FEED_PURCHASES_I18N.sw).sort();
      const en = Object.keys(FEED_PURCHASES_I18N.en).sort();
      expect(en).toEqual(sw);
    });
  });
});

/**
 * Rail ya muhtasari.
 *
 * Jambo la msingi hapa ni GHARAMA: rail haiulizi kama msomaji ana
 * `view_feed_cost`. Backend hutuma `totalCost: null` kwa asiye nayo (V18),
 * hivyo jumla inajengwa kutoka safu zenye namba pekee - na msomaji asiyeonyeshwa
 * bei anapata mstari ule ule ambao jedwali linampa. Kalenda nayo haigharimu
 * ombi: kila ununuzi una `purchaseDate` yake.
 */
describe('Feed purchases summary rail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('counts the purchases and the kilograms', async () => {
    const { fixture, component, httpMock } = setup(BUYER);
    await load(fixture, httpMock);

    const by = (label: string) => component.summary().find((row) => row.label === label)?.value;

    expect(by('Manunuzi yote')).toBe('2');
    // 50 + 25 - angalia fixtures.
    expect(by('Kilo zote')).toBe('75.0');
    httpMock.verify();
  });

  it('filters to the selected date without asking the backend', async () => {
    const { fixture, component, httpMock } = setup(BUYER);
    await load(fixture, httpMock);

    component.selectDate(new Date(2026, 8, 2)); // 2026-09-02
    fixture.detectChanges();

    const by = (label: string) => component.summary().find((row) => row.label === label)?.value;
    expect(by('Kwa tarehe hii')).toBe('1');
    expect(by('Kilo za tarehe hii')).toBe('50.0');
    // Hakuna ombi jipya - hiyo ndiyo hoja ya kuchuja kwenye skrini.
    httpMock.verify();
  });

  it('totals what the reader was actually shown', async () => {
    const { fixture, component, httpMock } = setup(BUYER);
    await load(fixture, httpMock);

    // 60000 + 37500.
    expect(component.spend().all).toBe('97500.00');
    // Leo si 2026-09-02 wala 09-01, hivyo hakuna ununuzi wa leo.
    expect(component.spend().onDate).toBe('0.00');
    httpMock.verify();
  });

  it('dashes the spend when every price was masked', async () => {
    // Hana `view_feed_cost`: backend inatuma null, na rail haijaribu kuzikisia
    // kama sifuri - sifuri lingekuwa dai kuhusu ununuzi, si ukweli.
    const { fixture, component, httpMock } = setup(BUYER_NO_COST);
    await load(fixture, httpMock, { purchases: MASKED_PURCHASES });

    expect(component.spend().all).toBe('\u2014');
    expect(component.spend().onDate).toBe('\u2014');
    // Kilo bado zinaonekana: kujua magunia yamefika ni kazi ya shambani.
    const by = (label: string) => component.summary().find((row) => row.label === label)?.value;
    expect(by('Kilo zote')).toBe('50.0');
    httpMock.verify();
  });

  it('renders the rail beside the work', async () => {
    const { fixture, httpMock } = setup(BUYER);
    await load(fixture, httpMock);

    const rail = (fixture.nativeElement as HTMLElement).querySelector('.module-rail')!;
    expect(rail.parentElement?.classList.contains('module-layout')).toBe(true);
    // Maelezo, kalenda, muhtasari, gharama.
    expect(rail.querySelectorAll('.side-card').length).toBe(4);
    expect(rail.querySelector('app-date-picker-card')).toBeTruthy();
  });
});
