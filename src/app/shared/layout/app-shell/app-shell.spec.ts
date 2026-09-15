import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AppShell } from './app-shell';
import { AuthService } from '../../../core/services/auth';
import { FarmSelectionService } from '../../../core/services/farm-selection';
import { SidebarService } from '../../../core/services/sidebar';
import { ThemeService } from '../../../core/services/theme';
import { LanguageService } from '../../../core/services/language';
import { ShellLayout } from '../shell-layout/shell-layout';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';

const TOKEN_KEY = 'samakiFarm.token';
const USER_KEY = 'samakiFarm.user';
const PERMISSIONS_KEY = 'samakiFarm.permissions';
const CAN_SELECT_FARM_KEY = 'samakiFarm.canSelectFarm';

/** Two farms, as `GET /api/auth/my-farms` returns them to ROOT (no role). */
const FARMS_RESPONSE = {
  success: true,
  data: [
    { farmId: 1, name: 'Test Farm E2E', role: null },
    { farmId: 2, name: 'Shamba la Majaribio', role: null },
  ],
};

const MY_FARMS_URL = `${environment.apiUrl}/auth/my-farms`;

/** ROOT before it has picked anything: every permission, and no farm. */
function signIn(options: { canSelectFarm: boolean; farmId: number | null }) {
  localStorage.setItem(TOKEN_KEY, 'a-token');
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['manage_farms', 'view_dashboard']));
  localStorage.setItem(CAN_SELECT_FARM_KEY, String(options.canSelectFarm));
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
      name: 'System Root',
      phone: '0700000000',
      status: 'ACTIVE',
      farmId: options.farmId,
      role: 'ROOT',
    }),
  );
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(AppShell);
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AppShell farm switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('is hidden - and costs no request - for an account that may not select a farm', () => {
    // A member of ONE farm. They work in it and have nothing to switch to.
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();

    expect(element.querySelector('.dash-farm__select')).toBeNull();
    httpMock.expectNone(MY_FARMS_URL);
    httpMock.expectNone(`${environment.apiUrl}/farms`);
  });

  it('offers a member of two farms their own farms, from my-farms rather than /farms', () => {
    // No manage_farms here: /farms would have been refused. my-farms is the
    // list the backend will accept in X-Farm-Id for this person.
    signIn({ canSelectFarm: true, farmId: 19 });
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard']));
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectNone(`${environment.apiUrl}/farms`);
    httpMock.expectOne(MY_FARMS_URL).flush({
      success: true,
      data: [
        { farmId: 19, name: 'Shamba la Kwanza', role: 'WORKER' },
        { farmId: 23, name: 'Shamba la Pili', role: 'VIEWER' },
      ],
    });
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select')!;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'Chagua shamba…',
      'Shamba la Kwanza',
      'Shamba la Pili',
    ]);
    // The backend applies their first farm with no header, and the control says so.
    expect(select.value).toBe('19');
    httpMock.verify();
  });

  it('offers every farm, with none chosen yet', () => {
    signIn({ canSelectFarm: true, farmId: null });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(MY_FARMS_URL).flush(FARMS_RESPONSE);
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select');
    expect(select).not.toBeNull();
    expect(Array.from(select!.options).map((o) => o.textContent?.trim())).toEqual([
      'Chagua shamba…', // Swahili is the app default
      'Test Farm E2E',
      'Shamba la Majaribio',
    ]);
    // Nothing picked: the placeholder is the selected option.
    expect(select!.value).toBe('');
    httpMock.verify();
  });

  it('records the pick and re-asks /me for the farm the backend applied', () => {
    signIn({ canSelectFarm: true, farmId: null });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(MY_FARMS_URL).flush(FARMS_RESPONSE);
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(TestBed.inject(FarmSelectionService).selectedFarmId()).toBe(2);
    expect(localStorage.getItem('samakiFarm.selectedFarmId')).toBe('2');

    // /me is what turns a request into a fact: its farmId is the farm the
    // backend actually applied.
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      success: true,
      data: {
        id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
        name: 'System Root',
        phone: '0700000000',
        status: 'ACTIVE',
        farmId: 2,
        role: 'ROOT',
        permissions: ['manage_farms', 'view_dashboard'],
        canSelectFarm: true,
      },
    });
    fixture.detectChanges();

    expect(TestBed.inject(AuthService).currentUser()?.farmId).toBe(2);
    // The switcher shows what the backend applied, so it stays visible and
    // now names farm 2.
    expect(element.querySelector<HTMLSelectElement>('.dash-farm__select')!.value).toBe('2');
    httpMock.verify();
  });

  it('falls back to "no farm chosen" when the backend refuses the pick', () => {
    // A farm that has since been deleted: the header is ignored, /me still
    // answers farmId null, and the control must not claim farm 2 is in use.
    signIn({ canSelectFarm: true, farmId: null });
    const { fixture, element, httpMock } = setup();

    fixture.detectChanges();
    httpMock.expectOne(MY_FARMS_URL).flush(FARMS_RESPONSE);
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('.dash-farm__select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      success: true,
      data: {
        id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
        name: 'System Root',
        phone: '0700000000',
        status: 'ACTIVE',
        farmId: null,
        role: 'ROOT',
        permissions: ['manage_farms', 'view_dashboard'],
        canSelectFarm: true,
      },
    });
    fixture.detectChanges();

    expect(element.querySelector<HTMLSelectElement>('.dash-farm__select')!.value).toBe('');
    httpMock.verify();
  });
});

