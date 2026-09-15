import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LanguageService } from '../core/services/language';
import { SpeciesService } from '../core/services/species';
import { Species as SpeciesRow } from '../core/models/species';
import { ApiError, isApiError } from '../core/models/api-error';
import { ERROR_CODE } from '../core/models/error-codes';
import { apiErrorMessage } from '../core/i18n/error-messages';
import { Button } from '../shared/ui/button/button';
import { DataTable, DataTableColumn } from '../shared/ui/data-table/data-table';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { FormField } from '../shared/ui/form-field/form-field';
import { Toast } from '../shared/ui/toast/toast';
import { SPECIES_I18N } from './species.i18n';

const UNKNOWN_FAILURE = new ApiError({
  message: 'Unrecognised failure',
  errorCode: null,
  status: 0,
  source: 'graphql',
});

/** `species.name` is `VARCHAR(80)` (V1), and SpeciesService checks the same 80. */
const NAME_MAX_LENGTH = 80;

/**
 * The species catalogue - what may be farmed at all, before any farm starts a
 * cycle of it.
 *
 * IT IS THE SCREEN BEHIND PRODUCTION'S DEAD END. A cycle cannot be created
 * without a `speciesId`, so a farmer raising anything the V1 seed never listed
 * had no way through except touching the database. This is that way through.
 *
 * A SYSTEM CATALOGUE, NOT A FARM'S. `species` has no farm column and neither
 * call takes a farm, so a species registered here appears on every farm at
 * once - the same rule as the feed catalogue. The X-Farm-Id header the
 * interceptor adds is irrelevant to both, which is why nothing here reads the
 * farm selection or reloads when it changes.
 *
 * TWO PERMISSIONS, AND THE ROUTE GATES ON THE WRITE. This is where it differs
 * from Feed Catalogue, whose list and create are one code: `species` is
 * `view_dashboard`, which every role holds, while `createSpecies` is
 * `manage_species` (V20, OWNER and FARM_MANAGER). So the route is
 * DELIBERATELY STRICTER than the read it shows - a screen whose list loads and
 * whose only control the backend refuses is not worth opening, and the same
 * list is already on Production for everyone else. That is also why nothing
 * inside is gated again: whoever is here holds the one code that matters.
 *
 * NO EDIT AND NO DELETE, and not because this slice ran short - the backend
 * has neither mutation, on purpose. `growthMonthsAvg` computes
 * `expectedHarvestDate` for EVERY cycle pointing at the species, running ones
 * included, so editing it would silently shift harvest dates a farmer has
 * already been shown and planned around. That is a question needing the
 * farmer's own decision, not a quiet mutation. A misspelt species is added
 * again under the right name - which is also why a deleted name stays taken.
 *
 * THE DECIMAL IS LOAD-BEARING. `growth_months_avg` is `NUMERIC(4,1)` and the
 * backend goes out of its way to keep the tenth: 6.5 months is a real answer,
 * and an earlier bug that truncated it moved every predicted harvest date by a
 * fortnight. So this screen never rounds - the input takes fractions, and what
 * is typed is what is sent.
 */
