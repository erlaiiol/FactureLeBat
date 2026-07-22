// A suggested complementary material for the job (adhesive, underlayment,
// finish, trims...) — never auto-added to the invoice, always a starting
// point the artisan reviews (see docs/roadmap.md Phase 10). `reason` is what
// lets the artisan judge relevance without having to ask "why this?".
export interface ComplementarySuggestion {
  name: string;
  reason: string;
  category: string | null;
}
