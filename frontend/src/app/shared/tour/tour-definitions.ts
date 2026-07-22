import { TourId } from '../../core/models/onboarding.model';

export interface TourStepDefinition {
  // Absent on a centered welcome/completion step — see tour-position.util.ts.
  anchorId?: string;
  // Present only when this step lives on a different route than the
  // previous one (e.g. the invoice-creation tour moving from the client
  // step to the lignes step).
  route?: string;
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
        title: 'Bienvenue sur FactureLeBat !',
        body: 'Créons votre première facture ensemble, étape par étape.',
      },
      {
        anchorId: 'invoice-mode-rapide',
        title: 'Deux façons de facturer',
        body: 'Le mode rapide vous guide pas à pas. Le mode manuel ouvre un tableau libre, à remplir comme sur la facture finale — essayons le mode rapide.',
      },
      {
        route: '/factures/nouvelle/rapide/client',
        anchorId: 'invoice-customer-picker',
        title: 'Choisissez votre client',
        body: 'Sélectionnez un client déjà enregistré, ou créez-en un nouveau en un clic.',
      },
      {
        route: '/factures/nouvelle/rapide/lignes',
        anchorId: 'invoice-line-fields',
        title: 'Renseignez un matériau ou une prestation',
        body: 'Décrivez ce que vous facturez, la quantité et le prix — le total se calcule automatiquement. Vous pourrez aussi ajouter des prestations plus bas.',
      },
      {
        anchorId: 'invoice-add-line',
        title: 'Besoin d’une autre ligne ?',
        body: 'Ajoutez autant de lignes que nécessaire pour ce chantier.',
      },
      {
        anchorId: 'invoice-total',
        title: 'Le total, en direct',
        body: 'Le montant total se met à jour automatiquement au fur et à mesure de la saisie.',
      },
      {
        anchorId: 'invoice-preview',
        title: 'Prévisualisez à tout moment',
        body: "Consultez l'aperçu PDF de la facture avant même de l'enregistrer.",
      },
      {
        title: 'Vous êtes prêt !',
        body: 'Vous savez tout pour créer vos factures. Bon travail !',
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
        title: 'Ajouter une ligne',
        body: 'Un clic ajoute une nouvelle ligne au tableau ; la croix à gauche de chaque ligne la supprime.',
      },
      {
        anchorId: 'manual-add-column',
        title: 'Ajouter une colonne',
        body: 'Besoin d’une information en plus (référence chantier, remise…) ? Ajoutez votre propre colonne ici.',
      },
      {
        anchorId: 'manual-format',
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
        title: 'Prévisualisez à tout moment',
        body: "Consultez l'aperçu PDF de la facture avant même de l'enregistrer.",
      },
      {
        title: 'Vous êtes prêt !',
        body: 'Vous savez tout pour créer une facture en mode manuel. Bon travail !',
      },
    ],
  },
  catalog: {
    id: 'catalog',
    steps: [
      {
        title: 'Votre catalogue',
        body: 'Enregistrez vos produits et prestations pour ne plus jamais ressaisir un prix.',
      },
      {
        anchorId: 'catalog-search',
        title: 'Recherchez',
        body: 'Retrouvez rapidement un produit déjà enregistré.',
      },
      {
        anchorId: 'catalog-new-product',
        title: 'Ajoutez un produit',
        body: 'Créez un produit pour l’ajouter facilement à vos prochaines factures.',
      },
      {
        route: '/prestations',
        anchorId: 'catalog-new-service',
        title: 'Ajoutez une prestation',
        body: 'La main-d’œuvre et les autres prestations se gèrent ici, de la même façon.',
      },
      {
        title: 'Catalogue prêt !',
        body: 'Un catalogue bien rempli rend vos prochaines factures deux fois plus rapides à créer.',
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
        anchorId: 'customers-search',
        title: 'Recherchez',
        body: 'Retrouvez rapidement un client déjà enregistré.',
      },
      {
        anchorId: 'customers-new',
        title: 'Ajoutez un client',
        body: 'Créez une fiche client en quelques secondes.',
      },
      {
        title: 'Parfait !',
        body: 'Vos clients sont maintenant à portée de clic.',
      },
    ],
  },
};
