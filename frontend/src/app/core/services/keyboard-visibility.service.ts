import { Injectable, signal } from '@angular/core';

// Below this many px of shrinkage, treat it as chrome/URL-bar movement, not
// a keyboard — the smallest on-screen keyboard (a landscape phone) is still
// taller than this.
const KEYBOARD_HEIGHT_THRESHOLD_PX = 150;

// Same root cause as tour-overlay.component.ts's visualViewport listener:
// index.html's viewport meta doesn't opt out of interactive-widget=resizes-
// visual, so opening the on-screen keyboard shrinks window.visualViewport
// without firing 'resize'/'scroll' on window, and any `position: fixed`
// element (e.g. the invoice creation footers) stays pinned to the *layout*
// viewport's bottom edge — which now sits behind the keyboard, dragging the
// fixed bar up over whatever the artisan is typing into. Pages that need to
// react to that (shrink their own fixed footer out of the way) read
// `isOpen()` here instead of each re-deriving it. window.visualViewport is
// undefined on older WebViews; isOpen then just stays permanently false,
// leaving today's (already shipped) full-size footer behavior in place.
@Injectable({ providedIn: 'root' })
export class KeyboardVisibilityService {
  private readonly _isOpen = signal(false);
  readonly isOpen = this._isOpen.asReadonly();

  constructor() {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return;
    }
    const update = (): void => {
      const shrinkPx = window.innerHeight - visualViewport.height;
      this._isOpen.set(shrinkPx > KEYBOARD_HEIGHT_THRESHOLD_PX);
    };
    update();
    visualViewport.addEventListener('resize', update);
    visualViewport.addEventListener('scroll', update);
  }
}
