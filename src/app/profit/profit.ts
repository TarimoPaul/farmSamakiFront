import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subscription, catchError, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { LanguageService } from '../core/services/language';
import { AuthService } from '../core/services/auth';
import { AssetsService } from '../core/services/assets';
import { CostsService } from '../core/services/costs';
import { ProfitabilityService } from '../core/services/profitability';
import { AssetFarm } from '../core/models/asset';
import { CycleRef } from '../core/models/cost';
import { CycleProfitability, FarmProfitability } from '../core/models/profitability';
import { PERMISSION } from '../core/models/permissions';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { Button } from '../shared/ui/button/button';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { PROFIT_I18N } from './profit.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/** The zone the backend's dates are judged in - so "this year" is the farm's year. */
const FARM_TIME_ZONE = 'Africa/Nairobi';

/**
 * The profit report - a farm over a period, and one cycle on its own.
 *
 * DISPLAY ONLY. Every total comes from ProfitabilityService on the backend;
 * nothing here adds revenue and costs together. The one piece of arithmetic is
 * rounding a figure to cents for display.
 *
 * THE SOURCES STAY APART. Cycle costs, feed purchases and whole-farm
 * operational costs are separate lines, and each operational line lists its
 * categories - that is how a "Chakula" category sitting next to the feed line
 * gets noticed as double-counting. Capital is a card of its own: investment,
 * never part of profit. A loss is labelled a loss, never hidden.
 *
 * A CYCLE'S PROFIT IS "BEFORE FEED". It is labelled so wherever it appears, and
 * a running cycle (null revenue and profit) says so rather than showing 0.
 *
 * PERMISSIONS: the route is `view_finance`, which is both queries. The cycle
 * picker reads `farmCycles`, which is `manage_costs` - so the picker is only
 * offered to a holder of that code; everyone else reaches a cycle through the
 * per-cycle table.
 */
