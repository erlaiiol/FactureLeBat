import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDiscountDto } from './create-discount.dto';

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Remise fidélité',
    ...overrides,
  };
}

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateDiscountDto, payload);
  return validate(dto);
}

describe('CreateDiscountDto — Phase 32 discount type consistency', () => {
  it('accepts FIXED with only fixedAmountCents set', async () => {
    const errors = await validateDto(
      basePayload({ discountType: 'FIXED', fixedAmountCents: 5000 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts PERCENTAGE with only percentageBasisPoints set', async () => {
    const errors = await validateDto(
      basePayload({ discountType: 'PERCENTAGE', percentageBasisPoints: 1000 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects FIXED with no fixedAmountCents', async () => {
    const errors = await validateDto(basePayload({ discountType: 'FIXED' }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects FIXED that also carries a percentageBasisPoints', async () => {
    const errors = await validateDto(
      basePayload({ discountType: 'FIXED', fixedAmountCents: 5000, percentageBasisPoints: 1000 }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects PERCENTAGE with no percentageBasisPoints', async () => {
    const errors = await validateDto(basePayload({ discountType: 'PERCENTAGE' }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects PERCENTAGE that also carries a fixedAmountCents', async () => {
    const errors = await validateDto(
      basePayload({
        discountType: 'PERCENTAGE',
        percentageBasisPoints: 1000,
        fixedAmountCents: 5000,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a percentageBasisPoints above 100% (10000)', async () => {
    const errors = await validateDto(
      basePayload({ discountType: 'PERCENTAGE', percentageBasisPoints: 10_001 }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
