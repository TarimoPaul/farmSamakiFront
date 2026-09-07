import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { ProductionService } from '../core/services/production';
import { CYCLE_ACTIVE, CYCLE_OUTCOMES, Cycle, CycleOutcome } from '../core/models/cycle';
import { ProductionUnit, UNIT_TYPES } from '../core/models/production-unit';
import { Species } from '../core/models/species';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { PERMISSION } from '../core/models/permissions';
import {
  CYCLE_CLOSE_RULE,
  apiErrorMessage,
  cycleCloseRuleMessage,
} from '../core/i18n/error-messages';
import { AppShell } from '../shared/layout/app-shell/app-shell';
import { HasPermission } from '../shared/directives/has-permission';
import { Button } from '../shared/ui/button/button';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
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
 *  - "start cycle" needs `edit_cycle`.
 *
 * A VIEWER therefore sees both tables, can select a cycle, and has no forms.
 */
@Component({
  selector: 'app-production',
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

  readonly languageService = inject(LanguageService);
  readonly t = computed(() => PRODUCTION_I18N[this.languageService.lang()]);

  private readonly productionService = inject(ProductionService);
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
  });

  /**
   * The close form. `outcome` starts on HARVESTED because that is the
   * ordinary end of a cycle; FAILED is the exception and should be a
   * deliberate choice, not the thing you get by not looking.
   */
  readonly closeForm = this.formBuilder.nonNullable.group({
    outcome: ['HARVESTED' as CycleOutcome, [Validators.required]],
    actualHarvestDate: [today(), [Validators.required]],
    harvestedCount: ['' as NumberBox],
    totalWeightKg: ['' as NumberBox],
    notes: [''],
  });

  readonly unitColumns = computed<DataTableColumn<ProductionUnit>[]>(() => {
    const t = this.t();
    return [
      { label: t.colUnitCode, value: (unit) => unit.code },
      { label: t.colUnitType, value: (unit) => unit.type },
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
      harvestedCount: '',
      totalWeightKg: '',
      notes: '',
    });
    this.closeFieldError.set(null);
    this.closeFormError.set(null);
    this.closeActionError.set(null);
    this.closeTarget.set(cycle);
  }

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

    const harvestedCount = optionalNumber(raw.harvestedCount);
    if (harvestedCount === null) {
      this.closeFieldError.set(t.errorHarvestedCountRequired);
      return;
    }
    const totalWeightKg = optionalNumber(raw.totalWeightKg);
    if (totalWeightKg === null) {
      this.closeFieldError.set(t.errorTotalWeightRequired);
      return;
    }
    if (harvestedCount < 0 || totalWeightKg < 0) {
      this.closeFieldError.set(t.errorHarvestNegative);
      return;
    }

    // HARVESTED with nothing in it is not a harvest, it is a FAILED cycle -
    // and letting the two mean the same thing is what would make "successful
    // cycles" uncountable. Zero stays legal for FAILED, which is the point of
    // checking the outcome rather than the numbers alone.
    //
    // Caught here rather than left to the backend because the form knows both
    // halves already, and the backend's refusal would arrive as Swahili prose
    // with no code to tell it apart from any other VALIDATION_ERROR.
    if (raw.outcome === 'HARVESTED' && (harvestedCount === 0 || totalWeightKg === 0)) {
      this.closeFieldError.set(cycleCloseRuleMessage(CYCLE_CLOSE_RULE.HARVESTED_WITH_ZERO, lang));
      return;
    }

    // A harvest date before the stocking date is NOT checked here, on
    // purpose: the backend owns that comparison (it holds the stored stocking
    // date, which this row may be stale about) and its answer is the one to
    // show. See showCloseError.
    //
    // Read fully before the flag goes up, as everywhere else on this screen.
    const input = {
      cycleId: Number(cycle.cycleId),
      outcome: raw.outcome,
      actualHarvestDate: raw.actualHarvestDate,
      harvestedCount,
      totalWeightKg,
      notes: raw.notes.trim() || null,
    };

    this.closing.set(true);
    this.productionService.closeCycle(input).subscribe({
      next: () => {
        this.closing.set(false);
        this.closeTarget.set(null);
        this.toastMessage.set(this.t().cycleClosedToast);
        // Re-read rather than patch the row: `actualSurvivalRate` is computed
        // by the database, so the only place the real number exists is the
        // answer to a fresh query.
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
   * A VALIDATION_ERROR whose dates we can see are inverted is named from
   * error-messages.ts, which is the only way an English UI gets an English
   * sentence for it - the backend has none. The comparison is ours, not a
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
      const entered = this.closeForm.getRawValue().actualHarvestDate;
      if (entered && cycle.stockingDate && entered < cycle.stockingDate) {
        this.closeFormError.set(
          cycleCloseRuleMessage(
            CYCLE_CLOSE_RULE.HARVEST_BEFORE_STOCKING,
            this.languageService.lang(),
          ),
        );
        return;
      }
      this.closeFormError.set(error.message);
      return;
    }

    this.closeFormError.set(this.messageFor(error, true));
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
