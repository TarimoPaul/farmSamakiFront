import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { FarmSelectionService } from '../../../core/services/farm-selection';
import { FarmsService } from '../../../core/services/farms';
import { MyFarm } from '../../../core/models/farm';
import { ThemeService } from '../../../core/services/theme';
import { LanguageService } from '../../../core/services/language';
import { SidebarService } from '../../../core/services/sidebar';
import { PERMISSION } from '../../../core/models/permissions';
import { LanguageToggle } from '../../ui/language-toggle/language-toggle';
import { ThemeToggle } from '../../ui/theme-toggle/theme-toggle';
import { CommandPalette, PaletteEntry } from '../command-palette/command-palette';
import { TopbarClock } from '../topbar-clock/topbar-clock';
import { SHELL_I18N } from './app-shell.i18n';

type IconKey =
  | 'grid'
  | 'farm'
  | 'box'
  | 'cycle'
  | 'fish'
  | 'feed'
  | 'drop'
  | 'users'
  | 'check'
  | 'shield'
  | 'list'
  | 'cart'
  | 'tasks'
  | 'briefcase'
  | 'receipt'
  | 'chart'
  | 'gear';

interface ShellNavItem {
  key: keyof (typeof SHELL_I18N)['sw'];
  icon: IconKey;
  /** Absent = built later; rendered inert with a "coming soon" title. */
  route?: string;
  /** Absent = everyone with a session sees it. */
  permission?: string;
}

interface ShellNavGroup {
  /**
   * The heading. Absent = no heading at all, for the entries that open the
   * day and would only be pushed further from the eye by one.
   */
  heading?: keyof (typeof SHELL_I18N)['sw'];
  items: readonly ShellNavItem[];
}

/**
 * The nav, grouped.
 *
 * A screen does not get to decide whether its own entry appears - the entry
 * and the route guard read the SAME permission code, so the nav can never
 * offer something the guard will refuse.
 *
 * THE GROUPING IS NOT INVENTED HERE. It follows the backend's own taxonomy,
 * `permissions.module` / `permissions.group_name` in seed/permissions.csv,
 * which is the same pair the Roles screen lays its checkboxes out by. Two
 * taxonomies for one system is the thing this is meant to end: if Assets sits
 * under "Finance" here it must sit under FINANCE there, which is why moving it
 * came with a backend migration (V27) rather than a local re-label.
 *
 * Three groupings depart from the seed, each for a reason about NAVIGATION
 * rather than about permissions:
 *
 *   * WATER is its own group in the seed. A heading over a single entry is
 *     noise, and water is measured per unit and per cycle, so it joins
 *     Production.
 *   * FARM_MANAGEMENT is its own group in the seed. /farms is an admin screen
 *     in practice - it lives with Members and Roles.
 *   * REPORTING has no heading here at all. Dashboard and Daily Tasks are the
 *     screens the day starts on; a heading would only push them further from
 *     the eye than the screens people reach for less often.
 */
