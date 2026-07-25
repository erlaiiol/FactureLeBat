import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { PaywallModalComponent } from './shared/components/paywall-modal.component';
import { TourService } from './shared/tour/tour.service';
import { TourOverlayComponent } from './shared/tour/tour-overlay.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TourOverlayComponent,
    PaywallModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly tourService = inject(TourService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

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

  // Nav bar's "Aide" button: always replays whichever guided tour owns the
  // current page, regardless of the auto-launch preference in Settings —
  // asking for help should work even after it's been turned off there
  // (that toggle only controls whether tours show up unprompted).
  protected replayHelp(): void {
    this.tourService.startTourForCurrentRoute();
  }

  protected logout(): void {
    this.authService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.router.navigateByUrl('/connexion'));
  }

  protected resendVerification(): void {
    this.authService.resendVerification().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
