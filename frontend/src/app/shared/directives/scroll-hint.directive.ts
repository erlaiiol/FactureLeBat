import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2, inject } from '@angular/core';

const REVEAL_MS = 1500;
const MIN_THUMB_PX = 32;

// `<div appScrollHint class="overflow-x-auto ...">` — flashes a small
// scrollbar-style bar for REVEAL_MS right after mount if the wrapped
// content actually overflows horizontally, then fades it out. Exists
// because the OS's own scrollbar is invisible until mid-touch on iOS/
// Android — true both in a normal mobile browser tab and inside this app's
// own Capacitor WebView shell (Phase 22) — so an artisan glancing at a wide
// table (Mes documents, admin tables, invoice preview line tables) has no
// way to discover "this scrolls right" without first scrolling by
// accident. A real native scrollbar can't be forced visible cross-platform
// from CSS alone, so this draws its own instead.
//
// The bar is a `position: sticky; left: 0` child appended inside the
// scrolling element, not an overlay wrapping it from outside — sticky
// tracks the container's own (visible) box width via plain block layout,
// since overflow never changes a scrolling container's own width, only its
// content's. That means the track needs no ResizeObserver/JS sizing of its
// own; only the thumb's width/position (from clientWidth/scrollWidth and
// scrollLeft, exactly like a real scrollbar thumb) is computed in JS.
@Directive({ selector: '[appScrollHint]' })
export class ScrollHintDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  private track?: HTMLElement;
  private thumb?: HTMLElement;
  private resizeObserver?: ResizeObserver;
  private revealTimeout?: ReturnType<typeof setTimeout>;
  // Some of these tables (stats-reports' invoice table, in particular) fill
  // in asynchronously — the wrapper div mounts (and this directive with it)
  // before the fetch that decides whether there's even a `<table>` to
  // overflow has resolved. Tracking "has this already flashed once" instead
  // of just reacting to AfterViewInit is what lets the ResizeObserver below
  // catch content arriving late and still flash it exactly once, rather
  // than only ever checking at mount and staying silent forever if nothing
  // overflowed yet at that exact moment.
  private revealed = false;
  private readonly onScroll = (): void => this.updateThumb();

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;

    const track = this.renderer.createElement('div') as HTMLElement;
    track.className =
      'pointer-events-none sticky left-0 mb-2 h-1 w-full overflow-hidden rounded-full bg-line opacity-0 transition-opacity duration-700';
    const thumb = this.renderer.createElement('div') as HTMLElement;
    thumb.className = 'absolute inset-y-0 rounded-full bg-ink-soft';
    this.renderer.appendChild(track, thumb);
    // Inserted right before the `<table>`, not appended at the end of
    // `host`: a tall table's last row can be well past the first viewport
    // (e.g. Mes documents' board), and a hint that only lives below it
    // would need scrolling down to ever be seen — exactly backwards for
    // something meant to be visible in the first second. `insertBefore`
    // with a `null` reference (no `<table>` found) falls back to appending,
    // same as the native DOM API.
    this.renderer.insertBefore(host, track, host.querySelector('table'));
    this.track = track;
    this.thumb = thumb;

    host.addEventListener('scroll', this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.checkOverflow());
    this.resizeObserver.observe(host);

    // rAF, not synchronous: the wrapped table's own rows (often behind an
    // @if/@for on data that just resolved this same tick) need one more
    // layout pass before scrollWidth reflects their final content.
    requestAnimationFrame(() => this.checkOverflow());
  }

  private checkOverflow(): void {
    this.updateThumb();
    if (this.revealed || !this.track) {
      return;
    }
    const host = this.el.nativeElement;
    if (host.scrollWidth > host.clientWidth) {
      this.revealed = true;
      this.track.style.opacity = '1';
      this.revealTimeout = setTimeout(() => {
        if (this.track) {
          this.track.style.opacity = '0';
        }
      }, REVEAL_MS);
    }
  }

  private updateThumb(): void {
    if (!this.track || !this.thumb) {
      return;
    }
    const host = this.el.nativeElement;
    const trackWidth = this.track.clientWidth;
    if (trackWidth === 0 || host.scrollWidth <= host.clientWidth) {
      return;
    }
    const thumbWidth = Math.max(trackWidth * (host.clientWidth / host.scrollWidth), MIN_THUMB_PX);
    const maxScrollLeft = host.scrollWidth - host.clientWidth;
    const scrollRatio = maxScrollLeft > 0 ? host.scrollLeft / maxScrollLeft : 0;
    this.thumb.style.width = `${thumbWidth}px`;
    this.thumb.style.left = `${(trackWidth - thumbWidth) * scrollRatio}px`;
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
    if (this.revealTimeout) {
      clearTimeout(this.revealTimeout);
    }
  }
}
