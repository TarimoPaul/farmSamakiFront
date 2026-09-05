import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../core/services/auth';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { FarmSelectionService } from '../core/services/farm-selection';
import { FeedService } from '../core/services/feed';
import { LanguageService } from '../core/services/language';
import { ProductionService } from '../core/services/production';
import { Cycle } from '../core/models/cycle';
import { FeedStockBalance, FeedingLog, SuitableFeedType } from '../core/models/feed';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { PERMISSION } from '../core/models/permissions';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { AppShell } from '../shared/layout/app-shell/app-shell';
import { HasPermission } from '../shared/directives/has-permission';
import { Button } from '../shared/ui/button/button';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Toast } from '../shared/ui/toast/toast';
import { FEEDING_I18N } from './feeding.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/**
 * At or below this many kilograms a feed type is called out as running low.
 *
 * A constant, not a setting, and deliberately blunt: it exists to put a line
 * on the screen a day or two before a sack runs out, and the only thing worse
 * than a slightly wrong number is no warning at all. It is BANNER ONLY -
 * nobody is notified, nothing is sent to the owner. Restocking is a decision,
 * and this screen's job is to make sure it is an informed one.
 */
export const LOW_STOCK_THRESHOLD_KG = 10;

/**
 * Feeding - the second of the day-to-day logging screens, built on the shape
 * Water Quality established: the cycle comes from CycleSelectionService, the
 * stored id is resolved against the backend's own cycle list before it is
 * used, and reading and writing are different permissions.
 *
 * What is NEW here, and is the whole point of the screen:
 *
 *  1. THE DROPDOWN IS NOT A LIST OF FEEDS THE FARM OWNS. It is the answer to
 *     `feedTypesForCycle(cycleId)` - the feeds that suit the AGE of the fish
 *     in this cycle. Building it from the stock balance instead would offer
 *     pellets too big for fingerlings, which is how a tank chokes. The two
 *     lists are never mixed; see FeedService.
 *  2. SUITABILITY IS REPORTED, NOT DECIDED. EXACT and SAFE_LOWER both come
 *     from the server; SAFE_LOWER is shown with its warning and costs a second
 *     press. UNSAFE_HIGHER is excluded server-side and is never rendered.
 *  3. THE STOCK PANEL IS A THIRD PERMISSION. `view_feed_stock` puts it on the
 *     page at all - a feeder without it sees the form and the history and no
 *     numbers, which is the ordinary case, not an edge one.
 */
