// Mirrors backend/src/onboarding/onboarding.constants.ts — single source of
// truth for which mini-tours exist (Phase 8).
export const TOUR_IDS = ['invoice-creation', 'catalog', 'customers'] as const;

export type TourId = (typeof TOUR_IDS)[number];

export interface OnboardingState {
  tourEnabled: boolean;
  completedTours: TourId[];
}
