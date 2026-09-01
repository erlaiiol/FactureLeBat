import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { IconCheckComponent } from '../../shared/components/icon-check.component';

// Public explainer page, reached from the landing page's "Prêt pour la
// réforme" pillar card (see landing.page.html). Same "Atelier sobre"
// identity as the landing page (docs/design-system.md) — a storytelling
// surface continuing the pitch, not an app screen. Flat top-level route,
// no guestGuard: unlike the landing page itself, a signed-in artisan
// linking this page (or finding it via search) shouldn't be bounced.
@Component({
  selector: 'app-reforme-facturation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconCheckComponent],
  templateUrl: './reforme-facturation.page.html',
})
export class ReformeFacturationPage {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  constructor() {
    this.title.setTitle('La réforme de la facturation électronique, expliquée — FactureLe');
    this.meta.updateTag({
      name: 'description',
      content:
        "Facturation électronique obligatoire 2026-2027 : ce que dit la réforme, les échéances qui vous concernent, et comment FactureLe s'en occupe déjà pour vous — Factur-X, transmission via plateforme agréée, réception des factures fournisseurs.",
    });
  }
}
