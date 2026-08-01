import { ConflictException } from '@nestjs/common';
import { PlanTier } from '../../generated/prisma/enums';
import { BillingRepository } from '../billing/billing.repository';
import { BillingService } from '../billing/billing.service';
import { PlanGateService } from '../billing/plan-gate.service';
import { ReferralRepository } from './referral.repository';
import { ReferralService } from './referral.service';

function buildService(
  options: {
    referralCodeExists?: boolean[];
    findCompanyIdByReferralCode?: string | null;
    findByReferredCompanyId?: unknown;
    referrerTier?: PlanTier | null;
  } = {},
) {
  const referralCodeExists = jest.fn();
  if (options.referralCodeExists) {
    for (const result of options.referralCodeExists) {
      referralCodeExists.mockResolvedValueOnce(result);
    }
  } else {
    referralCodeExists.mockResolvedValue(false);
  }
  const findCompanyIdByReferralCode = jest
    .fn()
    .mockResolvedValue(options.findCompanyIdByReferralCode ?? null);
  const getCompanyReferralCode = jest.fn().mockResolvedValue('MYCODE1');
  const countConfirmedReferrals = jest.fn().mockResolvedValue(0);
  const sumRewardDaysGranted = jest.fn().mockResolvedValue(0);
  const findByReferredCompanyId = jest
    .fn()
    .mockResolvedValue(options.findByReferredCompanyId ?? null);
  const create = jest.fn().mockResolvedValue(undefined);
  const markRewardGranted = jest.fn().mockResolvedValue(undefined);
  const repository = {
    referralCodeExists,
    findCompanyIdByReferralCode,
    getCompanyReferralCode,
    countConfirmedReferrals,
    sumRewardDaysGranted,
    findByReferredCompanyId,
    create,
    markRewardGranted,
  } as unknown as ReferralRepository;

  const grantPlanDays = jest
    .fn()
    .mockResolvedValue({ until: new Date('2027-01-01'), tier: PlanTier.PREMIUM });
  const billingRepository = { grantPlanDays } as unknown as BillingRepository;

  const grantReferralDiscount = jest.fn().mockResolvedValue(undefined);
  const billingService = { grantReferralDiscount } as unknown as BillingService;

  const getEffectivePlanTier = jest.fn().mockResolvedValue(options.referrerTier ?? null);
  const planGateService = { getEffectivePlanTier } as unknown as PlanGateService;

  return {
    service: new ReferralService(repository, billingRepository, billingService, planGateService),
    referralCodeExists,
    findCompanyIdByReferralCode,
    create,
    markRewardGranted,
    sumRewardDaysGranted,
    grantPlanDays,
    grantReferralDiscount,
    getEffectivePlanTier,
  };
}

describe('ReferralService.generateUniqueCode', () => {
  it('retries on a generated collision until a free code is found', async () => {
    const { service, referralCodeExists } = buildService({
      referralCodeExists: [true, false],
    });
    const code = await service.generateUniqueCode();
    expect(referralCodeExists).toHaveBeenCalledTimes(2);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('gives up after too many collisions', async () => {
    const { service } = buildService({
      referralCodeExists: [true, true, true, true, true],
    });
    await expect(service.generateUniqueCode()).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReferralService.attributeReferral', () => {
  const REFERRED_COMPANY_ID = 'company-referred';

  it('does nothing when no code is provided', async () => {
    const { service, findCompanyIdByReferralCode, create } = buildService();
    await service.attributeReferral(undefined, REFERRED_COMPANY_ID);
    expect(findCompanyIdByReferralCode).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('silently ignores an unknown code rather than throwing', async () => {
    const { service, create } = buildService({ findCompanyIdByReferralCode: null });
    await expect(service.attributeReferral('NOPE', REFERRED_COMPANY_ID)).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('normalizes the code and creates a pending Referral row for a valid one', async () => {
    const { service, create, findCompanyIdByReferralCode } = buildService({
      findCompanyIdByReferralCode: 'company-referrer',
    });
    await service.attributeReferral('mycode1', REFERRED_COMPANY_ID);
    expect(findCompanyIdByReferralCode).toHaveBeenCalledWith('MYCODE1');
    expect(create).toHaveBeenCalledWith('company-referrer', REFERRED_COMPANY_ID);
  });

  it('never creates a self-referral', async () => {
    const { service, create } = buildService({
      findCompanyIdByReferralCode: REFERRED_COMPANY_ID,
    });
    await service.attributeReferral('MYCODE1', REFERRED_COMPANY_ID);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ReferralService.grantRewardForVerifiedEmail', () => {
  it('does nothing when there is no pending referral', async () => {
    const { service, grantPlanDays, grantReferralDiscount } = buildService({
      findByReferredCompanyId: null,
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPlanDays).not.toHaveBeenCalled();
    expect(grantReferralDiscount).not.toHaveBeenCalled();
  });

  it('is idempotent once the reward was already granted', async () => {
    const { service, grantPlanDays, grantReferralDiscount } = buildService({
      findByReferredCompanyId: {
        id: 'referral-1',
        referrerCompanyId: 'referrer-1',
        referredCompanyId: 'company-1',
        rewardGrantedAt: new Date('2026-01-01'),
      },
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPlanDays).not.toHaveBeenCalled();
    expect(grantReferralDiscount).not.toHaveBeenCalled();
  });

  it('grants a referrer with no active plan the Essentiel-floor 10 days, always as Premium', async () => {
    const { service, grantPlanDays, grantReferralDiscount, markRewardGranted } = buildService({
      findByReferredCompanyId: {
        id: 'referral-1',
        referrerCompanyId: 'referrer-1',
        referredCompanyId: 'company-1',
        rewardGrantedAt: null,
      },
      referrerTier: null,
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPlanDays).toHaveBeenCalledWith('referrer-1', PlanTier.PREMIUM, 10);
    expect(grantPlanDays).not.toHaveBeenCalledWith(
      'company-1',
      expect.anything(),
      expect.anything(),
    );
    expect(grantReferralDiscount).toHaveBeenCalledWith('company-1');
    expect(markRewardGranted).toHaveBeenCalledWith('referral-1', 10);
  });

  it('grants a Pro referrer 20 days', async () => {
    const { service, grantPlanDays } = buildService({
      findByReferredCompanyId: {
        id: 'referral-1',
        referrerCompanyId: 'referrer-1',
        referredCompanyId: 'company-1',
        rewardGrantedAt: null,
      },
      referrerTier: PlanTier.PRO,
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPlanDays).toHaveBeenCalledWith('referrer-1', PlanTier.PREMIUM, 20);
  });

  it('grants a Premium referrer the full 30 days', async () => {
    const { service, grantPlanDays } = buildService({
      findByReferredCompanyId: {
        id: 'referral-1',
        referrerCompanyId: 'referrer-1',
        referredCompanyId: 'company-1',
        rewardGrantedAt: null,
      },
      referrerTier: PlanTier.PREMIUM,
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPlanDays).toHaveBeenCalledWith('referrer-1', PlanTier.PREMIUM, 30);
  });
});
