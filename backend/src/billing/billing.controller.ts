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
import type { PlanTier } from '../../generated/prisma/enums';
import { AlreadySubscribedError } from './already-subscribed.error';
import { AppleUnavailableError } from './apple/apple-unavailable.error';
import { BillingService } from './billing.service';
import { BillingStatus } from './entities/billing-status.entity';
import type { PlanCatalog } from './entities/plan-catalog.entity';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { RedeemPromoCodeDto } from './dto/redeem-promo-code.dto';
import { VerifyApplePurchaseDto } from './dto/verify-apple-purchase.dto';
import { NoBillingCustomerError } from './no-billing-customer.error';
import { PromoCodeService } from './promo-code/promo-code.service';
import { StripeUnavailableError } from './stripe/stripe-unavailable.error';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly promoCodeService: PromoCodeService,
  ) {}

  // Public — pricing/feature-per-tier is not sensitive, and a logged-out
  // landing page could show it too. See docs/roadmap.md Phase 30.
  @Public()
  @Get('plans')
  getPlans(): PlanCatalog {
    return this.billingService.getPlanCatalog();
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser): Promise<BillingStatus> {
    return this.billingService.getStatus(user.companyId);
  }

  @Post('checkout-session')
  async createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    try {
      return await this.billingService.createCheckoutSession(user.companyId, user.email, dto.tier);
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
  ): Promise<{ premiumGrantedUntil: Date; grantedPlanTier: PlanTier }> {
    const { until, tier } = await this.promoCodeService.redeem(user.companyId, dto.code);
    return { premiumGrantedUntil: until, grantedPlanTier: tier };
  }

  // Phase 1.7: posted by the frontend right after a native StoreKit2
  // purchase completes, on iOS only. No raw-body/signature-header dance like
  // the Stripe webhook below needs — the proof of authenticity here is the
  // JWS string itself (verified by AppleServerClientService against
  // Apple's public certs), not an HMAC over the exact request bytes, so a
  // normal parsed JSON body is fine.
  @Post('apple/verify-purchase')
  async verifyApplePurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyApplePurchaseDto,
  ): Promise<{ tier: PlanTier | null }> {
    try {
      return await this.billingService.verifyApplePurchase(
        user.companyId,
        dto.signedTransactionInfo,
      );
    } catch (error) {
      throw mapAppleError(error);
    }
  }

  // App Store Server Notifications V2 — Apple posts here on every Apple IAP
  // subscription lifecycle event, the Apple-side counterpart to the Stripe
  // webhook below. Public because, like Stripe's, its caller isn't an
  // authenticated user of this app — authenticity comes entirely from the
  // signedPayload JWS itself.
  @Public()
  @Post('apple/notifications')
  async appleNotifications(@Body() body: { signedPayload?: string }): Promise<{ received: true }> {
    if (!body.signedPayload) {
      throw new BadRequestException('Missing Apple notification payload');
    }
    try {
      await this.billingService.handleAppleNotification(body.signedPayload);
    } catch (error) {
      if (error instanceof AppleUnavailableError) {
        throw new ServiceUnavailableException('Apple IAP is not configured on this deployment.');
      }
      throw new BadRequestException(
        `Apple notification verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { received: true };
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

function mapAppleError(error: unknown): unknown {
  if (error instanceof AppleUnavailableError) {
    return new ServiceUnavailableException("L'achat intégré n'est pas configuré pour le moment.");
  }
  return new BadRequestException(
    `Vérification de l'achat Apple échouée : ${error instanceof Error ? error.message : String(error)}`,
  );
}
