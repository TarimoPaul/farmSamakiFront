import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppShell } from '../app-shell/app-shell';

/**
 * The signed-in shell, as a ROUTE rather than as something each screen draws
 * for itself.
 *
 * Every screen used to render its own `<app-shell>`. That worked, but it meant
 * the sidebar, the topbar, the farm switcher and fourteen inline SVG icons
 * were destroyed and rebuilt on every single navigation - a visible flash on
 * each click, a fresh `GET /api/farms` each time for ROOT, and component state
 * in the shell that could never outlive a click (which is why the rail's
 * collapsed state had to live in a root service).
 *
 * As a layout route the shell is built ONCE. The router swaps only what is
 * inside it: `<router-outlet />` sits in the shell's default content slot, so
 * the routed screen is projected exactly where the screens used to put their
 * own markup.
 */
@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [AppShell, RouterOutlet],
  template: `<app-shell><router-outlet /></app-shell>`,
})
export class ShellLayout {}
