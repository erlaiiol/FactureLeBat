# Design System

This document records the visual identity decisions for FactureLe: palette, typography, the line-badge motif, and the motion principles. It is the "what we chose and why" companion to the roadmap — see [roadmap.md](roadmap.md) for the features these choices apply to (Phases 5–9 in particular).

These decisions came out of a visual comparison of four candidate directions ("Au carré", "Bleu de travail", "Chantier net", "Atelier sobre"). "Chantier calibré" below is a deliberate hybrid of two of them, not one of the four as originally proposed.

## Primary identity: "Chantier calibré"

Used everywhere in the working application — invoice/customer/product screens, dashboards, lists. Optimized for speed and legibility on a job site, not for warmth.

### Palette

| Token | Hex | Role |
|---|---|---|
| `bg` | `#FBFBF9` | Page background |
| `surface` | `#FFFFFF` | Cards, panels |
| `ink` | `#1A1A1A` | Primary text |
| `ink-soft` | `#6B6B63` | Secondary/meta text |
| `line` | `#E7E6DF` | Hairlines, dividers |
| `accent` | `#FF6B00` | Primary buttons, active states, the total's underline rule |
| `badge-bg` | `#D6FA2B` | Line-marking badge background (see below) |
| `badge-ink` | `#1A1A1A` | Line-marking badge text |
| `badge-edge` | `#A9C619` | Badge border / offset shadow |

### Typography

| Role | Typeface | Weight | Note |
|---|---|---|---|
| Headings, buttons, labels | Barlow Condensed | 700 | Carries the weight and modernity — used uppercase, sparingly, never for body copy (too condensed to read comfortably at length) |
| Body / UI text | Barlow | 400 | Pairs with the condensed display face |
| **All numbers** — quantities, unit prices, line totals, invoice total | IBM Plex Mono | 500 | Tabular figures (`font-variant-numeric: tabular-nums`); precision and trustworthiness on the numbers that matter most, independent of the rest of the UI's typeface |

### The line-marking badge

The badge that marks a redistributed service line (Phase 5 — "Réparti sur les lignes") is deliberately **not** the expected safety orange/yellow pairing. It's modeled on job-site marking spray paint (the fluorescent chartreuse used to flag material or a zone) instead: `badge-bg` #D6FA2B, near-black text for maximum contrast, small border-radius (2px, not a pill), a thin darker-tint border, a 1px offset shadow, and a slight -1.5° rotation — reads as a physically-stamped tag rather than a soft SaaS pill. Raw and legible on purpose, and different enough from generic "safety colors" to feel like a deliberate choice rather than a template default.

## Semantic colors

A Bootstrap-style status system (primary/secondary/success/warning/danger/info), derived from "Chantier calibré" rather than generic library defaults. Each role has a **solid** variant (filled buttons, strong emphasis) and a **subtle** variant (badges, alerts, inline status) — a soft tinted background with a deep-toned, readable text color in the same hue.

