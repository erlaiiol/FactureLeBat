import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-confidentialite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './confidentialite.page.html',
})
export class ConfidentialitePage {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  constructor() {
    this.title.setTitle('Politique de confidentialité — FactureLe');
    this.meta.updateTag({
      name: 'description',
      content:
        'Comment FactureLe collecte, utilise et protège vos données : compte, profil entreprise, clients, produits/prestations et factures/devis.',
    });
  }
}
