import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// invoice-board.page.html's date filters: drawn on top of the native
// <input type="date">'s own calendar-picker-indicator (suppressed via
// styles.css) rather than relying on it, since its look/visibility varies
// too much across browsers (absent entirely on Safari, present on
// Chrome/Firefox) to read as a reliable "this is a date field" cue.
@Component({
  selector: 'app-icon-calendar',
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
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  `,
})
export class IconCalendarComponent {
  readonly size = input(16);
}
