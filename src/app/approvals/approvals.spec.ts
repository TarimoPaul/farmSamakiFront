import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Approvals } from './approvals';
import { LanguageService } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Every payload below was captured from the running backend on 2026-08-24 —
 * the same requests the browser run makes, replayed so the branching can be
 * asserted without a live server.
 */
const PENDING_RESPONSE = {
  success: true,
  data: [
    {
      id: '57d7a572-342a-4af8-8dff-afe90834675a',
      name: 'Pendo Mwanaidi',
      phone: '0799400111',
      status: 'PENDING_APPROVAL',
      farmId: null,
      role: null,
    },
    {
      id: 'dd708497-9a78-4d1c-a604-6a4af02decd0',
      name: 'Baraka Juma',
      phone: '0799400222',
      status: 'PENDING_APPROVAL',
      farmId: null,
      role: null,
    },
  ],
};

const FARMS_RESPONSE = {
  success: true,
  data: [
    { farmId: 1, name: 'Test Farm E2E', location: 'Dar', ownerName: 'Test Owner' },
    { farmId: 2, name: 'Shamba la Majaribio', location: 'Dodoma', ownerName: 'Mjaribu Mmoja' },
  ],
};

const ROLES_RESPONSE = {
  success: true,
  data: [
    { roleId: 1, name: 'OWNER', description: 'Msimamizi mkuu wa shamba', permissions: [] },
    { roleId: 3, name: 'WORKER', description: 'Mfanyakazi wa kila siku', permissions: [] },
  ],
};

/** POST /api/users/{id}/approve — the whole response, farmId/role still null. */
const APPROVED_RESPONSE = {
  success: true,
  message: 'Mtumiaji ameidhinishwa.',
  data: {
    id: '57d7a572-342a-4af8-8dff-afe90834675a',
    name: 'Pendo Mwanaidi',
    phone: '0799400111',
    status: 'ACTIVE',
    farmId: null,
    role: null,
  },
};

/**
 * POST /api/users/{id}/memberships into a farm the caller does not hold —
 * the two-tier refusal. HTTP 403.
 */
const FARM_FORBIDDEN_RESPONSE = {
  success: false,
  message: 'Huruhusiwi kufikia shamba hili.',
  errorCode: 'FORBIDDEN',
};

/**
 * HTTP 409 from either write. Note the ABSENCE of errorCode — the backend's
 * ConflictException handler omits it, which is why the component branches on
 * status for this one case. Reproduced here exactly as the server sends it,
 * so the test fails if that ever changes.
 */
const MEMBERSHIP_CONFLICT_RESPONSE = {
  success: false,
  message: 'Mtumiaji huyu tayari yupo kwenye shamba hili.',
};

const APPROVE_CONFLICT_RESPONSE = {
  success: false,
  message: 'Mtumiaji huyu hayuko kwenye hali ya kusubiri idhini.',
};

const USERS_URL = `${environment.apiUrl}/users`;
const PENDING_URL = `${USERS_URL}/pending`;
const FARMS_URL = `${environment.apiUrl}/farms`;
const ROLES_URL = `${environment.apiUrl}/roles`;
const PENDO = '57d7a572-342a-4af8-8dff-afe90834675a';

