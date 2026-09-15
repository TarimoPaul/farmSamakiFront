import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/services/auth';
import { FarmSelectionService } from '../core/services/farm-selection';
import { FarmsService } from '../core/services/farms';
import { RolesService } from '../core/services/roles';
import { UsersService } from '../core/services/users';
import { LanguageService } from '../core/services/language';
import { Farm } from '../core/models/farm';
import { MembershipView } from '../core/models/membership';
import { PERMISSION } from '../core/models/permissions';
import { Role } from '../core/models/role';
import { UserSummary, UserStatus } from '../core/models/auth';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { ActionMenu } from '../shared/ui/action-menu/action-menu';
import { Button } from '../shared/ui/button/button';
import { ConfirmDialog } from '../shared/ui/confirm-dialog/confirm-dialog';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Modal } from '../shared/ui/modal/modal';
import { Toast } from '../shared/ui/toast/toast';
import { MEMBERS_I18N } from './members.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'http',
});

/**
 * The fallback for a conflict this screen cannot name.
 *
 * Conflicts used to be the ONE refusal from this backend carrying no
 * `errorCode`, which forced every 409 onto a status branch. They now carry
 * one - `ConflictException` defaults to CONFLICT and names OWNER_IMMUTABLE for
 * the guard rail - and of the two endpoints this screen writes to, the ONLY
 * 409 either produces is that guard rail, which is branched on by code below
 * like every other refusal. (A stale list is a 400 VALIDATION_ERROR from both,
 * not a conflict.)
 *
 * So nothing reaches this branch today. It is kept because when a 409 does
 * arrive with nothing but prose - an older backend, or a rule added to these
 * endpoints later - showing that prose beats the generic "this clashes with
 * existing data", which would leave the admin hunting for the clash. Shown,
 * never pattern-matched.
 *
 * Same treatment as the Approvals screen; see CONFLICT_STATUS there.
 */
const CONFLICT_STATUS = 409;

/** `CreateUserRequest.password` is `@Size(min = 6)` on the backend. */
const PASSWORD_MIN_LENGTH = 6;

/**
 * Members - who is on this farm, and what they may do here.
 *
 * The third and last screen of the admin path: Farms creates the farm,
 * Approvals turns a registration into a person with a membership, and this is
 * where that membership is changed or ended. Everything on it is
 * `manage_users`, so - unlike Farms and Approvals, which mix two permissions -
 * the route guard alone is the gate and there is no half-usable version of
 * this screen. The nav entry reads the same code.
 *
 * WHICH FARM. One farm at a time, and never a farm of its own choosing: it
 * shows the farm the BACKEND is applying, which is `farmId` on
 * `GET /api/auth/me`. For an ordinary admin that is their membership; for ROOT
 * it is whatever FarmSelectionService last asked for and the backend accepted
 * (the pick travels as `X-Farm-Id`; see that service). Deliberately NOT the
 * raw selection signal: the id here goes into the request PATH, so acting on a
 * pick before /me has confirmed it would list one farm's members while the
 * header said another. The effect below therefore watches the applied farm,
 * which is what changes when the switcher is used - one reload, with an id the
 * backend has already agreed to.
 *
 * NO CLIENT-SIDE RULES. The backend refuses removing a farm's owner
 * (FarmUserService.removeMembership) and nothing else; `UserSummary` carries
 * no "is owner" flag, so the UI genuinely cannot know in advance and does not
 * pretend to. The control is offered, the backend decides, and its refusal is
 * what the admin reads - in their own language, because that one refusal has a
 * code of its own (OWNER_IMMUTABLE) rather than being a bare 409 like the
 * rest. Inventing a rule here would mean hiding a control for
 * people the backend would have allowed.
 */
