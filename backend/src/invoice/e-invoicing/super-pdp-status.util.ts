import { EInvoiceTransmissionStatus } from '../../../generated/prisma/enums';

// SUPER PDP's own `status_code` is an **append-only event log, explicitly
// documented as "not a state machine"** (their OpenAPI spec, confirmed
// 2026-08-23 against https://api.superpdp.tech/openapi/superpdp.json) —
// events accumulate over time and don't represent one exclusive current
// state. This is exactly why FactureLe keeps its own small, ordered
// `EInvoiceTransmissionStatus` vocabulary (schema.prisma's own comment) and
// translates into it here, once, rather than exposing SUPER PDP's raw codes
// anywhere else in the app — a future PA swap only ever touches this file.
//
// Only the codes relevant up through "did the counterpart accept or reject
// it" are mapped; anything past that (fr:208 on hold, fr:211/fr:212 payment
// sent/received, fr:209 completed, the internal ppf:* codes) is genuinely
// Phase 16's payment-lifecycle territory, not transmission — left unmapped
// (silently ignored) so it can never downgrade or overwrite a real
// transmission status with a payment-adjacent one that means something
// different.
const STATUS_CODE_MAP: Record<string, EInvoiceTransmissionStatus> = {
  'api:uploaded': EInvoiceTransmissionStatus.SENT,
  'fr:200': EInvoiceTransmissionStatus.SENT,
  'api:validated': EInvoiceTransmissionStatus.VALIDATED,
  'api:sent': EInvoiceTransmissionStatus.DELIVERED,
  'api:received': EInvoiceTransmissionStatus.DELIVERED,
  'api:acknowledged': EInvoiceTransmissionStatus.DELIVERED,
  'fr:201': EInvoiceTransmissionStatus.DELIVERED,
  'fr:202': EInvoiceTransmissionStatus.DELIVERED,
  'fr:203': EInvoiceTransmissionStatus.DELIVERED,
  'fr:204': EInvoiceTransmissionStatus.DELIVERED,
  'api:accepted': EInvoiceTransmissionStatus.ACCEPTED,
  'fr:205': EInvoiceTransmissionStatus.ACCEPTED,
  'fr:206': EInvoiceTransmissionStatus.ACCEPTED,
  'api:invalid': EInvoiceTransmissionStatus.REJECTED,
  'api:rejected': EInvoiceTransmissionStatus.REJECTED,
  'fr:210': EInvoiceTransmissionStatus.REJECTED,
  'fr:213': EInvoiceTransmissionStatus.REJECTED,
  'fr:501': EInvoiceTransmissionStatus.REJECTED,
};

export interface SuperPdpInvoiceEvent {
  status_code: string;
  status_text: string;
  created_at: string;
}

// Events arrive already sorted ascending by id (SUPER PDP's own documented
// ordering) — the last *mapped* one wins, since a genuinely later event
// always supersedes an earlier one for the same submission (this app never
// resubmits the same SUPER PDP invoice id; a corrected invoice is a new
// submission with its own new id/event stream, so "rejected then later
// accepted" never legitimately happens within one event stream).
export function resolveTransmissionStatus(
  events: SuperPdpInvoiceEvent[],
): EInvoiceTransmissionStatus {
  let current: EInvoiceTransmissionStatus = EInvoiceTransmissionStatus.NOT_SENT;
  for (const event of events) {
    const mapped = STATUS_CODE_MAP[event.status_code];
    if (mapped) {
      current = mapped;
    }
  }
  return current;
}

// The most recent event whose status maps to REJECTED, if any — its
// status_text is what FactureLe shows the artisan verbatim as the rejection
// reason (Invoice.eInvoiceRejectionReason), same "surface the PA's own
// wording, never a generic 'failed' message" honesty principle already
// established for Phase 10/12/17's own uncertain operations.
export function latestRejectionReason(events: SuperPdpInvoiceEvent[]): string | null {
  const rejections = events.filter(
    (e) => STATUS_CODE_MAP[e.status_code] === EInvoiceTransmissionStatus.REJECTED,
  );
  return rejections.length > 0 ? rejections[rejections.length - 1].status_text : null;
}
