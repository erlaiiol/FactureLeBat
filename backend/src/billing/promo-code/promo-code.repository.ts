import { Injectable } from '@nestjs/common';
import { PlanTier } from '../../../generated/prisma/enums';
import { PromoCodeModel as PromoCode } from '../../../generated/prisma/models';
import { PrismaService } from '../../database/prisma.service';
import { NoRowsAffectedError } from '../../common/errors/no-rows-affected.error';

export interface CreatePromoCodeData {
  code: string;
  planTier: PlanTier;
  durationDays: number;
  maxRedemptions?: number;
  expiresAt?: Date;
}

@Injectable()
export class PromoCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<PromoCode[]> {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findByCode(code: string): Promise<PromoCode | null> {
    return this.prisma.promoCode.findUnique({ where: { code } });
  }

  create(data: CreatePromoCodeData): Promise<PromoCode> {
    return this.prisma.promoCode.create({ data });
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { count } = await this.prisma.promoCode.updateMany({ where: { id }, data: { active } });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
  }

  async delete(id: string): Promise<void> {
    const { count } = await this.prisma.promoCode.deleteMany({ where: { id } });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
  }

  // Redemption + the counter bump happen in one transaction so
  // redemptionsCount can never drift from the actual row count in
  // PromoCodeRedemption — see PromoCode.redemptionsCount's schema comment.
  // The unique index on [promoCodeId, companyId] is what actually makes
  // "once per company" safe under a race (two concurrent requests would
  // have one lose to a unique-constraint violation, not both succeed) —
  // this method's caller (PromoCodeService.redeem) is expected to have
  // already checked for an existing redemption, but that earlier check
  // alone would be a TOCTOU race without this constraint backing it up.
  async recordRedemption(promoCodeId: string, companyId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.promoCodeRedemption.create({ data: { promoCodeId, companyId } }),
      this.prisma.promoCode.update({
        where: { id: promoCodeId },
        data: { redemptionsCount: { increment: 1 } },
      }),
    ]);
  }

  hasRedeemed(promoCodeId: string, companyId: string): Promise<boolean> {
    return this.prisma.promoCodeRedemption
      .findUnique({ where: { promoCodeId_companyId: { promoCodeId, companyId } } })
      .then((row) => row !== null);
  }
}
