import { ElementRef } from '@angular/core';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';

describe('TourAnchorRegistryService', () => {
  it('registers and retrieves an anchor by id', () => {
    const registry = new TourAnchorRegistryService();
    const elementRef = new ElementRef(document.createElement('button'));

    registry.register('add-line', elementRef);

    expect(registry.get('add-line')).toBe(elementRef);
  });

  it('returns undefined for an anchor that was never registered', () => {
    const registry = new TourAnchorRegistryService();

    expect(registry.get('unknown')).toBeUndefined();
  });

  it('unregisters an anchor so it can no longer be found', () => {
    const registry = new TourAnchorRegistryService();
    const elementRef = new ElementRef(document.createElement('button'));
    registry.register('add-line', elementRef);

    registry.unregister('add-line', elementRef);

    expect(registry.get('add-line')).toBeUndefined();
  });

  it('does not unregister a different element re-registered under the same id', () => {
    // Guards against a stale unmounting component (e.g. after a fast route
    // change) clobbering the anchor a newly-mounted page just registered.
    const registry = new TourAnchorRegistryService();
    const staleElementRef = new ElementRef(document.createElement('button'));
    const freshElementRef = new ElementRef(document.createElement('button'));
    registry.register('add-line', staleElementRef);
    registry.register('add-line', freshElementRef);

    registry.unregister('add-line', staleElementRef);

    expect(registry.get('add-line')).toBe(freshElementRef);
  });

  function withRect(width: number, height: number): ElementRef<HTMLElement> {
    const element = document.createElement('a');
    element.getBoundingClientRect = () =>
      ({
        width,
        height,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    return new ElementRef(element);
  }

  it('prefers the currently-visible copy when two elements share an id (app.html desktop/mobile nav)', () => {
    const registry = new TourAnchorRegistryService();
    const hiddenDesktopCopy = withRect(0, 0); // e.g. Tailwind's `hidden` on a mobile viewport
    const visibleMobileCopy = withRect(120, 40);
    registry.register('nav-my-documents', hiddenDesktopCopy);
    registry.register('nav-my-documents', visibleMobileCopy);

    expect(registry.get('nav-my-documents')).toBe(visibleMobileCopy);
  });

  it('falls back to the first registration when no copy currently measures a real size', () => {
    const registry = new TourAnchorRegistryService();
    const first = withRect(0, 0);
    const second = withRect(0, 0);
    registry.register('nav-my-documents', first);
    registry.register('nav-my-documents', second);

    expect(registry.get('nav-my-documents')).toBe(first);
  });

  it('drops only the unregistered copy, keeping the other one registered under the same id', () => {
    const registry = new TourAnchorRegistryService();
    const desktopCopy = withRect(120, 40);
    const mobileCopy = withRect(0, 0);
    registry.register('nav-my-documents', desktopCopy);
    registry.register('nav-my-documents', mobileCopy);

    registry.unregister('nav-my-documents', desktopCopy);

    // Only the (currently zero-sized) mobile copy is left — get() must still
    // return it via the first-registration fallback, not undefined.
    expect(registry.get('nav-my-documents')).toBe(mobileCopy);
  });
});
