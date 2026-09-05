import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LanguageService } from '../core/services/language';
import { FeedService } from '../core/services/feed';
import { FeedType } from '../core/models/feed';
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
import { FEED_CATALOG_I18N } from './feed-catalog.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/**
 * `feed_types.name` is `VARCHAR(80) NOT NULL UNIQUE` (V16). Checked here as
 * well, because the two ways past that column produce the SAME failure on the
 * wire - both a duplicate and an over-long name come back as a database
 * integrity violation with the generic CONFLICT code - so a name that is
 * merely too long would otherwise be reported as one that is already taken.
 */
const NAME_MAX_LENGTH = 80;

/**
 * The feed catalogue - what may be fed at all, before any farm decides what to
 * feed today.
 *
 * IT IS THE SCREEN BEHIND THE FEEDING SCREEN'S DEAD END. When a cycle's fish
 * are older than every feed in the store, Feeding can do nothing except say
 * so; the answer is a new entry here, and this is where it is made.
 *
 * A SYSTEM CATALOGUE, NOT A FARM'S. `createFeedType` and `feedTypes` take no
 * farm and `feed_types` has no farm column, so a type registered here appears
 * on every farm at once - the same rule as Species. The X-Farm-Id header the
 * interceptor adds is simply irrelevant to both calls, which is why nothing on
 * this screen reads the farm selection or reloads when it changes.
 *
 * ONE PERMISSION, AND IT IS THE ROUTE'S. Both endpoints are
 * `manage_feed_stock` on the backend (FeedService requires it on the list as
 * well as the create), so unlike Feeding - three permissions on one screen -
 * there is no partial version of this to gate control by control. The route
 * guard is the whole gate, and every control below it is unconditional.
 *
 * THE AGE WINDOW IS WHAT IS BEING WRITTEN. A name is a label; the window is
 * the decision. It is what `FeedService.classify` compares a cycle's age
 * against to call a feed EXACT or SAFE_LOWER, and an inverted window would
 * make a type that fits no fish of any age - which is why the backend refuses
 * it outright rather than at the point of use, and why the form refuses it
 * before spending a round trip on it.
 *
 * DISABLE AND DELETE ARE DIFFERENT ACTIONS, and the screen keeps them apart
 * for a reason that is not stylistic:
 *
 *  - DISABLE is the intended way to retire a feed, and V16 says so outright.
 *    The type stays in the catalogue, every past purchase and feeding still
 *    reads it, and all it loses is its place in `feedTypesForCycle` - so
 *    nobody can pick it for a NEW feeding. Reversible, so no confirmation.
 *  - DELETE is refused outright while anything points at the type
 *    (FEED_TYPE_IN_USE), because the backend's delete is SOFT and
 *    `FeedingLog.feedType` is `FeedType!`: hiding a referenced type does not
 *    hide one row, it makes the whole feeding history fail to load. So delete
 *    is for a type registered by mistake, and its question says so.
 *
 * The status column is real for the same reason - `feedTypes(activeOnly:
 * false)` is what is asked for, so a disabled type is shown as disabled
 * rather than vanishing from the catalogue an admin is auditing.
 */