/**
 * The Feed Catalogue entry, which is the first feed-related nav item to carry
 * a permission at all.
 *
 * It matters because the two feed screens sit next to each other and are gated
 * differently: Feeding is a read screen every role reaches, while both
 * catalogue endpoints are `manage_feed_stock` on the backend. An entry offered
 * to a feeder would land them on a guard, so the nav must not offer it.
 */
describe('AppShell nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function navLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers the Feed Catalogue to a manage_feed_stock holder', () => {
    const labels = navLabels(['view_dashboard', 'log_feeding', 'manage_feed_stock']);

    expect(labels).toContain('Katalogi ya Chakula');
    expect(labels).toContain('Malisho');
  });

  it('hides it from a feeder, who still gets Feeding', () => {
    // `view_feed_stock` SEES the stock panel; it does not write the catalogue.
    const labels = navLabels(['view_dashboard', 'log_feeding', 'view_feed_stock']);

    expect(labels).not.toContain('Katalogi ya Chakula');
    expect(labels).toContain('Malisho');
  });
});

/**
 * The feed group's gating, all three entries together.
 *
 * They are gated differently on purpose and the contrast is the thing worth
 * pinning: Feeding is a read screen every role reaches, while the Catalogue
 * and Purchases are both `manage_feed_stock` because their backends are.
 */
describe('AppShell feed nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function feedNavLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers Purchases to a manage_feed_stock holder', () => {
    const labels = feedNavLabels(['view_dashboard', 'manage_feed_stock']);

    expect(labels).toContain('Manunuzi ya Chakula');
    expect(labels).toContain('Katalogi ya Chakula');
    expect(labels).toContain('Malisho');
  });

  it('hides it from a feeder, even one allowed to see costs', () => {
    // `view_feed_cost` decides whether prices are SHOWN on a screen, never
    // whether the screen is offered - the two permissions are independent.
    const labels = feedNavLabels(['view_dashboard', 'log_feeding', 'view_feed_cost']);

    expect(labels).not.toContain('Manunuzi ya Chakula');
    expect(labels).not.toContain('Katalogi ya Chakula');
    expect(labels).toContain('Malisho');
  });
});

/**
 * The Species entry, gated on `manage_species`.
 *
 * It matters because it is the first entry whose screen's READ is open to
 * everybody: `species` is `view_dashboard`, and a WORKER really does read the
 * list - on Production, where they pick from it while starting a cycle. What
 * this entry offers is the WRITE, which is `manage_species` (V20, OWNER and
 * FARM_MANAGER). An entry offered to a WORKER would land them on a guard.
 */
