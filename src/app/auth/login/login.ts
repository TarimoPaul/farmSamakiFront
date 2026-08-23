import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { ThemeService } from '../../core/services/theme';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';
import { LanguageService } from '../../core/services/language';
import { LanguageToggle } from '../../shared/ui/language-toggle/language-toggle';
import { LOGIN_I18N } from './login.i18n';

/** Credential/transport failures - shown as an error banner. */
type ErrorKey = 'errorInvalidCredentials' | 'errorTooManyRequests' | 'errorNetwork';

/**
 * Account-state answers - shown as NOTICES, not errors. The password was
 * accepted in both cases; the account simply is not usable yet. Styling them
 * as credential errors would tell the user to re-check a password that was
 * in fact correct.
 */
type NoticeKey = 'noticePendingApproval' | 'noticeAccountDisabled';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly currentYear = new Date().getFullYear();
  readonly hidePassword = signal(true);
  readonly loading = signal(false);
  readonly formErrorKey = signal<ErrorKey | null>(null);
  readonly noticeKey = signal<NoticeKey | null>(null);

  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => LOGIN_I18N[this.languageService.lang()]);

  readonly formError = computed(() => {
    const key = this.formErrorKey();
    return key ? this.t()[key] : null;
  });
  readonly noticeMessage = computed(() => {
    const key = this.noticeKey();
    return key ? this.t()[key] : null;
  });

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    identifier: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  get identifier() {
    return this.form.controls.identifier;
  }

  get password() {
    return this.form.controls.password;
  }

  togglePasswordVisibility(): void {
    this.hidePassword.set(!this.hidePassword());
  }

  onForgotPassword(): void {
    // TODO: no forgot-password screen exists yet in this app - the backend
    // endpoints (/api/auth/forgot-password, /reset-password) are ready and
    // waiting for a page + route once that flow is scoped.
  }

  submit(): void {
    this.formErrorKey.set(null);
    this.noticeKey.set(null);

    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { identifier, password } = this.form.getRawValue();

    this.authService.attemptLogin(identifier.trim(), password).subscribe((outcome) => {
      this.loading.set(false);

      switch (outcome.kind) {
        case 'success':
          // TODO: once WORKER/VIEWER have their own landing pages, branch on
          // outcome.user.role here instead of always going to /dashboard.
          this.router.navigateByUrl('/dashboard');
          break;
        case 'must-change-password':
          // Login succeeded and the token is usable - but only against
          // /api/auth/change-password until the password is changed.
          this.router.navigateByUrl('/change-password');
          break;
        case 'invalid-credentials':
          this.formErrorKey.set('errorInvalidCredentials');
          break;
        case 'pending-approval':
          this.noticeKey.set('noticePendingApproval');
          break;
        case 'account-disabled':
          this.noticeKey.set('noticeAccountDisabled');
          break;
        case 'too-many-requests':
          this.formErrorKey.set('errorTooManyRequests');
          break;
        case 'network-error':
          this.formErrorKey.set('errorNetwork');
          break;
      }
    });
  }
}
