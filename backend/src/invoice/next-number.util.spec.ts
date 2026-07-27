import { computeNextDocumentNumber } from './next-number.util';

describe('computeNextDocumentNumber', () => {
  it('starts at 000001 for a company with no existing documents of this type', () => {
    expect(computeNextDocumentNumber('F', [])).toBe('F-000001');
  });

  it('picks up right after the highest number already used', () => {
    expect(computeNextDocumentNumber('F', ['F-000001', 'F-000002', 'F-000003'])).toBe('F-000004');
  });

  it('is not confused by insertion order — the highest wins regardless of position', () => {
    expect(computeNextDocumentNumber('F', ['F-000005', 'F-000001', 'F-000003'])).toBe('F-000006');
  });

  // The whole point of Phase 27: an artisan can type any custom number to
  // continue a previous software's sequence, and every following
  // auto-suggestion must pick up right after it — not from a separately
  // tracked counter, which would never have heard of this jump.
  it('continues after a custom/imported number in a different format', () => {
    expect(computeNextDocumentNumber('F', ['2024-00458'])).toBe('F-000459');
  });

  it('only reads the last run of digits in each number, ignoring an embedded year', () => {
    expect(computeNextDocumentNumber('F', ['F-2024-00012'])).toBe('F-000013');
  });

  it('treats a number with no digits at all as contributing zero', () => {
    expect(computeNextDocumentNumber('F', ['FACTURE-SANS-NUMERO'])).toBe('F-000001');
  });

  it('zero-pads to 6 digits, growing naturally past that width', () => {
    expect(computeNextDocumentNumber('F', ['F-999999'])).toBe('F-1000000');
  });
});
