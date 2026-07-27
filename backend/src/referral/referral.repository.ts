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

  markRewardGranted(id: string): Promise<Referral> {
    return this.prisma.referral.update({ where: { id }, data: { rewardGrantedAt: new Date() } });
  }

  countConfirmedReferrals(referrerCompanyId: string): Promise<number> {
    return this.prisma.referral.count({
      where: { referrerCompanyId, rewardGrantedAt: { not: null } },
    });
  }
}
