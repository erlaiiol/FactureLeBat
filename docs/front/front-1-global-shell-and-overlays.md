# Phase 1 — Global Shell & Shared Overlays

[← back to Front index](./README.md)

## Objective

Covers the app's chrome — navbar, dropdowns, theme toggle — and, as of
2026-08-31, every modal in the app, since a modal is the other piece of UI
that's global chrome rather than page content: it renders on top of
whichever screen triggered it, using the same handful of shared components
everywhere (`pdf-preview-modal`, `invoice-preview-modal`,
`signature-modal`, `signature-view-modal`, `paywall-modal`,
`company-essentials-modal`, `send-invoice-email-modal`,
`create-devis-modal`, `invoice-due-date-modal`).

## Status of this phase's original scope

- [x] `asyncReveal` (skeleton + fade-in loading states) — done app-wide.
- [x] Page-level entrance fade on every navigation (`App.replayPageEnterAnimation`,
      `.anim-page-in`) — done app-wide.
- [x] `panelStretch` rollout on the navbar's dropdown menus and mobile menu
      (`app.html`, `.panel-stretch`/`.is-open` in styles.css) — **this was
      already shipped** (also reused by Phase 1.1-9.5's folder-card
      checklists on "Mes dossiers"); [ux-roadmap.md](../ux-roadmap.md)'s
      old index still listed this as open, which was stale — corrected here
      while moving this track into its own folder.
- [ ] Naming pass on nav labels — not started. The one item genuinely still
      open from this phase's original scope.

## `modalMorph` — origin-anchored modal open/close (2026-08-31)

### Objective

Every modal today (see the nine components listed above) opens with an
instant show/hide — no transition on the panel itself, just an
appear/disappear, most with only a raw backdrop fade if that. This closes
the gap `cardMorph`/`panelStretch` already closed elsewhere in the app: a
box changing size/visibility should visibly grow into its new shape, never
pop or swap. Concretely — a modal should open as if it physically unfolds
from the button that triggered it, all four sides expanding/sliding to the
modal's real size, and collapse back into that same spot on close. This is
the single most-requested case for this pass, called out by name for the
PDF-opening modals (`pdf-preview-modal`, `invoice-preview-modal`) but scoped
as one shared primitive for all nine, not a one-off for those two.

### Design decisions

- **Origin = the triggering element's rect, not the raw cursor/touch
  point.** "Grows from where you clicked" is satisfied by anchoring to the
  DOM element that was clicked (its `getBoundingClientRect()`), the same way
  `panelStretch` already anchors to "the navbar item or dropdown trigger,
  not a fixed corner" and `cardMorph` anchors to a card's own outgoing rect
  — never to a literal pointer coordinate. A raw cursor point breaks for
  keyboard-triggered opens (no pointer position at all), is unstable on
  touch (registers as a small area, not a point, and can jitter a few
  pixels off the actual button), and every existing origin-aware effect in
  this app already uses element rects. If this reads wrong once it's live,
  it's a one-line change to the rect source — not a reason to block the
  rest of the spec on it now.
- **Reuses `cardMorph`'s FLIP technique, generalized.** `cardMorph` (see
  `invoice-create-lines-step.page.ts`'s `playCardMorph`/`morphId`) already
  proved the right approach for this app: measure a real outgoing rect,
  pin the incoming element at that exact rect the instant it mounts, then
  animate real `width`/`height`/`top`/`left` (never `transform: scale()`,
  which stretches borders/radius/text/shadow non-uniformly and reads as
  cheap) back to the element's own natural resting rect. `modalMorph` is the
  same technique with the "outgoing card" replaced by "the trigger button's
  rect" and the "incoming card" replaced by "the modal panel." This phase
  extracts that FLIP math out of `invoice-create-lines-step.page.ts` into a
  shared utility (`shared/utils/flip-morph.ts`, a plain `playFlipMorph(from,
  to, options)` function with no invoice-line-specific knowledge) so a
  ninth call site doesn't mean a ninth reimplementation — `cardMorph`'s own
  call site can move onto the same shared function too, though that's not
  required for this phase to ship.
