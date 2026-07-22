import { InvoiceCalculationService } from '../calculation/invoice-calculation.service';
import { computeManualRowTotalCents } from './manual-table-calculation.util';

const COLUMNS = [
  { role: 'DESCRIPTION' as const },
  { role: 'QUANTITY' as const },
  { role: 'UNIT_PRICE' as const },
];

describe('computeManualRowTotalCents', () => {
  const calculationService = new InvoiceCalculationService();

  it('prices a row as plain quantity x unit price, like a GUIDED UNIT-mode line', () => {
    const cents = computeManualRowTotalCents(calculationService, COLUMNS, [
      'Parquet chêne massif',
      '10',
      '45.00',
    ]);
    expect(cents).toBe(45000);
  });

  it('accepts a comma decimal separator in either cell', () => {
    const cents = computeManualRowTotalCents(calculationService, COLUMNS, [
      'Parquet',
      '10,5',
      '45,00',
    ]);
    expect(cents).toBe(47250);
  });

  it('never applies a waste surcharge — that concept does not exist on the manual canvas', () => {
    // A GUIDED SQUARE_METER line with the same numbers would bill more due
    // to waste surcharge; a manual row must not silently pick that up.
    const cents = computeManualRowTotalCents(calculationService, COLUMNS, ['Parquet', '10', '100']);
    expect(cents).toBe(1000_00);
  });

  it('treats an unparseable quantity cell as zero rather than throwing', () => {
    const cents = computeManualRowTotalCents(calculationService, COLUMNS, [
      'Parquet',
      'beaucoup',
      '45.00',
    ]);
    expect(cents).toBe(0);
  });

  it('treats an unparseable unit price cell as zero rather than throwing', () => {
    const cents = computeManualRowTotalCents(calculationService, COLUMNS, ['Parquet', '10', '']);
    expect(cents).toBe(0);
  });

  it('finds the QUANTITY/UNIT_PRICE columns regardless of their position among CUSTOM columns', () => {
    const columnsWithCustom = [
      { role: 'CUSTOM' as const },
      { role: 'UNIT_PRICE' as const },
      { role: 'DESCRIPTION' as const },
      { role: 'QUANTITY' as const },
    ];
    const cents = computeManualRowTotalCents(calculationService, columnsWithCustom, [
      'Chantier Dupont',
      '45.00',
      'Parquet',
      '10',
    ]);
    expect(cents).toBe(45000);
  });
});
