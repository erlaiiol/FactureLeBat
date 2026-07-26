// Mirrors the backend's SiteLegalInfo (site-legal/entities/site-legal-info.entity.ts).
// FactureLe's own legal identity as the SaaS publisher — not the artisan's
// own Company profile.
export interface SiteLegalInfo {
  publisherName: string;
  siret: string;
  address: string;
  directorOfPublication: string;
  hostingProviderName: string;
  hostingProviderAddress: string;
  contactEmail: string;
}

export type UpdateSiteLegalInfoRequest = Partial<SiteLegalInfo>;