@Component({
  selector: 'app-members',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ActionMenu,
    Button,
    ConfirmDialog,
    DataTable,
    EmptyState,
    FormField,
    Modal,
    Toast,
  ],
  templateUrl: './members.html',
  styleUrl: './members.scss',
})
export class Members implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => MEMBERS_I18N[this.languageService.lang()]);

  private readonly usersService = inject(UsersService);
  private readonly farmsService = inject(FarmsService);
  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly formBuilder = inject(FormBuilder);

  readonly members = signal<readonly UserSummary[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  private readonly allRoles = signal<readonly Role[]>([]);
  readonly rolesFailed = signal(false);

  /**
   * The roles this screen may hand out - the ACTIVE ones, and only those.
   *
   * `GET /api/roles` deliberately returns disabled roles too, because the
   * Roles screen is the only place that can switch one back on. Here they
   * would be a trap: the backend refuses to attach a disabled role to a
   * membership (`FarmUserService.resolveRole`), so offering one in the picker
   * would be offering a choice that can only end in a 400.
   *
   * A member currently HOLDING a disabled role keeps it - nothing here takes
   * it away. It simply cannot be re-picked, which is exactly what disabling
   * the role was for.
   */
  readonly roles = computed(() => this.allRoles().filter((role) => role.active));

  /** The farm the backend is applying - see the class note. */
  readonly activeFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  /** Whether the "no farm" panel should point at the switcher or at a human. */
  readonly canSelectFarm = this.authService.canSelectFarm;

  readonly roleTarget = signal<UserSummary | null>(null);
  readonly savingRole = signal(false);
  readonly roleError = signal<string | null>(null);

  readonly removeTarget = signal<UserSummary | null>(null);
  readonly removing = signal(false);

  /** Deleting the PERSON, not the membership - a separate question. */
  readonly deleteTarget = signal<UserSummary | null>(null);
  readonly deleting = signal(false);

  /** The member whose account switch is mid-flight, so only their row waits. */
  readonly togglingId = signal<string | null>(null);

  // ------------------------------------------------------------ adding a person

  readonly addOpen = signal(false);
  readonly saving = signal(false);
  readonly addError = signal<string | null>(null);
  readonly addNameError = signal<string | null>(null);
  readonly addPhoneError = signal<string | null>(null);
  readonly addPasswordError = signal<string | null>(null);

  /**
   * Set once the ACCOUNT exists but the membership call has not succeeded.
   *
   * Adding somebody is two writes - `POST /api/users` then
   * `POST /{id}/memberships` - and the second can fail on its own. Without
   * this, pressing Save again would create a SECOND account for the same
   * person (the first attempt would then be refused as a duplicate phone,
   * which reads as though nothing had worked at all). Holding the id turns
   * the retry into "finish what is left".
   */
  readonly createdUserId = signal<string | null>(null);

  readonly addForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', Validators.required],
    email: [''],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    roleId: this.formBuilder.control<number | null>(null),
  });

  /**
   * The signed-in user's own id.
   *
   * Used to keep "disable" and "delete" off their own row. Unlike the owner
   * rule - which this screen deliberately leaves to the backend because a
   * `UserSummary` carries no owner flag - this one IS knowable here, and the
   * backend refuses it anyway (400, "Huwezi kujizuia mwenyewe"). Offering a
   * control whose only possible outcome is a refusal is worse than not
   * offering it.
   */
  private readonly signedInUserId = computed(() => this.authService.currentUser()?.id ?? null);

  isSelf(member: UserSummary): boolean {
    return member.id === this.signedInUserId();
  }

  isToggling(member: UserSummary): boolean {
    return this.togglingId() === member.id;
  }

  /**
   * A failed change/remove, kept on screen rather than flashed.
   *
   * It holds the guard-rail conflict, which is a sentence the admin has to
   * read and act on ("the owner cannot be removed"), not a transient blip.
   *
   * The FAILURE is stored, not the rendered line - same as loadError above.
   * The banner can stand for a while, and a line rendered once would still be
   * in the old language after the toggle was used under it.
   */
  readonly actionError = signal<ApiError | null>(null);

  /**
   * The banner's line, in the language showing now.
   *
   * OWNER_IMMUTABLE - the one refusal this screen really has to explain -
   * resolves through the shared copy and therefore reads in the UI language.
   * Any OTHER conflict keeps the backend's own sentence, which is Swahili
   * either way but says more than the generic line could; see CONFLICT_STATUS.
   */
  readonly actionErrorMessage = computed(() => {
    const error = this.actionError();
    if (!error) {
      return null;
    }
    if (error.errorCode !== ERROR_CODE.OWNER_IMMUTABLE && error.status === CONFLICT_STATUS) {
      return error.message;
    }
    // Deleting brings a second family of refusals with it, and they say
    // exactly what is wrong - "Mmiliki wa shamba hawezi kufutwa.", "Huwezi
    // kujifuta mwenyewe." The shared VALIDATION_ERROR copy ("the details you
    // entered were not accepted") would be actively misleading for either:
    // nothing was entered, and nothing about the request was malformed.
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      return error.message;
    }
    return this.messageFor(error);
  });
  readonly toastMessage = signal<string | null>(null);

  readonly form = this.formBuilder.group({
    roleId: this.formBuilder.control<number | null>(null),
  });

  readonly columns = computed<DataTableColumn<UserSummary>[]>(() => {
    const t = this.t();
    return [
      { label: t.colName, value: (member) => member.name },
      { label: t.colPhone, value: (member) => member.phone },
      {
        label: t.colRole,
        value: (member) => member.role ?? t.noRole,
        muted: (member) => !member.role,
      },
      { label: t.colStatus, value: (member) => this.statusLabel(member.status) },
    ];
  });

  readonly memberKey = (member: UserSummary): string => member.id;

  // ── The summary rail ───────────────────────────────────────────────────
  //
  // Counted from `members()` and `roles()`, both already on the page, so the
  // rail costs no request of its own.
  //
  // NO DATE PICKER: `UserSummary` carries no timestamp - id, name, phone,
  // status, farmId, role and nothing else - so there is no date to filter by.
  // The same gap the Approvals queue works around with a position column.

  /**
   * The farm's people by account state.
   *
   * A DISABLED member is still on the farm - the membership is untouched, only
   * the login is off - which is why they are counted here rather than left out
   * of the list. "Bila nafasi" is the row that matters most: somebody with a
   * membership and no role can sign in and do nothing.
   */
  readonly summary = computed(() => {
    const t = this.t();
    const rows = this.members();
    const byStatus = (status: UserStatus) => rows.filter((row) => row.status === status).length;

    return [
      { label: t.railMembersAll, value: String(rows.length) },
      { label: t.statusActive, value: String(byStatus('ACTIVE')) },
      { label: t.statusDisabled, value: String(byStatus('DISABLED')) },
      { label: t.railNoRole, value: String(rows.filter((row) => !row.role).length) },
    ];
  });

  /** Who holds what, biggest group first. A member with no role is counted by name. */
  readonly membersByRole = computed(() => {
    const t = this.t();
    const byRole = new Map<string, number>();
    for (const member of this.members()) {
      const role = member.role ?? t.noRole;
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
    }
    return [...byRole.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([role, count]) => ({ role, count: String(count) }));
  });

  /**
   * What the role picker can actually offer - and why it might offer less than
   * the Roles screen lists.
   *
   * `GET /api/roles` returns DISABLED roles too, and this screen filters them
   * out because the backend refuses to attach one to a membership. The gap
   * between the two numbers is therefore a real fact about the setup, not an
   * accident, so both are shown rather than only the usable one.
   */
  readonly roleSupply = computed(() => {
    const t = this.t();
    const all = this.allRoles().length;
    const usable = this.roles().length;

    return {
      rows: [
        { label: t.railRolesUsable, value: String(usable) },
        { label: t.railRolesDisabled, value: String(all - usable) },
      ],
      failed: this.rolesFailed(),
      // Distinguished from a failed read: an empty catalogue is a different
      // problem with a different fix, and each gets its own line.
      empty: !this.rolesFailed() && usable === 0,
    };
  });

  /**
   * Reloads whenever the applied farm changes.
   *
   * An effect rather than ngOnInit alone because ROOT switching farms is a new
   * list, not a new page: the people on screen belong to a farm the admin is
   * no longer working in. Reading activeFarmId() here is what subscribes this
   * to it.
   */
  private readonly load = effect(() => {
    // Both signals, deliberately. The SELECTION is what the admin just moved;
    // the APPLIED farm is what the backend agreed to, and it is the one that
    // goes into the request. Watching the selection as well means a pick the
    // backend does NOT apply - a farm deleted since the switcher listed it -
    // still re-reads instead of leaving the previous farm's people on screen
    // as though nothing had happened.
    this.farmSelection.selectedFarmId();
    this.activeFarmId();
    this.fetch();
  });

  ngOnInit(): void {
    this.loadRoles();
  }

  private fetch(): void {
    const farmId = this.activeFarmId();
    this.loadError.set(null);
    this.actionError.set(null);

    if (farmId === null) {
      // Not a failure: ROOT before it picks, or an admin not yet placed on a
      // farm. The template explains it instead of showing an empty table.
      this.members.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.usersService.listByFarm(farmId).subscribe({
      next: (members) => {
        this.members.set(members);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.members.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * The role picker's options.
   *
   * `GET /api/roles` needs `manage_users` - the very code that opens this
   * screen - so unlike the Approvals screen there is no permission branch
   * here: a caller who got this far can always ask. A failure only disables
   * the change-role form, which says so; it must not put an error over a
   * member list that loaded perfectly well.
   */
  private loadRoles(): void {
    this.rolesService.list().subscribe({
      next: (roles) => {
        this.allRoles.set(roles);
        this.rolesFailed.set(false);
      },
      error: () => this.rolesFailed.set(true),
    });
  }

  reload(): void {
    this.fetch();
    if (this.rolesFailed()) {
      this.loadRoles();
    }
  }

  statusLabel(status: UserStatus): string {
    const t = this.t();
    switch (status) {
      case 'ACTIVE':
        return t.statusActive;
      case 'PENDING_APPROVAL':
        return t.statusPending;
      case 'DISABLED':
        return t.statusDisabled;
      default:
        return status;
    }
  }

  // -------------------------------------------------------------- change role

  openRoleChange(member: UserSummary): void {
    this.roleError.set(null);
    this.actionError.set(null);
    this.roleTarget.set(member);
    // `UserSummary.role` is the role NAME; the endpoint wants its id. Matching
    // on the name is the only join available, and a miss simply leaves the
    // picker unset rather than preselecting the wrong role.
    const current = this.roles().find((role) => role.name === member.role) ?? null;
    this.form.reset({ roleId: current?.roleId ?? null });
  }

  closeRoleChange(): void {
    if (!this.savingRole()) {
      this.roleTarget.set(null);
    }
  }

  submitRoleChange(): void {
    const member = this.roleTarget();
    const farmId = this.activeFarmId();
    if (!member || farmId === null || this.savingRole()) {
      return;
    }

    this.roleError.set(null);
    const { roleId } = this.form.getRawValue();

    if (roleId === null) {
      this.roleError.set(this.t().errorRoleRequired);
      return;
    }
    // Not a backend rule - it would accept this happily. It is refused here
    // only because sending a request that changes nothing, then reporting
    // success, tells the admin something untrue about what just happened.
    if (this.roles().find((role) => role.roleId === roleId)?.name === member.role) {
      this.roleError.set(this.t().errorSameRole);
      return;
    }

    this.savingRole.set(true);
    this.usersService.changeRole(member.id, farmId, roleId).subscribe({
      next: () => {
        this.savingRole.set(false);
        this.roleTarget.set(null);
        this.toastMessage.set(this.t().roleChangedToast);
        // Re-read rather than patch the row: the answer carries no body, and
        // the backend is the authority on what the membership now says.
        this.fetch();
      },
      error: (err: unknown) => {
        this.savingRole.set(false);
        this.showRoleError(asApiError(err));
      },
    });
  }

  /**
   * A failed role change, put where the admin is looking.
   *
   * VALIDATION_ERROR and CONFLICT keep the backend's own sentence: it names
   * the actual problem ("Mtumiaji huyu hayupo kwenye shamba hili." - the list
   * was stale) far better than any generic line, and both stay inside the
   * modal where the choice was made. Anything else - FORBIDDEN above all -
   * goes through the shared errorCode copy, so "huna ruhusa" reads here
   * exactly as it does everywhere else in the app.
   */
  private showRoleError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.status === CONFLICT_STATUS) {
      this.roleError.set(error.message);
      return;
    }
    this.roleError.set(this.messageFor(error));
  }

  // ------------------------------------------------ edit somebody's details

  /** The member whose name/phone/email is being corrected. */
  readonly editTarget = signal<UserSummary | null>(null);
  readonly savingEdit = signal(false);
  readonly editError = signal<string | null>(null);
  readonly editNameError = signal<string | null>(null);
  readonly editPhoneError = signal<string | null>(null);

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', Validators.required],
    email: [''],
  });

  /**
   * Opens on the member's CURRENT details.
   *
   * `UserSummary` carries no email - the list endpoint does not send one - so
   * the field starts empty and saving an empty box clears whatever address
   * was on file. That is a real edge, and the form says so rather than
   * pretending to show what it cannot see.
   */
  openEdit(member: UserSummary): void {
    this.editError.set(null);
    this.editNameError.set(null);
    this.editPhoneError.set(null);
    this.actionError.set(null);
    this.editForm.reset({ name: member.name, phone: member.phone, email: '' });
    this.editTarget.set(member);
  }

  closeEdit(): void {
    if (!this.savingEdit()) {
      this.editTarget.set(null);
    }
  }

  submitEdit(): void {
    const member = this.editTarget();
    if (!member || this.savingEdit()) {
      return;
    }

    this.editError.set(null);
    this.editNameError.set(null);
    this.editPhoneError.set(null);

    const { name, phone, email } = this.editForm.getRawValue();
    const t = this.t();

    if (!name.trim()) {
      this.editNameError.set(t.errorNameRequired);
      return;
    }
    if (!phone.trim()) {
      this.editPhoneError.set(t.errorPhoneRequired);
      return;
    }

    this.savingEdit.set(true);
    this.usersService
      .update(member.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.savingEdit.set(false);
          this.editTarget.set(null);
          this.toastMessage.set(this.t().savedToast);
          this.fetch();
        },
        error: (err: unknown) => {
          this.savingEdit.set(false);
          this.showEditError(asApiError(err));
        },
      });
  }

  /**
   * A failed edit.
   *
   * CONFLICT is a phone or email already taken, and the backend's sentence
   * names which - so it goes on the phone field, where the more likely of the
   * two is fixed.
   */
  private showEditError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.status === CONFLICT_STATUS) {
      this.editPhoneError.set(error.message);
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.editError.set(error.message);
      return;
    }
    this.editError.set(this.messageFor(error));
  }

  // ---------------------------------------------------------- add a member

  openAdd(): void {
    this.addForm.reset({ name: '', phone: '', email: '', password: '', roleId: null });
    this.addError.set(null);
    this.addNameError.set(null);
    this.addPhoneError.set(null);
    this.addPasswordError.set(null);
    this.createdUserId.set(null);
    this.actionError.set(null);
    this.addMode.set('new');
    this.existingForm.reset({ phone: '', roleId: null });
    this.foundPerson.set(null);
    this.existingError.set(null);
    this.addOpen.set(true);
  }

  // ------------------------------------------- adding somebody who exists

  /**
   * New account, or an account that is already there.
   *
   * Before this there was only "new", and a person already on another farm
   * could not be put on this one at all: creating them again is refused as a
   * registered phone, and nothing else on the screen reached them.
   */
  readonly addMode = signal<'new' | 'existing'>('new');
  readonly foundPerson = signal<UserSummary | null>(null);
  readonly searching = signal(false);
  readonly existingError = signal<string | null>(null);

  readonly existingForm = this.formBuilder.nonNullable.group({
    phone: [''],
    roleId: this.formBuilder.control<number | null>(null),
  });

  setAddMode(mode: 'new' | 'existing'): void {
    if (!this.saving()) {
      this.addMode.set(mode);
      this.existingError.set(null);
      this.addError.set(null);
    }
  }

  /**
   * Finds the person. A new search forgets the previous find, so Save can
   * never act on somebody other than the number now in the box.
   */
  searchExisting(): void {
    if (this.searching()) {
      return;
    }
    const phone = this.existingForm.getRawValue().phone.trim();
    this.existingError.set(null);
    this.foundPerson.set(null);

    if (!phone) {
      this.existingError.set(this.t().errorPhoneRequired);
      return;
    }

    this.searching.set(true);
    this.usersService.lookupByPhone(phone).subscribe({
      next: (person) => {
        this.searching.set(false);
        this.foundPerson.set(person);
      },
      error: (err: unknown) => {
        this.searching.set(false);
        this.existingError.set(this.inlineMessage(asApiError(err)));
      },
    });
  }

  /**
   * Puts the found person on THIS farm - the only farm a farm-level admin
   * may place anyone on, and the one the screen is showing for everyone else.
   *
   * "Already here" is refused locally because it is knowable: their id is in
   * the list on screen. The backend would answer 409 anyway, and that answer
   * is still shown if the list was stale.
   */
  private submitExisting(): void {
    const farmId = this.activeFarmId();
    const person = this.foundPerson();
    const t = this.t();
    if (farmId === null || this.saving()) {
      return;
    }

    this.existingError.set(null);
    if (!person) {
      this.existingError.set(t.errorFindFirst);
      return;
    }
    if (this.members().some((member) => member.id === person.id)) {
      this.existingError.set(t.errorAlreadyHere);
      return;
    }
    const { roleId } = this.existingForm.getRawValue();
    if (roleId === null) {
      this.existingError.set(t.errorRoleRequired);
      return;
    }

    this.saving.set(true);
    this.usersService.assignMembership(person.id, { farmId, roleId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.addOpen.set(false);
        this.toastMessage.set(this.t().existingAddedToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.existingError.set(this.inlineMessage(asApiError(err)));
      },
    });
  }

  // ------------------------------------------------ the farms a person is on

  readonly farmsTarget = signal<UserSummary | null>(null);
  readonly memberships = signal<readonly MembershipView[]>([]);
  readonly membershipsLoading = signal(false);
  readonly membershipsFailed = signal(false);

  private readonly allFarms = signal<readonly Farm[]>([]);
  readonly farmsFailed = signal(false);
  readonly granting = signal(false);
  readonly grantError = signal<string | null>(null);

  readonly grantForm = this.formBuilder.group({
    farmId: this.formBuilder.control<number | null>(null),
    roleId: this.formBuilder.control<number | null>(null),
  });

  /**
   * Whether this admin may place people on ANY farm.
   *
   * The backend's two tiers (PermissionChecker.requireSameFarm) are decided by
   * `manage_farms`, and so is this - the one permission check on a screen that
   * otherwise leaves rules to the backend, because without it an admin of one
   * farm would be offered a picker of farms whose every entry ends in 403.
   */
  readonly canGrantAnyFarm = computed(() =>
    this.authService.permissions().includes(PERMISSION.MANAGE_FARMS),
  );

  /** Farms they are not on yet - the only ones worth offering. */
  readonly grantableFarms = computed(() => {
    const held = new Set(this.memberships().map((membership) => membership.farmId));
    return this.allFarms().filter((farm) => !held.has(farm.farmId));
  });

  openFarms(member: UserSummary): void {
    this.actionError.set(null);
    this.grantError.set(null);
    this.grantForm.reset({ farmId: null, roleId: null });
    this.farmsTarget.set(member);
    this.loadMemberships(member.id);

    // Fetched once, and only by someone who may use it: GET /api/farms is
    // manage_farms itself.
    if (this.canGrantAnyFarm() && (this.allFarms().length === 0 || this.farmsFailed())) {
      this.farmsService.list().subscribe({
        next: (farms) => {
          this.allFarms.set(farms);
          this.farmsFailed.set(false);
        },
        error: () => this.farmsFailed.set(true),
      });
    }
  }

  closeFarms(): void {
    if (!this.granting()) {
      this.farmsTarget.set(null);
    }
  }

  private loadMemberships(userId: string): void {
    this.membershipsLoading.set(true);
    this.membershipsFailed.set(false);
    this.usersService.listMemberships(userId).subscribe({
      next: (memberships) => {
        this.memberships.set(memberships);
        this.membershipsLoading.set(false);
      },
      error: () => {
        this.memberships.set([]);
        this.membershipsFailed.set(true);
        this.membershipsLoading.set(false);
      },
    });
  }

  submitGrant(): void {
    const member = this.farmsTarget();
    if (!member || this.granting()) {
      return;
    }
    const t = this.t();
    const { farmId, roleId } = this.grantForm.getRawValue();
    this.grantError.set(null);

    if (farmId === null) {
      this.grantError.set(t.errorFarmRequired);
      return;
    }
    if (roleId === null) {
      this.grantError.set(t.errorRoleRequired);
      return;
    }

    this.granting.set(true);
    this.usersService.assignMembership(member.id, { farmId, roleId }).subscribe({
      next: () => {
        this.granting.set(false);
        this.grantForm.reset({ farmId: null, roleId: null });
        this.toastMessage.set(this.t().grantedToast);
        // The modal stays open on the answer: the new farm appearing in the
        // list IS the confirmation, and a second farm may be next.
        this.loadMemberships(member.id);
      },
      error: (err: unknown) => {
        this.granting.set(false);
        this.grantError.set(this.inlineMessage(asApiError(err)));
      },
    });
  }

  /**
   * A refusal shown inside a modal. The backend's own sentence where it names
   * the problem better than shared copy could - an unknown number, a person
   * already on that farm, a disabled role - and the shared copy otherwise, so
   * FORBIDDEN reads here as it does everywhere else.
   */
  private inlineMessage(error: ApiError): string | null {
    if (error.sessionHandled) {
      return null;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.status === CONFLICT_STATUS) {
      return error.message;
    }
    return this.messageFor(error);
  }

  closeAdd(): void {
    if (!this.saving()) {
      this.addOpen.set(false);
    }
  }

  /**
   * Creates the person, then puts them on this farm.
   *
   * The role is REQUIRED here even though the backend would accept a
   * membership without one: somebody added to a farm with no role can sign in
   * and see nothing, which is not a state an admin means to create on this
   * screen - Approvals is where "approved but not yet placed" belongs.
   *
   * On a retry after a half-finished attempt, step one is skipped; see
   * createdUserId.
   */
  submitAdd(): void {
    if (this.addMode() === 'existing') {
      this.submitExisting();
      return;
    }
    const farmId = this.activeFarmId();
    if (farmId === null || this.saving()) {
      return;
    }

    this.addError.set(null);
    this.addNameError.set(null);
    this.addPhoneError.set(null);
    this.addPasswordError.set(null);

    const { name, phone, email, password, roleId } = this.addForm.getRawValue();
    const t = this.t();

    if (roleId === null) {
      this.addError.set(t.errorRoleRequired);
      return;
    }

    const existing = this.createdUserId();
    if (existing) {
      // The account is already there; only the membership is outstanding.
      this.saving.set(true);
      this.attachMembership(existing, farmId, roleId);
      return;
    }

    if (!name.trim()) {
      this.addNameError.set(t.errorNameRequired);
      return;
    }
    if (!phone.trim()) {
      this.addPhoneError.set(t.errorPhoneRequired);
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      this.addPasswordError.set(t.errorPasswordShort);
      return;
    }

    this.saving.set(true);
    this.usersService
      .create({
        name: name.trim(),
        phone: phone.trim(),
        // Absent rather than empty: the field is optional on the backend and
        // an empty string would be validated as a malformed address.
        email: email.trim() || undefined,
        password,
      })
      .subscribe({
        next: (user) => {
          this.createdUserId.set(user.id);
          this.attachMembership(user.id, farmId, roleId);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showAddError(asApiError(err));
        },
      });
  }

  private attachMembership(userId: string, farmId: number, roleId: number): void {
    this.usersService.assignMembership(userId, { farmId, roleId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.addOpen.set(false);
        this.createdUserId.set(null);
        this.toastMessage.set(this.t().createdToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        // The account survives this failure, so the modal stays open and says
        // what is left to do rather than reporting a clean failure.
        this.showAddError(asApiError(err));
      },
    });
  }

  /**
   * A failed add.
   *
   * CONFLICT is always a duplicate phone or email, and the backend's sentence
   * NAMES which of the two - more than any generic line could - so it is put
   * on the phone field where the fix is.
   */
  private showAddError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.status === CONFLICT_STATUS) {
      this.addPhoneError.set(error.message);
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.addError.set(error.message);
      return;
    }
    this.addError.set(this.messageFor(error));
  }

  // -------------------------------------------------- disable / enable account

  /**
   * Blocks or restores the ACCOUNT - across every farm, not just this one.
   *
   * No confirmation: it is reversible from the same menu entry, and nothing
   * is lost. Deleting, which is not reversible, asks.
   */
  toggleEnabled(member: UserSummary): void {
    if (this.togglingId() !== null) {
      return;
    }
    this.actionError.set(null);
    this.togglingId.set(member.id);

    const enable = member.status === 'DISABLED';
    this.usersService.setEnabled(member.id, enable).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.toastMessage.set(enable ? this.t().enabledToast : this.t().disabledToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.togglingId.set(null);
        this.showActionError(asApiError(err));
      },
    });
  }

  // ----------------------------------------------------------- delete account

  askDelete(member: UserSummary): void {
    this.actionError.set(null);
    this.deleteTarget.set(member);
  }

  cancelDelete(): void {
    if (!this.deleting()) {
      this.deleteTarget.set(null);
    }
  }

  confirmDelete(): void {
    const member = this.deleteTarget();
    if (!member || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.usersService.remove(member.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.toastMessage.set(this.t().deletedToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        // Closed on failure: the refusal ("a farm's owner cannot be deleted")
        // is a different statement from the question that was asked, and it
        // belongs in the banner where it can be read without a dialog over it.
        this.deleteTarget.set(null);
        this.showActionError(asApiError(err));
      },
    });
  }

  /**
   * A failed row action, put in the banner rather than a toast.
   *
   * Every refusal that reaches here is a RULE the admin has to read and act
   * on - the owner cannot be removed, the owner cannot be deleted - not a
   * blip to be flashed and forgotten. One helper for removing, deleting and
   * switching an account, because the banner treats them alike.
   *
   * The failure itself is stored, not the rendered line: the wording is
   * chosen on render by actionErrorMessage, so a banner that stands for a
   * while follows the language toggle.
   */
  private showActionError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    this.actionError.set(error);
  }

  // ------------------------------------------------------------------- remove

  askRemove(member: UserSummary): void {
    this.actionError.set(null);
    this.removeTarget.set(member);
  }

  cancelRemove(): void {
    if (!this.removing()) {
      this.removeTarget.set(null);
    }
  }

  confirmRemove(): void {
    const member = this.removeTarget();
    const farmId = this.activeFarmId();
    if (!member || farmId === null || this.removing()) {
      return;
    }

    this.removing.set(true);
    this.usersService.removeMembership(member.id, farmId).subscribe({
      next: () => {
        this.removing.set(false);
        this.removeTarget.set(null);
        this.toastMessage.set(this.t().removedToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.removing.set(false);
        this.removeTarget.set(null);
        this.showActionError(asApiError(err));
      },
    });
  }

  dismissActionError(): void {
    this.actionError.set(null);
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
