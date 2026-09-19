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
  /**
   * The label a phone shows in front of the value, where a row's fields run
   * on one line and "Mavuno yanayotarajiwa" would take a line to itself.
   * Omitted, the full `label` is used. The desktop header always says `label`.
   */
  shortLabel?: string;
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
              [class.data-table__row--muted]="rowMuted()?.(row)"
              [attr.tabindex]="selectable() ? 0 : null"
              [attr.role]="selectable() ? 'button' : null"
              (click)="selectable() && rowSelected.emit(row)"
              (keydown.enter)="selectable() && rowSelected.emit(row)"
              (keydown.space)="selectable() && rowSelected.emit(row)"
            >
              @if (numbered()) {
                <td class="data-table__number">{{ index + 1 }}</td>
              }
              @for (column of columns(); track column.label; let first = $first) {
                <!-- data-label: on a phone each row becomes a small card and
                     the header row is gone, so every cell names itself. The
                     first column is the row's NAME, and needs no label. -->
                <td
                  [class.data-table__cell--muted]="column.muted?.(row)"
                  [class.data-table__cell--lead]="first"
                  [attr.data-label]="column.shortLabel ?? column.label"
                >
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
    /* A whole row dimmed - for a record that is still real and still listed,
       but no longer in play. Opacity rather than a colour, so every cell
       recedes together and a cell with its own colour keeps it. */
    .data-table__row--muted td {
      opacity: 0.55;
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
    /* A phone: a row per card, not a table to scroll sideways. Scrolled, the
       columns past the first two - status, dates, owner - were cut off with
       nothing to say they were there. Now the first column is the card's
       title, the rest sit two across under their own labels, and the row's
       controls run along the foot. The same pattern as the Dashboard's
       Active Cycles table. */
    @media (max-width: 640px) {
      .table-wrap {
        overflow-x: visible;
      }
      .data-table,
      .data-table tbody,
      .data-table tr,
      .data-table td {
        display: block;
      }
      /* Hidden, not removed: the cells carry their names now, but the header
         is still there for anything reading the table as a table. */
      .data-table thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      /* Every field on ONE running line under the name - the user's call,
         2026-09-19, to spend the least height a row can:
             P1                                              ⋮
             Aina Kambale · Imepandwa 2026-09-15 · Vifaranga 200 ·
             Mavuno 2027-02-15 · Hali ACTIVE
         Each value keeps its short label, quiet, in front of it: without
         them two dates in a row would be two guesses. The line wraps where
         the width runs out, never inside a field. No radius: a rounded row
         bent its separator up at both ends. */
      .data-table tbody tr {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.15rem 1.1rem;
        padding: 0.75rem 0.6rem;
        border-bottom: 1px solid var(--border);
        line-height: 1.5;
      }
      /* Each field one piece - its label and its value - so the line wraps
         BETWEEN fields: inline, "Mavuno" ended one line and "yanayotarajiwa
         2027-02-15" began the next, and a date broke at its hyphen. A gap,
         not a dot, between them: a dot at the end of a wrapped line hung
         there pointing at nothing. A field longer than the line still wraps. */
      .data-table td[data-label] {
        max-width: 100%;
        font-weight: 600;
      }
      .data-table tbody tr:last-child {
        border-bottom: 0;
      }
      .data-table td,
      .data-table tbody tr:last-child td {
        min-width: 0;
        padding: 0;
        border: 0;
        font-size: 0.85rem;
        overflow-wrap: anywhere;
      }
      /* The label, quiet, just in front of its value; the value keeps the ink. */
      .data-table td[data-label]::before {
        content: attr(data-label) ' ';
        font-size: 0.8rem;
        font-style: normal;
        font-weight: 400;
        color: var(--muted);
      }
      /* The row's name: its own line, large, and needs no label saying so. */
      .data-table td.data-table__cell--lead {
        flex-basis: 100%;
        margin-bottom: 0.1rem;
        font-size: 0.98rem;
        font-weight: 800;
      }
      .data-table td.data-table__cell--lead::before {
        display: none;
      }
      /* A counting aid for reading ACROSS a table; a stack of cards has no
         across. */
      .data-table td.data-table__number {
        display: none;
      }
      /* Worded buttons (Approvals, Production's events) along the foot of the
         card, where they have the width. */
      .data-table td.data-table__actions {
        flex-basis: 100%;
        width: auto;
        margin-top: 0.5rem;
        text-align: left;
        white-space: normal;
      }
      /* A ⋮ menu beside the name instead, top right - where a card's menu is
         looked for, and one tap from the thumb. */
      /* Out of the flow, top right, so it takes no line of its own. */
      .data-table tr:has(> td.data-table__actions app-action-menu) {
        position: relative;
      }
      /* The name's line as tall as the ⋮ button beside it, so the first field
         starts below the button rather than under it. */
      .data-table tr:has(> td.data-table__actions app-action-menu) td.data-table__cell--lead {
        display: flex;
        align-items: center;
        min-height: var(--control-h, 36px);
        padding-right: 3rem;
      }
      .data-table tr:has(> td.data-table__actions app-action-menu) td.data-table__actions {
        position: absolute;
        top: 0.8rem;
        right: 0.4rem;
        margin: 0;
      }
      /* Selection and hover light the whole card, not each cell apart. */
      .data-table__row--selectable:hover td,
      .data-table__row--selected td {
        background: none;
      }
      .data-table__row--selectable:hover {
        background: color-mix(in srgb, var(--brand) 7%, transparent);
      }
      .data-table__row--selected,
      .data-table__row--selected:hover {
        background: color-mix(in srgb, var(--brand) 12%, transparent);
      }
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

  /**
   * Dim a whole row, for a record that is listed but no longer in play - a
   * retired feed type, say.
   *
   * Row-level rather than per-column, and that is the distinction from
   * `DataTableColumn.muted`: that one dims ONE CELL whose own content is a
   * stand-in for missing data, while this says something about the record.
   * Null by default, so a table that says nothing renders exactly as before.
   */
  rowMuted = input<((row: T) => boolean) | null>(null);
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
