import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Feeding, LOW_STOCK_THRESHOLD_KG } from './feeding';
import { FEEDING_I18N } from './feeding.i18n';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

const CYCLES = {
  data: {
    cycles: [
      {
        cycleId: '9',
        speciesName: 'Sato',
        stockingDate: '2026-08-01',
        fingerlingsCount: 500,
        survivalRateEstimate: 0.85,
        expectedHarvestDate: '2027-03-01',
        actualHarvestDate: null,
        status: 'ACTIVE',
        unit: { unitId: '27', code: 'T1', type: 'TANK' },
      },
    ],
  },
};

/**
 * The catalogue rows, in the shape `schema.graphqls` defines: a system
 * catalogue keyed by `feedTypeId`, carrying the INCLUSIVE age window the feed
 * is made for and nothing about pellet size - the catalogue is organised by
 * the age it feeds, which is also what the suitability tag is derived from.
 *
 * Names deliberately keep the "Nmm" wording a farm would print on a sack; it
 * is part of the NAME string, not a field.
 */
const FRY_FEED = {
  feedTypeId: '1',
  name: 'Pellet 1mm',
  minAgeMonths: 0,
  maxAgeMonths: 0,
  active: true,
};
const JUVENILE_FEED = {
  feedTypeId: '2',
  name: 'Pellet 2mm',
  minAgeMonths: 1,
  maxAgeMonths: 1,
  active: true,
};
const GROWER_FEED = {
  feedTypeId: '3',
  name: 'Pellet 3mm',
  minAgeMonths: 2,
  maxAgeMonths: 4,
  active: true,
};

/**
 * `feedTypesForCycle` for a cycle two months into growing.
 *
 * The nesting is the schema's: each entry is a SuitableFeedType - the
 * catalogue row plus the REASON it qualified - because suitability is a fact
 * about the pairing, not about the feed. Grower feed is EXACT at two months
 * (2 <= 2 <= 4); juvenile feed is SAFE_LOWER (its window closed at one month,
 * and bigger fish will still eat it).
 *
 * UNSAFE_HIGHER is NOT here, and that is the contract, not an omission in the
 * fixture: the backend never returns feed for fish older than these.
 * `cycleAgeMonths` is the server's own count, which the screen displays rather
 * than recomputing.
 */
const FEED_TYPES = {
  data: {
    feedTypesForCycle: {
      cycleAgeMonths: 2,
      noSuitableFeed: false,
      feedTypes: [
        { suitability: 'EXACT', feedType: GROWER_FEED },
        { suitability: 'SAFE_LOWER', feedType: JUVENILE_FEED },
      ],
    },
  },
};

/** Every active type is made for fish older than these - a real catalogue gap. */
const NO_SUITABLE_FEED = {
  data: { feedTypesForCycle: { cycleAgeMonths: 2, noSuitableFeed: true, feedTypes: [] } },
};

/**
 * Three feed types, and only the first is comfortable.
 *
 * The balance row is `{ feedType, quantityKg }` - the same `quantityKg` a
 * purchase and a feeding use, not a name of its own.
 *
 * Pellet 2mm at 4kg is under the 10kg line; Pellet 1mm at -6.5kg is OVERDRAWN
 * - somebody fed from a sack no purchase was recorded for. Both shapes are
 * here on purpose: the negative one must not be clamped, and it is also (being
 * below 10) named by the low-stock banner.
 */
const BALANCE = {
  data: {
    feedStockBalance: [
      { quantityKg: 120, feedType: GROWER_FEED },
      { quantityKg: 4, feedType: JUVENILE_FEED },
      { quantityKg: -6.5, feedType: FRY_FEED },
    ],
  },
};

/** Every type comfortably stocked - no banner, no red row. */
const HEALTHY_BALANCE = {
  data: { feedStockBalance: [{ quantityKg: 120, feedType: GROWER_FEED }] },
};

const LOGS = {
  data: {
    feedingLogs: [
      {
        logId: '11',
        logDate: '2026-09-03',
        quantityKg: 12.5,
        recordedByName: 'D Worker',
        feedType: GROWER_FEED,
      },
      {
        logId: '12',
        logDate: '2026-09-04',
        quantityKg: 1.5,
        recordedByName: null,
        feedType: JUVENILE_FEED,
      },
    ],
  },
};

