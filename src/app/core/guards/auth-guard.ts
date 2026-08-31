import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth';

/**
 * The session part of every guarded route: signed in, and past the
 * forced-password-change gate.
 *
 * Returns the UrlTree to redirect to, or null when the session is fine. It is
 * separate so permissionGuard can require the same two things without
 * restating them - a permission check on a dead session must still land on
 * /login, not on a "no access" page.
 */
function sessionRedirect(authService: AuthService, router: Router): UrlTree | null {
  if (!authService.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  if (authService.mustChangePassword()) {
    return router.parseUrl('/change-password');
  }
  return null;
}

/**
 * Guards the app itself: signed in AND past the forced-password-change gate.
 *
 * The gate is checked here rather than only reacting to a 403, because a
 * gated user holds a genuinely valid token - without this check they would
 * reach the dashboard and see it briefly render before the first API call
 * bounced them back.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return sessionRedirect(authService, router) ?? true;
};

/**
 * Guards a route on a PERMISSION code - the reusable half of admin routing.
 *
 * `{ path: 'farms', canActivate: [permissionGuard(PERMISSION.MANAGE_FARMS)] }`
 *
 * It waits for `ensurePermissions()` rather than reading the stored set: on a
 * hard refresh straight into an admin URL the cache can be empty, and bouncing
 * a user who is in fact allowed in would be worse than one extra request. The
 * call is shared, so several guards in one navigation cost one /me.
 *
 * A denial goes to /dashboard, not to /login: the session is valid, this
 * person simply does not hold the code. There is no dedicated "no access"
 * screen and inventing one for a route the nav does not even show would be
 * noise - the nav entry is hidden by the same permission (see the
 * appHasPermission directive), so reaching this is either a typed URL or a
 * permission that changed under a live session.
 */
export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const redirect = sessionRedirect(authService, router);
    if (redirect) {
      return redirect;
    }

    return authService.ensurePermissions().pipe(
      map(
        (permissions) =>
          permissions.includes(permission) || router.parseUrl(authService.landingUrl()),
      ),
      // ensurePermissions throws for one reason only: /me answered FORBIDDEN,
      // and it has already dropped the cached permission set by the time this
      // runs. That is a DENIAL, not a broken navigation - letting the error
      // escape would cancel the navigation outright and strand the user on the
      // page they were leaving, with no explanation.
      catchError(() => of(router.parseUrl(authService.landingUrl()))),
    );
  };
}

/**
 * Guards /change-password. Requires a session (the endpoint authenticates
 * with the current token), but deliberately does NOT require the gate to be
 * raised - changing your password voluntarily is allowed.
 */
export const sessionGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isLoggedIn() ? true : router.parseUrl('/login');
};

/**
 * Guards the signed-out screens (login / signup). Someone who already has a
 * session should not land back on the login form; a gated user is sent to
 * the one screen they are allowed to use.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return true;
  }

  return router.parseUrl(
    authService.mustChangePassword() ? '/change-password' : authService.landingUrl(),
  );
};
