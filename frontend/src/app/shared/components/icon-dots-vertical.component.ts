import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// A vertical kebab — triggers a row's actions dropdown.
@Component({
  selector: 'app-icon-dots-vertical',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  `,
})
export class IconDotsVerticalComponent {
  readonly size = input(16);
}