| Role | Solid bg | Solid text | Subtle bg | Subtle text | Subtle border | Typical use |
|---|---|---|---|---|---|---|
| `primary` | `#FF6B00` | `#FFFFFF` | `#FDE4D0` | `#9A4A12` | `#F3B98A` | Main actions — "Enregistrer", "Prévisualiser la facture" |
| `secondary` | `#6B6B63` | `#FFFFFF` | `#ECEAE3` | `#4A4A44` | `#D6D2C6` | Lower-emphasis actions — "Annuler", "Retour" |
| `success` | `#1F7A4D` | `#FFFFFF` | `#DCF2E4` | `#135C36` | `#9FD9B7` | Confirmations — "Facture envoyée", "Client enregistré" |
| `warning` | `#E8A400` | `#1A1A1A` | `#FCEFC7` | `#7A5200` | `#F0CE7A` | Needs attention, non-blocking — "SIRET non vérifié" |
| `danger` | `#D6432C` | `#FFFFFF` | `#FBE1DB` | `#8A2A16` | `#EDA894` | Blocking/destructive — "En retard de paiement", validation errors |
| `info` | `#2E5D82` | `#FFFFFF` | `#DCEAF2` | `#1E425C` | `#A9C7DA` | Neutral notices — "À vérifier avant commande" (Phase 9's supplier suggestions are the reference case) |

Notes on the choices:

- `primary` reuses the "Chantier calibré" accent directly — there is only one primary action color in the app, not a second one invented for this system.
- `danger` (`#D6432C`, brick-red) is deliberately a different hue register from `primary` (`#FF6B00`, orange) even though both are warm — a destructive action must never look like a shade of the main CTA.
- `info` draws on the blueprint-blue explored in "Au carré" and the workwear denim from "Bleu de travail" — a callback to the directions that didn't become the primary identity, rather than an arbitrary blue.
- **Shape rule:** semantic badges are straight rectangles, small radius, no rotation. The tilted, stamped look was originally reserved for the Phase 5 line-marking badge alone; Phase 1.1-4 carves out one deliberate second use — the Devis/Facture toggle on "Nouveau document" — reusing the stamp geometry (sharp 2px corners, offset shadow, -1.5° rotation) but in `info` blue, never the badge's chartreuse. Color, not shape, is what an artisan actually reads as "this means a redistributed line" vs. "this is the document-type switch" — `info`'s blueprint-blue and the badge's chartreuse are different enough hue registers (same reasoning as `danger` vs. `primary` above) that the two never risk being mistaken for each other, even sharing the tilt. Still no third reuse without the same reasoning being re-applied here.

## Secondary identity: "Atelier sobre" (accent only)

A warmer, calmer palette reserved for the few places the application speaks about the artisan's business rather than asking them to enter numbers quickly. **Never used on "Nouvelle facture" or any other data-entry screen** — mixing it into the working UI would dilute both identities.

### Palette

| Token | Hex | Role |
|---|---|---|
| `bg` | `#EDE8DE` | Warm stone/greige background |
| `surface` | `#FBF9F4` | Cards |
| `ink` | `#2B2622` | Text |
| `ink-soft` | `#746A5D` | Secondary text |
| `walnut` | `#6B4A34` | Primary accent (buttons, emphasis) — the tone of the wood being installed |
| `moss` | `#5C6B4F` | Secondary accent (progress, confirmation) |

### Typography

Work Sans (400/700) for body and UI text; **Zilla Slab (600) reserved for headings only** — never for body copy or numbers.

### Where it's allowed to appear

1. **The invoice PDF header sent to the client** — the delivered document can afford more warmth than the screen that produced it; it's the artisan's professional face to their own client.
2. **The guided tour** (Phase 8) — a narrative, human moment, distinct from the transactional screens it's guiding the user through.
3. **"Mon activité" in settings** — company identity (name, SIRET, legal status), not transactional data entry.
4. **The public landing page** (Phase 13.3) — the application talking about the artisan's business to a stranger, the same non-transactional register as the other three spots.

If a new screen is being designed and it's unclear which identity applies, default to "Chantier calibré" — "Atelier sobre" is the exception, not a second theme to reach for casually.

## Motion

Motion exists to confirm a real action, never as decoration. Four duration bands cover almost everything — the two original bands stay reserved for small, frequent feedback; the two added for the UI/UX polish pass ([front/](front/README.md)) are deliberately slower, reserved for moments meant to be *felt*, not just registered:

| Band | Duration | Easing | Used for |
|---|---|---|---|
| Touch | ~120ms | none on press (instant), `cubic-bezier(.2,.8,.2,1)` on release | Direct-manipulation press feedback (`buttonPress`) — tracks the finger, doesn't confirm an outcome |
| Entrance | ~250ms | `cubic-bezier(.2,.8,.2,1)` (sharp ease-out) | A new invoice line appearing, a tour step sliding in |
| Emphasis | ~400ms | same ease-out | The total pulsing/flashing accent color when it changes, so an increment is felt, not just read |
| Materialize | ~500–650ms | same ease-out | Navbar/dropdown open-close, a "card with input fields" resolving into its finished card form (invoice/client cards) |
| Contemplative reveal | ~700–1000ms | same ease-out | Scroll-triggered fade-in of cards/sections entering the viewport |

A frequent, small-scale confirmation (a toggle, a line appearing) stays fast — the slower bands are for the handful of transitions per screen that are meant to read as premium and deliberate, not for everything at once. Reserving them for genuinely structural moments (a navbar opening, a modal opening, a form becoming a card, content entering view) is what keeps them feeling premium instead of sluggish — see [front/README.md](front/README.md)'s pitfalls list for the failure mode of over-applying them.

The Touch band is deliberately separate from the other four: it's not a *confirmation* of a completed state change (that's what Entrance/Emphasis are for) but direct manipulation feedback — the button should look pressed the instant a finger/pointer is down, with zero transition delay, and only ease back to rest on release. Applying Entrance's 250ms to the press-down edge would read as laggy under a finger, not premium.

