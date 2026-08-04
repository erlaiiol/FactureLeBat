import { ElementRef, Injectable } from '@angular/core';

// Phase 8 onboarding tour: lets the tour overlay find "the add-line button",
// "the search field", etc. by a stable id, regardless of which routed page
// currently renders it — TourAnchorDirective registers/unregisters elements
// here as they mount/unmount across navigation.
//
// One id can have MORE than one registered element at once — app.html's nav
// links exist as two parallel copies (a `lg:flex` desktop bar and a
// collapsible mobile panel), both carrying the same `appTourAnchor`, with
// only one of them ever actually visible/sized at a time depending on the
// viewport/menu state. A single last-write-wins slot used to mean whichever
// directive's ngOnInit happened to run last silently won regardless of
// which copy was really on screen, so the spotlight sometimes measured a
// `display:none`/zero-height element and rendered as a stray box pinned
// near the viewport's top-left corner instead of over the real nav item.
@Injectable({ providedIn: 'root' })
export class TourAnchorRegistryService {
  private readonly anchors = new Map<string, ElementRef<HTMLElement>[]>();

  register(id: string, elementRef: ElementRef<HTMLElement>): void {
    const existing = this.anchors.get(id);
    if (existing) {
      existing.push(elementRef);
    } else {
      this.anchors.set(id, [elementRef]);
    }
  }

  unregister(id: string, elementRef: ElementRef<HTMLElement>): void {
    const existing = this.anchors.get(id);
    if (!existing) {
      return;
    }
    const next = existing.filter((ref) => ref !== elementRef);
    if (next.length > 0) {
      this.anchors.set(id, next);
    } else {
      this.anchors.delete(id);
    }
  }

  // Prefers whichever registered copy currently has a real, non-zero
  // measured size (i.e. actually rendered and visible right now) —
  // falling back to the first registration so a mid-transition frame (or
  // an id that's genuinely always a single element) never returns nothing.
  get(id: string): ElementRef<HTMLElement> | undefined {
    const candidates = this.anchors.get(id);
    if (!candidates || candidates.length === 0) {
      return undefined;
    }
    const visible = candidates.find((ref) => {
      const rect = ref.nativeElement.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return visible ?? candidates[0];
  }
}
