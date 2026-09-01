import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PlatformService } from '../../core/services/platform.service';

// One column of the quantity odometer (see QuantityWheelPickerComponent) —
// a single digit 0-9 the artisan scrolls/swipes through, snapping to the
// centered row, instead of typing it on a keyboard. Kept as its own
// component (rather than inlined 6 times) so the scroll-position <-> digit
// math and the snap geometry live in exactly one place.
@Component({
  selector: 'app-digit-wheel-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #scroller
      (scroll)="onScroll()"
      class="quantity-wheel-scroller flex h-[132px] w-10 flex-col overflow-y-scroll py-11 snap-y snap-mandatory"
    >
      @for (digit of digits; track digit) {
        <button
          type="button"
          tabindex="-1"
          (click)="scrollToDigit(digit)"
          class="flex h-11 w-10 shrink-0 items-center justify-center font-mono text-xl font-semibold text-ink snap-center"
        >
          {{ digit }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .quantity-wheel-scroller {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .quantity-wheel-scroller::-webkit-scrollbar {
        display: none;
      }
    `,
  ],
})
export class DigitWheelColumnComponent {
  private static readonly ROW_HEIGHT_PX = 44;

  readonly value = input.required<number>();
  readonly valueChange = output<number>();

  protected readonly digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  private readonly platform = inject(PlatformService);
  private readonly scroller = viewChild.required<ElementRef<HTMLDivElement>>('scroller');
  private scrollSettleTimer: ReturnType<typeof setTimeout> | undefined;
  // Tracks the digit last reported to valueChange (or the initial value) so
  // an externally-driven `value` change (e.g. QuantityWheelPickerComponent
  // resetting the whole picker) is told apart from this column's own
  // scroll settling — the latter must never re-trigger its own scrollTo,
  // which would fight the momentum still finishing on-screen.
  private lastKnownDigit: number | undefined;
  // Separate from lastKnownDigit: ticks on every row the finger passes
  // during the scroll, not just once it settles, so the odometer feels
  // like it's clicking through detents as it moves.
  private lastHapticDigit: number | undefined;
  // Programmatic scrollTo calls (initial mount, an externally-driven value
  // change) fire the same `scroll` events a swipe does — without this guard
  // every open of the sheet would buzz once for "free", with no touch behind it.
  private suppressHapticsUntil = 0;

  constructor() {
    // The scroller's own size isn't laid out until after the first render,
    // so the initial alignment has to wait one tick — same reasoning as
    // InvoiceLineFormComponent's one-shot effect for a required input.
    // `behavior: 'auto'` (rather than the newer 'instant', not yet in every
    // ScrollBehavior typing) still lands immediately since nothing sets the
    // `scroll-behavior: smooth` CSS property here.
    afterNextRender(() => this.scrollToDigit(this.value(), 'auto'));

    effect(() => {
      const digit = this.value();
      // Guards against firing before afterNextRender has run — the view
      // child isn't safe to touch until then, see above.
      if (this.lastKnownDigit !== undefined && digit !== this.lastKnownDigit) {
        this.scrollToDigit(digit, 'smooth');
      }
    });
  }

  protected scrollToDigit(digit: number, behavior: 'auto' | 'smooth' = 'smooth'): void {
    this.lastKnownDigit = digit;
    this.lastHapticDigit = digit;
    this.suppressHapticsUntil = Date.now() + (behavior === 'smooth' ? 400 : 50);
    this.scroller().nativeElement.scrollTo({
      top: digit * DigitWheelColumnComponent.ROW_HEIGHT_PX,
      behavior,
    });
  }

  // Scroll-snap fires many intermediate `scroll` events while the browser's
  // own momentum/snap animation settles — reading the digit off any single
  // one of those would flicker. Waiting for a short quiet period after the
  // last event is the same "debounce until it stops moving" approach used
  // for scroll-position-derived state elsewhere, just without a library.
  protected onScroll(): void {
    this.tickHapticIfDigitChanged();
    clearTimeout(this.scrollSettleTimer);
    this.scrollSettleTimer = setTimeout(() => this.commitScrollPosition(), 120);
  }

  // Fires on every row crossed mid-swipe (not debounced like the commit
  // above) so each digit feels like its own detent, the way a physical
  // odometer clicks through numbers rather than buzzing once at the end.
  private tickHapticIfDigitChanged(): void {
    if (!this.platform.isNativeApp() || Date.now() < this.suppressHapticsUntil) {
      return;
    }
    const scrollTop = this.scroller().nativeElement.scrollTop;
    const digit = Math.min(
      9,
      Math.max(0, Math.round(scrollTop / DigitWheelColumnComponent.ROW_HEIGHT_PX)),
    );
    if (digit !== this.lastHapticDigit) {
      this.lastHapticDigit = digit;
      void Haptics.impact({ style: ImpactStyle.Light });
    }
  }

  private commitScrollPosition(): void {
    const scrollTop = this.scroller().nativeElement.scrollTop;
    const digit = Math.min(
      9,
      Math.max(0, Math.round(scrollTop / DigitWheelColumnComponent.ROW_HEIGHT_PX)),
    );
    this.lastKnownDigit = digit;
    if (digit !== this.value()) {
      this.valueChange.emit(digit);
    }
  }
}
