// Phase 20: FactureLe's own legal identity (mentions légales), not a
// per-tenant Company. Every field is a plain string, defaulting to "" until
// an admin fills it in via /admin/site-legal — see SiteLegalInfo in
// schema.prisma.
export interface SiteLegalInfo {
  publisherName: string;
  siret: string;
  address: string;
  directorOfPublication: string;
  hostingProviderName: string;
  hostingProviderAddress: string;
  contactEmail: string;
}
