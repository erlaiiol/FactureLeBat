import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { CatalogFolderProfile, CatalogFolderRef } from '../../core/models/catalog-folder.model';
import { DiscountProfile, UpsertDiscountRequest } from '../../core/models/discount.model';
import { ProductProfile, UpsertProductRequest } from '../../core/models/product.model';
import { ServiceProfile, UpsertServiceRequest } from '../../core/models/service.model';
import { CatalogFolderService } from '../../core/services/catalog-folder.service';
import { DiscountService } from '../../core/services/discount.service';
import { ProductService } from '../../core/services/product.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { IconCheckComponent } from '../../shared/components/icon-check.component';
import { SkeletonRowsComponent } from '../../shared/components/skeleton-rows.component';
import { ToastService } from '../../core/services/toast.service';
import { planFeatureLockedMessage } from '../../shared/utils/plan-error.util';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 1.1-9.5: which of a folder card's three checklists (if any) is open
// — one signal per folder id, not per button, since "only one of the three
// panels open per card" is a per-card rule while other cards' own open
// panels must stay independent (see this page's own toggle()).
type CatalogKind = 'product' | 'service' | 'discount';

function folderIdsOf(folders: CatalogFolderRef[]): string[] {
  return folders.map((folder) => folder.id);
}

// Phase 1.1-9.5: the item side's own update endpoints are a full replace
// (UpdateXDto extends CreateXDto, no partial-update variant — see
// ProductRepository.update's `folders: { set: ... } }`), so toggling this
// one folder's membership from the folder side still has to resend the
// item's entire current field set, not just folderIds, or every other
// field would be wiped back to whatever a partial payload defaults to.
// These three builders reconstruct that full payload from the cached
// profile already in hand (ProductService.all() etc.), the same fields
// product-form.page.ts's own submit() sends, just sourced from the loaded
// profile instead of a reactive form.
function productUpdatePayload(product: ProductProfile, folderIds: string[]): UpsertProductRequest {
  return {
    name: product.name,
    description: product.description ?? undefined,
    unit: product.unit,
    priceCents: product.priceCents,
    supplierName: product.supplierName ?? undefined,
    supplierUrl: product.supplierUrl ?? undefined,
    code: product.code ?? undefined,
    packagingQuantity: product.packagingQuantity ? Number(product.packagingQuantity) : undefined,
    activityCategory: product.activityCategory ?? undefined,
    folderIds,
  };
}

function serviceUpdatePayload(service: ServiceProfile, folderIds: string[]): UpsertServiceRequest {
  return {
    name: service.name,
    description: service.description ?? undefined,
    pricingMode: service.pricingMode,
    priceCents: service.priceCents ?? undefined,
    percentageBasisPoints: service.percentageBasisPoints ?? undefined,
    defaultVisibility: service.defaultVisibility,
    code: service.code ?? undefined,
    activityCategory: service.activityCategory ?? undefined,
    folderIds,
  };
}

function discountUpdatePayload(
  discount: DiscountProfile,
  folderIds: string[],
): UpsertDiscountRequest {
  return {
    name: discount.name,
    discountType: discount.discountType,
    fixedAmountCents: discount.fixedAmountCents ?? undefined,
    percentageBasisPoints: discount.percentageBasisPoints ?? undefined,
    folderIds,
  };
}

