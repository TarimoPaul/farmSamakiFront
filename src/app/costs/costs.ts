import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, distinctUntilChanged, forkJoin, switchMap, tap } from 'rxjs';
import { LanguageService } from '../core/services/language';
import { AuthService } from '../core/services/auth';
import { AssetsService } from '../core/services/assets';
import { CostsService } from '../core/services/costs';
import { AssetFarm } from '../core/models/asset';
import { Cost, CostCategory, CycleRef } from '../core/models/cost';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { Button } from '../shared/ui/button/button';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Toast } from '../shared/ui/toast/toast';
import { DatePickerCard, isoDate } from '../shared/ui/date-picker-card/date-picker-card';
import { COSTS_I18N } from './costs.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/** `cost_categories.name` VARCHAR(80), as CostService checks it. */
const CATEGORY_NAME_MAX_LENGTH = 80;

/** CostService.AMOUNT_MAX - NUMERIC(14,2), in cents. */
const AMOUNT_MAX_CENTS = 99_999_999_999_999;

/**
 * The zone the backend judges "in the future" in (CostService uses the
 * reminder zone, Africa/Nairobi) - so the default date and the client-side
 * future check mean the same day the server does.
 */
const FARM_TIME_ZONE = 'Africa/Nairobi';

/** Whether the cost being recorded belongs to one cycle or to the whole farm. */
export type CostAttribution = '' | 'cycle' | 'farm';

/** One subtotal inside a farm: a single cycle's costs, or the whole-farm ones. */
export interface CostSubtotal {
  /** The cycle id, or null for the whole-farm line. */
  cycleId: string | null;
  /** The cycle's label; null for the whole-farm line. */
  label: string | null;
  count: number;
  /** Whole cents, so a sum of NUMERIC(14,2) values never drifts. */
  totalCents: number;
}

/** One farm's slice of the register. */
export interface CostFarmGroup {
  farmId: string;
  farmName: string;
  costs: readonly Cost[];
  /** Null when the farm has no whole-farm costs. */
  wholeFarm: CostSubtotal | null;
  /** One per cycle that has costs, in label order. */
  cycles: readonly CostSubtotal[];
  totalCents: number;
}

/**
 * The operational-cost register - what running the farms has cost, and
 * whether each cost belongs to ONE CYCLE or to THE WHOLE FARM.
 *
 * COMPANY-WIDE, like the asset register: `costs` answers for every farm the
 * caller holds, so nothing here reads the farm selection. Rows are grouped by
 * the `farm` each one carries.
 *
 * THE SPLIT IS THE POINT. A cycle's own costs (fingerlings, one tank's
 * medicine) and the farm's shared costs (electricity, rent) answer different
 * questions, so each farm shows a subtotal per cycle and a separate
 * whole-farm subtotal before its total - never one undifferentiated number.
 * All sums are ours, in whole cents: there is no aggregation endpoint.
 *
 * THE FORM MAKES THE CHOICE EXPLICIT. Nothing is preselected for attribution:
 * the recorder says "specific cycle" or "whole farm". A whole-farm cost sends
 * `cycleId: null` and needs no cycle at all; a cycle cost picks from
 * `farmCycles(farm)`, which includes closed cycles because bills arrive after
 * the harvest. Changing the farm re-reads that list and clears the pick - a
 * cycle of the old farm would be refused by the backend anyway.
 *
 * ONE PERMISSION, AND IT IS THE ROUTE'S: every cost endpoint is
 * `manage_costs`, so the guard is the whole gate. `myFarms` is login-only.
 */
