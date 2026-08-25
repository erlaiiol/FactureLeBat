import { parseDecimalToCents, toReceivedInvoiceData } from './received-invoice-mapper.util';

describe('parseDecimalToCents', () => {
  it('returns null for undefined', () => {
    expect(parseDecimalToCents(undefined)).toBeNull();
  });

  it('parses a plain integer', () => {
    expect(parseDecimalToCents('450')).toBe(45000);
  });

  it('parses a two-decimal amount', () => {
    expect(parseDecimalToCents('450.50')).toBe(45050);
  });

  it('parses a single-decimal amount (pads to 2 places)', () => {
    expect(parseDecimalToCents('450.5')).toBe(45050);
  });

  it('truncates (does not round) amounts with more than 2 decimal digits', () => {
    expect(parseDecimalToCents('450.567')).toBe(45056);
  });

  it('handles a negative amount', () => {
    expect(parseDecimalToCents('-45.00')).toBe(-4500);
  });

  it('handles zero', () => {
    expect(parseDecimalToCents('0.00')).toBe(0);
  });
});

describe('toReceivedInvoiceData', () => {
  it('maps a fully-populated SUPER PDP incoming invoice', () => {
    const result = toReceivedInvoiceData({
      id: 42,
      en_invoice: {
        number: 'FACT-2026-001',
        issue_date: '2026-01-15',
        currency_code: 'EUR',
        seller: {
          name: 'Fournisseur SARL',
          legal_registration_identifier: { value: '12345678900012', scheme: '0002' },
        },
        totals: { total_with_vat: '540.00', total_vat_amount: '90.00' },
      },
    });

    expect(result).toEqual({
      superPdpInvoiceId: '42',
      issuerName: 'Fournisseur SARL',
      issuerSiret: '12345678900012',
      number: 'FACT-2026-001',
      issueDate: new Date('2026-01-15'),
      totalInclVatCents: 54000,
      vatAmountCents: 9000,
      currencyCode: 'EUR',
    });
  });

  it('degrades gracefully when en_invoice is entirely absent', () => {
    const result = toReceivedInvoiceData({ id: 7 });

    expect(result).toEqual({
      superPdpInvoiceId: '7',
      issuerName: null,
      issuerSiret: null,
      number: null,
      issueDate: null,
      totalInclVatCents: null,
      vatAmountCents: null,
      currencyCode: null,
    });
  });

  it('degrades gracefully when only some nested fields are present', () => {
    const result = toReceivedInvoiceData({
      id: 8,
      en_invoice: { number: 'X-1', seller: { name: 'Sans SIRET' } },
    });

    expect(result.number).toBe('X-1');
    expect(result.issuerName).toBe('Sans SIRET');
    expect(result.issuerSiret).toBeNull();
    expect(result.totalInclVatCents).toBeNull();
  });
});
