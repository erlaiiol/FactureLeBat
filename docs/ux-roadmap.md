# FactureLeBat — UI/UX Roadmap

## Why this document, why now

[roadmap.md](roadmap.md)'s functional core is done: an artisan can create a customer, a catalog, a devis/facture (guided or manual), send it by email, track it through payment on a lifecycle board, and pay for premium access — Phases 1 through 16 all ship real, working backend/frontend behavior. Only Phase 17 (quarterly reports/analytics) remains open on the functional side, and it doesn't touch any existing screen's interaction design.

This document is the next initiative, not a continuation of the same one: with "does what's asked of it" settled, the focus moves to **how it feels to use** — ease of use, motion, and naming — across every existing page and module. It follows the same phase structure as roadmap.md (Objective, Features, Non-goals, Notes, Implementation notes), but each phase here scopes to one page or module of the app rather than one feature, and is added incrementally as we work through the app screen by screen. [design-system.md](design-system.md) stays the single source of truth for palette/typography/motion-primitive *decisions* (see its Motion section, extended for this initiative); this document tracks *where and how those decisions get rolled out*, page by page.

## Vision

A craftsman opens FactureLeBat on a job site, on a phone, sometimes with gloves on. The functional roadmap already optimized for that: big buttons, click over type, guided/catalog-driven entry, tap alternatives to every drag gesture. This initiative adds the layer on top — the app should not just work fast, it should **feel like a premium, considered product**: something that impresses a client glanced over the artisan's shoulder and gives the artisan themselves confidence that this is a serious business tool, not a bare CRUD form.

Concretely, that means:

