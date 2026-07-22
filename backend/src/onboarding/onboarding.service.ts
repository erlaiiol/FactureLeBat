import { Injectable } from '@nestjs/common';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TourId } from './onboarding.constants';

@Injectable()
export class OnboardingService {
  constructor(private readonly onboardingRepository: OnboardingRepository) {}

  getState(): Promise<OnboardingState> {
    return this.onboardingRepository.getState();
  }

  setTourEnabled(tourEnabled: boolean): Promise<OnboardingState> {
    return this.onboardingRepository.setTourEnabled(tourEnabled);
  }

  completeTour(tourId: TourId): Promise<OnboardingState> {
    return this.onboardingRepository.completeTour(tourId);
  }

  resetTours(): Promise<OnboardingState> {
    return this.onboardingRepository.resetTours();
  }
}
