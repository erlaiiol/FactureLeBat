import { CompanyModel } from '../../../generated/prisma/models';

// Named indirection so the rest of the app depends on a domain name
// (CompanyProfile), not directly on Prisma's generated model name — the
// response shape mostly matches the Prisma model, but hasLogo below is a
// derived field with no column of its own (see CompanyLogo, its own table —
// schema.prisma's comment on Company.logo explains why), which is exactly
// the kind of divergence this indirection exists for.
export type CompanyProfile = CompanyModel & {
  // Whether a logo has been uploaded (CompanyRepository.hasLogo) — never the
  // image bytes themselves, so GET /company stays small regardless of logo
  // size. The frontend points an <img> at GET /company/logo when this is
  // true, same "fetch the big payload only where it's actually rendered"
  // reasoning as the PDF pipeline.
  hasLogo: boolean;
};
