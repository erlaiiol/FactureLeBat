import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TourAnchorDirective } from '../tour/tour-anchor.directive';
import { IconChevronDownComponent } from './icon-chevron-down.component';

// Collapses the non-essential fields of a product/prestation/line form
// behind a single "Paramètres avancés" trigger, right-aligned so it reads
// as following the essential fields above it rather than heading its own
// section. Plain local signal, same collapsed-by-default pattern as
// CompanySettingsPage's smtpExpanded — no shared state needed since each
// form only ever has one of these.
@Component({
  selector: 'app-advanced-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconChevronDownComponent, TourAnchorDirective],
  template: `
    <div class="flex flex-col gap-4">
      <!-- appTourAnchor is input.required<string>() on the directive, so
           it can't be bound to a possibly-null value — the toggle button is
           duplicated between the two branches instead of trying to make the
           directive itself optional. Only the product/service forms pass
           tourAnchorId (Phase 1.1-10's "Paramètres avancés" folder-picker
           mention); every other caller (invoice-line-form, customer-step,
           discount-form) gets the plain branch, unchanged. -->
      @if (tourAnchorId(); as anchorId) {
        <button
          type="button"
          [appTourAnchor]="anchorId"
          (click)="expanded.set(!expanded())"
          [attr.aria-expanded]="expanded()"
          class="flex items-center gap-1 self-end text-sm font-medium text-primary hover:underline"
        >
          Paramètres avancés
          <app-icon-chevron-down [size]="14" [rotated]="expanded()" />
        </button>
      } @else {
        <button
          type="button"
          (click)="expanded.set(!expanded())"
          [attr.aria-expanded]="expanded()"
          class="flex items-center gap-1 self-end text-sm font-medium text-primary hover:underline"
        >
          Paramètres avancés
          <app-icon-chevron-down [size]="14" [rotated]="expanded()" />
        </button>
      }
      @if (expanded()) {
        <div class="anim-preview-in flex flex-col gap-4">
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class AdvancedSettingsComponent {
  // Opt-in only — see the template comment above for why this stays a
  // second branch rather than a conditionally-bound directive.
  readonly tourAnchorId = input<string | null>(null);
  protected readonly expanded = signal(false);
}