@Component({
  selector: 'app-costs',
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
  templateUrl: './costs.html',
  styleUrl: './costs.scss',
})
export class Costs implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => COSTS_I18N[this.languageService.lang()]);

  private readonly costsService = inject(CostsService);
  private readonly assetsService = inject(AssetsService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  /** Today in the farm's day, read once when the screen opens. */
  readonly today = farmToday();

  readonly costs = signal<readonly Cost[]>([]);
  readonly categories = signal<readonly CostCategory[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  /** `farmCycles` for the farm currently chosen in the form. */
  readonly cycleOptions = signal<readonly CycleRef[]>([]);
  readonly cyclesLoading = signal(false);
  readonly cyclesError = signal<string | null>(null);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly farmError = signal<string | null>(null);
  readonly attributionError = signal<string | null>(null);
  readonly cycleError = signal<string | null>(null);
  readonly categoryError = signal<string | null>(null);
  readonly amountError = signal<string | null>(null);
  readonly dateError = signal<string | null>(null);

  readonly savingCategory = signal(false);
  readonly categoryNameError = signal<string | null>(null);

  readonly toastMessage = signal<string | null>(null);

  readonly canSelectFarm = this.authService.canSelectFarm;
  private readonly currentFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  /**
   * Select values are strings and `amount` is a number box whose accessor
   * writes a number (or null) whatever this declares - read accordingly.
   */
  readonly form = this.formBuilder.nonNullable.group({
    farmId: [''],
    attribution: ['' as CostAttribution],
    cycleId: [''],
    costCategoryId: [''],
    amount: [''],
    costDate: [this.today],
    description: [''],
  });

  readonly categoryForm = this.formBuilder.nonNullable.group({
    name: [''],
  });

  /** The attribution radio as a signal, so the template can show or hide the cycle picker. */
  readonly attribution = signal<CostAttribution>('');
  readonly selectedFarmId = signal<string>('');

  /**
   * One group per farm, farms in name order; rows keep the backend's order.
   * Within a farm: the whole-farm subtotal, then one per cycle by label.
   */
  readonly groups = computed<readonly CostFarmGroup[]>(() => {
    const byFarm = new Map<
      string,
      { farmName: string; costs: Cost[]; subtotals: Map<string, CostSubtotal>; totalCents: number }
    >();
    for (const cost of this.costs()) {
      let group = byFarm.get(cost.farm.farmId);
      if (!group) {
        group = { farmName: cost.farm.name, costs: [], subtotals: new Map(), totalCents: 0 };
        byFarm.set(cost.farm.farmId, group);
      }
      const cents = toCents(cost.amount);
      group.costs.push(cost);
      group.totalCents += cents;

      // '' cannot be a cycle id (ids are positive integers), so it keys the
      // whole-farm line without colliding with any cycle.
      const key = cost.cycle?.cycleId ?? '';
      let subtotal = group.subtotals.get(key);
      if (!subtotal) {
        subtotal = {
          cycleId: cost.cycle?.cycleId ?? null,
          label: cost.cycle?.label ?? null,
          count: 0,
          totalCents: 0,
        };
        group.subtotals.set(key, subtotal);
      }
      subtotal.count += 1;
      subtotal.totalCents += cents;
    }

    return [...byFarm.entries()]
      .map(([farmId, group]) => ({
        farmId,
        farmName: group.farmName,
        costs: group.costs,
        totalCents: group.totalCents,
        wholeFarm: group.subtotals.get('') ?? null,
        cycles: [...group.subtotals.values()]
          .filter((subtotal) => subtotal.cycleId !== null)
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '')),
      }))
      .sort((a, b) => a.farmName.localeCompare(b.farmName));
  });

  readonly grandTotalCents = computed(() =>
    this.groups().reduce((sum, group) => sum + group.totalCents, 0),
  );

  /** `myFarms`, in the backend's order - the caller's own farms. */
  readonly farmOptions = signal<readonly AssetFarm[]>([]);

  readonly noFarms = computed(() => this.farmOptions().length === 0);
  readonly noCategories = computed(() => this.categories().length === 0);

  readonly emptyMessage = computed(() =>
    this.noCategories() ? this.t().emptyMessageNoCategories : this.t().emptyMessage,
  );

  readonly columns = computed<DataTableColumn<Cost>[]>(() => {
    const t = this.t();
    return [
      { label: t.colCategory, value: (cost) => cost.costCategory.name },
      { label: t.colAttribution, value: (cost) => cost.cycle?.label ?? t.wholeFarm },
      { label: t.colAmount, value: (cost) => this.money(toCents(cost.amount)) },
      { label: t.colDate, value: (cost) => cost.costDate },
      {
        label: t.colDescription,
        value: (cost) => cost.description ?? t.noDescription,
        muted: (cost) => !cost.description,
      },
    ];
  });

  readonly costKey = (cost: Cost): string => cost.costId;

  readonly categoryNameMaxLength = CATEGORY_NAME_MAX_LENGTH;

  // ── The summary rail ───────────────────────────────────────────────────
  //
  // Counted from `costs()`, already on the page, so the rail - date picker
  // included - costs no request. A cost carries its own `costDate`, which is
  // what makes "what was spent on the 7th" a filter rather than a query.

  private readonly datePicker = viewChild(DatePickerCard);

  /**
   * The date the rail is answering for - the FARM'S today to begin with, for
   * the same reason as the asset register: `costDate` is judged against the
   * farm's day by both this screen and CostService.
   */
  readonly selectedDate = signal(this.today);
  readonly viewingToday = computed(() => this.selectedDate() === this.today);

  readonly dayState = computed<string | null>(() =>
    this.viewingToday() ? null : `${this.t().dayViewing} ${this.selectedDate()}.`,
  );

  readonly costsOnDate = computed(() =>
    this.costs().filter((cost) => cost.costDate === this.selectedDate()),
  );

  readonly summary = computed(() => {
    const t = this.t();
    const onDate = this.costsOnDate();

    return [
      { label: t.railCostsAll, value: String(this.costs().length) },
      { label: t.railCostsOnDate, value: String(onDate.length) },
      { label: t.railAmountOnDate, value: this.money(sumCents(onDate)) },
      { label: t.railAmountAll, value: this.money(this.grandTotalCents()) },
    ];
  });

  /**
   * Cycle money against shared money - the split this screen exists to keep.
   *
   * It reads the WHOLE register rather than the selected date, and so does the
   * category card below. The shape of a farm's spending is a question about
   * months, not about one Tuesday: filtered to a single day, both cards would
   * be empty on most dates and would say nothing on the rest. The summary card
   * above is the one that follows the calendar.
   */
  readonly attributionSplit = computed(() => {
    const t = this.t();
    const all = this.costs();
    // Truthiness, not `!== null`, so the two lines add up to the register
    // however the field arrives - `groups()` above splits on the same test.
    const cycle = all.filter((cost) => !!cost.cycle);
    const farm = all.filter((cost) => !cost.cycle);

    return [
      { label: t.railSplitCycle, value: this.money(sumCents(cycle)) },
      { label: t.railSplitFarm, value: this.money(sumCents(farm)) },
    ];
  });

  /**
   * Where the money went, biggest first, capped at five.
   *
   * Categories are user-created and unbounded - a farm with twenty of them
   * would push everything below this card off the rail. The five that carry
   * the most money are the ones a manager acts on; the rest are counted in the
   * line underneath rather than silently dropped.
   */
  readonly topCategories = computed(() => {
    const byName = new Map<string, number>();
    for (const cost of this.costs()) {
      const name = cost.costCategory.name;
      byName.set(name, (byName.get(name) ?? 0) + toCents(cost.amount));
    }
    const ranked = [...byName.entries()].sort(([, a], [, b]) => b - a);
    return {
      rows: ranked.slice(0, 5).map(([name, cents]) => ({ name, value: this.money(cents) })),
      remaining: Math.max(0, ranked.length - 5),
    };
  });

  selectDate(date: Date): void {
    this.selectedDate.set(isoDate(date));
  }

  backToToday(): void {
    this.selectedDate.set(this.today);
    this.datePicker()?.resetWeek();
  }

  constructor() {
    this.form.controls.attribution.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.attribution.set(value);
      this.attributionError.set(null);
      this.cycleError.set(null);
    });

    // A new farm means a new cycle list, and the old pick is meaningless on
    // it - clear first, then read. switchMap drops a slower answer for a farm
    // the recorder has already moved away from.
    this.form.controls.farmId.valueChanges
      .pipe(
        distinctUntilChanged(),
        tap((farmId) => {
          this.selectedFarmId.set(farmId);
          this.form.controls.cycleId.setValue('');
          this.cycleOptions.set([]);
          this.cyclesError.set(null);
          this.cycleError.set(null);
        }),
        switchMap((raw) => {
          const farmId = parseId(raw);
          if (farmId === null) {
            this.cyclesLoading.set(false);
            return EMPTY;
          }
          this.cyclesLoading.set(true);
          return this.costsService.farmCycles(farmId).pipe(
            catchError((err: unknown) => {
              const error = asApiError(err);
              this.cyclesLoading.set(false);
              if (!error.sessionHandled) {
                this.cyclesError.set(this.messageFor(error));
              }
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((cycles) => {
        this.cycleOptions.set(cycles);
        this.cyclesLoading.set(false);
      });
  }

  ngOnInit(): void {
    this.fetch();
  }

  /** All three reads together: the screen is not usable with any one missing. */
  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    forkJoin({
      costs: this.costsService.list(),
      categories: this.costsService.categories(),
      farms: this.assetsService.myFarms(),
    }).subscribe({
      next: ({ costs, categories, farms }) => {
        this.costs.set(costs);
        this.categories.set(categories);
        this.farmOptions.set(farms);
        this.loading.set(false);
        this.preselectFarm();
      },
      error: (err: unknown) => {
        this.costs.set([]);
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

  // ------------------------------------------------------------- cost

  /**
   * Records a cost. Every check restates one of CostService's own, so the
   * wrong field is named before a round trip; the backend still has the last
   * word, and its refusal is shown.
   */
  submit(): void {
    if (this.saving()) {
      return;
    }
    this.clearFormErrors();

    const raw = this.form.getRawValue();
    const t = this.t();
    let valid = true;

    const farmId = parseId(raw.farmId);
    if (farmId === null) {
      this.farmError.set(t.errorFarmRequired);
      valid = false;
    }

    // Whole farm -> null, and no cycle is asked for. Only a cycle cost needs one.
    let cycleId: number | null = null;
    if (raw.attribution === 'cycle') {
      cycleId = parseId(raw.cycleId);
      if (cycleId === null) {
        this.cycleError.set(t.errorCycleRequired);
        valid = false;
      }
    } else if (raw.attribution !== 'farm') {
      this.attributionError.set(t.errorAttributionRequired);
      valid = false;
    }

    const costCategoryId = parseId(raw.costCategoryId);
    if (costCategoryId === null) {
      this.categoryError.set(t.errorCategoryRequired);
      valid = false;
    }

    const amount = parseDecimal(raw.amount);
    if (amount === null) {
      this.amountError.set(t.errorAmountRequired);
      valid = false;
    } else if (amount <= 0) {
      this.amountError.set(t.errorAmountPositive);
      valid = false;
    } else if (toCents(amount) > AMOUNT_MAX_CENTS) {
      this.amountError.set(t.errorAmountTooLarge);
      valid = false;
    }

    const costDate = String(raw.costDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(costDate)) {
      this.dateError.set(t.errorDateRequired);
      valid = false;
    } else if (costDate > this.today) {
      // ISO dates compare correctly as strings.
      this.dateError.set(t.errorDateFuture);
      valid = false;
    }

    if (!valid || farmId === null || costCategoryId === null || amount === null) {
      return;
    }

    const description = String(raw.description ?? '').trim();

    this.saving.set(true);
    this.costsService
      .create({
        farmId,
        cycleId,
        costCategoryId,
        amount,
        costDate,
        // An empty description is NO description - the backend stores null either way.
        description: description || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          // Farm, attribution, cycle and category are KEPT: a run of bills
          // for one farm or one cycle is the usual way this gets filled in.
          this.form.patchValue({ amount: '', description: '', costDate: this.today });
          this.toastMessage.set(this.t().createdToast);
          this.reloadCosts();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showSubmitError(asApiError(err));
        },
      });
  }

  /**
   * VALIDATION_ERROR keeps the BACKEND'S sentence: it names the field and the
   * limit ("haiwezi kuwa ya baadaye (2026-09-11). Leo ni 2026-09-10."), which
   * the code alone does not. Everything else is the shared copy.
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
  private reloadCosts(): void {
    this.costsService.list().subscribe({
      next: (costs) => this.costs.set(costs),
      error: (err: unknown) => this.loadError.set(asApiError(err)),
    });
  }

  private clearFormErrors(): void {
    this.formError.set(null);
    this.farmError.set(null);
    this.attributionError.set(null);
    this.cycleError.set(null);
    this.categoryError.set(null);
    this.amountError.set(null);
    this.dateError.set(null);
  }

  /**
   * Preselects the caller's current farm when it is one of theirs, else the
   * only farm there is. A choice already made is left alone. Setting it
   * loads that farm's cycles, through the valueChanges pipeline above.
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

  /** Adds a category, then selects it in the cost form. */
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
    this.costsService.createCategory(name).subscribe({
      next: (created) => {
        this.savingCategory.set(false);
        this.categoryForm.reset({ name: '' });
        this.toastMessage.set(this.t().categoryCreatedToast);
        this.form.controls.costCategoryId.setValue(created.costCategoryId);
        this.reloadCategories();
      },
      error: (err: unknown) => {
        this.savingCategory.set(false);
        this.showCategoryError(asApiError(err));
      },
    });
  }

  /** CONFLICT is always the name, and gets our "jina limechukuliwa" copy. */
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
    this.costsService.categories().subscribe({
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
 * An amount in whole cents. The backend rounds to the column's scale, so
 * rounding here sums what is stored. A non-finite value counts as zero rather
 * than poisoning a total - no NaN can reach the screen.
 */
function toCents(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** A subset of the register in whole cents - the rail's only arithmetic. */
function sumCents(costs: readonly Cost[]): number {
  return costs.reduce((total, cost) => total + toCents(cost.amount), 0);
}

/** A select's value as the `Int` the mutation takes, or null when nothing is chosen. */
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

/** Today as YYYY-MM-DD in FARM_TIME_ZONE; the browser's own day if Intl refuses the zone. */
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
