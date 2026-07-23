import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

// Phase 13.3: the public, logged-out front door — see docs/positioning.md
// for the messaging this page implements (pitch, pillars, CTA wording) and
// docs/design-system.md for why it's built on "Atelier sobre" rather than
// "Chantier calibré" (a storytelling surface, not data entry).
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './landing.page.html',
})
export class LandingPage {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  protected readonly currentYear = new Date().getFullYear();

  constructor() {
    this.title.setTitle(
      'FactureLeBat — Devis et factures en un clic pour les artisans du bâtiment',
    );
    this.meta.updateTag({
      name: 'description',
      content:
        'Configurez une seule fois vos clients, produits et prestations, puis créez vos devis et factures en un clic, directement chez le client. Essai gratuit, sans carte bancaire.',
    });
  }
}
