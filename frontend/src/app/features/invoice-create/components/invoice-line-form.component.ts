import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { WasteSurcharge } from '../../../core/models/invoice.model';
import { isAreaUnit, Unit, UNIT_OPTIONS } from '../../../core/models/unit.model';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';

export type InvoiceLineFormGroup = FormGroup<{
  description: FormControl<string>;
  unit: FormControl<Unit>;
  quantity: FormControl<number>;
  unitPriceEuros: FormControl<number>;
  wasteSurcharge: FormControl<WasteSurcharge>;
}>;

@Component({
  selector: 'app-invoice-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldHintComponent],
  templateUrl: './invoice-line-form.component.html',
})
export class InvoiceLineFormComponent {
  readonly group = input.required<InvoiceLineFormGroup>();
  readonly index = input.required<number>();
  readonly remove = output<void>();

  protected readonly unitOptions = UNIT_OPTIONS;

  // Phase 7: the calculation mode is no longer a separate choice — picking
  // a unit that has area semantics (m²) is what turns on waste-surcharge
  // billing, exactly like the backend derives it (see unit.util.ts).
  protected isAreaMode(): boolean {
    return isAreaUnit(this.group().controls.unit.value);
  }
}