describe('AppShell species nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function navLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers Species to a manage_species holder', () => {
    const labels = navLabels(['view_dashboard', 'edit_cycle', 'manage_species']);

    expect(labels).toContain('Aina za Samaki');
    expect(labels).toContain('Uzalishaji');
  });

  it('hides it from someone who may start a cycle but not write the catalogue', () => {
    // `edit_cycle` CHOOSES a species; it does not add one. Production stays,
    // because that is where the choosing happens.
    const labels = navLabels(['view_dashboard', 'edit_cycle', 'log_feeding']);

    expect(labels).not.toContain('Aina za Samaki');
    expect(labels).toContain('Uzalishaji');
  });
});

/**
 * The Asset Register entry, gated on `manage_assets` - the same code as its
 * route, and the code of the register's very first read. Offered to anyone
 * else, it would open onto a FORBIDDEN.
 */
describe('AppShell assets nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function navLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers the register to a manage_assets holder', () => {
    const labels = navLabels(['view_dashboard', 'manage_assets']);

    expect(labels).toContain('Daftari la Mali');
  });

  it('hides it without manage_assets, however much else is held', () => {
    const labels = navLabels([
      'view_dashboard',
      'manage_farms',
      'manage_users',
      'manage_feed_stock',
      'manage_species',
    ]);

    expect(labels).not.toContain('Daftari la Mali');
    expect(labels).toContain('Dashibodi');
  });
});

/**
 * The Operational Costs entry, gated on `manage_costs` - the same code as its
 * route and as every cost endpoint, the list included.
 */
describe('AppShell costs nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function navLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers the cost register to a manage_costs holder', () => {
    const labels = navLabels(['view_dashboard', 'manage_costs']);

    expect(labels).toContain('Gharama za Uendeshaji');
  });

  it('hides it without manage_costs - even from a manage_assets holder', () => {
    const labels = navLabels(['view_dashboard', 'manage_assets', 'manage_farms', 'view_finance']);

    expect(labels).not.toContain('Gharama za Uendeshaji');
    expect(labels).toContain('Daftari la Mali');
  });
});

/** The Profit Report entry, gated on `view_finance` - the same code as its route. */
describe('AppShell profit nav gating', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function navLabels(permissions: string[]): string[] {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    return [...element.querySelectorAll('.sidebar__nav .nav-item')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('offers the profit report to a view_finance holder', () => {
    expect(navLabels(['view_dashboard', 'view_finance'])).toContain('Ripoti ya Faida');
  });

  it('hides it without view_finance - even from a manage_costs holder', () => {
    const labels = navLabels(['view_dashboard', 'manage_costs', 'manage_assets']);

    expect(labels).not.toContain('Ripoti ya Faida');
    expect(labels).toContain('Gharama za Uendeshaji');
  });
});

/**
 * Every nav entry goes somewhere.
 *
 * The nav renders a route-less entry as an inert "coming soon" span, and
 * Settings was the last one - a gear that could never take anyone anywhere,
 * with no /settings route behind it. It is gone, and this pins the rule rather
 * than the one entry: an entry the nav offers is a LINK, and its target is a
 * path the router knows.
 */
describe('AppShell nav has no dead ends', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders every offered entry as a link, with no inert placeholder', () => {
    // Every permission, so the widest nav any account can be shown is checked.
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(
      PERMISSIONS_KEY,
      JSON.stringify([
        'view_dashboard',
        'manage_farms',
        'approve_users',
        'manage_users',
        'manage_species',
        'manage_feed_stock',
        'log_feeding',
        'manage_assets',
        'manage_costs',
      ]),
    );
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    const items = [...element.querySelectorAll('.sidebar__nav .nav-item')];
    expect(items.length).toBeGreaterThan(0);
    expect(element.querySelector('.sidebar__nav .nav-item--disabled')).toBeNull();
    expect(items.every((el) => el.tagName === 'A' && el.getAttribute('href'))).toBe(true);
  });
});

