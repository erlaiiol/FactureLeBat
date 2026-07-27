import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ReferralStatusEntity } from './entities/referral-status.entity';
import { ReferralService } from './referral.service';

@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  // Public, cross-tenant lookup (same shape as PromoCode's admin-catalog
  // model) — lets the registration screen confirm a code before submit
  // without ever exposing the referrer's identity.
  @Public()
  @Get('validate/:code')
  validate(@Param('code') code: string): Promise<{ valid: boolean }> {
    return this.referralService.validateCode(code);
  }

  @Get('me')
  getMyStatus(@CurrentUser() user: AuthenticatedUser): Promise<ReferralStatusEntity> {
    return this.referralService.getStatus(user.companyId);
  }
}