- **One shared host, not nine copies.** None of the nine modal components
  share a base today — each owns its own template and open/close state.
  Wiring FLIP math into all nine independently would violate the "one
  shared primitive, not a per-component reinvention" rule the rest of
  design-system.md already holds every other effect to. This phase
  introduces one shared piece — a directive (e.g. `appModalMorph`) applied
  to each modal's panel element, taking an `origin` input the caller sets
  from the click event that opened it (`(click)="openPreview($event)"` →
  `$event.currentTarget`, captured at trigger time since the DOM event is
  gone by the time the modal itself mounts) — every existing modal adopts
  the directive; none gets a bespoke animation.
- **Backdrop and panel animate independently.** The backdrop is a plain
  opacity fade (Emphasis band, ~400ms) and is never part of the FLIP rect —
  only the panel itself grows/shrinks. Mixing the two (e.g. scaling the
  backdrop with the panel) reads as a screen-warp effect, not a considered
  modal opening.
- **Content never distorts.** Exactly `cardMorph`'s own rule: the box's
  real dimensions animate, not a stretched snapshot of its content. The
  modal's inner content (PDF iframe/canvas, form fields) stays at its own
  full, undistorted scale throughout; a short (~150ms) content fade-in
  starts once the panel has covered roughly 70–80% of the distance to its
  resting size, so text/iframe content already at rest doesn't visibly
  stretch mid-flight.
- **Timing:** Materialize band (~550ms), the same band `panelStretch` and
  `cardMorph` already use — one shared duration for every "a box changes
  size" moment in the app, not a bespoke value for modals.
