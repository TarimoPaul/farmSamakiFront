import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CycleSelectionService } from '../core/services/cycle-selection';
import { FarmSelectionService } from '../core/services/farm-selection';
import { LanguageService } from '../core/services/language';
import { ProductionService } from '../core/services/production';
import { Cycle } from '../core/models/cycle';
import { ProductionUnit, UNIT_TYPES } from '../core/models/production-unit';
import { Species } from '../core/models/species';
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
import { Modal } from '../shared/ui/modal/modal';
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
 * Scope is deliberately the CONTEXT and nothing more - list, create, select.
 * There is no editing, no closing and no harvesting here, because the backend
 * has no mutation for any of them: `createCycle` sets ACTIVE and nothing in
 * the API ever moves a cycle out of it (see REPO_AUDIT §5). Offering a
 * "close cycle" button with nothing behind it would be worse than its absence.
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
    Toast,
  ],
  templateUrl: './production.html',
  styleUrl: './production.scss',
})
export class Production {
  readonly PERMISSION = PERMISSION;
  readonly unitTypes = UNIT_TYPES;

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

  readonly unitOpen = signal(false);
  readonly cycleOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly unitCodeError = signal<string | null>(null);
  readonly cycleFieldError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  readonly unitForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required]],
    type: ['TANK', [Validators.required]],
    sizeM3: [''],
    waterSource: [''],
  });

  readonly cycleForm = this.formBuilder.nonNullable.group({
    unitId: ['', [Validators.required]],
    speciesId: ['', [Validators.required]],
    stockingDate: [today(), [Validators.required]],
    fingerlingsCount: ['', [Validators.required]],
    survivalRateEstimate: [''],
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
    return [
      { label: t.colCycleUnit, value: (cycle) => cycle.unit.code },
      { label: t.colCycleSpecies, value: (cycle) => cycle.speciesName },
      { label: t.colCycleStocked, value: (cycle) => cycle.stockingDate },
      { label: t.colCycleFingerlings, value: (cycle) => String(cycle.fingerlingsCount) },
      {
        label: t.colCycleExpected,
        value: (cycle) => cycle.expectedHarvestDate ?? t.notSet,
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

    // Same rule as submitUnit: read the form fully before raising the flag,
    // so nothing here can wedge the modal shut.
    const input = {
      unitId: raw.unitId,
      speciesId: raw.speciesId,
      stockingDate: raw.stockingDate,
      fingerlingsCount: fingerlings,
      survivalRateEstimate: optionalNumber(raw.survivalRateEstimate),
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
function optionalNumber(raw: string | number | null | undefined): number | null {
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