/**
 * The rail.
 *
 * What is pinned here is the one thing the hybrid can get wrong and still
 * LOOK right: the preference has to outlive the component. Every screen
 * renders its own `<app-shell>`, so the shell is rebuilt on each navigation -
 * a collapsed nav that springs back open the moment someone clicks an entry
 * would be worse than no toggle at all.
 */
describe('AppShell collapsible rail', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts expanded, and collapsing marks the page and hides the labels', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    const page = element.querySelector('.dash-page')!;
    expect(page.classList.contains('dash-page--rail')).toBe(false);

    element.querySelector<HTMLButtonElement>('.sidebar__toggle')!.click();
    fixture.detectChanges();

    expect(page.classList.contains('dash-page--rail')).toBe(true);
    expect(element.querySelector('.sidebar__toggle')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps every label in the DOM when collapsed, so the entries stay named', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.sidebar__toggle')!.click();
    fixture.detectChanges();

    const items = [...element.querySelectorAll('.sidebar__nav .nav-item')];
    expect(items.length).toBeGreaterThan(0);
    // The accessible name survives the collapse (CSS clips it, nothing
    // removes it), and the tooltip names the entry for a sighted mouse user.
    expect(items.every((el) => el.querySelector('.nav-item__label')?.textContent?.trim())).toBe(
      true,
    );
    expect(items.every((el) => el.getAttribute('title'))).toBe(true);
  });

  it('remembers the choice across a rebuild of the shell', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const first = setup();
    first.fixture.detectChanges();
    first.element.querySelector<HTMLButtonElement>('.sidebar__toggle')!.click();
    first.fixture.detectChanges();

    expect(localStorage.getItem('samakiFarm.sidebar')).toBe('collapsed');

    // A navigation: the old shell is destroyed and a new one built.
    first.fixture.destroy();
    TestBed.resetTestingModule();
    const second = setup();
    second.fixture.detectChanges();

    expect(second.element.querySelector('.dash-page')!.classList.contains('dash-page--rail')).toBe(
      true,
    );
  });
});

/**
 * The phone drawer.
 *
 * Below 860px the sidebar is off-canvas, so the topbar button is the ONLY way
 * back to the nav - and a drawer left open over the screen the user just
 * navigated to is the failure worth pinning.
 */
