import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Roles } from './roles';
import { AuthService } from '../core/services/auth';
import { LanguageService } from '../core/services/language';
import { environment } from '../../environments/environment';

const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';

const FARM_ID = 19;
const ROLES_URL = `${environment.apiUrl}/roles`;
/** The service asks for the backend's own maximum page (`PageableParam.MAX_SIZE`). */
const PERMISSIONS_URL = `${ROLES_URL}/permissions?page=0&size=200`;
const ME_URL = `${environment.apiUrl}/auth/me`;

/**
 * `GET /api/roles` - two roles, carrying permission CODES.
 *
 * Codes are all a role ever sends (`RoleSummary.permissions`), which is the
 * whole reason the catalogue below has to be fetched as well: the write
 * endpoint takes ids.
 */
const ROLES_RESPONSE = {
  success: true,
  data: [
    {
      roleId: 1,
      name: 'OWNER',
      description: 'Mmiliki wa kampuni',
      active: true,
      permissions: ['view_dashboard', 'manage_users'],
    },
    { roleId: 4, name: 'VIEWER', description: null, active: true, permissions: ['view_dashboard'] },
  ],
};

/** The same call once VIEWER has been switched off. It is STILL listed. */
const ROLES_WITH_DISABLED_VIEWER = {
  success: true,
  data: [ROLES_RESPONSE.data[0], { ...ROLES_RESPONSE.data[1], active: false }],
};

/**
 * `GET /api/roles/permissions` - the PAGED envelope (`ApiResponsePage`), which
 * has no `message`/`errorCode` of its own. Three rows across two modules, so
 * the grouping has something to group.
 */
const PERMISSIONS_RESPONSE = {
  success: true,
  data: [
    {
      permissionId: 1,
      code: 'view_dashboard',
      module: 'FARM',
      groupName: 'REPORTING',
      description: 'Kuona dashibodi/ripoti',
    },
    {
      permissionId: 2,
      code: 'edit_cycle',
      module: 'FARM',
      groupName: 'PRODUCTION',
      description: 'Kuongeza/kuhariri mizunguko ya uzalishaji',
    },
    {
      permissionId: 6,
      code: 'manage_users',
      module: 'UAA',
      groupName: 'USER_MANAGEMENT',
      description: 'Kusimamia watumiaji/roles/ruhusa',
    },
  ],
  page: 0,
  size: 200,
  totalElements: 3,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};

/** A duplicate name, as the backend now names it (it used to be generic). */
const NAME_TAKEN = {
  success: false,
  message: 'Nafasi yenye jina hili tayari ipo.',
  errorCode: 'CONFLICT',
};

/** `resolvePermissions` refusing an id that is not there - all-or-nothing. */
const UNKNOWN_PERMISSION = {
  success: false,
  message: 'Ruhusa hizi hazipo: 99. Hakuna kilichobadilishwa.',
  errorCode: 'VALIDATION_ERROR',
};

/** Deleting a role people still hold. The COUNT is the useful part. */
const ROLE_IN_USE = {
  success: false,
  message:
    'Nafasi hii inashikiliwa na watu 3. Wabadilishie nafasi nyingine kwanza, au izime badala ya kuifuta.',
  errorCode: 'ROLE_IN_USE',
};

const SIGNED_IN_ADMIN = {
  id: '9d1a1f6c-3b21-4a55-9d0e-6f2c1b0a7e01',
  name: 'F Admin',
  phone: '0788200111',
  status: 'ACTIVE',
  farmId: FARM_ID,
  role: 'OWNER',
};

