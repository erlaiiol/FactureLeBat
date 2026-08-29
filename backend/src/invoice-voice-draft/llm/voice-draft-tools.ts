import { UNIT_LABELS } from '../../common/unit.util';
import { LlmToolDefinition } from './llm-client.interface';

const UNIT_VALUES = Object.keys(UNIT_LABELS);

// Shared by every field below that can carry doubt — see
// entities/voice-invoice-draft.entity.ts's NeedsReview for what each reason
// means. Kept as a plain object (not a class) since this only ever feeds
// JSON Schema sent to whichever LlmClient is bound, never instantiated on
// this side.
const NEEDS_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      enum: ['no_match', 'ambiguous_match', 'low_confidence_match', 'document_type_conflict'],
    },
    suggestion: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['label', 'value'],
    },
  },
  required: ['reason'],
};

// Tools exposed to the model — three read-only searches (company-scoped
// server-side, the model never sees or picks a companyId) plus the two
// terminal calls. See docs/1.4/1.4-1-nlu-draft-backend.md's Approach
// section: resolve_draft is the only success path (no more multi-turn
// ask_clarification — corrections happen by the artisan editing the
// rendered draft, not a second model call), and reject exists only for a
// transcript with nothing invoice-related in it at all.
export function buildVoiceDraftTools(): LlmToolDefinition[] {
  return [
    {
      name: 'search_customers',
      description:
        'Recherche des clients existants de cet artisan par nom approximatif (tolérant aux fautes et variantes de transcription vocale). Retourne au plus 5 candidats, chacun avec un score de similarité (0 à 1) — un score proche de 1 et un seul résultat net signifient une correspondance sûre ; plusieurs résultats aux scores proches signifient une ambiguïté (utilise ambiguous_match).',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'search_products',
      description:
        'Recherche des produits existants du catalogue de cet artisan par nom ou code approximatif. Retourne au plus 5 candidats avec leur prix et leur unité.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'search_services',
      description:
        'Recherche des prestations existantes du catalogue de cet artisan par nom ou code approximatif. Retourne au plus 5 candidats avec leur prix.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'resolve_draft',
      description:
        "Termine la résolution avec un brouillon de devis/facture. À appeler une seule fois, en dernier, après avoir cherché tous les clients/produits/prestations mentionnés dans la transcription. Chaque champ douteux doit porter needsReview plutôt que d'être deviné silencieusement — un brouillon partiel avec des champs signalés est toujours préférable à une valeur inventée.",
      inputSchema: {
        type: 'object',
        properties: {
          documentType: { type: 'string', enum: ['DEVIS', 'FACTURE'] },
          documentTypeNeedsReview: NEEDS_REVIEW_SCHEMA,
          customer: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              customerName: { type: 'string' },
              customerAddress: { type: 'string' },
              customerEmail: { type: 'string' },
              customerPhone: { type: 'string' },
              needsReview: NEEDS_REVIEW_SCHEMA,
            },
            required: ['customerName'],
          },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                unit: { type: 'string', enum: UNIT_VALUES },
                quantity: { type: 'number' },
                unitPriceCents: { type: 'integer' },
                productId: { type: 'string' },
                needsReview: NEEDS_REVIEW_SCHEMA,
              },
              required: ['description', 'unit', 'quantity', 'unitPriceCents'],
            },
          },
          serviceLines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                serviceId: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                amountCents: { type: 'integer' },
                needsReview: NEEDS_REVIEW_SCHEMA,
              },
              required: ['name', 'amountCents'],
            },
          },
          depositPercentageBasisPoints: { type: 'integer' },
          depositNeedsReview: NEEDS_REVIEW_SCHEMA,
          notices: {
            type: 'array',
            description:
              "Tout détail dicté qui n'a pas de champ correspondant ci-dessus (une remise, un taux de TVA particulier, etc.) — jamais ignoré ni inventé, toujours listé ici à la place.",
            items: {
              type: 'object',
              properties: {
                detail: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['detail', 'message'],
            },
          },
        },
        required: ['documentType', 'customer', 'lines', 'serviceLines'],
      },
    },
    {
      name: 'reject',
      description:
        "À appeler uniquement si la transcription ne contient rien qui ressemble à une demande de devis/facture (bruit de fond, hors sujet). N'appelle jamais resolve_draft avec un brouillon vide à la place.",
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

// defaultDepositPercentageBasisPoints comes from this company's own
// Company.defaultDepositPercentageBasisPoints (Phase 1.1-3) — lets "l'acompte
// habituel" resolve without asking, per docs/1.4/1.4-1's transcript #14.
export function buildVoiceDraftSystemPrompt(
  defaultDepositPercentageBasisPoints: number | null,
): string {
  const unitVocabulary = UNIT_VALUES.map(
    (unit) => `${unit} (${UNIT_LABELS[unit as keyof typeof UNIT_LABELS]})`,
  ).join(', ');
  const depositLine =
    defaultDepositPercentageBasisPoints != null
      ? `Le taux d'acompte habituel de cet artisan est ${defaultDepositPercentageBasisPoints / 100}%. Si l'artisan dit "l'acompte habituel" sans préciser de taux, utilise cette valeur sans poser de question.`
      : "Cet artisan n'a pas de taux d'acompte habituel enregistré : si l'artisan dit \"l'acompte habituel\" sans préciser de taux, laisse depositPercentageBasisPoints absent et signale needsReview: { reason: 'no_match' } dessus.";

  return [
    "Tu aides un artisan français à créer un devis ou une facture à partir d'une commande dictée à l'oral ou tapée au clavier.",
    "Utilise search_customers/search_products/search_services pour retrouver les références réelles mentionnées AVANT de conclure — n'invente jamais un identifiant.",
    "N'invente jamais un prix, un client ou un produit qui n'existe pas dans les résultats de recherche : si rien ne correspond avec confiance, laisse le champ tel que dicté (ou vide) et ajoute needsReview avec la raison appropriée plutôt que de deviner silencieusement. Un mauvais silence est pire qu'un champ signalé.",
    "Un acompte (depositPercentageBasisPoints) ne s'applique qu'à une FACTURE, jamais à un DEVIS : si l'artisan en demande un sur ce qui ressemble à un devis, mets quand même le champ à la valeur demandée mais avec needsReview: { reason: 'document_type_conflict' } sur le dépôt — ne le supprime jamais silencieusement et ne change jamais le type de document de toi-même.",
    'Si aucun des deux mots "devis" ou "facture" (ni un équivalent clair) n\'apparaît, choisis FACTURE par défaut (le cas le plus courant) mais signale documentTypeNeedsReview: { reason: \'no_match\' }.',
    "Si l'artisan mentionne un détail que tu ne peux pas appliquer (une remise, un taux de TVA particulier, etc. — rien de tout cela n'est un champ de ce brouillon), ajoute une entrée dans notices plutôt que de l'ignorer ou de l'inventer.",
    `Unités valides pour le champ "unit" (utilise le code, jamais le libellé entre parenthèses) : ${unitVocabulary}.`,
    depositLine,
    'Appelle resolve_draft une seule fois, à la fin, une fois toutes les recherches nécessaires faites. Si la transcription ne parle pas du tout de devis/facture, appelle reject à la place — jamais resolve_draft avec un brouillon vide.',
  ].join('\n');
}