describe('AppShell mobile drawer', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('opens from the topbar and closes from the scrim', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    const page = element.querySelector('.dash-page')!;
    expect(page.classList.contains('dash-page--drawer')).toBe(false);

    element.querySelector<HTMLButtonElement>('.dash-menu')!.click();
    fixture.detectChanges();
    expect(page.classList.contains('dash-page--drawer')).toBe(true);

    element.querySelector<HTMLButtonElement>('.dash-scrim')!.click();
    fixture.detectChanges();
    expect(page.classList.contains('dash-page--drawer')).toBe(false);
  });

  it('closes from its own close button and hands focus back to the menu button', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    // Attached, so focus is real.
    document.body.appendChild(element);
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.dash-menu')!.click();
    fixture.detectChanges();
    const close = element.querySelector<HTMLButtonElement>('.sidebar__close')!;
    expect(close.getAttribute('aria-label')).toBe('Funga menyu');

    close.focus();
    close.click();
    fixture.detectChanges();

    expect(element.querySelector('.dash-page')!.classList.contains('dash-page--drawer')).toBe(
      false,
    );
    // Focus was in the drawer that just hid - it must not fall to <body>.
    expect(document.activeElement).toBe(element.querySelector('.dash-menu'));
    element.remove();
  });

  it('makes the screen behind it inert while it is open', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();
    const main = element.querySelector('.dash-main')!;
    expect(main.hasAttribute('inert')).toBe(false);

    element.querySelector<HTMLButtonElement>('.dash-menu')!.click();
    fixture.detectChanges();
    expect(main.hasAttribute('inert')).toBe(true);

    element.querySelector<HTMLButtonElement>('.dash-scrim')!.click();
    fixture.detectChanges();
    expect(main.hasAttribute('inert')).toBe(false);
  });

  it('is shut by Escape', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.dash-menu')!.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(element.querySelector('.dash-page')!.classList.contains('dash-page--drawer')).toBe(
      false,
    );
  });

  it('is shut when the URL moves on', async () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'a', children: [] },
          { path: 'b', children: [] },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/a');
    fixture.detectChanges();

    TestBed.inject(SidebarService).openDrawer();
    fixture.detectChanges();
    expect(TestBed.inject(SidebarService).drawerOpen()).toBe(true);

    // The shell is a layout route: it is NOT rebuilt here, so what closes the
    // drawer is the URL changing under a shell that stays put.
    await router.navigateByUrl('/b');
    fixture.detectChanges();

    expect(TestBed.inject(SidebarService).drawerOpen()).toBe(false);
  });

  it('is shut by a shell that starts up with it left open', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const first = setup();
    first.fixture.detectChanges();
    first.element.querySelector<HTMLButtonElement>('.dash-menu')!.click();
    first.fixture.detectChanges();

    // A reload, or any other reason a fresh shell appears with the service
    // still holding an open drawer: the new shell must not inherit it.
    const sidebarState = TestBed.inject(SidebarService);
    expect(sidebarState.drawerOpen()).toBe(true);
    first.fixture.destroy();

    // The SAME injector on purpose - resetting it would hand the next shell a
    // fresh service, and a fresh service is closed for a reason that has
    // nothing to do with the behaviour under test.
    const second = TestBed.createComponent(AppShell);
    second.detectChanges();

    expect(sidebarState.drawerOpen()).toBe(false);
    expect(
      (second.nativeElement as HTMLElement)
        .querySelector('.dash-page')!
        .classList.contains('dash-page--drawer'),
    ).toBe(false);
  });
});

/**
 * The rail preference is stored only when somebody CHOOSES it.
 *
 * The first value is a guess from the window width (collapsed below 1180px).
 * Storing that guess meant one visit on a phone opened the same browser's
 * desktop as a rail nobody had asked for.
 */
describe('SidebarService preference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('does not store the width-based first guess, only a real toggle', () => {
    const service = TestBed.inject(SidebarService);
    TestBed.tick();

    expect(localStorage.getItem('samakiFarm.sidebar')).toBeNull();

    service.toggle();
    expect(localStorage.getItem('samakiFarm.sidebar')).toBe(service.state());
  });
});

/**
 * The grouping.
 *
 * What is pinned here is the rule a heading can silently break: a heading is
 * an advertisement for the entries under it, so a group whose every entry the
 * account lacks must not render its heading at all. The permission filter and
 * the group filter are two steps, and only the first one is obvious.
 */
describe('AppShell nav groups', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function signInWith(permissions: readonly string[]) {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        id: 'de71c0b6-1b1f-4b2b-9f0f-2f2f6a0f9f11',
        name: 'Test Person',
        phone: '0700000000',
        status: 'ACTIVE',
        farmId: 19,
        role: 'TEST',
      }),
    );
  }

  /** Every heading on screen, in render order. */
  function headings(element: HTMLElement): string[] {
    return [...element.querySelectorAll('.nav-group__heading')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('lays the full nav out in the backend module order', () => {
    signInWith([
      'view_dashboard',
      'manage_farms',
      'approve_users',
      'manage_users',
      'manage_species',
      'manage_feed_stock',
      'manage_assets',
      'manage_costs',
    ]);
    const { fixture, element } = setup();
    fixture.detectChanges();

    // Swahili is the app default. Dashboard and Daily Tasks lead, with no
    // heading of their own, so there are five groups and four headings.
    expect(element.querySelectorAll('.nav-group').length).toBe(5);
    expect(headings(element)).toEqual(['Uzalishaji', 'Chakula', 'Fedha', 'Usimamizi']);
  });

  it('drops a group whole when the account holds none of its entries', () => {
    // A worker: the read screens and the daily sheet, nothing else. Finance
    // and Administration are entirely out of reach.
    signInWith(['view_dashboard', 'log_feeding', 'log_water_quality', 'mark_task_done']);
    const { fixture, element } = setup();
    fixture.detectChanges();

    expect(headings(element)).toEqual(['Uzalishaji', 'Chakula']);
    expect(headings(element)).not.toContain('Fedha');
    expect(headings(element)).not.toContain('Usimamizi');
  });

  it('never renders a heading with nothing under it', () => {
    // The invariant itself, checked against the DOM rather than against the
    // list: every group that made it to the page has at least one entry.
    signInWith(['view_dashboard', 'manage_costs']);
    const { fixture, element } = setup();
    fixture.detectChanges();

    const groups = [...element.querySelectorAll('.nav-group')];
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((group) => group.querySelectorAll('.nav-item').length > 0)).toBe(true);
    // manage_costs alone still earns the Finance heading - Assets is missing
    // from it, the group is not.
    expect(headings(element)).toContain('Fedha');
  });
});

