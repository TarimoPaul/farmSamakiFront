import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { ThemeService } from '../../../core/services/theme';
import { LanguageService } from '../../../core/services/language';
import { PERMISSION } from '../../../core/models/permissions';
import { ThemeToggle } from '../../ui/theme-toggle/theme-toggle';
import { LanguageToggle } from '../../ui/language-toggle/language-toggle';
import { SHELL_I18N } from './app-shell.i18n';

type IconKey = 'grid' | 'farm' | 'box' | 'cycle' | 'feed' | 'drop' | 'users' | 'gear';

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
  { key: 'navUnits', icon: 'box' },
  { key: 'navCycles', icon: 'cycle' },
  { key: 'navFeeding', icon: 'feed' },
  { key: 'navWater', icon: 'drop' },
  { key: 'navWorkers', icon: 'users' },
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

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
