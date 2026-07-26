import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Replaces the "✕" emoji used everywhere a modal/panel/inline row can be
// closed or removed — one minimalist glyph instead of a font-rendered
// character whose look varies by OS/browser emoji set.
@Component({
  selector: 'app-icon-close',
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
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  `,
})
export class IconCloseComponent {
  readonly size = input(16);
}
