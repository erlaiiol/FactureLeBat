import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromoCodeModel as PromoCode } from '../../../generated/prisma/models';
import { NoRowsAffectedError } from '../../common/errors/no-rows-affected.error';
import { BillingRepository } from '../billing.repository';
import { CreatePromoCodeDto } from '../dto/create-promo-code.dto';
import { generatePromoCode } from './promo-code-generator.util';
import { PromoCodeRepository } from './promo-code.repository';

const MAX_GENERATION_ATTEMPTS = 5;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

@Injectable()
export class PromoCodeService {
  constructor(
    private readonly repository: PromoCodeRepository,
    private readonly billingRepository: BillingRepository,
  ) {}

  listAll(): Promise<PromoCode[]> {
    return this.repository.findAll();
  }

  async create(dto: CreatePromoCodeDto): Promise<PromoCode> {
    const code = await this.resolveCode(dto.code);
    return this.repository.create({
      code,
      durationDays: dto.durationDays,
      maxRedemptions: dto.maxRedemptions,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  async setActive(id: string, active: boolean): Promise<void> {
    try {
      await this.repository.setActive(id, active);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Code promo ${id} introuvable`);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.repository.delete(id);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Code promo ${id} introuvable`);
      }
      throw error;
    }
  }

  // Applies the code's durationDays to the redeeming company's
  // premiumGrantedUntil — the exact same mechanism an admin's manual grant
  // uses (BillingRepository.grantPremiumDays), so a promo code is really
  // just a self-service, rate-limited way to trigger that same grant.
  async redeem(companyId: string, rawCode: string): Promise<Date> {
    const code = normalizeCode(rawCode);
    const promoCode = await this.repository.findByCode(code);
    if (!promoCode || !promoCode.active) {
      throw new NotFoundException('Code promo invalide.');
    }
    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      throw new BadRequestException('Ce code promo a expiré.');
    }
    if (
      promoCode.maxRedemptions !== null &&
      promoCode.redemptionsCount >= promoCode.maxRedemptions
    ) {
      throw new BadRequestException('Ce code promo a atteint son nombre maximal d’utilisations.');
    }
    if (await this.repository.hasRedeemed(promoCode.id, companyId)) {
      throw new ConflictException('Vous avez déjà utilisé ce code promo.');
    }

    // Not perfectly race-free against a duplicate redemption arriving
    // concurrently (the maxRedemptions check above is read-then-act), but
    // the unique index on [promoCodeId, companyId] guarantees no company
    // can ever redeem twice regardless — the worst a race can cause is a
    // code being redeemed marginally more than maxRedemptions times by
    // *different* companies, an acceptable soft cap for an internal
    // promo tool, not a payment-critical guarantee.
    await this.repository.recordRedemption(promoCode.id, companyId);
    return this.billingRepository.grantPremiumDays(companyId, promoCode.durationDays);
  }

  private async resolveCode(requested?: string): Promise<string> {
    if (requested) {
      const code = normalizeCode(requested);
      if (await this.repository.findByCode(code)) {
        throw new ConflictException(`Le code ${code} existe déjà.`);
      }
      return code;
    }
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = generatePromoCode();
      if (!(await this.repository.findByCode(code))) {
        return code;
      }
    }
    throw new ConflictException('Impossible de générer un code promo unique, réessayez.');
  }
}
