// Not a Prisma enum: the chosen strategy is never persisted as such. EQUAL
// is expanded into an explicit weight of 1 per invoice line at creation
// time (see InvoiceService.create), so the rest of the stack only ever
// deals with one concept — a weighted split (InvoiceCalculationService.
// computeWeightedSplit) — not two.
export enum RedistributionStrategy {
  EQUAL = 'EQUAL',
  WEIGHTED = 'WEIGHTED',
}
