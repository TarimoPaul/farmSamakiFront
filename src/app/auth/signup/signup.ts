import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { ApiResponse } from '../../core/models/api-response';
import { LoginResponse } from '../../core/models/auth';
import { ThemeService } from '../../core/services/theme';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';
import { LanguageService } from '../../core/services/language';
import { LanguageToggle } from '../../shared/ui/language-toggle/language-toggle';
import { SIGNUP_I18N } from './signup.i18n';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  readonly currentYear = new Date().getFullYear();

  farmName = '';
  farmLocation = '';
  ownerName = '';
  phone = '';
  email = '';
  password = '';
  loading = signal(false);
  // Backend errors (e.g. "namba ya simu tayari imesajiliwa") come back in
  // Swahili regardless of UI language - only the generic fallback below is
  // translated. Full bilingual backend errors would need API-side i18n.
  errorMessage = signal<string | null>(null);
  hidePassword = signal(true);

  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => SIGNUP_I18N[this.languageService.lang()]);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  togglePasswordVisibility(): void {
    this.hidePassword.set(!this.hidePassword());
  }

  submit(): void {
    this.errorMessage.set(null);
    this.loading.set(true);

    this.authService
      .signup({
        farmName: this.farmName,
        farmLocation: this.farmLocation || undefined,
        ownerName: this.ownerName,
        phone: this.phone,
        email: this.email || undefined,
        password: this.password,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigateByUrl('/dashboard');
        },
        error: (err) => {
          this.loading.set(false);
          const body = err.error as ApiResponse<LoginResponse> | undefined;
          this.errorMessage.set(body?.message ?? this.t().genericError);
        },
      });
  }
}
