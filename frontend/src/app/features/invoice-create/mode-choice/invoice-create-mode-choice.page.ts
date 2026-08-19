import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentType } from '../../../core/models/invoice.model';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { InvoiceDraftStore } from '../invoice-draft.store';

// Phase 9.5: the first screen of "nouvelle facture" — picks between mode
// rapide (today's step-based, catalog-driven flow) and mode manuel (the
// free-form PDF-like canvas). Purely navigational: each mode owns its own
// draft store, so choosing one here never touches the other's state.
//
// Phase 14.3: also picks Devis/Facture, independently of the mode choice
// above — a devis is mechanically a facture, so this is just carried along
// as a query param on whichever mode link is clicked (`?type=...`), read
// once by that mode's draft store at construction. Still purely
// navigational: nothing about the choice is persisted here.
// Phase 1.1-4: the toggle's active side borrows the Phase 5 line-badge's
// stamp geometry (sharp 2px corners, a border, an offset shadow, -1.5°
// rotation, the badgeStamp entrance animation) but in `info` blue rather
// than the badge's chartreuse — see docs/design-system.md's amended "Shape
// rule" for why this is a deliberate second use, not an erosion of the rule
// (color, not shape, is what tells the two apart).
// `anim-badge-stamp` is a plain CSS mount animation (styles.css) — bound
// exclusively to whichever button is currently selected, it replays on its
// own every time the artisan switches sides: the class transitions from
// absent to present on a *different* element each click (never re-added to
// the same element without an intervening removal), which is exactly what
// restarts a CSS animation, no manual replay/reflow trick needed.
//
// Border/shadow tuned up from the badge's original 1px/1px (too easy to
// miss on the first control an artisan hits on every new document — see
// this phase's own leftover "re-check spacing" checkbox in the roadmap).
// Two different tokens, deliberately, one per surface the edge sits against:
// - border-2 in `info-fg` (the same near-white tone already used for this
//   button's own text) — outlines the shape against `bg-info` itself, where
//   the old info-subtle-fg (only a shade off the fill) barely read as a
//   border at all.
// - the 2px offset shadow stays `info-subtle-fg` (a dark navy) — it sits on
//   the *page* background (bg-surface, a light cream), not on the fill, so
//   it needs to be dark to read as a shadow; a white shadow here would be
//   invisible against a light page and lose the "stamp lifted off the
//   surface" cutout effect this app already uses elsewhere (just a bigger
//   step of that same hard-edge language, not a new soft/gradient effect).
// hover:brightness-90 matches this app's own convention for a solid/filled
// button (see big-button.component.ts's `solid` variants) — both sides are
// always clickable (switching to the already-selected side is a no-op, but
// still a real button), so both need a hover cue on web/desktop, not just
// the selected one.
const STAMP_CLASSES =
  'anim-badge-stamp bg-info text-info-fg rounded-[2px] border-2 border-info-fg shadow-[2px_2px_0_0_var(--color-info-subtle-fg)] -rotate-[1.5deg] hover:brightness-90';
// The unselected side: a flat, muted rectangle — same sharp corners as the
// active side's stamp (no lingering pill radius), but no rotation/border/
// shadow/color, so the stamp treatment reads as marking a real state, never
// just decoration on an inert control. Resting fill is a light tint (same
// bg-secondary-subtle/40 -> hover:bg-secondary-subtle convention as this
// app's other editable/clickable controls, e.g. invoice-totals-summary's
// EDITABLE_FIELD_CLASSES) rather than the page's own bg-surface — a flat
// surface-on-surface rectangle gave no visual hint this side was clickable
// at all before the artisan ever hovered it.
const FLAT_CLASSES =
  'rounded-[2px] bg-secondary-subtle/40 text-ink-soft hover:bg-secondary-subtle hover:text-ink';

@Component({
  selector: 'app-invoice-create-mode-choice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TourAnchorDirective],
  templateUrl: './invoice-create-mode-choice.page.html',
})
export class InvoiceCreateModeChoicePage {
  protected readonly documentType = signal<DocumentType>('FACTURE');

  constructor() {
    // Every arrival here is an explicit "nouvelle facture" entry point (nav
    // link or back-navigation out of an abandoned draft) — never a step
    // within the rapide/manuel flows themselves, which don't route back
    // through this page. So this is the right, and only, place to drop a
    // stale localStorage-persisted rapide draft (leftover client, lines)
    // before the artisan picks a mode, instead of leaving mode rapide's
    // client step to guess whether a persisted customer means "resume me".
    inject(InvoiceDraftStore).reset();
  }

  protected selectDocumentType(type: DocumentType): void {
    this.documentType.set(type);
  }

  // Bigger touch target and bolder type than the rest of this smaller-text
  // page — the first control an artisan interacts with on every new
  // document, per docs/roadmap.md Phase 1.1-4.
  protected toggleClasses(type: DocumentType): string {
    const base = 'relative px-8 py-3 text-base font-bold transition';
    return `${base} ${this.documentType() === type ? STAMP_CLASSES : FLAT_CLASSES}`;
  }
}
