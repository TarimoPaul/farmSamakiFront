import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Members } from './members';
import { MEMBERS_I18N } from './members.i18n';
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
    { roleId: 1, name: 'OWNER', description: 'Mmiliki wa shamba', active: true, permissions: [] },
    {
      roleId: 2,
      name: 'FARM_MANAGER',
      description: 'Meneja wa shamba',
      active: true,
      permissions: [],
    },
    { roleId: 3, name: 'WORKER', description: 'Mfanyakazi', active: true, permissions: [] },
    { roleId: 4, name: 'VIEWER', description: 'Mtazamaji', active: true, permissions: [] },
  ],
};

/**
 * The same call once VIEWER has been disabled on the Roles screen.
 *
 * The endpoint still SENDS it - the Roles screen is the only place that can
 * switch it back on - so filtering it out is this screen's job.
 */
const ROLES_WITH_DISABLED_VIEWER = {
  success: true,
  data: ROLES_RESPONSE.data.map((role) =>
    role.name === 'VIEWER' ? { ...role, active: false } : role,
  ),
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
  data: [MEMBERS_BEFORE.data[0], { ...MEMBERS_BEFORE.data[1], role: 'FARM_MANAGER' }],
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
function setup(
  user: unknown = SIGNED_IN_ADMIN,
  permissions: string[] = ['manage_users', 'view_dashboard'],
) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  // The real Router - the screen's own links use
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

/**
 * A row's control, found by its label after opening that row's action menu -
 * which is what an admin now does to reach any of them.
 *
 * Opened only if it is not already open, so a test can read several items
 * without the second lookup toggling the sheet shut. Matching on the LABEL
 * rather than an index matters now that the items are stacked and their
 * number varies per row (your own row has no disable or delete).
 */
function rowMenu(
  fixture: { nativeElement: unknown; detectChanges: () => void },
  rowIndex: number,
  label: string,
): HTMLButtonElement {
  if (!rows(fixture)[rowIndex].querySelector('.sheet')) {
    (rows(fixture)[rowIndex].querySelector('.trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  const items = Array.from(rows(fixture)[rowIndex].querySelectorAll('.sheet button'));
  const found = items.filter((b) => (b.textContent ?? '').trim() === label);
  if (found.length !== 1) {
    throw new Error(
      `expected one "${label}" in row ${rowIndex}, found ${found.length}. In the menu: ` +
        items.map((b) => `"${(b.textContent ?? '').trim()}"`).join(', '),
    );
  }
  return found[0] as HTMLButtonElement;
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
      // `GET /farms` used to be answered here too: the screen rendered its own
      // <app-shell>, and the shell's farm switcher fetches the list for anyone
      // who may choose one. The shell is a layout route now and is not part of
      // this component, so nothing asks - which is what `verify` below checks.
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
      rowMenu(ctx.fixture, 1, 'Change role').click();
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

      rowMenu(ctx.fixture, 1, 'Change role').click();
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

      rowMenu(ctx.fixture, 1, 'Change role').click();
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

      rowMenu(ctx.fixture, 1, 'Badilisha nafasi').click();
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
      rowMenu(ctx.fixture, 0, 'Remove from farm').click();
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

      rowMenu(ctx.fixture, 0, 'Mtoe kwenye shamba').click();
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

      rowMenu(ctx.fixture, 1, 'Remove from farm').click();
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

      rowMenu(ctx.fixture, 1, 'Remove from farm').click();
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
      expect(body).toContain('Yupo hai');
      expect(body).toContain('Mwanachama Mpya');

      // The row's controls live behind the menu now, so they are only copy
      // once it is open.
      expect(rowMenu(ctx.fixture, 1, 'Hariri taarifa')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Badilisha nafasi')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Zima akaunti')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Mtoe kwenye shamba')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Futa akaunti')).toBeTruthy();
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
      expect(body).toContain('Active');
      expect(body).toContain('New Member');

      expect(rowMenu(ctx.fixture, 1, 'Edit details')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Change role')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Disable account')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Remove from farm')).toBeTruthy();
      expect(rowMenu(ctx.fixture, 1, 'Delete account')).toBeTruthy();
    });

    it('leaves disable and delete off the admin own row', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      // Row 0 IS the signed-in admin (same id as SIGNED_IN_ADMIN). The
      // backend refuses both on yourself with a 400, and unlike the owner
      // rule this one is knowable here - so the entries are simply absent.
      expect(MEMBERS_BEFORE.data[0].id).toBe(SIGNED_IN_ADMIN.id);

      (rows(ctx.fixture)[0].querySelector('.trigger') as HTMLButtonElement).click();
      ctx.fixture.detectChanges();

      const items = Array.from(rows(ctx.fixture)[0].querySelectorAll('.sheet button')).map((b) =>
        (b.textContent ?? '').trim(),
      );
      // "Their farms" stays: it changes nothing about you, it only shows.
      expect(items).toEqual(['Edit details', 'Change role', 'Their farms', 'Remove from farm']);

      ctx.httpMock.verify();
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

  describe('(e) a disabled role', () => {
    it('is not offered in the picker, though the endpoint still sends it', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      ctx.fixture.detectChanges();
      ctx.httpMock.expectOne(ROLES_URL).flush(ROLES_WITH_DISABLED_VIEWER);
      ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_BEFORE);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      rowMenu(ctx.fixture, 1, 'Change role').click();
      ctx.fixture.detectChanges();

      const options = Array.from(
        (ctx.fixture.nativeElement as HTMLElement).querySelectorAll('#member-role option'),
      ).map((o) => (o.textContent ?? '').trim());

      // The three live roles plus the placeholder - VIEWER is gone. Picking it
      // could only ever have ended in a 400: the backend refuses to attach a
      // disabled role to a membership.
      expect(options).toContain('OWNER');
      expect(options).toContain('FARM_MANAGER');
      expect(options).toContain('WORKER');
      expect(options).not.toContain('VIEWER');

      ctx.httpMock.verify();
    });
  });
});

