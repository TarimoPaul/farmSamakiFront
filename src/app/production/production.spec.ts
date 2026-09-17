import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Production } from './production';
import { PRODUCTION_I18N } from './production.i18n';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { LanguageService, Lang } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Shapes confirmed against the running backend (localhost:8082, 2026-09-02)
 * by sending this component's exact ProductionContext query.
 *
 * The detail that matters: `unitId`, `cycleId` and `speciesId` are `ID!` in
 * the schema, so they come back as STRINGS even though the columns are
 * integers. That is why the component converts before it stores or sends a
 * cycle id, and why these fixtures are quoted rather than numeric.
 */

/**
 * A date relative to today, as yyyy-MM-dd.
 *
 * The ready-to-harvest fixtures use this rather than a literal, because a
 * literal decides whether the test passes by WHEN IT RUNS: a hardcoded
 * "2027-03-01" is in the future today and in the past next year, and the
 * "not ready" assertion would silently invert. The relationship to today is
 * the thing under test, so it is the thing the fixture states.
 */
function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  // LOCAL, not toISOString().
  //
  // The screen decides what "today" is in local time (see isoDate in
  // date-picker-card), and east of Greenwich the two disagree for the first
  // hours of every day: at 00:06 in EAT, toISOString() still reports
  // YESTERDAY. Fixtures built the UTC way then sit one day off the dates the
  // component compares them against, and the suite fails once a day, at night.
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** An ACTIVE cycle whose harvest is still months off. */
const RUNNING_CYCLE = {
  cycleId: '9',
  speciesName: 'Sato',
  stockingDate: '2026-08-01',
  fingerlingsCount: 500,
  stockingAgeMonths: 0,
  survivalRateEstimate: 0.85,
  expectedHarvestDate: isoDaysFromToday(60),
  fingerlingCost: null,
  actualHarvestDate: null,
  harvestedCount: null,
  totalWeightKg: null,
  mortalityCount: null,
  totalRevenue: null,
  harvestNotes: null,
  actualSurvivalRate: null,
  status: 'ACTIVE',
  unit: { unitId: '27', code: 'T1', type: 'TANK' },
};

/** The same cycle with the prediction already due. Still ACTIVE - that is the point. */
const DUE_CYCLE = { ...RUNNING_CYCLE, expectedHarvestDate: isoDaysFromToday(-1) };

/**
 * A closed cycle, with BOTH survival numbers on it.
 *
 * 0.85 was the estimate made on stocking day; 0.6 is what 300 out of 500
 * actually came to. They disagree, which is the normal case and the reason
 * the screen has to show both.
 */
const CLOSED_CYCLE = {
  ...RUNNING_CYCLE,
  cycleId: '9',
  expectedHarvestDate: isoDaysFromToday(-30),
  actualHarvestDate: '2027-03-05',
  harvestedCount: 300,
  totalWeightKg: 120.5,
  mortalityCount: 40,
  totalRevenue: 1500000,
  fingerlingCost: 250000,
  harvestNotes: 'Maji yalichafuka Februari.',
  actualSurvivalRate: 0.6,
  status: 'HARVESTED',
};

/**
 * Harvest events for cycle 9, newest first as `harvestEvents` returns them.
 *
 * `harvestEventId` is `ID!` (a string) while `cycleId` on this type is
 * `Int!` (a number) - the fixtures keep both shapes exactly, since the
 * delete mutation's `Int!` conversion is one of the things under test.
 * Dates are relative to today so none of them drifts into the future.
 */
const SOLD_EVENT = {
  harvestEventId: '41',
  cycleId: 9,
  eventDate: isoDaysFromToday(-3),
  fishCount: 200,
  weightKg: 80.5,
  reason: 'SOLD',
  saleAmount: 1200000,
};
const REMOVED_EVENT = {
  harvestEventId: '42',
  cycleId: 9,
  eventDate: isoDaysFromToday(-5),
  fishCount: 50,
  weightKg: 20,
  reason: 'REMOVED',
  saleAmount: null,
};
const DIED_EVENT = {
  harvestEventId: '43',
  cycleId: 9,
  eventDate: isoDaysFromToday(-8),
  fishCount: 30,
  weightKg: null,
  reason: 'DIED',
  saleAmount: null,
};
const EVENTS = [SOLD_EVENT, REMOVED_EVENT, DIED_EVENT];

/** What a caller WITHOUT view_finance gets for the same events: money nulled. */
const EVENTS_MASKED = EVENTS.map((event) => ({ ...event, saleAmount: null }));

/** The component's money format, so assertions do not depend on the locale. */
const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UNITS = [
  { unitId: '27', code: 'T1', type: 'TANK', sizeM3: 12.5, waterSource: 'Kisima', status: 'ACTIVE' },
  {
    unitId: '28',
    code: 'P2',
    type: 'POND_EARTHEN',
    sizeM3: null,
    waterSource: null,
    status: 'IDLE',
  },
];

const SPECIES = [{ speciesId: '1', name: 'Sato', growthMonthsAvg: 7, avgHarvestWeightKg: 0.35 }];

/** A context carrying whichever cycles a test needs. */
const contextWith = (cycles: object[]) => ({
  data: { productionUnits: UNITS, cycles, species: SPECIES },
});

const CONTEXT = contextWith([RUNNING_CYCLE]);

