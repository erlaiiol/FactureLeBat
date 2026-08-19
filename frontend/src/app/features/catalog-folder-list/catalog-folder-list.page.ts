import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { CatalogFolderProfile } from '../../core/models/catalog-folder.model';
import { CatalogFolderService } from '../../core/services/catalog-folder.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { SkeletonRowsComponent } from '../../shared/components/skeleton-rows.component';
import { planFeatureLockedMessage } from '../../shared/utils/plan-error.util';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 1.1-2: mirrors DiscountListPage's minimal CRUD screen exactly —
// create by name, delete, no fields beyond the name.
@Component({
  selector: 'app-catalog-folder-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BigButtonComponent, SkeletonRowsComponent],
  templateUrl: './catalog-folder-list.page.html',
})
export class CatalogFolderListPage {
  private readonly catalogFolderService = inject(CatalogFolderService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly folders = signal<CatalogFolderProfile[]>([]);
  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly errorMessage = signal<string | null>(null);
  // Phase 1.1-2 amendment: Dossiers is Pro+/Premium-only (see
  // PlanFeatureLockedException) — distinct from errorMessage so the screen
  // shows an upsell CTA instead of a generic "couldn't load" message. Any
  // existing folders are never deleted on downgrade, only inaccessible from
  // here until back at Pro+ — same reasoning as StatsReportsPage's
  // analyticsLocked.
  protected readonly locked = signal(false);

  protected readonly search = this.fb.nonNullable.control('');

  constructor() {
    this.search.valueChanges
      .pipe(
        startWith(''),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => this.catalogFolderService.getAll(term || undefined)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (folders) => {
          this.folders.set(folders);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          if (planFeatureLockedMessage(error)) {
            this.locked.set(true);
          } else {
            this.errorMessage.set('Impossible de charger vos dossiers. Veuillez réessayer.');
          }
        },
      });
  }

  protected goToSubscribe(): void {
    void this.router.navigateByUrl('/abonnement');
  }
}