const NAV_GROUPS: readonly ShellNavGroup[] = [
  {
    items: [
      { key: 'navDashboard', icon: 'grid', route: '/dashboard' },
      // Second, and still without a heading, because it is the screen the day
      // starts on: a worker opening their phone in the morning wants the list
      // of what to do, and an owner wants "on this date, what was done and by
      // whom?". Both are this one screen.
      //
      // The permission is stated rather than left off even though every seeded
      // role holds `view_dashboard`, because the rule this list is built on is
      // that an entry names the SAME code its route guards on - and
      // /daily-tasks guards on this one. Left blank, the two would agree only
      // by accident.
      {
        key: 'navDailyTasks',
        icon: 'tasks',
        route: '/daily-tasks',
        permission: PERMISSION.VIEW_DASHBOARD,
      },
    ],
  },
  // No permission on these: they are read screens, and reading is
  // `view_dashboard` - which every role holds, so a gate here would only ever
  // hide them from nobody. The write controls inside them are gated
  // individually (see Production, Feeding and WaterQuality).
  //
  // Units and cycles share ONE entry because they are one screen: a cycle is
  // started in a unit, and splitting them would mean two routes showing each
  // other's data. The old route-less `navCycles` placeholder is gone with it.
  {
    heading: 'groupProduction',
    items: [
      { key: 'navProduction', icon: 'box', route: '/production' },
      // Under Production, because the catalogue it manages is what the cycle
      // form above it picks from - a cycle cannot be started without a species.
      //
      // GATED, unlike Production itself, and the two are gated differently for
      // a reason worth stating: `species` is a `view_dashboard` read, so every
      // role on Production already sees the list there. What this entry offers
      // is the WRITE, which is `manage_species` (V20, OWNER and FARM_MANAGER) -
      // so offering it to anyone else would be offering a screen whose only
      // control is one the backend refuses.
      {
        key: 'navSpecies',
        icon: 'fish',
        route: '/species',
        permission: PERMISSION.MANAGE_SPECIES,
      },
      // FARM/WATER in the seed, and a group of its own there. Here it joins
      // Production: a reading is taken in a unit, on a cycle, and a heading
      // over one entry buys nothing.
      { key: 'navWater', icon: 'drop', route: '/water-quality' },
    ],
  },
  {
    heading: 'groupFeed',
    items: [
      { key: 'navFeeding', icon: 'feed', route: '/feeding' },
      // Under Feeding, and unlike it, GATED - because the backend gates it.
      // Both catalogue endpoints are `manage_feed_stock`, so a feeder who sees
      // Feeding must not be offered this: the screen would load into a
      // FORBIDDEN. Its own icon rather than the feed sack, so the two feed
      // entries are told apart at a glance.
      {
        key: 'navFeedCatalog',
        icon: 'list',
        route: '/feed-catalog',
        permission: PERMISSION.MANAGE_FEED_STOCK,
      },
      // Third of the feed group, on the same code as the catalogue: buying
      // feed and managing the catalogue are the one permission, and the
      // purchase form needs the catalogue read anyway.
      {
        key: 'navFeedPurchases',
        icon: 'cart',
        route: '/feed-purchases',
        permission: PERMISSION.MANAGE_FEED_STOCK,
      },
    ],
  },
  // Both registers are COMPANY-WIDE, across every farm the caller holds -
  // the only two screens the farm switcher does not narrow. Each names the
  // SAME code its route guards on, so a WORKER is never offered a screen
  // whose very first read the backend refuses.
  {
    heading: 'groupFinance',
    items: [
      {
        key: 'navAssets',
        icon: 'briefcase',
        route: '/assets',
        permission: PERMISSION.MANAGE_ASSETS,
      },
      {
        key: 'navCosts',
        icon: 'receipt',
        route: '/costs',
        permission: PERMISSION.MANAGE_COSTS,
      },
      // The same `view_finance` as its route and both of its queries.
      {
        key: 'navProfit',
        icon: 'chart',
        route: '/profit',
        permission: PERMISSION.VIEW_FINANCE,
      },
    ],
  },
  // The screens that shape the system rather than record the work in it.
  // /farms is FARM_MANAGEMENT in the seed rather than UAA, but it belongs to
  // the same job in practice: deciding what exists and who may touch it.
  //
  // No Settings entry. There is no /settings route and no screen behind it, so
  // the entry was nothing but a gear the nav could never take anyone to - the
  // same reason the route-less `navCycles` placeholder went. Its label and its
  // gear icon are LEFT IN PLACE, ready for the day the screen exists: put the
  // entry in this group, with a route, and nothing else has to be rewritten.
  {
    heading: 'groupAdmin',
    items: [
      { key: 'navFarms', icon: 'farm', route: '/farms', permission: PERMISSION.MANAGE_FARMS },
      {
        key: 'navApprovals',
        icon: 'check',
        route: '/approvals',
        permission: PERMISSION.APPROVE_USERS,
      },
      { key: 'navMembers', icon: 'users', route: '/members', permission: PERMISSION.MANAGE_USERS },
      // Next to Members, and on the same permission, because they are two
      // halves of one job: Members hands out roles, this is where roles come
      // from.
      { key: 'navRoles', icon: 'shield', route: '/roles', permission: PERMISSION.MANAGE_USERS },
    ],
  },
];

