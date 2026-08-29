import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NeedsReview, NeedsReviewSuggestion } from '../../../core/models/voice-draft.model';

const MESSAGES: Record<Exclude<NeedsReview['reason'], never>, string> = {
  no_match: 'Vérifiez ce champ s’il vous plaît.',
  ambiguous_match: 'Vérifiez ce champ s’il vous plaît.',
  low_confidence_match: 'Vérifiez ce champ s’il vous plaît.',
  document_type_conflict:
    'Un acompte ne s’applique pas à un devis — vérifiez le type de document ou retirez l’acompte.',
};

// Phase 1.4-2: the one small piece of UI every doubtful field on the voice
// review screen shares — a caption underneath the field it applies to,
// amber (not red — see the review page's own comment on why this must
// stay visually distinct from Angular's ng-invalid.ng-touched convention).
// The amber border/background on the field itself is applied by the
// review page's own template (existing Tailwind warning-* utility
// classes, no new CSS needed) — this component only renders the caption
// and, when there's an actual candidate to offer, a one-tap "apply"
// action.
@Component({
  selector: 'app-needs-review-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (needsReview(); as review) {
      <p class="mt-1 text-xs text-warning-subtle-fg">
        @if (review.suggestion; as suggestion) {
          <button
            type="button"
            class="text-left underline decoration-dotted hover:decoration-solid"
            (click)="apply.emit(suggestion)"
          >
            Vous vouliez dire « {{ suggestion.label }} » ?
          </button>
        } @else {
          {{ message() }}
        }
      </p>
    }
  `,
})
export class NeedsReviewHintComponent {
  readonly needsReview = input<NeedsReview | undefined>(undefined);
  readonly apply = output<NeedsReviewSuggestion>();

  protected message(): string {
    const review = this.needsReview();
    return review ? MESSAGES[review.reason] : '';
  }
}