/**
 * The scroll affordance.
 *
 * The nav hides its scrollbar, so these two classes are the ONLY thing telling
 * anyone the list continues. jsdom does no layout - scrollHeight and
 * clientHeight are both 0 - so the element's metrics are stubbed and the
 * component is asked to measure, which is the whole of the logic under test.
 */
describe('AppShell nav scroll affordance', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** Pretends the nav is `visible` tall with `content` of entries in it. */
  function measureWith(options: { content: number; visible: number; scrollTop: number }) {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard']));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');

    const { fixture, element } = setup();
    fixture.detectChanges();

    const nav = element.querySelector<HTMLElement>('.sidebar__nav')!;
    Object.defineProperty(nav, 'scrollHeight', { value: options.content, configurable: true });
    Object.defineProperty(nav, 'clientHeight', { value: options.visible, configurable: true });
    nav.scrollTop = options.scrollTop;

    fixture.componentInstance.measureNav();
    fixture.detectChanges();

    return {
      above: nav.classList.contains('sidebar__nav--more-above'),
      below: nav.classList.contains('sidebar__nav--more-below'),
    };
  }

  it('fades neither edge when the whole nav fits', () => {
    expect(measureWith({ content: 400, visible: 400, scrollTop: 0 })).toEqual({
      above: false,
      below: false,
    });
  });

  it('fades the bottom only, at the top of a list that overflows', () => {
    expect(measureWith({ content: 900, visible: 400, scrollTop: 0 })).toEqual({
      above: false,
      below: true,
    });
  });

  it('fades both edges in the middle of the list', () => {
    expect(measureWith({ content: 900, visible: 400, scrollTop: 200 })).toEqual({
      above: true,
      below: true,
    });
  });

  it('fades the top only once the list is scrolled to the end', () => {
    expect(measureWith({ content: 900, visible: 400, scrollTop: 500 })).toEqual({
      above: true,
      below: false,
    });
  });

  it('ignores a sub-pixel remainder, so a list that fits never fades', () => {
    // Fractional layout leaves scrollHeight a hair above clientHeight on lists
    // that plainly fit. A fade that never goes away stops meaning anything.
    expect(measureWith({ content: 400.6, visible: 400, scrollTop: 0 })).toEqual({
      above: false,
      below: false,
    });
  });
});

/**
 * The topbar keeps controls only; who is signed in is shown in the sidebar
 * footer, under "Taarifa za mfumo".
 */
