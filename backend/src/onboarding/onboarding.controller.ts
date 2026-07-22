import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TOUR_IDS } from './onboarding.constants';
import type { TourId } from './onboarding.constants';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  getState(): Promise<OnboardingState> {
    return this.onboardingService.getState();
  }

  @Patch()
  updateState(@Body() dto: UpdateOnboardingDto): Promise<OnboardingState> {
    // Nothing else is patchable today (see UpdateOnboardingDto) — the
    // `tourEnabled` check keeps this a no-op instead of an unnecessary write
    // when the body omits it.
    if (dto.tourEnabled === undefined) {
      return this.onboardingService.getState();
    }
    return this.onboardingService.setTourEnabled(dto.tourEnabled);
  }

  @Post('tours/:tourId/complete')
  completeTour(
    @Param('tourId', new ParseEnumPipe(TOUR_IDS)) tourId: TourId,
  ): Promise<OnboardingState> {
    return this.onboardingService.completeTour(tourId);
  }

  @Post('reset')
  resetTours(): Promise<OnboardingState> {
    return this.onboardingService.resetTours();
  }
}
