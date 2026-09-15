import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Farms } from './farms';
import { FARMS_I18N } from './farms.i18n';
import { LanguageService } from '../core/services/language';
import { environment } from '../../environments/environment';

/**
 * Payloads captured from the running backend on 2026-08-24 - the same calls
 * the browser run makes.
 */
const FARMS_RESPONSE = {
  success: true,
  data: [
    { farmId: 1, name: 'Test Farm E2E', location: 'Dar', ownerName: 'Test Owner' },
    { farmId: 19, name: 'UI Farms Test', location: 'Mbeya', ownerName: null },
  ],
};

const MEMBERS_RESPONSE = {
  success: true,
  data: [
    {
      id: '3a920370-ddf3-4d39-a002-0f9db4d0b7b8',
      name: 'F Admin',
      phone: '0788200111',
      status: 'ACTIVE',
      farmId: 19,
      role: 'OWNER',
    },
    {
      id: '462f708b-a0ea-4ddd-bae7-3071702c3f73',
      name: 'F Norole',
      phone: '0788200999',
      status: 'ACTIVE',
      farmId: 19,
      role: null,
    },
  ],
};

/** POST /api/farms with a blank name, HTTP 400. */
const VALIDATION_RESPONSE = {
  success: false,
  message: 'name: Jina la shamba linahitajika',
  errorCode: 'VALIDATION_ERROR',
};

/** GET /api/users?farmId= for a farm the caller does not belong to, HTTP 403. */
const FORBIDDEN_RESPONSE = {
  success: false,
  message: 'Huruhusiwi kufikia shamba hili.',
  errorCode: 'FORBIDDEN',
};

const FARMS_URL = `${environment.apiUrl}/farms`;
const USERS_URL = `${environment.apiUrl}/users`;