@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, Button, EmptyState, FormField],
  templateUrl: './profit.html',
  styleUrl: './profit.scss',
})
export class Profit implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => PROFIT_I18N[this.languageService.lang()]);

  private readonly profitability = inject(ProfitabilityService);
  private readonly assetsService = inject(AssetsService);
  private readonly costsService = inject(CostsService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly today = farmToday();

  readonly farmOptions = signal<readonly AssetFarm[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));
  readonly noFarms = computed(() => this.farmOptions().length === 0);

  private readonly currentFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  readonly form = this.formBuilder.nonNullable.group({
    farmId: [''],
    fromDate: [`${this.today.slice(0, 4)}-01-01`],
    toDate: [this.today],
  });

  readonly farmError = signal<string | null>(null);
  readonly fromError = signal<string | null>(null);
  readonly toError = signal<string | null>(null);
  readonly reportError = signal<string | null>(null);

  readonly report = signal<FarmProfitability | null>(null);
  readonly reportLoading = signal(false);
  private reportRequest: Subscription | null = null;

  // ── one cycle ──────────────────────────────────────────────────────────

  /** `farmCycles` is `manage_costs`; without it the picker would load into FORBIDDEN. */
  readonly canPickCycle = computed(() => this.authService.hasPermission(PERMISSION.MANAGE_COSTS));

  readonly cycleForm = this.formBuilder.nonNullable.group({ cycleId: [''] });
  readonly cycleOptions = signal<readonly CycleRef[]>([]);
  readonly cyclesLoading = signal(false);
  readonly cyclesError = signal<string | null>(null);

  readonly cycle = signal<CycleProfitability | null>(null);
  readonly cycleLoading = signal(false);
  readonly cycleError = signal<string | null>(null);
  private cycleRequest: Subscription | null = null;

  /** Running: the backend has no profit for it yet - never rendered as a zero. */
  readonly cycleIsActive = computed(() => {
    const cycle = this.cycle();
    return !!cycle && (cycle.status === 'ACTIVE' || cycle.cycleNetProfit === null);
  });

  readonly net = computed(() => {
    const report = this.report();
    return report ? { value: report.farmNetProfit, loss: isLoss(report.farmNetProfit) } : null;
  });

  constructor() {
    // A new farm: the old report and cycle belong to another farm - clear
    // them, then (for a `manage_costs` holder) read the new farm's cycles.
    this.form.controls.farmId.valueChanges
      .pipe(
        distinctUntilChanged(),
        tap(() => {
          this.report.set(null);
          this.reportError.set(null);
          this.clearCycle();
          this.cycleOptions.set([]);
          this.cyclesError.set(null);
          this.cycleForm.controls.cycleId.setValue('', { emitEvent: false });
        }),
        switchMap((raw) => {
          const farmId = parseId(raw);
          if (farmId === null || !this.canPickCycle()) {
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

    this.cycleForm.controls.cycleId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((raw) => {
        const id = parseId(raw);
        if (id === null) {
          this.clearCycle();
        } else {
          this.loadCycle(id);
        }
      });
  }

  ngOnInit(): void {
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.assetsService.myFarms().subscribe({
      next: (farms) => {
        this.farmOptions.set(farms);
        this.loading.set(false);
        this.preselectFarm();
      },
      error: (err: unknown) => {
        this.farmOptions.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * Checks what the backend would refuse - fromDate after toDate above all -
   * so the wrong field is named first; the backend still has the last word.
   */
  runReport(): void {
    this.farmError.set(null);
    this.fromError.set(null);
    this.toError.set(null);
    this.reportError.set(null);

    const t = this.t();
    const raw = this.form.getRawValue();
    const farmId = parseId(raw.farmId);
    const fromDate = String(raw.fromDate ?? '').trim();
    const toDate = String(raw.toDate ?? '').trim();
    let valid = true;

    if (farmId === null) {
      this.farmError.set(t.errorFarmRequired);
      valid = false;
    }
    if (!ISO_DATE.test(fromDate)) {
      this.fromError.set(t.errorFromRequired);
      valid = false;
    }
    if (!ISO_DATE.test(toDate)) {
      this.toError.set(t.errorToRequired);
      valid = false;
    }
    // ISO dates compare correctly as strings.
    if (valid && fromDate > toDate) {
      this.fromError.set(t.errorDateRange);
      valid = false;
    }
    if (!valid || farmId === null) {
      return;
    }

    this.reportRequest?.unsubscribe();
    this.reportLoading.set(true);
    this.reportRequest = this.profitability.farm(farmId, fromDate, toDate).subscribe({
      next: (report) => {
        this.report.set(report);
        this.reportLoading.set(false);
      },
      error: (err: unknown) => {
        this.report.set(null);
        this.reportLoading.set(false);
        const error = asApiError(err);
        if (error.sessionHandled) {
          return;
        }
        // VALIDATION_ERROR keeps the backend's sentence: it names both dates.
        this.reportError.set(
          error.errorCode === ERROR_CODE.VALIDATION_ERROR && error.message
            ? error.message
            : this.messageFor(error),
        );
      },
    });
  }

  /** From the per-cycle table: reuses the picker when it is there, so both agree. */
  viewCycle(cycleId: string): void {
    if (this.canPickCycle() && this.cycleOptions().some((c) => c.cycleId === cycleId)) {
      this.cycleForm.controls.cycleId.setValue(cycleId);
      return;
    }
    const id = parseId(cycleId);
    if (id !== null) {
      this.loadCycle(id);
    }
  }

  private loadCycle(cycleId: number): void {
    this.cycleRequest?.unsubscribe();
    this.cycle.set(null);
    this.cycleError.set(null);
    this.cycleLoading.set(true);
    this.cycleRequest = this.profitability.cycle(cycleId).subscribe({
      next: (cycle) => {
        this.cycle.set(cycle);
        this.cycleLoading.set(false);
      },
      error: (err: unknown) => {
        this.cycleLoading.set(false);
        const error = asApiError(err);
        if (!error.sessionHandled) {
          this.cycleError.set(this.messageFor(error));
        }
      },
    });
  }

  private clearCycle(): void {
    this.cycleRequest?.unsubscribe();
    this.cycle.set(null);
    this.cycleError.set(null);
    this.cycleLoading.set(false);
  }

  /** The caller's current farm if it is theirs, else the only one - and runs the report once. */
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
      this.runReport();
    }
  }

  /** Two decimals always; a real 0 is 0.00, and a negative keeps its minus sign. */
  money(value: number | null | undefined): string {
    const cents = value !== null && value !== undefined && Number.isFinite(value)
      ? Math.round(value * 100)
      : 0;
    // `|| 0` turns a rounded -0 into 0, so a tiny negative never reads "-0.00".
    return ((cents || 0) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  isLoss(value: number | null | undefined): boolean {
    return isLoss(value);
  }

  private messageFor(error: ApiError | null): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Below zero once rounded to cents - the same test the formatting uses. */
function isLoss(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value) && Math.round(value * 100) < 0;
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

function parseId(raw: unknown): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
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
