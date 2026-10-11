import { TourId } from '../onboarding.constants';

export interface OnboardingState {
  tourEnabled: boolean;
  completedTours: TourId[];
  // False until the artisan has explicitly picked tourEnabled once (see
  // Company.tourPreferenceChosenAt) — drives the sign-up "Activer les
  // tutoriels ?" prompt.
  tourPreferenceChosen: boolean;
}
