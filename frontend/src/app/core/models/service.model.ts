export type ServiceVisibility = 'VISIBLE' | 'REDISTRIBUTED';

export interface ServiceProfile {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  defaultVisibility: ServiceVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertServiceRequest {
  name: string;
  description?: string;
  priceCents: number;
  defaultVisibility: ServiceVisibility;
}
