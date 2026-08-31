import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SiteLegalPublicService } from '../../../core/services/site-legal.service';
import { SiteLegalInfo } from '../../../core/models/site-legal.model';
import { IconWarningComponent } from '../../../shared/components/icon-warning.component';

// Phase 20: FactureLe's own legal identity as the SaaS publisher (not an
// artisan's own Company, which never appears here) — filled in via the
// admin "Infos légales" page, GET /site-legal is public since this is
// legally-mandated public information regardless of who reads it.
@Component({
  selector: 'app-mentions-legales-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconWarningComponent],
  templateUrl: './mentions-legales.page.html',
})
export class MentionsLegalesPage {
  private readonly siteLegalService = inject(SiteLegalPublicService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly loading = signal(true);
  protected readonly info = signal<SiteLegalInfo | null>(null);

  constructor() {
    this.title.setTitle('Mentions légales — FactureLe');
    this.meta.updateTag({
      name: 'description',
      content:
        "Mentions légales de FactureLe, l'outil de facturation en un clic pour artisans et indépendants : éditeur, hébergeur, contact.",
    });
    this.siteLegalService
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.info.set(info);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  // True once at least one field has actually been filled in by an admin —
  // an all-empty response means the deploy hasn't been configured yet.
  protected isConfigured(): boolean {
    const info = this.info();
    return !!info && Object.values(info).some((value) => value.trim().length > 0);
  }
}
