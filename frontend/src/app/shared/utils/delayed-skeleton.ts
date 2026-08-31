import { DestroyRef, Signal, effect, inject, signal } from '@angular/core';

// docs/front/'s asyncReveal pitfall: "skeleton flash on already-fast
// responses" — showing and immediately hiding a placeholder on a fast call
// reads as a flicker, not a wait being smoothed over. A slow connection
// gets the intended calm pause; a fast one never sees the skeleton at all.
const SKELETON_DELAY_MS = 180;

/**
 * Derives a "show the skeleton now" signal from a page's own `loading`
 * signal: it only flips true once `loading` has stayed true past
 * `delayMs`, and drops back to false the instant `loading` does. Must be
 * called from an injection context (a component field initializer or
 * constructor).
 */
export function delayedSkeleton(
  loading: Signal<boolean>,
  delayMs = SKELETON_DELAY_MS,
): Signal<boolean> {
  const show = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  effect(() => {
    const isLoading = loading();
    clearTimeout(timer);
    if (isLoading) {
      timer = setTimeout(() => show.set(true), delayMs);
    } else {
      show.set(false);
    }
  });

  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return show.asReadonly();
}