/** A no-role member asking for productionUnits. HTTP 200 with errors[]. */
const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'view_dashboard'.",
      path: ['productionUnits'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

/**
 * createProductionUnit with a code the farm already has. HTTP 200.
 *
 * The message is the backend's own, from `GraphQlExceptionResolver` - the
 * same one a bad unit TYPE produces under VALIDATION_ERROR, which is why the
 * component branches on the CODE and not on this text.
 */
const UNIT_CONFLICT = {
  data: null,
  errors: [
    {
      message: 'Operesheni imekiuka vikwazo vya database (mfano: rudufu au uhusiano usiopo).',
      path: ['createProductionUnit'],
      extensions: { errorCode: 'CONFLICT', classification: 'BAD_REQUEST' },
    },
  ],
};

/**
 * closeCycle against a cycle that is already HARVESTED. HTTP 200.
 *
 * The message is the backend's own, naming the status and date it already
 * holds - the component branches on the CODE, and shows the mapped line so
 * an English UI does not get Swahili prose.
 */
const ALREADY_CLOSED = {
  data: null,
  errors: [
    {
      message:
        'Mzunguko huu tayari umefungwa (HARVESTED, tarehe 2027-03-05). Hauwezi kufungwa tena.',
      path: ['closeCycle'],
      extensions: { errorCode: 'CYCLE_ALREADY_CLOSED', classification: 'BAD_REQUEST' },
    },
  ],
};

/** closeCycle with a harvest date before the stocking date. A plain VALIDATION_ERROR. */
const HARVEST_BEFORE_STOCKING = {
  data: null,
  errors: [
    {
      message: 'Tarehe ya mavuno (2026-07-01) haiwezi kuwa kabla ya tarehe ya kuweka (2026-08-01).',
      path: ['closeCycle'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const SELECTED_CYCLE_KEY = 'samakiFarm.selectedCycleId';

function setup(permissions: string[], lang: Lang = 'sw') {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang(lang);

  const fixture = TestBed.createComponent(Production);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
    cycleSelection: TestBed.inject(CycleSelectionService),
  };
}

/** Every call is a POST to the same URL, so operations are told apart by name. */
function gql(httpMock: HttpTestingController, operation: string) {
  return httpMock.expectOne(
    (req) =>
      req.url === environment.graphqlUrl &&
      String((req.body as { query: string }).query).includes(operation),
  );
}

const text = (fixture: ComponentFixture<Production>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<Production>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

/** Answers the harvest-events read that selecting a cycle kicks off. */
async function flushEvents(
  fixture: ComponentFixture<Production>,
  httpMock: HttpTestingController,
  events: object[] = [],
) {
  gql(httpMock, 'CycleHarvestEvents').flush({ data: { harvestEvents: events } });
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Selects the first cycle and answers its events read. */
async function selectFirst(
  fixture: ComponentFixture<Production>,
  component: Production,
  httpMock: HttpTestingController,
  events: object[] = [],
) {
  component.selectCycle(component.cycles()[0]);
  fixture.detectChanges();
  await fixture.whenStable();
  await flushEvents(fixture, httpMock, events);
}

const variablesOf = (req: { request: { body: unknown } }) =>
  (req.request.body as { variables: Record<string, unknown> }).variables;

/** First paint plus the context load the component's effect kicks off. */
async function load(
  fixture: ComponentFixture<Production>,
  httpMock: HttpTestingController,
  body: object = CONTEXT,
) {
  fixture.detectChanges();
  gql(httpMock, 'ProductionContext').flush(body);
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Production', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the cycle context it exists to provide', () => {
    it('loads units, cycles and species in a single round trip', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard']);

      await load(fixture, httpMock);

      expect(component.units().length).toBe(2);
      expect(component.cycles().length).toBe(1);
      expect(component.species().length).toBe(1);
      expect(text(fixture)).toContain('T1');
      expect(text(fixture)).toContain('Sato');
      // A null size is a real state, not missing data - it reads as such.
      expect(text(fixture)).toContain('Haujawekwa');
      httpMock.verify();
    });

    it('selecting a cycle records it in the shared service and in storage', async () => {
      const { fixture, component, httpMock, cycleSelection } = setup(['view_dashboard']);
      await load(fixture, httpMock);

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      // Stored as a NUMBER, from a string id - the conversion the log screens
      // depend on.
      expect(cycleSelection.selectedCycleId()).toBe(9);
      expect(localStorage.getItem(SELECTED_CYCLE_KEY)).toBe('9');
      expect(component.selectedCycle()?.unit.code).toBe('T1');
      expect(panel(fixture, 'selection')?.textContent).toContain('T1');
    });

    it('a selection survives a reload and is resolved back to the whole cycle', async () => {
      localStorage.setItem(SELECTED_CYCLE_KEY, '9');
      const { fixture, component, httpMock } = setup(['view_dashboard']);

      await load(fixture, httpMock);

      expect(component.selectedCycle()?.cycleId).toBe('9');
      expect(text(fixture)).toContain('Nenda kwenye Ubora wa Maji');
    });

    it('drops a stored cycle this farm does not have, rather than pointing the log screens at it', async () => {
      // The shape of a farm switch, a deleted cycle, or last week's browser
      // value. The id is never sent anywhere - it simply is not in the answer.
      localStorage.setItem(SELECTED_CYCLE_KEY, '999');
      const { fixture, component, httpMock, cycleSelection } = setup(['view_dashboard']);

      await load(fixture, httpMock);

      expect(cycleSelection.selectedCycleId()).toBeNull();
      expect(component.selectedCycle()).toBeNull();
      expect(text(fixture)).toContain('Hujachagua mzunguko bado');
    });

    it('clearing the selection empties it again', async () => {
      const { fixture, component, httpMock, cycleSelection } = setup(['view_dashboard']);
      await load(fixture, httpMock);
      component.selectCycle(component.cycles()[0]);

      component.clearSelection();
      fixture.detectChanges();

      expect(cycleSelection.selectedCycleId()).toBeNull();
      expect(text(fixture)).toContain('Hujachagua mzunguko bado');
    });
  });

  describe('the write controls, gated separately from the screen', () => {
    it('offers neither form to a reader', async () => {
      const { fixture, httpMock } = setup(['view_dashboard']);

      await load(fixture, httpMock);

      expect(text(fixture)).not.toContain('Ongeza kitengo');
      expect(text(fixture)).not.toContain('Anzisha mzunguko');
    });

    it('offers only "add unit" to a manage_units holder', async () => {
      const { fixture, httpMock } = setup(['view_dashboard', 'manage_units']);

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Ongeza kitengo');
      expect(text(fixture)).not.toContain('Anzisha mzunguko');
    });

    it('offers only "start cycle" to an edit_cycle holder', async () => {
      const { fixture, httpMock } = setup(['view_dashboard', 'edit_cycle']);

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Anzisha mzunguko');
      expect(text(fixture)).not.toContain('Ongeza kitengo');
    });
  });

  describe('creating a unit', () => {
    it('sends only the fields that were filled in, then re-reads the farm', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'manage_units']);
      await load(fixture, httpMock);

      component.openUnitForm();
      component.unitForm.setValue({ code: 'T9', type: 'POND_LINED', sizeM3: '', waterSource: '' });
      component.submitUnit();

      const req = gql(httpMock, 'CreateProductionUnit');
      // Blank optionals travel as null, NOT as 0 or "" - a tank of unknown
      // size is not a tank of zero cubic metres.
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        input: { code: 'T9', type: 'POND_LINED', sizeM3: null, waterSource: null },
      });
      req.flush({
        data: {
          createProductionUnit: {
            unitId: '31',
            code: 'T9',
            type: 'POND_LINED',
            sizeM3: null,
            waterSource: null,
            status: 'IDLE',
          },
        },
      });
      await fixture.whenStable();

      gql(httpMock, 'ProductionContext').flush(CONTEXT);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.unitOpen()).toBe(false);
      expect(component.toastMessage()).toBe('Kitengo kimeundwa.');
    });

    it('names the duplicate code for CONFLICT, on the field that caused it', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'manage_units']);
      await load(fixture, httpMock);

      component.openUnitForm();
      component.unitForm.setValue({ code: 'T1', type: 'TANK', sizeM3: '', waterSource: '' });
      component.submitUnit();

      gql(httpMock, 'CreateProductionUnit').flush(UNIT_CONFLICT);
      await fixture.whenStable();

      expect(component.unitCodeError()).toBe(
        'Kitengo chenye msimbo huu tayari kipo kwenye shamba hili.',
      );
      expect(component.unitOpen()).toBe(true);
    });

    it('refuses to send a blank code at all', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'manage_units']);
      await load(fixture, httpMock);

      component.openUnitForm();
      component.submitUnit();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.unitCodeError()).toBe('Msimbo wa kitengo unahitajika.');
    });
  });

  describe('starting a cycle', () => {
    it('sends the stocking event and selects the new cycle straight away', async () => {
      const { fixture, component, httpMock, cycleSelection } = setup([
        'view_dashboard',
        'edit_cycle',
      ]);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.setValue({
        unitId: '28',
        speciesId: '1',
        stockingDate: '2026-09-02',
        fingerlingsCount: '400',
        survivalRateEstimate: '',
        stockingAgeMonths: '',
        fingerlingCost: '',
      });
      component.submitCycle();

      const req = gql(httpMock, 'CreateCycle');
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        input: {
          unitId: '28',
          speciesId: '1',
          stockingDate: '2026-09-02',
          fingerlingsCount: 400,
          // Left blank: the backend applies its own 0.85 default rather than
          // being told a number the user never gave.
          survivalRateEstimate: null,
          // Same rule. The backend's default happens to BE 0, so the stored
          // result is identical either way - but a 0 nobody typed is a claim
          // about the fish, and this one was never made.
          stockingAgeMonths: null,
          // Optional money: blank is "not recorded", never 0.
          fingerlingCost: null,
        },
      });
      req.flush({
        data: {
          createCycle: {
            ...RUNNING_CYCLE,
            cycleId: '12',
            stockingDate: '2026-09-02',
            fingerlingsCount: 400,
            unit: { unitId: '28', code: 'P2', type: 'POND_EARTHEN' },
          },
        },
      });
      await fixture.whenStable();

      // Selecting it is the point of creating it: the next thing anyone does
      // is record against it.
      expect(cycleSelection.selectedCycleId()).toBe(12);

      gql(httpMock, 'ProductionContext').flush(CONTEXT);
      await fixture.whenStable();

      expect(component.cycleOpen()).toBe(false);
      expect(component.toastMessage()).toBe('Mzunguko umeanzishwa.');
    });

    it('will not send a cycle with no fingerling count', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.patchValue({ fingerlingsCount: '' });
      component.submitCycle();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.cycleFieldError()).toBe('Idadi ya vifaranga inahitajika.');
    });
  });

  describe('the age the fish were stocked at', () => {
    it('sends it when it is given, so the harvest prediction can account for it', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.setValue({
        unitId: '28',
        speciesId: '1',
        stockingDate: '2026-09-02',
        fingerlingsCount: '400',
        survivalRateEstimate: '',
        // Six-month-old stock, not fingerlings: six fewer months to grow.
        stockingAgeMonths: 6,
        fingerlingCost: '',
      });
      component.submitCycle();

      const req = gql(httpMock, 'CreateCycle');
      expect(
        (req.request.body as { variables: { input: { stockingAgeMonths: unknown } } }).variables
          .input.stockingAgeMonths,
      ).toBe(6);

      req.flush({ data: { createCycle: { ...RUNNING_CYCLE, cycleId: '12' } } });
      await fixture.whenStable();
      gql(httpMock, 'ProductionContext').flush(CONTEXT);
      await fixture.whenStable();

      expect(component.cycleOpen()).toBe(false);
    });

    it('is optional - a blank box still starts a cycle', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.patchValue({ fingerlingsCount: '400', stockingAgeMonths: '' });
      component.submitCycle();

      const req = gql(httpMock, 'CreateCycle');
      expect(
        (req.request.body as { variables: { input: { stockingAgeMonths: unknown } } }).variables
          .input.stockingAgeMonths,
      ).toBeNull();
      expect(component.cycleFieldError()).toBeNull();
      req.flush({ data: { createCycle: { ...RUNNING_CYCLE, cycleId: '12' } } });
      await fixture.whenStable();
      gql(httpMock, 'ProductionContext').flush(CONTEXT);
      await fixture.whenStable();
    });

    it('refuses a negative age without asking the backend', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.patchValue({ fingerlingsCount: '400', stockingAgeMonths: -1 });
      component.submitCycle();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.cycleFieldError()).toBe('Umri wa samaki hauwezi kuwa pungufu ya sifuri.');
    });
  });

  describe('the ready-to-harvest indicator', () => {
    it('marks a cycle whose predicted date has passed', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard']);
      await load(fixture, httpMock, contextWith([DUE_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      expect(component.selectedIsReady()).toBe(true);
      expect(panel(fixture, 'cycles')?.textContent).toContain('Tayari kuvunwa');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-ready-banner]'),
      ).not.toBeNull();
    });

    it('does not mark a cycle whose date is still ahead', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard']);
      await load(fixture, httpMock, contextWith([RUNNING_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      expect(component.selectedIsReady()).toBe(false);
      expect(text(fixture)).not.toContain('Tayari kuvunwa');
    });

    it('never marks a cycle that is already closed - its harvest has happened', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard']);
      await load(fixture, httpMock, contextWith([CLOSED_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      expect(component.selectedIsReady()).toBe(false);
    });

    it('CHANGES NOTHING: the date passing sends no request and moves no status', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock, contextWith([DUE_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();
      await fixture.whenStable();

      // Selecting a cycle READS its harvest events - a query, not a write.
      await flushEvents(fixture, httpMock);

      // The whole guarantee of the indicator, asserted rather than assumed:
      // after those reads there is no further call, and the cycle is still
      // exactly as ACTIVE as it was.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.cycles()[0].status).toBe('ACTIVE');
      expect(component.cycles()[0].actualHarvestDate).toBeNull();
      expect(component.selectedIsClosed()).toBe(false);
      httpMock.verify();
    });
  });

  describe('closing a cycle', () => {
    /** Loads, selects the one cycle, answers its events, and opens the close form on it. */
    async function openClose(
      permissions: string[] = ['view_dashboard', 'edit_cycle'],
      cycles: object[] = [DUE_CYCLE],
      lang: Lang = 'sw',
      events: object[] = EVENTS,
    ) {
      const harness = setup(permissions, lang);
      await load(harness.fixture, harness.httpMock, contextWith(cycles));
      await selectFirst(harness.fixture, harness.component, harness.httpMock, events);
      harness.component.openCloseForm(harness.component.cycles()[0]);
      harness.fixture.detectChanges();
      return harness;
    }

    it('sends outcome, date and notes ONLY - no count or weight - with the outcome as a STRING', async () => {
      const { fixture, component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        actualHarvestDate: '2027-03-05',
        notes: '  Maji yalichafuka Februari.  ',
      });
      component.submitClose();

      const req = gql(httpMock, 'CloseCycle');
      const variables = variablesOf(req);

      // `outcome` is String! in the schema, not an enum - it travels as the
      // literal word, the same way unit.type does.
      expect(variables['outcome']).toBe('HARVESTED');
      expect(typeof variables['outcome']).toBe('string');
      // `cycleId` is Int! here, unlike the ID! on CreateCycleInput.
      expect(variables['cycleId']).toBe(9);
      expect(typeof variables['cycleId']).toBe('number');
      expect(variables['actualHarvestDate']).toBe('2027-03-05');
      expect(variables['notes']).toBe('Maji yalichafuka Februari.');
      // The V25 contract, exactly: the totals are the backend's to sum from
      // the events, and no survival rate is sent under ANY name.
      expect(Object.keys(variables).sort()).toEqual([
        'actualHarvestDate',
        'cycleId',
        'notes',
        'outcome',
      ]);
      // The mutation text itself no longer declares them either.
      const query = String((req.request.body as { query: string }).query);
      expect(query).not.toContain('harvestedCount:');
      expect(query).not.toContain('$totalWeightKg');

      req.flush({ data: { closeCycle: CLOSED_CYCLE } });
      await fixture.whenStable();

      gql(httpMock, 'ProductionContext').flush(contextWith([CLOSED_CYCLE]));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.closeTarget()).toBeNull();
      expect(component.toastMessage()).toBe('Mzunguko umefungwa.');
    });

    it('has no count or weight box in the form at all', async () => {
      const { fixture, component } = await openClose();

      expect(Object.keys(component.closeForm.controls).sort()).toEqual([
        'actualHarvestDate',
        'notes',
        'outcome',
      ]);
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('#close-count')).toBeNull();
      expect(host.querySelector('#close-weight')).toBeNull();
    });

    it('previews the totals closing will derive from the events', async () => {
      const { fixture } = await openClose(['view_dashboard', 'edit_cycle'], [DUE_CYCLE], 'en');

      const preview =
        (fixture.nativeElement as HTMLElement).querySelector('[data-close-totals]')?.textContent ??
        '';
      // SOLD 200 + REMOVED 50 out alive; DIED 30; weight 80.5 + 20.
      expect(preview).toContain('250');
      expect(preview).toContain('30');
      expect(preview).toContain('100.5');
    });

    it('surfaces the backend refusal of HARVESTED with nobody out alive as "use FAILED"', async () => {
      // Only a DIED event: the alive-out sum closeCycle would compute is zero.
      const { fixture, component, httpMock } = await openClose(
        ['view_dashboard', 'edit_cycle'],
        [DUE_CYCLE],
        'en',
        [DIED_EVENT],
      );

      // Warned before sending...
      expect(component.closeNoAliveOut()).toBe(true);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-close-no-alive]'),
      ).not.toBeNull();

      component.submitClose();

      // ...but still SENT: the list on screen may be stale, the backend holds
      // the real sum, and its refusal is what decides.
      gql(httpMock, 'CloseCycle').flush({
        data: null,
        errors: [
          {
            message: 'HARVESTED inahitaji angalau samaki mmoja wa SOLD/REMOVED - tumia FAILED.',
            path: ['closeCycle'],
            extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
          },
        ],
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.closeFormError()).toContain("use the 'Failed' outcome");
      expect(component.closeTarget()).not.toBeNull();
    });

    it('does not warn once somebody has left alive', async () => {
      const { component } = await openClose();

      expect(component.closeNoAliveOut()).toBe(false);
    });

    it('refuses a close date before the last harvest event, without sending', async () => {
      const { component, httpMock } = await openClose();

      component.closeForm.patchValue({ actualHarvestDate: isoDaysFromToday(-4) });
      component.submitClose();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      // SOLD_EVENT, three days ago, is the latest.
      expect(component.closeFieldError()).toBe(
        'Tarehe ya mavuno haiwezi kuwa kabla ya tukio la mwisho la mavuno.',
      );
    });

    it('defaults the close date to today', async () => {
      const { component } = await openClose();

      expect(component.closeForm.getRawValue().actualHarvestDate).toBe(component.todayDate);
    });

    it('ALLOWS FAILED with no events at all - a lost cycle is a real outcome', async () => {
      const { fixture, component, httpMock } = await openClose(
        ['view_dashboard', 'edit_cycle'],
        [DUE_CYCLE],
        'sw',
        [],
      );

      component.closeForm.patchValue({ outcome: 'FAILED' });
      component.submitClose();

      const req = gql(httpMock, 'CloseCycle');
      const variables = variablesOf(req);
      expect(variables['outcome']).toBe('FAILED');
      // An untouched notes box is null, not an empty string.
      expect(variables['notes']).toBeNull();

      req.flush({
        data: {
          closeCycle: {
            ...CLOSED_CYCLE,
            status: 'FAILED',
            harvestedCount: 0,
            totalWeightKg: 0,
            mortalityCount: 0,
            actualSurvivalRate: 0,
          },
        },
      });
      await fixture.whenStable();
      gql(httpMock, 'ProductionContext').flush(
        contextWith([{ ...CLOSED_CYCLE, status: 'FAILED', harvestedCount: 0, totalWeightKg: 0 }]),
      );
      await fixture.whenStable();

      expect(component.closeTarget()).toBeNull();
    });

    it('names the harvest-before-stocking rule when the backend refuses it', async () => {
      // No events, so the last-event check has nothing to say and the date
      // reaches the backend.
      const { fixture, component, httpMock } = await openClose(
        ['view_dashboard', 'edit_cycle'],
        [DUE_CYCLE],
        'sw',
        [],
      );

      component.closeForm.setValue({
        outcome: 'FAILED',
        // Before RUNNING_CYCLE's stockingDate of 2026-08-01.
        actualHarvestDate: '2026-07-01',
        notes: '',
      });
      component.submitClose();

      // It IS sent - the backend owns the comparison against the stored
      // stocking date. Its refusal is what puts the message on screen.
      gql(httpMock, 'CloseCycle').flush(HARVEST_BEFORE_STOCKING);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.closeFormError()).toBe(
        'Tarehe ya mavuno haiwezi kuwa kabla ya tarehe ya kupanda.',
      );
      // The form stays open with the bad date in it, to be corrected.
      expect(component.closeTarget()).not.toBeNull();
    });

    it('handles CYCLE_ALREADY_CLOSED by shutting the form and showing the stored harvest', async () => {
      const { fixture, component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        actualHarvestDate: '2027-03-05',
        notes: '',
      });
      component.submitClose();

      gql(httpMock, 'CloseCycle').flush(ALREADY_CLOSED);
      await fixture.whenStable();

      // Retrying cannot help, so the form goes rather than staying open over
      // a harvest that is already recorded - and the screen re-reads to show
      // what is actually stored.
      expect(component.closeTarget()).toBeNull();
      expect(component.closeActionError()?.errorCode).toBe('CYCLE_ALREADY_CLOSED');

      gql(httpMock, 'ProductionContext').flush(contextWith([CLOSED_CYCLE]));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain('tayari umefungwa');
      expect(component.selectedIsClosed()).toBe(true);
      httpMock.verify();
    });

    /**
     * The buttons beside the selected cycle - NOT the whole screen.
     *
     * The screen-wide text is the wrong thing to assert on here: the
     * ready-to-harvest banner says "Funga mzunguko ukiwa tayari" in prose, so
     * a page-level `not.toContain` would fail on advice rather than on a
     * control. The question is whether the ACTION is offered.
     */
    const selectionActions = (fixture: ComponentFixture<Production>) =>
      (fixture.nativeElement as HTMLElement).querySelector('.selection__actions')?.textContent ??
      '';

    it('offers no close button to somebody without edit_cycle', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard']);
      await load(fixture, httpMock, contextWith([DUE_CYCLE]));
      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      // A reader sees the badge and the advice, and has nothing to press.
      expect(component.selectedIsReady()).toBe(true);
      expect(selectionActions(fixture)).not.toContain('Funga mzunguko');
      expect(selectionActions(fixture)).toContain('Nenda kwenye Ubora wa Maji');
    });

    it('offers the close button to an edit_cycle holder on an open cycle', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock, contextWith([DUE_CYCLE]));
      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      expect(selectionActions(fixture)).toContain('Funga mzunguko');
    });

    it('offers no close button on a cycle that is already closed', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock, contextWith([CLOSED_CYCLE]));
      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      expect(selectionActions(fixture)).not.toContain('Funga mzunguko');
    });
  });

  describe('the closed-cycle summary', () => {
    it('shows the estimate and the actual as two separate, labelled numbers', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard'], 'en');
      await load(fixture, httpMock, contextWith([CLOSED_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const estimate = host.querySelector('[data-survival-estimate]');
      const actual = host.querySelector('[data-survival-actual]');

      // TWO ELEMENTS, two numbers. They disagree - 85% was the plan, 60% is
      // what happened - and neither is allowed to stand in for the other.
      expect(estimate?.textContent?.trim()).toBe('85%');
      expect(actual?.textContent?.trim()).toBe('60%');
      expect(estimate).not.toBe(actual);

      const summary = panel(fixture, 'harvest')?.textContent ?? '';
      expect(summary).toContain('Estimated survival');
      expect(summary).toContain('Actual survival');
    });

    it('shows the rest of the harvest read-only', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard'], 'en');
      await load(fixture, httpMock, contextWith([CLOSED_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      const summary = panel(fixture, 'harvest')?.textContent ?? '';
      expect(summary).toContain('Harvested');
      expect(summary).toContain('2027-03-05');
      expect(summary).toContain('300');
      expect(summary).toContain('120.5');
      expect(summary).toContain('Maji yalichafuka Februari.');
    });

    it('says the actual is not computed yet rather than printing a bare estimate', async () => {
      // A closed cycle the database has not given a rate for: the estimate is
      // still not allowed to fill the gap.
      const { fixture, component, httpMock } = setup(['view_dashboard'], 'en');
      await load(fixture, httpMock, contextWith([{ ...CLOSED_CYCLE, actualSurvivalRate: null }]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('[data-survival-estimate]')?.textContent?.trim()).toBe('85%');
      expect(host.querySelector('[data-survival-actual]')?.textContent?.trim()).toBe(
        'Not computed',
      );
    });

    it('shows no summary at all while a cycle is still running', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard']);
      await load(fixture, httpMock, contextWith([RUNNING_CYCLE]));

      component.selectCycle(component.cycles()[0]);
      fixture.detectChanges();

      expect(panel(fixture, 'harvest')).toBeNull();
    });
  });

  describe('the fingerling cost at stocking', () => {
    const FILLED = {
      unitId: '28',
      speciesId: '1',
      stockingDate: '2026-09-02',
      fingerlingsCount: '400',
      survivalRateEstimate: '',
      stockingAgeMonths: '',
    };

    it('is optional - blank travels as null, never 0', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.setValue({ ...FILLED, fingerlingCost: '' });
      component.submitCycle();

      const req = gql(httpMock, 'CreateCycle');
      expect((variablesOf(req)['input'] as Record<string, unknown>)['fingerlingCost']).toBeNull();
      expect(component.cycleFieldError()).toBeNull();
      req.flush({ data: { createCycle: { ...RUNNING_CYCLE, cycleId: '12' } } });
      await fixture.whenStable();
      gql(httpMock, 'ProductionContext').flush(CONTEXT);
      await fixture.whenStable();
    });

    it('is sent as a number when given', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      component.cycleForm.setValue({ ...FILLED, fingerlingCost: 250000.5 });
      component.submitCycle();

      const req = gql(httpMock, 'CreateCycle');
      expect((variablesOf(req)['input'] as Record<string, unknown>)['fingerlingCost']).toBe(
        250000.5,
      );
      req.flush({ data: { createCycle: { ...RUNNING_CYCLE, cycleId: '12' } } });
      await fixture.whenStable();
      gql(httpMock, 'ProductionContext').flush(CONTEXT);
      await fixture.whenStable();
    });

    it('refuses zero or a negative cost without asking the backend', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      for (const cost of [0, -5]) {
        component.openCycleForm();
        component.cycleForm.setValue({ ...FILLED, fingerlingCost: cost });
        component.submitCycle();

        httpMock.expectNone((r) => r.url === environment.graphqlUrl);
        expect(component.cycleFieldError()).toBe(
          'Gharama ya vifaranga lazima iwe zaidi ya sifuri.',
        );
      }
    });

    it('is offered to any edit_cycle holder, view_finance or not', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'edit_cycle']);
      await load(fixture, httpMock);

      component.openCycleForm();
      fixture.detectChanges();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('#cycle-fingerling-cost'),
      ).not.toBeNull();
    });
  });

  describe('harvest events', () => {
    const RECORDER = ['view_dashboard', 'record_harvest'];
    const MANAGER = ['view_dashboard', 'edit_cycle', 'record_harvest', 'view_finance'];
    /** A WORKER's bundle: field work, no finance, no harvest. */
    const WORKER = ['view_dashboard', 'log_feeding', 'log_water_quality', 'mark_task_done'];

    async function openEvents(
      permissions: string[],
      events: object[] = EVENTS,
      cycles: object[] = [RUNNING_CYCLE],
      lang: Lang = 'sw',
    ) {
      const harness = setup(permissions, lang);
      await load(harness.fixture, harness.httpMock, contextWith(cycles));
      await selectFirst(harness.fixture, harness.component, harness.httpMock, events);
      return harness;
    }

    const host = (fixture: ComponentFixture<Production>) => fixture.nativeElement as HTMLElement;
    const eventsPanel = (fixture: ComponentFixture<Production>) =>
      panel(fixture, 'harvest-events')?.textContent ?? '';
    const cellText = (fixture: ComponentFixture<Production>, row: number, cell: number) =>
      host(fixture)
        .querySelectorAll('[data-panel="harvest-events"] tbody tr')
        [row]?.querySelectorAll('td')
        [cell]?.textContent?.trim();

    /** Answers the record mutation and the events re-read that follows it. */
    async function completeRecord(
      fixture: ComponentFixture<Production>,
      httpMock: HttpTestingController,
      req: { flush: (body: object) => void },
      event: object,
    ) {
      req.flush({ data: { recordHarvestEvent: event } });
      await fixture.whenStable();
      await flushEvents(fixture, httpMock, [event, ...EVENTS]);
    }

    describe('reading them', () => {
      it("loads the selected cycle's events with the id converted to Int", async () => {
        const { fixture, component, httpMock } = setup(['view_dashboard']);
        await load(fixture, httpMock);

        component.selectCycle(component.cycles()[0]);
        fixture.detectChanges();
        await fixture.whenStable();

        const req = gql(httpMock, 'CycleHarvestEvents');
        expect(variablesOf(req)).toEqual({ cycleId: 9 });
        req.flush({ data: { harvestEvents: EVENTS } });
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.harvestEvents().length).toBe(3);
        expect(eventsPanel(fixture)).toContain('Wameuzwa');
        expect(eventsPanel(fixture)).toContain('Wamekufa');
        expect(eventsPanel(fixture)).toContain('Wametolewa');
      });

      it('tallies alive-out (SOLD + REMOVED), mortality (DIED) and revenue', async () => {
        const { fixture } = await openEvents(MANAGER, EVENTS, [RUNNING_CYCLE], 'en');

        const tally = (name: string) =>
          host(fixture).querySelector(`[data-tally-${name}]`)?.textContent?.trim();
        expect(tally('alive')).toBe('250');
        expect(tally('mortality')).toBe('30');
        expect(tally('weight')).toBe('100.5');
        expect(tally('revenue')).toBe(money(1200000));
      });

      it('lists date, reason, count, weight and sale amount per event', async () => {
        const { fixture } = await openEvents(MANAGER, EVENTS, [RUNNING_CYCLE], 'en');

        // Cells: [#, date, reason, count, weight, sale, actions]
        expect(cellText(fixture, 0, 1)).toBe(SOLD_EVENT.eventDate);
        expect(cellText(fixture, 0, 2)).toBe('Sold');
        expect(cellText(fixture, 0, 3)).toBe('200');
        expect(cellText(fixture, 0, 4)).toBe('80.5');
        expect(cellText(fixture, 0, 5)).toBe(money(1200000));
        // DIED with no weight and no sale: dashes, not "null" and not 0.
        expect(cellText(fixture, 2, 4)).toBe('—');
        expect(cellText(fixture, 2, 5)).toBe('—');
      });

      it('shows the empty state for a cycle with no events', async () => {
        const { fixture } = await openEvents(['view_dashboard'], []);

        expect(eventsPanel(fixture)).toContain('Hakuna tukio bado');
        expect(host(fixture).querySelector('[data-tally-alive]')?.textContent?.trim()).toBe('0');
      });

      it('drops a late answer for a cycle that is no longer selected', async () => {
        const { fixture, component, httpMock } = setup(['view_dashboard']);
        await load(fixture, httpMock);
        component.selectCycle(component.cycles()[0]);
        fixture.detectChanges();
        await fixture.whenStable();

        component.clearSelection();
        fixture.detectChanges();
        gql(httpMock, 'CycleHarvestEvents').flush({ data: { harvestEvents: EVENTS } });
        await fixture.whenStable();

        expect(component.harvestEvents().length).toBe(0);
      });
    });

    describe('money masking', () => {
      it('renders a masked sale amount as "—" for a WORKER, never 0, "null" or NaN', async () => {
        const { fixture } = await openEvents(WORKER, EVENTS_MASKED, [RUNNING_CYCLE], 'en');

        // The SOLD row's sale cell - the backend sent null for it.
        expect(cellText(fixture, 0, 5)).toBe('—');
        const panelText = eventsPanel(fixture);
        expect(panelText).not.toContain('null');
        expect(panelText).not.toContain('NaN');
        expect(panelText).not.toContain(money(0));
        expect(panelText).not.toContain(money(1200000));
        // No revenue tally at all without view_finance - but the counts stay.
        expect(host(fixture).querySelector('[data-tally-revenue]')).toBeNull();
        expect(host(fixture).querySelector('[data-tally-alive]')?.textContent?.trim()).toBe('250');
      });

      it('renders a masked SOLD amount as "—" in the revenue tally rather than a partial sum', async () => {
        // A finance holder whose list somehow carries a null SOLD amount.
        const { fixture } = await openEvents(MANAGER, EVENTS_MASKED, [RUNNING_CYCLE], 'en');

        expect(host(fixture).querySelector('[data-tally-revenue]')?.textContent?.trim()).toBe('—');
      });

      it('shows no money rows on a closed cycle to a WORKER, and no "null" anywhere', async () => {
        const masked = { ...CLOSED_CYCLE, totalRevenue: null, fingerlingCost: null };
        const { fixture } = await openEvents(WORKER, EVENTS_MASKED, [masked], 'en');

        const summary = panel(fixture, 'harvest')?.textContent ?? '';
        expect(host(fixture).querySelector('[data-summary-revenue]')).toBeNull();
        expect(host(fixture).querySelector('[data-summary-fingerling-cost]')).toBeNull();
        expect(summary).not.toContain('null');
        expect(summary).not.toContain(money(0));
      });

      it('renders an unrecorded fingerling cost as "—" for a finance holder', async () => {
        const { fixture } = await openEvents(
          MANAGER,
          EVENTS,
          [{ ...CLOSED_CYCLE, fingerlingCost: null }],
          'en',
        );

        expect(
          host(fixture).querySelector('[data-summary-fingerling-cost]')?.textContent?.trim(),
        ).toBe('—');
        expect(host(fixture).querySelector('[data-summary-revenue]')?.textContent?.trim()).toBe(
          money(1500000),
        );
      });

      it('money() keeps a real zero and dashes only null', () => {
        const { component } = setup(['view_dashboard']);

        expect(component.money(null)).toBe('—');
        expect(component.money(undefined)).toBe('—');
        expect(component.money(Number.NaN)).toBe('—');
        expect(component.money(0)).toBe(money(0));
      });
    });

    describe('the write controls', () => {
      it('offers record and delete to a record_harvest holder on an ACTIVE cycle', async () => {
        const { fixture } = await openEvents(RECORDER);

        expect(host(fixture).querySelector('[data-record-event]')).not.toBeNull();
        expect(host(fixture).querySelectorAll('[data-delete-event]').length).toBe(3);
      });

      it('offers neither without record_harvest - edit_cycle is not enough', async () => {
        const { fixture } = await openEvents(['view_dashboard', 'edit_cycle']);

        expect(host(fixture).querySelector('[data-record-event]')).toBeNull();
        expect(host(fixture).querySelectorAll('[data-delete-event]').length).toBe(0);
      });

      it('offers neither on a CLOSED cycle, but still lists its events', async () => {
        const { fixture, component } = await openEvents(MANAGER, EVENTS, [CLOSED_CYCLE]);

        expect(component.canDeleteEvents()).toBe(false);
        expect(host(fixture).querySelector('[data-record-event]')).toBeNull();
        expect(host(fixture).querySelectorAll('[data-delete-event]').length).toBe(0);
        expect(host(fixture).querySelector('[data-events-closed]')).not.toBeNull();
        expect(
          host(fixture).querySelectorAll('[data-panel="harvest-events"] tbody tr').length,
        ).toBe(3);
      });
    });

    describe('recording one', () => {
      it('records a SOLD event with weight and sale amount, reason as a STRING', async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 100,
          reason: 'SOLD',
          weightKg: 40,
          saleAmount: 600000,
        });
        component.submitEvent();

        const req = gql(httpMock, 'RecordHarvestEvent');
        expect(variablesOf(req)).toEqual({
          cycleId: 9,
          eventDate: isoDaysFromToday(-1),
          fishCount: 100,
          weightKg: 40,
          reason: 'SOLD',
          saleAmount: 600000,
        });
        expect(typeof variablesOf(req)['reason']).toBe('string');
        expect(typeof variablesOf(req)['cycleId']).toBe('number');

        await completeRecord(fixture, httpMock, req, {
          ...SOLD_EVENT,
          harvestEventId: '50',
          fishCount: 100,
          weightKg: 40,
          saleAmount: 600000,
        });

        expect(component.eventOpen()).toBe(false);
        expect(component.toastMessage()).toBe('Tukio la mavuno limerekodiwa.');
        expect(component.eventTally().aliveOut).toBe(350);
      });

      it('records a DIED event with no weight, and never sends a sale amount', async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 12,
          reason: 'DIED',
          weightKg: '',
          // Typed while SOLD was chosen, then the reason changed: must not ride along.
          saleAmount: 5000,
        });
        component.submitEvent();

        const req = gql(httpMock, 'RecordHarvestEvent');
        expect(variablesOf(req)['reason']).toBe('DIED');
        expect(variablesOf(req)['weightKg']).toBeNull();
        expect(variablesOf(req)['saleAmount']).toBeNull();

        await completeRecord(fixture, httpMock, req, { ...DIED_EVENT, harvestEventId: '51' });
        expect(component.eventOpen()).toBe(false);
      });

      it('records a REMOVED event with an optional weight and no sale amount', async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 20,
          reason: 'REMOVED',
          weightKg: 8.5,
          saleAmount: '',
        });
        component.submitEvent();

        const req = gql(httpMock, 'RecordHarvestEvent');
        expect(variablesOf(req)['reason']).toBe('REMOVED');
        expect(variablesOf(req)['weightKg']).toBe(8.5);
        expect(variablesOf(req)['saleAmount']).toBeNull();

        await completeRecord(fixture, httpMock, req, { ...REMOVED_EVENT, harvestEventId: '52' });
        expect(component.eventOpen()).toBe(false);
      });

      it('requires weight AND sale amount for SOLD, each above zero', async () => {
        const { component, httpMock } = await openEvents(RECORDER);
        const base = {
          eventDate: isoDaysFromToday(-1),
          fishCount: 10,
          reason: 'SOLD' as const,
        };
        const cases: [object, string][] = [
          [{ weightKg: '', saleAmount: 1000 }, 'Uzito unahitajika kwa samaki waliouzwa.'],
          [{ weightKg: 5, saleAmount: '' }, 'Kiasi cha mauzo kinahitajika kwa samaki waliouzwa.'],
          [{ weightKg: 0, saleAmount: 1000 }, 'Uzito lazima uwe zaidi ya sifuri.'],
          [{ weightKg: 5, saleAmount: 0 }, 'Kiasi cha mauzo lazima kiwe zaidi ya sifuri.'],
        ];

        for (const [fields, message] of cases) {
          component.openEventForm();
          component.eventForm.setValue({ ...base, weightKg: '', saleAmount: '', ...fields });
          component.submitEvent();

          httpMock.expectNone((r) => r.url === environment.graphqlUrl);
          expect(component.eventFieldError()).toBe(message);
        }
      });

      it('shows the sale amount box for SOLD only - hidden for DIED and REMOVED', async () => {
        const { fixture, component } = await openEvents(RECORDER);
        const saleBox = () => host(fixture).querySelector('#event-sale');

        component.openEventForm();
        fixture.detectChanges();
        // No reason chosen yet - it is a deliberate choice, not a default.
        expect(component.eventForm.getRawValue().reason).toBe('');
        expect(
          host(fixture).querySelectorAll('[data-reason-choice] input[type=radio]').length,
        ).toBe(3);
        expect(saleBox()).toBeNull();

        component.eventForm.controls.reason.setValue('SOLD');
        fixture.detectChanges();
        expect(saleBox()).not.toBeNull();

        component.eventForm.controls.reason.setValue('DIED');
        fixture.detectChanges();
        expect(saleBox()).toBeNull();

        component.eventForm.controls.reason.setValue('REMOVED');
        fixture.detectChanges();
        expect(saleBox()).toBeNull();
        // Weight stays available (optional) for every reason.
        expect(host(fixture).querySelector('#event-weight')).not.toBeNull();
      });

      it('requires a reason and a whole, positive fish count', async () => {
        const { component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        component.eventForm.patchValue({ fishCount: 10 });
        component.submitEvent();
        expect(component.eventFieldError()).toBe('Chagua sababu.');

        for (const count of [0, -3, 2.5, '']) {
          component.eventForm.patchValue({ reason: 'DIED', fishCount: count });
          component.submitEvent();
          expect(component.eventFieldError()).toBe(
            'Idadi ya samaki lazima iwe namba kamili zaidi ya sifuri.',
          );
        }
        httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      });

      it('defaults the date to today, and refuses a future date or one before stocking', async () => {
        const { component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        expect(component.eventForm.getRawValue().eventDate).toBe(component.todayDate);

        component.eventForm.patchValue({
          reason: 'DIED',
          fishCount: 3,
          eventDate: isoDaysFromToday(2),
        });
        component.submitEvent();
        expect(component.eventFieldError()).toBe('Tarehe ya tukio haiwezi kuwa ya baadaye.');

        // RUNNING_CYCLE was stocked 2026-08-01.
        component.eventForm.patchValue({ eventDate: '2026-07-15' });
        component.submitEvent();
        expect(component.eventFieldError()).toBe(
          'Tarehe ya tukio haiwezi kuwa kabla ya tarehe ya kupanda.',
        );
        httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      });

      it("keeps the backend's own sentence for a VALIDATION_ERROR and leaves the form open", async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 4,
          reason: 'DIED',
          weightKg: '',
          saleAmount: '',
        });
        component.submitEvent();
        gql(httpMock, 'RecordHarvestEvent').flush({
          data: null,
          errors: [
            {
              message: 'Sababu si sahihi. Chagua: SOLD, DIED, REMOVED.',
              path: ['recordHarvestEvent'],
              extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
            },
          ],
        });
        await fixture.whenStable();

        expect(component.eventFormError()).toBe('Sababu si sahihi. Chagua: SOLD, DIED, REMOVED.');
        expect(component.eventOpen()).toBe(true);
      });

      it('handles CYCLE_ALREADY_CLOSED by shutting the form and re-reading the cycle', async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        component.openEventForm();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 4,
          reason: 'DIED',
          weightKg: '',
          saleAmount: '',
        });
        component.submitEvent();
        gql(httpMock, 'RecordHarvestEvent').flush({
          ...ALREADY_CLOSED,
          errors: [{ ...ALREADY_CLOSED.errors[0], path: ['recordHarvestEvent'] }],
        });
        await fixture.whenStable();

        expect(component.eventOpen()).toBe(false);
        expect(component.eventsActionError()?.errorCode).toBe('CYCLE_ALREADY_CLOSED');

        gql(httpMock, 'ProductionContext').flush(contextWith([CLOSED_CYCLE]));
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.selectedIsClosed()).toBe(true);
        expect(host(fixture).querySelector('[data-record-event]')).toBeNull();
      });
    });

    describe('deleting one', () => {
      it('asks first, and sends nothing until confirmed', async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        (host(fixture).querySelector('[data-delete-event] button') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(component.deleteTarget()?.harvestEventId).toBe('41');
        expect(text(fixture)).toContain('Futa tukio la mavuno?');
        httpMock.expectNone((r) => r.url === environment.graphqlUrl);

        component.cancelDeleteEvent();
        expect(component.deleteTarget()).toBeNull();
      });

      it('deletes with the id converted to Int, then re-reads the events and totals', async () => {
        const { fixture, component, httpMock } = await openEvents(RECORDER);

        component.askDeleteEvent(component.harvestEvents()[0]);
        component.confirmDeleteEvent();

        const req = gql(httpMock, 'DeleteHarvestEvent');
        expect(variablesOf(req)).toEqual({ harvestEventId: 41 });
        req.flush({ data: { deleteHarvestEvent: true } });
        await fixture.whenStable();
        await flushEvents(fixture, httpMock, [REMOVED_EVENT, DIED_EVENT]);

        expect(component.deleteTarget()).toBeNull();
        expect(component.toastMessage()).toBe('Tukio limefutwa.');
        expect(component.eventTally().aliveOut).toBe(50);
      });

      it('will not delete on a closed cycle even if asked directly', async () => {
        const { component, httpMock } = await openEvents(MANAGER, EVENTS, [CLOSED_CYCLE]);

        component.askDeleteEvent(component.harvestEvents()[0]);
        component.confirmDeleteEvent();

        httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      });
    });

    /**
     * Accounted-for (alive-out + mortality) against the stocked count.
     *
     * RUNNING_CYCLE stocked 500; EVENTS account for 200 + 50 + 30 = 280. The
     * banners are signals only - the backend accepts more than was stocked,
     * so nothing here may close the cycle or hold back a record.
     */
    describe('the accounted-for vs stocked signal', () => {
      const TO_500 = { ...DIED_EVENT, harvestEventId: '44', fishCount: 220 };
      const TO_520 = { ...DIED_EVENT, harvestEventId: '44', fishCount: 240 };
      const reached = (fixture: ComponentFixture<Production>) =>
        host(fixture).querySelector('[data-stock-reached]');
      const exceeded = (fixture: ComponentFixture<Production>) =>
        host(fixture).querySelector('[data-stock-exceeded]');

      it('BELOW the stocked count shows neither banner', async () => {
        const { fixture, component } = await openEvents(RECORDER, EVENTS);

        expect(component.stockCheck()).toBeNull();
        expect(reached(fixture)).toBeNull();
        expect(exceeded(fixture)).toBeNull();
      });

      it('REACHED shows the close reminder with both numbers, and changes nothing', async () => {
        const { fixture, component, httpMock } = await openEvents(
          MANAGER,
          [...EVENTS, TO_500],
          [RUNNING_CYCLE],
          'en',
        );

        const banner = reached(fixture)?.textContent ?? '';
        expect(banner).toContain('500 of 500');
        expect(banner).toContain('Close the cycle');
        expect(exceeded(fixture)).toBeNull();

        // A reminder, not an action: no request beyond the reads already
        // answered, no status moved, no form opened.
        httpMock.expectNone((r) => r.url === environment.graphqlUrl);
        httpMock.verify();
        expect(component.cycles()[0].status).toBe('ACTIVE');
        expect(component.cycles()[0].actualHarvestDate).toBeNull();
        expect(component.selectedIsClosed()).toBe(false);
        expect(component.closeTarget()).toBeNull();
        expect(component.eventOpen()).toBe(false);
        expect(component.harvestEvents().length).toBe(4);
        expect(host(fixture).querySelector('[data-record-event]')).not.toBeNull();
      });

      it('EXCEEDED warns with both numbers, and the record button still opens and still submits', async () => {
        const { fixture, component, httpMock } = await openEvents(
          RECORDER,
          [...EVENTS, TO_520],
          [RUNNING_CYCLE],
          'en',
        );

        expect(exceeded(fixture)?.textContent).toContain('520 of 500');
        expect(reached(fixture)).toBeNull();

        const recordButton = host(fixture).querySelector(
          '[data-record-event] button',
        ) as HTMLButtonElement;
        expect(recordButton.disabled).toBe(false);
        recordButton.click();
        fixture.detectChanges();
        expect(component.eventOpen()).toBe(true);

        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 10,
          reason: 'DIED',
          weightKg: '',
          saleAmount: '',
        });
        component.submitEvent();

        expect(component.eventFieldError()).toBeNull();
        const req = gql(httpMock, 'RecordHarvestEvent');
        expect(variablesOf(req)['fishCount']).toBe(10);
        const recorded = { ...DIED_EVENT, harvestEventId: '53', fishCount: 10 };
        req.flush({ data: { recordHarvestEvent: recorded } });
        await fixture.whenStable();
        await flushEvents(fixture, httpMock, [recorded, ...EVENTS, TO_520]);

        expect(component.eventOpen()).toBe(false);
        expect(component.toastMessage()).toBe('Harvest event recorded.');
        expect(exceeded(fixture)?.textContent).toContain('530 of 500');
        httpMock.verify();
      });

      it('updates live as events are recorded and deleted', async () => {
        const { fixture, component, httpMock } = await openEvents(
          RECORDER,
          EVENTS,
          [RUNNING_CYCLE],
          'en',
        );
        expect(reached(fixture)).toBeNull();

        component.openEventForm();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 220,
          reason: 'DIED',
          weightKg: '',
          saleAmount: '',
        });
        component.submitEvent();
        gql(httpMock, 'RecordHarvestEvent').flush({ data: { recordHarvestEvent: TO_500 } });
        await fixture.whenStable();
        await flushEvents(fixture, httpMock, [TO_500, ...EVENTS]);

        expect(reached(fixture)?.textContent).toContain('500 of 500');
        expect(component.cycles()[0].status).toBe('ACTIVE');

        component.askDeleteEvent(component.harvestEvents()[0]);
        component.confirmDeleteEvent();
        gql(httpMock, 'DeleteHarvestEvent').flush({ data: { deleteHarvestEvent: true } });
        await fixture.whenStable();
        await flushEvents(fixture, httpMock, EVENTS);

        expect(reached(fixture)).toBeNull();
        expect(exceeded(fixture)).toBeNull();
        // Record, delete and their re-reads - and never a CloseCycle.
        httpMock.verify();
      });

      it('speaks Swahili with the same numbers', async () => {
        const { fixture } = await openEvents(RECORDER, [...EVENTS, TO_520]);

        expect(exceeded(fixture)?.textContent).toContain('umehesabu 520 kati ya 500');
      });

      it('shows nothing on a closed cycle', async () => {
        const { fixture, component } = await openEvents(MANAGER, [...EVENTS, TO_520], [
          CLOSED_CYCLE,
        ]);

        expect(component.stockCheck()).toBeNull();
        expect(reached(fixture)).toBeNull();
        expect(exceeded(fixture)).toBeNull();
      });

      it('carries both banners, with both numbers, in both languages', () => {
        for (const lang of ['sw', 'en'] as const) {
          for (const key of ['stockReachedBanner', 'stockExceededBanner'] as const) {
            expect(PRODUCTION_I18N[lang][key]).toContain('{accounted}');
            expect(PRODUCTION_I18N[lang][key]).toContain('{stocked}');
          }
        }
      });
    });

    /**
     * Correcting a mistake: an event (correctHarvestEvent - one transaction on
     * the backend, new id back) or the stocked count (correctFingerlingsCount).
     * RUNNING_CYCLE stocked 500; OVER takes the tally to 520.
     */
    describe('correcting mistakes', () => {
      const OVER = { ...DIED_EVENT, harvestEventId: '44', fishCount: 240 };
      const OVER_EVENTS = [...EVENTS, OVER];
      const reached = (fixture: ComponentFixture<Production>) =>
        host(fixture).querySelector('[data-stock-reached]');
      const exceeded = (fixture: ComponentFixture<Production>) =>
        host(fixture).querySelector('[data-stock-exceeded]');

      it('offers Edit on every row of an ACTIVE cycle, and none on a closed one', async () => {
        const active = await openEvents(RECORDER);
        expect(host(active.fixture).querySelectorAll('[data-edit-event]').length).toBe(3);

        TestBed.resetTestingModule();
        const closed = await openEvents(MANAGER, EVENTS, [CLOSED_CYCLE]);
        expect(host(closed.fixture).querySelectorAll('[data-edit-event]').length).toBe(0);
      });

      it('Edit opens the form filled with that event', async () => {
        const { fixture, component } = await openEvents(MANAGER, EVENTS, [RUNNING_CYCLE], 'en');

        (host(fixture).querySelector('[data-edit-event] button') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(component.eventOpen()).toBe(true);
        expect(component.editTarget()?.harvestEventId).toBe('41');
        expect(component.eventForm.getRawValue()).toEqual({
          eventDate: SOLD_EVENT.eventDate,
          fishCount: 200,
          reason: 'SOLD',
          weightKg: 80.5,
          saleAmount: 1200000,
        });
        expect(text(fixture)).toContain('Correct harvest event');
      });

      it('saving a correction sends CorrectHarvestEvent - not a new record - and the tally follows', async () => {
        const { fixture, component, httpMock } = await openEvents(
          RECORDER,
          OVER_EVENTS,
          [RUNNING_CYCLE],
          'en',
        );
        expect(exceeded(fixture)?.textContent).toContain('520 of 500');

        component.openEditEvent(component.harvestEvents()[3]);
        component.eventForm.patchValue({ fishCount: 220 });
        component.submitEvent();

        const req = gql(httpMock, 'CorrectHarvestEvent');
        expect(variablesOf(req)).toEqual({
          harvestEventId: 44,
          eventDate: OVER.eventDate,
          fishCount: 220,
          weightKg: null,
          reason: 'DIED',
          saleAmount: null,
        });
        const corrected = { ...OVER, harvestEventId: '60', fishCount: 220 };
        req.flush({ data: { correctHarvestEvent: corrected } });
        await fixture.whenStable();
        await flushEvents(fixture, httpMock, [...EVENTS, corrected]);

        expect(component.eventOpen()).toBe(false);
        expect(component.editTarget()).toBeNull();
        expect(component.toastMessage()).toBe('Harvest event corrected.');
        expect(reached(fixture)?.textContent).toContain('500 of 500');
        expect(exceeded(fixture)).toBeNull();
        // One correction and its re-read: no RecordHarvestEvent, no CloseCycle.
        httpMock.verify();
      });

      it('a correction runs the same checks as a record, without sending', async () => {
        const { component, httpMock } = await openEvents(RECORDER);

        component.openEditEvent(component.harvestEvents()[0]);
        component.eventForm.patchValue({ weightKg: '' });
        component.submitEvent();

        httpMock.expectNone((r) => r.url === environment.graphqlUrl);
        expect(component.eventFieldError()).toBe('Uzito unahitajika kwa samaki waliouzwa.');
      });

      it('"record" after an edit is a new record again, not another correction', async () => {
        const { component, httpMock } = await openEvents(RECORDER);

        component.openEditEvent(component.harvestEvents()[0]);
        component.closeEventForm();
        component.openEventForm();

        expect(component.editTarget()).toBeNull();
        component.eventForm.setValue({
          eventDate: isoDaysFromToday(-1),
          fishCount: 5,
          reason: 'DIED',
          weightKg: '',
          saleAmount: '',
        });
        component.submitEvent();
        gql(httpMock, 'RecordHarvestEvent');
      });

      it('offers "correct fingerlings" to an edit_cycle holder - beside the cycle and in the warning', async () => {
        const { fixture } = await openEvents(MANAGER, OVER_EVENTS);

        expect(host(fixture).querySelector('[data-correct-fingerlings]')).not.toBeNull();
        expect(
          exceeded(fixture)?.querySelector('[data-banner-correct-fingerlings]'),
        ).not.toBeNull();
      });

      it('offers neither without edit_cycle - the warning still shows', async () => {
        const { fixture } = await openEvents(RECORDER, OVER_EVENTS);

        expect(exceeded(fixture)).not.toBeNull();
        expect(host(fixture).querySelector('[data-correct-fingerlings]')).toBeNull();
        expect(host(fixture).querySelector('[data-banner-correct-fingerlings]')).toBeNull();
      });

      it('correcting the stocked count sends it, re-reads the cycles, and the warning clears', async () => {
        const { fixture, component, httpMock } = await openEvents(
          MANAGER,
          OVER_EVENTS,
          [RUNNING_CYCLE],
          'en',
        );

        (
          exceeded(fixture)?.querySelector('[data-banner-correct-fingerlings] button') as HTMLButtonElement
        ).click();
        fixture.detectChanges();
        expect(component.fingerlingsOpen()).toBe(true);
        expect(component.fingerlingsForm.getRawValue().fingerlingsCount).toBe(500);

        component.fingerlingsForm.setValue({ fingerlingsCount: 520 });
        component.submitFingerlings();

        const req = gql(httpMock, 'CorrectFingerlingsCount');
        expect(variablesOf(req)).toEqual({ cycleId: 9, fingerlingsCount: 520 });
        const corrected = { ...RUNNING_CYCLE, fingerlingsCount: 520 };
        req.flush({ data: { correctFingerlingsCount: corrected } });
        await fixture.whenStable();
        gql(httpMock, 'ProductionContext').flush(contextWith([corrected]));
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.fingerlingsOpen()).toBe(false);
        expect(component.toastMessage()).toBe('Fingerling count corrected.');
        expect(exceeded(fixture)).toBeNull();
        expect(reached(fixture)?.textContent).toContain('520 of 520');
        // The events were not re-read (same cycle), and nothing was closed.
        httpMock.verify();
      });

      it('refuses a zero or fractional count without sending', async () => {
        const { component, httpMock } = await openEvents(MANAGER, OVER_EVENTS);

        for (const count of [0, -1, 2.5, '']) {
          component.openFingerlingsForm();
          component.fingerlingsForm.setValue({ fingerlingsCount: count });
          component.submitFingerlings();

          httpMock.expectNone((r) => r.url === environment.graphqlUrl);
          expect(component.fingerlingsError()).toBe(
            'Idadi ya vifaranga lazima iwe namba kamili zaidi ya sifuri.',
          );
        }
      });

      it('CYCLE_ALREADY_CLOSED shuts the form, keeps the refusal on screen and re-reads', async () => {
        const { fixture, component, httpMock } = await openEvents(MANAGER, OVER_EVENTS);

        component.openFingerlingsForm();
        component.fingerlingsForm.setValue({ fingerlingsCount: 520 });
        component.submitFingerlings();
        gql(httpMock, 'CorrectFingerlingsCount').flush({
          ...ALREADY_CLOSED,
          errors: [{ ...ALREADY_CLOSED.errors[0], path: ['correctFingerlingsCount'] }],
        });
        await fixture.whenStable();

        expect(component.fingerlingsOpen()).toBe(false);
        expect(component.closeActionError()?.errorCode).toBe('CYCLE_ALREADY_CLOSED');
        gql(httpMock, 'ProductionContext').flush(contextWith([CLOSED_CYCLE]));
        await fixture.whenStable();
      });
    });
  });

  describe('the closed-cycle summary, derived from events', () => {
    it('shows alive-out, mortality, weight, both survival rates and - for finance - the money', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'view_finance'], 'en');
      await load(fixture, httpMock, contextWith([CLOSED_CYCLE]));
      await selectFirst(fixture, component, httpMock, EVENTS);

      const host = fixture.nativeElement as HTMLElement;
      const summary = panel(fixture, 'harvest')?.textContent ?? '';
      expect(summary).toContain('Out alive (sold + removed)');
      expect(summary).toContain('300');
      expect(host.querySelector('[data-summary-mortality]')?.textContent?.trim()).toBe('40');
      expect(summary).toContain('120.5');
      expect(host.querySelector('[data-survival-estimate]')?.textContent?.trim()).toBe('85%');
      expect(host.querySelector('[data-survival-actual]')?.textContent?.trim()).toBe('60%');
      expect(host.querySelector('[data-summary-revenue]')?.textContent?.trim()).toBe(
        money(1500000),
      );
      expect(host.querySelector('[data-summary-fingerling-cost]')?.textContent?.trim()).toBe(
        money(250000),
      );
    });

    it('says "Not set" for the mortality of a cycle closed before events existed', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard'], 'en');
      await load(fixture, httpMock, contextWith([{ ...CLOSED_CYCLE, mortalityCount: null }]));
      await selectFirst(fixture, component, httpMock, []);

      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('[data-summary-mortality]')
          ?.textContent?.trim(),
      ).toBe('Not set');
    });
  });

  describe('failures', () => {
    it('shows the mapped message when the whole context is refused', async () => {
      const { fixture, component, httpMock } = setup([]);

      await load(fixture, httpMock, FORBIDDEN);

      expect(component.loadError()?.errorCode).toBe('FORBIDDEN');
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      // Nothing stale is left on screen offering a cycle to select.
      expect(component.cycles().length).toBe(0);
    });

    it('renders in English when the UI language is English', async () => {
      const { fixture, httpMock } = setup(['view_dashboard', 'manage_units'], 'en');

      await load(fixture, httpMock);

      expect(text(fixture)).toContain('Production');
      expect(text(fixture)).toContain('Add unit');
      expect(text(fixture)).toContain('No cycle selected yet');
    });
  });
});

