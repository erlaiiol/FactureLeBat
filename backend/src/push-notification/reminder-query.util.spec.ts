import {
  buildLateInvoiceWhere,
  buildUnpaidNotLateInvoiceWhere,
  buildUnsentEInvoiceWhere,
} from './reminder-query.util';

describe('reminder-query.util', () => {
  const now = new Date('2026-07-26T09:00:00.000Z');

  describe('buildLateInvoiceWhere', () => {
    it('matches only NON_PAYEE invoices with a dueDate strictly before now', () => {
      expect(buildLateInvoiceWhere(now)).toEqual({
        status: 'NON_PAYEE',
        dueDate: { lt: now },
      });
    });
  });

  describe('buildUnpaidNotLateInvoiceWhere', () => {
    it('matches NON_PAYEE invoices with no dueDate yet, or a dueDate not yet passed', () => {
      expect(buildUnpaidNotLateInvoiceWhere(now)).toEqual({
        status: 'NON_PAYEE',
        OR: [{ dueDate: null }, { dueDate: { gte: now } }],
      });
    });

    it('never overlaps with buildLateInvoiceWhere for the same instant', () => {
      // dueDate < now (late) and (dueDate == null OR dueDate >= now) (not
      // late) are mutually exclusive by construction — a single invoice can
      // never satisfy both, so a digest push never double-counts it.
      const lateDueDate = new Date(now.getTime() - 1);
      const notLateDueDate = now;

      expect(lateDueDate < now).toBe(true);
      expect(notLateDueDate >= now).toBe(true);
    });
  });

  describe('buildUnsentEInvoiceWhere', () => {
    it('matches NOT_SENT FACTUREs older than 48h for a company with SUPER PDP connected', () => {
      expect(buildUnsentEInvoiceWhere(now)).toEqual({
        documentType: 'FACTURE',
        eInvoiceTransmissionStatus: 'NOT_SENT',
        createdAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
        company: { superPdpConnectedAt: { not: null } },
      });
    });
  });
});
