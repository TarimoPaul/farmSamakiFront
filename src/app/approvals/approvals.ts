import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/services/auth';
import { FarmsService } from '../core/services/farms';
import { RolesService } from '../core/services/roles';
import { UsersService } from '../core/services/users';
import { LanguageService } from '../core/services/language';
import { Farm } from '../core/models/farm';
import { Role } from '../core/models/role';
import { UserSummary } from '../core/models/auth';
import { ApiError, isApiError } from '../core/models/api-error';
import { PERMISSION } from '../core/models/permissions';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { AppShell } from '../shared/layout/app-shell/app-shell';
import { HasPermission } from '../shared/directives/has-permission';
import { Button } from '../shared/ui/button/button';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Modal } from '../shared/ui/modal/modal';
import { Toast } from '../shared/ui/toast/toast';
import { APPROVALS_I18N } from './approvals.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'http',
});

/**
 * A REST conflict has to be recognised by STATUS, not by code.
 *
 * Every other refusal from this backend carries a typed `errorCode`
 * (FORBIDDEN, VALIDATION_ERROR, NO_FARM_CONTEXT...), and branching on the code
 * rather than the message is the rule everywhere else in this app. Conflicts
 * are the one exception: `GlobalExceptionHandler.handleConflict` builds its
 * envelope with the single-argument `ApiResponse.error(message)`, which leaves
 * `errorCode` null. Verified live:
 *
 *   POST /api/users/{id}/approve      (already ACTIVE)
 *     -> 409 {"success":false,"message":"Mtumiaji huyu hayuko kwenye hali ya kusubiri idhini."}
 *   POST /api/users/{id}/memberships  (already on that farm)
 *     -> 409 {"success":false,"message":"Mtumiaji huyu tayari yupo kwenye shamba hili."}
 *
 * — no errorCode field in either. So the status is the only machine-readable
 * thing a conflict carries, and the message is still Swahili prose we refuse
 * to pattern-match on. See the report for the backend fix this wants.
 */
const CONFLICT_STATUS = 409;

/** What became of an approve (+ assign) attempt. Rendered as a notice. */
type Outcome =
  /** Both calls succeeded. */
  | { kind: 'approved-assigned'; name: string }
  /** Approve succeeded; the caller cannot assign, and knows it. */
  | { kind: 'approved-only'; name: string }
  /**
   * Approve succeeded, the membership call did NOT. The user is genuinely
   * ACTIVE and genuinely unassigned — the one outcome that must never read as
   * a plain failure, because half of it is permanent.
   */
  | { kind: 'approved-not-assigned'; name: string; detail: string }
  /** The queue had moved on: this person was no longer pending. */
  | { kind: 'stale'; name: string };

/**
 * Approvals — turning a self-registered person into a usable member.
 *
 * Onboarding is TWO backend steps because it is two decisions, and this screen
 * is shaped by that split rather than hiding it:
 *
 *   POST /api/users/{id}/approve       `approve_users`  PENDING_APPROVAL -> ACTIVE
 *   POST /api/users/{id}/memberships   `manage_users`   farm + role
 *
 * Hence three gates, all reading the same permission set:
 *
 *  - the ROUTE and the NAV entry need `approve_users` (permissionGuard /
 *    AppShell's NAV_ITEMS);
 *  - the ASSIGN controls need `manage_users` (*appHasPermission). A caller
 *    with `approve_users` alone gets a plain "Idhinisha" and a line telling
 *    them the person still needs a farm;
 *  - the FARM PICKER needs `manage_farms`, which is the backend's own
 *    two-tier rule (PermissionChecker.requireSameFarm) mirrored in the UI:
 *    company-wide callers choose any farm, farm-level callers have nothing to
 *    choose and assign into their own.
 *
 * The pickers are also not FETCHED without the permission: `GET /api/roles`
 * needs `manage_users` and `GET /api/farms` needs `manage_farms` (both
 * verified live to answer 403 without), so asking anyway would be two
 * guaranteed failures in the network tab on every visit.
 */
