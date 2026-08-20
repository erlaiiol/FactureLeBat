import { TourId } from '../../core/models/onboarding.model';

// Symbolic runtime condition a step can be gated on — TourService resolves
// the actual boolean against live app state (see TourService.evaluateShowIf).
// Keeps tour-definitions.ts purely declarative: it names *what* to check,
// never *how*.
export type TourStepCondition =
  | 'noCustomers'
  | 'hasCustomers'
  | 'noProducts'
  | 'hasProducts'
  | 'noServices'
  | 'hasServices'
  | 'noFolders'
  | 'hasFolders'
  | 'noDiscounts'
  | 'hasDiscounts';

export interface TourStepDefinition {
  // A stable name other steps can jump to via `next`/`nextByAnchor`. Only
  // needed on a step that's an actual jump target.
  id?: string;
  // Absent on a centered welcome/completion step — see tour-position.util.ts.
  anchorId?: string;
  // Other anchors that also satisfy/advance THIS SAME step — e.g. "add a
  // product" and "add a service" are one logical step reacting to whichever
  // button the artisan actually presses. Spotlighting still only ever
  // follows `anchorId` (the primary one); these are extra advanceOn targets.
  altAnchorIds?: string[];
  // Present only when this step lives on a different route than the
  // previous one (e.g. the invoice-creation tour moving from the client
  // step to the lignes step).
  route?: string;
  // When set, doing the thing the step describes — clicking the anchor, or
  // typing into it — advances the tour by itself, same as pressing
  // "Suivant" (see TourOverlayComponent). Only makes sense for a step whose
  // anchor is a same-page action (a button, a search field): a step whose
  // anchor click causes real navigation doesn't need this — TourService's
  // own route-matching already carries the tour forward in that case.
  advanceOn?: 'click' | 'input';
  // Only shown when this condition holds — evaluated the same way a missing
  // anchor is: false means "skip straight to the next step", never a stall.
  // Lets two steps declare themselves as alternatives for the same moment in
  // the tour (e.g. "no clients yet" vs. "pick an existing client") without
  // an if/else living outside this file.
  showIf?: TourStepCondition;
  // Which step's `id` to jump to instead of the plain next array index.
  // Rarely needed — mainly to skip over another branch's steps once this
  // one's own path is done (see the service-margin/product-quantity split
  // below).
  next?: string;
  // Same idea as `next`, but keyed by which anchor actually fired the
  // advance (see altAnchorIds) — lets one logical step branch into two
  // different explanations depending on which button the artisan pressed.
  // Falls back to `next` (then the plain next index) when the id that fired
  // isn't a key here.
  nextByAnchor?: Record<string, string>;
  // Reuses the tour-completion checkmark+glow (docs/design-system.md's one
  // sanctioned "reward" moment) on a step that ISN'T the tour's last one —
  // for a moment that's earned mid-tour, like a first client/product/
  // prestation/document actually landing in the database, rather than
  // introducing a second, competing celebratory effect.
  celebrate?: boolean;
  // 'auto' (default): position near the anchor, per tour-position.util.ts's
  // below/above-with-flip math. 'corner': pin the popover to the viewport's
  // bottom-right corner instead, independent of the anchor's rect — for a
  // step whose small anchor (a button) opens something much bigger right
  // next to it (see 'add-line' below), where the default math has no way to
  // know about that bigger element and ends up placing the popover right on
  // top of the clicks the step is asking for.
  popoverPlacement?: 'auto' | 'corner';
  title: string;
  body: string;
}

export interface TourDefinition {
  id: TourId;
  steps: TourStepDefinition[];
}

