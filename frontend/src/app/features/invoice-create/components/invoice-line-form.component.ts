import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LineMode, WasteSurcharge } from '../../../core/models/invoice.model';

export type InvoiceLineFormGroup = FormGroup<{
  description: FormControl<string>;
  unit: FormControl<string>;
  mode: FormControl<LineMode>;
  quantity: FormControl<number>;
  unitPriceEuros: FormControl<number>;
  wasteSurcharge: FormControl<WasteSurcharge>;
}>;

@Component({
  selector: 'app-invoice-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './invoice-line-form.component.html',
})
export class InvoiceLineFormComponent {
  readonly group = input.required<InvoiceLineFormGroup>();
  readonly index = input.required<number>();
  readonly remove = output<void>();

  protected isAreaMode(): boolean {
    return this.group().controls.mode.value === 'AREA';
  }
}
