import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cgu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './cgu.page.html',
})
export class CguPage {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  constructor() {
    this.title.setTitle("Conditions générales d'utilisation — FactureLe");
    this.meta.updateTag({
      name: 'description',
      content:
        "Conditions générales d'utilisation de FactureLe, l'outil de facturation en un clic pour artisans, indépendants et petites entreprises.",
    });
  }
}
