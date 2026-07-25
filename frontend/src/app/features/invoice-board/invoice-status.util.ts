import { InvoiceWithTotals } from '../../core/models/invoice.model';

// "En retard" is never persisted (see schema.prisma's comment on
// Invoice.dueDate) — it's a NON_PAYEE invoice whose committed-to due date
// has passed, computed at read time. Same small, display-only mirrored
// computation precedent as calculation-preview.ts (Phase 8.5): a single date
// comparison, not a duplicated business engine, so it stays frontend-only.
export function isOverdue(invoice: InvoiceWithTotals): boolean {
  return (
    invoice.status === 'NON_PAYEE' && !!invoice.dueDate && new Date(invoice.dueDate) < new Date()
  );
}