- **Fallback when there's no real origin to measure** — opened via
  keyboard, a deep link, or a trigger element that's since scrolled out of
  the viewport/unmounted: fall back to a plain scale-from-98%-and-fade
  (still Materialize band), the same "skip straight to the plain case"
  fallback `cardMorph` already uses when there's no outgoing element to
  measure (see `playCardMorph`'s own handling of that case). Never crash,
  never silently skip the animation with no fallback at all.
- **Close is the exact reverse** — the panel shrinks back into the same
  origin rect it grew from (or the fallback scale-down, if the origin is
  gone by close time), backdrop fades out independently, and the existing
  `closed` output still fires exactly when it does today so callers don't
  need to know the animation happened.

### Capacitor / native mobile considerations (checked before implementation, 2026-08-31)

This app ships as a Capacitor wrapper (Android system WebView, iOS
WKWebView — see `frontend/capacitor.config.ts`), and the two modals named
explicitly for this effect (`pdf-preview-modal`, `invoice-preview-modal`)
are exactly the ones with the heaviest content on the platform where it
matters most: `pdf-preview-modal` already special-cases iOS/Safari onto a
`pdf.js` `<canvas>` renderer instead of `<iframe src="blob:">`
(`needsCanvasPdfViewer()`), a known-fragile-content case. A few decisions
follow directly from that, some diverging from `cardMorph`'s own technique
with a stated reason rather than copying it blindly:

- **Animate `transform: translate()/scale()` on the panel, not real
  width/height/top/left like `cardMorph` does.** `cardMorph`'s real-dimension
  approach is right for its own case — form fields that must stay correctly
  laid out and interactive throughout the morph. A modal panel's content is
  already planned to be masked until ~70–80% of the animation (see above),
  so there's no reflow-fidelity to protect mid-flight — and an animated
  `width`/`height` on the element containing a PDF `<iframe>` would force
  that iframe to reflow/repaint its own document on every animation frame,
  on both WebView engines. `transform` is compositor-only and sidesteps that
  entirely. Border-radius can still animate as a plain CSS property (cheap,
  not layout-triggering) alongside the transform.
- **Sequence, don't race, the transform against the PDF render.** The
  panel's open transform and pdf.js decoding a canvas (or an iframe loading
  its blob) are both non-trivial work; starting them in the same frames
  risks visible jank on a lower-end Android device specifically, the
  "job-site hardware" context [front/README.md](./README.md) already
  designs around. Content stays visually hidden (`visibility: hidden`,
  shipped) until the animation's own `Animation.finished` promise resolves.
  **Not yet implemented**: actually deferring the iframe `src` assignment/
  canvas render start until that same point, which needs the animation's
  settled state exposed out of `ModalMorphComponent` to the projected
  content (today it's `ChangeDetectionStrategy.OnPush`-internal only) —
  masking hides the visual jank but the iframe/canvas work still starts
  immediately today. Flagged as a real follow-up if PDF preview opening is
  ever seen to stutter on a real low-end device, not assumed away.
- **Origin capture is a single global listener, not a new input threaded
  through every trigger.** Wiring a `[originRect]` input through every one
  of the many call sites that open one of these nine modals across the app
  would be a much larger, easier-to-miss-one-spot diff for the same result.
  Instead, one capture-phase `click` listener (registered once, app root
  level) remembers the bounding rect of the nearest clickable ancestor of
  every click, with a short freshness window — the modal wrapper reads it
  at the moment it opens. This degrades to the already-planned fallback
  (scale+fade from center) exactly the same way a missing per-call-site
  input would, and for free handles a keyboard-triggered open (a native
  `click` event still fires on Enter/Space, still has a real `target`, just
  no pointer coordinates — which this app never anchors on anyway).
- **Resting-rect measurement**: `ModalMorphComponent` reads the panel's own
  `getBoundingClientRect()` directly, which is accurate for the common case
  (none of the nine modals `autofocus` a field today, confirmed by reading
  every template). **Not yet implemented**: explicitly reading against
  `window.visualViewport` the way `keyboard-visibility.service.ts`/
  `tour-overlay.component.ts` already do — only matters if a future field
  gains `autofocus` and the keyboard opens between mount and the
  animation's rect capture (one `afterNextRender` tick later), shifting the
  resting size out from under it. Worth adding at that point, not
  speculatively now.
- **Safe-area insets**: the backdrop/panel padding accounts for
  `env(safe-area-inset-*)`, the same pattern already used by
  `quantity-wheel-picker.component.ts` for the notch/home-indicator.
- **`prefers-reduced-motion` needs no native bridging** — both Android's
  system WebView and iOS's WKWebView already surface the OS-level "reduce
  motion" accessibility toggle through this same CSS media feature.
- **Explicitly out of scope, flagged not fixed**: this app has no Android
  hardware-back-button handling anywhere today (confirmed — the only
  `@capacitor/app` usage is `deep-link.service.ts`'s `appUrlOpen` listener),
  so the system back button doesn't currently close any modal, morph or
  not. If back-button handling is ever added, it must close through the
  same path (flipping the `open` input) so the reverse morph plays, never
  an instant unmount that bypasses it.
- **Web Animations API (`el.animate()`), not a CSS class + `transitionend`
  listener** — same technique `cardMorph` already uses, for the same
  reason: a real `Animation` object gives a `.finished` promise to
  sequence content-reveal and eventual DOM removal off of, more reliable
  than debouncing `transitionend` across two WebView engines with
  historically inconsistent event-firing edge cases.

### Non-goals

- No bounce/overshoot. `badgeStamp`'s stamp-settle overshoot is reserved for
  that one specific moment (design-system.md's own "no third reuse without
  the same reasoning re-applied" discipline) — `modalMorph` stays a single
  clean ease-out, matching this initiative's "worked on, not a fireworks
  show" bar.
- No change to any modal's existing focus-trap, `Escape`-to-close, or
  scroll-lock behavior — those must keep working unchanged through the new
  open/close animation; this phase is the transition only, not a rebuild of
  modal semantics.
- No redesign of what's inside any of the nine modals.
- No per-modal custom duration or easing — every adopter pulls from the same
  Materialize-band constant.

### Rollout checklist

Implemented 2026-08-31 (`ModalMorphComponent` — not a directive in the end,
a wrapper component projecting each modal's own content via `<ng-content>`,
since Angular's `@if` has no way to delay a directive's host removal on its
own; see the component's file comment for why):

- [x] `shared/utils/flip-morph.ts` — the transform-based FLIP engine
      (`playModalMorphOpen`/`playModalMorphClose`/`shrinkRectForFallback`),
      standalone and invoice-line-agnostic; `cardMorph`'s own
      `playCardMorph` is untouched, not migrated onto this (would need its
      own separate pass — different technique, see this doc's Capacitor
      section).
- [x] `shared/utils/last-click-origin.service.ts` — the app-wide origin
      capture described above.
- [x] `shared/components/modal-morph.component.ts` — origin capture, open/
      close state machine (handles rapid reopen-mid-close), fallback path,
      `prefers-reduced-motion` bypass.
- [x] `pdf-preview-modal.component`
- [x] `invoice-preview-modal.component` (invoice-board) — needed a
      `displayedInvoice` frozen-signal addition (see its own comment) since
      its content depends on `invoice()`, which the parent may already have
      nulled by the time the close animation starts.
- [x] `signature-modal.component` — same `displayedInvoice` treatment.
- [x] `signature-view-modal.component` — same `displayedInvoice` treatment.
- [x] `paywall-modal.component` — no `displayedInvoice` needed, content is
      static.
- [x] `company-essentials-modal.component` — no `displayedInvoice` needed,
      gated on a plain boolean service signal.
- [x] `send-invoice-email-modal.component` — same `displayedInvoice`
      treatment.
- [x] `create-devis-modal.component` (invoice-board) — same
      `displayedInvoice` treatment.
- [x] `invoice-due-date-modal.component` (invoice-board) — same
      `displayedInvoice` treatment.

Verified: `ng build` compiles clean, all 163 existing frontend tests still
pass (no new tests added — this codebase has no Angular TestBed component
specs at all, per [[project-front-ux-polish]]'s own note, consistent with
how `panelStretch`/`cardMorph` were verified).

**2026-08-31, live-verified via Playwright against the `make demo` stack,
one real bug found and fixed**: the user reported PDF modals opening with
"no animation" from both "Nouveau document" and "Mes documents". Checking
`panel.getAnimations()` live showed the animation *was* running the whole
time — just always the generic fallback (98%→100% scale, ~2% size change
on a ~750px-wide panel, imperceptible), never the real origin-anchored
grow. Root cause: `LastClickOriginService`'s selector
(`button, a, [role="button"], summary`) didn't match `invoice-board`'s row
click — a plain `<tr (click)="...">`, the actual trigger for
`invoice-preview-modal` — so origin capture silently failed every time and
fell back. Fixed two ways: `tr` added to the selector explicitly (the
confirmed case), and — more importantly — a click that matches *nothing*
in the selector now falls back to the exact clicked element itself
(`target.closest(SELECTOR) ?? target`) rather than capturing nothing at
all, so no future untagged clickable element can silently regress to the
same imperceptible fallback. Re-verified live after the fix: the row-click
case now shows a real non-uniform-scale FLIP growing from the row's own
rect (confirmed via the same `getAnimations()` check, screenshotted). The
"Nouveau document" PDF button case (`invoice-create-preview-step.page.html`'s
"Voir le PDF exact avant création", a real `<button>`) was independently
re-verified working correctly both before and after this fix — it was
never affected by the `<tr>` bug.

**2026-08-31, second round, the actual root cause of "still no animation" —
a real bug in `ModalMorphComponent` itself, not the origin fix above.**
The user reported the PDF still just "appearing" after ~0.5-1s with no
visible growth. The previous verification pass only checked
`panel.getAnimations()` — confirming the animation *object* existed and
its `transform` progressed — but never checked whether the panel was
actually **visible** while that happened. It wasn't:
`modal-morph.component.html` applied `[class.invisible]="!contentVisible()"`
directly to `#panel` — the exact element the FLIP transform animates.
`contentVisible` stays `false` for the whole grow animation by design (it's
meant to mask the *projected content* until the box is done growing, per
this doc's own "content never distorts" rule) — but since it was on the
wrong element, it made the **entire panel** `visibility: hidden` for the
full 550ms, popping into view at full size only once `contentVisible`
flipped true at the very end. The animation was genuinely running the
whole time, on an invisible element — indistinguishable from "no
animation" to anyone actually looking at the screen. Confirmed live by
checking `getComputedStyle(panel).visibility` frame-by-frame (not just
`getAnimations()`) — it read `"visible"` throughout after the fix, with
`rectHeight` climbing frame-by-frame from the row's own height (~89px) to
the panel's full size (~688px), then symmetrically back down on close.
**Fixed**: the `invisible` toggle now lives on a `display: contents`
wrapper *inside* `#panel`, around `<ng-content>` only — a purely visual
mask on the projected content that doesn't participate in `#panel`'s own
box model, so `#panel` itself stays visible and animating throughout while
still masking its contents until they're ready to be seen.

### Testing

- [x] The bug actually reported by the user, both rounds — see the two
      fixes above (origin-capture selector, then the real cause: the
      invisible-panel-during-growth bug). Live-verified via Playwright
      checking `getComputedStyle(panel).visibility` + real rect height
      frame-by-frame through a full open *and* close cycle, not just
      `getAnimations()`'s existence — the lesson this round: a
      `getAnimations()` check alone had already given a false "it's
      working" read once.
- [ ] Manual browser pass at phone width and desktop width for every modal
      in the checklist — not just the two PDF ones. **Not yet done.**
- [ ] `prefers-reduced-motion: reduce`: every modal opens/closes instantly,
      no stuck-mid-transition or stuck-hidden state. **Not yet done.**
- [ ] Rapid open/close (double-click the trigger, close mid-animation and
      reopen immediately) doesn't leave the panel at a wrong size/position.
      **Not yet done** — the state machine in `ModalMorphComponent` is
      designed to handle this (see its `reopening` branch), but that's a
      design intent, not a live-verified fact yet.
- [ ] A modal triggered via keyboard (Enter/Space on a focused button, no
      pointer event) falls back correctly instead of erroring on a missing
      origin. **Not yet done.**
- [ ] A modal whose trigger element scrolls off-screen or unmounts between
      the click and the modal actually opening (e.g. a slow PDF fetch — see
      `pdf-preview-modal`'s own `loading` input, which opens the modal
      before the blob arrives) still resolves to the fallback path, not a
      crash or an animation anchored to a stale/zero rect. **Not yet
      done** — note this one is only a partial fit for
      `LastClickOriginService`'s ~800ms freshness window: the origin is
      captured at click time regardless, so this scenario is really "the
      captured rect is now off-screen/stale," not "no origin was
      captured" — worth relaxing to check the origin's own real risk
      (mostly harmless, since animating from an off-screen rect just makes
      the grow start off-screen and end correctly) during the manual pass.
- [ ] Long content inside the panel (a long email form, a large signature
      canvas) doesn't break the resting-size measurement the FLIP animation
      targets. **Not yet done.**

## `buttonPress` — tactile press feedback (2026-08-31)

### Objective

Every action button in the app renders through `BigButtonComponent` (one
shared component, per its own file comment — "big buttons, click more, type
less"), and today it has no press state at all beyond the browser's default
(nothing, on most mobile WebViews). A button that doesn't visibly respond
under a finger is the single most common tell of an unpolished app; a
button that depresses instantly on touch and eases back on release is a
five-line CSS change with an outsized effect on perceived quality.

### Design decisions

- **Touch band (~120ms), not Entrance.** Pressing down must have zero
  transition delay — the visual state change and the finger's own touch
  event are the same instant, or it reads as laggy. Only the release
  (back to 100% scale) eases, over ~120ms.
- **`scale(0.97)` on `:active`/pointerdown, never on `:hover`.** This app
  is phone-first and click-not-hover throughout (design-system.md's own
  established constraint) — press feedback must trigger on true press, not
  linger from a hover state a touch device never has anyway.
- **Skipped entirely when `disabled()`** — a disabled button must not
  visually invite a press it will then ignore.
- **CSS-only** (`:active` pseudo-class + a `transition` on `transform`,
  scoped to release only via `transition-property`/timing tricks or a
  small Tailwind `active:` variant) — no JS event wiring needed, unlike
  `modalMorph`'s FLIP math which genuinely needs to measure real rects.

### Non-goals

- No haptic vibration — a separate, native-only concern (`@capacitor/
  haptics` isn't installed), not scoped here.
- No press feedback on non-button interactive elements (links, table rows)
  in this pass — `BigButtonComponent` only, since that's the one component
  every real action already funnels through.

### Rollout checklist

- [x] `BigButtonComponent`'s template: `active:scale-[0.97]`,
      `duration-[120ms]`/`active:duration-0` (instant press, eased
      release), `disabled:active:scale-100` guard.

## `actionConfirmMorph` — self-reverting action confirmation (2026-08-31)

### Objective

Three real "Copier" buttons exist today (`invoice-create-preview-step.page.html`,
`invoice-create-manual.page.html`, `subscribe.page.html`'s referral link).
**Corrected during implementation**: only `subscribe.page.html`'s actually
had a self-reverting text-swap (`referralLinkCopied`); the other two gave no
inline feedback at all, relying entirely on a success toast. A brief,
self-reverting confirmed state (checkmark accessory + a success tint) reads
as considered feedback instead of either a plain label swap or a toast at a
different screen position, and removes any "did that actually work?" doubt.

### Design decisions

- **Self-reverts on a timer (~1.6s)**, not on the next click — the artisan
  shouldn't have to interact again just to see the button return to its
  normal label.
- **Entrance band for the transition in**, timer-driven revert (not a CSS
  animation duration) for the transition out — matches how `totalPulse`
  already separates "the moment of change" (banded) from "how long the
  confirmed state visually holds" (a plain timeout).
- **No new state machine** — reuses each call site's own existing
  `xCopied`-style boolean signal (already there for the text swap); this is
  a presentation upgrade to an existing pattern, not new application state.

### Non-goals

- No generalized "toast replacement" — this is scoped to the three
  existing copy-confirmation buttons, not a new pattern for every success
  state in the app.

### Rollout checklist

- [x] `invoice-create-preview-step.page.html`'s two "Copier" buttons —
      **correction while implementing**: these two never had a text-swap
      at all, only a success toast (`toastService.success`); the toast is
      now dropped in favor of the inline confirm state (the error toast is
      unchanged, it has a real message to convey). New `copiedEmail`
      signal replaces the removed toast call.
- [x] `invoice-create-manual.page.html`'s "Copier" button — same
      toast-to-inline correction as above.
- [x] `subscribe.page.html`'s "Copier le lien" referral button — this one
      already had the `referralLinkCopied` self-reverting boolean +
      text-swap; only the checkmark icon + tint were added on top of the
      existing, unchanged 3000ms timer (longer than the ~1.6s used for the
      other two — left as-is, an intentional pre-existing difference for a
      button the artisan may be reading a link next to, not changed to
      match arbitrarily).

## `tabSwitch` — sliding tab indicator (2026-08-31)

### Objective

`signature-modal.component.html`'s "Dessiner"/"Importer une photo" tabs
today just swap `border-b-2`/`text-primary` classes instantly between the
two buttons. A sliding indicator that visibly travels from one tab to the
other is one of the most recognizable "premium native app" tells (iOS
segmented controls, most polished dashboard tab bars) and is cheap: one
absolutely-positioned element, one `transform: translateX` transition.

### Design decisions

- **Entrance band (~250ms)** — a tab switch is a frequent, small-scale
  confirmation, not a structural moment; belongs with `lineIn`, not
  `panelStretch`.
- **Scoped to `signature-modal` only for now** — the only plain
  underline-tab pattern found in the app (confirmed via grep across every
  `.html` file for `border-b-2`/`activeTab`). Not applied to the Devis/
  Facture toggle — see `stampSwitch` in
  [front-2-invoice-creation-flow.md](./front-2-invoice-creation-flow.md)
  for why that one's different.
- **A hardcoded 50%-width indicator, not a measured rect** — both tabs are
  already `flex-1` in a two-item row, which guarantees equal width by
  construction regardless of label length; measuring rects in JS would be
  solving a problem this specific markup doesn't actually have. Revisit
  with real measurement only if `tabSwitch` is ever applied to a strip with
  more than two options or unequal widths.

### Rollout checklist

- [x] `signature-modal.component` — `.tab-switch-indicator` (styles.css), a
      50%-width bar translated via `translate-x-full` when the active tab
      changes.

## `pageSlideTransition` — directional native page transitions (2026-08-31)

### Objective

Every routed page currently gets the same plain fade-up
(`.anim-page-in`, replayed by `App.replayPageEnterAnimation` on every
`NavigationEnd`) regardless of direction. On the Capacitor native shells
specifically, a directional slide (forward = new content slides in from the
right, back = slides in from the left) is what makes navigation feel like a
real native push/pop stack rather than a web page swap — the single highest
perceived-native-ness change available, per the earlier brainstorm with the
user. Left as the last item in this phase precisely because it's the
riskiest one to get wrong (touches shared routing/navigation code every
single page depends on), not because it matters least.

### Design decisions

- **`platformService.isNativeApp()`-gated** — web keeps the existing plain
  fade-up; the directional-stack metaphor is specifically a native-app
  convention, not a browser-tab one.
- **Direction determined from `NavigationStart.navigationTrigger`, not a
  route-depth comparison** — simpler than what this doc originally
  proposed (a `data: { depth: n }` per route), and implemented that way:
  `'popstate'` (browser/hardware back, an edge-swipe-back gesture, or the
  forward button) plays the back-slide; anything else (`'imperative'` — a
  real link tap or `router.navigate` call, `'hashchange'`) plays the
  forward-slide. This is a **conservative heuristic, not a true
  history-position tracker**: pressing the browser's *forward* button is
  also `'popstate'` and will incorrectly play a back-slide. Accepted
  deliberately — the overwhelmingly common real case this needs to get
  right is hardware/gesture back, and a real history-index tracker (own
  `history.state` bookkeeping, correlated across redirects) is
  meaningfully more code for a native shell where "forward button" barely
  exists as a gesture anyway. Revisit only if this specific edge case is
  ever actually reported as wrong.
- **Only the entrance animates** — the outgoing page is not kept mounted
  to animate out in parallel (that would need both pages' component trees
  alive simultaneously, a much bigger change to how routing renders here);
  this is a slide-in, not a full crossfade-both-ways transition.
- **Timing**: ~320-350ms with the existing `ease-out-sharp` curve — close
  to native iOS/Android push-transition timing, deliberately not reusing
  the Materialize band verbatim (that band was tuned for "a box changing
  size," not "a full-screen view sliding into place").

### Non-goals

- No shared-element transition between the two pages (e.g. a card
  morphing into the detail page it opened) — that's a much larger,
  separate effort or than a page-level slide; not scoped here.
- No change to the *fade*-up behavior on web — this is additive
  (native-only), not a replacement of the existing cross-platform default.

### Rollout checklist

- [x] `app.ts`: `lastNavigationTrigger` captured on `NavigationStart`,
      consumed by `pageEnterAnimationClass()` on the following
      `NavigationEnd` — no per-route config needed with this simpler
      approach.
- [x] `.anim-page-slide-forward`/`.anim-page-slide-back` keyframes
      (styles.css), plus a dedicated `--duration-page-transition: 320ms`
      custom property rather than reusing an existing band.
- [x] `replayPageEnterAnimation` now clears all three possible classes
      (`PAGE_ENTER_ANIMATION_CLASSES`) before picking the next one, since
      which one was last applied depends on that navigation's own trigger.

### Testing

- [ ] Deep-linking directly into a nested route (no "previous" route to
      compare against): `lastNavigationTrigger` is `null` on the very
      first navigation, which the `!== 'popstate'` check already routes to
      the forward-slide, not a crash — **not yet live-verified**.
- [ ] Rapid navigation (tapping through several screens quickly) doesn't
      leave two overlapping mid-transition pages visible. **Not yet done**
      — only the entrance animates (this doc's own non-goal), so the risk
      is limited to visual overlap of the *incoming* page's own animation
      restarting, not two full page trees coexisting.
- [ ] Web (`platformService.isNativeApp()` false) is completely unaffected
      — same plain fade as today. **Not yet done.**
- [ ] The known, accepted heuristic gap (browser *forward* button plays a
      back-slide) doesn't look actively broken in practice on the actual
      native shells — **not yet done**.

## Notes

- This file supersedes the old flat entry for Phase 1 in
  [ux-roadmap.md](../ux-roadmap.md), which now only points here —
  see [front/README.md](./README.md).
