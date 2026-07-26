import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconWarningComponent } from '../../../shared/components/icon-warning.component';

// PLACEHOLDER CONTENT — not real legal text. Must be reviewed/replaced by
// the artisan or a legal professional before this app goes to production
// (see docs/roadmap.md Phase 13). Only exists so the registration form's
// mandatory consent checkbox has something real to link to.
@Component({
  selector: 'app-confidentialite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconWarningComponent],
  templateUrl: './confidentialite.page.html',
})
export class ConfidentialitePage {}
