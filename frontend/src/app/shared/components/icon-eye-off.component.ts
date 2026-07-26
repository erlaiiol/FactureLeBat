import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Replaces the "🙈" emoji marking a field/detail as hidden from the document.
@Component({
  selector: 'app-icon-eye-off',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M3 3l18 18M9.9 5.2A10.4 10.4 0 0 1 12 5c7 0 10.5 7 10.5 7a13.8 13.8 0 0 1-3.1 4.1M6.6 6.6C3.7 8.4 1.5 12 1.5 12s3.5 7 10.5 7a10.6 10.6 0 0 0 4.2-.85"
      />
      <path d="M9.9 14.1a3 3 0 0 0 4.2-4.2" />
    </svg>
  `,
})
export class IconEyeOffComponent {
  readonly size = input(16);
}
