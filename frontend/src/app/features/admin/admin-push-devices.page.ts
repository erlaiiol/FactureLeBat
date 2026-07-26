import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PushDeviceSummary } from '../../core/models/admin.model';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton-table.component';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 22: which accounts have the mobile app installed (registered FCM
// devices) and a manual test-send — same search/paginate shape as
// admin-users.page.ts, one extra per-row action (test push) instead of an
// inline form.
@Component({
  selector: 'app-admin-push-devices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    BigButtonComponent,
    SkeletonTableComponent,
    DatePipe,
  ],
  templateUrl: './admin-push-devices.page.html',
})
export class AdminPushDevicesPage {
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly devices = signal<PushDeviceSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly searchControl = this.fb.nonNullable.control('');

  // Which device's test-send is currently in flight — keyed by device id so
  // several rows never fight over one shared loading flag.
  protected readonly sendingFor = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.adminService
      .listPushDevices(this.searchControl.value || undefined, this.page())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.devices.set(result.devices);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toastService.error('Impossible de charger les appareils.');
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

  protected sendTest(deviceId: string): void {
    if (this.sendingFor()) {
      return;
    }
    this.sendingFor.set(deviceId);
    this.adminService
      .sendTestPush(deviceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.sendingFor.set(null);
          this.toastService.success('Notification de test envoyée.');
        },
        error: () => {
          this.sendingFor.set(null);
          this.toastService.error("Impossible d'envoyer la notification de test.");
        },
      });
  }
}
