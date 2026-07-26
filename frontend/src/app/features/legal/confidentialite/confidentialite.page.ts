import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconWarningComponent } from '../../../shared/components/icon-warning.component';

// Phase 20 audited this page's claims against the app's actual behavior
// (third-party processors, cookies, retention/deletion) — content is
// accurate as of that audit, but still needs a professional legal review
// before production (see docs/roadmap.md Phase 20).
@Component({
  selector: 'app-confidentialite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconWarningComponent],
  templateUrl: './confidentialite.page.html',
})
export class ConfidentialitePage {}
