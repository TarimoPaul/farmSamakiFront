import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { FarmSelectionService } from '../../../core/services/farm-selection';
import { FarmsService } from '../../../core/services/farms';
import { Farm } from '../../../core/models/farm';
import { ThemeService } from '../../../core/services/theme';
import { LanguageService } from '../../../core/services/language';
import { PERMISSION } from '../../../core/models/permissions';
import { ThemeToggle } from '../../ui/theme-toggle/theme-toggle';
import { LanguageToggle } from '../../ui/language-toggle/language-toggle';
import { SHELL_I18N } from './app-shell.i18n';

type IconKey =
  'grid' | 'farm' | 'box' | 'cycle' | 'feed' | 'drop' | 'users' | 'check' | 'shield' | 'gear';

interface ShellNavItem {
  key: keyof (typeof SHELL_I18N)['sw'];
  icon: IconKey;
  /** Absent = built later; rendered inert with a "coming soon" title. */
  route?: string;
  /** Absent = everyone with a session sees it. */
  permission?: string;
}

/**
 * The nav, in one list.
 *
 * A screen does not get to decide whether its own entry appears - the entry
 * and the route guard read the SAME permission code, so the nav can never
 * offer something the guard will refuse.
 */
const NAV_ITEMS: readonly ShellNavItem[] = [
  { key: 'navDashboard', icon: 'grid', route: '/dashboard' },
  { key: 'navFarms', icon: 'farm', route: '/farms', permission: PERMISSION.MANAGE_FARMS },
  {
    key: 'navApprovals',
    icon: 'check',
    route: '/approvals',
    permission: PERMISSION.APPROVE_USERS,
  },
  { key: 'navMembers', icon: 'users', route: '/members', permission: PERMISSION.MANAGE_USERS },
  // Next to Members, and on the same permission, because they are two halves
  // of one job: Members hands out roles, this is where the roles come from.
  { key: 'navRoles', icon: 'shield', route: '/roles', permission: PERMISSION.MANAGE_USERS },
  // No permission on these three: they are read screens, and reading is
  // `view_dashboard` - which every role holds, so a gate here would only ever
  // hide them from nobody. The write controls inside them are gated
  // individually (see Production, Feeding and WaterQuality).
  //
  // Units and cycles share ONE entry because they are one screen: a cycle is
  // started in a unit, and splitting them would mean two routes showing each
  // other's data. The old route-less `navCycles` placeholder is gone with it.
  { key: 'navProduction', icon: 'box', route: '/production' },
  { key: 'navFeeding', icon: 'feed', route: '/feeding' },
  { key: 'navWater', icon: 'drop', route: '/water-quality' },
  { key: 'navSettings', icon: 'gear' },
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
  imports: [CommonModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  /** Set when the screen projects a `[slot=aside]` column, so the shell's grid gets its second track. */
  hasAside = input(false);

  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);

  private readonly authService = inject(AuthService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly farmsService = inject(FarmsService);
  private readonly router = inject(Router);

  readonly currentUser = this.authService.currentUser;
  readonly t = computed(() => SHELL_I18N[this.languageService.lang()]);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * The farm switcher - shown only to an account that may work in a farm it
   * does not belong to, which /me answers directly (ROOT, today).
   *
   * It cannot be derived from `farmId === null`: that is true of ROOT only
   * until it picks a farm, so the switcher would disappear the moment it was
   * used. See MeResponse.canSelectFarm.
   */
  readonly canSelectFarm = this.authService.canSelectFarm;

  readonly farms = signal<readonly Farm[]>([]);

  /**
   * The farm the BACKEND is applying, from /me - NOT the raw selection.
   *
   * A selection the backend refuses (a farm since deleted) leaves this null,
   * so the control drops back to "Select a farm…" instead of naming a farm
   * that is not in use.
   */
  readonly activeFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  /**
   * The farm list, for the switcher.
   *
   * An effect rather than a constructor call because canSelectFarm can flip to
   * true when /me answers, after this component already exists.
   *
   * It is fetched once per SHELL - and the shell is rebuilt on every
   * navigation - rather than cached for the session. That is deliberate: it is
   * ROOT-only traffic on a small endpoint, and a farm created on /farms has to
   * appear in the switcher without a reload.
   */
  private farmsRequested = false;
  private readonly loadFarms = effect(() => {
    if (!this.canSelectFarm() || this.farmsRequested) {
      return;
    }
    this.farmsRequested = true;
    this.farmsService.list().subscribe({
      next: (farms) => this.farms.set(farms),
      // A failed list leaves the switcher empty rather than breaking the
      // chrome around every screen; /farms itself reports the failure.
      error: () => this.farms.set([]),
    });
  });

  /** Only the entries this user holds the permission for. */
  readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => !item.permission || this.authService.hasPermission(item.permission)),
  );

  /** The active entry's label doubles as the sub-title under the brand. */
  readonly activeLabel = computed(() => {
    const active = this.navItems().find((item) => this.isActive(item));
    return active ? this.t()[active.key] : '';
  });

  isActive(item: ShellNavItem): boolean {
    return !!item.route && this.url().split(/[?#]/)[0] === item.route;
  }

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
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

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
