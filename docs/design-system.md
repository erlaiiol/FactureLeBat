# Design System

This document records the visual identity decisions for FactureLeBat: palette, typography, the line-badge motif, and the motion principles. It is the "what we chose and why" companion to the roadmap — see [roadmap.md](roadmap.md) for the features these choices apply to (Phases 5–9 in particular).

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
- **Shape rule:** semantic badges are straight rectangles, small radius, no rotation. The tilted, stamped look is reserved for the Phase 5 line-marking badge specifically — mixing the two motifs would dilute what makes the marking badge distinctive.

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

Motion exists to confirm a real action, never as decoration. Two duration bands cover almost everything:

| Band | Duration | Easing | Used for |
|---|---|---|---|
| Entrance | ~250ms | `cubic-bezier(.2,.8,.2,1)` (sharp ease-out) | A new invoice line appearing, a tour step sliding in |
| Emphasis | ~400ms | same ease-out | The total pulsing/flashing accent color when it changes, so an increment is felt, not just read |

Named effects to implement (prototyped in the design-comparison artifact):

- **`lineIn`** — fade + slight upward slide (8px) + scale from 97%. Applied when a product/service line is added to an invoice.
- **`totalPulse`** — brief scale-up (112%) with a flash to `accent` color, back to rest. Applied whenever the visible total changes — ties directly into the Phase 5/6 requirement that the total always visibly increments.
- **`badgeStamp`** — scale-in from 40% with a slight overshoot and rotation settle, evoking a stamp being applied. Applied when the redistribution badge first appears on a line.
- **Tour step transitions** — directional slide + fade between steps (forward = slide from right).
- **Tour completion — the one deliberate "reward" moment** — a checkmark that draws itself (`stroke-dashoffset` animation) plus a brief soft glow around the card, on finishing the guided tour. This is the single place the app is allowed to feel a little celebratory; everywhere else stays calm on purpose, so this moment isn't diluted by scattered animation elsewhere.

Rules that apply everywhere:

- Every animation is disabled (reduced to ~0) under `prefers-reduced-motion: reduce`.
- No animation runs without a real, corresponding state change — no idle/ambient motion, no animated illustrations.
- One easing curve, one small set of durations — not a per-component custom timing.

## Status

Both palettes and the type scale are implemented as Tailwind v4 `@theme` tokens in `frontend/src/styles.css`, including a dark-mode variant of "Chantier calibré" ("Atelier sobre" stays a light-only, accent-only treatment, per its own "where it's allowed to appear" list above). "Atelier sobre" has a fourth spot as of Phase 13.3: the public landing page (`features/landing/`).
