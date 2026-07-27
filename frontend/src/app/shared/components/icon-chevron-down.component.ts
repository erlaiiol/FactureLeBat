import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// A disclosure caret — same rotate-180-on-open convention as app.html's
// inline nav-dropdown-chevron svg, just packaged as a component. `rotated`
// is a plain input (not a [class.rotate-180] left to the caller) because a
// transform on this component's own custom-element host isn't reliable the
// way it is on a raw inline <svg>.
@Component({
  selector: 'app-icon-chevron-down',
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
      class="transition-transform"
      [class.rotate-180]="rotated()"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  `,
})
export class IconChevronDownComponent {
  readonly size = input(16);
  readonly rotated = input(false);
}
