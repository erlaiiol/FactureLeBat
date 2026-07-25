import { Injectable } from '@nestjs/common';
import { BillingRepository } from '../billing/billing.repository';
import { hasPremiumAccess } from '../billing/premium-gate.service';
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
  // grantPremiumDays) — an admin grant is just a promo-code redemption
  // without the code, see docs/roadmap.md Phase 14.
  grantPremiumDays(companyId: string, days: number): Promise<Date> {
    return this.billingRepository.grantPremiumDays(companyId, days);
  }
}