/**
 * Rail ya muhtasari.
 *
 * HAKUNA KALENDA: `UserSummary` haina muhuri wa muda hata mmoja - kitambulisho,
 * jina, simu, hali, farmId, nafasi na basi.
 *
 * Kadi ya NAFASI ZA KUTOA inaonyesha namba MBILI kwa makusudi: zinazoweza
 * kutolewa, na zilizozimwa. Backend hutuma nafasi zilizozimwa pia (skrini ya
 * Nafasi ndiyo pekee inayoweza kuziwasha), na skrini hii inazichuja kwa sababu
 * backend hukataa kuunganisha nafasi iliyozimwa na uanachama. Tofauti kati ya
 * namba hizo mbili ni ukweli kuhusu usanidi, si ajali.
 */
/**
 * One person, several farms.
 *
 * Before this, "add" on this screen could only make a NEW account, and nothing
 * could reach somebody already on another farm: creating them again is
 * refused as a registered phone. Two ways in now, matching the backend's two
 * tiers - any admin adds an existing person to THIS farm by phone, and a
 * company-wide admin (`manage_farms`) can give a person any other farm.
 */
describe('Members - one person on several farms', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const WORKER = MEMBERS_BEFORE.data[1];
  const OUTSIDER = {
    id: 'b7e5d3c1-0a9f-4e8d-8c7b-6a5f4e3d2c10',
    name: 'Mtu wa Shamba B',
    phone: '0788200999',
    status: 'ACTIVE',
    farmId: null,
    role: null,
  };
  const FARMS_URL = `${environment.apiUrl}/farms`;
  const membershipsUrl = (id: string) => `${USERS_URL}/${id}/memberships`;

  async function openAddExisting(ctx: ReturnType<typeof setup>) {
    TestBed.inject(LanguageService).setLang('en');
    await load(ctx);
    ctx.component.openAdd();
    ctx.fixture.detectChanges();
    click(ctx.fixture, 'Existing person');
    ctx.fixture.detectChanges();
  }

  it('finds an existing person by phone and puts them on this farm - no new account', async () => {
    const ctx = setup();
    await openAddExisting(ctx);

    ctx.component.existingForm.controls.phone.setValue(' 0788200999 ');
    click(ctx.fixture, 'Find');
    ctx.httpMock.expectOne(`${USERS_URL}/lookup?phone=0788200999`).flush({
      success: true,
      data: OUTSIDER,
    });
    ctx.fixture.detectChanges();

    expect(text(ctx.fixture)).toContain('Mtu wa Shamba B');

    ctx.component.existingForm.controls.roleId.setValue(3);
    ctx.component.submitAdd();

    const assign = ctx.httpMock.expectOne(membershipsUrl(OUTSIDER.id));
    expect(assign.request.method).toBe('POST');
    expect(assign.request.body).toEqual({ farmId: FARM_ID, roleId: 3 });
    assign.flush({ success: true, data: null });

    ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_BEFORE);
    await ctx.fixture.whenStable();

    expect(ctx.component.addOpen()).toBe(false);
    expect(ctx.component.toastMessage()).toBe('Added to this farm.');
    // The thing this replaces would have POSTed /api/users - it must not.
    ctx.httpMock.expectNone((req) => req.method === 'POST' && req.url === USERS_URL);
    ctx.httpMock.verify();
  });

  it('shows the backend sentence for a number nobody has', async () => {
    const ctx = setup();
    await openAddExisting(ctx);

    ctx.component.existingForm.controls.phone.setValue('0799999999');
    ctx.component.searchExisting();
    ctx.httpMock
      .expectOne(`${USERS_URL}/lookup?phone=0799999999`)
      .flush(
        {
          success: false,
          message: 'Hakuna mtumiaji mwenye namba hii ya simu.',
          errorCode: 'VALIDATION_ERROR',
        },
        { status: 400, statusText: 'Bad Request' },
      );
    ctx.fixture.detectChanges();

    expect(ctx.component.foundPerson()).toBeNull();
    expect(text(ctx.fixture)).toContain('Hakuna mtumiaji mwenye namba hii ya simu.');
    ctx.httpMock.verify();
  });

  it('refuses somebody already on the list without asking the backend', async () => {
    const ctx = setup();
    await openAddExisting(ctx);

    ctx.component.existingForm.controls.phone.setValue(WORKER.phone);
    ctx.component.searchExisting();
    ctx.httpMock
      .expectOne(`${USERS_URL}/lookup?phone=${WORKER.phone}`)
      .flush({ success: true, data: { ...WORKER, farmId: null, role: null } });

    ctx.component.existingForm.controls.roleId.setValue(3);
    ctx.component.submitAdd();

    expect(ctx.component.existingError()).toBe('This person is already on this farm.');
    ctx.httpMock.expectNone(membershipsUrl(WORKER.id));
    ctx.httpMock.verify();
  });

  it('lets a company-wide admin see every farm a person is on and give them another', async () => {
    const ctx = setup(SIGNED_IN_ADMIN, ['manage_users', 'manage_farms', 'view_dashboard']);
    TestBed.inject(LanguageService).setLang('en');
    await load(ctx);

    rowMenu(ctx.fixture, 1, 'Their farms').click();
    ctx.fixture.detectChanges();

    ctx.httpMock.expectOne(membershipsUrl(WORKER.id)).flush({
      success: true,
      data: [{ farmId: FARM_ID, farmName: 'Shamba A', roleId: 3, roleName: 'WORKER' }],
    });
    ctx.httpMock.expectOne(FARMS_URL).flush({
      success: true,
      data: [
        { farmId: FARM_ID, name: 'Shamba A', location: null, ownerName: null },
        { farmId: 23, name: 'Shamba B', location: null, ownerName: null },
      ],
    });
    ctx.fixture.detectChanges();

    // Only the farm they are NOT on is offered.
    expect(ctx.component.grantableFarms().map((farm) => farm.farmId)).toEqual([23]);
    expect(text(ctx.fixture)).toContain('(this one)');

    ctx.component.grantForm.setValue({ farmId: 23, roleId: 4 });
    ctx.component.submitGrant();

    const assign = ctx.httpMock.expectOne(
      (req) => req.method === 'POST' && req.url === membershipsUrl(WORKER.id),
    );
    expect(assign.request.body).toEqual({ farmId: 23, roleId: 4 });
    assign.flush({ success: true, data: null });

    ctx.httpMock
      .expectOne((req) => req.method === 'GET' && req.url === membershipsUrl(WORKER.id))
      .flush({
        success: true,
        data: [
          { farmId: FARM_ID, farmName: 'Shamba A', roleId: 3, roleName: 'WORKER' },
          { farmId: 23, farmName: 'Shamba B', roleId: 4, roleName: 'VIEWER' },
        ],
      });
    ctx.fixture.detectChanges();

    expect(text(ctx.fixture)).toContain('Shamba B');
    expect(ctx.component.toastMessage()).toBe('Given a new farm.');
    expect(ctx.component.grantableFarms()).toEqual([]);
    ctx.httpMock.verify();
  });

  it('shows a farm-level admin their own farm only, and offers no farm picker', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('en');
    await load(ctx);

    rowMenu(ctx.fixture, 1, 'Their farms').click();
    ctx.fixture.detectChanges();

    ctx.httpMock.expectOne(membershipsUrl(WORKER.id)).flush({
      success: true,
      data: [{ farmId: FARM_ID, farmName: 'Shamba A', roleId: 3, roleName: 'WORKER' }],
    });
    ctx.fixture.detectChanges();

    // GET /api/farms is manage_farms: not asked, so no request ends in 403.
    ctx.httpMock.expectNone(FARMS_URL);
    const element = ctx.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#grant-farm')).toBeNull();
    expect(text(ctx.fixture)).toContain('You see your own farm only');
    ctx.httpMock.verify();
  });
});

