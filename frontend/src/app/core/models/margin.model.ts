// Phase 1.6: shared between ProductProfile and ServiceProfile (unlike
// ServicePricingMode, which only exists on Service) — how a catalog item's
// margin is declared. NET_AMOUNT is a flat euro amount, HT ("3€ sur les 6€
// facturés"); PERCENTAGE is a share of the item's own HT price ("50% sur
// les 6€"). See docs/1.6/1.6-1-margin-data-model.md.
export type MarginMode = 'NET_AMOUNT' | 'PERCENTAGE';
