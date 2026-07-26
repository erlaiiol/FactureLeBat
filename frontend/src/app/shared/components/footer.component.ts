import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SiteLegalPublicService } from '../../core/services/site-legal.service';

// Phase 20: a persistent, "classic" footer mounted once in app.html and
// reused by the landing page (which used to own its own separate <footer>
// markup) instead of duplicating the same three links twice. Deliberately
// styled with the same neutral tokens as the rest of the working app
// ("Chantier calibré"), not "Atelier sobre" — see docs/design-system.md's
// sanctioned-spots list, which is light-only and doesn't include a footer
// that now also renders inside the authenticated app shell (dark mode
// included).
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './footer.component.html',
})
export class FooterComponent {
  private readonly siteLegalService = inject(SiteLegalPublicService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentYear = new Date().getFullYear();
  // Empty until the admin has filled in "Infos légales" — the contact link
  // falls back to the Mentions légales page itself rather than a dead
  // mailto: link (see footer.component.html).
  protected readonly contactEmail = signal('');

  constructor() {
    this.siteLegalService
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => this.contactEmail.set(info.contactEmail),
        // Never blocks page render on a footer detail — the mailto link
        // simply falls back to /mentions-legales, same as "not filled in
        // yet".
        error: () => undefined,
      });
  }
}
