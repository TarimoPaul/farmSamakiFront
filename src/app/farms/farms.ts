import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/services/auth';
import { FarmsService } from '../core/services/farms';
import { UsersService } from '../core/services/users';
import { LanguageService } from '../core/services/language';
import { Farm } from '../core/models/farm';
import { UserSummary } from '../core/models/auth';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { PERMISSION } from '../core/models/permissions';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { AppShell } from '../shared/layout/app-shell/app-shell';
import { HasPermission } from '../shared/directives/has-permission';
import { ActionMenu } from '../shared/ui/action-menu/action-menu';
import { Button } from '../shared/ui/button/button';
import { ConfirmDialog } from '../shared/ui/confirm-dialog/confirm-dialog';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Modal } from '../shared/ui/modal/modal';
import { Toast } from '../shared/ui/toast/toast';
import { FARMS_I18N } from './farms.i18n';

/** Bean-validation failures arrive as "field: message" (possibly several, joined by "; "). */
const FIELD_MESSAGE = /^(\w+):\s*(.+)$/;

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'http',
});

/**
 * Farms - the first permission-gated admin screen.
 *
 * Three different gates, all reading the same permission set:
 *
 *  - the ROUTE needs `manage_farms` (permissionGuard, in app.routes.ts);
 *  - the NAV entry needs `manage_farms` (AppShell's NAV_ITEMS);
 *  - the MEMBERS panel needs `manage_users` (*appHasPermission), because
 *    `GET /api/users?farmId=` is a different capability from listing farms.
 *    A `manage_farms`-only admin sees the farms and no members panel at all.
 *
 * The members panel is READ-ONLY by design. Assigning membership, changing a
 * role, disabling or removing someone belongs to the Members screen.
 */
