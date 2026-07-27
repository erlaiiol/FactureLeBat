import { ConflictException } from '@nestjs/common';
import { BillingRepository } from '../billing/billing.repository';
import { BillingService } from '../billing/billing.service';
import { ReferralRepository } from './referral.repository';
import { ReferralService } from './referral.service';

function buildService(
  options: {
    referralCodeExists?: boolean[];
    findCompanyIdByReferralCode?: string | null;
    findByReferredCompanyId?: unknown;
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
    findByReferredCompanyId,
    create,
    markRewardGranted,
  } as unknown as ReferralRepository;

  const grantPremiumDays = jest.fn().mockResolvedValue(new Date('2027-01-01'));
  const billingRepository = { grantPremiumDays } as unknown as BillingRepository;

  const grantReferralDiscount = jest.fn().mockResolvedValue(undefined);
  const billingService = { grantReferralDiscount } as unknown as BillingService;

  return {
    service: new ReferralService(repository, billingRepository, billingService),
    referralCodeExists,
    findCompanyIdByReferralCode,
    create,
    markRewardGranted,
    grantPremiumDays,
    grantReferralDiscount,
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
    const { service, grantPremiumDays, grantReferralDiscount } = buildService({
      findByReferredCompanyId: null,
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPremiumDays).not.toHaveBeenCalled();
    expect(grantReferralDiscount).not.toHaveBeenCalled();
  });

  it('is idempotent once the reward was already granted', async () => {
    const { service, grantPremiumDays, grantReferralDiscount } = buildService({
      findByReferredCompanyId: {
        id: 'referral-1',
        referrerCompanyId: 'referrer-1',
        referredCompanyId: 'company-1',
        rewardGrantedAt: new Date('2026-01-01'),
      },
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPremiumDays).not.toHaveBeenCalled();
    expect(grantReferralDiscount).not.toHaveBeenCalled();
  });

  it('grants the parrain 30 free days and the filleul a Stripe discount, then marks the reward granted', async () => {
    const { service, grantPremiumDays, grantReferralDiscount, markRewardGranted } = buildService({
      findByReferredCompanyId: {
        id: 'referral-1',
        referrerCompanyId: 'referrer-1',
        referredCompanyId: 'company-1',
        rewardGrantedAt: null,
      },
    });
    await service.grantRewardForVerifiedEmail('company-1');
    expect(grantPremiumDays).toHaveBeenCalledWith('referrer-1', 30);
    expect(grantPremiumDays).not.toHaveBeenCalledWith('company-1', expect.anything());
    expect(grantReferralDiscount).toHaveBeenCalledWith('company-1');
    expect(markRewardGranted).toHaveBeenCalledWith('referral-1');
  });
});
