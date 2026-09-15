import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { LanguageService } from '../core/services/language';
import { FeedService } from '../core/services/feed';
import { FeedPurchase, FeedType } from '../core/models/feed';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { ActionMenu } from '../shared/ui/action-menu/action-menu';
import { Button } from '../shared/ui/button/button';
import { ConfirmDialog } from '../shared/ui/confirm-dialog/confirm-dialog';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { DatePickerCard, isoDate } from '../shared/ui/date-picker-card/date-picker-card';
import { FormField } from '../shared/ui/form-field/form-field';
import { Modal } from '../shared/ui/modal/modal';
import { Toast } from '../shared/ui/toast/toast';
import { FEED_PURCHASES_I18N } from './feed-purchases.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/**
 * Feed Purchases - what the farm bought, and the only screen that puts kilos
 * INTO the store.
 *
 * IT IS THE OTHER HALF OF FEEDING. The Feeding screen takes stock out, this
 * one puts it in, and both are read back by the same per-type balance. One
 * `recordFeedPurchase` writes the purchase and an IN movement in a single
 * backend transaction, so nothing here has to update a balance by hand - and
 * nothing here should try.
 *
 * PRICES ARE MASKED BY THE SERVER, NOT BY THIS SCREEN, and that distinction
 * decides how the table is written. `feedPurchases` returns `unitCost` and
 * `totalCost` as null to a caller without `view_feed_cost` (V18), keeping
 * date, type, quantity and supplier intact. So there is NO permission check
 * anywhere below: the screen renders what arrived, and a null price becomes
 * an em-dash. Re-deriving the gate here would be worse than redundant - a
 * column hidden by the client still received the number, where DevTools or a
 * direct /graphql call would find it, which is precisely the leak the backend
 * closed by masking at the source.
 *
 * A NULL PRICE IS NOT A ZERO PRICE. `0` would be a claim about the purchase,
 * `NaN` would be a bug on screen, and an empty cell would read as "nobody
 * entered it". The dash says only what is true: this reader was not shown it.
 *
 * THE DROPDOWN IS THE GLOBAL CATALOGUE, not the cycle-filtered list the
 * Feeding screen uses. Buying is not feeding: a farm stocks up on feed for
 * fish that are not in the ponds yet, so age filtering would be wrong here.
 * An empty catalogue is therefore a real dead end, and the screen says so and
 * points at the catalogue rather than growing a second way to create types.
 *
 * NOTHING HERE IS EDITED OR DELETED IN PLACE, and that follows from the
 * ledger rather than from taste. A purchase already wrote kilos into
 * `feed_stock_movements`; changing its quantity without touching the ledger
 * would make the farm's stock balance silently wrong, and deleting the row
 * would either strand those kilos or move the balance with no record of why.
 * So the two row actions are CORRECTING ENTRIES:
 *
 *  - REVERSE writes an OUT movement for the same kilos. The balance returns
 *    to where it was, and the purchase stays in the list flagged `reversed` -
 *    the history says it happened and was then cancelled, which is more
 *    honest than it never appearing.
 *  - CORRECT is reverse-and-record-anew, and it is ONE backend mutation on
 *    purpose. Two calls from here could leave the farm having lost the kilos
 *    with no purchase to restore them, if the second failed.
 *
 * A reversed row offers neither: doing it twice would take the kilos out
 * twice, which is what PURCHASE_ALREADY_REVERSED exists to refuse.
 *
 * ONE PERMISSION, AND IT IS THE ROUTE'S. `recordFeedPurchase` is
 * `manage_feed_stock`, and so is the `feedTypes` catalogue read that fills
 * the dropdown - so a caller who reaches this screen can use all of it. (The
 * purchase LIST is only `view_dashboard`, a looser gate; the route takes the
 * stricter of the two, because a screen whose dropdown and form would both
 * fail is not worth showing.)
 */
