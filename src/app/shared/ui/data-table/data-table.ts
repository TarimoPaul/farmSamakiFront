import { Component, TemplateRef, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * One column: a header label and how to read the cell out of a row.
 *
 * A `value` function rather than a key string keeps it type-safe - a typo is a
 * compile error, and a column can format ("Hakuna mmiliki bado" for a null
 * owner) without the table knowing anything about the row type.
 */
export interface DataTableColumn<T> {
  label: string;
  value: (row: T) => string;
  /** Rendered dimmer - for a placeholder standing in for missing data. */
  muted?: (row: T) => boolean;
}

/**
 * The list every admin screen shows. Rows, columns, optional selection.
 *
 * Empty state is projected, not configured, because each screen's empty state
 * says something different ("no farms yet" invites creating one; "no members
 * yet" points at another screen).
 *
 * `rowActions` adds a trailing column of per-row controls. It is a template
 * rather than a column, because a control needs the screen's own handlers and
 * permission gating around it - things a `value: (row) => string` cannot
 * express. Omit it and the table renders exactly as it did before it existed
 * (no extra header, no extra cell), which is how Farms still uses it.
 *
 * `numbered` prepends a row-number column. Like `rowActions` it is off by
 * default, so a screen that says nothing about it renders as it always did.
 */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet],
  template: `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            @if (numbered()) {
              <th scope="col" class="data-table__number-head">{{ numberLabel() }}</th>
            }
            @for (column of columns(); track column.label) {
              <th scope="col">{{ column.label }}</th>
            }
            @if (rowActions()) {
              <th scope="col" class="data-table__actions-head">
                @if (showActionsLabel()) {
                  {{ actionsLabel() }}
                } @else {
                  <span class="visually-hidden">{{ actionsLabel() }}</span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track rowKey()(row); let index = $index) {
            <tr
              [class.data-table__row--selectable]="selectable()"
              [class.data-table__row--selected]="selectable() && rowKey()(row) === selectedKey()"
              [attr.tabindex]="selectable() ? 0 : null"
              [attr.role]="selectable() ? 'button' : null"
              (click)="selectable() && rowSelected.emit(row)"
              (keydown.enter)="selectable() && rowSelected.emit(row)"
              (keydown.space)="selectable() && rowSelected.emit(row)"
            >
              @if (numbered()) {
                <td class="data-table__number">{{ index + 1 }}</td>
              }
              @for (column of columns(); track column.label) {
                <td [class.data-table__cell--muted]="column.muted?.(row)">
                  {{ column.value(row) }}
                </td>
              }
              @if (rowActions(); as actions) {
                <!-- stopPropagation, because on a SELECTABLE table the row
                     itself is a button: without this, opening a row's menu -
                     or picking anything in it - would also select the row,
                     firing off whatever that loads. A control in the actions
                     cell is never a click on the row. -->
                <td class="data-table__actions" (click)="$event.stopPropagation()">
                  <ng-container
                    [ngTemplateOutlet]="actions"
                    [ngTemplateOutletContext]="{ $implicit: row }"
                  />
                </td>
              }
            </tr>
          }
        </tbody>
      </table>

      @if (rows().length === 0) {
        <ng-content select="[slot=empty]"></ng-content>
      }
    </div>
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .data-table th {
      padding: 0.6rem 0.75rem;
      text-align: left;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .data-table td {
      padding: 0.7rem 0.75rem;
      border-bottom: 1px solid var(--border);
      color: var(--on-surface);
    }
    .data-table tbody tr:last-child td {
      border-bottom: none;
    }
    .data-table__cell--muted {
      color: var(--muted);
      font-style: italic;
    }
    .data-table__row--selectable {
      cursor: pointer;
    }
    .data-table__row--selectable:hover td {
      background: color-mix(in srgb, var(--brand) 7%, transparent);
    }
    .data-table__row--selectable:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }
    .data-table__row--selected td {
      background: color-mix(in srgb, var(--brand) 12%, transparent);
    }
    .data-table__actions,
    .data-table__actions-head {
      width: 1%;
      white-space: nowrap;
      text-align: right;
    }
    /* The row-number column: as narrow as its digits, and dimmer than the
       data - it is a counting aid, not something anybody reads across. */
    .data-table__number,
    .data-table__number-head {
      width: 1%;
      white-space: nowrap;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .data-table__number {
      color: var(--muted);
    }
    .data-table__actions {
      display: table-cell;
    }
    /* Used when showActionsLabel is off: the header is there for column
       alignment and for screen readers, but prints nothing. */
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
  `,
})
export class DataTable<T> {
  columns = input.required<readonly DataTableColumn<T>[]>();
  rows = input.required<readonly T[]>();
  /** Stable identity per row - used for tracking and for selection. */
  rowKey = input.required<(row: T) => string | number>();
  selectable = input(false);
  selectedKey = input<string | number | null>(null);
  rowSelected = output<T>();

  /**
   * Per-row controls, as `<ng-template let-row>`. Absent by default, and
   * absent means no extra column at all.
   */
  rowActions = input<TemplateRef<{ $implicit: T }> | null>(null);
  /** Accessible name for the actions header - shown or not, see below. */
  actionsLabel = input('Actions');
  /**
   * Print `actionsLabel` in the header instead of hiding it.
   *
   * Off by default because not every screen's label is written as a HEADING:
   * Approvals passes "Idhinisha", which describes its one button and would
   * read oddly as a column title. A screen whose label is a real heading -
   * "Vitendo" - opts in.
   */
  showActionsLabel = input(false);

  /**
   * Prepend a 1-based row-number column.
   *
   * POSITIONAL, not an identity: it counts what is on screen right now, so a
   * row keeps its number only until the list is sorted or filtered. That is
   * what makes it useful for "the third one down" and useless as a reference
   * to a record - the row's own id is never this.
   */
  numbered = input(false);
  numberLabel = input('#');
}
