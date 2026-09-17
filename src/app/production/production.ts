import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { ProductionService } from '../core/services/production';
import { GraphqlService } from '../core/services/graphql';
import {
  CYCLE_ACTIVE,
  CYCLE_OUTCOMES,
  Cycle,
  CycleOutcome,
  HARVEST_REASONS,
  HarvestEvent,
  HarvestReason,
} from '../core/models/cycle';
import { ProductionUnit, UNIT_TYPES } from '../core/models/production-unit';
import { Species } from '../core/models/species';
import { DashboardDay } from '../core/models/dashboard-day';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { PERMISSION } from '../core/models/permissions';
import {
  CYCLE_CLOSE_RULE,
  HARVEST_EVENT_RULE,
  apiErrorMessage,
  cycleCloseRuleMessage,
  harvestEventRuleMessage,
} from '../core/i18n/error-messages';
import { unitTypeLabel } from '../core/i18n/unit-types';
import { HasPermission } from '../shared/directives/has-permission';
import { Button } from '../shared/ui/button/button';
import { ConfirmDialog } from '../shared/ui/confirm-dialog/confirm-dialog';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { DatePickerCard, isoDate } from '../shared/ui/date-picker-card/date-picker-card';
import { FormField } from '../shared/ui/form-field/form-field';
import { Modal } from '../shared/ui/modal/modal';
import { StatusBadge } from '../shared/ui/status-badge/status-badge';
import { Toast } from '../shared/ui/toast/toast';
import { PRODUCTION_I18N } from './production.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/**
 * The statuses a unit can hold, in the order the rail lists them.
 *
 * V1's CHECK constraint, not a list of what happens to be in the data:
 * MAINTENANCE is never written by any code path today (CycleService sets only
 * ACTIVE and IDLE), and a row that reads 0 is the honest answer - dropping it
 * would quietly change what the card claims to cover.
 */
const UNIT_STATUSES = ['ACTIVE', 'IDLE', 'MAINTENANCE'] as const;

/**
 * The farm as it stood on another date - what the rail's calendar asks for.
 *
 * Only the UNIT numbers are taken from it. The cycle counts are worked out
 * here, from the cycles this screen already holds: every one carries its
 * `stockingDate` and `actualHarvestDate`, so "which were running on the 7th"
 * is arithmetic, not a question for the server. The units cannot be done that
 * way - `ProductionUnit` has no created_at - which is the whole reason this
 * query is called at all.
 */
const DAY_QUERY = `
  query ($date: String!) {
    dashboardOnDate(date: $date) {
      date
      unitsExisting
      unitsActive
      unitsIdle
      unitsByType {
        type
        count
      }
      historyStartsOn
      historyComplete
    }
  }
`;

interface DashboardDayData {
  dashboardOnDate: DashboardDay;
}

/**
 * Production - the cycle CONTEXT every logging screen depends on.
 *
 * Until this screen existed the app could read units and cycles on the
 * dashboard and do nothing with them: there was no way to create either, and
 * no way to say which cycle you were working on. So a water reading or a
 * feeding had no cycle to belong to, and the only way to build one of those
 * screens would have been to hardcode an id.
 *
 * Scope is the CONTEXT plus the one thing that ends it - list, create,
 * select, close. Closing arrived with `closeCycle`; before that mutation
 * existed a cycle could only ever be ACTIVE, and a button with nothing behind
 * it would have been worse than its absence. There is still no editing.
 *
 * NOTHING ON THIS SCREEN CLOSES A CYCLE BY ITSELF. `expectedHarvestDate` is a
 * prediction: when it arrives the row grows a badge and the panel a line of
 * advice, and that is the whole of it - no status moves, no request is sent.
 * The only thing that closes a cycle is a person filling in the harvest.
 *
 * THREE GATES, all reading the same permission set:
 *
 *  - the ROUTE needs only a session: reading is `view_dashboard`, which every
 *    role holds, and the backend refuses the query otherwise;
 *  - "add unit" needs `manage_units`;
 *  - "start cycle" needs `edit_cycle`, and so does "close cycle";
 *  - recording and deleting harvest events needs `record_harvest`.
 *
 * A VIEWER therefore sees both tables, can select a cycle and read its
 * harvest events, and has no forms.
 *
 * HARVEST EVENTS (V25) are where a cycle's closing numbers come from: every
 * fish that leaves the pond is an event - SOLD, DIED or REMOVED - and closing
 * SUMS them. The close form therefore no longer asks for a count or weight.
 *
 * MONEY (fingerlingCost, totalRevenue, saleAmount) arrives null for anyone
 * without `view_finance`. Every one of them goes through `money()`, which
 * renders null as a dash - never 0, never "null".
 */