@Component({
  selector: 'app-feeding',
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
    Toast,
  ],
  templateUrl: './feeding.html',
  styleUrl: './feeding.scss',
})
export class Feeding {
  readonly PERMISSION = PERMISSION;
  readonly LOW_STOCK_THRESHOLD_KG = LOW_STOCK_THRESHOLD_KG;

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => FEEDING_I18N[this.languageService.lang()]);

  private readonly authService = inject(AuthService);
  private readonly productionService = inject(ProductionService);
  private readonly feedService = inject(FeedService);
  private readonly cycleSelection = inject(CycleSelectionService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  /** Resolved - null both when nothing is selected and when the stored id is stale. */
  readonly cycle = signal<Cycle | null>(null);
  readonly feedTypes = signal<readonly SuitableFeedType[]>([]);
  readonly noSuitableFeed = signal(false);
  /**
   * Whole months since stocking, as the BACKEND counted them.
   *
   * Shown beside the cycle, and never recomputed from `stockingDate` here: the
   * server floors it the same way it floors it when deciding which feeds
   * qualify, and a second implementation of that arithmetic would eventually
   * disagree with the filtering it is supposed to explain.
   */
  readonly cycleAgeMonths = signal<number | null>(null);
  readonly balances = signal<readonly FeedStockBalance[]>([]);
  readonly logs = signal<readonly FeedingLog[]>([]);

  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /**
   * Set by the first press on a SAFE_LOWER feed, cleared by the second.
   *
   * A confirm STEP rather than a confirm DIALOG: this screen is used
   * one-handed beside a pond, where a modal is a thing to dismiss rather than
   * a thing to read. The warning appears where the button is and the button
   * relabels itself, so the second press answers a sentence still on screen.
   */
  readonly awaitingConfirm = signal(false);

  readonly form = this.formBuilder.nonNullable.group({
    feedTypeId: [''],
    quantityKg: [''],
    logDate: [todayIso()],
  });

  /** The dropdown's selection as a signal, so the warnings track it. */
  private readonly selectedFeedTypeId = signal('');

  readonly selectedFeedType = computed<SuitableFeedType | null>(
    () =>
      this.feedTypes().find((entry) => entry.feedType.feedTypeId === this.selectedFeedTypeId()) ??
      null,
  );

  readonly selectedIsSafeLower = computed(
    () => this.selectedFeedType()?.suitability === 'SAFE_LOWER',
  );

  /**
   * `noSuitableFeed` is the server's answer, and it is the only thing that
   * takes the form away. An empty `feedTypes` list without the flag would
   * leave a form with nothing to choose, which the required-field check
   * already refuses in a way that names the problem.
   */
  readonly formDisabled = computed(() => this.noSuitableFeed());

  /**
   * Only the types actually below the line - the banner names them, because
   * "some feed is low" just sends somebody to read a table they were about to
   * ignore.
   */
  readonly lowStock = computed(() =>
    this.balances().filter((row) => row.quantityKg <= LOW_STOCK_THRESHOLD_KG),
  );

  readonly lowStockNames = computed(() =>
    this.lowStock()
      .map((row) => row.feedType.name)
      .join(', '),
  );

  readonly columns = computed<DataTableColumn<FeedingLog>[]>(() => {
    const t = this.t();
    return [
      { label: t.colDate, value: (log) => log.logDate },
      { label: t.colFeedType, value: (log) => log.feedType.name },
      { label: t.colQuantity, value: (log) => String(log.quantityKg) },
      {
        label: t.colRecordedBy,
        value: (log) => log.recordedByName ?? t.blank,
        muted: (log) => !log.recordedByName,
      },
    ];
  });

  readonly logKey = (log: FeedingLog): string => log.logId;
  readonly balanceKey = (row: FeedStockBalance): string => row.feedType.feedTypeId;

  /** Overdrawn: fed from a sack nobody wrote a purchase for. See FeedStockBalance. */
  isNegative(row: FeedStockBalance): boolean {
    return row.quantityKg < 0;
  }

  isLow(row: FeedStockBalance): boolean {
    return row.quantityKg <= LOW_STOCK_THRESHOLD_KG;
  }

  /**
   * The age window a feed is made for, e.g. "miezi 0-2".
   *
   * Both ends are inclusive, and fry feed's [0, 0] is a real window rather
   * than a missing value - so it renders as "miezi 0-0" and not as a blank,
   * which would read as "any age" and is the opposite of the truth.
   */
  ageWindow(feed: { minAgeMonths: number; maxAgeMonths: number }): string {
    return `${this.t().ageMonths} ${feed.minAgeMonths}-${feed.maxAgeMonths}`;
  }

  /**
   * The dropdown option's text: the name, the age window it is made for, and
   * - for SAFE_LOWER only - the tag saying so.
   *
   * The age window is here rather than a pellet size because that is what the
   * catalogue actually carries: FeedType has minAgeMonths/maxAgeMonths and no
   * size at all, which is the same fact the suitability tag is derived from.
   */
  feedLabel(entry: SuitableFeedType): string {
    const window = ` (${this.ageWindow(entry.feedType)})`;
    const tag = entry.suitability === 'SAFE_LOWER' ? ` — ${this.t().suitabilitySafeLowerTag}` : '';
    return `${entry.feedType.name}${window}${tag}`;
  }

  onFeedTypeChange(event: Event): void {
    this.selectedFeedTypeId.set((event.target as HTMLSelectElement).value);
    // A different feed is a different decision: a pending confirmation and any
    // error about the last one are no longer about what is on screen.
    this.awaitingConfirm.set(false);
    this.formError.set(null);
  }

  /**
   * Disables the CONTROLS when there is nothing safe to feed.
   *
   * Angular's own `form.disable()` rather than a `[attr.disabled]` binding on
   * each input: the form group is the thing that is unusable, and disabling it
   * once here keeps the three controls from disagreeing with each other. It is
   * presentation, not enforcement - submit() checks `formDisabled()` itself,
   * because a disabled control is a suggestion and the guard is the rule.
   */
  private readonly syncDisabled = effect(() => {
    if (this.formDisabled()) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  });

  /** Reloads on a farm switch or a cycle switch, exactly as Water Quality does. */
  private readonly load = effect(() => {
    this.farmSelection.selectedFarmId();
    this.cycleSelection.selectedCycleId();
    this.fetch();
  });

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.feedTypes.set([]);
    this.noSuitableFeed.set(false);
    this.cycleAgeMonths.set(null);
    this.balances.set([]);
    this.logs.set([]);

    const selectedId = this.cycleSelection.selectedCycleId();
    if (selectedId === null) {
      this.cycle.set(null);
      this.loading.set(false);
      return;
    }

    // The stored id is checked against THIS farm's cycles rather than sent to
    // the API, so an id left over from another farm produces the "pick a
    // cycle" panel instead of a FORBIDDEN nobody can interpret.
    this.productionService.listCycles().subscribe({
      next: (cycles) => {
        const cycle = cycles.find((c) => Number(c.cycleId) === selectedId) ?? null;
        this.cycle.set(cycle);

        if (!cycle) {
          // Production owns the selection; this screen does not rewrite it.
          this.loading.set(false);
          return;
        }

        this.fetchCycleData(selectedId);
      },
      error: (err: unknown) => {
        this.cycle.set(null);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * The cycle-scoped reads, together.
   *
   * forkJoin rather than three subscriptions because the screen has ONE
   * loading state and one error panel: a page that showed the history while
   * still deciding whether the feed dropdown has anything in it would invite a
   * press on a control that is about to change.
   *
   * The balance is NOT REQUESTED AT ALL without `view_feed_stock`. Gating only
   * the markup would send a request whose answer is thrown away, and would
   * turn a missing permission into a failed load the moment the backend gates
   * that query the same way the panel does.
   */
  private fetchCycleData(cycleId: number): void {
    forkJoin({
      feed: this.feedService.feedTypesForCycle(cycleId),
      logs: this.feedService.feedingLogs(cycleId),
      balance: this.canViewStock() ? this.feedService.feedStockBalance() : of(null),
    }).subscribe({
      next: ({ feed, logs, balance }) => {
        this.feedTypes.set(feed.feedTypes);
        this.noSuitableFeed.set(feed.noSuitableFeed);
        this.cycleAgeMonths.set(feed.cycleAgeMonths);
        this.logs.set(logs);
        this.balances.set(balance ?? []);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  private canViewStock(): boolean {
    return this.authService.hasPermission(PERMISSION.VIEW_FEED_STOCK);
  }

  goToProduction(): void {
    void this.router.navigateByUrl('/production');
  }

  /**
   * Records the feeding.
   *
   * Three client-side rules, and every one is about the FORM being incomplete
   * rather than about the feeding being wrong: a feed must be chosen, an
   * amount must be a number above zero (feeding nothing is not an event), and
   * a date must be present. Nothing here second-guesses how much was fed - a
   * large amount is a large amount, and the backend owns the rest.
   *
   * SAFE_LOWER costs a second press, and no more. The fish will eat it, the
   * person has been told it is not ideal, and refusing it outright would be
   * this screen overruling the farmer standing at the pond.
   */
  submit(): void {
    const cycle = this.cycle();
    if (!cycle || this.saving() || this.formDisabled()) {
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

    if (this.selectedIsSafeLower() && !this.awaitingConfirm()) {
      this.awaitingConfirm.set(true);
      return;
    }

    this.saving.set(true);
    this.feedService
      .logFeeding({
        // BOTH ids are `Int!` on LogFeedingInput, and both are read back as
        // `ID!` strings - so both are converted here, exactly as the
        // water-quality mutation converts its unitId.
        cycleId: Number(cycle.cycleId),
        feedTypeId: Number(raw.feedTypeId),
        quantityKg,
        logDate: raw.logDate,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.awaitingConfirm.set(false);
          // The date survives the reset: a shift's feedings are written up
          // together, and re-picking yesterday for every one of them is the
          // kind of friction that ends in nobody recording anything.
          this.form.reset({ feedTypeId: '', quantityKg: '', logDate: raw.logDate });
          this.selectedFeedTypeId.set('');
          this.toastMessage.set(this.t().savedToast);
          this.refreshAfterLog(Number(cycle.cycleId));
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.awaitingConfirm.set(false);
          this.showSubmitError(asApiError(err));
        },
      });
  }

  cancelConfirm(): void {
    this.awaitingConfirm.set(false);
  }

  /**
   * After a save: the history AND the stock, because the feeding just moved
   * both. Failures here are swallowed on purpose - the write succeeded, the
   * toast already said so, and replacing that with a red panel would report
   * the wrong outcome for the thing the user actually did.
   */
  private refreshAfterLog(cycleId: number): void {
    this.feedService.feedingLogs(cycleId).subscribe({
      next: (logs) => this.logs.set(logs),
      error: () => undefined,
    });

    if (this.canViewStock()) {
      this.feedService.feedStockBalance().subscribe({
        next: (balances) => this.balances.set(balances),
        error: () => undefined,
      });
    }
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /**
   * VALIDATION_ERROR keeps the BACKEND'S sentence.
   *
   * It should not fire: the dropdown was built from the server's own filtered
   * list, and the server allows SAFE_LOWER through deliberately. The two
   * things it does refuse are feed for OLDER fish and a retired type - both of
   * which mean the catalogue moved underneath the form, and at that point the
   * backend's own sentence names which feed and why, where no generic line of
   * ours could.
   */
  private showSubmitError(error: ApiError): void {
    const preferBackend =
      error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.errorCode === ERROR_CODE.CONFLICT;
    this.formError.set(this.messageFor(error, preferBackend));
  }

  private messageFor(error: ApiError | null, preferBackendMessage = false): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang(), preferBackendMessage) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

/**
 * `input[type=number]` writes a number - or null when empty - through
 * Angular's NumberValueAccessor, never the string the form's type claims.
 */
function numberOrNull(raw: string | number | null): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const trimmed = (raw ?? '').trim();
  return trimmed ? Number(trimmed) : null;
}

/**
 * Today as yyyy-MM-dd in the BROWSER'S timezone.
 *
 * `toISOString()` is deliberately not used: it converts to UTC first, so at
 * 02:00 in Dar es Salaam (UTC+3) it returns yesterday - and the default date
 * on a form filled in before dawn would be silently wrong.
 */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