// Phase 1.1-2: mirrors DiscountListPage's minimal CRUD screen exactly —
// create by name, delete, no fields beyond the name.
//
// Phase 1.1-9.5: each folder card also gets three round pill buttons
// (Produits/Prestations/Remises, reusing .fixed-add-button/.is-open from
// mode rapide's own three "Ajouter…" buttons — see
// invoice-create-lines-step.page.html — laid out horizontally instead of
// mode rapide's vertical stack) that expand an inline checklist grown
// *inside* the card via .panel-stretch (docs/design-system.md's
// panelStretch, already used by the navbar dropdowns — not
// .fixed-add-flyout, which anchors to the viewport instead of the card).
@Component({
  selector: 'app-catalog-folder-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BigButtonComponent,
    IconCheckComponent,
    SkeletonRowsComponent,
  ],
  templateUrl: './catalog-folder-list.page.html',
})
export class CatalogFolderListPage {
  private readonly catalogFolderService = inject(CatalogFolderService);
  private readonly productService = inject(ProductService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly discountService = inject(DiscountService);
  private readonly toastService = inject(ToastService);
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

  // Phase 1.1-9.5: the three catalogs, loaded once and reused reactively —
  // same "shared, cached, read via the service's own signal" pattern
  // InvoiceDraftStore already applies to these same three services, so a
  // successful toggle's cache write (ProductService.update's own
  // upsertInCache) is reflected here with no extra plumbing.
  protected readonly products = computed(() => this.productService.all() ?? []);
  protected readonly services = computed(() => this.serviceCatalogService.all() ?? []);
  protected readonly discounts = computed(() => this.discountService.all() ?? []);

  // Keyed by folder id; the value is whichever of the three checklists is
  // open for that card, or absent/undefined when none is. A plain object
  // (not a Map) so it works naturally as a signal value compared by
  // reference on every update() — same shape convention as this app's other
  // "one thing open at a time, but per-row" UI state.
  private readonly openPanelByFolderId = signal<Partial<Record<string, CatalogKind>>>({});
  // Per-item in-flight guard — same "ignore a fast repeat click while the
  // first write is still in flight" rule as every submit button in this
  // app, just applied to an inline checkbox toggle instead of a form
  // submit. Keyed by item id since several checklists (and, on a large
  // catalog, several items within the same one) could plausibly be
  // toggled in quick succession.
  private readonly savingItemIds = signal<ReadonlySet<string>>(new Set());

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

    // Best-effort loads, same "degrades gracefully, never blocks the page"
    // reasoning as every other cached-catalog load in this app — a failure
    // here just leaves that checklist showing "aucun élément" rather than
    // failing the whole page (the folder list itself doesn't depend on
    // these three).
    this.productService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.serviceCatalogService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.discountService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  protected goToSubscribe(): void {
    void this.router.navigateByUrl('/abonnement');
  }

  protected hasOpenPanel(folderId: string): boolean {
    return !!this.openPanelByFolderId()[folderId];
  }

  protected isPanelOpen(folderId: string, kind: CatalogKind): boolean {
    return this.openPanelByFolderId()[folderId] === kind;
  }

  // Opening a different panel on the same card replaces the entry (mutual
  // exclusivity within that one card); every other card's own entry is
  // untouched, so their panels stay open independently.
  protected togglePanel(folderId: string, kind: CatalogKind): void {
    this.openPanelByFolderId.update((current) => ({
      ...current,
      [folderId]: current[folderId] === kind ? undefined : kind,
    }));
  }

  protected isSaving(itemId: string): boolean {
    return this.savingItemIds().has(itemId);
  }

  protected isMember(folders: CatalogFolderRef[], folderId: string): boolean {
    return folders.some((folder) => folder.id === folderId);
  }

  protected toggleProduct(folder: CatalogFolderProfile, product: ProductProfile): void {
    if (this.isSaving(product.id)) {
      return;
    }
    const folderIds = this.toggledFolderIds(product.folders, folder.id);
    this.setSaving(product.id, true);
    this.productService
      .update(product.id, productUpdatePayload(product, folderIds))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.setSaving(product.id, false),
        error: () => {
          this.setSaving(product.id, false);
          this.toastService.error('Impossible de mettre à jour ce produit pour le moment.');
        },
      });
  }

  protected toggleService(folder: CatalogFolderProfile, service: ServiceProfile): void {
    if (this.isSaving(service.id)) {
      return;
    }
    const folderIds = this.toggledFolderIds(service.folders, folder.id);
    this.setSaving(service.id, true);
    this.serviceCatalogService
      .update(service.id, serviceUpdatePayload(service, folderIds))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.setSaving(service.id, false),
        error: () => {
          this.setSaving(service.id, false);
          this.toastService.error('Impossible de mettre à jour cette prestation pour le moment.');
        },
      });
  }

  protected toggleDiscount(folder: CatalogFolderProfile, discount: DiscountProfile): void {
    if (this.isSaving(discount.id)) {
      return;
    }
    const folderIds = this.toggledFolderIds(discount.folders, folder.id);
    this.setSaving(discount.id, true);
    this.discountService
      .update(discount.id, discountUpdatePayload(discount, folderIds))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.setSaving(discount.id, false),
        error: () => {
          this.setSaving(discount.id, false);
          this.toastService.error('Impossible de mettre à jour cette remise pour le moment.');
        },
      });
  }

  private toggledFolderIds(currentFolders: CatalogFolderRef[], folderId: string): string[] {
    return this.isMember(currentFolders, folderId)
      ? folderIdsOf(currentFolders).filter((id) => id !== folderId)
      : [...folderIdsOf(currentFolders), folderId];
  }

  private setSaving(itemId: string, saving: boolean): void {
    this.savingItemIds.update((current) => {
      const next = new Set(current);
      if (saving) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }
}
