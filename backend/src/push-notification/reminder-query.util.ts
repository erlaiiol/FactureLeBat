import { Prisma } from '../../generated/prisma/client';

// "En retard" is never a stored status (see InvoiceStatus in schema.prisma)
// — it's NON_PAYEE plus a dueDate in the past, re-derived here as a Prisma
// where-clause instead of a new business concept. Extracted as a pure
// function (no Prisma calls) so the split between "late" and "unpaid but
// not yet late" is unit-testable without a database.
export function buildLateInvoiceWhere(now: Date): Prisma.InvoiceWhereInput {
  return { status: 'NON_PAYEE', dueDate: { lt: now } };
}

// The complement: still unpaid, but either no dueDate set yet or the
// dueDate hasn't passed — deliberately excludes anything buildLateInvoiceWhere
// already matches, so a single invoice is never counted in both buckets of
// the same digest push.
export function buildUnpaidNotLateInvoiceWhere(now: Date): Prisma.InvoiceWhereInput {
  return {
    status: 'NON_PAYEE',
    OR: [{ dueDate: null }, { dueDate: { gte: now } }],
  };
}

// Phase 1.3-5 (2026 e-invoicing reform, workflow automation): a FACTURE
// that's sat un-transmitted long enough to be worth a nudge — 48h, not
// "since creation," so a same-day manual send (or one still inside 1.3-3's
// own 20-minute auto-transmit grace period) never fires a reminder for
// something that's simply not due to be acted on yet.
// `company.superPdpConnectedAt: { not: null }` scopes this to companies
// that can actually act on the reminder — a disconnected company has
// nothing to connect *to* from a push notification, same reasoning
// InvoiceListRowComponent's own superPdpConfigured/superPdpConnected split
// already applies on the invoice board itself.
const UNSENT_EINVOICE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export function buildUnsentEInvoiceWhere(now: Date): Prisma.InvoiceWhereInput {
  return {
    documentType: 'FACTURE',
    eInvoiceTransmissionStatus: 'NOT_SENT',
    createdAt: { lt: new Date(now.getTime() - UNSENT_EINVOICE_THRESHOLD_MS) },
    company: { superPdpConnectedAt: { not: null } },
  };
}
