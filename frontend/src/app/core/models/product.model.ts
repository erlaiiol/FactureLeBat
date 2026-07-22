import { Unit } from './unit.model';

export interface ProductProfile {
  id: string;
  name: string;
  description: string | null;
  unit: Unit;
  priceCents: number;
  supplierName: string | null;
  supplierUrl: string | null;
  // Phase 8.5: how many `unit`s come in one sellable package (e.g. "9" for
  // a 9 m² box). Serialized as a string like every other Decimal field in
  // this codebase — null means the product is sold continuously.
  packagingQuantity: string | null;
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
  packagingQuantity?: number;
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