// Phase 8 onboarding tour: the three mini-tours, one per main workflow.
// Declarative on purpose — TourService only ever walks this data, it never
// hardcodes step content.
export const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  'invoice-creation': {
    id: 'invoice-creation',
    steps: [
      {
        title: 'Bienvenue sur FactureLe !',
        body: 'Créons votre première facture ensemble, étape par étape.',
      },
      {
        anchorId: 'invoice-devis-facture-toggle',
        title: 'Devis ou facture ?',
        body: "C'est le premier choix à faire à chaque nouveau document. Un devis se convertit ensuite en facture identique en un clic, une fois accepté par le client — inutile de tout ressaisir.",
      },
      {
        anchorId: 'invoice-mode-choice',
        title: 'Deux façons de facturer',
        body: 'Le mode rapide (recommandé) vous guide pas à pas. Le mode manuel ouvre un tableau libre, à remplir comme sur la facture finale. Cliquez sur celui que vous préférez, ou laissez-vous guider en mode rapide avec "Suivant".',
      },
      // Two alternatives for the same moment — whichever matches the real
      // state of the customer list, the other is skipped automatically (see
      // TourService.advanceToStep's showIf check), no branching logic needed
      // outside this file.
      {
        showIf: 'noCustomers',
        route: '/factures/nouvelle/rapide/client',
        anchorId: 'invoice-new-customer-button',
        advanceOn: 'click',
        title: 'Créez votre premier client',
        body: "Aucun client enregistré pour l'instant : cliquez ici pour en créer un, pas à pas.",
      },
      {
        showIf: 'noCustomers',
        anchorId: 'invoice-customer-picker',
        title: 'Ses informations',
        body: 'Le nom et ses coordonnées suffisent, pas besoin de tout remplir. Une fois enregistré, ce client sera réutilisable sur toutes vos prochaines factures — plus jamais besoin de ressaisir ses coordonnées.',
      },
      {
        showIf: 'hasCustomers',
        route: '/factures/nouvelle/rapide/client',
        anchorId: 'invoice-customer-picker',
        title: 'Choisissez votre client',
        body: 'Sélectionnez un client déjà enregistré, ou créez-en un nouveau en un clic — il sera lui aussi réutilisable pour vos prochaines factures.',
      },
      {
        id: 'add-line',
        route: '/factures/nouvelle/rapide/lignes',
        anchorId: 'invoice-add-product-button',
        altAnchorIds: ['invoice-add-service-button'],
        advanceOn: 'click',
        nextByAnchor: {
          'invoice-add-product-button': 'product-pick',
          'invoice-add-service-button': 'service-margin',
        },
        // The default anchor-relative placement only knows about the small
        // "+" button, not the tall catalog flyout it opens right beside
        // it — left on 'auto' it ends up sitting on top of the very
        // product/prestation rows the artisan needs to click next.
        popoverPlacement: 'corner',
        title: 'Ajoutez un matériau, un produit ou une prestation',
        body: 'Le bouton orange ouvre votre catalogue de produits, le bleu celui de vos prestations (main-d’œuvre, forfait, déplacement…). Cliquez sur celui qu’il vous faut : vous pourrez toujours utiliser l’autre juste après.',
      },
      {
        // Mirrors 'service-margin' below: the click that opens the flyout
        // only reveals a catalog picker, not yet the quantity field —
        // spotlighting the *button* for this moment (like the old single
        // 'product-quantity' step used to) left the actual flyout (its
        // catalog list, its "+ Nouveau produit" button) sitting outside the
        // spotlight hole and behind the dimmed, click-blocking backdrop,
        // dead-ending the tour right where it asked the artisan to click.
        // Spotlighting the whole flyout panel (see invoice-product-flyout in
        // invoice-create-lines-step.page.html) keeps every row in it
        // reachable.
        id: 'product-pick',
        anchorId: 'invoice-product-flyout',
        next: 'product-folders-hint',
        popoverPlacement: 'corner',
        title: 'Choisissez un produit',
        body: 'Cliquez sur un produit déjà enregistré pour l’ajouter à la facture, ou choisissez « + Nouveau produit » pour en créer un. Le catalogue reste ouvert : vous pouvez en ajouter plusieurs à la suite.',
      },
      {
        // Only reached by an artisan who's already created at least one
        // dossier (Phase 1.1-2) — an artisan with none is never told about a
        // feature they haven't touched, same reasoning as every other
        // showIf-gated step in this file. Skipped entirely otherwise,
        // landing straight on 'product-quantity' just like before this
        // phase existed.
        id: 'product-folders-hint',
        showIf: 'hasFolders',
        anchorId: 'invoice-product-flyout',
        next: 'product-quantity',
        popoverPlacement: 'corner',
        title: 'Vos produits, classés par dossier',
        body: 'Vos dossiers apparaissent en premier dans cette liste — dépliez celui du chantier en cours pour retrouver vos produits plus vite. Ceux qui n’appartiennent à aucun dossier restent listés en dessous.',
      },
      {
        id: 'product-quantity',
        anchorId: 'invoice-line-quantity',
        advanceOn: 'input',
        next: 'product-card',
        title: 'Indiquez le métrage du chantier',
        body: 'Renseignez la quantité réellement nécessaire (m², mètres, unités… selon le produit). Le prix total se calcule automatiquement.',
      },
      {
        id: 'product-card',
        anchorId: 'invoice-lines-gallery',
        next: 'total',
        title: 'Une carte modifiable',
        body: 'Chaque ligne validée devient une carte : cliquez pour la rouvrir et ajuster ses informations. Le bouton « Mettre à jour » dans la fiche enregistre (ou non, à vous de voir) ces changements dans votre catalogue — sinon ils ne concernent que cette facture.',
      },
      {
        id: 'service-margin',
        anchorId: 'invoice-service-flyout',
        next: 'service-folders-hint',
        // Same reasoning as 'add-line': the flyout panel sits close enough
        // to the top of the viewport that the default math's "flip above"
        // fallback still lands the popover on its own header/first rows.
        popoverPlacement: 'corner',
        title: 'Votre marge, calculée pour vous',
        body: 'Que vous préfériez fixer un montant net ou une marge en pourcentage, le calcul se fait tout seul et de la même façon pour chaque facture — aucun favoritisme, le même mode de calcul pour tous vos clients. Choisissez « + Nouvelle prestation » pour en créer une, ou cliquez sur une prestation déjà enregistrée.',
      },
      {
        // Mirrors 'product-folders-hint' above — same showIf-gated,
        // no-op-if-unused reasoning.
        id: 'service-folders-hint',
        showIf: 'hasFolders',
        anchorId: 'invoice-service-flyout',
        next: 'service-card',
        popoverPlacement: 'corner',
        title: 'Vos prestations, classées par dossier',
        body: 'Vos dossiers apparaissent en premier ici aussi — dépliez celui du chantier en cours pour retrouver vos prestations plus vite. Celles qui n’appartiennent à aucun dossier restent listées en dessous.',
      },
      {
        id: 'service-card',
        anchorId: 'invoice-lines-gallery',
        next: 'total',
        title: 'Une carte modifiable, elle aussi',
        body: 'Comme pour les produits, une prestation validée devient une carte : cliquez pour rouvrir ses détails, ajuster le montant ou sa visibilité, et retrouvez le bouton « Mettre à jour » pour l’enregistrer dans votre catalogue si vous le souhaitez.',
      },
      {
        id: 'total',
        anchorId: 'invoice-total',
        title: 'Le total, en direct',
        body: 'Le montant total se met à jour automatiquement au fur et à mesure de la saisie.',
      },
      {
        // FACTURE-only (Phase 1.1-3's own scope) — on a DEVIS this anchor
        // never mounts (see the preview step's own @if), so this step times
        // out and is silently skipped, exactly like every other
        // missing-anchor case in this file. No showIf needed: the anchor's
        // own conditional rendering already does the gating.
        id: 'deposit',
        // Unlike 'total'/'preview' (invoice-create-shell.page.html, mounted
        // across every child route of this flow), the deposit field only
        // exists on the preview step's own page — found the hard way while
        // testing this phase: without an explicit route here, this step
        // inherited 'total''s route (still the lines step), where
        // 'invoice-deposit-toggle' never mounts, and always silently timed
        // out straight through to 'preview'.
        route: '/factures/nouvelle/rapide/apercu',
        anchorId: 'invoice-deposit-toggle',
        title: 'Demander un acompte (facultatif)',
        body: 'Souvent 30 ou 40 % du total, à recevoir avant de commencer le chantier. Une fois votre pourcentage habituel enregistré dans « Mon entreprise », il se propose automatiquement ici — toujours modifiable pour ce document précis.',
      },
      {
        id: 'preview',
        anchorId: 'invoice-preview',
        // No advanceOn: this button is a real routerLink to the /apercu
        // step (Phase 15's mandatory preview), not a same-page action — the
        // real navigation it causes is what carries the tour forward (see
        // 'submit-cta' below), same rule as the customer-picker step.
        title: 'Prévisualisez à tout moment',
        body: "Consultez l'aperçu PDF de la facture avant même de l'enregistrer.",
      },
      {
        id: 'submit-cta',
        route: '/factures/nouvelle/rapide/apercu',
        anchorId: 'invoice-submit-button',
        // Unlike 'preview', this click causes no navigation of its own —
        // the preview page swaps in its success block on the SAME route
        // once the save resolves — so advanceOn is exactly right here: it
        // moves the tour's attention to 'created' right away, and that
        // step's own anchor-wait (see TourService.waitForAnchor) is what
        // actually holds the reveal until the real save has gone through.
        advanceOn: 'click',
        title: 'Créez votre document',
        body: "Une fois l'aperçu vérifié, cliquez ici pour l'enregistrer définitivement.",
      },
      {
        id: 'created',
        anchorId: 'invoice-created-success',
        celebrate: true,
        title: '🎉 Et voilà, c’est enregistré !',
        body: 'Téléchargez-le ou envoyez-le par mail juste au-dessus. Et si c’était votre premier client, produit ou prestation aujourd’hui : ils sont désormais enregistrés et réutilisables sur toutes vos prochaines factures.',
      },
      {
        // Shared anchor id across the two "Signer" buttons that can exist
        // at once (the DEVIS card and its just-converted FACTURE card — see
        // invoice-create-preview-step.page.html) — same "never both really
        // in play for the artisan's attention, registry picks the visible
        // one" precedent as 'invoice-line-quantity'.
        id: 'sign-action',
        anchorId: 'invoice-sign-action',
        title: 'Faites signer votre client (facultatif)',
        body: 'Signature à l’écran ou photo d’un papier déjà signé : rien d’obligatoire pour enregistrer le document, et cette action reste aussi accessible plus tard, depuis « Mes documents », sans avoir à rouvrir ce document.',
      },
      {
        id: 'menu',
        anchorId: 'nav-my-documents',
        title: 'Vos documents, toujours accessibles',
        body: 'Une fois enregistrée, votre facture (ou devis) apparaît ici, dans « Mes documents » — modifiable, à relancer, ou à marquer payée en un clic. C’est aussi ce qui alimente vos « Statistiques » : rien à ressaisir. Et chaque client, produit ou prestation ajouté aujourd’hui rend votre prochaine visite de chantier encore plus rapide à facturer.',
      },
      {
        title: 'Vous êtes prêt !',
        body: 'Vous savez tout pour créer vos factures. Vos clients, produits et prestations restent modifiables à tout moment via le bouton dédié dans chaque liste ("Mes clients", "Mes produits", "Mes prestations"). Bon travail !',
      },
    ],
  },
  // Phase 9.5: mode manuel's own short walkthrough — auto-launches the
  // first time the artisan opens the free-form canvas, separate from
  // 'invoice-creation' (which covers mode rapide) so picking either mode
  // from the choice screen gets a tour that actually matches what's on
  // screen, instead of one tour trying to cover both.
  'invoice-creation-manual': {
    id: 'invoice-creation-manual',
    steps: [
      {
        title: 'Le mode manuel',
        body: "Ce tableau se remplit comme la facture finale : cliquez n'importe où pour écrire.",
      },
      {
        anchorId: 'manual-customer-fields',
        title: 'Le client',
        body: 'Renseignez son nom et ses coordonnées directement ici, comme sur le document final.',
      },
      {
        anchorId: 'manual-table',
        title: 'Le tableau',
        body: 'Chaque case se modifie en cliquant dessus. Redimensionnez une colonne ou une ligne en faisant glisser son bord.',
      },
      {
        anchorId: 'manual-add-row',
        advanceOn: 'click',
        title: 'Ajouter une ligne',
        body: 'Un clic ajoute une nouvelle ligne au tableau ; la croix à gauche de chaque ligne la supprime.',
      },
      {
        anchorId: 'manual-add-column',
        advanceOn: 'click',
        title: 'Ajouter une colonne',
        body: 'Besoin d’une information en plus (référence chantier, remise…) ? Ajoutez votre propre colonne ici.',
      },
      {
        anchorId: 'manual-format',
        advanceOn: 'click',
        title: 'Mettre en forme',
        body: 'Un clic aligne et formate proprement les nombres et le texte du tableau.',
      },
      {
        anchorId: 'manual-total',
        title: 'Le total, en direct',
        body: 'Le montant total se met à jour automatiquement au fur et à mesure de la saisie.',
      },
      {
        anchorId: 'manual-preview',
        advanceOn: 'click',
        title: 'Prévisualisez à tout moment',
        body: "Consultez l'aperçu PDF de la facture avant même de l'enregistrer.",
      },
      {
        title: 'Vous êtes prêt !',
        body: 'Vous savez tout pour créer une facture en mode manuel. Bon travail !',
      },
    ],
  },
  // Same "mode guide" vs "mode 1ère fois" split as invoice-creation: the
  // unconditional steps (search, the generic "+ Nouveau X" reminder) play
  // every time and are what a returning artisan sees on replay; the
  // showIf-gated cta/form-hint/celebrate trios are a self-contained detour
  // only a genuinely-empty catalog ever reaches, reusing the SAME "+
  // Nouveau" anchors rather than adding new ones. Each trio's cta step
  // deliberately skips into its detour via forward-route-matching, not
  // `advanceOn` — "+ Nouveau produit"/"+ Nouvelle prestation" are real
  // routerLinks (to /produits/nouveau, /prestations/nouvelle), so the real
  // navigation they cause is what carries the tour forward, same rule as
  // invoice-creation's customer-picker step. `next` overrides on the
  // reminder steps right after each cta are what keep a normal "Suivant"
  // walkthrough from ever wandering into a detour it didn't ask for.
  catalog: {
    id: 'catalog',
    steps: [
      {
        title: 'Votre catalogue',
        body: 'Enregistrez vos produits et prestations pour ne plus jamais ressaisir un prix.',
      },
      {
        showIf: 'noProducts',
        anchorId: 'catalog-new-product',
        title: 'Créez votre premier produit',
        body: 'Cliquez ici : un nom, une unité et un prix suffisent pour commencer.',
      },
      {
        anchorId: 'catalog-search',
        advanceOn: 'input',
        title: 'Recherchez',
        body: 'Retrouvez rapidement un produit déjà enregistré.',
      },
      {
        id: 'produit-new-reminder',
        anchorId: 'catalog-new-product',
        next: 'prestation-cta',
        title: 'Ajoutez un produit',
        body: 'Créez un produit pour l’ajouter facilement à vos prochaines factures.',
      },
      {
        // Shared anchor id with 'prestation-form-hint' below — the two
        // forms' own "Paramètres avancés" toggles never mount at once (only
        // one form is ever open at a time), same registry-picks-the-visible-
        // one precedent as 'invoice-line-quantity'.
        id: 'produit-form-hint',
        route: '/produits/nouveau',
        anchorId: 'catalog-folder-picker',
        title: 'Le strict minimum',
        body: 'Un nom, une unité et un prix suffisent. Vous pourrez enrichir la fiche plus tard — notamment via « Paramètres avancés » ci-dessous, qui permet de ranger ce produit dans un ou plusieurs dossiers si vous travaillez plusieurs corps de métier.',
      },
      {
        id: 'produit-celebrate',
        route: '/produits',
        showIf: 'hasProducts',
        celebrate: true,
        next: 'prestation-cta',
        title: '🎉 Premier produit enregistré !',
        body: 'Il est maintenant dans votre catalogue, prêt à être ajouté en un clic sur vos prochaines factures.',
      },
      {
        id: 'prestation-cta',
        showIf: 'noServices',
        route: '/prestations',
        anchorId: 'catalog-new-service',
        title: 'Créez votre première prestation',
        body: 'Cliquez ici : un nom et un prix (fixe ou en pourcentage) suffisent pour commencer.',
      },
      {
        anchorId: 'prestations-search',
        advanceOn: 'input',
        route: '/prestations',
        title: 'Recherchez',
        body: 'Retrouvez rapidement une prestation déjà enregistrée.',
      },
      {
        id: 'prestation-new-reminder',
        anchorId: 'catalog-new-service',
        next: 'remise-cta',
        title: 'Ajoutez une prestation',
        body: 'La main-d’œuvre et les autres prestations se gèrent ici, de la même façon. Essayez par exemple de créer « Marge 30% » en mode Pourcentage : elle s’appliquera ensuite automatiquement sur chaque facture, sans jamais recalculer votre marge à la main.',
      },
      {
        id: 'prestation-form-hint',
        route: '/prestations/nouvelle',
        anchorId: 'catalog-folder-picker',
        title: 'FIXE ou POURCENTAGE, à vous de choisir',
        body: 'Le calcul se fait pour vous ensuite, à chaque facture, de la même façon pour tous vos clients. Et comme pour un produit, « Paramètres avancés » ci-dessous permet de ranger cette prestation dans un ou plusieurs dossiers.',
      },
      {
        id: 'prestation-celebrate',
        route: '/prestations',
        showIf: 'hasServices',
        celebrate: true,
        next: 'remise-cta',
        title: '🎉 Première prestation enregistrée !',
        body: 'Main-d’œuvre, forfait, déplacement… elle est maintenant réutilisable en un clic, avec un calcul automatique et identique pour chaque client.',
      },
      // Phase 1.1-10: closes the pre-existing gap where this tour never
      // mentioned "Mes remises" (Phase 32 shipped between Phase 19 and this
      // one). Mirrors the produit/prestation cta → search → reminder →
      // form-hint → celebrate structure exactly, same "mode 1ère fois" vs
      // "mode guide" split.
      {
        id: 'remise-cta',
        showIf: 'noDiscounts',
        route: '/remises',
        anchorId: 'catalog-new-discount',
        title: 'Créez votre première remise',
        body: 'Remise fidélité, promotion ponctuelle… un nom et un montant (fixe ou en pourcentage) suffisent pour commencer.',
      },
      {
        anchorId: 'discounts-search',
        advanceOn: 'input',
        route: '/remises',
        title: 'Recherchez',
        body: 'Retrouvez rapidement une remise déjà enregistrée.',
      },
      {
        id: 'remise-new-reminder',
        anchorId: 'catalog-new-discount',
        next: 'catalog-done',
        title: 'Ajoutez une remise',
        body: 'Une remise créée ici reste disponible sur toutes vos prochaines factures et vos prochains devis, sans jamais recalculer le montant à la main.',
      },
      {
        id: 'remise-form-hint',
        route: '/remises/nouvelle',
        title: 'Fixe ou en pourcentage, à vous de choisir',
        body: 'Le montant retiré se calcule ensuite tout seul sur chaque document où vous l’appliquez.',
      },
      {
        id: 'remise-celebrate',
        route: '/remises',
        showIf: 'hasDiscounts',
        celebrate: true,
        next: 'catalog-done',
        title: '🎉 Première remise enregistrée !',
        body: 'Elle est maintenant prête à être appliquée en un clic sur vos prochains devis et factures.',
      },
      {
        id: 'catalog-done',
        title: 'Catalogue prêt !',
        body: 'Produits, prestations, remises : chacun est directement réutilisable sur vos prochains devis et factures, sans ressaisie. Et si vous travaillez plusieurs corps de métier, pensez aux dossiers dès maintenant (« Mes dossiers ») — plus votre catalogue grandit, plus ranger tôt vous fera gagner du temps plus tard.',
      },
    ],
  },
  customers: {
    id: 'customers',
    steps: [
      {
        title: 'Vos clients',
        body: 'Enregistrez vos clients pour ne plus jamais ressaisir leurs coordonnées.',
      },
      {
        showIf: 'noCustomers',
        anchorId: 'customers-new',
        title: 'Créez votre premier client',
        body: 'Cliquez ici : un nom suffit pour commencer, le reste est facultatif.',
      },
      {
        anchorId: 'customers-search',
        advanceOn: 'input',
        title: 'Recherchez',
        body: 'Retrouvez rapidement un client déjà enregistré.',
      },
      {
        id: 'customer-new-reminder',
        anchorId: 'customers-new',
        next: 'customers-done',
        title: 'Ajoutez un client',
        body: 'Créez une fiche client en quelques secondes.',
      },
      {
        id: 'customer-form-hint',
        route: '/clients/nouveau',
        title: 'Le strict minimum',
        body: 'Un nom suffit pour enregistrer ce client. Vous pourrez compléter ses coordonnées plus tard.',
      },
      {
        anchorId: 'customer-professional-checkbox',
        title: 'Un client professionnel ?',
        body: 'Cochez cette case si ce client achète pour son entreprise, pas à titre personnel — cela révèle sa raison sociale et son SIRET, et ajuste automatiquement certaines mentions légales sur ses futures factures.',
      },
      {
        id: 'customer-celebrate',
        route: '/clients',
        showIf: 'hasCustomers',
        celebrate: true,
        next: 'customers-done',
        title: '🎉 Premier client enregistré !',
        body: 'Il est maintenant dans votre répertoire, prêt à être sélectionné en un clic sur votre prochaine facture.',
      },
      {
        id: 'customers-done',
        title: 'Parfait !',
        body: 'Vos clients sont maintenant à portée de clic : ils apparaissent directement dans le sélecteur au démarrage de chaque nouveau devis ou facture, sans jamais ressaisir leurs coordonnées. Plus votre répertoire grandit, plus une fiche bien remplie (notes, historique) vous fera gagner du temps au prochain chantier.',
      },
    ],
  },
  // Phase 18: the merged "Statistiques & Rapports" page. Its two halves are
  // one component switching on the ?vue= query param (see StatsReportsPage),
  // not two separate routes — but from TourService's point of view that's
  // still just a URL change, so the same `route`-driven mechanism every
  // other tour uses for a real page transition carries this one too: the
  // 'stats-kpis' step's `route: '/statistiques'` forces the vue d'ensemble
  // tab open regardless of which tab the tour started on (e.g. replayed
  // from '/rapports'), and 'rapport-period'`s `route` does the same for the
  // declaration tab, whether the artisan got there by clicking the actual
  // tab button (a real navigation TourService's own NavigationEnd listener
  // picks up, same as the invoice-creation tour's customer-picker step) or
  // by pressing "Suivant" (which then triggers that same navigation itself).
  // No `advanceOn` needed anywhere in this tour as a result. The three
  // anchor-in-rapport-tab steps exist specifically to spell out which
  // figures are indicative estimates versus what actually counts for URSSAF
  // — the "plus ou moins juridique" clarification a plain tooltip would
  // bury, but a guided walkthrough gets to say out loud, once, to every
  // artisan who hasn't seen it yet.
  'stats-reports': {
    id: 'stats-reports',
    steps: [
      {
        title: 'Vue d’ensemble et rapports, réunis',
        body: 'Cette page réunit vos statistiques d’activité et vos rapports trimestriels pour l’URSSAF, auparavant séparés en deux onglets.',
      },
      {
        route: '/statistiques',
        anchorId: 'stats-kpis',
        title: 'Votre activité en un coup d’œil',
        body: 'Ces chiffres portent sur les 12 derniers mois : factures encaissées, panier moyen, et ce qu’il reste à encaisser.',
      },
      {
        anchorId: 'stats-chart',
        title: 'Votre chiffre d’affaires, mois par mois',
        body: 'Visualisez l’évolution de votre encaissé HT sur l’année écoulée.',
      },
      {
        anchorId: 'stats-tab-rapport',
        title: 'Passez à vos déclarations',
        body: 'Cliquez ici pour générer le rapport à transmettre pour votre trimestre (ou votre mois, selon votre régime).',
      },
      {
        route: '/statistiques?vue=rapport',
        anchorId: 'rapport-period',
        title: 'Choisissez la période',
        body: 'Trimestre ou mois selon votre régime de déclaration, ou une période personnalisée.',
      },
      {
        anchorId: 'rapport-plafond',
        title: 'Le plafond micro-entrepreneur, à titre indicatif',
        body: 'Ce suivi est une aide au pilotage, pas un document officiel : seul votre espace urssaf.fr fait foi pour votre chiffre d’affaires réellement déclaré.',
      },
      {
        anchorId: 'rapport-charges',
        title: 'Une estimation, pas un calcul officiel',
        body: 'Ces cotisations (et cet éventuel versement libératoire) sont estimées à partir de vos factures encaissées. Le montant exact à payer reste celui calculé par l’URSSAF, ou par votre expert-comptable si vous n’êtes pas micro-entrepreneur.',
      },
      {
        anchorId: 'rapport-export',
        title: 'Vos justificatifs, prêts à transmettre',
        body: 'Le PDF et le CSV reprennent le détail de la période — pratiques à joindre à votre déclaration ou à transmettre à votre comptable. Ils ne remplacent pas la déclaration elle-même, à faire sur urssaf.fr.',
      },
      {
        title: 'Vous savez tout !',
        body: 'Revenez ici quand vous le souhaitez pour suivre votre activité ou préparer votre prochaine déclaration.',
      },
    ],
  },
};
