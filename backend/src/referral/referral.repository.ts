import { Injectable } from '@nestjs/common';
import { ReferralModel as Referral } from '../../generated/prisma/models';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCompanyIdByReferralCode(code: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    return company?.id ?? null;
  }

  async referralCodeExists(code: string): Promise<boolean> {
    return (await this.findCompanyIdByReferralCode(code)) !== null;
  }

  getCompanyReferralCode(companyId: string): Promise<string> {
    return this.prisma.company
      .findUniqueOrThrow({ where: { id: companyId }, select: { referralCode: true } })
      .then((c) => c.referralCode);
  }

  findByReferredCompanyId(referredCompanyId: string): Promise<Referral | null> {
    return this.prisma.referral.findUnique({ where: { referredCompanyId } });
  }

  create(referrerCompanyId: string, referredCompanyId: string): Promise<Referral> {
    return this.prisma.referral.create({ data: { referrerCompanyId, referredCompanyId } });
  }

  // Phase 30: rewardDaysGranted records the actual number of days granted
  // for this specific referral (varies with the referrer's tier at the
  // time, see REFERRAL_PARRAIN_REWARD_DAYS_BY_TIER) — sumRewardDaysGranted
  // below reads it back instead of multiplying confirmedReferrals by a now-
  // inaccurate flat constant.
  markRewardGranted(id: string, rewardDaysGranted: number): Promise<Referral> {
    return this.prisma.referral.update({
      where: { id },
      data: { rewardGrantedAt: new Date(), rewardDaysGranted },
    });
  }

  countConfirmedReferrals(referrerCompanyId: string): Promise<number> {
    return this.prisma.referral.count({
      where: { referrerCompanyId, rewardGrantedAt: { not: null } },
    });
  }

  async sumRewardDaysGranted(referrerCompanyId: string): Promise<number> {
    const { _sum } = await this.prisma.referral.aggregate({
      where: { referrerCompanyId, rewardGrantedAt: { not: null } },
      _sum: { rewardDaysGranted: true },
    });
    return _sum.rewardDaysGranted ?? 0;
  }
}
