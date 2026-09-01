import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CompanyService } from '../../core/services/company.service';
import { PlatformService } from '../../core/services/platform.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from './big-button.component';
import { DigitWheelColumnComponent } from './digit-wheel-column.component';

// The quantity mini-input on a collapsed catalog-picked line (see
// invoice-create-lines-step.page.html) drops in here as a straight
// [formControl] swap. On the web (mouse + real keyboard, plenty of space)
// it's exactly the plain number input it replaced — no wheel, no picker,
// nothing else rendered. Only inside the native mobile/tablet app
// (PlatformService.isNativeApp — Capacitor's own platform check, no user
// preference involved) does tapping the value open a bottom sheet with a
// 6-digit odometer, the same "tap to open, like a keyboard" gesture as any
// other on-screen input — never displayed inline, unprompted.
@Component({
  selector: 'app-quantity-wheel-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DigitWheelColumnComponent, BigButtonComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => QuantityWheelPickerComponent),
      multi: true,
    },
  ],
  template: `
    @if (!platform.isNativeApp()) {
      <input
        type="number"
        step="0.01"
        [value]="quantity()"
        (input)="onKeyboardInput($any($event.target).value)"
        (blur)="onTouched()"
        class="w-20 rounded border border-line px-2 py-1 text-right"
      />
    } @else {
      <button
        type="button"
        (click)="openSheet()"
        class="w-20 rounded border border-line px-2 py-1 text-right font-mono tabular-nums"
      >
        {{ formattedQuantity() }}
      </button>

      @if (sheetOpen()) {
        <div
          class="fixed inset-0 z-50 flex items-end justify-center bg-ink/70"
          role="dialog"
          aria-modal="true"
          aria-label="Choisir la quantité"
          (click)="closeSheet()"
        >
          <div
            class="sheet-in flex w-full flex-col items-center gap-3 rounded-t-2xl bg-surface p-3 shadow-2xl"
            style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
            (click)="$event.stopPropagation()"
          >
            <div class="flex w-full items-center justify-between px-1">
              <span class="text-sm font-medium text-ink-soft">Quantité</span>
              <button
                type="button"
                (click)="toggleKeyboardMode()"
                class="text-sm font-medium text-brand"
              >
                {{ keyboardMode() ? 'Molette' : 'Clavier' }}
              </button>
            </div>

            @if (keyboardMode()) {
              <input
                #keyboardInput
                type="number"
                step="0.01"
                inputmode="decimal"
                [value]="quantity()"
                (input)="onKeyboardInput($any($event.target).value)"
                class="w-32 rounded border border-line px-2 py-1.5 text-center text-lg font-mono tabular-nums"
              />
            } @else {
              <div class="flex items-center rounded-lg border border-line bg-bg px-1">
                <app-digit-wheel-column [value]="digits()[0]" (valueChange)="setDigit(0, $event)" />
                <app-digit-wheel-column [value]="digits()[1]" (valueChange)="setDigit(1, $event)" />
                <app-digit-wheel-column [value]="digits()[2]" (valueChange)="setDigit(2, $event)" />
                <app-digit-wheel-column [value]="digits()[3]" (valueChange)="setDigit(3, $event)" />
                <span class="mx-0.5 font-mono text-lg font-semibold text-ink-soft">,</span>
                <app-digit-wheel-column [value]="digits()[4]" (valueChange)="setDigit(4, $event)" />
                <app-digit-wheel-column [value]="digits()[5]" (valueChange)="setDigit(5, $event)" />
              </div>
            }

            <app-big-button type="button" (click)="closeSheet()">OK</app-big-button>
          </div>
        </div>
      }
    }
  `,
})
export class QuantityWheelPickerComponent implements ControlValueAccessor {
  protected readonly platform = inject(PlatformService);
  private readonly companyService = inject(CompanyService);
  private readonly toastService = inject(ToastService);

  // Whole-number cents cap the odometer can express — clamped defensively
  // so a value from outside this component (e.g. hand-edited draft data)
  // can never derive an out-of-range or negative digit.
  private static readonly MAX_QUANTITY = 9999.99;

  private static readonly QUANTITY_FORMATTER = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  protected readonly quantity = signal(0);
  protected readonly sheetOpen = signal(false);
  protected readonly keyboardMode = signal(false);

  private readonly keyboardInput = viewChild<ElementRef<HTMLInputElement>>('keyboardInput');

  constructor() {
    effect(() => {
      const input = this.keyboardInput();
      if (input) {
        input.nativeElement.focus();
      }
    });
  }

  protected readonly formattedQuantity = computed(() =>
    QuantityWheelPickerComponent.QUANTITY_FORMATTER.format(this.quantity()),
  );

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

  protected openSheet(): void {
    // Defaults to whichever mode the artisan last settled on — implicitly
    // by sliding the toggle below, or explicitly in "Mon entreprise" — not
    // hardcoded to the molette, so the choice actually sticks across opens.
    this.keyboardMode.set(this.companyService.preferKeyboardQuantityInput() ?? false);
    this.sheetOpen.set(true);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
    this.onTouched();
  }

  protected toggleKeyboardMode(): void {
    const next = !this.keyboardMode();
    this.keyboardMode.set(next);
    // Fire-and-forget, same "silent success, toast on failure" pattern as
    // company-settings.page.ts's onTourEnabledChange — a failed save here
    // shouldn't block entering the quantity, just surface that the
    // preference itself didn't stick.
    this.companyService.updateQuantityInputMode(next).subscribe({
      error: () => this.toastService.error('Impossible d’enregistrer cette préférence.'),
    });
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
