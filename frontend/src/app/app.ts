import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { BillingService } from './core/services/billing.service';
import { CompanyService } from './core/services/company.service';
import { DeepLinkService } from './core/services/deep-link.service';
import { PlatformService } from './core/services/platform.service';
import { PushRegistrationService } from './core/services/push-registration.service';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { CompanyEssentialsModalComponent } from './shared/components/company-essentials-modal.component';
import { FooterComponent } from './shared/components/footer.component';
import { PaywallModalComponent } from './shared/components/paywall-modal.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { TrialOfferModalComponent } from './shared/components/trial-offer-modal.component';
import { TourAnchorDirective } from './shared/tour/tour-anchor.directive';
import { TourService } from './shared/tour/tour.service';
import { TourOverlayComponent } from './shared/tour/tour-overlay.component';
import { LastClickOriginService } from './shared/utils/last-click-origin.service';

// "Mon abonnement" nav button's three visual states — mirrors the same
// hasPremiumAccess/freeInvoiceUsed logic subscribe.page.html already used
// for its own status badge, just projected onto a persistent nav item
// instead of a page-local one. `trial` also covers "status not loaded yet"
// so the button never flashes red before the first fetch resolves.
type BillingButtonState = 'active' | 'blocked' | 'trial';

const BILLING_BUTTON_CLASSES: Record<BillingButtonState, string> = {
  active: 'bg-success text-success-fg hover:brightness-90',
  blocked: 'bg-danger text-danger-fg hover:brightness-90',
  trial: 'text-ink hover:bg-secondary-subtle',
};

// Same three states, condensed to a small dot for the native app's
// always-visible compact nav row (see app.html) — a filled circle for the
// two states worth flagging at a glance (green/red), a neutral outline for
// "trial" so an artisan mid-trial doesn't read it as a warning.
const BILLING_DOT_CLASSES: Record<BillingButtonState, string> = {
  active: 'bg-success',
  blocked: 'bg-danger',
  trial: 'border border-ink-soft/50',
};

// `pageSlideTransition`: every class `replayPageEnterAnimation` might have
// applied on a previous navigation — all removed before picking the next
// one, since which one was last used depends on that navigation's own
// trigger.
const PAGE_ENTER_ANIMATION_CLASSES = [
  'anim-page-in',
  'anim-page-slide-forward',
  'anim-page-slide-back',
];

// Phase 1.1-9: '/dossiers' added so the "Mon répertoire" button highlights
// while browsing it too, same standing as the three routes already here.
// Note: '/remises' is a pre-existing gap in this array (predates this
// phase, not introduced by it) — left alone, out of this phase's scope.
const DATA_SECTION_ROUTES = [
  '/clients',
  '/produits',
  '/prestations',
  '/dossiers',
  '/factures-recues',
];

