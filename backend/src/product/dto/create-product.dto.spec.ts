import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Parquet chêne massif',
    unit: 'SQUARE_METER',
    priceCents: 5000,
    ...overrides,
  };
}

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateProductDto, payload);
  return validate(dto);
}

describe('CreateProductDto — Phase 1.6 margin', () => {
  it('accepts no margin configured at all', async () => {
    const errors = await validateDto(basePayload());
    expect(errors).toHaveLength(0);
  });

  it('accepts NET_AMOUNT margin at or below priceCents', async () => {
    const errors = await validateDto(
      basePayload({ marginMode: 'NET_AMOUNT', marginAmountCents: 3000 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects NET_AMOUNT margin above priceCents', async () => {
    const errors = await validateDto(
      basePayload({ marginMode: 'NET_AMOUNT', marginAmountCents: 5001 }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts PERCENTAGE margin with only marginPercentageBasisPoints set', async () => {
    const errors = await validateDto(
      basePayload({ marginMode: 'PERCENTAGE', marginPercentageBasisPoints: 5000 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects marginMode NET_AMOUNT with no marginAmountCents', async () => {
    const errors = await validateDto(basePayload({ marginMode: 'NET_AMOUNT' }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects marginMode NET_AMOUNT that also carries marginPercentageBasisPoints', async () => {
    const errors = await validateDto(
      basePayload({
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 3000,
        marginPercentageBasisPoints: 5000,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects marginMode PERCENTAGE with no marginPercentageBasisPoints', async () => {
    const errors = await validateDto(basePayload({ marginMode: 'PERCENTAGE' }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a marginPercentageBasisPoints above 100% (10000)', async () => {
    const errors = await validateDto(
      basePayload({ marginMode: 'PERCENTAGE', marginPercentageBasisPoints: 10_001 }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects marginAmountCents set with no marginMode', async () => {
    const errors = await validateDto(basePayload({ marginAmountCents: 3000 }));
    expect(errors).not.toHaveLength(0);
  });
});