/**
 * Ukanda wa takwimu juu ya skrini.
 *
 * Kinachobanwa hapa ni kwamba namba zinatoka kwa data ILIYO KWENYE UKURASA -
 * hakuna ombi jipya. Ukanda ukianza kuomba data yake yenyewe, skrini
 * ingeweza kuonyesha jedwali la hali moja na ukanda wa hali nyingine.
 */
/**
 * Rail ya muhtasari.
 *
 * Kinachobanwa ni kwamba namba zinatoka kwa data ILIYO KWENYE UKURASA - hakuna
 * ombi jipya. Rail ikianza kuomba data yake yenyewe, skrini ingeweza kuonyesha
 * jedwali la hali moja na rail ya hali nyingine.
 */
describe('Production summary rail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('counts the cycles by outcome, from data already fetched', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    // Tarehe ya mavuno ya CLOSED_CYCLE ni ya BAADAYE (2027) - fixture hiyo ipo
    // kwa ajili ya paneli ya muhtasari. Hapa inahitajika iwe na mantiki:
    // mzunguko uliofungwa tarehe iliyopita.
    const harvested = { ...CLOSED_CYCLE, cycleId: '10', actualHarvestDate: isoDaysFromToday(-10) };
    await load(fixture, httpMock, contextWith([RUNNING_CYCLE, harvested]));

    const rows = fixture.componentInstance.cycleSummary();
    const by = (label: string) => rows.find((row) => row.label === label)?.value;

    expect(by('Mizunguko yote')).toBe(2);
    expect(by('Inayoendelea')).toBe(1);
    expect(by('Imevunwa')).toBe(1);
    expect(by('Imeshindwa')).toBe(0);

    // Hakuna ombi lolote zaidi ya lile la skrini yenyewe.
    httpMock.verify();
  });

  it('keeps the total independent of the three outcomes below it', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    // Tarehe ya mavuno ya CLOSED_CYCLE ni ya BAADAYE (2027) - fixture hiyo ipo
    // kwa ajili ya paneli ya muhtasari. Hapa inahitajika iwe na mantiki:
    // mzunguko uliofungwa tarehe iliyopita.
    const harvested = { ...CLOSED_CYCLE, cycleId: '10', actualHarvestDate: isoDaysFromToday(-10) };
    await load(fixture, httpMock, contextWith([RUNNING_CYCLE, harvested]));

    // Jumla ni `cycles.length`, si jumla ya safu tatu. Backend ikiongeza
    // matokeo ya nne, lazima yaonekane kama pengo - si kutoweka kimya kimya.
    const rows = fixture.componentInstance.cycleSummary();
    const total = rows[0].value;
    const outcomes = rows.slice(1).reduce((sum, row) => sum + row.value, 0);
    expect(total).toBe(2);
    expect(outcomes).toBe(2);
  });

  it('scales the unit bars against the biggest count, not the total', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    // UNITS ya harness: T1 ACTIVE, P2 IDLE - moja kila moja.
    const bars = fixture.componentInstance.unitsByStatus();
    expect(bars.map((bar) => bar.key)).toEqual(['ACTIVE', 'IDLE', 'MAINTENANCE']);
    expect(bars.find((bar) => bar.key === 'ACTIVE')?.count).toBe(1);
    expect(bars.find((bar) => bar.key === 'ACTIVE')?.percent).toBe(100);
    // MAINTENANCE haiandikwi na msimbo wowote - sifuri ndilo jibu la kweli,
    // na safu inabaki ili kadi iendelee kudai inachokifunika.
    expect(bars.find((bar) => bar.key === 'MAINTENANCE')?.count).toBe(0);
  });

  it('breaks the units down by type as well', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const bars = fixture.componentInstance.unitsByType();
    expect(bars.find((bar) => bar.key === 'TANK')?.count).toBe(1);
    expect(bars.find((bar) => bar.key === 'POND_EARTHEN')?.count).toBe(1);
    expect(bars.find((bar) => bar.key === 'POND_LINED')?.count).toBe(0);
  });

  it('shows unit types in words, never as codes', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const element = fixture.nativeElement as HTMLElement;
    const rail = Array.from(element.querySelectorAll('.mini-bars__label')).map((label) =>
      label.textContent?.trim(),
    );
    expect(rail).toEqual(
      expect.arrayContaining(['Tangi', 'Bwawa la kuchimbwa', 'Bwawa la kujengwa']),
    );
    // Jedwali la vitengo pia: P2 ni bwawa la kuchimbwa, si "POND_EARTHEN".
    expect(element.textContent).toContain('Bwawa la kuchimbwa');
    expect(element.textContent).not.toMatch(/\b(TANK|POND_EARTHEN|POND_LINED)\b/);
  });

  it('renders the five cards beside the work, not above it', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const element = fixture.nativeElement as HTMLElement;
    const rail = element.querySelector('.module-rail');
    expect(rail).not.toBeNull();
    // Nne + kalenda, ambayo nayo ni .side-card (angalia DatePickerCard).
    expect(rail!.querySelectorAll('.side-card').length).toBe(5);
    // Rail ni DADA wa safu ya kazi, si ndani yake - vinginevyo ingekuwa juu
    // ya jedwali badala ya pembeni yake.
    expect(rail!.parentElement?.classList.contains('module-layout')).toBe(true);
  });

  it('follows the language', async () => {
    const { fixture, httpMock } = setup(['view_dashboard'], 'en');
    await load(fixture, httpMock);

    expect(fixture.componentInstance.cycleSummary().map((row) => row.label)).toContain('Running');
    expect(fixture.componentInstance.unitStatusLabel('IDLE')).toBe('Idle');
    expect(fixture.componentInstance.unitTypeLabel('POND_LINED')).toBe('Lined Pond');
  });
  it('keeps the intro card for somebody who may start nothing', async () => {
    // VIEWER: hana manage_units wala edit_cycle. Kadi inabaki - maelezo ndiyo
    // kusudi lake; mabuttoni ni yale anayoweza kuyafanyia kazi.
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const element = fixture.nativeElement as HTMLElement;
    const intro = element.querySelector('.side-card--intro');
    expect(intro).not.toBeNull();
    expect(intro!.textContent).toContain('Rekodi matukio ya mavuno');
    expect(intro!.querySelectorAll('.intro__actions button').length).toBe(0);
  });

  it('puts both actions in the intro card for somebody who holds both', async () => {
    const { fixture, httpMock } = setup(['view_dashboard', 'manage_units', 'edit_cycle']);
    await load(fixture, httpMock);

    const element = fixture.nativeElement as HTMLElement;
    const actions = element.querySelectorAll('.side-card--intro .intro__actions button');
    expect(actions.length).toBe(2);
    // Hayaelei tena kwenye kona - yalikuwa juu ya rail yakiwa ya hakuna kitu.
    expect(element.querySelector('.page-actions')).toBeNull();
  });
});

