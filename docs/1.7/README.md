# Phase 1.7 — Native iOS In-App Purchase (StoreKit2)

Written before any code exists, same posture as Phase 1.2/1.3/1.4/1.6 —
scope decisions recorded up front so they don't get re-litigated once
building starts. Status legend used throughout this folder: `[ ]` not
started, `[~]` in progress, `[x]` done.

## Trigger (2026-09-23)

An App Store submission failed. Two unrelated things came out of that
attempt, and only the second one is this phase's subject:

1. **A crash, already fixed, not part of this phase.** `Info.plist` was
   missing `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription`.
   Phase 1.1-1's signature modal ("Importer une photo") uses
   `<input type="file" capture="environment">`, which triggers iOS's
   camera-permission prompt — without the corresponding usage-description
   keys, iOS kills the app outright instead of showing a permission
   dialog. The keys are added (`frontend/ios/App/App/Info.plist`, already
   showing as modified in git status). **A new build still needs to be
   produced and uploaded before resubmission** — this fix alone doesn't
   get re-submitted by itself.
2. **The In-App Purchase gap — this phase.** Phase 22 deliberately kept
   iOS on Stripe-only billing: no in-app "Subscribe" button, just a link
   (`PlatformService.openWebSubscriptionPage()`, `@capacitor/browser`)
   that hands off to the system browser to complete checkout on
   facturele.net, reasoned through at the time as the guideline-3.1.1
   "external subscription, business tool" allowance (same pattern as
   Slack/Basecamp/Dropbox). That reasoning is not being re-opened here on
   its own merits — it's recorded as fact that the app still needs real
   native StoreKit2 purchases to move forward with this submission, and
   this phase plans exactly that. **If Apple's own rejection message
   named a specific guideline, paste it into this file** — it isn't
   quoted here because it wasn't provided verbatim, only the conclusion
   ("besoin d'IAP") was.

## Objective

Add native iOS In-App Purchase as a second, iOS-only path to the same
three subscription tiers Phase 30 already defines (Essentiel/Pro/
Premium), alongside — not replacing — the existing Stripe path used on
web and Android. A company's effective plan tier must resolve correctly
regardless of which storefront it subscribed through.

## Two separate tracks of work — don't conflate them

**Track A — Apple Business/App Store Connect account setup.** Not code,
not something this session (or any Claude Code session) can do: it needs
the account holder's real legal identity and banking/tax details.
Blocking, sequenced first. See [1.7-1](./1.7-1-app-store-connect-prerequisites.md).

**Track B — the actual implementation**: StoreKit2 purchase flow on the
frontend, purchase verification + Server Notifications V2 on the backend,
conditional UI swapping Phase 22's link-out for real purchase buttons on
iOS only. Multi-day, but entirely doable from here once Track A unblocks
product creation. See 1.7-2 and 1.7-3.

Track B's *code* can mostly be written in parallel with Track A finishing
(the plan, the schema, the plugin wiring, the DTOs) — only the final
step, wiring in real product ids and the App Store Server API key, needs
Track A done. Track B's *on-device verification* (the actual purchase
sheet, sandbox testing) needs a real Mac/Xcode session and cannot be
exercised from here at all — see the caveat in 1.7-3.

## Phase index

| Phase | Title | Depends on | Status |
|---|---|---|---|
| [1.7-1](./1.7-1-app-store-connect-prerequisites.md) | App Store Connect: Paid Apps Agreement, Subscription Group & Products | — (user-only, external) | `[x]` — except sandbox tester + numeric App Store ID |
| [1.7-2](./1.7-2-backend-apple-purchase-verification.md) | Backend: Apple Purchase Verification & Server Notifications V2 | 1.7-1 (for real product ids/keys; code built ahead of it) | `[x]` code + tests, `[ ]` live-verified |
| [1.7-3](./1.7-3-frontend-storekit-purchase-flow.md) | Frontend: Native StoreKit2 Purchase Flow, Restore, Conditional UI | 1.7-2 | `[x]` code, `[ ]` Xcode/device-verified |

**Update (2026-09-23)**: Open Decision 1 below is resolved — **build it
in-house against Apple's own `@apple/app-store-server-library`**, not
RevenueCat, confirmed directly with the user. 1.7-2 and 1.7-3 are both
implemented (uncommitted) on that basis; see each phase's own "What
shipped" section for the real file list.

**Update (2026-09-28)**: 1.7-1 is done (user's own App Store Connect
work, via their Claude Cowork session) except the sandbox tester and the
numeric App Store ID — see that phase's own updated status. Real
credentials (Key ID, Issuer ID, `.p8`, the 3 real product ids) are now
live in both `backend/.env` and `infra/.env`. Running
`AppleServerClientService` against them caught one real bug before it
ever hit production (`APPLE_APP_ID` was wrongly treated as optional and
would have crashed the app's boot without it — fixed, see 1.7-2's own
update note). Everything is still unverified against live Apple
infrastructure/Xcode — blocked on the numeric App Store ID for the
backend side, and on a Mac/Xcode for the native plugin, neither available
in this environment.