@Component({
  selector: 'app-species',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, Button, DataTable, EmptyState, FormField, Toast],
  templateUrl: './species.html',
  styleUrl: './species.scss',
})
export class SpeciesScreen implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly t = computed(() => SPECIES_I18N[this.languageService.lang()]);

  private readonly speciesService = inject(SpeciesService);
  private readonly formBuilder = inject(FormBuilder);

  readonly species = signal<readonly SpeciesRow[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<ApiError | null>(null);
  readonly loadErrorMessage = computed(() => this.messageFor(this.loadError()));

  readonly saving = signal(false);
  /** A failure that belongs to the whole form - a refused request, not a field. */
  readonly formError = signal<string | null>(null);
  readonly nameError = signal<string | null>(null);
  readonly growthError = signal<string | null>(null);
  readonly weightError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  /**
   * Both numbers are left as text controls rather than declared `number`.
   *
   * `input[type=number]` binds through Angular's NumberValueAccessor, which
   * writes a number - or null for an empty box - whatever this declares, so
   * the declared type is not what arrives. Everything below reads them through
   * `parseDecimal`, which takes the value as it really comes.
   */
  readonly form = this.formBuilder.nonNullable.group({
    name: [''],
    growthMonthsAvg: [''],
    avgHarvestWeightKg: [''],
  });

  /**
   * The rail's summary, counted from the catalogue already on the page.
   *
   * NO DATE PICKER on this screen, and the absence is deliberate. `species`
   * has no farm_id and the query exposes no timestamps at all, so "the
   * catalogue as it stood in March" has nothing behind it - a calendar here
   * would be a control that changes nothing.
   *
   * The two averages are the whole reason the catalogue exists:
   * `growthMonthsAvg` is what computes every cycle's expected harvest date,
   * and `avgHarvestWeightKg` is what a farmer plans a pond around.
   */
  readonly summary = computed(() => {
    const t = this.t();
    const rows = this.species();
    const mean = (pick: (row: SpeciesRow) => number) =>
      rows.length === 0
        ? t.dash
        : (rows.reduce((sum, row) => sum + pick(row), 0) / rows.length).toFixed(1);

    return [
      { label: t.railTotal, value: String(rows.length) },
      { label: t.railAvgGrowth, value: mean((row) => row.growthMonthsAvg) },
      { label: t.railAvgWeight, value: mean((row) => row.avgHarvestWeightKg) },
    ];
  });

  /** The fastest species to grow - the one a short cycle would start with. */
  readonly quickest = computed(() => {
    const rows = this.species();
    if (rows.length === 0) {
      return null;
    }
    return rows.reduce((best, row) => (row.growthMonthsAvg < best.growthMonthsAvg ? row : best));
  });

  readonly columns = computed<DataTableColumn<SpeciesRow>[]>(() => {
    const t = this.t();
    return [
      { label: t.colName, value: (row) => row.name },
      { label: t.colGrowthMonths, value: (row) => this.growthMonths(row) },
      { label: t.colHarvestWeight, value: (row) => formatDecimal(row.avgHarvestWeightKg, 2) },
    ];
  });

  readonly speciesKey = (row: SpeciesRow): string => row.speciesId;

  /** Exposed so the input's own `maxlength` and the check below stay one number. */
  readonly nameMaxLength = NAME_MAX_LENGTH;

  ngOnInit(): void {
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.speciesService.list().subscribe({
      next: (rows) => {
        this.species.set(rows);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.species.set([]);
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * "miezi 6.5" - the tenth is SHOWN, not rounded away.
   *
   * A whole number still reads as one ("miezi 8", not "8.0"): the format has a
   * maximum of one fraction digit and no minimum, so the column never implies
   * a precision the stored value does not carry.
   */
  growthMonths(row: SpeciesRow): string {
    return `${this.t().monthsUnit} ${formatDecimal(row.growthMonthsAvg, 1)}`;
  }

  /**
   * Registers a species.
   *
   * Every client-side rule here is the backend's own rule restated, not one
   * invented for the form: a blank name, an over-long name and a number at or
   * below zero are what `SpeciesService.create` refuses. Checking them here is
   * only about saying which one is wrong immediately, on the field it belongs
   * to, instead of after a round trip.
   *
   * WHAT IS DELIBERATELY NOT CHECKED HERE is the column ceiling (999.9 months,
   * 9999.99 kg) and the scale floor - a value so small it rounds to zero in
   * the column, which would be a species no cycle could ever use. Those
   * refusals name the exact limit in the backend's own sentence, which is more
   * useful than a second copy of the number kept in sync by hand, so they are
   * left to travel and are shown verbatim.
   *
   * NOTHING IS ROUNDED. `parseDecimal` returns the number as typed and it is
   * sent as typed: 6.5 months reaches the mutation as 6.5.
   */
  submit(): void {
    if (this.saving()) {
      return;
    }

    this.formError.set(null);
    this.nameError.set(null);
    this.growthError.set(null);
    this.weightError.set(null);

    const raw = this.form.getRawValue();
    const t = this.t();

    const name = String(raw.name ?? '').trim();
    if (!name) {
      this.nameError.set(t.errorNameRequired);
      return;
    }
    if (name.length > NAME_MAX_LENGTH) {
      this.nameError.set(t.errorNameTooLong);
      return;
    }

    const growthMonthsAvg = parseDecimal(raw.growthMonthsAvg);
    if (growthMonthsAvg === null) {
      this.growthError.set(t.errorGrowthRequired);
      return;
    }
    if (growthMonthsAvg <= 0) {
      this.growthError.set(t.errorGrowthPositive);
      return;
    }

    const avgHarvestWeightKg = parseDecimal(raw.avgHarvestWeightKg);
    if (avgHarvestWeightKg === null) {
      this.weightError.set(t.errorWeightRequired);
      return;
    }
    if (avgHarvestWeightKg <= 0) {
      this.weightError.set(t.errorWeightPositive);
      return;
    }

    this.saving.set(true);
    this.speciesService.create({ name, growthMonthsAvg, avgHarvestWeightKg }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ name: '', growthMonthsAvg: '', avgHarvestWeightKg: '' });
        this.toastMessage.set(this.t().createdToast);
        // Re-read rather than push the returned row onto the list: the backend
        // is the authority on what the catalogue now holds - and on what it
        // stored, which is the value at the column's scale rather than the one
        // that was typed.
        this.fetch();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.showSubmitError(asApiError(err));
      },
    });
  }

  /**
   * A refused create, put on the field it belongs to.
   *
   * CONFLICT IS ALWAYS THE NAME. It is the only unique column on the table,
   * and the backend raises it by name rather than letting a constraint
   * violation surface - so unlike the feed catalogue, there is no over-long
   * name hiding behind the same code. The screen still supplies its own line,
   * because the backend's leaves out the part that confuses people: a DELETED
   * species keeps its name, since the row is still there and the column is
   * UNIQUE.
   *
   * VALIDATION_ERROR keeps the BACKEND'S sentence, for the opposite reason: it
   * names the field and the exact limit ("Thamani ya 'Muda wa kukua (miezi)'
   * haiwezi kuzidi 999.9."), which is more specific than anything generic
   * written here. It goes under the form rather than on a field, because the
   * code alone does not say WHICH of the two numbers was refused - and a
   * sentence on the wrong field would be worse than one under the form.
   */
  private showSubmitError(error: ApiError): void {
    if (error.sessionHandled) {
      return;
    }
    if (error.errorCode === ERROR_CODE.CONFLICT) {
      this.nameError.set(this.t().errorNameTaken);
      return;
    }
    if (error.errorCode === ERROR_CODE.VALIDATION_ERROR) {
      this.formError.set(error.message);
      return;
    }
    this.formError.set(this.messageFor(error));
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
 * A number box's value as a number, or null when it is empty.
 *
 * It takes `unknown` because the value genuinely is: `input[type=number]`
 * hands over a number (or null), a test driving the control directly hands
 * over a string, and the form's declared type says string for both. Anything
 * that is not a number and not a non-blank numeric string is null, which the
 * caller reports as a missing field.
 *
 * IT DOES NOT ROUND, and that is the whole reason it is not an integer parse:
 * 6.5 comes back as 6.5. The rounding that does happen happens on the backend,
 * at the column's scale, where it is HALF_UP rather than a truncation.
 */
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

/**
 * A decimal as a person reads it, in the browser's locale.
 *
 * A maximum of N fraction digits and no minimum: 6.5 prints as "6.5" and 8
 * prints as "8" rather than "8.0", so a column never implies a precision the
 * stored value does not carry.
 */
function formatDecimal(value: number, maximumFractionDigits: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}
