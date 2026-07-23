import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OnboardingService } from './onboarding.service';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TOUR_IDS } from './onboarding.constants';
import type { TourId } from './onboarding.constants';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  getState(@CurrentUser() user: AuthenticatedUser): Promise<OnboardingState> {
    return this.onboardingService.getState(user.companyId);
  }

  @Patch()
  updateState(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOnboardingDto,
  ): Promise<OnboardingState> {
    // Nothing else is patchable today (see UpdateOnboardingDto) — the
    // `tourEnabled` check keeps this a no-op instead of an unnecessary write
    // when the body omits it.
    if (dto.tourEnabled === undefined) {
      return this.onboardingService.getState(user.companyId);
    }
    return this.onboardingService.setTourEnabled(user.companyId, dto.tourEnabled);
  }

  @Post('tours/:tourId/complete')
  completeTour(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tourId', new ParseEnumPipe(TOUR_IDS)) tourId: TourId,
  ): Promise<OnboardingState> {
    return this.onboardingService.completeTour(user.companyId, tourId);
  }

  @Post('reset')
  resetTours(@CurrentUser() user: AuthenticatedUser): Promise<OnboardingState> {
    return this.onboardingService.resetTours(user.companyId);
  }
}
