import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

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

  if (!authService.isLoggedIn()) {
    return router.parseUrl('/login');
  }

  if (authService.mustChangePassword()) {
    return router.parseUrl('/change-password');
  }

  return true;
};

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

  return router.parseUrl(authService.mustChangePassword() ? '/change-password' : '/dashboard');
};