describe('AppShell topbar and signed-in user', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps language, theme and log out on the bar, and no name', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    const topbar = element.querySelector('.dash-topbar')!;
    expect(topbar.querySelector('app-topbar-clock')).not.toBeNull();
    expect(topbar.querySelector('app-language-toggle')).not.toBeNull();
    expect(topbar.querySelector('app-theme-toggle')).not.toBeNull();
    expect(topbar.querySelector('.dash-logout')!.getAttribute('title')).toBe('Toka');
    expect(topbar.textContent).not.toContain('System Root');
  });

  it('switches the theme from the bar', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();
    const theme = TestBed.inject(ThemeService);
    const before = theme.theme();

    element.querySelector<HTMLButtonElement>('app-theme-toggle button')!.click();
    fixture.detectChanges();

    expect(theme.theme()).toBe(before === 'dark' ? 'light' : 'dark');
  });

  it('names the user and their role under the system info heading', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    const footer = element.querySelector('.sidebar__footer')!;
    expect(footer.querySelector('.sidebar__footer-title')!.textContent?.trim()).toBe(
      'Taarifa za mfumo',
    );
    expect(footer.querySelector('.sidebar__footer-name')!.textContent?.trim()).toBe('System Root');
    expect(footer.querySelector('.sidebar__footer-text')!.textContent?.trim()).toBe('ROOT');
    // Expanded, the words are on screen, so no tooltip repeats them.
    expect(footer.getAttribute('title')).toBeNull();
  });

  it('links the system info panel to the profile page', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    const footer = element.querySelector('.sidebar__footer')!;
    expect(footer.tagName).toBe('A');
    expect(footer.getAttribute('href')).toBe('/profile');
  });

  it('carries the name and role in a tooltip once collapsed to the rail', () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    const { fixture, element } = setup();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.sidebar__toggle')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.sidebar__footer')!.getAttribute('title')).toBe(
      'Umeingia kama System Root (ROOT)',
    );
  });

  it('logs out from the bar and lands on /login', async () => {
    signIn({ canSelectFarm: false, farmId: 19 });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]),
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.dash-logout')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(TestBed.inject(AuthService).currentUser()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});

/**
 * The topbar search - a palette that finds a screen and opens it.
 *
 * The rule worth pinning is the nav's own: it is handed the permission-filtered
 * nav, so it can never offer a screen the route guard would refuse.
 */
describe('AppShell screen search', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** A feeder: Feeding yes, the feed catalogue (manage_feed_stock) no. */
  function signInFeeder() {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard', 'log_feeding']));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');
  }

  function openWithShortcut(fixture: ReturnType<typeof setup>['fixture']) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();
  }

  function type(fixture: ReturnType<typeof setup>['fixture'], element: HTMLElement, text: string) {
    const input = element.querySelector<HTMLInputElement>('.palette__input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function options(element: HTMLElement): string[] {
    return [...element.querySelectorAll('.palette__option .palette__label')].map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('opens with Ctrl+K and offers only the screens this account may open', () => {
    signInFeeder();
    const { fixture, element } = setup();
    fixture.detectChanges();
    expect(element.querySelector('.palette')).toBeNull();

    openWithShortcut(fixture);

    expect(element.querySelector('.palette')!.getAttribute('role')).toBe('dialog');
    const offered = options(element);
    expect(offered).toContain('Malisho');
    expect(offered).toContain('Taarifa zangu');
    expect(offered).not.toContain('Katalogi ya Chakula');
    expect(offered).not.toContain('Mashamba');
  });

  it('opens from the trigger too', () => {
    signInFeeder();
    const { fixture, element } = setup();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.palette-trigger')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.palette')).not.toBeNull();
  });

  it('filters as you type, in either language, and says when nothing matches', () => {
    signInFeeder();
    const { fixture, element } = setup();
    fixture.detectChanges();
    openWithShortcut(fixture);

    type(fixture, element, 'mali');
    expect(options(element)[0]).toBe('Malisho');

    // English, while the app shows Swahili.
    type(fixture, element, 'feed');
    expect(options(element)).toContain('Malisho');

    type(fixture, element, 'zzzz');
    expect(options(element)).toEqual([]);
    expect(element.querySelector('.palette__empty')!.textContent?.trim()).toBe(
      'Hakuna skrini inayolingana.',
    );
  });

  it('opens the highlighted screen on Enter, and closes', async () => {
    signInFeeder();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'feeding', children: [] }]),
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    openWithShortcut(fixture);

    type(fixture, element, 'malisho');
    element
      .querySelector('.palette__input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/feeding');
    expect(element.querySelector('.palette')).toBeNull();
  });

  it('moves the highlight with the arrow keys', () => {
    signInFeeder();
    const { fixture, element } = setup();
    fixture.detectChanges();
    openWithShortcut(fixture);

    const input = element.querySelector('.palette__input')!;
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-option-0');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    expect(input.getAttribute('aria-activedescendant')).toBe('palette-option-1');
    expect(element.querySelector('#palette-option-1')!.getAttribute('aria-selected')).toBe('true');
  });

  it('is shut by Escape', () => {
    signInFeeder();
    const { fixture, element } = setup();
    fixture.detectChanges();
    openWithShortcut(fixture);

    element
      .querySelector('.palette__input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(element.querySelector('.palette')).toBeNull();
  });
});

