import { Component, input } from '@angular/core';

type StatusVariant = 'pending' | 'approved' | 'rejected' | 'active' | 'neutral';

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge" [class]="'badge--' + variant()">
      <ng-content>{{ status() }}</ng-content>
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      padding: .25rem .65rem;
      border-radius: 999px;
      font-size: .72rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge--pending {
      background: color-mix(in srgb, var(--notice) 15%, transparent);
      color: var(--notice);
    }
    .badge--approved,
    .badge--active {
      background: color-mix(in srgb, var(--brand) 15%, transparent);
      color: var(--brand);
    }
    .badge--rejected {
      background: color-mix(in srgb, var(--error) 15%, transparent);
      color: var(--error);
    }
    .badge--neutral {
      background: color-mix(in srgb, var(--muted) 15%, transparent);
      color: var(--muted);
    }
  `,
})
export class StatusBadge {
  status = input('');
  variant = input<StatusVariant>('neutral');
}
