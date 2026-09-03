import { resolveMarginCents } from './margin.util';

describe('resolveMarginCents', () => {
  it('resolves 0 for a freehand line — no catalog object to assume anything about', () => {
    expect(resolveMarginCents(undefined, 10000, 1)).toBe(0);
  });

  // Requested directly by the user (2026-09-03): a real catalog item the
  // artisan hasn't touched the margin field on defaults to 100% margin.
  it('defaults to 100% margin (the full base amount) for an untouched catalog item', () => {
    const config = { marginMode: null, marginAmountCents: null, marginPercentageBasisPoints: null };
    expect(resolveMarginCents(config, 10000, 3)).toBe(10000);
  });

  it('resolves a PERCENTAGE margin as a share of the base amount, ignoring unitCount', () => {
    const config = {
      marginMode: 'PERCENTAGE' as const,
      marginAmountCents: null,
      marginPercentageBasisPoints: 5000,
    };
    expect(resolveMarginCents(config, 10000, 7)).toBe(5000);
  });

  it('resolves a NET_AMOUNT margin per unit, clamped to the base amount', () => {
    const config = {
      marginMode: 'NET_AMOUNT' as const,
      marginAmountCents: 1000,
      marginPercentageBasisPoints: null,
    };
    expect(resolveMarginCents(config, 10000, 3)).toBe(3000);
    expect(resolveMarginCents(config, 2000, 3)).toBe(2000); // clamped, not 3000
  });
});