/**
 * Kalenda ya rail.
 *
 * Mgawanyo ndio jambo: hesabu za MIZUNGUKO zinakokotolewa hapa hapa kutoka kwa
 * tarehe zilizo kwenye ukurasa, huku hesabu za VITENGO zikitoka backend - kwa
 * sababu ProductionUnit haina created_at, hivyo "vilivyokuwepo tarehe X"
 * hakijibiki upande huu. Ombi moja tu, na ni kwa ajili ya vitengo.
 */
describe('Production date picker', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** Jibu la `dashboardOnDate` kwa siku yenye rekodi. */
  function dayResponse(date: string, overrides: Record<string, unknown> = {}) {
    return {
      data: {
        dashboardOnDate: {
          date,
          unitsExisting: 9,
          unitsActive: 5,
          unitsIdle: 4,
          unitsByType: [
            { type: 'TANK', count: 7 },
            { type: 'POND_EARTHEN', count: 2 },
          ],
          historyStartsOn: '2020-01-01',
          historyComplete: true,
          ...overrides,
        },
      },
    };
  }

  it('starts on today, and asks the backend for nothing', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    expect(fixture.componentInstance.viewingToday()).toBe(true);
    // Hakuna mstari chini ya kalenda: leo hakuna cha kueleza.
    expect(fixture.componentInstance.dayState()).toBeNull();
    httpMock.verify();
  });

  it('counts the cycles for a past date WITHOUT asking the backend', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    // Mzunguko mmoja ulioanza miaka miwili iliyopita na kufungwa jana.
    const old = {
      ...CLOSED_CYCLE,
      cycleId: '11',
      stockingDate: isoDaysFromToday(-700),
      actualHarvestDate: isoDaysFromToday(-1),
    };
    await load(fixture, httpMock, contextWith([old]));

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    fixture.componentInstance.selectDate(twoDaysAgo);

    // Ombi moja PEKEE, na ni la vitengo.
    const request = httpMock.expectOne((r) => r.body?.query?.includes('dashboardOnDate'));
    request.flush(dayResponse(fixture.componentInstance.selectedDate()));
    await fixture.whenStable();
    fixture.detectChanges();

    // Juzi ulikuwa bado unaendelea - ulifungwa jana.
    const rows = fixture.componentInstance.cycleSummary();
    expect(rows.find((row) => row.label === 'Inayoendelea')?.value).toBe(1);
    expect(rows.find((row) => row.label === 'Imevunwa')?.value).toBe(0);
  });

  it('takes the unit cards from the dated answer', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const past = new Date();
    past.setDate(past.getDate() - 3);
    fixture.componentInstance.selectDate(past);
    httpMock
      .expectOne((r) => r.body?.query?.includes('dashboardOnDate'))
      .flush(dayResponse(fixture.componentInstance.selectedDate()));
    await fixture.whenStable();
    fixture.detectChanges();

    const status = fixture.componentInstance.unitsByStatus();
    expect(status.find((bar) => bar.key === 'ACTIVE')?.count).toBe(5);
    expect(status.find((bar) => bar.key === 'IDLE')?.count).toBe(4);

    // POND_LINED haikurudi kwenye jibu - sifuri inatoka kwenye orodha yetu, ili
    // kadi isibadilike umbo kulingana na data iliyopo.
    const types = fixture.componentInstance.unitsByType();
    expect(types.map((bar) => bar.key)).toEqual(['TANK', 'POND_EARTHEN', 'POND_LINED']);
    expect(types.find((bar) => bar.key === 'TANK')?.count).toBe(7);
    expect(types.find((bar) => bar.key === 'POND_LINED')?.count).toBe(0);
  });

  it('says there is no record rather than reporting an empty farm', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const longAgo = new Date();
    longAgo.setFullYear(longAgo.getFullYear() - 5);
    fixture.componentInstance.selectDate(longAgo);
    httpMock
      .expectOne((r) => r.body?.query?.includes('dashboardOnDate'))
      .flush(
        dayResponse(fixture.componentInstance.selectedDate(), {
          unitsExisting: 0,
          unitsActive: 0,
          unitsIdle: 0,
          unitsByType: [],
          historyComplete: false,
        }),
      );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.dayState()).toContain('Hakuna rekodi ya tarehe hii');
  });

  it('returns to the live numbers on "back to today"', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const past = new Date();
    past.setDate(past.getDate() - 4);
    fixture.componentInstance.selectDate(past);
    httpMock
      .expectOne((r) => r.body?.query?.includes('dashboardOnDate'))
      .flush(dayResponse(fixture.componentInstance.selectedDate()));
    await fixture.whenStable();

    fixture.componentInstance.backToToday();
    fixture.detectChanges();

    expect(fixture.componentInstance.viewingToday()).toBe(true);
    expect(fixture.componentInstance.day()).toBeNull();
    // UNITS ya harness: T1 ACTIVE, P2 IDLE - namba za moja kwa moja tena.
    expect(fixture.componentInstance.unitsByStatus().find((b) => b.key === 'ACTIVE')?.count).toBe(
      1,
    );
    httpMock.verify();
  });

  it('keeps the date selected when its fetch fails', async () => {
    const { fixture, httpMock } = setup(['view_dashboard']);
    await load(fixture, httpMock);

    const past = new Date();
    past.setDate(past.getDate() - 2);
    fixture.componentInstance.selectDate(past);
    const chosen = fixture.componentInstance.selectedDate();
    httpMock
      .expectOne((r) => r.body?.query?.includes('dashboardOnDate'))
      .flush({ errors: [{ message: 'nope', extensions: { errorCode: 'FORBIDDEN' } }], data: null });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedDate()).toBe(chosen);
    expect(fixture.componentInstance.dayError()).not.toBeNull();
    expect(fixture.componentInstance.dayState()).toContain('Imeshindikana');
  });
});
