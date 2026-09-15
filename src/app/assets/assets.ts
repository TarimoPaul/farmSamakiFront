import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { LanguageService } from '../core/services/language';
import { AuthService } from '../core/services/auth';
import { AssetsService } from '../core/services/assets';
import { Asset, AssetCategory, AssetFarm } from '../core/models/asset';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { Button } from '../shared/ui/button/button';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Toast } from '../shared/ui/toast/toast';
import { DatePickerCard, isoDate } from '../shared/ui/date-picker-card/date-picker-card';
import { ASSETS_I18N } from './assets.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/** `assets.name` VARCHAR(150), `size_label` VARCHAR(80), category name VARCHAR(80) (V21). */
const NAME_MAX_LENGTH = 150;
const SIZE_LABEL_MAX_LENGTH = 80;
const CATEGORY_NAME_MAX_LENGTH = 80;

/**
 * The zone the backend judges "in the future" in (AssetService uses the
 * reminder zone, Africa/Nairobi) - so the default date and the client-side
 * future check mean the same day the server does, whatever the laptop's zone.
 */
const FARM_TIME_ZONE = 'Africa/Nairobi';

/** One farm's slice of the register. */
export interface FarmGroup {
  farmId: string;
  farmName: string;
  assets: readonly Asset[];
  /** Whole cents, so a sum of NUMERIC(14,2) values never drifts. */
  totalCents: number;
}

/**
 * The asset register - everything the company owns, and on which farm.
 *
 * COMPANY-WIDE, AND THAT IS THE WHOLE DIFFERENCE from every other farm-side
 * screen. `assets` answers for all the caller's farms at once, so nothing
 * here reads the farm selection or reloads when it changes; the rows are
 * grouped by the `farm` each one carries instead.
 *
 * TOTALS ARE OURS. There is no aggregation endpoint, deliberately, so the
 * per-farm and company totals are summed here - in whole cents, because
 * `cost` is NUMERIC(14,2) and floating-point sums of two-decimal values drift.
 * An empty register sums to nothing and renders no total at all, so there is
 * no path to a NaN on screen.
 *
 * ONE PERMISSION, AND IT IS THE ROUTE'S. Every endpoint here but `myFarms`
 * (login-only) is `manage_assets`, the read included, so the guard is the
 * whole gate.
 *
 * WHERE THE FARM SELECT COMES FROM. `myFarms`, and nothing else: the caller's
 * own farms (owned or a member of), whether or not they hold any assets yet -
 * so the first asset of a farm can be registered. Not `/api/farms`, which is
 * `manage_farms` and lists every farm in the company. An empty `myFarms` is a
 * caller with no farm, and gets the no-farm guidance instead of the form.
 */
