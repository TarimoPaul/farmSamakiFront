import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HasPermission } from './has-permission';
import { AuthService } from '../../core/services/auth';
import { PERMISSION } from '../../core/models/permissions';

@Component({
  standalone: true,
  imports: [HasPermission],
  template: `
    <p id="always">always</p>
    <p id="gated" *appHasPermission="permission">members panel</p>
  `,
})
class Host {
  permission = PERMISSION.MANAGE_USERS;
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(Host);
  return { fixture, authService: TestBed.inject(AuthService) };
}

const gatedText = (fixture: { nativeElement: unknown }) =>
  (fixture.nativeElement as HTMLElement).querySelector('#gated')?.textContent ?? null;

describe('appHasPermission', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders nothing when the permission is absent', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(gatedText(fixture)).toBeNull();
    // The rest of the template is untouched.
    expect((fixture.nativeElement as HTMLElement).querySelector('#always')).toBeTruthy();
  });

  it('renders the content when the permission is held', () => {
    localStorage.setItem('samakiFarm.permissions', JSON.stringify(['manage_users']));
    const { fixture } = setup();
    fixture.detectChanges();

    expect(gatedText(fixture)).toBe('members panel');
  });

  it('reacts when the permission set changes under a live session', () => {
    // A role edited server-side, picked up by the next /me - the panel should
    // appear (or vanish) without a reload.
    const { fixture, authService } = setup();
    fixture.detectChanges();
    expect(gatedText(fixture)).toBeNull();

    authService.permissions.set(['manage_users']);
    fixture.detectChanges();
    expect(gatedText(fixture)).toBe('members panel');

    authService.permissions.set([]);
    fixture.detectChanges();
    expect(gatedText(fixture)).toBeNull();
  });
});
