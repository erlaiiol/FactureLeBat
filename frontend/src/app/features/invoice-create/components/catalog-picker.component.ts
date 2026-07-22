import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ProductProfile } from '../../../core/models/product.model';
import { ServiceProfile } from '../../../core/models/service.model';
import { BadgeComponent } from '../../../shared/components/badge.component';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';

// Phase 11: zero-typing invoicing. Each row's "+" adds a prefilled line/
// service-line to the draft immediately — no checkbox-then-confirm step,
// since a single click is faster one-handed on a job site, and clicking
// several rows in a row still adds several lines.
@Component({
  selector: 'app-catalog-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, CentsToEurosPipe, UnitLabelPipe],
  templateUrl: './catalog-picker.component.html',
})
export class CatalogPickerComponent {
  readonly products = input.required<ProductProfile[]>();
  readonly services = input.required<ServiceProfile[]>();
  readonly pickProduct = output<ProductProfile>();
  readonly pickService = output<ServiceProfile>();

  protected readonly search = signal('');

  protected readonly filteredProducts = computed(() => this.filter(this.products()));
  protected readonly filteredServices = computed(() => this.filter(this.services()));

  protected onSearch(value: string): void {
    this.search.set(value);
  }

  private filter<T extends { name: string; code: string | null }>(items: T[]): T[] {
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return items;
    }
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) || (item.code ?? '').toLowerCase().includes(term),
    );
  }
}
