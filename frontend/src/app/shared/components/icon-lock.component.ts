import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Marks a premium-only action a free-tier company can't take yet (mode
// vocal, invoice board's "Facture à partir du devis"/"Créer un devis") —
// see 1.2/manual-mode-free-tier revision.
@Component({
  selector: 'app-icon-lock',
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
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  `,
})
export class IconLockComponent {
  readonly size = input(16);
}
