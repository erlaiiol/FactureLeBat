import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';
import { SiteLegalPublicService } from '../../core/services/site-legal.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';

// Phase 20: FactureLe's own legal identity (mentions légales), editable in
// exactly this one place — read side is the public GET /site-legal
// (SiteLegalPublicService, reused by the public /mentions-legales page and
// the footer), write side is admin-only (AdminService.updateSiteLegalInfo).
// Full-replace form, same convention as CompanySettingsPage — every field
// is resent on save rather than a partial-merge PATCH.
@Component({
  selector: 'app-admin-site-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BigButtonComponent, FieldHintComponent],
  templateUrl: './admin-site-legal.page.html',
})
export class AdminSiteLegalPage {
  private readonly adminService = inject(AdminService);
  private readonly siteLegalService = inject(SiteLegalPublicService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    publisherName: ['', Validators.required],
    siret: ['', Validators.required],
    address: ['', Validators.required],
    directorOfPublication: ['', Validators.required],
    hostingProviderName: ['', Validators.required],
    hostingProviderAddress: ['', Validators.required],
    contactEmail: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    this.siteLegalService
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.form.reset(info);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toastService.error('Impossible de charger les informations légales.');
        },
      });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.adminService
      .updateSiteLegalInfo(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toastService.success('Informations légales enregistrées.');
        },
        error: () => {
          this.saving.set(false);
          this.toastService.error("Impossible d'enregistrer les informations légales.");
        },
      });
  }
}
