// Phase 8 onboarding tour: the fixed set of mini-tours the app knows about
// (Phase 9.5 adds 'invoice-creation-manual' for the mode-manuel walkthrough;
// Phase 18 adds 'stats-reports' for the merged statistics/reports page).
// Single source of truth for both the DTO validation below and the
// frontend's tour-definitions.ts.
export const TOUR_IDS = [
  'invoice-creation',
  'invoice-creation-manual',
  'catalog',
  'customers',
  'stats-reports',
] as const;

export type TourId = (typeof TOUR_IDS)[number];
