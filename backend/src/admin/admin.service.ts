import { Injectable } from '@nestjs/common';
import { PlanTier } from '../../generated/prisma/enums';
import { BillingRepository } from '../billing/billing.repository';
import { getEffectivePlanTier, hasPremiumAccess } from '../billing/plan-gate.service';
import { ADMIN_USERS_PAGE_SIZE, AdminRepository, AdminUserRow } from './admin.repository';
import { AdminUserList, AdminUserSummary } from './entities/admin-user-summary.entity';

function toSummary(row: AdminUserRow): AdminUserSummary {
  return {
    userId: row.id,
    email: row.email,
    role: row.role,
    companyId: row.company?.id ?? '',
    companyName: row.company?.name ?? '',
    createdAt: row.createdAt,
    subscriptionStatus: row.company?.subscriptionStatus ?? 'NONE',
    hasPremiumAccess: row.company ? hasPremiumAccess(row.company) : false,
    planTier: row.company ? getEffectivePlanTier(row.company) : null,
    premiumGrantedUntil: row.company?.premiumGrantedUntil ?? null,
    invoiceCount: row.company?._count.invoices ?? 0,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly billingRepository: BillingRepository,
  ) {}

  async listUsers(search: string | undefined, page: number): Promise<AdminUserList> {
    const { rows, total } = await this.adminRepository.listUsers(search, page);
    return {
      users: rows.map(toSummary),
      total,
      page: Math.max(1, page),
      pageSize: ADMIN_USERS_PAGE_SIZE,
    };
  }

  // Same mechanism a redeemed PromoCode uses (BillingRepository.
  // grantPlanDays) — an admin grant is just a promo-code redemption without
  // the code, see docs/roadmap.md Phase 14/30. The admin now picks which
  // tier to grant instead of a single implicit "premium".
  grantPlanDays(
    companyId: string,
    tier: PlanTier,
    days: number,
  ): Promise<{ until: Date; tier: PlanTier }> {
    return this.billingRepository.grantPlanDays(companyId, tier, days);
  }
}
