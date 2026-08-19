import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogFolderService } from '../../core/services/catalog-folder.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';
import { planFeatureLockedMessage } from '../../shared/utils/plan-error.util';

@Component({
  selector: 'app-catalog-folder-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './catalog-folder-form.page.html',
})
export class CatalogFolderFormPage {
  private readonly catalogFolderService = inject(CatalogFolderService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly folderId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditing = this.folderId !== null;

  protected readonly loading = signal(this.isEditing);
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Phase 1.1-2 amendment: reached directly (bookmarked/back-navigated URL)
  // by a company that no longer has Pro+/Premium access — same locked
  // treatment as CatalogFolderListPage, since the list page's own "+
  // Nouveau dossier" link is hidden in that case and shouldn't normally lead
  // here at all.
  protected readonly locked = signal(false);

  // Deliberately a shorter form than ProductFormPage/ServiceFormPage/
  // DiscountFormPage: name only — a dossier holds no billable content of
  // its own.
  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
  });

  constructor() {
    if (this.folderId) {
      this.catalogFolderService
        .getById(this.folderId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (folder) => {
            this.loading.set(false);
            this.form.patchValue({ name: folder.name });
          },
          error: (error: unknown) => {
            this.loading.set(false);
            if (planFeatureLockedMessage(error)) {
              this.locked.set(true);
            } else {
              this.errorMessage.set('Impossible de charger ce dossier.');
            }
          },
        });
    }
  }

  protected submit(): void {
    if (this.saving()) {
      return; // already in flight — ignore a fast double click/tap
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = { name: this.form.getRawValue().name };

    this.saving.set(true);
    this.errorMessage.set(null);

    const request = this.folderId
      ? this.catalogFolderService.update(this.folderId, payload)
      : this.catalogFolderService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toastService.success(this.isEditing ? 'Dossier modifié.' : 'Dossier enregistré.');
        void this.router.navigate(['/dossiers']);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (planFeatureLockedMessage(error)) {
          this.locked.set(true);
        } else {
          this.errorMessage.set('Erreur lors de l’enregistrement. Veuillez réessayer.');
        }
      },
    });
  }

  protected goToSubscribe(): void {
    void this.router.navigateByUrl('/abonnement');
  }

  // Deleting a folder just drops its join rows on the Product/Service/
  // Discount side — those items simply fall back to the unassigned list,
  // never deleted or otherwise touched (see docs/roadmap.md Phase 1.1-2).
  protected delete(): void {
    if (!this.folderId || this.deleting()) {
      return;
    }
    if (!window.confirm(`Supprimer le dossier « ${this.form.controls.name.value} » ?`)) {
      return;
    }
    this.deleting.set(true);
    this.catalogFolderService
      .delete(this.folderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.toastService.success('Dossier supprimé.');
          void this.router.navigate(['/dossiers']);
        },
        error: () => {
          this.deleting.set(false);
          this.toastService.error('Impossible de supprimer ce dossier.');
        },
      });
  }
}
