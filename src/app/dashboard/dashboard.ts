import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth';
import { GraphqlService } from '../core/services/graphql';
import { ProductionUnit } from '../core/models/production-unit';
import { Cycle } from '../core/models/cycle';
import { ThemeService } from '../core/services/theme';
import { ThemeToggle } from '../shared/ui/theme-toggle/theme-toggle';
import { LanguageService } from '../core/services/language';
import { LanguageToggle } from '../shared/ui/language-toggle/language-toggle';
import { DASHBOARD_I18N } from './dashboard.i18n';

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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ThemeToggle, LanguageToggle],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  readonly currentUser;
  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => DASHBOARD_I18N[this.languageService.lang()]);

  readonly units = signal<ProductionUnit[]>([]);
  readonly cycles = signal<Cycle[]>([]);
  readonly loading = signal(true);
  readonly fetchFailed = signal(false);

  readonly errorMessage = computed(() => (this.fetchFailed() ? this.fetchErrorText() : null));

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

  constructor(
    private readonly authService: AuthService,
    private readonly graphqlService: GraphqlService,
    private readonly router: Router,
  ) {
    this.currentUser = this.authService.currentUser;
  }

  ngOnInit(): void {
    this.graphqlService.query<DashboardData>(DASHBOARD_QUERY).subscribe({
      next: (data) => {
        this.units.set(data.productionUnits);
        this.cycles.set(data.cycles);
        this.loading.set(false);
      },
      error: () => {
        this.fetchFailed.set(true);
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

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  isToday(date: Date): boolean {
    return date.toDateString() === this.today.toDateString();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  private fetchErrorText(): string {
    return this.languageService.lang() === 'sw' ? 'Imeshindikana kupata data.' : 'Failed to load data.';
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
