import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LanguageService } from '../core/services/language';
import { AuthService } from '../core/services/auth';
import { AssetsService } from '../core/services/assets';
import { ProfileService } from '../core/services/profile';
import { MeResponse } from '../core/models/auth';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { Button } from '../shared/ui/button/button';
import { FormField } from '../shared/ui/form-field/form-field';
import { Toast } from '../shared/ui/toast/toast';
import { PROFILE_I18N } from './profile.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'http',
});

/** `ChangePasswordRequest.newPassword` is `@Size(min = 6)` on the backend. */
const PASSWORD_MIN_LENGTH = 6;

/** 409 - a phone or email already in use. The backend's sentence says which. */
const CONFLICT_STATUS = 409;

/** Deliberately loose: the backend's `@Email` is the authority. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * "Taarifa zangu" - the signed-in person's own account, reached from the
 * sidebar footer.
 *
 * THREE THINGS, and only these:
 *
 *  - Personal details (name, phone, email) through `PUT /api/auth/me`, which
 *    needs no permission because it can only ever touch the caller.
 *  - Changing the password, through the same endpoint the forced-change gate
 *    uses. NOT "reset": resetting by SMS code is for someone who cannot sign
 *    in, and it stays on the login screen.
 *  - A read-only summary - role, farm, status, how many permissions. Those are
 *    an administrator's to change, so nothing here pretends otherwise.
 *
 * Opened on ANY route guard that lets a session in: every account has a
 * profile, including one with no farm and no role.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, Button, FormField, Toast],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => PROFILE_I18N[this.languageService.lang()]);

  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly assetsService = inject(AssetsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly me = signal<MeResponse | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));
  readonly toastMessage = signal<string | null>(null);

  // ── Account summary ────────────────────────────────────────────────────

  /** Resolved from `myFarms` (login-only); null until it answers, or if it fails. */
  readonly farmName = signal<string | null>(null);

  readonly initials = computed(() =>
    (this.me()?.name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  readonly roleLabel = computed(() => this.me()?.role ?? this.t().noRole);

  /**
   * The farm by NAME when `myFarms` knows it, by number when it does not - a
   * ROOT working in a farm it does not belong to, say. Never blank: an
   * account with a farm must not read as one without.
   */
  readonly farmLabel = computed(() => {
    const farmId = this.me()?.farmId ?? null;
    if (farmId === null) {
      return this.t().noFarm;
    }
    return this.farmName() ?? `#${farmId}`;
  });

  readonly statusLabel = computed(() => {
    const t = this.t();
    switch (this.me()?.status) {
      case 'ACTIVE':
        return t.statusActive;
      case 'PENDING_APPROVAL':
        return t.statusPending;
      case 'DISABLED':
        return t.statusDisabled;
      default:
        return this.me()?.status ?? '';
    }
  });

  readonly permissionCount = computed(() => this.authService.permissions().length);

  // ── Personal details ───────────────────────────────────────────────────

  readonly detailsForm = this.formBuilder.nonNullable.group({
    name: [''],
    phone: [''],
    email: [''],
  });

  private readonly detailsValue = toSignal(this.detailsForm.valueChanges, {
    initialValue: this.detailsForm.getRawValue(),
  });

  /**
   * Nothing to save. The button is disabled rather than left to send an
   * identical request - which would still answer "saved", and a toast for a
   * change nobody made is a small lie.
   */
  readonly detailsUnchanged = computed(() => {
    const me = this.me();
    const value = this.detailsValue();
    if (!me) {
      return true;
    }
    return (
      (value.name ?? '').trim() === me.name &&
      (value.phone ?? '').trim() === me.phone &&
      (value.email ?? '').trim() === (me.email ?? '')
    );
  });

  readonly savingDetails = signal(false);
  readonly nameError = signal<string | null>(null);
  readonly phoneError = signal<string | null>(null);
  readonly emailError = signal<string | null>(null);
  readonly detailsError = signal<string | null>(null);

  // ── Password ───────────────────────────────────────────────────────────

  readonly passwordForm = this.formBuilder.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [newPasswordDiffers, confirmMatches] },
  );

  readonly showPasswords = signal(false);
  readonly savingPassword = signal(false);
  readonly passwordSubmitted = signal(false);
  readonly passwordError = signal<string | null>(null);

  ngOnInit(): void {
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.profileService.load().subscribe({
      next: (me) => {
        this.accept(me);
        this.loading.set(false);
        this.loadFarmName(me.farmId);
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  saveDetails(): void {
    if (this.savingDetails() || this.detailsUnchanged()) {
      return;
    }

    this.nameError.set(null);
    this.phoneError.set(null);
    this.emailError.set(null);
    this.detailsError.set(null);

    const raw = this.detailsForm.getRawValue();
    const t = this.t();
    const name = raw.name.trim();
    const phone = raw.phone.trim();
    const email = raw.email.trim();

    let valid = true;
    if (!name) {
      this.nameError.set(t.errorNameRequired);
      valid = false;
    }
    if (!phone) {
      this.phoneError.set(t.errorPhoneRequired);
      valid = false;
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      this.emailError.set(t.errorEmailInvalid);
      valid = false;
    }
    if (!valid) {
      return;
    }

    this.savingDetails.set(true);
    // An empty email is SENT, not left out: the backend stores it as null,
    // which is how someone removes an address they no longer use.
    this.profileService.update({ name, phone, email }).subscribe({
      next: (me) => {
        this.savingDetails.set(false);
        this.accept(me);
        this.toastMessage.set(this.t().detailsSaved);
      },
      error: (err: unknown) => {
        this.savingDetails.set(false);
        this.showDetailsError(asApiError(err));
      },
    });
  }

  changePassword(): void {
    if (this.savingPassword()) {
      return;
    }
    this.passwordSubmitted.set(true);
    this.passwordError.set(null);
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) {
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);

    this.authService.attemptChangePassword({ currentPassword, newPassword }).subscribe((outcome) => {
      this.savingPassword.set(false);

      switch (outcome.kind) {
        case 'success':
          this.passwordForm.reset();
          this.passwordSubmitted.set(false);
          this.toastMessage.set(this.t().passwordChanged);
          break;
        case 'wrong-current-password':
          this.passwordForm.controls.currentPassword.setErrors({ wrongCurrent: true });
          break;
        case 'rejected':
          this.passwordError.set(outcome.message || this.t().errorNetwork);
          break;
        case 'network-error':
          this.passwordError.set(this.t().errorNetwork);
          break;
      }
    });
  }

  /**
   * The line under one password field, or null.
   *
   * Shown once the field was left or the form was submitted - not while the
   * first character is still being typed.
   */
  passwordFieldError(field: 'currentPassword' | 'newPassword' | 'confirmPassword'): string | null {
    const control = this.passwordForm.controls[field];
    if (!control.touched && !this.passwordSubmitted()) {
      return null;
    }
    const t = this.t();
    switch (field) {
      case 'currentPassword':
        if (control.hasError('wrongCurrent')) return t.errorWrongCurrent;
        if (control.hasError('required')) return t.errorCurrentRequired;
        return null;
      case 'newPassword':
        if (control.hasError('required')) return t.errorNewRequired;
        if (control.hasError('minlength')) return t.errorNewLength;
        if (this.passwordForm.hasError('sameAsCurrent')) return t.errorNewSame;
        return null;
      case 'confirmPassword':
        if (control.hasError('required')) return t.errorConfirmRequired;
        if (this.passwordForm.hasError('mismatch')) return t.errorConfirmMismatch;
        return null;
    }
  }

  /** A wrong current password is refused by the server; editing the box clears that. */
  clearWrongCurrent(): void {
    const control = this.passwordForm.controls.currentPassword;
    if (control.hasError('wrongCurrent')) {
      control.setErrors(control.value ? null : { required: true });
    }
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /** The answer becomes what the form starts from, so "unchanged" means unchanged. */
  private accept(me: MeResponse): void {
    this.me.set(me);
    this.detailsForm.reset({ name: me.name, phone: me.phone, email: me.email ?? '' });
  }

  /**
   * The farm's name, for the summary. A failure is swallowed on purpose: the
   * number still shows, and a side panel must not turn a working form into an
   * error page.
   */
  private loadFarmName(farmId: number | null): void {
    this.farmName.set(null);
    if (farmId === null) {
      return;
    }
    this.assetsService.myFarms().subscribe({
      // GraphQL sends the id as a string; /me sends a number.
      next: (farms) =>
        this.farmName.set(farms.find((farm) => Number(farm.farmId) === farmId)?.name ?? null),
      error: () => this.farmName.set(null),
    });
  }

  /**
   * A refused save. 409 and VALIDATION_ERROR keep the BACKEND'S sentence: it
   * says whether the phone or the email is taken, or that ROOT's phone is
   * pinned - more than any generic line here could. It goes under the form
   * because the code alone does not say which field it belongs to.
   */
  private showDetailsError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.status === CONFLICT_STATUS || error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.detailsError.set(error.message);
      return;
    }
    this.detailsError.set(this.messageFor(error));
  }

  private messageFor(error: ApiError | null): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}
