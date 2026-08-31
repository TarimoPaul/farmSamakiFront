import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Dashboard } from './dashboard';
import { FarmSelectionService } from '../core/services/farm-selection';
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

/** Captured from the running backend: ROOT (or any farmless account) querying it. */
const NO_FARM_RESPONSE = {
  errors: [
    {
      message: 'ROOT hana shamba; tumia akaunti ya shamba husika.',
      path: ['productionUnits'],
      extensions: { errorCode: 'NO_FARM_CONTEXT', classification: 'FORBIDDEN' },
    },
  ],
  data: null,
};

const PERMISSIONS_KEY = 'samakiFarm.permissions';

// The real Router, because the dashboard now renders inside AppShell, whose
// nav uses routerLink (and therefore ActivatedRoute). Only navigateByUrl is
// stubbed - that is the one thing these tests assert about.
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const navigateByUrl = vi
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(Dashboard);
  return {
    router: { navigateByUrl },
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

  it('offers a farm administrator the way to /farms, not a failure line', async () => {
    // ROOT, or anyone else who manages farms without belonging to one. ROOT
    // is handed every permission code by /me (AuthService.describeCurrentUser).
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
    const { fixture, component, httpMock, router } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(NO_FARM_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()?.errorCode).toBe(ERROR_CODE.NO_FARM_CONTEXT);
    expect(component.noFarm()).toBe(true);

    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';
    expect(text).toContain('No farm selected');
    // The old line blamed the account for a state ROOT can never leave.
    expect(text).not.toContain('Your account is not assigned to a farm yet.');

    expect(
      element.querySelector<HTMLAnchorElement>('.dash-notice__action')?.getAttribute('href'),
    ).toBe('/farms');

    // Still an operation failure, not a session one - nobody is signed out.
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('tells a farmless member to ask an administrator, and offers no way out', async () => {
    // An approved user not yet placed on a farm. Nothing in the UI can fix
    // this for them, so the panel carries no action.
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard']));
    const { fixture, component, httpMock } = setup();
    TestBed.inject(LanguageService).setLang('en');

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(NO_FARM_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.noFarm()).toBe(true);
    expect(component.canManageFarms()).toBe(false);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent ?? '').toContain('Ask your administrator to assign you to one');
    expect(element.querySelector('.dash-notice__action')).toBeNull();
  });

  it('reloads when the selected farm changes', async () => {
    // ROOT picks a farm from the switcher: the header the query travels with
    // has changed, so the numbers on screen are about a farm nobody is
    // looking at any more.
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
    const { fixture, component, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(environment.graphqlUrl).flush(NO_FARM_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.noFarm()).toBe(true);

    TestBed.inject(FarmSelectionService).select(19);
    fixture.detectChanges();

    httpMock.expectOne(environment.graphqlUrl).flush({
      data: {
        productionUnits: [
          {
            unitId: '27',
            code: 'D4-A',
            type: 'POND',
            sizeM3: 10,
            waterSource: null,
            status: 'ACTIVE',
          },
        ],
        cycles: [],
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.noFarm()).toBe(false);
    expect(component.totalUnits()).toBe(1);
    httpMock.verify();
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
