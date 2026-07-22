import { Pipe, PipeTransform } from '@angular/core';
import { Unit, UNIT_LABELS } from '../../core/models/unit.model';

@Pipe({ name: 'unitLabel' })
export class UnitLabelPipe implements PipeTransform {
  transform(unit: Unit): string {
    return UNIT_LABELS[unit];
  }
}
