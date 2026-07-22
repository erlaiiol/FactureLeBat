import { Pipe, PipeTransform } from '@angular/core';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

@Pipe({ name: 'centsToEuros' })
export class CentsToEurosPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    if (cents == null) {
      return eur.format(0);
    }
    return eur.format(cents / 100);
  }
}
