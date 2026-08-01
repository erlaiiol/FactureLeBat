import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
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
  imports: [IconChevronDownComponent],
  template: `
    <div class="flex flex-col gap-4">
      <button
        type="button"
        (click)="expanded.set(!expanded())"
        [attr.aria-expanded]="expanded()"
        class="flex items-center gap-1 self-end text-sm font-medium text-primary hover:underline"
      >
        Paramètres avancés
        <app-icon-chevron-down [size]="14" [rotated]="expanded()" />
      </button>
      @if (expanded()) {
        <div class="anim-preview-in flex flex-col gap-4">
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class AdvancedSettingsComponent {
  protected readonly expanded = signal(false);
}