function setup(permissions: string[], farmId: number | null = 1) {
  localStorage.setItem('samakiFarm.token', 'a-token');
  localStorage.setItem('samakiFarm.permissions', JSON.stringify(permissions));
  localStorage.setItem(
    'samakiFarm.user',
    JSON.stringify({
      id: 'admin',
      name: 'UI Admin',
      phone: '0788300111',
      status: 'ACTIVE',
      farmId,
      role: 'OWNER',
    }),
  );

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang('sw');

  const fixture = TestBed.createComponent(Approvals);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

const text = (fixture: ComponentFixture<Approvals>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

/** Renders the screen with the pending queue (and pickers) already loaded. */
async function load(
  permissions: string[],
  farmId: number | null = 1,
  pending = PENDING_RESPONSE,
) {
  const ctx = setup(permissions, farmId);
  ctx.fixture.detectChanges();

  ctx.httpMock.expectOne(PENDING_URL).flush(pending);
  if (permissions.includes('manage_users')) {
    ctx.httpMock.expectOne(ROLES_URL).flush(ROLES_RESPONSE);
  }
  if (permissions.includes('manage_farms')) {
    ctx.httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
  }

  await ctx.fixture.whenStable();
  ctx.fixture.detectChanges();
  return ctx;
}

describe('Approvals', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the pending queue', () => {
    it('lists everyone waiting, oldest first', async () => {
      const { fixture, component } = await load(['approve_users', 'manage_users', 'manage_farms']);

      expect(component.pending().length).toBe(2);
      expect(text(fixture)).toContain('Pendo Mwanaidi');
      expect(text(fixture)).toContain('0799400222');
      // The backend sends no timestamp, so the column states queue position.
      expect(text(fixture)).toContain('Wa kwanza kusubiri');
    });

    it('shows the Swahili empty state when nobody is waiting', async () => {
      const { fixture } = await load(['approve_users'], 1, { success: true, data: [] });

      expect(text(fixture)).toContain('Hakuna maombi yanayosubiri idhini.');
    });

    it('shows the mapped message when the queue itself is refused', async () => {
      const { fixture, component, httpMock } = setup(['approve_users']);
      fixture.detectChanges();

      httpMock
        .expectOne(PENDING_URL)
        .flush(
          { success: false, message: 'Huna ruhusa ya kufikia rasilimali hii.', errorCode: 'FORBIDDEN' },
          { status: 403, statusText: 'Forbidden' },
        );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.loadError()?.errorCode).toBe('FORBIDDEN');
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
    });
  });

  describe('what each permission tier is offered', () => {
    it('never asks for farms or roles without the permission to read them', async () => {
      // approve_users alone: GET /api/roles and GET /api/farms both answer 403
      // live, so the screen must not call them at all. httpMock.verify() in
      // load() would fail on any unexpected request.
      const { httpMock } = await load(['approve_users']);

      httpMock.verify();
    });

    it('offers approve-only, and says the person still needs a farm', async () => {
      const { fixture } = await load(['approve_users']);

      expect(text(fixture)).toContain('Idhinisha');
      expect(text(fixture)).not.toContain('Idhinisha na kumpangia');
      expect(text(fixture)).toContain('Una ruhusa ya kuidhinisha pekee');
    });

    it('offers the assign flow with manage_users', async () => {
      const { fixture } = await load(['approve_users', 'manage_users', 'manage_farms']);

      expect(text(fixture)).toContain('Idhinisha na kumpangia');
      expect(text(fixture)).not.toContain('Una ruhusa ya kuidhinisha pekee');
    });
  });

  describe('the two-tier farm picker', () => {
    it('lets a manage_farms holder choose any farm', async () => {
      const { fixture, component } = await load(['approve_users', 'manage_users', 'manage_farms']);

      expect(component.canPickFarm()).toBe(true);
      component.openAssign(component.pending()[0]);
      fixture.detectChanges();

      const select = (fixture.nativeElement as HTMLElement).querySelector('#assign-farm');
      expect(select).not.toBeNull();
      expect(text(fixture)).toContain('Shamba la Majaribio');
    });

    it('gives a manage_users-only caller no picker, targeting their own farm', async () => {
      const { fixture, component } = await load(['approve_users', 'manage_users'], 2);

      expect(component.canPickFarm()).toBe(false);
      component.openAssign(component.pending()[0]);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('#assign-farm')).toBeNull();
      expect(text(fixture)).toContain('Utampangia kwenye shamba lako');
      // Preset to their own farm, so the request cannot target another.
      expect(component.form.getRawValue().farmId).toBe(2);
    });

    it('refuses to assign at all when such a caller has no farm', async () => {
      const { fixture, component } = await load(['approve_users', 'manage_users'], null);

      expect(component.cannotAssignWithoutFarm()).toBe(true);
      component.openAssign(component.pending()[0]);
      fixture.detectChanges();

      expect(text(fixture)).toContain('Akaunti yako haiko kwenye shamba lolote');
    });
  });

  describe('approve', () => {
    it('flips the user to ACTIVE and re-reads the queue', async () => {
      const { fixture, component, httpMock } = await load(['approve_users']);

      component.approveOnly(component.pending()[0]);
      const approve = httpMock.expectOne(`${USERS_URL}/${PENDO}/approve`);
      expect(approve.request.method).toBe('POST');
      approve.flush(APPROVED_RESPONSE);

      // The list is re-read rather than patched locally.
      httpMock.expectOne(PENDING_URL).flush({ success: true, data: [] });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.outcome()).toEqual({ kind: 'approved-only', name: 'Pendo Mwanaidi' });
      expect(text(fixture)).toContain('Ameidhinishwa. Apangiwe shamba na role kupitia Members.');
    });

    it('reports a stale queue rather than a failure on 409', async () => {
      const { fixture, component, httpMock } = await load(['approve_users']);

      component.approveOnly(component.pending()[0]);
      httpMock
        .expectOne(`${USERS_URL}/${PENDO}/approve`)
        .flush(APPROVE_CONFLICT_RESPONSE, { status: 409, statusText: 'Conflict' });
      httpMock.expectOne(PENDING_URL).flush({ success: true, data: [] });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.outcome()?.kind).toBe('stale');
      expect(text(fixture)).toContain('hayuko tena kwenye orodha ya kusubiri');
    });
  });

  describe('approve then assign', () => {
    it('posts both calls and reports one success', async () => {
      const { fixture, component, httpMock } = await load([
        'approve_users',
        'manage_users',
        'manage_farms',
      ]);

      component.openAssign(component.pending()[0]);
      component.form.setValue({ farmId: 2, roleId: 3 });
      component.submitAssign();

      httpMock.expectOne(`${USERS_URL}/${PENDO}/approve`).flush(APPROVED_RESPONSE);

      const assign = httpMock.expectOne(`${USERS_URL}/${PENDO}/memberships`);
      expect(assign.request.method).toBe('POST');
      expect(assign.request.body).toEqual({ farmId: 2, roleId: 3 });
      assign.flush({ success: true, message: 'Mtumiaji amewekwa kwenye shamba.' });

      httpMock.expectOne(PENDING_URL).flush({ success: true, data: [] });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.outcome()).toEqual({
        kind: 'approved-assigned',
        name: 'Pendo Mwanaidi',
      });
    });

    it('validates the role before calling anything', async () => {
      const { fixture, component, httpMock } = await load([
        'approve_users',
        'manage_users',
        'manage_farms',
      ]);

      component.openAssign(component.pending()[0]);
      component.form.setValue({ farmId: 2, roleId: null });
      component.submitAssign();
      fixture.detectChanges();

      // Nothing was approved: a missing role must not leave a half-done user.
      httpMock.verify();
      expect(text(fixture)).toContain('Chagua nafasi.');
    });

    describe('when the membership call fails after a successful approve', () => {
      /** Approves, then fails the membership call with the given response. */
      async function partialFailure(body: object, status: number) {
        const ctx = await load(['approve_users', 'manage_users', 'manage_farms']);

        ctx.component.openAssign(ctx.component.pending()[0]);
        ctx.component.form.setValue({ farmId: 2, roleId: 3 });
        ctx.component.submitAssign();

        ctx.httpMock.expectOne(`${USERS_URL}/${PENDO}/approve`).flush(APPROVED_RESPONSE);
        ctx.httpMock
          .expectOne(`${USERS_URL}/${PENDO}/memberships`)
          .flush(body, { status, statusText: 'Failed' });
        // Refreshed even though the second step failed: the person IS approved
        // and no longer belongs in the pending queue.
        ctx.httpMock.expectOne(PENDING_URL).flush({ success: true, data: [] });

        await ctx.fixture.whenStable();
        ctx.fixture.detectChanges();
        return ctx;
      }

      it('reports "approved but unassigned", not a generic failure (403)', async () => {
        const { fixture, component } = await partialFailure(FARM_FORBIDDEN_RESPONSE, 403);

        expect(component.outcome()?.kind).toBe('approved-not-assigned');
        expect(text(fixture)).toContain(
          'Ameidhinishwa lakini hajapangiwa shamba — kamilisha kupitia Members.',
        );
        // The backend's reason for the half that failed, via the shared
        // errorCode copy - the same wording FORBIDDEN gets anywhere else.
        expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      });

      it('handles the codeless 409 the same way, by status', async () => {
        const { fixture, component } = await partialFailure(MEMBERSHIP_CONFLICT_RESPONSE, 409);

        expect(component.outcome()?.kind).toBe('approved-not-assigned');
        // No errorCode came back at all, so the shared copy has nothing to map
        // and the backend's own sentence is shown instead.
        expect(text(fixture)).toContain('Mtumiaji huyu tayari yupo kwenye shamba hili.');
      });

      it('reports VALIDATION_ERROR the same recoverable way', async () => {
        const { component } = await partialFailure(
          { success: false, message: 'Role haipo', errorCode: 'VALIDATION_ERROR' },
          400,
        );

        expect(component.outcome()?.kind).toBe('approved-not-assigned');
      });
    });
  });
});
