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
});
