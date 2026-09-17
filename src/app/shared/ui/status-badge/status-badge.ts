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
    // Every variant: a 15% tint of its colour, text that colour mixed 70% with
    // --on-surface - the same rule as the dashboard's .pill, because the bare
    // colour on its own tint misses 4.5:1 (see styles.scss).
    .badge--pending {
      background: color-mix(in srgb, var(--notice) 15%, transparent);
      color: color-mix(in srgb, var(--notice) 70%, var(--on-surface));
    }
    // Brand text takes --brand-dark, the ramp's text value in both themes:
    // --brand itself reaches only 4.46:1 at 70% in light mode.
    .badge--approved,
    .badge--active {
      background: color-mix(in srgb, var(--brand) 15%, transparent);
      color: color-mix(in srgb, var(--brand-dark) 70%, var(--on-surface));
    }
    .badge--rejected {
      background: color-mix(in srgb, var(--error) 15%, transparent);
      color: color-mix(in srgb, var(--error) 70%, var(--on-surface));
    }
    .badge--neutral {
      background: color-mix(in srgb, var(--muted) 15%, transparent);
      color: color-mix(in srgb, var(--muted) 70%, var(--on-surface));
    }
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
