import { Injectable } from '@nestjs/common';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TourId } from './onboarding.constants';

@Injectable()
export class OnboardingService {
  constructor(private readonly onboardingRepository: OnboardingRepository) {}

  getState(companyId: string): Promise<OnboardingState> {
    return this.onboardingRepository.getState(companyId);
  }

  setTourEnabled(companyId: string, tourEnabled: boolean): Promise<OnboardingState> {
    return this.onboardingRepository.setTourEnabled(companyId, tourEnabled);
  }

  completeTour(companyId: string, tourId: TourId): Promise<OnboardingState> {
    return this.onboardingRepository.completeTour(companyId, tourId);
  }

  resetTours(companyId: string): Promise<OnboardingState> {
    return this.onboardingRepository.resetTours(companyId);
  }
}
