// Mirrors the backend's ReferralStatusEntity (referral/entities/referral-status.entity.ts).
export interface ReferralStatus {
  code: string;
  confirmedReferrals: number;
  rewardDaysEarned: number;
}
