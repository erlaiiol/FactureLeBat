import { ElementRef, Injectable } from '@angular/core';

// Phase 8 onboarding tour: lets the tour overlay find "the add-line button",
// "the search field", etc. by a stable id, regardless of which routed page
// currently renders it — TourAnchorDirective registers/unregisters elements
// here as they mount/unmount across navigation.
@Injectable({ providedIn: 'root' })
export class TourAnchorRegistryService {
  private readonly anchors = new Map<string, ElementRef<HTMLElement>>();

  register(id: string, elementRef: ElementRef<HTMLElement>): void {
    this.anchors.set(id, elementRef);
  }

  unregister(id: string, elementRef: ElementRef<HTMLElement>): void {
    if (this.anchors.get(id) === elementRef) {
      this.anchors.delete(id);
    }
  }

  get(id: string): ElementRef<HTMLElement> | undefined {
    return this.anchors.get(id);
  }
}
