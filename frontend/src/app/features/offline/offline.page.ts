import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { IconWarningComponent } from '../../shared/components/icon-warning.component';

// Reached only via authGuard/guestGuard's own catchError (see their
// comments, and AuthService.ensureLoaded/isNetworkError) — never routed to
// directly. Covers the cold-launch case reported from a real device: no
// wifi/4G at all when the app opens, so the very first `/auth/me` call
// never gets a response. Without this, that failure used to collapse into
// "not logged in" and show the login form — misleading, since the artisan
// might have a perfectly valid session and just no signal.
//
// Manual retry only, no auto-redirect/countdown — the app has no way to
// know when connectivity actually comes back (no reliable
// navigator.onLine on a WKWebView), so a timed retry would just as often
// fire while still offline. Navigating to '/' re-triggers guestGuard, which
// calls the exact same ensureLoaded() this page's own failure came from —
// if still offline, that guard's own catchError sends the artisan right
// back here.
@Component({
  selector: 'app-offline-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BigButtonComponent, IconWarningComponent],
  templateUrl: './offline.page.html',
})
export class OfflinePage {
  private readonly router = inject(Router);

  protected retry(): void {
    void this.router.navigateByUrl('/');
  }
}