@Component({
  selector: 'app-feed-purchases',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ActionMenu,
    Button,
    ConfirmDialog,
    DataTable,
    EmptyState,
    DatePickerCard,
    FormField,
    Modal,
    Toast,
  ],
  templateUrl: './feed-purchases.html',
  styleUrl: './feed-purchases.scss',
})
export class FeedPurchases implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => FEED_PURCHASES_I18N[this.languageService.lang()]);

  private readonly feedService = inject(FeedService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly purchases = signal<readonly FeedPurchase[]>([]);
  readonly feedTypes = signal<readonly FeedType[]>([]);
  private readonly datePicker = viewChild(DatePickerCard);

  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /**
   * The purchase being corrected, or null while the record form owns the
   * controls.
   *
   * ONE FORM SERVES BOTH, as on the Feed Catalogue: recording and correcting
   * ask for exactly the same five things, and only one of them is ever open -
   * correcting happens in a modal. Sharing the controls means one set of
   * validation rules that cannot drift apart.
   */
  // ── The summary rail ───────────────────────────────────────────────────
  //
  // Counted from `purchases()`, already on the page, so the rail - date picker
  // included - costs no request. A purchase carries its own `purchaseDate`,
  // which is what makes "what was bought on the 7th" a filter.

  readonly selectedDate = signal(isoDate(new Date()));
  readonly viewingToday = computed(() => this.selectedDate() === isoDate(new Date()));

  readonly dayState = computed<string | null>(() =>
    this.viewingToday() ? null : `${this.t().dayViewing} ${this.selectedDate()}.`,
  );

  readonly purchasesOnDate = computed(() =>
    this.purchases().filter((purchase) => purchase.purchaseDate === this.selectedDate()),
  );

  readonly summary = computed(() => {
    const t = this.t();
    const all = this.purchases();
    const onDate = this.purchasesOnDate();
    const kg = (rows: readonly FeedPurchase[]) =>
      rows.reduce((sum, row) => sum + row.quantityKg, 0).toFixed(1);

    return [
      { label: t.railPurchasesAll, value: String(all.length) },
      { label: t.railPurchasesOnDate, value: String(onDate.length) },
      { label: t.railKgOnDate, value: kg(onDate) },
      { label: t.railKgAll, value: kg(all) },
    ];
  });

  /**
   * What the feed cost - and it is NULL-AWARE rather than permission-aware.
   *
   * The backend sends `totalCost: null` to a caller without `view_feed_cost`
   * (V18), so the honest total is the sum of the rows that HAVE a number. A
   * reader without the code therefore gets a dash here, from the same nulls
   * the table dashes out - the screen never has to ask what the caller may
   * see, because the answer is already in the data.
   */
  readonly spend = computed(() => {
    const t = this.t();
    const rows = this.purchases();
    const priced = rows.filter((row) => row.totalCost !== null);
    if (priced.length === 0) {
      return { all: t.costHidden, onDate: t.costHidden };
    }
    const sum = (subset: readonly FeedPurchase[]) =>
      subset
        .filter((row) => row.totalCost !== null)
        .reduce((total, row) => total + (row.totalCost ?? 0), 0)
        .toFixed(2);

    return { all: sum(rows), onDate: sum(this.purchasesOnDate()) };
  });

  selectDate(date: Date): void {
    this.selectedDate.set(isoDate(date));
  }

  backToToday(): void {
    this.selectedDate.set(isoDate(new Date()));
    this.datePicker()?.resetWeek();
  }

  readonly editTarget = signal<FeedPurchase | null>(null);

  /**
   * A refused row action, kept on screen rather than flashed.
   *
   * PURCHASE_ALREADY_REVERSED is the case that matters: it is not a retryable
   * failure, it is the answer that this row is already done with. The FAILURE
   * is stored rather than the rendered line, so the banner re-renders in
   * whichever language is showing.
   */
  readonly actionError = signal<ApiError | null>(null);

  readonly actionErrorMessage = computed(() => {
    const error = this.actionError();
    if (!error) {
      return null;
    }
    // The backend's own sentence for both of these: it says which rule was
    // broken, and for an already-reversed purchase it says the thing the
    // user needs to hear - that retrying cannot help.
    if (
      error.errorCode === ERROR_CODE.PURCHASE_ALREADY_REVERSED ||
      error.errorCode === ERROR_CODE.VALIDATION_ERROR
    ) {
      return error.message;
    }
    return this.messageFor(error);
  });

  readonly reverseTarget = signal<FeedPurchase | null>(null);
  readonly reversing = signal(false);

  /**
   * The purchase just recorded, kept so its total can be shown back.
   *
   * IT COMES FROM THE MUTATION, not from the list, and that is what makes it
   * trustworthy: the mutation's answer is NOT masked - the backend's own note
   * says `view_feed_cost` does not enter into `recordFeedPurchase`, because
   * the buyer is the person who just typed the price. Reading the total off
   * the refreshed list instead would show a dash to a buyer who lacks
   * `view_feed_cost`, hiding their own arithmetic from them.
   */
  readonly lastPurchase = signal<FeedPurchase | null>(null);

  /**
   * The catalogue is empty, so there is nothing to buy.
   *
   * Distinguished from `loading` deliberately: an empty dropdown mid-load is
   * not a dead end, and showing the "register a type first" panel while the
   * answer is still in flight would send people to another screen for no
   * reason.
   */
  readonly noFeedTypes = computed(() => !this.loading() && this.feedTypes().length === 0);

  readonly form = this.formBuilder.nonNullable.group({
    feedTypeId: [''],
    quantityKg: [''],
    unitCost: [''],
    supplier: [''],
    purchaseDate: [todayIso()],
  });

  readonly columns = computed<DataTableColumn<FeedPurchase>[]>(() => {
    const t = this.t();
    return [
      { label: t.colDate, value: (row) => row.purchaseDate },
      { label: t.colFeedType, value: (row) => row.feedType.name },
      { label: t.colQuantity, value: (row) => formatNumber(row.quantityKg) },
      // The two masked columns. `muted` dims the dash so a withheld price
      // reads as absent rather than as a value of its own.
      {
        label: t.colUnitCost,
        value: (row) => this.cost(row.unitCost),
        muted: (row) => row.unitCost === null,
      },
      {
        label: t.colTotalCost,
        value: (row) => this.cost(row.totalCost),
        muted: (row) => row.totalCost === null,
      },
      {
        label: t.colSupplier,
        value: (row) => row.supplier ?? t.noSupplier,
        muted: (row) => !row.supplier,
      },
      {
        label: t.colStatus,
        value: (row) => (row.reversed ? t.statusReversed : t.statusActive),
        // Dimmed when reversed: the row is still real history, its kilos
        // simply are not in the store any more.
        muted: (row) => row.reversed,
      },
    ];
  });

  readonly purchaseKey = (row: FeedPurchase): string => row.purchaseId;

  ngOnInit(): void {
    this.fetch();
  }

  /**
   * The list and the catalogue together.
   *
   * `forkJoin` because the screen has one loading state and one error panel:
   * a table rendered while the dropdown is still deciding whether it has any
   * options would invite a press on a control that is about to change.
   *
   * The catalogue is asked for ACTIVE types only - the default. A retired
   * type is one the farm has stopped using, and offering it on a buying form
   * would be the catalogue's decision being ignored at the till.
   */
  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    forkJoin({
      purchases: this.feedService.feedPurchases(),
      feedTypes: this.feedService.feedTypes(true),
    }).subscribe({
      next: ({ purchases, feedTypes }) => {
        this.purchases.set(purchases);
        this.feedTypes.set(feedTypes);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.purchases.set([]);
        this.feedTypes.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /** A price as text - or the em-dash when the server withheld it. */
  cost(value: number | null): string {
    return value === null ? this.t().costHidden : formatNumber(value);
  }

  /** Quantity for the confirmation line, formatted the same way the table is. */
  quantity(value: number): string {
    return formatNumber(value);
  }

  goToFeedCatalog(): void {
    void this.router.navigateByUrl('/feed-catalog');
  }

  /**
   * Records the purchase.
   *
   * Four client-side rules, and every one is about the FORM being incomplete
   * rather than about the purchase being wrong: a type must be chosen, a
   * quantity and a price must each be a number above zero, and a date must be
   * present. Nothing here second-guesses the price - an expensive sack is an
   * expensive sack, and the backend owns the rest.
   *
   * `totalCost` IS NOT SENT and could not be: the database generates it. The
   * screen only shows it back afterwards.
   */
  submit(): void {
    if (this.saving() || this.noFeedTypes()) {
      return;
    }

    this.formError.set(null);
    const raw = this.form.getRawValue();
    const t = this.t();

    if (!raw.feedTypeId) {
      this.formError.set(t.errorFeedTypeRequired);
      return;
    }

    const quantityKg = numberOrNull(raw.quantityKg);
    if (quantityKg === null) {
      this.formError.set(t.errorQuantityRequired);
      return;
    }
    if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
      this.formError.set(t.errorQuantityPositive);
      return;
    }

    const unitCost = numberOrNull(raw.unitCost);
    if (unitCost === null) {
      this.formError.set(t.errorUnitCostRequired);
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      this.formError.set(t.errorUnitCostPositive);
      return;
    }

    if (!raw.purchaseDate) {
      this.formError.set(t.errorDateRequired);
      return;
    }

    const input = {
      purchaseDate: raw.purchaseDate,
      // `Int!` on the input, `ID!` on the way back out - so the dropdown's
      // string value is converted here, exactly as the feeding mutation
      // converts its feedTypeId and the water-quality one its unitId.
      feedTypeId: Number(raw.feedTypeId),
      quantityKg,
      unitCost,
      // An empty box is NO supplier, not an empty one: the column is
      // nullable, and "" would print as a supplier whose name says nothing.
      supplier: String(raw.supplier ?? '').trim() || null,
    };

    // The ONE branch separating recording from correcting. Everything above
    // is identical for both - that is the point of sharing the form.
    const target = this.editTarget();

    this.saving.set(true);
    (target
      ? this.feedService.correctFeedPurchase(Number(target.purchaseId), input)
      : this.feedService.recordFeedPurchase(input)
    ).subscribe({
      next: (purchase) => {
        this.saving.set(false);
        this.editTarget.set(null);
        // The confirmation shows the NEW purchase either way - after a
        // correction that is the one now standing, and its total is the
        // number worth checking.
        this.lastPurchase.set(purchase);
        this.form.reset({
          feedTypeId: '',
          quantityKg: '',
          unitCost: '',
          supplier: '',
          // The date is kept: purchases are routinely entered in a batch
          // from one delivery note, and re-picking the same day each time
          // would be the form fighting the person filling it.
          purchaseDate: raw.purchaseDate,
        });
        this.toastMessage.set(target ? this.t().savedToast : this.t().savedRecordToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.showSubmitError(asApiError(err));
      },
    });
  }

  // ---------------------------------------------------------- correcting

  openEdit(purchase: FeedPurchase): void {
    if (purchase.reversed) {
      return;
    }
    this.formError.set(null);
    this.actionError.set(null);
    this.form.reset({
      feedTypeId: String(purchase.feedType.feedTypeId),
      // Written back as STRINGS, matching how the empty form starts. The
      // number inputs coerce them, and numberOrNull takes them either way.
      quantityKg: String(purchase.quantityKg),
      // A MASKED price cannot be pre-filled, because this reader was never
      // sent it. The box is left empty and the person retypes it, which is
      // honest - guessing 0 here would post a purchase worth nothing.
      unitCost: purchase.unitCost === null ? '' : String(purchase.unitCost),
      supplier: purchase.supplier ?? '',
      purchaseDate: purchase.purchaseDate,
    });
    this.editTarget.set(purchase);
  }

  closeEdit(): void {
    if (this.saving()) {
      return;
    }
    this.editTarget.set(null);
    this.form.reset({
      feedTypeId: '',
      quantityKg: '',
      unitCost: '',
      supplier: '',
      purchaseDate: todayIso(),
    });
    this.formError.set(null);
  }

  // ----------------------------------------------------------- reversing

  askReverse(purchase: FeedPurchase): void {
    if (purchase.reversed) {
      return;
    }
    this.actionError.set(null);
    this.reverseTarget.set(purchase);
  }

  cancelReverse(): void {
    if (!this.reversing()) {
      this.reverseTarget.set(null);
    }
  }

  confirmReverse(): void {
    const purchase = this.reverseTarget();
    if (!purchase || this.reversing()) {
      return;
    }

    this.reversing.set(true);
    this.feedService.reverseFeedPurchase(Number(purchase.purchaseId)).subscribe({
      next: () => {
        this.reversing.set(false);
        this.reverseTarget.set(null);
        this.toastMessage.set(this.t().reversedToast);
        // The balance moved, so the list is re-read rather than patched -
        // the backend is the authority on what the ledger now says.
        this.fetch();
      },
      error: (err: unknown) => {
        this.reversing.set(false);
        // The dialog closes even on failure: an already-reversed purchase is
        // not the same question asked again, it is a different answer, and
        // it belongs in the banner where it can be read.
        this.reverseTarget.set(null);
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

  dismissConfirmation(): void {
    this.lastPurchase.set(null);
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /**
   * A refused write.
   *
   * VALIDATION_ERROR keeps the backend's own sentence: it names which rule
   * was broken ("Kiasi cha chakula lazima kiwe zaidi ya sifuri", or an
   * unknown feed type), and that is more specific than anything generic here.
   * Everything else - FORBIDDEN above all - goes through the shared copy so
   * it reads as it does everywhere else in the app.
   */
  private showSubmitError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (
      error.errorCode === ERROR_CODE.VALIDATION_ERROR ||
      error.errorCode === ERROR_CODE.PURCHASE_ALREADY_REVERSED
    ) {
      this.formError.set(error.message);
      return;
    }
    this.formError.set(this.messageFor(error));
  }

  private messageFor(error: ApiError | null): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

/**
 * A number box's value, or null when it is empty.
 *
 * `input[type=number]` binds through Angular's NumberValueAccessor, which
 * writes a number - or null when the box is empty - whatever the form's type
 * says. The same helper the Feed Catalogue screen needs, for the same reason.
 */
function numberOrNull(raw: string | number | null): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const trimmed = (raw ?? '').trim();
  return trimmed ? Number(trimmed) : null;
}

/**
 * Digits with thousands separators, in the browser's locale.
 *
 * Used for quantities and for prices alike. It is NEVER handed a null - a
 * withheld price stops at `cost()` above, which returns the dash instead, so
 * no code path can turn a masked number into "0" or "NaN".
 */
function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Today as yyyy-MM-dd in the BROWSER'S timezone.
 *
 * `toISOString()` is deliberately not used: it converts to UTC first, so at
 * 02:00 in Dar es Salaam (UTC+3) it returns yesterday - and the default date
 * on a form filled in before dawn would be silently wrong. Same reasoning as
 * the Feeding screen's copy of this.
 */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
