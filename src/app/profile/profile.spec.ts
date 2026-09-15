import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Profile } from './profile';
import { AuthService } from '../core/services/auth';
import { environment } from '../../environments/environment';

const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const TOKEN_KEY = 'samakiFarm.token';

const ME_URL = `${environment.apiUrl}/auth/me`;
const CHANGE_PASSWORD_URL = `${environment.apiUrl}/auth/change-password`;

/** `GET /api/auth/me` for a worker on farm 19 - the one answer that carries the email. */
const ME = {
  id: 'c4b0e2a8-77d4-4f19-8a3c-5e9b2d1f4a02',
  name: 'Asha Mfanyakazi',
  phone: '0788200333',
  email: null,
  status: 'ACTIVE',
  farmId: 19,
  role: 'WORKER',
  permissions: ['view_dashboard', 'log_feeding', 'log_water_quality'],
  canSelectFarm: false,
};

function setup() {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(ME.permissions));
  localStorage.setItem(USER_KEY, JSON.stringify({ ...ME, permissions: undefined }));

  TestBed.configureTestingModule({
    imports: [Profile],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });

  const fixture = TestBed.createComponent(Profile);
  const httpMock = TestBed.inject(HttpTestingController);
  const element = fixture.nativeElement as HTMLElement;

  fixture.detectChanges();
  httpMock.expectOne(ME_URL).flush({ success: true, data: ME });
  // The farm's NAME comes from `myFarms`, a login-only GraphQL query.
  httpMock
    .match((req) => JSON.stringify(req.body ?? '').includes('myFarms'))
    .forEach((req: TestRequest) =>
      req.flush({ data: { myFarms: [{ farmId: '19', name: 'Shamba la Ziwa' }] } }),
    );
  fixture.detectChanges();

  return { fixture, element, httpMock, component: fixture.componentInstance };
}

describe('Profile', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows who is signed in, with the farm by name and the status in words', () => {
    const { element, component } = setup();

    expect(component.detailsForm.getRawValue()).toEqual({
      name: 'Asha Mfanyakazi',
      phone: '0788200333',
      email: '',
    });

    const account = element.querySelector('[data-panel="account"]')!.textContent ?? '';
    expect(account).toContain('Asha Mfanyakazi');
    expect(account).toContain('WORKER');
    expect(account).toContain('Shamba la Ziwa');
    expect(account).toContain('Hai');
    expect(component.permissionCount()).toBe(3);
  });

  it('offers no save until something has actually changed', () => {
    const { component } = setup();

    expect(component.detailsUnchanged()).toBe(true);

    component.detailsForm.controls.name.setValue('Asha M.');
    expect(component.detailsUnchanged()).toBe(false);

    // Back to what is stored: nothing to save again.
    component.detailsForm.controls.name.setValue('Asha Mfanyakazi ');
    expect(component.detailsUnchanged()).toBe(true);
  });

  it('saves through PUT /api/auth/me and takes the answer as the signed-in user', () => {
    const { fixture, element, httpMock, component } = setup();

    component.detailsForm.controls.name.setValue('  Asha M.  ');
    component.detailsForm.controls.email.setValue('asha@samaki.test');
    element
      .querySelector<HTMLFormElement>('[data-panel="details"] form')!
      .dispatchEvent(new Event('submit'));

    const req = httpMock.expectOne(ME_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      name: 'Asha M.',
      phone: '0788200333',
      email: 'asha@samaki.test',
    });
    req.flush({ success: true, data: { ...ME, name: 'Asha M.', email: 'asha@samaki.test' } });
    fixture.detectChanges();

    expect(component.toastMessage()).toBe('Taarifa zako zimehifadhiwa.');
    // Stored at once, so the sidebar shows the new name without another /me.
    expect(TestBed.inject(AuthService).currentUser()?.name).toBe('Asha M.');
    expect(component.detailsUnchanged()).toBe(true);
  });

  it('refuses an empty name before sending anything', () => {
    const { fixture, element, httpMock, component } = setup();

    component.detailsForm.controls.name.setValue('   ');
    element
      .querySelector<HTMLFormElement>('[data-panel="details"] form')!
      .dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    httpMock.expectNone((req) => req.method === 'PUT');
    expect(component.nameError()).toBe('Jina linahitajika.');
  });

  it("shows the backend's sentence for a phone already in use", () => {
    const { fixture, element, httpMock, component } = setup();

    component.detailsForm.controls.phone.setValue('0788200111');
    element
      .querySelector<HTMLFormElement>('[data-panel="details"] form')!
      .dispatchEvent(new Event('submit'));

    httpMock
      .expectOne(ME_URL)
      .flush(
        { success: false, message: 'Namba ya simu hii tayari imesajiliwa.', errorCode: 'CONFLICT' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="details-error"]')!.textContent?.trim()).toBe(
      'Namba ya simu hii tayari imesajiliwa.',
    );
    // Nothing was stored: the signed-in user keeps the old number.
    expect(TestBed.inject(AuthService).currentUser()?.phone).toBe('0788200333');
  });

  describe('changing the password', () => {
    function fill(component: Profile, current: string, next: string, confirm: string) {
      component.passwordForm.setValue({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
    }

    function submit(element: HTMLElement) {
      element
        .querySelector<HTMLFormElement>('[data-panel="password"] form')!
        .dispatchEvent(new Event('submit'));
    }

    it('catches a mismatch on the form, without a request', () => {
      const { fixture, element, httpMock, component } = setup();

      fill(component, 'old-secret', 'new-secret', 'new-secreT');
      submit(element);
      fixture.detectChanges();

      httpMock.expectNone(CHANGE_PASSWORD_URL);
      expect(component.passwordFieldError('confirmPassword')).toBe('Nywila hazifanani.');
    });

    it('puts a wrong current password on its own field', () => {
      const { fixture, element, httpMock, component } = setup();

      fill(component, 'not-it', 'new-secret', 'new-secret');
      submit(element);
      httpMock
        .expectOne(CHANGE_PASSWORD_URL)
        .flush(
          { success: false, message: 'Password ya sasa si sahihi.', errorCode: 'INVALID_CREDENTIALS' },
          { status: 401, statusText: 'Unauthorized' },
        );
      fixture.detectChanges();

      expect(component.passwordFieldError('currentPassword')).toBe('Nywila ya sasa si sahihi.');
      // A field error, not a lost session.
      expect(localStorage.getItem(TOKEN_KEY)).toBe('a-token');
    });

    it('changes it, says so, and empties the form', () => {
      const { fixture, element, httpMock, component } = setup();

      fill(component, 'old-secret', 'new-secret', 'new-secret');
      submit(element);
      const req = httpMock.expectOne(CHANGE_PASSWORD_URL);
      expect(req.request.body).toEqual({ currentPassword: 'old-secret', newPassword: 'new-secret' });
      req.flush({ success: true, data: null, message: 'Password imebadilishwa.' });
      fixture.detectChanges();

      expect(component.toastMessage()).toBe('Nywila imebadilishwa.');
      expect(component.passwordForm.getRawValue()).toEqual({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      expect(component.passwordFieldError('newPassword')).toBeNull();
    });
  });
});
