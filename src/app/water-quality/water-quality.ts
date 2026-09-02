import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { ProductionService } from '../core/services/production';
import { WaterQualityService } from '../core/services/water-quality';
import { Cycle } from '../core/models/cycle';
import { WaterQualityLog } from '../core/models/water-quality';
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
import { WATER_QUALITY_I18N } from './water-quality.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/**
 * Water Quality - the first of the day-to-day logging screens, and the
 * TEMPLATE the Feed and Tasks screens follow.
 *
 * The shape worth copying is here rather than in any single line of it:
 *
 *  1. THE CYCLE COMES FROM THE SELECTION, never from a route param and never
 *     hardcoded. This screen holds no picker of its own - Production owns
 *     that - and it renders an explanation, not an error, when nothing is
 *     selected.
 *  2. THE STORED ID IS RESOLVED AGAINST THE BACKEND before it is used. The
 *     cycles query takes no argument, so a stale id from another farm is
 *     caught by simply not being in the answer, and is never sent anywhere.
 *  3. READING AND WRITING ARE DIFFERENT PERMISSIONS. `view_dashboard` shows
 *     the table; `log_water_quality` is what puts the form on the page at
 *     all. A VIEWER gets the readings and no form.
 *  4. THE FORM DOES NOT SECOND-GUESS THE MEASUREMENTS. See submit().
 */
