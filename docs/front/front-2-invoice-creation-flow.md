# Phase 2 — Invoice Creation Flow

[← back to Front index](./README.md)

## Objective

Covers the guided ("mode rapide") and manual invoice/devis creation
screens. `cardMorph` (the full-form ↔ compact-card FLIP transition,
`invoice-create-lines-step.page.ts`'s `playCardMorph`) already shipped here
ahead of this file existing — this is the first real detail file for the
phase, opened by two small, contained additions from a 2026-08-31
brainstorm rather than a full ground-up pass on the whole flow.

## Status of pre-existing scope

- [x] `cardMorph` — the full-form/compact-card FLIP transition on invoice
      and service lines (`invoice-create-lines-step.page.ts`).
- [ ] `scrollReveal` on catalog/client card grids — not started.

## `lineOut` — line removal exit animation (2026-08-31)

### Objective

`lineIn` (fade + upward slide 8px + scale from 97%, Entrance band) plays
whenever a product/service/discount line is added, but removing one
(`removeLine`/`removeServiceLine`/`removeDiscountLine` in
`invoice-create-lines-step.page.ts`) is instant — the row and its
`anim-line-in` wrapper just disappear, and the lines below snap upward to
fill the gap. `lineIn` never had a symmetric exit; this closes that gap.

### Design decisions

- **Mirrors `lineIn` exactly, reversed**: fade + slight *downward* slide
  (8px) + scale *to* 97% (not from), same Entrance band (~250ms), same
  `ease-out-sharp` curve — one shared visual vocabulary for a line's
  lifecycle, not a new one invented for the exit half.
- **Delays the actual array removal until the exit animation finishes** —
  the same "Angular's `@if`/`@for` has no built-in delayed-removal concept"
  constraint `modalMorph` already solved for whole modals
  ([front-1](./front-1-global-shell-and-overlays.md)), at a smaller scale
  here: play the animation on the outgoing row (via `element.animate()`,
  matching `cardMorph`'s and `modalMorph`'s own WAAPI-based technique, not
  a new CSS-transition-plus-`transitionend` approach), then remove the row
  from the underlying `FormArray` in the animation's own `.finished`
  callback.
- **The FLIP engine already built for `modalMorph`
  (`shared/utils/flip-morph.ts`) is not reused as-is** — that engine
  animates a panel's rect relative to an origin *point*; a line removal
  has no origin to grow into, it's a plain fade-and-collapse in place. A
  separate, much smaller helper (or a couple of inline keyframes) is more
  honest here than forcing an unrelated shape onto the FLIP function.

### Non-goals

- No animation on the *siblings* shifting upward to fill the gap beyond
  whatever the browser's own layout naturally does — no explicit FLIP on
  every remaining row, which would be a much bigger effect for a line
  removal that should read as quick and minor, not a big structural
  moment.

### Rollout checklist

- [x] `removeLine`, `removeServiceLine`, `removeDiscountLine`
      (`invoice-create-lines-step.page.ts`) — each now plays `playLineOut`
      before the actual `FormArray` removal. **Real correctness issue
      caught and fixed while implementing, not in the original spec**: the
      closed-over numeric `index` from the click can go stale if a
      *different* line finishes its own (faster, e.g. reduced-motion)
      removal first, shifting every later index — fixed by re-finding the
      removed group's own current index (`FormArray.controls.indexOf(group)`)
      inside the deferred callback instead of trusting the captured
      `index`, and bailing (`=== -1`) if the group is already gone.
- [x] **2026-08-31 follow-up, user feedback ("marche bien, pourrait être
      encore un peu plus fluide")**: fade+slide+scale alone left the
      outgoing row's full-height layout box in place for the whole 250ms,
      then the real `FormArray` removal collapsed it to zero in a single
      frame — a visible snap right after the smooth part finished. Fixed
      by also animating `maxHeight` (with `overflow: hidden`) down to 0 in
      the same keyframes, so the row's own box closes in lockstep with the
      fade — nothing left to snap by the time the removal runs. Live-
      verified via Playwright: `maxHeight`/rect height now shrink smoothly
      frame-by-frame (208px → 44px → 9px → ~1px) in step with opacity,
      confirmed with the actual remove control (a `<span>` holding the ×
      icon inside the collapsed catalog card, not the button that wraps
      the whole card for expand — worth noting since it's easy to target
      the wrong element when testing this by hand). One known, accepted
      remainder: the shared list uses `gap-4`/`gap-6` (flex/grid gap, not
      margin) between cards, which can't be shrunk for a single child via
      CSS alone — a small (one `gap` unit) snap still happens at the
      instant of actual removal, meaningfully smaller than the old
      full-row-height snap but not zero. A real per-sibling FLIP reflow
      would close that too; out of scope per this phase's own non-goal.

### Testing

- [ ] Removing the last remaining line (empty-state transition right
      after) doesn't leave a stuck, invisible placeholder. **Not yet
      done.**
- [ ] Removing a line while mid-edit (a field currently focused) doesn't
      throw on the animated element being removed under an active focus.
      **Not yet done.**
- [ ] `prefers-reduced-motion`: instant removal, no animation. **Not yet
      done** (the code path exists — `playLineOut` checks the media query
      before calling `el.animate()` — but hasn't been exercised live).
- [ ] Removing two lines in rapid succession (the race the index-lookup
      fix above targets) doesn't remove the wrong row. **Not yet done.**

## `stampSwitch` — Devis/Facture toggle stamp-settle (already implemented — found, not built, 2026-08-31)

### Correction

This was pitched as a new idea during the 2026-08-31 brainstorm and written
up as a rollout item — reading `invoice-create-mode-choice.page.ts` before
implementing it found it already exists, shipped under Phase 1.1-4.
`STAMP_CLASSES` includes `anim-badge-stamp`, and `toggleClasses()` applies
it exclusively to whichever side is currently selected — the class goes
from absent to present on a *different* element each click, which restarts
the CSS animation on its own with no manual replay/reflow trick needed
(see that file's own comment, which already spells out precisely the
mechanism this doc was about to propose building). Left in this file as a
record that the idea was checked against the real code rather than
duplicated, not as an open rollout item.

### What it actually does (for reference)

`badgeStamp`'s existing keyframes (scale-in from 40% with overshoot +
rotation settle) replay on the newly-selected side every time
`documentType()` changes; the side becoming inactive just fades to its
flat, unrotated state (`FLAT_CLASSES`). Exactly the "one shared vocabulary,
many call sites" reasoning `scrollReveal`/`asyncReveal` already rely on —
not a third use of the stamp shape/color (design-system.md's own
discipline), just the motion belonging to an already-approved instance of
that shape.
