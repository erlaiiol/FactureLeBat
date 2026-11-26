import { Location } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PlatformService } from './platform.service';

export type EdgeSwipeSide = 'left' | 'right';

export interface EdgeSwipeDrag {
  side: EdgeSwipeSide;
  // 0 → 1 as the finger travels towards the trigger distance; ≥ 1 means
  // releasing now navigates.
  progress: number;
  y: number;
}

// A touch must start this close to the screen edge to count as a swipe…
const EDGE_WIDTH_PX = 24;
// …and travel this far inwards to navigate on release.
const TRIGGER_DISTANCE_PX = 90;
// Below this much movement the gesture's direction isn't decided yet.
const DIRECTION_LOCK_PX = 10;

// Native shells only (iOS/Android Capacitor): swiping in from the left edge
// goes back in history, from the right edge goes forward — the latter only
// when there's a page ahead (i.e. after having gone back). Plain history
// navigation, never a step's own "Suivant" button: every invoice step
// already persists its inputs (InvoiceDraftStore / ManualInvoiceDraftStore
// write to localStorage on every change), so whatever was typed on the page
// being left is there again on return.
//
// The browser (mobile Safari/Chrome) has its own edge gestures, so this
// stays off on the web. On Android with system gesture navigation, the OS
// claims both screen edges as "back" before the WebView sees them — the
// system back already does history back there (Capacitor's default), so the
// two never fight; this only adds anything on 3-button navigation.
@Injectable({ providedIn: 'root' })
export class EdgeSwipeNavigationService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly platformService = inject(PlatformService);
  private readonly destroyRef = inject(DestroyRef);

  readonly drag = signal<EdgeSwipeDrag | null>(null);
  // Direction of the most recent completed navigation — lets the page
  // transition slide the right way for a history *forward* too (popstate
  // alone can't tell back from forward).
  readonly lastDirection = signal<'back' | 'forward'>('forward');

  // History position, tracked from the router's own navigation ids: a push
  // goes one deeper and drops whatever was ahead; a popstate to an older id
  // is a back, to a newer one a forward.
  private depth = 0;
  private ahead = 0;
  private currentNavigationId = 0;
  private pending: {
    trigger: NavigationStart['navigationTrigger'];
    targetId: number | null;
    replace: boolean;
  } | null = null;

  private start: { x: number; y: number; side: EdgeSwipeSide } | null = null;
  private locked: 'horizontal' | 'vertical' | null = null;
  private armed = false;

  init(): void {
    this.trackHistoryPosition();
    if (!this.platformService.isNativeApp()) {
      return;
    }
    const options = { passive: false } as const;
    const onStart = (event: TouchEvent) => this.onTouchStart(event);
    const onMove = (event: TouchEvent) => this.onTouchMove(event);
    const onEnd = () => this.onTouchEnd();
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, options);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    });
  }

  canGoBack(): boolean {
    return this.depth > 0;
  }

  canGoForward(): boolean {
    return this.ahead > 0;
  }

  private trackHistoryPosition(): void {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.pending = {
          trigger: event.navigationTrigger,
          targetId: event.restoredState?.navigationId ?? null,
          replace: !!this.router.getCurrentNavigation()?.extras.replaceUrl,
        };
        return;
      }
      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.pending = null;
        return;
      }
      if (!(event instanceof NavigationEnd)) {
        return;
      }
      if (!this.pending) {
        // The initial navigation can start before this subscription exists
        // — it's the bottom of the stack either way.
        this.currentNavigationId ||= event.id;
        return;
      }
      const { trigger, targetId, replace } = this.pending;
      this.pending = null;
      const isFirstNavigation = this.currentNavigationId === 0;
      if (trigger === 'popstate' && targetId !== null) {
        if (targetId < this.currentNavigationId) {
          this.depth = Math.max(0, this.depth - 1);
          this.ahead += 1;
          this.lastDirection.set('back');
        } else {
          this.depth += 1;
          this.ahead = Math.max(0, this.ahead - 1);
          this.lastDirection.set('forward');
        }
        this.currentNavigationId = targetId;
        return;
      }
      if (!isFirstNavigation && !replace) {
        this.depth += 1;
        this.ahead = 0;
      }
      this.lastDirection.set('forward');
      this.currentNavigationId = event.id;
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private onTouchStart(event: TouchEvent): void {
    this.reset();
    if (event.touches.length !== 1 || this.modalIsOpen()) {
      return;
    }
    const touch = event.touches[0];
    const width = window.innerWidth;
    if (touch.clientX <= EDGE_WIDTH_PX && this.canGoBack()) {
      this.start = { x: touch.clientX, y: touch.clientY, side: 'left' };
    } else if (touch.clientX >= width - EDGE_WIDTH_PX && this.canGoForward()) {
      this.start = { x: touch.clientX, y: touch.clientY, side: 'right' };
    }
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this.start || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const dx = touch.clientX - this.start.x;
    const dy = touch.clientY - this.start.y;
    if (!this.locked) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) {
        return;
      }
      this.locked = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (this.locked === 'vertical') {
      this.reset();
      return;
    }
    // Owns the gesture from here: no page scroll/text selection underneath.
    if (event.cancelable) {
      event.preventDefault();
    }
    const inwards = this.start.side === 'left' ? dx : -dx;
    const progress = Math.max(0, inwards) / TRIGGER_DISTANCE_PX;
    if (progress >= 1 && !this.armed) {
      this.armed = true;
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    } else if (progress < 1) {
      this.armed = false;
    }
    this.drag.set({ side: this.start.side, progress, y: touch.clientY });
  }

  private onTouchEnd(): void {
    const drag = this.drag();
    this.reset();
    if (!drag || drag.progress < 1) {
      return;
    }
    if (drag.side === 'left') {
      this.location.back();
    } else {
      this.location.forward();
    }
  }

  private reset(): void {
    this.start = null;
    this.locked = null;
    this.armed = false;
    this.drag.set(null);
  }

  private modalIsOpen(): boolean {
    return document.querySelector('[aria-modal="true"]') !== null;
  }
}