// Single-line text-entry <input> types — the ones a virtual keyboard's
// return key can mean "I'm done with this field" for. Deliberately excludes
// checkbox/radio/file/range/date/etc. (no virtual keyboard to dismiss) and,
// by only matching HTMLInputElement, every <textarea> on the site (product/
// service descriptions, "mon entreprise", email bodies) — those keep the
// browser's default "return" hint and behavior since Enter there means
// "new line", not "done".
const ENTER_TO_DISMISS_INPUT_TYPES = new Set([
  'text',
  'email',
  'tel',
  'number',
  'password',
  'search',
  'url',
]);

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TourOverlayComponent,
    PaywallModalComponent,
    CompanyEssentialsModalComponent,
    TrialOfferModalComponent,
    ToastContainerComponent,
    TourAnchorDirective,
    FooterComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly tourService = inject(TourService);
  protected readonly authService = inject(AuthService);
  protected readonly billingService = inject(BillingService);
  private readonly companyService = inject(CompanyService);
  protected readonly platformService = inject(PlatformService);
  private readonly pushRegistrationService = inject(PushRegistrationService);
  private readonly deepLinkService = inject(DeepLinkService);
  // Side-effect-only: registers modalMorph's app-wide click-origin listener
  // (docs/front/front-1-global-shell-and-overlays.md) — never read directly
  // here, ModalMorphComponent injects the same singleton.
  private readonly lastClickOriginService = inject(LastClickOriginService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  // `pageSlideTransition` — see the constructor's own subscription for why
  // this is set on NavigationStart and read on the following NavigationEnd.
  private lastNavigationTrigger: NavigationStart['navigationTrigger'] | null = null;

  // "Mon répertoire" dropdown (Clients/Produits/Prestations grouped as the
  // artisan's reusable records) — wrapper ref lets the outside-click
  // listener below tell a click on the trigger/panel apart from one
  // anywhere else on the page.
  @ViewChild('dataMenu') private readonly dataMenuRef?: ElementRef<HTMLElement>;
  protected readonly dataMenuOpen = signal(false);

  // Bootstrap-style navbar-collapse for phone widths (nav wrapped instead of
  // collapsing before this, see app.html). #mobileNavRoot is the whole <nav>
  // rather than just the toggler+panel — at the widths where this menu can
  // be open, the desktop-only containers are `display: none`, so "outside
  // this element" and "outside the toggler/panel" are the same click.
  @ViewChild('mobileNavRoot') private readonly mobileNavRootRef?: ElementRef<HTMLElement>;
  protected readonly mobileMenuOpen = signal(false);

  // Set only by the tour-reveal effect below (constructor), never by
  // toggleMobileMenu/closeMobileMenu — tracks "the tour is the one that
  // opened this, not the artisan" so the effect knows whether it's safe to
  // close the panel again once the step moves on. If the artisan opened it
  // themselves (this stays false), the tour leaves it exactly as they left
  // it instead of yanking it shut on them.
  private tourOpenedMobileMenu = false;

  // Measured and republished as the `--nav-height` CSS variable — see
  // observeTopBarHeight below and app.html's #topBar.
  @ViewChild('topBar') private readonly topBarRef?: ElementRef<HTMLElement>;
  private navHeightObserver?: ResizeObserver;

  // docs/front/ Phase 1: replays the `page-in` fade (styles.css) on the
  // <main> wrapper for every navigation, so a routed page fades up instead
  // of popping in with the router swap — one place for every route, rather
  // than each page owning its own copy of the same class.
  @ViewChild('mainContent') private readonly mainContentRef?: ElementRef<HTMLElement>;

  protected readonly resendingVerification = signal(false);

  // 2026-08-25: "Factures reçues" (below) only means anything once SUPER
  // PDP is connected — received-invoice-list.page.ts itself already shows a
  // graceful "connect first" message when it isn't, but a nav entry that
  // always leads to that dead end is worse than not showing it at all.
  // Reads CompanyService's own shared signal (null = not fetched yet this
  // session, treated the same as "not connected") rather than a local copy,
  // so a connect/disconnect from company-settings.page.ts — which calls the
  // same service methods — is reflected here too, not just on that page.
  protected readonly superPdpConnected = computed(
    () => this.companyService.superPdpConnected() ?? false,
  );

  protected readonly dataSectionActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.isDataSectionRoute(this.router.url)),
    ),
    { initialValue: this.isDataSectionRoute(this.router.url) },
  );

  // Phase 13.3: lets the landing page opt out of the app shell's
  // `max-w-3xl` content container (see app.routes.ts's `fullBleed` route
  // data) — every other route is a form/list that wants that width cap.
  protected readonly isFullBleed = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => {
        let route = this.activatedRoute.snapshot;
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route.data['fullBleed'] === true;
      }),
    ),
    { initialValue: false },
  );

  constructor() {
    // Registered once, regardless of auth state — a referral link can be
    // tapped whether or not the artisan is currently logged in.
    this.deepLinkService.listen();

    // `pageSlideTransition` (docs/design-system.md): captured on every
    // NavigationStart, consumed by the very next NavigationEnd below —
    // navigations are strictly sequential in normal operation, so no
    // per-navigation-id correlation is needed. 'popstate' is the browser/
    // native shell's own signal for "this came from back/forward, a
    // hardware back button, or an edge-swipe gesture" — treated as "go
    // back" direction; anything else (a real link tap, a programmatic
    // `router.navigate`) is treated as "go forward". This is a conservative
    // heuristic, not a true history-position tracker (a same-direction
    // 'popstate' *forward* press would still read as "back") — deliberately
    // simple given this touches every single route in the app; see
    // front-1's own "riskiest item in this phase" framing.
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.lastNavigationTrigger = event.navigationTrigger;
      }
    });

    // Closes the dropdown on any navigation, not just clicks on its own
    // links — covers browser back/forward and any other route change while
    // it happens to be open.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.dataMenuOpen.set(false);
        this.mobileMenuOpen.set(false);
        this.replayPageEnterAnimation();
      });

    // Fetches once per login (isAuthenticated only flips on log in/out —
    // AuthService.refreshSession's periodic silent token refresh sets a new
    // currentUser object but leaves this boolean unchanged, so it doesn't
    // re-trigger on every one of those). Cleared on logout so a stale
    // green/red button never survives into the next session.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        untracked(() => this.billingService.refreshStatus().subscribe());
      } else {
        this.billingService.status.set(null);
      }
    });

    // Same "once per login" fetch as billingService.status above — updates
    // CompanyService's own shared signal (getSuperPdpStatus's tap), which
    // superPdpConnected above reads. Cleared on logout for the same
    // stale-state reason as billingService.status.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        untracked(() => {
          this.companyService
            .getSuperPdpStatus()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => this.companyService.superPdpConnected.set(false) });
        });
      } else {
        this.companyService.superPdpConnected.set(null);
      }
    });

    // Populates CompanyService's cached quantityInputMode preference for
    // QuantityWheelPickerComponent (and company-settings.page.ts) without
    // requiring a visit to the settings page first — same "once per login"
    // fetch as the SUPER PDP effect above, via getProfile's own tap rather
    // than a dedicated status endpoint.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        untracked(() => {
          this.companyService
            .getProfile()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              error: () => {},
            });
        });
      } else {
        this.companyService.preferKeyboardQuantityInput.set(null);
      }
    });

    // Phase 22: registers this device's push token once per login, same
    // "isAuthenticated only flips on log in/out" reasoning as the billing
    // effect above — a no-op on web, see PushRegistrationService.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        untracked(() => void this.pushRegistrationService.registerDevice());
      }
    });

    // #topBar (nav + the optional email-verification banner) only exists
    // in the DOM once authenticated, and toggling that @if tears down and
    // recreates the element — re-run the lookup on every login rather than
    // once at construction. The setTimeout hands off to a macrotask so
    // Angular has already patched the DOM for this same signal flip before
    // topBarRef is read; ResizeObserver takes it from there for every later
    // change (nav re-wrapping on resize, banner appearing/disappearing).
    effect(() => {
      if (!this.authService.isAuthenticated()) {
        return;
      }
      untracked(() => {
        setTimeout(() => this.observeTopBarHeight());
      });
    });

    // The 'menu' step (tour-definitions.ts) spotlights "Mes documents" in
    // the nav — on a narrow viewport that link only exists inside the
    // collapsible hamburger panel (app.html), closed by default. Without
    // this, TourOverlayComponent had nothing real to measure there and the
    // spotlight rendered as a stray box (see TourAnchorRegistryService's
    // own comment on why more than one element can share an anchor id).
    // Reads/writes mobileMenuOpen only inside untracked() so this effect
    // reacts solely to the tour stepping, never to the artisan's own
    // hamburger taps — otherwise closing it by hand mid-step would
    // immediately trigger the effect again and force it back open, which
    // is exactly the "énervant" behavior to avoid.
    effect(() => {
      const anchorId = this.tourService.currentStep()?.anchorId;
      untracked(() => {
        if (anchorId === 'nav-my-documents') {
          if (!this.mobileMenuOpen()) {
            this.mobileMenuOpen.set(true);
            this.tourOpenedMobileMenu = true;
          }
        } else if (this.tourOpenedMobileMenu) {
          this.mobileMenuOpen.set(false);
          this.tourOpenedMobileMenu = false;
        }
      });
    });

    this.destroyRef.onDestroy(() => this.navHeightObserver?.disconnect());
  }

  private observeTopBarHeight(): void {
    const element = this.topBarRef?.nativeElement;
    if (!element) {
      return;
    }
    this.navHeightObserver?.disconnect();
    const updateNavHeight = () => {
      document.documentElement.style.setProperty(
        '--nav-height',
        `${element.getBoundingClientRect().height}px`,
      );
    };
    updateNavHeight();
    this.navHeightObserver = new ResizeObserver(updateNavHeight);
    this.navHeightObserver.observe(element);
  }

  // Removing and re-adding the class (with a forced reflow between the two)
  // is what makes the same CSS animation restart on every navigation —
  // toggling a class that's already present is a no-op to the browser.
  // `pageSlideTransition`: picks a directional slide over the plain fade on
  // native app shells only — the push/pop-stack metaphor a slide implies is
  // specifically a native-app convention, not a browser-tab one (web keeps
  // the original plain fade unconditionally). All three classes are removed
  // regardless of which one was last applied, since which one that was
  // depends on the previous navigation's own trigger.
  private replayPageEnterAnimation(): void {
    const element = this.mainContentRef?.nativeElement;
    if (!element) {
      return;
    }
    for (const cls of PAGE_ENTER_ANIMATION_CLASSES) {
      element.classList.remove(cls);
    }
    void element.offsetWidth;
    element.classList.add(this.pageEnterAnimationClass());
  }

  private pageEnterAnimationClass(): string {
    if (!this.platformService.isNativeApp()) {
      return 'anim-page-in';
    }
    return this.lastNavigationTrigger === 'popstate'
      ? 'anim-page-slide-back'
      : 'anim-page-slide-forward';
  }

  private isDataSectionRoute(url: string): boolean {
    return DATA_SECTION_ROUTES.some((prefix) => url.startsWith(prefix));
  }

  protected toggleDataMenu(): void {
    this.dataMenuOpen.update((open) => !open);
  }

  protected closeDataMenu(): void {
    this.dataMenuOpen.set(false);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.dataMenuOpen() && !this.dataMenuRef?.nativeElement.contains(target)) {
      this.dataMenuOpen.set(false);
    }
    if (this.mobileMenuOpen() && !this.mobileNavRootRef?.nativeElement.contains(target)) {
      this.mobileMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    this.dataMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
  }

  // Swaps the on-screen keyboard's return-key label from the default arrow
  // ("go to a new line", which single-line inputs can't even do) to "OK"/
  // "Terminé" on every plain text-entry field site-wide — delegated here
  // rather than added to each of the site's many <input> templates one by
  // one. See ENTER_TO_DISMISS_INPUT_TYPES for what's covered.
  @HostListener('document:focusin', ['$event'])
  protected onDocumentFocusIn(event: FocusEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && ENTER_TO_DISMISS_INPUT_TYPES.has(target.type)) {
      target.enterKeyHint = 'done';
    }
  }

  // The other half of onDocumentFocusIn: actually dismisses the keyboard
  // when that "OK" key is tapped. Only calls blur(), never
  // preventDefault() — a text input inside a <form> (e.g. the login page)
  // still submits on Enter exactly as it did before, this just also drops
  // focus so the keyboard closes instead of lingering over a page that just
  // navigated away.
  @HostListener('document:keydown.enter')
  protected onEnterKeydown(): void {
    const target = document.activeElement;
    if (target instanceof HTMLInputElement && ENTER_TO_DISMISS_INPUT_TYPES.has(target.type)) {
      target.blur();
    }
  }

  protected billingButtonState(): BillingButtonState {
    const status = this.billingService.status();
    if (!status) {
      return 'trial';
    }
    if (status.hasPremiumAccess) {
      return 'active';
    }
    if (status.freeInvoiceUsed) {
      return 'blocked';
    }
    return 'trial';
  }

  protected billingButtonClasses(): string {
    return BILLING_BUTTON_CLASSES[this.billingButtonState()];
  }

  protected billingDotClasses(): string {
    return BILLING_DOT_CLASSES[this.billingButtonState()];
  }

  protected billingButtonAriaLabel(): string {
    switch (this.billingButtonState()) {
      case 'active':
        return 'Mon abonnement — actif';
      case 'blocked':
        return 'Mon abonnement — abonnement requis pour continuer';
      default:
        return 'Mon abonnement';
    }
  }

  // Nav bar's "Aide" button: always replays whichever guided tour owns the
  // current page, regardless of the auto-launch preference in Settings —
  // asking for help should work even after it's been turned off there
  // (that toggle only controls whether tours show up unprompted).
  protected replayHelp(): void {
    this.tourService.startTourForCurrentRoute();
  }

  protected logout(): void {
    // Best-effort, before the session cookie is actually cleared below —
    // a shared/reset device should stop receiving pushes for the departed
    // account even if this specific call fails (see PushRegistrationService).
    void this.pushRegistrationService.unregisterDevice();
    this.authService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigateByUrl('/connexion'),
        error: () => this.toastService.error('Impossible de vous déconnecter. Réessayez.'),
      });
  }

  protected resendVerification(): void {
    if (this.resendingVerification()) {
      return;
    }
    this.resendingVerification.set(true);
    this.authService
      .resendVerification()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resendingVerification.set(false);
          this.toastService.success('Email de confirmation renvoyé.');
        },
        error: () => {
          this.resendingVerification.set(false);
          this.toastService.error("Impossible de renvoyer l'email. Réessayez plus tard.");
        },
      });
  }
}
