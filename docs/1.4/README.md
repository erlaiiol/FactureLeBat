# Phase 1.4 — Voice/Chat Invoice & Devis Creation

**Status: 1.4-1 done, 1.4-2 built and live-verified for the core flow,
1.4-3 built and compilation-verified (2026-08-29).** Planning
track, written up front the same way Phase 1.2/1.3 ended up documented, so
the scope decisions below don't have to be re-litigated once someone
actually picks this up. Status legend used throughout this folder: `[ ]`
not started, `[~]` in progress, `[x]` done.

## Objective

Let an artisan create a devis or facture by describing it in natural
French — voice or typed — instead of using mode rapide's form or mode
manuel's canvas: *"fais moi une facture pour xavier dupont je mets 25m2 de
parquet chêne massif et je lui demande un acompte de 30%"* should produce a
pre-filled draft, one review pass away from the existing PDF preview step
(Phase 15's mode rapide preview) and done. That review pass — client at
top, lines below, doubtful fields highlighted inline for a quick fix — is
this track's one new screen; see [1.4-2](./1.4-2-voice-entry-point-frontend.md#voice-review-screen--design)
for its exact design. Everything past that screen (the preview step, the
success page) is Phase 15's, untouched.

## Scope decisions confirmed with the user (2026-08-29)

- **Continuous dictation, not slot-by-slot chat.** The artisan says the
  whole thing in one go; the system doesn't interview them field by field
  the way a form would. Clarification is the exception path, triggered
  only when something is genuinely missing or ambiguous — not the default
  interaction style. This is the same "autofill, not friction" posture the
  rest of the app already applies to prefills (deposit %, product
  descriptions).
- **An article with no catalog match gets flagged for review, never
  silently priced.** The draft still renders — no blocking chat — but a
  line with no confident price shows up highlighted with "vérifiez ce
  champ s'il vous plaît" for the artisan to fill in on the review screen
  (1.4-2), rather than the system inserting a €0 placeholder or guessing
  the nearest catalog item. A facture is a legal document; a wrong
  invented price is worse than one flagged field.
- **Customer/product/service resolution gets a dedicated fuzzy
  (trigram) search, scoped to this feature only** — the app's existing
  `GET /customers`/`/products`/`/services` stay plain-substring, per
  `roadmap.md`'s existing note that fuzzy matching there is a deliberate
  non-goal until real usage shows it's needed. Voice transcription
  produces more spelling variance than typed search ever does, so this
  entry point specifically needs the tolerance the rest of the app doesn't.
- **Neither resolution engine ever computes money.** Whichever one runs
  resolves *references* (which customer, which product, what quantity,
  what deposit %); every `unitPriceCents` on the resulting draft traces
  back to a real `Product`/`Service` snapshot or an amount the artisan
  explicitly stated. Totals are still computed exclusively by
  `InvoiceCalculationService`, same as every other entry point — this
  track adds no new financial math.
- **A free, no-config regex/fuzzy-search engine is the primary method —
  not an LLM, at least for now (decided 2026-08-29).** An invoicing app
  shouldn't require an artisan to pay for an LLM subscription just to use
  a core feature. 1.4-1 ships two interchangeable resolution engines
  behind one interface; the free one is bound by default and is what every
  deployment actually runs. An LLM-backed engine exists fully built and
  tested but stays unbound ("dormant") until there's a real reason to
  re-enable it — as a fallback, or as a genuine Premium-tier upgrade (this
  app already has `PlanGateService` for exactly that kind of tiering). See
  [1.4-1](./1.4-1-nlu-draft-backend.md)'s third revision note for the full
  reasoning and [its Approach section](./1.4-1-nlu-draft-backend.md#approach)
  for how the two engines share the same output contract.

## Phase index

| Phase | Title | Depends on | Status |
|---|---|---|---|
| [1.4-1](./1.4-1-nlu-draft-backend.md) | Backend: NLU Draft Resolution & Fuzzy Catalog Search | Phase 15, Phase 1.1-3 | `[x]` |
| [1.4-2](./1.4-2-voice-entry-point-frontend.md) | Frontend: Voice/Chat Entry Point on Invoice Creation | 1.4-1 | `[~]` |
| [1.4-3](./1.4-3-native-speech-recognition.md) | Native Speech Recognition (Capacitor) | 1.4-2 | `[x]` |

## Non-goals — for the track as a whole

- **No voice control beyond creating a devis/facture.** Not in scope:
  editing an existing invoice by voice, sending/transmitting by voice,
  navigating the app by voice. Creation-only, matching what was actually
  asked for.
- **No new preview/PDF UI.** The one new screen this track adds is the
  review pass (1.4-2) — built from mode rapide's/mode manuel's existing
  components, not from scratch — and it still hands off to the preview
  step and success page Phase 15 already has, untouched.
- **No fuzzy-search upgrade to the app's existing list/search endpoints.**
  Deliberately scoped to this feature's own resolution calls — see the
  scope decision above.
- **No persisted transcript history.** The transcript is used once, to
  produce the draft, and isn't stored anywhere afterward — no voice-command
  audit log in this phase.
- **French only.** No multi-language detection or support.

## Open question, not yet decided with the user

Whether browser-native speech recognition (Web Speech API — free, but
patchy French accuracy and no Safari support) is good enough to ship with,
or whether it's worth the added cost/latency of a proper STT (e.g. Whisper)
behind the same endpoint from day one. Flagged in
[1.4-2](./1.4-2-voice-entry-point-frontend.md) rather than decided here —
the transcript → draft resolution in 1.4-1 doesn't care which produced the
text, so this can be decided (or changed later) without touching 1.4-1 at
all. [1.4-3](./1.4-3-native-speech-recognition.md) is a third option
alongside these two, scoped to the compiled native app specifically (where
Web Speech API's "no Safari support" gap means no capture at all, not just
weaker capture) — built (2026-08-29), see its own doc for what shipped.

## Cross-references

- Reuses Phase 15's mode rapide preview step and `InvoiceDraftStore`
  (`frontend/src/app/features/invoice-create/invoice-draft.store.ts`)
  unchanged — this track only ever populates it, never bypasses it.
- Reuses `InvoiceCalculationService` for all totals — see the scope
  decision above.
- Builds on Phase 1.1-3 (Acompte) for deposit semantics, including its
  FACTURE-only rule, which this track's review-flagging logic must respect
  (flag the conflict) rather than silently work around.
