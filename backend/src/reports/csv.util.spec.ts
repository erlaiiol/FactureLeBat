import { buildQuarterlyReportCsv } from './csv.util';
import { QuarterlyReport } from './entities/report.entity';

function reportFixture(overrides: Partial<QuarterlyReport> = {}): QuarterlyReport {
  return {
    from: '2026-04-01T00:00:00.000Z',
    to: '2026-06-30T23:59:59.999Z',
    totalExclVatCents: 45000,
    byCategory: [
      { category: 'VENTE_MARCHANDISES', totalExclVatCents: 45000 },
      { category: 'PRESTATION_BIC', totalExclVatCents: 0 },
      { category: 'PRESTATION_BNC', totalExclVatCents: 0 },
      { category: 'NON_CATEGORISE', totalExclVatCents: 0 },
    ],
    invoices: [
      {
        id: 'inv-1',
        number: 'F-000001',
        customerName: 'M. Dupont',
        paidAt: new Date('2026-04-12'),
        totalInclVatCents: 54000,
      },
    ],
    plafondWarning: null,
    estimatedCharges: {
      applicable: true,
      versementLiberatoireOptIn: false,
      rows: [
        {
          category: 'VENTE_MARCHANDISES',
          totalExclVatCents: 45000,
          cotisationRateBasisPoints: 1230,
          cotisationCents: 5535,
          versementLiberatoireRateBasisPoints: 0,
          versementLiberatoireCents: 0,
        },
        {
          category: 'PRESTATION_BIC',
          totalExclVatCents: 0,
          cotisationRateBasisPoints: 2120,
          cotisationCents: 0,
          versementLiberatoireRateBasisPoints: 0,
          versementLiberatoireCents: 0,
        },
        {
          category: 'PRESTATION_BNC',
          totalExclVatCents: 0,
          cotisationRateBasisPoints: 2110,
          cotisationCents: 0,
          versementLiberatoireRateBasisPoints: 0,
          versementLiberatoireCents: 0,
        },
      ],
      uncategorizedExclVatCents: 0,
      cotisationsSocialesCents: 5535,
      versementLiberatoireCents: 0,
      totalEstimatedCents: 5535,
    },
    ...overrides,
  };
}

describe('buildQuarterlyReportCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads accented labels correctly', () => {
    const csv = buildQuarterlyReportCsv(reportFixture());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('uses semicolons as the field delimiter and a comma decimal separator', () => {
    const csv = buildQuarterlyReportCsv(reportFixture());
    expect(csv).toContain('Total encaissé HT;450,00');
    expect(csv).toContain('Vente de marchandises;450,00');
  });

  it('lists every paid invoice with its TTC amount', () => {
    const csv = buildQuarterlyReportCsv(reportFixture());
    expect(csv).toContain('F-000001;M. Dupont;12/04/2026;540,00');
  });

  it('includes the estimated cotisations sociales when applicable', () => {
    const csv = buildQuarterlyReportCsv(reportFixture());
    expect(csv).toContain('Total cotisations sociales estimées;55,35');
    expect(csv).toContain('Total estimé (charges + impôt);55,35');
  });

  it('shows an honest message instead of a number when the estimate is not applicable', () => {
    const csv = buildQuarterlyReportCsv(
      reportFixture({
        estimatedCharges: {
          applicable: false,
          versementLiberatoireOptIn: false,
          rows: [],
          uncategorizedExclVatCents: 0,
          cotisationsSocialesCents: 0,
          versementLiberatoireCents: 0,
          totalEstimatedCents: 0,
        },
      }),
    );
    expect(csv).toContain('expert-comptable');
    expect(csv).not.toContain('Total cotisations sociales estimées');
  });

  it('quotes a customer name containing the delimiter', () => {
    const csv = buildQuarterlyReportCsv(
      reportFixture({
        invoices: [
          {
            id: 'inv-1',
            number: 'F-000001',
            customerName: 'Dupont; Martin',
            paidAt: new Date('2026-04-12'),
            totalInclVatCents: 54000,
          },
        ],
      }),
    );
    expect(csv).toContain('"Dupont; Martin"');
  });
});
