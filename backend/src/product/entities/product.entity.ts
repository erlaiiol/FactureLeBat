import { ProductModel } from '../../../generated/prisma/models';
import { CatalogFolderRef } from '../../catalog-folder/entities/catalog-folder.entity';

// Same indirection as CustomerProfile/CompanyProfile: the rest of the app
// depends on a domain name (ProductProfile), not directly on Prisma's
// generated model. Phase 1.1-2: folders is always included (see
// ProductRepository) — zero, one, or several dossiers this product belongs
// to.
export type ProductProfile = ProductModel & { folders: CatalogFolderRef[] };
