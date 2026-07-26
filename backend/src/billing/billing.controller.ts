import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Get,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AlreadySubscribedError } from './already-subscribed.error';
import { BillingService } from './billing.service';
import { BillingStatus } from './entities/billing-status.entity';
import { RedeemPromoCodeDto } from './dto/redeem-promo-code.dto';
import { NoBillingCustomerError } from './no-billing-customer.error';
import { PromoCodeService } from './promo-code/promo-code.service';
import { StripeUnavailableError } from './stripe/stripe-unavailable.error';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly promoCodeService: PromoCodeService,
  ) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser): Promise<BillingStatus> {
    return this.billingService.getStatus(user.companyId);
  }

  @Post('checkout-session')
  async createCheckoutSession(@CurrentUser() user: AuthenticatedUser): Promise<{ url: string }> {
    try {
      return await this.billingService.createCheckoutSession(user.companyId, user.email);
    } catch (error) {
      throw mapStripeError(error);
    }
  }

  @Post('portal-session')
  async createPortalSession(@CurrentUser() user: AuthenticatedUser): Promise<{ url: string }> {
    try {
      return await this.billingService.createPortalSession(user.companyId);
    } catch (error) {
      throw mapStripeError(error);
    }
  }

  @Post('redeem-promo')
  async redeemPromo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RedeemPromoCodeDto,
  ): Promise<{ premiumGrantedUntil: Date }> {
    const premiumGrantedUntil = await this.promoCodeService.redeem(user.companyId, dto.code);
    return { premiumGrantedUntil };
  }

  // Stripe posts here on every subscription lifecycle event. Signature
  // verification (StripeClientService.constructWebhookEvent) needs the
  // exact raw request body bytes — main.ts enables Nest's `rawBody: true`
  // option specifically so `request.rawBody` below is the untouched Buffer,
  // not whatever JSON.stringify(req.body) would re-serialize to (which is
  // not guaranteed byte-identical to what Stripe actually signed).
  @Public()
  @Post('webhook')
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!request.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe webhook payload or signature');
    }
    try {
      await this.billingService.handleWebhook(request.rawBody, signature);
    } catch (error) {
      if (error instanceof StripeUnavailableError) {
        throw new ServiceUnavailableException(
          'Stripe billing is not configured on this deployment.',
        );
      }
      throw new BadRequestException(
        `Webhook signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { received: true };
  }
}

function mapStripeError(error: unknown): unknown {
  if (error instanceof StripeUnavailableError) {
    return new ServiceUnavailableException(
      "L'abonnement n'est pas configuré sur ce déploiement pour le moment.",
    );
  }
  if (error instanceof NoBillingCustomerError) {
    return new BadRequestException('Aucun abonnement à gérer pour le moment.');
  }
  if (error instanceof AlreadySubscribedError) {
    return new BadRequestException(
      'Vous avez déjà un abonnement — utilisez "Gérer mon abonnement" pour le modifier.',
    );
  }
  return error;
}
