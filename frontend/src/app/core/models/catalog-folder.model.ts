export interface CatalogFolderProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCatalogFolderRequest {
  name: string;
}

// The shape embedded on ProductProfile/ServiceProfile/DiscountProfile — just
// enough to render/prefill the folder picker, never the full row.
export interface CatalogFolderRef {
  id: string;
  name: string;
}
