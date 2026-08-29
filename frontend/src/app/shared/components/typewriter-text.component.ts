import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';

// A visible, always-shown line of text that "types itself in" — used to draw
// the eye to an explanation without hiding it behind a hover tooltip. Emits
// typingComplete once, so a caller can chain several of these strictly one
// after another (see InvoiceCreatePreviewStepPage's hintState/onHintTyped,
// which only mounts the next one once the previous has finished — the text
// itself never changes, only which order the 3 fields type in). Purely
// decorative: falls back to showing the full text instantly under
// prefers-reduced-motion.
@Component({
  selector: 'app-typewriter-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ visibleText()
    }}<span class="inline-block w-px" [class.opacity-0]="isDone()">▏</span>`,
})
export class TypewriterTextComponent {
  readonly text = input.required<string>();
  readonly speedMs = input(6);

  readonly typingComplete = output<void>();

  protected readonly visibleText = signal('');
  protected readonly isDone = signal(false);

  constructor() {
    effect((onCleanup) => {
      const full = this.text();
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        this.visibleText.set(full);
        this.isDone.set(true);
        const timeoutId = setTimeout(() => this.typingComplete.emit());
        onCleanup(() => clearTimeout(timeoutId));
        return;
      }

      this.visibleText.set('');
      this.isDone.set(false);
      let revealed = 0;
      const intervalId = setInterval(() => {
        revealed++;
        this.visibleText.set(full.slice(0, revealed));
        if (revealed >= full.length) {
          clearInterval(intervalId);
          this.isDone.set(true);
          this.typingComplete.emit();
        }
      }, this.speedMs());
      onCleanup(() => clearInterval(intervalId));
    });
  }
}
