import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DataTable, DataTableColumn } from './data-table';

interface Row {
  id: number;
  name: string;
  place: string;
}

@Component({
  imports: [DataTable],
  template: `
    <app-data-table [columns]="columns" [rows]="rows" [rowKey]="key" [numbered]="true" />
  `,
})
class Host {
  columns: DataTableColumn<Row>[] = [
    { label: 'Jina', value: (row) => row.name },
    { label: 'Eneo', value: (row) => row.place },
  ];
  rows: Row[] = [{ id: 1, name: 'Shamba Jipya', place: 'Dodoma' }];
  key = (row: Row) => row.id;
}

describe('DataTable on a phone', () => {
  // The card layout itself is CSS (jsdom lays nothing out); what it stands on
  // is that every cell names its column and the first one is marked the name.
  it('names every data cell for the card layout, and marks the first as the row\'s name', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const cells = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody td'),
    );

    // The row number carries no label: it is hidden on a phone.
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([null, 'Jina', 'Eneo']);
    expect(cells.map((cell) => cell.classList.contains('data-table__cell--lead'))).toEqual([
      false,
      true,
      false,
    ]);
  });
});