@Component({
  selector: 'app-approvals',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppShell,
    HasPermission,
    Button,
    DataTable,
    EmptyState,
    FormField,
    Modal,
    Toast,
  ],
  templateUrl: './approvals.html',
  styleUrl: './approvals.scss',
})
export class Approvals implements OnInit {
  readonly PERMISSION = PERMISSION;

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => APPROVALS_I18N[this.languageService.lang()]);

  private readonly usersService = inject(UsersService);
  private readonly farmsService = inject(FarmsService);
  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly pending = signal<readonly UserSummary[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  /** Populated only for a caller who may assign — see loadPickers(). */
  readonly farms = signal<readonly Farm[]>([]);
  readonly roles = signal<readonly Role[]>([]);
  readonly pickersLoading = signal(false);

  readonly assignTarget = signal<UserSummary | null>(null);
  readonly saving = signal(false);
  /** Form-level failure inside the modal (not attributable to one field). */
  readonly assignError = signal<string | null>(null);
  readonly farmError = signal<string | null>(null);
  readonly roleError = signal<string | null>(null);

  /** Which row's plain "Idhinisha" is in flight, so only that button spins. */
  readonly approvingId = signal<string | null>(null);

  readonly outcome = signal<Outcome | null>(null);

  /**
   * May the caller assign a farm and a role?
   *
   * The whole primary flow hangs off this. Without it the screen is
   * approve-only, and says so rather than offering a control the backend
   * would refuse.
   */
  readonly canAssign = computed(() => this.authService.hasPermission(PERMISSION.MANAGE_USERS));

  /**
   * May the caller choose WHICH farm? The company-wide tier.
   *
   * Same permission the backend uses for the same decision
   * (PermissionChecker.COMPANY_WIDE_PERMISSION = "manage_farms"), so the
   * picker cannot offer a farm the request would be refused for.
   */
  readonly canPickFarm = computed(() => this.authService.hasPermission(PERMISSION.MANAGE_FARMS));

  /**
   * The farm a farm-level caller assigns into: their own, from `/api/auth/me`.
   *
   * Null is a real state, not an error — ROOT has no farm, and neither does an
   * admin who has not been placed on one. A `manage_users`-only caller in that
   * position cannot assign at all, and the modal says so instead of posting a
   * request with no farmId. (ROOT holds `manage_farms`, so ROOT gets the
   * picker and never reaches this.)
   */
  readonly ownFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  readonly ownFarmName = computed(() => {
    const id = this.ownFarmId();
    if (id === null) {
      return null;
    }
    // `farms` is only ever populated for a caller who can list farms — which
    // is exactly the caller who gets the picker instead of this. Hence the
    // fallback to the bare id.
    return this.farms().find((farm) => farm.farmId === id)?.name ?? `#${id}`;
  });

  /** True when the assign flow has no farm it could possibly target. */
  readonly cannotAssignWithoutFarm = computed(
    () => this.canAssign() && !this.canPickFarm() && this.ownFarmId() === null,
  );

  readonly form = this.formBuilder.group({
    farmId: this.formBuilder.control<number | null>(null, [Validators.required]),
    roleId: this.formBuilder.control<number | null>(null, [Validators.required]),
  });

  /**
   * Queue position rather than a registration date.
   *
   * The brief asked for "when they registered" and the backend does order the
   * queue by it (`findByStatusOrderByCreatedAtAsc`), but `UserSummary` carries
   * no timestamp — id, name, phone, status, farmId, role and nothing else. So
   * the column states what the response actually supports: who has been
   * waiting longest. Printing a date would mean inventing one. See the report.
   */
  readonly columns = computed<DataTableColumn<UserSummary>[]>(() => {
    const t = this.t();
    const rows = this.pending();
    return [
      {
        label: t.colPosition,
        value: (user) => {
          const index = rows.indexOf(user);
          return index === 0 ? t.positionOldest : `${t.positionNth} ${index + 1}`;
        },
        muted: (user) => rows.indexOf(user) !== 0,
      },
      { label: t.colName, value: (user) => user.name },
      { label: t.colPhone, value: (user) => user.phone },
    ];
  });

  readonly userKey = (user: UserSummary): string => user.id;

  ngOnInit(): void {
    this.loadPending();
    this.loadPickers();
  }

  loadPending(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.usersService.listPending().subscribe({
      next: (users) => {
        this.pending.set(users);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * The pickers, each asked for only if the caller holds its permission.
   *
   * Farms is the two-tier branch: a `manage_users`-only caller is refused by
   * `GET /api/farms` and does not need it anyway, because their only possible
   * target is their own farm.
   *
   * A failure here is deliberately quiet. It leaves the picker empty, which
   * the modal reports in place; it must not put an error banner over a pending
   * list that loaded perfectly well.
   */
  private loadPickers(): void {
    if (!this.canAssign()) {
      return;
    }

    this.pickersLoading.set(true);
    let outstanding = this.canPickFarm() ? 2 : 1;
    const settle = () => {
      outstanding -= 1;
      if (outstanding === 0) {
        this.pickersLoading.set(false);
      }
    };

    this.rolesService.list().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        settle();
      },
      error: () => settle(),
    });

    if (this.canPickFarm()) {
      this.farmsService.list().subscribe({
        next: (farms) => {
          this.farms.set(farms);
          settle();
        },
        error: () => settle(),
      });
    }
  }

  // ----------------------------------------------------------------- approve

  /**
   * Approve-only: the whole action for a caller without `manage_users`.
   *
   * The user ends ACTIVE with no farm and no role. That is a legitimate
   * backend state, not a half-failure — but it IS incomplete, so the notice
   * points at where it gets finished.
   */
  approveOnly(user: UserSummary): void {
    if (this.approvingId()) {
      return;
    }
    this.approvingId.set(user.id);
    this.outcome.set(null);

    this.usersService.approve(user.id).subscribe({
      next: () => {
        this.approvingId.set(null);
        this.outcome.set({ kind: 'approved-only', name: user.name });
        this.loadPending();
      },
      error: (err: unknown) => {
        this.approvingId.set(null);
        this.handleApproveFailure(asApiError(err), user);
      },
    });
  }

  // -------------------------------------------------------- approve + assign

  openAssign(user: UserSummary): void {
    this.assignTarget.set(user);
    this.assignError.set(null);
    this.farmError.set(null);
    this.roleError.set(null);
    // A farm-level caller has exactly one possible target, so it is preset
    // rather than asked for.
    this.form.reset({
      farmId: this.canPickFarm() ? null : this.ownFarmId(),
      roleId: null,
    });
  }

  closeAssign(): void {
    if (!this.saving()) {
      this.assignTarget.set(null);
    }
  }

  /**
   * The primary flow: approve, then assign.
   *
   * Sequential and dependent by necessity — the membership call is only
   * attempted once the person is actually ACTIVE. The interesting case is the
   * one in between, handled in handleAssignFailure().
   */
  submitAssign(): void {
    const user = this.assignTarget();
    if (!user || this.saving()) {
      return;
    }

    this.assignError.set(null);
    this.farmError.set(null);
    this.roleError.set(null);

    const { farmId, roleId } = this.form.getRawValue();
    // The farm is preset and read-only for a farm-level caller, so a missing
    // value there means "you have no farm", not "you forgot to choose".
    if (farmId === null) {
      this.farmError.set(this.canPickFarm() ? this.t().errorFarmRequired : this.t().ownFarmUnknown);
      return;
    }
    if (roleId === null) {
      this.roleError.set(this.t().errorRoleRequired);
      return;
    }

    this.saving.set(true);
    this.outcome.set(null);

    this.usersService.approve(user.id).subscribe({
      next: () => this.assignAfterApprove(user, farmId, roleId),
      error: (err: unknown) => {
        this.saving.set(false);
        this.assignTarget.set(null);
        this.handleApproveFailure(asApiError(err), user);
      },
    });
  }

  /**
   * Step two, and the reason this screen needs care.
   *
   * By the time this runs the approve has ALREADY committed: the user is
   * ACTIVE whatever happens next. So a failure here is never reported as
   * "approval failed" — it is reported as the true half-done state, with the
   * backend's own reason attached and a pointer to where it is finished.
   */
  private assignAfterApprove(user: UserSummary, farmId: number, roleId: number): void {
    this.usersService.assignMembership(user.id, { farmId, roleId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.assignTarget.set(null);
        this.outcome.set({ kind: 'approved-assigned', name: user.name });
        this.loadPending();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.assignTarget.set(null);
        this.handleAssignFailure(asApiError(err), user);
      },
    });
  }

  /**
   * A failed approve. Nothing has changed, so this is an ordinary failure —
   * except for the conflict, which means the queue moved under us.
   */
  private handleApproveFailure(error: ApiError, user: UserSummary): void {
    // Already handled by AuthErrorHandler — the screen is being navigated away
    // from, so a notice here would flash an error on the way out.
    if (error.sessionHandled) {
      return;
    }

    if (error.status === CONFLICT_STATUS) {
      // No longer PENDING_APPROVAL: another admin got there first (or the
      // account was disabled). Nothing we did failed; our list was stale.
      this.outcome.set({ kind: 'stale', name: user.name });
      this.loadPending();
      return;
    }

    this.assignError.set(this.messageFor(error));
    this.assignTarget.set(user);
  }

  /**
   * A failed assign AFTER a successful approve — the partial failure.
   *
   * `detail` is the backend's own reason, resolved through the shared
   * errorCode copy so a FORBIDDEN here reads exactly as it does anywhere else.
   * The conflict is the exception that has to go by status, because it arrives
   * with no code at all (see CONFLICT_STATUS).
   *
   * The list is refreshed either way: the person IS approved, so they belong
   * out of the pending queue even though the second step failed.
   */
  private handleAssignFailure(error: ApiError, user: UserSummary): void {
    if (error.sessionHandled) {
      return;
    }

    this.outcome.set({
      kind: 'approved-not-assigned',
      name: user.name,
      detail:
        error.status === CONFLICT_STATUS
          ? error.message
          : apiErrorMessage(error, this.languageService.lang()),
    });
    this.loadPending();
  }

  dismissOutcome(): void {
    this.outcome.set(null);
  }

  private messageFor(error: ApiError | null): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}
