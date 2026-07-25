import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PaywallService } from '../../core/services/paywall.service';
import { BigButtonComponent } from './big-button.component';

// Mounted once at the app root (app.html), same "one shared overlay,
// triggered from anywhere" pattern as TourOverlayComponent — reads
// PaywallService.visible() directly rather than taking an @Input, since any
// number of unrelated call sites (today: the invoice preview/create
// actions) can trigger it.
@Component({
  selector: 'app-paywall-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BigButtonComponent],
  templateUrl: './paywall-modal.component.html',
})
export class PaywallModalComponent {
  protected readonly paywallService = inject(PaywallService);
  private readonly router = inject(Router);

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.paywallService.visible()) {
      this.paywallService.dismiss();
    }
  }

  protected goToSubscribe(): void {
    this.paywallService.dismiss();
    void this.router.navigateByUrl('/abonnement');
  }
}