describe('Members summary rail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const rail = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).querySelector('.module-rail')!;

  it('counts the farm by account state', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    await load(ctx);

    const by = (label: string) => ctx.component.summary().find((row) => row.label === label)?.value;

    expect(by('Wanachama wote')).toBe('2');
    expect(by('Yupo hai')).toBe('2');
    expect(by('Amezuiwa')).toBe('0');
    expect(by('Bila nafasi')).toBe('0');
    ctx.httpMock.verify();
  });

  it('counts a disabled member as still on the farm', async () => {
    // Kuzuia kunazima kuingia; uanachama haugusiwi - hivyo bado ni mtu wa
    // shamba hili, si aliyeondoka.
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    await load(ctx, {
      success: true,
      data: [MEMBERS_BEFORE.data[0], { ...MEMBERS_BEFORE.data[1], status: 'DISABLED' }],
    });

    const by = (label: string) => ctx.component.summary().find((row) => row.label === label)?.value;
    expect(by('Wanachama wote')).toBe('2');
    expect(by('Yupo hai')).toBe('1');
    expect(by('Amezuiwa')).toBe('1');
    ctx.httpMock.verify();
  });

  it('counts a member with no role, which is the row that matters most', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    await load(ctx, {
      success: true,
      data: [MEMBERS_BEFORE.data[0], { ...MEMBERS_BEFORE.data[1], role: null }],
    });

    expect(ctx.component.summary().find((row) => row.label === 'Bila nafasi')?.value).toBe('1');
    // Na anahesabiwa kwa jina kwenye mgawanyo, si kuachwa nje kabisa.
    expect(ctx.component.membersByRole()).toEqual([
      { role: 'OWNER', count: '1' },
      { role: 'Hana nafasi bado', count: '1' },
    ]);
    ctx.httpMock.verify();
  });

  it('moves the add button off the page corner and into the intro card', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    await load(ctx);

    expect((ctx.fixture.nativeElement as HTMLElement).querySelector('.page-actions')).toBeNull();
    const intro = rail(ctx.fixture).querySelector('.side-card--intro')!;
    expect(intro.querySelector('.intro__actions app-button')?.textContent).toContain(
      'Mwanachama Mpya',
    );
    ctx.httpMock.verify();
  });

  it('separates the roles it can hand out from the ones it cannot', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    ctx.fixture.detectChanges();
    // VIEWER imezimwa kwenye skrini ya Nafasi - backend bado inaituma.
    ctx.httpMock.expectOne(ROLES_URL).flush(ROLES_WITH_DISABLED_VIEWER);
    ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_BEFORE);
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();

    const by = (label: string) =>
      ctx.component.roleSupply().rows.find((row) => row.label === label)?.value;

    expect(by('Zinazoweza kutolewa')).toBe('3');
    expect(by('Zilizozimwa (haziwezi)')).toBe('1');
    expect(ctx.component.roleSupply().failed).toBe(false);
    expect(ctx.component.roleSupply().empty).toBe(false);
    ctx.httpMock.verify();
  });

  it('says the role list did not load, which nothing else on the screen does', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    ctx.fixture.detectChanges();
    ctx.httpMock.expectOne(ROLES_URL).flush(FORBIDDEN, { status: 403, statusText: 'Forbidden' });
    ctx.httpMock.expectOne(LIST_URL).flush(MEMBERS_BEFORE);
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();

    expect(ctx.component.roleSupply().failed).toBe(true);
    expect(
      (ctx.fixture.nativeElement as HTMLElement).querySelector('[data-testid="roles-failed"]')
        ?.textContent,
    ).toContain('Orodha ya nafasi haikupakia');
    // Orodha ya wanachama yenyewe imepakia vizuri - hakuna banner juu yake.
    expect(ctx.component.loadError()).toBeNull();
  });

  it('renders the rail beside the work', async () => {
    const ctx = setup();
    TestBed.inject(LanguageService).setLang('sw');
    await load(ctx);

    expect(rail(ctx.fixture).parentElement?.classList.contains('module-layout')).toBe(true);
    // Maelezo, muhtasari, kwa nafasi, nafasi za kutoa.
    expect(rail(ctx.fixture).querySelectorAll('.side-card').length).toBe(4);
    expect(rail(ctx.fixture).querySelector('app-date-picker-card')).toBeNull();
    ctx.httpMock.verify();
  });

  it('carries exactly the same rail keys in both languages', () => {
    const sw = Object.keys(MEMBERS_I18N.sw).sort();
    const en = Object.keys(MEMBERS_I18N.en).sort();
    expect(en).toEqual(sw);
  });
});
