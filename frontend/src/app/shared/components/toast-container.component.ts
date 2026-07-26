import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService, ToastVariant } from '../../core/services/toast.service';

// Mounted once at the app root (app.html), same "one shared overlay, read
// straight from a service" pattern as app-paywall-modal — any component
// triggers a toast via ToastService without knowing where it renders.
@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-container.component.html',
})
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService);

  protected variantClasses(variant: ToastVariant): string {
    return VARIANT_CLASSES[variant];
  }
}

// Tailwind needs literal class strings — see app-badge's identical lookup.
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-success-subtle text-success-subtle-fg border-success-subtle-border',
  danger: 'bg-danger-subtle text-danger-subtle-fg border-danger-subtle-border',
  info: 'bg-info-subtle text-info-subtle-fg border-info-subtle-border',
};
