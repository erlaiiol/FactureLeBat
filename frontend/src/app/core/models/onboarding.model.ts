// Mirrors backend/src/onboarding/onboarding.constants.ts — single source of
// truth for which mini-tours exist (Phase 8, plus Phase 9.5's mode-manuel
// walkthrough).
export const TOUR_IDS = [
  'invoice-creation',
  'invoice-creation-manual',
  'catalog',
  'customers',
] as const;

export type TourId = (typeof TOUR_IDS)[number];

export interface OnboardingState {
  tourEnabled: boolean;
  completedTours: TourId[];
}
