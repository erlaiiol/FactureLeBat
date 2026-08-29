// Shared by every DraftResolver implementation (see draft-resolver.interface.ts)
// — engine-specific constants (model token budgets, LLM-only cost-guard
// messages, etc.) live next to their own engine instead
// (llm/llm-draft-resolver.constants.ts).
export const REJECTED_MESSAGE =
  "Je n'ai pas compris votre demande, réessayez en décrivant le devis ou la facture à créer.";
