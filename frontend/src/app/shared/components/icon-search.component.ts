import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Replaces the "🔍" emoji on search/lookup actions.
@Component({
  selector: 'app-icon-search',
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
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  `,
})
export class IconSearchComponent {
  readonly size = input(16);
}
