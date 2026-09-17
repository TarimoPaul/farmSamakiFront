import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GraphqlService } from '../core/services/graphql';
import { AuthService } from '../core/services/auth';
import { FarmSelectionService } from '../core/services/farm-selection';
import { FarmsService } from '../core/services/farms';
import { UsersService } from '../core/services/users';
import { PERMISSION } from '../core/models/permissions';
import { ERROR_CODE } from '../core/models/error-codes';
import { ProductionUnit, UNIT_TYPES } from '../core/models/production-unit';
import { Cycle, CYCLE_ACTIVE } from '../core/models/cycle';
import { DashboardDay } from '../core/models/dashboard-day';
import { LanguageService } from '../core/services/language';
import { DASHBOARD_I18N } from './dashboard.i18n';
import { ApiError, isApiError } from '../core/models/api-error';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { unitTypeLabel } from '../core/i18n/unit-types';

const DASHBOARD_QUERY = `
  query {
    productionUnits {
      unitId
      code
      type
      sizeM3
      waterSource
      status
    }
    cycles {
      cycleId
      speciesName
      stockingDate
      fingerlingsCount
      survivalRateEstimate
      expectedHarvestDate
      status
      unit {
        unitId
        code
        type
      }
    }
  }
`;

interface DashboardData {
  productionUnits: ProductionUnit[];
  cycles: Cycle[];
}

/**
 * Hali ya shamba tarehe nyingine - kilichoendesha kalenda inayobofyeka.
 *
 * Inaulizwa TU wakati tarehe iliyochaguliwa si ya leo. Leo tayari iko kwenye
 * ukurasa: DASHBOARD_QUERY inasoma hali halisi ya sasa, na kuiuliza tena kwa
 * njia nyingine kungeleta hatari ya namba mbili zisizolingana kwa siku ile ile.
 */
