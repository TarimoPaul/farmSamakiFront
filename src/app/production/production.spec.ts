import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Production } from './production';
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
  return date.toISOString().slice(0, 10);
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
  actualHarvestDate: null,
  harvestedCount: null,
  totalWeightKg: null,
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
  harvestNotes: 'Maji yalichafuka Februari.',
  actualSurvivalRate: 0.6,
  status: 'HARVESTED',
};

const UNITS = [
  { unitId: '27', code: 'T1', type: 'TANK', sizeM3: 12.5, waterSource: 'Kisima', status: 'ACTIVE' },
  { unitId: '28', code: 'P2', type: 'POND', sizeM3: null, waterSource: null, status: 'IDLE' },
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
      component.unitForm.setValue({ code: 'T9', type: 'POND', sizeM3: '', waterSource: '' });
      component.submitUnit();

      const req = gql(httpMock, 'CreateProductionUnit');
      // Blank optionals travel as null, NOT as 0 or "" - a tank of unknown
      // size is not a tank of zero cubic metres.
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        input: { code: 'T9', type: 'POND', sizeM3: null, waterSource: null },
      });
      req.flush({
        data: {
          createProductionUnit: {
            unitId: '31',
            code: 'T9',
            type: 'POND',
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
        },
      });
      req.flush({
        data: {
          createCycle: {
            ...RUNNING_CYCLE,
            cycleId: '12',
            stockingDate: '2026-09-02',
            fingerlingsCount: 400,
            unit: { unitId: '28', code: 'P2', type: 'POND' },
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

      // The whole guarantee of the indicator, asserted rather than assumed:
      // after the context load there is no second call, and the cycle is
      // still exactly as ACTIVE as it was.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.cycles()[0].status).toBe('ACTIVE');
      expect(component.cycles()[0].actualHarvestDate).toBeNull();
      expect(component.selectedIsClosed()).toBe(false);
      httpMock.verify();
    });
  });

  describe('closing a cycle', () => {
    /** Loads, selects the one cycle, and opens the close form on it. */
    async function openClose(
      permissions: string[] = ['view_dashboard', 'edit_cycle'],
      cycles: object[] = [DUE_CYCLE],
      lang: Lang = 'sw',
    ) {
      const harness = setup(permissions, lang);
      await load(harness.fixture, harness.httpMock, contextWith(cycles));
      harness.component.selectCycle(harness.component.cycles()[0]);
      harness.component.openCloseForm(harness.component.cycles()[0]);
      harness.fixture.detectChanges();
      return harness;
    }

    it('sends the harvest, with the outcome as a plain STRING', async () => {
      const { fixture, component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        actualHarvestDate: '2027-03-05',
        harvestedCount: 300,
        totalWeightKg: 120.5,
        notes: '  Maji yalichafuka Februari.  ',
      });
      component.submitClose();

      const req = gql(httpMock, 'CloseCycle');
      const variables = (req.request.body as { variables: Record<string, unknown> }).variables;

      // `outcome` is String! in the schema, not an enum - it travels as the
      // literal word, the same way unit.type does.
      expect(variables['outcome']).toBe('HARVESTED');
      expect(typeof variables['outcome']).toBe('string');
      // `cycleId` is Int! here, unlike the ID! on CreateCycleInput.
      expect(variables['cycleId']).toBe(9);
      expect(typeof variables['cycleId']).toBe('number');
      expect(variables['actualHarvestDate']).toBe('2027-03-05');
      expect(variables['harvestedCount']).toBe(300);
      expect(variables['totalWeightKg']).toBe(120.5);
      expect(variables['notes']).toBe('Maji yalichafuka Februari.');
      // No survival rate is sent under ANY name: the database computes it.
      expect(Object.keys(variables)).not.toContain('survivalRateEstimate');
      expect(Object.keys(variables)).not.toContain('actualSurvivalRate');

      req.flush({ data: { closeCycle: CLOSED_CYCLE } });
      await fixture.whenStable();

      gql(httpMock, 'ProductionContext').flush(contextWith([CLOSED_CYCLE]));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.closeTarget()).toBeNull();
      expect(component.toastMessage()).toBe('Mzunguko umefungwa.');
    });

    it('refuses HARVESTED with a zero count, and never sends it', async () => {
      const { component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        actualHarvestDate: '2027-03-05',
        harvestedCount: 0,
        totalWeightKg: 120.5,
        notes: '',
      });
      component.submitClose();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.closeFieldError()).toContain('Mavuno ya sifuri si mavuno');
    });

    it('refuses HARVESTED with a zero weight for the same reason', async () => {
      const { component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        actualHarvestDate: '2027-03-05',
        harvestedCount: 300,
        totalWeightKg: 0,
        notes: '',
      });
      component.submitClose();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.closeFieldError()).toContain('Mavuno ya sifuri si mavuno');
    });

    it('requires a count and a weight rather than treating a blank box as zero', async () => {
      const { component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        actualHarvestDate: '2027-03-05',
        harvestedCount: '',
        totalWeightKg: '',
        notes: '',
      });
      component.submitClose();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.closeFieldError()).toBe('Idadi iliyovunwa inahitajika.');
    });

    it('ALLOWS zero for FAILED - a lost cycle is a real outcome', async () => {
      const { fixture, component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'FAILED',
        actualHarvestDate: '2027-03-05',
        harvestedCount: 0,
        totalWeightKg: 0,
        notes: '',
      });
      component.submitClose();

      const req = gql(httpMock, 'CloseCycle');
      const variables = (req.request.body as { variables: Record<string, unknown> }).variables;
      expect(variables['outcome']).toBe('FAILED');
      expect(variables['harvestedCount']).toBe(0);
      expect(variables['totalWeightKg']).toBe(0);
      // An untouched notes box is null, not an empty string.
      expect(variables['notes']).toBeNull();

      req.flush({
        data: {
          closeCycle: {
            ...CLOSED_CYCLE,
            status: 'FAILED',
            harvestedCount: 0,
            totalWeightKg: 0,
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
      const { fixture, component, httpMock } = await openClose();

      component.closeForm.setValue({
        outcome: 'HARVESTED',
        // Before RUNNING_CYCLE's stockingDate of 2026-08-01.
        actualHarvestDate: '2026-07-01',
        harvestedCount: 300,
        totalWeightKg: 120.5,
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
        harvestedCount: 300,
        totalWeightKg: 120.5,
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
