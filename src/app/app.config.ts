import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { AuthService } from './core/services/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),

    /**
     * Refresh what this session is allowed to do, once, at start-up.
     *
     * Permissions are editable server-side while a token stays valid (a role
     * gains or loses a code), so the stored set is a cache that has to be
     * re-checked - a page refresh is exactly when it can be stale.
     *
     * Deliberately NOT returned/awaited: the app boots on the cached set so
     * the nav does not flicker, and any route that actually depends on a
     * permission awaits `ensurePermissions()` in its guard - which shares this
     * very request rather than making a second one.
     */
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      if (authService.canUseApp()) {
        authService.ensurePermissions().subscribe();
      }
    }),
  ],
};