@Component({
  selector: 'app-water-quality',
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
  templateUrl: './water-quality.html',
  styleUrl: './water-quality.scss',
})
export class WaterQuality {
  readonly PERMISSION = PERMISSION;

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => WATER_QUALITY_I18N[this.languageService.lang()]);

  private readonly productionService = inject(ProductionService);
  private readonly waterQualityService = inject(WaterQualityService);
  private readonly cycleSelection = inject(CycleSelectionService);
  private readonly farmSelection = inject(FarmSelectionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  /**
   * The selected cycle, RESOLVED - null both when nothing is selected and
   * when the stored id is not among this farm's cycles. The screen treats
   * those the same on purpose: in either case there is no cycle to record
   * against, and the way out is the same one panel.
   */
  readonly cycle = signal<Cycle | null>(null);
  readonly readings = signal<readonly WaterQualityLog[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    ph: [''],
    temperature: [''],
    oxygen: [''],
    ammonia: [''],
    notes: [''],
  });

  readonly columns = computed<DataTableColumn<WaterQualityLog>[]>(() => {
    const t = this.t();
    const show = (value: number | null): string => (value === null ? t.blank : String(value));
    return [
      { label: t.colDate, value: (log) => log.logDate },
      { label: t.colUnit, value: (log) => log.unit.code },
      { label: t.colPh, value: (log) => show(log.ph), muted: (log) => log.ph === null },
      {
        label: t.colTemperature,
        value: (log) => show(log.temperature),
        muted: (log) => log.temperature === null,
      },
      { label: t.colOxygen, value: (log) => show(log.oxygen), muted: (log) => log.oxygen === null },
      {
        label: t.colAmmonia,
        value: (log) => show(log.ammonia),
        muted: (log) => log.ammonia === null,
      },
      {
        label: t.colRecordedBy,
        value: (log) => log.recordedByName ?? t.blank,
        muted: (log) => !log.recordedByName,
      },
      { label: t.colNotes, value: (log) => log.notes ?? t.blank, muted: (log) => !log.notes },
    ];
  });

  readonly readingKey = (log: WaterQualityLog): string => log.logId;

  /**
   * Reloads when the active farm changes OR when the selected cycle changes -
   * both are read here, synchronously, which is what subscribes this effect
   * to them. Picking a different cycle on Production and navigating back
   * therefore shows that cycle's readings, with no refresh.
   */
  private readonly load = effect(() => {
    this.farmSelection.selectedFarmId();
    this.cycleSelection.selectedCycleId();
    this.fetch();
  });

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.readings.set([]);

    const selectedId = this.cycleSelection.selectedCycleId();
    if (selectedId === null) {
      this.cycle.set(null);
      this.loading.set(false);
      return;
    }

    // Step one: what cycles does THIS farm have? The stored id is checked
    // against that answer rather than sent to the API, so an id left over
    // from another farm produces the "pick a cycle" panel instead of a
    // FORBIDDEN the user cannot interpret.
    this.productionService.listCycles().subscribe({
      next: (cycles) => {
        const cycle = cycles.find((c) => Number(c.cycleId) === selectedId) ?? null;
        this.cycle.set(cycle);

        if (!cycle) {
          // The stored selection is NOT cleared from here: Production owns
          // that choice, and silently rewriting it from a screen the user
          // may have opened by accident would lose a selection that is
          // merely about a farm they are about to switch back to.
          this.loading.set(false);
          return;
        }

        this.fetchReadings(selectedId);
      },
      error: (err: unknown) => {
        this.cycle.set(null);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  private fetchReadings(cycleId: number): void {
    this.waterQualityService.logsForCycle(cycleId).subscribe({
      next: (readings) => {
        this.readings.set(readings);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  goToProduction(): void {
    void this.router.navigateByUrl('/production');
  }

  /**
   * Records the reading.
   *
   * THE ONLY CLIENT-SIDE RULE IS "at least one measurement", and it is not a
   * judgement about the water: a reading with all four fields blank records
   * nothing at all, so there is nothing to save. Everything else goes to the
   * server exactly as typed.
   *
   * In particular, OUT-OF-RANGE VALUES ARE NOT REJECTED HERE. Dissolved
   * oxygen at 0.8, pH at 4.2, ammonia at 0.9 are the readings that explain a
   * sudden kill; a form that refused them would suppress the emergency it
   * exists to report. The backend takes the same position and rejects only
   * what cannot be a measurement at all - pH outside 0-14, a negative
   * concentration - which comes back as VALIDATION_ERROR and is shown below
   * in the backend's own, more specific words.
   */
  submit(): void {
    const cycle = this.cycle();
    if (!cycle || this.saving()) {
      return;
    }

    this.formError.set(null);

    const raw = this.form.getRawValue();
    const ph = optionalNumber(raw.ph);
    const temperature = optionalNumber(raw.temperature);
    const oxygen = optionalNumber(raw.oxygen);
    const ammonia = optionalNumber(raw.ammonia);

    if (ph === null && temperature === null && oxygen === null && ammonia === null) {
      this.formError.set(this.t().errorNothingEntered);
      return;
    }

    this.saving.set(true);
    this.waterQualityService
      .log({
        // The reading is the UNIT'S: `water_quality_logs` has no cycle_id.
        // The cycle is how the user found the unit, not what is recorded.
        unitId: Number(cycle.unit.unitId),
        ph,
        temperature,
        oxygen,
        ammonia,
        notes: raw.notes.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset({ ph: '', temperature: '', oxygen: '', ammonia: '', notes: '' });
          this.toastMessage.set(this.t().savedToast);
          this.fetchReadings(Number(cycle.cycleId));
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.showSubmitError(asApiError(err));
        },
      });
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }

  /**
   * VALIDATION_ERROR keeps the BACKEND'S sentence: it names the actual limit
   * ("pH lazima iwe kati ya 0 na 14") and that beats any generic line we
   * could write, even at the cost of being Swahili in an English UI.
   *
   * Everything else - FORBIDDEN above all, which is what a VIEWER gets if
   * they reach the mutation another way - is answered from the shared code
   * map, in the UI language.
   */
  private showSubmitError(error: ApiError): void {
    const preferBackend =
      error.errorCode === ERROR_CODE.VALIDATION_ERROR || error.errorCode === ERROR_CODE.CONFLICT;
    this.formError.set(this.messageFor(error, preferBackend));
  }

  private messageFor(error: ApiError | null, preferBackendMessage = false): string | null {
    return error
      ? apiErrorMessage(error, this.languageService.lang(), preferBackendMessage)
      : null;
  }
}

function asApiError(err: unknown): ApiError {
  return isApiError(err) ? err : UNKNOWN_FAILURE;
}

/** "" -> null, so an untouched field is omitted rather than recorded as 0. */
function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
