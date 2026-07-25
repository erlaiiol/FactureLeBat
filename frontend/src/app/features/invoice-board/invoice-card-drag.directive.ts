import { Directive, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';
import interact from 'interactjs';

// Same interactjs typing workaround as manual-resize-handle.directive.ts —
// the minimal shape this directive actually reads off a drag event.
interface DragMoveEvent {
  dx: number;
  dy: number;
}
interface DragEndEvent {
  clientX: number;
  clientY: number;
}

// Phase 16 board: a thin drag wrapper, same spirit as
// ManualResizeHandleDirective (Phase 9.5) — the DOM element only tracks its
// own visual offset during the drag; InvoiceBoardPage owns the actual status
// change. On drop, `document.elementFromPoint` finds the nearest ancestor
// carrying `data-invoice-column` (only the 3 real drop targets — Non
// payées/Payées/Annulées — carry that attribute; "En retard" and "Devis"
// don't, so a drop there just snaps back, matching the roadmap's "En retard
// is not a manual drop target").
@Directive({ selector: '[appInvoiceCardDrag]' })
export class InvoiceCardDragDirective implements OnInit, OnDestroy {
  // Devis cards render through the same component but have no draggable
  // status (see InvoiceBoardCardComponent.draggable) — rather than
  // duplicating the card's template per column, this just skips wiring
  // interact() up at all when disabled.
  readonly enabled = input(true, { alias: 'appInvoiceCardDrag' });
  readonly dropped = output<string | null>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private interactable?: ReturnType<typeof interact>;
  private x = 0;
  private y = 0;

  ngOnInit(): void {
    if (!this.enabled()) {
      return;
    }
    const el = this.elementRef.nativeElement;
    this.interactable = interact(el).draggable({
      inertia: false,
      listeners: {
        move: (event: DragMoveEvent) => {
          this.x += event.dx;
          this.y += event.dy;
          el.style.transform = `translate(${this.x}px, ${this.y}px)`;
          el.style.zIndex = '10';
        },
        end: (event: DragEndEvent) => {
          const target = document.elementFromPoint(event.clientX, event.clientY);
          const column = (target as HTMLElement | null)?.closest<HTMLElement>(
            '[data-invoice-column]',
          );
          el.style.transform = '';
          el.style.zIndex = '';
          this.x = 0;
          this.y = 0;
          this.dropped.emit(column?.dataset['invoiceColumn'] ?? null);
        },
      },
    });
  }

  ngOnDestroy(): void {
    this.interactable?.unset();
  }
}