@Component({
  selector: 'app-feed-catalog',
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
  templateUrl: './feed-catalog.html',
  styleUrl: './feed-catalog.scss',
})
export class FeedCatalog implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => FEED_CATALOG_I18N[this.languageService.lang()]);

  private readonly feedService = inject(FeedService);
  private readonly formBuilder = inject(FormBuilder);

  readonly feedTypes = signal<readonly FeedType[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly saving = signal(false);
  /** A failure that belongs to the whole form - a refused request, not a field. */
  readonly formError = signal<string | null>(null);
  readonly nameError = signal<string | null>(null);
  readonly ageError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /**
   * The type being edited, or null while the register form owns the controls.
   *
   * ONE FORM SERVES BOTH. Registering and editing ask for the same three
   * things, and neither can be open while the other is - the edit lives in a
   * modal - so sharing the controls means one set of validation rules and no
   * way for the two to drift apart. This signal is what `submit()` reads to
   * decide which mutation it is sending.
   */
  readonly editTarget = signal<FeedType | null>(null);

  /**
   * A refused ACTION, kept on screen rather than flashed.
   *
   * It carries the delete refusal, which is a sentence the admin has to read
   * and act on ("used in 4 records - disable it instead"), not a blip. The
   * FAILURE is stored rather than the rendered line, so the banner re-renders
   * in whichever language is showing.
   */
  readonly actionError = signal<ApiError | null>(null);

  /**
   * The banner's line.
   *
   * FEED_TYPE_IN_USE keeps the backend's own sentence, and this is the one
   * place on the screen where that matters most: it BREAKS DOWN the count by
   * kind ("ulishaji 3, manunuzi 1, leja 4"), which is the only thing that
   * tells an admin whether the type is genuinely in service or was used once
   * by accident. No generic line could carry it.
   */
  readonly actionErrorMessage = computed(() => {
    const error = this.actionError();
    if (!error) {
      return null;
    }
    if (error.errorCode === ERROR_CODE.FEED_TYPE_IN_USE) {
      return error.message;
    }
    return this.messageFor(error);
  });

  readonly deleteTarget = signal<FeedType | null>(null);
  readonly deleting = signal(false);

  /** The type whose on/off switch is mid-flight, so only its row is busy. */
  readonly togglingId = signal<string | null>(null);

  /**
   * The ages are left as text controls rather than declared `number`.
   *
   * `input[type=number]` binds through Angular's NumberValueAccessor, which
   * writes a number - or null for an empty box - whatever this declares, so
   * the declared type is not what arrives. Everything below reads them
   * through `parseAge`, which takes the value as it really comes.
   */
  readonly form = this.formBuilder.nonNullable.group({
    name: [''],
    minAgeMonths: [''],
    maxAgeMonths: [''],
  });

  readonly columns = computed<DataTableColumn<FeedType>[]>(() => {
    const t = this.t();
    return [
      { label: t.colName, value: (type) => type.name },
      { label: t.colAgeWindow, value: (type) => this.ageWindow(type) },
      {
        label: t.colStatus,
        value: (type) => (type.active ? t.statusActive : t.statusInactive),
        // Dimmed when retired: the row is still real - old feedings point at
        // it - it just is not offered to anyone any more.
        muted: (type) => !type.active,
      },
    ];
  });

  readonly feedTypeKey = (type: FeedType): string => type.feedTypeId;

  /** Exposed so the input's own `maxlength` and the check below stay one number. */
  readonly nameMaxLength = NAME_MAX_LENGTH;

  ngOnInit(): void {
    this.fetch();
  }

  /**
   * The WHOLE catalogue, retired entries included - see the note on the class.
   * `activeOnly: false` is the argument that asks for that; omitting it would
   * return active types only and leave the status column saying one thing.
   */
  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.feedService.feedTypes(false).subscribe({
      next: (types) => {
        this.feedTypes.set(types);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.feedTypes.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /** "miezi 0-3" - both ends inclusive, which is the schema's convention. */
  ageWindow(type: FeedType): string {
    return `${this.t().ageWindowUnit} ${type.minAgeMonths}-${type.maxAgeMonths}`;
  }

  /**
   * Registers a type.
   *
   * Every client-side rule here is the backend's own rule restated, not one
   * invented for the form: a blank name, an age below zero and an inverted
   * window are the three things `FeedService.createFeedType` refuses. Checking
   * them here is only about saying which one is wrong immediately, on the
   * field it belongs to, instead of after a round trip.
   *
   * WHOLE MONTHS is the one rule with no backend counterpart, and it needs
   * none: `minAgeMonths` is `Int!`, so 2.5 is not a value the mutation could
   * carry. Refusing it here names it as a fraction rather than letting GraphQL
   * refuse the variable with a message about the schema.
   */
  submit(): void {
    if (this.saving()) {
      return;
    }

    this.formError.set(null);
    this.nameError.set(null);
    this.ageError.set(null);

    const raw = this.form.getRawValue();
    const t = this.t();

    const name = String(raw.name ?? '').trim();
    if (!name) {
      this.nameError.set(t.errorNameRequired);
      return;
    }
    if (name.length > NAME_MAX_LENGTH) {
      this.nameError.set(t.errorNameTooLong);
      return;
    }

    const minAgeMonths = parseAge(raw.minAgeMonths);
    const maxAgeMonths = parseAge(raw.maxAgeMonths);

    if (minAgeMonths === null || maxAgeMonths === null) {
      this.ageError.set(t.errorAgeRequired);
      return;
    }
    if (!Number.isInteger(minAgeMonths) || !Number.isInteger(maxAgeMonths)) {
      this.ageError.set(t.errorAgeInteger);
      return;
    }
    if (minAgeMonths < 0 || maxAgeMonths < 0) {
      this.ageError.set(t.errorAgeNegative);
      return;
    }
    // The rule the whole catalogue rests on: a window whose top is below its
    // bottom fits no fish of any age, so it would sit in the list being
    // offered to nobody.
    if (maxAgeMonths < minAgeMonths) {
      this.ageError.set(t.errorMaxBelowMin);
      return;
    }

    // The ONE branch that separates registering from editing. Everything
    // above this line is identical for both, which is the point of sharing
    // the form: the rules cannot drift apart.
    const target = this.editTarget();
    const request = target
      ? this.feedService.updateFeedType({
          feedTypeId: Number(target.feedTypeId),
          name,
          minAgeMonths,
          maxAgeMonths,
        })
      : this.feedService.createFeedType({ name, minAgeMonths, maxAgeMonths });

    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editTarget.set(null);
        this.form.reset({ name: '', minAgeMonths: '', maxAgeMonths: '' });
        this.toastMessage.set(target ? this.t().savedToast : this.t().createdToast);
        // Re-read rather than push the returned type onto the list: the
        // backend is the authority on what the catalogue now holds, and the
        // answer is one cheap call away.
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.showSubmitError(asApiError(err));
      },
    });
  }

  // ------------------------------------------------------------ edit

  openEdit(type: FeedType): void {
    this.formError.set(null);
    this.nameError.set(null);
    this.ageError.set(null);
    this.actionError.set(null);
    this.form.reset({
      name: type.name,
      // Written back as STRINGS, matching how the empty form starts. The
      // number input coerces them on the way to the control, and parseAge
      // takes them either way.
      minAgeMonths: String(type.minAgeMonths),
      maxAgeMonths: String(type.maxAgeMonths),
    });
    this.editTarget.set(type);
  }

  closeEdit(): void {
    if (this.saving()) {
      return;
    }
    this.editTarget.set(null);
    this.form.reset({ name: '', minAgeMonths: '', maxAgeMonths: '' });
    this.formError.set(null);
    this.nameError.set(null);
    this.ageError.set(null);
  }

  // -------------------------------------------------- disable / enable

  /**
   * Flips a type on or off. No confirmation, deliberately: nothing is lost
   * either way, every past record still reads it, and the same menu item puts
   * it straight back.
   */
  toggleActive(type: FeedType): void {
    if (this.togglingId() !== null) {
      return;
    }
    this.actionError.set(null);
    this.togglingId.set(type.feedTypeId);

    this.feedService.setFeedTypeActive(Number(type.feedTypeId), !type.active).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.toastMessage.set(type.active ? this.t().deactivatedToast : this.t().activatedToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.togglingId.set(null);
        this.showActionError(asApiError(err));
      },
    });
  }

  isToggling(type: FeedType): boolean {
    return this.togglingId() === type.feedTypeId;
  }

  // -------------------------------------------------------------- delete

  askDelete(type: FeedType): void {
    this.actionError.set(null);
    this.deleteTarget.set(type);
  }

  cancelDelete(): void {
    if (!this.deleting()) {
      this.deleteTarget.set(null);
    }
  }

  confirmDelete(): void {
    const type = this.deleteTarget();
    if (!type || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.feedService.deleteFeedType(Number(type.feedTypeId)).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.toastMessage.set(this.t().deletedToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        // The dialog closes even on failure: the refusal is not a retry of
        // the same question, it is a different one ("disable it instead"),
        // and it belongs in the banner where it can be read without a modal
        // in the way.
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

  /**
   * A refused create, put on the field it belongs to.
   *
   * CONFLICT IS ALWAYS THE NAME. It is the only unique column on the table,
   * and it reaches us as a database integrity violation carrying the generic
   * "this clashes with existing data" - a sentence that never mentions which
   * field clashed. So the screen supplies its own line, which also means it
   * reads in the UI language like every other field error.
   *
   * VALIDATION_ERROR keeps the BACKEND'S sentence, for the opposite reason: it
   * names both numbers ("Umri wa juu (3) hauwezi kuwa chini ya umri wa chini
   * (5).") and is more specific than anything generic written here. The form
   * has usually caught this case already; this is the path for when it has
   * not.
   */
  private showSubmitError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.errorCode === ERROR_CODE.CONFLICT) {
      this.nameError.set(this.t().errorNameTaken);
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.ageError.set(error.message);
      return;
    }
    this.formError.set(this.messageFor(error));
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

/**
 * An age box's value as a number, or null when it is empty.
 *
 * It takes `unknown` because the value genuinely is: `input[type=number]`
 * hands over a number (or null), a test driving the control directly hands
 * over a string, and the form's declared type says string for both. Anything
 * that is not a number and not a non-blank numeric string is null, which the
 * caller reports as "fill both boxes".
 */
function parseAge(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
