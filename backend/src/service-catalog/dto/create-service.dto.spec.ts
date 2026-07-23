import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Main-d’œuvre pose parquet',
    ...overrides,
  };
}

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateServiceDto, payload);
  return validate(dto);
}

describe('CreateServiceDto — Phase 13.5 pricing mode', () => {
  it('accepts FIXED pricing with only priceCents set', async () => {
    const errors = await validateDto(basePayload({ pricingMode: 'FIXED', priceCents: 15000 }));
    expect(errors).toHaveLength(0);
  });

  it('accepts PERCENTAGE pricing with only percentageBasisPoints set', async () => {
    const errors = await validateDto(
      basePayload({ pricingMode: 'PERCENTAGE', percentageBasisPoints: 3000 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects FIXED pricing with no priceCents', async () => {
    const errors = await validateDto(basePayload({ pricingMode: 'FIXED' }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects FIXED pricing that also carries a percentageBasisPoints', async () => {
    const errors = await validateDto(
      basePayload({ pricingMode: 'FIXED', priceCents: 15000, percentageBasisPoints: 3000 }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects PERCENTAGE pricing with no percentageBasisPoints', async () => {
    const errors = await validateDto(basePayload({ pricingMode: 'PERCENTAGE' }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects PERCENTAGE pricing that also carries a priceCents', async () => {
    const errors = await validateDto(
      basePayload({ pricingMode: 'PERCENTAGE', percentageBasisPoints: 3000, priceCents: 15000 }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a percentageBasisPoints above 100% (10000)', async () => {
    const errors = await validateDto(
      basePayload({ pricingMode: 'PERCENTAGE', percentageBasisPoints: 10_001 }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
