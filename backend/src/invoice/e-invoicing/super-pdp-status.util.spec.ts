import {
  latestRejectionReason,
  resolveTransmissionStatus,
  SuperPdpInvoiceEvent,
} from './super-pdp-status.util';

function event(status_code: string, status_text = ''): SuperPdpInvoiceEvent {
  return { status_code, status_text, created_at: '2026-01-15T10:00:00Z' };
}

describe('super-pdp-status.util', () => {
  describe('resolveTransmissionStatus', () => {
    it('returns NOT_SENT for an empty event list', () => {
      expect(resolveTransmissionStatus([])).toBe('NOT_SENT');
    });

    it('maps api:uploaded to SENT', () => {
      expect(resolveTransmissionStatus([event('api:uploaded')])).toBe('SENT');
    });

    it('maps api:validated to VALIDATED', () => {
      expect(resolveTransmissionStatus([event('api:uploaded'), event('api:validated')])).toBe(
        'VALIDATED',
      );
    });

    it('maps api:sent/fr:201 to DELIVERED', () => {
      expect(
        resolveTransmissionStatus([
          event('api:uploaded'),
          event('api:validated'),
          event('api:sent'),
        ]),
      ).toBe('DELIVERED');
    });

    it('maps api:accepted to ACCEPTED', () => {
      expect(
        resolveTransmissionStatus([
          event('api:uploaded'),
          event('api:validated'),
          event('api:sent'),
          event('api:accepted'),
        ]),
      ).toBe('ACCEPTED');
    });

    it('maps api:rejected to REJECTED', () => {
      expect(resolveTransmissionStatus([event('api:uploaded'), event('api:rejected')])).toBe(
        'REJECTED',
      );
    });

    it('takes the last mapped event, not the first (later events overwrite earlier ones)', () => {
      expect(resolveTransmissionStatus([event('api:validated'), event('api:uploaded')])).toBe(
        'SENT',
      );
    });

    it('ignores unmapped codes (payment-lifecycle/ppf-internal) without overwriting the last known status', () => {
      expect(
        resolveTransmissionStatus([
          event('api:uploaded'),
          event('api:validated'),
          event('api:accepted'),
          event('fr:211'), // payment sent — Phase 16 territory, not transmission
          event('ppf:validated-ack'),
        ]),
      ).toBe('ACCEPTED');
    });
  });

  describe('latestRejectionReason', () => {
    it('returns null when no rejection event exists', () => {
      expect(latestRejectionReason([event('api:uploaded'), event('api:accepted')])).toBeNull();
    });

    it("returns the rejection event's status_text", () => {
      expect(
        latestRejectionReason([
          event('api:uploaded'),
          event('api:rejected', 'Invalid SIREN for buyer'),
        ]),
      ).toBe('Invalid SIREN for buyer');
    });

    it('returns the most recent rejection when there are several', () => {
      expect(
        latestRejectionReason([
          event('api:invalid', 'first malformed attempt'),
          event('api:rejected', 'second, real rejection reason'),
        ]),
      ).toBe('second, real rejection reason');
    });
  });
});
