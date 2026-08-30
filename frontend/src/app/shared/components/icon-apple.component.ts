import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Apple logo glyph, currentColor — unlike IconGoogleComponent's fixed brand
// colors, this one follows the button's own text color and so adapts to
// dark mode automatically, no separate dark-mode variant needed.
@Component({
  selector: 'app-icon-apple',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.353-3.14c.844-1.026 1.42-2.45 1.263-3.868-1.22.052-2.696.812-3.573 1.838-.784.9-1.47 2.34-1.286 3.727 1.35.104 2.75-.686 3.596-1.697z"
      />
    </svg>
  `,
})
export class IconAppleComponent {
  readonly size = input(18);
}
