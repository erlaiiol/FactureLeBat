// Thrown by a tenant-scoped repository's updateMany/deleteMany-based
// update() when the affected count is 0 — either the id doesn't exist at
// all, or it belongs to another company. Prisma's own P2025 only fires for
// .update()/.delete(), not the *Many variants a compound {id, companyId}
// filter requires, so this is the equivalent signal the service layer maps
// to a 404 (see customer/product/service-catalog .service.ts).
export class NoRowsAffectedError extends Error {}
