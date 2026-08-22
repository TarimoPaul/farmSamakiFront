import { Component, input } from '@angular/core';

type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-spinner',
  template: `
    <span class="spinner" [class]="'spinner--' + size()" role="status" aria-label="Inapakia"></span>
  `,
  styles: `
    .spinner {
      display: inline-block;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spinner-spin .6s linear infinite;
    }
    .spinner--sm {
      width: 1rem;
      height: 1rem;
    }
    .spinner--md {
      width: 1.5rem;
      height: 1.5rem;
    }
    .spinner--lg {
      width: 2.25rem;
      height: 2.25rem;
      border-width: 3px;
    }
    @keyframes spinner-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class Spinner {
  size = input<SpinnerSize>('md');
}
