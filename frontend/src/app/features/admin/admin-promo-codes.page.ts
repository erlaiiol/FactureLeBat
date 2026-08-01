import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PromoCode } from '../../core/models/admin.model';
import { PlanTier } from '../../core/models/billing.model';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton-table.component';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

@Component({
  selector: 'app-admin-promo-codes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    BigButtonComponent,
    SkeletonTableComponent,
    DatePipe,
  ],
  templateUrl: './admin-promo-codes.page.html',
})
export class AdminPromoCodesPage {
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly codes = signal<PromoCode[]>([]);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly planTierOptions: PlanTier[] = ['ESSENTIEL', 'PRO', 'PREMIUM'];

  // code is left blank by default — PromoCodeService generates one
  // server-side when omitted, so a single click ("Créer") is enough for the
  // common case, same "click more, type less" spirit as the rest of the app.
  // planTier defaults to PREMIUM — the pre-Phase-30 only possible meaning of
  // a promo code, still the most common marketing use case.
  protected readonly form = this.fb.nonNullable.group({
    code: [''],
    planTier: this.fb.nonNullable.control<PlanTier>('PREMIUM'),
    durationDays: [30, [Validators.required, Validators.min(1)]],
    maxRedemptions: [null as number | null],
    expiresAt: [''],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.adminService
      .listPromoCodes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (codes) => {
          this.codes.set(codes);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toastService.error('Impossible de charger les codes promo.');
        },
      });
  }

  protected create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.creating.set(true);
    this.createError.set(null);
    this.adminService
      .createPromoCode({
        code: raw.code || undefined,
        planTier: raw.planTier,
        durationDays: raw.durationDays,
        maxRedemptions: raw.maxRedemptions ?? undefined,
        expiresAt: raw.expiresAt || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.form.reset({
            code: '',
            planTier: 'PREMIUM',
            durationDays: 30,
            maxRedemptions: null,
            expiresAt: '',
          });
          this.toastService.success('Code promo créé.');
          this.load();
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          const body = error.error as { message?: string } | null;
          this.createError.set(body?.message ?? 'Impossible de créer ce code promo.');
        },
      });
  }

  protected toggleActive(code: PromoCode): void {
    const nextActive = !code.active;
    this.adminService
      .setPromoCodeActive(code.id, nextActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.success(nextActive ? 'Code promo activé.' : 'Code promo désactivé.');
          this.load();
        },
        error: () => this.toastService.error('Impossible de modifier ce code promo.'),
      });
  }

  protected remove(code: PromoCode): void {
    if (!window.confirm(`Supprimer le code ${code.code} ?`)) {
      return;
    }
    this.adminService
      .deletePromoCode(code.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.success('Code promo supprimé.');
          this.load();
        },
        error: () => this.toastService.error('Impossible de supprimer ce code promo.'),
      });
  }
}
