import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'M. Dupont',
    lines: [
      { description: 'Parquet', unit: 'SQUARE_METER', quantity: 10, unitPriceCents: 4500 },
      { description: 'Plinthes', unit: 'UNIT', quantity: 5, unitPriceCents: 800 },
    ],
    ...overrides,
  };
}

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateInvoiceDto, payload);
  return validate(dto);
}

describe('CreateInvoiceDto — Phase 5 service lines', () => {
  it('accepts an invoice with no service lines at all', async () => {
    const errors = await validateDto(basePayload());
    expect(errors).toHaveLength(0);
  });

  it('accepts a VISIBLE service line with no redistribution fields', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [{ name: 'Main-d’œuvre', amountCents: 10000, visibility: 'VISIBLE' }],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a VISIBLE service line that also carries a redistribution strategy', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Main-d’œuvre',
            amountCents: 10000,
            visibility: 'VISIBLE',
            redistributionStrategy: 'EQUAL',
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a REDISTRIBUTED + EQUAL service line with no explicit weights', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'EQUAL',
          },
        ],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a REDISTRIBUTED service line with no strategy at all', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [{ name: 'Savoir-faire', amountCents: 10000, visibility: 'REDISTRIBUTED' }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a REDISTRIBUTED + WEIGHTED service line whose weights match the invoice line count', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'WEIGHTED',
            weights: [1, 3],
          },
        ],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects WEIGHTED weights whose length does not match the invoice line count', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'WEIGHTED',
            weights: [1, 3, 5],
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects WEIGHTED weights that all sum to zero', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'WEIGHTED',
            weights: [0, 0],
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a negative weight', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'WEIGHTED',
            weights: [-1, 5],
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a REDISTRIBUTED + WEIGHTED service line with no weights supplied', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'WEIGHTED',
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects an EQUAL strategy that also supplies an explicit weights array', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: 'EQUAL',
            weights: [1, 1],
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });
});

describe('CreateInvoiceDto — Phase 8.5 packaging quantity', () => {
  it('accepts a line with no packaging quantity at all (sold continuously, unchanged behavior)', async () => {
    const errors = await validateDto(basePayload());
    expect(errors).toHaveLength(0);
  });

  it('accepts a line with a packaging quantity and an explicit roundUpToPackaging flag', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      lines: [
        {
          description: 'Parquet',
          unit: 'SQUARE_METER',
          quantity: 23,
          unitPriceCents: 4500,
          packagingQuantity: 9,
          roundUpToPackaging: false,
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a zero or negative packaging quantity', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      lines: [
        {
          description: 'Parquet',
          unit: 'SQUARE_METER',
          quantity: 23,
          unitPriceCents: 4500,
          packagingQuantity: 0,
        },
      ],
    });
    expect(errors).not.toHaveLength(0);
  });
});
