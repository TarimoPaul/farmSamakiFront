import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { WaterQuality } from './water-quality';
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
 * Two readings: one full, one partial. The partial one is the point - a
 * person with only a pH meter records pH and leaves the rest null, and the
 * table has to say so rather than print zeros.
 */
const READINGS = {
  data: {
    waterQualityLogs: [
      {
        logId: '4',
        logDate: '2026-09-01',
        ph: 7.2,
        temperature: 26.5,
        oxygen: 6.1,
        ammonia: 0.02,
        notes: 'Asubuhi',
        recordedByName: 'D Worker',
        unit: { unitId: '27', code: 'T1' },
      },
      {
        logId: '5',
        logDate: '2026-09-02',
        ph: 6.8,
        temperature: null,
        oxygen: null,
        ammonia: null,
        notes: null,
        recordedByName: 'D Worker',
        unit: { unitId: '27', code: 'T1' },
      },
    ],
  },
};

/**
 * VIEWER reaching logWaterQuality. HTTP 200 with errors[].
 *
 * Captured verbatim from the running backend (localhost:8082, 2026-09-02) by
 * signing in as the dev VIEWER and sending this screen's exact mutation.
 */
const FORBIDDEN = {
  data: null,
  errors: [
    {
      message: "Huna ruhusa ya 'log_water_quality'.",
      path: ['logWaterQuality'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
};

/**
 * pH 15 - outside 0-14, which is the one thing the BACKEND refuses. HTTP 200.
 *
 * Also captured live (2026-09-02). Worth having verbatim: it names the actual
 * limit, which is why the form shows the backend's sentence here instead of
 * the generic "the details you entered were not accepted".
 */
const VALIDATION = {
  data: null,
  errors: [
    {
      message: 'pH lazima iwe kati ya 0 na 14.',
      path: ['logWaterQuality'],
      extensions: { errorCode: 'VALIDATION_ERROR', classification: 'BAD_REQUEST' },
    },
  ],
};

const TOKEN_KEY = 'samakiFarm.token';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const SELECTED_CYCLE_KEY = 'samakiFarm.selectedCycleId';

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

  const fixture = TestBed.createComponent(WaterQuality);
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

const text = (fixture: ComponentFixture<WaterQuality>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const panel = (fixture: ComponentFixture<WaterQuality>, name: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-panel="${name}"]`);

/** The two-step load: resolve the stored cycle, then read its readings. */
async function load(
  fixture: ComponentFixture<WaterQuality>,
  httpMock: HttpTestingController,
  readings: object = READINGS,
) {
  fixture.detectChanges();
  gql(httpMock, 'query Cycles').flush(CYCLES);
  await fixture.whenStable();
  fixture.detectChanges();

  gql(httpMock, 'WaterQualityLogs').flush(readings);
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('WaterQuality', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the cycle it records against', () => {
    it('asks for nothing at all when no cycle has been chosen', async () => {
      const { fixture, httpMock } = setup(['view_dashboard', 'log_water_quality']);

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(panel(fixture, 'no-cycle')).toBeTruthy();
      expect(panel(fixture, 'log-form')).toBeNull();
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });

    it('names the cycle and its unit once one is selected', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

      await load(fixture, httpMock);

      expect(component.cycle()?.cycleId).toBe('9');
      expect(panel(fixture, 'context')?.textContent).toContain('T1');
      expect(panel(fixture, 'context')?.textContent).toContain('Sato');
      httpMock.verify();
    });

    it('reads by CYCLE, not by unit - the cycleId travels as the argument', async () => {
      const { fixture, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

      fixture.detectChanges();
      gql(httpMock, 'query Cycles').flush(CYCLES);
      await fixture.whenStable();

      const req = gql(httpMock, 'WaterQualityLogs');
      expect((req.request.body as { variables: unknown }).variables).toEqual({ cycleId: 9 });
      req.flush(READINGS);
      await fixture.whenStable();
    });

    it('falls back to the "pick a cycle" panel for a cycle this farm does not have', async () => {
      // A stale id: the cycles query takes no argument, so it is caught by
      // absence and never sent to the API.
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '999',
      });

      fixture.detectChanges();
      gql(httpMock, 'query Cycles').flush(CYCLES);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.cycle()).toBeNull();
      expect(panel(fixture, 'no-cycle')).toBeTruthy();
      expect(panel(fixture, 'log-form')).toBeNull();
      // No readings were asked for - there is no cycle to ask about.
      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
    });
  });

  describe('the readings table', () => {
    it('renders every reading, and says so where a measurement is missing', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

      await load(fixture, httpMock);

      expect(component.readings().length).toBe(2);
      expect(text(fixture)).toContain('7.2');
      expect(text(fixture)).toContain('0.02');
      expect(text(fixture)).toContain('D Worker');
      // The partial reading's blanks: a dash, not a zero.
      expect(text(fixture)).toContain('—');
    });

    it('shows the empty state for a cycle nobody has measured yet', async () => {
      const { fixture, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

      await load(fixture, httpMock, { data: { waterQualityLogs: [] } });

      expect(text(fixture)).toContain('Hakuna kipimo bado');
    });
  });

  describe('the log form, gated on log_water_quality', () => {
    it('is absent entirely for a VIEWER, who still reads the table', async () => {
      const { fixture, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

      await load(fixture, httpMock);

      expect(panel(fixture, 'log-form')).toBeNull();
      expect(panel(fixture, 'readings')).toBeTruthy();
      expect(text(fixture)).toContain('7.2');
    });

    it('is present for a holder of the permission', async () => {
      const { fixture, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });

      await load(fixture, httpMock);

      expect(panel(fixture, 'log-form')).toBeTruthy();
    });
  });

  describe('recording a reading', () => {
    it('writes against the cycle\'s UNIT, and re-reads the list afterwards', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });
      await load(fixture, httpMock);

      component.form.setValue({
        ph: '7.4',
        temperature: '27',
        oxygen: '',
        ammonia: '0.03',
        notes: 'Jioni',
      });
      component.submit();

      const req = gql(httpMock, 'LogWaterQuality');
      expect((req.request.body as { variables: unknown }).variables).toEqual({
        input: {
          // 27 is cycle 9's unit, converted from the string id - the reading
          // belongs to the tank, not to the cycle.
          unitId: 27,
          ph: 7.4,
          temperature: 27,
          // Untouched: null, so the backend records "not measured" rather
          // than an oxygen reading of zero.
          oxygen: null,
          ammonia: 0.03,
          notes: 'Jioni',
        },
      });
      req.flush({ data: { logWaterQuality: READINGS.data.waterQualityLogs[0] } });
      await fixture.whenStable();

      gql(httpMock, 'WaterQualityLogs').flush(READINGS);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.toastMessage()).toBe('Kipimo kimehifadhiwa.');
      expect(component.form.getRawValue().ph).toBe('');
    });

    it('SENDS a reading that says the water is killing the fish', async () => {
      // DO 0.8, pH 4.2, ammonia 0.9. These are the readings worth having, and
      // a form that refused them would suppress the emergency it exists to
      // report. Nothing is validated client-side.
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });
      await load(fixture, httpMock);

      component.form.setValue({
        ph: '4.2',
        temperature: '34.5',
        oxygen: '0.8',
        ammonia: '0.9',
        notes: '',
      });
      component.submit();

      const req = gql(httpMock, 'LogWaterQuality');
      expect((req.request.body as { variables: { input: unknown } }).variables.input).toEqual({
        unitId: 27,
        ph: 4.2,
        temperature: 34.5,
        oxygen: 0.8,
        ammonia: 0.9,
        notes: null,
      });
      expect(component.formError()).toBeNull();
      req.flush({ data: { logWaterQuality: READINGS.data.waterQualityLogs[0] } });
      await fixture.whenStable();
      gql(httpMock, 'WaterQualityLogs').flush(READINGS);
      await fixture.whenStable();
    });

    it('sends oxygen zero - total oxygen loss is a measurement, not a blank', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });
      await load(fixture, httpMock);

      component.form.setValue({
        ph: '',
        temperature: '',
        oxygen: '0',
        ammonia: '',
        notes: '',
      });
      component.submit();

      const req = gql(httpMock, 'LogWaterQuality');
      expect((req.request.body as { variables: { input: { oxygen: number } } }).variables.input.oxygen).toBe(0);
      req.flush({ data: { logWaterQuality: READINGS.data.waterQualityLogs[0] } });
      await fixture.whenStable();
      gql(httpMock, 'WaterQualityLogs').flush(READINGS);
      await fixture.whenStable();
    });

    it('refuses an entirely blank reading, because it records nothing', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });
      await load(fixture, httpMock);

      component.submit();

      httpMock.expectNone((r) => r.url === environment.graphqlUrl);
      expect(component.formError()).toBe('Jaza angalau kipimo kimoja.');
    });
  });

  describe('failures', () => {
    it('surfaces FORBIDDEN in the UI language, not the backend prose', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });
      await load(fixture, httpMock);

      component.form.patchValue({ ph: '7' });
      component.submit();
      gql(httpMock, 'LogWaterQuality').flush(FORBIDDEN);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toBe(
        'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
      );
    });

    it('keeps the backend\'s own words for VALIDATION_ERROR - they name the limit', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
        cycleId: '9',
      });
      await load(fixture, httpMock);

      component.form.patchValue({ ph: '15' });
      component.submit();
      gql(httpMock, 'LogWaterQuality').flush(VALIDATION);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.formError()).toBe('pH lazima iwe kati ya 0 na 14.');
      expect(text(fixture)).toContain('pH lazima iwe kati ya 0 na 14.');
    });

    it('shows a load failure with a way to retry', async () => {
      const { fixture, component, httpMock } = setup(['view_dashboard'], { cycleId: '9' });

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

  it('renders in English when the UI language is English', async () => {
    const { fixture, httpMock } = setup(['view_dashboard', 'log_water_quality'], {
      cycleId: '9',
      lang: 'en',
    });

    await load(fixture, httpMock);

    expect(text(fixture)).toContain('Water Quality');
    expect(text(fixture)).toContain('Record a reading');
    expect(text(fixture)).toContain('Recent readings');
    expect(text(fixture)).toContain('Ammonia');
  });
});
