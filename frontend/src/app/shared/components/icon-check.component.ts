import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Replaces the "✓" emoji used as an inline validity/selection marker.
@Component({
  selector: 'app-icon-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  `,
})
export class IconCheckComponent {
  readonly size = input(16);
}