/** A VIEWER reaching logFeeding. HTTP 200 with errors[], as GraphQL does. */
const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'log_feeding'.",
      path: ['logFeeding'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

/**
 * The write-time gate firing anyway - the cycle aged past the chosen feed
 * between the dropdown being filled and the button being pressed. It should
 * not happen; the point of the test is that it is handled when it does, in
 * the backend's own words, which name the feed and the reason.
 */
const VALIDATION = {
  data: null,
  errors: [
    {
      message: 'Chakula hiki si sahihi kwa umri wa samaki hawa.',
      path: ['logFeeding'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const SELECTED_CYCLE_KEY = 'samakiFarm.selectedCycleId';

const FEEDER = ['view_dashboard', 'log_feeding'];
const FEEDER_WITH_STOCK = ['view_dashboard', 'log_feeding', 'view_feed_stock'];

function setup(permissions: string[], options: { cycleId?: string; lang?: Lang } = {}) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  if (options.cycleId) {
    localStorage.setItem(SELECTED_CYCLE_KEY, options.cycleId);
  }

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(options.lang ?? 'sw');

  const fixture = TestBed.createComponent(Feeding);
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

const text = (fixture: ComponentFixture<Feeding>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<Feeding>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

/**
 * The two-step load: resolve the stored cycle, then the three cycle-scoped
 * reads, which go out together (forkJoin). `balance` is omitted for a caller
 * without `view_feed_stock` - that request is never made, and passing null
 * here asserts it.
 */
async function load(
  fixture: ComponentFixture<Feeding>,
  httpMock: HttpTestingController,
  responses: { feedTypes?: object; logs?: object; balance?: object | null } = {},
) {
  fixture.detectChanges();
  gql(httpMock, 'query Cycles').flush(CYCLES);
  await fixture.whenStable();
  fixture.detectChanges();

  gql(httpMock, 'FeedTypesForCycle').flush(responses.feedTypes ?? FEED_TYPES);
  gql(httpMock, 'FeedingLogs').flush(responses.logs ?? LOGS);
  if (responses.balance !== null) {
    gql(httpMock, 'FeedStockBalance').flush(responses.balance ?? BALANCE);
  }

  await fixture.whenStable();
  fixture.detectChanges();
}

/** Picks a feed the way the DOM does - the component tracks it on `change`. */
function chooseFeed(fixture: ComponentFixture<Feeding>, feedTypeId: string) {
  const select = (fixture.nativeElement as HTMLElement).querySelector(
    '#feed-type',
  ) as HTMLSelectElement;
  select.value = feedTypeId;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('Feeding', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the cycle it feeds', () => {
    it('asks for nothing at all when no cycle has been chosen', async () => {
      const { fixture, httpMock } = setup(FEEDER_WITH_STOCK);

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(panel(fixture, 'no-cycle')).toBeTruthy();
      expect(panel(fixture, 'log-form')).toBeNull();
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('names the cycle and its unit once one is selected', async () => {
      const { fixture, component, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock);

      expect(component.cycle()?.cycleId).toBe('9');
      expect(panel(fixture, 'context')?.textContent).toContain('T1');
      expect(panel(fixture, 'context')?.textContent).toContain('Sato');
      // The age the SERVER counted, shown rather than recomputed - it is what
      // the dropdown's filtering was based on.
      expect(component.cycleAgeMonths()).toBe(2);
      expect(panel(fixture, 'context')?.textContent).toContain('2 miezi');
      httpMock.verify();
    });

    it('falls back to the "pick a cycle" panel for a cycle this farm does not have', async () => {
      const { fixture, component, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '999' });

      fixture.detectChanges();
      gql(httpMock, 'query Cycles').flush(CYCLES);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.cycle()).toBeNull();
      expect(panel(fixture, 'no-cycle')).toBeTruthy();
      // Nothing cycle-scoped was asked for - there is no cycle to ask about.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });
  });

  describe('the feed dropdown', () => {
    it('is built from feedTypesForCycle, and asks with the selected cycle', async () => {
      const { fixture, httpMock } = setup(FEEDER, { cycleId: '9' });

      fixture.detectChanges();
      gql(httpMock, 'query Cycles').flush(CYCLES);
      await fixture.whenStable();

      const req = gql(httpMock, 'FeedTypesForCycle');
      expect((req.request.body as { variables: unknown }).variables).toEqual({ cycleId: 9 });
      req.flush(FEED_TYPES);
      gql(httpMock, 'FeedingLogs').flush(LOGS);
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('tags EXACT plainly and SAFE_LOWER with its warning', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });

      await load(fixture, httpMock, { balance: null });

      const options = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#feed-type option'),
      ) as HTMLOptionElement[];
      // The placeholder, then the two the server sent.
      expect(options.length).toBe(3);

      const exact = options.find((o) => o.value === '3')!;
      const safeLower = options.find((o) => o.value === '2')!;

      expect(exact.getAttribute('data-suitability')).toBe('EXACT');
      expect(exact.textContent).toContain('Pellet 3mm');
      // The catalogue's age window, not a pellet size - FeedType carries
      // minAgeMonths/maxAgeMonths and no size at all.
      expect(exact.textContent).toContain('miezi 2-4');
      expect(exact.textContent).not.toContain('chakula cha samaki wadogo');

      expect(safeLower.getAttribute('data-suitability')).toBe('SAFE_LOWER');
      expect(safeLower.textContent).toContain('miezi 1-1');
      expect(safeLower.textContent).toContain('chakula cha samaki wadogo');

      expect(component.feedTypes().length).toBe(2);
    });

    it('is NOT built from the stock balance - a feed with stock but no suitability is absent', async () => {
      // Pellet 1mm has a balance row and is nowhere in feedTypesForCycle. It
      // must never reach the dropdown: pellets the fish cannot eat are exactly
      // what the server filtered out.
      const { fixture, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock);

      const values = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#feed-type option'),
      ).map((o) => (o as HTMLOptionElement).value);

      expect(values).toEqual(['', '3', '2']);
      // …while the stock panel does list it.
      expect(panel(fixture, 'stock')?.textContent).toContain('Pellet 1mm');
    });

    it('shows the SAFE_LOWER note as soon as that feed is picked', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '3');
      expect(component.selectedIsSafeLower()).toBe(false);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-note="safe-lower"]'),
      ).toBeNull();

      chooseFeed(fixture, '2');
      expect(component.selectedIsSafeLower()).toBe(true);
      expect(text(fixture)).toContain('hawa watakula lakini si bora');
    });
  });

  describe('noSuitableFeed', () => {
    it('banners the problem and disables the form', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });

      await load(fixture, httpMock, { feedTypes: NO_SUITABLE_FEED, balance: null });

      expect(component.noSuitableFeed()).toBe(true);
      expect(component.formDisabled()).toBe(true);
      expect(panel(fixture, 'no-suitable-feed')).toBeTruthy();
      expect(text(fixture)).toContain('hakuna chakula sahihi kwa umri wa cycle hii');

      const select = (fixture.nativeElement as HTMLElement).querySelector(
        '#feed-type',
      ) as HTMLSelectElement;
      expect(select.disabled).toBe(true);
    });

    it('sends nothing even if submit is reached anyway', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { feedTypes: NO_SUITABLE_FEED, balance: null });

      component.form.patchValue({ feedTypeId: '3', quantityKg: '5' });
      component.submit();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });
  });

  describe('the stock panel, gated on view_feed_stock', () => {
    it('is absent - and never even requested - without the permission', async () => {
      const { fixture, httpMock } = setup(FEEDER, { cycleId: '9' });

      // `balance: null` means the helper flushes no FeedStockBalance request;
      // httpMock.verify() below fails if one was made.
      await load(fixture, httpMock, { balance: null });

      expect(panel(fixture, 'stock')).toBeNull();
      // The feeder still gets their form and the history.
      expect(panel(fixture, 'log-form')).toBeTruthy();
      expect(panel(fixture, 'logs')).toBeTruthy();
      httpMock.verify();
    });

    it('is present, with a line per feed type, for a holder of it', async () => {
      const { fixture, component, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock);

      expect(panel(fixture, 'stock')).toBeTruthy();
      expect(component.balances().length).toBe(3);
      expect(panel(fixture, 'stock')?.textContent).toContain('120');
      // Fry feed's window is [0, 0] - a real window, rendered as such rather
      // than left blank, which would read as "any age".
      expect(panel(fixture, 'stock')?.textContent).toContain('miezi 0-0');
    });

    it('marks an overdrawn type red and tells the user to record a purchase', async () => {
      const { fixture, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock);

      const row = (fixture.nativeElement as HTMLElement).querySelector('[data-stock-row="1"]')!;
      expect(row.classList.contains('stock__row--negative')).toBe(true);
      expect(row.textContent).toContain('stock imezidiwa — rekodi manunuzi');
      // The negative number is shown as it is: it IS the discrepancy.
      expect(row.textContent).toContain('-6.5');
    });

    it('banners every type at or below the low-stock threshold, and no others', async () => {
      const { fixture, component, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock);

      expect(LOW_STOCK_THRESHOLD_KG).toBe(10);
      expect(component.lowStock().map((r) => r.feedType.name)).toEqual([
        'Pellet 2mm',
        'Pellet 1mm',
      ]);

      const banner = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-banner="low-stock"]',
      )!;
      expect(banner.textContent).toContain('Pellet 2mm');
      expect(banner.textContent).not.toContain('Pellet 3mm');
    });

    it('shows no banner at all when everything is comfortably stocked', async () => {
      const { fixture, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock, { balance: HEALTHY_BALANCE });

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-banner="low-stock"]'),
      ).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.stock__row--negative'),
      ).toBeNull();
    });

    it('shows an empty state for [] - never a blank panel and never NaN', async () => {
      const { fixture, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });

      await load(fixture, httpMock, { balance: { data: { feedStockBalance: [] } } });

      expect(panel(fixture, 'stock')?.textContent).toContain('Hakuna stock bado');
      expect(text(fixture)).not.toContain('NaN');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-banner="low-stock"]'),
      ).toBeNull();
    });
  });

  describe('the feeding history', () => {
    it("lists the cycle's feedings, and says so where nobody was recorded", async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });

      await load(fixture, httpMock, { balance: null });

      expect(component.logs().length).toBe(2);
      expect(text(fixture)).toContain('12.5');
      expect(text(fixture)).toContain('D Worker');
      expect(text(fixture)).toContain('—');
    });

    it('shows the empty state for a cycle nobody has fed yet', async () => {
      const { fixture, httpMock } = setup(FEEDER, { cycleId: '9' });

      await load(fixture, httpMock, { logs: { data: { feedingLogs: [] } }, balance: null });

      expect(text(fixture)).toContain('Hakuna kulisha bado');
    });
  });

  describe('the form, gated on log_feeding', () => {
    it('is absent entirely for a VIEWER, who still reads the history', async () => {
      const { fixture, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

      await load(fixture, httpMock, { balance: null });

      expect(panel(fixture, 'log-form')).toBeNull();
      expect(panel(fixture, 'logs')).toBeTruthy();
      expect(text(fixture)).toContain('12.5');
    });
  });

  describe('the quantity', () => {
    it('refuses a blank amount', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '3');
      component.submit();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.formError()).toBe('Andika kiasi cha chakula.');
    });

    it('refuses zero and refuses a negative amount - feeding nothing is not an event', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '3');

      component.form.patchValue({ quantityKg: '0' });
      component.submit();
      expect(component.formError()).toBe('Kiasi lazima kiwe zaidi ya sifuri.');

      component.form.patchValue({ quantityKg: '-4' });
      component.submit();
      expect(component.formError()).toBe('Kiasi lazima kiwe zaidi ya sifuri.');

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('refuses a submit with no feed chosen at all', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      component.form.patchValue({ quantityKg: '5' });
      component.submit();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.formError()).toBe('Chagua aina ya chakula.');
    });
  });

  describe('recording a feeding', () => {
    it('sends an EXACT feed straight through, then re-reads logs and stock', async () => {
      const { fixture, component, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9' });
      await load(fixture, httpMock);

      chooseFeed(fixture, '3');
      component.form.patchValue({ quantityKg: '12.5', logDate: '2026-09-04' });
      component.submit();

      const req = gql(httpMock, 'LogFeeding');
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        input: {
          // BOTH are `Int!` on LogFeedingInput, and both were read back as
          // `ID!` strings - so both are converted. A feedTypeId of '3' here
          // would be a schema violation the server rejects.
          cycleId: 9,
          feedTypeId: 3,
          quantityKg: 12.5,
          logDate: '2026-09-04',
        },
      });
      req.flush({ data: { logFeeding: LOGS.data.feedingLogs[0] } });
      await fixture.whenStable();

      // The feeding moved BOTH the history and the stock.
      gql(httpMock, 'FeedingLogs').flush(LOGS);
      gql(httpMock, 'FeedStockBalance').flush(BALANCE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe('Kulisha kumehifadhiwa.');
      expect(component.form.getRawValue().quantityKg).toBe('');
      // The date is kept: a shift's feedings are written up together.
      expect(component.form.getRawValue().logDate).toBe('2026-09-04');
      httpMock.verify();
    });

    it('makes a SAFE_LOWER feed cost a second press, and sends it on that press', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '2');
      component.form.patchValue({ quantityKg: '3', logDate: '2026-09-04' });

      // First press: a warning, and nothing sent.
      component.submit();
      fixture.detectChanges();
      expect(component.awaitingConfirm()).toBe(true);
      expect(panel(fixture, 'safe-lower-confirm')).toBeTruthy();
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);

      // Second press: sent.
      component.submit();
      const req = gql(httpMock, 'LogFeeding');
      expect(
        (req.request.body as { variables: { input: { feedTypeId: number } } }).variables.input
          .feedTypeId,
      ).toBe(2);
      req.flush({ data: { logFeeding: LOGS.data.feedingLogs[1] } });
      await fixture.whenStable();
      gql(httpMock, 'FeedingLogs').flush(LOGS);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.awaitingConfirm()).toBe(false);
      httpMock.verify();
    });

    it('drops a pending confirmation when the feed is changed underneath it', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '2');
      component.form.patchValue({ quantityKg: '3' });
      component.submit();
      expect(component.awaitingConfirm()).toBe(true);

      chooseFeed(fixture, '3');
      expect(component.awaitingConfirm()).toBe(false);
    });
  });

  describe('failures', () => {
    it('surfaces FORBIDDEN in the UI language, not the backend prose', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '3');
      component.form.patchValue({ quantityKg: '5' });
      component.submit();
      gql(httpMock, 'LogFeeding').flush(FORBIDDEN);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toBe(
        'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
      );
    });

    it("keeps the backend's own words for a write-time VALIDATION_ERROR", async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });
      await load(fixture, httpMock, { balance: null });

      chooseFeed(fixture, '3');
      component.form.patchValue({ quantityKg: '5' });
      component.submit();
      gql(httpMock, 'LogFeeding').flush(VALIDATION);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toBe('Chakula hiki si sahihi kwa umri wa samaki hawa.');
      expect(text(fixture)).toContain('Chakula hiki si sahihi kwa umri wa samaki hawa.');
    });

    it('shows a load failure with a way to retry', async () => {
      const { fixture, component, httpMock } = setup(FEEDER, { cycleId: '9' });

      fixture.detectChanges();
      gql(httpMock, 'query Cycles').flush({
        data: null,
        errors: [
          {
            message: "Huna ruhusa ya 'view_dashboard'.",
            path: ['cycles'],
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

  describe('i18n', () => {
    it('renders in English when the UI language is English', async () => {
      const { fixture, httpMock } = setup(FEEDER_WITH_STOCK, { cycleId: '9', lang: 'en' });

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Feeding');
      expect(text(fixture)).toContain('Record a feeding');
      expect(text(fixture)).toContain('Feed remaining');
      expect(text(fixture)).toContain('stock overdrawn — record a purchase');
      expect(text(fixture)).toContain('Recent feedings');
    });

    it('carries exactly the same keys in both languages', () => {
      // A key in one and not the other renders as `undefined` on somebody's
      // screen, and nothing in the build would notice.
      const sw = Object.keys(FEEDING_I18N.sw).sort();
      const en = Object.keys(FEEDING_I18N.en).sort();
      expect(en).toEqual(sw);
    });
  });
});
