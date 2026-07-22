import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';

// Phase 8 onboarding tour: `<button appTourAnchor="catalog-new-product">` —
// marks an element the tour overlay can spotlight, by a stable id looked up
// in TourAnchorRegistryService rather than by DOM position.
@Directive({ selector: '[appTourAnchor]' })
export class TourAnchorDirective implements OnInit, OnDestroy {
  private readonly registry = inject(TourAnchorRegistryService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly appTourAnchor = input.required<string>();

  ngOnInit(): void {
    this.registry.register(this.appTourAnchor(), this.elementRef);
  }

  ngOnDestroy(): void {
    this.registry.unregister(this.appTourAnchor(), this.elementRef);
  }
}