Named effects to implement (prototyped in the design-comparison artifact):

- **`lineIn`** — fade + slight upward slide (8px) + scale from 97%. Applied when a product/service line is added to an invoice.
- **`totalPulse`** — brief scale-up (112%) with a flash to `accent` color, back to rest. Applied whenever the visible total changes — ties directly into the Phase 5/6 requirement that the total always visibly increments.
- **`badgeStamp`** — scale-in from 40% with a slight overshoot and rotation settle, evoking a stamp being applied. Applied when the redistribution badge first appears on a line.
- **Tour step transitions** — directional slide + fade between steps (forward = slide from right).
- **Tour completion — the one deliberate "reward" moment in the authenticated app** — a checkmark that draws itself (`stroke-dashoffset` animation) plus a brief soft glow around the card, on finishing the guided tour. This is the single place the working app is allowed to feel a little celebratory; everywhere else stays calm on purpose, so this moment isn't diluted by scattered animation elsewhere.
- **`heroLitany`** — the public landing page's hero (Phase 13.3): a stack of short lines cross-fades in sequence, one at a time, settling permanently on "FactureLe en 1 clic." Plays exactly once per page load, then stops for good — the trigger is "the hero has just mounted," a real, one-time state change, the same justification as `scrollReveal` firing once per element, not an idle/looping effect. Scoped to the landing page's own "Atelier sobre" storytelling register (the same register the tour-completion exception is scoped to the authenticated app's own working screens) — not a precedent for adding ambient motion to data-entry screens. Reduced motion skips the sequence outright and shows the resting "FactureLe en 1 clic" state immediately, since the generic delay-based rule below isn't enough on its own to prevent a multi-second frozen frame (see `.anim-hero-litany-line`'s dedicated `prefers-reduced-motion` override in styles.css).
- **`scrollReveal`** (Materialize/Contemplative reveal bands) — fade + slight upward slide (12–16px, deliberately larger than `lineIn`'s 8px, since it's covering more distance over a longer duration) as a card/section first enters the viewport. Fires once per element (`IntersectionObserver`, unobserve after first trigger) — never on every scroll pass, never a repeating/parallax effect. This is a one-time state change ("this element has now entered view for the first time"), not idle motion, so it doesn't break the "no animation without a real state change" rule below.
- **`asyncReveal`** (Materialize/Contemplative reveal bands) — the display treatment for any element whose content only exists after an API response: a skeleton/placeholder (a subtle, slow pulse — never a spinner icon) occupies the element's final size while the request is in flight, and the real content fades + settles into place with the same motion as `scrollReveal` the instant data arrives. This is arguably the single highest-value use of motion in the app — it turns a network wait into a deliberate pause instead of a jarring blank-then-pop, a silent `await`/`async` made invisible as anything but pacing. Unlike `scrollReveal`, the trigger is data arrival, not viewport entry — it applies even to already-visible, above-the-fold elements (invoice board columns on load, catalog/customer search results, a recalculated total, a regenerated preview). Default choice for any screen that waits on the backend, not just a decorative extra.
- **`panelStretch`** (Materialize band) — height + opacity expand/collapse from the trigger's edge, origin-aware (grows from the navbar item or dropdown trigger, not from a fixed corner). Applied to the navbar's dropdown menus and any other expand/collapse panel. Replaces an instant `display` toggle, never a generic accordion fade.
- **`cardMorph`** (Materialize band) — an editable "card with input fields" (an inline creation/edit row) visually resolving into its compact, finished card representation (invoice cards, client cards) on save: fields cross-fade into their display equivalents while the container's box eases to its finished size/radius, rather than the finished card abruptly replacing the form. Reserved for that one transition — not a general-purpose swap effect.
- **`modalMorph`** (Materialize band) — a modal panel opening/closing as a real FLIP transition anchored to the element that triggered it (its `getBoundingClientRect()`, not a raw cursor point — the same origin-aware reasoning `panelStretch` already uses), instead of an instant show/hide: the panel is pinned at the trigger's rect the instant it mounts and eases via `transform: translate()/scale()` out to its resting size (opening) or back to the trigger's rect (closing) — compositor-only, unlike `cardMorph`'s real width/height animation, specifically because these panels can contain a PDF `<iframe>`/canvas that would otherwise reflow/repaint every frame. Content stays hidden until the transform's own `Animation.finished` resolves, so the brief mid-flight scale distortion `cardMorph` avoids by animating real dimensions is never actually visible here. The backdrop fades independently (Emphasis band). Falls back to a plain scale+fade when there's no real origin to measure (keyboard-triggered open, trigger unmounted). See [front/front-1-global-shell-and-overlays.md](front/front-1-global-shell-and-overlays.md) for the full spec.
- **`buttonPress`** (Touch band) — every `app-big-button` (the single shared button component every action in the app renders through) visibly depresses (`scale(0.97)`, no transition) the instant a pointer/finger is down, and eases back to rest on release/cancel. Direct-manipulation feedback, not a confirmation of anything — see the Touch band's own reasoning above for why it's not Entrance-band. Never applied to a disabled button.
- **`lineOut`** (Entrance band) — the exit counterpart to `lineIn`: fade + slight downward slide (8px) + scale to 97%, mirroring `lineIn`'s entrance exactly in reverse. Applied when a product/service/discount line is removed from an invoice, so the row visibly leaves before its neighbors settle into the gap, instead of an instant disappearance that snaps the layout. `lineIn` had no exit counterpart before this — a real gap, not a new idea grafted on.
- **`actionConfirmMorph`** (Entrance band, ~250ms in, self-reverts after ~1.6s) — a button's label briefly gains a checkmark accessory and a success-tinted state after a copy/share-type action succeeds ("Copier le lien" → a checkmark + "Copié !"), then eases back to its normal state on its own rather than needing a second click to reset. Upgrades the plain instant text-swap this app's three "Copier" buttons already do (`invoice-create-preview-step`, `invoice-create-manual`, `subscribe.page`'s referral link) — the underlying state (`xCopied` signal) is unchanged, only its visual transition is.
- **`tabSwitch`** (Entrance band) — a sliding indicator (`transform: translateX`) tracks the active option in a plain two-or-more-option tab strip, instead of the active/inactive classes just swapping instantly. Scoped to `signature-modal`'s "Dessiner"/"Importer une photo" tabs — the one plain underline-tab pattern in the app today. **Not** applied to the Devis/Facture toggle on "Nouveau document" (`invoice-create-mode-choice`) — that toggle already uses the stamp geometry (design-system.md's own "Shape rule" above), a sliding underline would fight that visual metaphor; see `stampSwitch` instead.
- **`stampSwitch`** — when the Devis/Facture toggle's selection changes, the newly-active side replays `badgeStamp`'s existing scale-in-with-overshoot keyframe rather than an instant class swap. **Already implemented** (Phase 1.1-4, `invoice-create-mode-choice.page.ts`'s `STAMP_CLASSES`/`toggleClasses()`) — surfaced again during the 2026-08-31 brainstorm before being (nearly) re-proposed as new work; see [front/front-2-invoice-creation-flow.md](front/front-2-invoice-creation-flow.md) for the correction. Not a third reuse of the stamp shape/color (already at its sanctioned second use, per this doc's own "Shape rule") — it reuses the *motion* of an already-approved instance of the shape, the same way `scrollReveal` and `asyncReveal` already share one motion vocabulary across many call sites.
- **`pageSlideTransition`** — replaces the current plain fade-up (`anim-page-in`/`replayPageEnterAnimation` in `app.ts`) with a directional slide on the native app shells specifically: forward navigation (deeper into a flow — e.g. board → preview, list → detail) slides in from the right, backward navigation (a real browser/router "back", not just any navigation) slides in from the left — the same forward/back convention this app's own tour-step transitions already use. Scoped to `platformService.isNativeApp()` only: on the web, the existing plain fade-up stays, since directional slide is specifically what makes a screen feel like a native push/pop stack, a metaphor that doesn't apply to a browser tab. See [front/front-1-global-shell-and-overlays.md](front/front-1-global-shell-and-overlays.md) for how "forward" vs. "back" is actually determined.

Rules that apply everywhere:

- Every animation is disabled (reduced to ~0) under `prefers-reduced-motion: reduce` — including `scrollReveal`, which must resolve straight to its final, fully-visible state (no hidden-forever content) when reduced motion is on.
- No animation runs without a real, corresponding state change — no idle/ambient motion, no animated illustrations, no looping/repeating effects. A `scrollReveal` firing the first time an element enters view counts as a real state change; the same element fading in and out repeatedly as the user scrolls past it back and forth does not, and must not be built.
- An animation is never load-bearing: the action it's attached to (submit, navigate, save, open, close) must already be valid/complete before the animation starts, and nothing waits for the animation to finish to become usable — see [front/README.md](front/README.md)'s "never block on motion" rule.
- One easing curve across every band, and durations pulled from this table only — not a per-component custom timing.

## Status

Both palettes and the type scale are implemented as Tailwind v4 `@theme` tokens in `frontend/src/styles.css`, including a dark-mode variant of "Chantier calibré" ("Atelier sobre" stays a light-only, accent-only treatment, per its own "where it's allowed to appear" list above). "Atelier sobre" has a fourth spot as of Phase 13.3: the public landing page (`features/landing/`).

The Materialize/Contemplative-reveal bands above are decisions made for the UI/UX polish initiative (see [front/](front/README.md)); rollout is tracked phase by phase there. `asyncReveal` is implemented app-wide: `.anim-skeleton` (styles.css) is the shared pulsing placeholder, `delayedSkeleton()` (`shared/utils/delayed-skeleton.ts`) gates it behind the ~180ms grace period, and `.anim-preview-in` (styles.css, originally written for the invoice preview mirror) is the one shared "content just arrived" reveal reused across every loading screen rather than duplicated per page. `panelStretch` is implemented as `.panel-stretch`/`.is-open` (styles.css) and used by the navbar's dropdown menus and the mobile menu, as well as (Phase 1.1-9.5) each folder card's inline product/prestation/remise checklists on "Mes dossiers". `modalMorph` is implemented (2026-08-31) across all nine modal components (`shared/utils/flip-morph.ts`, `shared/components/modal-morph.component.ts`) — build/tests verified, a live browser pass is still pending. Also implemented the same day: `buttonPress` (`BigButtonComponent`), `lineOut` (`invoice-create-lines-step.page.ts`), `actionConfirmMorph` (the app's three "Copier" buttons), `tabSwitch` (`signature-modal`'s tabs), and `pageSlideTransition` (`app.ts`/styles.css, native shells only) — all build/tests-verified, none yet live-browser-verified; see [front/front-1-global-shell-and-overlays.md](front/front-1-global-shell-and-overlays.md) and [front/front-2-invoice-creation-flow.md](front/front-2-invoice-creation-flow.md) for per-effect status and open testing items. `stampSwitch` turned out to already exist (Phase 1.1-4), found rather than built. `scrollReveal`/`cardMorph` remain not yet implemented.

Every routed page also fades up on arrival (App's `replayPageEnterAnimation`, `.anim-page-in` in styles.css) — an Entrance-band effect that isn't one of the named Materialize/Contemplative effects above, but the same "no raw pop-in" principle applied to route changes themselves.
