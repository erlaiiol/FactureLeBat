import { Directive, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';
import interact from 'interactjs';

// interactjs's published types are a maze of module-augmented interfaces
// that don't resolve cleanly against a plain `import interact from
// 'interactjs'` — this is the one place that's worked around, with the
// minimal shape this directive actually reads out of a drag-move event
// (justifies the dev-rules "no any without justification" exception).
interface DragMoveEvent {
  dx: number;
  dy: number;
}

// A thin, hand-built drag handle (Phase 9.5's manual invoice canvas):
// column-width and row-height handles both use this, differing only in
// `axis`. Deliberately emits raw pixel deltas rather than resizing the host
// element itself — ManualInvoiceDraftStore owns the actual column/row size
// (clamped, persisted), the DOM element is just where the drag started.
@Directive({ selector: '[appManualResizeHandle]' })
export class ManualResizeHandleDirective implements OnInit, OnDestroy {
  readonly axis = input.required<'x' | 'y'>({ alias: 'appManualResizeHandle' });
  readonly resized = output<number>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private interactable?: ReturnType<typeof interact>;

  ngOnInit(): void {
    this.interactable = interact(this.elementRef.nativeElement).draggable({
      lockAxis: this.axis(),
      listeners: {
        move: (event: DragMoveEvent) => {
          this.resized.emit(this.axis() === 'x' ? event.dx : event.dy);
        },
      },
    });
  }

  ngOnDestroy(): void {
    this.interactable?.unset();
  }
}
