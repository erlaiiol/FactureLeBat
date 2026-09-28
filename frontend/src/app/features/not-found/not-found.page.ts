import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { IconWarningComponent } from '../../shared/components/icon-warning.component';

// Matched by app.routes.ts's trailing `**` wildcard — any URL that doesn't
// exist. Deliberately outside authGuard: a mistyped/stale link should read
// as "page introuvable" for anyone, signed in or not, rather than bouncing
// a signed-out visitor to the login form for a URL that was never going to
// exist either way.
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BigButtonComponent, IconWarningComponent],
  templateUrl: './not-found.page.html',
})
export class NotFoundPage {}
