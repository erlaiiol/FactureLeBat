export type ServiceVisibility = 'VISIBLE' | 'REDISTRIBUTED';

export interface ServiceProfile {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  defaultVisibility: ServiceVisibility;
  // Phase 11: short artisan-defined reference (e.g. "MO-POSE") — optional,
  // unique when set. Same shape as ProductProfile.code.
  code: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertServiceRequest {
  name: string;
  description?: string;
  priceCents: number;
  defaultVisibility: ServiceVisibility;
  code?: string;
}
