import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { QuantityInputModeService } from '../../core/services/quantity-input-mode.service';
import { DigitWheelColumnComponent } from './digit-wheel-column.component';

// The quantity mini-input on a collapsed catalog-picked line (see
// invoice-create-lines-step.page.html) drops in here as a straight
// [formControl] swap. In 'wheel' mode it's a 6-digit odometer (4 whole
// euros/units + 2 decimals, i.e. cents from 0 to 999999 — the "6 chiffres
// max" the artisan asked for); in 'keyboard' mode it's the same plain
// number input it replaced. QuantityInputModeService owns which one shows,
// so the small switch here just flips that one shared preference — every
// picker on screen (and every one after a reload) follows it.
@Component({
  selector: 'app-quantity-wheel-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DigitWheelColumnComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => QuantityWheelPickerComponent),
      multi: true,
    },
  ],
  template: `
    <div class="flex items-center gap-1.5">
      @if (inputMode.mode() === 'wheel') {
        <div class="flex items-center rounded-lg border border-line bg-bg px-1">
          <app-digit-wheel-column [value]="digits()[0]" (valueChange)="setDigit(0, $event)" />
          <app-digit-wheel-column [value]="digits()[1]" (valueChange)="setDigit(1, $event)" />
          <app-digit-wheel-column [value]="digits()[2]" (valueChange)="setDigit(2, $event)" />
          <app-digit-wheel-column [value]="digits()[3]" (valueChange)="setDigit(3, $event)" />
          <span class="mx-0.5 font-mono text-lg font-semibold text-ink-soft">,</span>
          <app-digit-wheel-column [value]="digits()[4]" (valueChange)="setDigit(4, $event)" />
          <app-digit-wheel-column [value]="digits()[5]" (valueChange)="setDigit(5, $event)" />
        </div>
      } @else {
        <input
          type="number"
          step="0.01"
          [value]="quantity()"
          (input)="onKeyboardInput($any($event.target).value)"
          (blur)="onTouched()"
          class="w-20 rounded border border-line px-2 py-1 text-right"
        />
      }

      <button
        type="button"
        role="switch"
        [attr.aria-checked]="inputMode.mode() === 'keyboard'"
        [title]="
          inputMode.mode() === 'wheel'
            ? 'Passer au clavier classique pour cette quantité'
            : 'Revenir à la roue pour cette quantité'
        "
        (click)="inputMode.toggle()"
        class="relative h-5 w-9 shrink-0 rounded-full border border-line transition-colors"
        [class.bg-primary]="inputMode.mode() === 'keyboard'"
        [class.bg-bg]="inputMode.mode() === 'wheel'"
      >
        <span
          class="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-surface shadow transition-transform"
          [style.transform]="
            inputMode.mode() === 'keyboard' ? 'translateX(1.125rem)' : 'translateX(0)'
          "
        ></span>
      </button>
    </div>
  `,
})
export class QuantityWheelPickerComponent implements ControlValueAccessor {
  protected readonly inputMode = inject(QuantityInputModeService);

  // Whole-number cents cap the odometer can express — clamped defensively
  // so a value from outside this component (e.g. hand-edited draft data)
  // can never derive an out-of-range or negative digit.
  private static readonly MAX_QUANTITY = 9999.99;

  protected readonly quantity = signal(0);

  protected readonly digits = computed(() => {
    const clamped = Math.min(
      QuantityWheelPickerComponent.MAX_QUANTITY,
      Math.max(0, this.quantity()),
    );
    const cents = Math.round(clamped * 100);
    return [
      Math.floor(cents / 100000) % 10,
      Math.floor(cents / 10000) % 10,
      Math.floor(cents / 1000) % 10,
      Math.floor(cents / 100) % 10,
      Math.floor(cents / 10) % 10,
      cents % 10,
    ];
  });

  private onChange: (value: number) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.quantity.set(value ?? 0);
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  protected setDigit(index: number, newDigit: number): void {
    const updated = [...this.digits()];
    updated[index] = newDigit;
    const cents =
      updated[0] * 100000 +
      updated[1] * 10000 +
      updated[2] * 1000 +
      updated[3] * 100 +
      updated[4] * 10 +
      updated[5];
    this.commit(cents / 100);
  }

  protected onKeyboardInput(rawValue: string): void {
    const parsed = Number(rawValue);
    this.commit(Number.isFinite(parsed) ? parsed : 0);
  }

  private commit(value: number): void {
    this.quantity.set(value);
    this.onChange(value);
  }
}
