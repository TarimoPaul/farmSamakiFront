import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Members } from './members';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { environment } from '../../environments/environment';

const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

const FARM_ID = 19;
const USERS_URL = `${environment.apiUrl}/users`;
const ROLES_URL = `${environment.apiUrl}/roles`;
const LIST_URL = `${USERS_URL}?farmId=${FARM_ID}`;

/**
 * The four roles the backend seeds, as `GET /api/roles` sends them.
 *
 * They are FETCHED, never hardcoded in the screen: roles are editable at
 * runtime (`POST /api/roles`, `PUT /api/roles/{id}/permissions`), so a fixed
 * OWNER/FARM_MANAGER/WORKER/VIEWER list in the UI would be wrong the first
 * time somebody adds one - as FARMS_ONLY was added for the Farms screen.
 */
const ROLES_RESPONSE = {
  success: true,
  data: [
    { roleId: 1, name: 'OWNER', description: 'Mmiliki wa shamba', permissions: [] },
    { roleId: 2, name: 'FARM_MANAGER', description: 'Meneja wa shamba', permissions: [] },
    { roleId: 3, name: 'WORKER', description: 'Mfanyakazi', permissions: [] },
    { roleId: 4, name: 'VIEWER', description: 'Mtazamaji', permissions: [] },
  ],
};

/** `GET /api/users?farmId=19` - the farm's people, before anything is changed. */
const MEMBERS_BEFORE = {
  success: true,
  data: [
    {
      id: '9d1a1f6c-3b21-4a55-9d0e-6f2c1b0a7e01',
      name: 'F Admin',
      phone: '0788200111',
      status: 'ACTIVE',
      farmId: FARM_ID,
      role: 'OWNER',
    },
    {
      id: 'c4b0e2a8-77d4-4f19-8a3c-5e9b2d1f4a02',
      name: 'F Worker',
      phone: '0788200333',
      status: 'ACTIVE',
      farmId: FARM_ID,
      role: 'WORKER',
    },
  ],
};

/** The same call after the worker has been promoted - the backend's new truth. */
const MEMBERS_AFTER = {
  success: true,
  data: [
    MEMBERS_BEFORE.data[0],
    { ...MEMBERS_BEFORE.data[1], role: 'FARM_MANAGER' },
  ],
};

/** The list with the worker gone: a removed membership, the account intact. */
const MEMBERS_AFTER_REMOVE = { success: true, data: [MEMBERS_BEFORE.data[0]] };

/**
 * `GlobalExceptionHandler.handleAccessDenied` - message plus the shared code.
 * This is what a caller who may not read this farm's people gets.
 */
const FORBIDDEN = {
  success: false,
  message: 'Huruhusiwi kufikia shamba hili.',
  errorCode: 'FORBIDDEN',
};

/**
 * The backend's one guard rail on this screen
 * (`FarmUserService.removeMembership`), exactly as it is sent: a 409 carrying
 * its OWN code, not the generic CONFLICT - `ConflictException` is raised with
 * `ErrorCodes.OWNER_IMMUTABLE` and `handleConflict` passes it through.
 * `MembershipConflictRegressionTest` asserts this same shape server-side.
 */
const OWNER_CONFLICT = {
  success: false,
  message: 'Mmiliki wa shamba hawezi kutolewa kwenye shamba lake.',
  errorCode: 'OWNER_IMMUTABLE',
};

/** `changeRole` against somebody no longer on the farm - a stale list. */
const NOT_ON_THIS_FARM = {
  success: false,
  message: 'Mtumiaji huyu hayupo kwenye shamba hili.',
  errorCode: 'VALIDATION_ERROR',
};

const SIGNED_IN_ADMIN = {
  id: '9d1a1f6c-3b21-4a55-9d0e-6f2c1b0a7e01',
  name: 'F Admin',
  phone: '0788200111',
  status: 'ACTIVE',
  farmId: FARM_ID,
  role: 'OWNER',
};

/**
 * A signed-in `manage_users` admin working in farm 19.
 *
 * `farmId` on the stored user is the farm the BACKEND applied (it is written
 * by /me), which is what the screen reads - see the note on Members.
 */
function setup(user: unknown = SIGNED_IN_ADMIN) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_users', 'view_dashboard']));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  // The real Router - the screen renders inside AppShell, whose nav uses
  // routerLink. Only navigateByUrl is stubbed, and only so these tests can
  // assert that nothing here ever redirects.
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Members);
  return {
    router: { navigateByUrl },
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttons(fixture: { nativeElement: unknown }): HTMLButtonElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
}