@Component({
  selector: 'app-production',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HasPermission,
    Button,
    ConfirmDialog,
    DataTable,
    EmptyState,
    DatePickerCard,
    FormField,
    Modal,
    StatusBadge,
    Toast,
  ],
  templateUrl: './production.html',
  styleUrl: './production.scss',
})
export class Production {
  readonly PERMISSION = PERMISSION;
  readonly unitTypes = UNIT_TYPES;
  readonly cycleOutcomes = CYCLE_OUTCOMES;
  readonly harvestReasons = HARVEST_REASONS;

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => PRODUCTION_I18N[this.languageService.lang()]);

  private readonly authService = inject(AuthService);
  private readonly productionService = inject(ProductionService);
  // The rail's calendar goes straight to GraphQL rather than through
  // ProductionService: `dashboardOnDate` is not a production endpoint, it is
  // the dashboard's, and wrapping it here would put a farm-wide summary behind
  // a service named for units and cycles.
  private readonly graphqlService = inject(GraphqlService);
  private readonly datePicker = viewChild(DatePickerCard);
  private readonly cycleSelection = inject(CycleSelectionService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly units = signal<readonly ProductionUnit[]>([]);
  readonly cycles = signal<readonly Cycle[]>([]);
  readonly species = signal<readonly Species[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly selectedCycleId = this.cycleSelection.selectedCycleId;

  // ── The summary rail ───────────────────────────────────────────────────
  //
  // The dashboard's own cards, on this screen, answering this module's
  // questions. Everything is counted from `cycles()` and `units()` - which the
  // screen has already fetched - so the rail costs no request and can never
  // disagree with the tables beside it.
  //
  // The card STYLES are shared rather than copied: see _side-card.scss.

  // ── The date being looked at ───────────────────────────────────────────
  readonly selectedDate = signal(isoDate(new Date()));
  readonly viewingToday = computed(() => this.selectedDate() === isoDate(new Date()));
  readonly day = signal<DashboardDay | null>(null);
  readonly dayLoading = signal(false);
  readonly dayError = signal<ApiError | null>(null);

  /**
   * The line under the calendar - and null on today, which is what hides it.
   *
   * A date with no records behind it says so instead of rendering the zeros:
   * a zero there means "we have no record of that day", which is a different
   * claim from "the farm was empty". See DashboardDay.historyComplete.
   */
  readonly dayState = computed<string | null>(() => {
    const t = this.t();
    if (this.viewingToday()) {
      return null;
    }
    if (this.dayLoading()) {
      return t.dayLoading;
    }
    if (this.dayError()) {
      return t.dayFailed;
    }
    const dated = this.day();
    if (dated && !dated.historyComplete) {
      return `${t.dayNoHistory} ${dated.historyStartsOn}.`;
    }
    return `${t.dayViewing} ${this.selectedDate()}.`;
  });

  /**
   * Cycles by outcome, ON THE SELECTED DATE.
   *
   * Worked out here rather than asked for: every cycle carries the two dates
   * that decide it, so the answer is arithmetic on data already on the page.
   *
   *   running   stocked on or before the date, and not yet closed on it
   *   harvested closed as HARVESTED on or before the date
   *   failed    the same, for FAILED
   *   total     everything that had come into existence by then
   *
   * On TODAY it reduces to the plain status counts, because a cycle that is
   * still ACTIVE has no harvest date and every closed one has a date in the
   * past. The three closing statuses are the backend's (see
   * CycleService.requireClosingOutcome), and the total is counted separately
   * so a fourth outcome added server-side shows up as a gap rather than
   * vanishing into a sum that no longer adds up.
   */
  readonly cycleSummary = computed(() => {
    const t = this.t();
    const date = this.selectedDate();
    const cycles = this.cycles();

    const existedBy = cycles.filter((cycle) => cycle.stockingDate <= date);

    // "Closed by this date" needs BOTH the status and the date, because a
    // closed cycle can carry no harvest date at all: closeCycle always writes
    // one now, but rows predating that do not have it. Treating a missing date
    // as "still running" would have shown a harvested cycle as active on every
    // date - so an undated close counts from the cycle's own start, which is
    // the most that can honestly be said about it.
    // `!cycle.actualHarvestDate` rather than `=== null`: the field is absent
    // entirely on a cycle fetched by a query that does not ask for it, and an
    // absent date has to mean the same as a missing one here.
    const closedBy = (cycle: Cycle) =>
      cycle.status !== CYCLE_ACTIVE &&
      (!cycle.actualHarvestDate || cycle.actualHarvestDate <= date);

    const outcomeBy = (status: string) =>
      existedBy.filter((cycle) => cycle.status === status && closedBy(cycle)).length;
    const running = existedBy.filter((cycle) => !closedBy(cycle)).length;

    return [
      { label: t.chipCyclesTotal, value: existedBy.length },
      { label: t.chipCyclesActive, value: running },
      { label: t.chipCyclesHarvested, value: outcomeBy('HARVESTED') },
      { label: t.chipCyclesFailed, value: outcomeBy('FAILED') },
    ];
  });

  /** The rail's own status labels - the table's labels, in the same words. */
  unitStatusLabel(status: string): string {
    const t = this.t();
    switch (status) {
      case 'ACTIVE':
        return t.unitStatusActive;
      case 'IDLE':
        return t.unitStatusIdle;
      case 'MAINTENANCE':
        return t.unitStatusMaintenance;
      default:
        return status;
    }
  }

  /** A unit type's words - the rail, the table, the form and the cycle picker all use this. */
  unitTypeLabel(type: string): string {
    return unitTypeLabel(type, this.languageService.lang());
  }

  /**
   * Units by status - from the dated answer when there is one.
   *
   * This is the card that CANNOT be worked out here for a past date: the unit
   * list carries today's status and no creation date, so a unit built last
   * week would be counted into the week before it existed.
   */
  readonly unitsByStatus = computed(() => {
    const dated = this.day();
    if (!dated) {
      return this.bars(UNIT_STATUSES, (unit) => unit.status);
    }
    // MAINTENANCE is 0 on any past date and that is the honest answer: no code
    // path has ever written that status. The row stays so the card does not
    // change shape with the date.
    return this.scale(UNIT_STATUSES, {
      ACTIVE: dated.unitsActive,
      IDLE: dated.unitsIdle,
      MAINTENANCE: 0,
    });
  });

  /** Units by type - the one breakdown the cycles table cannot show. */
  readonly unitsByType = computed(() => {
    const dated = this.day();
    if (!dated) {
      return this.bars(UNIT_TYPES, (unit) => unit.type);
    }
    // A type with no units that day is absent from the answer; the zero comes
    // from OUR list, so the card keeps its three rows whatever the date holds.
    const counts = Object.fromEntries(UNIT_TYPES.map((type) => [type, 0])) as Record<
      (typeof UNIT_TYPES)[number],
      number
    >;
    for (const row of dated.unitsByType) {
      if (row.type in counts) {
        counts[row.type as (typeof UNIT_TYPES)[number]] = row.count;
      }
    }
    return this.scale(UNIT_TYPES, counts);
  });

  /**
   * A bar row per value, scaled against the BIGGEST count rather than the
   * total: with three units split 1/2/0 a share-of-total bar would be a
   * sliver, and the rail is 300px wide to begin with.
   */
  private bars<T extends string>(
    values: readonly T[],
    pick: (unit: ProductionUnit) => string,
  ): { key: T; count: number; percent: number }[] {
    const units = this.units();
    return this.scale(
      values,
      Object.fromEntries(
        values.map((value) => [value, units.filter((unit) => pick(unit) === value).length]),
      ) as Record<T, number>,
    );
  }

  /** Counts to bars. Shared so the live and the dated cards scale alike. */
  private scale<T extends string>(
    values: readonly T[],
    counts: Record<T, number>,
  ): { key: T; count: number; percent: number }[] {
    const max = Math.max(1, ...values.map((value) => counts[value]));
    return values.map((value) => ({
      key: value,
      count: counts[value],
      percent: Math.round((counts[value] / max) * 100),
    }));
  }

  // ── Moving between dates ───────────────────────────────────────────────

  selectDate(date: Date): void {
    const iso = isoDate(date);
    if (iso === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(iso);
    this.loadDay();
  }

  backToToday(): void {
    this.selectedDate.set(isoDate(new Date()));
    this.day.set(null);
    this.dayError.set(null);
    this.datePicker()?.resetWeek();
  }

  /**
   * Fetches the selected date - or drops back to the live numbers if the
   * selection IS today.
   *
   * Today deliberately does not go through `dashboardOnDate`: this screen's
   * own query already answered for today, and asking a second time by a second
   * route is how a screen ends up showing two different numbers for one day.
   */
  private loadDay(): void {
    if (this.viewingToday()) {
      this.day.set(null);
      this.dayError.set(null);
      return;
    }

    this.dayLoading.set(true);
    this.dayError.set(null);

    this.graphqlService
      .query<DashboardDayData>(DAY_QUERY, { date: this.selectedDate() })
      .subscribe({
        next: (data) => {
          this.day.set(data.dashboardOnDate);
          this.dayLoading.set(false);
        },
        error: (err: unknown) => {
          // The date stays selected: dropping silently back to today would
          // leave the strip highlighting a day the numbers are not about.
          this.dayError.set(isApiError(err) ? err : UNKNOWN_FAILURE);
          this.day.set(null);
          this.dayLoading.set(false);
        },
      });
  }

  /**
   * The selected cycle as an OBJECT, resolved against what the backend just
   * returned for the active farm - never from the stored id alone. A cycle
   * that is not in this farm's list is not selected, whatever localStorage
   * says. See CycleSelectionService.
   */
  readonly selectedCycle = computed<Cycle | null>(() => {
    const id = this.selectedCycleId();
    return id === null ? null : (this.cycles().find((c) => Number(c.cycleId) === id) ?? null);
  });

  /**
   * The cycle rows whose predicted harvest date has arrived, by id.
   *
   * READ-ONLY, and the comparison is the whole implementation: an ACTIVE
   * cycle whose `expectedHarvestDate` is today or earlier. It sets a signal
   * nothing writes back from, sends no request and moves no status - see the
   * class note. ISO dates compare correctly as strings, so there is no date
   * parsing here to get wrong across time zones.
   */
  readonly readyCycleIds = computed<ReadonlySet<string>>(() => {
    const now = today();
    return new Set(
      this.cycles()
        .filter((cycle) => isReadyToHarvest(cycle, now))
        .map((cycle) => cycle.cycleId),
    );
  });

  readonly selectedIsReady = computed(() => {
    const cycle = this.selectedCycle();
    return cycle !== null && this.readyCycleIds().has(cycle.cycleId);
  });

  /** A closed cycle shows its harvest instead of its actions. */
  readonly selectedIsClosed = computed(() => {
    const cycle = this.selectedCycle();
    return cycle !== null && cycle.status !== CYCLE_ACTIVE;
  });

  readonly selectedIsActive = computed(() => {
    const cycle = this.selectedCycle();
    return cycle !== null && cycle.status === CYCLE_ACTIVE;
  });

  readonly unitOpen = signal(false);
  readonly cycleOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly unitCodeError = signal<string | null>(null);
  readonly cycleFieldError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /** The cycle the close form is filling in, or null while it is shut. */
  readonly closeTarget = signal<Cycle | null>(null);
  readonly closing = signal(false);
  readonly closeFieldError = signal<string | null>(null);
  readonly closeFormError = signal<string | null>(null);

  /**
   * A refused close kept on screen after the modal has gone.
   *
   * CYCLE_ALREADY_CLOSED is the case it exists for: it is not a retryable
   * failure, it is the answer that this harvest is already recorded. Holding
   * the FAILURE rather than the rendered line keeps it correct if the
   * language is switched while it is showing.
   */
  readonly closeActionError = signal<ApiError | null>(null);
  readonly closeActionErrorMessage = computed(() => this.messageFor(this.closeActionError()));

  // ------------------------------------------------------------------
  // Harvest events
  // ------------------------------------------------------------------

  /**
   * Presentation only, like HasPermission: the backend refuses the calls and
   * nulls the money regardless. Held as computeds because the template needs
   * them combined with cycle state, which the structural directive cannot do.
   */
  readonly canRecordHarvest = computed(() =>
    this.authService.hasPermission(PERMISSION.RECORD_HARVEST),
  );
  readonly canViewFinance = computed(() => this.authService.hasPermission(PERMISSION.VIEW_FINANCE));
  readonly canEditCycle = computed(() => this.authService.hasPermission(PERMISSION.EDIT_CYCLE));

  /** Deleting changes the totals a close would sum - so only while it can still close. */
  readonly canDeleteEvents = computed(() => this.selectedIsActive() && this.canRecordHarvest());

  readonly harvestEvents = signal<readonly HarvestEvent[]>([]);
  readonly eventsLoading = signal(false);
  readonly eventsError = signal<ApiError | null>(null);
  readonly eventsErrorMessage = computed(() => this.messageFor(this.eventsError()));

  /**
   * The cycle the events on screen belong to. The close form reads the tally
   * only when this matches the cycle it is closing - a list still loading for
   * a different cycle is not evidence about this one.
   */
  private readonly eventsCycleId = signal<string | null>(null);

  /**
   * A refused record/delete kept on the panel after its modal has gone -
   * CYCLE_ALREADY_CLOSED above all, which is an answer, not a retryable failure.
   */
  readonly eventsActionError = signal<ApiError | null>(null);
  readonly eventsActionErrorMessage = computed(() => this.messageFor(this.eventsActionError()));

  /**
   * The running tally, summed exactly as closeCycle will sum it:
   * alive-out = SOLD + REMOVED, mortality = DIED, weight = SOLD + REMOVED.
   *
   * Revenue is summed in CENTS so a column of 0.1s does not drift, and it is
   * null - rendered as a dash - the moment any SOLD event's amount is masked:
   * a partial sum would be a wrong number presented as a right one.
   */
  readonly eventTally = computed(() => {
    let aliveOut = 0;
    let mortality = 0;
    let weightKg = 0;
    let revenueCents: number | null = 0;
    for (const event of this.harvestEvents()) {
      if (event.reason === 'DIED') {
        mortality += event.fishCount;
        continue;
      }
      aliveOut += event.fishCount;
      weightKg += event.weightKg ?? 0;
      if (event.reason === 'SOLD') {
        revenueCents =
          revenueCents === null || event.saleAmount === null || !Number.isFinite(event.saleAmount)
            ? null
            : revenueCents + Math.round(event.saleAmount * 100);
      }
    }
    return {
      aliveOut,
      mortality,
      weightKg: Math.round(weightKg * 1000) / 1000,
      revenue: revenueCents === null ? null : revenueCents / 100,
    };
  });

  /**
   * Every fish accounted for (alive-out + mortality) against the stocked
   * count, for an ACTIVE cycle whose events are on screen.
   *
   * PRESENTATION ONLY. 'reached' is a reminder to close by hand and
   * 'exceeded' a warning that the stocking estimate or an entry may be off -
   * neither closes anything, sends anything, or stands in the way of a record:
   * the backend deliberately accepts more than was stocked, because a low
   * fingerling estimate is an ordinary thing. Null (below, or nothing to
   * compare yet) shows nothing.
   */
  readonly stockCheck = computed<{
    state: 'reached' | 'exceeded';
    message: string;
  } | null>(() => {
    const cycle = this.selectedCycle();
    if (
      cycle === null ||
      cycle.status !== CYCLE_ACTIVE ||
      this.eventsCycleId() !== cycle.cycleId ||
      !Number.isFinite(cycle.fingerlingsCount)
    ) {
      return null;
    }
    const tally = this.eventTally();
    const accounted = tally.aliveOut + tally.mortality;
    const stocked = cycle.fingerlingsCount;
    if (accounted < stocked) {
      return null;
    }
    const state = accounted === stocked ? 'reached' : 'exceeded';
    const t = this.t();
    const template = state === 'reached' ? t.stockReachedBanner : t.stockExceededBanner;
    return {
      state,
      message: template
        .replaceAll('{accounted}', String(accounted))
        .replaceAll('{stocked}', String(stocked)),
    };
  });

  /** The latest event date, or null. A close cannot be dated before it. */
  readonly lastEventDate = computed<string | null>(() =>
    this.harvestEvents().reduce<string | null>(
      (latest, event) => (latest === null || event.eventDate > latest ? event.eventDate : latest),
      null,
    ),
  );

  readonly eventOpen = signal(false);
  /** The event the form is CORRECTING, or null when it records a new one. */
  readonly editTarget = signal<HarvestEvent | null>(null);
  readonly recordingEvent = signal(false);

  /** Correcting the stocked count - `edit_cycle`, ACTIVE cycles only. */
  readonly fingerlingsOpen = signal(false);
  readonly correctingFingerlings = signal(false);
  readonly fingerlingsError = signal<string | null>(null);
  readonly fingerlingsForm = this.formBuilder.nonNullable.group({
    fingerlingsCount: ['' as NumberBox, [Validators.required]],
  });
  readonly eventFieldError = signal<string | null>(null);
  readonly eventFormError = signal<string | null>(null);

  readonly deleteTarget = signal<HarvestEvent | null>(null);
  readonly deletingEvent = signal(false);

  readonly eventColumns = computed<DataTableColumn<HarvestEvent>[]>(() => {
    const t = this.t();
    return [
      { label: t.colEventDate, value: (event) => event.eventDate },
      { label: t.colEventReason, value: (event) => this.reasonLabel(event.reason) },
      { label: t.colEventCount, value: (event) => String(event.fishCount) },
      {
        label: t.colEventWeight,
        value: (event) => (event.weightKg === null ? t.dash : String(event.weightKg)),
        muted: (event) => event.weightKg === null,
      },
      {
        label: t.colEventSale,
        value: (event) => this.money(event.saleAmount),
        muted: (event) => event.saleAmount === null,
      },
    ];
  });

  readonly eventKey = (event: HarvestEvent): string => event.harvestEventId;

  /** The event date's upper bound - farm-time today, read fresh each render. */
  get todayDate(): string {
    return today();
  }

  readonly unitForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required]],
    type: ['TANK', [Validators.required]],
    sizeM3: ['' as NumberBox],
    waterSource: [''],
  });

  readonly cycleForm = this.formBuilder.nonNullable.group({
    unitId: ['', [Validators.required]],
    speciesId: ['', [Validators.required]],
    stockingDate: [today(), [Validators.required]],
    fingerlingsCount: ['' as NumberBox, [Validators.required]],
    survivalRateEstimate: ['' as NumberBox],
    stockingAgeMonths: ['' as NumberBox],
    fingerlingCost: ['' as NumberBox],
  });

  /**
   * The close form. `outcome` starts on HARVESTED because that is the
   * ordinary end of a cycle; FAILED is the exception and should be a
   * deliberate choice, not the thing you get by not looking.
   *
   * No count, no weight: since V25 those are summed from the harvest events.
   */
  readonly closeForm = this.formBuilder.nonNullable.group({
    outcome: ['HARVESTED' as CycleOutcome, [Validators.required]],
    actualHarvestDate: [today(), [Validators.required]],
    notes: [''],
  });

  /**
   * A harvest event. `reason` starts EMPTY on purpose: SOLD, DIED and REMOVED
   * ask for different things and mean different money, so the choice is made,
   * not inherited from a default nobody looked at.
   */
  readonly eventForm = this.formBuilder.nonNullable.group({
    eventDate: [today(), [Validators.required]],
    fishCount: ['' as NumberBox, [Validators.required]],
    reason: ['' as HarvestReason | ''],
    weightKg: ['' as NumberBox],
    saleAmount: ['' as NumberBox],
  });

  /**
   * The chosen reason as a SIGNAL. The app is zoneless, so the template's
   * "show the sale amount only for SOLD" must hang off something that
   * notifies - a form value read in the template would not re-render.
   */
  readonly eventReason = toSignal(this.eventForm.controls.reason.valueChanges, {
    initialValue: this.eventForm.controls.reason.value,
  });
  readonly eventIsSold = computed(() => this.eventReason() === 'SOLD');

  readonly closeOutcome = toSignal(this.closeForm.controls.outcome.valueChanges, {
    initialValue: this.closeForm.controls.outcome.value,
  });

  readonly unitColumns = computed<DataTableColumn<ProductionUnit>[]>(() => {
    const t = this.t();
    return [
      { label: t.colUnitCode, value: (unit) => unit.code },
      { label: t.colUnitType, value: (unit) => this.unitTypeLabel(unit.type) },
      {
        label: t.colUnitSize,
        value: (unit) => (unit.sizeM3 === null ? t.noSize : String(unit.sizeM3)),
        muted: (unit) => unit.sizeM3 === null,
      },
      {
        label: t.colUnitSource,
        value: (unit) => unit.waterSource || t.noSource,
        muted: (unit) => !unit.waterSource,
      },
      { label: t.colUnitStatus, value: (unit) => unit.status },
    ];
  });

  readonly cycleColumns = computed<DataTableColumn<Cycle>[]>(() => {
    const t = this.t();
    const ready = this.readyCycleIds();
    return [
      { label: t.colCycleUnit, value: (cycle) => cycle.unit.code },
      { label: t.colCycleSpecies, value: (cycle) => cycle.speciesName },
      { label: t.colCycleStocked, value: (cycle) => cycle.stockingDate },
      { label: t.colCycleFingerlings, value: (cycle) => String(cycle.fingerlingsCount) },
      {
        label: t.colCycleExpected,
        // The badge is part of the CELL because that is where the date it
        // refers to is. It says the prediction has come due and nothing more;
        // a column cannot mutate anything, which is exactly the property this
        // indicator needs to have.
        value: (cycle) => {
          const expected = cycle.expectedHarvestDate ?? t.notSet;
          return ready.has(cycle.cycleId) ? `${expected} - ${t.readyBadge}` : expected;
        },
        muted: (cycle) => !cycle.expectedHarvestDate,
      },
      { label: t.colCycleStatus, value: (cycle) => cycle.status },
    ];
  });

  readonly unitKey = (unit: ProductionUnit): string => unit.unitId;
  readonly cycleKey = (cycle: Cycle): string => cycle.cycleId;

  /**
   * Loads on creation, and again whenever the active farm changes.
   *
   * An effect rather than ngOnInit for the reason the dashboard uses one: for
   * ROOT a farm switch is a different set of units and cycles entirely, and
   * leaving the old ones on screen would let somebody select a cycle that
   * belongs to a farm they have left.
   */
  private readonly load = effect(() => {
    this.farmSelection.selectedFarmId();
    this.fetch();
  });

  /**
   * The selected cycle's id as a string - a computed, so it only notifies
   * when the id CHANGES. Keying the events load on `selectedCycle()` itself
   * would refetch on every context reload, since each reload builds new
   * objects for the same cycle.
   */
  private readonly selectedKey = computed(() => this.selectedCycle()?.cycleId ?? null);

  private readonly loadEvents = effect(() => {
    const id = this.selectedKey();
    untracked(() => this.fetchEvents(id));
  });

  fetchEvents(id: string | null = this.selectedKey()): void {
    this.eventsError.set(null);
    this.eventsActionError.set(null);
    this.eventsCycleId.set(null);
    this.harvestEvents.set([]);
    if (id === null) {
      this.eventsLoading.set(false);
      return;
    }

    this.eventsLoading.set(true);
    this.productionService.harvestEvents(Number(id)).subscribe({
      next: (events) => {
        // A late answer for a cycle that is no longer selected is dropped:
        // it would put one cycle's tally under another's name.
        if (this.selectedKey() !== id) {
          return;
        }
        this.harvestEvents.set(events);
        this.eventsCycleId.set(id);
        this.eventsLoading.set(false);
      },
      error: (err: unknown) => {
        if (this.selectedKey() !== id) {
          return;
        }
        this.eventsError.set(asApiError(err));
        this.eventsLoading.set(false);
      },
    });
  }

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.productionService.loadContext().subscribe({
      next: (context) => {
        this.units.set(context.productionUnits);
        this.cycles.set(context.cycles);
        this.species.set(context.species);
        this.loading.set(false);
        this.syncSelection(context.cycles);
      },
      error: (err: unknown) => {
        // The tables are emptied rather than left showing the previous farm's
        // rows: a screen that says nothing loaded must not still be offering
        // a cycle to select.
        this.units.set([]);
        this.cycles.set([]);
        this.species.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * Drops a selection the backend no longer offers.
   *
   * The stored id survives a farm switch, a deleted cycle and a browser that
   * has last week's value in it. Any of those would otherwise leave the log
   * screens pointing at a cycle this farm does not have.
   */
  private syncSelection(cycles: readonly Cycle[]): void {
    const id = this.selectedCycleId();
    if (id !== null && !cycles.some((cycle) => Number(cycle.cycleId) === id)) {
      this.cycleSelection.clear();
    }
  }

  selectCycle(cycle: Cycle): void {
    this.cycleSelection.select(Number(cycle.cycleId));
  }

  clearSelection(): void {
    this.cycleSelection.clear();
  }

  goToWaterQuality(): void {
    void this.router.navigateByUrl('/water-quality');
  }

  openUnitForm(): void {
    this.unitForm.reset({ code: '', type: 'TANK', sizeM3: '', waterSource: '' });
    this.formError.set(null);
    this.unitCodeError.set(null);
    this.unitOpen.set(true);
  }

  closeUnitForm(): void {
    if (!this.saving()) {
      this.unitOpen.set(false);
    }
  }

  submitUnit(): void {
    this.formError.set(null);
    this.unitCodeError.set(null);

    const { code, type, sizeM3, waterSource } = this.unitForm.getRawValue();
    if (!code.trim()) {
      this.unitForm.markAllAsTouched();
      this.unitCodeError.set(this.t().errorUnitCodeRequired);
      return;
    }

    // Built BEFORE the flag goes up, deliberately. Anything that throws while
    // reading the form must not leave `saving` stuck true: the button would
    // spin for ever and closeUnitForm refuses to close while it is set, so
    // the modal becomes a trap with no way out but a page reload. Whatever
    // this line can throw, it throws with the form still closable.
    const input = {
      code: code.trim(),
      type,
      sizeM3: optionalNumber(sizeM3),
      waterSource: waterSource.trim() || null,
    };

    this.saving.set(true);
    this.productionService.createUnit(input).subscribe({
      next: () => {
        this.saving.set(false);
        this.unitOpen.set(false);
        this.toastMessage.set(this.t().unitCreatedToast);
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.showUnitError(asApiError(err));
      },
    });
  }

  openCycleForm(): void {
    this.cycleForm.reset({
      unitId: this.units()[0]?.unitId ?? '',
      speciesId: this.species()[0]?.speciesId ?? '',
      stockingDate: today(),
      fingerlingsCount: '',
      survivalRateEstimate: '',
      stockingAgeMonths: '',
      fingerlingCost: '',
    });
    this.formError.set(null);
    this.cycleFieldError.set(null);
    this.cycleOpen.set(true);
  }

  closeCycleForm(): void {
    if (!this.saving()) {
      this.cycleOpen.set(false);
    }
  }

  submitCycle(): void {
    this.formError.set(null);
    this.cycleFieldError.set(null);

    const raw = this.cycleForm.getRawValue();
    const t = this.t();

    // Each of these is a field the backend REQUIRES and the form can check
    // without a round trip - not a judgement about the value itself.
    if (!raw.unitId) {
      this.cycleFieldError.set(t.errorCycleUnitRequired);
      return;
    }
    if (!raw.speciesId) {
      this.cycleFieldError.set(t.errorCycleSpeciesRequired);
      return;
    }
    if (!raw.stockingDate) {
      this.cycleFieldError.set(t.errorCycleStockedRequired);
      return;
    }
    const fingerlings = optionalNumber(raw.fingerlingsCount);
    if (fingerlings === null) {
      this.cycleFieldError.set(t.errorCycleFingerlingsRequired);
      return;
    }

    // Optional, so blank is not an error - but a NEGATIVE age is, and the
    // backend would only answer that in Swahili prose. Its upper bound (below
    // the species' growthMonthsAvg) is the backend's to enforce: this screen
    // does not know that number for the chosen species.
    const stockingAgeMonths = optionalNumber(raw.stockingAgeMonths);
    if (stockingAgeMonths !== null && stockingAgeMonths < 0) {
      this.cycleFieldError.set(t.errorCycleAgeNegative);
      return;
    }

    // Optional money. Blank is null ("not recorded"), never 0 - a zero cost
    // is a claim, and the backend refuses it anyway.
    const fingerlingCost = optionalNumber(raw.fingerlingCost);
    if (fingerlingCost !== null && fingerlingCost <= 0) {
      this.cycleFieldError.set(t.errorFingerlingCostPositive);
      return;
    }

    // Same rule as submitUnit: read the form fully before raising the flag,
    // so nothing here can wedge the modal shut.
    const input = {
      unitId: raw.unitId,
      speciesId: raw.speciesId,
      stockingDate: raw.stockingDate,
      fingerlingsCount: fingerlings,
      survivalRateEstimate: optionalNumber(raw.survivalRateEstimate),
      // Blank travels as null, not 0: the backend's own default IS 0, so
      // there is no difference in the result - but sending a number nobody
      // typed is how a default quietly becomes a claim.
      stockingAgeMonths,
      fingerlingCost,
    };

    this.saving.set(true);
    this.productionService.createCycle(input).subscribe({
      next: (cycle) => {
        this.saving.set(false);
        this.cycleOpen.set(false);
        this.toastMessage.set(this.t().cycleCreatedToast);
        // Selecting it immediately is the point of creating one: the next
        // thing anybody does is record against it.
        this.cycleSelection.select(Number(cycle.cycleId));
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(this.messageFor(asApiError(err), true));
      },
    });
  }

  // ------------------------------------------------------------------
  // Closing a cycle. The ONLY thing in this app that ends one.
  // ------------------------------------------------------------------

  openCloseForm(cycle: Cycle): void {
    this.closeForm.reset({
      outcome: 'HARVESTED',
      // Today, because a harvest is normally recorded the day it happens.
      // It is still a date box: a harvest entered late is the common case.
      actualHarvestDate: today(),
      notes: '',
    });
    this.closeFieldError.set(null);
    this.closeFormError.set(null);
    this.closeActionError.set(null);
    this.closeTarget.set(cycle);
  }

  /**
   * The events tally for the cycle being closed, or null when the list on
   * screen is not (yet) that cycle's. The close form previews it, and a
   * refused HARVESTED is only named "no fish out alive" when this says so.
   */
  readonly closeTally = computed(() => {
    const cycle = this.closeTarget();
    return cycle !== null && this.eventsCycleId() === cycle.cycleId ? this.eventTally() : null;
  });

  /** HARVESTED with no SOLD/REMOVED recorded: warn before the backend refuses. */
  readonly closeNoAliveOut = computed(
    () => this.closeOutcome() === 'HARVESTED' && this.closeTally()?.aliveOut === 0,
  );

  closeCloseForm(): void {
    if (!this.closing()) {
      this.closeTarget.set(null);
    }
  }

  dismissCloseActionError(): void {
    this.closeActionError.set(null);
  }

  submitClose(): void {
    this.closeFieldError.set(null);
    this.closeFormError.set(null);

    const cycle = this.closeTarget();
    if (!cycle) {
      return;
    }

    const raw = this.closeForm.getRawValue();
    const t = this.t();
    const lang = this.languageService.lang();

    if (!raw.outcome) {
      this.closeFieldError.set(t.errorOutcomeRequired);
      return;
    }
    if (!raw.actualHarvestDate) {
      this.closeFieldError.set(t.errorHarvestDateRequired);
      return;
    }

    // Checked here because the events are already on screen and the rule is
    // a plain comparison; the backend enforces it too.
    const lastEvent = this.closeTally() === null ? null : this.lastEventDate();
    if (lastEvent !== null && raw.actualHarvestDate < lastEvent) {
      this.closeFieldError.set(
        cycleCloseRuleMessage(CYCLE_CLOSE_RULE.HARVEST_BEFORE_LAST_EVENT, lang),
      );
      return;
    }

    // HARVESTED with no fish out alive is NOT blocked here, only warned about
    // (closeNoAliveOut): the list on screen can be stale - somebody may have
    // recorded a sale since - and the backend holds the real sum. Its refusal
    // is named in showCloseError.
    //
    // A harvest date before the stocking date is likewise the backend's to
    // judge; see showCloseError.
    //
    // Read fully before the flag goes up, as everywhere else on this screen.
    const input = {
      cycleId: Number(cycle.cycleId),
      outcome: raw.outcome,
      actualHarvestDate: raw.actualHarvestDate,
      notes: raw.notes.trim() || null,
    };

    this.closing.set(true);
    this.productionService.closeCycle(input).subscribe({
      next: () => {
        this.closing.set(false);
        this.closeTarget.set(null);
        this.toastMessage.set(this.t().cycleClosedToast);
        // Re-read rather than patch the row: every total is summed by the
        // backend and `actualSurvivalRate` computed by the database, so the
        // only place the real numbers exist is the answer to a fresh query.
        this.fetch();
      },
      error: (err: unknown) => {
        this.closing.set(false);
        this.showCloseError(asApiError(err), cycle);
      },
    });
  }

  /**
   * A refused close.
   *
   * CYCLE_ALREADY_CLOSED shuts the form and re-reads. That is the graceful
   * answer because retrying cannot work - the harvest is recorded, and what
   * the user needs now is to SEE it, not to keep a form open over it.
   *
   * A VALIDATION_ERROR is named from error-messages.ts when the screen can
   * see which rule broke - dates inverted against stocking, or HARVESTED over
   * an events list with nobody out alive. The comparison is ours, not a
   * reading of the backend's prose; every other VALIDATION_ERROR keeps the
   * backend's own sentence, which names the rule better than we could.
   */
  private showCloseError(error: ApiError, cycle: Cycle): void {
    if (error.errorCode === ERROR_CODE.CYCLE_ALREADY_CLOSED) {
      this.closeTarget.set(null);
      this.closeActionError.set(error);
      this.fetch();
      return;
    }

    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      const lang = this.languageService.lang();
      const { actualHarvestDate: entered, outcome } = this.closeForm.getRawValue();
      if (entered && cycle.stockingDate && entered < cycle.stockingDate) {
        this.closeFormError.set(
          cycleCloseRuleMessage(CYCLE_CLOSE_RULE.HARVEST_BEFORE_STOCKING, lang),
        );
        return;
      }
      if (outcome === 'HARVESTED' && this.closeTally()?.aliveOut === 0) {
        this.closeFormError.set(cycleCloseRuleMessage(CYCLE_CLOSE_RULE.HARVESTED_WITH_ZERO, lang));
        return;
      }
      this.closeFormError.set(error.message);
      return;
    }

    this.closeFormError.set(this.messageFor(error, true));
  }

  // ------------------------------------------------------------------
  // Harvest events: record, delete. `record_harvest`, ACTIVE cycles only.
  // ------------------------------------------------------------------

  openEventForm(): void {
    this.eventForm.reset({
      eventDate: today(),
      fishCount: '',
      reason: '',
      weightKg: '',
      saleAmount: '',
    });
    this.editTarget.set(null);
    this.eventFieldError.set(null);
    this.eventFormError.set(null);
    this.eventsActionError.set(null);
    this.eventOpen.set(true);
  }

  /**
   * The same form, filled with the event being corrected. Saving sends
   * correctHarvestEvent: the backend replaces the event in one transaction
   * and keeps the old row, so a typo no longer needs delete-then-record.
   */
  openEditEvent(event: HarvestEvent): void {
    const reason = (HARVEST_REASONS as readonly string[]).includes(event.reason)
      ? (event.reason as HarvestReason)
      : '';
    this.eventForm.reset({
      eventDate: event.eventDate,
      fishCount: event.fishCount,
      reason,
      weightKg: event.weightKg ?? '',
      saleAmount: event.saleAmount ?? '',
    });
    this.editTarget.set(event);
    this.eventFieldError.set(null);
    this.eventFormError.set(null);
    this.eventsActionError.set(null);
    this.eventOpen.set(true);
  }

  closeEventForm(): void {
    if (!this.recordingEvent()) {
      this.eventOpen.set(false);
      this.editTarget.set(null);
    }
  }

  // ------------------------------------------------------------------
  // Correcting the stocked count. `edit_cycle`, ACTIVE cycles only.
  // ------------------------------------------------------------------

  openFingerlingsForm(): void {
    const cycle = this.selectedCycle();
    if (!cycle) {
      return;
    }
    this.fingerlingsForm.reset({ fingerlingsCount: cycle.fingerlingsCount });
    this.fingerlingsError.set(null);
    this.closeActionError.set(null);
    this.fingerlingsOpen.set(true);
  }

  closeFingerlingsForm(): void {
    if (!this.correctingFingerlings()) {
      this.fingerlingsOpen.set(false);
    }
  }

  submitFingerlings(): void {
    this.fingerlingsError.set(null);

    const cycle = this.selectedCycle();
    if (!cycle || cycle.status !== CYCLE_ACTIVE) {
      return;
    }

    const count = optionalNumber(this.fingerlingsForm.getRawValue().fingerlingsCount);
    if (count === null || count <= 0 || !Number.isInteger(count)) {
      this.fingerlingsError.set(this.t().errorFingerlingsPositive);
      return;
    }

    const cycleId = Number(cycle.cycleId);
    this.correctingFingerlings.set(true);
    this.productionService.correctFingerlingsCount(cycleId, count).subscribe({
      next: () => {
        this.correctingFingerlings.set(false);
        this.fingerlingsOpen.set(false);
        this.toastMessage.set(this.t().fingerlingsCorrectedToast);
        // Re-read the context: the stocked count lives on the cycle row, and
        // the accounted-for signal compares against whatever that row says.
        this.fetch();
      },
      error: (err: unknown) => {
        this.correctingFingerlings.set(false);
        const error = asApiError(err);
        // Closed meanwhile: not retryable. Same handling as a refused close.
        if (error.errorCode === ERROR_CODE.CYCLE_ALREADY_CLOSED) {
          this.fingerlingsOpen.set(false);
          this.closeActionError.set(error);
          this.fetch();
          return;
        }
        this.fingerlingsError.set(this.messageFor(error, true));
      },
    });
  }

  dismissEventsActionError(): void {
    this.eventsActionError.set(null);
  }

  submitEvent(): void {
    this.eventFieldError.set(null);
    this.eventFormError.set(null);

    const cycle = this.selectedCycle();
    if (!cycle || cycle.status !== CYCLE_ACTIVE) {
      return;
    }

    const raw = this.eventForm.getRawValue();
    const t = this.t();
    const lang = this.languageService.lang();

    if (!raw.reason) {
      this.eventFieldError.set(t.errorEventReasonRequired);
      return;
    }
    if (!raw.eventDate) {
      this.eventFieldError.set(t.errorEventDateRequired);
      return;
    }
    if (raw.eventDate > today()) {
      this.eventFieldError.set(harvestEventRuleMessage(HARVEST_EVENT_RULE.IN_FUTURE, lang));
      return;
    }
    if (raw.eventDate < cycle.stockingDate) {
      this.eventFieldError.set(harvestEventRuleMessage(HARVEST_EVENT_RULE.BEFORE_STOCKING, lang));
      return;
    }

    const fishCount = optionalNumber(raw.fishCount);
    if (fishCount === null || fishCount <= 0 || !Number.isInteger(fishCount)) {
      this.eventFieldError.set(t.errorEventCountPositive);
      return;
    }

    const sold = raw.reason === 'SOLD';
    const weightKg = optionalNumber(raw.weightKg);
    if (weightKg === null && sold) {
      this.eventFieldError.set(t.errorEventWeightRequiredSold);
      return;
    }
    if (weightKg !== null && weightKg <= 0) {
      this.eventFieldError.set(t.errorEventWeightPositive);
      return;
    }

    // DIED/REMOVED send null WHATEVER the hidden box holds: the backend
    // refuses any amount on a fish that was not sold, and a value typed
    // before the reason was changed must not ride along.
    let saleAmount: number | null = null;
    if (sold) {
      saleAmount = optionalNumber(raw.saleAmount);
      if (saleAmount === null) {
        this.eventFieldError.set(t.errorEventSaleRequired);
        return;
      }
      if (saleAmount <= 0) {
        this.eventFieldError.set(t.errorEventSalePositive);
        return;
      }
    }

    const input = {
      cycleId: Number(cycle.cycleId),
      eventDate: raw.eventDate,
      fishCount,
      weightKg,
      reason: raw.reason,
      saleAmount,
    };

    // Editing sends the SAME checked fields as a correction: the backend
    // replaces the old event in one transaction rather than adding a second.
    const editing = this.editTarget();
    const request = editing
      ? this.productionService.correctHarvestEvent({
          harvestEventId: Number(editing.harvestEventId),
          eventDate: input.eventDate,
          fishCount: input.fishCount,
          weightKg: input.weightKg,
          reason: input.reason,
          saleAmount: input.saleAmount,
        })
      : this.productionService.recordHarvestEvent(input);

    this.recordingEvent.set(true);
    request.subscribe({
      next: () => {
        this.recordingEvent.set(false);
        this.eventOpen.set(false);
        this.editTarget.set(null);
        this.toastMessage.set(editing ? this.t().eventCorrectedToast : this.t().eventRecordedToast);
        // Re-read, not append: the list is ordered and masked by the
        // backend, and the tally must be the sum of what it actually holds.
        this.fetchEvents();
      },
      error: (err: unknown) => {
        this.recordingEvent.set(false);
        this.showEventError(asApiError(err), 'record');
      },
    });
  }

  askDeleteEvent(event: HarvestEvent): void {
    this.eventsActionError.set(null);
    this.deleteTarget.set(event);
  }

  cancelDeleteEvent(): void {
    if (!this.deletingEvent()) {
      this.deleteTarget.set(null);
    }
  }

  confirmDeleteEvent(): void {
    const event = this.deleteTarget();
    if (!event || !this.canDeleteEvents()) {
      return;
    }

    this.deletingEvent.set(true);
    // `ID!` on the type, `Int!` on the mutation.
    this.productionService.deleteHarvestEvent(Number(event.harvestEventId)).subscribe({
      next: () => {
        this.deletingEvent.set(false);
        this.deleteTarget.set(null);
        this.toastMessage.set(this.t().eventDeletedToast);
        this.fetchEvents();
      },
      error: (err: unknown) => {
        this.deletingEvent.set(false);
        this.deleteTarget.set(null);
        this.showEventError(asApiError(err), 'delete');
      },
    });
  }

  /**
   * CYCLE_ALREADY_CLOSED means somebody closed the cycle meanwhile: the
   * modal goes, the refusal stays on the panel, and the context is re-read so
   * the controls disappear with the status. A record's VALIDATION_ERROR keeps
   * the backend's sentence - it names the field.
   */
  private showEventError(error: ApiError, action: 'record' | 'delete'): void {
    if (error.errorCode === ERROR_CODE.CYCLE_ALREADY_CLOSED) {
      this.eventOpen.set(false);
      this.eventsActionError.set(error);
      this.fetch();
      return;
    }
    if (action === 'record') {
      this.eventFormError.set(this.messageFor(error, true));
      return;
    }
    this.eventsActionError.set(error);
  }

  /** "Sold" / "Died" / "Removed". Unknown text passes through. */
  reasonLabel(reason: string): string {
    const t = this.t();
    switch (reason) {
      case 'SOLD':
        return t.reasonSOLD;
      case 'DIED':
        return t.reasonDIED;
      case 'REMOVED':
        return t.reasonREMOVED;
      default:
        return reason;
    }
  }

  reasonHint(reason: HarvestReason): string {
    const t = this.t();
    if (reason === 'SOLD') {
      return t.reasonHintSOLD;
    }
    return reason === 'DIED' ? t.reasonHintDIED : t.reasonHintREMOVED;
  }

  /**
   * A money field for display. NULL IS A DASH: the backend nulls money for
   * anyone without `view_finance`, and a null is "you may not see this" or
   * "never recorded" - never zero. Nothing else on this screen formats money.
   */
  money(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return this.t().dash;
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** "Harvested" / "Failed" for a status or an outcome. Unknown text passes through. */
  outcomeLabel(value: string): string {
    const t = this.t();
    if (value === 'HARVESTED') {
      return t.outcomeHARVESTED;
    }
    if (value === 'FAILED') {
      return t.outcomeFAILED;
    }
    return value;
  }

  /**
   * A survival rate as a percentage.
   *
   * Both rates go through this ONE function so the estimate and the actual
   * are rendered identically - the pair is only readable as a comparison if
   * nothing but the number differs between them.
   */
  survivalPercent(rate: number | null): string | null {
    if (rate === null || rate === undefined || !Number.isFinite(rate)) {
      return null;
    }
    return `${Math.round(rate * 1000) / 10}%`;
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /**
   * CONFLICT here has one cause and it is worth naming: `production_units`
   * carries UNIQUE(farm_id, code), so a duplicate code is the only collision
   * this mutation can produce. Everything else falls through to the backend's
   * own sentence, which for VALIDATION_ERROR names the accepted unit types.
   */
  private showUnitError(error: ApiError): void {
    if (error.errorCode === ERROR_CODE.CONFLICT) {
      this.unitCodeError.set(this.t().errorUnitConflict);
      return;
    }
    this.formError.set(this.messageFor(error, true));
  }

  private messageFor(error: ApiError | null, preferBackendMessage = false): string | null {
    return error ? apiErrorMessage(error, this.languageService.lang(), preferBackendMessage) : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

/**
 * What a control bound to `<input type="number">` ACTUALLY holds.
 *
 * Declared, rather than left as the `string` that a `''` default would infer,
 * because the inferred type is a lie - see optionalNumber below for the three
 * shapes Angular really writes, and for the crash that came of believing the
 * inference. Every number box on this screen carries this type so that a test
 * setting a real number is a passing test and not a compile error.
 */
type NumberBox = string | number | null;

/** "" -> null, so an untouched optional field is omitted rather than sent as 0. */
/**
 * A numeric form field's value, whatever shape Angular handed us.
 *
 * IT IS NOT ALWAYS A STRING, and assuming it was is what broke the unit form.
 * These controls are declared with a `''` default, so the reactive form types
 * them as `string` - but every one of them is bound to an
 * `<input type="number">`, and that makes Angular use NumberValueAccessor,
 * which writes:
 *
 *   ''      before the field is ever touched (the reset value, untouched)
 *   12.5    a NUMBER once something is typed
 *   null    once a typed value is cleared again
 *
 * So `raw.trim()` threw `TypeError: raw.trim is not a function` the moment
 * anybody actually filled in a size - and because the throw happened after
 * `saving.set(true)`, the Save button span forever AND the modal refused to
 * close (closeUnitForm only closes when it is not saving). Nothing reached
 * the backend; there was no request to see fail.
 *
 * Accepting all three shapes here fixes the size, the fingerling count and
 * the survival rate at once, since all three are number inputs.
 */
function optionalNumber(raw: NumberBox | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The farm's timezone. Its "today" is the backend's "today" (EAT, the zone
 * the reminders use) - so a default date and the "not in the future" check
 * mean the same day the server does, whatever the laptop's zone.
 */
const FARM_TIME_ZONE = 'Africa/Nairobi';

/** Today as YYYY-MM-DD in FARM_TIME_ZONE; the browser's own day if Intl refuses the zone. */
function today(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: FARM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Has this cycle's predicted harvest date arrived?
 *
 * A pure function of the row and today's date - it reads nothing and writes
 * nothing, which is the point. A cycle that is already closed is never
 * "ready": its harvest has happened.
 */
function isReadyToHarvest(cycle: Cycle, now: string): boolean {
  return (
    cycle.status === CYCLE_ACTIVE &&
    cycle.expectedHarvestDate !== null &&
    cycle.expectedHarvestDate <= now
  );
}
