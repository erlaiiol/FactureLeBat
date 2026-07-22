// Phase 8 onboarding tour: the fixed set of mini-tours the app knows about.
// Single source of truth for both the DTO validation below and the
// frontend's tour-definitions.ts.
export const TOUR_IDS = ['invoice-creation', 'catalog', 'customers'] as const;

export type TourId = (typeof TOUR_IDS)[number];
