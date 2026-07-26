import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminUserSummary } from '../../core/models/admin.model';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { IconCloseComponent } from '../../shared/components/icon-close.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton-table.component';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 14 admin dashboard, first screen: search/list every artisan account
// and grant temporary premium access by hand (support/goodwill cases) —
// the alternative to a promo code (see admin-promo-codes.page.ts) when the
// grant is for one specific, already-identified user rather than a
// shareable code.
@Component({
  selector: 'app-admin-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    BigButtonComponent,
    IconCloseComponent,
    SkeletonTableComponent,
    DatePipe,
  ],
  templateUrl: './admin-users.page.html',
})
export class AdminUsersPage {
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly users = signal<AdminUserSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly searchControl = this.fb.nonNullable.control('');

  // Which company's "accorder premium" inline form is currently open, and
  // its own loading/error state — keyed by companyId so several rows never
  // fight over one shared piece of state.
  protected readonly grantOpenFor = signal<string | null>(null);
  protected readonly grantForm = this.fb.nonNullable.group({
    days: [30, [Validators.required, Validators.min(1)]],
  });
  protected readonly grantLoading = signal(false);
  protected readonly grantError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.adminService
      .listUsers(this.searchControl.value || undefined, this.page())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.users.set(result.users);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toastService.error('Impossible de charger les utilisateurs.');
        },
      });
  }

  protected search(): void {
    this.page.set(1);
    this.load();
  }

  protected nextPage(): void {
    this.page.update((p) => p + 1);
    this.load();
  }

  protected previousPage(): void {
    this.page.update((p) => Math.max(1, p - 1));
    this.load();
  }

  protected openGrant(companyId: string): void {
    this.grantOpenFor.set(companyId);
    this.grantError.set(null);
    this.grantForm.setValue({ days: 30 });
  }

  protected closeGrant(): void {
    this.grantOpenFor.set(null);
  }

  protected submitGrant(companyId: string): void {
    if (this.grantForm.invalid) {
      this.grantForm.markAllAsTouched();
      return;
    }
    const days = this.grantForm.getRawValue().days;
    this.grantLoading.set(true);
    this.grantError.set(null);
    this.adminService
      .grantPremium(companyId, days)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.grantLoading.set(false);
          this.grantOpenFor.set(null);
          this.toastService.success(`Accès premium accordé pour ${days} jours.`);
          this.load();
        },
        error: () => {
          this.grantLoading.set(false);
          this.grantError.set("Impossible d'accorder l'accès premium pour le moment.");
        },
      });
  }
}
