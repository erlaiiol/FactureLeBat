import { UserRole } from './auth.model';
import { PlanTier, SubscriptionStatus } from './billing.model';

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
  planTier: PlanTier | null;
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
  planTier: PlanTier;
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
  planTier: PlanTier;
  durationDays: number;
  maxRedemptions?: number;
  expiresAt?: string;
}

// Mirrors the backend's PushDeviceSummary (push-notification/entities/push-device.entity.ts).
export interface PushDeviceSummary {
  id: string;
  platform: 'IOS' | 'ANDROID';
  token: string;
  lastActiveAt: string;
  createdAt: string;
  userEmail: string;
  companyName: string;
}

export interface PushDeviceList {
  devices: PushDeviceSummary[];
  total: number;
  page: number;
  pageSize: number;
}
