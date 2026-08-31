import { Injectable } from '@angular/core';
import { FlipRect } from './flip-morph';

// modalMorph's origin capture (docs/front/front-1-global-shell-and-overlays.md):
// a single capture-phase listener app-wide instead of threading a new
// `[originRect]` input through every one of the many call sites that open
// one of the nine modal components — a per-call-site input would be a much
// larger, easier-to-miss-one-spot diff for the same result, and degrades to
// the same fallback (ModalMorphComponent's scale+fade from center) exactly
// like a missing input would. Also handles a keyboard-triggered open for
// free: a native `click` event still fires on Enter/Space with a real
// `target`, just no pointer coordinates — which this app never anchors on
// anyway (see the doc's own "origin = trigger rect, not cursor point" call).
//
// **2026-08-31 bug fix**: the original version required the clicked element
// to match this selector *or captured nothing at all* — silently falling
// back to the generic center-scale every time, which is exactly what
// happened for `invoice-board`'s row click (a plain `<tr (click)="...">`,
// not a `<button>`/`<a>`), the most common real trigger for
// `invoice-preview-modal`. Confirmed live via Playwright against the demo
// stack: `getAnimations()` showed a real, running animation the whole time
// — just the wrong one (98%→100% fallback scale, a ~2% size change on a
// ~750px-wide panel, imperceptible) — not "no animation" as it first
// looked. `tr` is now matched explicitly (the concrete case that broke),
// and anything else falls back to the exact clicked element itself rather
// than nothing — a roughly-right origin beats the generic fallback in
// every case, and a false-positive capture from an unrelated click is
// harmless (unread, it just expires or gets overwritten).
const CLICKABLE_SELECTOR = 'button, a, [role="button"], summary, tr';
const MAX_AGE_MS = 800;

@Injectable({ providedIn: 'root' })
export class LastClickOriginService {
  private lastRect: FlipRect | null = null;
  private lastAt = 0;

  constructor() {
    document.addEventListener('click', this.onClick, { capture: true });
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const clickable = target.closest(CLICKABLE_SELECTOR) ?? target;
    const rect = clickable.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }
    this.lastRect = rect;
    this.lastAt = Date.now();
  };

  /** Returns the most recent clickable-element rect if it's still fresh, consuming it so it can't anchor a later, unrelated open. */
  consumeRecentOrigin(): FlipRect | null {
    const rect = this.lastRect;
    const isFresh = rect !== null && Date.now() - this.lastAt <= MAX_AGE_MS;
    this.lastRect = null;
    return isFresh ? rect : null;
  }
}
