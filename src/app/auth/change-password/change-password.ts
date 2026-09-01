import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { ThemeService } from '../../core/services/theme';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';
import { LanguageService } from '../../core/services/language';
import { LanguageToggle } from '../../shared/ui/language-toggle/language-toggle';
import { CHANGE_PASSWORD_I18N } from './change-password.i18n';

type ErrorKey = 'errorNetwork';

/**
 * Cross-field rule: the backend rejects a "new" password identical to the
 * current one (otherwise the forced-change gate could be cleared without
 * actually changing anything). Catching it here saves a round trip and puts
 * the message on the field instead of in a banner.
 */
function newPasswordDiffers(group: AbstractControl): ValidationErrors | null {
  const current = group.get('currentPassword')?.value;
  const next = group.get('newPassword')?.value;
  return current && next && current === next ? { sameAsCurrent: true } : null;
}

function confirmMatches(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ThemeToggle, LanguageToggle],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
})
export class ChangePassword {
  readonly currentYear = new Date().getFullYear();
  readonly hideCurrent = signal(true);
  readonly hideNew = signal(true);
  readonly loading = signal(false);

  /** Banner-level failure (network). Field-level ones live on the controls. */
  readonly formErrorKey = signal<ErrorKey | null>(null);
  /** Backend text for a rejection we did not anticipate client-side. */
  readonly backendError = signal<string | null>(null);
  /** True when the current-password field was rejected by the server. */
  readonly wrongCurrent = signal(false);

  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly authService = inject(AuthService);
  readonly t = computed(() => CHANGE_PASSWORD_I18N[this.languageService.lang()]);

  /** Shown only when the user is here because the backend forced them. */
  readonly gated = this.authService.mustChangePassword;

  readonly formError = computed(() => {
    const key = this.formErrorKey();
    return key ? this.t()[key] : this.backendError();
  });

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [newPasswordDiffers, confirmMatches] },
  );

  get currentPassword() {
    return this.form.controls.currentPassword;
  }

  get newPassword() {
    return this.form.controls.newPassword;
  }

  get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  toggleCurrent(): void {
    this.hideCurrent.set(!this.hideCurrent());
  }

  toggleNew(): void {
    this.hideNew.set(!this.hideNew());
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  submit(): void {
    this.formErrorKey.set(null);
    this.backendError.set(null);

    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();

    this.authService.attemptChangePassword({ currentPassword, newPassword }).subscribe((outcome) => {
      this.loading.set(false);

      switch (outcome.kind) {
        case 'success':
          // The gate is already cleared by the service. The existing token
          // stays valid, so the app is reachable immediately - no re-login.
          //
          // /me is asked FIRST. Not because it was refused while the gate was
          // up - it was not, /api/auth/* stays reachable - but because nothing
          // had asked it yet: a gated session never reaches the initializer or
          // a permission guard, so it holds no permissions at all, and both
          // the landing branch below and the nav depend on them. A failed
          // refresh still navigates - it resolves rather than throws (see
          // ensurePermissions).
          this.authService
            .refreshPermissions()
            .subscribe(() => this.router.navigateByUrl(this.authService.landingUrl()));
          break;
        case 'wrong-current-password':
          // Field error, not a session failure: nothing was changed.
          this.wrongCurrent.set(true);
          this.currentPassword.setErrors({ wrongCurrent: true });
          this.currentPassword.markAsTouched();
          break;
        case 'rejected':
          this.backendError.set(outcome.message || this.t().errorNetwork);
          break;
        case 'network-error':
          this.formErrorKey.set('errorNetwork');
          break;
      }
    });
  }

  /** Clears the server-side rejection as soon as the field is edited again. */
  onCurrentPasswordInput(): void {
    if (this.wrongCurrent()) {
      this.wrongCurrent.set(false);
      this.currentPassword.setErrors(this.currentPassword.value ? null : { required: true });
    }
  }
}