## Open decisions — confirm with the user before 1.7-2 starts writing code

**Resolved 2026-09-23 (decision 1 below): build it in-house.** The user
chose Apple's own `@apple/app-store-server-library` over RevenueCat when
asked directly. Decisions 2 and 3 were applied as recommended (not
separately re-confirmed) since they're reversible implementation details,
not vendor/cost commitments — flag if either should have been asked
explicitly instead.

1. **Buy vs. build the receipt-validation/entitlement layer.**
   - **Option A — RevenueCat** (or a similar wrapper, e.g. Glassfy):
     handles receipt validation, the Server Notifications V2 webhook, and
     cross-device entitlement resolution for you; ships a Capacitor
     plugin (`@capgo/capacitor-purchases` wraps it) so the native side is
     close to off-the-shelf. Free up to $2.5k/mo tracked revenue, 1%
     after. Cuts 1.7-2's scope roughly in half — no hand-rolled JWS
     verification, no notification-signature checking.
   - **Option B — Apple's own `@apple/app-store-server-library`**
     (official, free, no revenue share): this repo's own precedent leans
     this way — Sign in with Apple (Phase 1.5) chose a purpose-built
     library (`apple-signin-auth`) over a wrapper service for the same
     kind of Apple-crypto verification, and Phase 17.5's Resend choice
     shows the opposite instinct (buy commodity infra) is also in active
     use here when the thing being bought isn't core product logic.
     Receipt validation is genuinely commodity infra, not something
     FactureLe differentiates on the way Factur-X generation or PA
     integration does — that argues for Option A. But Option A also means
     a second `Company`-identifying id from a *third* vendor
     (RevenueCat's own customer id, on top of `stripeCustomerId` and
     whatever Apple-side id gets stored) and a dependency this app has
     zero other footprint with.
   - **Recommendation: Option A (RevenueCat)** for the reason above —
     this is undifferentiated heavy lifting, the free tier almost
     certainly covers this app's iOS subscriber volume for a long time,
     and it directly shrinks the "multi-day chantier" this phase exists
     to scope down. Not yet confirmed with the user — **flag this choice
     explicitly before starting 1.7-2**, since it changes that phase's
     shape substantially (verification-only vs. building the JWS/webhook
     pipeline by hand).
2. **Whether a company can hold both a Stripe and an Apple subscription
   at once.** Recommendation: don't hard-block it, just extend
   `getEffectivePlanTier`'s existing "higher wins" rule (Phase 30) to a
   third source — same permissive spirit as grant-stacking never
   downgrading. See [1.7-2](./1.7-2-backend-apple-purchase-verification.md).
3. **Whether `PaywallModalComponent`/`TrialOfferModalComponent`'s
   existing `openWebSubscriptionPage()` iOS branch (Phase 22) gets
   replaced with real purchase buttons too, or only `subscribe.page.ts`
   does.** Recommendation: all three, for consistency — a paywall that
   still links out to Safari once real in-app purchase exists would be a
   confusing regression. See [1.7-3](./1.7-3-frontend-storekit-purchase-flow.md).

## Non-goals

- **No Android/Play Store Billing work.** Phase 22 already established
  Google Play tolerates the external-link pattern, and nothing here
  changes that — Android keeps Stripe, unchanged.
- **No migration of existing Stripe subscribers onto Apple.** The two
  billing sources coexist; nobody already subscribed via Stripe is moved.
- **No change to the Essentiel/Pro/Premium feature/cap matrix itself**
  (Phase 30's table is unchanged) — this phase only adds a second
  purchase path to the same three tiers. Apple's own price-tier system
  may not let the € prices land on the exact same numbers as Stripe's;
  that's an App Store Connect configuration detail (1.7-1), not a
  product-scope change.
- **No attempt to make FactureLe the VAT merchant of record for iOS
  purchases.** Apple is the merchant of record for IAP (it invoices the
  end customer and remits VAT itself) — materially different from
  Stripe, where FactureLe is the merchant of record. Worth being aware of
  for accounting, not something to build around.

## Notes

- Depends on Phase 14/30 (the tiers and `PlanGateService`/
  `getEffectivePlanTier` this extends), Phase 22 (the iOS billing
  constraint and `PlatformService` this phase's frontend work builds on
  top of and partially supersedes), and Phase 1.5 (the closest precedent
  for "native Apple-crypto verification built by Claude Code without a
  Mac in this environment," including its own honest "not yet verified
  on a real device" caveat — expect the same caveat here, probably more
  acutely since a purchase sheet cannot be driven headlessly at all, see
  1.7-3).
- Numbered 1.7 to continue the 1.1–1.6 sub-track sequence (docs/roadmap.md
  has moved past the original Phase 1–33 numbering; see Phase 1.1-1's own
  numbering note).
