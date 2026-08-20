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

describe('CreateInvoiceDto — Phase 9.5 entryMode consistency', () => {
  const manualTable = {
    columns: [
      { role: 'DESCRIPTION', label: 'Désignation' },
      { role: 'QUANTITY', label: 'Quantité' },
      { role: 'UNIT_PRICE', label: 'Prix unitaire' },
      { role: 'LINE_TOTAL', label: 'Total' },
    ],
    rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
  };

  it('defaults to GUIDED and accepts a plain lines-only payload with no entryMode at all', async () => {
    const errors = await validateDto(basePayload());
    expect(errors).toHaveLength(0);
  });

  it('accepts an explicit entryMode GUIDED with lines and no manualTable', async () => {
    const errors = await validateDto(basePayload({ entryMode: 'GUIDED' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects entryMode GUIDED with no lines at all', async () => {
    const errors = await validateDto({ customerName: 'M. Dupont', entryMode: 'GUIDED', lines: [] });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects entryMode GUIDED that also carries a manualTable', async () => {
    const errors = await validateDto(basePayload({ entryMode: 'GUIDED', manualTable }));
    expect(errors).not.toHaveLength(0);
  });

  it('accepts entryMode MANUAL with a manualTable and no lines/serviceLines', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects entryMode MANUAL with no manualTable', async () => {
    const errors = await validateDto({ customerName: 'M. Dupont', entryMode: 'MANUAL' });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects entryMode MANUAL that also carries lines', async () => {
    const errors = await validateDto(basePayload({ entryMode: 'MANUAL', manualTable }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects entryMode MANUAL that also carries serviceLines', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      serviceLines: [{ name: 'Savoir-faire', amountCents: 1000, visibility: 'VISIBLE' }],
    });
    expect(errors).not.toHaveLength(0);
  });
});

describe('CreateInvoiceDto — Phase 9.5 bis totals override', () => {
  const manualTable = {
    columns: [
      { role: 'DESCRIPTION', label: 'Désignation' },
      { role: 'QUANTITY', label: 'Quantité' },
      { role: 'UNIT_PRICE', label: 'Prix unitaire' },
      { role: 'LINE_TOTAL', label: 'Total' },
    ],
    rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
  };

  it('accepts entryMode MANUAL with all three totals overridden', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      subtotalOverrideCents: 100000,
      vatOverrideCents: 5000,
      totalOverrideCents: 105000,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative override', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      totalOverrideCents: -100,
    });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects entryMode GUIDED that carries a totals override', async () => {
    const errors = await validateDto(basePayload({ entryMode: 'GUIDED', totalOverrideCents: 100 }));
    expect(errors).not.toHaveLength(0);
  });
});

describe('CreateInvoiceDto — VAT applicability/rate override', () => {
  const manualTable = {
    columns: [
      { role: 'DESCRIPTION', label: 'Désignation' },
      { role: 'QUANTITY', label: 'Quantité' },
      { role: 'UNIT_PRICE', label: 'Prix unitaire' },
      { role: 'LINE_TOTAL', label: 'Total' },
    ],
    rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
  };

  it('accepts entryMode MANUAL with both VAT overrides set', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      vatApplicableOverride: true,
      vatRateBasisPointsOverride: 550,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts entryMode MANUAL with vatApplicableOverride false and no rate', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      vatApplicableOverride: false,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a rate above 10000 basis points (100%)', async () => {
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      vatRateBasisPointsOverride: 10001,
    });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects entryMode GUIDED that carries either VAT override', async () => {
    const errors = await validateDto(
      basePayload({ entryMode: 'GUIDED', vatApplicableOverride: false }),
    );
    expect(errors).not.toHaveLength(0);

    const rateErrors = await validateDto(
      basePayload({ entryMode: 'GUIDED', vatRateBasisPointsOverride: 2000 }),
    );
    expect(rateErrors).not.toHaveLength(0);
  });
});

