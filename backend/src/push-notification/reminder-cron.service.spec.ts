import { buildDigestBody } from './reminder-cron.service';

describe('buildDigestBody', () => {
  it('mentions only the late count when nothing else is unpaid', () => {
    expect(buildDigestBody(1, 0, 0)).toBe('1 facture en retard');
    expect(buildDigestBody(3, 0, 0)).toBe('3 factures en retard');
  });

  it('mentions only the unpaid count when nothing is late', () => {
    expect(buildDigestBody(0, 1, 0)).toBe('1 facture non payée');
    expect(buildDigestBody(0, 2, 0)).toBe('2 factures non payées');
  });

  it('bundles both counts into a single digest when the artisan has both', () => {
    expect(buildDigestBody(3, 2, 0)).toBe('3 factures en retard, 2 factures non payées');
  });

  // Phase 1.3-5 (2026 e-invoicing reform, workflow automation)
  it('mentions only the unsent-e-invoice count when nothing else applies', () => {
    expect(buildDigestBody(0, 0, 1)).toBe('1 facture non transmise');
    expect(buildDigestBody(0, 0, 4)).toBe('4 factures non transmises');
  });

  it('bundles all three counts, in a fixed order, when the artisan has all three', () => {
    expect(buildDigestBody(3, 2, 1)).toBe(
      '3 factures en retard, 2 factures non payées, 1 facture non transmise',
    );
  });

  it('returns an empty string when nothing applies at all', () => {
    expect(buildDigestBody(0, 0, 0)).toBe('');
  });
});
