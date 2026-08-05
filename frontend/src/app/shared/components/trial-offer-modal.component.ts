import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BillingService } from '../../core/services/billing.service';
import { PlatformService } from '../../core/services/platform.service';
import { TrialOfferService } from '../../core/services/trial-offer.service';
import { BadgeComponent } from './badge.component';
import { BigButtonComponent } from './big-button.component';
import { IconCloseComponent } from './icon-close.component';

function extractErrorMessage(error: HttpErrorResponse, fallback: string): string {
  const body = error.error as { message?: string | string[] } | null;
  return typeof body?.message === 'string' ? body.message : fallback;
}

// Phase 33: mounted once at the app root (app.html), same "one shared
// overlay, triggered from anywhere" pattern as PaywallModalComponent —
// reads TrialOfferService.visible() plus BillingService.status().trialOffer
// directly rather than taking @Inputs, since two independent call sites
// (right after the free invoice, and the paywall interceptor) both trigger
// it. The countdown ticks off `offer.expiresAt`, a real deadline the
// backend persisted (Company.trialOfferExpiresAt) — never a value invented
// or reset here, so reloading the page can't extend it.
@Component({
  selector: 'app-trial-offer-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, BigButtonComponent, IconCloseComponent],
  templateUrl: './trial-offer-modal.component.html',
})
export class TrialOfferModalComponent {
  protected readonly trialOfferService = inject(TrialOfferService);
  protected readonly billingService = inject(BillingService);
  protected readonly platformService = inject(PlatformService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly offer = computed(() => this.billingService.status()?.trialOffer ?? null);

  protected readonly checkoutLoading = signal(false);
  protected readonly checkoutError = signal<string | null>(null);

  private readonly now = signal(Date.now());
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // Only ticks while the modal is actually open — no point updating a
  // signal once a second for a countdown nobody is looking at, given this
  // component stays mounted for the entire app lifetime.
  private readonly tickEffect = effect(() => {
    if (this.trialOfferService.visible() && this.offer()) {
      this.startTicking();
    } else {
      this.stopTicking();
    }
  });

  // Auto-dismisses the instant the countdown actually hits zero — a stale
  // "00:00:00" sitting on screen would be worse than the modal just closing,
  // and the artisan can always get back here through /abonnement's normal
  // pricing (at the regular price, correctly, since the coupon is gone too).
  private readonly autoDismissEffect = effect(() => {
    const offer = this.offer();
    if (offer && this.remainingMs() <= 0) {
      this.trialOfferService.dismiss();
    }
  });

  protected readonly remainingMs = computed(() => {
    const offer = this.offer();
    if (!offer) {
      return 0;
    }
    return Math.max(0, new Date(offer.expiresAt).getTime() - this.now());
  });

  protected readonly countdownLabel = computed(() => {
    const totalSeconds = Math.floor(this.remainingMs() / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTicking());
  }

  private startTicking(): void {
    if (this.intervalId !== null) {
      return;
    }
    this.now.set(Date.now());
    this.intervalId = setInterval(() => this.now.set(Date.now()), 1000);
  }

  private stopTicking(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.trialOfferService.visible()) {
      this.trialOfferService.dismiss();
    }
  }

  protected subscribeNow(): void {
    this.checkoutLoading.set(true);
    this.checkoutError.set(null);
    this.billingService
      .createCheckoutSession('PREMIUM')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Real browser navigation to Stripe Checkout, same as subscribe.page.ts.
        next: ({ url }) => {
          window.location.href = url;
        },
        error: (error: HttpErrorResponse) => {
          this.checkoutLoading.set(false);
          this.checkoutError.set(
            extractErrorMessage(error, "Impossible de démarrer l'abonnement pour le moment."),
          );
        },
      });
  }
}
