export class ReferralStatusEntity {
  code: string;
  confirmedReferrals: number;
  // Total free premium days this company has earned as a parrain — the
  // filleul side of the reward is a one-time Stripe discount, not days, so
  // it has no equivalent field here (see ReferralService.getStatus).
  rewardDaysEarned: number;
}
