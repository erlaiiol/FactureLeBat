# Phase 1.3 — E-Invoicing Workflow Automation & Customization

**Status: all seven phases shipped (2026-08-24/25).** Detailed track for
Phase 1.3, moved out of `docs/roadmap.md` on 2026-08-25 so this track's
full detail (seven phases, granular checklists) doesn't have to be
re-read in full just to recall that Phase 1.3 exists. `docs/roadmap.md`
keeps a short pointer to this folder — read that first for where 1.3 sits
relative to the rest of the app, come here only when actually working on
it or looking up a past decision.

Status legend used throughout this folder: `[ ]` not started, `[~]` in
progress, `[x]` done.

## Objective

Phase 1.2 (`docs/roadmap.md`) built a fully-manual e-invoicing pipeline:
Factur-X generation, PA transmission, and reception sync each require an
explicit click. A 2026-08-25 workflow review — asked directly, "is this
effortless for an artisan who just wants to be compliant and look
professional, regardless of their trade?" — found the honest answer was no:

- Connecting a PA is real admin the app doesn't guide anyone through.
- Transmission and reception both need a manual action per invoice.
- A FACTURE emailed to a client is the plain PDF unless the artisan
  discovers the separate Factur-X button.
- The reform's own deadlines are only visible on a settings page nobody
  visits unprompted.

This track closes that gap by letting each artisan choose how hands-off they
want to be — from today's click-everything default up to "create the
invoice, everything else happens on its own" — without deleting the manual
pipeline or forcing automation on anyone who doesn't want it.

## Scope decisions confirmed with the user (2026-08-25)

- **Automatic PA transmission uses a delayed send with a cancellation
  window, not an instant one.** An artisan opting into automation still gets
  a short grace period to catch a mistake before an invoice actually reaches
  a third party/the tax administration's channel — chosen over instant
  auto-send specifically for that safety margin, even though it's the more
  involved implementation (a persisted, restart-safe scheduled sweep rather
  than a synchronous hook). See [1.3-3](./1.3-3-delayed-auto-transmit.md).
- **Every automation in this track defaults OFF.** No existing company's
  behavior changes unless they explicitly opt in — same
  "boots/behaves identically until you touch it" posture Phase 1.2 already
  applied to SUPER PDP itself being unconfigured.
- **Additional gap flagged by the user, same day**: automation alone isn't
  enough — once transmission/reception can happen without a click, the
  artisan needs a place that keeps *confirming* it's actually working, not
  just trust running quietly in the background. Phase 17's existing
  "Mon activité" (Activity Analytics) is the one place this app already
  reports on the business at a glance; [1.3-6](./1.3-6-activity-analytics-metrics.md)
  extends it with e-invoicing metrics rather than leaving that status only
  reachable via a reminder push (transient) or a settings page (easy to
  never revisit).