/**
 * The signed-in chrome: sidebar, nav, topbar. Screens project their content
 * into it and own nothing else.
 *
 * It was lifted out of the dashboard when Farms became the second screen to
 * need it. Class names are unchanged from that markup, so the styles moved
 * with it verbatim rather than being rewritten.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, ThemeToggle, LanguageToggle, CommandPalette, TopbarClock],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly sidebar = inject(SidebarService);

  private readonly authService = inject(AuthService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly farmsService = inject(FarmsService);
  private readonly router = inject(Router);

  readonly currentUser = this.authService.currentUser;
  readonly t = computed(() => SHELL_I18N[this.languageService.lang()]);

  /** The rail's tooltip for the footer, whose name and role are hidden there. */
  readonly footerTitle = computed(() => {
    const user = this.currentUser();
    return user ? `${this.t().loggedInAs} ${user.name} (${user.role})` : this.t().systemInfoTitle;
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * The farm switcher - shown to an account with more than one farm to work
   * in, which /me answers directly: ROOT (every farm), and a member of two or
   * more farms (their own).
   *
   * It cannot be derived from `farmId === null`: that is true of ROOT only
   * until it picks a farm, so the switcher would disappear the moment it was
   * used. See MeResponse.canSelectFarm.
   */
  readonly canSelectFarm = this.authService.canSelectFarm;

  readonly farms = signal<readonly MyFarm[]>([]);

  /**
   * The farm the BACKEND is applying, from /me - NOT the raw selection.
   *
   * A selection the backend refuses (a farm since deleted) leaves this null,
   * so the control drops back to "Select a farm…" instead of naming a farm
   * that is not in use.
   */
  readonly activeFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  /**
   * The farm list, for the switcher - `GET /api/auth/my-farms`, not
   * `GET /api/farms`. The latter needs `manage_farms`, which a member of two
   * farms does not hold; my-farms answers each caller with exactly the farms
   * the backend will accept from them in `X-Farm-Id`.
   *
   * An effect rather than a constructor call because canSelectFarm can flip to
   * true when /me answers, after this component already exists.
   *
   * Once per SHELL, which is now once per SESSION: the shell is a layout route
   * and survives navigation, so this fires on the first signed-in screen and
   * not again. It used to fire on every click, when every screen built its own
   * shell.
   *
   * The cost of that: a farm created on /farms no longer appears in the
   * switcher until a reload. Acceptable - the creator is ROOT, who is on that
   * screen precisely because they are organising farms, not switching between
   * them - and cheap to revisit if it bites (FarmsService would push to a
   * shared signal the switcher reads).
   */
  private farmsRequested = false;
  private readonly loadFarms = effect(() => {
    if (!this.canSelectFarm() || this.farmsRequested) {
      return;
    }
    this.farmsRequested = true;
    this.farmsService.myFarms().subscribe({
      next: (farms) => this.farms.set(farms),
      // A failed list leaves the switcher empty rather than breaking the
      // chrome around every screen; /farms itself reports the failure.
      error: () => this.farms.set([]),
    });
  });

  /** Rail (icons only) vs labels. Remembered across navigations - see SidebarService. */
  readonly collapsed = computed(() => this.sidebar.state() === 'collapsed');
  readonly drawerOpen = this.sidebar.drawerOpen;

  /**
   * Closes the mobile drawer whenever the URL changes.
   *
   * Tapping an entry inside the drawer navigates, and would otherwise leave
   * the drawer sitting open over the screen the user just asked for. The shell
   * survives navigation now, so this is a live subscription to the URL rather
   * than something that happened to run when a new shell was built.
   */
  private readonly closeDrawerOnNavigate = effect(() => {
    this.url();
    this.sidebar.closeDrawer();
  });

  /** Escape shuts the drawer, the way any overlay is expected to behave. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) {
      this.closeMenu();
    }
  }

  private readonly injector = inject(Injector);
  private readonly sidebarEl = viewChild<ElementRef<HTMLElement>>('sidebarEl');
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly drawerClose = viewChild<ElementRef<HTMLButtonElement>>('drawerClose');

  /**
   * Opens the drawer and moves focus INTO it - onto its close button, the
   * control nearest the thumb. The screen behind is inert while it is open, so
   * focus left on the menu button would be focus on nothing reachable.
   */
  openMenu(): void {
    this.sidebar.openDrawer();
    // The drawer becomes visible only once the class is rendered.
    afterNextRender(() => this.drawerClose()?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Closes the drawer and, if focus was inside it, hands focus back to the
   * menu button - otherwise it would fall to <body> as the drawer hides.
   *
   * Navigation closes the drawer too (closeDrawerOnNavigate), but does NOT
   * come through here: on a new screen, focus belongs to the new screen.
   */
  closeMenu(): void {
    const focusWasInside = !!this.sidebarEl()?.nativeElement.contains(document.activeElement);
    this.sidebar.closeDrawer();
    if (focusWasInside) {
      this.menuButton()?.nativeElement.focus();
    }
  }

  /**
   * The hover/long-press label.
   *
   * Collapsed, the entry shows no text, so the title is the only thing naming
   * it to a sighted mouse user - the accessible name is carried separately by
   * the visually-hidden span, which is never removed from the DOM.
   */
  navTitle(item: ShellNavItem): string | null {
    const label = this.t()[item.key];
    if (!item.route) {
      return `${label} - ${this.t().comingSoon}`;
    }
    // Null, not '', so an expanded entry carries no title attribute at all -
    // a tooltip repeating the label already on screen is noise.
    return this.collapsed() ? label : null;
  }

  /**
   * Only the entries this user holds the permission for - and only the groups
   * that still have one.
   *
   * The second half is what keeps the headings honest. A WORKER holds none of
   * `manage_assets`, `manage_costs`, `manage_farms`, `approve_users` or
   * `manage_users`, so for them Finance and Administration are empty; left in,
   * they would be two headings over nothing, advertising screens the account
   * cannot reach.
   */
  readonly navGroups = computed(() =>
    NAV_GROUPS.map((group) => ({
      heading: group.heading,
      items: group.items.filter(
        (item) => !item.permission || this.authService.hasPermission(item.permission),
      ),
    })).filter((group) => group.items.length > 0),
  );

  /**
   * What the topbar search can open: the nav as THIS account sees it, plus the
   * profile, which is reached from the footer rather than the nav.
   *
   * Each entry also carries the OTHER language's label and both languages'
   * group names as keywords, so a bilingual crew finds "Malisho" by typing
   * "feed" whichever language the app is showing - and "fedha" finds both
   * finance screens.
   */
  readonly paletteEntries = computed<PaletteEntry[]>(() => {
    const lang = this.languageService.lang();
    const t = SHELL_I18N[lang];
    const other = SHELL_I18N[lang === 'sw' ? 'en' : 'sw'];

    const entries = this.navGroups().flatMap((group) =>
      group.items
        .filter((item) => !!item.route)
        .map((item) => ({
          label: t[item.key],
          keywords: [
            other[item.key],
            group.heading ? t[group.heading] : '',
            group.heading ? other[group.heading] : '',
          ].join(' '),
          route: item.route!,
          group: group.heading ? t[group.heading] : null,
        })),
    );

    entries.push({
      label: t.navProfile,
      keywords: `${other.navProfile} ${t.groupAccount} ${other.groupAccount}`,
      route: '/profile',
      group: t.groupAccount,
    });
    return entries;
  });

  /**
   * The screen on show, by the same entries the search uses - so /profile,
   * which is not in the nav, is named too, and a screen this account may not
   * open is never named at all.
   *
   * It names the browser TAB only. It was in the topbar too, and came out:
   * every screen already opens on its own heading, so the topbar was saying
   * it twice.
   */
  readonly currentScreen = computed<PaletteEntry | null>(() => {
    const path = this.url().split(/[?#]/)[0];
    return this.paletteEntries().find((entry) => entry.route === path) ?? null;
  });

  /**
   * The browser tab says it as well: with several screens open in tabs, "Samaki
   * Farm" six times over tells nobody anything.
   */
  private readonly titleService = inject(Title);
  private readonly syncDocumentTitle = effect(() => {
    const screen = this.currentScreen();
    const brand = this.t().brandName;
    this.titleService.setTitle(screen ? `${screen.label} · ${brand}` : brand);
  });

  /** Every visible entry, flattened - for "which one is active?". */
  private readonly visibleItems = computed(() => this.navGroups().flatMap((group) => group.items));

  // ── The nav's scroll affordance ────────────────────────────────────────
  //
  // The nav scrolls with NO visible scrollbar (see .sidebar__nav - a scrollbar
  // would run down the exact edge the notch has to meet). That is the right
  // call for the shape and the wrong one for discovery: with four group
  // headings the list now outgrows a 768px-tall laptop, and nothing on screen
  // would say so. These two say so, by fading the list out at whichever edge
  // still has entries beyond it.
  private readonly navEl = viewChild<ElementRef<HTMLElement>>('navScroll');

  readonly navMoreAbove = signal(false);
  readonly navMoreBelow = signal(false);

  /**
   * Re-measures after any render that could have changed the nav's height.
   *
   * The signals are READ here on purpose: that is what makes this run again
   * when the permissions land (the nav grows), when the rail is collapsed (the
   * rows change height) or when the language is switched. A plain
   * `afterNextRender` would measure the first paint and never look again.
   */
  private readonly measureAfterRender = afterRenderEffect(() => {
    this.navGroups();
    this.collapsed();
    this.t();
    this.measureNav();
  });

  @HostListener('window:resize')
  measureNav(): void {
    const el = this.navEl()?.nativeElement;
    if (!el) {
      return;
    }
    const remaining = el.scrollHeight - el.clientHeight - el.scrollTop;
    // A pixel of slack at both ends: sub-pixel layout leaves a fraction of a
    // pixel of "scroll" on lists that plainly fit, and a fade that never goes
    // away is worse than no fade - it stops meaning anything.
    this.navMoreAbove.set(el.scrollTop > 1);
    this.navMoreBelow.set(remaining > 1);
  }

  /** The active entry's label doubles as the sub-title under the brand. */
  readonly activeLabel = computed(() => {
    const active = this.visibleItems().find((item) => this.isActive(item));
    return active ? this.t()[active.key] : '';
  });

  /** The footer links to /profile, which is not a nav entry - so it marks itself. */
  readonly onProfile = computed(() => this.url().split(/[?#]/)[0] === '/profile');

  isActive(item: ShellNavItem): boolean {
    return !!item.route && this.url().split(/[?#]/)[0] === item.route;
  }

  /**
   * Picks the farm, then re-asks /me.
   *
   * The refresh is what makes the control honest: `farmId` on the answer is
   * the farm the backend actually applied, and that is what this displays.
   * Screens showing farm data reload from the selection signal itself (see
   * the Dashboard).
   */
  selectFarm(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.farmSelection.select(select.value === '' ? null : Number(select.value));

    this.authService.refreshPermissions().subscribe(() => {
      // Write the ANSWER back into the control.
      //
      // The option bindings cannot do this: when the backend refuses a pick -
      // a farm deleted since the list was fetched - activeFarmId stays null,
      // so nothing the template binds to has changed, and the option the user
      // clicked would stay selected. The control would then name a farm that
      // is not in use, which is the one thing it must never do.
      const active = this.activeFarmId();
      select.value = active === null ? '' : String(active);
    });
  }

  /**
   * The tab goes back to the brand alone when the shell does - on log out -
   * or the login page would still be titled with the last screen seen.
   */
  private readonly resetDocumentTitle = inject(DestroyRef).onDestroy(() =>
    this.titleService.setTitle(this.t().brandName),
  );

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
