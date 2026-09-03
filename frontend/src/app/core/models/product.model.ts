import { CatalogFolderRef } from './catalog-folder.model';
import { MarginMode } from './margin.model';
import { ActivityCategory } from './report.model';
import { Unit } from './unit.model';

export interface ProductProfile {
  id: string;
  name: string;
  description: string | null;
  unit: Unit;
  priceCents: number;
  supplierName: string | null;
  supplierUrl: string | null;
  // Phase 11: short artisan-defined reference (e.g. "UC204850") — optional,
  // unique when set.
  code: string | null;
  // Phase 8.5: how many `unit`s come in one sellable package (e.g. "9" for
  // a 9 m² box). Serialized as a string like every other Decimal field in
  // this codebase — null means the product is sold continuously.
  packagingQuantity: string | null;
  // Phase 17: which URSSAF turnover category this product's sales fall
  // under — artisan-set, null when left uncategorized.
  activityCategory: ActivityCategory | null;
  // Phase 1.6: what the artisan actually keeps per unit sold — null when not
  // declared. See MarginMode.
  marginMode: MarginMode | null;
  marginAmountCents: number | null;
  marginPercentageBasisPoints: number | null;
  // Phase 1.1-2: zero, one, or several dossiers this product belongs to.
  folders: CatalogFolderRef[];
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
  code?: string;
  packagingQuantity?: number;
  activityCategory?: ActivityCategory;
  marginMode?: MarginMode;
  marginAmountCents?: number;
  marginPercentageBasisPoints?: number;
  folderIds?: string[];
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
