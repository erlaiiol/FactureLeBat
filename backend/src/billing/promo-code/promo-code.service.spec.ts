import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PlanTier } from '../../../generated/prisma/enums';
import { BillingRepository } from '../billing.repository';
import { PromoCodeRepository } from './promo-code.repository';
import { PromoCodeService } from './promo-code.service';

function buildService(
  options: {
    findByCodeResults?: Array<unknown>;
    hasRedeemed?: boolean;
  } = {},
) {
  const findByCode = jest.fn();
  if (options.findByCodeResults) {
    for (const result of options.findByCodeResults) {
      findByCode.mockResolvedValueOnce(result);
    }
  } else {
    findByCode.mockResolvedValue(null);
  }
  const create = jest
    .fn()
    .mockImplementation((data: unknown) => Promise.resolve({ id: 'promo-1', ...(data as object) }));
  const hasRedeemed = jest.fn().mockResolvedValue(options.hasRedeemed ?? false);
  const recordRedemption = jest.fn().mockResolvedValue(undefined);
  const setActive = jest.fn().mockResolvedValue(undefined);
  const deleteFn = jest.fn().mockResolvedValue(undefined);
  const repository = {
    findByCode,
    create,
    hasRedeemed,
    recordRedemption,
    setActive,
    delete: deleteFn,
  } as unknown as PromoCodeRepository;

  const grantPlanDays = jest
    .fn()
    .mockResolvedValue({ until: new Date('2027-01-01'), tier: PlanTier.PREMIUM });
  const billingRepository = { grantPlanDays } as unknown as BillingRepository;

  return {
    service: new PromoCodeService(repository, billingRepository),
    findByCode,
    create,
    hasRedeemed,
    recordRedemption,
    grantPlanDays,
  };
}

function activeCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    code: 'PREMIUM1M',
    planTier: PlanTier.PREMIUM,
    durationDays: 30,
    maxRedemptions: null,
    redemptionsCount: 0,
    active: true,
    expiresAt: null,
    ...overrides,
  };
}

describe('PromoCodeService.redeem', () => {
  const COMPANY_ID = 'company-1';

  it('grants the code plan and records the redemption on a valid, unused code', async () => {
    const { service, recordRedemption, grantPlanDays } = buildService({
      findByCodeResults: [activeCode()],
    });

    const result = await service.redeem(COMPANY_ID, 'premium1m');

    expect(recordRedemption).toHaveBeenCalledWith('promo-1', COMPANY_ID);
    expect(grantPlanDays).toHaveBeenCalledWith(COMPANY_ID, PlanTier.PREMIUM, 30);
    expect(result).toEqual({ until: new Date('2027-01-01'), tier: PlanTier.PREMIUM });
  });

  it('rejects an unknown code', async () => {
    const { service } = buildService({ findByCodeResults: [null] });
    await expect(service.redeem(COMPANY_ID, 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a deactivated code', async () => {
    const { service } = buildService({ findByCodeResults: [activeCode({ active: false })] });
    await expect(service.redeem(COMPANY_ID, 'PREMIUM1M')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an expired code', async () => {
    const { service } = buildService({
      findByCodeResults: [activeCode({ expiresAt: new Date('2020-01-01') })],
    });
    await expect(service.redeem(COMPANY_ID, 'PREMIUM1M')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a code that already hit its max redemptions', async () => {
    const { service } = buildService({
      findByCodeResults: [activeCode({ maxRedemptions: 5, redemptionsCount: 5 })],
    });
    await expect(service.redeem(COMPANY_ID, 'PREMIUM1M')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a company redeeming the same code twice', async () => {
    const { service } = buildService({ findByCodeResults: [activeCode()], hasRedeemed: true });
    await expect(service.redeem(COMPANY_ID, 'PREMIUM1M')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PromoCodeService.create', () => {
  it('uses the requested code, uppercased, when available', async () => {
    const { service, create } = buildService({ findByCodeResults: [null] });
    await service.create({ code: 'salon2026', planTier: PlanTier.PRO, durationDays: 14 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SALON2026', planTier: PlanTier.PRO, durationDays: 14 }),
    );
  });

  it('rejects a requested code that already exists', async () => {
    const { service } = buildService({ findByCodeResults: [activeCode({ code: 'SALON2026' })] });
    await expect(
      service.create({ code: 'salon2026', planTier: PlanTier.PREMIUM, durationDays: 14 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('generates a code when none is requested', async () => {
    const { service, create } = buildService({ findByCodeResults: [null] });
    await service.create({ planTier: PlanTier.ESSENTIEL, durationDays: 30 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringMatching(/^[A-Z0-9]{10}$/) as unknown }),
    );
  });
});