- **A third gap flagged by the user (2026-08-25, later the same day)**:
  none of the above actually *explains* the reform to the artisan —
  deadlines and status are visible, but not what the obligations actually
  are, whether a third-party platform is really required (yes — see
  [1.3-7](./1.3-7-compliance-explainer.md)'s own research), or how this
  relates to their separate URSSAF declaration. 1.3-7 adds a compliance
  explainer to close that gap, placed in company settings (not Activity
  Analytics) since that's where the actual controls live — an artisan
  reading "here's what to do" right next to the button that does it, not
  in a separate tab.

## Phase index

| Phase | Title | Depends on | Status |
|---|---|---|---|
| [1.3-1](./1.3-1-workflow-preferences.md) | Workflow Preferences: Settings Model & Customizable Controls | Phase 1.2 | `[x]` |
| [1.3-2](./1.3-2-auto-facturx-email.md) | Automatic Factur-X Attachment on Email Send | 1.3-1 | `[x]` |
| [1.3-3](./1.3-3-delayed-auto-transmit.md) | Delayed Automatic PA Transmission | 1.3-1, Phase 1.2-4 | `[x]` |
| [1.3-4](./1.3-4-auto-reception-sync.md) | Automatic Reception Sync | 1.3-1, Phase 1.2-5 | `[x]` |
| [1.3-5](./1.3-5-reminders-deadline-visibility.md) | Non-Transmitted Reminders & Deadline Visibility | 1.3-3 | `[x]` |
| [1.3-6](./1.3-6-activity-analytics-metrics.md) | E-Invoicing Metrics in Activity Analytics | Phase 1.2-4/1.2-5 | `[x]` |
| [1.3-7](./1.3-7-compliance-explainer.md) | Compliance Explainer: Obligations & What To Do in FactureLe | Phase 1.2-6 | `[x]` |

1.3-2 through 1.3-7 can be built in any order once 1.3-1 exists, except
1.3-5 which wants 1.3-3 shipped first (see its own Notes) — the numbering is
a suggested build order, not a hard chain beyond what each phase's own
"Depends on" says.

## Non-goals — for the track as a whole

- **No fully autonomous "never involve the artisan" mode that removes the
  manual pipeline.** Every automatic mode stays opt-in, reversible, and
  visible in the UI about what it's about to do (or just did) — this track
  is about skipping clicks, not hiding the process.
- **No per-document override of the company-wide preference.** A company
  picks a mode and it applies uniformly to every invoice; "automatic except
  for this one" is a real future need if it comes up, but not scoped in
  speculatively here.
- **No configurable grace-period duration in 1.3-3** — one fixed value for
  every company that opts in, not a setting; see that phase's own
  non-goals.

## Full-track review pass (2026-08-25, requested explicitly by the user after all 7 phases shipped)

Read back through every phase's actual current code (not just the docs) specifically for bugs and CSS overlap. Two real issues found and fixed:

- **CSS overlap bug in `DeadlineBannerComponent`** (used on the invoice board, 1.3-5): the reception/emission pair used `grid sm:grid-cols-2`, which keeps its two fixed-width tracks even when only one banner is actually shown — the far more common case, since the two deadlines are 373 days apart. A lone reception banner sat stuck at half the row's width with a dead empty gap beside it, confirmed via a live screenshot before the fix. Switched to `flex sm:flex-row` with `flex-1` on each banner: flexbox redistributes the row's full width across however many children actually exist, so one banner alone now correctly fills the whole row, and two together still split it evenly. Re-verified live after the fix (banner now spans the full content width) and in dark mode/mobile — no regression.
- **Confusing French phrasing in 1.3-7's compliance explainer**: "le portail public de l'administration (PPF) n'est plus qu'un annuaire depuis 2024, plus un canal d'envoi" chained two unrelated "ne...plus" negations into one dangling, hard-to-parse sentence. Rewritten as "n'est plus, depuis 2024, qu'un annuaire — il ne sert plus à transmettre les factures," which is unambiguous. This is user-facing regulatory content where clarity actually matters, not cosmetic copy.

Also reviewed and found already correct, not touched: the cross-phase invariant that `Invoice.scheduledTransmitAt` and a `REJECTED` transmission status can never coexist (verified by tracing every code path that sets either); that a stale `autoTransmitViaPa`/`autoSyncReceivedInvoices` toggle left `true` after a disconnect can't cause incorrect behavior, since both cron paths (1.3-3/1.3-4) independently re-check live connection state rather than trusting the toggle value alone; the invoice-board actions dropdown's viewport-aware flip/max-height logic (Phase 1.2's own bug-check pass) still holds generically regardless of how many conditional items 1.3-3 added to it; dark mode and mobile-width rendering of every new 1.3/13.6 UI surface (deadline banner, compliance explainer, Activity Analytics compliance card, landing page badge/pillar).

## Demo seed audit (2026-08-25, follow-up: "does `make demo` cover any of this?")

Asked directly whether `backend/prisma/seed-demo.ts` reflected Phase 1.2/1.3 at all — it didn't, and auditing it surfaced a real, more severe pre-existing bug along the way:

- **Factur-X-breaking regression, not new to 1.3**: Bâti Rénov (`LegalStatus.COMPANY`, 20% VAT → Factur-X category "S") had a `vatNumber` set only via a live `psql` patch on the running demo container from earlier Phase 1.2 verification — never written back into the seed script. Since `make demo-down` destroys the DB volume, every fresh `make demo` silently regressed this back to `null`, and BR-S-02 hard-requires a seller VAT number for category "S" — verified live (nulled it → `GET /invoices/:id/facturx` 422s "ne respecte pas le schéma Factur-X"; restored it → 200 with a valid PDF) before fixing. Now set directly in `seedArtisanBatiment`'s company object, with a full fresh `make demo-down && make demo` re-verified to produce a working Factur-X download with zero manual patching.
- **Added, scoped to what's safe to fake**: `autoAttachFacturX: true` on Bâti Rénov (zero external dependency, so genuinely functional in the demo); five FACTUREs given varied `eInvoiceTransmissionStatus` values (`ACCEPTED`/`REJECTED`/`SENT`/`VALIDATED`/left at default `NOT_SENT`) to show the full status range without any live PA call; three `ReceivedInvoice` rows on Bâti Rénov for the reception inbox.
- **Deliberately not added**: a seeded "connected to SUPER PDP" state (`superPdpConnectedAt`) or `autoTransmitViaPa`/`autoSyncReceivedInvoices` turned on. Traced why this is actually safe in *this* environment — `SuperPdpClientService`'s every HTTP-hitting method calls `requireConfigured()` first and throws synchronously before any network attempt when `SUPERPDP_CLIENT_ID`/`SECRET` are unset (true here, and true by the `.env.example`-documented default) — but chose not to rely on that for a persistent seed, since a deployment of this same demo with real sandbox credentials configured would turn a cosmetic "connected" seed into a genuine OAuth call using a garbage refresh token. Also `CompanyService.sanitizeWorkflowPreferences` already treats `autoTransmitViaPa`/`autoSyncReceivedInvoices=true` without a real connection as an invalid state on any real update — seeding that exact combination would contradict the app's own invariant. The "connected" branch of the UI (deadline-banner cross-links, the e-invoicing snapshot's connected-state metrics, the reminder digest's unsent-e-invoice bucket, all gated on `superPdpConnectedAt: { not: null }`) remains reachable the same way it's been verified all through this track: a temporary live `psql` patch, reverted after.

## Cross-references

- Builds on Phase 1.2 (`docs/roadmap.md`) — every phase here calls existing
  1.2 services (`FacturXService`, `EInvoiceTransmissionService`,
  `ReceivedInvoiceService`) unchanged, never replaces them.
- Reuses the existing push-notification digest
  (`backend/src/push-notification/reminder-cron.service.ts`) rather than
  building new notification infrastructure — see 1.3-5.
- Extends Phase 17's "Mon activité" (Activity Analytics) rather than adding
  a new screen — see 1.3-6.