const DAY_QUERY = `
  query ($date: String!) {
    dashboardOnDate(date: $date) {
      date
      unitsExisting
      unitsActive
      unitsIdle
      totalVolumeM3
      cyclesRunning
      cycles {
        cycleId
        speciesName
        stockingDate
        fingerlingsCount
        survivalRateEstimate
        expectedHarvestDate
        status
        unit {
          unitId
          code
          type
        }
      }
      cyclesStarted
      cyclesClosed
      fingerlingsRunning
      fingerlingsStocked
      members
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

/** YYYY-MM-DD kwa saa ZA HAPA, si UTC - toISOString() ingehamisha siku. */
function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const UNIT_STATUSES = ['ACTIVE', 'IDLE', 'MAINTENANCE'] as const;

/** The semantic colour a status takes - `--color-<tone>` in src/styles.scss. */
export type StatusTone = 'active' | 'done' | 'idle' | 'danger' | 'neutral';

/**
 * For a throw that is not an ApiError at all - a bug in our own mapping, or
 * something rxjs raised. It has no code, so it renders as the generic
 * connection message rather than pretending to explain itself.
 */
const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'http',
});

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly languageService = inject(LanguageService);
  private readonly authService = inject(AuthService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly farmsService = inject(FarmsService);
  private readonly usersService = inject(UsersService);
  readonly t = computed(() => DASHBOARD_I18N[this.languageService.lang()]);

  readonly units = signal<ProductionUnit[]>([]);
  readonly cycles = signal<Cycle[]>([]);
  readonly loading = signal(true);

  /**
   * The failure itself, not a boolean. The dashboard can now say WHY it is
   * empty - "you do not have permission", "your account has no farm yet" -
   * because GraphqlService hands over the backend's `errorCode` instead of a
   * message-only Error. It used to show one flat "Failed to load data." for
   * every cause, including an expired session.
   */
  readonly error = signal<ApiError | null>(null);

  readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
  });

  /**
   * "This account holds no farm", told apart from every other failure.
   *
   * On this screen it is not really an error: the dashboard is farm-scoped -
   * productionUnits and cycles both resolve through the backend's
   * requireFarmScope - and an account with no farm has nothing to show here
   * BY DESIGN. ROOT is the standing example: its access comes from the isRoot
   * flag rather than from a membership, so it will never have a farm, and
   * "your account is not assigned to a farm yet" reads like a mistake someone
   * could fix. It gets a panel that explains and points somewhere useful
   * instead of the red failure line.
   *
   * The branch is on the backend's errorCode, not on the stored farmId: the
   * backend is the authority on farm scope, and a farmId cached before an
   * assignment would keep showing the panel to somebody who now has a farm.
   */
  readonly noFarm = computed(() => this.error()?.errorCode === ERROR_CODE.NO_FARM_CONTEXT);

  /**
   * Whether that panel offers a way out. Gated on the PERMISSION and never on
   * the role name (see PERMISSION): whoever may manage farms is sent to do
   * that, and anyone else is told to ask their administrator - which is the
   * only thing that can actually put them on a farm.
   */
  readonly canManageFarms = computed(() => this.authService.hasPermission(PERMISSION.MANAGE_FARMS));

  /**
   * The organisation counts in the rail's last card: how many farms exist,
   * and how many people are on the farm being looked at.
   *
   * Both are REST calls, not part of DASHBOARD_QUERY, and they are kept out
   * of it deliberately: they answer different permissions. Folding
   * `manage_farms` data into the GraphQL query would make the WHOLE query
   * fail for a farm hand who is only allowed the units and cycles - the
   * dashboard would go blank because of a panel they were never meant to
   * see. Null means "not fetched, or the call failed"; the row shows a dash
   * and nothing else on the screen notices.
   */
  readonly totalFarms = signal<number | null>(null);
  readonly totalMembers = signal<number | null>(null);

  /** `manage_users` is a DIFFERENT permission from manage_farms - see UsersService. */
  readonly canManageUsers = computed(() => this.authService.hasPermission(PERMISSION.MANAGE_USERS));

  /**
   * The farm the BACKEND applied, not the one that was requested: it comes
   * from /api/auth/me via currentUser, so a selection the backend refused
   * cannot make this count somebody else's members.
   */
  readonly activeFarmId = computed(() => this.authService.currentUser()?.farmId ?? null);

  /** The card is not rendered at all unless one of its two rows can be filled. */
  readonly showOrgCard = computed(
    () => this.canManageFarms() || (this.canManageUsers() && this.activeFarmId() !== null),
  );

  readonly today = new Date();
  readonly weekdayLabels = computed(() => this.t().weekdayLabels);

  // ── The date being looked at ───────────────────────────────────────────
  //
  // Two signals, not one, and they move independently on purpose: paging to
  // last month to FIND a date should not change which date is being shown
  // until one is actually clicked.
  private readonly weekAnchor = signal(new Date());
  readonly selectedDate = signal(isoDate(new Date()));

  readonly weekDates = computed(() => this.buildWeekDates(this.weekAnchor()));
  readonly viewingToday = computed(() => this.selectedDate() === isoDate(this.today));

  /** The dated snapshot. Null whenever today is being shown - see DAY_QUERY. */
  readonly day = signal<DashboardDay | null>(null);
  readonly dayLoading = signal(false);
  readonly dayError = signal<ApiError | null>(null);

  /**
   * The date has records behind it.
   *
   * When false, every number in `day()` is a zero that means "we have no
   * record of that day" rather than "the farm was empty" - so the screen says
   * so instead of rendering the zeros. See DashboardDay.historyComplete.
   */
  readonly dayHasHistory = computed(() => this.day()?.historyComplete !== false);

  readonly totalUnits = computed(() => this.units().length);
  readonly activeUnits = computed(() => this.units().filter((u) => u.status === 'ACTIVE').length);
  readonly activeCycles = computed(() => this.cycles().filter((c) => c.status === 'ACTIVE'));
  readonly totalFingerlings = computed(() =>
    this.activeCycles().reduce((sum, c) => sum + (c.fingerlingsCount ?? 0), 0),
  );
  readonly totalVolumeM3 = computed(() =>
    this.units().reduce((sum, u) => sum + (u.sizeM3 ?? 0), 0),
  );

  readonly activePercent = computed(() => {
    const total = this.totalUnits();
    return total === 0 ? 0 : Math.round((this.activeUnits() / total) * 100);
  });

  // ── What the screen actually shows ─────────────────────────────────────
  //
  // One layer, so the template never has to ask "which date am I on?" - and,
  // more importantly, so no card can be left behind. Wiring each card to its
  // own conditional was the version that would eventually show one card's
  // Tuesday next to another card's today.
  //
  // `day()` null = today, and today's numbers come from the live query rather
  // than from a second answer about the same day.
  readonly shownTotalUnits = computed(() => this.day()?.unitsExisting ?? this.totalUnits());
  readonly shownActiveUnits = computed(() => this.day()?.unitsActive ?? this.activeUnits());
  readonly shownCyclesRunning = computed(
    () => this.day()?.cyclesRunning ?? this.activeCycles().length,
  );
  readonly shownVolumeM3 = computed(() => this.day()?.totalVolumeM3 ?? this.totalVolumeM3());

  /**
   * HIFADHI, not intake: the count of fingerlings inside the cycles that were
   * running. `fingerlingsStocked` is the other thing - what went in THAT day -
   * and this tile has always shown the first, so it keeps showing the first.
   */
  readonly shownFingerlings = computed(
    () => this.day()?.fingerlingsRunning ?? this.totalFingerlings(),
  );

  readonly shownActivePercent = computed(() => {
    const dated = this.day();
    if (!dated) {
      return this.activePercent();
    }
    return dated.unitsExisting === 0
      ? 0
      : Math.round((dated.unitsActive / dated.unitsExisting) * 100);
  });

  readonly shownMembers = computed(() => this.day()?.members ?? this.totalMembers());

  /**
   * What a dated card can show for the selected date - read by the Active
   * Cycles table and the Units by Type chart alike.
   *
   * Keyed on `viewingToday()`, not on `day()`: away from today these cards
   * never fall back to the live data. While a date loads `day()` still holds
   * the PREVIOUS date, after a failure it is null, and a date before our
   * records has nothing worth drawing - in all three the card says so instead.
   */
  readonly dayViewState = computed<'rows' | 'loading' | 'failed' | 'noHistory'>(() => {
    if (this.viewingToday()) {
      return 'rows';
    }
    if (this.dayLoading()) {
      return 'loading';
    }
    if (this.dayError()) {
      return 'failed';
    }
    const dated = this.day();
    if (!dated) {
      return 'loading';
    }
    return dated.historyComplete ? 'rows' : 'noHistory';
  });

  /**
   * The table's rows: today's live ACTIVE cycles, or the cycles that were
   * running on the selected date - the same list `cyclesRunning` is the length
   * of, so the tile above and the rows below cannot disagree.
   */
  readonly shownCycles = computed(() =>
    this.viewingToday() ? this.activeCycles() : (this.day()?.cycles ?? []),
  );

  /**
   * A row's status AS OF the selected date. Every dated row was running that
   * day, so it reads Active even if the cycle has been harvested since -
   * `status` on the wire is today's.
   */
  shownCycleStatus(cycle: Cycle): string {
    return this.viewingToday() ? cycle.status : CYCLE_ACTIVE;
  }

  /**
   * The status bars, dated.
   *
   * MAINTENANCE is 0 on any past date, and that is not a gap in the answer -
   * no code path in the backend has ever written that status (the CHECK in V1
   * allows it, CycleService never sets it). The row is kept rather than hidden
   * so the bars do not change shape when the date changes.
   */
  readonly shownUnitsByStatus = computed(() => {
    const dated = this.day();
    if (!dated) {
      return this.unitsByStatus();
    }
    const counts: Record<(typeof UNIT_STATUSES)[number], number> = {
      ACTIVE: dated.unitsActive,
      IDLE: dated.unitsIdle,
      MAINTENANCE: 0,
    };
    const max = Math.max(1, ...UNIT_STATUSES.map((status) => counts[status]));
    return UNIT_STATUSES.map((status) => ({
      status,
      count: counts[status],
      percent: Math.round((counts[status] / max) * 100),
    }));
  });

  readonly unitsByType = computed(() => {
    const units = this.units();
    const max = Math.max(1, ...UNIT_TYPES.map((t) => units.filter((u) => u.type === t).length));
    return UNIT_TYPES.map((type) => {
      const count = units.filter((u) => u.type === type).length;
      return { type, count, percent: Math.round((count / max) * 100) };
    });
  });

  /**
   * The type bars, dated - today's live counts, or the selected date's.
   *
   * The backend leaves out a type with no unit that day, so every type in
   * UNIT_TYPES is filled back in with 0: the card keeps its three rows on
   * every date. Percent is against THAT date's largest type, not today's.
   * Only drawn when `dayViewState()` is 'rows'.
   */
  readonly shownUnitsByType = computed(() => {
    if (this.viewingToday()) {
      return this.unitsByType();
    }
    const dated = this.day()?.unitsByType ?? [];
    const counts = UNIT_TYPES.map(
      (type) => dated.find((row) => row.type === type)?.count ?? 0,
    );
    const max = Math.max(1, ...counts);
    return UNIT_TYPES.map((type, i) => ({
      type,
      count: counts[i],
      percent: Math.round((counts[i] / max) * 100),
    }));
  });

  unitTypeLabel(type: string): string {
    return unitTypeLabel(type, this.languageService.lang());
  }

  readonly unitsByStatus = computed(() => {
    const units = this.units();
    const max = Math.max(
      1,
      ...UNIT_STATUSES.map((s) => units.filter((u) => u.status === s).length),
    );
    return UNIT_STATUSES.map((status) => {
      const count = units.filter((u) => u.status === status).length;
      return { status, count, percent: Math.round((count / max) * 100) };
    });
  });

  constructor(private readonly graphqlService: GraphqlService) {}

  /**
   * Loads on creation, and again whenever the selected farm changes.
   *
   * An effect rather than ngOnInit because ROOT switching farms is a new
   * dashboard, not a new page: the header the query travels with has changed,
   * so the numbers on screen are about a farm the user is no longer looking
   * at. Reading the signal here is what subscribes this to it.
   */
  private readonly load = effect(() => {
    this.farmSelection.selectedFarmId();
    this.fetch();
  });

  /**
   * The rail's organisation counts, reloaded when the applied farm changes -
   * a different farm has different members.
   *
   * Every failure here is swallowed on purpose. These two calls are a side
   * panel; the dashboard proper has already loaded (or failed) on its own
   * query, and a 403 on /api/farms must not turn a working screen into an
   * error page. A failed row simply has no number.
   */
  private readonly loadOrgCounts = effect(() => {
    const farmId = this.activeFarmId();

    if (this.canManageFarms()) {
      this.farmsService.list().subscribe({
        next: (farms) => this.totalFarms.set(farms.length),
        error: () => this.totalFarms.set(null),
      });
    } else {
      this.totalFarms.set(null);
    }

    if (this.canManageUsers() && farmId !== null) {
      this.usersService.listByFarm(farmId).subscribe({
        next: (members) => this.totalMembers.set(members.length),
        error: () => this.totalMembers.set(null),
      });
    } else {
      this.totalMembers.set(null);
    }
  });
  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);

    this.graphqlService.query<DashboardData>(DASHBOARD_QUERY).subscribe({
      next: (data) => {
        this.units.set(data.productionUnits);
        this.cycles.set(data.cycles);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        // Session-level codes (expired token, disabled account, forced
        // password change) have already been acted on by AuthErrorHandler
        // before this runs - this screen is on its way out, and only needs
        // to stop showing the spinner.
        this.error.set(isApiError(err) ? err : UNKNOWN_FAILURE);
        this.loading.set(false);
      },
    });
  }

  // ── Moving between dates ───────────────────────────────────────────────

  /** Pages the strip by a week. Does NOT change the date being shown. */
  shiftWeek(weeks: number): void {
    const moved = new Date(this.weekAnchor());
    moved.setDate(moved.getDate() + weeks * 7);
    this.weekAnchor.set(moved);
  }

  selectDate(date: Date): void {
    const iso = isoDate(date);
    if (iso === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(iso);
    this.loadDay();
  }

  /** Back to live data, and back to the week today is in. */
  backToToday(): void {
    this.selectedDate.set(isoDate(this.today));
    this.weekAnchor.set(new Date());
    this.day.set(null);
    this.dayError.set(null);
  }

  isSelected(date: Date): boolean {
    return isoDate(date) === this.selectedDate();
  }

  /**
   * Fetches the selected date - or drops back to the live numbers if the
   * selection IS today.
   *
   * Today deliberately does not go through `dashboardOnDate`. The live query
   * already answered for today, and asking a second time by a second route is
   * how a screen ends up showing two different numbers for one day.
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

  statusLabel(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return this.t().statusActive;
      case 'HARVESTED':
        return this.t().statusHarvested;
      case 'IDLE':
        return this.t().statusIdle;
      case 'MAINTENANCE':
        return this.t().statusMaintenance;
      default:
        return status;
    }
  }

  /**
   * A status's MEANING, as the name of its semantic colour token
   * (`--color-<tone>` in styles.scss). The one place this screen maps a unit
   * or cycle status to a colour: the table pills and the status bars both read
   * it, so they cannot disagree. An unknown status is neutral, not a guess.
   */
  statusTone(status: string): StatusTone {
    switch (status) {
      case 'ACTIVE':
        return 'active';
      case 'HARVESTED':
        return 'done';
      case 'IDLE':
        return 'idle';
      case 'MAINTENANCE':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  isToday(date: Date): boolean {
    return date.toDateString() === this.today.toDateString();
  }

  private buildWeekDates(reference: Date): Date[] {
    const start = new Date(reference);
    const day = start.getDay(); // 0 = Sunday
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }
}
