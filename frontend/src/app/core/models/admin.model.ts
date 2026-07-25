import { UserRole } from './auth.model';
import { SubscriptionStatus } from './billing.model';

// Mirrors the backend's AdminUserSummary (admin/entities/admin-user-summary.entity.ts).
export interface AdminUserSummary {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  createdAt: string;
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  premiumGrantedUntil: string | null;
  invoiceCount: number;
}

export interface AdminUserList {
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PromoCode {
  id: string;
  code: string;
  durationDays: number;
  maxRedemptions: number | null;
  redemptionsCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromoCodeRequest {
  code?: string;
  durationDays: number;
  maxRedemptions?: number;
  expiresAt?: string;
}
