import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogFolderProfile } from '../../core/models/catalog-folder.model';
import { CatalogFolderService } from '../../core/services/catalog-folder.service';
import { planFeatureLockedMessage } from '../utils/plan-error.util';
import { IconCheckComponent } from './icon-check.component';
import { IconChevronDownComponent } from './icon-chevron-down.component';

// Phase 1.1-2: the "Paramètres avancés" folder picker on the product/
// service/discount forms. Local, uncommitted UI state only — the parent
// form's own submit() reads selectedIds() and sends it as folderIds, same
// "nothing writes until the form is actually submitted" rule as every other
// field on those forms (see ProductFormPage.packagingItemCount for the same
// pattern: a signal outside the reactive FormGroup, merged in at payload
// time).
@Component({
  selector: 'app-catalog-folder-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconCheckComponent, IconChevronDownComponent],
  template: `
    <div class="flex flex-col gap-1">
      <span class="text-sm font-medium text-ink">Dossiers</span>

      @if (locked()) {
        <!-- Phase 1.1-2 amendment: Dossiers is Pro+/Premium-only — this
             product/service/remise's existing folder assignments (if any,
             from before a downgrade) stay intact in the payload, this just
             locks changing them until back at Pro+ (see
             CatalogFolderService.filterOwnedFolderIds's comment on the
             backend for why an unrelated field edit here never wipes them). -->
        <p class="rounded-lg border border-line bg-bg p-3 text-sm text-ink-soft">
          Réservés aux offres Pro et Premium —
          <a routerLink="/abonnement" class="font-medium text-primary hover:underline">
            voir les offres
          </a>
          .
        </p>
      } @else {
        <button
          type="button"
          (click)="panelOpen.set(!panelOpen())"
          [attr.aria-expanded]="panelOpen()"
          class="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-4 py-3 text-left text-lg"
        >
          <span class="text-ink-soft">
            @if (selectedIds().length === 0) {
              Aucun dossier
            } @else {
              {{ selectedNames() }}
            }
          </span>
          <app-icon-chevron-down [size]="16" [rotated]="panelOpen()" />
        </button>

        @if (panelOpen()) {
          <div class="anim-preview-in mt-1 flex flex-col gap-2 rounded-lg border border-line p-2">
            @if (folders().length === 0) {
              <p class="p-2 text-sm text-ink-soft">
                Aucun dossier créé pour l'instant —
                <a routerLink="/dossiers" class="font-medium text-primary hover:underline">
                  créez-en un
                </a>
                pour organiser votre catalogue par métier.
              </p>
            } @else {
              @for (folder of folders(); track folder.id) {
                @let isSelected = selectedIds().includes(folder.id);
                <button
                  type="button"
                  (click)="toggle(folder.id)"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg"
                  [class.bg-primary-subtle]="isSelected"
                >
                  {{ folder.name }}
                  @if (isSelected) {
                    <span class="text-primary"><app-icon-check [size]="14" /></span>
                  }
                </button>
              }
            }
          </div>
        }
      }
    </div>
  `,
})
export class CatalogFolderMultiSelectComponent {
  private readonly catalogFolderService = inject(CatalogFolderService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedIds = input<string[]>([]);
  readonly selectedIdsChange = output<string[]>();

  protected readonly folders = signal<CatalogFolderProfile[]>([]);
  protected readonly panelOpen = signal(false);
  protected readonly locked = signal(false);

  constructor() {
    this.catalogFolderService
      .getAllCached()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (folders) => this.folders.set(folders),
        error: (error: unknown) => {
          if (planFeatureLockedMessage(error)) {
            this.locked.set(true);
          }
        },
      });
  }

  protected selectedNames(): string {
    const byId = new Map(this.folders().map((folder) => [folder.id, folder.name]));
    return this.selectedIds()
      .map((id) => byId.get(id))
      .filter((name): name is string => !!name)
      .join(', ');
  }

  protected toggle(folderId: string): void {
    const current = this.selectedIds();
    const next = current.includes(folderId)
      ? current.filter((id) => id !== folderId)
      : [...current, folderId];
    this.selectedIdsChange.emit(next);
  }
}
