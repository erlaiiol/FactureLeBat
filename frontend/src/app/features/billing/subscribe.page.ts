import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BillingStatus } from '../../core/models/billing.model';
import { BillingService } from '../../core/services/billing.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { BigButtonComponent } from '../../shared/components/big-button.component';

function extractErrorMessage(error: HttpErrorResponse, fallback: string): string {
  const body = error.error as { message?: string | string[] } | null;
  if (typeof body?.message === 'string') {
    return body.message;
  }
  return fallback;
}

// Phase 14: "Mon abonnement" — status, Stripe checkout/portal redirects, and
// promo-code redemption all live on one page. Every action here is
// idempotent to land on (redirects come back to this same URL with
// ?success=1/?canceled=1), which is why loadStatus() is re-run after both a
// redirect-back and a promo redemption rather than trusting any locally
// held state to still be accurate.
@Component({
  selector: 'app-subscribe-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, BadgeComponent, DatePipe],
  templateUrl: './subscribe.page.html',
})
export class SubscribePage {
  private readonly billingService = inject(BillingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly status = signal<BillingStatus | null>(null);
  protected readonly checkoutLoading = signal(false);
  protected readonly checkoutError = signal<string | null>(null);
  protected readonly portalLoading = signal(false);
  protected readonly portalError = signal<string | null>(null);
  protected readonly redeemLoading = signal(false);
  protected readonly redeemError = signal<string | null>(null);
  protected readonly redeemSuccess = signal(false);

  protected readonly redirectNotice: 'success' | 'canceled' | null =
    this.route.snapshot.queryParamMap.get('success') === '1'
      ? 'success'
      : this.route.snapshot.queryParamMap.get('canceled') === '1'
        ? 'canceled'
        : null;

  protected readonly promoForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
  });

  constructor() {
    this.loadStatus();
  }

  private loadStatus(): void {
    this.loading.set(true);
    this.billingService
      .getStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.status.set(status);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected subscribe(): void {
    this.checkoutLoading.set(true);
    this.checkoutError.set(null);
    this.billingService
      .createCheckoutSession()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // A real browser navigation, not a router link — Stripe Checkout is
        // a page Stripe hosts, not a route in this app.
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

  protected manageBilling(): void {
    this.portalLoading.set(true);
    this.portalError.set(null);
    this.billingService
      .createPortalSession()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ url }) => {
          window.location.href = url;
        },
        error: (error: HttpErrorResponse) => {
          this.portalLoading.set(false);
          this.portalError.set(
            extractErrorMessage(error, "Impossible d'ouvrir la gestion de l'abonnement."),
          );
        },
      });
  }

  protected redeemPromo(): void {
    if (this.promoForm.invalid) {
      this.promoForm.markAllAsTouched();
      return;
    }
    this.redeemLoading.set(true);
    this.redeemError.set(null);
    this.redeemSuccess.set(false);
    this.billingService
      .redeemPromoCode(this.promoForm.getRawValue().code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.redeemLoading.set(false);
          this.redeemSuccess.set(true);
          this.promoForm.reset();
          this.loadStatus();
        },
        error: (error: HttpErrorResponse) => {
          this.redeemLoading.set(false);
          this.redeemError.set(extractErrorMessage(error, 'Code promo invalide.'));
        },
      });
  }
}
