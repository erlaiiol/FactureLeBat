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
