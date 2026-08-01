import { Pipe, PipeTransform } from '@angular/core';
import { QUANTITY_LABELS_SHORT, Unit } from '../../core/models/unit.model';

@Pipe({ name: 'quantityLabel' })
export class QuantityLabelPipe implements PipeTransform {
  transform(unit: Unit): string {
    return QUANTITY_LABELS_SHORT[unit];
  }
}
