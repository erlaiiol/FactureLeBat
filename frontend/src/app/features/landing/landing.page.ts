import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { IconCheckComponent } from '../../shared/components/icon-check.component';

// Phase 13.3: the public, logged-out front door — see docs/positioning.md
// for the messaging this page implements (pitch, pillars, CTA wording) and
// docs/design-system.md for why it's built on "Atelier sobre" rather than
// "Chantier calibré" (a storytelling surface, not data entry).
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconCheckComponent],
  templateUrl: './landing.page.html',
})
export class LandingPage {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  // Proof strip under the hero CTA: hidden at rest, revealed once (never
  // re-hidden) as soon as the visitor scrolls past the first few pixels.
  protected readonly proofOpen = signal(false);

  protected readonly proofs = [
    {
      figure: '3,7×',
      title: 'Plus de devis signés',
      text: 'Les devis transformés en factures, en moyenne, quand tout part en un clic devant le client.',
    },
    {
      figure: '0',
      title: 'Relance à écrire',
      text: 'Vos clients sont relancés automatiquement. Vous, vous continuez à travailler.',
    },
    {
      figure: '100\u00a0%',
      title: 'Compta sur pilote automatique',
      text: 'Chaque facture alimente votre comptabilité toute seule. Fini la ressaisie du dimanche soir.',
    },
  ];

  @HostListener('window:scroll')
  protected onScroll(): void {
    if (!this.proofOpen() && window.scrollY > 24) {
      this.proofOpen.set(true);
    }
  }

  constructor() {
    this.title.setTitle('FactureLe — Devis et factures en un clic, quoi que vous fassiez');
    this.meta.updateTag({
      name: 'description',
      content:
        'Que vous vendiez, répariez, enseigniez ou créiez, la question reste la même : je facture comment ? Configurez une seule fois vos clients, produits et prestations, puis créez vos devis et factures en un clic, directement devant le client. Essai gratuit, sans carte bancaire.',
    });
  }
}