/** A signed-in `manage_users` admin - the only permission this screen needs. */
function setup() {
  localStorage.setItem(USER_KEY, JSON.stringify(SIGNED_IN_ADMIN));
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_users', 'view_dashboard']));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  // The real Router - the screen renders inside AppShell, whose nav uses
  // routerLink. Only navigateByUrl is stubbed, so the tests can assert both
  // that nothing redirects and that losing manage_users does.
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Roles);
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
 * which is exactly what an admin now does to reach any of them.
 *
 * The menu is opened only if it is not already open, so a test can read
 * several items (their disabled state, say) without the second lookup
 * toggling the sheet shut again. Matching on the LABEL rather than an index
 * matters more than ever now that the items are stacked: an index would
 * silently start pressing the wrong one the day their order changes.
 */
function rowButton(
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

function checkboxes(fixture: { nativeElement: unknown }): HTMLInputElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="checkbox"]'),
  );
}

/** The checkbox for one permission code, found by the code printed beside it. */
function checkboxFor(fixture: { nativeElement: unknown }, code: string): HTMLInputElement {
  const labels = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('label.perm'),
  ) as HTMLElement[];
  const label = labels.find((l) => l.querySelector('.perm__code')?.textContent?.trim() === code);
  if (!label) {
    throw new Error(`no checkbox for "${code}". On screen: ${labels.length} permissions`);
  }
  return label.querySelector('input') as HTMLInputElement;
}

/** First paint: the roles and the whole permission catalogue. */
async function load(
  ctx: ReturnType<typeof setup>,
  options: {
    rolesBody?: object;
    permissionsStatus?: { status: number; statusText: string };
  } = {},
) {
  ctx.fixture.detectChanges();
  ctx.httpMock.expectOne(ROLES_URL).flush(options.rolesBody ?? ROLES_RESPONSE);
  ctx.httpMock
    .expectOne(PERMISSIONS_URL)
    .flush(
      options.permissionsStatus ? { success: false, message: 'nope' } : PERMISSIONS_RESPONSE,
      options.permissionsStatus,
    );
  await ctx.fixture.whenStable();
  ctx.fixture.detectChanges();
}

/** The re-read every successful write triggers. */
function flushReload(ctx: ReturnType<typeof setup>, body: object = ROLES_RESPONSE) {
  ctx.httpMock.expectOne(ROLES_URL).flush(body);
}