/**
 * The screen's name, in the browser TAB.
 *
 * Not in the topbar: every screen opens on its own heading, so the topbar was
 * saying it twice and the name came out of it.
 */
describe('AppShell screen name', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function openAt(url: string) {
    localStorage.setItem(TOKEN_KEY, 'a-token');
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(['view_dashboard', 'log_feeding']));
    localStorage.setItem(CAN_SELECT_FARM_KEY, 'false');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'dashboard', children: [] },
          { path: 'feeding', children: [] },
          { path: 'profile', children: [] },
          { path: 'nowhere', children: [] },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('titles the tab with the screen, and keeps the name out of the topbar', async () => {
    const { element } = await openAt('/feeding');

    expect(document.title).toBe('Malisho · Samaki Farm');
    expect(element.querySelector('.dash-topbar')!.textContent).not.toContain('Malisho');
  });

  it('titles the profile, which is not in the nav', async () => {
    await openAt('/profile');

    expect(document.title).toBe('Taarifa zangu · Samaki Farm');
  });

  it('follows the language', async () => {
    const { fixture } = await openAt('/feeding');

    TestBed.inject(LanguageService).setLang('en');
    fixture.detectChanges();

    expect(document.title).toBe('Feeding · Samaki Farm');
  });

  it('falls back to the brand on a URL that is not one of its screens', async () => {
    await openAt('/nowhere');

    expect(document.title).toBe('Samaki Farm');
  });

  it('hands the tab back to the brand when the shell goes', async () => {
    const { fixture } = await openAt('/feeding');
    expect(document.title).toBe('Malisho · Samaki Farm');

    fixture.destroy();

    expect(document.title).toBe('Samaki Farm');
  });
});

/**
 * The shell is a LAYOUT ROUTE.
 *
 * This is the rule the refactor exists to enforce, and it is quiet to break:
 * add a screen at the top level of the route table and it still works, still
 * guards, still renders - it just loses the sidebar, or (worse) gets one that
 * is rebuilt on every click again, which is the flash this ended.
 */
describe('routes put every signed-in screen under the shell', () => {
  /** The routes anyone may reach WITHOUT a session, plus the wildcards. */
  const OUTSIDE_THE_SHELL = ['login', 'signup', 'change-password', '', '**'];

  it('mounts the shell once, as a parent', () => {
    const shell = routes.filter((route) => route.component === ShellLayout);

    expect(shell.length).toBe(1);
    expect(shell[0].path).toBe('');
    expect((shell[0].children ?? []).length).toBeGreaterThan(0);
  });

  it('leaves no signed-in screen at the top level', () => {
    const stranded = routes
      .filter((route) => route.component && route.component !== ShellLayout)
      .map((route) => route.path)
      .filter((path) => !OUTSIDE_THE_SHELL.includes(path ?? ''));

    expect(stranded).toEqual([]);
  });

  it('guards every child itself, so the shell needs no guard of its own', () => {
    const shell = routes.find((route) => route.component === ShellLayout)!;

    expect(shell.canActivate).toBeUndefined();
    expect((shell.children ?? []).every((child) => (child.canActivate ?? []).length > 0)).toBe(
      true,
    );
  });
});
