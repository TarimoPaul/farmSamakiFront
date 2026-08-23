import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { ThemeService } from '../../core/services/theme';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';
import { LanguageService } from '../../core/services/language';
import { LanguageToggle } from '../../shared/ui/language-toggle/language-toggle';
import { SIGNUP_I18N } from './signup.i18n';

/**
 * POST /api/auth/register creates a PENDING_APPROVAL person and returns
 * `{ userId, status }` - no token, no farm, no membership.
 *
 * So signing up deliberately does NOT sign anyone in: on success the form is
 * replaced by a "waiting for approval" panel and the session is left
 * untouched. (The previous version posted a farm-shaped payload to a
 * `/auth/signup` endpoint that does not exist, and stored a token from the
 * response it expected back.)
 */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  readonly currentYear = new Date().getFullYear();
  readonly loading = signal(false);
  readonly hidePassword = signal(true);
  readonly submitted = signal(false);

  /**
   * Backend messages ("Namba ya simu hii tayari imesajiliwa.") are Swahili
   * regardless of UI language - they name the exact conflicting field, which
   * is more useful than a generic translated string. Only the fallbacks below
   * are translated. Full bilingual errors would need API-side i18n.
   */
  readonly errorMessage = signal<string | null>(null);

  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => SIGNUP_I18N[this.languageService.lang()]);

  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    phone: ['', [Validators.required]],
    email: ['', [Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  get name() {
    return this.form.controls.name;
  }

  get phone() {
    return this.form.controls.phone;
  }

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  togglePasswordVisibility(): void {
    this.hidePassword.set(!this.hidePassword());
  }

  submit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { name, phone, email, password } = this.form.getRawValue();

    this.authService
      .attemptRegister({
        name: name.trim(),
        phone: phone.trim(),
        // Omitted rather than sent empty - the backend only checks the email
        // for uniqueness when one is actually supplied.
        email: email.trim() || undefined,
        password,
      })
      .subscribe((outcome) => {
        this.loading.set(false);

        switch (outcome.kind) {
          case 'pending':
            this.submitted.set(true);
            break;
          case 'already-registered':
          case 'invalid':
            this.errorMessage.set(outcome.message || this.t().genericError);
            break;
          case 'too-many-requests':
            this.errorMessage.set(this.t().errorTooManyRequests);
            break;
          case 'network-error':
            this.errorMessage.set(this.t().genericError);
            break;
        }
      });
  }
}
