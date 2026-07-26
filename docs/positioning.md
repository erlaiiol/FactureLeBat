# Product Positioning & Landing Page Messaging

This document records the messaging/positioning decisions for FactureLe's public-facing, logged-out site: what the product actually promises, to whom, and the language used to say it. It is the "what we say and why" companion to the roadmap — see [roadmap.md](roadmap.md) Phase 13.3 for the landing page this messaging drives, the same relationship [design-system.md](design-system.md) has to Phase 9.

## Who this is for

Construction artisans and independent contractors (see roadmap.md's Product Vision) — flooring installers first, broader trades over time. This is the primary, most obvious target and the one the landing page speaks to directly; the product itself is scaling beyond this niche (see roadmap.md), but the pitch below stays artisan-specific because a landing page that tries to speak to everyone convinces no one. Not technical, judged on a job site rather than at a desk: the pitch has to land in a few seconds of scrolling on a phone, standing in a van between two appointments.

## The core promise

The single idea the landing page exists to communicate:

> **Le système de facturation le plus simple, le plus rapide.**
> Configurez une seule fois votre environnement de travail — clients, produits, services — puis construisez vos devis et vos factures en un clic.
> Fini les allers-retours : vous êtes chez le client, vous lui présentez le prix aussitôt, avec le détail de votre prestation selon vos propres critères.

Three claims are load-bearing here, and the page should be able to prove each one, not just assert it:

1. **Configured once, reused forever** — the client/product/service catalog (Phases 2/3/5) is what makes everything downstream a click instead of typing.
2. **One click to a real price** — the direct promise of Phase 11 (catalog-driven invoicing) and Phase 13.5 (card-based picker + one-click line activation).
3. **On-site, in front of the client, immediately** — the moment this product is actually used: no "I'll send you a quote later," the artisan closes the loop while standing in front of the person paying.

A fourth claim underlies all three, and it's the one the app has to keep proving after the sale rather than just at signup: **the more you use it, the faster it gets, and nothing falls through the cracks afterward.** Every client, product, or prestation saved today is one less thing to type on the next chantier — and once a devis or facture is saved, it lives in "Mes documents" where its payment status and any relance are tracked (Phase 16's board), instead of quietly going stale in an inbox. Phase 18's reworked guided tour says this explicitly, on-app, at the exact moment it becomes true (first client saved, first line added) — the landing page should say the same thing once, up front, rather than leaving it implicit in "configured once, reused forever."

## Messaging pillars (for CTA/section copy)

- **Vitesse** — devis et factures en un clic, pas de ressaisie.
- **Environnement configuré** — vos clients, vos produits, vos services, une bonne fois pour toutes.
- **Confiance sur le chantier** — le prix s'affiche devant le client, tout de suite, pas de rendez-vous supplémentaire.
- **Contrôle du détail** — vous choisissez ce qui apparaît sur la facture, selon vos propres critères (cross-references Phase 15's per-field show/hide).
- **Rien ne se perd** — chaque devis et chaque facture reste suivi jusqu'au paiement, relances comprises (Phase 16) — pas de client oublié, pas d'impayé qui traîne.

## Primary CTA

"Créer mon compte" / "Essayer gratuitement" — leads directly into Phase 13's signup flow. No secondary CTA competing for attention above the fold; a craftsman scrolling on a phone should have exactly one obvious next action.

## Tone and visual identity

The landing page is the application *talking about* the artisan's business, not asking them to enter numbers quickly — the same situation [design-system.md](design-system.md) already carved out "Atelier sobre" for (used at the invoice PDF header, the guided tour, and "Mon activité" settings). Phase 13.3 confirmed the public site as that identity's fourth spot, rather than reusing "Chantier calibré" (which was explicitly optimized for fast, dense data entry — the opposite job a landing page has to do). CTA buttons are the one deliberate exception, in `bg-primary` (the "Chantier calibré" accent) so the actionable element pops and matches the button the artisan clicks everywhere else once signed up.

## What this page is not

- Not a pricing page — no tiers exist to describe before Phase 14 (Stripe) defines them.
- Not a blog or content-marketing surface — one well-crafted landing page, not a CMS.
- Not a place to over-promise reliability the product can't back up, matching the same honesty principle already applied to Phase 10 (sourcing) and Phase 12 (mail delivery): claims here should stay provable by the product as it exists, not aspirational.
