import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Replaces the "⚠️" emoji flagging provisional/legal-review-pending text.
@Component({
  selector: 'app-icon-warning',
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
      <path d="M12 3.5 22 20.5H2z" />
      <path d="M12 9.5v5M12 17.5h.01" />
    </svg>
  `,
})
export class IconWarningComponent {
  readonly size = input(16);
}