- **Fewer clicks, fewer keystrokes, always.** Every UI/UX change is judged first against this existing roadmap principle (see roadmap.md's Product Vision) — motion and naming polish must never add a click or a field to reach an action that's faster today.
- **Contemplative pacing, not snappiness.** Interface feedback so far (design-system.md's original Entrance/Emphasis bands) was tuned for quick confirmation — ~250/400ms. This initiative deliberately introduces slower bands (~500–650ms, ~700–1000ms — see design-system.md's Motion section) for the handful of transitions per screen that deserve to be *felt*: a navbar opening, a filled-in form settling into its finished card, content arriving as the artisan scrolls to it. Slow is a deliberate choice reserved for structural moments, not the new default for everything.
- **Scroll-aware presence.** Cards and sections fade (and, where it reads better, fade back out) as they enter and leave the viewport, so a long list (invoice board, customer grid, catalog) feels alive rather than a static dump of rows.
- **Animation as a silent `await`.** The single highest-value use of motion in this app, and easy to under-rate next to the more visible scroll/stretch effects: any element whose content only exists after an API response — an invoice board loading, a total recalculating, a preview regenerating, a search result list — gets an entrance treatment on arrival rather than an instant, jarring pop from blank to populated. The animation *is* the loading state; the artisan feels a deliberate pause, not a stall. See design-system.md's `asyncReveal`.
- **Stretch, not swap.** A navbar/dropdown opening, or an editable "card with input fields" resolving into its finished form (an invoice card, a client card), should visibly grow/settle into its new shape — never an instant, jarring replace.
- **Names that carry weight.** Page and section titles get the same scrutiny "Nouveau document"/"Mes documents" (Phase 14.3) already got — short, unambiguous, and free of leftover technical or placeholder phrasing.

## Priority order

1. Usability (fewer clicks/keystrokes) — never regresses, even for a motion or naming win.
2. Clarity (naming, visibility, alignment) — a user should never wonder where to look or what a label means.
3. Confidence (motion, polish) — the premium feel this initiative exists to deliver.
4. Novelty — a clever effect that doesn't serve 1–3 doesn't ship.

## Pitfalls to avoid

- **Decoration creeping past design-system.md's own rule.** "No animation without a real, corresponding state change" already governs every existing motion primitive (lineIn/totalPulse/badgeStamp) — the new scroll/stretch primitives extend that rule, they don't get an exception. A `scrollReveal` that fires every time an element merely scrolls back into view is idle motion wearing a scroll-triggered costume; it fires once, ever, per element.
- **Slow durations turning into perceived lag.** ~500ms–1s is for a handful of structural transitions per screen, not a blanket replacement for the existing ~250/400ms bands. If a screen has more than two or three Materialize/Contemplative-reveal-band animations firing in the same interaction, that's a sign too many moments are competing for "premium," not that the effect is working.
- **Motion blocking the task.** An action (submit, navigate, save) must already be valid and its result already committed before its animation starts; nothing the artisan needs is ever gated behind an animation finishing. This matters doubly on the job-site/mobile/low-end-hardware context this app targets — a stretch/morph that stutters reads as broken, not premium.
- **Undermining the click-not-type/glove-friendly constraints already won.** Phase 7's tooltip-not-hover call and Phase 16's tap-equivalent-to-every-drag rule exist because the target user can't rely on hover or fine-motor drag precision. A motion or layout change must not quietly reintroduce a hover-only affordance or a drag-only action.
- **Splitting the design system.** "Chantier calibré" vs. "Atelier sobre" boundaries (design-system.md) stay exactly where they are — new motion polish is applied within whichever identity a screen already uses, never as a reason to blur the two.
- **Inventing a new timing/easing per component.** Every new effect pulls its duration from design-system.md's bands and its easing from the one shared curve. A component-specific "just this once, 180ms with a different curve" is the failure mode that turns a small design system into an inconsistent one.
- **Skeleton flash on already-fast responses.** `asyncReveal`'s skeleton should only appear if the response hasn't landed within roughly 150–200ms — showing and immediately hiding a placeholder on a fast call reads as a flicker, not a wait being smoothed over. A slow connection gets the intended calm pause; a fast one never sees the skeleton at all.
- **Renaming for novelty, not clarity.** A page/label change needs a concrete reason (ambiguity, leftover technical phrasing, inconsistency with a sibling page) — not just "this sounds more premium," which is subjective and reversible-feeling for users who'd already learned the old name.

## Testing & verification

Motion and naming changes are not something a unit test or type check can verify — the existing roadmap's own caution applies directly here: *"Type checking and test suites verify code correctness, not feature correctness."* For this initiative specifically:

- Every phase gets a real manual pass in a browser, at minimum at a phone-width viewport (this app's primary real-world context) and a desktop width, before being marked done — not just "it compiles."
- Check `prefers-reduced-motion: reduce` explicitly for every new effect each phase touches — it must resolve to the final state instantly, never to a stuck-hidden or stuck-mid-transition element.
- Check the golden path *and* the edge cases motion tends to break: rapid repeated triggers (double-click, fast scroll, quick open/close), empty states, and long content (a very long client/product name inside a `cardMorph` or a stretch panel).
- Existing functional e2e/unit coverage (backend and Angular component tests) must stay green — this initiative changes presentation, not behavior, and a broken test here is a signal the "purely visual" boundary was crossed.
- Regressions are checked against the specific usability constraints these changes must not erode: still fewer clicks than before, still no hover-only affordance, still a tap-equivalent for anything that gained a gesture.

## Visibility, placement & alignment

Independent of motion, this initiative is also a pass on plain visual hygiene — the kind of thing that quietly signals "premium" or "cheap" regardless of any animation:

- Deliberate centering where it reads as intentional: empty states, modals, key CTAs, and any screen with little content should be visually centered/balanced, not left pinned to a top-left default.
- Consistent spacing rhythm — margins/gaps pulled from the existing Tailwind scale, not one-off pixel values per screen.
- Nothing partially cut off, overlapping, or misaligned at the phone-width viewport specifically, since that's this app's primary real device context, not an edge case.
- A hidden/toggleable element (Phase 15's field visibility toggles, a dropdown, a collapsed panel) must have an unambiguous, visible affordance that it exists and is interactive — polish must never make an actionable element *harder* to notice.

## Phases

Each phase below scopes to one page or module and will be detailed (Objective/Features/Non-goals/Implementation notes) as it's actually worked on, the same way roadmap.md's phases were written. Listed here as a working index, roughly in the order screens will be revisited — not a hard commitment to that order.

- [ ] **Phase 1 — Global Shell** (navbar, dropdowns, theme toggle): `panelStretch` rollout, naming pass on nav labels.
- [ ] **Phase 2 — Invoice Creation Flow** (client cards, catalog line activation — Phase 13.5): scroll reveal on card grids, `cardMorph` for inline product/client creation resolving into its finished card.
- [ ] **Phase 3 — Invoice/Devis Board** (Phase 16): scroll reveal per column, drag/drop motion polish, ghost-card treatment.
- [ ] **Phase 4 — Customer Management**: client card grid motion, search/sort screen polish (Phase 14.5).
- [ ] **Phase 5 — Catalog** (products/services): list/grid motion, inline-creation `cardMorph`.
- [ ] **Phase 6 — Company Settings / "Mon activité"**: naming/visibility pass within the existing "Atelier sobre" identity — no new motion identity introduced here.
- [ ] **Phase 7 — Auth Pages** (login, signup, forgot/reset password): pacing and naming pass on the account-entry funnel.
- [ ] **Phase 8 — Landing Page** (Phase 13.3): scroll-reveal pass appropriate to a marketing page's existing "Atelier sobre" identity.
- [ ] **Phase 9 — Naming & Microcopy Sweep**: cross-cutting review of every page title, button label, and empty-state message app-wide, once the per-module phases above have surfaced the specific inconsistencies worth fixing.

---
