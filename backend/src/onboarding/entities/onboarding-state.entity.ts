import { TourId } from '../onboarding.constants';

export interface OnboardingState {
  tourEnabled: boolean;
  completedTours: TourId[];
}
