import { CompanyModel } from '../../../generated/prisma/models';

// Named indirection so the rest of the app depends on a domain name
// (CompanyProfile), not directly on Prisma's generated model name — the
// response shape happens to match the Prisma model today, but callers
// aren't coupled to that fact.
export type CompanyProfile = CompanyModel;
