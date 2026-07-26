import { buildDigestBody } from './reminder-cron.service';

describe('buildDigestBody', () => {
  it('mentions only the late count when nothing else is unpaid', () => {
    expect(buildDigestBody(1, 0)).toBe('1 facture en retard');
    expect(buildDigestBody(3, 0)).toBe('3 factures en retard');
  });

  it('mentions only the unpaid count when nothing is late', () => {
    expect(buildDigestBody(0, 1)).toBe('1 facture non payée');
    expect(buildDigestBody(0, 2)).toBe('2 factures non payées');
  });

  it('bundles both counts into a single digest when the artisan has both', () => {
    expect(buildDigestBody(3, 2)).toBe('3 factures en retard, 2 factures non payées');
  });
});