@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    Button,
    DataTable,
    DatePickerCard,
    EmptyState,
    FormField,
    Toast,
  ],
  templateUrl: './assets.html',
  styleUrl: './assets.scss',
})
export class Assets implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => ASSETS_I18N[this.languageService.lang()]);

  private readonly assetsService = inject(AssetsService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  /** Today in the farm's day, read once when the screen opens. */
  readonly today = farmToday();

  readonly assets = signal<readonly Asset[]>([]);
  readonly categories = signal<readonly AssetCategory[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly nameError = signal<string | null>(null);
  readonly farmError = signal<string | null>(null);
  readonly categoryError = signal<string | null>(null);
  readonly costError = signal<string | null>(null);
  readonly dateError = signal<string | null>(null);
  readonly sizeError = signal<string | null>(null);

  readonly savingCategory = signal(false);
  readonly categoryNameError = signal<string | null>(null);

  readonly toastMessage = signal<string | null>(null);

  /** ROOT picks its farm in the shell's switcher; the no-farm guidance says so. */
  readonly canSelectFarm = this.authService.canSelectFarm;
  private readonly currentFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  /**
   * The ids are text controls: select values are strings, and `cost` is a
   * number box whose accessor writes a number (or null) whatever this
   * declares. Everything below reads them as they really arrive.
   */
  readonly form = this.formBuilder.nonNullable.group({
    name: [''],
    farmId: [''],
    assetCategoryId: [''],
    cost: [''],
    acquiredDate: [this.today],
    sizeLabel: [''],
  });

  readonly categoryForm = this.formBuilder.nonNullable.group({
    name: [''],
  });

  /**
   * The register, one group per farm, farms in name order. Within a farm the
   * rows keep the backend's order - newest acquisition first.
   */
  readonly groups = computed<readonly FarmGroup[]>(() => {
    const byFarm = new Map<string, { farmName: string; assets: Asset[]; totalCents: number }>();
    for (const asset of this.assets()) {
      const key = asset.farm.farmId;
      let group = byFarm.get(key);
      if (!group) {
        group = { farmName: asset.farm.name, assets: [], totalCents: 0 };
        byFarm.set(key, group);
      }
      group.assets.push(asset);
      group.totalCents += toCents(asset.cost);
    }
    return [...byFarm.entries()]
      .map(([farmId, group]) => ({ farmId, ...group }))
      .sort((a, b) => a.farmName.localeCompare(b.farmName));
  });

  readonly grandTotalCents = computed(() =>
    this.groups().reduce((sum, group) => sum + group.totalCents, 0),
  );

  /** `myFarms`, in the backend's order. See "WHERE THE FARM SELECT COMES FROM". */
  readonly farmOptions = signal<readonly AssetFarm[]>([]);

  readonly noFarms = computed(() => this.farmOptions().length === 0);
  readonly noCategories = computed(() => this.categories().length === 0);

  readonly emptyMessage = computed(() =>
    this.noCategories() ? this.t().emptyMessageNoCategories : this.t().emptyMessage,
  );

  readonly columns = computed<DataTableColumn<Asset>[]>(() => {
    const t = this.t();
    return [
      { label: t.colName, value: (asset) => asset.name },
      { label: t.colCategory, value: (asset) => asset.assetCategory.name },
      { label: t.colCost, value: (asset) => this.money(toCents(asset.cost)) },
      {
        label: t.colSize,
        value: (asset) => asset.sizeLabel ?? t.noSize,
        muted: (asset) => !asset.sizeLabel,
      },
      { label: t.colAcquired, value: (asset) => asset.acquiredDate },
    ];
  });

  readonly assetKey = (asset: Asset): string => asset.assetId;

  // ── The summary rail ───────────────────────────────────────────────────
  //
  // Counted from `assets()`, already on the page, so the rail - date picker
  // included - costs no request. An asset carries its own `acquiredDate`,
  // which is what makes "what was bought on the 7th" a filter rather than a
  // second query.

  private readonly datePicker = viewChild(DatePickerCard);

  /**
   * The date the rail is answering for.
   *
   * Starts on the FARM'S today, not the laptop's, because that is the day the
   * register is written in: `acquiredDate` is compared against it by both this
   * screen and AssetService. The strip below marks the browser's today, so in
   * the hour the two zones disagree the highlight and the selection sit on
   * different cells - which is honest, since the register's day is the farm's.
   */
  readonly selectedDate = signal(this.today);
  readonly viewingToday = computed(() => this.selectedDate() === this.today);

  readonly dayState = computed<string | null>(() =>
    this.viewingToday() ? null : `${this.t().dayViewing} ${this.selectedDate()}.`,
  );

  readonly assetsOnDate = computed(() =>
    this.assets().filter((asset) => asset.acquiredDate === this.selectedDate()),
  );

  readonly summary = computed(() => {
    const t = this.t();
    const onDate = this.assetsOnDate();
    const cents = (rows: readonly Asset[]) =>
      this.money(rows.reduce((sum, asset) => sum + toCents(asset.cost), 0));

    return [
      { label: t.railAssetsAll, value: String(this.assets().length) },
      { label: t.railAssetsOnDate, value: String(onDate.length) },
      { label: t.railValueOnDate, value: cents(onDate) },
      { label: t.railValueAll, value: this.money(this.grandTotalCents()) },
    ];
  });

  /**
   * Value per farm, BIGGEST FIRST - the one thing the tables on the left
   * cannot show. There, each farm's total sits at the foot of its own table,
   * so comparing two farms means scrolling past every asset between them.
   *
   * The order is the rail's own, not `groups()`': that list is alphabetical,
   * because a table you are reading down is looked up by name, while a list
   * you are comparing is read by size.
   */
  readonly valueByFarm = computed(() =>
    [...this.groups()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .map((group) => ({
        farmId: group.farmId,
        name: group.farmName,
        value: this.money(group.totalCents),
      })),
  );

  selectDate(date: Date): void {
    this.selectedDate.set(isoDate(date));
  }

  backToToday(): void {
    this.selectedDate.set(this.today);
    this.datePicker()?.resetWeek();
  }

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly sizeLabelMaxLength = SIZE_LABEL_MAX_LENGTH;
  readonly categoryNameMaxLength = CATEGORY_NAME_MAX_LENGTH;

  ngOnInit(): void {
    this.fetch();
  }

  /** All three reads together: the screen is not usable with any one missing. */
  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    forkJoin({
      assets: this.assetsService.list(),
      categories: this.assetsService.categories(),
      farms: this.assetsService.myFarms(),
    }).subscribe({
      next: ({ assets, categories, farms }) => {
        this.assets.set(assets);
        this.categories.set(categories);
        this.farmOptions.set(farms);
        this.loading.set(false);
        this.preselectFarm();
      },
      error: (err: unknown) => {
        this.assets.set([]);
        this.categories.set([]);
        this.farmOptions.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /** Cents, formatted as NUMERIC(14,2) reads: always two decimals. */
  money(cents: number): string {
    return (cents / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ------------------------------------------------------------ asset

  /**
   * Registers an asset.
   *
   * Every check here restates one of AssetService's own, so the wrong field
   * is named at once rather than after a round trip. The future-date check
   * compares against today IN THE FARM'S ZONE, the same day the backend
   * uses - the backend still has the last word, and its refusal is shown.
   */
  submit(): void {
    if (this.saving()) {
      return;
    }
    this.clearFormErrors();

    const raw = this.form.getRawValue();
    const t = this.t();
    let valid = true;

    const name = String(raw.name ?? '').trim();
    if (!name) {
      this.nameError.set(t.errorNameRequired);
      valid = false;
    } else if (name.length > NAME_MAX_LENGTH) {
      this.nameError.set(t.errorNameTooLong);
      valid = false;
    }

    const farmId = parseId(raw.farmId);
    if (farmId === null) {
      this.farmError.set(t.errorFarmRequired);
      valid = false;
    }

    const assetCategoryId = parseId(raw.assetCategoryId);
    if (assetCategoryId === null) {
      this.categoryError.set(t.errorCategoryRequired);
      valid = false;
    }

    const cost = parseDecimal(raw.cost);
    if (cost === null) {
      this.costError.set(t.errorCostRequired);
      valid = false;
    } else if (cost <= 0) {
      this.costError.set(t.errorCostPositive);
      valid = false;
    }

    const acquiredDate = String(raw.acquiredDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredDate)) {
      this.dateError.set(t.errorDateRequired);
      valid = false;
    } else if (acquiredDate > this.today) {
      // ISO dates compare correctly as strings.
      this.dateError.set(t.errorDateFuture);
      valid = false;
    }

    const size = String(raw.sizeLabel ?? '').trim();
    if (size.length > SIZE_LABEL_MAX_LENGTH) {
      this.sizeError.set(t.errorSizeTooLong);
      valid = false;
    }

    if (!valid || farmId === null || assetCategoryId === null || cost === null) {
      return;
    }

    this.saving.set(true);
    this.assetsService
      .create({
        name,
        farmId,
        cost,
        acquiredDate,
        // An empty label is NO label - the backend stores null either way.
        sizeLabel: size || null,
        assetCategoryId,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          // Farm and category are KEPT: registering several things on one
          // farm is the usual way a register gets filled in.
          this.form.patchValue({ name: '', cost: '', sizeLabel: '', acquiredDate: this.today });
          this.toastMessage.set(this.t().createdToast);
          this.reloadAssets();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showSubmitError(asApiError(err));
        },
      });
  }

  /**
   * VALIDATION_ERROR keeps the BACKEND'S sentence: it names the field and the
   * limit ("haiwezi kuwa ya baadaye (2026-09-11). Leo ni 2026-09-10."), and
   * the code alone does not say which field it was - so it goes under the
   * form rather than on a guessed field. Everything else is the shared copy.
   */
  private showSubmitError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.formError.set(error.message);
      return;
    }
    this.formError.set(this.messageFor(error));
  }

  /** After a create: only the register changed, so only it is re-read. */
  private reloadAssets(): void {
    this.assetsService.list().subscribe({
      next: (assets) => this.assets.set(assets),
      error: (err: unknown) => this.loadError.set(asApiError(err)),
    });
  }

  private clearFormErrors(): void {
    this.formError.set(null);
    this.nameError.set(null);
    this.farmError.set(null);
    this.categoryError.set(null);
    this.costError.set(null);
    this.dateError.set(null);
    this.sizeError.set(null);
  }

  /**
   * Preselects the caller's current farm when it is one of theirs, else the
   * only farm there is. A choice already made is left alone.
   */
  private preselectFarm(): void {
    const options = this.farmOptions();
    const control = this.form.controls.farmId;
    if (control.value || options.length === 0) {
      return;
    }
    const current = this.currentFarmId();
    const preferred =
      options.find((option) => option.farmId === String(current)) ??
      (options.length === 1 ? options[0] : undefined);
    if (preferred) {
      control.setValue(preferred.farmId);
    }
  }

  // --------------------------------------------------------- category

  /**
   * Adds a category, then selects it in the asset form - the usual reason
   * for adding one is the asset about to be registered.
   */
  submitCategory(): void {
    if (this.savingCategory()) {
      return;
    }
    this.categoryNameError.set(null);

    const t = this.t();
    const name = String(this.categoryForm.getRawValue().name ?? '').trim();
    if (!name) {
      this.categoryNameError.set(t.errorCategoryNameRequired);
      return;
    }
    if (name.length > CATEGORY_NAME_MAX_LENGTH) {
      this.categoryNameError.set(t.errorCategoryNameTooLong);
      return;
    }

    this.savingCategory.set(true);
    this.assetsService.createCategory(name).subscribe({
      next: (created) => {
        this.savingCategory.set(false);
        this.categoryForm.reset({ name: '' });
        this.toastMessage.set(this.t().categoryCreatedToast);
        this.form.controls.assetCategoryId.setValue(created.assetCategoryId);
        this.reloadCategories();
      },
      error: (err: unknown) => {
        this.savingCategory.set(false);
        this.showCategoryError(asApiError(err));
      },
    });
  }

  /**
   * CONFLICT IS ALWAYS THE NAME, and gets our copy - the part the backend
   * leaves out is that a deleted category still holds its name.
   */
  private showCategoryError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.errorCode === ERROR_CODE.CONFLICT) {
      this.categoryNameError.set(this.t().errorCategoryTaken);
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.categoryNameError.set(error.message);
      return;
    }
    this.categoryNameError.set(this.messageFor(error));
  }

  private reloadCategories(): void {
    this.assetsService.categories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: (err: unknown) => this.loadError.set(asApiError(err)),
    });
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
 * A cost in whole cents. The backend rounds to the column's scale HALF_UP, so
 * rounding here sums what is stored. A non-finite value (which the schema's
 * `Float!` never sends) counts as zero rather than poisoning a total.
 */
function toCents(cost: number): number {
  return Number.isFinite(cost) ? Math.round(cost * 100) : 0;
}

/**
 * A select's value as the `Int!` the mutation takes, or null when nothing is
 * chosen. The rows carry the same ids as `ID!` strings, hence the conversion.
 */
function parseId(raw: unknown): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

/** A number box's value, or null when it is empty. Not rounded. */
function parseDecimal(raw: unknown): number | null {
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

/**
 * Today as YYYY-MM-DD in FARM_TIME_ZONE, built from `formatToParts` so the
 * layout is ours rather than the runtime's. If Intl refuses the zone, the
 * browser's own day is the honest fallback.
 */
function farmToday(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: FARM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Falls through to the local day below.
  }
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
