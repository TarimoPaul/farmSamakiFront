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
const CONTEXT = {
  data: {
    productionUnits: [
      { unitId: '27', code: 'T1', type: 'TANK', sizeM3: 12.5, waterSource: 'Kisima', status: 'ACTIVE' },
      { unitId: '28', code: 'P2', type: 'POND', sizeM3: null, waterSource: null, status: 'IDLE' },
    ],
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
    species: [{ speciesId: '1', name: 'Sato', growthMonthsAvg: 7, avgHarvestWeightKg: 0.35 }],
  },
};

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
        },
      });
      req.flush({
        data: {
          createCycle: {
            cycleId: '12',
            speciesName: 'Sato',
            stockingDate: '2026-09-02',
            fingerlingsCount: 400,
            survivalRateEstimate: 0.85,
            expectedHarvestDate: '2027-04-02',
            actualHarvestDate: null,
            status: 'ACTIVE',
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
