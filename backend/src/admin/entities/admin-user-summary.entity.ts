import { SubscriptionStatus, UserRole } from '../../../generated/prisma/enums';

// One row of GET /admin/users — a User joined with its 1:1 Company's
// billing state and invoice count. Never includes passwordHash/googleId
// (same "public shape only" discipline as PublicUser), an admin manages
// accounts, it doesn't need their credentials.
export interface AdminUserSummary {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  createdAt: Date;
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  premiumGrantedUntil: Date | null;
  invoiceCount: number;
}

export interface AdminUserList {
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}
