import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GraphqlService } from '../core/services/graphql';
import { AuthService } from '../core/services/auth';
import { FarmSelectionService } from '../core/services/farm-selection';
import { PERMISSION } from '../core/models/permissions';
import { ERROR_CODE } from '../core/models/error-codes';
import { ProductionUnit } from '../core/models/production-unit';
import { Cycle } from '../core/models/cycle';
import { LanguageService } from '../core/services/language';
import { AppShell } from '../shared/layout/app-shell/app-shell';
import { DASHBOARD_I18N } from './dashboard.i18n';
import { ApiError, isApiError } from '../core/models/api-error';
import { apiErrorMessage } from '../core/i18n/error-messages';

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

const UNIT_TYPES = ['TANK', 'POND', 'BWAWA'] as const;
const UNIT_STATUSES = ['ACTIVE', 'IDLE', 'MAINTENANCE'] as const;

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
  imports: [CommonModule, RouterLink, AppShell],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly languageService = inject(LanguageService);
  private readonly authService = inject(AuthService);
  private readonly farmSelection = inject(FarmSelectionService);
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

  readonly today = new Date();
  readonly weekDates = this.buildWeekDates(this.today);
  readonly weekdayLabels = computed(() => this.t().weekdayLabels);

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

  readonly unitsByType = computed(() => {
    const units = this.units();
    const max = Math.max(1, ...UNIT_TYPES.map((t) => units.filter((u) => u.type === t).length));
    return UNIT_TYPES.map((type) => {
      const count = units.filter((u) => u.type === type).length;
      return { type, count, percent: Math.round((count / max) * 100) };
    });
  });

  readonly unitsByStatus = computed(() => {
    const units = this.units();
    const max = Math.max(1, ...UNIT_STATUSES.map((s) => units.filter((u) => u.status === s).length));
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

  statusClass(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'pill--active';
      case 'HARVESTED':
        return 'pill--done';
      case 'MAINTENANCE':
        return 'pill--warn';
      default:
        return 'pill--idle';
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
