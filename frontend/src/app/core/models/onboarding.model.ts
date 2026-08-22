import { LegalStatus } from './company.model';

// Mirrors backend/src/onboarding/onboarding.constants.ts — single source of
// truth for which mini-tours exist (Phase 8, plus Phase 9.5's mode-manuel
// walkthrough and Phase 18's merged stats/reports page).
export const TOUR_IDS = [
  'invoice-creation',
  'invoice-creation-manual',
  'catalog',
  'customers',
  'stats-reports',
] as const;

export type TourId = (typeof TOUR_IDS)[number];

export interface OnboardingState {
  tourEnabled: boolean;
  completedTours: TourId[];
}

// Mirrors backend/src/onboarding/entities/legal-status-confirmation.entity.ts
export interface LegalStatusConfirmation {
  legalStatus: LegalStatus;
  vatRateBasisPoints: number;
  legalStatusConfirmedAt: string;
}
