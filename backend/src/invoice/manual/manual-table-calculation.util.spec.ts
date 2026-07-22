import { computeManualRowTotalCents } from './manual-table-calculation.util';

const COLUMNS = [
  { role: 'DESCRIPTION' as const },
  { role: 'QUANTITY' as const },
  { role: 'UNIT_PRICE' as const },
  { role: 'LINE_TOTAL' as const },
];

describe('computeManualRowTotalCents', () => {
  it('reads the LINE_TOTAL cell directly, never quantity x unit price', () => {
    const cents = computeManualRowTotalCents(COLUMNS, [
      'Parquet chêne massif',
      '10',
      '45.00',
      '450.00',
    ]);
    expect(cents).toBe(45000);
  });

  it('accepts a comma decimal separator', () => {
    const cents = computeManualRowTotalCents(COLUMNS, ['Parquet', '10,5', '45,00', '472,50']);
    expect(cents).toBe(47250);
  });

  it('ignores QUANTITY/UNIT_PRICE entirely — they are purely informational free text', () => {
    const cents = computeManualRowTotalCents(COLUMNS, [
      'Parquet',
      '2 boites',
      'environ 45',
      '1000',
    ]);
    expect(cents).toBe(1000_00);
  });

  it('treats a blank LINE_TOTAL cell as zero rather than throwing', () => {
    const cents = computeManualRowTotalCents(COLUMNS, ['Parquet', '10', '45.00', '']);
    expect(cents).toBe(0);
  });

  it('treats an unparseable LINE_TOTAL cell as zero rather than throwing', () => {
    const cents = computeManualRowTotalCents(COLUMNS, ['Parquet', '10', '45.00', 'beaucoup']);
    expect(cents).toBe(0);
  });

  it('finds the LINE_TOTAL column regardless of its position among CUSTOM columns', () => {
    const columnsWithCustom = [
      { role: 'CUSTOM' as const },
      { role: 'LINE_TOTAL' as const },
      { role: 'DESCRIPTION' as const },
      { role: 'QUANTITY' as const },
    ];
    const cents = computeManualRowTotalCents(columnsWithCustom, [
      'Chantier Dupont',
      '450.00',
      'Parquet',
      '10',
    ]);
    expect(cents).toBe(45000);
  });
});
