import { Component, input } from '@angular/core';

/**
 * The first five are the badge's original, brand-era variants and keep their
 * colours. The `tone-*` five speak the semantic tokens (styles.scss) - one per
 * meaning - for a screen whose badges are states rather than approvals.
 * Prefixed because `active` was already taken, and means brand orange.
 */
type StatusVariant =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'neutral'
  | 'tone-active'
  | 'tone-idle'
  | 'tone-danger'
  | 'tone-neutral'
  | 'tone-done';

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
    // The same tint and text as the dashboard's .pill: text is the token mixed
    // 70% with --on-surface, because the bare token on its own tint misses
    // 4.5:1 (see styles.scss).
    @each $tone in active, done, idle, danger, neutral {
      .badge--tone-#{$tone} {
        background: color-mix(in srgb, var(--color-#{$tone}) 15%, transparent);
        color: color-mix(in srgb, var(--color-#{$tone}) 70%, var(--on-surface));
      }
    }
  `,
})
export class StatusBadge {
  status = input('');
  variant = input<StatusVariant>('neutral');
}
