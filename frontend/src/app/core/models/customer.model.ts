export interface CustomerProfile {
  id: string;
  name: string;
  companyName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCustomerRequest {
  name: string;
  companyName?: string;
  address?: string;
  email?: string;
  phone?: string;
  siret?: string;
}