/** Clicks the one button carrying this exact label - how an admin uses it. */
function click(fixture: { nativeElement: unknown }, label: string): void {
  const found = buttons(fixture).filter((b) => (b.textContent ?? '').trim() === label);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one "${label}" button, found ${found.length}. On screen: ` +
        buttons(fixture)
          .map((b) => `"${(b.textContent ?? '').trim()}"`)
          .join(', '),
    );
  }
  found[0].click();
}

function rows(fixture: { nativeElement: unknown }): HTMLTableRowElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
}

/** First paint: the roles picker and the farm's members. */
async function load(
  ctx: ReturnType<typeof setup>,
  membersBody: object = MEMBERS_BEFORE,
  status?: { status: number; statusText: string },
) {
  ctx.fixture.detectChanges();
  ctx.httpMock.expectOne(ROLES_URL).flush(ROLES_RESPONSE);
  ctx.httpMock.expectOne(LIST_URL).flush(membersBody, status);
  await ctx.fixture.whenStable();
  ctx.fixture.detectChanges();
}

describe('Members screen', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the list', () => {
    it('asks for the farm the backend applied, and shows name, role and status', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      await load(ctx);

      // The farm came from the applied membership, not from anything the
      // screen chose for itself.
      expect(ctx.component.activeFarmId()).toBe(FARM_ID);
      expect(rows(ctx.fixture)).toHaveLength(2);

      const body = text(ctx.fixture);
      expect(body).toContain('F Admin');
      expect(body).toContain('OWNER');
      expect(body).toContain('F Worker');
      expect(body).toContain('WORKER');
      expect(body).toContain('0788200333');
      expect(body).toContain('Active');

      ctx.httpMock.verify();
    });

    it('explains itself instead of listing nothing when no farm is applied', async () => {
      // ROOT before it picks a farm: farmId is null and always will be until
      // the switcher is used. An empty table would read as "nobody works here".
      localStorage.setItem(CAN_SELECT_FARM_KEY, 'true');
      const ctx = setup({ ...SIGNED_IN_ADMIN, farmId: null, role: 'ROOT' });
      TestBed.inject(LanguageService).setLang('en');

      ctx.fixture.detectChanges();
      ctx.httpMock.expectOne(ROLES_URL).flush(ROLES_RESPONSE);
      // AppShell's own farm switcher, not this screen: it lists farms for
      // whoever may choose one. Answered here so `verify` below is really
      // asserting that MEMBERS asked for nothing.
      ctx.httpMock.expectOne(`${environment.apiUrl}/farms`).flush({ success: true, data: [] });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Pick a farm in the switcher above');
      // No member list call was made at all - there was no farm to ask about.
      ctx.httpMock.verify();
    });

    it('re-reads when the farm switcher moves', async () => {
      const ctx = setup();
      await load(ctx);

      TestBed.inject(FarmSelectionService).select(2);
      ctx.fixture.detectChanges();

      // It asks again, and still about farm 19: the id in the path is the one
      // /me has confirmed, and /me has not answered the new pick yet. When it
      // does, activeFarmId changes and this fires once more with farm 2.
      ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_BEFORE);
      await ctx.fixture.whenStable();
      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance a
  describe('(a) changing a role', () => {
    it('sends the change and shows the farm as the backend now reports it', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      // BEFORE: the backend says WORKER, and so does the screen.
      expect(MEMBERS_BEFORE.data[1].role).toBe('WORKER');
      expect(rows(ctx.fixture)[1].textContent).toContain('WORKER');

      // Open the row's control, pick FARM_MANAGER, save.
      rows(ctx.fixture)[1].querySelectorAll('button')[0].click();
      ctx.fixture.detectChanges();
      expect(text(ctx.fixture)).toContain('Change the role of F Worker');

      ctx.component.form.setValue({ roleId: 2 });
      click(ctx.fixture, 'Save');

      // THE WRITE. Exactly the endpoint UserController.changeRole exposes,
      // with the farm in the path and the DTO it validates in the body.
      const write = ctx.httpMock.expectOne(
        `${USERS_URL}/${MEMBERS_BEFORE.data[1].id}/memberships/${FARM_ID}/role`,
      );
      expect(write.request.method).toBe('PUT');
      expect(write.request.body).toEqual({ farmId: FARM_ID, roleId: 2 });
      write.flush({ success: true, message: 'Role imebadilishwa.' });

      // AFTER: the screen re-reads rather than patching the row, so what it
      // shows is the backend's own answer.
      await ctx.fixture.whenStable();
      ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_AFTER);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(rows(ctx.fixture)[1].textContent).toContain('FARM_MANAGER');
      expect(rows(ctx.fixture)[1].textContent).not.toContain('WORKER');
      expect(text(ctx.fixture)).toContain('Role changed.');
      expect(ctx.router.navigateByUrl).not.toHaveBeenCalled();
      ctx.httpMock.verify();
    });

    it('refuses a change that would change nothing, without calling the backend', async () => {
      // Not a backend rule - it would accept this. Reporting success for a
      // no-op would tell the admin something untrue.
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rows(ctx.fixture)[1].querySelectorAll('button')[0].click();
      ctx.fixture.detectChanges();
      ctx.component.form.setValue({ roleId: 3 }); // WORKER: what they already hold
      click(ctx.fixture, 'Save');
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('They already hold this role.');
      ctx.httpMock.verify(); // nothing was sent
    });

    it('shows the backend sentence when the list has gone stale', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rows(ctx.fixture)[1].querySelectorAll('button')[0].click();
      ctx.fixture.detectChanges();
      ctx.component.form.setValue({ roleId: 2 });
      click(ctx.fixture, 'Save');

      ctx.httpMock
        .expectOne(`${USERS_URL}/${MEMBERS_BEFORE.data[1].id}/memberships/${FARM_ID}/role`)
        .flush(NOT_ON_THIS_FARM, { status: 400, statusText: 'Bad Request' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // VALIDATION_ERROR keeps the backend's own words: it names the actual
      // problem far better than a generic line could.
      expect(text(ctx.fixture)).toContain('Mtumiaji huyu hayupo kwenye shamba hili.');
      expect(ctx.router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------- acceptance b
  describe('(b) a forbidden action', () => {
    it('renders "huna ruhusa" when the farm cannot be read, and does not redirect', async () => {
      // The backend is farm-scoped: a manage_users admin asking about a farm
      // that is not theirs is refused (PermissionChecker.requireSameFarm).
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      await load(ctx, FORBIDDEN, { status: 403, statusText: 'Forbidden' });

      expect(ctx.component.loadError()?.errorCode).toBe('FORBIDDEN');
      expect(text(ctx.fixture)).toContain(
        'You do not have permission to view this. Ask your farm administrator.',
      );
      // No crash: the screen is still there, with its retry.
      expect(ctx.component.loading()).toBe(false);
      expect(buttons(ctx.fixture).some((b) => b.textContent?.includes('Try again'))).toBe(true);
      // FORBIDDEN is an operation failure, never a session one - nobody is
      // signed out and nothing navigates, so there is no redirect loop.
      expect(ctx.router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('renders it in Swahili for a refused role change too', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('sw');
      await load(ctx);

      rows(ctx.fixture)[1].querySelectorAll('button')[0].click();
      ctx.fixture.detectChanges();
      ctx.component.form.setValue({ roleId: 2 });
      click(ctx.fixture, 'Hifadhi');

      ctx.httpMock
        .expectOne(`${USERS_URL}/${MEMBERS_BEFORE.data[1].id}/memberships/${FARM_ID}/role`)
        .flush(FORBIDDEN, { status: 403, statusText: 'Forbidden' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // The shared errorCode copy, so it reads here as it does everywhere else.
      expect(text(ctx.fixture)).toContain(
        'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
      );
      expect(ctx.router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------- acceptance c
  describe('(c) the backend guard rail', () => {
    it('shows the owner-cannot-be-removed rule in the UI language, not the backend Swahili', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      // The control is offered for the owner too: UserSummary carries no "is
      // owner" flag, so the UI cannot know, and inventing the rule would hide
      // a control from people the backend would have allowed.
      rows(ctx.fixture)[0].querySelectorAll('button')[1].click();
      ctx.fixture.detectChanges();
      expect(text(ctx.fixture)).toContain('Remove from this farm?');

      click(ctx.fixture, 'Yes, remove');

      const write = ctx.httpMock.expectOne(
        `${USERS_URL}/${MEMBERS_BEFORE.data[0].id}/memberships/${FARM_ID}`,
      );
      expect(write.request.method).toBe('DELETE');
      write.flush(OWNER_CONFLICT, { status: 409, statusText: 'Conflict' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // Recognised by its own code, so the line comes from the shared copy:
      // an English UI reads English. The backend's Swahili sentence is
      // asserted ABSENT - that is the whole difference, since a status-only
      // branch would have shown it here.
      expect(ctx.component.actionErrorMessage()).toBe(
        'The farm owner cannot be removed from their own farm.',
      );
      const banner = (ctx.fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="action-error"]',
      );
      expect(banner?.textContent).toContain(
        'The farm owner cannot be removed from their own farm.',
      );
      expect(text(ctx.fixture)).not.toContain('Mmiliki wa shamba hawezi kutolewa');
      // No crash, nothing removed, the list still stands.
      expect(rows(ctx.fixture)).toHaveLength(2);
      expect(ctx.router.navigateByUrl).not.toHaveBeenCalled();
      ctx.httpMock.verify();
    });

    it('reads the same rule in Swahili, and follows a language switch', async () => {
      const ctx = setup();
      const language = TestBed.inject(LanguageService);
      language.setLang('sw');
      await load(ctx);

      rows(ctx.fixture)[0].querySelectorAll('button')[1].click();
      ctx.fixture.detectChanges();
      click(ctx.fixture, 'Ndiyo, mtoe');

      ctx.httpMock
        .expectOne(`${USERS_URL}/${MEMBERS_BEFORE.data[0].id}/memberships/${FARM_ID}`)
        .flush(OWNER_CONFLICT, { status: 409, statusText: 'Conflict' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(ctx.component.actionErrorMessage()).toBe(
        'Mmiliki wa shamba hawezi kutolewa kwenye shamba lake.',
      );

      // The banner is held as an ApiError, not as a rendered string, so the
      // language toggle re-reads it - the proof that this line is ours and not
      // the backend's prose passed through.
      language.setLang('en');
      ctx.fixture.detectChanges();

      expect(ctx.component.actionErrorMessage()).toBe(
        'The farm owner cannot be removed from their own farm.',
      );
      ctx.httpMock.verify();
    });

    it('removes a member the backend does allow, behind the confirm step', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rows(ctx.fixture)[1].querySelectorAll('button')[1].click();
      ctx.fixture.detectChanges();

      // Nothing is sent until the question is answered.
      ctx.httpMock.verify();
      expect(text(ctx.fixture)).toContain('F Worker will be taken off this farm');

      click(ctx.fixture, 'Yes, remove');
      ctx.httpMock
        .expectOne(`${USERS_URL}/${MEMBERS_BEFORE.data[1].id}/memberships/${FARM_ID}`)
        .flush({ success: true, message: 'Mtumiaji ametolewa kwenye shamba.' });

      await ctx.fixture.whenStable();
      ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_AFTER_REMOVE);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(rows(ctx.fixture)).toHaveLength(1);
      expect(text(ctx.fixture)).not.toContain('F Worker');
      expect(text(ctx.fixture)).toContain('Removed from the farm.');
      ctx.httpMock.verify();
    });

    it('cancelling the confirm sends nothing', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rows(ctx.fixture)[1].querySelectorAll('button')[1].click();
      ctx.fixture.detectChanges();
      click(ctx.fixture, 'Cancel');
      ctx.fixture.detectChanges();

      expect(ctx.component.removeTarget()).toBeNull();
      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance d
  describe('(d) both languages', () => {
    it('renders the screen in Swahili', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('sw');
      await load(ctx);

      const body = text(ctx.fixture);
      expect(body).toContain('Wanachama wa Shamba');
      expect(body).toContain('Jina');
      expect(body).toContain('Nafasi');
      expect(body).toContain('Hali');
      expect(body).toContain('Badilisha nafasi');
      expect(body).toContain('Mtoe');
      expect(body).toContain('Yupo hai');
    });

    it('renders the same screen in English', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      const body = text(ctx.fixture);
      expect(body).toContain('Farm Members');
      expect(body).toContain('Name');
      expect(body).toContain('Role');
      expect(body).toContain('Status');
      expect(body).toContain('Change role');
      expect(body).toContain('Remove');
      expect(body).toContain('Active');
    });

    it('switches language without reloading, error copy included', async () => {
      const ctx = setup();
      const language = TestBed.inject(LanguageService);
      language.setLang('sw');
      await load(ctx, FORBIDDEN, { status: 403, statusText: 'Forbidden' });

      expect(text(ctx.fixture)).toContain('Huna ruhusa ya kuona taarifa hizi.');

      language.setLang('en');
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('You do not have permission to view this.');
      ctx.httpMock.verify();
    });
  });
});
