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

describe('CreateServiceDto — Phase 1.6 margin', () => {
  it('accepts no margin configured at all', async () => {
    const errors = await validateDto(basePayload({ pricingMode: 'FIXED', priceCents: 15000 }));
    expect(errors).toHaveLength(0);
  });

  it('accepts NET_AMOUNT margin at or below a FIXED priceCents', async () => {
    const errors = await validateDto(
      basePayload({
        pricingMode: 'FIXED',
        priceCents: 15000,
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 5000,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects NET_AMOUNT margin above a FIXED priceCents', async () => {
    const errors = await validateDto(
      basePayload({
        pricingMode: 'FIXED',
        priceCents: 15000,
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 15001,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts NET_AMOUNT margin on a PERCENTAGE-priced service (no priceCents to cap against)', async () => {
    const errors = await validateDto(
      basePayload({
        pricingMode: 'PERCENTAGE',
        percentageBasisPoints: 3000,
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 1_000_000,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts PERCENTAGE margin at 100% — a pure-markup "Marge 30%" style service', async () => {
    const errors = await validateDto(
      basePayload({
        pricingMode: 'PERCENTAGE',
        percentageBasisPoints: 3000,
        marginMode: 'PERCENTAGE',
        marginPercentageBasisPoints: 10_000,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects marginMode NET_AMOUNT with no marginAmountCents', async () => {
    const errors = await validateDto(
      basePayload({ pricingMode: 'FIXED', priceCents: 15000, marginMode: 'NET_AMOUNT' }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects marginMode NET_AMOUNT that also carries marginPercentageBasisPoints', async () => {
    const errors = await validateDto(
      basePayload({
        pricingMode: 'FIXED',
        priceCents: 15000,
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 5000,
        marginPercentageBasisPoints: 3000,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects marginPercentageBasisPoints/marginAmountCents set with no marginMode', async () => {
    const errors = await validateDto(
      basePayload({ pricingMode: 'FIXED', priceCents: 15000, marginAmountCents: 5000 }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
