import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth';
import { RolesService } from '../core/services/roles';
import { LanguageService } from '../core/services/language';
import { Role } from '../core/models/role';
import { PERMISSION, PermissionDefinition } from '../core/models/permissions';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { AppShell } from '../shared/layout/app-shell/app-shell';
import { ActionMenu } from '../shared/ui/action-menu/action-menu';
import { Button } from '../shared/ui/button/button';
import { ConfirmDialog } from '../shared/ui/confirm-dialog/confirm-dialog';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Modal } from '../shared/ui/modal/modal';
import { Toast } from '../shared/ui/toast/toast';
import { ROLES_I18N } from './roles.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'http',
});

/**
 * `roles.name` is `VARCHAR(50)`. Checked here as well as on the backend so a
 * name that is merely too long is named as such on the field, rather than
 * making a round trip to be refused.
 */
const NAME_MAX_LENGTH = 50;

const CONFLICT_STATUS = 409;

/** The catalogue, laid out the way the backend's Permission entity intends. */
export interface PermissionGroup {
  /** Stable identity for template tracking: module + group. */
  key: string;
  module: string;
  groupName: string | null;
  readonly permissions: readonly PermissionDefinition[];
}

/**
 * Roles - what the app's permissions are bundled INTO, and the only screen
 * that writes the security policy itself.
 *
 * It completes the admin path: Farms creates the farm, Approvals turns a
 * registration into a person, Members hands that person a role - and this is
 * where the role they are handed is built, renamed, retired or removed. Every
 * endpoint behind it is `manage_users`, the same code that opens Members, so
 * the route guard alone is the gate and no control here needs gating
 * separately.
 *
 * NOT FARM-SCOPED, and the screen does not pretend otherwise. `POST /api/roles`
 * takes no farm and `roles` has no farm column: a role is one global list that
 * every farm draws from, so editing OWNER changes what every owner of every
 * farm may do. Both edit modals say exactly that, because it is the one fact
 * an admin cannot discover from the controls in front of them.
 *
 * CODES IN, IDS OUT. A role arrives carrying permission CODES (`RoleSummary`),
 * but `PUT /{id}/permissions` takes numeric IDs, and only the catalogue joins
 * the two. That join is why a failed catalogue disables permission editing
 * outright rather than degrading: with no map from code to id, opening the
 * editor would show every box unticked, and saving would then strip the role
 * bare while looking like an ordinary save.
 *
 * DISABLE AND DELETE ARE DIFFERENT ACTIONS, and the screen keeps them apart
 * on purpose:
 *
 *  - DISABLE is reversible and touches nobody. The role stays in the list,
 *    everyone holding it keeps it and every permission it grants, and only
 *    NEW assignments are refused. No confirmation, because there is nothing
 *    to lose.
 *  - DELETE is refused outright while anyone still holds the role (409
 *    ROLE_IN_USE, naming how many). It asks first, and its question points at
 *    disabling as the softer option.
 */
