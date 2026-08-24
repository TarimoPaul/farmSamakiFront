import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { Dashboard } from './dashboard';
import { LanguageService } from '../core/services/language';
import { ERROR_CODE } from '../core/models/error-codes';
import { environment } from '../../environments/environment';

/** Captured from the running backend: a no-role member querying the dashboard. */
const FORBIDDEN_RESPONSE = {
  errors: [
    {
      message: "Huna ruhusa ya 'view_dashboard'.",
      locations: [{ line: 1, column: 9 }],
      path: ['productionUnits'],
      extensions: { errorCode: 'FORBIDDEN', classification: 'FORBIDDEN' },
    },
  ],
  data: null,
};

function setup() {
  const router = { url: '/dashboard', navigateByUrl: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Router, useValue: router },
    ],
  });
  const fixture = TestBed.createComponent(Dashboard);
  return {
    router,
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('Dashboard error surface', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows the mapped FORBIDDEN message, not a generic failure line', async () => {
    const { fixture, component, httpMock, router } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges(); // triggers ngOnInit -> the dashboard query
    httpMock.expectOne(environment.graphqlUrl).flush(FORBIDDEN_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()?.errorCode).toBe(ERROR_CODE.FORBIDDEN);
    expect(component.errorMessage()).toBe(
      'You do not have permission to view this. Ask your farm administrator.',
    );
    expect(component.errorMessage()).not.toBe('Failed to load data.');
    expect(component.loading()).toBe(false);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('You do not have permission to view this.');

    // FORBIDDEN is an operation failure, not a session one - nobody is signed out.
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows the mapped message in Swahili too', async () => {
    const { fixture, component, httpMock } = setup();
    TestBed.inject(LanguageService).setLang('sw');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(FORBIDDEN_RESPONSE);
    await fixture.whenStable();

    expect(component.errorMessage()).toBe(
      'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
    );
  });

  it('explains NO_FARM_CONTEXT instead of blaming the connection', async () => {
    const { fixture, component, httpMock } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush({
      errors: [
        {
          message: 'ROOT hana shamba; tumia akaunti ya shamba husika.',
          path: ['productionUnits'],
          extensions: { errorCode: 'NO_FARM_CONTEXT', classification: 'FORBIDDEN' },
        },
      ],
      data: null,
    });
    await fixture.whenStable();

    expect(component.error()?.errorCode).toBe(ERROR_CODE.NO_FARM_CONTEXT);
    expect(component.errorMessage()).toBe('Your account is not assigned to a farm yet.');
  });

  it('renders data and no error on success', async () => {
    const { fixture, component, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush({
      data: {
        productionUnits: [
          { unitId: '27', code: 'D4-A', type: 'POND', sizeM3: 10, waterSource: null, status: 'IDLE' },
        ],
        cycles: [],
      },
    });
    await fixture.whenStable();

    expect(component.error()).toBeNull();
    expect(component.errorMessage()).toBeNull();
    expect(component.totalUnits()).toBe(1);
    expect(component.loading()).toBe(false);
  });
});
