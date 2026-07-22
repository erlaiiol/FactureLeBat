import { Unit } from './unit.model';

export interface ProductProfile {
  id: string;
  name: string;
  description: string | null;
  unit: Unit;
  priceCents: number;
  supplierName: string | null;
  supplierUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProductRequest {
  name: string;
  description?: string;
  unit: Unit;
  priceCents: number;
  supplierName?: string;
  supplierUrl?: string;
}

// Best-effort draft returned by POST /products/import — every field is
// nullable except supplierUrl (echoes back the URL that was imported).
// Never persisted directly; the artisan reviews it in the product form.
export interface ImportedProductDraft {
  name: string | null;
  description: string | null;
  unit: Unit | null;
  priceCents: number | null;
  supplierName: string | null;
  supplierUrl: string;
}
