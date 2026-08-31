// The transform-based FLIP engine behind `modalMorph` (docs/front/front-1-
// global-shell-and-overlays.md). Deliberately NOT the same technique as
// `cardMorph` (invoice-create-lines-step.page.ts's `playCardMorph`), which
// animates real width/height/top/left so a card's form fields stay
// correctly laid out and interactive throughout — here the panel's content
// is masked until the animation finishes (see ModalMorphComponent), so
// there's no reflow-fidelity to protect mid-flight, and a modal panel can
// contain a PDF <iframe>/canvas that would otherwise reflow/repaint on
// every frame if width/height itself were animated. `transform` is
// compositor-only on both Capacitor WebView engines (Android system
// WebView, iOS WKWebView) and sidesteps that entirely.

export const MODAL_MORPH_DURATION_MS = 550;
export const MODAL_MORPH_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)'; // --ease-inout-soft, styles.css

/** A plain rect shape — `DOMRect` itself or the fallback synthesized in ModalMorphComponent. */
export interface FlipRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

// Top-left-origin translate + non-uniform scale that maps `to`'s box onto
// `from`'s — the inverse of what the animation plays (it always animates
// FROM this transform TO `none`, since `to` is the element's own natural,
// already-laid-out rect).
function computeFlipTransform(from: FlipRect, to: FlipRect): string {
  const scaleX = to.width === 0 ? 1 : from.width / to.width;
  const scaleY = to.height === 0 ? 1 : from.height / to.height;
  const translateX = from.left - to.left;
  const translateY = from.top - to.top;
  return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
}

// Plays the open (grow) animation on `el`, already mounted at its natural
// resting rect. `el` must have `transform-origin: 0 0` (set by the caller's
// CSS, not here, so it applies identically to the mirrored close animation
// before this function ever runs). Returns the real Animation so the caller
// can await `.finished` to know when it's safe to reveal content.
export function playModalMorphOpen(el: HTMLElement, from: FlipRect): Animation {
  const to = el.getBoundingClientRect();
  const startTransform = computeFlipTransform(from, to);
  return el.animate([{ transform: startTransform }, { transform: 'none' }], {
    duration: MODAL_MORPH_DURATION_MS,
    easing: MODAL_MORPH_EASING,
    fill: 'both',
  });
}

// Plays the close (shrink) animation — the exact reverse, from `el`'s
// current natural rect back into `to` (the same origin rect the open
// animation grew from, or the fallback rect if the trigger is gone by now).
export function playModalMorphClose(el: HTMLElement, to: FlipRect): Animation {
  const from = el.getBoundingClientRect();
  const endTransform = computeFlipTransform(to, from);
  return el.animate([{ transform: 'none' }, { transform: endTransform }], {
    duration: MODAL_MORPH_DURATION_MS,
    easing: MODAL_MORPH_EASING,
    fill: 'both',
  });
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Fallback origin when there's no real trigger to anchor to (keyboard-
// triggered open, trigger element unmounted/scrolled away by open time) —
// a plain scale-from-98%-and-fade centered on the panel's own natural rect,
// per docs/front/front-1-global-shell-and-overlays.md's fallback rule.
export function shrinkRectForFallback(natural: FlipRect, factor = 0.98): FlipRect {
  const width = natural.width * factor;
  const height = natural.height * factor;
  return {
    width,
    height,
    left: natural.left + (natural.width - width) / 2,
    top: natural.top + (natural.height - height) / 2,
  };
}