describe('Roles screen', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the list', () => {
    it('shows each role with how many permissions it holds, and whether it is live', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      await load(ctx);

      expect(rows(ctx.fixture)).toHaveLength(2);
      const body = text(ctx.fixture);
      expect(body).toContain('OWNER');
      expect(body).toContain('Mmiliki wa kampuni');
      expect(body).toContain('VIEWER');
      // VIEWER has no description; the column says so rather than showing a blank.
      expect(body).toContain('No description');

      expect(rows(ctx.fixture)[0].textContent).toContain('2');
      expect(rows(ctx.fixture)[0].textContent).toContain('Active');

      ctx.httpMock.verify();
    });

    it('keeps a disabled role in the list - this is the only screen that can undo it', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      await load(ctx, { rolesBody: ROLES_WITH_DISABLED_VIEWER });

      expect(rows(ctx.fixture)).toHaveLength(2);
      expect(rows(ctx.fixture)[1].textContent).toContain('VIEWER');
      expect(rows(ctx.fixture)[1].textContent).toContain('Disabled');
      // And its switch now reads the other way.
      expect(rowButton(ctx.fixture, 1, 'Enable')).toBeTruthy();

      ctx.httpMock.verify();
    });

    it('numbers the rows and names the actions column', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      const headers = Array.from(
        (ctx.fixture.nativeElement as HTMLElement).querySelectorAll('thead th'),
      ).map((th) => (th.textContent ?? '').trim());
      expect(headers).toEqual(['S/No', 'Role', 'Description', 'Permissions', 'Status', 'Actions']);

      // 1-based, and positional: it counts what is on screen, so it is a
      // counting aid rather than anything to quote back at the backend -
      // VIEWER is role 4 and sits at number 2.
      const numbers = rows(ctx.fixture).map((row) =>
        (row.querySelector('.data-table__number')?.textContent ?? '').trim(),
      );
      expect(numbers).toEqual(['1', '2']);
      expect(ROLES_RESPONSE.data[1].roleId).toBe(4);

      ctx.httpMock.verify();
    });

    it('keeps the row controls behind one trigger until it is opened', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      // One button in the row, not four. That is the whole point: the actions
      // column is sized to its content, so anything sitting there permanently
      // takes its width off the name and description.
      expect(rows(ctx.fixture)[0].querySelectorAll('button')).toHaveLength(1);
      expect(rows(ctx.fixture)[0].querySelectorAll('.sheet')).toHaveLength(0);

      (rows(ctx.fixture)[0].querySelector('.trigger') as HTMLButtonElement).click();
      ctx.fixture.detectChanges();

      const menu = rows(ctx.fixture)[0].querySelector('.sheet') as HTMLElement;
      expect(
        Array.from(menu.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()),
      ).toEqual(['Edit', 'Permissions', 'Disable', 'Delete']);

      ctx.httpMock.verify();
    });

    it('closes the menu on a click outside it, having done nothing', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      (rows(ctx.fixture)[0].querySelector('.trigger') as HTMLButtonElement).click();
      ctx.fixture.detectChanges();
      expect(rows(ctx.fixture)[0].querySelector('.sheet')).toBeTruthy();

      document.body.click();
      ctx.fixture.detectChanges();

      expect(rows(ctx.fixture)[0].querySelector('.sheet')).toBeNull();
      // Dismissing a menu is not an action: nothing was asked of the backend.
      ctx.httpMock.verify();
    });

    it('groups the catalogue by module and group, and shows the code beside each permission', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      click(ctx.fixture, 'New Role');
      ctx.fixture.detectChanges();

      // Two FARM permissions in two different groups, one UAA permission -
      // three groups, not two modules.
      expect(ctx.component.groups().map((g) => g.key)).toEqual([
        'FARM/REPORTING',
        'FARM/PRODUCTION',
        'UAA/USER_MANAGEMENT',
      ]);

      const body = text(ctx.fixture);
      expect(body).toContain('Farm');
      expect(body).toContain('Reporting');
      expect(body).toContain('User management');
      // The Swahili description AND the code: the description is the
      // backend's and stays Swahili, the code reads the same in both.
      expect(body).toContain('Kuona dashibodi/ripoti');
      expect(body).toContain('view_dashboard');

      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance a
  describe('(a) creating a role', () => {
    it('sends the name, the ticked permission ids, and no description when the box is empty', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      click(ctx.fixture, 'New Role');
      ctx.fixture.detectChanges();

      ctx.component.form.patchValue({ name: '  ACCOUNTANT  ', description: '   ' });
      checkboxFor(ctx.fixture, 'view_dashboard').click();
      checkboxFor(ctx.fixture, 'edit_cycle').click();
      ctx.fixture.detectChanges();
      expect(text(ctx.fixture)).toContain('2 permissions selected');

      click(ctx.fixture, 'Save');

      const created = ctx.httpMock.expectOne(
        (req) => req.method === 'POST' && req.url === ROLES_URL,
      );
      // Trimmed, and a blank description is NULL rather than an empty string:
      // `roles.description` is nullable and the table prints "No description".
      expect(created.request.body).toEqual({
        name: 'ACCOUNTANT',
        description: null,
        permissionIds: [1, 2],
      });
      created.flush({
        success: true,
        data: { roleId: 7, name: 'ACCOUNTANT', description: null, active: true, permissions: [] },
      });

      // The list is re-read rather than patched from the answer.
      flushReload(ctx);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Role created.');
      ctx.httpMock.verify();
    });

    it('refuses a blank name itself, without asking the backend', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      click(ctx.fixture, 'New Role');
      ctx.fixture.detectChanges();
      ctx.component.form.patchValue({ name: '   ' });

      click(ctx.fixture, 'Save');
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Enter a role name.');
      ctx.httpMock.verify();
    });

    it('names the duplicate on the field that has to change', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      click(ctx.fixture, 'New Role');
      ctx.fixture.detectChanges();
      ctx.component.form.patchValue({ name: 'OWNER' });
      click(ctx.fixture, 'Save');

      ctx.httpMock
        .expectOne((req) => req.method === 'POST' && req.url === ROLES_URL)
        .flush(NAME_TAKEN, { status: 409, statusText: 'Conflict' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Another role already has this name.');
      // The modal stays open on the field that has to change.
      expect(ctx.component.createOpen()).toBe(true);

      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance b
  describe('(b) renaming a role', () => {
    it('opens on the current values and sends name and description ONLY', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 0, 'Edit').click();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Edit role OWNER');
      expect(ctx.component.form.getRawValue()).toEqual({
        name: 'OWNER',
        description: 'Mmiliki wa kampuni',
      });

      ctx.component.form.patchValue({ name: 'MMILIKI', description: 'Msimamizi mkuu' });
      click(ctx.fixture, 'Save');

      const saved = ctx.httpMock.expectOne(`${ROLES_URL}/1`);
      expect(saved.request.method).toBe('PUT');
      // No permissions in the body at all: a rename must not be able to
      // rewrite a security policy.
      expect(saved.request.body).toEqual({ name: 'MMILIKI', description: 'Msimamizi mkuu' });
      saved.flush({ success: true, data: { ...ROLES_RESPONSE.data[0], name: 'MMILIKI' } });

      flushReload(ctx);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Role saved.');
      // Renaming changes nothing about what THIS user may do, so /me is not
      // re-asked - a membership points at the id, never at the name.
      ctx.httpMock.verify();
    });

    it('says so when the new name is already taken', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 1, 'Edit').click();
      ctx.fixture.detectChanges();
      ctx.component.form.patchValue({ name: 'OWNER' });
      click(ctx.fixture, 'Save');

      ctx.httpMock
        .expectOne(`${ROLES_URL}/4`)
        .flush(NAME_TAKEN, { status: 409, statusText: 'Conflict' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Another role already has this name.');
      expect(ctx.component.detailsTarget()?.name).toBe('VIEWER');
      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance c
  describe('(c) disabling and re-enabling', () => {
    it('switches a role off without asking, and without touching /me', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 1, 'Disable').click();

      const off = ctx.httpMock.expectOne(`${ROLES_URL}/4/deactivate`);
      expect(off.request.method).toBe('POST');
      off.flush({ success: true, data: { ...ROLES_RESPONSE.data[1], active: false } });

      flushReload(ctx, ROLES_WITH_DISABLED_VIEWER);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Role disabled.');
      expect(rows(ctx.fixture)[1].textContent).toContain('Disabled');
      // Nobody's permissions changed - holders keep the role - so there is
      // no reason to re-ask /me, and verify() proves it did not.
      ctx.httpMock.verify();
    });

    it('switches it back on from the same button', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx, { rolesBody: ROLES_WITH_DISABLED_VIEWER });

      rowButton(ctx.fixture, 1, 'Enable').click();

      ctx.httpMock
        .expectOne(`${ROLES_URL}/4/activate`)
        .flush({ success: true, data: ROLES_RESPONSE.data[1] });
      flushReload(ctx);
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Role enabled again.');
      expect(rows(ctx.fixture)[1].textContent).toContain('Active');
      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance d
  describe('(d) deleting a role', () => {
    it('asks first, and the question points at disabling instead', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 1, 'Delete').click();
      ctx.fixture.detectChanges();

      const body = text(ctx.fixture);
      expect(body).toContain('Delete this role?');
      expect(body).toContain('VIEWER will be gone for good');
      expect(body).toContain('use "Disable" instead');
      // Nothing has been sent while the question is on screen.
      ctx.httpMock.verify();
    });

    it('deletes on confirmation and re-reads the list', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 1, 'Delete').click();
      ctx.fixture.detectChanges();
      click(ctx.fixture, 'Yes, delete it');

      const removed = ctx.httpMock.expectOne(`${ROLES_URL}/4`);
      expect(removed.request.method).toBe('DELETE');
      removed.flush({ success: true, data: null });

      flushReload(ctx, { success: true, data: [ROLES_RESPONSE.data[0]] });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Role deleted.');
      expect(rows(ctx.fixture)).toHaveLength(1);
      ctx.httpMock.verify();
    });

    it('keeps the refusal on screen with the count, and leaves the role alone', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 0, 'Delete').click();
      ctx.fixture.detectChanges();
      click(ctx.fixture, 'Yes, delete it');

      ctx.httpMock
        .expectOne(`${ROLES_URL}/1`)
        .flush(ROLE_IN_USE, { status: 409, statusText: 'Conflict' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // The backend's own sentence, because it NAMES how many people are in
      // the way - the one number that says how much work clearing it is.
      const body = text(ctx.fixture);
      expect(body).toContain('inashikiliwa na watu 3');
      expect(body).toContain('izime badala ya kuifuta');

      // The dialog is gone, the banner has it, and OWNER is still listed.
      expect(ctx.component.deleteTarget()).toBeNull();
      expect(rows(ctx.fixture)).toHaveLength(2);
      // No re-read: nothing changed, so there is nothing to re-read.
      ctx.httpMock.verify();
    });
  });

  // ------------------------------------------------------------- acceptance e
  describe('(e) editing a role permissions', () => {
    it('opens with the role current permissions ticked, and sends ids', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      // OWNER holds view_dashboard + manage_users, as CODES.
      rowButton(ctx.fixture, 0, 'Permissions').click();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Permissions of OWNER');
      // The codes were joined against the catalogue into ids 1 and 6.
      expect([...ctx.component.selected()]).toEqual([1, 6]);
      expect(checkboxFor(ctx.fixture, 'view_dashboard').checked).toBe(true);
      expect(checkboxFor(ctx.fixture, 'manage_users').checked).toBe(true);
      expect(checkboxFor(ctx.fixture, 'edit_cycle').checked).toBe(false);

      // Add one, and save.
      checkboxFor(ctx.fixture, 'edit_cycle').click();
      ctx.fixture.detectChanges();
      click(ctx.fixture, 'Save');

      const saved = ctx.httpMock.expectOne(`${ROLES_URL}/1/permissions`);
      expect(saved.request.method).toBe('PUT');
      // A bare array of ids - the endpoint takes the WHOLE set, not a delta.
      expect(saved.request.body).toEqual([1, 6, 2]);
      saved.flush({ success: true, data: ROLES_RESPONSE.data[0] });

      flushReload(ctx);
      // And /me, because the admin may have just edited their own role.
      ctx.httpMock.expectOne(ME_URL).flush({
        success: true,
        data: { ...SIGNED_IN_ADMIN, permissions: ['manage_users'], canSelectFarm: false },
      });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(text(ctx.fixture)).toContain('Permissions saved.');
      // Still holds manage_users, so nothing moved.
      expect(ctx.router.navigateByUrl).not.toHaveBeenCalled();
      ctx.httpMock.verify();
    });

    it('sends an empty list when every box is cleared - that is how a role is stripped', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 1, 'Permissions').click();
      ctx.fixture.detectChanges();
      checkboxFor(ctx.fixture, 'view_dashboard').click();
      ctx.fixture.detectChanges();

      click(ctx.fixture, 'Save');
      const saved = ctx.httpMock.expectOne(`${ROLES_URL}/4/permissions`);
      expect(saved.request.body).toEqual([]);
      saved.flush({ success: true, data: { ...ROLES_RESPONSE.data[1], permissions: [] } });

      flushReload(ctx);
      ctx.httpMock.expectOne(ME_URL).flush({
        success: true,
        data: { ...SIGNED_IN_ADMIN, permissions: ['manage_users'], canSelectFarm: false },
      });
      await ctx.fixture.whenStable();
      ctx.httpMock.verify();
    });

    it('keeps the backend sentence when it refuses the whole write', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 0, 'Permissions').click();
      ctx.fixture.detectChanges();
      click(ctx.fixture, 'Save');

      ctx.httpMock
        .expectOne(`${ROLES_URL}/1/permissions`)
        .flush(UNKNOWN_PERMISSION, { status: 400, statusText: 'Bad Request' });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      // Its own words: they name the id AND confirm the role was untouched,
      // which no generic line could.
      expect(text(ctx.fixture)).toContain('Ruhusa hizi hazipo: 99. Hakuna kilichobadilishwa.');
      expect(ctx.component.permissionsTarget()?.name).toBe('OWNER');
      ctx.httpMock.verify();
    });

    it('leaves the screen when the admin has just revoked their own manage_users', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');
      await load(ctx);

      rowButton(ctx.fixture, 0, 'Permissions').click();
      ctx.fixture.detectChanges();
      checkboxFor(ctx.fixture, 'manage_users').click();
      ctx.fixture.detectChanges();

      click(ctx.fixture, 'Save');
      ctx.httpMock.expectOne(`${ROLES_URL}/1/permissions`).flush({
        success: true,
        data: { ...ROLES_RESPONSE.data[0], permissions: ['view_dashboard'] },
      });
      flushReload(ctx);
      // /me now answers without manage_users - every control here is refused
      // from this moment on.
      ctx.httpMock.expectOne(ME_URL).flush({
        success: true,
        data: { ...SIGNED_IN_ADMIN, permissions: ['view_dashboard'], canSelectFarm: false },
      });
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();

      expect(ctx.router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
      expect(TestBed.inject(AuthService).hasPermission('manage_users')).toBe(false);
      ctx.httpMock.verify();
    });

    it('names permissions the catalogue does not have rather than dropping them silently', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      await load(ctx, {
        rolesBody: {
          success: true,
          // `view_finance` is held by the role but absent from the catalogue -
          // a permission soft-deleted after roles were built on it.
          data: [
            {
              roleId: 1,
              name: 'OWNER',
              description: null,
              active: true,
              permissions: ['view_dashboard', 'view_finance'],
            },
          ],
        },
      });

      rowButton(ctx.fixture, 0, 'Permissions').click();
      ctx.fixture.detectChanges();

      expect(ctx.component.unknownCodes()).toEqual(['view_finance']);
      const body = text(ctx.fixture);
      expect(body).toContain('will be lost if you save');
      expect(body).toContain('view_finance');
      // It is not silently kept either - there is no id to send for it.
      expect([...ctx.component.selected()]).toEqual([1]);

      ctx.httpMock.verify();
    });
  });

  describe('when the catalogue cannot be loaded', () => {
    it('still lists the roles and still renames them, but refuses to open a permission editor that would strip them', async () => {
      const ctx = setup();
      TestBed.inject(LanguageService).setLang('en');

      await load(ctx, { permissionsStatus: { status: 500, statusText: 'Server Error' } });

      // The roles themselves loaded, and are worth reading.
      expect(rows(ctx.fixture)).toHaveLength(2);
      expect(text(ctx.fixture)).toContain('permissions cannot be edited right now');

      expect(rowButton(ctx.fixture, 0, 'Permissions').disabled).toBe(true);
      // Everything that does NOT need the catalogue still works.
      expect(rowButton(ctx.fixture, 0, 'Edit').disabled).toBe(false);
      expect(rowButton(ctx.fixture, 0, 'Disable').disabled).toBe(false);
      expect(rowButton(ctx.fixture, 0, 'Delete').disabled).toBe(false);

      // And the create form offers no boxes to tick.
      click(ctx.fixture, 'New Role');
      ctx.fixture.detectChanges();
      expect(checkboxes(ctx.fixture)).toHaveLength(0);

      ctx.httpMock.verify();
    });
  });
});