function setup(permissions: string[]) {
  localStorage.setItem('samakiFarm.token', 'a-token');
  localStorage.setItem('samakiFarm.permissions', JSON.stringify(permissions));

  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(LanguageService).setLang('sw');

  const fixture = TestBed.createComponent(Farms);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

const text = (fixture: ComponentFixture<Farms>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

const membersPanel = (fixture: ComponentFixture<Farms>) =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-panel="members"]');

describe('Farms', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('the farms list', () => {
    it('renders every farm, and names the missing owner', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms', 'manage_users']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.farms().length).toBe(2);
      expect(text(fixture)).toContain('UI Farms Test');
      // ownerName null is a real state, not missing data: ownership comes from
      // membership, so a freshly created farm has none.
      expect(text(fixture)).toContain('Hakuna mmiliki bado');
    });

    it('shows the mapped message when the list itself is refused', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(
        {
          success: false,
          message: 'Huna ruhusa ya kufikia rasilimali hii.',
          errorCode: 'FORBIDDEN',
        },
        { status: 403, statusText: 'Forbidden' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.loadError()?.errorCode).toBe('FORBIDDEN');
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
    });
  });

  describe('the members panel', () => {
    it('is absent entirely without manage_users', async () => {
      const { fixture, httpMock } = setup(['manage_farms']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(membersPanel(fixture)).toBeNull();
    });

    it('is present with manage_users, and lists a farm on selection', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms', 'manage_users']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(membersPanel(fixture)).toBeTruthy();

      component.selectFarm(component.farms()[1]);
      const req = httpMock.expectOne((r) => r.url === USERS_URL);
      expect(req.request.params.get('farmId')).toBe('19');
      req.flush(MEMBERS_RESPONSE);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.members().length).toBe(2);
      expect(text(fixture)).toContain('F Admin');
      expect(text(fixture)).toContain('Hana nafasi bado');
    });

    it('does not even ask when the permission is missing', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.selectFarm(component.farms()[1]);

      httpMock.expectNone((r) => r.url === USERS_URL);
    });

    it('shows the empty state for a farm with no members yet', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms', 'manage_users']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.selectFarm(component.farms()[1]);
      httpMock.expectOne((r) => r.url === USERS_URL).flush({ success: true, data: [] });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Hakuna wanachama bado.');
      expect(text(fixture)).toContain('Waongeze kupitia Members.');
    });

    it('says so when the backend refuses another farm, instead of showing it as empty', async () => {
      // GET /api/users?farmId= is farm-scoped: a non-ROOT admin may only read
      // their own farm's members.
      const { fixture, component, httpMock } = setup(['manage_farms', 'manage_users']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.selectFarm(component.farms()[0]);
      httpMock
        .expectOne((r) => r.url === USERS_URL)
        .flush(FORBIDDEN_RESPONSE, { status: 403, statusText: 'Forbidden' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.membersError()?.errorCode).toBe('FORBIDDEN');
      expect(text(fixture)).toContain('Huna ruhusa ya kuona taarifa hizi');
      expect(text(fixture)).not.toContain('Hakuna wanachama bado.');
    });
  });

  describe('creating a farm', () => {
    it('posts, then refreshes the list and confirms', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms', 'manage_users']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.openCreate();
      component.form.setValue({ name: 'Shamba Jipya', location: 'Tanga' });
      component.submitCreate();

      const post = httpMock.expectOne((r) => r.url === FARMS_URL && r.method === 'POST');
      expect(post.request.body).toEqual({ name: 'Shamba Jipya', location: 'Tanga' });
      post.flush({
        success: true,
        data: { farmId: 21, name: 'Shamba Jipya', location: 'Tanga', ownerName: null },
      });
      await fixture.whenStable();

      // The list is re-read rather than patched locally, so the screen shows
      // what the backend actually holds.
      httpMock
        .expectOne((r) => r.url === FARMS_URL && r.method === 'GET')
        .flush({
          success: true,
          data: [
            ...FARMS_RESPONSE.data,
            { farmId: 21, name: 'Shamba Jipya', location: 'Tanga', ownerName: null },
          ],
        });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.createOpen()).toBe(false);
      expect(component.toastMessage()).toBe('Shamba limeundwa.');
      expect(component.farms().length).toBe(3);
    });

    it('puts a VALIDATION_ERROR on the field the backend named', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.openCreate();
      // Whitespace passes the client-side "required" check and reaches the
      // backend as "" - which is how the server's own message gets exercised.
      component.form.setValue({ name: '   ', location: '' });
      component.submitCreate();

      httpMock
        .expectOne((r) => r.method === 'POST')
        .flush(VALIDATION_RESPONSE, { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();
      fixture.detectChanges();

      // The "name: " prefix is stripped; what is left is the backend's own,
      // more specific text.
      expect(component.nameError()).toBe('Jina la shamba linahitajika');
      expect(component.createError()).toBeNull();
      expect(component.createOpen()).toBe(true);
    });

    it('shows farm-specific copy for CONFLICT', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.openCreate();
      component.form.setValue({ name: 'Test Farm E2E', location: '' });
      component.submitCreate();

      httpMock
        .expectOne((r) => r.method === 'POST')
        .flush(
          {
            success: false,
            message: 'Operesheni imekiuka vikwazo vya database.',
            errorCode: 'CONFLICT',
          },
          { status: 409, statusText: 'Conflict' },
        );
      await fixture.whenStable();

      expect(component.createError()).toBe('Shamba lenye jina hili tayari lipo.');
    });

    it('refuses to post an empty name at all', async () => {
      const { fixture, component, httpMock } = setup(['manage_farms']);

      fixture.detectChanges();
      httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
      await fixture.whenStable();

      component.openCreate();
      component.submitCreate();

      httpMock.expectNone((r) => r.method === 'POST');
      expect(component.nameError()).toBe('Jina la shamba linahitajika.');
    });
  });
});

/**
 * Rail ya muhtasari.
 *
 * HAKUNA KALENDA: shamba halina tarehe yoyote kwenye waya (jina, eneo,
 * mmiliki), hivyo "mashamba yalivyokuwa Machi" halina data nyuma yake.
 *
 * Kadi ya WANACHAMA ina lango lile lile la paneli ya kushoto - `manage_users`
 * ni uwezo tofauti na kuorodhesha mashamba, na `members()` ni tupu bila hiyo.
 * Kadi isiyo na lango ingesomeka kama "shamba hili halina mtu" kwa msimamizi
 * ambaye hakuwahi kuruhusiwa kuuliza.
 */
