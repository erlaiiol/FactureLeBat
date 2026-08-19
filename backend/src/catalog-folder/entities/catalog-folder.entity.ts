import { CatalogFolderModel } from '../../../generated/prisma/models';

// Same indirection as ProductProfile/ServiceProfile/DiscountProfile: the
// rest of the app depends on a domain name (CatalogFolderProfile), not
// directly on Prisma's generated model.
export type CatalogFolderProfile = CatalogFolderModel;

// The shape embedded on ProductProfile/ServiceProfile/DiscountProfile
// (Product.entity.ts etc.) — just enough to render/prefill the folder
// picker, never the full row.
export type CatalogFolderRef = Pick<CatalogFolderModel, 'id' | 'name'>;