@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppShell,
    ActionMenu,
    Button,
    ConfirmDialog,
    DataTable,
    EmptyState,
    FormField,
    Modal,
    Toast,
  ],
  templateUrl: './roles.html',
  styleUrl: './roles.scss',
})
export class Roles implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => ROLES_I18N[this.languageService.lang()]);

  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly roles = signal<readonly Role[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly permissions = signal<readonly PermissionDefinition[]>([]);
  readonly permissionsFailed = signal(false);

  /**
   * A refused action, kept on screen rather than flashed.
   *
   * It holds the delete refusal, which is a sentence the admin has to read
   * and act on ("held by 3 people - move them first, or disable it"), not a
   * transient blip. The FAILURE is stored rather than the rendered line, so
   * the banner re-renders in the language showing now.
   */
  readonly actionError = signal<ApiError | null>(null);

  /**
   * The banner's line.
   *
   * ROLE_IN_USE and VALIDATION_ERROR keep the backend's own sentence: the
   * first NAMES how many people are in the way, which is the only number
   * that tells the admin how much work clearing it is, and no generic line
   * could carry it. Anything else - FORBIDDEN above all - goes through the
   * shared copy so it reads as it does everywhere else in the app.
   */
  readonly actionErrorMessage = computed(() => {
    const error = this.actionError();
    if (!error) {
      return null;
    }
    if (
      error.errorCode === ERROR_CODE.ROLE_IN_USE ||
      error.errorCode === ERROR_CODE.VALIDATION_ERROR
    ) {
      return error.message;
    }
    return this.messageFor(error);
  });

  /**
   * The catalogue as module -> group -> permissions, in the order the backend
   * sent it (sorted by code within each group).
   *
   * Grouping happens here rather than in the template because the shape is
   * data, not markup: the same list feeds both modals.
   */
  readonly groups = computed<readonly PermissionGroup[]>(() => {
    const buckets = new Map<
      string,
      { key: string; module: string; groupName: string | null; permissions: PermissionDefinition[] }
    >();

    for (const permission of this.permissions()) {
      const key = `${permission.module}/${permission.groupName ?? ''}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.permissions.push(permission);
      } else {
        buckets.set(key, {
          key,
          module: permission.module,
          groupName: permission.groupName,
          permissions: [permission],
        });
      }
    }

    return [...buckets.values()];
  });

  /**
   * The permission ids ticked right now - shared by the create form and the
   * permission editor, because only one of them is ever open.
   *
   * IDs, not codes: it is what the endpoint takes, and it is the only form
   * that survives a permission being renamed.
   */
  readonly selected = signal<ReadonlySet<number>>(new Set<number>());
  readonly selectedCount = computed(() => this.selected().size);

  // The name/description form serves BOTH the create modal and the edit
  // modal - they ask for the same two things, and neither can be open while
  // the other is. `createOpen` vs `detailsTarget` is what tells them apart on
  // submit; sharing the controls means one set of validation, one set of
  // error signals, and no chance of the two drifting.
  readonly createOpen = signal(false);
  readonly detailsTarget = signal<Role | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly nameError = signal<string | null>(null);

  readonly permissionsTarget = signal<Role | null>(null);
  readonly savingPermissions = signal(false);
  readonly permissionsError = signal<string | null>(null);

  readonly deleteTarget = signal<Role | null>(null);
  readonly deleting = signal(false);

  /** The role whose on/off switch is mid-flight, so only its button spins. */
  readonly togglingId = signal<number | null>(null);

  /**
   * Codes the role holds that the catalogue does not list - a permission
   * soft-deleted after roles were built on it.
   *
   * They CANNOT be preserved: this screen can only send ids, and an unlisted
   * code has none to send. So rather than dropping them silently, the modal
   * names them and says they will be lost - the same reasoning the backend
   * gives for refusing partial writes.
   */
  readonly unknownCodes = signal<readonly string[]>([]);

  readonly toastMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    description: [''],
  });

  readonly columns = computed<DataTableColumn<Role>[]>(() => {
    const t = this.t();
    return [
      { label: t.colName, value: (role) => role.name },
      {
        label: t.colDescription,
        value: (role) => role.description ?? t.noDescription,
        muted: (role) => !role.description,
      },
      {
        label: t.colPermissions,
        value: (role) =>
          role.permissions.length === 0 ? t.noPermissions : `${role.permissions.length}`,
        muted: (role) => role.permissions.length === 0,
      },
      {
        label: t.colStatus,
        value: (role) => (role.active ? t.statusActive : t.statusInactive),
        // Dimmed when disabled: the row is still real and still editable, it
        // just is not being handed out any more.
        muted: (role) => !role.active,
      },
    ];
  });

  readonly roleKey = (role: Role): number => role.roleId;

  /** Exposed so the input's own `maxlength` and the check below stay one number. */
  readonly nameMaxLength = NAME_MAX_LENGTH;

  ngOnInit(): void {
    this.loadRoles();
    this.loadPermissions();
  }

  loadRoles(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.rolesService.list().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.roles.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * The catalogue. A failure does NOT become the screen's error: the roles
   * themselves may have loaded perfectly well, and reading them is most of
   * what this screen is for. It only takes the permission editor away, and
   * says so - renaming, disabling and deleting all still work.
   */
  loadPermissions(): void {
    this.rolesService.listPermissions().subscribe({
      next: (permissions) => {
        this.permissions.set(permissions);
        this.permissionsFailed.set(false);
      },
      error: () => {
        this.permissions.set([]);
        this.permissionsFailed.set(true);
      },
    });
  }

  reload(): void {
    this.loadRoles();
    if (this.permissionsFailed()) {
      this.loadPermissions();
    }
  }

  // ------------------------------------------------------- permission picker

  isSelected(permissionId: number): boolean {
    return this.selected().has(permissionId);
  }

  toggle(permissionId: number): void {
    const next = new Set(this.selected());
    if (!next.delete(permissionId)) {
      next.add(permissionId);
    }
    this.selected.set(next);
  }

  /** A backend module name, translated when known and shown as sent when not. */
  moduleLabel(module: string): string {
    return (this.t().modules as Record<string, string>)[module] ?? humanise(module);
  }

  groupLabel(groupName: string | null): string {
    if (!groupName) {
      return this.t().groupOther;
    }
    return (this.t().groups as Record<string, string>)[groupName] ?? humanise(groupName);
  }

  // ------------------------------------------------------ create and rename

  openCreate(): void {
    this.resetDetailsForm('', '');
    this.selected.set(new Set<number>());
    this.unknownCodes.set([]);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    if (!this.saving()) {
      this.createOpen.set(false);
    }
  }

  openDetails(role: Role): void {
    this.resetDetailsForm(role.name, role.description ?? '');
    this.detailsTarget.set(role);
  }

  closeDetails(): void {
    if (!this.saving()) {
      this.detailsTarget.set(null);
    }
  }

  private resetDetailsForm(name: string, description: string): void {
    this.form.reset({ name, description });
    this.formError.set(null);
    this.nameError.set(null);
    this.actionError.set(null);
  }

  submitCreate(): void {
    const name = this.validatedName();
    if (name === null) {
      return;
    }

    this.saving.set(true);
    this.rolesService
      .create({
        name,
        // An empty box is NO description, not an empty one:
        // `roles.description` is nullable, and a blank string would print as
        // a description that says nothing rather than as "hakuna maelezo".
        description: this.trimmedDescription(),
        permissionIds: [...this.selected()],
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.createOpen.set(false);
          this.toastMessage.set(this.t().createdToast);
          // Re-read rather than push the returned role onto the list: the
          // backend is the authority on what now exists, and the answer is
          // one cheap call away.
          this.loadRoles();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showDetailsError(asApiError(err));
        },
      });
  }

  /**
   * Saves a rename / new description. Sends NOTHING else.
   *
   * The permission set is untouched by this endpoint, which is why the two
   * edits are two modals: an admin fixing a typo in a name must not be one
   * misplaced click away from rewriting a security policy.
   */
  submitDetails(): void {
    const role = this.detailsTarget();
    const name = this.validatedName();
    if (!role || name === null) {
      return;
    }

    this.saving.set(true);
    this.rolesService
      .update(role.roleId, { name, description: this.trimmedDescription() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.detailsTarget.set(null);
          this.toastMessage.set(this.t().savedToast);
          this.loadRoles();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showDetailsError(asApiError(err));
        },
      });
  }

  /**
   * The trimmed name, or null when it is not fit to send - having already put
   * the reason on the field.
   *
   * Both checks are the backend's rules restated, not invented: it refuses a
   * blank name with 400 and the database caps the column at 50. Doing them
   * here means the admin is told which of the two is wrong immediately,
   * instead of after a round trip.
   */
  private validatedName(): string | null {
    if (this.saving()) {
      return null;
    }
    this.formError.set(null);
    this.nameError.set(null);

    const name = this.form.getRawValue().name.trim();

    if (!name) {
      this.nameError.set(this.t().errorNameRequired);
      return null;
    }
    if (name.length > NAME_MAX_LENGTH) {
      this.nameError.set(this.t().errorNameTooLong);
      return null;
    }
    return name;
  }

  private trimmedDescription(): string | null {
    return this.form.getRawValue().description.trim() || null;
  }

  /**
   * A failed create or rename, put on the field it belongs to.
   *
   * CONFLICT is always the name: it is the only unique column on the table,
   * and the backend now says so in words ("Nafasi yenye jina hili tayari
   * ipo.") rather than leaving it to the generic data-integrity sentence.
   * The screen still uses its OWN copy for it, so the line reads in the UI
   * language like every other field error.
   */
  private showDetailsError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.status === CONFLICT_STATUS) {
      this.nameError.set(this.t().errorNameTaken);
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      // The backend names which rule was broken, and it is more specific
      // than anything generic - so it goes on the field as it came.
      this.nameError.set(error.message);
      return;
    }
    this.formError.set(this.messageFor(error));
  }

  // ------------------------------------------------------- disable / enable

  /**
   * Flips the role on or off. No confirmation, deliberately: nothing is lost
   * either way, nobody holding the role is affected, and the same button
   * puts it straight back.
   */
  toggleActive(role: Role): void {
    if (this.togglingId() !== null) {
      return;
    }
    this.actionError.set(null);
    this.togglingId.set(role.roleId);

    this.rolesService.setActive(role.roleId, !role.active).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.toastMessage.set(role.active ? this.t().deactivatedToast : this.t().activatedToast);
        this.loadRoles();
      },
      error: (err: unknown) => {
        this.togglingId.set(null);
        this.showActionError(asApiError(err));
      },
    });
  }

  isToggling(role: Role): boolean {
    return this.togglingId() === role.roleId;
  }

  // -------------------------------------------------------------- delete

  askDelete(role: Role): void {
    this.actionError.set(null);
    this.deleteTarget.set(role);
  }

  cancelDelete(): void {
    if (!this.deleting()) {
      this.deleteTarget.set(null);
    }
  }

  confirmDelete(): void {
    const role = this.deleteTarget();
    if (!role || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.rolesService.remove(role.roleId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.toastMessage.set(this.t().deletedToast);
        this.loadRoles();
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        // The dialog closes even on failure: the refusal is not a retry of
        // the same question, it is a different one ("move these people
        // first"), and it belongs in the banner where it can be read without
        // a modal in the way.
        this.deleteTarget.set(null);
        this.showActionError(asApiError(err));
      },
    });
  }

  dismissActionError(): void {
    this.actionError.set(null);
  }

  private showActionError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    this.actionError.set(error);
  }

  // -------------------------------------------------------- edit permissions

  /**
   * Opens the permission editor with the role's CURRENT permissions ticked.
   *
   * The join from codes to ids happens here, once, so that everything after
   * it deals only in ids. Anything that does not join is kept aside and
   * reported rather than quietly forgotten - see unknownCodes.
   */
  openPermissions(role: Role): void {
    this.permissionsError.set(null);
    this.actionError.set(null);

    const idByCode = new Map(this.permissions().map((p) => [p.code, p.permissionId]));
    const ids = new Set<number>();
    const unknown: string[] = [];

    for (const code of role.permissions) {
      const id = idByCode.get(code);
      if (id === undefined) {
        unknown.push(code);
      } else {
        ids.add(id);
      }
    }

    this.selected.set(ids);
    this.unknownCodes.set(unknown);
    this.permissionsTarget.set(role);
  }

  closePermissions(): void {
    if (!this.savingPermissions()) {
      this.permissionsTarget.set(null);
    }
  }

  submitPermissions(): void {
    const role = this.permissionsTarget();
    if (!role || this.savingPermissions()) {
      return;
    }

    this.permissionsError.set(null);
    this.savingPermissions.set(true);

    this.rolesService.updatePermissions(role.roleId, [...this.selected()]).subscribe({
      next: () => {
        this.savingPermissions.set(false);
        this.permissionsTarget.set(null);
        this.toastMessage.set(this.t().permissionsSavedToast);
        this.loadRoles();
        this.syncOwnPermissions();
      },
      error: (err: unknown) => {
        this.savingPermissions.set(false);
        this.showPermissionsError(asApiError(err));
      },
    });
  }

  /**
   * Re-asks /me, because the admin may have just edited their OWN role.
   *
   * Only the PERMISSION write does this, and that is the whole list of
   * writes on this screen that can change what the signed-in user may do.
   * Renaming does not (a membership points at an id), disabling does not
   * (holders are untouched by design), and deleting cannot - it is refused
   * while anyone holds the role, and the admin doing it holds their own.
   *
   * The backend drops every user's cached authorities on this write, so the
   * session's stored permission set is stale the moment the save succeeds -
   * and on a screen whose whole purpose is rewriting that set, "stale" can
   * mean the nav still offering screens the backend will now refuse.
   *
   * Losing `manage_users` is the one case worth acting on rather than just
   * recording: nothing on this screen would work any more, so the user is
   * sent where they still belong instead of discovering it one 403 at a
   * time. The nav entry disappears with the permission, which is the
   * explanation.
   */
  private syncOwnPermissions(): void {
    this.authService.refreshPermissions().subscribe({
      next: (permissions) => {
        if (!permissions.includes(PERMISSION.MANAGE_USERS)) {
          void this.router.navigateByUrl(this.authService.landingUrl());
        }
      },
      // A failed /me leaves the cached set alone (see ensurePermissions). The
      // save itself succeeded and has already been reported; nothing here is
      // worth a second message.
      error: () => undefined,
    });
  }

  /**
   * A failed permission write, kept inside the modal where the choice was
   * made.
   *
   * VALIDATION_ERROR keeps the backend's own sentence: it NAMES the ids it
   * refused ("Ruhusa hizi hazipo: 14. Hakuna kilichobadilishwa.") and ends by
   * confirming the role was left untouched, which is more than any generic
   * line could say - and it is the one refusal an admin might actually need
   * to reason about.
   */
  private showPermissionsError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.status === CONFLICT_STATUS) {
      this.permissionsError.set(error.message);
      return;
    }
    this.permissionsError.set(this.messageFor(error));
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  private messageFor(error: ApiError | null): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

/** `FARM_MANAGEMENT` -> `Farm management`, for a module or group we have no copy for. */
function humanise(value: string): string {
  const words = value.split('_').filter(Boolean).join(' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