describe('Farms summary rail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function open(permissions: string[]) {
    const { fixture, component, httpMock } = setup(permissions);
    fixture.detectChanges();
    httpMock.expectOne(FARMS_URL).flush(FARMS_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component, httpMock };
  }

  const rail = (fixture: ComponentFixture<Farms>) =>
    (fixture.nativeElement as HTMLElement).querySelector('.module-rail')!;

  it('counts the farms, and the ones still without an owner', async () => {
    const { fixture, component, httpMock } = await open(['manage_farms', 'manage_users']);

    const by = (label: string) => component.summary().find((row) => row.label === label)?.value;

    expect(by('Mashamba yote')).toBe('2');
    // Shamba la 19 halina mmiliki: ni pengo halisi kwenye usanidi, si data
    // iliyopotea - umiliki unatoka kwenye nafasi ya OWNER, si kwa kuunda.
    expect(by('Yenye mmiliki')).toBe('1');
    expect(by('Bila mmiliki')).toBe('1');
    expect(by('Bila eneo')).toBe('0');
    httpMock.verify();
  });

  it('moves the create button off the page corner and into the intro card', async () => {
    const { fixture, httpMock } = await open(['manage_farms']);

    // Kitufe kinachoelea kimeondoka kabisa.
    expect((fixture.nativeElement as HTMLElement).querySelector('.page-actions')).toBeNull();
    // Na kiko ndani ya kadi ya maelezo, si mahali pengine kwenye rail.
    const intro = rail(fixture).querySelector('.side-card--intro')!;
    expect(intro.querySelector('.intro__actions app-button')?.textContent).toContain(
      'Ongeza shamba',
    );
    httpMock.verify();
  });

  it('fills the selected-farm card from the row that was clicked', async () => {
    const { fixture, component, httpMock } = await open(['manage_farms', 'manage_users']);

    // Kabla ya kuchagua: kadi inaeleza la kufanya badala ya kuwa tupu.
    expect(component.selectedDetail()).toBeNull();
    expect(rail(fixture).querySelector('[data-rail="selected"]')?.textContent).toContain(
      'Bofya shamba kwenye jedwali',
    );

    component.selectFarm(component.farms()[1]); // UI Farms Test, bila mmiliki
    httpMock.expectOne(`${USERS_URL}?farmId=19`).flush(MEMBERS_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    const card = rail(fixture).querySelector('[data-rail="selected"]')!;
    expect(card.textContent).toContain('UI Farms Test');
    expect(card.textContent).toContain('Mbeya');
    expect(card.textContent).toContain('Hakuna mmiliki bado');
    httpMock.verify();
  });

  it('breaks the selected farm down by role', async () => {
    const { fixture, component, httpMock } = await open(['manage_farms', 'manage_users']);

    component.selectFarm(component.farms()[1]);
    httpMock.expectOne(`${USERS_URL}?farmId=19`).flush(MEMBERS_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    // Mwanachama asiye na nafasi anahesabiwa kwa jina lake, si kuachwa nje:
    // mtu asiye na nafasi bado ni mtu kwenye shamba.
    expect(component.membersByRole()).toEqual([
      { role: 'OWNER', count: '1' },
      { role: 'Hana nafasi bado', count: '1' },
    ]);
    httpMock.verify();
  });

  it('withholds the members card from an admin without manage_users', async () => {
    const { fixture, httpMock } = await open(['manage_farms']);

    // Hakuna ombi la watumiaji hata baada ya kuchagua - angalia selectFarm.
    const headings = [...rail(fixture).querySelectorAll('h3')].map((h) => h.textContent?.trim());
    expect(headings).not.toContain('Wanachama kwa nafasi');
    expect(rail(fixture).querySelector('[data-rail="members"]')).toBeNull();
    // Maelezo, muhtasari, shamba teule - bila kadi ya wanachama.
    expect(rail(fixture).querySelectorAll('.side-card').length).toBe(3);
    httpMock.verify();
  });

  it('renders the rail beside the work', async () => {
    const { fixture, httpMock } = await open(['manage_farms', 'manage_users']);

    expect(rail(fixture).parentElement?.classList.contains('module-layout')).toBe(true);
    expect(rail(fixture).querySelectorAll('.side-card').length).toBe(4);
    // Hakuna kalenda: hakuna tarehe ya kuchuja nayo.
    expect(rail(fixture).querySelector('app-date-picker-card')).toBeNull();
    httpMock.verify();
  });

  it('carries exactly the same rail keys in both languages', () => {
    const sw = Object.keys(FARMS_I18N.sw).sort();
    const en = Object.keys(FARMS_I18N.en).sort();
    expect(en).toEqual(sw);
  });
});
