import { Component, input, output } from '@angular/core';

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
 */
@Component({
  selector: 'app-data-table',
  template: `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            @for (column of columns(); track column.label) {
              <th scope="col">{{ column.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track rowKey()(row)) {
            <tr
              [class.data-table__row--selectable]="selectable()"
              [class.data-table__row--selected]="selectable() && rowKey()(row) === selectedKey()"
              [attr.tabindex]="selectable() ? 0 : null"
              [attr.role]="selectable() ? 'button' : null"
              (click)="selectable() && rowSelected.emit(row)"
              (keydown.enter)="selectable() && rowSelected.emit(row)"
              (keydown.space)="selectable() && rowSelected.emit(row)"
            >
              @for (column of columns(); track column.label) {
                <td [class.data-table__cell--muted]="column.muted?.(row)">{{ column.value(row) }}</td>
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
      font-size: .9rem;
    }
    .data-table th {
      padding: .6rem .75rem;
      text-align: left;
      font-size: .72rem;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .data-table td {
      padding: .7rem .75rem;
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
}