describe('CreateInvoiceDto — Phase 1.1-7 reverse charge (autoliquidation)', () => {
  it('accepts reverseChargeApplicable true on a FACTURE (default documentType)', async () => {
    const errors = await validateDto(basePayload({ reverseChargeApplicable: true }));
    expect(errors).toHaveLength(0);
  });

  it('accepts reverseChargeApplicable true on an entryMode MANUAL FACTURE, unlike vatApplicableOverride', async () => {
    const manualTable = {
      columns: [
        { role: 'DESCRIPTION', label: 'Désignation' },
        { role: 'QUANTITY', label: 'Quantité' },
        { role: 'UNIT_PRICE', label: 'Prix unitaire' },
        { role: 'LINE_TOTAL', label: 'Total' },
      ],
      rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
    };
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      reverseChargeApplicable: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects reverseChargeApplicable true on a DEVIS', async () => {
    const errors = await validateDto(
      basePayload({ documentType: 'DEVIS', reverseChargeApplicable: true }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts reverseChargeApplicable false on a DEVIS', async () => {
    const errors = await validateDto(
      basePayload({ documentType: 'DEVIS', reverseChargeApplicable: false }),
    );
    expect(errors).toHaveLength(0);
  });
});

describe('CreateInvoiceDto — Phase 1.1-8 e-invoicing reform baseline fields', () => {
  it('accepts a well-formed customerSiret', async () => {
    const errors = await validateDto(basePayload({ customerSiret: '12345678900012' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a customerSiret that is not exactly 14 digits', async () => {
    const errors = await validateDto(basePayload({ customerSiret: '123' }));
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a deliveryAddress up to the same 300-char bound as customerAddress', async () => {
    const errors = await validateDto(basePayload({ deliveryAddress: 'Chantier - 5 rue du Port' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a deliveryAddress over 300 characters', async () => {
    const errors = await validateDto(basePayload({ deliveryAddress: 'x'.repeat(301) }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects manualNatureOfOperation on entryMode GUIDED — GUIDED always derives it', async () => {
    const errors = await validateDto(
      basePayload({ manualNatureOfOperation: 'PRESTATION_SERVICES' }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts manualNatureOfOperation on entryMode MANUAL', async () => {
    const manualTable = {
      columns: [
        { role: 'DESCRIPTION', label: 'Désignation' },
        { role: 'QUANTITY', label: 'Quantité' },
        { role: 'UNIT_PRICE', label: 'Prix unitaire' },
        { role: 'LINE_TOTAL', label: 'Total' },
      ],
      rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
    };
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      manualNatureOfOperation: 'BIENS_ET_SERVICES',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown manualNatureOfOperation value', async () => {
    const manualTable = {
      columns: [
        { role: 'DESCRIPTION', label: 'Désignation' },
        { role: 'QUANTITY', label: 'Quantité' },
        { role: 'UNIT_PRICE', label: 'Prix unitaire' },
        { role: 'LINE_TOTAL', label: 'Total' },
      ],
      rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
    };
    const errors = await validateDto({
      customerName: 'M. Dupont',
      entryMode: 'MANUAL',
      manualTable,
      manualNatureOfOperation: 'AUTRE_CHOSE',
    });
    expect(errors).not.toHaveLength(0);
  });
});

describe('CreateInvoiceDto — Phase 34 discount line targeting', () => {
  it('accepts a discount line targeting a valid invoice line index', async () => {
    const errors = await validateDto(
      basePayload({
        discountLines: [{ name: 'Remise carrelage', amountCents: 1000, targetLineIndex: 1 }],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts a discount line targeting a valid service line index', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [{ name: 'Main-d’œuvre', amountCents: 10000, visibility: 'VISIBLE' }],
        discountLines: [{ name: 'Remise pose', amountCents: 1000, targetServiceLineIndex: 0 }],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts a discount line with no target at all (applies to the general total)', async () => {
    const errors = await validateDto(
      basePayload({ discountLines: [{ name: 'Remise fidélité', amountCents: 1000 }] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a discount line targeting both a line and a service line at once', async () => {
    const errors = await validateDto(
      basePayload({
        serviceLines: [{ name: 'Main-d’œuvre', amountCents: 10000, visibility: 'VISIBLE' }],
        discountLines: [
          {
            name: 'Remise ambiguë',
            amountCents: 1000,
            targetLineIndex: 0,
            targetServiceLineIndex: 0,
          },
        ],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a targetLineIndex out of bounds of the invoice’s own lines', async () => {
    const errors = await validateDto(
      basePayload({
        discountLines: [{ name: 'Remise invalide', amountCents: 1000, targetLineIndex: 2 }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a targetServiceLineIndex out of bounds when no service lines exist', async () => {
    const errors = await validateDto(
      basePayload({
        discountLines: [{ name: 'Remise invalide', amountCents: 1000, targetServiceLineIndex: 0 }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
