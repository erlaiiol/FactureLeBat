import { DestroyRef, Signal, inject, signal } from '@angular/core';

// Reactive viewport-width signal, same "raw matchMedia, no CDK
// BreakpointObserver" convention as theme.service.ts's prefers-color-scheme
// read — this app has no @angular/cdk dependency and Phase 22 doesn't add
// one for a single page. Must be called from an injection context.
export function createNarrowViewportSignal(maxWidthPx: number): Signal<boolean> {
  const query = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
  const isNarrow = signal(query.matches);

  const onChange = (event: MediaQueryListEvent): void => isNarrow.set(event.matches);
  query.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));

  return isNarrow.asReadonly();
}
