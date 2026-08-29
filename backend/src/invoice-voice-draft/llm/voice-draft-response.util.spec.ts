import { parseResolveDraftInput } from './voice-draft-response.util';

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    documentType: 'FACTURE',
    customer: { customerName: 'Xavier Dupont' },
    lines: [],
    serviceLines: [],
    notices: [],
    ...overrides,
  };
}

describe('parseResolveDraftInput', () => {
  it('accepts a minimal well-formed input', () => {
    const parsed = parseResolveDraftInput(validInput());
    expect(parsed).not.toBeNull();
    expect(parsed?.documentType).toBe('FACTURE');
    expect(parsed?.customer.customerName).toBe('Xavier Dupont');
  });

  it('rejects a non-object input', () => {
    expect(parseResolveDraftInput('not an object')).toBeNull();
    expect(parseResolveDraftInput(null)).toBeNull();
    expect(parseResolveDraftInput(undefined)).toBeNull();
  });

  it('rejects an invalid documentType', () => {
    expect(parseResolveDraftInput(validInput({ documentType: 'AVOIR' }))).toBeNull();
  });

  it('rejects a missing/blank customer name', () => {
    expect(parseResolveDraftInput(validInput({ customer: {} }))).toBeNull();
    expect(parseResolveDraftInput(validInput({ customer: { customerName: '   ' } }))).toBeNull();
  });

  it('rejects a line with an invalid unit', () => {
    const input = validInput({
      lines: [{ description: 'x', unit: 'BAGUETTE', quantity: 1, unitPriceCents: 100 }],
    });
    expect(parseResolveDraftInput(input)).toBeNull();
  });

  it('rejects a line missing required numeric fields', () => {
    const input = validInput({
      lines: [{ description: 'x', unit: 'SQUARE_METER' }],
    });
    expect(parseResolveDraftInput(input)).toBeNull();
  });

  it('parses a valid needsReview with a suggestion', () => {
    const input = validInput({
      customer: {
        customerName: 'Dupont',
        needsReview: {
          reason: 'ambiguous_match',
          suggestion: { label: 'Xavier Dupont', value: 'cust-1' },
        },
      },
    });
    const parsed = parseResolveDraftInput(input);
    expect(parsed?.customer.needsReview).toEqual({
      reason: 'ambiguous_match',
      suggestion: { label: 'Xavier Dupont', value: 'cust-1' },
    });
  });

  it('drops an unrecognized needsReview reason rather than passing it through', () => {
    const input = validInput({
      customer: { customerName: 'Dupont', needsReview: { reason: 'not_a_real_reason' } },
    });
    const parsed = parseResolveDraftInput(input);
    expect(parsed?.customer.needsReview).toBeUndefined();
  });

  it('drops a malformed suggestion but keeps the reason', () => {
    const input = validInput({
      customer: {
        customerName: 'Dupont',
        needsReview: { reason: 'no_match', suggestion: { label: 'x' } },
      },
    });
    const parsed = parseResolveDraftInput(input);
    expect(parsed?.customer.needsReview).toEqual({ reason: 'no_match' });
  });

  it('silently drops a malformed notice instead of failing the whole parse', () => {
    const input = validInput({
      notices: [{ detail: 'remise' }, { detail: 'tva', message: 'non pris en charge' }],
    });
    const parsed = parseResolveDraftInput(input);
    expect(parsed?.notices).toEqual([{ detail: 'tva', message: 'non pris en charge' }]);
  });

  it('rounds fractional cents fields to integers', () => {
    const input = validInput({
      lines: [{ description: 'x', unit: 'HOUR', quantity: 2, unitPriceCents: 100.6 }],
      depositPercentageBasisPoints: 3000.4,
    });
    const parsed = parseResolveDraftInput(input);
    expect(parsed?.lines[0].unitPriceCents).toBe(101);
    expect(parsed?.depositPercentageBasisPoints).toBe(3000);
  });
});