@Component({
  selector: 'app-farms',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppShell,
    HasPermission,
    ActionMenu,
    Button,
    ConfirmDialog,
    DataTable,
    EmptyState,
    FormField,
    Modal,
    Toast,
  ],
  templateUrl: './farms.html',
  styleUrl: './farms.scss',
})
export class Farms implements OnInit {
  readonly PERMISSION = PERMISSION;

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => FARMS_I18N[this.languageService.lang()]);

  private readonly farmsService = inject(FarmsService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly farms = signal<readonly Farm[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly selectedFarm = signal<Farm | null>(null);
  readonly members = signal<readonly UserSummary[]>([]);
  readonly membersLoading = signal(false);
  readonly membersError = signal<ApiError | null>(null);
  readonly membersErrorMessage = computed(() => this.messageFor(this.membersError()));

  readonly createOpen = signal(false);
  readonly saving = signal(false);
  /** Form-level failure (anything not attributable to one field). */
  readonly createError = signal<string | null>(null);
  readonly nameError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /** Set while a farm is being renamed; the create modal is closed then. */
  readonly editTarget = signal<Farm | null>(null);

  readonly deleteTarget = signal<Farm | null>(null);
  readonly deleting = signal(false);

  /**
   * A refused action - in practice the delete refusal, which names how many
   * members are still on the farm. Kept until dismissed: it is an
   * instruction, not a notification, and the FAILURE is stored rather than
   * the rendered line so the banner follows the language toggle.
   */
  readonly actionError = signal<ApiError | null>(null);

  /**
   * FARM_IN_USE keeps the backend's own sentence, because it NAMES the
   * number of members in the way - the one figure that says how much work
   * clearing it is, and nothing generic could carry it.
   */
  readonly actionErrorMessage = computed(() => {
    const error = this.actionError();
    if (!error) {
      return null;
    }
    if (error.errorCode === ERROR_CODE.FARM_IN_USE) {
      return error.message;
    }
    return this.messageFor(error);
  });

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    location: [''],
  });

  readonly farmColumns = computed<DataTableColumn<Farm>[]>(() => {
    const t = this.t();
    return [
      { label: t.colName, value: (farm) => farm.name },
      {
        label: t.colLocation,
        value: (farm) => farm.location || t.noLocation,
        muted: (farm) => !farm.location,
      },
      {
        // ownerName is null until someone is given the OWNER role on the farm
        // - creating a farm does not make anyone its owner.
        label: t.colOwner,
        value: (farm) => farm.ownerName ?? t.noOwner,
        muted: (farm) => !farm.ownerName,
      },
    ];
  });

  readonly memberColumns = computed<DataTableColumn<UserSummary>[]>(() => {
    const t = this.t();
    return [
      { label: t.memberName, value: (member) => member.name },
      { label: t.memberPhone, value: (member) => member.phone },
      {
        label: t.memberRole,
        value: (member) => member.role ?? t.noRole,
        muted: (member) => !member.role,
      },
    ];
  });

  readonly farmKey = (farm: Farm): number => farm.farmId;
  readonly memberKey = (member: UserSummary): string => member.id;

  ngOnInit(): void {
    this.loadFarms();
  }

  loadFarms(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.farmsService.list().subscribe({
      next: (farms) => {
        this.farms.set(farms);
        this.loading.set(false);

        // Keep the open selection pointing at the refreshed row, and drop it
        // if the farm is gone.
        const selected = this.selectedFarm();
        if (selected) {
          const still = farms.find((farm) => farm.farmId === selected.farmId) ?? null;
          this.selectedFarm.set(still);
        }
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  selectFarm(farm: Farm): void {
    this.selectedFarm.set(farm);
    this.members.set([]);
    this.membersError.set(null);

    // Asked only when the caller could possibly be allowed - the panel is
    // hidden without manage_users, and firing a request we know answers 403
    // would be noise in the log and in the network tab.
    if (!this.authService.hasPermission(PERMISSION.MANAGE_USERS)) {
      return;
    }

    this.membersLoading.set(true);
    this.usersService.listByFarm(farm.farmId).subscribe({
      next: (members) => {
        this.members.set(members);
        this.membersLoading.set(false);
      },
      error: (err: unknown) => {
        // Most likely FORBIDDEN: the endpoint is farm-scoped, so a non-ROOT
        // admin may only read the members of their OWN farm. Showing that
        // answer beats showing an empty list, which would read as "this farm
        // has nobody on it".
        this.membersError.set(asApiError(err));
        this.membersLoading.set(false);
      },
    });
  }

  openCreate(): void {
    this.form.reset({ name: '', location: '' });
    this.createError.set(null);
    this.nameError.set(null);
    this.actionError.set(null);
    this.createOpen.set(true);
  }

  // ---------------------------------------------------------------- rename

  /**
   * Opens the SAME form on an existing farm. Create and rename ask for the
   * same two things, so they share the controls and the error signals - only
   * one of the two modals can be open, and `editTarget` is what tells submit
   * which it was.
   */
  openEdit(farm: Farm): void {
    this.form.reset({ name: farm.name, location: farm.location ?? '' });
    this.createError.set(null);
    this.nameError.set(null);
    this.actionError.set(null);
    this.editTarget.set(farm);
  }

  closeEdit(): void {
    if (!this.saving()) {
      this.editTarget.set(null);
    }
  }

  submitEdit(): void {
    const farm = this.editTarget();
    if (!farm || this.saving()) {
      return;
    }

    this.createError.set(null);
    this.nameError.set(null);

    const { name, location } = this.form.getRawValue();
    if (!name.trim()) {
      this.nameError.set(this.t().errorNameRequired);
      return;
    }

    this.saving.set(true);
    this.farmsService
      .update(farm.farmId, { name: name.trim(), location: location.trim() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editTarget.set(null);
          this.toastMessage.set(this.t().savedToast);
          this.loadFarms();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showCreateError(asApiError(err));
        },
      });
  }

  // ---------------------------------------------------------------- delete

  askDelete(farm: Farm): void {
    this.actionError.set(null);
    this.deleteTarget.set(farm);
  }

  cancelDelete(): void {
    if (!this.deleting()) {
      this.deleteTarget.set(null);
    }
  }

  confirmDelete(): void {
    const farm = this.deleteTarget();
    if (!farm || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.farmsService.remove(farm.farmId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.toastMessage.set(this.t().deletedToast);
        // The members panel was showing a farm that no longer exists.
        if (this.selectedFarm()?.farmId === farm.farmId) {
          this.selectedFarm.set(null);
          this.members.set([]);
        }
        this.loadFarms();
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        // Closed on failure: "it still has 4 members" is a different
        // statement from the question that was asked, and it belongs in the
        // banner where it can be read without a dialog over it.
        this.deleteTarget.set(null);
        if (!isApiError(err) || !err.sessionHandled) {
          this.actionError.set(asApiError(err));
        }
      },
    });
  }

  dismissActionError(): void {
    this.actionError.set(null);
  }

  closeCreate(): void {
    if (!this.saving()) {
      this.createOpen.set(false);
    }
  }

  submitCreate(): void {
    this.createError.set(null);
    this.nameError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameError.set(this.t().errorNameRequired);
      return;
    }

    const { name, location } = this.form.getRawValue();
    this.saving.set(true);

    this.farmsService.create({ name: name.trim(), location: location.trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.createOpen.set(false);
        this.toastMessage.set(this.t().createdToast);
        this.loadFarms();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.showCreateError(asApiError(err));
      },
    });
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /**
   * Turns a failed create into something the form can point at.
   *
   * VALIDATION_ERROR carries the backend's own text, which names the field
   * ("name: Jina la shamba linahitajika") and is more specific than any
   * generic line we could write - so it goes on that field.
   *
   * CONFLICT gets farm-specific copy. Note that today's backend CANNOT
   * produce it here: `farms.name` has no unique constraint, so duplicate
   * names are accepted (verified live). The branch exists because CONFLICT is
   * part of the shared error vocabulary and this is the endpoint that would
   * raise it the moment that constraint is added.
   */
  private showCreateError(error: ApiError): void {
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      const match = FIELD_MESSAGE.exec(error.message);
      if (match && match[1] === 'name') {
        this.nameError.set(match[2]);
        return;
      }
      this.createError.set(error.message);
      return;
    }

    if (error.errorCode === ERROR_CODE.CONFLICT) {
      this.createError.set(this.t().errorConflict);
      return;
    }

    this.createError.set(this.messageFor(error));
  }

  private messageFor(error: ApiError | null): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}
